// My Rubi 바탕화면
// 아이콘 배치·고정 앱·배경 같은 설정은 이 브라우저의 localStorage에만 저장됨
(() => {
'use strict';

// ─────────── 앱 목록 ───────────
const APPS = (window.MYRUBI_APPS || []).slice();
const TRASH = { id: 'trash', title: '휴지통', kind: 'builtin', fixed: true };
const byId = Object.fromEntries(APPS.map(a => [a.id, a]));
byId.trash = TRASH;
const TOP = APPS.filter(a => !a.folder).map(a => a.id);
const childrenOf = fid => APPS.filter(a => a.folder === fid);

// ─────────── 저장 ───────────
const KEY = 'myrubi.desktop.v1';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const defaults = () => ({
  desk: ['trash', ...TOP], pos: {}, pinned: (window.MYRUBI_PINNED || []).filter(id => byId[id]),
  size: 'm', wall: 'geometry', known: TOP.slice(),
});
let S;
try { S = JSON.parse(ls.get(KEY)) || defaults(); } catch (e) { S = defaults(); }
S = Object.assign(defaults(), S);
// apps.js 에 새로 생긴 앱은 바탕화면에 추가, 없어진 앱은 정리
TOP.forEach(id => { if (!S.known.includes(id)) { S.known.push(id); if (!S.desk.includes(id)) S.desk.push(id); } });
S.known = S.known.filter(id => byId[id]);
S.desk = S.desk.filter((id, i, arr) => byId[id] && arr.indexOf(id) === i);
S.pinned = S.pinned.filter(id => byId[id] && id !== 'trash');
if (!S.desk.includes('trash')) S.desk.unshift('trash');
const save = () => ls.set(KEY, JSON.stringify(S));
save();

// ─────────── 도우미 ───────────
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coarse = matchMedia('(pointer:coarse)').matches;
const small = () => innerWidth <= 720;
const TB_H = 52;

function glyph(a) {
  // 폴스타 스타일: 색 타일 없이 선 아이콘 (tint 값은 남겨두되 화면에는 쓰지 않음)
  if (a.id === 'trash') return `<span class="glyph trash"><svg><use href="#i-trash"/></svg></span>`;
  if (a.kind === 'folder') return `<span class="glyph folder"><svg><use href="#i-folder"/></svg></span>`;
  const t = a.tint ? ` t-${a.tint}` : ' t-slate';
  if (a.mono) return `<span class="glyph mono${a.mono.length > 2 ? ' long' : ''}${t}">${esc(a.mono)}</span>`;
  return `<span class="glyph${t}"><svg><use href="#i-${a.icon || 'globe'}"/></svg></span>`;
}

// ─────────── 바탕화면 ───────────
const desk = $('#desk'), dropCell = $('#dropCell');
const CELL = { s: { w: 78, h: 86 }, m: { w: 92, h: 102 }, l: { w: 112, h: 126 } };
const PAD = 10;
let sel = null;

function grid() {
  const c = CELL[S.size] || CELL.m;
  // 오른쪽 위 포스트잇(assets/board.js) 자리는 비워둠
  const rv = window.MYRUBI_BOARD ? window.MYRUBI_BOARD.reserve() : { right: 0, top: 0 };
  return { w: c.w, h: c.h, oy: PAD + rv.top,
    cols: Math.max(1, Math.floor((innerWidth - PAD * 2 - rv.right) / c.w)),
    rows: Math.max(1, Math.floor((innerHeight - TB_H - PAD * 2 - rv.top) / c.h)) };
}
/** 저장된 위치를 쓰되, 화면 밖이거나 겹치면 위에서 아래, 왼쪽에서 오른쪽으로 빈칸에 놓음 */
function layout() {
  const g = grid(), taken = new Set(), out = {};
  S.desk.forEach(id => {
    const p = S.pos[id];
    if (p && p[0] < g.cols && p[1] < g.rows && !taken.has(p.join())) { out[id] = p; taken.add(p.join()); }
  });
  S.desk.forEach(id => {
    if (out[id]) return;
    let p = null;
    // 넓은 화면은 윈도우처럼 위에서 아래로, 휴대폰은 홈 화면처럼 왼쪽에서 오른쪽으로 채움
    if (small()) { for (let r = 0; r < g.rows && !p; r++) for (let c = 0; c < g.cols && !p; c++) if (!taken.has(c + ',' + r)) p = [c, r]; }
    else { for (let c = 0; c < g.cols && !p; c++) for (let r = 0; r < g.rows && !p; r++) if (!taken.has(c + ',' + r)) p = [c, r]; }
    p = p || [0, 0]; out[id] = p; taken.add(p.join());
  });
  return { g, out };
}

function renderDesk() {
  document.body.dataset.wall = S.wall;
  document.body.className = 'size-' + S.size;
  const { g, out } = layout();
  desk.innerHTML = S.desk.map(id => {
    const a = byId[id], [c, r] = out[id];
    return `<button class="ico${sel === id ? ' sel' : ''}" role="option" data-id="${id}" aria-selected="${sel === id}"
      style="left:${PAD + c * g.w}px;top:${g.oy + r * g.h}px;width:${g.w - 4}px;min-height:${g.h - 6}px">${glyph(a)}<span class="lbl${/^[A-Z0-9 ]{9,}$/.test(a.title) ? ' caps' : ''}">${esc(a.title)}</span></button>`;
  }).join('');
  desk.querySelectorAll('.ico').forEach(bindIcon);
}
function select(id) {
  sel = id;
  desk.querySelectorAll('.ico').forEach(el => { const on = el.dataset.id === id; el.classList.toggle('sel', on); el.setAttribute('aria-selected', on); });
}

let lastTap = { id: null, t: 0 };
function bindIcon(el) {
  const id = el.dataset.id;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    closeFlyouts();
    select(id);
    const g = grid(), sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
    let moved = false, target = null;
    el.setPointerCapture(e.pointerId);
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true; el.classList.add('dragging');
      el.style.left = ox + dx + 'px'; el.style.top = oy + dy + 'px';
      const c = Math.min(g.cols - 1, Math.max(0, Math.round((ox + dx - PAD) / g.w)));
      const r = Math.min(g.rows - 1, Math.max(0, Math.round((oy + dy - g.oy) / g.h)));
      target = [c, r];
      const occ = occupant(c, r);
      dropCell.className = 'drop-cell on' + (occ === 'trash' && id !== 'trash' ? ' trash' : '');
      Object.assign(dropCell.style, { left: PAD + c * g.w + 'px', top: g.oy + r * g.h + 'px', width: g.w - 4 + 'px', height: g.h - 6 + 'px' });
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      dropCell.className = 'drop-cell';
      if (moved && target) { dropIcon(id, target); return; }
      el.classList.remove('dragging');
      // 클릭: 마우스는 두 번, 터치는 한 번에 열림 (윈도우와 같은 방식)
      const now = Date.now();
      if (coarse || (lastTap.id === id && now - lastTap.t < 450)) { lastTap = { id: null, t: 0 }; openApp(id); }
      else lastTap = { id, t: now };
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('click', e => { if (e.detail === 0) openApp(id); }); // 키보드 Enter/Space
  el.addEventListener('focus', () => select(id));
  el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); select(id); iconMenu(id, e.clientX, e.clientY, 'desk'); });
}
function occupant(c, r) {
  const { out } = layout();
  return Object.keys(out).find(k => out[k][0] === c && out[k][1] === r) || null;
}
function dropIcon(id, [c, r]) {
  const { out } = layout();
  const occ = Object.keys(out).find(k => k !== id && out[k][0] === c && out[k][1] === r);
  if (occ === 'trash' && id !== 'trash') { removeFromDesk(id); return; }
  if (occ) out[occ] = out[id];           // 자리가 차 있으면 서로 바꿈
  out[id] = [c, r];
  S.pos = out; save();                   // 한 번 옮기면 지금 배치를 고정
  renderDesk();
  const el = desk.querySelector(`[data-id="${id}"]`); if (el) el.focus({ preventScroll: true });
}
function removeFromDesk(id) {
  if (id === 'trash') return;
  S.desk = S.desk.filter(x => x !== id); delete S.pos[id];
  if (!byId[id].folder && !S.known.includes(id)) S.known.push(id);
  if (sel === id) sel = null;
  save(); renderDesk(); refreshWin('trash');
}
function addToDesk(id) {
  if (S.desk.includes(id)) return;
  S.desk.push(id); save(); renderDesk(); refreshWin('trash');
}
function togglePin(id) {
  S.pinned = S.pinned.includes(id) ? S.pinned.filter(x => x !== id) : [...S.pinned, id];
  save(); renderTaskbar();
}
const trashItems = () => S.known.filter(id => !S.desk.includes(id) && byId[id]);

desk.addEventListener('pointerdown', e => { if (e.target === desk) { select(null); closeFlyouts(); } });
desk.addEventListener('contextmenu', e => { if (e.target !== desk) return; e.preventDefault(); select(null); deskMenu(e.clientX, e.clientY); });

// ─────────── 우클릭 메뉴 ───────────
const ctx = $('#ctx');
function showMenu(x, y, items) {
  closeFlyouts();
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<hr>' :
    `<button role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''}><span class="ck">${it.check ? '✓' : ''}</span>${it.bold ? `<b>${esc(it.label)}</b>` : esc(it.label)}</button>`).join('');
  ctx.classList.remove('hidden');
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(x, innerWidth - w - 6) + 'px';
  ctx.style.top = Math.min(y, innerHeight - h - 6) + 'px';
  ctx.querySelectorAll('button').forEach(b => b.onclick = () => { const it = items[b.dataset.i]; ctx.classList.add('hidden'); it.act(); });
  const first = ctx.querySelector('button:not(:disabled)'); if (first) first.focus();
}
function deskMenu(x, y) {
  showMenu(x, y, [
    { label: '큰 아이콘', check: S.size === 'l', act: () => setSize('l') },
    { label: '보통 아이콘', check: S.size === 'm', act: () => setSize('m') },
    { label: '작은 아이콘', check: S.size === 's', act: () => setSize('s') },
    '-',
    { label: '아이콘 자동 정렬', act: autoArrange },
    { label: '새로 고침', act: () => location.reload() },
    '-',
    { label: '바탕화면 설정', act: () => openApp('settings') },
  ]);
}
function iconMenu(id, x, y, where) {
  const a = byId[id];
  const items = [{ label: a.kind === 'link' ? '새 탭에서 열기' : '열기', bold: true, act: () => openApp(id) }, '-'];
  if (id !== 'trash') items.push({ label: S.pinned.includes(id) ? '작업 표시줄에서 고정 해제' : '작업 표시줄에 고정', act: () => togglePin(id) });
  if (where === 'desk' && id !== 'trash') items.push({ label: '바탕화면에서 지우기', act: () => removeFromDesk(id) });
  if (where !== 'desk' && id !== 'trash') items.push({ label: S.desk.includes(id) ? '바탕화면에 있음' : '바탕화면에 추가', disabled: S.desk.includes(id), act: () => addToDesk(id) });
  if (a.kind === 'link') items.push('-', { label: '주소 복사', act: () => copy(a.url) });
  showMenu(x, y, items);
}
function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) {} }
function setSize(s) { S.size = s; save(); renderDesk(); refreshWin('settings'); }
function autoArrange() { S.pos = {}; save(); renderDesk(); }

// ─────────── 창 ───────────
const wins = new Map(); // id → { el, a, prev }
let zTop = 100, cascade = 0, pendingNasQ = null;
const winRoot = $('#windows'), snapHint = $('#snapHint');

function openApp(id) {
  const a = byId[id]; if (!a) return;
  closeFlyouts();
  if (a.kind === 'link') { window.open(a.url, '_blank', 'noopener'); return; }
  if (wins.has(id)) { const w = wins.get(id); w.el.classList.remove('min'); focusWin(id); return; }
  createWin(a);
}

const SIZE_FOR = { folder: [640, 420], nas: [920, 620], stock: [960, 640], settings: [600, 560], trash: [520, 420], soon: [460, 380], frame: [1180, 760] };
function createWin(a) {
  const kind = a.kind === 'builtin' ? a.id : a.kind;
  // 항목이 많은 폴더(BRAND 등)는 창을 크게 연다
  const big = kind === 'folder' && childrenOf(a.id).length > 15;
  const [W0, H0] = big ? [860, 640] : (SIZE_FOR[kind] || [720, 520]);
  const W = Math.min(W0, innerWidth - 40), H = Math.min(H0, innerHeight - TB_H - 40);
  const off = (cascade++ % 6) * 28;
  const el = document.createElement('section');
  el.className = 'win'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', a.title);
  el.style.cssText = `width:${W}px;height:${H}px;left:${Math.max(10, (innerWidth - W) / 2 - 80 + off)}px;top:${Math.max(10, (innerHeight - TB_H - H) / 2 - 40 + off)}px`;
  el.innerHTML = `
    <header class="bar">${glyph(a)}<span class="ttl">${esc(a.title)}</span>
      <div class="ctl">
        <button data-c="min" title="최소화" aria-label="최소화"><svg><use href="#i-min"/></svg></button>
        <button data-c="max" title="최대화" aria-label="최대화"><svg><use href="#i-max"/></svg></button>
        <button data-c="close" class="x" title="닫기" aria-label="닫기"><svg><use href="#i-close"/></svg></button>
      </div>
    </header>
    <div class="body"></div>
    <i class="rz e" data-d="e"></i><i class="rz w" data-d="w"></i><i class="rz s" data-d="s"></i><i class="rz se" data-d="se"></i><i class="rz sw" data-d="sw"></i>`;
  winRoot.appendChild(el);
  const w = { el, a, prev: null, nasQ: a.id === 'nas' ? pendingNasQ : null };
  pendingNasQ = null;
  wins.set(a.id, w);
  el.querySelector('[data-c=min]').onclick = () => minimize(a.id);
  el.querySelector('[data-c=max]').onclick = () => toggleMax(a.id);
  el.querySelector('[data-c=close]').onclick = () => closeWin(a.id);
  el.querySelector('.bar').addEventListener('dblclick', e => { if (!e.target.closest('.ctl')) toggleMax(a.id); });
  el.addEventListener('pointerdown', () => focusWin(a.id), true);
  dragWin(w); el.querySelectorAll('.rz').forEach(h => resizeWin(w, h));
  fillWin(w);
  if (small()) setState(w, 'max');
  focusWin(a.id);
}
function fillWin(w) {
  const body = w.el.querySelector('.body'), a = w.a;
  if (a.kind === 'folder') body.innerHTML = folderView(a);
  else if (a.kind === 'frame') body.innerHTML = `<iframe src="${esc(a.url)}" title="${esc(a.title)}"></iframe>`;
  else if (a.kind === 'soon') body.innerHTML = soonView(a);
  else if (a.id === 'settings') body.innerHTML = settingsView();
  else if (a.id === 'trash') body.innerHTML = trashView();
  else if (a.id === 'nas') { if (window.MYRUBI_NAS) window.MYRUBI_NAS.mount(body, w.nasQ); w.nasQ = null; return; }
  else if (a.id === 'stock') { if (window.MYRUBI_STOCK) window.MYRUBI_STOCK.mount(body); return; }
  else if (a.id === 'checklist') body.innerHTML = `<div class="pane"><h2>체크리스트</h2><p>멤버별 체크리스트는 텍스트 화면에서 엽니다.</p><a class="btn" href="/#checklist">텍스트 화면에서 열기</a></div>`;
  bindWinBody(w);
}
function refreshWin(id) { const w = wins.get(id); if (w) fillWin(w); }

function focusWin(id) {
  wins.forEach((w, k) => w.el.classList.toggle('active', k === id));
  const w = wins.get(id); if (!w) return;
  w.el.style.zIndex = ++zTop;
  renderTaskbar();
}
function topWin() {
  let best = null, z = -1;
  wins.forEach((w, k) => { if (!w.el.classList.contains('min') && +w.el.style.zIndex > z) { z = +w.el.style.zIndex; best = k; } });
  return best;
}
function minimize(id) {
  const w = wins.get(id); if (!w) return;
  w.el.classList.add('min'); w.el.classList.remove('active');
  const t = topWin(); if (t) focusWin(t); else renderTaskbar();
}
function closeWin(id) {
  const w = wins.get(id); if (!w) return;
  if (id === 'nas' && window.MYRUBI_NAS) window.MYRUBI_NAS.unmount();
  if (id === 'stock' && window.MYRUBI_STOCK) window.MYRUBI_STOCK.unmount();
  w.el.remove(); wins.delete(id);
  const t = topWin(); if (t) focusWin(t); else renderTaskbar();
}
/** state: null(보통) / max / snap-l / snap-r */
function setState(w, state) {
  const el = w.el, cur = ['max', 'snap-l', 'snap-r'].find(c => el.classList.contains(c)) || null;
  if (!cur && state) w.prev = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
  el.classList.remove('max', 'snap-l', 'snap-r');
  const H = innerHeight - TB_H;
  if (state === 'max') Object.assign(el.style, { left: '0px', top: '0px', width: innerWidth + 'px', height: H + 'px' });
  else if (state === 'snap-l') Object.assign(el.style, { left: '0px', top: '0px', width: innerWidth / 2 + 'px', height: H + 'px' });
  else if (state === 'snap-r') Object.assign(el.style, { left: innerWidth / 2 + 'px', top: '0px', width: innerWidth / 2 + 'px', height: H + 'px' });
  else if (w.prev) Object.assign(el.style, w.prev);
  if (state) el.classList.add(state);
  const mb = el.querySelector('[data-c=max]');
  mb.innerHTML = `<svg><use href="#i-${state === 'max' ? 'restore' : 'max'}"/></svg>`;
  mb.title = state === 'max' ? '이전 크기로' : '최대화';
}
function toggleMax(id) { const w = wins.get(id); if (w && !small()) setState(w, w.el.classList.contains('max') ? null : 'max'); }

function dragWin(w) {
  const bar = w.el.querySelector('.bar'), el = w.el;
  bar.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.ctl') || small()) return;
    const sx = e.clientX, sy = e.clientY;
    let ox = el.offsetLeft, oy = el.offsetTop, started = false, zone = null;
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        started = true; el.classList.add('busy');
        // 최대화·스냅 상태에서 끌면 원래 크기로 돌아와 커서 아래에 붙음
        if (['max', 'snap-l', 'snap-r'].some(c => el.classList.contains(c))) {
          const ratio = (sx - el.offsetLeft) / el.offsetWidth;
          setState(w, null);
          ox = sx - el.offsetWidth * ratio; oy = 0;
        }
      }
      const x = ox + ev.clientX - sx, y = Math.max(0, Math.min(innerHeight - TB_H - 36, oy + ev.clientY - sy));
      el.style.left = x + 'px'; el.style.top = y + 'px';
      zone = ev.clientY <= 2 ? 'max' : ev.clientX <= 2 ? 'snap-l' : ev.clientX >= innerWidth - 3 ? 'snap-r' : null;
      showSnap(zone);
    };
    const up = () => {
      bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
      el.classList.remove('busy'); showSnap(null);
      if (zone) setState(w, zone);
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  });
}
function showSnap(zone) {
  if (!zone) { snapHint.classList.remove('on'); return; }
  const H = innerHeight - TB_H - 16, half = innerWidth / 2 - 12;
  const r = zone === 'max' ? [8, 8, innerWidth - 16, H] : zone === 'snap-l' ? [8, 8, half, H] : [innerWidth / 2 + 4, 8, half, H];
  Object.assign(snapHint.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' });
  snapHint.classList.add('on');
}
function resizeWin(w, h) {
  const el = w.el, d = h.dataset.d;
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, L = el.offsetLeft, T = el.offsetTop, W = el.offsetWidth, H = el.offsetHeight;
    h.setPointerCapture(e.pointerId); el.classList.add('busy');
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (d.includes('e')) el.style.width = Math.max(320, W + dx) + 'px';
      if (d.includes('s')) el.style.height = Math.max(220, Math.min(innerHeight - TB_H - T, H + dy)) + 'px';
      if (d.includes('w')) { const nw = Math.max(320, W - dx); el.style.width = nw + 'px'; el.style.left = L + W - nw + 'px'; }
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); el.classList.remove('busy'); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
}

// ─────────── 창 내용 ───────────
function folderView(f) {
  const kids = childrenOf(f.id);
  return `<div class="fold">
    <div class="path">${glyph(f)}<span>My Rubi</span><span>›</span><b>${esc(f.title)}</b></div>
    <div class="items" data-folder="${f.id}">${kids.map((a, i) =>
      (a.group && a.group !== (kids[i - 1] || {}).group ? `<h4 class="f-grp">${esc(a.group)}</h4>` : '') +
      `<button class="f-item" data-id="${a.id}" title="${esc(a.url || a.title)}">${glyph(a)}<span>${esc(a.title)}</span></button>`).join('')}</div>
    <div class="status">항목 ${kids.length}개, ${coarse ? '누르면' : '두 번 클릭하면'} 새 탭에서 열립니다</div>
  </div>`;
}
function soonView(a) {
  return `<div class="soon">${glyph(a)}<h2>${esc(a.title)}</h2><p>${esc(a.note || '')}</p><span class="tag">준비 중</span></div>`;
}
function settingsView() {
  const walls = [['geometry', '블랙'], ['ruby', '그라파이트'], ['stone', '화이트']];
  const sizes = [['s', '작게'], ['m', '보통'], ['l', '크게']];
  return `<div class="pane set">
    <h3>배경</h3>
    <div class="walls">${walls.map(([k, n]) => `<button data-wall="${k}" aria-pressed="${S.wall === k}"><span class="sw ${k}"></span>${n}</button>`).join('')}</div>
    <h3>아이콘 크기</h3>
    <div class="seg">${sizes.map(([k, n]) => `<button data-size="${k}" aria-pressed="${S.size === k}">${n}</button>`).join('')}</div>
    <h3>아이콘 배치</h3>
    <p>아이콘은 끌어서 원하는 칸에 놓을 수 있고, 휴지통 위에 놓으면 바탕화면에서 빠집니다.</p>
    <button class="btn" data-act="arrange">자동 정렬</button><button class="btn" data-act="reset">처음 배치로 되돌리기</button>
    <p class="hint">배치, 고정한 앱, 배경은 이 브라우저에만 저장됩니다.</p>
    <h3>화면 방식</h3>
    <a class="btn" href="/" target="_top">텍스트 화면으로 돌아가기</a>
  </div>`;
}
function trashView() {
  const items = trashItems();
  if (!items.length) return `<div class="soon">${glyph(TRASH)}<h2>휴지통이 비어 있습니다</h2><p>바탕화면에서 지운 아이콘이 여기로 옵니다. 앱 자체는 지워지지 않고 시작 메뉴에 남아 있습니다.</p></div>`;
  return `<div class="pane"><h2>휴지통</h2><p>바탕화면에서 지운 아이콘입니다.</p>
    <ul class="trash-list">${items.map(id => `<li>${glyph(byId[id])}<span>${esc(byId[id].title)}</span><button class="btn" data-restore="${id}">바탕화면으로 되돌리기</button></li>`).join('')}</ul>
    <p style="margin-top:14px"><button class="btn primary" data-restore="*">모두 되돌리기</button></p></div>`;
}
function bindWinBody(w) {
  const body = w.el.querySelector('.body');
  body.querySelectorAll('.f-item').forEach(b => {
    const id = b.dataset.id;
    b.addEventListener('click', e => {
      body.querySelectorAll('.f-item').forEach(x => x.classList.toggle('sel', x === b));
      if (e.detail === 0 || coarse) openApp(id);
    });
    b.addEventListener('dblclick', () => openApp(id));
    b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); iconMenu(id, e.clientX, e.clientY, 'folder'); });
  });
  body.querySelectorAll('[data-wall]').forEach(b => b.onclick = () => { S.wall = b.dataset.wall; save(); renderDesk(); refreshWin('settings'); });
  body.querySelectorAll('[data-size]').forEach(b => b.onclick = () => setSize(b.dataset.size));
  body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    if (b.dataset.act === 'arrange') autoArrange();
    if (b.dataset.act === 'reset' && confirm('아이콘 위치, 작업 표시줄 고정, 배경을 처음 상태로 되돌릴까요? 메모장 내용은 그대로 남습니다.')) {
      S = defaults(); save(); renderDesk(); renderTaskbar(); refreshWin('settings'); refreshWin('trash');
    }
  });
  body.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => {
    const ids = b.dataset.restore === '*' ? trashItems() : [b.dataset.restore];
    ids.forEach(id => { if (!S.desk.includes(id)) S.desk.push(id); });
    save(); renderDesk(); refreshWin('trash');
  });
}

// ─────────── 작업 표시줄 ───────────
const tbList = $('#tbList');
function renderTaskbar() {
  const ids = [...S.pinned, ...[...wins.keys()].filter(id => !S.pinned.includes(id))];
  const act = topWin();
  tbList.innerHTML = ids.map(id => {
    const a = byId[id], w = wins.get(id);
    const cls = ['tb', w ? 'run' : '', w && act === id && !w.el.classList.contains('min') && w.el.classList.contains('active') ? 'active' : ''].join(' ');
    return `<button class="${cls}" data-id="${id}" title="${esc(a.title)}" aria-label="${esc(a.title)}">${glyph(a)}</button>`;
  }).join('');
  tbList.querySelectorAll('.tb').forEach(b => {
    const id = b.dataset.id;
    b.onclick = () => {
      const w = wins.get(id);
      if (!w) return openApp(id);
      if (w.el.classList.contains('min')) { w.el.classList.remove('min'); focusWin(id); }
      else if (w.el.classList.contains('active')) minimize(id);
      else focusWin(id);
    };
    b.oncontextmenu = e => {
      e.preventDefault();
      const a = byId[id], items = [{ label: a.title, bold: true, act: () => openApp(id) }, '-',
        { label: S.pinned.includes(id) ? '작업 표시줄에서 고정 해제' : '작업 표시줄에 고정', act: () => togglePin(id) }];
      if (wins.has(id)) items.push({ label: '창 닫기', act: () => closeWin(id) });
      showMenu(e.clientX, Math.min(e.clientY, innerHeight - TB_H - 10), items);
    };
  });
}

// ─────────── 시작 메뉴 ───────────
const start = $('#start'), startQ = $('#startQ'), startBody = $('#startBody');
function sections(q) {
  const match = a => !q || (a.title + ' ' + (a.url || '') + ' ' + (a.note || '')).toLowerCase().includes(q);
  const top = APPS.filter(a => !a.folder && match(a));
  const out = [{ title: 'Rubi', items: top }];
  APPS.filter(a => a.kind === 'folder').forEach(f => out.push({ title: f.title, items: childrenOf(f.id).filter(match) }));
  return out.filter(s => s.items.length);
}
function renderStart() {
  const q = startQ.value.trim().toLowerCase();
  const secs = sections(q);
  const nasRow = q && byId.nas && window.MYRUBI_NAS && window.MYRUBI_NAS.configured()
    ? `<h3>NAS</h3><button class="s-nas" id="sNas">${glyph(byId.nas)}<span>NAS에서 "<b>${esc(startQ.value.trim())}</b>" 파일 찾기</span><kbd>${secs.length ? '' : 'Enter'}</kbd></button>` : '';
  if (!secs.length) {
    startBody.innerHTML = nasRow || `<div class="s-empty">"${esc(startQ.value)}"와 맞는 앱이 없습니다.</div>`;
    if (nasRow) $('#sNas').onclick = () => openNas(startQ.value.trim());
    return;
  }
  startBody.innerHTML = nasRow + secs.map((s, si) => `<h3>${esc(s.title)}</h3><div class="start-grid">${s.items.map((a, i) =>
    `<button class="s-item${q && si === 0 && i === 0 ? ' hit' : ''}" data-id="${a.id}" title="${esc(a.title)}">${glyph(a)}<span class="n">${esc(a.title)}</span></button>`).join('')}</div>`).join('');
  if (nasRow) $('#sNas').onclick = () => openNas(startQ.value.trim());
  startBody.querySelectorAll('.s-item').forEach(b => {
    b.onclick = () => openApp(b.dataset.id);
    b.oncontextmenu = e => { e.preventDefault(); iconMenu(b.dataset.id, e.clientX, e.clientY, 'start'); };
  });
}
function toggleStart(on) {
  const show = on ?? start.classList.contains('hidden');
  closeFlyouts(); if (!show) return;
  start.classList.remove('hidden'); $('#startBtn').classList.add('open');
  startQ.value = ''; renderStart(); setTimeout(() => startQ.focus(), 20);
}
$('#startBtn').onclick = e => { e.stopPropagation(); toggleStart(); };
$('#tbSearch').onclick = e => { e.stopPropagation(); toggleStart(true); };
startQ.addEventListener('input', renderStart);
startQ.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const hit = startBody.querySelector('.s-item');
    if (hit) openApp(hit.dataset.id); else if ($('#sNas')) openNas(startQ.value.trim());
  }
});
$('#startSettings').onclick = () => openApp('settings');
start.addEventListener('pointerdown', e => e.stopPropagation());

/** NAS 창을 열고 검색 (이미 열려 있으면 그 창에서 검색) */
function openNas(q) {
  closeFlyouts();
  const w = wins.get('nas');
  if (w) { w.el.classList.remove('min'); focusWin('nas'); if (q && window.MYRUBI_NAS) window.MYRUBI_NAS.search(q); return; }
  if (!byId.nas) return;
  createWinWith(byId.nas, q);
}
function createWinWith(a, q) { pendingNasQ = q || null; createWin(a); }
window.MYRUBI_DESK = { menu: (x, y, items) => showMenu(x, y, items), openNas };
if (window.MYRUBI_BOARD) window.MYRUBI_BOARD.onLayout = () => renderDesk();

// ─────────── 시계·달력 ───────────
const cal = $('#cal'); let calMonth = null;
function tick() {
  const d = new Date();
  $('#clockT').textContent = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  $('#clockD').textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('#lockT').textContent = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#lockD').textContent = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}
function renderCal() {
  const now = new Date(), m = calMonth;
  const first = new Date(m.getFullYear(), m.getMonth(), 1), startDay = first.getDay();
  const days = [], ev = window.MYRUBI_BOARD ? window.MYRUBI_BOARD.eventDates() : new Set();
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 42; i++) days.push(new Date(m.getFullYear(), m.getMonth(), 1 - startDay + i));
  cal.innerHTML = `
    <div class="today">${now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
    <div class="head"><b>${m.getFullYear()}년 ${m.getMonth() + 1}월</b><span>
      <button data-m="-1" aria-label="이전 달">‹</button><button data-m="1" aria-label="다음 달">›</button></span></div>
    <div class="grid">${['일', '월', '화', '수', '목', '금', '토'].map(w => `<span class="w">${w}</span>`).join('')}
      ${days.map(d => {
        const c = [d.getMonth() !== m.getMonth() ? 'o' : '', d.getDay() === 0 ? 'sun' : '', d.toDateString() === now.toDateString() ? 'now' : '', ev.has(key(d)) ? 'ev' : ''].join(' ');
        return `<span class="${c}"${ev.has(key(d)) ? ' title="일정 있음"' : ''}>${d.getDate()}</span>`;
      }).join('')}</div>
    <div class="hours">쇼룸·고객센터 월~금 12:00~18:00</div>`;
  cal.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.stopPropagation(); calMonth = new Date(m.getFullYear(), m.getMonth() + +b.dataset.m, 1); renderCal(); });
}
$('#tray').onclick = e => {
  e.stopPropagation();
  const show = cal.classList.contains('hidden'); closeFlyouts(); if (!show) return;
  const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1);
  renderCal(); cal.classList.remove('hidden'); $('#tray').classList.add('open');
};
cal.addEventListener('pointerdown', e => e.stopPropagation());

// ─────────── 공통 ───────────
function closeFlyouts() {
  start.classList.add('hidden'); cal.classList.add('hidden'); ctx.classList.add('hidden');
  $('#startBtn').classList.remove('open'); $('#tray').classList.remove('open');
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('.ctx,.start,.cal,.taskbar')) closeFlyouts(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('textarea,input,iframe')) e.preventDefault(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeFlyouts(); return; }
  if (document.body.classList.contains('locked')) return;
  const typing = e.target.closest && e.target.closest('input,textarea');
  if (typing) return;
  if (e.key === 'Delete' && sel && sel !== 'trash') removeFromDesk(sel);
  if ((e.altKey || e.ctrlKey) && e.key === ' ') { e.preventDefault(); toggleStart(); }
  if (sel && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && document.activeElement.closest('.desk')) {
    e.preventDefault(); moveSel(e.key);
  }
});
function moveSel(key) {
  const { out } = layout(), [c, r] = out[sel];
  const dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0, dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  let best = null, bd = Infinity;
  Object.entries(out).forEach(([id, [x, y]]) => {
    if (id === sel) return;
    const vx = x - c, vy = y - r;
    if ((dc && Math.sign(vx) !== dc) || (dr && Math.sign(vy) !== dr)) return;
    const dist = Math.abs(vx) + Math.abs(vy) + (dc ? Math.abs(vy) * 2 : Math.abs(vx) * 2);
    if (dist < bd) { bd = dist; best = id; }
  });
  if (best) desk.querySelector(`[data-id="${best}"]`).focus();
}
let rt; addEventListener('resize', () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    renderDesk();
    wins.forEach(w => { const st = ['max', 'snap-l', 'snap-r'].find(c => w.el.classList.contains(c)); if (st || small()) setState(w, small() ? 'max' : st); });
  }, 120);
});

// ─────────── 로그인 ───────────
// config.js 에 GOOGLE_CLIENT_ID 가 있으면 첫 화면이 잠금 화면. 회사 구글 계정으로 로그인하면 Apps Script가 확인 후 30일 세션 발급
const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const lock = $('#lock'), lockMsg = $('#lockMsg');
let gisLoaded = false, justLoggedOut = false;

function setMsg(t, ok) { lockMsg.textContent = t || ''; lockMsg.classList.toggle('ok', !!ok); }
function showLock(msg, ok) {
  closeFlyouts();
  [...wins.keys()].forEach(closeWin);
  document.body.classList.add('locked');
  lock.classList.remove('hidden', 'leaving');
  setMsg(msg, ok);
  loadGis();
}
function loadGis() {
  if (gisLoaded) { renderGBtn(); if (justLoggedOut) google.accounts.id.disableAutoSelect(); return; }
  if (document.getElementById('gsi')) return;
  const sc = document.createElement('script');
  sc.id = 'gsi'; sc.src = 'https://accounts.google.com/gsi/client?hl=ko'; sc.async = true;
  sc.onload = () => {
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, hd: CFG.ALLOWED_DOMAIN || undefined,
      auto_select: !justLoggedOut, context: 'signin', ux_mode: 'popup', cancel_on_tap_outside: false,
    });
    gisLoaded = true; renderGBtn();
    if (justLoggedOut) google.accounts.id.disableAutoSelect(); else google.accounts.id.prompt();
  };
  sc.onerror = () => setMsg('구글 로그인을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로 고침해 주세요');
  document.head.appendChild(sc);
}
function renderGBtn() {
  $('#gBtn').innerHTML = '';
  google.accounts.id.renderButton($('#gBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko', width: '260' });
}
async function onCredential(r) {
  setMsg('확인하는 중', true);
  try { await MR.login(r.credential); justLoggedOut = false; unlock(true); }
  catch (e) { setMsg(e.message); }
}
function unlock(animate) {
  document.body.classList.remove('locked');
  if (animate) { lock.classList.add('leaving'); setTimeout(() => lock.classList.add('hidden'), 350); }
  else lock.classList.add('hidden');
  if (window.MYRUBI_BOARD) window.MYRUBI_BOARD.start();
  renderDesk(); renderTaskbar(); renderWho(); openFromUrl();
}
function renderWho() {
  const u = MR && MR.session() ? MR.user() : null;
  $('#startWho').innerHTML = u
    ? `${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : '<span class="gem small"></span>'}<span>${esc(u.name)}<small>${esc(u.email)}</small></span>`
    : '<span class="gem small"></span>Rubi Workshop';
  $('#startLogout').classList.toggle('hidden', !u);
}
$('#startLogout').onclick = () => { justLoggedOut = true; MR.logout(); showLock('로그아웃했습니다', true); };

function openFromUrl() {
  const hash = location.hash.slice(1);
  if (hash && byId[hash]) { openApp(hash); return; }
  const next = new URLSearchParams(location.search).get('next');
  if (next) { const a = APPS.find(x => x.kind === 'frame' && x.url && next.startsWith(x.url.split('?')[0])); if (a) openApp(a.id); }
}

// ─────────── 시작 ───────────
tick(); setInterval(tick, 10000);
if (MR && MR.loginEnabled()) {
  MR.onKick = () => showLock('로그인이 만료되었습니다. 다시 로그인해 주세요');
  addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'myrubi:signedout') MR.onKick(); });
  if (MR.session()) { unlock(false); MR.get({ action: 'me' }).catch(() => {}); } // 세션이 서버에서 지워졌으면 잠금 화면으로
  else showLock();
} else {
  unlock(false);
}
})();
