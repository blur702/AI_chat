"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { EditorTabs } from "./editor-tabs";
import { MonacoWrapper } from "./monaco-editor";
import { getClient, MAX_EDITOR_FILE_SIZE } from "@workstation/api/client";
import { Badge, Button } from "@workstation/ui";
import { Save, AlertTriangle } from "lucide-react";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  savedContent: string;
  isLarge?: boolean;
  byteSize?: number;
}

interface EditorPaneProps {
  projectId: string | null;
  selectedFile: string | null;
  onFileOpened?: (path: string) => void;
}

export function EditorPane({ projectId, selectedFile, onFileOpened }: EditorPaneProps) {
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const filesRef = useRef(files);
  filesRef.current = files;

  const currentFile = files.find((f) => f.path === activeFile);

  // Open a file when selectedFile changes
  useEffect(() => {
    if (!selectedFile || !projectId) return;

    // Check if already open using ref to avoid stale closure
    if (filesRef.current.find((f) => f.path === selectedFile)) {
      setActiveFile(selectedFile);
      return;
    }

    // Fetch file content
    let cancelled = false;
    setLoadingFile(true);
    getClient()
      .getFileContent(projectId, selectedFile)
      .then((fc) => {
        if (cancelled) return;
        const name = selectedFile.includes("/")
          ? selectedFile.substring(selectedFile.lastIndexOf("/") + 1)
          : selectedFile;
        const byteSize = new Blob([fc.content]).size;
        const newFile: OpenFile = {
          path: fc.path,
          name,
          content: fc.content,
          language: fc.language,
          isDirty: false,
          savedContent: fc.content,
          isLarge: byteSize > MAX_EDITOR_FILE_SIZE,
          byteSize,
        };
        setFiles((prev) => [...prev, newFile]);
        setActiveFile(fc.path);
        onFileOpened?.(fc.path);
      })
      .catch((err) => {
        console.error(`Failed to load file: ${selectedFile}`, err);
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, projectId, onFileOpened]);

  const handleClose = useCallback(
    (path: string) => {
      setFiles((prev) => {
        const remaining = prev.filter((f) => f.path !== path);
        if (activeFile === path) {
          setActiveFile(remaining.length > 0 ? remaining[0].path : "");
        }
        return remaining;
      });
    },
    [activeFile]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined || !activeFile) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.path === activeFile ? { ...f, content: value, isDirty: value !== f.savedContent } : f
        )
      );
    },
    [activeFile]
  );

  const handleSave = useCallback(async () => {
    if (!currentFile || !projectId || !currentFile.isDirty) return;
    setSaving(true);
    try {
      await getClient().updateFile(projectId, currentFile.path, currentFile.content);
      setFiles((prev) =>
        prev.map((f) =>
          f.path === currentFile.path
            ? { ...f, isDirty: false, savedContent: f.content }
            : f
        )
      );
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setSaving(false);
    }
  }, [currentFile, projectId]);

  const handleLoadLargeFile = useCallback((path: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, isLarge: false } : f))
    );
  }, []);

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="flex h-full flex-col">
      <EditorTabs
        files={files.map((f) => ({
          path: f.path,
          name: f.name,
          isDirty: f.isDirty,
        }))}
        activeFile={activeFile}
        onSelect={setActiveFile}
        onClose={handleClose}
      />
      <div className="flex-1 relative">
        {currentFile ? (
          currentFile.isLarge ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-yellow-500" />
              <p className="text-sm font-medium">Large file detected</p>
              <p className="text-xs text-center max-w-sm">
                This file is {((currentFile.byteSize ?? 0) / (1024 * 1024)).toFixed(1)} MB.
                Loading it in the editor may affect performance.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLoadLargeFile(currentFile.path)}
              >
                Load anyway
              </Button>
            </div>
          ) : (
          <>
            <MonacoWrapper
              value={currentFile.content}
              language={currentFile.language}
              onChange={handleChange}
            />
            {/* Save status indicator */}
            <div className="absolute bottom-2 right-2 flex items-center gap-2">
              {saving && (
                <Badge variant="secondary" className="text-xs">
                  <Save className="mr-1 h-3 w-3 animate-pulse" />
                  Saving...
                </Badge>
              )}
              {currentFile.isDirty && !saving && (
                <Badge
                  variant="outline"
                  className="text-xs cursor-pointer hover:bg-muted"
                  onClick={handleSave}
                >
                  <Save className="mr-1 h-3 w-3" />
                  Unsaved
                </Badge>
              )}
            </div>
          </>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {loadingFile ? "Loading file..." : "No file open"}
          </div>
        )}
      </div>
    </div>
  );
}
