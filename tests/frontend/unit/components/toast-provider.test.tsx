import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/toast-provider";

vi.mock("@workstation/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

function TestConsumer() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("Info message")}>Show Info</button>
      <button onClick={() => toast("Success message", "success")}>Show Success</button>
      <button onClick={() => toast("Error message", "error")}>Show Error</button>
    </div>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children", () => {
    render(
      <ToastProvider>
        <div>Child content</div>
      </ToastProvider>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows info toast when triggered", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("shows success toast", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("shows error toast", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Error"));
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("dismisses toast when X button clicked", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByText("Info message")).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText("Dismiss");
    fireEvent.click(dismissBtn);
    expect(screen.queryByText("Info message")).not.toBeInTheDocument();
  });

  it("auto-dismisses toast after timeout", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByText("Info message")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("Info message")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders toast container with role='region'", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Notifications");
  });

  it("renders individual toasts with role='alert'", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows toast on api-error custom event", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent("api-error", { detail: { message: "API failed", status: 500 } })
      );
    });
    expect(screen.getByText("API failed")).toBeInTheDocument();
  });

  it("can show multiple toasts at once", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Info"));
    fireEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Info message")).toBeInTheDocument();
    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
