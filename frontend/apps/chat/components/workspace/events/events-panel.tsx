"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Button,
  ScrollArea,
  Badge,
  Input,
} from "@workstation/ui";
import {
  X,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
} from "lucide-react";
import { useEvents, useEventTypes, useCreateEvent } from "@workstation/api/hooks";
import type { EventResponse, EventSeverity } from "@workstation/api/types";
import { CreateEventModal } from "./create-event-modal";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
  critical: "bg-red-700/10 text-red-700 border-red-700/20",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface EventsPanelProps {
  onClose: () => void;
}

export function EventsPanel({ onClose }: EventsPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterSeverity, setFilterSeverity] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const eventsParams = useMemo(
    () => ({
      event_type: filterType,
      severity: filterSeverity,
      limit: 50,
    }),
    [filterType, filterSeverity]
  );

  const { events, total, loading, error, refresh } = useEvents(eventsParams);
  const { eventTypes } = useEventTypes();
  const { createEvent, creating, error: createError } = useCreateEvent();

  const handleCreateSubmit = useCallback(
    async (data: Parameters<typeof createEvent>[0]) => {
      await createEvent(data);
      refresh();
    },
    [createEvent, refresh]
  );

  const handleClearFilters = useCallback(() => {
    setFilterType(undefined);
    setFilterSeverity(undefined);
  }, []);

  const hasFilters = filterType || filterSeverity;

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Events
          </span>
          {total > 0 && (
            <Badge variant="secondary" className="h-4 text-[9px] px-1">
              {total}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowCreateModal(true)}
            title="Create Event"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowFilters(!showFilters)}
            title="Filters"
          >
            <Filter className={`h-3.5 w-3.5 ${hasFilters ? "text-primary" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refresh()}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="border-b px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={filterType ?? ""}
              onChange={(e) => setFilterType(e.target.value || undefined)}
              className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">All Types</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={filterSeverity ?? ""}
              onChange={(e) => setFilterSeverity(e.target.value || undefined)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="text-[10px] text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading && events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Loading events...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-red-500">
              <AlertCircle className="h-5 w-5" />
              <span className="text-xs">{error}</span>
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                Retry
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Zap className="h-5 w-5" />
              <span className="text-xs">No events found</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Create Event
              </Button>
            </div>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                expanded={expandedEventId === event.id}
                onToggle={() =>
                  setExpandedEventId(
                    expandedEventId === event.id ? null : event.id
                  )
                }
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create Event Modal */}
      <CreateEventModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        eventTypes={eventTypes}
        onSubmit={handleCreateSubmit}
        creating={creating}
        error={createError}
      />
    </div>
  );
}

function EventCard({
  event,
  expanded,
  onToggle,
}: {
  event: EventResponse;
  expanded: boolean;
  onToggle: () => void;
}) {
  const severityClass = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.info;
  const hasData = Object.keys(event.event_data ?? {}).length > 0;

  return (
    <div className="rounded-md border bg-card text-card-foreground">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 p-2.5 text-left hover:bg-accent/50 transition-colors rounded-md"
      >
        <div className="mt-0.5">
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {event.event_type}
            </Badge>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium ${severityClass}`}>
              {event.severity}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{event.source}</span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {formatTimeAgo(event.created_at)}
            </span>
          </div>
        </div>
      </button>

      {expanded && hasData && (
        <div className="border-t px-3 py-2">
          <pre className="text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(event.event_data ?? {}, null, 2)}
          </pre>
          {(event.user_id || event.chat_id || event.resource_id) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
              {event.user_id && (
                <span>user: {event.user_id.slice(0, 8)}...</span>
              )}
              {event.chat_id && (
                <span>chat: {event.chat_id.slice(0, 8)}...</span>
              )}
              {event.resource_id && (
                <span>resource: {event.resource_id}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
