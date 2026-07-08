import * as THREE from 'three';

/**
 * 방/가구용 저해상도 캔버스 텍스처 (design/persona-room/design.md §4).
 * 전부 런타임 생성(외부 이미지 0) · NearestFilter · mipmap off.
 * 디더링 규칙은 기존 캐릭터 design.md §4 계승: 단색 금지, base+shade 2톤 체커 15~25%.
 */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  return texture;
}

/** base를 깔고 shade 픽셀을 ratio만큼 흩뿌린다. edge면 가장자리 1px도 shade */
export function ditherRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  shade: string,
  ratio = 0.2,
  edge = true,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade;
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const onEdge = edge && (px === x || px === x + w - 1 || py === y || py === y + h - 1);
      if (onEdge || ((px + py) % 2 === 0 && Math.random() < ratio * 2)) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

/**
 * 가구 박스용 2톤 디더 재질. 8×8 타일이 각 면에 늘어나 픽셀 질감이 된다.
 * 재질/텍스처는 존마다 새로 만들어(캐시는 호출자 소유) 디밍이 존 단위로 격리된다.
 */
export type MaterialCache = Map<string, THREE.MeshLambertMaterial>;

export function ditherMaterial(
  cache: MaterialCache,
  base: string,
  shade: string,
  opts: { emissive?: string; stripe?: 'h' | 'v' } = {},
): THREE.MeshLambertMaterial {
  const key = `${base}:${shade}:${opts.emissive ?? ''}:${opts.stripe ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const [canvas, ctx] = makeCanvas(8, 8);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = shade;
  if (opts.stripe === 'h') {
    for (let y = 0; y < 8; y += 4) ctx.fillRect(0, y, 8, 2);
  } else if (opts.stripe === 'v') {
    for (let x = 0; x < 8; x += 4) ctx.fillRect(x, 0, 2, 8);
  } else {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0 && Math.random() < 0.4) ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const material = new THREE.MeshLambertMaterial({ map: toTexture(canvas) });
  if (opts.emissive) material.emissive = new THREE.Color(opts.emissive);
  cache.set(key, material);
  return material;
}

/** 바닥: 8u 그리드 판자 (32×32 타일을 repeat) */
export function floorTexture(repeat: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  const base = '#C9A87C';
  const shade = '#B8946A';
  ditherRect(ctx, 0, 0, 32, 32, base, shade, 0.06, false);
  ctx.fillStyle = shade;
  for (let row = 0; row < 4; row++) {
    // 판자 결: 가로 라인 + 줄마다 어긋난 이음매
    ctx.fillRect(0, row * 8, 32, 1);
    ctx.fillRect((row % 2 === 0 ? 10 : 24) % 32, row * 8, 1, 8);
  }
  return toTexture(canvas, repeat);
}

/** 벽: 플라스터 (은은한 디더) */
export function wallTexture(base: string, shade: string, repeat: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ditherRect(ctx, 0, 0, 32, 32, base, shade, 0.04, false);
  return toTexture(canvas, repeat);
}

/** 러그: soft 바탕 + main 테두리 2px (16×16) */
export function rugTexture(soft: string, main: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ditherRect(ctx, 0, 0, 16, 16, soft, main, 0.04);
  ctx.strokeStyle = main;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 14, 14);
  return toTexture(canvas);
}

/** 창밖 맑은 하늘: 플랫 블루 + 블록 구름 + 픽셀 해 (unlit Basic 재질용) */
export function skyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(56, 40);
  ditherRect(ctx, 0, 0, 56, 40, '#7EC8F2', '#92D4F8', 0.05, false);
  // 위쪽으로 갈수록 살짝 밝게 (2단 밴드)
  ctx.fillStyle = '#8FD5FA';
  for (let x = 0; x < 56; x += 2) ctx.fillRect(x, 0, 1, 6);
  // 픽셀 해 (좌상단)
  ctx.fillStyle = '#FFD75E';
  ctx.fillRect(6, 5, 6, 6);
  ctx.fillStyle = '#FFE9A8';
  ctx.fillRect(7, 6, 4, 4);
  // 블록 구름 (2단 뭉게)
  const cloud = (x: number, y: number, w: number) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, 3);
    ctx.fillRect(x + 2, y - 2, w - 4, 2);
    ctx.fillStyle = '#E3F2FB';
    ctx.fillRect(x, y + 3, w, 1);
  };
  cloud(22, 10, 16);
  cloud(40, 22, 12);
  cloud(4, 27, 14);
  return toTexture(canvas);
}

/**
 * 구역 라벨 빌보드: 항상 카메라를 향하는 스프라이트 (design.md §7.2).
 * 배경 soft, 글자 deep, 테두리 main. 장식용 — 정보는 DOM에 이미 존재.
 */
export function labelSprite(name: string, soft: string, deep: string, main: string): THREE.Sprite {
  const [canvas, ctx] = makeCanvas(192, 72);
  ctx.fillStyle = soft;
  ctx.fillRect(4, 4, 184, 64);
  ctx.strokeStyle = main;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 180, 60);
  ctx.fillStyle = deep;
  ctx.font =
    '500 30px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 96, 38);

  const texture = toTexture(canvas);
  texture.magFilter = THREE.LinearFilter; // 글자는 픽셀 뭉개짐보다 가독 우선
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.15, 0.43, 1);
  return sprite;
}
