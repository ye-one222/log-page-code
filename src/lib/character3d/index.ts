import * as THREE from 'three';
import type { PersonaId } from '../../config/personas';
import { buildCharacter } from './model';

/**
 * 페르소나 3D 캐릭터의 공개 API.
 * PersonaHero는 이 인터페이스만 알고, 렌더링/애니메이션 세부는 여기 캡슐화된다.
 * (design.md §6 회전-변신, §7 idle 애니메이션)
 */
export interface CharacterController {
  /** 회전 없이 즉시 스킨 교체 (reduced-motion 등) */
  setPersona(id: PersonaId): void;
  /**
   * 300ms 관통 회전: 0→90° 회전, 가장 얇은 순간 스킨 스왑(onSwap 호출),
   * 반대편(-90°)에서 0°로 복귀. 진행 중 재호출은 무시된다.
   */
  spin(next: PersonaId, onSwap: () => void): Promise<void>;
  dispose(): void;
}

const SPIN_MS = 300;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createPersonaCharacter(
  canvas: HTMLCanvasElement,
  initial: PersonaId,
): CharacterController {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 230, canvas.clientHeight || 230, false);

  const scene = new THREE.Scene();

  // 카메라: 정면 고정, 살짝 위에서 내려다봄 (design.md §1)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.4, 7.9);
  camera.lookAt(0, 1.55, 0);

  // three r155+ 물리 조명 단위: 구형 값(0.9/0.35)에 π를 곱해 보정
  scene.add(new THREE.HemisphereLight('#FFF9F2', '#E7DCCB', 2.8));
  const sun = new THREE.DirectionalLight('#FFFFFF', 1.1);
  sun.position.set(1.5, 4, 5);
  scene.add(sun);

  const character = buildCharacter(initial);
  scene.add(character.group);

  // 페르소나별 모션 분기용 현재 상태 (스킨 스왑과 항상 함께 갱신할 것)
  let currentId: PersonaId = initial;
  function applyPersona(id: PersonaId): void {
    character.setPersona(id);
    currentId = id;
  }

  /* ---------------- 회전-변신 상태 ---------------- */
  let spinning: {
    start: number;
    next: PersonaId;
    onSwap: () => void;
    swapped: boolean;
    resolve: () => void;
  } | null = null;

  /* ---------------- 깜빡임 상태 ---------------- */
  let nextBlinkAt = performance.now() + 3000 + Math.random() * 4000;
  let eyesOpenAt = 0;

  /* ---------------- 제스처(이벤트성 모션) 상태 ----------------
   * 몇 초에 한 번, 페르소나 고유 동작을 한 번 수행한다.
   * 연구원: 안경 고쳐쓰기 / 크리에이터: 촬영 포즈 / 독서인: 책장 넘기기
   * (밴드인은 연속 스타 점프라 제스처 없음) */
  const GESTURE_MS: Partial<Record<PersonaId, number>> = {
    researcher: 1300,
    creator: 1900,
    reader: 900,
  };
  let gestureStart = 0;
  let gestureUntil = 0;
  let nextGestureAt = performance.now() + 2500;

  const glassesY0 = character.motion.glasses.position.y;
  const cameraY0 = character.motion.camera.position.y;

  const startedAt = performance.now();
  let disposed = false;

  function animate(): void {
    if (disposed) return;
    requestAnimationFrame(animate);
    const now = performance.now();
    const t = (now - startedAt) / 1000;

    if (spinning) {
      // 관통 회전: 전반부 0→+90°, 스왑, 후반부 -90°→0
      const progress = Math.min((now - spinning.start) / SPIN_MS, 1);
      const eased = easeInOutCubic(progress);
      if (eased < 0.5) {
        character.group.rotation.y = eased * Math.PI;
      } else {
        if (!spinning.swapped) {
          spinning.swapped = true;
          applyPersona(spinning.next);
          spinning.onSwap();
        }
        character.group.rotation.y = -Math.PI + eased * Math.PI;
      }
      if (progress >= 1) {
        character.group.rotation.y = 0;
        spinning.resolve();
        spinning = null;
      }
    } else {
      // idle: 부유 · 호흡 · 머리 갸웃 · 깜빡임 (design.md §7)
      character.group.position.y = Math.sin(t * 1.2) * 0.035;
      character.torso.scale.y = 1 + Math.sin(t * 0.8) * 0.008;
      character.head.rotation.z = Math.sin(t * 0.5) * THREE.MathUtils.degToRad(1.5);
      character.head.rotation.y = Math.sin(t * 0.35) * THREE.MathUtils.degToRad(3);
      // 밴드인: 헤드뱅잉 — 스타 점프의 2배 박자로 고개를 앞으로 까딱 (머리카락도 같이 흔들림)
      const headBang = currentId === 'musician' ? 0.1 + Math.sin(t * 6.5) * 0.18 : 0;
      character.head.rotation.x += (headBang - character.head.rotation.x) * 0.15;

      if (eyesOpenAt && now >= eyesOpenAt) {
        character.setEyesClosed(false);
        eyesOpenAt = 0;
      } else if (!eyesOpenAt && now >= nextBlinkAt) {
        character.setEyesClosed(true);
        eyesOpenAt = now + 120;
        nextBlinkAt = now + 4000 + Math.random() * 3000;
      }

      // ---- 제스처 스케줄링 (이벤트성 모션 진행도 gp: 0→1, 없으면 -1) ----
      const gestureMs = GESTURE_MS[currentId];
      if (!gestureUntil && gestureMs && now >= nextGestureAt) {
        gestureStart = now;
        gestureUntil = now + gestureMs;
      }
      let gp = -1;
      if (gestureUntil) {
        gp = (now - gestureStart) / (gestureUntil - gestureStart);
        if (gp >= 1 || !gestureMs) {
          gp = -1;
          gestureUntil = 0;
          nextGestureAt = now + 3500 + Math.random() * 2500;
        }
      }
      const active = (id: PersonaId) => currentId === id && gp >= 0;
      // 봉우리형(올렸다 내림) / 정점 유지형(올림-유지-내림) 엔벨로프
      const pulse = gp >= 0 ? Math.sin(Math.PI * gp) : 0;
      const hold = gp < 0 ? 0 : gp < 0.3 ? gp / 0.3 : gp > 0.7 ? (1 - gp) / 0.3 : 1;

      // ---- 팔다리 목표 각도 ----
      // 밴드인: 스타 점프 (팔 최대 약 20°, 주파수 3.25)
      const wave = (Math.sin(t * 3.25) + 1) / 2;
      const armSpread = currentId === 'musician' ? 0.05 + wave * 0.3 : 0;
      const legSpread = currentId === 'musician' ? 0.05 + wave * 0.22 : 0;
      // 크리에이터: 촬영 포즈 — 양팔을 앞으로 들어 카메라를 받침
      const bothArmsLift = active('creator') ? hold * 1.15 : 0;
      // 연구원: 안경 고쳐쓰기 — 왼팔만 얼굴 쪽으로
      const leftArmLift = active('researcher') ? pulse * 1.25 : bothArmsLift;

      const damp = 0.12;
      const { armR, armL, legR, legL } = character.limbs;
      armR.rotation.z += (-armSpread - armR.rotation.z) * damp;
      armL.rotation.z += (armSpread - armL.rotation.z) * damp;
      legR.rotation.z += (-legSpread - legR.rotation.z) * damp;
      legL.rotation.z += (legSpread - legL.rotation.z) * damp;
      // 매달린 팔은 rotation.x가 음수일 때 앞(+z)으로 올라간다
      armR.rotation.x += (-bothArmsLift - armR.rotation.x) * damp;
      armL.rotation.x += (-leftArmLift - armL.rotation.x) * damp;

      // ---- 소품 모션 ----
      const { glasses, camera: cameraRig, bookPage } = character.motion;
      // 안경 들썩 (최대 0.5u)
      const glassesTarget = glassesY0 + (active('researcher') ? pulse * 0.5 * 0.1 : 0);
      glasses.position.y += (glassesTarget - glasses.position.y) * damp;
      // 카메라를 눈높이(+6u)로 들어올려 "찰칵"
      const cameraTarget = cameraY0 + (active('creator') ? hold * 6 * 0.1 : 0);
      cameraRig.position.y += (cameraTarget - cameraRig.position.y) * damp;
      // 오른쪽 페이지를 제본선 축으로 넘겼다 되돌림
      const pageTarget = active('reader') ? -pulse * 2.2 : 0;
      bookPage.rotation.y += (pageTarget - bookPage.rotation.y) * 0.25;
    }

    renderer.render(scene, camera);
  }
  animate();

  return {
    setPersona(id: PersonaId): void {
      applyPersona(id);
    },
    spin(next: PersonaId, onSwap: () => void): Promise<void> {
      if (spinning) return Promise.resolve();
      return new Promise((resolve) => {
        const state = { start: performance.now(), next, onSwap, swapped: false, resolve };
        spinning = state;
        // rAF는 백그라운드 탭에서 멈추므로, 시간이 지나면 강제로 완료시켜
        // busy 락이 영원히 잠기지 않게 한다
        setTimeout(() => {
          if (spinning !== state) return;
          if (!state.swapped) {
            applyPersona(next);
            onSwap();
          }
          character.group.rotation.y = 0;
          spinning = null;
          resolve();
        }, SPIN_MS + 100);
      });
    },
    dispose(): void {
      disposed = true;
      character.dispose();
      renderer.dispose();
    },
  };
}
