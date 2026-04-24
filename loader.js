'use strict';

const YEAR = 2058;
const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
];
const WEEKDAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const ALPHA    = 'abcdefghijklmnopqrstuvwxyz';

const monthSel    = document.getElementById('month-sel');
const dayInput    = document.getElementById('day-input');
const computedEl  = document.getElementById('computed-date');
const textInput   = document.getElementById('text-input');
const dropZone    = document.getElementById('drop-zone');
const fileInput   = document.getElementById('file-input');
const thumbRow    = document.getElementById('thumb-row');
const imgHint     = document.getElementById('img-name-hint');
const saveBtn     = document.getElementById('generate-btn');
const statusEl    = document.getElementById('save-status');

let selectedFiles = [];

// ── Date helpers ──────────────────────────────────────────

function getSlug() {
  const mm = monthSel.value;
  const dd = String(parseInt(dayInput.value, 10) || 0).padStart(2, '0');
  return mm && dayInput.value ? `${mm}-${dd}` : null;
}

function updateDateDisplay() {
  const mm = monthSel.value;
  const d  = parseInt(dayInput.value, 10);
  if (!mm || !d || d < 1 || d > 31) { computedEl.textContent = ''; return; }
  const date    = new Date(YEAR, parseInt(mm, 10) - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  const month   = MONTH_NAMES[parseInt(mm, 10) - 1];
  computedEl.textContent = `${weekday} · ${month} ${d}, ${YEAR}`;
  updateImgHint();
}

function updateImgHint() {
  const slug = getSlug();
  imgHint.textContent = slug ? `${slug}-a.jpg` : 'MM-DD-a.jpg';
}

monthSel.addEventListener('change', updateDateDisplay);
dayInput.addEventListener('input',  updateDateDisplay);

// ── Image handling ────────────────────────────────────────

function addFiles(files) {
  selectedFiles = [...selectedFiles, ...Array.from(files)];
  renderThumbs();
}

function renderThumbs() {
  thumbRow.innerHTML = '';
  const slug = getSlug() || 'MM-DD';
  selectedFiles.forEach((file, i) => {
    const label = `${slug}-${ALPHA[i]}${extOf(file)}`;
    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    const img = document.createElement('img');
    img.alt = '';
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    const lbl = document.createElement('div');
    lbl.className = 'thumb-label';
    lbl.textContent = label;

    thumb.appendChild(img);
    thumb.appendChild(lbl);
    thumbRow.appendChild(thumb);
  });
  updateImgHint();
}

function extOf(file) {
  const m = file.name.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : '.jpg';
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => addFiles(e.target.files));
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles(e.dataTransfer.files);
});

monthSel.addEventListener('change', renderThumbs);
dayInput.addEventListener('input',  renderThumbs);

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
  const res = await fetch('content/manifest.json');
  const manifest = await res.json();
  if (!manifest.includes(slug)) {
    manifest.push(slug);
    manifest.sort(); // MM-DD strings sort correctly lexicographically
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

  const rawText = textInput.value.trim();
  if (!rawText) { setStatus('error', 'Add some journal text.'); return; }

  const paragraphs = rawText.split(/\n[ \t]*\n/).map(p => p.trim().replace(/\n/g, ' ')).filter(Boolean);

  const illustrations = selectedFiles.length
    ? selectedFiles.map((f, i) => `${slug}-${ALPHA[i]}${extOf(f)}`)
    : [];

  const entry = {
    date: { year: YEAR, month, day: d, weekday },
    paragraphs,
    illustrations,
  };

  saveBtn.disabled = true;
  setStatus('saving', 'Saving…');

  try {
    // 1. Write the entry JSON
    await saveText(
      `content/days/${slug}.json`,
      JSON.stringify(entry, null, 2) + '\n'
    );

    // 2. Write images
    for (let i = 0; i < selectedFiles.length; i++) {
      await saveImage(`illustrations/${illustrations[i]}`, selectedFiles[i]);
    }

    // 3. Update manifest
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
  monthSel.value    = '';
  dayInput.value    = '';
  textInput.value   = '';
  selectedFiles     = [];
  thumbRow.innerHTML = '';
  computedEl.textContent = '';
}
