"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { UIComponentInfo } from "@workstation/api/types";

export interface BuilderNode {
  id: string;
  componentId: string;
  componentName: string;
  props: Record<string, unknown>;
  children: BuilderNode[];
}

export interface UseUIBuilderStateReturn {
  tree: BuilderNode[];
  selectedNodeId: string | null;
  selectNode: (nodeId: string | null) => void;
  addNode: (component: UIComponentInfo, parentId?: string) => string;
  removeNode: (nodeId: string) => void;
  moveNode: (nodeId: string, newParentId: string | null, index: number) => void;
  updateNodeProps: (nodeId: string, props: Record<string, unknown>) => void;
  getNode: (nodeId: string) => BuilderNode | null;
  clearTree: () => void;
  generateHTML: () => string;
  /** Push the current builder HTML to the preview iframe */
  syncToPreview: () => void;
}

function findNode(nodes: BuilderNode[], id: string): BuilderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function removeNodeFromTree(nodes: BuilderNode[], id: string): BuilderNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({
      ...n,
      children: removeNodeFromTree(n.children, id),
    }));
}

function insertNode(
  nodes: BuilderNode[],
  parentId: string | null,
  node: BuilderNode,
  index: number
): BuilderNode[] {
  if (parentId === null) {
    const result = [...nodes];
    result.splice(index, 0, node);
    return result;
  }
  return nodes.map((n) => {
    if (n.id === parentId) {
      const children = [...n.children];
      children.splice(index, 0, node);
      return { ...n, children };
    }
    return { ...n, children: insertNode(n.children, parentId, node, index) };
  });
}

function resolveTemplate(template: string, props: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = props[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

function nodeToHTML(node: BuilderNode, components: Map<string, UIComponentInfo>): string {
  const comp = components.get(node.componentId);
  if (!comp) return `<!-- unknown component ${node.componentName} -->`;

  const childHTML = node.children.map((c) => nodeToHTML(c, components)).join("\n");
  const propsWithChildren = { ...node.props, children: childHTML };
  return resolveTemplate(comp.html_template, propsWithChildren);
}

export function useUIBuilderState(
  availableComponents: UIComponentInfo[]
): UseUIBuilderStateReturn {
  const [tree, setTree] = useState<BuilderNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const componentMap = useRef(new Map<string, UIComponentInfo>());
  const idRef = useRef(1);

  const generateId = useCallback((): string => {
    const id = `node-${idRef.current}`;
    idRef.current += 1;
    return id;
  }, []);

  // Keep component map in sync
  useEffect(() => {
    const map = new Map<string, UIComponentInfo>();
    for (const c of availableComponents) {
      map.set(c.id, c);
    }
    componentMap.current = map;
  }, [availableComponents]);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const addNode = useCallback(
    (component: UIComponentInfo, parentId?: string) => {
      const id = generateId();
      // Extract default prop values from schema
      const defaultProps: Record<string, unknown> = {};
      const schema = component.props_schema;
      if (schema && typeof schema === "object" && "properties" in schema) {
        const props = (schema as { properties: Record<string, { default?: unknown }> }).properties;
        for (const [key, def] of Object.entries(props)) {
          if (def.default !== undefined) {
            defaultProps[key] = def.default;
          }
        }
      }

      const node: BuilderNode = {
        id,
        componentId: component.id,
        componentName: component.name,
        props: defaultProps,
        children: [],
      };

      setTree((prev) => {
        if (parentId) {
          return insertNode(prev, parentId, node, Infinity);
        }
        return [...prev, node];
      });

      setSelectedNodeId(id);
      return id;
    },
    [generateId]
  );

  const removeNode = useCallback((nodeId: string) => {
    setTree((prev) => removeNodeFromTree(prev, nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const moveNode = useCallback(
    (nodeId: string, newParentId: string | null, index: number) => {
      setTree((prev) => {
        const node = findNode(prev, nodeId);
        if (!node) return prev;
        const cleaned = removeNodeFromTree(prev, nodeId);
        return insertNode(cleaned, newParentId, node, index);
      });
    },
    []
  );

  const updateNodeProps = useCallback(
    (nodeId: string, props: Record<string, unknown>) => {
      setTree((prev) => {
        const update = (nodes: BuilderNode[]): BuilderNode[] =>
          nodes.map((n) => {
            if (n.id === nodeId) {
              return { ...n, props: { ...n.props, ...props } };
            }
            return { ...n, children: update(n.children) };
          });
        return update(prev);
      });
    },
    []
  );

  const getNode = useCallback(
    (nodeId: string) => findNode(tree, nodeId),
    [tree]
  );

  const clearTree = useCallback(() => {
    setTree([]);
    setSelectedNodeId(null);
  }, []);

  const generateHTML = useCallback(() => {
    return tree.map((n) => nodeToHTML(n, componentMap.current)).join("\n");
  }, [tree]);

  // Push current builder state to the preview iframe via postMessage
  const syncToPreview = useCallback(() => {
    if (tree.length === 0) {
      window.postMessage({ type: "builder-update", action: "clear" }, window.location.origin);
    } else {
      const html = tree.map((n) => nodeToHTML(n, componentMap.current)).join("\n");
      window.postMessage({ type: "builder-update", action: "set-html", html }, window.location.origin);
    }
  }, [tree]);

  // Auto-sync to preview whenever the tree changes
  useEffect(() => {
    syncToPreview();
  }, [syncToPreview]);

  return {
    tree,
    selectedNodeId,
    selectNode,
    addNode,
    removeNode,
    moveNode,
    updateNodeProps,
    getNode,
    clearTree,
    generateHTML,
    syncToPreview,
  };
}
