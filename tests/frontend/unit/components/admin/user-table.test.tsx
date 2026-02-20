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

import { UserTable } from "@/components/admin/user-table";

const sampleUsers = [
  {
    id: "u1",
    username: "admin",
    role: "admin",
    is_active: true,
    is_master: true,
    email: "admin@example.com",
    first_name: null,
    last_name: null,
    screen_name: null,
    created_at: "2025-01-01",
    last_login_at: "2025-06-01",
    locked_until: null,
  },
  {
    id: "u2",
    username: "user1",
    role: "user",
    is_active: true,
    is_master: false,
    email: "user1@example.com",
    first_name: "Test",
    last_name: "User",
    screen_name: null,
    created_at: "2025-02-01",
    last_login_at: null,
    locked_until: null,
  },
  {
    id: "u3",
    username: "locked_user",
    role: "user",
    is_active: true,
    is_master: false,
    email: null,
    first_name: null,
    last_name: null,
    screen_name: null,
    created_at: "2025-03-01",
    last_login_at: null,
    locked_until: "2025-12-31",
  },
];

const defaultParams = {};

describe("UserTable", () => {
  const onParamsChange = vi.fn();
  const onSelectUser = vi.fn();
  const onEditUser = vi.fn();
  const onUnlockUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user rows", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    // "admin" appears as both username and role badge, so use getAllByText
    expect(screen.getAllByText("admin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("user1")).toBeInTheDocument();
    expect(screen.getByText("locked_user")).toBeInTheDocument();
  });

  it("shows total count", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByText("3 users total")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(
      <UserTable
        users={[]}
        total={0}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("has search input", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByPlaceholderText("Search users...")).toBeInTheDocument();
  });

  it("has role filter", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByLabelText("Filter by role")).toBeInTheDocument();
  });

  it("shows locked badge for locked users", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows unlock button for locked users", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    expect(screen.getByText("Unlock")).toBeInTheDocument();
  });

  it("does not show edit for master users", () => {
    render(
      <UserTable
        users={sampleUsers}
        total={3}
        page={1}
        pageSize={20}
        loading={false}
        params={defaultParams}
        onParamsChange={onParamsChange}
        onSelectUser={onSelectUser}
        onEditUser={onEditUser}
        onUnlockUser={onUnlockUser}
      />
    );
    // 2 non-master users should have Edit buttons
    const editButtons = screen.getAllByText("Edit");
    expect(editButtons.length).toBe(2);
  });
});
