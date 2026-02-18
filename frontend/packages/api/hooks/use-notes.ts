"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  NoteResponse,
  NoteCreateRequest,
  NoteUpdateRequest,
  NoteCategoryResponse,
  NoteCategoryCreateRequest,
  NoteCategoryUpdateRequest,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseNotesReturn {
  notes: NoteResponse[];
  categories: NoteCategoryResponse[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  createNote: (data: NoteCreateRequest) => Promise<NoteResponse>;
  updateNote: (id: string, data: NoteUpdateRequest) => Promise<NoteResponse>;
  deleteNote: (id: string) => Promise<void>;
  completeNote: (id: string) => Promise<NoteResponse>;
  archiveNote: (id: string) => Promise<NoteResponse>;
  createCategory: (data: NoteCategoryCreateRequest) => Promise<NoteCategoryResponse>;
  updateCategory: (id: string, data: NoteCategoryUpdateRequest) => Promise<NoteCategoryResponse>;
  deleteCategory: (id: string) => Promise<void>;
}

export function useNotes(filters?: {
  project_id?: string;
  category_id?: string;
  status?: string;
}): UseNotesReturn {
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [categories, setCategories] = useState<NoteCategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listNotes(filters);
      setNotes(res.notes);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load notes"));
    } finally {
      setLoading(false);
    }
  }, [filters?.project_id, filters?.category_id, filters?.status]);

  const refreshCategories = useCallback(async () => {
    try {
      const res = await getClient().listNoteCategories();
      setCategories(res.categories);
    } catch (err) {
      // Silently ignore category load failures
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshCategories();
  }, [refresh, refreshCategories]);

  const createNote = useCallback(
    async (data: NoteCreateRequest): Promise<NoteResponse> => {
      try {
        setError(null);
        const result = await getClient().createNote(data);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create note"));
        throw err;
      }
    },
    [refresh],
  );

  const updateNote = useCallback(
    async (id: string, data: NoteUpdateRequest): Promise<NoteResponse> => {
      try {
        setError(null);
        const result = await getClient().updateNote(id, data);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update note"));
        throw err;
      }
    },
    [refresh],
  );

  const deleteNote = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await getClient().deleteNote(id);
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to delete note"));
        throw err;
      }
    },
    [refresh],
  );

  const completeNote = useCallback(
    async (id: string): Promise<NoteResponse> => {
      try {
        setError(null);
        const result = await getClient().completeNote(id);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to complete note"));
        throw err;
      }
    },
    [refresh],
  );

  const archiveNote = useCallback(
    async (id: string): Promise<NoteResponse> => {
      try {
        setError(null);
        const result = await getClient().archiveNote(id);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to archive note"));
        throw err;
      }
    },
    [refresh],
  );

  const createCategory = useCallback(
    async (data: NoteCategoryCreateRequest): Promise<NoteCategoryResponse> => {
      try {
        setError(null);
        const result = await getClient().createNoteCategory(data);
        await refreshCategories();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create category"));
        throw err;
      }
    },
    [refreshCategories],
  );

  const updateCategory = useCallback(
    async (id: string, data: NoteCategoryUpdateRequest): Promise<NoteCategoryResponse> => {
      try {
        setError(null);
        const result = await getClient().updateNoteCategory(id, data);
        await refreshCategories();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update category"));
        throw err;
      }
    },
    [refreshCategories],
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await getClient().deleteNoteCategory(id);
        await refreshCategories();
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to delete category"));
        throw err;
      }
    },
    [refreshCategories],
  );

  return {
    notes,
    categories,
    loading,
    error,
    refresh,
    refreshCategories,
    createNote,
    updateNote,
    deleteNote,
    completeNote,
    archiveNote,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
