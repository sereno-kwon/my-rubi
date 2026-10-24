// My Rubi 바탕화면 오른쪽 위 포스트잇 (공지·일정)
// 구글 로그인을 켜면 Apps Script(00_My Rubi Index 시트의 '공지' 탭)에 저장되어 모든 직원이 같은 포스트잇을 봄
// 로그인을 켜기 전에는 이 브라우저에만 저장됨
(() => {
'use strict';

const MR = window.MR;
const K_LOCAL = 'myrubi.notes', K_CACHE = 'myrubi.notes.cache', K_UI = 'myrubi.board';
const COLORS = ['yellow', 'pink', 'blue', 'green'];
const COLOR_NAME = { yellow: '노랑', pink: '분홍', blue: '파랑', green: '초록' };
const DEF_COLOR = { notice: 'yellow', event: 'blue' };
const POLL_MS = 120000;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const small = () => innerWidth <= 720;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

let notes = [];          // { id, type:'notice'|'event', text, date, time, color, author, createdAt, updatedAt }
let editing = null;      // 편집 중인 포스트잇 id, 새로 쓰는 중이면 'new'
let draft = null;
let msg = '', busy = false, started = false, lastReserve = '';
const ui = Object.assign({ collapsed: false }, readJson(K_UI, {}));

const board = document.createElement('aside');
board.className = 'board hidden';
board.setAttribute('aria-label', '공지와 일정');
document.getElementById('windows').before(board);

/** 로그인되어 있으면 서버(모든 직원 공유), 아니면 이 브라우저 */
const shared = () => !!(MR && MR.loginEnabled() && MR.session());

// ─────────── 표시 ───────────
function visible() {
  const today = ymd(new Date());
  return notes
    .filter(n => n.type !== 'event' || n.date >= today)       // 지난 일정은 다음 날부터 숨김
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'notice' ? -1 : 1;  // 공지 먼저, 그다음 일정
      if (a.type === 'event') return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
      return String(b.createdAt).localeCompare(String(a.createdAt)); // 공지는 최근 것이 위로
    });
}
function dday(date) {
  const a = new Date(date + 'T00:00'), t = new Date(ymd(new Date()) + 'T00:00');
  const n = Math.round((a - t) / 864e5);
  return n === 0 ? '오늘' : n === 1 ? '내일' : 'D-' + n;
}
function fmtDate(date, time) {
  const d = new Date(date + 'T00:00');
  return `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})${time ? ' ' + time : ''}`;
}
function fmtStamp(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[2]}/${+m[3]}` : '';
}
const linkify = html => html.replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`);
const rot = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 4; };

function noteHtml(n) {
  const dd = n.type === 'event' ? dday(n.date) : '';
  const tag = n.type === 'event'
    ? `<b>${esc(fmtDate(n.date, n.time))}</b><span class="dd${dd === '오늘' ? ' now' : ''}">${dd}</span>`
    : '<b>공지</b>';
  const by = [n.author, fmtStamp(n.updatedAt || n.createdAt)].filter(Boolean).map(esc).join(' · ');
  return `<article class="pi c-${COLORS.includes(n.color) ? n.color : 'yellow'} r${rot(n.id)}" data-id="${esc(n.id)}" tabindex="0" title="눌러서 고치기">
    <div class="pi-tag">${tag}</div>
    <div class="pi-txt">${linkify(esc(n.text))}</div>
    ${by ? `<div class="pi-by">${by}</div>` : ''}
  </article>`;
}
function editorHtml(d) {
  const ph = d.type === 'event' ? '예) 몰튼 고객 픽업&#10;반포 쇼룸, 담당 세레노' : '예) 금요일 오후 재고 실사&#10;16시부터 입고 받지 않음';
  return `<form class="pi edit c-${d.color}" id="piEdit" autocomplete="off">
    <div class="seg2" role="group" aria-label="종류">
      <button type="button" data-type="notice" aria-pressed="${d.type === 'notice'}">공지</button>
      <button type="button" data-type="event" aria-pressed="${d.type === 'event'}">일정</button>
    </div>
    <textarea name="text" rows="4" maxlength="500" placeholder="${ph}" aria-label="내용">${esc(d.text)}</textarea>
    ${d.type === 'event' ? `<div class="pi-when">
      <input type="date" name="date" value="${esc(d.date)}" aria-label="날짜">
      <input type="time" name="time" value="${esc(d.time)}" aria-label="시간 (선택)">
    </div>` : ''}
    <div class="pi-colors" role="group" aria-label="색">${COLORS.map(c =>
      `<button type="button" class="dot c-${c}" data-color="${c}" aria-pressed="${d.color === c}" title="${COLOR_NAME[c]}" aria-label="${COLOR_NAME[c]}"></button>`).join('')}</div>
    <div class="pi-btns">
      ${d.id ? '<button type="button" class="pi-del" data-a="del">떼기</button>' : ''}
      <span></span>
      <button type="button" data-a="cancel">취소</button>
      <button type="submit" class="pri"${busy ? ' disabled' : ''}>${busy ? '저장 중' : d.id ? '저장' : '붙이기'}</button>
    </div>
  </form>`;
}

function render() {
  const list = visible();
  board.classList.toggle('collapsed', ui.collapsed);
  const head = `<div class="bd-head">
    <button class="bd-title" data-a="toggle" aria-expanded="${!ui.collapsed}" title="${ui.collapsed ? '펼치기' : '접기'}">
      <svg class="i"><use href="#i-pin"/></svg><span>공지 · 일정</span>${list.length ? `<b>${list.length}</b>` : ''}<svg class="i chev"><use href="#i-chev"/></svg>
    </button>
    <button class="bd-add" data-a="add" title="새 포스트잇" aria-label="새 포스트잇"><svg class="i"><use href="#i-plus"/></svg></button>
  </div>`;
  if (ui.collapsed) { board.innerHTML = head; layoutChanged(); return; }

  let body = '';
  if (editing === 'new') body += editorHtml(draft);
  body += list.map(n => editing === n.id ? editorHtml(draft) : noteHtml(n)).join('');
  if (!list.length && editing !== 'new') body += '<button class="bd-empty" data-a="add">첫 공지나 일정을 붙여 보세요</button>';
  const foot = msg ? `<div class="bd-foot err" role="status">${esc(msg)}</div>`
    : !shared() ? '<div class="bd-foot">이 브라우저에만 저장됩니다</div>' : '';
  board.innerHTML = head + `<div class="bd-list">${body}</div>` + foot;
  layoutChanged();
}
function focusText() {
  const t = board.querySelector('#piEdit textarea');
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}

/** 바탕화면 아이콘이 포스트잇 밑으로 들어가지 않게 비워둘 공간 */
function reserve() {
  if (board.classList.contains('hidden')) return { right: 0, top: 0 };
  if (small()) return { right: 0, top: 46 };
  return { right: Math.ceil(board.getBoundingClientRect().width) + 24, top: 0 };
}
function layoutChanged() {
  const r = JSON.stringify(reserve());
  if (r === lastReserve) return;
  lastReserve = r;
  if (typeof API.onLayout === 'function') API.onLayout();
}

// ─────────── 저장 ───────────
const readLocal = () => readJson(K_LOCAL, []);
const writeLocal = () => ls.set(K_LOCAL, JSON.stringify(notes));

async function load() {
  if (!shared()) { notes = readLocal(); if (!editing) render(); return; }
  try {
    const j = await MR.get({ action: 'notes' });
    notes = j.notes || [];
    ls.set(K_CACHE, JSON.stringify(notes));
    msg = '';
  } catch (e) {
    msg = /unknown action/.test(e.message)
      ? 'Apps Script를 새 버전으로 배포해야 공지가 공유됩니다'
      : '공지를 불러오지 못했습니다. ' + e.message;
  }
  if (!editing) render();
}

async function persist(op, d) {
  const fields = { id: d.id, type: d.type, text: d.text, date: d.type === 'event' ? d.date : '', time: d.type === 'event' ? d.time : '', color: d.color };
  if (shared()) {
    const j = await MR.post(Object.assign({ action: 'note', op }, fields));
    notes = j.notes || [];
    ls.set(K_CACHE, JSON.stringify(notes));
    return;
  }
  if (op === 'add') notes.push(Object.assign(fields, { id: 'l' + Date.now().toString(36), author: (MR && MR.user().name) || '', createdAt: stamp(), updatedAt: '' }));
  else if (op === 'update') { const n = notes.find(x => x.id === d.id); if (n) Object.assign(n, fields, { updatedAt: stamp() }); }
  else if (op === 'delete') notes = notes.filter(x => x.id !== d.id);
  writeLocal();
}

function syncDraft() {
  const f = board.querySelector('#piEdit'); if (!f || !draft) return;
  draft.text = f.elements.text.value;
  if (f.elements.date) draft.date = f.elements.date.value;
  if (f.elements.time) draft.time = f.elements.time.value;
}
async function save() {
  syncDraft();
  draft.text = draft.text.replace(/\s+$/, '').replace(/^\s+/, '');
  if (!draft.text) { msg = '내용을 적어 주세요'; render(); focusText(); return; }
  if (draft.type === 'event' && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) { msg = '일정 날짜를 골라 주세요'; render(); focusText(); return; }
  busy = true; msg = ''; render();
  try {
    await persist(draft.id ? 'update' : 'add', draft);
    editing = null; draft = null;
  } catch (e) { msg = '저장하지 못했습니다. ' + e.message; }
  busy = false; render();
  if (editing) focusText();
}
async function remove(id) {
  const n = notes.find(x => x.id === id);
  if (!n || !confirm(shared() ? '이 포스트잇을 뗄까요? 모든 직원 화면에서 사라집니다.' : '이 포스트잇을 뗄까요?')) return;
  busy = true; render();
  try { await persist('delete', { id }); if (editing === id) { editing = null; draft = null; } msg = ''; }
  catch (e) { msg = '떼지 못했습니다. ' + e.message; }
  busy = false; render();
}

function startNew() {
  ui.collapsed = false; saveUi();
  editing = 'new'; msg = '';
  draft = { type: 'notice', text: '', date: '', time: '', color: DEF_COLOR.notice, colorSet: false };
  render(); focusText();
}
function startEdit(id) {
  const n = notes.find(x => x.id === id); if (!n) return;
  editing = id; msg = '';
  draft = { id: n.id, type: n.type, text: n.text, date: n.date || '', time: n.time || '', color: n.color || DEF_COLOR[n.type], colorSet: true };
  render(); focusText();
}
function cancel() { editing = null; draft = null; msg = ''; render(); }
function saveUi() { ls.set(K_UI, JSON.stringify(ui)); }

// ─────────── 조작 ───────────
board.addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const a = e.target.closest('[data-a]');
  if (a) {
    const act = a.dataset.a;
    if (act === 'toggle') { ui.collapsed = !ui.collapsed; saveUi(); if (ui.collapsed) { editing = null; draft = null; } render(); }
    else if (act === 'add') startNew();
    else if (act === 'cancel') cancel();
    else if (act === 'del') remove(draft.id);
    return;
  }
  const t = e.target.closest('[data-type]');
  if (t && draft) {
    syncDraft();
    draft.type = t.dataset.type;
    if (draft.type === 'event' && !draft.date) draft.date = ymd(new Date());
    if (!draft.colorSet) draft.color = DEF_COLOR[draft.type];
    render(); focusText(); return;
  }
  const c = e.target.closest('[data-color]');
  if (c && draft) { syncDraft(); draft.color = c.dataset.color; draft.colorSet = true; render(); return; }
  const n = e.target.closest('.pi[data-id]');
  if (n && !busy) startEdit(n.dataset.id);
});
board.addEventListener('submit', e => { e.preventDefault(); if (!busy) save(); });
board.addEventListener('keydown', e => {
  if (e.target.closest('#piEdit')) {
    if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!busy) save(); }
    return;
  }
  const n = e.target.closest('.pi[data-id]');
  if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startEdit(n.dataset.id); }
});
board.addEventListener('contextmenu', e => {
  if (e.target.closest('textarea,input')) return;
  e.preventDefault(); e.stopPropagation();
  const n = e.target.closest('.pi[data-id]');
  const D = window.MYRUBI_DESK; if (!D) return;
  if (!n) { D.menu(e.clientX, e.clientY, [{ label: '새 포스트잇', bold: true, act: startNew }, { label: ui.collapsed ? '펼치기' : '접기', act: () => { ui.collapsed = !ui.collapsed; saveUi(); render(); } }]); return; }
  const id = n.dataset.id, note = notes.find(x => x.id === id); if (!note) return;
  D.menu(e.clientX, e.clientY, [
    { label: '고치기', bold: true, act: () => startEdit(id) },
    '-',
    ...COLORS.map(c => ({ label: COLOR_NAME[c], check: note.color === c, act: async () => {
      try { await persist('update', Object.assign({}, note, { color: c })); msg = ''; } catch (err) { msg = '저장하지 못했습니다. ' + err.message; }
      render();
    } })),
    '-',
    { label: '떼기', act: () => remove(id) },
  ]);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && started && shared() && !editing) load(); });
setInterval(() => { if (!document.hidden && started && shared() && !editing && !busy) load(); }, POLL_MS);

// ─────────── 공개 ───────────
const API = {
  /** 바탕화면이 열릴 때(로그인 후) 호출 */
  start() {
    if (!started && small()) ui.collapsed = true;   // 휴대폰은 접힌 채로 시작
    started = true;
    editing = null; draft = null; msg = '';
    notes = shared() ? readJson(K_CACHE, []) : readLocal();
    board.classList.remove('hidden');
    render();
    load();
  },
  reserve,
  onLayout: null,
  /** 달력에 점을 찍을 일정 날짜 */
  eventDates() { return new Set(notes.filter(n => n.type === 'event' && n.date).map(n => n.date)); },
  relayout() { lastReserve = ''; layoutChanged(); },
};
window.MYRUBI_BOARD = API;
})();
