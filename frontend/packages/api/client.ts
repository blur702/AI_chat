import type {
  VRAMStats,
  Resource,
  ResourceStatusResponse,
  PreemptionCheckRequest,
  PreemptionCheckResponse,
  OffloadDecisionRequest,
  OffloadDecisionResponse,
  ReloadRequest,
  PreferenceRequest,
  PreferenceResponse,
  OperationStateRequest,
  OperationStateResponse,
  OperationListResponse,
  EventCreate,
  EventResponse,
  EventListResponse,
  ToolInfo,
  ToolListResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  CacheClearRequest,
  CacheClearResponse,
  ConversationState,
  ProjectContext,
  ChatListResponse,
  UserPreferences,
  TokenUsageRequest,
  TokenUsageResponse,
  KernelDebug,
  KernelMetrics,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

export class WorkstationClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => undefined);
      throw new ApiError(response.status, response.statusText, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Health
  async health(): Promise<Record<string, unknown>> {
    return this.request("/health");
  }

  async kernelHealth(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/health");
  }

  async kernelStatus(): Promise<Record<string, unknown>> {
    return this.request("/api/kernel/status");
  }

  // Resources
  async getVRAMStats(): Promise<VRAMStats> {
    return this.request("/api/resources/vram");
  }

  async getResources(): Promise<Resource[]> {
    return this.request("/api/resources/loaded");
  }

  async getResourceStatus(): Promise<ResourceStatusResponse> {
    return this.request("/api/resources/status");
  }

  async checkPreemption(
    data: PreemptionCheckRequest
  ): Promise<PreemptionCheckResponse> {
    return this.request("/api/resources/preemption-check", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async submitOffloadDecision(
    data: OffloadDecisionRequest
  ): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/offload-decision", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async reloadResource(
    data: ReloadRequest
  ): Promise<OffloadDecisionResponse> {
    return this.request("/api/resources/reload", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async setPreference(data: PreferenceRequest): Promise<PreferenceResponse> {
    return this.request("/api/resources/preferences", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPreference(userId: string): Promise<PreferenceResponse> {
    return this.request(`/api/resources/preferences/${userId}`);
  }

  // Operations
  async saveOperationState(
    data: OperationStateRequest
  ): Promise<OperationStateResponse> {
    return this.request("/api/operations/state", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOperationState(
    operationId: string
  ): Promise<OperationStateResponse> {
    return this.request(`/api/operations/state/${operationId}`);
  }

  async listOperations(
    limit?: number,
    offset?: number
  ): Promise<OperationListResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    return this.request(`/api/operations?${params}`);
  }

  // Events
  async createEvent(data: EventCreate): Promise<EventResponse> {
    return this.request("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getEvents(params?: {
    event_type?: string;
    severity?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<EventListResponse> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    return this.request(`/api/events?${searchParams}`);
  }

  async getEvent(eventId: string): Promise<EventResponse> {
    return this.request(`/api/events/${eventId}`);
  }

  // Tools
  async listTools(): Promise<ToolListResponse> {
    return this.request("/api/tools");
  }

  async getTool(toolName: string): Promise<ToolInfo> {
    return this.request(`/api/tools/${toolName}`);
  }

  async executeTool(data: ToolExecuteRequest): Promise<ToolExecuteResponse> {
    return this.request("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async clearCache(data: CacheClearRequest): Promise<CacheClearResponse> {
    return this.request("/api/tools/cache/clear", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Context
  async getConversationState(chatId: string): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`);
  }

  async updateConversationState(
    chatId: string,
    updates: Record<string, unknown>
  ): Promise<ConversationState> {
    return this.request(`/api/context/conversations/${chatId}`, {
      method: "PATCH",
      body: JSON.stringify({ updates }),
    });
  }

  async getProjectContext(projectId: string): Promise<ProjectContext> {
    return this.request(`/api/context/projects/${projectId}`);
  }

  async getProjectChats(projectId: string): Promise<ChatListResponse> {
    return this.request(`/api/context/projects/${projectId}/chats`);
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return this.request(`/api/context/users/${userId}/preferences`);
  }

  async trackTokenUsage(
    chatId: string,
    data: TokenUsageRequest
  ): Promise<TokenUsageResponse> {
    return this.request(`/api/context/conversations/${chatId}/tokens`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Admin
  async getKernelDebug(): Promise<KernelDebug> {
    return this.request("/api/admin/kernel/debug");
  }

  async getKernelMetrics(): Promise<KernelMetrics> {
    return this.request("/api/admin/kernel/metrics");
  }
}

// Singleton client instance
let clientInstance: WorkstationClient | null = null;

export function getClient(): WorkstationClient {
  if (!clientInstance) {
    clientInstance = new WorkstationClient();
  }
  return clientInstance;
}
