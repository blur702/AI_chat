"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Badge,
  ScrollArea,
  Input,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workstation/ui";
import {
  BookOpen,
  Upload,
  Search,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { useKBSources } from "@workstation/api/hooks";
import type { KBSearchResult } from "@workstation/api/types";
import { SourcesList } from "./sources-list";

interface KBPanelProps {
  projectId: string;
  onClose?: () => void;
}

const ACCEPTED_TYPES = ".pdf,.txt,.md";

export function KBPanel({ projectId, onClose }: KBPanelProps) {
  const {
    sources,
    sourcesLoading,
    sourcesError,
    loadSources,
    uploadSource,
    uploading,
    deleteSource,
    deleting,
    searchResults,
    searchLoading,
    searchError,
    search,
    clearSearch,
  } = useKBSources();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSources(projectId);
  }, [projectId, loadSources]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadSource(projectId, file);
      // Reset input so the same file can be uploaded again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [projectId, uploadSource]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      search(projectId, searchQuery.trim());
    },
    [projectId, searchQuery, search]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    clearSearch();
    setShowSearch(false);
  }, [clearSearch]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteSource(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, deleteSource]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">Knowledge Base</span>
          {sources.length > 0 && (
            <Badge variant="secondary" className="h-4 text-[9px]">
              {sources.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Search"
            onClick={() => setShowSearch((p) => !p)}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Upload document"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Search bar */}
      {showSearch && (
        <form onSubmit={handleSearch} className="flex items-center gap-1.5 border-b px-3 py-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Semantic search..."
            className="h-7 text-xs"
          />
          <Button type="submit" variant="outline" size="sm" className="h-7 text-xs shrink-0" disabled={searchLoading}>
            {searchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Search"}
          </Button>
          {searchResults.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleClearSearch}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </form>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Search Results ({searchResults.length})
                </span>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={handleClearSearch}>
                  Clear
                </Button>
              </div>
              {searchResults.map((result: KBSearchResult, i: number) => (
                <div key={`${result.chunk_id}-${i}`} className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="h-4 text-[9px]">
                      {(result.similarity * 100).toFixed(1)}%
                    </Badge>
                    <span className="text-[10px] text-muted-foreground truncate">
                      Chunk {result.chunk_id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground line-clamp-4 whitespace-pre-wrap">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {searchError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-xs text-destructive">{searchError}</span>
            </div>
          )}

          {/* Sources list */}
          {searchResults.length === 0 && (
            <>
              {sourcesError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="text-xs text-destructive">{sourcesError}</span>
                </div>
              )}
              <SourcesList
                sources={sources}
                loading={sourcesLoading}
                onDelete={(sourceId) => setDeleteTarget(sourceId)}
              />
              {!sourcesLoading && sources.length === 0 && !sourcesError && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <FileText className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground">No documents yet</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      Upload PDF, TXT, or Markdown files to build your knowledge base
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleUploadClick}>
                    <Upload className="h-3 w-3" />
                    Upload Document
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-sm">Delete Source</DialogTitle>
          <DialogDescription className="text-xs">
            This will permanently delete this document and all its chunks. This action cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
