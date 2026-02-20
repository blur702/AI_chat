/**
 * Preview injection script for edit mode.
 *
 * This script is designed to be injected into the preview iframe via
 * a <script> tag or postMessage-based eval for same-origin content.
 * It provides click-to-select element functionality that communicates
 * selected element data back to the parent window.
 *
 * Communication protocol:
 *   Parent → Iframe:
 *     { type: "enable-edit-mode" }
 *     { type: "disable-edit-mode" }
 *
 *   Iframe → Parent:
 *     { type: "element-selected", path: string, tagName: string, rect: DOMRect }
 */

let editModeActive = false;
let highlightEl: HTMLDivElement | null = null;
let currentSelected: HTMLElement | null = null;

function getElementPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment += `#${current.id}`;
    } else if (current.className && typeof current.className === "string") {
      const classes = current.className
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join(".");
      if (classes) segment += `.${classes}`;
    }

    parts.unshift(segment);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function ensureHighlight(): HTMLDivElement {
  if (highlightEl) return highlightEl;

  highlightEl = document.createElement("div");
  highlightEl.id = "__preview-edit-highlight__";
  Object.assign(highlightEl.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px solid #3b82f6",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderRadius: "2px",
    zIndex: "99999",
    transition: "all 0.1s ease",
    display: "none",
  });
  document.body.appendChild(highlightEl);
  return highlightEl;
}

function showHighlight(el: Element) {
  const hl = ensureHighlight();
  const rect = el.getBoundingClientRect();
  Object.assign(hl.style, {
    display: "block",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function hideHighlight() {
  if (highlightEl) {
    highlightEl.style.display = "none";
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!editModeActive) return;
  const target = e.target as Element;
  if (target && target !== highlightEl) {
    showHighlight(target);
  }
}

function handleClick(e: MouseEvent) {
  if (!editModeActive) return;
  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;
  if (!target || target === highlightEl) return;

  currentSelected = target;
  showHighlight(target);

  const path = getElementPath(target);
  const rect = target.getBoundingClientRect();

  window.parent.postMessage(
    {
      type: "element-selected",
      path,
      tagName: target.tagName.toLowerCase(),
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    },
    window.location.origin
  );
}

function enableEditMode() {
  editModeActive = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
}

function disableEditMode() {
  editModeActive = false;
  document.body.style.cursor = "";
  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("click", handleClick, true);
  hideHighlight();
  currentSelected = null;
}

// Safely replace builder root content using DOM APIs
function safeSetContent(container: HTMLElement, htmlString: string) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const nodes = doc.body.childNodes;
  while (nodes.length > 0) {
    container.appendChild(document.adoptNode(nodes[0]));
  }
}

// Handle builder DOM updates from parent
function handleBuilderUpdate(data: { action: string; html?: string }) {
  if (data.action === "set-html") {
    let container = document.getElementById("__ui-builder-root__");
    if (!container) {
      container = document.createElement("div");
      container.id = "__ui-builder-root__";
      document.body.appendChild(container);
    }
    safeSetContent(container, data.html || "");
  } else if (data.action === "clear") {
    const existing = document.getElementById("__ui-builder-root__");
    if (existing) {
      while (existing.firstChild) {
        existing.removeChild(existing.firstChild);
      }
    }
  }
}

// Listen for messages from the parent
window.addEventListener("message", (e) => {
  if (e.origin !== window.location.origin) return;
  if (e.data?.type === "enable-edit-mode") {
    enableEditMode();
  } else if (e.data?.type === "disable-edit-mode") {
    disableEditMode();
  } else if (e.data?.type === "builder-update") {
    handleBuilderUpdate(e.data);
  }
});

export { enableEditMode, disableEditMode };
