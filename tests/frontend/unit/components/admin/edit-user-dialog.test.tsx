import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { workstationUiMock } from "../../test-utils";

vi.mock("@workstation/ui", () => workstationUiMock);

vi.mock("lucide-react", () => new Proxy({}, {
  get: (_, name) => {
    if (name === "__esModule") return true;
    return ({ children, ...props }: any) => <span data-icon={String(name)} {...props}>{children}</span>;
  },
}));

import { EditUserDialog } from "@/components/admin/edit-user-dialog";

const mockUser = {
  id: "u1",
  username: "testuser",
  role: "user",
  is_active: true,
  is_master: false,
  first_name: "Test",
  last_name: "User",
  screen_name: "tester",
  email: "test@example.com",
  created_at: "2025-01-01",
  last_login_at: null,
  locked_until: null,
};

describe("EditUserDialog", () => {
  const onOpenChange = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when open", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    expect(screen.getByText("Edit User: testuser")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <EditUserDialog user={mockUser} open={false} onOpenChange={onOpenChange} onSave={onSave} />
    );
    expect(screen.queryByText("Edit User: testuser")).not.toBeInTheDocument();
  });

  it("shows form fields", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    expect(screen.getByText("First Name")).toBeInTheDocument();
    expect(screen.getByText("Last Name")).toBeInTheDocument();
    expect(screen.getByText("Screen Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("pre-fills form with user data", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    const inputs = screen.getAllByRole("textbox");
    const firstNameInput = inputs.find((i) => (i as HTMLInputElement).value === "Test");
    expect(firstNameInput).toBeTruthy();
  });

  it("has cancel button", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("has save button", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    expect(screen.getByText("Save Changes")).toBeInTheDocument();
  });

  it("calls onSave when save clicked", async () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("u1", expect.any(Object));
    });
  });

  it("closes dialog on cancel", () => {
    render(
      <EditUserDialog user={mockUser} open={true} onOpenChange={onOpenChange} onSave={onSave} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
