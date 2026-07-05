import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 글 하나 = 마크다운 파일 하나.
 * src/content/<컬렉션>/ 에 .md 파일을 추가하면 목록/홈 피드에 자동 반영된다.
 * frontmatter 필드는 아래 스키마가 검증하므로, 오타가 있으면 빌드가 실패한다.
 */

const base = {
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string(),
  /** 발행은 opt-in: publish: true를 명시한 글만 사이트에 노출된다 */
  publish: z.boolean().default(false),
};

const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z.object({
    ...base,
    type: z.enum(['paper', 'note']),
    /** 논문일 때 학회/연도: "SIGGRAPH 2023" */
    venue: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const playground = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/playground' }),
  schema: z.object({
    ...base,
    type: z.enum(['3d', 'video', 'web']),
    /** 사용한 툴: ["Blender", "Premiere"] */
    tools: z.array(z.string()).default([]),
  }),
});

const shelf = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/shelf' }),
  schema: z.object({
    ...base,
    type: z.enum(['book', 'album', 'ticket']),
    /** 저자 / 아티스트 / 공연 주체 */
    creator: z.string(),
    /** 책 별점 (1~5) */
    rating: z.number().int().min(1).max(5).optional(),
    /** 인상 깊은 문장 */
    quote: z.string().optional(),
    /** 공연 장소 */
    venue: z.string().optional(),
    /** 책등/슬리브 색. 비우면 자동 배정 */
    color: z.string().optional(),
  }),
});

export const collections = { research, playground, shelf };
