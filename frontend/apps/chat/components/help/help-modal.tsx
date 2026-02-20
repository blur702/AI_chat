"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { ScrollArea, Input, Badge } from "@workstation/ui";
import { Search, BookOpen, Loader2, X } from "lucide-react";
import { useHelp } from "./help-provider";
import { useHelpTopics } from "@workstation/api/hooks/use-help-topics";
import type { HelpTopic, HelpSearchResult } from "@workstation/api/hooks/use-help-topics";

function getQuickAnswer(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const stop = trimmed.search(/[.!?]\s/);
  if (stop <= 0) return trimmed;
  return trimmed.slice(0, stop + 1);
}

export function HelpModal() {
  const { isOpen, activeSection, closeHelp } = useHelp();
  const { topics, loading, error, search, submitFeedback } = useHelpTopics();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HelpSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [feedbackSavingFor, setFeedbackSavingFor] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "helpful" | "unhelpful">>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId();

  // Drag state — use refs for dragging flag to avoid stale closures
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  // Store drag listener cleanup so we can call it on unmount
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition(null);
    }
  }, [isOpen]);

  // Scroll to active section when modal opens or section changes
  useEffect(() => {
    if (isOpen && activeSection && scrollRef.current) {
      const timer = setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-section="${activeSection}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeSection, topics]);

  // Reset search state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults(null);
      setFeedbackSavingFor(null);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    }
  }, [isOpen]);

  // Cleanup search timer and drag listeners on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      dragCleanupRef.current?.();
    };
  }, []);

  // Focus trap: keep focus within the dialog panel
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, [isOpen]);

  // Drag: use document-level listeners for robust pointer tracking
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    draggingRef.current = true;

    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const panelW = panel.offsetWidth;
      const panelH = panel.offsetHeight;
      const maxX = Math.max(0, window.innerWidth - panelW);
      const maxY = Math.max(0, window.innerHeight - panelH);
      const newX = Math.max(0, Math.min(maxX, ev.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(maxY, ev.clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    };

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", cleanup);
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", cleanup);
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      searchTimerRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const results = await search(query);
          setSearchResults(results);
        } catch {
          setSearchResults(null);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [search],
  );

  const handleFeedback = useCallback(
    async (topicId: string, helpful: boolean) => {
      if (feedbackSavingFor === topicId) return;
      setFeedbackSavingFor(topicId);
      try {
        await submitFeedback(
          topicId,
          helpful,
          activeSection ?? undefined,
          searchQuery.trim() || undefined,
        );
        setFeedbackState((prev) => ({
          ...prev,
          [topicId]: helpful ? "helpful" : "unhelpful",
        }));
      } catch (err) {
        console.error("Failed to submit feedback:", err);
      } finally {
        setFeedbackSavingFor(null);
      }
    },
    [activeSection, feedbackSavingFor, searchQuery, submitFeedback],
  );

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeHelp();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeHelp]);

  if (!isOpen) return null;

  const displayTopics: (HelpTopic | HelpSearchResult)[] = searchResults ?? topics;

  // Group topics by section_id
  const grouped = displayTopics.reduce<Record<string, (HelpTopic | HelpSearchResult)[]>>(
    (acc, topic) => {
      const key = topic.section_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(topic);
      return acc;
    },
    {},
  );

  const panelStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  const modal = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={(e) => {
          e.stopPropagation();
          closeHelp();
        }}
        aria-hidden="true"
      />

      {/* Draggable panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[51] flex w-full max-w-2xl flex-col rounded-lg border bg-background shadow-lg"
        style={{ ...panelStyle, maxHeight: "80vh" }}
      >
        {/* Drag handle header */}
        <div
          className="flex cursor-grab select-none items-center justify-between border-b px-4 py-3 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
        >
          <div>
            <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-5 w-5" />
              Help
            </h2>
            <p className="text-sm text-muted-foreground">
              Browse help topics or search for answers.
            </p>
          </div>
          <button
            type="button"
            onClick={closeHelp}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Close help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-2 pt-3">
          <div className="relative" role="search" aria-label="Search help topics">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search help topics..."
              className="pl-9"
              autoFocus
              aria-label="Search help topics"
            />
          </div>
        </div>

        <ScrollArea
          className="min-h-0 flex-1 px-4 pb-4 pr-2"
          style={{ maxHeight: "55vh" }}
          ref={scrollRef}
        >
          {searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : loading && !topics.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="py-4 text-center text-sm text-destructive">{error}</p>
          ) : displayTopics.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? "No matching help topics found." : "No help topics available yet."}
            </p>
          ) : (
            <div className="space-y-6 py-2">
              {Object.entries(grouped).map(([sectionId, sectionTopics]) => (
                <div key={sectionId}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {sectionId.replace(/-/g, " ")}
                  </h3>
                  <div className="space-y-4">
                    {sectionTopics.map((topic) => (
                      <div
                        key={topic.id}
                        data-section={topic.slug}
                        className={`rounded-lg border p-4 transition-colors ${
                          activeSection === topic.slug
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium">{topic.title}</h4>
                          {"similarity" in topic && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {Math.round((topic as HelpSearchResult).similarity * 100)}% match
                            </Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {getQuickAnswer(topic.body)}
                        </p>
                        {getQuickAnswer(topic.body) !== topic.body.trim() && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-primary hover:underline">
                              Read full details
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                              {topic.body}
                            </p>
                          </details>
                        )}
                        {"helpful_count" in topic && (
                          <div className="mt-2 flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              Helpful: {topic.helpful_count}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              Needs detail: {topic.unhelpful_count}
                            </Badge>
                            {topic.helpful_ratio != null && (
                              <Badge variant="secondary" className="text-[10px]">
                                {Math.round(topic.helpful_ratio * 100)}% useful
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                            onClick={() => handleFeedback(topic.id, true)}
                            disabled={feedbackSavingFor === topic.id}
                            aria-label={`Mark ${topic.title} as helpful`}
                          >
                            {feedbackState[topic.id] === "helpful" ? "Thanks - helpful" : "Helpful"}
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                            onClick={() => handleFeedback(topic.id, false)}
                            disabled={feedbackSavingFor === topic.id}
                            aria-label={`Mark ${topic.title} as needing more detail`}
                          >
                            {feedbackState[topic.id] === "unhelpful"
                              ? "Thanks - we'll improve"
                              : "Needs more detail"}
                          </button>
                        </div>
                        {topic.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {topic.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
