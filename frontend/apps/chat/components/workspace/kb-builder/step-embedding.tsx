"use client";

import { useEffect, useRef } from "react";
import { Button } from "@workstation/ui";
import { Loader2, RefreshCw } from "lucide-react";
import { EducationalCard } from "./educational-card";
import { FieldHelp } from "@/components/help/field-help";
import type { KBEmbeddingModelInfo } from "@workstation/api/types/kb";

interface StepEmbeddingProps {
  models: KBEmbeddingModelInfo[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  loadingModels: boolean;
  onLoadModels: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

export function StepEmbedding({
  models, selectedModel, onSelectModel,
  loadingModels, onLoadModels, onBack, onNext,
}: StepEmbeddingProps) {
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current && models.length === 0) {
      loadedRef.current = true;
      onLoadModels().catch(() => {
        loadedRef.current = false; // Allow retry on failure
      });
    }
  }, [models.length, onLoadModels]);

  return (
    <div className="space-y-4">
      <EducationalCard title="Vector embeddings explained">
        <p>
          An embedding model converts text into a high-dimensional vector (array of numbers).
          These vectors capture <em>semantic meaning</em> — similar texts produce similar vectors.
        </p>
        <p>
          <strong>Cosine similarity</strong> measures the angle between two vectors:
          cos(&theta;) = (A&middot;B) / (||A|| &times; ||B||). A value of 1.0 means identical
          meaning, 0.0 means unrelated.
        </p>
        <p>
          <strong>Dimensions</strong> (e.g. 768, 1024) indicate the vector size. More dimensions
          can capture finer distinctions but use more storage. nomic-embed-text uses 1024 dimensions.
        </p>
      </EducationalCard>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          Embedding Model
          <FieldHelp tip="The embedding model converts each text chunk into a numeric vector for semantic search. nomic-embed-text (1024d) is recommended for most use cases; larger models may capture finer distinctions." slug="kb-embedding-models" />
        </div>
        <div className="flex items-center gap-1">
          <FieldHelp tip="Re-queries the Ollama API for available embedding models. Use this after pulling a new embedding model to see it appear in the list." slug="kb-embedding-models" />
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onLoadModels} disabled={loadingModels}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingModels ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loadingModels ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading models from Ollama...
        </div>
      ) : models.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No models found. Make sure Ollama is running and has embedding models pulled.
        </div>
      ) : (
        <div className="space-y-1.5">
          {models.map((model) => {
            const isSelected = selectedModel === model.name;
            return (
              <div key={model.name} className="flex items-start gap-1">
                <button
                  type="button"
                  onClick={() => onSelectModel(model.name)}
                  aria-pressed={isSelected}
                  className={`
                    flex-1 text-left rounded-md border p-3 transition-colors
                    ${isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{model.name}</span>
                    {isSelected && (
                      <span className="text-xs text-primary font-medium">Selected</span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {model.parameter_size && <span>Params: {model.parameter_size}</span>}
                    {model.embedding_length && <span>Dimensions: {model.embedding_length}</span>}
                    {model.size && <span>Size: {model.size}</span>}
                  </div>
                </button>
                {model.embedding_length && (
                  <FieldHelp tip="The number of dimensions in the output vector. More dimensions (768, 1024) can capture finer semantic distinctions but use more storage. This value is fixed per model." slug="kb-embedding-dimensions" className="mt-3 inline-flex text-muted-foreground hover:text-foreground transition-colors" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!selectedModel}>
          Next: Review & Build
        </Button>
      </div>
    </div>
  );
}
