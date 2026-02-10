"use client";

import { useState, useEffect } from "react";
import { Button, Input } from "@workstation/ui";
import { Filter, RotateCcw, Search } from "lucide-react";
import type { AuditLogFilters } from "@workstation/api/types";

interface AuditLogFiltersBarProps {
  filters: AuditLogFilters;
  onFilterChange: (filters: Partial<AuditLogFilters>) => void;
  onReset: () => void;
}

const ACTION_OPTIONS = [
  { label: "All Actions", value: "" },
  { label: "Login", value: "login" },
  { label: "Login Failed", value: "login_failed" },
  { label: "Logout", value: "logout" },
  { label: "Password Change", value: "password_change" },
  { label: "Account Locked", value: "account_locked" },
  { label: "Account Unlocked", value: "account_unlocked" },
  { label: "Admin User Update", value: "admin_user_update" },
  { label: "Token Refresh", value: "token_refresh" },
];

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "" },
  { label: "Success", value: "success" },
  { label: "Failure", value: "failure" },
  { label: "Error", value: "error" },
];

export function AuditLogFiltersBar({
  filters,
  onFilterChange,
  onReset,
}: AuditLogFiltersBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  useEffect(() => {
    setSearchInput(filters.search ?? "");
  }, [filters.search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ search: searchInput || undefined });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-1 flex-1 min-w-[200px]"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search action, resource, IP..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={onReset}
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" />
          Filters:
        </div>

        <select
          value={filters.action ?? ""}
          onChange={(e) =>
            onFilterChange({ action: e.target.value || undefined })
          }
          className="h-7 rounded-md border bg-background px-2 text-xs"
          aria-label="Filter by action"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            onFilterChange({ status: e.target.value || undefined })
          }
          className="h-7 rounded-md border bg-background px-2 text-xs"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <Input
          value={filters.ip_address ?? ""}
          onChange={(e) =>
            onFilterChange({ ip_address: e.target.value || undefined })
          }
          placeholder="IP address"
          className="h-7 w-[140px] text-xs"
          aria-label="Filter by IP address"
        />

        <Input
          type="date"
          value={filters.start_date ?? ""}
          onChange={(e) =>
            onFilterChange({ start_date: e.target.value || undefined })
          }
          className="h-7 w-[130px] text-xs"
          aria-label="Start date"
        />

        <span className="text-xs text-muted-foreground">to</span>

        <Input
          type="date"
          value={filters.end_date ?? ""}
          onChange={(e) =>
            onFilterChange({ end_date: e.target.value || undefined })
          }
          className="h-7 w-[130px] text-xs"
          aria-label="End date"
        />
      </div>
    </div>
  );
}
