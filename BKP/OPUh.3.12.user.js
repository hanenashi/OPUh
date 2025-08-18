// ==UserScript==
// @name         OPUh
// @namespace    https://opu.peklo.biz/
// @version      3.12
// @description  Image preview, crop, resize, delete, drag reorder (mobile-friendly), paste/drag add, stable order. Mobile Paste button.
// @match        https://opu.peklo.biz/
// @run-at       document-end
// @noframes
// @grant        none
// Use canonical raw host for updates (branch tip):
// @updateURL    https://raw.githubusercontent.com/hanenashi/OPUh/main/OPUh.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/OPUh/main/OPUh.user.js
// ==/UserScript==

/* global Sortable, Cropper */
(function () {
  'use strict';

  const SUPPORTED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
  const input = document.querySelector('#obrazek');

  // ---- styles (incl. mobile DnD handle friendliness + FAB + toast)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash { 0%,100%{background:transparent;} 50%{background:#ffdddd;} }
    .sortable-ghost { opacity: 0.5; background: #333 !important; }

    .opu-drag-handle {
      font-size: 18px;
      text-align: center;
      vertical-align: middle;
      width: 28px;
      padding: 6px 8px;
      cursor: grab;
      user-select: none;
      -ms-touch-action: none;
      touch-action: none;
      color: #888;
    }

    .opu-unsupported-box {
      width: 200px;
      height: 150px;
      background-color: #444;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 16px;
    }

    #opu-crop-modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); display: flex;
      align-items: center; justify-content: center; z-index: 9999;
      backdrop-filter: blur(3px);
    }
    #opu-crop-content {
      background: #222; padding: 10px; border-radius: 6px;
      box-shadow: 0 0 10px #000; position: relative;
    }
    #opu-crop-img { max-width: 80vw; max-height: 70vh; }
    #opu-crop-btns { display: flex; justify-content: space-between; margin-top: 10px; }

    .opu-overlay {
      position: absolute;
      top: 0;
      right: 0;
      background-color: rgba(0,0,0,0.8);
      color: #fff;
      display: none;
      gap: 5px;
      padding: 3px 5px;
      cursor: pointer;
      border-radius: 0 0 0 5px;
      z-index: 5;
    }

    /* Floating Paste Button (FAB) */
    #opu-paste-fab {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 99999;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #222;
      color: #fff;
      font-size: 22px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
      border: 1px solid #444;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #opu-paste-fab:active { transform: scale(0.97); }

    /* Toast */
    #opu-toast {
      position: fixed;
      bottom: 86px;
      right: 16px;
      background: rgba(20,20,20,0.95);
      color: #fff;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 99999;
      display: none;
      max-width: 70vw;
      word-break: break-word;
      border: 1px solid #444;
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

  // ---- clean any fallback preview from OPU
  function nukeFallbackPreview() {
    const fb = document.getElementById('xpc-ctrlv');
    if (fb) fb.remove();
    const dim = document.getElementById('dimensions-output');
    if (dim) dim.remove();
  }

  // ---- preview table (and Sortable with mobile-friendly config)
  function createTable() {
    const table = document.createElement('table');
    table.id = 'opu-preview-table';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    return table;
  }

  function createOrUpdateSortable(tbody) {
    if (!window.Sortable) return;
    if (tbody._sortable && typeof tbody._sortable.destroy === 'function') {
      tbody._sortable.destroy();
    }
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

  // ---- render root
  function resetPreviews() {
    document.getElementById('opu-preview-table')?.remove();
  }

  function renderPreviews(files) {
    resetPreviews();
    if (!files || !files.length) return;

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
      createPreview(cell, file, /*isOriginal*/ true);
    });

    input.after(table);
    createOrUpdateSortable(tbody);
  }

  // ---- overlays / tools
  function promptResize(wrapper, cell, file) {
    // clean any previous inputs
    document.querySelectorAll('.resize-input').forEach(el => el.remove());

    const wand = wrapper.querySelector('.resize-btn');
    if (!wand) return;

    const inputResize = document.createElement('input');
    inputResize.type = 'text';
    inputResize.placeholder = '50 or 800x600 or 800x';
    inputResize.className = 'resize-input';
    Object.assign(inputResize.style, {
      position: 'absolute',
      left: '0',
      top: '100%',
      marginTop: '5px',
      transform: 'translateX(-50%)',
      width: '110px',
      fontSize: '11px',
      textAlign: 'center',
      border: '1px solid #888',
      outline: 'none',
      zIndex: '100'
    });

    // lock overlay while editing so it can't auto-hide
    const overlay = wrapper.querySelector('.opu-overlay');
    if (overlay) {
      overlay.classList.add('locked');
      overlay.style.display = 'flex';
    }

    // mount, focus
    wand.parentElement.appendChild(inputResize);
    inputResize.focus();

    function cleanup() {
      inputResize.remove();
      if (overlay) {
        overlay.classList.remove('locked');
        overlay.style.display = '';
      }
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
      const ow = img.naturalWidth;
      const oh = img.naturalHeight;
      const value = inputResize.value.trim();

      const percent = /^([1-9][0-9]?|100)$/;
      const fixed = /^(\d+)[xX](\d+)$/;
      const oneSide = /^(\d+)[xX]$|^[xX](\d+)$/;

      if (e.key === 'Enter') {
        e.preventDefault();

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

    // in case keyboards dismiss without key events, close on blur
    inputResize.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.body.contains(inputResize)) cleanup();
      }, 50);
    });
  }

  function resizeImage(wrapper, cell, file, newW, newH) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(newW));
    canvas.height = Math.max(1, Math.floor(newH));
    const ctx = canvas.getContext('2d');
    const img = wrapper.querySelector('img');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const outType = file.type.includes('png') ? 'image/png' : 'image/jpeg';
    const outExt = outType === 'image/png' ? '.png' : '.jpg';
    const quality = outType === 'image/jpeg' ? 0.85 : undefined;

    canvas.toBlob(blob => {
      const outName = baseNamePlus(file, '_resized', outExt);
      const resizedFile = new File([blob], outName, { type: outType });

      // dim source & hide its buttons
      wrapper.style.filter = 'brightness(40%)';
      const rb = wrapper.querySelector('.resize-btn'); if (rb) rb.style.display = 'none';
      const cb = wrapper.querySelector('.crop-btn'); if (cb) cb.style.display = 'none';

      const row = cell.closest('tr');
      const newCell = row.insertCell(cell.cellIndex + 1);
      newCell.style.position = 'relative';
      newCell.style.padding = '10px';
      createPreview(newCell, resizedFile, /*isOriginal*/ false, cell);
    }, outType, quality);
  }

  function openCropper(file, cell, wrapper) {
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
          const outName = baseNamePlus(file, '_cropped', '.jpg');
          const croppedFile = new File([blob], outName, { type: 'image/jpeg' });

          // dim source & hide its buttons
          wrapper.style.filter = 'brightness(40%)';
          const rb = wrapper.querySelector('.resize-btn'); if (rb) rb.style.display = 'none';
          const cb = wrapper.querySelector('.crop-btn'); if (cb) cb.style.display = 'none';

          const row = cell.closest('tr');
          const newCell = row.insertCell(cell.cellIndex + 1);
          newCell.style.position = 'relative';
          newCell.style.padding = '10px';
          createPreview(newCell, croppedFile, /*isOriginal*/ false, cell);

          modal.remove();
          updateFileInput();
        }, 'image/jpeg');
      };
    };
    reader.readAsDataURL(file);
  }

  function createOverlay(wrapper, cell, file, isOriginal, originalCell) {
    const overlay = document.createElement('div');
    overlay.className = 'opu-overlay';
    overlay.innerHTML = `<span class="delete-btn">❌</span><span class="resize-btn">🪄</span><span class="crop-btn">✂️</span>`;

    // delete
    overlay.querySelector('.delete-btn').onclick = () => {
      const row = cell.closest('tr');
      const isEdit = !isOriginal && originalCell;

      if (isEdit && originalCell) {
        const origWrapper = originalCell.querySelector('div');
        if (origWrapper) {
          origWrapper.style.filter = '';
          origWrapper.querySelectorAll('.resize-btn,.crop-btn').forEach(btn => btn.style.display = '');
        }
      }

      // remove only this cell; if row becomes empty (only handle left), remove row
      cell.remove();
      const nonHandleCells = Array.from(row.cells).slice(1);
      if (nonHandleCells.length === 0) row.remove();

      updateFileInput();
    };

    // resize
    overlay.querySelector('.resize-btn').onclick = () => promptResize(wrapper, cell, file);

    // crop — enabled for both originals and edits
    overlay.querySelector('.crop-btn').onclick = () => openCropper(file, cell, wrapper);

    return overlay;
  }

  function createPreview(cell, file, isOriginal, originalCell = null) {
    const ext = file.name.toLowerCase().split('.').pop();
    const isSupported = SUPPORTED_EXT.includes(ext);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    // store actual File for stable ordering
    wrapper._file = file;
    wrapper.dataset.filename = file.name;

    const info = document.createElement('span');
    info.style.fontSize = '12px';
    info.style.textAlign = 'left';
    info.style.display = 'block';

    if (!isSupported) {
      const box = document.createElement('div');
      box.className = 'opu-unsupported-box';
      box.textContent = `.${ext}`;
      wrapper.appendChild(box);
      info.textContent = `${file.name}, ${formatFileSize(file.size)}`;
      wrapper.appendChild(info);
      cell.appendChild(wrapper);
      return;
    }

    const previewImg = new Image();
    previewImg.src = URL.createObjectURL(file);
    previewImg.style.maxWidth = '200px';
    previewImg.style.maxHeight = '150px';

    previewImg.onload = () => {
      info.innerHTML = `${truncateName(file.name)}<br>${previewImg.naturalWidth}×${previewImg.naturalHeight}px<br>${formatFileSize(file.size)}`;
    };

    const overlay = createOverlay(wrapper, cell, file, isOriginal, originalCell);

    // overlay show/hide helpers (no auto-hide while "locked")
    function showOverlay() { overlay.style.display = 'flex'; }
    function hideOverlay() { if (!overlay.classList.contains('locked')) overlay.style.display = 'none'; }

    // desktop hover
    wrapper.addEventListener('mouseenter', showOverlay);
    wrapper.addEventListener('mouseleave', hideOverlay);

    // mobile tap: just show; outside tap hides (handled in promptResize via lock)
    wrapper.addEventListener('touchstart', () => { showOverlay(); }, { passive: true });

    wrapper.appendChild(previewImg);
    wrapper.appendChild(info);
    wrapper.appendChild(overlay);
    cell.appendChild(wrapper);
  }

  // ---- Clipboard helpers for mobile FAB
  async function tryClipboardReadImages() {
    if (!(navigator.clipboard && navigator.clipboard.read)) return [];
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = (type.split('/')[1] || 'png').split(';')[0];
            files.push(new File([blob], `pasted_${Date.now()}.${ext}`, { type }));
          }
        }
      }
      return files;
    } catch (e) {
      console.debug('[OPUh] clipboard.read() failed:', e);
      return [];
    }
  }

  async function tryClipboardReadImageURL() {
    if (!(navigator.clipboard && navigator.clipboard.readText)) return null;
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!/^https?:\/\//i.test(t)) return null;
      // quick extension hint
      const looksImage = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(t);
      const resp = await fetch(t, { mode: 'cors' });
      if (!resp.ok) return null;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.startsWith('image/') && !looksImage) return null;
      const blob = await resp.blob();
      const ext = (ct.startsWith('image/') ? ct.split('/')[1] : (t.split('.').pop() || 'png')).split(';')[0];
      const file = new File([blob], `pasted_${Date.now()}.${ext}`, { type: blob.type || 'image/*' });
      return file;
    } catch (e) {
      console.debug('[OPUh] fetch clipboard URL failed:', e);
      return null;
    }
  }

  async function handleMobilePaste() {
    // Must run in a user gesture (button tap)
    let images = await tryClipboardReadImages();
    if (images.length) {
      addImages(images);
      toast(`Pasted ${images.length} image${images.length > 1 ? 's' : ''} from clipboard`);
      return;
    }
    const fileFromURL = await tryClipboardReadImageURL();
    if (fileFromURL) {
      addImages([fileFromURL]);
      toast('Pasted image from clipboard link');
      return;
    }
    toast('Clipboard has no image (or browser blocked access).');
  }

  // ---- rebuild input files in exact DOM order (no async)
  function updateFileInput() {
    const dt = new DataTransfer();
    const table = document.getElementById('opu-preview-table');
    if (!table) { input.files = dt.files; return; }

    // left-to-right within row, row-by-row; skip dimmed (source of an edit)
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(row => {
      const cells = Array.from(row.cells).slice(1);
      cells.forEach(cell => {
        const wrapper = cell.querySelector('div');
        if (!wrapper) return;
        if (wrapper.style.filter === 'brightness(40%)') return; // not active
        const f = wrapper._file;
        if (f instanceof File) dt.items.add(f);
      });
    });

    input.files = dt.files;

    if (dt.files.length === 0) {
      resetPreviews();
      input.value = '';
    }
  }

  // ---- add images helper (merges with existing)
  function addImages(files) {
    if (!files || !files.length) return;
    const existing = Array.from(input.files);
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
        createPreview(cell, file, /*isOriginal*/ true);
      });
      createOrUpdateSortable(tbody);
      updateFileInput();
    }
  }

  // ---- events
  if (input) {
    input.addEventListener('change', () => renderPreviews(Array.from(input.files)));
  }

  // PASTE images via keyboard (desktop)
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    const images = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        images.push(item.getAsFile());
      }
    }
    if (images.length) {
      e.preventDefault();
      addImages(images);
    }
  });

  // DRAG & DROP images
  window.addEventListener('dragover', e => e.preventDefault(), { passive: false });
  window.addEventListener('drop', e => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length) addImages(images);
  });

  // ---- init on load
  window.addEventListener('load', () => {
    if (input) input.value = '';

    const logo = document.querySelector('.opunadpis-wrap a.opu');
    if (logo && !logo.innerHTML.includes('<font class="podnadpic">h</font>')) {
      logo.innerHTML += ' <font class="podnadpic">h</font>acked';
    }

    nukeFallbackPreview();

    // FAB paste button
    const fab = document.createElement('div');
    fab.id = 'opu-paste-fab';
    fab.title = 'Paste from clipboard';
    fab.setAttribute('aria-label', 'Paste from clipboard');
    fab.textContent = '📋';
    fab.addEventListener('click', handleMobilePaste, { passive: true });
    document.body.appendChild(fab);

    // Keep nuking any late-added fallback junk and log DOM readiness (for Tigo)
    const observer = new MutationObserver(() => {
      nukeFallbackPreview();
      if (document && document.body) {
        if (!window.__OPUhLoggedReady) {
          window.__OPUhLoggedReady = true;
          console.log('[OPUh] DOM available and ready.');
        }
      }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
  });
})();
