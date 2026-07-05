import { getCollection } from 'astro:content';
import { TYPE_META, type ContentType, type PersonaId } from '../config/personas';

/** 홈 피드와 목록 페이지가 공유하는 정규화된 글 정보 */
export interface FeedItem {
  title: string;
  href: string;
  date: Date;
  type: ContentType;
  typeLabel: string;
  persona: PersonaId;
  summary: string;
}

const COLLECTION_BASE = {
  research: '/research/',
  playground: '/playground/',
  shelf: '/shelf/',
} as const;

type CollectionName = keyof typeof COLLECTION_BASE;

/** 세 컬렉션의 글을 모두 모아 최신순으로 반환 (draft 제외) */
export async function getAllPosts(): Promise<FeedItem[]> {
  const names: CollectionName[] = ['research', 'playground', 'shelf'];
  const nested = await Promise.all(
    names.map(async (name) => {
      const entries = await getCollection(name, ({ data }) => !data.draft);
      return entries.map((entry): FeedItem => {
        const type = entry.data.type as ContentType;
        return {
          title: entry.data.title,
          href: `${COLLECTION_BASE[name]}${entry.id}/`,
          date: entry.data.date,
          type,
          typeLabel: TYPE_META[type].label,
          persona: TYPE_META[type].persona,
          summary: entry.data.summary,
        };
      });
    }),
  );
  return nested.flat().sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** 페르소나별 최신 글 n개 (홈 피드용) */
export function feedByPersona(posts: FeedItem[], limit = 3): Record<PersonaId, FeedItem[]> {
  const result = { researcher: [], creator: [], reader: [], musician: [] } as Record<
    PersonaId,
    FeedItem[]
  >;
  for (const post of posts) {
    if (result[post.persona].length < limit) result[post.persona].push(post);
  }
  return result;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}
