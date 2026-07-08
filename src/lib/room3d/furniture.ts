import * as THREE from 'three';
import type { Persona, PersonaId } from '../../config/personas';
import { ditherMaterial, labelSprite, rugTexture, type MaterialCache } from './textures';

/**
 * 구역별 복셀 가구 (design/persona-room/design.md §2).
 * 전부 BoxGeometry 조합 — 원기둥/구 금지. 치수·위치는 u(1u = 0.1 world) 단위,
 * 구역 로컬 원점 = 스탠드(러그) 중심, 바닥 y=0.
 */

const U = 0.1;

// 방 중립 팔레트 (design.md §1 — 하드코딩은 여기까지만 허용)
export const NEUTRAL = {
  wood: '#C9A87C',
  woodShade: '#B8946A',
  plaster: '#EFE7D8',
  plasterShade: '#E2D6C1',
  plasterDark: '#E7DDCB',
  ink: '#2C2C2A',
  inkSoft: '#3A3A38',
  metal: '#5F5E5A',
  paper: '#FFFFFF',
  paperShade: '#F1EFE8',
  gold: '#E8C36A',
} as const;

/** 구역 스탠드(캐릭터 도착점) — world 좌표 (design.md §1 평면도) */
export const STANDS: Record<PersonaId, THREE.Vector3> = {
  researcher: new THREE.Vector3(-1.8, 0, -1.6),
  creator: new THREE.Vector3(1.8, 0, -1.6),
  reader: new THREE.Vector3(1.8, 0, 1.4),
  musician: new THREE.Vector3(-1.8, 0, 1.4),
};

export interface Zone {
  id: PersonaId;
  group: THREE.Group;
  /** 캐릭터 도착점(world) */
  stand: THREE.Vector3;
  /** 탭 히트 프록시 (구역 전체를 덮는 투명 박스) */
  proxy: THREE.Mesh;
  /** 비활성일 때 카메라를 향해 뜨는 이름표 */
  label: THREE.Sprite;
  /** 러그 테두리 펄스 프레임 (opacity 0.5~1.0) */
  pulse: THREE.Mesh[];
  /** 활성 시 포인트 라이트가 이동할 위치(world) */
  lampPos: THREE.Vector3;
  /** 독서인 전용: 앉을 좌면 위치(world)와 앉은 방향 */
  seat?: { position: THREE.Vector3; yaw: number };
  setDim(dim: boolean): void;
}

interface ZoneBuild {
  group: THREE.Group;
  cache: MaterialCache;
  plain: Map<string, THREE.MeshLambertMaterial>;
}

function startZone(): ZoneBuild {
  return { group: new THREE.Group(), cache: new Map(), plain: new Map() };
}

/** 단색 복셀 (작은 파츠용 — 존 단위 재질 공유) */
function voxel(
  z: ZoneBuild,
  w: number,
  h: number,
  d: number,
  color: string,
  pos: [number, number, number],
): THREE.Mesh {
  let material = z.plain.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    z.plain.set(color, material);
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), material);
  mesh.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
  z.group.add(mesh);
  return mesh;
}

/** 디더 복셀 (넓은 면 파츠용) */
function dvoxel(
  z: ZoneBuild,
  w: number,
  h: number,
  d: number,
  base: string,
  shade: string,
  pos: [number, number, number],
  opts: { emissive?: string; stripe?: 'h' | 'v' } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w * U, h * U, d * U),
    ditherMaterial(z.cache, base, shade, opts),
  );
  mesh.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
  z.group.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------ */
/* 구역별 가구 (§2.1~2.4) — 벽 밀착 가구는 로컬 z=-24가 뒤벽            */
/* ------------------------------------------------------------------ */

function buildResearcher(z: ZoneBuild, p: Persona): void {
  const { wood, woodShade, ink, paper, paperShade } = NEUTRAL;
  // 책상 (뒤벽 밀착)
  dvoxel(z, 26, 2, 12, wood, woodShade, [0, 10, -18]);
  for (const x of [-11, 11])
    for (const zz of [-22.5, -13.5]) voxel(z, 2, 10, 2, woodShade, [x, 5, zz]);
  // 모니터: 베젤 + 화면(soft) + UI 라인(main)
  voxel(z, 16, 10, 1.5, ink, [0, 19, -21]);
  voxel(z, 14, 8, 0.4, p.color.soft, [0, 19, -20.1]);
  voxel(z, 10, 0.8, 0.5, p.color.main, [-1, 21, -20]);
  voxel(z, 7, 0.8, 0.5, p.color.main, [-2.5, 18.5, -20]);
  voxel(z, 2, 4, 2, ink, [0, 13, -21.5]);
  // 논문 더미 3층 (살짝 어긋나게)
  dvoxel(z, 6, 2, 8, paper, paperShade, [-9, 12, -18]);
  dvoxel(z, 6, 2, 8, paperShade, paper, [-8.4, 14, -17.6]);
  voxel(z, 6, 1.5, 8, paper, [-8.8, 15.7, -18.2]);
  voxel(z, 6.1, 0.6, 8.1, p.color.main, [-8.8, 15.2, -18.2]);
  // 데스크 램프 (포인트 광원 앵커)
  voxel(z, 1, 6, 1, ink, [9, 14, -18]);
  dvoxel(z, 3, 2, 3, p.color.soft, p.color.main, [9, 17.5, -18], { emissive: p.color.soft });
}

function buildCreator(z: ZoneBuild, p: Persona): void {
  const { wood, woodShade, ink, inkSoft, metal, gold } = NEUTRAL;
  // 작업대: 청록 캐비닛 + 우드 상판 (뒤벽 밀착)
  dvoxel(z, 24, 9, 12, p.color.main, p.color.deep, [0, 5.5, -18]);
  dvoxel(z, 24, 2, 12, wood, woodShade, [0, 11, -18]);
  for (const x of [-5, 5]) voxel(z, 3, 1, 0.6, gold, [x, 6, -11.6]);
  // 삼각대 (얇은 박스 3개 A자) + 카메라 헤드
  for (const [rx, rz] of [
    [0.26, 0],
    [-0.2, 0.22],
    [-0.2, -0.22],
  ]) {
    const leg = voxel(z, 1, 22, 1, ink, [10, 11, 2]);
    leg.rotation.set(rz, 0, rx);
  }
  voxel(z, 6, 4, 3, ink, [10, 23, 2]);
  voxel(z, 3, 3, 2, metal, [10, 23, 4.2]);
  voxel(z, 1.2, 1.2, 1, ink, [10, 23, 5.5]);
  // 공구 보드 (뒤벽 걸이)
  dvoxel(z, 14, 10, 0.6, p.color.soft, p.color.main, [0, 26, -23.5]);
  voxel(z, 1, 5, 1, inkSoft, [-4, 26, -22.9]);
  voxel(z, 3, 1, 1, inkSoft, [-4, 29, -22.9]);
  voxel(z, 1.5, 4, 1, inkSoft, [0, 25.5, -22.9]);
  voxel(z, 1, 6, 1, inkSoft, [4, 26, -22.9]);
  // 잎 화분
  voxel(z, 4, 4, 4, woodShade, [-9, 14, -16]);
  dvoxel(z, 3, 3, 3, p.color.main, p.color.deep, [-10, 17.5, -16.5]);
  dvoxel(z, 2.5, 2.5, 2.5, p.color.main, p.color.deep, [-8, 18.5, -15.5]);
  dvoxel(z, 2, 3.5, 2, p.color.main, p.color.deep, [-9, 19.5, -17]);
}

function buildReader(z: ZoneBuild, p: Persona): { seatLocal: THREE.Vector3; chairYaw: number } {
  const { wood, woodShade, ink } = NEUTRAL;
  // 책장 2단 — 방 오른쪽 열린 가장자리에 사이드월처럼 세워(책이 -x를 보게 90° 회전)
  // 뒤 크리에이터 구역과 앞 카메라 시선을 모두 가리지 않는다
  const shelf = new THREE.Group();
  const shelfParts: THREE.Mesh[] = [];
  shelfParts.push(voxel(z, 22, 12, 1, woodShade, [0, 6, -4]));
  for (const x of [-10.5, 10.5]) shelfParts.push(dvoxel(z, 1.5, 12, 8, wood, woodShade, [x, 6, 0]));
  for (const y of [1, 11.2]) shelfParts.push(dvoxel(z, 22, 1.5, 8, wood, woodShade, [0, y, 0]));
  // 책등 무리: 랜덤 굵기/높이/색
  const spineColors = [p.color.main, p.color.deep, wood, p.color.soft, NEUTRAL.paperShade];
  {
    let x = -9;
    while (x < 8) {
      const w = 1 + Math.random() * 0.8;
      const h = 5.5 + Math.random() * 2;
      const color = spineColors[Math.floor(Math.random() * spineColors.length)];
      if (Math.random() < 0.12) {
        shelfParts.push(voxel(z, 4.5, 1.2, 5.5, color, [x + 1.6, 2.4, 0])); // 눕힌 책
        x += 5;
      } else {
        shelfParts.push(voxel(z, w, h, 5.5, color, [x + w / 2, 2 + h / 2, 0]));
        x += w + 0.3;
      }
    }
  }
  // 책장 위 장식 책 두 권
  shelfParts.push(voxel(z, 4, 1.2, 5.5, p.color.main, [-5, 12.6, 0]));
  shelfParts.push(voxel(z, 3.5, 1.1, 5, p.color.deep, [-1, 12.5, -0.2]));
  for (const mesh of shelfParts) {
    z.group.remove(mesh);
    shelf.add(mesh);
  }
  // 낮은 콘솔이라 시야를 막지 않으니 의자 뒤에서 정면(+z)을 보게 둔다
  shelf.position.set(2 * U, 0, -7 * U);
  z.group.add(shelf);
  // 안락의자 (니트 가로 줄무늬) — 방 중앙을 살짝 향해
  const chairYaw = -0.3;
  const CHX = 6;
  const chair = new THREE.Group();
  const seat = dvoxel(z, 10, 3, 10, p.color.main, p.color.deep, [0, 0, 0], { stripe: 'h' });
  const back = dvoxel(z, 10, 11, 2, p.color.main, p.color.deep, [0, 4, -5.5], { stripe: 'h' });
  const armL = dvoxel(z, 2, 4, 10, p.color.deep, p.color.main, [-6, 1.5, 0]);
  const armR = dvoxel(z, 2, 4, 10, p.color.deep, p.color.main, [6, 1.5, 0]);
  for (const mesh of [seat, back, armL, armR]) {
    z.group.remove(mesh);
    chair.add(mesh);
  }
  chair.position.set(CHX * U, 5 * U, 4 * U);
  chair.rotation.y = chairYaw;
  z.group.add(chair);
  for (const x of [-4, 4])
    for (const zz of [-4, 4]) {
      const leg = voxel(z, 1.5, 3, 1.5, woodShade, [0, 0, 0]);
      leg.position.set((CHX + x * Math.cos(chairYaw) + zz * Math.sin(chairYaw)) * U, 1.5 * U, (4 - x * Math.sin(chairYaw) + zz * Math.cos(chairYaw)) * U);
    }
  // 플로어 스탠드 (포인트 광원 앵커)
  voxel(z, 1, 24, 1, woodShade, [-9, 12, 2]);
  dvoxel(z, 4, 3, 4, p.color.soft, p.color.main, [-9, 25.5, 2], { emissive: p.color.soft });
  voxel(z, 3, 0.8, 3, ink, [-9, 0.4, 2]);
  return { seatLocal: new THREE.Vector3(CHX * U, 6.5 * U, 4 * U), chairYaw };
}

function buildMusician(z: ZoneBuild, p: Persona): void {
  const { ink, inkSoft, metal } = NEUTRAL;
  // 앰프 캐비닛 + 그릴 + 핑크 노브
  dvoxel(z, 14, 12, 8, ink, inkSoft, [-8, 6, -8]);
  dvoxel(z, 12, 7, 0.6, '#4A4A46', inkSoft, [-8, 4.5, -3.6]);
  for (const x of [-11, -8, -5]) voxel(z, 1.2, 1.2, 0.8, p.color.main, [x, 10.5, -3.7]);
  // 기타 스탠드(A자) + 일렉기타
  for (const rx of [0.3, -0.3]) {
    const leg = voxel(z, 1, 14, 1, ink, [8, 7, 1]);
    leg.rotation.z = rx;
  }
  const guitar = new THREE.Group();
  const body = dvoxel(z, 6, 8, 2, '#8B2E4E', p.color.deep, [0, 0, 0]);
  const pickguard = voxel(z, 3, 3, 0.4, '#F0E0E8', [-0.8, -1, 1.1]);
  const neck = voxel(z, 1.8, 13, 1.4, '#5C3A21', [2.5, 9, 0]);
  const head = voxel(z, 2.2, 2.5, 1.4, ink, [4, 16, 0]);
  for (const mesh of [body, pickguard, neck, head]) {
    z.group.remove(mesh);
    guitar.add(mesh);
  }
  guitar.children[2].rotation.z = -0.18;
  guitar.children[3].position.set(4.6 * U, 15.4 * U, 0);
  guitar.position.set(7 * U, 6 * U, 2 * U);
  guitar.rotation.z = 0.22;
  z.group.add(guitar);
  // 마이크 스탠드 (앰프 뒤편에 붙여 프레임 전경을 가로지르지 않게)
  voxel(z, 1, 24, 1, ink, [-13, 12, -2]);
  voxel(z, 4, 0.8, 4, ink, [-13, 0.4, -2]);
  const mic = voxel(z, 2, 3, 2, metal, [-12.2, 25, -1.4]);
  mic.rotation.z = -0.4;
  // 왼벽 포스터 (왼벽은 로컬 x=-22)
  dvoxel(z, 0.6, 16, 12, p.color.deep, p.color.main, [-21.6, 26, 0]);
  voxel(z, 0.7, 4, 3, p.color.main, [-21.5, 28, -1]);
  voxel(z, 0.7, 3, 4, p.color.main, [-21.5, 23, 1.5]);
}

/* ------------------------------------------------------------------ */
/* 구역 조립                                                            */
/* ------------------------------------------------------------------ */

const LAMP_OFFSET: Record<PersonaId, [number, number, number]> = {
  researcher: [0.9, 1.9, -1.8],
  creator: [-0.9, 2.1, -1.6],
  reader: [-0.9, 2.7, 0.2],
  musician: [-0.8, 1.6, -0.8],
};

export function buildZone(persona: Persona): Zone {
  const z = startZone();
  const stand = STANDS[persona.id].clone();
  z.group.position.set(stand.x, 0, stand.z);

  let seat: Zone['seat'];
  let rugCenter: [number, number] = [0, 3];
  if (persona.id === 'researcher') buildResearcher(z, persona);
  else if (persona.id === 'creator') buildCreator(z, persona);
  else if (persona.id === 'musician') buildMusician(z, persona);
  else {
    const { seatLocal, chairYaw } = buildReader(z, persona);
    rugCenter = [3, 3];
    seat = {
      position: seatLocal.clone().add(new THREE.Vector3(stand.x, 0, stand.z)),
      yaw: chairYaw,
    };
  }

  // 러그(스탠드 마크) + 펄스 테두리 프레임
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(12 * U, 1 * U, 12 * U),
    new THREE.MeshLambertMaterial({ map: rugTexture(persona.color.soft, persona.color.main) }),
  );
  rug.position.set(rugCenter[0] * U, 0.5 * U, rugCenter[1] * U);
  z.group.add(rug);

  const pulse: THREE.Mesh[] = [];
  const frameMaterial = new THREE.MeshLambertMaterial({
    color: persona.color.main,
    transparent: true,
    opacity: 0.8,
  });
  for (const [w, d, ox, oz] of [
    [13.6, 0.8, 0, -6.4],
    [13.6, 0.8, 0, 6.4],
    [0.8, 12, -6.4, 0],
    [0.8, 12, 6.4, 0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w * U, 0.7 * U, d * U), frameMaterial);
    bar.position.set((rugCenter[0] + ox) * U, 0.6 * U, (rugCenter[1] + oz) * U);
    pulse.push(bar);
    z.group.add(bar);
  }

  // 라벨 빌보드 (비활성 구역용) — 각 구역의 가장 높은 가구 바로 위에 앵커
  const LABEL_ANCHOR: Record<PersonaId, [number, number, number]> = {
    researcher: [0, 3.2, -1.8], // 모니터 위
    creator: [0, 3.6, -1.8], // 공구 보드 위
    reader: [0.6, 2.2, 0.4], // 안락의자 위
    musician: [-0.8, 2.4, -0.8], // 앰프 위
  };
  const label = labelSprite(persona.name, persona.color.soft, persona.color.deep, persona.color.main);
  label.position.set(...LABEL_ANCHOR[persona.id]);
  z.group.add(label);

  // 투명 히트 프록시: 구역 전체를 덮는다 (레이캐스트 전용, 그리기는 안 함)
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(34 * U, 34 * U, 36 * U),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  proxy.position.set(0, 17 * U, -4 * U);
  proxy.userData.personaId = persona.id;
  z.group.add(proxy);

  // 디밍: 존 소유 재질만 어둡게 (러그 포함, 펄스 프레임 제외)
  const dimTargets: THREE.MeshLambertMaterial[] = [
    ...z.plain.values(),
    ...z.cache.values(),
    rug.material as THREE.MeshLambertMaterial,
  ];
  for (const m of dimTargets) m.userData.baseColor = m.color.clone();
  function setDim(dim: boolean): void {
    for (const m of dimTargets) {
      m.color.copy(m.userData.baseColor as THREE.Color);
      if (dim) m.color.multiplyScalar(0.82);
    }
  }

  return {
    id: persona.id,
    group: z.group,
    stand,
    proxy,
    label,
    pulse,
    lampPos: stand.clone().add(new THREE.Vector3(...LAMP_OFFSET[persona.id])),
    seat,
    setDim,
  };
}

/** 방 껍데기: 바닥 + 뒤벽 + 왼벽 + 걸레받이 (design.md §1) */
export function buildShell(
  floorMap: THREE.Texture,
  wallMap: THREE.Texture,
  wallDarkMap: THREE.Texture,
): THREE.Group {
  const g = new THREE.Group();
  const add = (w: number, h: number, d: number, map: THREE.Texture | null, color: string | undefined, pos: [number, number, number]) => {
    const material = map
      ? new THREE.MeshLambertMaterial({ map })
      : new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), material);
    mesh.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
    g.add(mesh);
  };
  add(80, 1, 80, floorMap, undefined, [0, -0.5, 0]);
  add(80, 44, 1, wallMap, undefined, [0, 22, -40.5]);
  add(1, 44, 80, wallDarkMap, undefined, [-40.5, 22, 0]);
  add(80, 2, 1, null, NEUTRAL.woodShade, [0, 1, -39.8]);
  add(1, 2, 80, null, NEUTRAL.woodShade, [-39.8, 1, 0]);
  return g;
}
