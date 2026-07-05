# yewon.log

페르소나 기반 개인 웹사이트. Astro 정적 사이트로, 글 하나 = 마크다운 파일 하나.

## 명령어

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 (http://localhost:4321)
npm run build    # 정적 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
```

## 글 쓰는 법

`src/content/` 아래에 마크다운 파일을 추가하면 목록·홈 피드에 자동 반영된다.
frontmatter는 스키마(`src/content.config.ts`)가 검증하므로 필드 오타는 빌드 에러로 잡힌다.

| 컬렉션 | 위치 | type 값 | 비고 |
|---|---|---|---|
| Research | `src/content/research/` | `paper`(논문 리뷰), `note`(지식 기록) | 논문은 `venue: "SIGGRAPH 2023"` |
| Playground | `src/content/playground/` | `3d`, `video`, `web` | `tools: [Blender]` |
| Shelf | `src/content/shelf/` | `book`, `album`, `ticket` | 책은 `rating`, `quote`, 공연은 `venue` |

`draft: true`를 붙이면 어디에도 노출되지 않는다.

## 구조 이해하기 (수정할 때 어디를 보면 되나)

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 이름, 이메일, 소셜 링크, 메뉴 | `src/config/site.ts` |
| 페르소나 (문구, 색, 콘텐츠 유형 매핑) | `src/config/personas.ts` |
| frontmatter 필드 추가/변경 | `src/content.config.ts` |
| 전체 색/폰트 토큰 | `src/styles/global.css` |
| 캐릭터 그림 | `src/components/Character.astro` |
| 홈 회전 인터랙션 | `src/components/PersonaHero.astro` |
| Shelf 진열 모양 (책등 크기/색 규칙) | `src/lib/shelf.ts` + `src/components/shelf/` |
| About 이력/기술 | `src/pages/about.astro` 상단 배열 |

### 자주 할 확장 작업

- **새 취미(콘텐츠 유형) 추가** — 예: 영화
  1. `content.config.ts`: shelf 스키마 enum에 `'movie'` 추가
  2. `personas.ts`: `TYPE_META`에 `movie: { label: '영화', persona: 'reader' }` 추가
  3. `src/pages/shelf/index.astro`: `rows` 배열에 한 줄 추가
- **새 페르소나 추가**
  1. `personas.ts`: `PersonaId`와 `PERSONAS`에 추가
  2. `Character.astro`: 액세서리 분기 추가
- **3D 캐릭터로 업그레이드** — `Character.astro`만 Three.js 컴포넌트로 교체하면 된다.
  회전 로직(PersonaHero)은 캐릭터 구현을 모르게 분리되어 있다.

## 배포

정적 빌드라 Vercel / Cloudflare Pages / GitHub Pages 어디든 된다.
도메인 확정 후 `astro.config.mjs`의 `site` 값을 교체할 것.
