"""pytest 기본 basetemp 를 쓰지 않는다.

pytest 는 기본적으로 `%TEMP%/pytest-of-<user>/` 아래에 fixture 디렉토리를 만드는데,
이 경로가 상승 권한 프로세스에 의해 만들어지면 그 뒤로 일반 권한에서는 접근조차
못 해 모든 테스트가 setup 단계에서 PermissionError 로 죽는다. `~/.codex/config.toml`
의 `[windows] sandbox = "elevated"` 가 있는 한 재발하므로, 프로젝트가 쓰는 basetemp
를 따로 잡아 그 경로에 의존하지 않는다.

저장소 안(`pytest-temp/`)에 두지 않는 이유: fixture 산출물이 수백 개 쌓여 작업
디렉토리를 뒤덮는다. 실제로 425개가 쌓여 `git status` 가 파묻힌 적이 있다.
"""

import tempfile
from pathlib import Path


def pytest_configure(config):
    # 사람이 --basetemp 를 명시했으면 그쪽을 존중한다.
    if config.option.basetemp is None:
        config.option.basetemp = Path(tempfile.gettempdir()) / "pytest-sample"
