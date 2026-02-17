/**
 * Inline source of the preview injection script.
 *
 * This is a plain-JS version of preview-injection.ts, exported as a string
 * so it can be injected into same-origin iframes via a <script> tag.
 */
export const PREVIEW_INJECTION_SCRIPT = `
(function() {
  if (window.__previewInjectionLoaded) return;
  window.__previewInjectionLoaded = true;

  var editModeActive = false;
  var highlightEl = null;
  var currentSelected = null;

  function getElementPath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.body) {
      var segment = current.tagName.toLowerCase();
      if (current.id) {
        segment += '#' + current.id;
      } else if (current.className && typeof current.className === 'string') {
        var classes = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (classes) segment += '.' + classes;
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function ensureHighlight() {
    if (highlightEl) return highlightEl;
    highlightEl = document.createElement('div');
    highlightEl.id = '__preview-edit-highlight__';
    highlightEl.style.position = 'fixed';
    highlightEl.style.pointerEvents = 'none';
    highlightEl.style.border = '2px solid #3b82f6';
    highlightEl.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
    highlightEl.style.borderRadius = '2px';
    highlightEl.style.zIndex = '99999';
    highlightEl.style.transition = 'all 0.1s ease';
    highlightEl.style.display = 'none';
    document.body.appendChild(highlightEl);
    return highlightEl;
  }

  function showHighlight(el) {
    var hl = ensureHighlight();
    var rect = el.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.top = rect.top + 'px';
    hl.style.left = rect.left + 'px';
    hl.style.width = rect.width + 'px';
    hl.style.height = rect.height + 'px';
  }

  function hideHighlight() {
    if (highlightEl) highlightEl.style.display = 'none';
  }

  function handleMouseMove(e) {
    if (!editModeActive) return;
    var target = e.target;
    if (target && target !== highlightEl) {
      showHighlight(target);
    }
  }

  function handleClick(e) {
    if (!editModeActive) return;
    e.preventDefault();
    e.stopPropagation();
    var target = e.target;
    if (!target || target === highlightEl) return;
    currentSelected = target;
    showHighlight(target);
    var path = getElementPath(target);
    var rect = target.getBoundingClientRect();
    window.parent.postMessage({
      type: 'element-selected',
      path: path,
      tagName: target.tagName.toLowerCase(),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, window.location.origin);
  }

  function enableEditMode() {
    editModeActive = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
  }

  function disableEditMode() {
    editModeActive = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    hideHighlight();
    currentSelected = null;
  }

  // Safely replace builder root content using DOM APIs
  function safeSetContent(container, htmlString) {
    // Clear existing children
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    // Parse HTML safely via DOMParser and adopt nodes
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, 'text/html');
    var nodes = doc.body.childNodes;
    while (nodes.length > 0) {
      container.appendChild(document.adoptNode(nodes[0]));
    }
  }

  // Handle builder DOM updates from parent
  function handleBuilderUpdate(data) {
    if (data.action === 'set-html') {
      var container = document.getElementById('__ui-builder-root__');
      if (!container) {
        container = document.createElement('div');
        container.id = '__ui-builder-root__';
        document.body.appendChild(container);
      }
      safeSetContent(container, data.html || '');
    } else if (data.action === 'clear') {
      var existing = document.getElementById('__ui-builder-root__');
      if (existing) {
        while (existing.firstChild) {
          existing.removeChild(existing.firstChild);
        }
      }
    }
  }

  window.addEventListener('message', function(e) {
    if (e.origin !== window.location.origin) return;
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'enable-edit-mode') enableEditMode();
    else if (e.data.type === 'disable-edit-mode') disableEditMode();
    else if (e.data.type === 'builder-update') handleBuilderUpdate(e.data);
  });
})();
`;
