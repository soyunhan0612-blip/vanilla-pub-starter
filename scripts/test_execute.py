"""
execute.py 리팩터링 안전망 테스트.
리팩터링 전후 동작이 동일한지 검증한다.
"""

import io
import json
import os
import subprocess
import sys
import textwrap
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import execute as ex


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path):
    """phases/, AGENTS.md, docs/ 를 갖춘 임시 프로젝트 구조."""
    phases_dir = tmp_path / "phases"
    phases_dir.mkdir()

    agents_md = tmp_path / "AGENTS.md"
    agents_md.write_text("# Rules\n- rule one\n- rule two", encoding="utf-8")

    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "arch.md").write_text("# Architecture\nSome content", encoding="utf-8")
    (docs_dir / "guide.md").write_text("# Guide\nAnother doc", encoding="utf-8")

    return tmp_path


@pytest.fixture
def phase_dir(tmp_project):
    """step 3개를 가진 phase 디렉토리."""
    d = tmp_project / "phases" / "0-mvp"
    d.mkdir()

    index = {
        "project": "TestProject",
        "phase": "mvp",
        "steps": [
            {"step": 0, "name": "setup", "status": "completed", "summary": "프로젝트 초기화 완료"},
            {"step": 1, "name": "core", "status": "completed", "summary": "핵심 로직 구현"},
            {"step": 2, "name": "ui", "status": "pending"},
        ],
    }
    (d / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
    (d / "step2.md").write_text("# Step 2: UI\n\nUI를 구현하세요.", encoding="utf-8")

    return d


@pytest.fixture
def top_index(tmp_project):
    """phases/index.json (top-level)."""
    top = {
        "phases": [
            {"dir": "0-mvp", "status": "pending"},
            {"dir": "1-polish", "status": "pending"},
        ]
    }
    p = tmp_project / "phases" / "index.json"
    p.write_text(json.dumps(top, indent=2), encoding="utf-8")
    return p


@pytest.fixture
def executor(tmp_project, phase_dir):
    """테스트용 StepExecutor 인스턴스. git 호출은 별도 mock 필요."""
    with patch.object(ex, "ROOT", tmp_project):
        inst = ex.StepExecutor("0-mvp")
    # 내부 경로를 tmp_project 기준으로 재설정
    inst._root = str(tmp_project)
    inst._phases_dir = tmp_project / "phases"
    inst._phase_dir = phase_dir
    inst._phase_dir_name = "0-mvp"
    inst._index_file = phase_dir / "index.json"
    inst._top_index_file = tmp_project / "phases" / "index.json"
    return inst


# ---------------------------------------------------------------------------
# _stamp (= 이전 now_iso)
# ---------------------------------------------------------------------------

class TestStamp:
    def test_returns_kst_timestamp(self, executor):
        result = executor._stamp()
        assert "+0900" in result

    def test_format_is_iso(self, executor):
        result = executor._stamp()
        dt = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert dt.tzinfo is not None

    def test_is_current_time(self, executor):
        before = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0)
        result = executor._stamp()
        after = datetime.now(ex.StepExecutor.TZ).replace(microsecond=0) + timedelta(seconds=1)
        parsed = datetime.strptime(result, "%Y-%m-%dT%H:%M:%S%z")
        assert before <= parsed <= after


# ---------------------------------------------------------------------------
# _read_json / _write_json
# ---------------------------------------------------------------------------

class TestJsonHelpers:
    def test_roundtrip(self, tmp_path):
        data = {"key": "값", "nested": [1, 2, 3]}
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, data)
        loaded = ex.StepExecutor._read_json(p)
        assert loaded == data

    def test_save_ensures_ascii_false(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"한글": "테스트"})
        raw = p.read_text(encoding="utf-8")
        assert "한글" in raw
        assert "\\u" not in raw

    def test_save_indented(self, tmp_path):
        p = tmp_path / "test.json"
        ex.StepExecutor._write_json(p, {"a": 1})
        raw = p.read_text(encoding="utf-8")
        assert "\n" in raw

    def test_load_nonexistent_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            ex.StepExecutor._read_json(tmp_path / "nope.json")


# ---------------------------------------------------------------------------
# _load_guardrails
# ---------------------------------------------------------------------------

class TestLoadGuardrails:
    def test_loads_agents_md_and_docs(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "# Rules" in result
        assert "rule one" in result
        assert "# Architecture" in result
        assert "# Guide" in result

    def test_sections_separated_by_divider(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "---" in result

    def test_docs_sorted_alphabetically(self, executor, tmp_project):
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        arch_pos = result.index("arch")
        guide_pos = result.index("guide")
        assert arch_pos < guide_pos

    def test_no_agents_md(self, executor, tmp_project):
        (tmp_project / "AGENTS.md").unlink()
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "AGENTS.md" not in result
        assert "Architecture" in result

    def test_falls_back_to_legacy_claude_md(self, executor, tmp_project):
        """AGENTS.md 가 정본이지만, 그것이 없는 예전 저장소는 CLAUDE.md 로 돈다."""
        (tmp_project / "AGENTS.md").unlink()
        (tmp_project / "CLAUDE.md").write_text(
            "# Legacy Rules\n- keep compatibility", encoding="utf-8"
        )
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "CLAUDE.md" in result
        assert "keep compatibility" in result

    def test_agents_md_wins_over_claude_md(self, executor, tmp_project):
        """둘 다 있으면 AGENTS.md 만 읽는다 — CLAUDE.md 는 그것을 가리키기만 하므로
        같이 읽으면 같은 내용이 두 번 들어간다."""
        (tmp_project / "CLAUDE.md").write_text("# Legacy Rules\n- stale", encoding="utf-8")
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "rule one" in result
        assert "stale" not in result

    def test_no_docs_dir(self, executor, tmp_project):
        import shutil
        shutil.rmtree(tmp_project / "docs")
        with patch.object(ex, "ROOT", tmp_project):
            result = executor._load_guardrails()
        assert "Rules" in result
        assert "Architecture" not in result

    def test_empty_project(self, tmp_path):
        with patch.object(ex, "ROOT", tmp_path):
            # executor가 필요 없는 static-like 동작이므로 임시 인스턴스
            phases_dir = tmp_path / "phases" / "dummy"
            phases_dir.mkdir(parents=True)
            idx = {"project": "T", "phase": "t", "steps": []}
            (phases_dir / "index.json").write_text(json.dumps(idx), encoding="utf-8")
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
            result = inst._load_guardrails()
        assert result == ""


# ---------------------------------------------------------------------------
# _build_step_context
# ---------------------------------------------------------------------------

class TestBuildStepContext:
    def test_includes_completed_with_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text(encoding="utf-8"))
        result = ex.StepExecutor._build_step_context(index)
        assert "Step 0 (setup): 프로젝트 초기화 완료" in result
        assert "Step 1 (core): 핵심 로직 구현" in result

    def test_excludes_pending(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text(encoding="utf-8"))
        result = ex.StepExecutor._build_step_context(index)
        assert "ui" not in result

    def test_excludes_completed_without_summary(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text(encoding="utf-8"))
        del index["steps"][0]["summary"]
        result = ex.StepExecutor._build_step_context(index)
        assert "setup" not in result
        assert "core" in result

    def test_empty_when_no_completed(self):
        index = {"steps": [{"step": 0, "name": "a", "status": "pending"}]}
        result = ex.StepExecutor._build_step_context(index)
        assert result == ""

    def test_has_header(self, phase_dir):
        index = json.loads((phase_dir / "index.json").read_text(encoding="utf-8"))
        result = ex.StepExecutor._build_step_context(index)
        assert result.startswith("## 이전 Step 산출물")


# ---------------------------------------------------------------------------
# _build_preamble
# ---------------------------------------------------------------------------

class TestBuildPreamble:
    def test_includes_project_name(self, executor):
        result = executor._build_preamble("", "")
        assert "TestProject" in result

    def test_includes_guardrails(self, executor):
        result = executor._build_preamble("GUARD_CONTENT", "")
        assert "GUARD_CONTENT" in result

    def test_includes_step_context(self, executor):
        ctx = "## 이전 Step 산출물\n\n- Step 0: done"
        result = executor._build_preamble("", ctx)
        assert "이전 Step 산출물" in result

    def test_includes_commit_example(self, executor):
        result = executor._build_preamble("", "")
        assert "feat(mvp):" in result

    def test_includes_rules(self, executor):
        result = executor._build_preamble("", "")
        assert "작업 규칙" in result
        assert "AC" in result

    def test_no_retry_section_by_default(self, executor):
        result = executor._build_preamble("", "")
        assert "이전 시도 실패" not in result

    def test_retry_section_with_prev_error(self, executor):
        result = executor._build_preamble("", "", prev_error="타입 에러 발생")
        assert "이전 시도 실패" in result
        assert "타입 에러 발생" in result

    def test_includes_max_retries(self, executor):
        result = executor._build_preamble("", "")
        assert str(ex.StepExecutor.MAX_RETRIES) in result

    def test_includes_index_path(self, executor):
        result = executor._build_preamble("", "")
        assert "/phases/0-mvp/index.json" in result


# ---------------------------------------------------------------------------
# _update_top_index
# ---------------------------------------------------------------------------

class TestUpdateTopIndex:
    def test_completed(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text(encoding="utf-8"))
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "completed"
        assert "completed_at" in mvp

    def test_error(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("error")
        data = json.loads(top_index.read_text(encoding="utf-8"))
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "error"
        assert "failed_at" in mvp

    def test_blocked(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("blocked")
        data = json.loads(top_index.read_text(encoding="utf-8"))
        mvp = next(p for p in data["phases"] if p["dir"] == "0-mvp")
        assert mvp["status"] == "blocked"
        assert "blocked_at" in mvp

    def test_other_phases_unchanged(self, executor, top_index):
        executor._top_index_file = top_index
        executor._update_top_index("completed")
        data = json.loads(top_index.read_text(encoding="utf-8"))
        polish = next(p for p in data["phases"] if p["dir"] == "1-polish")
        assert polish["status"] == "pending"

    def test_nonexistent_dir_is_noop(self, executor, top_index):
        executor._top_index_file = top_index
        executor._phase_dir_name = "no-such-dir"
        original = json.loads(top_index.read_text(encoding="utf-8"))
        executor._update_top_index("completed")
        after = json.loads(top_index.read_text(encoding="utf-8"))
        for p_before, p_after in zip(original["phases"], after["phases"]):
            assert p_before["status"] == p_after["status"]

    def test_no_top_index_file(self, executor, tmp_path):
        executor._top_index_file = tmp_path / "nonexistent.json"
        executor._update_top_index("completed")  # should not raise


# ---------------------------------------------------------------------------
# _checkout_branch (mocked)
# ---------------------------------------------------------------------------

class TestCheckoutBranch:
    def _mock_git(self, executor, responses):
        call_idx = {"i": 0}
        def fake_git(*args):
            idx = call_idx["i"]
            call_idx["i"] += 1
            if idx < len(responses):
                return responses[idx]
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

    def test_already_on_branch(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="feat-mvp\n", stderr=""),
        ])
        executor._checkout_branch()  # should return without checkout

    def test_branch_exists_checkout(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_branch_not_exists_create(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="not found"),
            MagicMock(returncode=0, stdout="", stderr=""),
        ])
        executor._checkout_branch()

    def test_checkout_fails_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=0, stdout="main\n", stderr=""),
            MagicMock(returncode=1, stdout="", stderr=""),
            MagicMock(returncode=1, stdout="", stderr="dirty tree"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1

    def test_no_git_exits(self, executor):
        self._mock_git(executor, [
            MagicMock(returncode=1, stdout="", stderr="not a git repo"),
        ])
        with pytest.raises(SystemExit) as exc_info:
            executor._checkout_branch()
        assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _commit_step (mocked)
# ---------------------------------------------------------------------------

class TestCommitStep:
    def test_two_phase_commit(self, executor):
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_calls = [c for c in calls if c[0] == "commit"]
        assert len(commit_calls) == 2
        assert "feat(mvp):" in commit_calls[0][2]
        assert "chore(mvp):" in commit_calls[1][2]

    def test_no_code_changes_skips_feat_commit(self, executor):
        call_count = {"diff": 0}
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                call_count["diff"] += 1
                if call_count["diff"] == 1:
                    return MagicMock(returncode=0)
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui")

        commit_msgs = [c[2] for c in calls if c[0] == "commit"]
        assert len(commit_msgs) == 1
        assert "chore" in commit_msgs[0]

    def test_foreign_paths_are_unstaged(self, executor):
        """step 시작 전부터 더러웠던 경로는 커밋에 담기지 않는다."""
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        executor._commit_step(2, "ui", {"scripts/execute.py", "scratch.tmp"})

        resets = [c for c in calls if c[0] == "reset"]
        assert resets, "reset 이 호출되지 않았다"
        unstaged = {a for c in resets for a in c if a.startswith(":(literal)")}
        assert ":(literal)scripts/execute.py" in unstaged
        assert ":(literal)scratch.tmp" in unstaged

    def test_commit_failure_aborts_instead_of_warning(self, executor, capsys):
        """커밋 실패는 경고가 아니라 중단이다.

        경고 한 줄로 흘리면 step 산출물이 커밋되지 않은 채 completed 로 기록된다.
        pre-commit 훅이 거부할 때가 정확히 이 형태이므로 조용히 지나가면 안 된다.
        """
        def fake_git(*args):
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            if args[0] == "commit":
                return MagicMock(returncode=1, stdout="", stderr="check 실패로 거부됨")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        with pytest.raises(SystemExit) as exc_info:
            executor._commit_step(2, "ui")

        assert exc_info.value.code == 1
        out = capsys.readouterr().out
        assert "커밋 실패" in out
        assert "check 실패로 거부됨" in out

    def test_housekeeping_commit_failure_also_aborts(self, executor):
        """chore 커밋이 거부돼도 index.json 만 미커밋 상태로 남는다 — 같은 유실이다."""
        call_count = {"commit": 0}
        def fake_git(*args):
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            if args[0] == "commit":
                call_count["commit"] += 1
                ok = call_count["commit"] == 1  # feat 는 통과, chore 만 실패
                return MagicMock(returncode=0 if ok else 1, stdout="", stderr="rejected")
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        with pytest.raises(SystemExit) as exc_info:
            executor._commit_step(2, "ui")

        assert exc_info.value.code == 1

    def test_phase_outputs_never_treated_as_foreign(self, executor):
        """산출물 2종은 foreign 으로 들어와도 하네스가 계속 커밋한다."""
        calls = []
        def fake_git(*args):
            calls.append(args)
            if args[:2] == ("diff", "--cached"):
                return MagicMock(returncode=1)
            return MagicMock(returncode=0, stdout="", stderr="")
        executor._run_git = fake_git

        index_rel = f"phases/{executor._phase_dir_name}/index.json"
        executor._commit_step(2, "ui", {index_rel})

        # chore 커밋용 2차 스테이징(2번째 add 이후)에서는 index 를 빼지 않아야 한다
        add_positions = [i for i, c in enumerate(calls) if c[0] == "add"]
        assert len(add_positions) == 2
        second_round = calls[add_positions[1]:]
        assert not any(f":(literal){index_rel}" in c for c in second_round if c[0] == "reset")


class TestDirtyPaths:
    def test_parses_porcelain_z(self, executor):
        entries = " M src/app.js\0?? scratch.tmp\0R  new.js\0old.js\0"
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout=entries)
        assert executor._dirty_paths() == {"src/app.js", "scratch.tmp", "new.js", "old.js"}

    def test_empty_worktree(self, executor):
        executor._run_git = lambda *a: MagicMock(returncode=0, stdout="")
        assert executor._dirty_paths() == set()

    def test_git_failure_returns_empty(self, executor):
        executor._run_git = lambda *a: MagicMock(returncode=128, stdout="")
        assert executor._dirty_paths() == set()


# ---------------------------------------------------------------------------
# _invoke_codex (mocked)
# ---------------------------------------------------------------------------

class TestInvokeCodex:
    def test_invokes_codex_with_correct_args(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"result": "ok"}', stderr="")
        step = {"step": 2, "name": "ui"}
        preamble = "PREAMBLE\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_codex(step, preamble)

        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "codex"
        assert cmd[1] == "exec"
        assert "--dangerously-bypass-approvals-and-sandbox" in cmd
        assert "--json" in cmd
        assert cmd[-1] == "-"

    def test_sandbox_is_not_enabled(self):
        """샌드박스를 켜면 모든 step 의 AC 가 통과 불가가 된다 (ADR-008).

        Windows 의 codex 샌드박스는 프로세스 3단계째를 EPERM 으로 막는다.
        `node tools/check.js` 는 powershell(1) → node(2) → spawnSync(3) 이므로
        정확히 그 자리에서 죽는다 — 자식 프로세스로 테스트를 돌리는 것이 check.js 의
        존재 이유라 우회로가 없다. 되돌리면 codex 는 자기 코드가 맞는지 모른 채
        끝나고 3회 재시도 자가 교정도 함께 죽는다.
        """
        argv = ex.StepExecutor._codex_argv()
        assert "--sandbox" not in argv
        assert not any("workspace-write" in a for a in argv)
        assert not any("windows.sandbox" in a for a in argv)

    def test_argv_does_not_branch_on_platform(self):
        """플랫폼 분기가 없어야 한다.

        `windows.sandbox` 고정은 샌드박스를 쓸 때만 의미가 있었다. 샌드박스를 끈
        지금 남겨두면 동작하지 않는 설정이 근거처럼 보여 다음 사람을 오도한다.
        """
        with patch.object(ex.sys, "platform", "win32"):
            win = ex.StepExecutor._codex_argv()
        with patch.object(ex.sys, "platform", "linux"):
            posix = ex.StepExecutor._codex_argv()
        assert win == posix

    def test_argv_shape_is_stable(self):
        """프롬프트는 항상 마지막 `-` 로 stdin 에서 읽는다."""
        argv = ex.StepExecutor._codex_argv()
        assert argv[:2] == ["codex", "exec"]
        assert argv[-1] == "-"
        assert "--dangerously-bypass-hook-trust" in argv

    def test_hook_trust_bypass_is_passed(self, executor):
        """이 플래그가 빠지면 .codex/hooks.json 의 훅이 경고 없이 통째로 빠진다."""
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert "--dangerously-bypass-hook-trust" in mock_run.call_args[0][0]

    def test_prompt_goes_to_stdin_not_argv(self, executor):
        """Codex 는 `-` 로 stdin 에서 프롬프트를 읽는다. argv 로 넘기면 안 된다."""
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_codex({"step": 2, "name": "ui"}, "PREAMBLE\n")

        sent = mock_run.call_args[1]["input"]
        assert "PREAMBLE" in sent
        assert "UI를 구현하세요" in sent
        # input= 과 stdin= 은 동시에 못 쓴다 (ValueError). stdin 을 넘기면 안 된다.
        assert "stdin" not in mock_run.call_args[1]

    def test_saves_output_json(self, executor):
        mock_result = MagicMock(returncode=0, stdout='{"ok": true}', stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result):
            executor._invoke_codex(step, "preamble")

        output_file = executor._phase_dir / "step2-output.json"
        assert output_file.exists()
        data = json.loads(output_file.read_text(encoding="utf-8"))
        assert data["step"] == 2
        assert data["name"] == "ui"
        assert data["exitCode"] == 0

    def test_nonexistent_step_file_exits(self, executor):
        step = {"step": 99, "name": "nonexistent"}
        with pytest.raises(SystemExit) as exc_info:
            executor._invoke_codex(step, "preamble")
        assert exc_info.value.code == 1

    def test_timeout_is_1800(self, executor):
        mock_result = MagicMock(returncode=0, stdout="{}", stderr="")
        step = {"step": 2, "name": "ui"}

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            executor._invoke_codex(step, "preamble")

        assert mock_run.call_args[1]["timeout"] == 1800


# ---------------------------------------------------------------------------
# _invoke_codex 타임아웃 — 잡지 않으면 하네스가 트레이스백으로 통째로 죽고
# index.json 에 started_at 만 남아 다음 실행이 pending 으로 잘못 재개한다.
# ---------------------------------------------------------------------------

class TestInvokeCodexTimeout:
    @staticmethod
    def _timeout(stdout=None, stderr=None):
        return subprocess.TimeoutExpired(
            cmd=["codex", "exec"], timeout=1800, output=stdout, stderr=stderr
        )

    def test_timeout_does_not_propagate(self, executor):
        with patch("subprocess.run", side_effect=self._timeout()):
            output = executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert output["exitCode"] != 0

    def test_timeout_records_failure_reason(self, executor):
        with patch("subprocess.run", side_effect=self._timeout()):
            output = executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert "timeout" in output["failure"]
        assert "1800" in output["failure"]

    def test_timeout_still_writes_output_json(self, executor):
        with patch("subprocess.run", side_effect=self._timeout()):
            executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        data = json.loads((executor._phase_dir / "step2-output.json").read_text(encoding="utf-8"))
        assert data["exitCode"] != 0
        assert "timeout" in data["failure"]

    def test_timeout_keeps_partial_output(self, executor):
        with patch("subprocess.run", side_effect=self._timeout(stdout="부분 출력", stderr="경고")):
            output = executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert output["stdout"] == "부분 출력"
        assert output["stderr"] == "경고"

    def test_timeout_decodes_bytes_output(self, executor):
        """TimeoutExpired 는 text 모드에서도 bytes 를 물고 나올 수 있다."""
        raw = "부분 출력".encode("utf-8")
        with patch("subprocess.run", side_effect=self._timeout(stdout=raw)):
            output = executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert output["stdout"] == "부분 출력"

    def test_timeout_handles_missing_streams(self, executor):
        with patch("subprocess.run", side_effect=self._timeout()):
            output = executor._invoke_codex({"step": 2, "name": "ui"}, "preamble")

        assert output["stdout"] == ""
        assert output["stderr"] == ""


# ---------------------------------------------------------------------------
# progress_indicator (= 이전 Spinner)
# ---------------------------------------------------------------------------

class TestProgressIndicator:
    def test_context_manager(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.15)
        assert pi.elapsed >= 0.1

    def test_elapsed_increases(self):
        import time
        with ex.progress_indicator("test") as pi:
            time.sleep(0.2)
        assert pi.elapsed > 0

    def test_elapsed_readable_inside_block(self):
        """with 블록 안에서 읽어도 경과 시간이 살아 있어야 한다."""
        with ex.progress_indicator("test") as pi:
            time.sleep(0.3)
            inside = pi.elapsed
        assert inside >= 0.25  # Windows 타이머 해상도(~15ms) 여유
        assert pi.elapsed >= inside

    def test_no_output_when_stderr_not_tty(self):
        """리다이렉트된 stderr 에는 진행 표시를 쓰지 않는다 (로그 부풀림 방지)."""
        buf = io.StringIO()  # isatty() -> False
        with patch("sys.stderr", buf):
            with ex.progress_indicator("test") as pi:
                time.sleep(0.3)
        assert buf.getvalue() == ""
        assert pi.elapsed >= 0.25  # Windows 타이머 해상도(~15ms) 여유

    def test_writes_when_stderr_is_tty(self):
        buf = io.StringIO()
        buf.isatty = lambda: True
        with patch("sys.stderr", buf):
            with ex.progress_indicator("test") as pi:
                time.sleep(0.3)
        assert "test" in buf.getvalue()
        assert pi.elapsed >= 0.25  # Windows 타이머 해상도(~15ms) 여유

    def test_stderr_without_isatty_is_silent(self):
        """isatty 가 없는 객체로 stderr 이 대체돼도 죽지 않는다."""
        class Dummy:
            def __init__(self):
                self.written = []

            def write(self, s):
                self.written.append(s)

            def flush(self):
                pass

        dummy = Dummy()
        with patch("sys.stderr", dummy):
            with ex.progress_indicator("test") as pi:
                time.sleep(0.2)
        assert dummy.written == []
        assert pi.elapsed > 0


# ---------------------------------------------------------------------------
# main() CLI 파싱 (mocked)
# ---------------------------------------------------------------------------

class TestMainCli:
    def test_no_args_exits(self):
        with patch("sys.argv", ["execute.py"]):
            with pytest.raises(SystemExit) as exc_info:
                ex.main()
            assert exc_info.value.code == 2  # argparse exits with 2

    def test_invalid_phase_dir_exits(self):
        with patch("sys.argv", ["execute.py", "nonexistent"]):
            with patch.object(ex, "ROOT", Path("/tmp/fake_nonexistent")):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1

    def test_missing_index_exits(self, tmp_project):
        (tmp_project / "phases" / "empty").mkdir()
        with patch("sys.argv", ["execute.py", "empty"]):
            with patch.object(ex, "ROOT", tmp_project):
                with pytest.raises(SystemExit) as exc_info:
                    ex.main()
                assert exc_info.value.code == 1


# ---------------------------------------------------------------------------
# _check_blockers (= 이전 main() error/blocked 체크)
# ---------------------------------------------------------------------------

class TestCheckBlockers:
    def _make_executor_with_steps(self, tmp_project, steps):
        d = tmp_project / "phases" / "test-phase"
        d.mkdir(exist_ok=True)
        index = {"project": "T", "phase": "test", "steps": steps}
        (d / "index.json").write_text(json.dumps(index), encoding="utf-8")

        with patch.object(ex, "ROOT", tmp_project):
            inst = ex.StepExecutor.__new__(ex.StepExecutor)
        inst._root = str(tmp_project)
        inst._phases_dir = tmp_project / "phases"
        inst._phase_dir = d
        inst._phase_dir_name = "test-phase"
        inst._index_file = d / "index.json"
        inst._top_index_file = tmp_project / "phases" / "index.json"
        inst._phase_name = "test"
        inst._total = len(steps)
        return inst

    def test_error_step_exits_1(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "bad", "status": "error", "error_message": "fail"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 1

    def test_blocked_step_exits_2(self, tmp_project):
        steps = [
            {"step": 0, "name": "ok", "status": "completed"},
            {"step": 1, "name": "stuck", "status": "blocked", "blocked_reason": "API key"},
        ]
        inst = self._make_executor_with_steps(tmp_project, steps)
        with pytest.raises(SystemExit) as exc_info:
            inst._check_blockers()
        assert exc_info.value.code == 2
