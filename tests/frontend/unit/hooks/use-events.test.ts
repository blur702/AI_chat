import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useEvents,
  useEventTypes,
  useCreateEvent,
  useEventStats,
} from '@workstation/api/hooks/use-events';

// Mock the API client
vi.mock('@workstation/api/client', () => ({
  getClient: vi.fn(() => ({
    getEvents: vi.fn(),
    getEventTypes: vi.fn(),
    createEventBroadcast: vi.fn(),
    getEventStats: vi.fn(),
  })),
}));

import { getClient } from '@workstation/api/client';

describe('useEvents hooks', () => {
  const mockClient = {
    getEvents: vi.fn(),
    getEventTypes: vi.fn(),
    createEventBroadcast: vi.fn(),
    getEventStats: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getClient as any).mockReturnValue(mockClient);
  });

  describe('useEvents', () => {
    it('fetches events on mount', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          event_type: 'system',
          timestamp: '2026-02-16T10:00:00Z',
          data: {},
        },
        {
          id: 'evt-2',
          event_type: 'user',
          timestamp: '2026-02-16T11:00:00Z',
          data: {},
        },
      ];

      mockClient.getEvents.mockResolvedValue({
        events: mockEvents,
        total: 2,
      });

      const { result } = renderHook(() => useEvents());

      await waitFor(() => {
        expect(result.current.events).toEqual(mockEvents);
      });

      expect(mockClient.getEvents).toHaveBeenCalledWith({});
      expect(result.current.loading).toBe(false);
    });

    it('sets loading state correctly', async () => {
      mockClient.getEvents.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ events: [], total: 0 }), 100)
          )
      );

      const { result } = renderHook(() => useEvents());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('returns total count', async () => {
      mockClient.getEvents.mockResolvedValue({
        events: [],
        total: 42,
      });

      const { result } = renderHook(() => useEvents());

      await waitFor(() => {
        expect(result.current.total).toBe(42);
      });
    });

    it('handles fetch error', async () => {
      const errorMessage = 'Failed to fetch events';
      mockClient.getEvents.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useEvents());

      await waitFor(() => {
        expect(result.current.error).toBe(errorMessage);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.events).toEqual([]);
    });

    it('refresh re-fetches events', async () => {
      const initialEvents = [
        {
          id: 'evt-1',
          event_type: 'system',
          timestamp: '2026-02-16T10:00:00Z',
          data: {},
        },
      ];

      const updatedEvents = [
        ...initialEvents,
        {
          id: 'evt-2',
          event_type: 'user',
          timestamp: '2026-02-16T11:00:00Z',
          data: {},
        },
      ];

      mockClient.getEvents
        .mockResolvedValueOnce({ events: initialEvents, total: 1 })
        .mockResolvedValueOnce({ events: updatedEvents, total: 2 });

      const { result } = renderHook(() => useEvents());

      await waitFor(() => {
        expect(result.current.events.length).toBe(1);
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.events.length).toBe(2);
      });

      expect(mockClient.getEvents).toHaveBeenCalledTimes(2);
    });
  });

  describe('useEventTypes', () => {
    it('fetches types on mount', async () => {
      const mockTypes = ['system', 'user', 'tool'];

      mockClient.getEventTypes.mockResolvedValue(mockTypes);

      const { result } = renderHook(() => useEventTypes());

      await waitFor(() => {
        expect(result.current.eventTypes).toEqual(mockTypes);
      });

      expect(mockClient.getEventTypes).toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it('returns cached types on second refresh within 60s', async () => {
      const mockTypes = ['system', 'user'];

      mockClient.getEventTypes.mockResolvedValue(mockTypes);

      const { result } = renderHook(() => useEventTypes());

      await waitFor(() => {
        expect(result.current.eventTypes).toEqual(mockTypes);
      });

      expect(mockClient.getEventTypes).toHaveBeenCalledTimes(1);

      // Call refresh immediately (within 60s cache window)
      await act(async () => {
        await result.current.refresh();
      });

      // Should still only be called once due to caching
      expect(mockClient.getEventTypes).toHaveBeenCalledTimes(1);
    });
  });

  describe('useCreateEvent', () => {
    it('creates event and sets lastResult', async () => {
      const mockEvent = {
        id: 'evt-1',
        event_type: 'test',
        timestamp: '2026-02-16T10:00:00Z',
        data: { message: 'test' },
      };

      mockClient.createEventBroadcast.mockResolvedValue(mockEvent);

      const { result } = renderHook(() => useCreateEvent());

      await act(async () => {
        await result.current.createEvent({
          event_type: 'test',
          data: { message: 'test' },
        });
      });

      expect(mockClient.createEventBroadcast).toHaveBeenCalledWith({
        event_type: 'test',
        data: { message: 'test' },
      });

      await waitFor(() => {
        expect(result.current.lastResult).toEqual(mockEvent);
      });

      expect(result.current.creating).toBe(false);
    });

    it('sets creating=true during creation', async () => {
      mockClient.createEventBroadcast.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'evt-1',
                  event_type: 'test',
                  timestamp: '2026-02-16T10:00:00Z',
                  data: {},
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useCreateEvent());

      act(() => {
        result.current.createEvent({
          event_type: 'test',
          data: {},
        });
      });

      expect(result.current.creating).toBe(true);

      await waitFor(() => {
        expect(result.current.creating).toBe(false);
      });
    });

    it('sets error on failure', async () => {
      const errorMessage = 'Failed to create event';
      mockClient.createEventBroadcast.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useCreateEvent());

      await act(async () => {
        try {
          await result.current.createEvent({
            event_type: 'test',
            data: {},
          });
        } catch {
          // hook re-throws the error
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe(errorMessage);
      });

      expect(result.current.creating).toBe(false);
    });

    it('clearError clears the error', async () => {
      const errorMessage = 'Failed to create event';
      mockClient.createEventBroadcast.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useCreateEvent());

      await act(async () => {
        try {
          await result.current.createEvent({
            event_type: 'test',
            data: {},
          });
        } catch {
          // hook re-throws the error
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe(errorMessage);
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('useEventStats', () => {
    it('fetches stats on mount', async () => {
      const mockStats = {
        total_events: 100,
        by_type: {
          system: 50,
          user: 30,
          tool: 20,
        },
        by_project: {
          'proj-1': 60,
          'proj-2': 40,
        },
      };

      mockClient.getEventStats.mockResolvedValue(mockStats);

      const { result } = renderHook(() => useEventStats());

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockStats);
      });

      expect(mockClient.getEventStats).toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it('handles error', async () => {
      const errorMessage = 'Failed to fetch stats';
      mockClient.getEventStats.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useEventStats());

      await waitFor(() => {
        expect(result.current.error).toBe(errorMessage);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.stats).toBeNull();
    });
  });
});
