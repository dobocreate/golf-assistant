export interface Knowledge {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[];
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export const KNOWLEDGE_CATEGORIES = [
  'スイング技術',
  'コースマネジメント',
  'メンタル',
  '練習法',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
