"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@workstation/ui";
import { FieldHelp } from "@/components/help/field-help";

interface MaskEditorProps {
  inputImagePreview: string | null;
  maskImagePreview: string | null;
  onMaskChange: (dataUrl: string) => void;
  onMaskClear: () => void;
}

function createImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export function MaskEditor({
  inputImagePreview,
  maskImagePreview,
  onMaskChange,
  onMaskClear,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [maskTool, setMaskTool] = useState<"paint" | "erase">("paint");
  const [editorError, setEditorError] = useState<string | null>(null);

  const pushCanvasMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onMaskChange(dataUrl);
  }, [onMaskChange]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const paintStroke = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = maskTool === "paint" ? "#FFFFFF" : "#000000";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = point;
    paintStroke(point, point);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = getCanvasPoint(event);
    if (!point || !lastPointRef.current) return;
    event.preventDefault();
    paintStroke(lastPointRef.current, point);
    lastPointRef.current = point;
  };

  const finishDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    pushCanvasMask();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onMaskClear();
  };

  // Initialize canvas when input image loads
  useEffect(() => {
    const setup = async () => {
      if (!inputImagePreview) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        setEditorError(null);
        const baseImage = await createImageElement(inputImagePreview);
        canvas.width = baseImage.naturalWidth;
        canvas.height = baseImage.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (maskImagePreview) {
          const maskImage = await createImageElement(maskImagePreview);
          ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
        }
      } catch {
        setEditorError("Could not initialize the inpaint mask editor.");
      }
    };

    void setup();
  }, [inputImagePreview, maskImagePreview]);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1">
          Inpaint Mask Editor <FieldHelp slug="imagegen-mask-editor" tip="Paint regions to regenerate" />
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={maskTool === "paint" ? "secondary" : "ghost"}
            className="h-6 text-[11px]"
            onClick={() => setMaskTool("paint")}
          >
            Paint
          </Button>
          <Button
            type="button"
            size="sm"
            variant={maskTool === "erase" ? "secondary" : "ghost"}
            className="h-6 text-[11px]"
            onClick={() => setMaskTool("erase")}
          >
            Erase
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <label className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          Brush: {brushSize}px
          <FieldHelp
            slug="imagegen-mask-editor"
            tip="Brush size controls how wide each inpaint mask stroke is."
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-[11px]"
          onClick={clearCanvas}
        >
          Clear mask
        </Button>
      </div>
      <input
        type="range"
        min={4}
        max={128}
        step={2}
        value={brushSize}
        onChange={(event) => setBrushSize(Number(event.target.value))}
        className="w-full"
      />
      {inputImagePreview ? (
        <div className="relative overflow-hidden rounded-md border bg-black/40">
          <img
            src={inputImagePreview}
            alt="Inpaint input preview"
            className="block w-full h-auto select-none pointer-events-none"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none cursor-crosshair opacity-50"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDraw}
            onPointerCancel={finishDraw}
            onPointerLeave={finishDraw}
          />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Upload an input image first to paint an inpainting mask.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Paint white to regenerate areas, erase back to black to keep the original image.
      </p>
      {editorError && (
        <p className="text-[11px] text-destructive">{editorError}</p>
      )}
    </div>
  );
}
