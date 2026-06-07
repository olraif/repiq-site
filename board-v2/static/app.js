const els = {
  fileInput: document.getElementById('fileInput'),
  aiBtn: document.getElementById('aiBtn'),
  libraryBtn: document.getElementById('libraryBtn'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  libraryDialog: document.getElementById('libraryDialog'),
  libraryUpload: document.getElementById('libraryUpload'),
  libraryUploadInput: document.getElementById('libraryUploadInput'),
  libraryTitle: document.getElementById('libraryTitle'),
  libraryBackBtn: document.getElementById('libraryBackBtn'),
  libraryGrid: document.querySelector('.library-grid'),
  libraryItems: document.getElementById('libraryItems'),
  aiDialog: document.getElementById('aiDialog'),
  aiForm: document.getElementById('aiForm'),
  aiSlides: document.getElementById('aiSlides'),
  aiStatus: document.getElementById('aiStatus'),
  creditsLabel: document.getElementById('creditsLabel'),
  toast: document.getElementById('toast'),
  tools: Array.from(document.querySelectorAll('.tool[data-tool]')),
  undoBtn: document.getElementById('undoBtn'),
  redoBtn: document.getElementById('redoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  colorInput: document.getElementById('colorInput'),
  sizeInput: document.getElementById('sizeInput'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  pageCounter: document.getElementById('pageCounter'),
  slideFrame: document.getElementById('slideFrame'),
  slideBase: document.getElementById('slideBase'),
  slideInk: document.getElementById('slideInk'),
  notesStack: document.getElementById('notesStack'),
  notesTools: document.getElementById('notesTools'),
  addSheetBtn: document.getElementById('addSheetBtn'),
  prevSheetBtn: document.getElementById('prevSheetBtn'),
  nextSheetBtn: document.getElementById('nextSheetBtn'),
  sheetCounter: document.getElementById('sheetCounter'),
};

const state = {
  pages: [],
  index: 0,
  activeSurface: 'slide',
  activeSheetId: null,
  tool: 'pen',
  drawing: false,
  pointerId: null,
  last: null,
  moving: false,
  moveStart: null,
  moveImage: null,
  selecting: false,
  selection: null,
};

const libraryState = {
  category: null,
  items: {},
};

const BRAND_URL = 'https://repiq.ru';
const BRAND_LABEL = 'RepIQ Board';
const AI_API_BASE = 'https://olraif-repiq-site-38e0.twc1.net';

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './static/vendor/pdf.worker.min.js';
}

function newPage() {
  return {
    slideInk: null,
    slideHistory: [],
    slideRedo: [],
    sheets: [newSheet()],
  };
}

function newSheet() {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    data: null,
    history: [],
    redo: [],
  };
}

function currentPage() {
  return state.pages[state.index] || null;
}

function ctx(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 3600);
}

function dataUrl(canvas) {
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function isCanvasFilled(canvas) {
  if (!canvas.width || !canvas.height) return false;
  const image = ctx(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < image.length; i += 4) {
    if (image[i] > 0) return true;
  }
  return false;
}

function setCanvasSize(canvas, width, height) {
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
}

function clearCanvas(canvas) {
  ctx(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

function drawData(canvas, data) {
  clearCanvas(canvas);
  if (!data) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = resolve;
    img.src = data;
  });
}

function saveCurrentSurface() {
  commitSelection();
  const page = currentPage();
  if (!page) return;
  if (state.activeSurface === 'slide') {
    page.slideInk = dataUrl(els.slideInk);
    return;
  }
  const sheet = page.sheets.find(item => item.id === state.activeSheetId);
  const canvas = getActiveSheetCanvas();
  if (sheet && canvas) sheet.data = dataUrl(canvas);
}

function getActiveSheetCanvas() {
  return document.querySelector(`.note-sheet[data-sheet-id="${state.activeSheetId}"] .note-ink`);
}

function pushHistory() {
  const page = currentPage();
  if (!page) return;
  if (state.activeSurface === 'slide') {
    page.slideHistory.push(dataUrl(els.slideInk));
    page.slideRedo.length = 0;
    if (page.slideHistory.length > 80) page.slideHistory.shift();
    return;
  }
  const canvas = getActiveSheetCanvas();
  const sheet = page.sheets.find(item => item.id === state.activeSheetId);
  if (!canvas || !sheet) return;
  sheet.history.push(dataUrl(canvas));
  sheet.redo.length = 0;
  if (sheet.history.length > 80) sheet.history.shift();
}

async function undo() {
  commitSelection();
  const page = currentPage();
  if (!page) return;
  if (state.activeSurface === 'slide') {
    if (!page.slideHistory.length) return;
    page.slideRedo.push(dataUrl(els.slideInk));
    await drawData(els.slideInk, page.slideHistory.pop());
    page.slideInk = dataUrl(els.slideInk);
    return;
  }
  const canvas = getActiveSheetCanvas();
  const sheet = page.sheets.find(item => item.id === state.activeSheetId);
  if (!canvas || !sheet || !sheet.history.length) return;
  sheet.redo.push(dataUrl(canvas));
  await drawData(canvas, sheet.history.pop());
  sheet.data = dataUrl(canvas);
}

async function redo() {
  commitSelection();
  const page = currentPage();
  if (!page) return;
  if (state.activeSurface === 'slide') {
    if (!page.slideRedo.length) return;
    page.slideHistory.push(dataUrl(els.slideInk));
    await drawData(els.slideInk, page.slideRedo.pop());
    page.slideInk = dataUrl(els.slideInk);
    return;
  }
  const canvas = getActiveSheetCanvas();
  const sheet = page.sheets.find(item => item.id === state.activeSheetId);
  if (!canvas || !sheet || !sheet.redo.length) return;
  sheet.history.push(dataUrl(canvas));
  await drawData(canvas, sheet.redo.pop());
  sheet.data = dataUrl(canvas);
}

function setActive(surface, sheetId = null) {
  state.activeSurface = surface;
  if (sheetId) state.activeSheetId = sheetId;
  els.slideFrame.classList.toggle('active-zone', surface === 'slide');
  document.querySelectorAll('.note-sheet').forEach(sheet => {
    const isActive = sheet.dataset.sheetId === state.activeSheetId;
    sheet.classList.toggle('active-note', isActive);
    sheet.classList.toggle('active-zone', surface === 'sheet' && isActive);
  });
  updateSheetCounter();
}

function updateCounter() {
  els.pageCounter.textContent = state.pages.length ? `${state.index + 1} / ${state.pages.length}` : '0 / 0';
}

function updateSheetCounter() {
  const page = currentPage();
  if (!page || !page.sheets.length) {
    els.sheetCounter.textContent = '0 / 0';
    return;
  }
  const index = Math.max(0, page.sheets.findIndex(item => item.id === state.activeSheetId));
  els.sheetCounter.textContent = `${index + 1} / ${page.sheets.length}`;
  els.prevSheetBtn.disabled = page.sheets.length < 2;
  els.nextSheetBtn.disabled = page.sheets.length < 2;
}

function resizeInkCanvasToBase() {
  setCanvasSize(els.slideInk, els.slideBase.width, els.slideBase.height);
}

function setBoardAspect(width, height) {
  const safeWidth = Math.max(1, Number(width) || 16);
  const safeHeight = Math.max(1, Number(height) || 9);
  document.documentElement.style.setProperty('--slide-ratio', `${safeWidth} / ${safeHeight}`);
}

async function renderPage(index) {
  saveCurrentSurface();
  state.index = Math.max(0, Math.min(index, state.pages.length - 1));
  const page = currentPage();
  if (!page) {
    setBoardAspect(16, 9);
    setCanvasSize(els.slideBase, 1280, 720);
    resizeInkCanvasToBase();
    clearCanvas(els.slideBase);
    clearCanvas(els.slideInk);
    els.notesStack.innerHTML = '';
    els.notesTools.hidden = true;
    els.addSheetBtn.hidden = true;
    updateSheetCounter();
    updateCounter();
    return;
  }
  els.notesTools.hidden = false;
  els.addSheetBtn.hidden = false;
  setBoardAspect(page.width, page.height);
  setCanvasSize(els.slideBase, page.width, page.height);
  resizeInkCanvasToBase();
  ctx(els.slideBase).drawImage(page.bitmap, 0, 0, page.width, page.height);
  await drawData(els.slideInk, page.slideInk);
  renderSheets();
  updateCounter();
  setActive('slide', state.activeSheetId);
}

function renderSheets() {
  const page = currentPage();
  els.notesStack.innerHTML = '';
  if (!page) return;
  const preservedSheetId = page.sheets.some(item => item.id === state.activeSheetId)
    ? state.activeSheetId
    : page.sheets[0]?.id || null;
  state.activeSheetId = preservedSheetId;
  for (const sheet of page.sheets) {
    const node = document.createElement('div');
    node.className = 'note-sheet';
    node.dataset.sheetId = sheet.id;
    const canvas = document.createElement('canvas');
    canvas.className = 'note-ink';
    setCanvasSize(canvas, els.slideBase.width, els.slideBase.height);
    node.appendChild(canvas);
    els.notesStack.appendChild(node);
    drawData(canvas, sheet.data);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerleave', pointerUp);
    node.addEventListener('click', () => setActive('sheet', sheet.id));
  }
  setActive(state.activeSurface === 'sheet' ? 'sheet' : 'slide', state.activeSheetId);
}

async function loadPdf(file) {
  if (!window.pdfjsLib) {
    toast('PDF.js не загрузился. Проверьте подключение к интернету и обновите страницу.');
    return;
  }
  saveCurrentSurface();
  toast('Загружаю PDF...');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = document.createElement('canvas');
    setCanvasSize(canvas, viewport.width, viewport.height);
    await page.render({ canvasContext: ctx(canvas), viewport }).promise;
    pages.push({
      ...newPage(),
      width: canvas.width,
      height: canvas.height,
      bitmap: canvas,
    });
  }
  state.pages = pages;
  state.index = 0;
  await renderPage(0);
  toast(`PDF открыт: ${pages.length} стр.`);
}

async function openGeneratedPdf(pdfUrl, title = 'AI-презентация') {
  els.aiStatus.textContent = 'Открываем на доске...';
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Не удалось скачать готовый PDF: ${response.status}`);
  }
  const blob = await response.blob();
  const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });
  await loadPdf(file);
  els.aiDialog.close();
}

async function loadServerSlides(slides, name = 'материал') {
  saveCurrentSurface();
  toast('Открываю материал...');
  const pages = [];
  for (const slide of slides) {
    const bitmap = await loadImageBitmapFromUrl(slide.url);
    pages.push({
      ...newPage(),
      width: slide.w || bitmap.width,
      height: slide.h || bitmap.height,
      bitmap,
    });
  }
  state.pages = pages;
  state.index = 0;
  await renderPage(0);
  toast(`${name} открыт: ${pages.length} стр.`);
}

function loadImageBitmapFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      setCanvasSize(canvas, image.naturalWidth, image.naturalHeight);
      ctx(canvas).drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('Не удалось загрузить слайд после конвертации.'));
    image.src = url;
  });
}

async function uploadToBoardBackend(file) {
  const endpoints = ['./upload', '/upload'];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(endpoint, { method: 'POST', body: form });
      if (!response.ok) {
        lastError = new Error(`Backend вернул ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Не удалось открыть материал.');
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Backend конвертации не подключен.');
}

async function handleFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (name.endsWith('.ppt') || name.endsWith('.pptx')) {
    toast('Пока загрузите презентацию как PDF. Конвертацию PPTX подключим позже.');
    preparePresentationConversion(file, true);
    els.fileInput.value = '';
    return;
  }
  if (!name.endsWith('.pdf')) {
    toast('Основной формат RepIQ Board - PDF.');
    els.fileInput.value = '';
    return;
  }
  loadPdf(file).catch((error) => {
    console.error(error);
    toast('Не удалось открыть PDF. Попробуйте другой файл.');
  });
}

function preparePresentationConversion(file, silent = false) {
  window.lastPresentationConversionRequest = {
    endpoint: '/api/board/convert-to-pdf',
    method: 'POST',
    inputName: file.name,
    inputType: file.type || 'presentation',
    output: 'pdf',
  };
  if (!silent) {
    toast('PPTX требует серверной конвертации. Пока сохраните презентацию как PDF или запустите backend доски.');
  }
  console.info('Presentation conversion request', window.lastPresentationConversionRequest);
}

function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function selectionHost(canvas) {
  return canvas === els.slideInk ? els.slideFrame : canvas.closest('.note-sheet');
}

function positionSelectionBox() {
  const selection = state.selection;
  if (!selection) return;
  const { canvas, box, x, y, width, height } = selection;
  const sx = canvas.clientWidth / canvas.width;
  const sy = canvas.clientHeight / canvas.height;
  box.style.left = `${x * sx}px`;
  box.style.top = `${y * sy}px`;
  box.style.width = `${width * sx}px`;
  box.style.height = `${height * sy}px`;
  box.style.transform = `rotate(${selection.rotation || 0}deg)`;
}

function createSelectionBox(selection) {
  const host = selectionHost(selection.canvas);
  if (!host) return;
  const box = document.createElement('div');
  box.className = 'selection-box';
  box.dataset.mode = 'move';
  const preview = document.createElement('canvas');
  preview.className = 'selection-preview';
  box.appendChild(preview);
  for (const handle of ['nw', 'ne', 'sw', 'se']) {
    const node = document.createElement('span');
    node.className = `selection-handle ${handle}`;
    node.dataset.handle = handle;
    box.appendChild(node);
  }
  const rotate = document.createElement('span');
  rotate.className = 'selection-rotate';
  rotate.dataset.handle = 'rotate';
  rotate.title = 'Повернуть';
  box.appendChild(rotate);
  host.appendChild(box);
  selection.box = box;
  selection.preview = preview;
  preview.width = Math.max(1, Math.round(selection.image.width));
  preview.height = Math.max(1, Math.round(selection.image.height));
  ctx(preview).drawImage(selection.image, 0, 0);
  box.addEventListener('pointerdown', selectionPointerDown);
  positionSelectionBox();
}

function commitSelection() {
  const selection = state.selection;
  if (!selection) return;
  const { canvas, image, x, y, width, height, box } = selection;
  const context = ctx(canvas);
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(((selection.rotation || 0) * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  box.remove();
  state.selection = null;
  state.selecting = false;
  state.moving = false;
}

function deleteSelection() {
  const selection = state.selection;
  if (!selection) return false;
  selection.box.remove();
  state.selection = null;
  state.selecting = false;
  state.moving = false;
  saveCurrentSurface();
  toast('Выделенная область удалена.');
  return true;
}

function cancelSelectionDraft() {
  if (state.selection?.draft) {
    state.selection.box.remove();
    state.selection = null;
  }
}

function startSelectionDraft(canvas, start) {
  commitSelection();
  state.selecting = true;
  state.selection = {
    draft: true,
    canvas,
    x: start.x,
    y: start.y,
    width: 1,
    height: 1,
    start,
  };
  const host = selectionHost(canvas);
  const box = document.createElement('div');
  box.className = 'selection-box draft';
  host.appendChild(box);
  state.selection.box = box;
  positionSelectionBox();
}

function updateSelectionDraft(point) {
  const selection = state.selection;
  if (!selection?.draft) return;
  const x1 = Math.max(0, Math.min(selection.start.x, point.x));
  const y1 = Math.max(0, Math.min(selection.start.y, point.y));
  const x2 = Math.min(selection.canvas.width, Math.max(selection.start.x, point.x));
  const y2 = Math.min(selection.canvas.height, Math.max(selection.start.y, point.y));
  selection.x = x1;
  selection.y = y1;
  selection.width = Math.max(1, x2 - x1);
  selection.height = Math.max(1, y2 - y1);
  positionSelectionBox();
}

function finishSelectionDraft() {
  const selection = state.selection;
  if (!selection?.draft) return;
  if (selection.width < 8 || selection.height < 8) {
    cancelSelectionDraft();
    return;
  }
  const image = document.createElement('canvas');
  image.width = Math.round(selection.width);
  image.height = Math.round(selection.height);
  ctx(image).drawImage(
    selection.canvas,
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    0,
    0,
    image.width,
    image.height
  );
  ctx(selection.canvas).clearRect(selection.x, selection.y, selection.width, selection.height);
  selection.box.remove();
  state.selection = {
    canvas: selection.canvas,
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
    image,
  };
  createSelectionBox(state.selection);
}

function selectionPointerDown(event) {
  const selection = state.selection;
  if (!selection || selection.draft) return;
  event.preventDefault();
  event.stopPropagation();
  state.moving = true;
  state.pointerId = event.pointerId;
  const rect = selection.canvas.getBoundingClientRect();
  state.moveStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
    rotation: selection.rotation || 0,
    sx: selection.canvas.width / rect.width,
    sy: selection.canvas.height / rect.height,
    handle: event.target.dataset.handle || 'move',
  };
  if (state.moveStart.handle === 'rotate') {
    const boxRect = selection.box.getBoundingClientRect();
    state.moveStart.centerX = boxRect.left + boxRect.width / 2;
    state.moveStart.centerY = boxRect.top + boxRect.height / 2;
    state.moveStart.startAngle = Math.atan2(event.clientY - state.moveStart.centerY, event.clientX - state.moveStart.centerX);
  }
  selection.box.setPointerCapture(event.pointerId);
  selection.box.addEventListener('pointermove', selectionPointerMove);
  selection.box.addEventListener('pointerup', selectionPointerUp);
  selection.box.addEventListener('pointercancel', selectionPointerUp);
}

function selectionPointerMove(event) {
  const selection = state.selection;
  if (!selection || !state.moving || event.pointerId !== state.pointerId) return;
  const meta = state.moveStart;
  const dx = (event.clientX - meta.clientX) * meta.sx;
  const dy = (event.clientY - meta.clientY) * meta.sy;
  const min = 16;
  if (meta.handle === 'rotate') {
    const angle = Math.atan2(event.clientY - meta.centerY, event.clientX - meta.centerX);
    selection.rotation = meta.rotation + ((angle - meta.startAngle) * 180) / Math.PI;
  } else if (meta.handle === 'move') {
    selection.x = Math.max(0, Math.min(selection.canvas.width - selection.width, meta.x + dx));
    selection.y = Math.max(0, Math.min(selection.canvas.height - selection.height, meta.y + dy));
  } else {
    let x = meta.x;
    let y = meta.y;
    let width = meta.width;
    let height = meta.height;
    if (meta.handle.includes('e')) width = Math.max(min, meta.width + dx);
    if (meta.handle.includes('s')) height = Math.max(min, meta.height + dy);
    if (meta.handle.includes('w')) {
      x = Math.max(0, meta.x + dx);
      width = Math.max(min, meta.width - (x - meta.x));
    }
    if (meta.handle.includes('n')) {
      y = Math.max(0, meta.y + dy);
      height = Math.max(min, meta.height - (y - meta.y));
    }
    if (x + width > selection.canvas.width) width = selection.canvas.width - x;
    if (y + height > selection.canvas.height) height = selection.canvas.height - y;
    selection.x = x;
    selection.y = y;
    selection.width = width;
    selection.height = height;
  }
  positionSelectionBox();
}

function selectionPointerUp(event) {
  const selection = state.selection;
  if (!selection || event.pointerId !== state.pointerId) return;
  state.moving = false;
  state.pointerId = null;
  state.moveStart = null;
  selection.box.removeEventListener('pointermove', selectionPointerMove);
  selection.box.removeEventListener('pointerup', selectionPointerUp);
  selection.box.removeEventListener('pointercancel', selectionPointerUp);
}

function configureBrush(context) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Number(els.sizeInput.value);
  if (state.tool === 'eraser') {
    context.globalCompositeOperation = 'destination-out';
    context.strokeStyle = 'rgba(0,0,0,1)';
    context.lineWidth = Math.max(10, Number(els.sizeInput.value) * 3);
  } else if (state.tool === 'marker') {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = 'rgba(244, 167, 198, 0.62)';
    context.lineWidth = 14;
  } else {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = els.colorInput.value;
  }
}

function pointerDown(event) {
  const canvas = event.currentTarget;
  if (!currentPage()) return;
  state.pointerId = event.pointerId;
  state.last = canvasPoint(event, canvas);
  if (canvas === els.slideInk) setActive('slide');
  if (canvas.classList.contains('note-ink')) {
    const sheetId = canvas.closest('.note-sheet').dataset.sheetId;
    setActive('sheet', sheetId);
  }
  pushHistory();
  canvas.setPointerCapture(event.pointerId);
  if (state.tool === 'select') {
    startSelectionDraft(canvas, state.last);
    return;
  }

  state.drawing = true;
  canvas.setPointerCapture(event.pointerId);
  const context = ctx(canvas);
  configureBrush(context);
  context.beginPath();
  context.moveTo(state.last.x, state.last.y);
  context.lineTo(state.last.x + 0.01, state.last.y + 0.01);
  context.stroke();
}

function pointerMove(event) {
  if ((!state.drawing && !state.selecting) || event.pointerId !== state.pointerId) return;
  const canvas = event.currentTarget;
  const next = canvasPoint(event, canvas);
  if (state.selecting) {
    updateSelectionDraft(next);
    return;
  }
  const context = ctx(canvas);
  configureBrush(context);
  context.beginPath();
  context.moveTo(state.last.x, state.last.y);
  context.lineTo(next.x, next.y);
  context.stroke();
  state.last = next;
}

function pointerUp(event) {
  if ((!state.drawing && !state.selecting) || event.pointerId !== state.pointerId) return;
  if (state.selecting) {
    state.selecting = false;
    state.pointerId = null;
    finishSelectionDraft();
    return;
  }
  state.drawing = false;
  state.pointerId = null;
  saveCurrentSurface();
}

function addSheet() {
  const page = currentPage();
  if (!page) {
    toast('Сначала откройте PDF.');
    return;
  }
  saveCurrentSurface();
  const sheet = newSheet();
  page.sheets.push(sheet);
  renderSheets();
  setActive('sheet', sheet.id);
}

function switchSheet(delta) {
  const page = currentPage();
  if (!page || page.sheets.length < 2) return;
  saveCurrentSurface();
  const currentIndex = Math.max(0, page.sheets.findIndex(item => item.id === state.activeSheetId));
  const nextIndex = (currentIndex + delta + page.sheets.length) % page.sheets.length;
  setActive('sheet', page.sheets[nextIndex].id);
}

function ensureActiveSheet() {
  const page = currentPage();
  if (!page) return null;
  if (!page.sheets.length) {
    page.sheets.push(newSheet());
    renderSheets();
  }
  const sheet = page.sheets.find(item => item.id === state.activeSheetId) || page.sheets[0];
  setActive('sheet', sheet.id);
  return sheet;
}

async function insertImageToActiveSheet(file) {
  if (!currentPage()) {
    toast('Сначала откройте PDF.');
    return;
  }
  if (!file) return;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    toast('PDF открывайте основной кнопкой сверху. В библиотеку пока загружаем картинки для листа комментариев.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast('Для вставки в комментарии загрузите картинку PNG, JPG или WEBP.');
    return;
  }

  saveCurrentSurface();
  const sheet = ensureActiveSheet();
  const canvas = getActiveSheetCanvas();
  if (!sheet || !canvas) return;

  pushHistory();
  const imageUrl = URL.createObjectURL(file);
  await insertImageUrlToSheet(imageUrl, sheet, canvas, true);
  els.libraryDialog.close();
  toast('Материал добавлен в лист комментариев.');
}

async function insertImageUrlToSheet(imageUrl, sheet, canvas, revoke = false) {
  await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const context = ctx(canvas);
      const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.08);
      const maxWidth = canvas.width - margin * 2;
      const maxHeight = canvas.height - margin * 2;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = image.width * ratio;
      const height = image.height * ratio;
      const x = (canvas.width - width) / 2;
      const y = (canvas.height - height) / 2;
      context.drawImage(image, x, y, width, height);
      sheet.data = dataUrl(canvas);
      if (revoke) URL.revokeObjectURL(imageUrl);
      resolve();
    };
    image.onerror = () => {
      if (revoke) URL.revokeObjectURL(imageUrl);
      resolve();
    };
    image.src = imageUrl;
  });
}

function openLibraryCategory(category) {
  libraryState.category = category;
  els.libraryTitle.textContent = category;
  els.libraryBackBtn.hidden = false;
  els.libraryGrid.hidden = true;
  els.libraryItems.hidden = false;
  els.libraryUpload.hidden = false;
  renderLibraryItems();
}

function closeLibraryCategory() {
  libraryState.category = null;
  els.libraryTitle.textContent = 'Библиотека';
  els.libraryBackBtn.hidden = true;
  els.libraryGrid.hidden = false;
  els.libraryItems.hidden = true;
  els.libraryUpload.hidden = true;
}

function renderLibraryItems() {
  const category = libraryState.category;
  const items = libraryState.items[category] || [];
  els.libraryItems.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = 'Загрузите материалы в эту папку.';
    els.libraryItems.appendChild(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement('button');
    card.className = 'library-card';
    card.type = 'button';
    card.title = 'Двойной клик добавит материал на лист';
    const image = document.createElement('img');
    image.src = item.url;
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = item.name;
    card.append(image, label);
    card.addEventListener('dblclick', () => insertLibraryItem(item));
    els.libraryItems.appendChild(card);
  }
}

async function insertLibraryItem(item) {
  const page = currentPage();
  if (!page) {
    toast('Сначала откройте PDF.');
    return;
  }
  saveCurrentSurface();
  const sheet = ensureActiveSheet();
  const canvas = getActiveSheetCanvas();
  if (!sheet || !canvas) return;
  pushHistory();
  await insertImageUrlToSheet(item.url, sheet, canvas);
  els.libraryDialog.close();
  toast('Материал добавлен в лист комментариев.');
}

function addFileToLibrary(file) {
  if (!libraryState.category) {
    toast('Сначала выберите папку в библиотеке.');
    return;
  }
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.pdf')) {
    toast('PDF в библиотеке сохраним после подключения хранилища. Сейчас добавляйте картинки.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast('В папку пока можно загрузить картинку PNG, JPG или WEBP.');
    return;
  }
  const url = URL.createObjectURL(file);
  if (!libraryState.items[libraryState.category]) libraryState.items[libraryState.category] = [];
  libraryState.items[libraryState.category].push({ name: file.name, url });
  renderLibraryItems();
  toast('Материал добавлен в папку.');
}

function clearActive() {
  commitSelection();
  const page = currentPage();
  if (!page) return;
  pushHistory();
  if (state.activeSurface === 'slide') {
    clearCanvas(els.slideInk);
    page.slideInk = dataUrl(els.slideInk);
    return;
  }
  const canvas = getActiveSheetCanvas();
  const sheet = page.sheets.find(item => item.id === state.activeSheetId);
  if (canvas && sheet) {
    clearCanvas(canvas);
    sheet.data = dataUrl(canvas);
  }
}

async function exportPdf() {
  try {
    saveCurrentSurface();
    if (!state.pages.length) {
      toast('Сначала откройте PDF.');
      return;
    }
    if (!window.jspdf?.jsPDF) {
      toast('jsPDF не загрузился. Проверьте интернет и обновите страницу.');
      return;
    }
    toast('Готовлю PDF...');
    const { jsPDF } = window.jspdf;
    let pdf = null;

    for (const page of state.pages) {
      const orientation = page.width > page.height ? 'landscape' : 'portrait';
      const unitSize = [page.width, page.height];
      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'px', format: unitSize, hotfixes: ['px_scaling'] });
      } else {
        pdf.addPage(unitSize, orientation);
      }
      const merged = document.createElement('canvas');
      setCanvasSize(merged, page.width, page.height);
      ctx(merged).fillStyle = '#ffffff';
      ctx(merged).fillRect(0, 0, page.width, page.height);
      ctx(merged).drawImage(page.bitmap, 0, 0, page.width, page.height);
      if (page.slideInk) {
        await drawImageUrl(merged, page.slideInk);
      }
      pdf.addImage(dataUrl(merged), 'PNG', 0, 0, page.width, page.height);

      for (const sheet of page.sheets) {
        if (!sheet.data) continue;
        const test = document.createElement('canvas');
        setCanvasSize(test, page.width, page.height);
        await drawData(test, sheet.data);
        if (!isCanvasFilled(test)) continue;
        pdf.addPage(unitSize, orientation);
        const note = document.createElement('canvas');
        setCanvasSize(note, page.width, page.height);
        const noteCtx = ctx(note);
        noteCtx.fillStyle = '#ffffff';
        noteCtx.fillRect(0, 0, page.width, page.height);
        noteCtx.strokeStyle = 'rgba(47,145,213,.28)';
        noteCtx.lineWidth = 3;
        noteCtx.strokeRect(18, 18, page.width - 36, page.height - 36);
        await drawImageUrl(note, sheet.data);
        pdf.addImage(dataUrl(note), 'PNG', 0, 0, page.width, page.height);
        addPdfBrandLink(pdf, page.width, page.height);
      }
    }

    if (pdf) {
      await savePdfBlob(pdf, 'repiq-board-materials.pdf');
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      toast('Сохранение отменено.');
      return;
    }
    console.error(error);
    toast('Не удалось сохранить PDF.');
  }
}

function addPdfBrandLink(pdf, width, height) {
  const fontSize = Math.max(12, Math.min(22, width * 0.018));
  const padX = Math.round(fontSize * 0.65);
  const padY = Math.round(fontSize * 0.42);
  const margin = Math.round(Math.max(18, fontSize * 1.25));
  const iconSize = Math.round(fontSize * 1.55);
  const gap = Math.round(fontSize * 0.55);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(fontSize);
  const textWidth = pdf.getTextWidth(BRAND_LABEL);
  const boxWidth = iconSize + gap + textWidth + padX * 2;
  const boxHeight = Math.max(iconSize, fontSize) + padY * 2;
  const x = width - margin - boxWidth;
  const y = height - margin - boxHeight;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(198, 227, 246);
  pdf.setLineWidth(1);
  pdf.roundedRect(x, y, boxWidth, boxHeight, 10, 10, 'FD');

  const iconX = x + padX;
  const iconY = y + (boxHeight - iconSize) / 2;
  pdf.setFillColor(232, 246, 253);
  pdf.setDrawColor(47, 145, 213);
  pdf.roundedRect(iconX, iconY, iconSize, iconSize, 5, 5, 'FD');
  pdf.setDrawColor(47, 145, 213);
  pdf.setLineWidth(2);
  pdf.line(iconX + iconSize * 0.24, iconY + iconSize * 0.34, iconX + iconSize * 0.68, iconY + iconSize * 0.34);
  pdf.line(iconX + iconSize * 0.24, iconY + iconSize * 0.52, iconX + iconSize * 0.58, iconY + iconSize * 0.52);
  pdf.setFillColor(208, 242, 224);
  pdf.circle(iconX + iconSize * 0.72, iconY + iconSize * 0.68, iconSize * 0.22, 'F');
  pdf.setDrawColor(39, 135, 83);
  pdf.setLineWidth(2);
  pdf.line(iconX + iconSize * 0.62, iconY + iconSize * 0.68, iconX + iconSize * 0.70, iconY + iconSize * 0.76);
  pdf.line(iconX + iconSize * 0.70, iconY + iconSize * 0.76, iconX + iconSize * 0.84, iconY + iconSize * 0.58);

  pdf.setTextColor(31, 49, 66);
  const textX = iconX + iconSize + gap;
  const textY = y + boxHeight / 2 + fontSize * 0.34;
  pdf.text(BRAND_LABEL, textX, textY);
  pdf.link(x, y, boxWidth, boxHeight, { url: BRAND_URL });
  pdf.setTextColor(0, 0, 0);
}

function drawImageUrl(targetCanvas, url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      ctx(targetCanvas).drawImage(image, 0, 0, targetCanvas.width, targetCanvas.height);
      resolve();
    };
    image.onerror = resolve;
    image.src = url;
  });
}

async function savePdfBlob(pdf, fileName) {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('PDF отправлен в папку загрузок.');
}

function updateCredits() {
  const slides = Math.max(3, Number(els.aiSlides?.value || 6));
  const credits = Math.ceil(slides * 1.5);
  if (els.creditsLabel) {
    els.creditsLabel.textContent = `Стоимость: ${credits} кредитов`;
  }
}

function updateSizeTrack() {
  const min = Number(els.sizeInput.min || 0);
  const max = Number(els.sizeInput.max || 100);
  const value = Number(els.sizeInput.value || min);
  const progress = ((value - min) / (max - min)) * 100;
  els.sizeInput.style.setProperty('--size-progress', `${progress}%`);
}

async function submitAi(event) {
  event.preventDefault();
  const form = new FormData(els.aiForm);
  const blocks = form.getAll('blocks');
  const payload = {
    topic: form.get('topic'),
    subject: form.get('subject'),
    grade: form.get('grade'),
    duration: form.get('duration'),
    slidesCount: Number(form.get('slides')),
    notes: form.get('notes'),
    includeTheory: blocks.includes('theory'),
    includeExamples: blocks.includes('examples'),
    includePractice: blocks.includes('practice'),
    includeHomework: blocks.includes('homework'),
    includeAnswers: blocks.includes('answers'),
  };
  try {
    els.aiStatus.textContent = 'Готовим структуру...';
    toast('Готовим структуру презентации...');
    const response = await fetch(`${AI_API_BASE}/api/ai/presentation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = `API недоступен: ${response.status}`;
      try {
        const errorData = await response.json();
        message = errorData.detail || errorData.error || message;
      } catch (_) {
        // Ответ может быть не JSON, тогда оставляем короткую понятную ошибку.
      }
      throw new Error(message);
    }
    els.aiStatus.textContent = 'Собираем PDF...';
    const data = await response.json();
    if (!data.ok || !data.pdfUrl) {
      throw new Error('Backend не вернул ссылку на готовый PDF.');
    }
    const pdfUrl = new URL(data.pdfUrl, AI_API_BASE).href;
    await openGeneratedPdf(pdfUrl, data.title || payload.topic || 'AI-презентация');
    toast('AI-презентация открыта на доске.');
  } catch (error) {
    console.error(error);
    els.aiStatus.textContent = `Не удалось создать презентацию. ${error.message || 'Проверьте API на сервере.'}`;
    toast('Не удалось создать AI-презентацию.');
  }
}

els.fileInput.addEventListener('change', event => handleFile(event.target.files[0]));
els.prevBtn.addEventListener('click', () => renderPage(state.index - 1));
els.nextBtn.addEventListener('click', () => renderPage(state.index + 1));
els.addSheetBtn.addEventListener('click', addSheet);
els.prevSheetBtn.addEventListener('click', () => switchSheet(-1));
els.nextSheetBtn.addEventListener('click', () => switchSheet(1));
els.slideInk.addEventListener('pointerdown', pointerDown);
els.slideInk.addEventListener('pointermove', pointerMove);
els.slideInk.addEventListener('pointerup', pointerUp);
els.slideInk.addEventListener('pointercancel', pointerUp);
els.slideInk.addEventListener('pointerleave', pointerUp);
els.tools.forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.tool !== 'select') commitSelection();
    state.tool = button.dataset.tool;
    els.tools.forEach(item => item.classList.toggle('active', item === button));
  });
});
els.undoBtn.addEventListener('click', undo);
els.redoBtn.addEventListener('click', redo);
els.clearBtn.addEventListener('click', clearActive);
els.sizeInput.addEventListener('input', updateSizeTrack);
els.libraryBtn.addEventListener('click', () => els.libraryDialog.showModal());
els.libraryUploadInput.addEventListener('change', event => {
  addFileToLibrary(event.target.files[0]);
  els.libraryUploadInput.value = '';
});
els.libraryBackBtn.addEventListener('click', closeLibraryCategory);
document.querySelectorAll('[data-library-category]').forEach(button => {
  button.addEventListener('click', () => openLibraryCategory(button.dataset.libraryCategory));
});
document.querySelectorAll('.library-grid button:not([data-library-category])').forEach(button => {
  button.addEventListener('click', () => toast('Раздел библиотеки подготовлен как заглушка. Для вставки используйте кнопку "Загрузить".'));
});
els.aiBtn.addEventListener('click', () => {
  updateCredits();
  els.aiDialog.showModal();
});
document.querySelector('[data-close-ai]').addEventListener('click', () => els.aiDialog.close());
els.aiForm.addEventListener('input', updateCredits);
els.aiForm.addEventListener('submit', submitAi);
els.exportPdfBtn.addEventListener('click', () => exportPdf().catch(error => {
  console.error(error);
  toast('Не удалось сохранить PDF.');
}));

window.addEventListener('keydown', event => {
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection) {
    event.preventDefault();
    deleteSelection();
    return;
  }
  if (event.key === 'Escape' && state.selection) {
    event.preventDefault();
    if (state.selection.draft) cancelSelectionDraft();
    else commitSelection();
    return;
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
  if (event.key === 'ArrowLeft') renderPage(state.index - 1);
  if (event.key === 'ArrowRight') renderPage(state.index + 1);
});

renderPage(0);
updateCredits();
updateSizeTrack();
