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
  isTransitioning: false,
  pickerOpen: false,
  view: 'day',       // 'day' | 'month'
  viewMonth: null,   // 'MM' string when in month view
};

const stage    = document.getElementById('stage');
const dot      = document.getElementById('nav-dot');
const picker   = document.getElementById('picker');
const pickerList = document.getElementById('picker-list');

// ── Fetch helpers ─────────────────────────────────────────

async function loadEntry(slug) {
  if (state.cache[slug]) return state.cache[slug];
  const res = await fetch(`content/days/${slug}.json`);
  if (!res.ok) throw new Error(`Failed to load ${slug}.json`);
  const data = await res.json();
  state.cache[slug] = data;
  return data;
}

function prefetchNeighbors(index) {
  const prev = state.manifest[index - 1];
  const next = state.manifest[index + 1];
  if (prev) loadEntry(prev).catch(() => {});
  if (next) loadEntry(next).catch(() => {});
}

// ── DOM builders ──────────────────────────────────────────

function buildSpread(entry) {
  const el = document.createElement('div');
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
  entry.paragraphs.forEach(p => {
    const el = document.createElement('p');
    el.textContent = p;
    textPanel.appendChild(el);
  });

  // Illustration panel
  const illusPanel = document.createElement('div');
  illusPanel.className = 'illus-panel';
  const count = entry.illustrations.length;
  illusPanel.dataset.count = Math.min(count, 3);

  const imgPromises = entry.illustrations.slice(0, 3).map(filename => {
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

  // Peek card (next page affordance) — shown after spread settles
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

  // Build a set of day numbers that have entries this month
  const entryDays = new Set();
  state.manifest.forEach(slug => {
    const [mm, dd] = slug.split('-');
    if (mm === monthStr) entryDays.add(parseInt(dd, 10));
  });

  const el = document.createElement('div');
  el.className = 'month-view';

  // Month nav header
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

  // Calendar grid
  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDow = new Date(YEAR, monthIndex, 1).getDay();
  const daysInMonth = new Date(YEAR, monthIndex + 1, 0).getDate();

  // Empty cells before first day
  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day empty';
    const row = Math.floor(i / 7);
    cell.classList.add(`row-${row}`);
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    const col  = (firstDow + d - 1) % 7;
    const row  = Math.floor((firstDow + d - 1) / 7);
    cell.className = `cal-day row-${row}`;
    cell.textContent = d;

    if (entryDays.has(d)) {
      cell.classList.add('has-entry');
      const mm = monthStr;
      const dd = String(d).padStart(2, '0');
      const filename = `${mm}-${dd}.json`;
      cell.addEventListener('click', () => {
        location.hash = `#/day/${mm}-${dd}`;
      });
    }

    grid.appendChild(cell);
  }

  el.appendChild(grid);
  return el;
}

// ── Transition engine ─────────────────────────────────────

function transitionIn(newEl, direction, onSettled) {
  const enterClass = direction === 'forward' ? 'entering-right' : 'entering-left';

  newEl.classList.add(enterClass);
  stage.appendChild(newEl);

  const old = stage.querySelector('.visible');
  if (old) {
    const exitClass = direction === 'forward' ? 'exiting-left' : 'exiting-right';
    old.classList.replace('visible', exitClass);
  }

  // Double rAF: first frame paints initial off-screen position,
  // second frame starts the transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      newEl.classList.replace(enterClass, 'visible');
    });
  });

  setTimeout(() => {
    old?.remove();
    onSettled?.();
  }, 540);
}

// ── Spread renderer ───────────────────────────────────────

async function renderSpread(index, direction) {
  if (state.isTransitioning) return;
  state.isTransitioning = true;
  state.view = 'day';

  const slug  = state.manifest[index];
  const entry = await loadEntry(slug);
  prefetchNeighbors(index);

  const { el, imgPromises, peek } = buildSpread(entry);
  const hasNext = index < state.manifest.length - 1;

  transitionIn(el, direction, () => {
    el.classList.add('text-in', 'date-in');
    if (hasNext) peek.classList.add('visible');
    state.isTransitioning = false;
    state.currentIndex = index;
    sessionStorage.setItem('lastHash', location.hash);
    updatePickerCurrent();
  });

  Promise.all(imgPromises).then(() => {
    el.classList.add('illus-in');
  });
}

// ── Month view renderer ───────────────────────────────────

function renderMonthView(monthStr, direction) {
  if (state.isTransitioning) return;
  state.isTransitioning = true;
  state.view = 'month';
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

  // Determine direction from old → new
  let direction = 'forward';
  if (prevHash) {
    const prevDay = dayIndexFromHash(prevHash);
    const nextDay = dayIndexFromHash(hash);
    if (prevDay !== null && nextDay !== null) {
      direction = nextDay >= prevDay ? 'forward' : 'backward';
    }
    const prevMonth = monthFromHash(prevHash);
    const nextMonth = monthFromHash(hash);
    if (prevMonth !== null && nextMonth !== null && nextMonth < prevMonth) {
      direction = 'backward';
    }
  }

  if (hash.startsWith('#/day/')) {
    const slug  = hash.slice(6); // 'MM-DD'
    const index = state.manifest.indexOf(slug);
    if (index !== -1) {
      closePicker();
      renderSpread(index, direction);
    }
  } else if (hash.startsWith('#/month/')) {
    const monthStr = hash.slice(8); // 'MM'
    closePicker();
    renderMonthView(monthStr, direction);
  } else {
    // Default: restore last or go to first entry
    const last = sessionStorage.getItem('lastHash');
    if (last && last.startsWith('#/day/')) {
      location.hash = last;
    } else if (state.manifest.length > 0) {
      location.hash = `#/day/${state.manifest[0]}`;
    }
  }
}

function dayIndexFromHash(hash) {
  if (!hash.startsWith('#/day/')) return null;
  const slug = hash.slice(6);
  const idx  = state.manifest.indexOf(slug);
  return idx === -1 ? null : idx;
}

function monthFromHash(hash) {
  if (hash.startsWith('#/day/')) return parseInt(hash.slice(6, 8), 10);
  if (hash.startsWith('#/month/')) return parseInt(hash.slice(8), 10);
  return null;
}

// ── Navigation helpers ────────────────────────────────────

function navigate(delta) {
  if (state.view === 'month') {
    navigateMonth(delta > 0 ? 1 : -1);
    return;
  }
  const next = state.currentIndex + delta;
  if (next < 0 || next >= state.manifest.length) return;
  pulseDot();
  location.hash = `#/day/${state.manifest[next]}`;
}

function navigateMonth(delta) {
  const current = parseInt(state.viewMonth, 10);
  const next    = Math.max(1, Math.min(12, current + delta));
  if (next === current) return;
  location.hash = `#/month/${String(next).padStart(2, '0')}`;
}

function pulseDot() {
  dot.classList.remove('is-navigating');
  void dot.offsetWidth; // reflow to restart animation
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
    btn.dataset.index = i;
    btn.textContent = slug.replace('-', '/');
    btn.addEventListener('click', () => {
      location.hash = `#/day/${slug}`;
      closePicker();
    });
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

dot.addEventListener('click', () => {
  if (state.pickerOpen) closePicker();
  else openPicker();
});

// Long hover on dot → month view for current entry
let dotHoverTimer = null;
dot.addEventListener('mouseenter', () => {
  dotHoverTimer = setTimeout(() => {
    if (!state.pickerOpen && state.view === 'day') {
      const filename = state.manifest[state.currentIndex];
      if (filename) {
        const mm = filename.slice(0, 2);
        location.hash = `#/month/${mm}`;
      }
    }
  }, 800);
});
dot.addEventListener('mouseleave', () => clearTimeout(dotHoverTimer));

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pulseDot(); navigate(1);  }
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); pulseDot(); navigate(-1); }
  if (e.key === 'Escape') {
    if (state.pickerOpen) { closePicker(); return; }
    if (state.view === 'month') {
      const last = sessionStorage.getItem('lastHash');
      if (last) location.hash = last;
      else if (state.manifest.length) location.hash = `#/day/${state.manifest[0]}`;
    }
  }
});

document.getElementById('edge-left').addEventListener('click', () => { pulseDot(); navigate(-1); });

// Touch swipe
let touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (delta < -40) { pulseDot(); navigate(1);  }
  if (delta > 40)  { pulseDot(); navigate(-1); }
}, { passive: true });

// Close picker on outside click
document.addEventListener('click', e => {
  if (state.pickerOpen && !picker.contains(e.target) && e.target !== dot) {
    closePicker();
  }
});

// Hash routing
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
