/**
 * Manual mock for @dnd-kit/core used in vitest tests.
 *
 * The DndContext component captures its onDragEnd prop into the exported
 * `dndRef` so tests can invoke drag-end events programmatically.
 */
import React from "react";

export const dndRef = { onDragEnd: null as ((event: any) => void) | null };

export function DndContext({ children, onDragEnd }: any) {
  dndRef.onDragEnd = onDragEnd;
  return <div data-testid="dnd-context">{children}</div>;
}

export function DragOverlay({ children }: any) {
  return <div>{children}</div>;
}

export function useDraggable({ id }: any) {
  return {
    attributes: { "data-draggable-id": id },
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    isDragging: false,
  };
}

export function useDroppable({ id }: any) {
  return {
    setNodeRef: () => {},
    isOver: false,
  };
}

export class PointerSensor {}
export function useSensor() { return {}; }
export function useSensors() { return []; }
