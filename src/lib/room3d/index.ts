import * as THREE from 'three';
import { PERSONAS, type PersonaId } from '../../config/personas';
import { buildCharacter } from '../character3d/model';
import { buildShell, buildZone, STANDS, type Zone } from './furniture';
import { floorTexture, skyTexture, wallTexture } from './textures';
import { NEUTRAL } from './furniture';

/**
 * 페르소나의 방 (design/persona-room/design.md).
 * 오픈 코너 룸 + 4구역 가구 + 걸어가는 캐릭터 + 프리셋 카메라.
 * 인터랙션은 탭 온리: 구역 탭 → onZoneTap 콜백. 오빗/드래그 없음.
 */
export interface RoomController {
  /** 캐릭터가 구역으로 걸어가고 카메라가 따라간다. instant면 즉시 컷(reduced-motion). */
  go(id: PersonaId, opts?: { instant?: boolean }): Promise<void>;
  /** 씬의 구역 탭 시 호출될 콜백 (PersonaHero의 goToPersona를 연결) */
  onZoneTap(cb: (id: PersonaId) => void): void;
  /** 전환 진행 중 여부 (연타 방지용) */
  isBusy(): boolean;
  dispose(): void;
}

interface CamPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

/** 카메라 프리셋 (design.md §6.1, world 좌표, 데스크톱 기준). 시각 참고: design/persona-room/camera-presets.svg */
const CAM_PRESETS: Record<'overview' | PersonaId, CamPose> = {
  overview: { pos: new THREE.Vector3(0.6, 5.8, 10.4), look: new THREE.Vector3(-0.2, 1.0, 0), fov: 34 },
  researcher: { pos: new THREE.Vector3(3.5, 6.3, -0.8), look: new THREE.Vector3(-1.9, 1.55, -2.0), fov: 30 },
  creator: { pos: new THREE.Vector3(2.4, 6.3, 6.2), look: new THREE.Vector3(1.7, 1.6, -2.2), fov: 30 },
  reader: { pos: new THREE.Vector3(-2.0, 6.2, 7.0), look: new THREE.Vector3(2.9, 0.9, 1.0), fov: 30 },
  musician: { pos: new THREE.Vector3(0.8, 6.3, 8.0), look: new THREE.Vector3(-1.6, 1.2, 1.0), fov: 30 },
};

/** 도착 시 캐릭터가 바라보는 방향 (design.md §5.2) */
const ARRIVAL_YAW: Record<PersonaId, number> = {
  researcher: Math.PI * 0.85, // 책상/모니터 쪽
  creator: 1.35, // 삼각대 쪽 프로필
  reader: -0.4, // 의자 방향 (앉기)
  musician: 0.3, // 살짝 카메라 쪽
};

const WALK_CAM_LAG_MS = 80;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** ±π 랩을 고려한 최단 각도 감쇠 */
function dampAngle(current: number, target: number, factor: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

/** 세로가 좁은 모바일 프레이밍: 카메라를 물리고 fov를 넓힘 (design.md §6.1) */
function presetFor(key: 'overview' | PersonaId, mobile: boolean): CamPose {
  const base = CAM_PRESETS[key];
  if (!mobile) return { pos: base.pos.clone(), look: base.look.clone(), fov: base.fov };
  const back = base.pos.clone().sub(base.look).normalize().multiplyScalar(1.0);
  return {
    pos: base.pos.clone().add(back),
    look: base.look.clone().add(new THREE.Vector3(0, 0.15, 0)),
    fov: base.fov + 4,
  };
}

export function createPersonaRoom(canvas: HTMLCanvasElement, initial: PersonaId): RoomController {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);

  // 앰비언트는 기존 캐릭터 조명 계승, 액센트는 활성 구역 포인트 1개만 (design.md §3)
  scene.add(new THREE.HemisphereLight('#FFF9F2', '#E7DCCB', 2.8));
  const sun = new THREE.DirectionalLight('#FFFFFF', 1.1);
  sun.position.set(1.5, 4, 5);
  scene.add(sun);
  const accent = new THREE.PointLight('#FFFFFF', 0, 4, 1.8);
  scene.add(accent);

  scene.add(
    buildShell(
      floorTexture(10),
      wallTexture(NEUTRAL.plaster, NEUTRAL.plasterShade, 8),
      wallTexture(NEUTRAL.plasterDark, NEUTRAL.plasterShade, 8),
      skyTexture(),
    ),
  );

  const zones = new Map<PersonaId, Zone>();
  for (const p of PERSONAS) {
    const zone = buildZone(p);
    zones.set(p.id, zone);
    scene.add(zone.group);
  }

  const character = buildCharacter(initial);
  scene.add(character.group);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileQuery = window.matchMedia('(max-width: 899px)');

  /* ---------------- 상태 ---------------- */
  let active: PersonaId = initial;
  let tapCb: ((id: PersonaId) => void) | null = null;
  let disposed = false;

  // 캐릭터 논리 위치(바닥 기준)와 방향 — bob은 렌더 시점에 더한다
  const charPos = new THREE.Vector3();
  let charY = 0;
  let charYaw = 0;

  // 현재 카메라 포즈 (프리셋 사이를 lerp)
  const camPose: CamPose = presetFor('overview', mobileQuery.matches);

  let walking: {
    from: THREE.Vector3;
    ctrl: THREE.Vector3;
    to: THREE.Vector3;
    start: number;
    dur: number;
    camFrom: CamPose;
    camTo: CamPose;
    resolve: () => void;
    phase: number;
  } | null = null;

  /** 도착 목표: 위치·방향 (독서인은 의자 좌면) */
  function arrivalTarget(id: PersonaId): { pos: THREE.Vector3; yaw: number; sit: boolean } {
    const zone = zones.get(id)!;
    if (zone.seat) return { pos: zone.seat.position.clone(), yaw: zone.seat.yaw, sit: true };
    return { pos: zone.stand.clone(), yaw: ARRIVAL_YAW[id], sit: false };
  }

  /** 구역 하이라이트 상태: 활성 구역만 밝고 라벨 숨김, 나머지는 디밍+라벨 */
  function applyZoneStates(): void {
    for (const zone of zones.values()) {
      const on = zone.id === active;
      zone.setDim(!on);
      zone.label.visible = !on;
      for (const bar of zone.pulse) bar.visible = !on;
    }
  }

  function placeInstant(id: PersonaId): void {
    active = id;
    character.setPersona(id);
    const target = arrivalTarget(id);
    charPos.set(target.pos.x, 0, target.pos.z);
    charY = target.sit ? target.pos.y - 1.2 : 0;
    charYaw = target.yaw;
    const preset = presetFor(id, mobileQuery.matches);
    camPose.pos.copy(preset.pos);
    camPose.look.copy(preset.look);
    camPose.fov = preset.fov;
    applyZoneStates();
    renderOnce();
  }

  // 초기 배치: 캐릭터는 초기 페르소나 구역, 카메라는 방 전체 뷰(establishing shot)
  {
    const target = arrivalTarget(initial);
    charPos.set(target.pos.x, 0, target.pos.z);
    charY = target.sit ? target.pos.y - 1.2 : 0;
    charYaw = target.yaw;
    applyZoneStates();
  }

  /* ---------------- 렌더 루프 ---------------- */
  let lastNow = performance.now();
  const startedAt = lastNow;
  let nextBlinkAt = lastNow + 3000 + Math.random() * 4000;
  let eyesOpenAt = 0;
  let nextFlipAt = lastNow + 4000; // 독서인 페이지 넘김
  let flipStart = 0;
  const bookPageBase = 0;
  const bezier = new THREE.Vector3();
  const bezierD = new THREE.Vector3();
  const labelPos = new THREE.Vector3();

  function tickWalk(now: number): void {
    if (!walking) return;
    const w = walking;
    const progress = Math.min((now - w.start) / w.dur, 1);
    const e = easeInOutCubic(progress);

    // 경로: 방 중앙 근처를 제어점으로 하는 quadratic bezier (design.md §5.1)
    const inv = 1 - e;
    bezier
      .copy(w.from)
      .multiplyScalar(inv * inv)
      .addScaledVector(w.ctrl, 2 * inv * e)
      .addScaledVector(w.to, e * e);
    charPos.set(bezier.x, 0, bezier.z);
    charY += (0 - charY) * 0.15; // 앉아 있었다면 일어서기

    // 진행 방향으로 몸 돌리기
    bezierD.copy(w.ctrl).sub(w.from).multiplyScalar(inv).addScaledVector(new THREE.Vector3().copy(w.to).sub(w.ctrl), e);
    if (bezierD.lengthSq() > 1e-6) {
      charYaw = dampAngle(charYaw, Math.atan2(bezierD.x, bezierD.z), 0.2);
    }

    // 다리 교차 스윙 + 걸음 bob — 시작/끝 120ms 감쇠 (design.md §5.1)
    const elapsed = now - w.start;
    const ampScale = Math.min(1, elapsed / 120, (w.dur - elapsed) / 120);
    w.phase += ((now - lastNow) / 1000) * 2.4 * Math.PI * 2;
    const swing = Math.sin(w.phase) * 0.38 * Math.max(ampScale, 0);
    const { armR, armL, legR, legL } = character.limbs;
    legR.rotation.x = swing;
    legL.rotation.x = -swing;
    armR.rotation.x = -swing * 0.6;
    armL.rotation.x = swing * 0.6;
    legR.rotation.z = 0;
    legL.rotation.z = 0;
    character.group.position.y = charY + Math.abs(Math.sin(w.phase)) * 0.04 * Math.max(ampScale, 0);

    // 카메라: 80ms 늦게 따라오는 팬 (design.md §6.1)
    const camProgress = easeInOutCubic(
      Math.min(Math.max((now - w.start - WALK_CAM_LAG_MS) / w.dur, 0), 1),
    );
    camPose.pos.lerpVectors(w.camFrom.pos, w.camTo.pos, camProgress);
    camPose.look.lerpVectors(w.camFrom.look, w.camTo.look, camProgress);
    camPose.fov = w.camFrom.fov + (w.camTo.fov - w.camFrom.fov) * camProgress;

    if (progress >= 1) {
      charPos.set(w.to.x, 0, w.to.z);
      w.resolve();
      walking = null;
    }
  }

  function tickIdle(now: number, t: number): void {
    const target = arrivalTarget(active);
    // 도착 포즈로 감쇠 블렌드 (걷기 종료 후 200ms급, design.md §5.2)
    charPos.x += (target.pos.x - charPos.x) * 0.1;
    charPos.z += (target.pos.z - charPos.z) * 0.1;
    charY += ((target.sit ? target.pos.y - 1.2 : 0) - charY) * 0.1;
    charYaw = dampAngle(charYaw, target.yaw, 0.1);

    // 공통 idle: 부유·호흡·머리 갸웃·깜빡임 (기존 캐릭터 §7 계승)
    const bob = target.sit ? 0 : Math.sin(t * 1.2) * 0.03;
    character.group.position.y = charY + bob;
    character.torso.scale.y = 1 + Math.sin(t * 0.8) * 0.008;
    character.head.rotation.z = Math.sin(t * 0.5) * THREE.MathUtils.degToRad(1.5);
    character.head.rotation.y = Math.sin(t * 0.35) * THREE.MathUtils.degToRad(3);

    if (eyesOpenAt && now >= eyesOpenAt) {
      character.setEyesClosed(false);
      eyesOpenAt = 0;
    } else if (!eyesOpenAt && now >= nextBlinkAt) {
      character.setEyesClosed(true);
      eyesOpenAt = now + 120;
      nextBlinkAt = now + 4000 + Math.random() * 3000;
    }

    // 구역별 도착 idle (design.md §5.2)
    const { armR, armL, legR, legL } = character.limbs;
    const damp = 0.12;
    let armRx = 0;
    let armLx = 0;
    let armSpread = 0;
    let legSpread = 0;
    let kneeFold = 0;
    let headBang = 0;

    if (active === 'researcher') {
      // 책상 앞 타이핑: 양팔 앞으로 + 손끝 미세 교차 상하
      armRx = -0.5 + Math.sin(t * 9) * 0.07;
      armLx = -0.5 - Math.sin(t * 9) * 0.07;
    } else if (active === 'creator') {
      // 삼각대 카메라 조준: 양팔 들어 받치고 상체 살짝 앞
      armRx = -0.95;
      armLx = -1.15;
    } else if (active === 'reader') {
      // 안락의자에 앉아 책 읽기: 무릎을 앞으로 접고 양손에 책
      // (이 리그는 rotation.x 음수가 앞쪽 — 양수면 다리가 등받이 뒤로 숨는다)
      kneeFold = -1.3;
      armRx = -0.62;
      armLx = -0.62;
      if (now >= nextFlipAt) {
        flipStart = now;
        nextFlipAt = now + 4500 + Math.random() * 3000;
      }
    } else {
      // 밴드인: 스타 점프 + 헤드뱅잉 (기존 idle 계승)
      const wave = (Math.sin(t * 3.25) + 1) / 2;
      armSpread = 0.05 + wave * 0.3;
      legSpread = 0.05 + wave * 0.22;
      headBang = 0.1 + Math.sin(t * 6.5) * 0.18;
    }

    character.head.rotation.x += (headBang - character.head.rotation.x) * 0.15;
    armR.rotation.x += (armRx - armR.rotation.x) * damp;
    armL.rotation.x += (armLx - armL.rotation.x) * damp;
    armR.rotation.z += (-armSpread - armR.rotation.z) * damp;
    armL.rotation.z += (armSpread - armL.rotation.z) * damp;
    legR.rotation.x += (kneeFold - legR.rotation.x) * damp;
    legL.rotation.x += (kneeFold - legL.rotation.x) * damp;
    legR.rotation.z += (-legSpread - legR.rotation.z) * damp;
    legL.rotation.z += (legSpread - legL.rotation.z) * damp;

    // 독서인 페이지 넘김 (기존 제스처 재사용)
    const flipT = flipStart ? (now - flipStart) / 900 : 2;
    const flip = flipT < 1 ? Math.sin(Math.PI * flipT) : 0;
    if (flipT >= 1) flipStart = 0;
    character.motion.bookPage.rotation.y +=
      (bookPageBase - flip * 2.2 - character.motion.bookPage.rotation.y) * 0.25;
  }

  /**
   * 비활성 구역 러그 펄스(0.5~1.0, 3s 주기 / reduced-motion은 정적)와
   * 라벨 거리 페이드 — 카메라와 가까운 라벨은 숨겨 클로즈업 전경을 가리지 않게.
   * tick과 renderOnce 양쪽에서 호출된다(rAF 정지 상태에서도 정확한 프레임).
   */
  function updateAffordances(t: number): void {
    for (const zone of zones.values()) {
      if (zone.id === active) continue;
      const material = zone.pulse[0].material as THREE.MeshLambertMaterial;
      material.opacity = reduceMotion
        ? 0.8
        : 0.75 + 0.25 * Math.sin((t * Math.PI * 2) / 3 + zone.stand.x + zone.stand.z);
      const labelDist = zone.label.getWorldPosition(labelPos).distanceTo(camPose.pos);
      (zone.label.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(
        (labelDist - 7) / 1.2,
        0,
        1,
      );
    }
  }

  function tick(now: number): void {
    rafActive = false;
    if (disposed || !running()) return;
    const t = (now - startedAt) / 1000;

    if (walking) tickWalk(now);
    else tickIdle(now, t);

    character.group.position.x = charPos.x;
    character.group.position.z = charPos.z;
    if (walking) {
      // 걷는 동안 y는 tickWalk가 bob 포함으로 이미 설정
    }
    character.group.rotation.y = charYaw;

    updateAffordances(t);

    // 액센트 라이트: 활성 구역 램프로 이동 + 색 크로스페이드 (design.md §3)
    const zone = zones.get(active)!;
    accent.position.lerp(zone.lampPos, 0.08);
    accent.color.lerp(new THREE.Color(PERSONAS.find((p) => p.id === active)!.color.main), 0.08);
    accent.intensity += (4 - accent.intensity) * 0.08;

    camera.position.copy(camPose.pos);
    camera.fov = camPose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(camPose.look);

    renderer.render(scene, camera);
    lastNow = now;
    scheduleTick();
  }

  /* ---------------- rAF 게이팅 (design.md §10) ---------------- */
  let rafActive = false;
  let inViewport = true;
  let pageVisible = !document.hidden;
  const running = () => inViewport && pageVisible;

  function scheduleTick(): void {
    if (!rafActive && !disposed && running()) {
      rafActive = true;
      requestAnimationFrame(tick);
    }
  }

  const observer = new IntersectionObserver((entries) => {
    inViewport = entries[0]?.isIntersecting ?? true;
    lastNow = performance.now();
    scheduleTick();
  });
  observer.observe(canvas);

  function onVisibility(): void {
    pageVisible = !document.hidden;
    lastNow = performance.now();
    scheduleTick();
  }
  document.addEventListener('visibilitychange', onVisibility);

  /* ---------------- 리사이즈 ---------------- */
  function resize(): void {
    const w = canvas.clientWidth || 460;
    const h = canvas.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!walking) {
      // 데스크톱↔모바일 프리셋 전환 반영 (초기 진입은 overview 유지)
      const key = hasNavigated ? active : 'overview';
      const preset = presetFor(key, mobileQuery.matches);
      camPose.pos.copy(preset.pos);
      camPose.look.copy(preset.look);
      camPose.fov = preset.fov;
    }
    renderOnce();
  }
  let hasNavigated = false;
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  /* ---------------- 탭 인터랙션 (design.md §7) ---------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const proxies = [...zones.values()].map((zone) => zone.proxy);
  let downAt = 0;
  let downX = 0;
  let downY = 0;

  function zoneAt(clientX: number, clientY: number): PersonaId | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    return hit ? ((hit.object.userData.personaId as PersonaId) ?? null) : null;
  }

  function onPointerDown(e: PointerEvent): void {
    downAt = performance.now();
    downX = e.clientX;
    downY = e.clientY;
  }
  // 탭 판정: 이동 < 10px && < 400ms — 스크롤/롱프레스와 충돌 방지
  function onPointerUp(e: PointerEvent): void {
    if (!tapCb || walking) return;
    if (performance.now() - downAt > 400) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return;
    const id = zoneAt(e.clientX, e.clientY);
    if (id && id !== active) tapCb(id);
  }
  function onPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const id = zoneAt(e.clientX, e.clientY);
    canvas.style.cursor = id && id !== active ? 'pointer' : 'default';
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);

  /* ---------------- 공개 API ---------------- */
  function go(id: PersonaId, opts: { instant?: boolean } = {}): Promise<void> {
    if (disposed || id === active) return Promise.resolve();
    if (walking) return Promise.resolve();
    hasNavigated = true;

    if (opts.instant || reduceMotion) {
      placeInstant(id);
      return Promise.resolve();
    }

    const fromStand = STANDS[active];
    const toStand = STANDS[id];
    const diagonal = fromStand.x !== toStand.x && fromStand.z !== toStand.z;
    const dur = diagonal ? 1200 : 900;

    const from = new THREE.Vector3(charPos.x, 0, charPos.z);
    const to = arrivalTarget(id).pos.clone().setY(0);
    // 제어점: 두 점 중간을 방 중앙(O) 쪽으로 당김 → 가구를 피해 중앙 경유
    const ctrl = from.clone().add(to).multiplyScalar(0.5).multiplyScalar(0.4);

    active = id;
    character.setPersona(id); // 새 페르소나로 변신한 뒤 걸어간다
    applyZoneStates();

    const camFrom: CamPose = { pos: camPose.pos.clone(), look: camPose.look.clone(), fov: camPose.fov };
    const camTo = presetFor(id, mobileQuery.matches);

    return new Promise((resolve) => {
      const state = {
        from,
        ctrl,
        to,
        start: performance.now(),
        dur,
        camFrom,
        camTo,
        resolve,
        phase: 0,
      };
      walking = state;
      scheduleTick();
      // 백그라운드 탭 등으로 rAF가 멈춰도 락이 영원히 잠기지 않게 강제 완료
      setTimeout(() => {
        if (walking !== state) return;
        walking = null;
        placeInstant(id);
        resolve();
      }, dur + 300);
    });
  }

  /** rAF 없이 현재 상태를 1프레임 그린다 (백그라운드 탭·초기 진입 대비) */
  function renderOnce(): void {
    character.group.position.set(charPos.x, charY, charPos.z);
    character.group.rotation.y = charYaw;
    updateAffordances((performance.now() - startedAt) / 1000);
    camera.position.copy(camPose.pos);
    camera.fov = camPose.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(camPose.look);
    renderer.render(scene, camera);
  }

  renderOnce();
  scheduleTick();

  return {
    go,
    onZoneTap(cb: (id: PersonaId) => void): void {
      tapCb = cb;
    },
    isBusy(): boolean {
      return walking !== null;
    },
    dispose(): void {
      disposed = true;
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      character.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
          (obj as THREE.Mesh).geometry?.dispose?.();
          const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[];
          for (const m of Array.isArray(material) ? material : [material]) m?.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
