"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import {
  ScrollArea,
  Input,
  Badge,
} from "@workstation/ui";
import { Search, BookOpen, Loader2, X } from "lucide-react";
import { useHelp } from "./help-provider";
import { useHelpTopics } from "@workstation/api/hooks/use-help-topics";
import type { HelpTopic, HelpSearchResult } from "@workstation/api/hooks/use-help-topics";

export function HelpModal() {
  const { isOpen, activeSection, closeHelp } = useHelp();
  const { topics, loading, error, search } = useHelpTopics();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HelpSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
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
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
    [search]
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
    {}
  );

  const panelStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  const modal = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={(e) => { e.stopPropagation(); closeHelp(); }}
        aria-hidden="true"
      />

      {/* Draggable panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[51] w-full max-w-2xl flex flex-col rounded-lg border bg-background shadow-lg"
        style={{ ...panelStyle, maxHeight: "80vh" }}
      >
        {/* Drag handle header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b select-none cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
        >
          <div>
            <h2 id={titleId} className="text-lg font-semibold flex items-center gap-2">
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

        <div className="px-4 pt-3 pb-2">
          <div className="relative" role="search" aria-label="Search help topics">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

        <ScrollArea className="flex-1 min-h-0 px-4 pb-4 pr-2" style={{ maxHeight: "55vh" }} ref={scrollRef}>
          {searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : loading && !topics.length ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-4 text-center">{error}</p>
          ) : displayTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {searchQuery ? "No matching help topics found." : "No help topics available yet."}
            </p>
          ) : (
            <div className="space-y-6 py-2">
              {Object.entries(grouped).map(([sectionId, sectionTopics]) => (
                <div key={sectionId}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-sm font-medium">{topic.title}</h4>
                          {"similarity" in topic && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {Math.round((topic as HelpSearchResult).similarity * 100)}% match
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {topic.body}
                        </p>
                        {topic.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
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
