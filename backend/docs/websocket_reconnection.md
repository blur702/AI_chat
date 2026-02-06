# WebSocket Reconnection and State Recovery

This document describes the WebSocket authentication, state recovery, and reconnection strategies for the AI Workstation frontend.

## Connection URL

```
ws://localhost:8001/api/ws/events?token={jwt_token}
wss://localhost:8443/api/ws/events?token={jwt_token}  # Production (HTTPS)
```

## Authentication Flow

1. **Obtain JWT Token**: Client authenticates via the REST API to obtain a JWT token
2. **Connect with Token**: Token is passed as a query parameter on WebSocket connection
3. **Server Validation**: Server validates the token and extracts user identity
4. **Connection Confirmation**: On success, server sends `connected` message with connection ID
5. **State Snapshot**: Server immediately sends `state_snapshot` message with current system state

### Token Requirements

- Token must contain a `user_id` claim (UUID format)
- Token must not be expired
- Token is validated using the same `SECRET_KEY` as the REST API

### Authentication Errors

| Close Code | Reason | Action |
|------------|--------|--------|
| 1008 | "Authentication required" | Token was not provided |
| 1008 | "Invalid or expired token" | Token validation failed |

## Message Formats

### Connection Confirmation

```json
{
  "type": "connected",
  "data": {
    "connection_id": "uuid-string",
    "user_id": "uuid-string",
    "message": "Successfully connected to event stream"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### State Snapshot

Sent immediately after connection confirmation. Contains full system state for recovery.

```json
{
  "type": "state_snapshot",
  "data": {
    "active_operations": [
      {
        "operation_id": "op-123",
        "operation_type": "load",
        "resource_id": "llama-3-8b",
        "user_id": "user-uuid",
        "status": "in_progress",
        "timestamp": "2024-01-15T10:29:00Z",
        "metadata": {}
      }
    ],
    "resources": [
      {
        "resource_id": "llama-3-8b",
        "status": "loaded",
        "vram_mb": 8192,
        "user_locked": false,
        "priority": 100,
        "last_used_at": "2024-01-15T10:28:00Z"
      }
    ],
    "vram_stats": {
      "total_mb": 24576,
      "used_mb": 12288,
      "free_mb": 12288,
      "utilization_percent": 50.0,
      "gpu_count": 1
    },
    "kernel_health": {
      "healthy": true,
      "initialized": true,
      "timestamp": "2024-01-15T10:30:00Z",
      "services": {
        "event_bus": {"healthy": true, "message": "ok", "is_running": true},
        "resource_manager": {"healthy": true, "message": "ok", "is_running": true}
      }
    },
    "preview_states": {},
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Event Messages

Regular event broadcasts during the connection:

```json
{
  "type": "model_loaded",
  "data": {
    "event_data": {"model_name": "llama-3-8b", "vram_mb": 8192},
    "severity": "info",
    "source": "resource_manager",
    "user_id": "user-uuid",
    "chat_id": null,
    "resource_id": "llama-3-8b"
  },
  "timestamp": "2024-01-15T10:31:00Z"
}
```

### Ping/Pong

Client can send `ping` text message to check connection health:

```
Client: "ping"
Server: {"type": "pong", "data": {"timestamp": "..."}, "timestamp": "..."}
```

## Exponential Backoff Reconnection Strategy

When the WebSocket connection is lost, implement exponential backoff to prevent overwhelming the server.

### Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Initial delay | 1000ms | First retry delay |
| Maximum delay | 30000ms | Cap on retry delay |
| Backoff multiplier | 2x | Delay doubles each attempt |
| Maximum attempts | 10 | Stop retrying after this many failures |

### Formula

```
delay = min(initial_delay * (2 ^ attempt), max_delay)
```

### Delay Sequence

| Attempt | Delay |
|---------|-------|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 8s |
| 5 | 16s |
| 6+ | 30s (capped) |

## TypeScript Implementation Example

```typescript
interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface StateSnapshot {
  active_operations: Array<{
    operation_id: string;
    operation_type: string;
    resource_id: string;
    user_id: string;
    status: string;
    timestamp: string;
    metadata: Record<string, any>;
  }>;
  resources: Array<{
    resource_id: string;
    status: string;
    vram_mb: number;
    user_locked: boolean;
    priority: number;
    last_used_at: string | null;
  }>;
  vram_stats: {
    total_mb: number;
    used_mb: number;
    free_mb: number;
    utilization_percent: number;
    gpu_count: number;
  };
  kernel_health: {
    healthy: boolean;
    initialized: boolean;
    timestamp: string;
    services: Record<string, { healthy: boolean; message: string; is_running: boolean }>;
  };
  preview_states: Record<string, any>;
  timestamp: string;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // 1 second
  private maxReconnectDelay = 30000; // 30 seconds
  private token: string;
  private onStateSnapshot?: (snapshot: StateSnapshot) => void;
  private onEvent?: (type: string, data: any) => void;
  private onConnectionStatusChange?: (connected: boolean) => void;

  constructor(token: string) {
    this.token = token;
  }

  connect(): void {
    const url = `ws://localhost:8001/api/ws/events?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0; // Reset on successful connection
        this.onConnectionStatusChange?.(true);
      };

      this.ws.onclose = (event) => {
        console.log(`WebSocket closed: ${event.code} ${event.reason}`);
        this.onConnectionStatusChange?.(false);

        // Handle authentication errors (don't retry)
        if (event.code === 1008) {
          console.error('Authentication failed:', event.reason);
          return;
        }

        // Attempt reconnection with backoff
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'connected':
        console.log('Connection confirmed:', message.data.connection_id);
        break;

      case 'state_snapshot':
        console.log('Received state snapshot');
        this.onStateSnapshot?.(message.data as StateSnapshot);
        break;

      case 'pong':
        console.log('Pong received');
        break;

      default:
        // Handle other event types
        this.onEvent?.(message.type, message.data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      // Show error to user - they need to refresh or re-authenticate
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  ping(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send('ping');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  // Event handlers
  setOnStateSnapshot(handler: (snapshot: StateSnapshot) => void): void {
    this.onStateSnapshot = handler;
  }

  setOnEvent(handler: (type: string, data: any) => void): void {
    this.onEvent = handler;
  }

  setOnConnectionStatusChange(handler: (connected: boolean) => void): void {
    this.onConnectionStatusChange = handler;
  }
}

// Usage example
const client = new WebSocketClient(jwtToken);

client.setOnStateSnapshot((snapshot) => {
  // Merge snapshot with local state
  store.dispatch(updateOperations(snapshot.active_operations));
  store.dispatch(updateResources(snapshot.resources));
  store.dispatch(updateVramStats(snapshot.vram_stats));
  store.dispatch(updateKernelHealth(snapshot.kernel_health));
});

client.setOnEvent((type, data) => {
  // Handle real-time events
  switch (type) {
    case 'model_loaded':
      store.dispatch(modelLoaded(data));
      break;
    case 'model_unloaded':
      store.dispatch(modelUnloaded(data));
      break;
    case 'operations_recovered':
      console.log('Operations recovered after restart:', data);
      break;
    // ... handle other event types
  }
});

client.setOnConnectionStatusChange((connected) => {
  store.dispatch(setConnectionStatus(connected));
});

client.connect();
```

## State Snapshot Handling

When receiving a state snapshot (on initial connection or reconnection):

1. **Active Operations**: Update the operations panel to show in-progress operations
2. **Resources**: Update resource lists with current status and VRAM usage
3. **VRAM Stats**: Update monitoring displays with current GPU memory utilization
4. **Kernel Health**: Check service health and show warnings if any service is unhealthy
5. **Preview States**: Reserved for future preview environment state recovery

### Merging Strategy

The state snapshot represents the **complete current state**. On reconnection:

- Replace local active operations list with snapshot data
- Update resource status for all resources in the snapshot
- Overwrite VRAM statistics with fresh data
- Refresh kernel health indicators

## Error Handling Recommendations

### Authentication Failures (1008)

- Clear stored token
- Redirect user to login page
- Do not attempt automatic reconnection

### Network Errors

- Show "Connecting..." indicator to user
- Use exponential backoff for reconnection
- After max attempts, show error with manual retry button

### Token Expiration

- Monitor `token_exp` from connection metadata
- Refresh token before expiration if possible
- On expired token rejection, re-authenticate and reconnect

### Connection Status UI

Always display connection status to the user:

```typescript
// Connection status indicators
type ConnectionStatus =
  | 'connected'      // Active, receiving events
  | 'connecting'     // Initial connection or reconnecting
  | 'disconnected'   // Temporarily lost, will retry
  | 'error';         // Failed after max retries, needs manual action
```

## REST Fallback

For initial page loads or debugging, the state snapshot is also available via REST:

```
GET /api/ws/state-snapshot?token={jwt_token}
```

This returns the same state snapshot format as the WebSocket message.

## Operation Recovery Events

After a kernel restart, the backend automatically recovers in-progress operations. Clients will receive:

```json
{
  "type": "operations_recovered",
  "data": {
    "event_data": {
      "total_operations": 3,
      "success_count": 2,
      "failure_count": 1
    },
    "severity": "info",
    "source": "kernel"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Individual recovered operations will continue broadcasting their normal events (e.g., `model_loaded` when a recovered load completes).
