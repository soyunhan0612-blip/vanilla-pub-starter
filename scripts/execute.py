#!/usr/bin/env python3
"""
Harness Step Executor — phase 내 step을 순차 실행하고 자가 교정한다.

Usage:
    python3 scripts/execute.py <phase-dir> [--push] [--yes]

기본적으로 phase 시작 전과 매 step 실행 전에 진행 여부를 묻는다.
--yes 로 끄거나, stdin 이 tty 가 아니면(백그라운드·CI·파이프) 자동 진행한다.
"""

import argparse
import contextlib
import json
import os
import subprocess
import sys
import threading
import time
import types
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent


@contextlib.contextmanager
def progress_indicator(label: str):
    """터미널 진행 표시기. with 문으로 사용하며 .elapsed 로 경과 시간을 읽는다."""
    frames = "◐◓◑◒"
    stop = threading.Event()
    t0 = time.monotonic()

    def _animate():
        idx = 0
        while not stop.wait(0.12):
            sec = int(time.monotonic() - t0)
            sys.stderr.write(f"\r{frames[idx % len(frames)]} {label} [{sec}s]")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write("\r" + " " * (len(label) + 20) + "\r")
        sys.stderr.flush()

    th = threading.Thread(target=_animate, daemon=True)
    th.start()
    info = types.SimpleNamespace(elapsed=0.0)
    try:
        yield info
    finally:
        stop.set()
        th.join()
        info.elapsed = time.monotonic() - t0


class StepExecutor:
    """Phase 디렉토리 안의 step들을 순차 실행하는 하네스."""

    MAX_RETRIES = 3
    FEAT_MSG = "feat({phase}): step {num} — {name}"
    CHORE_MSG = "chore({phase}): step {num} output"
    TZ = timezone(timedelta(hours=9))

    # 확인 게이트 해제 여부. 인스턴스 속성이 아니라 클래스 속성 기본값으로 둔다.
    # test_execute.py 가 StepExecutor.__new__ 로 __init__ 을 우회해 인스턴스를
    # 만드는 경로가 있어, __init__ 에서만 설정하면 거기서 AttributeError 가 난다.
    _assume_yes = False

    def __init__(self, phase_dir_name: str, *, auto_push: bool = False,
                 only_step: Optional[int] = None, single: bool = False,
                 assume_yes: bool = False):
        self._root = str(ROOT)
        self._phases_dir = ROOT / "phases"
        self._phase_dir = self._phases_dir / phase_dir_name
        self._phase_dir_name = phase_dir_name
        self._top_index_file = self._phases_dir / "index.json"
        self._auto_push = auto_push
        # --step N / --one: step 하나만 실행하고 멈춘다.
        self._only_step = only_step
        self._single = single or only_step is not None
        self._assume_yes = assume_yes

        if not self._phase_dir.is_dir():
            print(f"ERROR: {self._phase_dir} not found")
            sys.exit(1)

        self._index_file = self._phase_dir / "index.json"
        if not self._index_file.exists():
            print(f"ERROR: {self._index_file} not found")
            sys.exit(1)

        idx = self._read_json(self._index_file)
        self._project = idx.get("project", "project")
        self._phase_name = idx.get("phase", phase_dir_name)
        self._total = len(idx["steps"])

    def run(self):
        self._print_header()
        self._check_blockers()
        self._checkout_branch()
        guardrails = self._load_guardrails()
        self._ensure_created_at()

        # phase 를 시작하지 않기로 했다면 _finalize 를 호출해서는 안 된다.
        # 여기서 _finalize(True) 가 불리면 step 을 하나도 돌리지 않은 phase 가
        # completed 로 기록되고 top-level index 까지 오염된다.
        if not self._confirm_phase_start():
            print(f"\n  중단합니다 — phase '{self._phase_name}' 는 시작되지 않았습니다.\n")
            return

        # 단일 step 모드로 조기 종료하면 phase 완료로 표시해서는 안 된다.
        self._finalize(self._execute_all_steps(guardrails))

    # --- 확인 게이트 ---

    def _ask(self, question: str) -> str:
        """진행 여부를 묻는다. 'y'(진행) 또는 'n'(중단) 을 돌려준다.

        --yes 이거나 stdin 이 tty 가 아니면(백그라운드·CI·파이프) 묻지 않고 진행한다.
        'a' 를 받으면 이후 게이트를 전부 해제한다.
        """
        if self._assume_yes:
            return "y"
        if not sys.stdin.isatty():
            print("  (비대화형 입력 — 확인 없이 진행합니다. 게이트를 쓰려면 터미널에서 실행하세요)")
            self._assume_yes = True
            return "y"

        while True:
            try:
                ans = input(f"  {question} (Y/n/a) ").strip().lower()
            except EOFError:
                print()
                return "y"
            except KeyboardInterrupt:
                print()
                return "n"

            if ans in ("", "y", "yes"):
                return "y"
            if ans in ("n", "no", "q", "quit"):
                return "n"
            if ans in ("a", "all"):
                self._assume_yes = True
                print("  이후 확인 없이 끝까지 진행합니다.")
                return "y"
            print("  y = 진행 · n = 중단 · a = 이후 전부 자동")

    def _confirm_phase_start(self) -> bool:
        index = self._read_json(self._index_file)
        steps = index["steps"]
        pending = [s for s in steps if s["status"] == "pending"]

        mark = {"completed": "✓", "pending": "·", "error": "✗", "blocked": "⏸"}
        print(f"\n  Phase '{self._phase_name}' — step {len(steps)}개 (pending {len(pending)}개)")
        for s in steps:
            print(f"    {mark.get(s['status'], '?')} {s['step']}. {s['name']}  [{s['status']}]")
        print()

        if not pending:
            return True
        return self._ask(f"phase '{self._phase_name}' 를 시작할까요?") == "y"

    def _confirm_step(self, step: dict) -> bool:
        """step 실행 직전 게이트. 직전 완료 step 의 summary 를 함께 보여준다."""
        index = self._read_json(self._index_file)
        done = [s for s in index["steps"] if s["status"] == "completed"]

        print()
        if done:
            last = done[-1]
            summary = last.get("summary")
            if summary:
                print(f"  직전 step {last['step']} ({last['name']}) 산출물:")
                print(f"    {summary}")
                print()

        print(f"  ▶ Step {step['step']}/{self._total - 1}: {step['name']}")
        return self._ask("실행할까요?") == "y"

    # --- timestamps ---

    def _stamp(self) -> str:
        return datetime.now(self.TZ).strftime("%Y-%m-%dT%H:%M:%S%z")

    # --- JSON I/O ---

    @staticmethod
    def _read_json(p: Path) -> dict:
        return json.loads(p.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(p: Path, data: dict):
        p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- git ---

    def _run_git(self, *args) -> subprocess.CompletedProcess:
        cmd = ["git"] + list(args)
        # encoding 을 명시하지 않으면 Windows 에서 locale(cp949)로 디코딩되어
        # 한글 커밋 메시지·브랜치명이 깨진다.
        return subprocess.run(
            cmd, cwd=self._root, capture_output=True, text=True,
            encoding="utf-8", errors="replace",
        )

    def _checkout_branch(self):
        branch = f"feat-{self._phase_name}"

        r = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if r.returncode != 0:
            print(f"  ERROR: git을 사용할 수 없거나 git repo가 아닙니다.")
            print(f"  {r.stderr.strip()}")
            sys.exit(1)

        if r.stdout.strip() == branch:
            return

        r = self._run_git("rev-parse", "--verify", branch)
        r = self._run_git("checkout", branch) if r.returncode == 0 else self._run_git("checkout", "-b", branch)

        if r.returncode != 0:
            print(f"  ERROR: 브랜치 '{branch}' checkout 실패.")
            print(f"  {r.stderr.strip()}")
            print(f"  Hint: 변경사항을 stash하거나 commit한 후 다시 시도하세요.")
            sys.exit(1)

        print(f"  Branch: {branch}")

    def _commit_step(self, step_num: int, step_name: str):
        output_rel = f"phases/{self._phase_dir_name}/step{step_num}-output.json"
        index_rel = f"phases/{self._phase_dir_name}/index.json"

        self._run_git("add", "-A")
        self._run_git("reset", "HEAD", "--", output_rel)
        self._run_git("reset", "HEAD", "--", index_rel)

        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.FEAT_MSG.format(phase=self._phase_name, num=step_num, name=step_name)
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  Commit: {msg}")
            else:
                print(f"  WARN: 코드 커밋 실패: {r.stderr.strip()}")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = self.CHORE_MSG.format(phase=self._phase_name, num=step_num)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                print(f"  WARN: housekeeping 커밋 실패: {r.stderr.strip()}")

    # --- top-level index ---

    def _update_top_index(self, status: str):
        if not self._top_index_file.exists():
            return
        top = self._read_json(self._top_index_file)
        ts = self._stamp()
        for phase in top.get("phases", []):
            if phase.get("dir") == self._phase_dir_name:
                phase["status"] = status
                ts_key = {"completed": "completed_at", "error": "failed_at", "blocked": "blocked_at"}.get(status)
                if ts_key:
                    phase[ts_key] = ts
                break
        self._write_json(self._top_index_file, top)

    # --- guardrails & context ---

    def _load_guardrails(self) -> str:
        sections = []
        claude_md = ROOT / "CLAUDE.md"
        if claude_md.exists():
            sections.append(
                f"## 프로젝트 규칙 (CLAUDE.md)\n\n{claude_md.read_text(encoding='utf-8')}"
            )
        docs_dir = ROOT / "docs"
        if docs_dir.is_dir():
            for doc in sorted(docs_dir.glob("*.md")):
                sections.append(f"## {doc.stem}\n\n{doc.read_text(encoding='utf-8')}")
        return "\n\n---\n\n".join(sections) if sections else ""

    @staticmethod
    def _build_step_context(index: dict) -> str:
        lines = [
            f"- Step {s['step']} ({s['name']}): {s['summary']}"
            for s in index["steps"]
            if s["status"] == "completed" and s.get("summary")
        ]
        if not lines:
            return ""
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n"

    def _build_preamble(self, guardrails: str, step_context: str,
                        prev_error: Optional[str] = None) -> str:
        commit_example = self.FEAT_MSG.format(
            phase=self._phase_name, num="N", name="<step-name>"
        )
        retry_section = ""
        if prev_error:
            retry_section = (
                f"\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                f"{prev_error}\n\n---\n\n"
            )
        return (
            f"당신은 {self._project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n"
            f"{step_context}{retry_section}"
            f"## 작업 규칙\n\n"
            f"1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            f"2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            f"3. 기존 테스트를 깨뜨리지 마라.\n"
            f"4. AC(Acceptance Criteria) 검증을 직접 실행하라.\n"
            f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 업데이트하라:\n"
            f"   - AC 통과 → \"completed\" + \"summary\" 필드에 이 step의 산출물을 한 줄로 요약\n"
            f"   - {self.MAX_RETRIES}회 수정 시도 후에도 실패 → \"error\" + \"error_message\" 기록\n"
            f"   - 사용자 개입이 필요한 경우 (API 키, 인증, 수동 설정 등) → \"blocked\" + \"blocked_reason\" 기록 후 즉시 중단\n"
            f"6. 모든 변경사항을 커밋하라:\n"
            f"   {commit_example}\n\n---\n\n"
        )

    # --- Claude 호출 ---

    def _invoke_claude(self, step: dict, preamble: str) -> dict:
        step_num, step_name = step["step"], step["name"]
        step_file = self._phase_dir / f"step{step_num}.md"

        if not step_file.exists():
            print(f"  ERROR: {step_file} not found")
            sys.exit(1)

        prompt = preamble + step_file.read_text(encoding="utf-8")
        # Claude CLI 는 UTF-8 로 출력한다. encoding 을 명시하지 않으면 Windows 에서
        # locale(cp949)로 디코딩되어 한글이 깨지고, 그 깨진 문자열이 재시도 프롬프트의
        # error_message 로 다시 들어가 오염이 누적된다.
        # stdin 을 끊는다. -p 모드는 프롬프트를 argv 로 받으므로 stdin 이 필요 없는데,
        # 상속시키면 Claude CLI 가 터미널 입력 버퍼를 비워 확인 게이트에 미리
        # 타이핑해 둔 응답이 사라진다.
        result = subprocess.run(
            ["claude", "-p", "--dangerously-skip-permissions", "--output-format", "json", prompt],
            cwd=self._root, capture_output=True, text=True, timeout=1800,
            encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL,
        )

        if result.returncode != 0:
            print(f"\n  WARN: Claude가 비정상 종료됨 (code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr[:500]}")

        output = {
            "step": step_num, "name": step_name,
            "exitCode": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
        }
        out_path = self._phase_dir / f"step{step_num}-output.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        return output

    # --- 헤더 & 검증 ---

    def _print_header(self):
        print(f"\n{'='*60}")
        print(f"  Harness Step Executor")
        print(f"  Phase: {self._phase_name} | Steps: {self._total}")
        if self._only_step is not None:
            print(f"  Mode: 단일 step ({self._only_step}) 만 실행")
        elif self._single:
            print(f"  Mode: 다음 pending step 1개만 실행")
        if self._auto_push:
            print(f"  Auto-push: enabled")
        print(f"  확인 게이트: {'off (--yes)' if self._assume_yes else 'on — phase 시작 · 매 step 전'}")
        print(f"{'='*60}")

    def _check_blockers(self):
        index = self._read_json(self._index_file)
        for s in reversed(index["steps"]):
            if s["status"] == "error":
                print(f"\n  ✗ Step {s['step']} ({s['name']}) failed.")
                print(f"  Error: {s.get('error_message', 'unknown')}")
                print(f"  Fix and reset status to 'pending' to retry.")
                sys.exit(1)
            if s["status"] == "blocked":
                print(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked.")
                print(f"  Reason: {s.get('blocked_reason', 'unknown')}")
                print(f"  Resolve and reset status to 'pending' to retry.")
                sys.exit(2)
            if s["status"] != "pending":
                break

    def _ensure_created_at(self):
        index = self._read_json(self._index_file)
        if "created_at" not in index:
            index["created_at"] = self._stamp()
            self._write_json(self._index_file, index)

    # --- 실행 루프 ---

    def _execute_single_step(self, step: dict, guardrails: str) -> bool:
        """단일 step 실행 (재시도 포함). 완료되면 True, 실패/차단이면 False."""
        step_num, step_name = step["step"], step["name"]
        done = sum(1 for s in self._read_json(self._index_file)["steps"] if s["status"] == "completed")
        prev_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            index = self._read_json(self._index_file)
            step_context = self._build_step_context(index)
            preamble = self._build_preamble(guardrails, step_context, prev_error)

            tag = f"Step {step_num}/{self._total - 1} ({done} done): {step_name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{self.MAX_RETRIES}]"

            with progress_indicator(tag) as pi:
                self._invoke_claude(step, preamble)
                elapsed = int(pi.elapsed)

            index = self._read_json(self._index_file)
            status = next((s.get("status", "pending") for s in index["steps"] if s["step"] == step_num), "pending")
            ts = self._stamp()

            if status == "completed":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["completed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✓ Step {step_num}: {step_name} [{elapsed}s]")
                return True

            if status == "blocked":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["blocked_at"] = ts
                self._write_json(self._index_file, index)
                reason = next((s.get("blocked_reason", "") for s in index["steps"] if s["step"] == step_num), "")
                print(f"  ⏸ Step {step_num}: {step_name} blocked [{elapsed}s]")
                print(f"    Reason: {reason}")
                self._update_top_index("blocked")
                sys.exit(2)

            err_msg = next(
                (s.get("error_message", "Step did not update status") for s in index["steps"] if s["step"] == step_num),
                "Step did not update status",
            )

            if attempt < self.MAX_RETRIES:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "pending"
                        s.pop("error_message", None)
                self._write_json(self._index_file, index)
                prev_error = err_msg
                print(f"  ↻ Step {step_num}: retry {attempt}/{self.MAX_RETRIES} — {err_msg}")
            else:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "error"
                        s["error_message"] = f"[{self.MAX_RETRIES}회 시도 후 실패] {err_msg}"
                        s["failed_at"] = ts
                self._write_json(self._index_file, index)
                self._commit_step(step_num, step_name)
                print(f"  ✗ Step {step_num}: {step_name} failed after {self.MAX_RETRIES} attempts [{elapsed}s]")
                print(f"    Error: {err_msg}")
                self._update_top_index("error")
                sys.exit(1)

        return False  # unreachable

    def _execute_all_steps(self, guardrails: str) -> bool:
        """step 들을 순차 실행한다.

        Returns:
            True  — 모든 step 을 소진했다 (phase 완료).
            False — 단일 step 모드로 1개만 실행하고 조기 종료했다 (phase 미완료).
        """
        while True:
            index = self._read_json(self._index_file)
            pending = next((s for s in index["steps"] if s["status"] == "pending"), None)
            if pending is None:
                print("\n  All steps completed!")
                return True

            # --step N 은 순서를 건너뛰지 못한다. step 문서가 이전 step 산출물을
            # 전제로 작성되어 있어, 건너뛰면 세션이 없는 파일을 읽으려다 실패한다.
            if self._only_step is not None and pending["step"] != self._only_step:
                print(f"\n  ERROR: --step {self._only_step} 을 요청했으나 앞선 "
                      f"step {pending['step']} ({pending['name']}) 이 아직 pending 입니다.")
                print(f"  step 문서는 이전 step 의 산출물을 전제로 작성되어 있어 건너뛸 수 없습니다.")
                print(f"  먼저 --step {pending['step']} 을 실행하세요.")
                sys.exit(1)

            # 게이트는 started_at 기록 앞에 둔다. 실행하지 않기로 한 step 에
            # 시작 시각이 남으면 나중에 이력을 읽을 때 거짓 신호가 된다.
            if not self._confirm_step(pending):
                print(f"\n  중단합니다 — step {pending['step']} ({pending['name']}) 은 실행하지 않았습니다.")
                return False

            step_num = pending["step"]
            for s in index["steps"]:
                if s["step"] == step_num and "started_at" not in s:
                    s["started_at"] = self._stamp()
                    self._write_json(self._index_file, index)
                    break

            self._execute_single_step(pending, guardrails)

            if self._single:
                remaining = [
                    s for s in self._read_json(self._index_file)["steps"]
                    if s["status"] == "pending"
                ]
                if not remaining:
                    print("\n  All steps completed!")
                    return True
                nxt = remaining[0]
                print(f"\n  단일 step 모드 — 여기서 멈춥니다.")
                print(f"  다음: python scripts/execute.py {self._phase_dir_name} --step {nxt['step']}  ({nxt['name']})")
                return False

    def _finalize(self, phase_done: bool = True):
        # 단일 step 모드로 조기 종료한 경우, 남은 step 이 pending 인데도 phase 전체가
        # completed 로 기록되는 것을 막는다. 거짓 완료는 top-level index 까지 오염시킨다.
        if not phase_done:
            print(f"\n{'='*60}")
            print(f"  Step 완료 — phase '{self._phase_name}' 는 아직 진행 중입니다")
            print(f"{'='*60}")
            return

        index = self._read_json(self._index_file)
        index["completed_at"] = self._stamp()
        self._write_json(self._index_file, index)
        self._update_top_index("completed")

        self._run_git("add", "-A")
        if self._run_git("diff", "--cached", "--quiet").returncode != 0:
            msg = f"chore({self._phase_name}): mark phase completed"
            r = self._run_git("commit", "-m", msg)
            if r.returncode == 0:
                print(f"  ✓ {msg}")

        if self._auto_push:
            branch = f"feat-{self._phase_name}"
            r = self._run_git("push", "-u", "origin", branch)
            if r.returncode != 0:
                print(f"\n  ERROR: git push 실패: {r.stderr.strip()}")
                sys.exit(1)
            print(f"  ✓ Pushed to origin/{branch}")

        print(f"\n{'='*60}")
        print(f"  Phase '{self._phase_name}' completed!")
        print(f"{'='*60}")


def main():
    # 출력이 파이프로 리다이렉트되면 Windows 에서 locale(cp949)로 인코딩되어
    # 한글 진행 메시지에서 UnicodeEncodeError 로 실행이 중단된다.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Harness Step Executor")
    parser.add_argument("phase_dir", help="Phase directory name (e.g. 0-mvp)")
    parser.add_argument("--push", action="store_true", help="Push branch after completion")
    parser.add_argument("--step", type=int, default=None,
                        help="이 번호의 step 하나만 실행하고 종료 (앞선 step 이 pending 이면 에러)")
    parser.add_argument("--one", action="store_true",
                        help="다음 pending step 하나만 실행하고 종료")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="확인 게이트를 끄고 끝까지 자동 진행")
    args = parser.parse_args()

    StepExecutor(
        args.phase_dir, auto_push=args.push,
        only_step=args.step, single=args.one,
        assume_yes=args.yes,
    ).run()


if __name__ == "__main__":
    main()
