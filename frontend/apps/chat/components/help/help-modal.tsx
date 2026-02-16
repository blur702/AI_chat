"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ScrollArea,
  Input,
  Button,
  Badge,
} from "@workstation/ui";
import { Search, BookOpen, Loader2 } from "lucide-react";
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
    }
  }, [isOpen]);

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeHelp()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Help
          </DialogTitle>
          <DialogDescription>
            Browse help topics or search for answers.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search help topics..."
            className="pl-9"
            autoFocus
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[55vh] pr-2" ref={scrollRef}>
          {loading && !topics.length ? (
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
          {searching && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Searching...</span>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
