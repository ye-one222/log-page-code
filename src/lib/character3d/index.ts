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
  camera.position.set(0, 2.1, 7.2);
  camera.lookAt(0, 1.35, 0);

  // three r155+ 물리 조명 단위: 구형 값(0.9/0.35)에 π를 곱해 보정
  scene.add(new THREE.HemisphereLight('#FFF9F2', '#E7DCCB', 2.8));
  const sun = new THREE.DirectionalLight('#FFFFFF', 1.1);
  sun.position.set(1.5, 4, 5);
  scene.add(sun);

  const character = buildCharacter(initial);
  scene.add(character.group);

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
          character.setPersona(spinning.next);
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

      if (eyesOpenAt && now >= eyesOpenAt) {
        character.setEyesClosed(false);
        eyesOpenAt = 0;
      } else if (!eyesOpenAt && now >= nextBlinkAt) {
        character.setEyesClosed(true);
        eyesOpenAt = now + 120;
        nextBlinkAt = now + 4000 + Math.random() * 3000;
      }
    }

    renderer.render(scene, camera);
  }
  animate();

  return {
    setPersona(id: PersonaId): void {
      character.setPersona(id);
    },
    spin(next: PersonaId, onSwap: () => void): Promise<void> {
      if (spinning) return Promise.resolve();
      return new Promise((resolve) => {
        spinning = { start: performance.now(), next, onSwap, swapped: false, resolve };
      });
    },
    dispose(): void {
      disposed = true;
      character.dispose();
      renderer.dispose();
    },
  };
}
