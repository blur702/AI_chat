"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  PlanningSession,
  PlanningSessionDetail,
  PlanPhase,
  PlanTask,
  PlanProgress,
  PlanningSessionCreateRequest,
  PlanPhaseCreateRequest,
  PlanTaskCreateRequest,
} from "../types/planning";
import { extractErrorMessage } from "../utils/error";

export interface UsePlanningReturn {
  sessions: PlanningSession[];
  selectedSession: PlanningSessionDetail | null;
  progress: PlanProgress | null;
  loading: boolean;
  error: string | null;

  // Session operations
  loadSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  createSession: (data: PlanningSessionCreateRequest) => Promise<PlanningSessionDetail | null>;
  updateSession: (sessionId: string, data: Partial<PlanningSession>) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  startSession: (sessionId: string) => Promise<void>;
  nextPhase: (sessionId: string) => Promise<void>;

  // Phase operations
  createPhase: (sessionId: string, data: PlanPhaseCreateRequest) => Promise<void>;
  updatePhase: (phaseId: string, data: Partial<PlanPhase>) => Promise<void>;
  approvePhase: (phaseId: string) => Promise<void>;
  verifyPhase: (phaseId: string) => Promise<void>;
  deletePhase: (phaseId: string) => Promise<void>;

  // Task operations
  createTask: (phaseId: string, data: PlanTaskCreateRequest) => Promise<void>;
  updateTask: (taskId: string, data: Partial<PlanTask>) => Promise<void>;
  executeTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // UI Builder integration
  exportToUIBuilder: (sessionId: string) => Promise<Record<string, unknown>[] | null>;
  importFromUIBuilder: (sessionId: string, uiTree: Record<string, unknown>[]) => Promise<void>;
}

/**
 * Manages planning sessions, phases, and tasks for a project, including UI builder import/export.
 * @param projectId - The project whose planning sessions to manage.
 * @returns Session/phase/task CRUD functions, selected session with progress, and loading/error state.
 */
export function usePlanning(projectId: string): UsePlanningReturn {
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<PlanningSessionDetail | null>(null);
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = getClient();

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await client.get(`/planning/sessions?project_id=${projectId}`);
      setSessions(res.data as PlanningSession[]);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load planning sessions"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await client.get(`/planning/sessions/${sessionId}`);
      setSelectedSession(res.data as PlanningSessionDetail);
      // Also load progress
      const progressRes = await client.get(`/planning/sessions/${sessionId}/progress`);
      setProgress(progressRes.data as PlanProgress);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load session"));
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback(async (data: PlanningSessionCreateRequest): Promise<PlanningSessionDetail | null> => {
    try {
      setError(null);
      const res = await client.post("/planning/sessions", data);
      const session = res.data as PlanningSessionDetail;
      await loadSessions();
      setSelectedSession(session);
      return session;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create session"));
      return null;
    }
  }, [loadSessions]);

  const updateSession = useCallback(async (sessionId: string, data: Partial<PlanningSession>) => {
    try {
      setError(null);
      const res = await client.put(`/planning/sessions/${sessionId}`, data);
      setSelectedSession(res.data as PlanningSessionDetail);
      await loadSessions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update session"));
    }
  }, [loadSessions]);

  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      await client.delete(`/planning/sessions/${sessionId}`);
      setSelectedSession(null);
      await loadSessions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to archive session"));
    }
  }, [loadSessions]);

  const startSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      const res = await client.post(`/planning/sessions/${sessionId}/start`);
      setSelectedSession(res.data as PlanningSessionDetail);
      await loadSessions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start session"));
    }
  }, [loadSessions]);

  const nextPhase = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      const res = await client.post(`/planning/sessions/${sessionId}/next-phase`);
      setSelectedSession(res.data as PlanningSessionDetail);
      await loadSessions();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to advance to next phase"));
    }
  }, [loadSessions]);

  // Phase operations
  const createPhase = useCallback(async (sessionId: string, data: PlanPhaseCreateRequest) => {
    try {
      setError(null);
      await client.post(`/planning/sessions/${sessionId}/phases`, data);
      await loadSession(sessionId);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create phase"));
    }
  }, [loadSession]);

  const updatePhase = useCallback(async (phaseId: string, data: Partial<PlanPhase>) => {
    try {
      setError(null);
      await client.put(`/planning/phases/${phaseId}`, data);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update phase"));
    }
  }, [selectedSession, loadSession]);

  const approvePhase = useCallback(async (phaseId: string) => {
    try {
      setError(null);
      await client.post(`/planning/phases/${phaseId}/approve`);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to approve phase"));
    }
  }, [selectedSession, loadSession]);

  const verifyPhase = useCallback(async (phaseId: string) => {
    try {
      setError(null);
      await client.post(`/planning/phases/${phaseId}/verify`);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to verify phase"));
    }
  }, [selectedSession, loadSession]);

  const deletePhase = useCallback(async (phaseId: string) => {
    try {
      setError(null);
      await client.delete(`/planning/phases/${phaseId}`);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete phase"));
    }
  }, [selectedSession, loadSession]);

  // Task operations
  const createTask = useCallback(async (phaseId: string, data: PlanTaskCreateRequest) => {
    try {
      setError(null);
      await client.post(`/planning/phases/${phaseId}/tasks`, data);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create task"));
    }
  }, [selectedSession, loadSession]);

  const updateTask = useCallback(async (taskId: string, data: Partial<PlanTask>) => {
    try {
      setError(null);
      await client.put(`/planning/tasks/${taskId}`, data);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update task"));
    }
  }, [selectedSession, loadSession]);

  const executeTask = useCallback(async (taskId: string) => {
    try {
      setError(null);
      await client.post(`/planning/tasks/${taskId}/execute`);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to execute task"));
    }
  }, [selectedSession, loadSession]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      setError(null);
      await client.delete(`/planning/tasks/${taskId}`);
      if (selectedSession) await loadSession(selectedSession.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete task"));
    }
  }, [selectedSession, loadSession]);

  // UI Builder integration
  const exportToUIBuilder = useCallback(async (sessionId: string): Promise<Record<string, unknown>[] | null> => {
    try {
      setError(null);
      const res = await client.post(`/planning/sessions/${sessionId}/export-to-ui-builder`);
      return (res.data as { ui_tree: Record<string, unknown>[] }).ui_tree;
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to export to UI builder"));
      return null;
    }
  }, []);

  const importFromUIBuilder = useCallback(async (sessionId: string, uiTree: Record<string, unknown>[]) => {
    try {
      setError(null);
      await client.post(`/planning/sessions/${sessionId}/import-from-ui-builder`, { ui_tree: uiTree });
      await loadSession(sessionId);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to import from UI builder"));
    }
  }, [loadSession]);

  // Auto-load on mount
  useEffect(() => {
    if (projectId) {
      loadSessions();
    }
  }, [projectId, loadSessions]);

  return {
    sessions,
    selectedSession,
    progress,
    loading,
    error,
    loadSessions,
    loadSession,
    createSession,
    updateSession,
    archiveSession,
    startSession,
    nextPhase,
    createPhase,
    updatePhase,
    approvePhase,
    verifyPhase,
    deletePhase,
    createTask,
    updateTask,
    executeTask,
    deleteTask,
    exportToUIBuilder,
    importFromUIBuilder,
  };
}
