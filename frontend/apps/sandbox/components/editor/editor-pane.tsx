"use client";

import { useState } from "react";
import { EditorTabs } from "./editor-tabs";
import { MonacoWrapper } from "./monaco-editor";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
}

const MOCK_FILES: OpenFile[] = [
  {
    path: "src/main.tsx",
    name: "main.tsx",
    language: "typescript",
    isDirty: false,
    content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './components/App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
  },
  {
    path: "src/components/App.tsx",
    name: "App.tsx",
    language: "typescript",
    isDirty: true,
    content: `import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className="p-4">
          <h1>Hello World</h1>
        </main>
      </div>
    </div>
  )
}`,
  },
];

export function EditorPane() {
  const [files, setFiles] = useState<OpenFile[]>(MOCK_FILES);
  const [activeFile, setActiveFile] = useState(MOCK_FILES[0].path);

  const currentFile = files.find((f) => f.path === activeFile);

  const handleClose = (path: string) => {
    setFiles((prev) => {
      const remaining = prev.filter((f) => f.path !== path);
      if (activeFile === path && remaining.length > 0) {
        setActiveFile(remaining[0].path);
      }
      return remaining;
    });
  };

  const handleChange = (value: string | undefined) => {
    if (value === undefined || !currentFile) return;
    setFiles((prev) =>
      prev.map((f) =>
        f.path === activeFile ? { ...f, content: value, isDirty: true } : f
      )
    );
  };

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
      <div className="flex-1">
        {currentFile ? (
          <MonacoWrapper
            value={currentFile.content}
            language={currentFile.language}
            onChange={handleChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No file open
          </div>
        )}
      </div>
    </div>
  );
}
