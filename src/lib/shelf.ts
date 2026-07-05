/** Shelf 진열 아이템의 모양(색, 크기, 기울기)을 결정하는 로직 */

/** 파일명 기반 결정적 해시 — 글을 다시 빌드해도 같은 모양이 유지된다 */
export function hashOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface SpineColor {
  bg: string;
  fg: string;
}

/** frontmatter에 color를 지정하지 않은 책/음반에 돌아가며 배정되는 색 */
export const SHELF_PALETTE: SpineColor[] = [
  { bg: '#0f6e56', fg: '#e1f5ee' },
  { bg: '#d85a30', fg: '#faece7' },
  { bg: '#185fa5', fg: '#e6f1fb' },
  { bg: '#444441', fg: '#f1efe8' },
  { bg: '#ba7517', fg: '#faeeda' },
  { bg: '#d4537e', fg: '#fbeaf0' },
  { bg: '#534ab7', fg: '#eeedfe' },
];

export function paletteFor(id: string, override?: string): SpineColor {
  if (override) {
    // 사용자 지정 색: 글자색은 밝은 회백색으로 고정 (어두운 색 지정을 권장)
    return { bg: override, fg: '#f6f4ee' };
  }
  return SHELF_PALETTE[hashOf(id) % SHELF_PALETTE.length];
}

export interface SpineShape {
  width: number;
  height: number;
  tilt: number;
}

/** 책등의 두께/높이/기울기 — id 해시로 결정해 진짜 책장처럼 들쭉날쭉하게 */
export function spineShape(id: string): SpineShape {
  const h = hashOf(id);
  return {
    width: 22 + (h % 13),
    height: 112 + ((h >> 3) % 31),
    tilt: h % 7 === 0 ? 5 : 0,
  };
}
