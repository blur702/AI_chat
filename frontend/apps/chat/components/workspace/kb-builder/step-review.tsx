"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workstation/ui";
import {
  Check, Loader2, AlertTriangle, Database, Globe2, FolderOpen,
  CheckCircle, Hash, Clock, HardDrive, Info,
} from "lucide-react";
import { EducationalCard } from "./educational-card";
import { FieldHelp } from "@/components/help/field-help";
import type { KBBulkUploadFileInfo, KBBulkStatusResponse, KBExtractPreviewResponse, KBEmbeddingModelInfo } from "@workstation/api/types/kb";
import type { ChunkSettings } from "@workstation/api/hooks/use-kb-builder";

interface StepReviewProps {
  files: KBBulkUploadFileInfo[];
  chunkSettings: ChunkSettings;
  selectedModel: string;
  scope: "project" | "global";
  onSetScope: (scope: "project" | "global") => void;
  building: boolean;
  batchStatus: KBBulkStatusResponse | null;
  onStartBuild: () => void;
  onBack: () => void;
  onReset: () => void;
  extractions: Record<string, KBExtractPreviewResponse>;
  embeddingModels: KBEmbeddingModelInfo[];
  projectId: string;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "< 1s";
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

export function StepReview({
  files, chunkSettings, selectedModel,
  scope, onSetScope,
  building, batchStatus,
  onStartBuild, onBack, onReset,
  extractions, embeddingModels, projectId,
}: StepReviewProps) {
  const router = useRouter();
  const isComplete = batchStatus?.status === "completed" || batchStatus?.status === "completed_with_errors";
  const isFailed = batchStatus?.status === "failed";
  const progress = batchStatus
    ? Math.round(((batchStatus.files_completed + batchStatus.files_failed) / Math.max(batchStatus.total_files, 1)) * 100)
    : 0;

  const estimates = useMemo(() => {
    const vals = Object.values(extractions);
    if (vals.length === 0) return null;
    const totalChars = vals.reduce((sum, e) => sum + (e.char_count ?? 0), 0);
    const estimatedTokens = totalChars / 4;
    const effectiveStep = Math.max(chunkSettings.chunk_size - chunkSettings.chunk_overlap, 1);
    const estimatedChunks = Math.ceil(estimatedTokens / effectiveStep);
    const estimatedSeconds = Math.ceil(estimatedChunks / 10);
    const selectedModelInfo = embeddingModels.find(m => m.name === selectedModel);
    const dims = selectedModelInfo?.embedding_length ?? 1024;
    const storageMB = (estimatedChunks * dims * 4) / (1024 * 1024);
    return { estimatedChunks, estimatedSeconds, storageMB };
  }, [extractions, chunkSettings.chunk_size, chunkSettings.chunk_overlap, embeddingModels, selectedModel]);

  const hasExtractions = estimates !== null;

  // ── Post-build success ──
  if (isComplete) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
          <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
          <div>
            <div className="text-sm font-semibold">Knowledge Base Built Successfully!</div>
            <div className="text-xs text-muted-foreground">Your documents are indexed and ready for semantic search.</div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-lg font-bold">{batchStatus?.total_chunks ?? 0}</div>
            <div className="text-xs text-muted-foreground">Chunks Indexed</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-sm font-bold font-mono truncate">{selectedModel}</div>
            <div className="text-xs text-muted-foreground">Model</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-lg font-bold capitalize">{scope}</div>
            <div className="text-xs text-muted-foreground">Scope</div>
          </div>
        </div>

        {/* Educational card */}
        <EducationalCard title="How to Use Your Knowledge Base" defaultOpen>
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Automatic context injection</strong> &mdash; your KB is automatically searched when you chat in this workspace. Just ask a question and relevant chunks are injected into the prompt.
            </li>
            <li>
              <strong>How it works</strong> &mdash; your query is embedded into a vector, matched against stored chunks using cosine similarity, and the top results are added as context.
            </li>
            <li>
              <strong>Example queries to try:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 text-muted-foreground">
                <li>&ldquo;Summarize the key concepts from my documents&rdquo;</li>
                <li>&ldquo;What does the documentation say about [topic]?&rdquo;</li>
                <li>&ldquo;Find references to [specific term]&rdquo;</li>
              </ul>
            </li>
          </ul>
        </EducationalCard>

        {/* File statuses (if errors) */}
        {batchStatus && batchStatus.files_failed > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
            <div className="text-xs font-medium text-amber-600">Some files had errors:</div>
            {batchStatus.file_statuses.filter(fs => fs.status === "failed").map((fs) => (
              <div key={fs.file_id} className="flex items-center gap-2 text-xs">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="truncate">{fs.filename}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={onReset}>Build Another</Button>
          <Button onClick={() => router.push(`/workspace/${projectId}`)}>
            Start Chatting
          </Button>
        </div>
      </div>
    );
  }

  // ── Pre-build / building view ──
  return (
    <div className="space-y-4">
      <EducationalCard title="The indexing pipeline">
        <p>
          Here&apos;s what happens when you click &ldquo;Build&rdquo;:
        </p>
        <ol className="list-decimal list-inside space-y-1 ml-1">
          <li><strong>Extract</strong> &mdash; Text is pulled from each file using the appropriate method</li>
          <li><strong>Chunk</strong> &mdash; Text is split into {chunkSettings.chunk_size}-token segments with {chunkSettings.chunk_overlap}-token overlap</li>
          <li><strong>Embed</strong> &mdash; Each chunk is sent to <code>{selectedModel}</code> to generate a vector</li>
          <li><strong>Store</strong> &mdash; Vectors are saved to pgvector with IVFFlat cosine index</li>
          <li><strong>Search</strong> &mdash; Queries are embedded and matched using cosine similarity</li>
        </ol>
      </EducationalCard>

      {/* Pre-flight estimates */}
      {!building && !batchStatus && (
        <div className="space-y-3">
          {estimates ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4 text-blue-500" />
                Build Estimates
                <FieldHelp tip="Approximate chunk count, build time, and storage based on extracted text length and your chunking settings. Actual values may vary slightly due to token boundary alignment." slug="kb-indexing-pipeline" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">~{estimates.estimatedChunks.toLocaleString()}</div>
                    <div className="text-muted-foreground">Chunks</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{formatTime(estimates.estimatedSeconds)}</div>
                    <div className="text-muted-foreground">Time</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">~{estimates.storageMB.toFixed(1)} MB</div>
                    <div className="text-muted-foreground">Storage</div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Warnings */}
          {!hasExtractions && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Extract your files first (Step 2) to see build estimates.
            </div>
          )}
          {estimates && estimates.estimatedChunks > 5000 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Large build &mdash; may take 10+ minutes. Consider using larger chunk sizes.
            </div>
          )}
          {chunkSettings.chunk_size < 100 && (
            <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              Very small chunks may fragment context. Consider 150+ tokens for better results.
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm font-medium flex items-center gap-1">
          Build Summary
          <FieldHelp tip="A final review of all settings before starting the build. Double-check file count, chunk parameters, and embedding model selection before proceeding." slug="kb-indexing-pipeline" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-muted-foreground">Files</div>
          <div>{files.length}</div>
          <div className="text-muted-foreground">Chunk Size</div>
          <div>{chunkSettings.chunk_size} tokens</div>
          <div className="text-muted-foreground">Overlap</div>
          <div>{chunkSettings.chunk_overlap} tokens</div>
          <div className="text-muted-foreground">Model</div>
          <div className="font-mono">{selectedModel}</div>
        </div>
      </div>

      {/* Scope selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          Scope
          <FieldHelp tip="Project scope limits search to this project's chat sessions. Global scope makes the knowledge base available across all projects, useful for shared reference material." slug="kb-scope-project-vs-global" />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSetScope("project")}
            aria-pressed={scope === "project"}
            className={`
              flex-1 flex items-center gap-2 rounded-md border p-3 text-sm transition-colors
              ${scope === "project" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}
            `}
          >
            <FolderOpen className="h-4 w-4" />
            <div>
              <div className="font-medium">Project</div>
              <div className="text-xs text-muted-foreground">Only this project&apos;s chat can search it</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSetScope("global")}
            aria-pressed={scope === "global"}
            className={`
              flex-1 flex items-center gap-2 rounded-md border p-3 text-sm transition-colors
              ${scope === "global" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}
            `}
          >
            <Globe2 className="h-4 w-4" />
            <div>
              <div className="font-medium">Global</div>
              <div className="text-xs text-muted-foreground">Available across all projects</div>
            </div>
          </button>
        </div>
      </div>

      {/* Progress / Status */}
      {batchStatus && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {isFailed ? "Build Failed" : "Building..."}
            </span>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
          <div
            className="h-2 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Build progress"
          >
            <div
              className={`h-full rounded-full transition-all ${
                isFailed ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{batchStatus.files_completed} completed</span>
            {batchStatus.files_failed > 0 && (
              <span className="text-destructive">{batchStatus.files_failed} failed</span>
            )}
            <span>{batchStatus.total_chunks} chunks</span>
            <span>{batchStatus.chunks_embedded} embedded</span>
          </div>

          {batchStatus.file_statuses.length > 0 && (
            <div className="max-h-32 overflow-auto space-y-1 mt-2">
              {batchStatus.file_statuses.map((fs) => (
                <div key={fs.file_id} className="flex items-center gap-2 text-xs">
                  {fs.status === "completed" || fs.status === "skipped" ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : fs.status === "failed" ? (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span className="truncate flex-1">{fs.filename}</span>
                  <span className="text-muted-foreground">{fs.chunks} chunks</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={building}>Back</Button>
        <div className="flex items-center gap-1">
          <FieldHelp tip="Kicks off the full pipeline: extract text, split into chunks, generate embeddings, and store vectors in pgvector. Progress is shown in real time above." slug="kb-indexing-pipeline" />
          <Button onClick={onStartBuild} disabled={building || files.length === 0}>
            {building ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Building...</>
            ) : (
              <><Database className="h-4 w-4 mr-1" /> Build Knowledge Base</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
