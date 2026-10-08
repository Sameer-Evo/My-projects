const state = {
  selectedImage: null,
  imageUrl: null,
  palette: [],
  currentFileName: 'image',
  theme: localStorage.getItem('palette-theme') || 'light',
};

const elements = {
  emptyState: document.getElementById('emptyState'),
  uploadSection: document.getElementById('uploadSection'),
  uploadZone: document.getElementById('uploadZone'),
  imageInput: document.getElementById('imageInput'),
  browseButton: document.getElementById('browseButton'),
  resultsArea: document.getElementById('resultsArea'),
  previewImage: document.getElementById('previewImage'),
  palettePreview: document.getElementById('palettePreview'),
  colorsGrid: document.getElementById('colorsGrid'),
  colorCount: document.getElementById('colorCount'),
  quality: document.getElementById('quality'),
  generateButton: document.getElementById('generateButton'),
  processingState: document.getElementById('processingState'),
  errorState: document.getElementById('errorState'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  retryButton: document.getElementById('retryButton'),
  resetButton: document.getElementById('resetButton'),
  themeToggle: document.getElementById('themeToggle'),
  notification: document.getElementById('notification'),
  notificationText: document.getElementById('notificationText'),
  colorModal: document.getElementById('colorModal'),
  modalClose: document.getElementById('modalClose'),
  modalColorPreview: document.getElementById('modalColorPreview'),
  modalHex: document.getElementById('modalHex'),
  modalRgb: document.getElementById('modalRgb'),
  modalHsl: document.getElementById('modalHsl'),
  copyHexButton: document.getElementById('copyHexButton'),
  downloadPngButton: document.getElementById('downloadPngButton'),
  downloadJsonButton: document.getElementById('downloadJsonButton'),
  copyCssButton: document.getElementById('copyCssButton'),
};

const processor = new ImagePaletteProcessor();
let currentColorModal = null;
let notificationTimer = null;

function initApp() {
  applyTheme(state.theme);
  attachEvents();
  updateEmptyState(true);
}

function attachEvents() {
  elements.browseButton.addEventListener('click', () => elements.imageInput.click());
  elements.imageInput.addEventListener('change', (event) => handleFileSelection(event.target.files?.[0]));
  elements.generateButton.addEventListener('click', () => {
    if (!state.selectedImage) {
      showError('No image selected', 'Please upload an image before generating a palette.');
      return;
    }
    generatePalette();
  });
  elements.resetButton.addEventListener('click', resetApp);
  elements.retryButton.addEventListener('click', () => {
    elements.errorState.style.display = 'none';
    if (state.selectedImage) {
      generatePalette();
    }
  });

  elements.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
  });

  elements.uploadZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.uploadZone.classList.add('dragover');
  });

  elements.uploadZone.addEventListener('dragleave', () => elements.uploadZone.classList.remove('dragover'));
  elements.uploadZone.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.uploadZone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelection(file);
  });

  elements.uploadZone.addEventListener('click', (event) => {
    if (event.target === elements.uploadZone || event.target.closest('.upload-content')) {
      elements.imageInput.click();
    }
  });

  window.addEventListener('paste', handleClipboardPaste);
  elements.modalClose.addEventListener('click', closeModal);
  elements.colorModal.addEventListener('click', (event) => {
    if (event.target === elements.colorModal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.colorModal.style.display !== 'none') {
      closeModal();
    }
  });

  elements.copyHexButton.addEventListener('click', copyAllHex);
  elements.downloadJsonButton.addEventListener('click', downloadPaletteJson);
  elements.downloadPngButton.addEventListener('click', downloadPalettePng);
  elements.copyCssButton.addEventListener('click', copyCssVariables);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  const icon = theme === 'light' ? '🌙' : '☀️';
  elements.themeToggle.innerHTML = `<span class="theme-icon">${icon}</span>`;
  localStorage.setItem('palette-theme', theme);
}

function updateEmptyState(isEmpty) {
  elements.emptyState.style.display = isEmpty ? 'flex' : 'none';
  elements.uploadSection.style.display = isEmpty ? 'block' : 'none';
  elements.resultsArea.style.display = isEmpty ? 'none' : 'block';
}

function resetApp() {
  state.selectedImage = null;
  state.imageUrl = null;
  state.palette = [];
  state.currentFileName = 'image';
  elements.imageInput.value = '';
  elements.previewImage.removeAttribute('src');
  elements.palettePreview.innerHTML = '';
  elements.colorsGrid.innerHTML = '';
  updateEmptyState(true);
  hideError();
}

function handleFileSelection(file) {
  if (!file) return;

  const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showError('Unsupported file type', 'Please upload a PNG, JPG, JPEG, or WebP image.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const result = event.target?.result;
    if (!result || typeof result !== 'string') {
      showError('Could not load image', 'The selected image could not be read. Please try another file.');
      return;
    }

    state.selectedImage = file;
    state.imageUrl = result;
    state.currentFileName = file.name || 'image';
    elements.previewImage.src = result;
    updateEmptyState(false);
    hideError();
    generatePalette();
  };

  reader.readAsDataURL(file);
}

function handleClipboardPaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) handleFileSelection(file);
      return;
    }
  }
}

async function generatePalette() {
  if (!state.selectedImage) {
    showError('No image selected', 'Please upload an image to continue.');
    return;
  }

  setProcessing(true);
  hideError();

  const image = new Image();
  image.decoding = 'async';
  image.onload = async () => {
    try {
      const colorCount = Number(elements.colorCount.value);
      const quality = elements.quality.value;
      const extractedColors = await processor.extractColors(image, colorCount, quality);

      if (!extractedColors || !extractedColors.length) {
        throw new Error('No colors were detected in this image. Try a different file.');
      }

      state.palette = extractedColors;
      renderPalettePreview();
      renderColorCards();
      setProcessing(false);
      updateEmptyState(false);
    } catch (error) {
      setProcessing(false);
      showError('Palette generation failed', error.message || 'Unable to extract colors from this image.');
    }
  };

  image.onerror = () => {
    setProcessing(false);
    showError('Failed to read image', 'The image could not be loaded in the browser. Please try another file.');
  };

  image.src = state.imageUrl;
}

function renderPalettePreview() {
  elements.palettePreview.innerHTML = '';

  state.palette.forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.background = color.hex;
    swatch.title = `${color.hex} • ${color.percentage}%`;
    swatch.addEventListener('click', () => openColorModal(color));
    elements.palettePreview.appendChild(swatch);
  });
}

function renderColorCards() {
  elements.colorsGrid.innerHTML = '';

  state.palette.forEach((color) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'color-card';
    card.setAttribute('aria-label', `Open color details for ${color.hex}`);
    card.innerHTML = `
      <div class="color-swatch" style="background:${color.hex};"></div>
      <div class="color-text">
        <span class="color-name">${color.hex}</span>
        <button class="copy-button" type="button" data-copy="${color.hex}">Copy</button>
      </div>
      <div class="color-meta">
        <div>${rgbToString(color.rgb.r, color.rgb.g, color.rgb.b)}</div>
        <div>${hslToString(color.hsl.h, color.hsl.s, color.hsl.l)}</div>
      </div>
      <div class="color-percent">${color.percentage}%</div>
    `;

    card.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.copy) {
        event.stopPropagation();
        copyText(target.dataset.copy);
        showToast('Copied HEX!');
        return;
      }
      openColorModal(color);
    });

    elements.colorsGrid.appendChild(card);
  });
}

function openColorModal(color) {
  currentColorModal = color;
  elements.modalColorPreview.style.background = color.hex;
  elements.modalHex.textContent = color.hex;
  elements.modalRgb.textContent = rgbToString(color.rgb.r, color.rgb.g, color.rgb.b);
  elements.modalHsl.textContent = hslToString(color.hsl.h, color.hsl.s, color.hsl.l);

  document.querySelectorAll('.copy-small-btn').forEach((button) => {
    button.onclick = async () => {
      const type = button.dataset.type;
      const value = type === 'hex' ? color.hex : type === 'rgb' ? rgbToString(color.rgb.r, color.rgb.g, color.rgb.b) : hslToString(color.hsl.h, color.hsl.s, color.hsl.l);
      await copyText(value);
      showToast(`Copied ${type.toUpperCase()}!`);
    };
  });

  elements.colorModal.style.display = 'grid';
}

function closeModal() {
  elements.colorModal.style.display = 'none';
  currentColorModal = null;
}

function setProcessing(isLoading) {
  elements.processingState.style.display = isLoading ? 'flex' : 'none';
}

function showError(title, message) {
  elements.errorTitle.textContent = title;
  elements.errorMessage.textContent = message;
  elements.errorState.style.display = 'flex';
}

function hideError() {
  elements.errorState.style.display = 'none';
}

async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const helper = document.createElement('textarea');
    helper.value = value;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    document.body.removeChild(helper);
  } catch (error) {
    console.error('Copy failed:', error);
    throw error;
  }
}

async function copyAllHex() {
  if (!state.palette.length) {
    showToast('No palette to copy');
    return;
  }

  try {
    const values = state.palette.map((color) => color.hex).join(', ');
    await copyText(values);
    showToast('Copied all HEX values!');
  } catch {
    showToast('Copy failed');
  }
}

async function copyCssVariables() {
  if (!state.palette.length) {
    showToast('No palette to export');
    return;
  }

  const css = `:root {\n${state.palette.map((color, index) => `  --color-${index + 1}: ${color.hex};`).join('\n')}\n}`;

  try {
    await copyText(css);
    showToast('CSS variables copied!');
  } catch {
    showToast('Copy failed');
  }
}

function downloadPaletteJson() {
  if (!state.palette.length) {
    showToast('No palette to export');
    return;
  }

  const data = JSON.stringify(state.palette.map((color) => ({
    hex: color.hex,
    rgb: color.rgb,
    hsl: color.hsl,
    percentage: color.percentage,
  })), null, 2);

  downloadBlob(data, `${state.currentFileName.replace(/\.[^/.]+$/, '') || 'palette'}.json`, 'application/json');
}

function downloadPalettePng() {
  if (!state.palette.length) {
    showToast('No palette to export');
    return;
  }

  const canvas = document.createElement('canvas');
  const swatchWidth = 180;
  const swatchHeight = 160;
  canvas.width = swatchWidth * state.palette.length;
  canvas.height = swatchHeight;
  const ctx = canvas.getContext('2d');

  state.palette.forEach((color, index) => {
    ctx.fillStyle = color.hex;
    ctx.fillRect(index * swatchWidth, 0, swatchWidth, swatchHeight);

    ctx.fillStyle = color.contrastColor;
    ctx.font = '600 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(color.hex, index * swatchWidth + swatchWidth / 2, swatchHeight / 2 - 8);

    ctx.font = '500 16px sans-serif';
    ctx.fillText(`${color.percentage}%`, index * swatchWidth + swatchWidth / 2, swatchHeight / 2 + 24);
  });

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Could not export PNG');
      return;
    }
    downloadBlob(blob, `${state.currentFileName.replace(/\.[^/.]+$/, '') || 'palette'}.png`, 'image/png');
  }, 'image/png');
}

function downloadBlob(content, filename, mimetype) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimetype });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function showToast(message) {
  elements.notificationText.textContent = message;
  elements.notification.style.display = 'block';
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    elements.notification.style.display = 'none';
  }, 1600);
}

initApp();
