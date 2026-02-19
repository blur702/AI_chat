"use client";

import { useState } from "react";
import { Button } from "@workstation/ui";
import { Loader2, Scissors, BookOpen, Code, FileText, MessageSquare, SlidersHorizontal } from "lucide-react";
import { EducationalCard } from "./educational-card";
import { FieldHelp } from "@/components/help/field-help";
import type { ChunkSettings } from "@workstation/api/hooks/use-kb-builder";
import type { KBChunkPreviewResponse, KBExtractPreviewResponse } from "@workstation/api/types/kb";

const CHUNK_PRESETS = [
  { id: "book", label: "Book / Long-form", chunk_size: 500, chunk_overlap: 50, icon: BookOpen },
  { id: "tech", label: "Technical Docs", chunk_size: 300, chunk_overlap: 30, icon: Code },
  { id: "research", label: "Research Papers", chunk_size: 400, chunk_overlap: 40, icon: FileText },
  { id: "faq", label: "FAQ / Short", chunk_size: 150, chunk_overlap: 15, icon: MessageSquare },
  { id: "custom", label: "Custom", chunk_size: 0, chunk_overlap: 0, icon: SlidersHorizontal },
] as const;

type PresetId = typeof CHUNK_PRESETS[number]["id"];

function detectPreset(settings: ChunkSettings): PresetId {
  for (const p of CHUNK_PRESETS) {
    if (p.id === "custom") continue;
    if (p.chunk_size === settings.chunk_size && p.chunk_overlap === settings.chunk_overlap) return p.id;
  }
  return "custom";
}

interface StepChunkingProps {
  chunkSettings: ChunkSettings;
  onSetChunkSettings: (settings: ChunkSettings) => void;
  chunkPreviewResult: KBChunkPreviewResponse | null;
  chunking: boolean;
  extractions: Record<string, KBExtractPreviewResponse>;
  onChunkPreview: (text: string) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

export function StepChunking({
  chunkSettings, onSetChunkSettings,
  chunkPreviewResult, chunking, extractions,
  onChunkPreview, onBack, onNext,
}: StepChunkingProps) {
  const [previewFileId, setPreviewFileId] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(() => detectPreset(chunkSettings));

  const extractionEntries = Object.entries(extractions);

  const handlePresetClick = (preset: typeof CHUNK_PRESETS[number]) => {
    setSelectedPreset(preset.id);
    if (preset.id !== "custom") {
      onSetChunkSettings({ ...chunkSettings, chunk_size: preset.chunk_size, chunk_overlap: preset.chunk_overlap });
    }
  };

  const handleSliderChange = (partial: Partial<ChunkSettings>) => {
    setSelectedPreset("custom");
    const merged = { ...chunkSettings, ...partial };
    const maxOverlap = Math.floor(merged.chunk_size / 2);
    if (merged.chunk_overlap > maxOverlap) {
      merged.chunk_overlap = maxOverlap;
    }
    onSetChunkSettings(merged);
  };

  const handlePreview = () => {
    let text = "";
    if (previewFileId && extractions[previewFileId]) {
      text = extractions[previewFileId].extracted_text;
    } else if (extractionEntries.length > 0) {
      text = extractionEntries[0][1].extracted_text;
    }
    if (text) void onChunkPreview(text).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <EducationalCard title="Why chunk documents?">
        <p>
          LLMs have limited context windows, and embedding models work best with focused text segments.
          Chunking splits your documents into smaller pieces for more precise retrieval.
        </p>
        <p>
          <strong>Chunk size</strong> controls how many tokens per chunk (larger = more context,
          less precise). <strong>Overlap</strong> ensures continuity between chunks so no information
          falls between the cracks.
        </p>
      </EducationalCard>

      {/* Presets */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          Presets
          <FieldHelp tip="Pre-configured chunk size and overlap values optimized for common document types. Select a preset to auto-fill the sliders, or choose Custom to set values manually." slug="kb-chunking-overview" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CHUNK_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                aria-pressed={active}
                className={`
                  flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors
                  ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}
                `}
              >
                <Icon className="h-4 w-4" />
                <span className="text-center leading-tight">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          Chunking Parameters
        </div>

        {/* Chunk Size */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1">
              Chunk Size (tokens)
              <FieldHelp tip="The target number of tokens per chunk. Smaller chunks (100-200) give more precise retrieval; larger chunks (400-800) preserve more context per result. 300-500 is a good default for most documents." slug="kb-chunk-size" />
            </span>
            <span className="font-mono text-muted-foreground">{chunkSettings.chunk_size}</span>
          </div>
          <input
            type="range"
            min={50}
            max={2000}
            step={50}
            value={chunkSettings.chunk_size}
            onChange={(e) => handleSliderChange({ chunk_size: Number(e.target.value) })}
            className="w-full accent-primary"
            aria-label="Chunk size in tokens"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>50 (precise)</span>
            <span>2000 (broad)</span>
          </div>
        </div>

        {/* Chunk Overlap */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1">
              Overlap (tokens)
              <FieldHelp tip="Number of tokens duplicated between adjacent chunks to prevent information loss at boundaries. 10-15% of chunk size is typical. Zero overlap is fine for structured data like FAQs." slug="kb-chunk-overlap" />
            </span>
            <span className="font-mono text-muted-foreground">{chunkSettings.chunk_overlap}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.min(500, Math.floor(chunkSettings.chunk_size / 2))}
            step={10}
            value={chunkSettings.chunk_overlap}
            onChange={(e) => handleSliderChange({ chunk_overlap: Number(e.target.value) })}
            className="w-full accent-primary"
            aria-label="Chunk overlap in tokens"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 (no overlap)</span>
            <span>{Math.min(500, Math.floor(chunkSettings.chunk_size / 2))} (max)</span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium flex items-center gap-1">
            Live Preview
            <FieldHelp tip="Runs the chunking algorithm on a sample document so you can inspect the output before committing to a full build. Helps verify that chunk boundaries fall at natural text breaks." slug="kb-chunk-size" />
          </span>
          <div className="flex items-center gap-2">
            {extractionEntries.length > 1 && (
              <select
                value={previewFileId}
                onChange={(e) => setPreviewFileId(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-xs"
                aria-label="Select file for chunk preview"
              >
                <option value="">First available</option>
                {extractionEntries.map(([id, ext]) => (
                  <option key={id} value={id}>{ext.filename}</option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handlePreview}
              disabled={chunking || extractionEntries.length === 0}
            >
              {chunking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Scissors className="h-3 w-3 mr-1" />}
              Preview Chunks
            </Button>
          </div>
        </div>

        {extractionEntries.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No extracted text available. Go back to step 2 to extract files, or skip preview.
          </p>
        )}

        {chunkPreviewResult && (
          <div className="space-y-2">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><strong>{chunkPreviewResult.total_chunks}</strong> chunks</span>
              <span>avg <strong>{chunkPreviewResult.avg_chunk_size}</strong> chars</span>
            </div>
            <div className="max-h-48 overflow-auto space-y-1.5">
              {chunkPreviewResult.chunks.slice(0, 10).map((chunk) => (
                <div key={chunk.index} className="rounded bg-muted/50 p-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span>Chunk {chunk.index + 1}</span>
                    <span>{chunk.char_count} chars</span>
                  </div>
                  <pre className="whitespace-pre-wrap line-clamp-3" aria-label={`Chunk ${chunk.index + 1} content`}>{chunk.content}</pre>
                </div>
              ))}
              {chunkPreviewResult.total_chunks > 10 && (
                <p className="text-xs text-muted-foreground text-center">
                  ...and {chunkPreviewResult.total_chunks - 10} more chunks
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next: Embedding Model</Button>
      </div>
    </div>
  );
}
