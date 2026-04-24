'use strict';

const YEAR = 2058;
const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
];
const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const ALPHA    = 'abcdefghijklmnopqrstuvwxyz';

const monthSel         = document.getElementById('month-sel');
const dayInput         = document.getElementById('day-input');
const computedEl       = document.getElementById('computed-date');
const spreadsContainer = document.getElementById('spreads-container');
const addSpreadBtn     = document.getElementById('add-spread-btn');
const saveBtn          = document.getElementById('generate-btn');
const statusEl         = document.getElementById('save-status');

// Each element: { files: File[], textEl, dropZoneEl, thumbRowEl }
let spreadData = [];

// ── Date helpers ──────────────────────────────────────────

function getSlug() {
  const mm = monthSel.value;
  const d  = parseInt(dayInput.value, 10);
  if (!mm || !d) return null;
  return `${mm}-${String(d).padStart(2, '0')}`;
}

function updateDateDisplay() {
  const mm = monthSel.value;
  const d  = parseInt(dayInput.value, 10);
  if (!mm || !d || d < 1 || d > 31) { computedEl.textContent = ''; return; }
  const date    = new Date(YEAR, parseInt(mm, 10) - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  const month   = MONTH_NAMES[parseInt(mm, 10) - 1];
  computedEl.textContent = `${weekday} · ${month} ${d}, ${YEAR}`;
  refreshAllHints();
}

monthSel.addEventListener('change', updateDateDisplay);
dayInput.addEventListener('input',  updateDateDisplay);

// ── Image naming ──────────────────────────────────────────

// All images across all spreads share one sequential letter index
function allFiles() {
  return spreadData.flatMap(s => s.files);
}

function imageNameForFile(spreadIndex, fileIndexWithinSpread) {
  const slug = getSlug() || 'MM-DD';
  // Count files in preceding spreads to get global letter index
  let globalIndex = 0;
  for (let i = 0; i < spreadIndex; i++) globalIndex += spreadData[i].files.length;
  globalIndex += fileIndexWithinSpread;
  return `${slug}-${ALPHA[globalIndex]}.jpg`;
}

function extOf(file) {
  const m = file.name.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : '.jpg';
}

function refreshAllHints() {
  spreadData.forEach((s, si) => renderThumbs(si));
}

// ── Spread block builder ──────────────────────────────────

function buildSpreadBlock(si) {
  const block = document.createElement('div');
  block.className = 'spread-block';
  block.dataset.si = si;

  // Header
  const header = document.createElement('div');
  header.className = 'spread-block-header';

  const label = document.createElement('span');
  label.className = 'spread-label';
  label.textContent = `Spread ${si + 1}`;

  header.appendChild(label);

  if (si > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-spread-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeSpread(si));
    header.appendChild(removeBtn);
  }

  block.appendChild(header);

  // Text field
  const textField = document.createElement('div');
  textField.className = 'field';

  const textLabel = document.createElement('label');
  textLabel.textContent = 'Journal text';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Write your entry here. Separate paragraphs with a blank line.';

  const textHint = document.createElement('span');
  textHint.className = 'hint';
  textHint.textContent = 'Blank lines become paragraph breaks.';

  textField.appendChild(textLabel);
  textField.appendChild(textarea);
  textField.appendChild(textHint);
  block.appendChild(textField);

  // Images field
  const imgField = document.createElement('div');
  imgField.className = 'field';

  const imgLabel = document.createElement('label');
  imgLabel.textContent = 'Illustrations';

  const dropZone = document.createElement('div');
  dropZone.className = 'drop-zone';
  dropZone.textContent = 'Drop images here, or click to select';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  dropZone.appendChild(fileInput);

  const thumbRow = document.createElement('div');
  thumbRow.className = 'thumb-row';

  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.innerHTML = 'Images will be named sequentially, e.g. <code>MM-DD-a.jpg</code>.';

  imgField.appendChild(imgLabel);
  imgField.appendChild(dropZone);
  imgField.appendChild(thumbRow);
  imgField.appendChild(hint);
  block.appendChild(imgField);

  // Wire up file interactions
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => addFiles(si, e.target.files));
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    addFiles(si, e.dataTransfer.files);
  });

  // Store refs
  spreadData[si] = { files: [], textEl: textarea, dropZoneEl: dropZone, thumbRowEl: thumbRow };

  return block;
}

function addSpread() {
  const si    = spreadData.length;
  spreadData.push(null); // placeholder, filled by buildSpreadBlock
  const block = buildSpreadBlock(si);
  spreadsContainer.appendChild(block);
  refreshAllHints();
}

function removeSpread(si) {
  spreadData.splice(si, 1);
  // Rebuild all blocks from scratch to keep indices correct
  spreadsContainer.innerHTML = '';
  const savedTexts = spreadData.map(s => s?.textEl?.value || '');
  const savedFiles = spreadData.map(s => s?.files || []);
  spreadData = [];
  savedTexts.forEach((_, i) => {
    const block = buildSpreadBlock(i);
    spreadsContainer.appendChild(block);
    spreadData[i].textEl.value = savedTexts[i];
    spreadData[i].files = savedFiles[i];
    renderThumbs(i);
  });
  refreshAllHints();
}

// ── Image handling ────────────────────────────────────────

function addFiles(si, files) {
  spreadData[si].files = [...spreadData[si].files, ...Array.from(files)];
  refreshAllHints(); // re-render all since global letter indices shift
}

function renderThumbs(si) {
  const { files, thumbRowEl } = spreadData[si];
  thumbRowEl.innerHTML = '';
  files.forEach((file, fi) => {
    const name  = imageNameForFile(si, fi);
    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    const img    = document.createElement('img');
    img.alt = '';
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    const lbl = document.createElement('div');
    lbl.className = 'thumb-label';
    lbl.textContent = name;

    thumb.appendChild(img);
    thumb.appendChild(lbl);
    thumbRowEl.appendChild(thumb);
  });
}

// ── Server save helpers ───────────────────────────────────

async function saveText(path, text) {
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, text }),
  });
  if (!res.ok) throw new Error(`Failed to save ${path}`);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveImage(path, file) {
  const data = await fileToBase64(file);
  const res  = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, data }),
  });
  if (!res.ok) throw new Error(`Failed to save ${path}`);
}

async function appendToManifest(slug) {
  const res      = await fetch('content/manifest.json');
  const manifest = await res.json();
  if (!manifest.includes(slug)) {
    manifest.push(slug);
    manifest.sort();
    await saveText('content/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  }
}

// ── Save ──────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  const mm = monthSel.value;
  const d  = parseInt(dayInput.value, 10);
  if (!mm || !d) { setStatus('error', 'Select a month and day.'); return; }

  const dd      = String(d).padStart(2, '0');
  const slug    = `${mm}-${dd}`;
  const date    = new Date(YEAR, parseInt(mm, 10) - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  const month   = MONTH_NAMES[parseInt(mm, 10) - 1];

  const spreads = spreadData.map((s, si) => {
    const rawText    = s.textEl.value.trim();
    const paragraphs = rawText.split(/\n[ \t]*\n/).map(p => p.trim().replace(/\n/g, ' ')).filter(Boolean);
    const illustrations = s.files.map((f, fi) => imageNameForFile(si, fi));
    return { paragraphs, illustrations };
  });

  if (spreads.every(s => s.paragraphs.length === 0)) {
    setStatus('error', 'Add some journal text to at least one spread.');
    return;
  }

  const entry = { date: { year: YEAR, month, day: d, weekday }, spreads };

  saveBtn.disabled = true;
  setStatus('saving', 'Saving…');

  try {
    await saveText(`content/days/${slug}.json`, JSON.stringify(entry, null, 2) + '\n');

    let globalIdx = 0;
    for (const s of spreadData) {
      for (const file of s.files) {
        const name = `${slug}-${ALPHA[globalIdx++]}${extOf(file)}`;
        await saveImage(`illustrations/${name}`, file);
      }
    }

    await appendToManifest(slug);

    setStatus('ok', `Saved! <a href="index.html#/day/${slug}" target="_blank">View entry →</a>`);
    clearForm();
  } catch (err) {
    setStatus('error', err.message + ' — is server.py running?');
  } finally {
    saveBtn.disabled = false;
  }
});

// ── UI helpers ────────────────────────────────────────────

function setStatus(type, html) {
  statusEl.className = `save-status ${type}`;
  statusEl.innerHTML = html;
}

function clearForm() {
  monthSel.value = '';
  dayInput.value = '';
  computedEl.textContent = '';
  spreadData = [];
  spreadsContainer.innerHTML = '';
  addSpread(); // reset to one empty spread
}

// ── Init ──────────────────────────────────────────────────

addSpreadBtn.addEventListener('click', addSpread);
addSpread(); // start with one spread
