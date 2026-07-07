import * as THREE from 'three';
import type { PersonaId } from '../../config/personas';
import { UV, paintSkin, paintEyes, type FaceRects, type Skin } from './skin';

/**
 * Minecraft 비율 캐릭터 모델 (design.md §1, §2, §5 소품).
 * 1u(Minecraft 픽셀) = 0.1 world unit. 발밑 y=0, 머리 꼭대기 y=2.8.
 */

const U = 0.1;

/** BoxGeometry 6면(+x,-x,+y,-y,+z,-z)의 UV를 64×64 아틀라스 좌표로 매핑 */
function setBoxUV(geometry: THREE.BoxGeometry, faces: FaceRects): void {
  const order = [faces.right, faces.left, faces.top, faces.bottom, faces.front, faces.back];
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  order.forEach(([x, y, w, h], face) => {
    const u0 = x / 64;
    const u1 = (x + w) / 64;
    const v0 = 1 - (y + h) / 64;
    const v1 = 1 - y / 64;
    const i = face * 4;
    uv.setXY(i, u0, v1);
    uv.setXY(i + 1, u1, v1);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u1, v0);
  });
  uv.needsUpdate = true;
}

function skinnedPart(
  faces: FaceRects,
  w: number,
  h: number,
  d: number,
  pos: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w * U, h * U, d * U);
  setBoxUV(geometry, faces);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
  return mesh;
}

/** 소품용 단색 박스 (복셀) */
function voxel(
  w: number,
  h: number,
  d: number,
  color: string,
  pos: [number, number, number],
  opts: { opacity?: number } = {},
): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color });
  if (opts.opacity !== undefined) {
    material.transparent = true;
    material.opacity = opts.opacity;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), material);
  mesh.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
  return mesh;
}

/* ------------------------------------------------------------------ */
/* 페르소나 소품 (design.md §5) — 전부 작은 박스 조합                   */
/* ------------------------------------------------------------------ */

function buildGlassesAndNote(): THREE.Group {
  const g = new THREE.Group();
  const ink = '#2C2C2A';
  // 둥근 안경: 속이 빈 프레임(막대 4개) + 반투명 유리 — 텍스처의 눈이 그대로 비쳐 보인다
  // (눈 중심 y≈27, x=±2, 얼굴 z=+4)
  for (const x of [-2, 2]) {
    g.add(voxel(4.4, 0.7, 0.6, ink, [x, 29, 4.1]));
    g.add(voxel(4.4, 0.7, 0.6, ink, [x, 25, 4.1]));
    g.add(voxel(0.7, 4.5, 0.6, ink, [x - 1.9, 27, 4.1]));
    g.add(voxel(0.7, 4.5, 0.6, ink, [x + 1.9, 27, 4.1]));
    g.add(voxel(3, 3.6, 0.4, '#EAF0FF', [x, 27, 4.1], { opacity: 0.25 }));
  }
  g.add(voxel(1.6, 0.7, 0.6, ink, [0, 27, 4.1]));
  // 픽셀 노트: 오른손 옆
  const note = new THREE.Group();
  note.add(voxel(3, 4, 1, '#FFFFFF', [0, 0, 0]));
  note.add(voxel(3.05, 1, 1.05, '#7F77DD', [0, 1.6, 0]));
  note.position.set(-6.5 * U, 13 * U, 3 * U);
  note.rotation.y = 0.25;
  g.add(note);
  return g;
}

function buildCamera(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(voxel(6, 4, 3, '#2C2C2A', [0, 0, 0]));
  body.add(voxel(3, 3, 1.4, '#5F5E5A', [0, 0, 1.6]));
  body.add(voxel(1.2, 1.2, 1.6, '#2C2C2A', [0, 0, 1.7]));
  body.add(voxel(1, 0.6, 1, '#3A3A38', [2, 2.2, 0]));
  body.add(voxel(0.7, 0.7, 0.4, '#F09595', [2.2, 0.8, 1.6]));
  body.position.set(0, 17.5 * U, 3 * U);
  g.add(body);
  // 넥 스트랩 (차콜 V자)
  for (const side of [-1, 1]) {
    const strap = voxel(0.9, 6.4, 0.6, '#3A3A38', [side * 1.9, 21.4, 2.2]);
    strap.rotation.z = side * -0.42;
    g.add(strap);
  }
  return g;
}

function buildBook(): THREE.Group {
  const g = new THREE.Group();
  const left = voxel(4, 5, 0.8, '#FFFFFF', [0, 0, 0]);
  left.position.set(-1.9 * U, 0, 0);
  left.rotation.y = 0.21;
  const right = voxel(4, 5, 0.8, '#F1EFE8', [0, 0, 0]);
  right.position.set(1.9 * U, 0, 0);
  right.rotation.y = -0.21;
  const spine = voxel(0.5, 5, 0.9, '#B4B2A9', [0, 0, 0]);
  g.add(left, right, spine);
  g.position.set(0, 15 * U, 3.6 * U);
  return g;
}

function buildGuitar(): THREE.Group {
  const g = new THREE.Group();
  // 바디 + 픽가드 + 사운드 요소
  const body = new THREE.Group();
  body.add(voxel(6, 8, 2, '#8B2E4E', [0, 0, 0]));
  body.add(voxel(3, 3, 0.6, '#F0E0E8', [0.6, -0.6, 1.2]));
  body.add(voxel(2, 1, 0.7, '#2C2C2A', [-0.6, 1.8, 1.2]));
  body.position.set(3.4 * U, 12.5 * U, 3.2 * U);
  body.rotation.z = 0.3;
  g.add(body);
  // 넥 + 헤드 + 프렛
  const neck = new THREE.Group();
  neck.add(voxel(1.8, 9, 1.4, '#5C3A21', [0, 0, 0]));
  for (let i = -1; i <= 1; i++) {
    neck.add(voxel(1.9, 0.4, 1.5, '#E8D9B0', [0, i * 2.4, 0]));
  }
  neck.add(voxel(2.4, 2, 1.5, '#3B2314', [0, 5.4, 0]));
  neck.position.set(-0.6 * U, 17.5 * U, 3.2 * U);
  neck.rotation.z = 0.62;
  g.add(neck);
  // 어깨 스트랩 (핑크, 가슴 사선)
  const strap = voxel(1, 13, 0.6, '#D4537E', [0.6, 19, 2.2]);
  strap.rotation.z = 0.55;
  g.add(strap);
  return g;
}

/* ------------------------------------------------------------------ */
/* 캐릭터 조립                                                          */
/* ------------------------------------------------------------------ */

export interface CharacterModel {
  /** 회전시킬 루트 그룹 (발밑 y=0 기준) */
  group: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  setPersona(id: PersonaId): void;
  setEyesClosed(closed: boolean): void;
  dispose(): void;
}

export function buildCharacter(initial: PersonaId): CharacterModel {
  const personas: PersonaId[] = ['researcher', 'creator', 'reader', 'musician'];

  // 스킨 4벌을 미리 그려 텍스처로 준비
  const skins = new Map<PersonaId, Skin>();
  const textures = new Map<PersonaId, THREE.CanvasTexture>();
  for (const id of personas) {
    const skin = paintSkin(id);
    const texture = new THREE.CanvasTexture(skin.canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    skins.set(id, skin);
    textures.set(id, texture);
  }

  const bodyMaterial = new THREE.MeshLambertMaterial({ map: textures.get(initial)! });
  const hairMaterial = new THREE.MeshLambertMaterial({
    map: textures.get(initial)!,
    transparent: true,
    alphaTest: 0.5,
  });

  const group = new THREE.Group();

  // 파츠 배치는 겹침 없이: 다리 0~12u, 몸통 12~24u, 머리 24~32u
  // (박스가 겹치면 같은 평면의 면끼리 z-fighting으로 깜빡인다)

  // 머리는 갸웃 애니메이션을 위해 서브그룹 (피벗 = 목, y=24u)
  const head = new THREE.Group();
  head.position.y = 24 * U;
  head.add(skinnedPart(UV.head, 8, 8, 8, [0, 4, 0], bodyMaterial));
  const hair = skinnedPart(UV.hat, 8.6, 8.6, 8.6, [0, 4, 0], hairMaterial);
  head.add(hair);
  group.add(head);

  // 호흡 애니메이션 대상 (몸통+팔)
  const torso = new THREE.Group();
  torso.add(skinnedPart(UV.body, 8, 12, 4, [0, 18, 0], bodyMaterial));
  torso.add(skinnedPart(UV.armR, 4, 12, 4, [-6, 18, 0], bodyMaterial));
  torso.add(skinnedPart(UV.armL, 4, 12, 4, [6, 18, 0], bodyMaterial));
  group.add(torso);

  group.add(skinnedPart(UV.legR, 4, 12, 4, [-2, 6, 0], bodyMaterial));
  group.add(skinnedPart(UV.legL, 4, 12, 4, [2, 6, 0], bodyMaterial));

  // 소품: 페르소나별 그룹을 미리 만들어 visible 토글
  const accessories: Record<PersonaId, THREE.Group> = {
    researcher: buildGlassesAndNote(),
    creator: buildCamera(),
    reader: buildBook(),
    musician: buildGuitar(),
  };
  for (const id of personas) {
    accessories[id].visible = id === initial;
    if (id === 'researcher') head.add(accessories[id]);
    else group.add(accessories[id]);
  }
  // 안경은 머리를 따라가야 하므로 head 그룹 좌표계로 보정
  accessories.researcher.position.y = -24 * U;

  let current = initial;

  function setPersona(id: PersonaId): void {
    current = id;
    const texture = textures.get(id)!;
    bodyMaterial.map = texture;
    hairMaterial.map = texture;
    bodyMaterial.needsUpdate = true;
    hairMaterial.needsUpdate = true;
    for (const pid of personas) accessories[pid].visible = pid === id;
  }

  function setEyesClosed(closed: boolean): void {
    const skin = skins.get(current)!;
    paintEyes(skin.ctx, closed);
    textures.get(current)!.needsUpdate = true;
  }

  function dispose(): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    textures.forEach((t) => t.dispose());
  }

  return { group, head, torso, setPersona, setEyesClosed, dispose };
}
