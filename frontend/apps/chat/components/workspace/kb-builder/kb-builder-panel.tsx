"use client";

import { useState, useCallback } from "react";
import { X, GraduationCap } from "lucide-react";
import { Button } from "@workstation/ui";
import { useKBBuilder } from "@workstation/api/hooks";
import { WizardStepper } from "./wizard-stepper";
import { StepDocuments } from "./step-documents";
import { StepExtraction } from "./step-extraction";
import { StepChunking } from "./step-chunking";
import { StepEmbedding } from "./step-embedding";
import { StepReview } from "./step-review";

interface KBBuilderPanelProps {
  projectId: string;
  onClose: () => void;
}

const STEPS = ["Select", "Extract", "Chunk", "Embed", "Build"];

export function KBBuilderPanel({ projectId, onClose }: KBBuilderPanelProps) {
  const [step, setStep] = useState(1);
  const builder = useKBBuilder();

  const handleStepClick = useCallback((s: number) => {
    // Allow going back or to completed steps
    if (s <= step) setStep(s);
  }, [step]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">KB Builder Wizard</h2>
            <p className="text-xs text-muted-foreground">Build a vector knowledge base step-by-step</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Stepper */}
      <div className="border-b px-4 py-2">
        <WizardStepper currentStep={step} steps={STEPS} onStepClick={handleStepClick} />
      </div>

      {/* Error bar */}
      {builder.error && (
        <div className="mx-4 mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {builder.error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 1 && (
          <StepDocuments
            files={builder.files}
            uploading={builder.uploading}
            onAddFiles={builder.addFiles}
            onRemoveFile={builder.removeFile}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepExtraction
            files={builder.files}
            extractions={builder.extractions}
            extracting={builder.extracting}
            imageProcessing={builder.imageProcessing}
            onExtractPreview={builder.extractPreview}
            onSetImageProcessing={builder.setImageProcessing}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepChunking
            chunkSettings={builder.chunkSettings}
            onSetChunkSettings={builder.setChunkSettings}
            chunkPreviewResult={builder.chunkPreviewResult}
            chunking={builder.chunking}
            extractions={builder.extractions}
            onChunkPreview={builder.chunkPreview}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <StepEmbedding
            models={builder.embeddingModels}
            selectedModel={builder.selectedModel}
            onSelectModel={builder.setSelectedModel}
            loadingModels={builder.loadingModels}
            onLoadModels={builder.loadModels}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}

        {step === 5 && (
          <StepReview
            files={builder.files}
            chunkSettings={builder.chunkSettings}
            selectedModel={builder.selectedModel}
            scope={builder.scope}
            onSetScope={builder.setScope}
            building={builder.building}
            batchStatus={builder.batchStatus}
            onStartBuild={() => builder.startBuild(projectId)}
            onBack={() => setStep(4)}
            onReset={() => {
              builder.reset();
              setStep(1);
            }}
            extractions={builder.extractions}
            embeddingModels={builder.embeddingModels}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}
