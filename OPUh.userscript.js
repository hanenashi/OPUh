// ==UserScript==
// @name         OPUh
// @namespace    http://opu.peklo.biz/
// @version      3.0 LAST TABLE work
// @description  Image preview, crop, resize, delete, drag reorder, smart size & filename
// @match        https://opu.peklo.biz/
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SUPPORTED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
  const input = document.querySelector('#obrazek');

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

  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash { 0%,100%{background:transparent;} 50%{background:#ffdddd;} }
    .sortable-ghost { opacity: 0.5; background: #333 !important; }
    .opu-drag-handle {
      font-size: 18px;
      text-align: center;
      vertical-align: middle;
      width: 20px;
      cursor: grab;
      user-select: none;
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
      background: rgba(0, 0, 0, 0.85); display: flex;
      align-items: center; justify-content: center; z-index: 9999;
      backdrop-filter: blur(3px);
    }
    #opu-crop-content {
      background: #222; padding: 10px; border-radius: 6px;
      box-shadow: 0 0 10px #000; position: relative;
    }
    #opu-crop-img {
      max-width: 80vw; max-height: 70vh;
    }
    #opu-crop-btns {
      display: flex; justify-content: space-between; margin-top: 10px;
    }`;
  document.head.appendChild(style);

  function formatFileSize(bytes) {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(2) + ' MB'
      : Math.round(bytes / 1024) + ' KB';
  }

  input.addEventListener('change', () => renderPreviews(Array.from(input.files)));

  function resetPreviews() {
    document.getElementById('opu-preview-table')?.remove();
  }

  function renderPreviews(files) {
    resetPreviews();
    if (!files.length) return;

    const table = document.createElement('table');
    table.id = 'opu-preview-table';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '15px';

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    files.forEach(file => {
      const row = document.createElement('tr');

      const dragCell = document.createElement('td');
      dragCell.className = 'opu-drag-handle';
      dragCell.textContent = '☰';
      row.appendChild(dragCell);

      const cell = document.createElement('td');
      cell.style.position = 'relative';
      cell.style.padding = '10px';
      row.appendChild(cell);

      tbody.appendChild(row);
      createPreview(cell, file, true);
    });

    input.after(table);

    Sortable.create(tbody, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      handle: '.opu-drag-handle',
      onEnd: updateFileInput
    });
  }

  function createPreview(cell, file, isOriginal, originalCell = null) {
    const ext = file.name.toLowerCase().split('.').pop();
    const isSupported = SUPPORTED_EXT.includes(ext);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    const info = document.createElement('span');
    info.style.fontSize = '12px';
    info.style.textAlign = 'center';
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
      info.textContent = `${file.name}, ${previewImg.naturalWidth}×${previewImg.naturalHeight}px, ${formatFileSize(file.size)}`;
    };

    wrapper.appendChild(previewImg);
    wrapper.appendChild(info);
    cell.appendChild(wrapper);

    const overlay = createOverlay(wrapper, cell, file, isOriginal, originalCell);
    wrapper.appendChild(overlay);
  }

  function createOverlay(wrapper, cell, file, isOriginal, originalCell) {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    overlay.style.color = '#fff';
    overlay.style.display = 'none';
    overlay.style.gap = '5px';
    overlay.style.padding = '3px 5px';
    overlay.style.cursor = 'pointer';
    overlay.style.borderRadius = '0 0 0 5px';
    overlay.innerHTML = `<span class="delete-btn">❌</span><span class="resize-btn">🪄</span>`;
    if (isOriginal) overlay.innerHTML += `<span class="crop-btn">✂️</span>`;

    wrapper.addEventListener('mouseover', () => (overlay.style.display = 'flex'));
    wrapper.addEventListener('mouseout', () => (overlay.style.display = 'none'));

    overlay.querySelector('.delete-btn').onclick = () => {
      const row = cell.closest('tr'); // Full row (handle + preview)
      const isResized = !isOriginal && originalCell;

      if (isResized && originalCell) {
        const origWrapper = originalCell.querySelector('div');
        if (origWrapper) {
          origWrapper.style.filter = '';
          origWrapper.querySelectorAll('.resize-btn,.crop-btn').forEach(btn => btn.style.display = '');
        }
      }

      row.remove(); // Cleanly remove drag handle + preview cell
      updateFileInput();
    };

    overlay.querySelector('.resize-btn').onclick = () => promptResize(wrapper, cell, file);
    if (isOriginal) {
      overlay.querySelector('.crop-btn').onclick = () => openCropper(file, cell, wrapper);
    }

    return overlay;
  }

  function promptResize(wrapper, cell, file) {
    document.querySelectorAll('.resize-input').forEach(el => el.remove());

    const wand = wrapper.querySelector('.resize-btn');
    if (!wand) return;

    const inputResize = document.createElement('input');
    inputResize.type = 'text';
    inputResize.placeholder = '50 or 800x600 or 800x';
    inputResize.className = 'resize-input';
    inputResize.style.position = 'absolute';
    inputResize.style.left = '0';
    inputResize.style.top = '100%';
    inputResize.style.marginTop = '5px';
    inputResize.style.transform = 'translateX(-50%)';
    inputResize.style.width = '110px';
    inputResize.style.fontSize = '11px';
    inputResize.style.textAlign = 'center';
    inputResize.style.border = '1px solid #888';
    inputResize.style.outline = 'none';
    inputResize.style.zIndex = '100';

    wand.parentElement.appendChild(inputResize);
    inputResize.focus();

    function removeIfOutside(event) {
      if (!inputResize.contains(event.target)) {
        inputResize.remove();
        document.removeEventListener('mousedown', removeIfOutside);
      }
    }
    document.addEventListener('mousedown', removeIfOutside);

    inputResize.onkeydown = (e) => {
      const img = wrapper.querySelector('img');
      const ow = img.naturalWidth;
      const oh = img.naturalHeight;
      const value = inputResize.value.trim();

      const percent = /^([1-9][0-9]?|100)$/;
      const fixed = /^(\d+)[xX](\d+)$/;
      const oneSide = /^(\d+)[xX]$|^[xX](\d+)$/;

      if (e.key === 'Enter') {
        e.preventDefault();

        if (percent.test(value)) {
          const scale = parseInt(value);
          const nw = Math.round(ow * scale / 100);
          const nh = Math.round(oh * scale / 100);
          resizeImage(wrapper, cell, file, nw, nh);
          inputResize.remove();
        } else if (fixed.test(value)) {
          const [, w, h] = value.match(fixed);
          resizeImage(wrapper, cell, file, parseInt(w), parseInt(h));
          inputResize.remove();
        } else if (oneSide.test(value)) {
          const [, w, h] = value.match(oneSide);
          if (w) {
            const scale = parseInt(w) / ow;
            resizeImage(wrapper, cell, file, parseInt(w), Math.round(oh * scale));
          } else {
            const scale = parseInt(h) / oh;
            resizeImage(wrapper, cell, file, Math.round(ow * scale), parseInt(h));
          }
          inputResize.remove();
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
        }
      } else if (e.key === 'Escape') {
        inputResize.remove();
      }
    };
  }

  function resizeImage(wrapper, cell, file, newW, newH) {
    const canvas = document.createElement('canvas');
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');
    const img = wrapper.querySelector('img');
    ctx.drawImage(img, 0, 0, newW, newH);

    const format = file.type.includes('png') ? 'image/png' : 'image/jpeg';
    const quality = format === 'image/jpeg' ? 0.85 : undefined;

    canvas.toBlob(blob => {
      const resizedFile = new File([blob], file.name.replace(/\.\w+$/, '') + '_resized.jpg', { type: format });

      wrapper.style.filter = 'brightness(40%)';
      wrapper.querySelector('.resize-btn').style.display = 'none';
      const cropBtn = wrapper.querySelector('.crop-btn');
      if (cropBtn) cropBtn.style.display = 'none';

      const row = cell.parentElement;
      const newCell = row.insertCell(cell.cellIndex + 1);
      newCell.style.position = 'relative';
      newCell.style.padding = '10px';
      createPreview(newCell, resizedFile, false, cell);
    }, format, quality);
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
          const croppedFile = new File([blob], file.name.replace(/\.\w+$/, '') + '_cropped.jpg', {
            type: 'image/jpeg'
          });

          wrapper.style.filter = 'brightness(40%)';
          wrapper.querySelector('.resize-btn').style.display = 'none';
          const cropBtn = wrapper.querySelector('.crop-btn');
          if (cropBtn) cropBtn.style.display = 'none';

          const row = cell.parentElement;
          const newCell = row.insertCell(cell.cellIndex + 1);
          newCell.style.position = 'relative';
          newCell.style.padding = '10px';
          createPreview(newCell, croppedFile, false, cell);

          setTimeout(() => {
            modal.remove();
            updateFileInput();
          }, 50);
        }, 'image/jpeg');
      };
    };
    reader.readAsDataURL(file);
  }

  function updateFileInput() {
    const dt = new DataTransfer();
    const table = document.getElementById('opu-preview-table');
    const allRows = Array.from(table.rows);

    const collect = [];

    allRows.forEach(row => {
      for (let cell of row.cells) {
        const img = cell.querySelector('img');
        const wrapper = cell.querySelector('div');
        if (img && wrapper && wrapper.style.filter !== 'brightness(40%)') {
          collect.push(fetch(img.src)
            .then(res => res.blob())
            .then(blob => dt.items.add(new File([blob], 'upload.jpg', { type: blob.type })))
          );
        }
      }
    });

    Promise.all(collect).then(() => {
      input.files = dt.files;
      if (dt.files.length === 0) {
        resetPreviews();
        input.value = '';
      }
    });
  }

  window.addEventListener('load', () => {
    input.value = '';

    const logo = document.querySelector('.opunadpis-wrap a.opu');
    if (logo && !logo.innerHTML.includes('<font class="podnadpic">h</font>')) {
      logo.innerHTML += ' <font class="podnadpic">h</font>acked';
    }

    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      const images = [];
      for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          images.push(item.getAsFile());
        }
      }
      if (images.length) {
        const dt = new DataTransfer();
        images.forEach(file => dt.items.add(file));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
        e.preventDefault();
      }
    });


   // Kill initial fallback preview and size info
    const fallback = document.getElementById('xpc-ctrlv');
    if (fallback) fallback.remove();

    const dimSpan = document.getElementById('dimensions-output');
    if (dimSpan) dimSpan.remove();

    // Observe and remove any future fallback
    new MutationObserver(() => {
      const fb = document.getElementById('xpc-ctrlv');
      if (fb) fb.remove();

      const dim = document.getElementById('dimensions-output');
      if (dim) dim.remove();
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
