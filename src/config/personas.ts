import type { SectionKey } from './site';

/**
 * 페르소나 시스템의 단일 소스.
 *
 * - 새 페르소나 추가: PERSONAS에 항목 추가 + Character.astro에 액세서리 추가
 * - 새 콘텐츠 유형 추가: content.config.ts의 enum과 TYPE_META에 항목 추가
 * 나머지(홈 피드, 색상, 네비게이션 매핑)는 전부 여기서 파생된다.
 */
export type PersonaId = 'researcher' | 'creator' | 'reader' | 'musician';

export interface Persona {
  id: PersonaId;
  /** 홈 화면 배지: "연구원의 나" */
  badge: string;
  /** 피드 제목 등에 쓰는 짧은 이름: "연구원" */
  name: string;
  role: string;
  tagline: string;
  /** 이 페르소나가 활성일 때 강조되는 네비게이션 섹션 */
  nav: SectionKey;
  color: {
    /** 포인트 컬러 (테두리, 밑줄, 활성 표시) */
    main: string;
    /** 연한 배경 (배지, 태그 pill) */
    soft: string;
    /** soft 배경 위 텍스트 */
    deep: string;
  };
}

export const PERSONAS: Persona[] = [
  {
    id: 'researcher',
    badge: '연구원의 나',
    name: '연구원',
    role: 'AI R&D 연구원 · 컴퓨터 비전',
    tagline: '3D 비전과 생성 모델을 공부하고, 읽은 논문을 기록합니다.',
    nav: 'research',
    color: { main: '#7F77DD', soft: '#EEEDFE', deep: '#3C3489' },
  },
  {
    id: 'creator',
    badge: '크리에이터의 나',
    name: '크리에이터',
    role: '3D 애니메이션 · 영상 PD · 웹',
    tagline: '화면 속 세계를 기획하고, 만들고, 편집합니다. 아직 배우는 중이라 더 재밌습니다.',
    nav: 'playground',
    color: { main: '#1D9E75', soft: '#E1F5EE', deep: '#085041' },
  },
  {
    id: 'reader',
    badge: '독서인의 나',
    name: '독서인',
    role: '활자 중독',
    tagline: '읽은 문장들이 저를 조금씩 다른 사람으로 만듭니다.',
    nav: 'shelf',
    color: { main: '#D85A30', soft: '#FAECE7', deep: '#712B13' },
  },
  {
    id: 'musician',
    badge: '밴드인의 나',
    name: '밴드인',
    role: '밴드 기타 · 공연 기획',
    tagline: '무대 위의 3분을 위해 합주실에서 삽니다.',
    nav: 'shelf',
    color: { main: '#D4537E', soft: '#FBEAF0', deep: '#72243E' },
  },
];

export function getPersona(id: PersonaId): Persona {
  const p = PERSONAS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown persona: ${id}`);
  return p;
}

/** 콘텐츠 frontmatter의 type 값 → 표시 라벨 + 소속 페르소나 */
export const TYPE_META = {
  paper: { label: '논문 리뷰', persona: 'researcher' },
  note: { label: '지식 기록', persona: 'researcher' },
  '3d': { label: '3D', persona: 'creator' },
  video: { label: '영상', persona: 'creator' },
  web: { label: '웹', persona: 'creator' },
  book: { label: '독서', persona: 'reader' },
  album: { label: '음반', persona: 'musician' },
  ticket: { label: '공연', persona: 'musician' },
} as const satisfies Record<string, { label: string; persona: PersonaId }>;

export type ContentType = keyof typeof TYPE_META;
