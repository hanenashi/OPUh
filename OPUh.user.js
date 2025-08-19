// ==UserScript==
// @name         OPUh
// @namespace    https://opu.peklo.biz/
// @version      3.13.8
// @description  Image preview, crop, resize, delete, drag reorder (mobile-friendly). Multi-URL paste with circular FAB progress, draggable FAB (saved pos), desktop-safe clicks.
// @match        https://opu.peklo.biz/
// @run-at       document-end
// @noframes
// @grant        none
// @updateURL    https://raw.githubusercontent.com/hanenashi/OPUh/main/OPUh.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/OPUh/main/OPUh.user.js
// ==/UserScript==

/* global Sortable, Cropper */
(function () {
  'use strict';

  const SUPPORTED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
  const input = document.querySelector('#obrazek');

  // ---- styles (incl. mobile DnD handle friendliness + FAB ring + toast)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash { 0%,100%{background:transparent;} 50%{background:#ffdddd;} }
    .sortable-ghost { opacity: 0.5; background: #333 !important; }

    .opu-drag-handle {
      font-size: 18px; text-align: center; vertical-align: middle;
      width: 28px; padding: 6px 8px; cursor: grab; user-select: none;
      -ms-touch-action: none; touch-action: none; color: #888;
    }

    .opu-unsupported-box {
      width: 200px; height: 150px; background-color: #444; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; font-size: 16px;
    }

    #opu-crop-modal {
      position: fixed; inset: 0; background: rgba(0,0,0,0.85);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; backdrop-filter: blur(3px);
    }
    #opu-crop-content { background: #222; padding: 10px; border-radius: 6px; box-shadow: 0 0 10px #000; position: relative; }
    #opu-crop-img { max-width: 80vw; max-height: 70vh; }
    #opu-crop-btns { display: flex; justify-content: space-between; margin-top: 10px; }

    .opu-overlay {
      position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.8); color: #fff;
      display: none; gap: 5px; padding: 3px 5px; cursor: pointer; border-radius: 0 0 0 5px; z-index: 5;
    }
    .opu-overlay .opu-btn { display: inline-block; padding: 0 2px; line-height: 1; }

    /* --- Circular FAB with progress ring (stable on mobile) --- */
    #opu-paste-fab-wrap {
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      display: grid; place-items: center;
      --ring-size: 64px;           /* outer size */
      --pad: 8px;                  /* ring thickness */
      --pct: 0deg;                 /* progress angle */
      --ring-color: #5aa657;
      --track-color: #2a2a2a;
      width: var(--ring-size); height: var(--ring-size);
      border-radius: 50%;
      cursor: grab; user-select: none;
      touch-action: none;          /* keep pointer stream on touch */
    }
    #opu-paste-fab-wrap::before {
      content: ""; position: absolute; inset: 0; border-radius: 50%;
      background: conic-gradient(var(--ring-color) var(--pct), var(--track-color) 0);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--pad)), #000 0);
              mask: radial-gradient(farthest-side, transparent calc(100% - var(--pad)), #000 0);
      pointer-events: none;
      transition: background .15s linear;
    }
    #opu-paste-fab-wrap:not(.in-progress)::before {
      background: conic-gradient(var(--track-color) 360deg, var(--track-color) 0);
    }
    #opu-paste-fab-wrap.dragging { cursor: grabbing; }

    #opu-paste-fab {
      width: calc(var(--ring-size) - 2*var(--pad));
      height: calc(var(--ring-size) - 2*var(--pad));
      border-radius: 50%;
      background: #222; color: #fff; border: 1px solid #444;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 22px; line-height: 1; cursor: inherit; user-select: none;
      -webkit-tap-highlight-color: transparent; text-align: center; padding: 6px;
      position: relative; z-index: 1;
      touch-action: none;          /* no pan/zoom while starting drag */
    }
    #opu-paste-fab:active { transform: scale(0.97); }

    #opu-paste-fab .fab-status {
      font-size: 14px; line-height: 1.1; color: #e7ffe7; white-space: nowrap;
    }

    @media (orientation: portrait) {
      #opu-paste-fab-wrap { --ring-size: 128px; }
      #opu-paste-fab { font-size: 44px; }
      #opu-paste-fab .fab-status { font-size: 20px; }
    }

    #opu-toast {
      position: fixed; bottom: 16px; right: calc(16px + 72px);
      background: rgba(20,20,20,0.95); color: #fff; padding: 8px 10px;
      border-radius: 6px; font-size: 12px; z-index: 99999; display: none;
      max-width: 70vw; word-break: break-word; border: 1px solid #444;
    }
  `;
  document.head.appendChild(style);

  // ---- external libs
  const cropperCSS = document.createElement('link');
  cropperCSS.rel = 'stylesheet';
  cropperCSS.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
  document.head.appendChild(cropperCSS);

  const cropperJS = document.createElement('script');
  cropperJS.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js';
  document.head.appendChild(cropperJS);

  const sortableJS = document.createElement('script');
  sortableJS.src = 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js';
  document.head.appendChild(sortableJS);

  // ---- helpers
  function truncateName(name, maxLen = 24) {
    if (name.length <= maxLen) return name;
    const extIndex = name.lastIndexOf('.');
    const base = name.slice(0, extIndex);
    const ext = name.slice(extIndex);
    return base.slice(0, maxLen - ext.length - 3) + '...' + ext;
  }
  function formatFileSize(bytes) {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(2) + ' MB'
      : Math.round(bytes / 1024) + ' KB';
  }
  function baseNamePlus(file, suffix, outExt) {
    const m = file.name.match(/^(.*?)(\.[^.]+)?$/);
    const base = m ? m[1] : 'image';
    const ext = outExt || (m && m[2]) || '.jpg';
    return `${base}${suffix}${ext}`;
  }
  function toast(msg, ms = 2200) {
    let t = document.getElementById('opu-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'opu-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, ms);
  }

  // ---- FAB ring progress API (compact "n/N"; resets to track-only)
  function getFabParts() {
    const wrap = document.getElementById('opu-paste-fab-wrap');
    const fab = document.getElementById('opu-paste-fab');
    return { wrap, fab };
  }
  function setFabText(text) {
    const { fab } = getFabParts();
    if (!fab) return;
    fab.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'fab-status';
    span.textContent = text;
    fab.appendChild(span);
  }
  function setFabIcon(icon = '📋') {
    const { fab } = getFabParts();
    if (!fab) return;
    fab.textContent = icon;
  }
  function progressStart(total) {
    const { wrap } = getFabParts();
    if (!wrap) return;
    wrap.classList.add('in-progress');
    wrap.style.setProperty('--pct', '0deg');
    setFabText(`0/${total}`);
    wrap._total = total;
    wrap._done = 0;
  }
  function progressTick() {
    const { wrap } = getFabParts();
    if (!wrap || !wrap._total) return;
    wrap._done++;
    const pct = Math.max(0, Math.min(1, wrap._done / wrap._total));
    const deg = Math.round(pct * 360);
    wrap.style.setProperty('--pct', `${deg}deg`);
    setFabText(`${wrap._done}/${wrap._total}`);
  }
  function progressDone(summary = 'Done') {
    const { wrap } = getFabParts();
    if (!wrap) return;
    wrap.style.setProperty('--pct', '360deg');
    setFabText(summary);
    clearTimeout(wrap._fabTimer);
    wrap._fabTimer = setTimeout(() => {
      wrap.classList.remove('in-progress');      // back to gray track
      wrap.style.setProperty('--pct', '0deg');
      setFabIcon('📋');
    }, 900);
    wrap._total = 0; wrap._done = 0;
  }

  // ---- clean OPU fallback preview
  function nukeFallbackPreview() {
    document.getElementById('xpc-ctrlv')?.remove();
    document.getElementById('dimensions-output')?.remove();
  }

  // ---- preview table + Sortable
  function createTable() {
    const table = document.createElement('table');
    table.id = 'opu-preview-table';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';
    table.appendChild(document.createElement('tbody'));
    return table;
  }
  function createOrUpdateSortable(tbody) {
    if (!window.Sortable) return;
    if (tbody._sortable?.destroy) tbody._sortable.destroy();
    tbody._sortable = Sortable.create(tbody, {
      handle: '.opu-drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 5,
      delayOnTouchOnly: true,
      delay: 120,
      touchStartThreshold: 3,
      onEnd: updateFileInput
    });
  }
  function resetPreviews() { document.getElementById('opu-preview-table')?.remove(); }
  function renderPreviews(files) {
    resetPreviews();
    if (!files?.length) return;
    const table = createTable();
    const tbody = table.querySelector('tbody');
    files.forEach(file => {
      const row = document.createElement('tr');
      const dragCell = document.createElement('td');
      dragCell.className = 'opu-drag-handle';
      dragCell.textContent = '☰';
      dragCell.setAttribute('aria-label', 'Drag handle');
      row.appendChild(dragCell);
      const cell = document.createElement('td');
      cell.style.position = 'relative';
      cell.style.padding = '10px';
      row.appendChild(cell);
      tbody.appendChild(row);
      createPreview(cell, file, true);
    });
    input.after(table);
    createOrUpdateSortable(tbody);
  }

  // ---- overlays / tools (resize/crop)
  function promptResize(wrapper, cell, file) {
    document.querySelectorAll('.resize-input').forEach(el => el.remove());
    const wand = wrapper.querySelector('.resize-btn');
    if (!wand) return;
    const inputResize = document.createElement('input');
    inputResize.type = 'text';
    inputResize.placeholder = '50 or 800x600 or 800x';
    inputResize.className = 'resize-input';
    Object.assign(inputResize.style, {
      position: 'absolute', left: '0', top: '100%', marginTop: '5px',
      transform: 'translateX(-50%)', width: '110px', fontSize: '11px',
      textAlign: 'center', border: '1px solid #888', outline: 'none',
      zIndex: '100', background: '#111', color: '#eee'
    });
    const overlay = wrapper.querySelector('.opu-overlay');
    overlay?.classList.add('locked');
    if (overlay) overlay.style.display = 'flex';
    wand.parentElement.appendChild(inputResize);
    inputResize.focus();
    function cleanup() {
      inputResize.remove();
      if (overlay) { overlay.classList.remove('locked'); overlay.style.display = ''; }
      document.removeEventListener('pointerdown', onDocPointerDown, true);
    }
    function onDocPointerDown(event) {
      const withinOverlay = overlay && overlay.contains(event.target);
      const withinInput = inputResize.contains(event.target);
      if (!withinOverlay && !withinInput) cleanup();
    }
    document.addEventListener('pointerdown', onDocPointerDown, true);
    inputResize.addEventListener('keydown', (e) => {
      const img = wrapper.querySelector('img');
      const ow = img?.naturalWidth || 0;
      const oh = img?.naturalHeight || 0;
      const value = inputResize.value.trim();
      const percent = /^([1-9][0-9]?|100)$/;
      const fixed = /^(\d+)[xX](\d+)$/;
      const oneSide = /^(\d+)[xX]$|^[xX](\d+)$/;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!ow || !oh) {
          inputResize.value = 'ERROR';
          inputResize.style.border = '2px solid red';
          inputResize.style.color = 'red';
          inputResize.style.animation = 'flash 0.3s ease-in-out 2';
          inputResize.onanimationend = () => {
            inputResize.style.border = '1px solid #888';
            inputResize.style.color = '';
            inputResize.style.animation = '';
            inputResize.value = '';
          };
          return;
        }
        let nw, nh;
        if (percent.test(value)) {
          const scale = parseInt(value, 10);
          nw = Math.round(ow * scale / 100);
          nh = Math.round(oh * scale / 100);
        } else if (fixed.test(value)) {
          const m = value.match(fixed);
          nw = parseInt(m[1], 10);
          nh = parseInt(m[2], 10);
        } else if (oneSide.test(value)) {
          const m = value.match(oneSide);
          if (m[1]) { nw = parseInt(m[1], 10); nh = Math.round(oh * (nw / ow)); }
          else { nh = parseInt(m[2], 10); nw = Math.round(ow * (nh / oh)); }
        } else {
          inputResize.value = 'ERROR';
          inputResize.style.border = '2px solid red';
          inputResize.style.color = 'red';
          inputResize.style.animation = 'flash 0.3s ease-in-out 2';
          inputResize.onanimationend = () => {
            inputResize.style.border = '1px solid #888';
            inputResize.style.color = '';
            inputResize.style.animation = '';
            inputResize.value = '';
          };
          return;
        }
        resizeImage(wrapper, cell, file, nw, nh);
        cleanup();
      } else if (e.key === 'Escape') {
        cleanup();
      }
    });
    inputResize.addEventListener('blur', () => setTimeout(() => {
      if (document.body.contains(inputResize)) cleanup();
    }, 50));
  }
  function resizeImage(wrapper, cell, file, newW, newH) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(newW));
    canvas.height = Math.max(1, Math.floor(newH));
    const ctx = canvas.getContext('2d');
    const img = wrapper.querySelector('img');
    if (!img) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const outType = file.type.includes('png') ? 'image/png' : 'image/jpeg';
    const outExt = outType === 'image/png' ? '.png' : '.jpg';
    const quality = outType === 'image/jpeg' ? 0.85 : undefined;
    canvas.toBlob(blob => {
      if (!blob) return;
      const outName = baseNamePlus(file, '_resized', outExt);
      const resizedFile = new File([blob], outName, { type: outType });
      wrapper.style.filter = 'brightness(40%)';
      wrapper.querySelector('.resize-btn')?.style && (wrapper.querySelector('.resize-btn').style.display = 'none');
      wrapper.querySelector('.crop-btn')?.style && (wrapper.querySelector('.crop-btn').style.display = 'none');
      const row = cell.closest('tr');
      const newCell = row.insertCell(cell.cellIndex + 1);
      newCell.style.position = 'relative';
      newCell.style.padding = '10px';
      createPreview(newCell, resizedFile, false, cell);
    }, outType, quality);
  }
  function openCropper(file, cell, wrapper) {
    if (!window.Cropper) { toast('Cropper not ready yet.'); return; }
    const reader = new FileReader();
    reader.onload = function (e) {
      const modal = document.createElement('div');
      modal.id = 'opu-crop-modal';
      modal.innerHTML = `
        <div id="opu-crop-content">
          <img id="opu-crop-img" src="${e.target.result}">
          <div id="opu-crop-btns">
            <button id="crop-confirm">Crop</button>
            <button id="crop-cancel">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const cropImg = modal.querySelector('#opu-crop-img');
      const cropper = new Cropper(cropImg, { viewMode: 1 });
      modal.querySelector('#crop-cancel').onclick = () => modal.remove();
      modal.querySelector('#crop-confirm').onclick = () => {
        const croppedCanvas = cropper.getCroppedCanvas();
        croppedCanvas.toBlob(blob => {
          if (!blob) return;
          const outName = baseNamePlus(file, '_cropped', '.jpg');
          const croppedFile = new File([blob], outName, { type: 'image/jpeg' });
          wrapper.style.filter = 'brightness(40%)';
          wrapper.querySelector('.resize-btn')?.style && (wrapper.querySelector('.resize-btn').style.display = 'none');
          wrapper.querySelector('.crop-btn')?.style && (wrapper.querySelector('.crop-btn').style.display = 'none');
          const row = cell.closest('tr');
          const newCell = row.insertCell(cell.cellIndex + 1);
          newCell.style.position = 'relative';
          newCell.style.padding = '10px';
          createPreview(newCell, croppedFile, false, cell);
          modal.remove();
          updateFileInput();
        }, 'image/jpeg');
      };
    };
    reader.readAsDataURL(file);
  }
  function createOverlay(wrapper, cell, file, isOriginal, originalCell, opts = { enableEdit: true }) {
    const overlay = document.createElement('div');
    overlay.className = 'opu-overlay';
    overlay.innerHTML = `
      <span class="opu-btn delete-btn" title="Delete">❌</span>
      ${opts.enableEdit ? '<span class="opu-btn resize-btn" title="Resize">🪄</span><span class="opu-btn crop-btn" title="Crop">✂️</span>' : ''}
    `;
    overlay.querySelector('.delete-btn').onclick = () => {
      const url = wrapper._url;
      if (url) URL.revokeObjectURL(url);
      const row = cell.closest('tr');
      const isEdit = !isOriginal && originalCell;
      if (isEdit && originalCell) {
        const origWrapper = originalCell.querySelector('div');
        if (origWrapper) {
          origWrapper.style.filter = '';
          origWrapper.querySelectorAll('.resize-btn,.crop-btn').forEach(btn => btn.style.display = '');
        }
      }
      cell.remove();
      const nonHandleCells = Array.from(row.cells).slice(1);
      if (nonHandleCells.length === 0) row.remove();
      updateFileInput();
    };
    if (opts.enableEdit) {
      overlay.querySelector('.resize-btn').onclick = () => promptResize(wrapper, cell, file);
      overlay.querySelector('.crop-btn').onclick = () => openCropper(file, cell, wrapper);
    }
    return overlay;
  }
  function createPreview(cell, file, isOriginal, originalCell = null) {
    const nameLower = file.name.toLowerCase();
    const ext = nameLower.includes('.') ? nameLower.split('.').pop() : '';
    const isSupported = SUPPORTED_EXT.includes(ext);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper._file = file;
    wrapper.dataset.filename = file.name;
    const info = document.createElement('span');
    info.style.fontSize = '12px';
    info.style.textAlign = 'left';
    info.style.display = 'block';
    info.style.color = '#ddd';
    if (!isSupported) {
      const box = document.createElement('div');
      box.className = 'opu-unsupported-box';
      box.textContent = `.${ext || 'file'}`;
      wrapper.appendChild(box);
      info.textContent = `${truncateName(file.name)}\n${formatFileSize(file.size)}`;
      wrapper.appendChild(info);
      const overlay = createOverlay(wrapper, cell, file, isOriginal, originalCell, { enableEdit: false });
      function showOverlay() { overlay.style.display = 'flex'; }
      function hideOverlay() { if (!overlay.classList.contains('locked')) overlay.style.display = 'none'; }
      wrapper.addEventListener('mouseenter', showOverlay);
      wrapper.addEventListener('mouseleave', hideOverlay);
      wrapper.addEventListener('touchstart', () => { showOverlay(); }, { passive: true });
      wrapper.appendChild(overlay);
      cell.appendChild(wrapper);
      return;
    }
    const url = URL.createObjectURL(file);
    wrapper._url = url;
    const previewImg = new Image();
    previewImg.src = url;
    previewImg.style.maxWidth = '200px';
    previewImg.style.maxHeight = '150px';
    previewImg.onload = () => {
      URL.revokeObjectURL(url);
      wrapper._url = null;
      info.innerHTML = `${truncateName(file.name)}<br>${previewImg.naturalWidth}×${previewImg.naturalHeight}px<br>${formatFileSize(file.size)}`;
    };
    previewImg.onerror = () => {
      URL.revokeObjectURL(url);
      wrapper._url = null;
      wrapper.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'opu-unsupported-box';
      box.textContent = `.${ext || 'file'}`;
      wrapper.appendChild(box);
      info.textContent = `${truncateName(file.name)}\n${formatFileSize(file.size)}`;
      wrapper.appendChild(info);
      const overlay = createOverlay(wrapper, cell, file, isOriginal, originalCell, { enableEdit: false });
      wrapper.appendChild(overlay);
      cell.appendChild(wrapper);
      return;
    };
    const overlay = createOverlay(wrapper, cell, file, isOriginal, originalCell, { enableEdit: true });
    function showOverlay() { overlay.style.display = 'flex'; }
    function hideOverlay() { if (!overlay.classList.contains('locked')) overlay.style.display = 'none'; }
    wrapper.addEventListener('mouseenter', showOverlay);
    wrapper.addEventListener('mouseleave', hideOverlay);
    wrapper.addEventListener('touchstart', () => { showOverlay(); }, { passive: true });
    wrapper.appendChild(previewImg);
    wrapper.appendChild(info);
    wrapper.appendChild(overlay);
    cell.appendChild(wrapper);
  }

  // ---- URL parsing + fetch helpers (sequential; updates ring)
  const URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi;
  function sanitizeUrl(u) { return u.replace(/[),.;:]+$/, ''); }
  function looksImageUrl(u) { return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(u); }
  function extFromCTorURL(ct, u) {
    if (ct && ct.startsWith('image/')) return ct.split('/')[1].split(';')[0];
    const m = u.toLowerCase().match(/\.(png|jpe?g|jpg|webp|gif|bmp|svg)(\?|#|$)/i);
    return m ? (m[1] === 'jpg' ? 'jpeg' : m[1]) : 'png';
  }
  async function fetchImageAsFile(u, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(u, { mode: 'cors', signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      if (!(ct.startsWith('image/') || looksImageUrl(u))) throw new Error('not image');
      const blob = await resp.blob();
      const ext = extFromCTorURL(ct, u);
      const safeName = `pasted_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
      return new File([blob], safeName, { type: blob.type || `image/${ext}` });
    } finally { clearTimeout(timer); }
  }
  function extractUrls(text, maxCount = 20) {
    const raw = (text || '').match(URL_REGEX) || [];
    const urls = Array.from(new Set(raw.map(sanitizeUrl)));
    return urls.slice(0, maxCount);
  }
  async function filesFromTextURLsProgress(text) {
    const urls = extractUrls(text);
    if (!urls.length) return { files: [], totalTried: 0, fails: 0 };

    progressStart(urls.length);
    const files = [];
    let fails = 0;
    for (const u of urls) {
      try {
        const f = await fetchImageAsFile(u);
        if (f) files.push(f); else fails++;
      } catch { fails++; }
      finally { progressTick(); }
    }
    return { files, totalTried: urls.length, fails };
  }

  // ---- rebuild input files in exact DOM order
  function updateFileInput() {
    if (!input) return;
    const dt = new DataTransfer();
    const table = document.getElementById('opu-preview-table');
    if (!table) { input.files = dt.files; return; }
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(row => {
      const cells = Array.from(row.cells).slice(1);
      cells.forEach(cell => {
        const wrapper = cell.querySelector('div');
        if (!wrapper) return;
        if (wrapper.style.filter === 'brightness(40%)') return;
        const f = wrapper._file;
        if (f instanceof File) dt.items.add(f);
      });
    });
    input.files = dt.files;
    if (dt.files.length === 0) { resetPreviews(); input.value = ''; }
  }

  // ---- add images helper (merges with existing)
  function addImages(files) {
    if (!files?.length || !input) return;
    const existing = Array.from(input.files || []);
    const dt = new DataTransfer();
    existing.concat(files).forEach(f => dt.items.add(f));
    input.files = dt.files;
    const table = document.getElementById('opu-preview-table');
    if (!table) {
      renderPreviews(Array.from(dt.files));
    } else {
      const tbody = table.querySelector('tbody');
      files.forEach(file => {
        const row = document.createElement('tr');
        const dragCell = document.createElement('td');
        dragCell.className = 'opu-drag-handle';
        dragCell.textContent = '☰';
        dragCell.setAttribute('aria-label', 'Drag handle');
        row.appendChild(dragCell);
        const cell = document.createElement('td');
        cell.style.position = 'relative';
        cell.style.padding = '10px';
        row.appendChild(cell);
        tbody.appendChild(row);
        createPreview(cell, file, true);
      });
      createOrUpdateSortable(tbody);
      updateFileInput();
    }
  }

  // --- draggable FAB (mobile-stable; early capture; saves position)
  const FAB_POS_KEY = 'OPUh.fab.pos.v1';
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function applyFabPos(wrap, pos) {
    const rect = wrap.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = clamp(pos.left, 4, vw - rect.width - 4);
    const top  = clamp(pos.top,  4, vh - rect.height - 4);
    wrap.style.left = `${left}px`;
    wrap.style.top = `${top}px`;
    wrap.style.right = '';
    wrap.style.bottom = '';
  }
  function loadFabPos(wrap) {
    try {
      const raw = localStorage.getItem(FAB_POS_KEY);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
        applyFabPos(wrap, pos);
      }
    } catch {}
  }
  function saveFabPos(wrap) {
    const rect = wrap.getBoundingClientRect();
    const pos = { left: Math.round(rect.left), top: Math.round(rect.top) };
    try { localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos)); } catch {}
  }
  function makeFabDraggable(wrap, fab) {
    const DRAG_THRESHOLD = 6;    // px movement to trigger drag
    const HOLD_DELAY     = 140;  // ms long-press for touch/pen

    let pressing = false, active = false;
    let sx = 0, sy = 0, startLeft = 0, startTop = 0;
    let pressTimer = null, activePointerId = null;

    function beginDrag() {
      if (active) return;
      active = true;
      wrap.classList.add('dragging');
      const rect = wrap.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      wrap.style.left = `${startLeft}px`;
      wrap.style.top  = `${startTop}px`;
      wrap.style.right = '';
      wrap.style.bottom = '';
    }

    function endDrag() {
      if (!active) return;
      active = false;
      wrap.classList.remove('dragging');
      saveFabPos(wrap);
      wrap._justDragged = true;
      setTimeout(() => { wrap._justDragged = false; }, 200);
    }

    const onDown = (e) => {
      pressing = true; active = false;
      sx = e.clientX; sy = e.clientY;

      // Early pointer capture so moves keep coming even if finger leaves
      activePointerId = (e.pointerId != null) ? e.pointerId : null;
      if (activePointerId != null && wrap.setPointerCapture) {
        try { wrap.setPointerCapture(activePointerId); } catch {}
      }

      clearTimeout(pressTimer);
      const isMouse = e.pointerType === 'mouse';
      pressTimer = setTimeout(() => {
        if (!isMouse && pressing && !active) beginDrag();
      }, HOLD_DELAY);
      // no preventDefault here (keeps clicks alive)
    };

    const onMove = (e) => {
      if (!pressing) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;

      if (!active) {
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          clearTimeout(pressTimer);
          beginDrag();
        } else {
          return; // still click candidate
        }
      }

      e.preventDefault(); // stop page scroll during drag
      const vw = window.innerWidth, vh = window.innerHeight;
      const rect = wrap.getBoundingClientRect();
      let left = startLeft + dx;
      let top  = startTop + dy;
      left = clamp(left, 4, vw - rect.width - 4);
      top  = clamp(top,  4, vh - rect.height - 4);
      wrap.style.left = `${left}px`;
      wrap.style.top  = `${top}px`;
    };

    const onUp = () => {
      pressing = false;
      clearTimeout(pressTimer);
      if (active) endDrag();
      if (activePointerId != null && wrap.releasePointerCapture) {
        try { wrap.releasePointerCapture(activePointerId); } catch {}
      }
      activePointerId = null;
    };

    wrap.addEventListener('pointerdown', onDown, { passive: true });
    wrap.addEventListener('pointermove', onMove, { passive: false });
    wrap.addEventListener('pointerup', onUp, { passive: false });
    wrap.addEventListener('pointercancel', onUp, { passive: false });
    wrap.addEventListener('contextmenu', e => e.preventDefault()); // kill long-press menu

    fab.addEventListener('click', (e) => {
      if (wrap._justDragged) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    window.addEventListener('resize', () => {
      const rect = wrap.getBoundingClientRect();
      applyFabPos(wrap, { left: rect.left, top: rect.top });
      saveFabPos(wrap);
    });
  }

  // ---- events
  if (input) {
    input.addEventListener('change', () => renderPreviews(Array.from(input.files)));
  }

  // Desktop paste: files OR multiple URLs with ring progress (compact counter)
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items || [];
    const images = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) images.push(item.getAsFile());
    }
    if (images.length) {
      e.preventDefault();
      addImages(images);
      toast(`Pasted ${images.length} image${images.length>1?'s':''}`);
      return;
    }

    const text = e.clipboardData?.getData('text')?.trim();
    if (text) {
      const urls = extractUrls(text);
      if (urls.length) {
        e.preventDefault();
        const { files, totalTried } = await filesFromTextURLsProgress(text);
        if (!totalTried) { toast('Clipboard has no image URLs.'); return; }
        if (files.length) addImages(files);
        progressDone(`${files.length}/${totalTried}`);
        if (!files.length) toast('No fetchable images (CORS/format blocked).');
      }
    }
  });

  // Drag & drop files
  window.addEventListener('dragover', e => e.preventDefault(), { passive: false });
  window.addEventListener('drop', e => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length) addImages(images);
  });

  // Mobile FAB click handler
  async function handleMobilePaste() {
    const { wrap } = getFabParts();
    if (wrap?._justDragged) return; // ignore click right after drag

    // image blobs first
    let images = [];
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const ext = (type.split('/')[1] || 'png').split(';')[0];
              images.push(new File([blob], `pasted_${Date.now()}.${ext}`, { type }));
            }
          }
        }
      } catch { /* ignore */ }
    }
    if (images.length) {
      addImages(images);
      toast(`Pasted ${images.length} image${images.length>1?'s':''}`);
      return;
    }

    // then URLs
    if (!(navigator.clipboard?.readText)) { toast('Clipboard has no image (or URLs blocked).'); return; }
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) { toast('Clipboard is empty.'); return; }

    const { files, totalTried } = await filesFromTextURLsProgress(text);
    if (!totalTried) { toast('Clipboard has no image URLs.'); return; }
    if (files.length) addImages(files);
    progressDone(`${files.length}/${totalTried}`);
    if (!files.length) toast('No fetchable images (CORS/format blocked).');
  }

  // ---- init
  window.addEventListener('load', () => {
    if (input) input.value = '';

    const logo = document.querySelector('.opunadpis-wrap a.opu');
    if (logo && !logo.innerHTML.includes('<font class="podnadpic">h</font>')) {
      logo.innerHTML += ' <font class="podnadpic">h</font>acked';
    }

    nukeFallbackPreview();

    // FAB wrap + button
    const wrap = document.createElement('div');
    wrap.id = 'opu-paste-fab-wrap';
    const fab = document.createElement('div');
    fab.id = 'opu-paste-fab';
    fab.textContent = '📋';
    fab.title = 'Paste from clipboard';
    fab.setAttribute('aria-label', 'Paste from clipboard');
    fab.addEventListener('click', handleMobilePaste, { passive: true });
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    // restore saved position (if any), then make draggable
    loadFabPos(wrap);
    makeFabDraggable(wrap, fab);

    // Keep nuking any late-added fallback junk and log DOM readiness
    const observer = new MutationObserver(() => {
      nukeFallbackPreview();
      if (document && document.body && !window.__OPUhLoggedReady) {
        window.__OPUhLoggedReady = true;
        console.log('[OPUh] DOM available and ready.');
      }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
  });
})();
