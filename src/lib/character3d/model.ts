import * as THREE from 'three';
import type { PersonaId } from '../../config/personas';
import { SHARED, UV, paintSkin, paintEyes, type FaceRects, type Skin } from './skin';

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

/** 위가 원점인 머리카락 가닥: 본체 + 아래 2u는 진한 핑크 팁 */
function hairStrand(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  g.add(voxel(w, h - 2, d, SHARED.hair, [0, -(h - 2) / 2, 0]));
  g.add(voxel(w, 2, d, SHARED.hairTip, [0, -(h - 1), 0]));
  return g;
}

/**
 * 긴 머리 (전 페르소나 공유): 얼굴 양옆으로 가슴까지 내려오는 앞가닥 +
 * 뒷머리 패널. head 그룹에 붙어 머리 갸웃을 따라 흔들린다.
 * 좌표는 head 그룹 기준 (목=0, 머리 박스 0~8u).
 */
function buildLongHair(): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const strand = hairStrand(2.2, 12, 2.6);
    strand.position.set(side * 4.0 * U, 1 * U, 2.2 * U);
    g.add(strand);
  }
  const back = hairStrand(7.5, 11, 1.8);
  back.position.set(0, 1 * U, -3.4 * U);
  g.add(back);
  return g;
}

/* ------------------------------------------------------------------ */
/* 페르소나 소품 (design.md §5) — 전부 작은 박스 조합                   */
/* ------------------------------------------------------------------ */

function buildGlassesAndNote(): { group: THREE.Group; glasses: THREE.Group } {
  const g = new THREE.Group();
  const ink = '#2C2C2A';
  // 안경: 속이 빈 프레임(막대 4개) + 반투명 유리 — 텍스처의 눈이 그대로 비쳐 보인다
  // 렌즈 창은 눈(3×2u)에 딱 맞게 작게, 렌즈 사이 간격은 0.9u (얼굴 z=+4)
  // "고쳐쓰기" 모션에서 통째로 들썩일 수 있도록 서브그룹으로 분리
  const glasses = new THREE.Group();
  for (const x of [-2.25, 2.25]) {
    glasses.add(voxel(3.6, 0.6, 0.6, ink, [x, 28.4, 4.1]));
    glasses.add(voxel(3.6, 0.6, 0.6, ink, [x, 25.6, 4.1]));
    glasses.add(voxel(0.6, 3.4, 0.6, ink, [x - 1.5, 27, 4.1]));
    glasses.add(voxel(0.6, 3.4, 0.6, ink, [x + 1.5, 27, 4.1]));
    glasses.add(voxel(2.4, 2.2, 0.4, '#EAF0FF', [x, 27, 4.1], { opacity: 0.25 }));
  }
  glasses.add(voxel(1.0, 0.6, 0.6, ink, [0, 27.4, 4.1]));
  g.add(glasses);
  // 픽셀 노트: 오른손 옆
  const note = new THREE.Group();
  note.add(voxel(3, 4, 1, '#FFFFFF', [0, 0, 0]));
  note.add(voxel(3.05, 1, 1.05, '#7F77DD', [0, 1.6, 0]));
  note.position.set(-6.5 * U, 13 * U, 3 * U);
  note.rotation.y = 0.25;
  g.add(note);
  return { group: g, glasses };
}

function buildCamera(): { group: THREE.Group; rig: THREE.Group } {
  const g = new THREE.Group();
  // 촬영 포즈 때 눈높이로 들어올리는 부분 (스트랩은 목에 남는다)
  const rig = new THREE.Group();
  rig.add(voxel(6, 4, 3, '#2C2C2A', [0, 0, 0]));
  rig.add(voxel(3, 3, 1.4, '#5F5E5A', [0, 0, 1.6]));
  rig.add(voxel(1.2, 1.2, 1.6, '#2C2C2A', [0, 0, 1.7]));
  rig.add(voxel(1, 0.6, 1, '#3A3A38', [2, 2.2, 0]));
  rig.add(voxel(0.7, 0.7, 0.4, '#F09595', [2.2, 0.8, 1.6]));
  rig.position.set(0, 17.5 * U, 3 * U);
  g.add(rig);
  // 넥 스트랩 (차콜 V자)
  for (const side of [-1, 1]) {
    const strap = voxel(0.9, 6.4, 0.6, '#3A3A38', [side * 1.9, 21.4, 2.2]);
    strap.rotation.z = side * -0.42;
    g.add(strap);
  }
  return { group: g, rig };
}

function buildBook(): { group: THREE.Group; pageR: THREE.Group } {
  const g = new THREE.Group();
  const left = voxel(4, 5, 0.8, '#FFFFFF', [0, 0, 0]);
  left.position.set(-1.9 * U, 0, 0);
  left.rotation.y = 0.21;
  // 오른쪽 페이지는 제본선(x=0)을 축으로 넘길 수 있게 피벗으로 감싼다
  const pageR = new THREE.Group();
  const right = voxel(4, 5, 0.8, '#F1EFE8', [0, 0, 0]);
  right.position.set(1.9 * U, 0, 0);
  right.rotation.y = -0.21;
  pageR.add(right);
  const spine = voxel(0.5, 5, 0.9, '#B4B2A9', [0, 0, 0]);
  g.add(left, pageR, spine);
  g.position.set(0, 15 * U, 3.6 * U);
  return { group: g, pageR };
}

function buildPiano(): THREE.Group {
  const g = new THREE.Group();
  // 숄더 키보드(피아노): 본체 + 흰건반 슬래브 + 검은건반 + 핑크 액센트
  const keyboard = new THREE.Group();
  keyboard.add(voxel(10, 1.4, 3.4, '#2C2C2A', [0, 0, 0]));
  keyboard.add(voxel(9.2, 0.5, 2.1, '#F6F4EE', [0, 0.8, 0.5]));
  for (const kx of [-3.4, -2.5, -1.0, -0.1, 1.7, 2.6, 3.5]) {
    keyboard.add(voxel(0.55, 0.55, 1.0, '#2C2C2A', [kx, 0.95, 0.1]));
  }
  keyboard.add(voxel(1.0, 0.5, 1.0, '#D4537E', [-4.2, 0.8, -0.9]));
  keyboard.position.set(0, 13 * U, 3.4 * U);
  g.add(keyboard);
  // 어깨 스트랩 (핑크, 가슴 사선)
  const strap = voxel(1, 12, 0.6, '#D4537E', [0.6, 18.5, 2.2]);
  strap.rotation.z = 0.5;
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
  /** 관절 피벗 (어깨/골반 기준) — 페르소나별 모션용 */
  limbs: { armR: THREE.Group; armL: THREE.Group; legR: THREE.Group; legL: THREE.Group };
  /** 제스처 대상 소품: 안경(들썩), 카메라(들어올림), 오른쪽 책 페이지(넘김) */
  motion: { glasses: THREE.Group; camera: THREE.Group; bookPage: THREE.Group };
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
  head.add(buildLongHair());
  group.add(head);

  // 팔/다리는 관절(어깨 y=23, 골반 y=12) 피벗 그룹으로 감싸 벌리기 모션이 가능하게
  function limb(faces: FaceRects, jointX: number, jointY: number, meshOffsetY: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(jointX * U, jointY * U, 0);
    pivot.add(skinnedPart(faces, 4, 12, 4, [0, meshOffsetY, 0], bodyMaterial));
    return pivot;
  }
  const limbs = {
    armR: limb(UV.armR, -6, 23, -5),
    armL: limb(UV.armL, 6, 23, -5),
    legR: limb(UV.legR, -2, 12, -6),
    legL: limb(UV.legL, 2, 12, -6),
  };

  // 호흡 애니메이션 대상 (몸통+팔)
  const torso = new THREE.Group();
  torso.add(skinnedPart(UV.body, 8, 12, 4, [0, 18, 0], bodyMaterial));
  torso.add(limbs.armR, limbs.armL);
  group.add(torso);

  group.add(limbs.legR, limbs.legL);

  // 소품: 페르소나별 그룹을 미리 만들어 visible 토글
  const glassesNote = buildGlassesAndNote();
  const cameraAcc = buildCamera();
  const bookAcc = buildBook();
  const accessories: Record<PersonaId, THREE.Group> = {
    researcher: glassesNote.group,
    creator: cameraAcc.group,
    reader: bookAcc.group,
    musician: buildPiano(),
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

  const motion = { glasses: glassesNote.glasses, camera: cameraAcc.rig, bookPage: bookAcc.pageR };

  return { group, head, torso, limbs, motion, setPersona, setEyesClosed, dispose };
}
