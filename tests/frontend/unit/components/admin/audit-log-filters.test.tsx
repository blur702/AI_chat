import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => {
    if (name === "__esModule") return true;
    return ({ children, ...props }: any) => <span data-icon={String(name)} {...props}>{children}</span>;
  },
}));

import { AuditLogFiltersBar } from "@/components/admin/audit-log-filters";

const defaultFilters = {
  search: undefined,
  action: undefined,
  status: undefined,
  ip_address: undefined,
  start_date: undefined,
  end_date: undefined,
};

describe("AuditLogFiltersBar", () => {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search input", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByPlaceholderText("Search action, resource, IP...")).toBeInTheDocument();
  });

  it("renders reset button", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("calls onReset when reset clicked", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    fireEvent.click(screen.getByText("Reset"));
    expect(onReset).toHaveBeenCalled();
  });

  it("renders action filter", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByLabelText("Filter by action")).toBeInTheDocument();
  });

  it("renders status filter", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
  });

  it("calls onFilterChange when action selected", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    fireEvent.change(screen.getByLabelText("Filter by action"), { target: { value: "login" } });
    expect(onFilterChange).toHaveBeenCalledWith({ action: "login" });
  });

  it("calls onFilterChange when status selected", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "success" } });
    expect(onFilterChange).toHaveBeenCalledWith({ status: "success" });
  });

  it("has IP address filter", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByLabelText("Filter by IP address")).toBeInTheDocument();
  });

  it("has date range filters", () => {
    render(
      <AuditLogFiltersBar filters={defaultFilters} onFilterChange={onFilterChange} onReset={onReset} />
    );
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
  });
});
