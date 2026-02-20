"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button, cn } from "@workstation/ui";
import { Save, X, FileCode } from "lucide-react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Loading editor...
    </div>
  ),
});

interface Props {
  path: string | null;
  content: string;
  language: string;
  modified: boolean;
  onSave: (content: string) => void;
  onClose: () => void;
}

export function DrupalEditorPane({ path, content, language, modified, onSave, onClose }: Props) {
  const [value, setValue] = useState(content);
  const editorRef = useRef<any>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Sync when file changes externally
  useEffect(() => {
    setValue(content);
  }, [content, path]);

  const handleSave = useCallback(() => {
    onSave(value);
  }, [value, onSave]);

  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2" role="status">
        <FileCode className="h-12 w-12 opacity-30" aria-hidden="true" />
        <p className="text-sm">Select a file to edit</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" role="region" aria-label={`Editor: ${path}`}>
      {/* Tab bar */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30 min-h-[36px]">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate max-w-[300px] font-mono text-xs">{path}</span>
          {modified && <span className="text-xs text-yellow-500">(unsaved)</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSave}
            title="Save (Ctrl+S)"
            disabled={!modified}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Monaco */}
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language === "twig" ? "html" : language}
          value={value}
          theme="vs-dark"
          onChange={(v) => setValue(v ?? "")}
          onMount={(editor) => {
            editorRef.current = editor;
            // Ctrl+S to save
            editor.addCommand(
              // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
              2048 | 49,
              () => {
                const currentValue = editor.getValue();
                onSaveRef.current(currentValue);
              }
            );
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
