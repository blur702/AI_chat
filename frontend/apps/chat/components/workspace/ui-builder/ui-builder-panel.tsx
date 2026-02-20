"use client";

import { useState, useCallback } from "react";
import { Button, Badge } from "@workstation/ui";
import {
  X,
  Code2,
  Eye,
  Trash2,
  Copy,
  RotateCcw,
  Send,
} from "lucide-react";
import { useUIComponents } from "@workstation/api/hooks";
import { ComponentPalette } from "./component-palette";
import { PropertiesEditor } from "./properties-editor";
import { useUIBuilderState } from "./use-ui-builder-state";
import type { UIComponentInfo } from "@workstation/api/types";
import type { BuilderNode } from "./use-ui-builder-state";

interface UIBuilderPanelProps {
  onClose?: () => void;
}

export function UIBuilderPanel({ onClose }: UIBuilderPanelProps) {
  const { components, categories, loading } = useUIComponents();
  const builder = useUIBuilderState(components);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedNode = builder.selectedNodeId
    ? builder.getNode(builder.selectedNodeId)
    : null;

  const selectedComponent = selectedNode
    ? components.find((c) => c.id === selectedNode.componentId)
    : null;

  const handleDragStart = useCallback((_component: UIComponentInfo) => {
    // Future: visual feedback during drag
  }, []);

  const handleAddComponent = useCallback(
    (component: UIComponentInfo) => {
      // If a layout component is selected, add as child; otherwise add to root
      const parentId =
        builder.selectedNodeId && selectedComponent?.category === "layout"
          ? builder.selectedNodeId
          : undefined;
      builder.addNode(component, parentId);
    },
    [builder, selectedComponent]
  );

  const handleCopyHTML = useCallback(async () => {
    try {
      const html = builder.generateHTML();
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopied(false);
      console.error("Failed to copy generated HTML", err);
    }
  }, [builder]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">UI Builder</h3>
          <Badge variant="secondary" className="text-[10px]">
            {builder.tree.length} component{builder.tree.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {builder.tree.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={builder.syncToPreview}
              aria-label="Push to Preview"
              title="Push to Preview"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowCode((prev) => !prev)}
            aria-label={showCode ? "Show palette" : "Show code"}
          >
            {showCode ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
          </Button>
          {builder.tree.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={builder.clearTree}
              aria-label="Clear all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              aria-label="Close UI Builder"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {showCode ? (
          /* Code Preview */
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Generated HTML
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[10px]"
                onClick={handleCopyHTML}
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <pre className="flex-1 overflow-auto p-3 text-[11px] font-mono text-muted-foreground bg-muted/30">
              {builder.tree.length > 0
                ? builder.generateHTML()
                : "<!-- Add components from the palette to generate HTML -->"}
            </pre>
          </div>
        ) : (
          <>
            {/* Left: Component Palette */}
            <div className="w-1/2 border-r overflow-hidden">
              <ComponentPalette
                components={components}
                categories={categories}
                loading={loading}
                onDragStart={handleDragStart}
                onAdd={handleAddComponent}
              />
            </div>

            {/* Right: Tree + Properties */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              {/* Component tree */}
              <div className="border-b p-2 overflow-y-auto max-h-[40%]">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Component Tree
                </p>
                {builder.tree.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Click a component to add it.
                  </p>
                ) : (
                  <TreeView
                    nodes={builder.tree}
                    selectedId={builder.selectedNodeId}
                    onSelect={builder.selectNode}
                    depth={0}
                  />
                )}
              </div>

              {/* Properties editor */}
              <div className="flex-1 overflow-hidden">
                {selectedNode && selectedComponent ? (
                  <PropertiesEditor
                    node={selectedNode}
                    propsSchema={selectedComponent.props_schema}
                    onUpdate={(props) =>
                      builder.updateNodeProps(selectedNode.id, props)
                    }
                    onRemove={() => builder.removeNode(selectedNode.id)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-xs text-muted-foreground text-center">
                      Select a component to edit its properties.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Inline TreeView ---- */

function TreeView({
  nodes,
  selectedId,
  onSelect,
  depth,
}: {
  nodes: BuilderNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth: number;
}) {
  return (
    <ul className="space-y-0.5" style={{ paddingLeft: depth * 12 }}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate ${
              selectedId === node.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground hover:bg-muted"
            }`}
          >
            {node.componentName}
          </button>
          {node.children.length > 0 && (
            <TreeView
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
