// My Rubi 텍스트 화면 (/)
// 목록이 곧 인터페이스: 입력하면 걸러지고, 방향키로 고르고, Enter로 연다.
// 앱 목록은 apps.js, NAS는 nas.js, 공지·일정은 board.js 를 그대로 씀. 윈도우형 화면은 /desktop/
(() => {
'use strict';

// ─────────── 앱 목록 ───────────
const APPS = (window.MYRUBI_APPS || []).slice();
const byId = Object.fromEntries(APPS.map(a => [a.id, a]));
// 텍스트 화면에서는 '바탕화면 설정' 대신 '설정'
if (byId.settings) byId.settings = Object.assign({}, byId.settings, { title: '설정' });
const childrenOf = fid => APPS.filter(a => a.folder === fid);
const TOP = APPS.filter(a => !a.folder && a.kind !== 'folder').map(a => byId[a.id]);
const FOLDERS = APPS.filter(a => a.kind === 'folder');
const HOME = Array.isArray(window.MYRUBI_HOME) ? window.MYRUBI_HOME : null;  // 첫 목록 구역 (apps.js)

// ─────────── 저장 ───────────
const K_UI = 'myrubi.text.v1', K_RECENT = 'myrubi.recent';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };
const UI = Object.assign({ theme: 'dark' }, readJson(K_UI, {}));
const saveUi = () => ls.set(K_UI, JSON.stringify(UI));
let recent = readJson(K_RECENT, []).filter(id => byId[id]);

// ─────────── 도우미 ───────────
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const hasKo = t => /[가-힣]/.test(t);
const nas = () => window.MYRUBI_NAS;
const nasAlso = q => { try { const al = nas().alsoText(nas().expand(q).also); return al ? al + ' 함께 찾기' : '파일·폴더 이름 검색'; } catch (e) { return '파일·폴더 이름 검색'; } };
const chk = () => window.MYRUBI_CHECK;
const stk = () => window.MYRUBI_STOCK;
const host = u => { try { return new URL(u, location.href).host.replace(/^www\./, ''); } catch (e) { return ''; } };

function applyTheme() {
  document.documentElement.dataset.theme = UI.theme;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = UI.theme === 'light' ? '#ffffff' : '#101114';
}
applyTheme();

// ─────────── 목록 ───────────
const q = $('#q'), listEl = $('#list'), crumbEl = $('#crumb'), recentEl = $('#recent');
let folder = null;   // 열려 있는 폴더 id
let rows = [];       // 지금 보이는 줄 [{ id } | { stock: '검색어' } | { nas: '검색어' }]
let sel = 0;         // 키보드로 고른 줄

function meta(a) {
  if (a.kind === 'folder') return `${childrenOf(a.id).length}개`;
  if (a.kind === 'link') return host(a.url);
  if (a.kind === 'soon') return '예정';
  return '포털에서 열기';
}
const arrow = a => a.kind === 'link' ? '↗' : '→';

/** 지금 상태(폴더, 검색어)에 맞는 구역들 */
function sections(term) {
  if (!term) {
    if (folder) {
      const out = [];
      childrenOf(folder).forEach(a => {
        const label = a.group || byId[folder].title;
        let s = out.find(x => x.label === label);
        if (!s) out.push(s = { label, items: [] });
        s.items.push(a);
      });
      return out;
    }
    if (HOME) return HOME.map(s => ({ label: s.label, items: s.ids.map(id => byId[id]).filter(Boolean) })).filter(s => s.items.length);
    return [{ label: 'Apps', items: TOP }, { label: 'Folders', items: FOLDERS }];
  }
  // 검색: 폴더 안이면 그 폴더에서만, 처음 화면이면 전체에서
  const words = term.split(/\s+/);
  // 주소 전체가 아니라 도메인만 봄 (구글 문서 ID 같은 긴 문자열이 아무 검색어에나 걸리지 않게)
  const hay = a => [a.title, a.kind === 'link' && host(a.url), a.group, a.note, a.folder && byId[a.folder] && byId[a.folder].title].filter(Boolean).join(' ').toLowerCase();
  const pool = folder ? childrenOf(folder) : APPS;
  const hits = pool.filter(a => { const h = hay(a); return words.every(w => h.includes(w)); });
  const out = [];
  hits.forEach(a => {
    const label = a.folder ? byId[a.folder].title : 'Rubi';
    let s = out.find(x => x.label === label);
    if (!s) out.push(s = { label, items: [] });
    s.items.push(a);
  });
  // 이름이 검색어로 시작하는 항목이 있는 구역을 위로
  const starts = s => s.items.some(a => a.title.toLowerCase().startsWith(words[0])) ? 0 : 1;
  return out.sort((x, y) => starts(x) - starts(y));
}

function rowHtml(a, i) {
  const href = a.kind === 'link' ? esc(a.url) : '#' + esc(a.id);
  const ext = a.kind === 'link' ? ' target="_blank" rel="noopener"' : '';
  return `<li><a class="row k-${a.kind}" href="${href}"${ext} data-i="${i}" data-id="${esc(a.id)}" role="option">
    <span class="no">${pad(i + 1)}</span><span class="tt">${esc(a.title)}</span><span class="mt">${esc(meta(a))}</span><span class="ar" aria-hidden="true">${arrow(a)}</span></a></li>`;
}

function render() {
  const raw = q.value.trim(), term = raw.toLowerCase();
  const secs = sections(term);
  rows = [];
  let html = '';
  secs.forEach(s => {
    html += `<h2 class="sec-h${hasKo(s.label) ? ' ko' : ''}"><span>${esc(s.label)}</span><span class="n">${s.items.length}</span></h2><ol class="rows">`;
    s.items.forEach(a => { html += rowHtml(a, rows.length); rows.push({ id: a.id }); });
    html += '</ol>';
  });
  // 검색어가 있으면 이카운트 재고, NAS 파일 찾기 줄을 함께 보여줌
  if (raw && byId.stock && stk() && stk().configured()) {
    const i = rows.length; rows.push({ stock: raw });
    html += `<h2 class="sec-h"><span>Stock</span></h2><ol class="rows"><li><a class="row k-stock" href="#stock" data-i="${i}" role="option">
      <span class="no">${pad(i + 1)}</span><span class="tt">이카운트 재고에서 “${esc(raw)}” 찾기</span><span class="mt">품목 이름·코드·바코드</span><span class="ar" aria-hidden="true">→</span></a></li></ol>`;
  }
  if (raw && byId.nas && nas() && nas().configured()) {
    const i = rows.length; rows.push({ nas: raw });
    html += `<h2 class="sec-h"><span>NAS</span></h2><ol class="rows"><li><a class="row k-nas" href="#nas" data-i="${i}" role="option">
      <span class="no">${pad(i + 1)}</span><span class="tt">NAS에서 “${esc(raw)}” 파일·폴더 찾기</span><span class="mt">${esc(nasAlso(raw))}</span><span class="ar" aria-hidden="true">→</span></a></li></ol>`;
  }
  if (!rows.length) html = `<p class="empty">“${esc(raw)}”와 맞는 항목이 없습니다.</p>`;
  listEl.innerHTML = html;
  listEl.classList.toggle('dense', rows.length > 12);
  numReset();
  const km = $('#kMax'); if (km) km.textContent = Math.max(1, rows.length);
  sel = Math.max(0, Math.min(sel, rows.length - 1));
  paint(false);
  renderCrumb();
  renderRecent(!raw && !folder);
}

function renderCrumb() {
  crumbEl.innerHTML = folder
    ? `<button class="up" data-up title="처음으로 (Esc)"><svg class="i"><use href="#i-back"/></svg>My Rubi</button><span class="sep">/</span><span>${esc(byId[folder].title)}</span>`
    : '<span>My Rubi</span>';
  const up = crumbEl.querySelector('[data-up]'); if (up) up.onclick = () => goUp();
  q.placeholder = folder ? `${byId[folder].title}에서 찾기` : '무엇을 열까요';
}

function renderRecent(show) {
  const ids = recent.filter(id => byId[id]).slice(0, 6);
  recentEl.classList.toggle('hidden', !show || !ids.length);
  if (!show || !ids.length) return;
  recentEl.innerHTML = '<span class="lb">최근</span>' + ids.map(id => `<button data-id="${esc(id)}">${esc(byId[id].title)}</button>`).join('');
  recentEl.querySelectorAll('button').forEach(b => b.onclick = () => open(b.dataset.id));
}

function paint(scroll) {
  listEl.querySelectorAll('.row.on').forEach(r => { r.classList.remove('on'); r.removeAttribute('id'); });
  const r = listEl.querySelector(`.row[data-i="${sel}"]`);
  if (!r) { q.removeAttribute('aria-activedescendant'); return; }
  r.classList.add('on'); r.id = 'row-on';
  q.setAttribute('aria-activedescendant', 'row-on');
  if (scroll) r.scrollIntoView({ block: 'nearest' });
}
function move(d) { if (!rows.length) return; sel = (sel + d + rows.length) % rows.length; paint(true); }

// ─────────── 번호로 바로 열기 ───────────
// 숫자를 연달아 치면 두 자리 번호가 됨 (1 → 0 이면 10번, 1 → 2 이면 12번).
// 뒤에 숫자가 더 붙을 수 없는 번호(목록이 12줄일 때 2–9, 10–12)는 바로 열고,
// 1처럼 10–12로 이어질 수 있는 번호는 그 줄을 짚어 둔 채 잠깐 기다렸다가 엶. 01, 02 처럼 앞에 0을 붙여도 됨.
const NUM_WAIT = 700;
let numBuf = '', numTimer = 0;
function numReset() { clearTimeout(numTimer); numTimer = 0; numBuf = ''; }
function numKey(k) {
  clearTimeout(numTimer);
  numBuf += k;
  const n = +numBuf, max = rows.length, width = String(max).length;
  const done = numBuf.length >= width || (n > 0 && n * 10 > max);
  if (n > max || (done && n < 1)) { numReset(); return; }      // 없는 번호는 무시
  if (n >= 1) { sel = n - 1; paint(true); }                        // 기다리는 동안 그 줄을 짚어 둠
  if (done) { numReset(); activate(n - 1); return; }
  numTimer = setTimeout(() => {
    const m = +numBuf; numReset();
    if (m >= 1 && panelEl.classList.contains('hidden') && !document.body.classList.contains('locked')) activate(m - 1);
  }, NUM_WAIT);
}
/** 숫자 아닌 키가 들어오면: Enter는 짚어 둔 번호를 바로 열고, 나머지는 입력 중인 번호를 버림 */
function numInterrupt(e) {
  if (!numBuf) return false;
  if (e.key === 'Enter' && +numBuf >= 1) { e.preventDefault(); const m = +numBuf; numReset(); activate(m - 1); return true; }
  numReset();
  return false;
}

function activate(i) {
  const r = rows[i]; if (!r) return;
  if (r.stock != null) { remember('stock'); openPanel(byId.stock, r.stock); return; }
  if (r.nas != null) { openPanel(byId.nas, r.nas); return; }
  open(r.id);
}

function remember(id) {
  recent = [id, ...recent.filter(x => x !== id)].slice(0, 12);
  ls.set(K_RECENT, JSON.stringify(recent));
}

/** 앱 열기: 링크는 새 탭, 폴더는 목록을 펼침, 나머지는 패널 */
function open(id) {
  const a = byId[id]; if (!a) return;
  closeMenu();
  if (a.kind === 'folder') { remember(id); folder = id; q.value = ''; sel = 0; render(); focusQ(); scrollTo(0, 0); return; }
  remember(id);
  if (a.kind === 'link') { window.open(a.url, '_blank', 'noopener'); render(); return; }
  openPanel(a);
}
function goUp() { folder = null; q.value = ''; sel = 0; render(); focusQ(); }
function focusQ() { if (!matchMedia('(pointer:coarse)').matches) q.focus(); }

// 목록 클릭
listEl.addEventListener('click', e => {
  const r = e.target.closest('.row'); if (!r) return;
  numReset();
  const i = +r.dataset.i, row = rows[i];
  sel = i; paint(false);
  if (row && row.id && byId[row.id].kind === 'link') { remember(row.id); setTimeout(render, 0); return; } // 기본 동작(새 탭)에 맡김
  e.preventDefault(); activate(i);
});
listEl.addEventListener('contextmenu', e => {
  const r = e.target.closest('.row'); if (!r || !r.dataset.id) return;
  e.preventDefault();
  const a = byId[r.dataset.id];
  const items = [{ label: a.kind === 'link' ? '새 탭에서 열기' : '열기', bold: true, act: () => open(a.id) }];
  if (a.kind === 'frame') items.push({ label: '새 탭에서 열기', act: () => { remember(a.id); window.open(a.url, '_blank', 'noopener'); } });
  if (a.kind === 'link' || a.kind === 'frame') items.push('-', { label: '주소 복사', act: () => copy(new URL(a.url, location.href).href) });
  if (recent.includes(a.id)) items.push('-', { label: '최근 목록에서 빼기', act: () => { recent = recent.filter(x => x !== a.id); ls.set(K_RECENT, JSON.stringify(recent)); render(); } });
  showMenu(e.clientX, e.clientY, items);
});

// 검색창 키
q.addEventListener('input', () => { sel = 0; render(); });
q.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;  // 한글 조합 중
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  if (plain && /^[0-9]$/.test(e.key) && !q.value) { e.preventDefault(); numKey(e.key); return; }
  if (numInterrupt(e)) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); activate(sel); }
  else if (e.key === 'Escape') {
    e.preventDefault();
    if (q.value) { q.value = ''; sel = 0; render(); } else if (folder) goUp();
  }
  else if (e.key === 'Backspace' && !q.value && folder) { e.preventDefault(); goUp(); }
});

// 화면 어디서든: 글자를 치면 검색창으로, ⌘K / Ctrl+K 로 검색창
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('locked')) return;
  if (e.key === 'Escape') {
    if (!ctx.classList.contains('hidden')) { closeMenu(); return; }
    if (!panelEl.classList.contains('hidden')) { e.preventDefault(); closePanel(); return; }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); if (!panelEl.classList.contains('hidden')) closePanel(); q.focus(); q.select(); return;
  }
  if (!panelEl.classList.contains('hidden')) return;
  const t = e.target;
  if (t === q || (t.closest && t.closest('input,textarea,select,[contenteditable],.board'))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key) && !q.value) { e.preventDefault(); numKey(e.key); return; }
  if (numInterrupt(e)) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); q.focus(); move(e.key === 'ArrowDown' ? 1 : -1); return; }
  if (e.key === 'Backspace' && folder && !q.value) { e.preventDefault(); goUp(); return; }
  if (e.key.length === 1 && e.key !== ' ') q.focus();   // 이 글자는 검색창에 들어감
});
$('#home').onclick = e => { e.preventDefault(); closePanel(); goUp(); };

// ─────────── 패널 (포털 안에서 여는 앱) ───────────
const panelEl = $('#panel'), pBody = $('#pBody'), pOut = $('#pOut');
let panelId = null;

function openPanel(a, nasQ) {
  closeMenu();
  if (panelId === 'nas' && a.id === 'nas' && nasQ && nas()) { nas().search(nasQ); return; }
  if (panelId === 'stock' && a.id === 'stock' && nasQ && stk()) { stk().search(nasQ); return; }
  teardown();
  panelId = a.id;
  $('#pTitle').textContent = a.title;
  $('#pCrumb').textContent = a.folder ? `My Rubi / ${byId[a.folder].title}` : 'My Rubi';
  pOut.classList.toggle('hidden', a.kind !== 'frame');
  if (a.kind === 'frame') pOut.href = a.url;
  panelEl.className = 'panel p-' + (a.kind === 'builtin' ? a.id : a.kind);
  document.body.classList.add('panel-open');

  if (a.kind === 'frame') pBody.innerHTML = `<iframe src="${esc(a.url)}" title="${esc(a.title)}"></iframe>`;
  else if (a.kind === 'soon') pBody.innerHTML = `<div class="soon"><span class="tag">준비 중</span><h2>${esc(a.title)}</h2><p>${esc(a.note || '곧 이 자리에서 열립니다.')}</p></div>`;
  else if (a.id === 'nas') { if (nas()) nas().mount(pBody, nasQ || null); }
  else if (a.id === 'stock') { if (stk()) stk().mount(pBody, nasQ || null); }
  else if (a.id === 'checklist') { if (chk()) chk().mount(pBody); }
  else if (a.id === 'settings') settingsView();
  else pBody.innerHTML = '<div class="soon"><p>열 수 없는 항목입니다.</p></div>';

  try { history.replaceState(null, '', '#' + a.id); } catch (e) {}
  const f = panelEl.querySelector('.p-body textarea, .p-body input'); if (f && a.id !== 'settings' && a.id !== 'checklist' && a.id !== 'stock') setTimeout(() => f.focus(), 30);
  else $('#pClose').focus();
}
function teardown() {
  if (panelId === 'nas' && nas()) nas().unmount();
  if (panelId === 'checklist' && chk()) chk().unmount();
  if (panelId === 'stock' && stk()) stk().unmount();
  pBody.innerHTML = '';
  panelId = null;
}
function closePanel() {
  if (panelEl.classList.contains('hidden')) return;
  teardown();
  panelEl.classList.add('hidden');
  document.body.classList.remove('panel-open');
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  render(); focusQ();
}
$('#pClose').onclick = closePanel;
$('#pBack').onclick = closePanel;

function settingsView() {
  const themes = [['dark', '다크'], ['light', '라이트']];
  pBody.innerHTML = `<div class="pane set">
    <h3>화면 색</h3>
    <div class="seg">${themes.map(([k, n]) => `<button data-theme="${k}" aria-pressed="${UI.theme === k}">${n}</button>`).join('')}</div>
    <h3>최근 연 항목</h3>
    <p>처음 화면 검색창 아래에 최근 연 항목이 최대 여섯 개 보입니다.</p>
    <button class="btn" data-act="clear-recent"${recent.length ? '' : ' disabled'}>최근 목록 비우기</button>
    <h3>키보드</h3>
    <p>아무 글자나 치면 검색창으로 갑니다. ↑↓로 고르고 Enter로 열고, 검색창이 비어 있을 때 번호를 치면 그 줄을 바로 엽니다. 10번 이상은 숫자를 이어서 칩니다(1, 2를 연달아 치면 12번). 1처럼 뒤에 숫자가 더 붙을 수 있는 번호는 잠깐 기다렸다가 열리고, 기다리는 동안 Enter를 누르면 바로 열립니다. Esc는 검색어 지우기, 폴더에서 나오기, 열린 앱 닫기 순서로 동작합니다. ⌘K(윈도우는 Ctrl+K)는 어디서든 검색창으로 갑니다.</p>
    <h3>화면 방식</h3>
    <p>아이콘을 끌어 놓고 창을 여러 개 띄우는 윈도우형 화면도 그대로 쓸 수 있습니다.</p>
    <a class="btn" href="/desktop/">윈도우 화면으로 보기</a>
    <p class="hint">화면 색과 최근 목록은 이 브라우저에만 저장됩니다.</p>
  </div>`;
  pBody.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { UI.theme = b.dataset.theme; saveUi(); applyTheme(); settingsView(); });
  const cr = pBody.querySelector('[data-act=clear-recent]');
  cr.onclick = () => { recent = []; ls.set(K_RECENT, '[]'); settingsView(); };
}
$('#btnSettings').onclick = () => openPanel(byId.settings || { id: 'settings', title: '설정', kind: 'builtin' });

// ─────────── 우클릭 메뉴 (NAS, 공지·일정도 같이 씀) ───────────
const ctx = $('#ctx');
function showMenu(x, y, items) {
  ctx.innerHTML = items.map((it, i) => it === '-' ? '<hr>' :
    `<button role="menuitem" data-i="${i}" ${it.disabled ? 'disabled' : ''}><span class="ck">${it.check ? '✓' : ''}</span>${it.bold ? `<b>${esc(it.label)}</b>` : esc(it.label)}</button>`).join('');
  ctx.classList.remove('hidden');
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.max(6, Math.min(x, innerWidth - w - 6)) + 'px';
  ctx.style.top = Math.max(6, Math.min(y, innerHeight - h - 6)) + 'px';
  ctx.querySelectorAll('button').forEach(b => b.onclick = () => { const it = items[b.dataset.i]; closeMenu(); it.act(); });
  const first = ctx.querySelector('button:not(:disabled)'); if (first) first.focus();
}
function closeMenu() { ctx.classList.add('hidden'); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('.ctx')) closeMenu(); });
function copy(t) { try { navigator.clipboard.writeText(t); } catch (e) {} }
window.MYRUBI_DESK = { menu: showMenu, openNas: qq => openPanel(byId.nas, qq) };
if (chk()) chk().onOpen = () => { if (byId.checklist) { remember('checklist'); openPanel(byId.checklist); } };

// ─────────── 시계 ───────────
function tick() {
  const d = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  $('#clock').textContent = hm; $('#date').textContent = date;
  $('#lockT').textContent = hm; $('#lockD').textContent = date;
}

// ─────────── 로그인 ───────────
// config.js 에 GOOGLE_CLIENT_ID 가 있으면 첫 화면이 잠금 화면. 회사 구글 계정으로 로그인하면 Apps Script가 확인 후 30일 세션 발급
const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const lock = $('#lock'), lockMsg = $('#lockMsg');
let gisLoaded = false, justLoggedOut = false;

function setMsg(t, ok) { lockMsg.textContent = t || ''; lockMsg.classList.toggle('ok', !!ok); }
function showLock(msg, ok) {
  closeMenu(); closePanel();
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
  google.accounts.id.renderButton($('#gBtn'), { theme: UI.theme === 'light' ? 'outline' : 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'ko', width: '280' });
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
  if (window.MYRUBI_CAL) window.MYRUBI_CAL.start($('#cal'));
  if (chk()) chk().start($('#checks'));
  renderWho(); render(); focusQ(); openFromUrl();
}
function renderWho() {
  const u = MR && MR.session() ? MR.user() : null;
  $('#who').textContent = u ? u.name : '';
  $('#who').title = u ? u.email : '';
  $('#btnLogout').classList.toggle('hidden', !u);
}
$('#btnLogout').onclick = () => { justLoggedOut = true; MR.logout(); showLock('로그아웃했습니다', true); };

function openFromUrl() {
  const hash = decodeURIComponent(location.hash.slice(1));
  // #checklist/이름 : 그 멤버의 체크리스트 탭으로 바로 열기
  const m = hash.match(/^checklist\/(.+)$/);
  if (m && byId.checklist && chk()) { remember('checklist'); openPanel(byId.checklist); chk().show(m[1]); return; }
  if (hash && byId[hash]) { open(hash); return; }
  const next = new URLSearchParams(location.search).get('next');
  if (next) {
    const a = APPS.find(x => x.kind === 'frame' && x.url && next.startsWith(x.url.split('?')[0]));
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (a) open(a.id);
  }
}

// ─────────── 시작 ───────────
if (window.MYRUBI_BOARD) window.MYRUBI_BOARD.onLayout = null;  // 텍스트 화면은 아이콘 자리 계산이 없음
tick(); setInterval(tick, 10000);
// 이미 열린 포털에 바로가기 주소(#checklist/이름 등)를 붙여 넣었을 때도 열리게
addEventListener('hashchange', () => { if (!document.body.classList.contains('locked')) openFromUrl(); });
if (MR && MR.loginEnabled()) {
  MR.onKick = () => showLock('로그인이 만료되었습니다. 다시 로그인해 주세요');
  addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'myrubi:signedout') MR.onKick(); });
  if (MR.session()) { unlock(false); MR.get({ action: 'me' }).catch(() => {}); }
  else showLock();
} else {
  unlock(false);
}
})();
