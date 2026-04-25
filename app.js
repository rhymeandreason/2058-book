'use strict';

const YEAR = 2058;
const MONTH_NAMES = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
];

const state = {
  manifest: [],
  cache: {},
  currentIndex: 0,
  currentSpreadIndex: 0,
  isTransitioning: false,
  pickerOpen: false,
  view: 'day',
  viewMonth: null,
};

const stage      = document.getElementById('stage');
const dot        = document.getElementById('nav-dot');
const picker     = document.getElementById('picker');
const pickerList = document.getElementById('picker-list');

// Pre-built spread DOM cache: `${slug}/${si}` → { el, peek, ready: Promise<void> }
const prebuilt = {};

// ── Fetch helpers ─────────────────────────────────────────

async function loadEntry(slug) {
  if (state.cache[slug]) return state.cache[slug];
  const res = await fetch(`content/days/${slug}.json`);
  if (!res.ok) throw new Error(`Failed to load ${slug}.json`);
  const data = await res.json();
  // Normalise: legacy flat format → spreads array
  if (!data.spreads) {
    data.spreads = [{ paragraphs: data.paragraphs, illustrations: data.illustrations }];
  }
  state.cache[slug] = data;
  return data;
}

function prefetchNeighbors(index) {
  const prev = state.manifest[index - 1];
  const next  = state.manifest[index + 1];
  if (prev) loadEntry(prev).catch(() => {});
  if (next)  loadEntry(next).catch(() => {});
}

function spreadKey(slug, si) { return `${slug}/${si}`; }

async function prebuildSpread(slug, si) {
  const key = spreadKey(slug, si);
  if (prebuilt[key]) return;
  const entry = await loadEntry(slug).catch(() => null);
  if (!entry || si < 0 || si >= entry.spreads.length) return;
  if (prebuilt[key]) return; // guard against concurrent calls
  const { el, imgPromises, peek } = buildSpread(entry, si);
  prebuilt[key] = { el, peek, ready: Promise.all(imgPromises) };
}

async function prebuildNeighbors(dayIndex, si) {
  const slug  = state.manifest[dayIndex];
  const entry = state.cache[slug];
  if (!entry) return;

  // Forward neighbor
  if (si < entry.spreads.length - 1) {
    prebuildSpread(slug, si + 1);
  } else if (dayIndex + 1 < state.manifest.length) {
    prebuildSpread(state.manifest[dayIndex + 1], 0);
  }

  // Backward neighbor
  if (si > 0) {
    prebuildSpread(slug, si - 1);
  } else if (dayIndex > 0) {
    const prevSlug  = state.manifest[dayIndex - 1];
    const prevEntry = await loadEntry(prevSlug).catch(() => null);
    if (prevEntry) prebuildSpread(prevSlug, prevEntry.spreads.length - 1);
  }
}

// ── URL helpers ───────────────────────────────────────────

function parseHashDay(hash) {
  if (!hash.startsWith('#/day/')) return null;
  const parts       = hash.slice(6).split('/');
  const slug        = parts[0];
  const spreadIndex = parts[1] ? parseInt(parts[1], 10) - 1 : 0; // URL is 1-indexed
  const dayIndex    = state.manifest.indexOf(slug);
  if (dayIndex === -1) return null;
  return { slug, dayIndex, spreadIndex };
}

function hashForSpread(slug, spreadIndex) {
  return spreadIndex === 0 ? `#/day/${slug}` : `#/day/${slug}/${spreadIndex + 1}`;
}

function positionFromHash(hash) {
  const p = parseHashDay(hash);
  if (!p) return null;
  return p.dayIndex + p.spreadIndex * 0.01;
}

function monthFromHash(hash) {
  if (hash.startsWith('#/day/')) return parseInt(hash.slice(6, 8), 10);
  if (hash.startsWith('#/month/')) return parseInt(hash.slice(8), 10);
  return null;
}

// ── DOM builders ──────────────────────────────────────────

function buildSpread(entry, spreadIndex) {
  const spread = entry.spreads[spreadIndex];
  const el     = document.createElement('div');
  el.className = 'spread';

  // Date gutter
  const gutter = document.createElement('div');
  gutter.className = 'date-gutter';
  gutter.innerHTML = `
    <span class="d-year">${entry.date.year}</span>
    <span class="d-month">${entry.date.month}</span>
    <span class="d-day">${entry.date.day}</span>
    <span class="d-weekday">${entry.date.weekday}</span>
  `;

  // Text panel
  const textPanel = document.createElement('div');
  textPanel.className = 'text-panel';
  spread.paragraphs.forEach(p => {
    const para = document.createElement('p');
    para.textContent = p;
    textPanel.appendChild(para);
  });

  // Illustration panel
  const illusPanel = document.createElement('div');
  illusPanel.className = 'illus-panel';
  const count = spread.illustrations.length;
  illusPanel.dataset.count = Math.min(count, 3);

  const imgPromises = spread.illustrations.slice(0, 3).map(filename => {
    return new Promise(resolve => {
      const wrapper = document.createElement('div');
      wrapper.className = 'illus-img';
      const img = document.createElement('img');
      img.alt = '';
      img.src = `illustrations/${filename}`;
      wrapper.appendChild(img);
      illusPanel.appendChild(wrapper);
      img.decode().then(resolve).catch(resolve);
    });
  });

  // Peek card
  const peek = document.createElement('div');
  peek.className = 'peek-next';
  peek.addEventListener('click', () => { pulseDot(); navigate(1); });

  el.appendChild(gutter);
  el.appendChild(textPanel);
  el.appendChild(illusPanel);
  el.appendChild(peek);

  return { el, imgPromises, peek };
}

function buildMonthView(monthStr) {
  const monthIndex = parseInt(monthStr, 10) - 1;
  const monthName  = MONTH_NAMES[monthIndex];

  const entryDays = new Set();
  state.manifest.forEach(slug => {
    const [mm, dd] = slug.split('-');
    if (mm === monthStr) entryDays.add(parseInt(dd, 10));
  });

  const el = document.createElement('div');
  el.className = 'month-view';

  const nav = document.createElement('div');
  nav.className = 'month-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'month-nav-btn';
  prevBtn.textContent = '←';
  prevBtn.addEventListener('click', () => navigateMonth(-1));

  const titleEl = document.createElement('span');
  titleEl.className = 'month-title';
  titleEl.textContent = `${monthName} ${YEAR}`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'month-nav-btn';
  nextBtn.textContent = '→';
  nextBtn.addEventListener('click', () => navigateMonth(1));

  nav.appendChild(prevBtn);
  nav.appendChild(titleEl);
  nav.appendChild(nextBtn);
  el.appendChild(nav);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDow    = new Date(YEAR, monthIndex, 1).getDay();
  const daysInMonth = new Date(YEAR, monthIndex + 1, 0).getDate();

  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement('div');
    cell.className = `cal-day empty row-${Math.floor(i / 7)}`;
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const row  = Math.floor((firstDow + d - 1) / 7);
    const cell = document.createElement('div');
    cell.className = `cal-day row-${row}`;
    cell.textContent = d;

    if (entryDays.has(d)) {
      cell.classList.add('has-entry');
      const mm = monthStr;
      const dd = String(d).padStart(2, '0');
      cell.addEventListener('click', () => { location.hash = `#/day/${mm}-${dd}`; });
    }

    grid.appendChild(cell);
  }

  el.appendChild(grid);
  return el;
}

// ── Transition engine ─────────────────────────────────────

// old and delay are optional: renderSpread pre-starts content-out and passes
// the already-grabbed old element plus remaining ms to wait before sliding.
function transitionIn(newEl, direction, onSettled, { old, delay = 350 } = {}) {
  const enterClass = direction === 'forward' ? 'entering-right' : 'entering-left';
  const exitClass  = direction === 'forward' ? 'exiting-left'   : 'exiting-right';

  if (old === undefined) old = stage.querySelector('.visible');

  // Phase 1: fade out old spread content (only when caller hasn't already started it)
  if (delay === 350 && old) old.classList.add('content-out');

  // Position new spread off-screen; content starts at opacity:0 from CSS defaults
  newEl.classList.add(enterClass);
  stage.appendChild(newEl);

  // Phase 2: page slide (after content-out delay)
  setTimeout(() => {
    if (old) {
      old.classList.remove('content-out');
      old.classList.replace('visible', exitClass);
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        newEl.classList.replace(enterClass, 'visible');
      });
    });

    // Phase 3: cleanup + trigger content-in (t=delay+600ms)
    setTimeout(() => {
      old?.remove();
      onSettled?.();
    }, 600);
  }, delay);
}

// ── Spread renderer ───────────────────────────────────────

async function renderSpread(dayIndex, spreadIndex, direction) {
  if (state.isTransitioning) return;
  state.isTransitioning = true;
  state.view = 'day';

  // Start content-out immediately so animation begins on click, not after load.
  const old = stage.querySelector('.visible');
  const contentOutStart = Date.now();
  if (old) old.classList.add('content-out');

  const slug  = state.manifest[dayIndex];
  const entry = await loadEntry(slug);
  prefetchNeighbors(dayIndex);

  const si = Math.max(0, Math.min(spreadIndex, entry.spreads.length - 1));

  // Use pre-built spread if available (images already decoded), otherwise build fresh.
  const key = spreadKey(slug, si);
  let el, peek, imagesReady;
  if (prebuilt[key]) {
    ({ el, peek, ready: imagesReady } = prebuilt[key]);
    delete prebuilt[key];
  } else {
    const built = buildSpread(entry, si);
    el = built.el;
    peek = built.peek;
    imagesReady = Promise.all(built.imgPromises);
  }

  const hasNextSpread = si < entry.spreads.length - 1;
  const hasNextDay    = dayIndex < state.manifest.length - 1;
  const hasNext       = hasNextSpread || hasNextDay;

  const delay = Math.max(0, 350 - (Date.now() - contentOutStart));

  transitionIn(el, direction, () => {
    el.classList.add('text-in', 'date-in');
    if (hasNext) peek.classList.add('visible');
    state.isTransitioning    = false;
    state.currentIndex       = dayIndex;
    state.currentSpreadIndex = si;
    sessionStorage.setItem('lastHash', location.hash);
    updatePickerCurrent();
    prebuildNeighbors(dayIndex, si);
  }, { old, delay });

  imagesReady.then(() => el.classList.add('illus-in'));
}

// ── Month view renderer ───────────────────────────────────

function renderMonthView(monthStr, direction) {
  if (state.isTransitioning) return;
  state.isTransitioning = true;
  state.view      = 'month';
  state.viewMonth = monthStr;

  const el = buildMonthView(monthStr);

  transitionIn(el, direction, () => {
    el.classList.add('cal-in');
    state.isTransitioning = false;
  });
}

// ── Hash router ───────────────────────────────────────────

function renderFromHash(prevHash) {
  const hash = location.hash || '#/';

  let direction = 'forward';
  if (prevHash) {
    const prevPos = positionFromHash(prevHash);
    const nextPos = positionFromHash(hash);
    if (prevPos !== null && nextPos !== null) {
      direction = nextPos >= prevPos ? 'forward' : 'backward';
    }
    const prevMonth = monthFromHash(prevHash);
    const nextMonth = monthFromHash(hash);
    if (prevMonth !== null && nextMonth !== null && nextMonth < prevMonth) {
      direction = 'backward';
    }
  }

  if (hash.startsWith('#/day/')) {
    const parsed = parseHashDay(hash);
    if (parsed) {
      closePicker();
      renderSpread(parsed.dayIndex, parsed.spreadIndex, direction);
    }
  } else if (hash.startsWith('#/month/')) {
    closePicker();
    renderMonthView(hash.slice(8), direction);
  } else {
    const last = sessionStorage.getItem('lastHash');
    if (last && last.startsWith('#/day/')) {
      location.hash = last;
    } else if (state.manifest.length > 0) {
      location.hash = `#/day/${state.manifest[0]}`;
    }
  }
}

// ── Navigation helpers ────────────────────────────────────

function navigate(delta) {
  if (state.view === 'month') { navigateMonth(delta > 0 ? 1 : -1); return; }

  const slug  = state.manifest[state.currentIndex];
  const entry = state.cache[slug];

  if (delta > 0) {
    const spreads = entry ? entry.spreads.length : 1;
    if (state.currentSpreadIndex < spreads - 1) {
      // Next spread within same day
      pulseDot();
      location.hash = hashForSpread(slug, state.currentSpreadIndex + 1);
    } else {
      // Next day
      const next = state.currentIndex + 1;
      if (next >= state.manifest.length) return;
      pulseDot();
      location.hash = `#/day/${state.manifest[next]}`;
    }
  } else {
    if (state.currentSpreadIndex > 0) {
      // Previous spread within same day
      pulseDot();
      location.hash = hashForSpread(slug, state.currentSpreadIndex - 1);
    } else {
      // Previous day — go to its last spread
      const prev = state.currentIndex - 1;
      if (prev < 0) return;
      pulseDot();
      const prevSlug = state.manifest[prev];
      loadEntry(prevSlug).then(prevEntry => {
        const lastSI = prevEntry.spreads.length - 1;
        location.hash = hashForSpread(prevSlug, lastSI);
      });
    }
  }
}

function navigateMonth(delta) {
  const current = parseInt(state.viewMonth, 10);
  const next    = Math.max(1, Math.min(12, current + delta));
  if (next === current) return;
  location.hash = `#/month/${String(next).padStart(2, '0')}`;
}

function pulseDot() {
  dot.classList.remove('is-navigating');
  void dot.offsetWidth;
  dot.classList.add('is-navigating');
  setTimeout(() => dot.classList.remove('is-navigating'), 520);
}

// ── Picker ────────────────────────────────────────────────

function openPicker() {
  state.pickerOpen = true;
  dot.classList.add('picker-open');
  picker.classList.add('is-open');

  pickerList.innerHTML = '';
  state.manifest.forEach((slug, i) => {
    const btn = document.createElement('button');
    btn.className = 'picker-btn' + (i === state.currentIndex ? ' is-current' : '');
    btn.textContent = slug.replace('-', '/');
    btn.addEventListener('click', () => { location.hash = `#/day/${slug}`; closePicker(); });
    pickerList.appendChild(btn);
  });
}

function closePicker() {
  state.pickerOpen = false;
  dot.classList.remove('picker-open');
  picker.classList.remove('is-open');
}

function updatePickerCurrent() {
  pickerList.querySelectorAll('.picker-btn').forEach((btn, i) => {
    btn.classList.toggle('is-current', i === state.currentIndex);
  });
}

// ── Event listeners ───────────────────────────────────────

dot.addEventListener('click', () => { state.pickerOpen ? closePicker() : openPicker(); });

let dotHoverTimer = null;
dot.addEventListener('mouseenter', () => {
  dotHoverTimer = setTimeout(() => {
    if (!state.pickerOpen && state.view === 'day') {
      const mm = state.manifest[state.currentIndex]?.slice(0, 2);
      if (mm) location.hash = `#/month/${mm}`;
    }
  }, 800);
});
dot.addEventListener('mouseleave', () => clearTimeout(dotHoverTimer));

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1);  }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
  if (e.key === 'Escape') {
    if (state.pickerOpen) { closePicker(); return; }
    if (state.view === 'month') {
      const last = sessionStorage.getItem('lastHash');
      location.hash = (last && last.startsWith('#/day/')) ? last : `#/day/${state.manifest[0]}`;
    }
  }
});

document.getElementById('edge-left').addEventListener('click', () => navigate(-1));

let touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (delta < -40) navigate(1);
  if (delta > 40)  navigate(-1);
}, { passive: true });

document.addEventListener('click', e => {
  if (state.pickerOpen && !picker.contains(e.target) && e.target !== dot) closePicker();
});

let prevHash = null;
window.addEventListener('hashchange', () => {
  const old = prevHash;
  prevHash = location.hash;
  renderFromHash(old);
});

// ── Boot ──────────────────────────────────────────────────

(async () => {
  try {
    const res = await fetch('content/manifest.json');
    state.manifest = await res.json();
    prevHash = location.hash;
    renderFromHash(null);
  } catch {
    stage.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--font-ui);color:var(--date-color);font-size:13px;">Start the server: python3 server.py</div>`;
  }
})();
