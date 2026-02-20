import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CodeBlock } from "@/components/code-block";

vi.mock("@workstation/ui", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("CodeBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders language label", () => {
    render(<CodeBlock code='console.log("hi")' language="javascript" />);
    expect(screen.getByText("javascript")).toBeInTheDocument();
  });

  it("renders code content", () => {
    render(<CodeBlock code="const x = 42;" language="typescript" />);
    expect(screen.getByText("const x = 42;")).toBeInTheDocument();
  });

  it("renders code in a pre > code element", () => {
    const { container } = render(<CodeBlock code="hello" language="python" />);
    const codeEl = container.querySelector("pre code");
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toBe("hello");
  });

  it("applies language class to code element", () => {
    const { container } = render(<CodeBlock code="x" language="rust" />);
    const codeEl = container.querySelector("code");
    expect(codeEl?.className).toContain("language-rust");
  });

  it("has a copy button", () => {
    render(<CodeBlock code="test" language="text" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("copies to clipboard on button click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });

    render(<CodeBlock code="copied text" language="text" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("copied text");
    });
  });

  it("renders different languages correctly", () => {
    const { container } = render(<CodeBlock code="fn main() {}" language="rust" />);
    expect(screen.getByText("rust")).toBeInTheDocument();
    const codeEl = container.querySelector("code");
    expect(codeEl?.className).toContain("language-rust");
  });
});
