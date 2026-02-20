"use client";

import { useState, useEffect, useCallback } from "react";
import { getClient } from "../client";
import type {
  IssueResponse,
  IssueCreateRequest,
  IssueUpdateRequest,
  IssueListResponse,
  StartFixResponse,
} from "../types";
import { extractErrorMessage } from "../utils/error";

export interface UseIssuesReturn {
  issues: IssueResponse[];
  count: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createIssue: (data: IssueCreateRequest) => Promise<IssueResponse>;
  updateIssue: (id: string, data: IssueUpdateRequest) => Promise<IssueResponse>;
  deleteIssue: (id: string) => Promise<void>;
  startFix: (id: string) => Promise<StartFixResponse>;
  getReviewStatus: (id: string) => Promise<{
    issue_id: string;
    status: string;
    fix_pr_url: string | null;
    coderabbit_review_url: string | null;
    has_pr: boolean;
  }>;
  scanProjectIssues: (projectId: string) => Promise<IssueListResponse>;
}

export function useIssues(filters?: {
  project_id?: string;
  is_app_issue?: boolean;
  status?: string;
  severity?: string;
}): UseIssuesReturn {
  const [issues, setIssues] = useState<IssueResponse[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getClient().listIssues(filters);
      setIssues(res.issues);
      setCount(res.count);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load bugs"));
    } finally {
      setLoading(false);
    }
  }, [filters?.project_id, filters?.is_app_issue, filters?.status, filters?.severity]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createIssue = useCallback(
    async (data: IssueCreateRequest): Promise<IssueResponse> => {
      try {
        setError(null);
        const result = await getClient().createIssue(data);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to create bug"));
        throw err;
      }
    },
    [refresh],
  );

  const updateIssue = useCallback(
    async (id: string, data: IssueUpdateRequest): Promise<IssueResponse> => {
      try {
        setError(null);
        const result = await getClient().updateIssue(id, data);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to update bug"));
        throw err;
      }
    },
    [refresh],
  );

  const deleteIssue = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await getClient().deleteIssue(id);
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to delete bug"));
        throw err;
      }
    },
    [refresh],
  );

  const startFix = useCallback(
    async (id: string): Promise<StartFixResponse> => {
      try {
        setError(null);
        const result = await getClient().startIssueFix(id);
        await refresh();
        return result;
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to start fix"));
        throw err;
      }
    },
    [refresh],
  );

  const getReviewStatus = useCallback(async (id: string) => {
    return getClient().getIssueReviewStatus(id);
  }, []);

  const scanProjectIssues = useCallback(async (projectId: string) => {
    return getClient().scanProjectIssues(projectId);
  }, []);

  return {
    issues,
    count,
    loading,
    error,
    refresh,
    createIssue,
    updateIssue,
    deleteIssue,
    startFix,
    getReviewStatus,
    scanProjectIssues,
  };
}
