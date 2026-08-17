# 이커머스 퍼블리싱 보일러플레이트

npm이나 프레임워크 없이도 빌드·서빙·검증할 수 있는 재사용 가능한 퍼블리싱 뼈대입니다. Node.js 18 이상이 필요합니다(`node --test` 사용).

## 최초 세팅

저장소를 클론한 뒤 Git 훅 경로를 한 번 등록합니다. 이 설정은 클론 시 자동 적용되지 않습니다.

```bash
git config core.hooksPath .githooks
```

## Tier 0 — npm 없이

```bash
node tools/build.js
node tools/serve.js
node tools/check.js
```

동봉된 dart-sass 바이너리는 Windows x64 기준입니다. 다른 운영체제에서는 [dart-sass releases](https://github.com/sass/dart-sass/releases)에서 해당 플랫폼 아카이브를 받아 `tools/vendor/sass/`에 풀어야 합니다. 바이너리가 없어도 커밋된 CSS를 사용하므로 빌드 자체는 실패하지 않습니다.

## Tier 1 — npm 사용 가능 시

```bash
npm install
npm run build
npm run serve
npm run check
npm test
npm run lint:js
npm run lint:css
npm run lint:html
```

Tier 1은 Sass와 Vite, lint 도구를 제공하는 선택 레이어입니다. `node_modules/`가 없어도 Tier 0 경로는 모두 동작합니다.
