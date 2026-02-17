export interface HelpTopic {
  id: string;
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string[];
  has_embedding: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface HelpSearchResult {
  id: string;
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string[];
  similarity: number;
}

export interface HelpTopicListResponse {
  topics: HelpTopic[];
  count: number;
}

export interface HelpSearchResponse {
  results: HelpSearchResult[];
  query: string;
  count: number;
}

export interface HelpTopicCreateRequest {
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags?: string[];
}

export interface HelpTopicUpdateRequest {
  slug?: string;
  section_id?: string;
  title?: string;
  body?: string;
  tags?: string[];
}
