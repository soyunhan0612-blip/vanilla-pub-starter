/**
 * src/__tests__/index.js — 테스트 디렉토리의 진입점.
 *
 * 왜 이 파일이 필요한가:
 *   Node 22 이후 `node --test <경로>` 의 위치 인자는 glob 으로 해석된다.
 *   디렉토리를 주면 더 이상 재귀 탐색하지 않고 그 경로를 "실행할 파일"로 본다.
 *   그래서 AC 커맨드인 `node --test src/__tests__` 는 이 파일이 없으면
 *   MODULE_NOT_FOUND 로 죽는다. 디렉토리 진입점(index.js)이 있으면 Node 가
 *   그것을 해석해 실행하므로, 여기서 실제 테스트 파일들을 불러온다.
 *   tools/check.js 의 runTests() 도 같은 형태로 호출하므로 경로가 하나로 유지된다.
 *
 * 목록을 손으로 적지 않는다:
 *   테스트 파일을 추가하고 여기 등록하는 것을 잊으면, 검사를 통과했는데 실제로는
 *   아무것도 검사되지 않는 상태가 된다. 그래서 디렉토리를 직접 훑어 전부 불러온다.
 *   파일을 추가하기만 하면 자동으로 실행된다.
 *
 * 의존성 0 (Node 내장 모듈만).
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** *.test.js 를 재귀로 모은다. 실행 순서를 고정하기 위해 이름순으로 정렬한다. */
function collectTests(dir) {
  const found = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTests(full));
    } else if (entry.name.endsWith('.test.js')) {
      found.push(full);
    }
  }

  return found;
}

for (const file of collectTests(here)) {
  await import(pathToFileURL(file).href);
}
