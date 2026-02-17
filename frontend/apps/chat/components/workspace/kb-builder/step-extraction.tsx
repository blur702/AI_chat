"use client";

import { useCallback } from "react";
import { Button } from "@workstation/ui";
import { Check, Eye, Loader2, AlertCircle } from "lucide-react";
import { EducationalCard } from "./educational-card";
import { FieldHelp } from "@/components/help/field-help";
import type { KBBulkUploadFileInfo, KBExtractPreviewResponse, ImageProcessingMethod } from "@workstation/api/types/kb";

interface StepExtractionProps {
  files: KBBulkUploadFileInfo[];
  extractions: Record<string, KBExtractPreviewResponse>;
  extracting: boolean;
  imageProcessing: Record<string, ImageProcessingMethod>;
  onExtractPreview: (fileId: string, method?: ImageProcessingMethod) => Promise<void>;
  onSetImageProcessing: (fileId: string, method: ImageProcessingMethod) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepExtraction({
  files, extractions, extracting, imageProcessing,
  onExtractPreview, onSetImageProcessing, onBack, onNext,
}: StepExtractionProps) {
  const extractedCount = Object.keys(extractions).length;
  const textFiles = files.filter((f) => f.type !== "image");
  const imageFiles = files.filter((f) => f.type === "image");

  const handleExtractAll = useCallback(async () => {
    if (extracting) return;
    for (const file of files) {
      if (extractions[file.file_id]) continue;
      const method = imageProcessing[file.file_id];
      if (method === "skip") continue;
      try {
        await onExtractPreview(file.file_id, method);
      } catch {
        // Continue processing remaining files even if one fails
      }
    }
  }, [files, extractions, imageProcessing, extracting, onExtractPreview]);

  return (
    <div className="space-y-4">
      <EducationalCard title="How text extraction works">
        <p>
          Different file types require different extraction methods. PDFs use text layer parsing,
          HTML is stripped of scripts and navigation, and CSV data is formatted as key-value records.
        </p>
        <p>
          For <strong>images</strong>, you can choose between <strong>OCR</strong> (Optical Character
          Recognition via Tesseract) which reads visible text, or <strong>Vision Models</strong>
          (like LLaVA) which describe the full image content including diagrams and charts.
        </p>
      </EducationalCard>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          Text Extraction
          <FieldHelp tip="How text is extracted from each file type" slug="kb-text-extraction" />
        </div>
        <div className="flex items-center gap-1">
          <FieldHelp tip="Extract text from all uploaded files at once" slug="kb-text-extraction" />
          <Button size="sm" variant="outline" onClick={handleExtractAll} disabled={extracting}>
            {extracting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Extract All
          </Button>
        </div>
      </div>

      {/* Image files with method selection */}
      {imageFiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            Image Files
            <FieldHelp tip="Choose OCR or Vision model for image processing" slug="kb-ocr-explained" />
          </div>
          {imageFiles.map((f) => {
            const method = imageProcessing[f.file_id] ?? "ocr";
            const extraction = extractions[f.file_id];
            return (
              <div key={f.file_id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm truncate">{f.filename}</span>
                  {extraction && <Check className="h-4 w-4 text-green-500" />}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={method}
                    onChange={(e) => onSetImageProcessing(f.file_id, e.target.value as ImageProcessingMethod)}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    aria-label={`Processing method for ${f.filename}`}
                  >
                    <option value="ocr">OCR (Tesseract)</option>
                    <option value="vision">Vision Model (LLaVA)</option>
                    <option value="skip">Skip</option>
                  </select>
                  <FieldHelp tip="Choose how images are processed" slug="kb-vision-models" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => void onExtractPreview(f.file_id, method).catch(() => {})}
                    disabled={extracting || method === "skip"}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Preview
                  </Button>
                </div>
                {extraction && (
                  <div className="rounded bg-muted/50 p-2 text-xs max-h-24 overflow-auto">
                    <div className="text-muted-foreground mb-1">
                      {extraction.char_count} chars via {extraction.extraction_method}
                    </div>
                    <pre className="whitespace-pre-wrap" aria-label={`Extracted text preview from ${f.filename}`}>{extraction.extracted_text.slice(0, 500)}</pre>
                    {extraction.extracted_text.length > 500 && (
                      <span className="text-muted-foreground">...truncated</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Text files */}
      {textFiles.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Text Files</div>
          {textFiles.map((f) => {
            const extraction = extractions[f.file_id];
            return (
              <div key={f.file_id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <span className="flex-1 text-sm truncate">{f.filename}</span>
                {extraction ? (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="h-3 w-3" />
                    {extraction.char_count.toLocaleString()} chars
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void onExtractPreview(f.file_id).catch(() => {})}
                    disabled={extracting}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Preview
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {extractedCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3 w-3" />
          {extractedCount} of {files.length} files extracted
        </div>
      )}

      {extractedCount === 0 && files.length > 0 && !extracting && (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <AlertCircle className="h-3 w-3" />
          Extract at least one file to preview, or skip to use defaults during build
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext}>Next: Chunking</Button>
      </div>
    </div>
  );
}
