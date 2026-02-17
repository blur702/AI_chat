"use client";

import { useState, useCallback } from "react";

type UploadField = "input_image" | "mask_image" | "target_image" | "reference_image" | "controlnet_image";

const MAX_UPLOAD_MB = 10;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface UseImageUploadReturn {
  previews: Record<UploadField, string | null>;
  uploadNames: Record<UploadField, string | null>;
  uploadError: string | null;
  processFile: (file: File, field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) => void;
  onImageUpload: (field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) => (event: React.DragEvent<HTMLDivElement>) => void;
  clearField: (field: UploadField) => void;
  resetAll: () => void;
  setPreviews: React.Dispatch<React.SetStateAction<Record<UploadField, string | null>>>;
  setUploadNames: React.Dispatch<React.SetStateAction<Record<UploadField, string | null>>>;
}

const EMPTY_PREVIEWS: Record<UploadField, string | null> = {
  input_image: null,
  mask_image: null,
  target_image: null,
  reference_image: null,
  controlnet_image: null,
};

const EMPTY_NAMES: Record<UploadField, string | null> = {
  input_image: null,
  mask_image: null,
  target_image: null,
  reference_image: null,
  controlnet_image: null,
};

export function useImageUpload(): UseImageUploadReturn {
  const [previews, setPreviews] = useState<Record<UploadField, string | null>>({ ...EMPTY_PREVIEWS });
  const [uploadNames, setUploadNames] = useState<Record<UploadField, string | null>>({ ...EMPTY_NAMES });
  const [uploadError, setUploadError] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File, field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) => {
      setUploadError(null);
      const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
      if (file.size > maxBytes) {
        setUploadError(`Image exceeds ${MAX_UPLOAD_MB}MB limit.`);
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setUploadError("Only PNG, JPEG, and WEBP are allowed.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        if (field === "input_image") {
          setPreviews((prev) => ({ ...prev, input_image: base64, mask_image: null }));
          setUploadNames((prev) => ({ ...prev, input_image: file.name, mask_image: null }));
        } else {
          setPreviews((prev) => ({ ...prev, [field]: base64 }));
          setUploadNames((prev) => ({ ...prev, [field]: file.name }));
        }
        onFormUpdate(field, base64);
      };
      reader.onerror = () => {
        setPreviews((prev) => ({ ...prev, [field]: null }));
        setUploadNames((prev) => ({ ...prev, [field]: null }));
        setUploadError("Failed to read image file. Please try again.");
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const onImageUpload = useCallback(
    (field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) processFile(file, field, onFormUpdate);
      },
    [processFile]
  );

  const onDrop = useCallback(
    (field: UploadField, onFormUpdate: (field: UploadField, base64: string) => void) =>
      (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) processFile(file, field, onFormUpdate);
      },
    [processFile]
  );

  const clearField = useCallback((field: UploadField) => {
    setPreviews((prev) => ({ ...prev, [field]: null }));
    setUploadNames((prev) => ({ ...prev, [field]: null }));
  }, []);

  const resetAll = useCallback(() => {
    setPreviews({ ...EMPTY_PREVIEWS });
    setUploadNames({ ...EMPTY_NAMES });
    setUploadError(null);
  }, []);

  return {
    previews,
    uploadNames,
    uploadError,
    processFile,
    onImageUpload,
    onDrop,
    clearField,
    resetAll,
    setPreviews,
    setUploadNames,
  };
}
