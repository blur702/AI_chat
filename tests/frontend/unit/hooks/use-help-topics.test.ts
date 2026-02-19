import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHelpTopics } from "@workstation/api/hooks/use-help-topics";

const mockClient = {
  listHelpTopics: vi.fn(),
  searchHelpTopics: vi.fn(),
  submitHelpFeedback: vi.fn(),
};

vi.mock("@workstation/api/client", () => ({
  getClient: () => mockClient,
}));

describe("useHelpTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads help topics on mount", async () => {
    mockClient.listHelpTopics.mockResolvedValue({
      topics: [
        {
          id: "topic-1",
          slug: "workspace-chat",
          section_id: "workspace",
          title: "Workspace Chat",
          body: "How chat works.",
          tags: ["workspace"],
          has_embedding: true,
          helpful_count: 0,
          unhelpful_count: 0,
          total_feedback_count: 0,
          helpful_ratio: null,
          created_at: null,
          updated_at: null,
        },
      ],
      count: 1,
    });

    const { result } = renderHook(() => useHelpTopics());

    await waitFor(() => {
      expect(result.current.topics).toHaveLength(1);
    });
  });

  it("search returns backend semantic results", async () => {
    mockClient.listHelpTopics.mockResolvedValue({ topics: [], count: 0 });
    mockClient.searchHelpTopics.mockResolvedValue({
      results: [
        {
          id: "topic-1",
          slug: "workspace-chat",
          section_id: "workspace",
          title: "Workspace Chat",
          body: "How chat works.",
          tags: ["workspace"],
          similarity: 0.91,
        },
      ],
      query: "chat",
      count: 1,
    });

    const { result } = renderHook(() => useHelpTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let searchResults: Awaited<ReturnType<typeof result.current.search>> = [];
    await act(async () => {
      searchResults = await result.current.search("chat");
    });
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].similarity).toBe(0.91);
  });

  it("submitFeedback updates local counters", async () => {
    mockClient.listHelpTopics.mockResolvedValue({
      topics: [
        {
          id: "topic-1",
          slug: "workspace-chat",
          section_id: "workspace",
          title: "Workspace Chat",
          body: "How chat works.",
          tags: ["workspace"],
          has_embedding: true,
          helpful_count: 1,
          unhelpful_count: 0,
          total_feedback_count: 1,
          helpful_ratio: 1,
          created_at: null,
          updated_at: null,
        },
      ],
      count: 1,
    });
    mockClient.submitHelpFeedback.mockResolvedValue({
      topic_id: "topic-1",
      helpful: false,
      helpful_count: 1,
      unhelpful_count: 1,
      total_feedback_count: 2,
      helpful_ratio: 0.5,
    });

    const { result } = renderHook(() => useHelpTopics());

    await waitFor(() => {
      expect(result.current.topics).toHaveLength(1);
    });

    await act(async () => {
      await result.current.submitFeedback("topic-1", false, "workspace-chat", "chat");
    });

    expect(result.current.topics[0].unhelpful_count).toBe(1);
    expect(result.current.topics[0].total_feedback_count).toBe(2);
  });
});
