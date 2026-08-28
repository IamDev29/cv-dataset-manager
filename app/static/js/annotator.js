/**
 * Boxel - CV Dataset Manager
 * Canvas Annotator (replaces Annotator.tsx)
 * Browser-side bounding box drawing, resizing, moving, and AI suggestion review.
 */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let _state = null;
  let _options = null;

  const RESIZE_HANDLES = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];

  // ─── Public API ─────────────────────────────────────────────────────────────
  window.BoxelAnnotator = {
    open(options) {
      _options = options;
      const currentImage = options.images[options.currentIndex];
      _state = {
        image: currentImage,
        currentIndex: options.currentIndex,
        images: options.images,
        classes: options.classes || [],
        annotations: [...(currentImage.annotations || [])],
        aiSuggestions: [...(currentImage.aiSuggestions || [])],
        selectedBoxId: null,
        hoveredBoxId: null,
        activeClassId: (options.classes && options.classes.length > 0) ? options.classes[0].id : '',
        drawingBox: null,
        dragStart: null,
        activeAction: null,
        showShortcuts: false,
      };
      _render();
    },
    close() {
      _cleanup();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  function _render() {
    const root = document.getElementById('annotator-root');
    if (!root) return;
    root.className = 'active';
    root.innerHTML = _buildHTML();
    _attachEventListeners();
  }

  function _buildHTML() {
    const img = _state.image;
    const classes = _state.classes;
    const annotations = _state.annotations;
    const aiSuggestions = _state.aiSuggestions;
    const hasNext = _state.currentIndex < _state.images.length - 1;
    const hasPrev = _state.currentIndex > 0;

    return `
      <div id="annotator-shell" class="fixed inset-0 z-[150] flex flex-col md:flex-row overflow-hidden select-none"
           style="background:#060810;color:#E6E9EF;font-family:'Inter',-apple-system,sans-serif">

        <!-- Sidebar -->
        <div id="ann-sidebar" class="w-full md:w-80 flex flex-col shrink-0 order-2 md:order-1 h-1/3 md:h-full"
             style="background:#0C0E12;border-right:1px solid #181C22">

          <!-- Classes Header -->
          <div class="flex items-center justify-between p-4" style="border-bottom:1px solid #181C22">
            <div class="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:rgba(139,147,161,.7);text-transform:uppercase;letter-spacing:.1em">Classes</span>
            </div>
            <button id="ann-shortcuts-btn" title="Keyboard Shortcuts"
              style="padding:6px;border-radius:6px;background:transparent;border:none;color:rgba(139,147,161,.6);cursor:pointer;transition:color .15s">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
          </div>

          <!-- Classes List -->
          <div id="ann-classes-list" class="p-3 overflow-y-auto" style="border-bottom:1px solid #181C22;max-height:28%">
            ${_renderClassesList()}
          </div>

          <!-- AI Suggestions Section (if any present) -->
          <div id="ann-suggestions-container" style="${aiSuggestions.length > 0 ? '' : 'display:none;'}border-bottom:1px solid #181C22;max-height:30%;display:flex;flex-direction:column">
            <div style="padding:10px 14px;background:#120E1A;border-bottom:1px solid rgba(192,132,252,0.2);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
              <div style="display:flex;align-items:center;gap:6px">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFB020" stroke-width="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#FFB020;text-transform:uppercase;letter-spacing:.08em">AI Suggestions</span>
                <span id="ann-sug-badge" style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#FFB020;background:rgba(255,176,32,0.15);border:1px solid rgba(255,176,32,0.3);padding:0 6px;border-radius:4px">${aiSuggestions.length}</span>
              </div>
              <button id="ann-accept-all-btn" title="Accept All (Shift+A)"
                style="padding:3px 8px;border-radius:5px;background:#FFB020;border:none;color:#0F1116;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;cursor:pointer;display:flex;align-items:center;gap:4px">
                <span>Accept All</span>
                <kbd style="background:rgba(0,0,0,0.25);padding:1px 3px;border-radius:2px;font-size:8px">⇧A</kbd>
              </button>
            </div>
            <div id="ann-suggestions-list" style="overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:5px;background:rgba(18,14,26,0.3)">
              ${_renderSuggestionsList()}
            </div>
          </div>

          <!-- Confirmed Boxes List -->
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0">
            <div style="padding:12px 16px;border-bottom:1px solid #181C22;display:flex;align-items:center;justify-content:space-between;background:#0A0C10;flex-shrink:0">
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:rgba(139,147,161,.7);text-transform:uppercase;letter-spacing:.1em">Confirmed Boxes</span>
              <span id="ann-boxes-count" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(61,169,252,0.8);background:#06080B;border:1px solid #181C22;padding:1px 8px;border-radius:4px">${annotations.length}</span>
            </div>
            <div id="ann-boxes-list" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:5px">
              ${_renderBoxesList()}
            </div>
          </div>

          <!-- Nav legend -->
          <div id="ann-nav-legend" style="padding:10px 14px;border-top:1px solid #181C22;background:#0A0C10;flex-shrink:0">
            <span style="font-family:'JetBrains Mono',monospace;font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:rgba(139,147,161,.5);font-weight:700;display:block;margin-bottom:6px">Hotkeys</span>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(139,147,161,.7)">
              <div style="display:flex;justify-content:space-between">Next: <kbd style="background:#06080B;border:1px solid #181C22;color:#E6E9EF;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700">D/→</kbd></div>
              <div style="display:flex;justify-content:space-between">Prev: <kbd style="background:#06080B;border:1px solid #181C22;color:#E6E9EF;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700">A/←</kbd></div>
              <div style="display:flex;justify-content:space-between">Del Box: <kbd style="background:#06080B;border:1px solid #181C22;color:#F87171;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700">DEL</kbd></div>
              <div style="display:flex;justify-content:space-between">Accept AI: <kbd style="background:#06080B;border:1px solid #181C22;color:#FFB020;padding:1px 4px;border-radius:3px;font-size:8px;font-weight:700">⇧+A</kbd></div>
            </div>
          </div>

          <!-- Image info -->
          <div style="padding:8px 12px;border-top:1px solid #181C22;background:#06080B;font-size:10px;color:rgba(139,147,161,.6);flex-shrink:0;display:flex;gap:6px;align-items:center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style="font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(img.name)}</span>
          </div>
        </div>

        <!-- Main canvas area -->
        <div id="ann-main" class="flex-grow flex flex-col overflow-hidden order-1 md:order-2 h-2/3 md:h-full">
          <!-- Top nav bar -->
          <div style="height:56px;background:#0C0E12;border-bottom:1px solid #181C22;padding:0 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <div style="display:flex;align-items:center;gap:16px">
              <button id="ann-close-btn"
                style="padding:7px 14px;background:#06080B;border:1px solid #181C22;border-radius:8px;font-size:11px;font-weight:600;color:#E6E9EF;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                Exit Annotator
              </button>
              <h2 id="ann-image-name" style="font-size:11px;color:#8B93A1;font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${_esc(img.name)}</h2>
            </div>

            <!-- Split selector -->
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:rgba(139,147,161,.6);font-family:'JetBrains Mono',monospace">Split:</span>
              <select id="ann-split-select"
                style="background:#06080B;border:1px solid #181C22;color:#E6E9EF;font-size:11px;border-radius:8px;padding:5px 12px;outline:none;cursor:pointer;font-family:'JetBrains Mono',monospace">
                <option value="unassigned" ${img.split === 'unassigned' || !img.split ? 'selected' : ''}>Unassigned</option>
                <option value="train" ${img.split === 'train' ? 'selected' : ''}>Train</option>
                <option value="val" ${img.split === 'val' ? 'selected' : ''}>Validation</option>
                <option value="test" ${img.split === 'test' ? 'selected' : ''}>Test</option>
              </select>
            </div>

            <!-- Prev / Next -->
            <div style="display:flex;align-items:center;gap:8px">
              <button id="ann-prev-btn" ${!hasPrev ? 'disabled' : ''}
                style="padding:7px;border-radius:8px;border:1px solid ${hasPrev ? '#181C22' : 'rgba(24,28,34,.3)'};
                       background:#06080B;color:${hasPrev ? '#E6E9EF' : 'rgba(139,147,161,.3)'};
                       cursor:${hasPrev ? 'pointer' : 'not-allowed'};opacity:${hasPrev ? 1 : 0.3};display:flex;align-items:center;gap:6px;transition:all .15s"
                title="Previous Image (A / ←)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                <kbd style="font-size:9px;background:#0C0E12;border:1px solid #181C22;color:#8B93A1;padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace">A</kbd>
              </button>
              <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:rgba(139,147,161,.5)">${_state.currentIndex + 1} / ${_state.images.length}</span>
              <button id="ann-next-btn" ${!hasNext ? 'disabled' : ''}
                style="padding:7px;border-radius:8px;border:1px solid ${hasNext ? '#181C22' : 'rgba(24,28,34,.3)'};
                       background:#06080B;color:${hasNext ? '#E6E9EF' : 'rgba(139,147,161,.3)'};
                       cursor:${hasNext ? 'pointer' : 'not-allowed'};opacity:${hasNext ? 1 : 0.3};display:flex;align-items:center;gap:6px;transition:all .15s"
                title="Next Image (D / →)">
                <kbd style="font-size:9px;background:#0C0E12;border:1px solid #181C22;color:#8B93A1;padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace">D</kbd>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>

          <!-- Canvas viewport -->
          <div id="ann-viewport" style="flex:1;background:#040507;display:flex;align-items:center;justify-content:center;padding:32px;overflow:hidden;position:relative">
            ${classes.length === 0 ? `
              <div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:20;
                           background:rgba(255,176,32,0.1);border:1px solid rgba(255,176,32,0.35);
                           padding:8px 16px;border-radius:8px;display:flex;align-items:center;gap:8px">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFB020" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p style="font-size:11px;color:#FFB020;font-family:'Inter',sans-serif">Add a class in the sidebar to enable drawing!</p>
              </div>
            ` : ''}

            <!-- Image + boxes container (relative, sized by image) -->
            <div id="ann-canvas-container"
              style="position:relative;max-height:100%;max-width:100%;cursor:crosshair;user-select:none;
                     box-shadow:0 0 50px rgba(0,0,0,0.85);overflow:visible;display:flex;align-items:center;justify-content:center">
              <img id="ann-image" src="${img.dataUrl}" alt="${_esc(img.name)}"
                draggable="false"
                style="max-height:100%;max-width:100%;object-fit:contain;pointer-events:none;
                       user-select:none;border-radius:4px;border:1px solid rgba(24,28,34,.7);display:block">

              <!-- Bounding box overlay (same size as image) -->
              <div id="ann-boxes-overlay" style="position:absolute;inset:0;pointer-events:none"></div>
            </div>

            <!-- Active class hotkeys bar -->
            <div id="ann-hotkeys-bar" style="position:absolute;bottom:16px;left:16px;right:16px;z-index:10;
                                              display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;pointer-events:none">
              ${_renderHotkeysBarContent()}
            </div>
          </div>
        </div>

        <!-- Shortcuts modal -->
        <div id="ann-shortcuts-modal" style="display:none;position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;padding:16px">
          <div style="position:absolute;inset:0;background:rgba(4,5,7,0.9);backdrop-filter:blur(4px)" id="ann-shortcuts-backdrop"></div>
          <div style="position:relative;width:100%;max-width:340px;background:#0C0E12;border:1px solid #181C22;border-radius:12px;padding:20px;z-index:10">
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #181C22;padding-bottom:10px;margin-bottom:14px">
              <h3 style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.1em">Keyboard Hotkeys</h3>
              <button id="ann-shortcuts-close" style="padding:4px;border-radius:4px;background:transparent;border:none;color:#8B93A1;cursor:pointer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;color:#8B93A1">
              ${[
                ['Draw Box', 'Click + Drag'],
                ['Deselect / Exit', 'ESC'],
                ['Assign Class (1st–9th)', '1 – 9'],
                ['Delete Selected Box', 'DEL / Backspace'],
                ['Accept All AI Suggestions', 'Shift + A'],
                ['Next Image', 'D / ArrowRight'],
                ['Previous Image', 'A / ArrowLeft'],
              ].map(([label, key]) => `
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span>${label}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 8px;background:#06080B;border:1px solid #181C22;color:#E6E9EF;border-radius:4px">${key}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────────
  function _attachEventListeners() {
    document.getElementById('ann-close-btn').onclick = _close;
    document.getElementById('ann-shortcuts-btn').onclick = () => {
      const modal = document.getElementById('ann-shortcuts-modal');
      modal.style.display = 'flex';
    };
    document.getElementById('ann-shortcuts-close').onclick = () => {
      document.getElementById('ann-shortcuts-modal').style.display = 'none';
    };
    document.getElementById('ann-shortcuts-backdrop').onclick = () => {
      document.getElementById('ann-shortcuts-modal').style.display = 'none';
    };

    // Class buttons
    document.querySelectorAll('.ann-class-btn').forEach(btn => {
      btn.onclick = () => _selectClass(btn.dataset.classId);
    });

    // Accept all suggestions button
    const acceptAllBtn = document.getElementById('ann-accept-all-btn');
    if (acceptAllBtn) {
      acceptAllBtn.onclick = _acceptAllSuggestions;
    }

    _reattachSidebarEvents();

    // Split select
    document.getElementById('ann-split-select').onchange = (e) => {
      if (_options.onUpdateSplit) {
        _options.onUpdateSplit(_state.image.id, e.target.value);
        _state.images[_state.currentIndex] = { ..._state.image, split: e.target.value };
        _state.image = _state.images[_state.currentIndex];
      }
    };

    // Navigation buttons
    const prevBtn = document.getElementById('ann-prev-btn');
    const nextBtn = document.getElementById('ann-next-btn');
    if (prevBtn) prevBtn.onclick = () => _navigate(-1);
    if (nextBtn) nextBtn.onclick = () => _navigate(1);

    // Canvas mouse events
    const container = document.getElementById('ann-canvas-container');
    if (container) {
      container.onmousedown = _onMouseDown;
    }

    // Global keyboard
    document.addEventListener('keydown', _onKeyDown);

    // Wait for image to load before setting up overlay
    const imgEl = document.getElementById('ann-image');
    if (imgEl) {
      if (imgEl.complete) { _setupOverlay(); }
      else imgEl.onload = _setupOverlay;
    }
  }

  function _setupOverlay() {
    _updateBoxesOverlay();
  }

  // ─── Drawing & Dragging ──────────────────────────────────────────────────────
  function _onMouseDown(e) {
    if (e.button !== 0) return;
    const container = document.getElementById('ann-canvas-container');
    const imgEl = document.getElementById('ann-image');
    if (!container || !imgEl) return;
    if (_state.classes.length === 0) return;

    const target = e.target;
    // If clicking a resize handle, box, or suggestion button, skip
    if (target.closest('.ann-resize-handle') || target.closest('.ann-bbox-box') || target.closest('.ann-sug-box')) return;

    _state.selectedBoxId = null;
    _updateBoxesOverlay();
    _updateSidebar();

    const rect = imgEl.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;

    _state.drawingBox = { x: startX, y: startY, w: 0, h: 0 };
    _state.dragStart = { mouseX: e.clientX, mouseY: e.clientY, boxX: startX, boxY: startY, boxW: 0, boxH: 0 };
    _state.activeAction = 'draw';

    window.addEventListener('mousemove', _onWindowMouseMove);
    window.addEventListener('mouseup', _onWindowMouseUp);
  }

  function _onBoxMouseDown(box, action, e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;
    const imgEl = document.getElementById('ann-image');
    if (!imgEl) return;

    _state.selectedBoxId = box.id;
    _state.activeClassId = box.classId;
    _state.dragStart = {
      mouseX: e.clientX, mouseY: e.clientY,
      boxX: box.x, boxY: box.y, boxW: box.width, boxH: box.height
    };
    _state.activeAction = action;

    _updateBoxesOverlay();
    _updateSidebar();

    window.addEventListener('mousemove', _onWindowMouseMove);
    window.addEventListener('mouseup', _onWindowMouseUp);
  }

  function _onWindowMouseMove(e) {
    const imgEl = document.getElementById('ann-image');
    if (!imgEl || !_state.dragStart || !_state.activeAction) return;

    const action = _state.activeAction;
    const start = _state.dragStart;
    const rect = imgEl.getBoundingClientRect();
    const deltaX = (e.clientX - start.mouseX) / rect.width;
    const deltaY = (e.clientY - start.mouseY) / rect.height;

    if (action === 'draw') {
      const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      _state.drawingBox = {
        x: Math.min(start.boxX, curX),
        y: Math.min(start.boxY, curY),
        w: Math.abs(start.boxX - curX),
        h: Math.abs(start.boxY - curY)
      };
      _updateDrawingBox();
    } else {
      _state.annotations = _state.annotations.map(box => {
        if (box.id !== _state.selectedBoxId) return box;
        let { x, y, width, height } = box;
        const s = start;

        switch (action) {
          case 'move':
            x = Math.max(0, Math.min(1 - s.boxW, s.boxX + deltaX));
            y = Math.max(0, Math.min(1 - s.boxH, s.boxY + deltaY));
            width = s.boxW;
            height = s.boxH;
            break;
          case 'resize-tl':
            x = Math.max(0, Math.min(s.boxX + s.boxW - 0.01, s.boxX + deltaX));
            y = Math.max(0, Math.min(s.boxY + s.boxH - 0.01, s.boxY + deltaY));
            width = s.boxW - (x - s.boxX);
            height = s.boxH - (y - s.boxY);
            break;
          case 'resize-tr':
            y = Math.max(0, Math.min(s.boxY + s.boxH - 0.01, s.boxY + deltaY));
            width = Math.max(0.01, Math.min(1 - s.boxX, s.boxW + deltaX));
            height = s.boxH - (y - s.boxY);
            break;
          case 'resize-bl':
            x = Math.max(0, Math.min(s.boxX + s.boxW - 0.01, s.boxX + deltaX));
            width = s.boxW - (x - s.boxX);
            height = Math.max(0.01, Math.min(1 - s.boxY, s.boxH + deltaY));
            break;
          case 'resize-br':
            width = Math.max(0.01, Math.min(1 - s.boxX, s.boxW + deltaX));
            height = Math.max(0.01, Math.min(1 - s.boxY, s.boxH + deltaY));
            break;
          case 'resize-t':
            y = Math.max(0, Math.min(s.boxY + s.boxH - 0.01, s.boxY + deltaY));
            height = s.boxH - (y - s.boxY);
            break;
          case 'resize-b':
            height = Math.max(0.01, Math.min(1 - s.boxY, s.boxH + deltaY));
            break;
          case 'resize-l':
            x = Math.max(0, Math.min(s.boxX + s.boxW - 0.01, s.boxX + deltaX));
            width = s.boxW - (x - s.boxX);
            break;
          case 'resize-r':
            width = Math.max(0.01, Math.min(1 - s.boxX, s.boxW + deltaX));
            break;
        }
        return { ...box, x, y, width, height };
      });
      _updateBoxesOverlay();
    }
  }

  function _onWindowMouseUp() {
    if (_state.activeAction === 'draw' && _state.drawingBox) {
      const db = _state.drawingBox;
      if (db.w > 0.005 && db.h > 0.005 && _state.activeClassId) {
        const newBox = {
          id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          classId: _state.activeClassId,
          x: db.x, y: db.y, width: db.w, height: db.h
        };
        _state.annotations = [..._state.annotations, newBox];
        _state.selectedBoxId = newBox.id;
        _saveAnnotations();
      }
      _state.drawingBox = null;
      _clearDrawingBox();
      _updateBoxesOverlay();
      _updateSidebar();
    } else if (_state.selectedBoxId) {
      _saveAnnotations();
    }

    _state.dragStart = null;
    _state.activeAction = null;
    window.removeEventListener('mousemove', _onWindowMouseMove);
    window.removeEventListener('mouseup', _onWindowMouseUp);
  }

  // ─── Overlay Rendering ────────────────────────────────────────────────────────
  function _updateBoxesOverlay() {
    const overlay = document.getElementById('ann-boxes-overlay');
    if (!overlay) return;
    overlay.innerHTML = _renderBoxes() + _renderAISuggestionBoxes();

    // Attach confirmed box events
    document.querySelectorAll('.ann-bbox-box').forEach(el => {
      const boxId = el.dataset.boxId;
      const box = _state.annotations.find(b => b.id === boxId);
      if (!box) return;
      el.addEventListener('mousedown', (e) => _onBoxMouseDown(box, 'move', e));
      el.addEventListener('mouseenter', () => {
        _state.hoveredBoxId = boxId;
        _refreshBoxStyles();
      });
      el.addEventListener('mouseleave', () => {
        _state.hoveredBoxId = null;
        _refreshBoxStyles();
      });
    });

    // Resize handles
    document.querySelectorAll('.ann-resize-handle').forEach(el => {
      const boxId = el.dataset.boxId;
      const action = el.dataset.action;
      const box = _state.annotations.find(b => b.id === boxId);
      if (!box) return;
      el.addEventListener('mousedown', (e) => _onBoxMouseDown(box, action, e));
    });

    // Attach suggestion button events on canvas
    document.querySelectorAll('.ann-sug-accept-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        _acceptSuggestion(btn.dataset.sugId);
      };
    });
    document.querySelectorAll('.ann-sug-reject-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        _rejectSuggestion(btn.dataset.sugId);
      };
    });
  }

  function _renderBoxes() {
    return _state.annotations.map((box, idx) => {
      const cls = _state.classes.find(c => c.id === box.classId);
      const color = cls?.color || '#555555';
      const isSel = box.id === _state.selectedBoxId;
      const isHov = box.id === _state.hoveredBoxId;
      const textColor = _contrastYIQ(color);

      const borderColor = (isSel || isHov) ? '#ffffff' : `${color}60`;
      const borderStyle = isSel ? 'dashed' : 'solid';
      const bgColor = isSel ? 'rgba(255,255,255,0.05)' : isHov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.15)';
      const zIdx = (isSel || isHov) ? 30 : 20;
      const boxShadow = isSel ? '0 0 12px rgba(255,255,255,.4)' : isHov ? '0 0 8px rgba(255,255,255,.2)' : 'none';
      const sizeC = isSel ? '10px' : '8px';

      return `
        <div class="ann-bbox-box" data-box-id="${box.id}" style="
          position:absolute;
          left:${box.x * 100}%;top:${box.y * 100}%;
          width:${box.width * 100}%;height:${box.height * 100}%;
          border:2px ${borderStyle} ${borderColor};
          background:${bgColor};
          z-index:${zIdx};
          box-shadow:${boxShadow};
          pointer-events:all;
          cursor:move;
          transition:border-color .07s, background .07s;
        ">
          <!-- Corner brackets -->
          <div style="position:absolute;inset:0;pointer-events:none">
            <div style="position:absolute;top:0;left:0;width:${sizeC};height:${sizeC};border-top:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-left:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-radius:1px 0 0 0;transition:all .1s"></div>
            <div style="position:absolute;top:0;right:0;width:${sizeC};height:${sizeC};border-top:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-right:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-radius:0 1px 0 0;transition:all .1s"></div>
            <div style="position:absolute;bottom:0;left:0;width:${sizeC};height:${sizeC};border-bottom:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-left:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-radius:0 0 0 1px;transition:all .1s"></div>
            <div style="position:absolute;bottom:0;right:0;width:${sizeC};height:${sizeC};border-bottom:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-right:3px solid ${isSel ? '#fff' : isHov ? '#fff' : color};border-radius:0 0 1px 0;transition:all .1s"></div>
          </div>

          <!-- Label tag -->
          <div style="position:absolute;top:-20px;left:0;padding:1px 7px;border-radius:4px;font-size:9px;font-weight:700;
                       background:${color};color:${textColor};white-space:nowrap;pointer-events:none;
                       font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:4px">
            <span>${_esc(cls?.name || 'Unlabeled')}</span>
            <span style="opacity:0.7">#${idx + 1}</span>
          </div>

          ${isSel ? `
            <!-- Corner resize handles -->
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-tl" style="position:absolute;width:32px;height:32px;top:-16px;left:-16px;display:flex;align-items:center;justify-content:center;cursor:nwse-resize;z-index:40;pointer-events:all">
              <div style="width:14px;height:14px;border-top:3px solid white;border-left:3px solid white;transition:all .1s"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-tr" style="position:absolute;width:32px;height:32px;top:-16px;right:-16px;display:flex;align-items:center;justify-content:center;cursor:nesw-resize;z-index:40;pointer-events:all">
              <div style="width:14px;height:14px;border-top:3px solid white;border-right:3px solid white;transition:all .1s"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-bl" style="position:absolute;width:32px;height:32px;bottom:-16px;left:-16px;display:flex;align-items:center;justify-content:center;cursor:nesw-resize;z-index:40;pointer-events:all">
              <div style="width:14px;height:14px;border-bottom:3px solid white;border-left:3px solid white;transition:all .1s"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-br" style="position:absolute;width:32px;height:32px;bottom:-16px;right:-16px;display:flex;align-items:center;justify-content:center;cursor:nwse-resize;z-index:40;pointer-events:all">
              <div style="width:14px;height:14px;border-bottom:3px solid white;border-right:3px solid white;transition:all .1s"></div>
            </div>
            <!-- Edge handles -->
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-t" style="position:absolute;height:20px;left:16px;right:16px;top:-10px;cursor:ns-resize;z-index:35;display:flex;align-items:center;justify-content:center;pointer-events:all">
              <div style="height:3px;width:40px;border-radius:3px;background:rgba(255,255,255,.6)"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-b" style="position:absolute;height:20px;left:16px;right:16px;bottom:-10px;cursor:ns-resize;z-index:35;display:flex;align-items:center;justify-content:center;pointer-events:all">
              <div style="height:3px;width:40px;border-radius:3px;background:rgba(255,255,255,.6)"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-l" style="position:absolute;width:20px;top:16px;bottom:16px;left:-10px;cursor:ew-resize;z-index:35;display:flex;align-items:center;justify-content:center;pointer-events:all">
              <div style="width:3px;height:40px;border-radius:3px;background:rgba(255,255,255,.6)"></div>
            </div>
            <div class="ann-resize-handle" data-box-id="${box.id}" data-action="resize-r" style="position:absolute;width:20px;top:16px;bottom:16px;right:-10px;cursor:ew-resize;z-index:35;display:flex;align-items:center;justify-content:center;pointer-events:all">
              <div style="width:3px;height:40px;border-radius:3px;background:rgba(255,255,255,.6)"></div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('') + (_state.drawingBox ? _renderDrawingBox() : '');
  }

  function _renderAISuggestionBoxes() {
    return _state.aiSuggestions.map((sug) => {
      const cls = _state.classes.find(c => c.id === sug.classId);
      const confPercent = Math.round((sug.confidence || 0) * 100);

      return `
        <div class="ann-sug-box group/sug" data-sug-id="${sug.id}" style="
          position:absolute;
          left:${sug.x * 100}%;top:${sug.y * 100}%;
          width:${sug.width * 100}%;height:${sug.height * 100}%;
          border:2px dashed #FFB020;
          background:rgba(255, 176, 32, 0.08);
          z-index:25;
          pointer-events:all;
        ">
          <!-- Amber corner brackets -->
          <div style="position:absolute;inset:0;pointer-events:none">
            <div style="position:absolute;top:0;left:0;width:8px;height:8px;border-top:2px solid #FFB020;border-left:2px solid #FFB020"></div>
            <div style="position:absolute;top:0;right:0;width:8px;height:8px;border-top:2px solid #FFB020;border-right:2px solid #FFB020"></div>
            <div style="position:absolute;bottom:0;left:0;width:8px;height:8px;border-bottom:2px solid #FFB020;border-left:2px solid #FFB020"></div>
            <div style="position:absolute;bottom:0;right:0;width:8px;height:8px;border-bottom:2px solid #FFB020;border-right:2px solid #FFB020"></div>
          </div>

          <!-- Suggestion label tag with confidence in monospace -->
          <div style="position:absolute;top:-22px;left:0;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;
                       background:#FFB020;color:#0F1116;white-space:nowrap;pointer-events:none;
                       font-family:'JetBrains Mono',monospace;display:flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(0,0,0,0.5)">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>${_esc(cls?.name || 'Suggestion')}</span>
            <span style="opacity:0.85">· ${confPercent}%</span>
          </div>

          <!-- Micro accept / reject action buttons (visible on hover) -->
          <div style="position:absolute;bottom:-24px;right:0;display:flex;align-items:center;gap:4px;z-index:30;background:#0C0E12;padding:2px 4px;border-radius:6px;border:1px solid #2A2F38;box-shadow:0 4px 10px rgba(0,0,0,0.6)">
            <button class="ann-sug-accept-btn" data-sug-id="${sug.id}" title="Accept suggestion"
              style="padding:2px 5px;background:#00E5A3;color:#0F1116;border:none;border-radius:4px;font-size:9px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:2px">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
              <span>Accept</span>
            </button>
            <button class="ann-sug-reject-btn" data-sug-id="${sug.id}" title="Reject suggestion"
              style="padding:2px 5px;background:rgba(239,68,68,0.2);color:#F87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;font-size:9px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:2px">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function _renderDrawingBox() {
    const db = _state.drawingBox;
    return `
      <div style="position:absolute;left:${db.x * 100}%;top:${db.y * 100}%;
                   width:${db.w * 100}%;height:${db.h * 100}%;
                   border:2px dashed #3DA9FC;background:rgba(61,169,252,0.05);z-index:40;pointer-events:none">
        <div style="position:absolute;inset:0;pointer-events:none">
          <div style="position:absolute;top:0;left:0;width:8px;height:8px;border-top:2px solid #3DA9FC;border-left:2px solid #3DA9FC"></div>
          <div style="position:absolute;top:0;right:0;width:8px;height:8px;border-top:2px solid #3DA9FC;border-right:2px solid #3DA9FC"></div>
          <div style="position:absolute;bottom:0;left:0;width:8px;height:8px;border-bottom:2px solid #3DA9FC;border-left:2px solid #3DA9FC"></div>
          <div style="position:absolute;bottom:0;right:0;width:8px;height:8px;border-bottom:2px solid #3DA9FC;border-right:2px solid #3DA9FC"></div>
        </div>
      </div>
    `;
  }

  function _updateDrawingBox() {
    const overlay = document.getElementById('ann-boxes-overlay');
    if (!overlay) return;
    const existing = overlay.querySelector('.ann-drawing-box');
    if (existing) existing.remove();
    const db = _state.drawingBox;
    if (!db) return;
    const el = document.createElement('div');
    el.className = 'ann-drawing-box';
    el.style.cssText = `position:absolute;left:${db.x * 100}%;top:${db.y * 100}%;
      width:${db.w * 100}%;height:${db.h * 100}%;
      border:2px dashed #3DA9FC;background:rgba(61,169,252,0.05);z-index:40;pointer-events:none`;
    overlay.appendChild(el);
  }

  function _clearDrawingBox() {
    const overlay = document.getElementById('ann-boxes-overlay');
    if (!overlay) return;
    const existing = overlay.querySelector('.ann-drawing-box');
    if (existing) existing.remove();
  }

  function _refreshBoxStyles() {
    _updateBoxesOverlay();
  }

  // ─── Sidebar Updates ──────────────────────────────────────────────────────────
  function _updateSidebar() {
    const classesList = document.getElementById('ann-classes-list');
    const boxesList = document.getElementById('ann-boxes-list');
    const sugsContainer = document.getElementById('ann-suggestions-container');
    const sugsList = document.getElementById('ann-suggestions-list');
    const sugBadge = document.getElementById('ann-sug-badge');
    const boxesCount = document.getElementById('ann-boxes-count');

    if (classesList) classesList.innerHTML = _renderClassesList();
    if (boxesList) boxesList.innerHTML = _renderBoxesList();
    if (boxesCount) boxesCount.textContent = _state.annotations.length;

    if (sugsContainer && sugsList) {
      if (_state.aiSuggestions.length > 0) {
        sugsContainer.style.display = 'flex';
        sugsList.innerHTML = _renderSuggestionsList();
        if (sugBadge) sugBadge.textContent = _state.aiSuggestions.length;
      } else {
        sugsContainer.style.display = 'none';
      }
    }

    _reattachSidebarEvents();
    _updateHotkeysBar();
  }

  function _renderClassesList() {
    const classes = _state.classes;
    if (classes.length === 0) return `<div style="text-align:center;padding:20px;background:#06080B;border-radius:8px;border:1px dashed #181C22"><p style="font-size:11px;color:rgba(139,147,161,.7)">Define classes first.</p></div>`;
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${classes.map((cls, idx) => {
      const selBox = _state.selectedBoxId && _state.annotations.find(b => b.id === _state.selectedBoxId);
      const isSelectedBoxClass = selBox && selBox.classId === cls.id;
      const isActive = cls.id === _state.activeClassId;
      const bc = isSelectedBoxClass ? '#00E5A3' : isActive ? '#3DA9FC' : '#181C22';
      const bg = isSelectedBoxClass ? 'rgba(0,229,163,0.1)' : isActive ? 'rgba(61,169,252,0.1)' : 'rgba(6,8,11,0.4)';
      const tc = isSelectedBoxClass ? '#00E5A3' : isActive ? '#3DA9FC' : 'rgba(139,147,161,0.8)';
      return `<button class="ann-class-btn" data-class-id="${cls.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;border:1px solid ${bc};background:${bg};color:${tc};font-size:11px;cursor:pointer;text-align:left"><div style="display:flex;align-items:center;gap:8px;min-width:0"><span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${cls.color}"></span><span style="font-family:'Inter',sans-serif;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(cls.name)}</span></div>${idx < 9 ? `<kbd style="font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;color:rgba(139,147,161,.6);background:#06080B;border:1px solid #181C22;padding:1px 5px;border-radius:3px;flex-shrink:0">${idx + 1}</kbd>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function _renderSuggestionsList() {
    const suggestions = _state.aiSuggestions;
    if (suggestions.length === 0) return '';
    return suggestions.map((sug) => {
      const cls = _state.classes.find(c => c.id === sug.classId);
      const confPercent = Math.round((sug.confidence || 0) * 100);
      return `
        <div class="ann-sug-item" data-sug-id="${sug.id}"
          style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;
                 border:1px dashed rgba(255,176,32,0.4);background:rgba(255,176,32,0.06);font-size:10px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            <span style="width:8px;height:8px;border-radius:50%;background:${cls?.color || '#FFB020'};flex-shrink:0"></span>
            <span style="font-weight:600;color:#E6E9EF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(cls?.name || 'Class')}</span>
            <span style="font-family:'JetBrains Mono',monospace;color:#FFB020;font-size:9px;font-weight:700">${confPercent}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
            <button class="ann-sug-accept-btn" data-sug-id="${sug.id}" title="Accept"
              style="padding:3px 6px;border-radius:4px;background:#00E5A3;color:#0F1116;border:none;font-size:8px;font-weight:700;cursor:pointer">
              ✓
            </button>
            <button class="ann-sug-reject-btn" data-sug-id="${sug.id}" title="Reject"
              style="padding:3px 6px;border-radius:4px;background:rgba(239,68,68,0.2);color:#F87171;border:1px solid rgba(239,68,68,0.4);font-size:8px;font-weight:700;cursor:pointer">
              ✗
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function _renderBoxesList() {
    const annotations = _state.annotations;
    if (annotations.length === 0) {
      return `<div style="text-align:center;padding:30px 16px;color:rgba(139,147,161,.5);font-size:11px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px"><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9z"/><polyline points="15 3 15 9 21 9"/></svg>
        No confirmed bounding boxes.
        <p style="font-size:10px;margin-top:4px;color:rgba(139,147,161,.4)">Draw boxes or accept AI suggestions.</p>
      </div>`;
    }
    return annotations.map((box, idx) => {
      const cls = _state.classes.find(c => c.id === box.classId);
      const isSel = box.id === _state.selectedBoxId;
      return `<div class="ann-box-item" data-box-id="${box.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;border:1px solid ${isSel ? '#3DA9FC' : '#181C22'};background:${isSel ? 'rgba(61,169,252,0.1)' : 'rgba(6,8,11,0.2)'};cursor:pointer;transition:all .15s;font-size:11px;color:${isSel ? '#E6E9EF' : '#8B93A1'}"><div style="display:flex;align-items:center;gap:8px;min-width:0"><span style="width:14px;height:14px;border-radius:3px;border:1px solid ${cls?.color || '#555'};display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:8px;font-weight:700;color:#8B93A1;background:#06080B;flex-shrink:0">${idx + 1}</span><span style="font-family:'Inter',sans-serif;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(cls?.name || 'Unlabeled')}</span></div><button class="ann-delete-box-btn" data-box-id="${box.id}" style="padding:5px;border-radius:5px;background:transparent;border:none;color:rgba(139,147,161,.6);cursor:pointer;flex-shrink:0"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></div>`;
    }).join('');
  }

  function _reattachSidebarEvents() {
    document.querySelectorAll('.ann-class-btn').forEach(btn => {
      btn.onclick = () => _selectClass(btn.dataset.classId);
    });
    document.querySelectorAll('.ann-box-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.ann-delete-box-btn')) return;
        _state.selectedBoxId = el.dataset.boxId;
        _updateBoxesOverlay();
        _updateSidebar();
      };
    });
    document.querySelectorAll('.ann-delete-box-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        _deleteBox(btn.dataset.boxId);
      };
    });

    document.querySelectorAll('.ann-sug-accept-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        _acceptSuggestion(btn.dataset.sugId);
      };
    });
    document.querySelectorAll('.ann-sug-reject-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        _rejectSuggestion(btn.dataset.sugId);
      };
    });
  }

  function _renderHotkeysBarContent() {
    return `
      <span style="font-size:9px;font-family:'JetBrains Mono',monospace;text-transform:uppercase;color:rgba(139,147,161,.4);letter-spacing:.1em;margin-right:4px">Hotkeys:</span>
      ${_state.classes.slice(0, 9).map((cls, idx) => {
        const isActive = cls.id === _state.activeClassId;
        return `<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;border:1px solid ${isActive ? 'rgba(61,169,252,.4)' : 'rgba(24,28,34,.5)'};background:${isActive ? '#0C0E12' : 'rgba(12,14,18,0.8)'};backdrop-filter:blur(8px);font-size:10px;font-family:'JetBrains Mono',monospace;color:${isActive ? '#3DA9FC' : 'rgba(139,147,161,.5)'};${isActive ? 'box-shadow:0 0 10px rgba(61,169,252,.15);transform:scale(1.03);font-weight:700' : ''}"><kbd style="padding:1px 5px;border-radius:3px;font-size:9px;font-family:'JetBrains Mono',monospace;border:1px solid ${isActive ? 'rgba(61,169,252,.3)' : '#181C22'};background:${isActive ? 'rgba(61,169,252,.1)' : 'rgba(6,8,11,.5)'};color:${isActive ? '#3DA9FC' : 'rgba(139,147,161,.5)'}">${idx + 1}</kbd><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px">${_esc(cls.name)}</span></div>`;
      }).join('')}
    `;
  }

  function _updateHotkeysBar() {
    const bar = document.getElementById('ann-hotkeys-bar');
    if (!bar) return;
    bar.innerHTML = _renderHotkeysBarContent();
  }

  // ─── Suggestion Actions ───────────────────────────────────────────────────────
  async function _acceptSuggestion(sugId) {
    const sug = _state.aiSuggestions.find(s => s.id === sugId);
    if (!sug) return;

    // Convert to confirmed BoundingBox
    const newBox = {
      id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      classId: sug.classId,
      x: sug.x,
      y: sug.y,
      width: sug.width,
      height: sug.height,
    };

    _state.annotations = [..._state.annotations, newBox];
    _state.aiSuggestions = _state.aiSuggestions.filter(s => s.id !== sugId);

    _updateBoxesOverlay();
    _updateSidebar();

    if (_options.onAcceptSuggestions) {
      await _options.onAcceptSuggestions(_state.image.id, [sugId]);
    }
  }

  async function _acceptAllSuggestions() {
    if (!_state.aiSuggestions || _state.aiSuggestions.length === 0) return;

    const acceptedBoxes = _state.aiSuggestions.map(sug => ({
      id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      classId: sug.classId,
      x: sug.x,
      y: sug.y,
      width: sug.width,
      height: sug.height,
    }));

    _state.annotations = [..._state.annotations, ...acceptedBoxes];
    _state.aiSuggestions = [];

    _updateBoxesOverlay();
    _updateSidebar();

    if (_options.onAcceptSuggestions) {
      await _options.onAcceptSuggestions(_state.image.id, []);
    }
  }

  async function _rejectSuggestion(sugId) {
    _state.aiSuggestions = _state.aiSuggestions.filter(s => s.id !== sugId);
    _updateBoxesOverlay();
    _updateSidebar();

    if (_options.onRejectSuggestions) {
      await _options.onRejectSuggestions(_state.image.id, [sugId]);
    }
  }

  // ─── Standard Actions ────────────────────────────────────────────────────────
  function _selectClass(classId) {
    if (_state.selectedBoxId) {
      _state.annotations = _state.annotations.map(b => b.id === _state.selectedBoxId ? { ...b, classId } : b);
      _saveAnnotations();
      _updateBoxesOverlay();
    }
    _state.activeClassId = classId;
    _updateSidebar();
  }

  function _deleteBox(boxId) {
    _state.annotations = _state.annotations.filter(b => b.id !== boxId);
    if (_state.selectedBoxId === boxId) _state.selectedBoxId = null;
    _saveAnnotations();
    _updateBoxesOverlay();
    _updateSidebar();
  }

  function _saveAnnotations() {
    if (_options.onSave) {
      _options.onSave(_state.image.id, _state.annotations);
      _state.images[_state.currentIndex] = { ..._state.images[_state.currentIndex], annotations: _state.annotations };
    }
  }

  function _navigate(direction) {
    const newIdx = _state.currentIndex + direction;
    if (newIdx < 0 || newIdx >= _state.images.length) return;
    _state.currentIndex = newIdx;
    _state.image = _state.images[newIdx];
    _state.annotations = [...(_state.image.annotations || [])];
    _state.aiSuggestions = [...(_state.image.aiSuggestions || [])];
    _state.selectedBoxId = null;
    _state.hoveredBoxId = null;
    _state.drawingBox = null;
    _render();
  }

  function _close() {
    _cleanup();
    if (_options && _options.onClose) _options.onClose();
  }

  function _cleanup() {
    const root = document.getElementById('annotator-root');
    if (root) { root.className = ''; root.innerHTML = ''; }
    document.removeEventListener('keydown', _onKeyDown);
    window.removeEventListener('mousemove', _onWindowMouseMove);
    window.removeEventListener('mouseup', _onWindowMouseUp);
    _state = null;
    _options = null;
  }

  // ─── Keyboard ─────────────────────────────────────────────────────────────────
  function _onKeyDown(e) {
    if (!_state) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = e.key;

    // Shift + A: Accept all suggestions
    if ((key === 'A' || key === 'a') && e.shiftKey) {
      e.preventDefault();
      _acceptAllSuggestions();
      return;
    }

    // Number keys 1-9: assign class
    if (/^[1-9]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (idx < _state.classes.length) {
        _selectClass(_state.classes[idx].id);
      }
    }

    // Delete / Backspace
    if ((key === 'Delete' || key === 'Backspace') && _state.selectedBoxId) {
      e.preventDefault();
      _deleteBox(_state.selectedBoxId);
    }

    // Escape
    if (key === 'Escape') {
      if (_state.selectedBoxId) {
        _state.selectedBoxId = null;
        _updateBoxesOverlay();
        _updateSidebar();
      } else {
        _close();
      }
    }

    // Navigation
    if (key === 'ArrowRight' || (!e.shiftKey && key.toLowerCase() === 'd')) {
      _navigate(1);
    }
    if (key === 'ArrowLeft' || (!e.shiftKey && key.toLowerCase() === 'a')) {
      _navigate(-1);
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────
  function _contrastYIQ(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#0C0E12' : '#ffffff';
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
