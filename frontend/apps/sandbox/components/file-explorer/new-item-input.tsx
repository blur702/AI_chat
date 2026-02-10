"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@workstation/ui";
import { File, Folder } from "lucide-react";

interface NewItemInputProps {
  type: "file" | "directory";
  onSubmit: (name: string) => void;
  onCancel: () => void;
  depth: number;
  parentPath?: string;
}

export function NewItemInput({
  type,
  onSubmit,
  onCancel,
  depth,
  parentPath = "",
}: NewItemInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      const fullPath = parentPath ? `${parentPath}/${value.trim()}` : value.trim();
      onSubmit(fullPath);
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      {type === "directory" ? (
        <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
      ) : (
        <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="h-6 text-xs px-1 py-0"
        placeholder={type === "file" ? "filename.ext" : "folder name"}
      />
    </div>
  );
}
