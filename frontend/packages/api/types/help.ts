export interface HelpTopic {
  id: string;
  slug: string;
  section_id: string;
  title: string;
  body: string;
  tags: string[];
  has_embedding: boolean;
  helpful_count: number;
  unhelpful_count: number;
  total_feedback_count: number;
  helpful_ratio: number | null;
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

export interface HelpFeedbackSubmitRequest {
  helpful: boolean;
  context_slug?: string;
  query?: string;
  source?: string;
}

export interface HelpFeedbackSummary {
  topic_id: string;
  helpful_count: number;
  unhelpful_count: number;
  total_feedback_count: number;
  helpful_ratio: number | null;
}

export interface HelpFeedbackSubmitResponse extends HelpFeedbackSummary {
  helpful: boolean;
}

export interface HelpFeedbackSummaryListResponse {
  summaries: HelpFeedbackSummary[];
  count: number;
}
