/**
 * mo.js — MO 엔트리.
 *
 * MO HTML 이 <script type="module" src="/assets/js/mo.js"> 로 이 파일 하나만 읽는다.
 * 번들러 없이 네이티브 ES Module 로 로드되므로 상대 import 에는 .js 확장자를 붙인다.
 *
 * 이 파일의 역할은 import 와 init 호출뿐이다. 로직을 여기 두지 마라.
 *   - 순수 로직 → assets/js/util/   (테스트 필수)
 *   - DOM 바인딩 → assets/js/common/
 *
 * PC 엔트리(pc.js)와 짝이며, PC/MO 는 HTML 만 2벌이고 util·common 은 공유한다.
 *
 * TODO(step 3+): common/ 모듈이 생기면 여기에서 import 해 init 을 호출한다.
 */

export {};
