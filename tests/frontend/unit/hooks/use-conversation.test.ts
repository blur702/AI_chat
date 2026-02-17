import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversation } from '@workstation/api/hooks/use-conversation';

// Mock the API client
vi.mock('@workstation/api/client', () => ({
  getClient: vi.fn(() => ({
    getConversationState: vi.fn(),
    createChat: vi.fn(),
    streamMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    submitToolApproval: vi.fn(),
  })),
}));

// Mock useTokenUsage hook
vi.mock('@workstation/api/hooks/use-token-usage', () => ({
  useTokenUsage: () => ({
    tokenUsage: null,
    setFromStream: vi.fn(),
  }),
}));

import { getClient } from '@workstation/api/client';

describe('useConversation', () => {
  const mockClient = {
    getConversationState: vi.fn(),
    createChat: vi.fn(),
    streamMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    submitToolApproval: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as any).mockReturnValue(mockClient);
  });

  it('returns null conversation when chatId is null', () => {
    const { result } = renderHook(() => useConversation(null));

    expect(result.current.conversation).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(mockClient.getConversationState).not.toHaveBeenCalled();
  });

  it('fetches conversation state when chatId provided', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: '2026-02-16T10:00:00Z',
        },
      ],
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).toEqual(mockConversation);
    });

    expect(mockClient.getConversationState).toHaveBeenCalledWith('chat-1');
    expect(result.current.messages).toEqual(mockConversation.messages);
    expect(result.current.loading).toBe(false);
  });

  it('sets loading=true during fetch', async () => {
    mockClient.getConversationState.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 'chat-1', messages: [] }), 100))
    );

    const { result } = renderHook(() => useConversation('chat-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error on fetch failure', async () => {
    const errorMessage = 'Failed to fetch conversation';
    mockClient.getConversationState.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });

    expect(result.current.loading).toBe(false);
  });

  it('sendMessage returns false when no chatId and no draft options', async () => {
    const { result } = renderHook(() => useConversation(null));

    let sendResult: boolean = true;
    await act(async () => {
      sendResult = await result.current.sendMessage('Hello');
    });

    expect(sendResult).toBe(false);
    expect(mockClient.streamMessage).not.toHaveBeenCalled();
  });

  it('sendMessage adds optimistic messages', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [],
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);
    let capturedOnDone: any;
    mockClient.streamMessage.mockImplementation((_chatId: any, _content: any, _onToken: any, onDone: any) => {
      capturedOnDone = onDone;
      return vi.fn(); // cancel function
    });

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    // streamMessage is called with (chatId, content, onToken, onDone, onError, model, chatMode, onToolCall, onToolResult, onToolApprovalRequired)
    expect(mockClient.streamMessage).toHaveBeenCalledWith(
      'chat-1',
      'Hello',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    // Complete the stream explicitly instead of relying on setTimeout
    await act(async () => {
      capturedOnDone({
        message_id: 'msg-2',
        role: 'assistant',
        content: 'Response',
      });
    });

    await waitFor(() => {
      expect(result.current.processing).toBe(false);
    });
  });

  it('cancelStream resets processing state', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [],
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);

    const mockCancel = vi.fn();
    mockClient.streamMessage.mockReturnValue(mockCancel);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });

    // Start a message
    act(() => {
      result.current.sendMessage('Hello');
    });

    // Cancel the stream
    act(() => {
      result.current.cancelStream();
    });

    expect(mockCancel).toHaveBeenCalled();
    expect(result.current.processing).toBe(false);
  });

  it('updateMessage updates conversation state', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Original',
          timestamp: '2026-02-16T10:00:00Z',
        },
      ],
    };

    const updatedMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Updated',
      timestamp: '2026-02-16T10:00:00Z',
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);
    mockClient.updateMessage.mockResolvedValue(updatedMessage);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });

    await act(async () => {
      await result.current.updateMessage('msg-1', { content: 'Updated' });
    });

    expect(mockClient.updateMessage).toHaveBeenCalledWith('chat-1', 'msg-1', {
      content: 'Updated',
    });

    await waitFor(() => {
      const message = result.current.messages.find((m) => m.id === 'msg-1');
      expect(message?.content).toBe('Updated');
    });
  });

  it('deleteMessage removes message from state', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'To delete',
          timestamp: '2026-02-16T10:00:00Z',
        },
      ],
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);
    mockClient.deleteMessage.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1);
    });

    await act(async () => {
      await result.current.deleteMessage('msg-1');
    });

    expect(mockClient.deleteMessage).toHaveBeenCalledWith('chat-1', 'msg-1');

    await waitFor(() => {
      expect(result.current.messages.length).toBe(0);
    });
  });

  it('pinMessage delegates to updateMessage', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Message',
          timestamp: '2026-02-16T10:00:00Z',
          pinned: false,
        },
      ],
    };

    const pinnedMessage = { ...mockConversation.messages[0], pinned: true };

    mockClient.getConversationState.mockResolvedValue(mockConversation);
    mockClient.updateMessage.mockResolvedValue(pinnedMessage);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });

    await act(async () => {
      await result.current.pinMessage('msg-1', true);
    });

    expect(mockClient.updateMessage).toHaveBeenCalledWith('chat-1', 'msg-1', {
      is_pinned: true,
    });
  });

  it('excludeMessage delegates to updateMessage', async () => {
    const mockConversation = {
      id: 'chat-1',
      project_id: 'proj-1',
      title: 'Test Chat',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Message',
          timestamp: '2026-02-16T10:00:00Z',
          excluded_from_context: false,
        },
      ],
    };

    const excludedMessage = {
      ...mockConversation.messages[0],
      excluded_from_context: true,
    };

    mockClient.getConversationState.mockResolvedValue(mockConversation);
    mockClient.updateMessage.mockResolvedValue(excludedMessage);

    const { result } = renderHook(() => useConversation('chat-1'));

    await waitFor(() => {
      expect(result.current.conversation).not.toBeNull();
    });

    await act(async () => {
      await result.current.excludeMessage('msg-1', true);
    });

    expect(mockClient.updateMessage).toHaveBeenCalledWith('chat-1', 'msg-1', {
      is_excluded: true,
    });
  });

  // --- Draft mode tests ---

  it('sendMessage in draft mode creates a chat first', async () => {
    const onChatCreated = vi.fn();
    mockClient.createChat.mockResolvedValue({ id: 'new-chat-1' });
    let capturedOnDone: any;
    mockClient.streamMessage.mockImplementation((_chatId: any, _content: any, _onToken: any, onDone: any) => {
      capturedOnDone = onDone;
      return vi.fn();
    });

    const draftOptions = { projectId: 'proj-1', onChatCreated };
    const { result } = renderHook(() => useConversation(null, undefined, draftOptions));

    let sendResult: boolean = false;
    await act(async () => {
      sendResult = await result.current.sendMessage('First message');
    });

    expect(sendResult).toBe(true);
    expect(mockClient.createChat).toHaveBeenCalledWith('proj-1', 'New Chat');
    expect(onChatCreated).toHaveBeenCalledWith('new-chat-1');
    expect(mockClient.streamMessage).toHaveBeenCalledWith(
      'new-chat-1',
      'First message',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      undefined,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    // Complete stream
    await act(async () => {
      capturedOnDone({ message_id: 'msg-1', role: 'assistant', content: 'Hi' });
    });
  });

  it('sendMessage in draft mode handles create failure', async () => {
    mockClient.createChat.mockRejectedValue(new Error('Create failed'));

    const draftOptions = { projectId: 'proj-1' };
    const { result } = renderHook(() => useConversation(null, undefined, draftOptions));

    let sendResult: boolean = true;
    await act(async () => {
      sendResult = await result.current.sendMessage('Hello');
    });

    expect(sendResult).toBe(false);
    expect(result.current.error).toBe('Create failed');
  });

  // --- Tool approval tests ---

  it('approveToolCall calls submitToolApproval and clears pending', async () => {
    mockClient.submitToolApproval.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConversation('chat-1'));

    await act(async () => {
      await result.current.approveToolCall('call-1', { param: 'value' });
    });

    expect(mockClient.submitToolApproval).toHaveBeenCalledWith('call-1', true, { param: 'value' });
  });

  it('denyToolCall calls submitToolApproval with false', async () => {
    mockClient.submitToolApproval.mockResolvedValue(undefined);

    const { result } = renderHook(() => useConversation('chat-1'));

    await act(async () => {
      await result.current.denyToolCall('call-1');
    });

    expect(mockClient.submitToolApproval).toHaveBeenCalledWith('call-1', false);
  });

  it('approveToolCall sets error on failure', async () => {
    mockClient.submitToolApproval.mockRejectedValue(new Error('Network'));

    const { result } = renderHook(() => useConversation('chat-1'));

    await act(async () => {
      await result.current.approveToolCall('call-1');
    });

    expect(result.current.error).toBe('Failed to submit tool approval');
  });

  it('denyToolCall sets error on failure', async () => {
    mockClient.submitToolApproval.mockRejectedValue(new Error('Network'));

    const { result } = renderHook(() => useConversation('chat-1'));

    await act(async () => {
      await result.current.denyToolCall('call-1');
    });

    expect(result.current.error).toBe('Failed to submit tool denial');
  });
});
