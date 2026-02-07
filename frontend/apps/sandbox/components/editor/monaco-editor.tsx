"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Loading editor...
    </div>
  ),
});

interface MonacoWrapperProps {
  value: string;
  language: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
}

export function MonacoWrapper({
  value,
  language,
  onChange,
  readOnly = false,
}: MonacoWrapperProps) {
  return (
    <Editor
      height="100%"
      language={language === "typescript" ? "typescript" : language}
      value={value}
      onChange={onChange}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        readOnly,
        padding: { top: 8 },
        renderLineHighlight: "line",
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
      }}
    />
  );
}
