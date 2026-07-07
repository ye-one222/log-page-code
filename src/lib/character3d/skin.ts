import type { PersonaId } from '../../config/personas';

/**
 * 페르소나별 Minecraft 64×64 스킨을 캔버스에 그린다.
 * 사양: design/3d-character/design.md (§2 UV 레이아웃, §3 팔레트, §4 디더링, §5 스킨별 사양)
 *
 * 규칙 요약:
 * - 단색 금지 — 모든 면은 베이스 + 근접 톤 디더링
 * - 얼굴/피부/머리 실루엣은 4벌 공유, 옷·하이라이트만 페르소나별
 * - 디더는 시드 고정 난수라 다시 그려도 같은 무늬가 나온다
 */

type Ctx = CanvasRenderingContext2D;
type Rect = [x: number, y: number, w: number, h: number];

export interface FaceRects {
  right: Rect;
  left: Rect;
  top: Rect;
  bottom: Rect;
  front: Rect;
  back: Rect;
}

/** Minecraft 표준 64×64 스킨 레이아웃 (px, 좌상단 원점) */
export const UV: Record<string, FaceRects> = {
  head: {
    right: [0, 8, 8, 8],
    left: [16, 8, 8, 8],
    top: [8, 0, 8, 8],
    bottom: [16, 0, 8, 8],
    front: [8, 8, 8, 8],
    back: [24, 8, 8, 8],
  },
  hat: {
    right: [32, 8, 8, 8],
    left: [48, 8, 8, 8],
    top: [40, 0, 8, 8],
    bottom: [48, 0, 8, 8],
    front: [40, 8, 8, 8],
    back: [56, 8, 8, 8],
  },
  body: {
    right: [16, 20, 4, 12],
    left: [28, 20, 4, 12],
    top: [20, 16, 8, 4],
    bottom: [28, 16, 8, 4],
    front: [20, 20, 8, 12],
    back: [32, 20, 8, 12],
  },
  armR: {
    right: [40, 20, 4, 12],
    left: [48, 20, 4, 12],
    top: [44, 16, 4, 4],
    bottom: [48, 16, 4, 4],
    front: [44, 20, 4, 12],
    back: [52, 20, 4, 12],
  },
  armL: {
    right: [32, 52, 4, 12],
    left: [40, 52, 4, 12],
    top: [36, 48, 4, 4],
    bottom: [40, 48, 4, 4],
    front: [36, 52, 4, 12],
    back: [44, 52, 4, 12],
  },
  legR: {
    right: [0, 20, 4, 12],
    left: [8, 20, 4, 12],
    top: [4, 16, 4, 4],
    bottom: [8, 16, 4, 4],
    front: [4, 20, 4, 12],
    back: [12, 20, 4, 12],
  },
  legL: {
    right: [16, 52, 4, 12],
    left: [24, 52, 4, 12],
    top: [20, 48, 4, 4],
    bottom: [24, 48, 4, 4],
    front: [20, 52, 4, 12],
    back: [28, 52, 4, 12],
  },
};

/** 공유 팔레트 — 피부/머리는 사용자 레퍼런스 스킨(창백한 핑크 피부 + 라이트 핑크 롱헤어) 기준 */
export const SHARED = {
  skin: '#F5DFDA',
  skinShade: '#E9C6C0',
  skinLight: '#FBEDE9',
  ink: '#2C2C2A',
  blush: '#F0B4BC',
  hair: '#F2B3BF',
  hairShade: '#E295A6',
  hairLight: '#FBE9EC',
  hairTip: '#D97F94',
  jeans: '#6B7783',
  jeansLight: '#7C8896',
  jeansDark: '#5C6672',
  cream: '#F7F3E8',
  creamShade: '#ECE5D4',
} as const;

/* ------------------------------------------------------------------ */
/* 그리기 헬퍼                                                          */
/* ------------------------------------------------------------------ */

/** 시드 고정 난수 (mulberry32) — 빌드/리로드마다 같은 디더 무늬 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function fill(ctx: Ctx, [x, y, w, h]: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 베이스 채움 + 근접 톤을 픽셀 단위로 흩뿌리는 디더 (design.md §4-1) */
function dither(ctx: Ctx, rect: Rect, base: string, tones: string[], ratio = 0.2, seed = 1): void {
  const [x, y, w, h] = rect;
  fill(ctx, rect, base);
  const rand = rng(seed + x * 64 + y);
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      if (rand() < ratio) px(ctx, x + ix, y + iy, tones[Math.floor(rand() * tones.length)]);
    }
  }
}

/** 가로 2px 줄무늬 (니트 짜임, design.md §4-2) */
function knit(ctx: Ctx, rect: Rect, base: string, stripe: string, seed = 1): void {
  const [x, y, w, h] = rect;
  fill(ctx, rect, base);
  const rand = rng(seed + x);
  for (let iy = 0; iy < h; iy++) {
    if (iy % 4 >= 2) {
      for (let ix = 0; ix < w; ix++) {
        if (rand() < 0.85) px(ctx, x + ix, y + iy, stripe);
      }
    }
  }
}

/** 세로 결 줄무늬 (머리카락, design.md §4-2) */
function hairGrain(ctx: Ctx, rect: Rect, base: string, shade: string, highlight: string, seed = 1): void {
  const [x, y, w, h] = rect;
  fill(ctx, rect, base);
  const rand = rng(seed + x * 3 + y);
  for (let ix = 0; ix < w; ix++) {
    const roll = rand();
    const color = roll < 0.3 ? shade : roll < 0.42 ? highlight : null;
    if (!color) continue;
    for (let iy = 0; iy < h; iy++) {
      if (rand() < 0.8) px(ctx, x + ix, y + iy, color);
    }
  }
}

/** 면 가장자리 1px 음영 (design.md §4-4) */
function edge(ctx: Ctx, [x, y, w, h]: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

function eachFace(faces: FaceRects, painter: (rect: Rect, name: keyof FaceRects) => void): void {
  (Object.keys(faces) as (keyof FaceRects)[]).forEach((name) => painter(faces[name], name));
}

/* ------------------------------------------------------------------ */
/* 공유 파츠: 머리(피부+얼굴), 머리카락, 청바지                          */
/* ------------------------------------------------------------------ */

/** 레퍼런스 스킨의 눈 팔레트: 다크 모브 속눈썹 + 연분홍 눈동자 */
const EYE = {
  lash: '#6B3A44',
  iris: '#D98CA2',
  irisLight: '#F2CED6',
  shine: '#FFFFFF',
} as const;

/**
 * 눈만 다시 그리기 — 깜빡임 애니메이션에서 재사용.
 * 레퍼런스처럼 가로로 넓은 3×2 구성: 위 속눈썹 라인(3px) →
 * 바깥쪽 눈꼬리 윙 + 눈동자 + 코 쪽 흰 반짝임. 나른하고 순한 인상.
 */
export function paintEyes(ctx: Ctx, closed: boolean): void {
  const [fx, fy] = UV.head.front;
  // 바탕 복구 (양쪽 눈 3×2 영역)
  ctx.fillStyle = SHARED.skin;
  ctx.fillRect(fx, fy + 4, 3, 2);
  ctx.fillRect(fx + 5, fy + 4, 3, 2);

  if (closed) {
    ctx.fillStyle = EYE.lash;
    ctx.fillRect(fx, fy + 5, 3, 1);
    ctx.fillRect(fx + 5, fy + 5, 3, 1);
    return;
  }

  // [윙(바깥) x, 눈동자 x, 반짝임(코 쪽) x]
  for (const [wing, iris, shine] of [
    [fx, fx + 1, fx + 2],
    [fx + 7, fx + 6, fx + 5],
  ]) {
    ctx.fillStyle = EYE.lash;
    ctx.fillRect(Math.min(wing, shine), fy + 4, 3, 1);
    px(ctx, wing, fy + 5, EYE.lash);
    px(ctx, iris, fy + 5, EYE.iris);
    px(ctx, shine, fy + 5, EYE.shine);
  }
}

function paintHead(ctx: Ctx): void {
  eachFace(UV.head, (rect) => dither(ctx, rect, SHARED.skin, [SHARED.skinShade], 0.14, 11));
  const [fx, fy] = UV.head.front;
  paintEyes(ctx, false);
  // 볼터치 (눈 아래) — 레퍼런스처럼 입은 없다
  px(ctx, fx + 1, fy + 6, SHARED.blush);
  px(ctx, fx + 6, fy + 6, SHARED.blush);
}

/** 라이트 핑크 롱헤어 overlay(hat 레이어) — 레퍼런스와 동일하게 전 페르소나 공유 */
function paintHair(ctx: Ctx): void {
  const grain = (rect: Rect, seed: number) =>
    hairGrain(ctx, rect, SHARED.hair, SHARED.hairShade, SHARED.hairLight, seed);
  grain(UV.hat.top, 21);
  // 뒷머리·옆머리: 턱선까지 전부 덮음 (그 아래 긴 머리는 3D 가닥이 담당)
  grain(UV.hat.back, 22);
  grain(UV.hat.right, 23);
  grain(UV.hat.left, 24);
  // 앞머리: 이마 위 2u + 삐죽 나온 3번째 줄, 얼굴 양옆 1열은 턱선까지
  const [fx, fy] = UV.hat.front;
  grain([fx, fy, 8, 2], 25);
  grain([fx, fy + 2, 1, 6], 27);
  grain([fx + 7, fy + 2, 1, 6], 28);
  const rand = rng(26);
  for (let ix = 1; ix < 7; ix++) {
    if (ix % 3 !== 1 && rand() < 0.8) px(ctx, fx + ix, fy + 2, rand() < 0.35 ? SHARED.hairShade : SHARED.hair);
  }
}

/** 공유 청바지 + 신발 힌트 (크리에이터 제외) */
function paintJeans(ctx: Ctx): void {
  for (const part of [UV.legR, UV.legL]) {
    eachFace(part, (rect, name) => {
      dither(ctx, rect, SHARED.jeans, [SHARED.jeansLight, SHARED.jeansDark], 0.28, 31);
      if (name !== 'top' && name !== 'bottom') {
        const [x, y, w, h] = rect;
        ctx.fillStyle = '#4A4A48';
        ctx.fillRect(x, y + h - 1, w, 1);
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* 페르소나별 상의/하의                                                 */
/* ------------------------------------------------------------------ */

function paintResearcherOutfit(ctx: Ctx): void {
  const coat = (rect: Rect, seed: number) => dither(ctx, rect, '#FFFFFF', ['#ECECEC'], 0.2, seed);
  eachFace(UV.body, (rect) => coat(rect, 41));
  eachFace(UV.armR, (rect) => coat(rect, 42));
  eachFace(UV.armL, (rect) => coat(rect, 43));

  const [bx, by, bw, bh] = UV.body.front;
  // 앞섶 세로 라인 + 옷깃/포켓 보라 포인트
  ctx.fillStyle = '#D8D8D8';
  ctx.fillRect(bx + 4, by, 1, bh);
  ctx.fillStyle = '#7F77DD';
  ctx.fillRect(bx + 3, by, 1, 2);
  ctx.fillRect(bx + 4, by, 1, 2);
  px(ctx, bx + 1, by + 7, '#7F77DD');
  px(ctx, bx + 6, by + 7, '#7F77DD');
  // 소매 끝 보라 커프스 2px
  for (const arm of [UV.armR, UV.armL]) {
    eachFace(arm, (rect, name) => {
      if (name === 'top' || name === 'bottom') return;
      const [x, y, w, h] = rect;
      ctx.fillStyle = '#7F77DD';
      ctx.fillRect(x, y + h - 2, w, 2);
    });
  }
  paintJeans(ctx);
}

function paintCreatorOutfit(ctx: Ctx): void {
  const teal = (rect: Rect, seed: number) => dither(ctx, rect, '#1D9E75', ['#178A66'], 0.25, seed);
  const cream = (rect: Rect, seed: number) =>
    dither(ctx, rect, SHARED.cream, [SHARED.creamShade], 0.2, seed);

  // 팔 전체 = 크림 이너 티
  eachFace(UV.armR, (rect) => cream(rect, 51));
  eachFace(UV.armL, (rect) => cream(rect, 52));

  // 몸통: 어깨 3u 크림 + 허리 아래 전폭 청록, 측면/후면도 동일 규칙
  eachFace(UV.body, (rect, name) => {
    const [x, y, w, h] = rect;
    if (name === 'top') return cream(rect, 53);
    if (name === 'bottom') return teal(rect, 54);
    cream([x, y, w, 3], 55);
    teal([x, y + 8, w, h - 8], 56);
    if (name === 'front' || name === 'back') {
      // 비브(가슴판) 폭 6u + 테두리 스티치
      teal([x + 1, y + 3, 6, 5], 57);
      ctx.fillStyle = '#0C5A45';
      ctx.fillRect(x + 1, y + 3, 6, 1);
      ctx.fillRect(x + 1, y + 3, 1, 5);
      ctx.fillRect(x + 6, y + 3, 1, 5);
      // 스트랩 (ㅣㅣ자, 어깨 위부터 비브까지)
      ctx.fillStyle = '#1D9E75';
      ctx.fillRect(x + 1, y, 1, 3);
      ctx.fillRect(x + 6, y, 1, 3);
      if (name === 'front') {
        // 골드 버클 + 그림자
        px(ctx, x + 1, y + 3, '#E8C36A');
        px(ctx, x + 6, y + 3, '#E8C36A');
        px(ctx, x + 1, y + 4, SHARED.ink);
        px(ctx, x + 6, y + 4, SHARED.ink);
        // 가슴 포켓 2×2
        ctx.fillStyle = '#0C5A45';
        ctx.strokeStyle = '#0C5A45';
        ctx.fillRect(x + 3, y + 5, 2, 1);
        ctx.fillRect(x + 3, y + 6, 1, 1);
        ctx.fillRect(x + 4, y + 6, 1, 1);
      }
    } else {
      // 측면은 크림 3u + 청록
      teal([x, y + 3, w, 5], 58);
    }
  });

  // 하의: 일체형 청록 바지 + 크림 롤업
  for (const part of [UV.legR, UV.legL]) {
    eachFace(part, (rect, name) => {
      teal(rect, 59);
      if (name !== 'top' && name !== 'bottom') {
        const [x, y, w, h] = rect;
        ctx.fillStyle = SHARED.cream;
        ctx.fillRect(x, y + h - 2, w, 1);
        ctx.fillStyle = '#4A4A48';
        ctx.fillRect(x, y + h - 1, w, 1);
      }
    });
  }
}

function paintReaderOutfit(ctx: Ctx): void {
  eachFace(UV.body, (rect) => knit(ctx, rect, '#D85A30', '#C24E28', 61));
  eachFace(UV.armR, (rect) => knit(ctx, rect, '#D85A30', '#C24E28', 62));
  eachFace(UV.armL, (rect) => knit(ctx, rect, '#D85A30', '#C24E28', 63));
  // 라운드넥/소매 리브
  const [bx, by, bw] = UV.body.front;
  ctx.fillStyle = '#A8431F';
  ctx.fillRect(bx + 2, by, 4, 1);
  for (const arm of [UV.armR, UV.armL]) {
    eachFace(arm, (rect, name) => {
      if (name === 'top' || name === 'bottom') return;
      const [x, y, w, h] = rect;
      ctx.fillStyle = '#A8431F';
      ctx.fillRect(x, y + h - 2, w, 2);
    });
  }
  paintJeans(ctx);
}

function paintMusicianOutfit(ctx: Ctx): void {
  const tee = (rect: Rect, seed: number) => dither(ctx, rect, '#2C2C2A', ['#3A3A38'], 0.3, seed);
  eachFace(UV.body, (rect) => tee(rect, 71));
  eachFace(UV.armR, (rect) => tee(rect, 72));
  eachFace(UV.armL, (rect) => tee(rect, 73));
  // 가슴 핑크 로고 (픽셀 번개)
  const [bx, by] = UV.body.front;
  ctx.fillStyle = '#D4537E';
  px(ctx, bx + 4, by + 3, '#D4537E');
  px(ctx, bx + 3, by + 4, '#D4537E');
  px(ctx, bx + 4, by + 4, '#D4537E');
  px(ctx, bx + 3, by + 5, '#D4537E');
  px(ctx, bx + 2, by + 6, '#D4537E');
  // 소매 끝 핑크 1px
  for (const arm of [UV.armR, UV.armL]) {
    eachFace(arm, (rect, name) => {
      if (name === 'top' || name === 'bottom') return;
      const [x, y, w, h] = rect;
      ctx.fillStyle = '#D4537E';
      ctx.fillRect(x, y + h - 1, w, 1);
    });
  }
  paintJeans(ctx);
}

/* ------------------------------------------------------------------ */
/* 조립                                                                */
/* ------------------------------------------------------------------ */

const OUTFIT: Record<PersonaId, { paint: (ctx: Ctx) => void }> = {
  researcher: { paint: paintResearcherOutfit },
  creator: { paint: paintCreatorOutfit },
  reader: { paint: paintReaderOutfit },
  musician: { paint: paintMusicianOutfit },
};

export interface Skin {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
}

/** 페르소나 스킨 64×64 아틀라스 생성 */
export function paintSkin(persona: PersonaId): Skin {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  paintHead(ctx);
  paintHair(ctx);
  OUTFIT[persona].paint(ctx);
  return { canvas, ctx };
}
