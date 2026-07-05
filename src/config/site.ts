/** 사이트 전역 정보. 이름/링크가 바뀌면 이 파일만 수정하면 된다. */
export const SITE = {
  title: 'yewon.log',
  author: '정예원',
  description: 'AI 연구원이자 크리에이터, 독서인, 밴드인의 기록',
  email: 'jungyewon411@gmail.com',
  social: {
    github: 'https://github.com/',
    linkedin: 'https://www.linkedin.com/',
  },
} as const;

export interface NavItem {
  label: string;
  href: string;
  /** Nav 활성 표시에 쓰는 섹션 키 */
  key: SectionKey;
}

export type SectionKey = 'about' | 'research' | 'playground' | 'shelf';

export const NAV: NavItem[] = [
  { label: 'About', href: '/about/', key: 'about' },
  { label: 'Research', href: '/research/', key: 'research' },
  { label: 'Playground', href: '/playground/', key: 'playground' },
  { label: 'Shelf', href: '/shelf/', key: 'shelf' },
];
