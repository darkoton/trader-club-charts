/* ─── Article summary (list view) ─── */

export interface BlogArticleSummary {
  _id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  published_at: string;
  views: number;
}

/* ─── Article detail ─── */

export interface BlogSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface BlogArticleFull {
  _id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail: string | null;
  banner: string | null;
  sections: BlogSection[];
  tags: string[];
  is_published: boolean;
  views: number;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface TocEntry {
  id: string;
  title: string;
}

export interface ArticleNeighbor {
  _id: string;
  title: string;
  slug: string;
  thumbnail: string | null;
  description: string;
  published_at: string;
}

/* ─── API responses ─── */

export interface ArticlesListResponse {
  success: boolean;
  data: {
    articles: BlogArticleSummary[];
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ArticleDetailResponse {
  success: boolean;
  data: {
    article: BlogArticleFull;
    toc: TocEntry[];
    prev_article: ArticleNeighbor | null;
    next_article: ArticleNeighbor | null;
  };
}

export interface TagsResponse {
  success: boolean;
  data: { tag: string; count: number }[];
}
