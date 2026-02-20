"use client";

import { useCallback, useRef } from "react";
import { Button } from "@workstation/ui";
import { Upload, X, FileText, Image, FileSpreadsheet, Code2, Loader2 } from "lucide-react";
import { EducationalCard } from "./educational-card";
import { FieldHelp } from "@/components/help/field-help";
import type { KBBulkUploadFileInfo } from "@workstation/api/types/kb";

interface StepDocumentsProps {
  files: KBBulkUploadFileInfo[];
  uploading: boolean;
  onAddFiles: (files: File[]) => Promise<void>;
  onRemoveFile: (fileId: string) => void;
  onNext: () => void;
}

const ACCEPTED = ".pdf,.txt,.md,.html,.htm,.csv,.jpg,.jpeg,.png";
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED.split(","));
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function fileIcon(type: string) {
  switch (type) {
    case "image": return <Image className="h-4 w-4 text-purple-500" />;
    case "csv": return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
    case "html": return <Code2 className="h-4 w-4 text-orange-500" />;
    default: return <FileText className="h-4 w-4 text-blue-500" />;
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepDocuments({ files, uploading, onAddFiles, onRemoveFile, onNext }: StepDocumentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ACCEPTED_EXTENSIONS.has(ext) && f.size <= MAX_FILE_SIZE;
    });
    const dropped = Array.from(e.dataTransfer.files);
    if (droppedFiles.length !== dropped.length) {
      console.error("Some files were skipped (unsupported type or larger than 50MB).");
    }
    if (droppedFiles.length > 0) {
      void onAddFiles(droppedFiles).catch((err) => {
        console.error("Failed to upload dropped files:", err);
      });
    }
  }, [onAddFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const allSelected = Array.from(e.target.files ?? []);
    const selected = allSelected.filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ACCEPTED_EXTENSIONS.has(ext) && f.size <= MAX_FILE_SIZE;
    });
    if (selected.length !== allSelected.length) {
      console.error("Some files were skipped (unsupported type or larger than 50MB).");
    }
    if (selected.length > 0) {
      void onAddFiles(selected).catch((err) => {
        console.error("Failed to upload selected files:", err);
      });
    }
    e.target.value = "";
  }, [onAddFiles]);

  return (
    <div className="space-y-4">
      <EducationalCard title="What are embeddings?" defaultOpen>
        <p>
          <strong>Vector embeddings</strong> transform text into arrays of numbers that capture
          semantic meaning. Similar concepts end up close together in this high-dimensional space,
          enabling search by meaning rather than exact keyword match.
        </p>
        <p>
          Upload your documents here to begin the pipeline: <em>text extraction &rarr; chunking &rarr;
          embedding &rarr; vector storage &rarr; semantic search</em>.
        </p>
      </EducationalCard>

      <div className="flex items-center gap-2 text-sm font-medium">
        Select Documents
        <FieldHelp tip="Supported file types and formats" slug="kb-file-types" />
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 transition-colors hover:border-primary/50 hover:bg-muted/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        onClick={() => inputRef.current?.click()}
        aria-label="Upload files by dropping or clicking"
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag & drop files or <span className="text-primary font-medium">click to browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, TXT, MD, HTML, CSV, JPG, PNG (max 50MB each)
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          onChange={handleFileSelect}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Uploading files...
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground font-medium">
            {files.length} file{files.length !== 1 ? "s" : ""} selected
          </div>
          {files.map((f) => (
            <div
              key={f.file_id}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              {fileIcon(f.type)}
              <span className="flex-1 truncate">{f.filename}</span>
              <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              <span className="text-xs text-muted-foreground uppercase">{f.type}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRemoveFile(f.file_id)}
                aria-label={`Remove ${f.filename}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={files.length === 0}>
          Next: Extract Text
        </Button>
      </div>
    </div>
  );
}
