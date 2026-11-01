// My Rubi 멤버별 체크리스트
// 멤버마다 탭이 하나씩 있고, 목록은 체크리스트 하나 (매일·매주 반복 묶음은 2026-10-29에 없앰)
// 구글 로그인을 켜면 Apps Script(00_My Rubi Index 시트의 '체크리스트' 탭)에 저장되어 모든 직원이 같은 목록을 봄
// 로그인을 켜기 전에는 이 브라우저에만 저장됨
// 패널(텍스트 화면)과 오른쪽 요약 칸이 같이 씀. 윈도우 화면은 쓰지 않음
// 프로젝트(2026-11): 프로젝트 세부 항목도 이 목록의 줄임 (project 에 프로젝트 ID, 담당은 여러 명).
//  멤버 탭에서는 프로젝트별 묶음으로 보이고, 프로젝트 화면(assets/project.js)은 window.MYRUBI_CHECK 의 data()·run()으로 같은 줄을 씀
//  완료(done)로 옮긴 프로젝트의 항목은 멤버 탭과 요약에서 빠짐
(() => {
'use strict';

const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const K_LOCAL = 'myrubi.checks', K_LOCAL_P = 'myrubi.projects', K_CACHE_BASE = 'myrubi.checks.cache', K_UI = 'myrubi.checks.ui';
/** 공유 PC에서 앞사람의 개인 목록이 보이지 않게 저장 칸을 계정마다 나눔 */
const K_CACHE = () => K_CACHE_BASE + '.' + ((MR && MR.user().email) || '');
try { localStorage.removeItem(K_CACHE_BASE); } catch (e) {}   // 계정 구분 없던 예전 저장 칸 정리
const REPEATS = ['once'];
const REPEAT_NAME = { once: '체크리스트' };
const REPEAT_HINT = { once: '끝낸 항목은 7일 뒤 목록에서 내려갑니다' };
const POLL_MS = 120000;
const ALL = '*';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const stamp = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** 그 날짜가 속한 주의 월요일 */
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00');
  const off = (d.getDay() + 6) % 7;   // 월=0 … 일=6
  d.setDate(d.getDate() - off);
  return ymd(d);
}
/** 로그인한 사람의 멤버 이름. 구글 계정 이름이 멤버 이름과 다르면 config.js 의 MEMBER_ALIASES 로 맞춤 (예: 'Ohyun Kwon' → '권오현') */
function me() {
  const u = MR ? MR.user() : { name: '', email: '' };
  const al = CFG.MEMBER_ALIASES || {};
  return al[u.email] || al[u.name] || u.name || '';
}
const shared = () => !!(MR && MR.loginEnabled() && MR.session());

let items = [];        // { id, owner, owners[], text, repeat, doneAt, doneBy, order, author, createdAt, updatedAt, project, due }
let projects = [];     // { id, name, lead, due, status, memo, order, author, createdAt, updatedAt }
let hide = [];         // 이 계정에 숨길 멤버 (개인 목록, 서버가 알려줌)
const subs = [];       // 목록이 바뀔 때 다시 그릴 화면 (project.js)
let msg = '', busy = false, started = false, editing = null;
let host = null;       // 패널에 붙은 루트 요소
let summaryEl = null;  // 오른쪽 요약 칸
const ui = Object.assign({ tab: '' }, readJson(K_UI, {}));
const saveUi = () => ls.set(K_UI, JSON.stringify(ui));

// ─────────── 계산 ───────────
/** 오늘 기준으로 끝난 항목인지 */
function isDone(it) {
  if (!it.doneAt) return false;
  const d = String(it.doneAt).slice(0, 10);
  if (it.repeat === 'daily') return d === today();
  if (it.repeat === 'weekly') return weekStart(d) === weekStart(today());
  return true;
}
/** 멤버 이름 목록: config.js 의 MEMBERS → 항목의 담당자 → 로그인한 사람 순서 */
function members() {
  const out = [];
  const add = n => { n = String(n || '').trim(); if (n && !out.includes(n)) out.push(n); };
  (CFG.MEMBERS || []).forEach(add);
  items.forEach(it => it.owners.forEach(add));
  // MEMBERS 를 적어 두면 그 명단으로 고정. 비어 있을 때만 로그인한 사람을 자동으로 더함
  if (!(CFG.MEMBERS || []).length) add(me());
  // 다른 사람의 개인 목록은 탭도 보이지 않음
  return out.filter(n => !hide.includes(n));
}
/** 프로젝트 화면에서 담당으로 고를 수 있는 멤버: 개인 목록 멤버도 포함 (프로젝트 항목은 모두에게 공개) */
function allMembers() {
  const out = [];
  const add = n => { n = String(n || '').trim(); if (n && !out.includes(n)) out.push(n); };
  (CFG.MEMBERS || []).forEach(add);
  items.forEach(it => it.owners.forEach(add));
  if (!(CFG.MEMBERS || []).length) add(me());
  return out;
}
const alias = n => (CFG.MEMBER_ALIASES || {})[n] || n;
const splitOwners = v => { const out = []; String(v || '').split(/\s*,\s*/).forEach(n => { n = alias(n.trim()); if (n && !out.includes(n)) out.push(n); }); return out; };
/** 예전에 구글 계정 이름으로 들어간 항목도 멤버 이름으로 보이게. 담당은 쉼표로 여러 명 */
const fix = list => (list || []).map(it => {
  const owners = splitOwners(it.owner);
  return Object.assign({}, it, { owners, owner: owners.join(', '), doneBy: alias(it.doneBy), repeat: 'once', project: it.project || '', due: it.due || '' });
});
const fixP = list => (list || []).map(p => Object.assign({}, p, { lead: alias(p.lead || ''), status: p.status || 'active', order: +p.order || 0 }));
const projOf = id => projects.find(p => p.id === id);
/** 멤버 탭·요약에 보일 항목인지: 개인 항목, 또는 완료로 옮기지 않은 프로젝트의 항목 */
const live = it => !it.project || (projOf(it.project) && projOf(it.project).status !== 'done');
const ofMember = name => items.filter(it => it.owners.includes(name) && live(it));
/** 보이는 멤버 중 누구라도 담당인 항목 (전체 탭 진행률용) */
const visible = () => items.filter(it => live(it) && it.owners.some(o => !hide.includes(o)));
const sortProjects = list => list.slice().sort((a, b) => (a.order - b.order) || String(a.createdAt).localeCompare(String(b.createdAt)));
function progress(list) {
  // 할 일은 끝낸 지 7일이 지나면 안 세고, 반복 항목은 전부 셈
  const live = list.filter(it => it.repeat !== 'once' || !isDone(it) || daysSince(it.doneAt) < 7);
  const done = live.filter(isDone).length;
  return { done, total: live.length, left: live.length - done };
}
function daysSince(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 999;
  return Math.round((new Date(today() + 'T00:00') - new Date(`${m[1]}-${m[2]}-${m[3]}T00:00`)) / 864e5);
}
function fmtDone(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/);
  if (!m) return '';
  const d = daysSince(s);
  const day = d === 0 ? '오늘' : d === 1 ? '어제' : `${+m[2]}/${+m[3]}`;
  return day + (m[4] ? ' ' + m[4] : '');
}
function currentTab() {
  const ms = members();
  if (ui.tab === ALL) return ALL;
  if (ms.includes(ui.tab)) return ui.tab;
  return ms.includes(me()) ? me() : (ms[0] || ALL);
}

// ─────────── 패널 ───────────
function syncHash() {
  if (!host) return;
  const tab = currentTab();
  try { history.replaceState(null, '', '#checklist' + (tab === ALL ? '' : '/' + encodeURIComponent(tab))); } catch (e) {}
}
/** 지금 탭의 바로가기 주소 */
function shortcut(tab) { return location.origin + '/#checklist' + (tab === ALL ? '' : '/' + encodeURIComponent(tab)); }

function render() {
  subs.forEach(fn => { try { fn(); } catch (e) {} });
  renderSummary();
  if (!host) return;
  syncHash();
  const ms = members(), tab = currentTab();
  const tabs = [ALL, ...ms].map(n => {
    const p = n === ALL ? progress(visible()) : progress(ofMember(n));
    return `<button class="ck-tab" role="tab" data-tab="${esc(n)}" aria-selected="${tab === n}">
      <span class="nm">${n === ALL ? '전체' : esc(n)}</span><span class="ct">${p.done}/${p.total}</span></button>`;
  }).join('');
  const addMember = `<form class="ck-tab ck-newm" id="ckNewMember" autocomplete="off" title="멤버 추가">
    <input name="name" placeholder="+ 멤버" aria-label="새 멤버 이름" maxlength="20"></form>
    <button class="ck-tab ck-link" data-copy="${esc(shortcut(tab))}" title="${esc(shortcut(tab))}">바로가기 복사</button>`;
  let body = tab === ALL ? overviewHtml(ms) : memberHtml(tab);
  const foot = msg ? `<p class="ck-msg err" role="status">${esc(msg)}</p>`
    : !shared() ? '<p class="ck-msg">이 브라우저에만 저장됩니다</p>' : '';
  host.innerHTML = `<div class="ck">
    <div class="ck-tabs" role="tablist" aria-label="멤버">${tabs}${addMember}</div>
    <div class="ck-body">${body}</div>${foot}</div>`;
}

function overviewHtml(ms) {
  if (!ms.length) return '<div class="ck-empty"><p>아직 멤버가 없습니다.</p><p>위 탭의 “+ 멤버”에 이름을 넣고 Enter를 누르면 그 사람의 체크리스트가 생깁니다. config.js 의 MEMBERS 에 적어 두면 항상 같은 순서로 보입니다.</p></div>';
  const d = new Date();
  const head = `<p class="ck-date">${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} 기준</p>`;
  return head + '<div class="ck-over">' + ms.map(n => {
    const list = ofMember(n);
    const groups = REPEATS.map(r => {
      // 끝낸 지 7일이 안 된 항목까지 셈 (다 끝냈을 때 '모두 끝냄'으로 보이게)
      const g = list.filter(it => it.repeat === r && (!isDone(it) || daysSince(it.doneAt) < 7));
      if (!g.length) return '';
      const left = g.filter(it => !isDone(it));
      return `<li><span class="tx">${left.length ? left.slice(0, 4).map(it => esc(it.text)).join(' · ') + (left.length > 4 ? ` 외 ${left.length - 4}` : '') : '<s>모두 끝냄</s>'}</span><span class="ct">${g.length - left.length}/${g.length}</span></li>`;
    }).join('');
    const p = progress(list);
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<section class="ck-card" data-open="${esc(n)}" tabindex="0" role="button" aria-label="${esc(n)} 체크리스트 열기">
      <header><h3>${esc(n)}</h3><span class="ct">${p.total ? `${p.done}/${p.total}` : '항목 없음'}</span></header>
      <div class="ck-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      ${groups ? `<ul>${groups}</ul>` : '<p class="ck-none">아직 항목이 없습니다</p>'}
    </section>`;
  }).join('') + '</div>';
}

const byOrder = (a, b) => (a.order - b.order) || String(a.createdAt).localeCompare(String(b.createdAt));
/** 끝낸 지 7일이 안 된 항목까지, 끝낸 것은 아래로 */
const rowsOf = g => g.filter(it => !isDone(it) || daysSince(it.doneAt) < 7)
  .sort((a, b) => (isDone(a) !== isDone(b)) ? (isDone(a) ? 1 : -1) : byOrder(a, b));

function memberHtml(name) {
  const list = ofMember(name);
  const own = REPEATS.map(r => {
    const g = rowsOf(list.filter(it => !it.project && it.repeat === r));
    const done = g.filter(isDone).length;
    return `<section class="ck-group" data-repeat="${r}">
      <h2 class="sec-h ko"><span>${REPEAT_NAME[r]}<small>${REPEAT_HINT[r]}</small></span><span class="n">${g.length ? `${done}/${g.length}` : ''}</span></h2>
      <ol class="ck-rows">${g.map(it => itemHtml(it, name)).join('')}</ol>
      <form class="ck-add" data-repeat="${r}" autocomplete="off">
        <span class="box" aria-hidden="true"></span>
        <input name="text" placeholder="${r === 'once' ? '할 일 추가' : REPEAT_NAME[r] + ' 할 일 추가'}" aria-label="${REPEAT_NAME[r]} 항목 추가" maxlength="200" enterkeyhint="done">
      </form>
    </section>`;
  }).join('');
  // 이 멤버가 담당인 프로젝트 항목: 프로젝트마다 한 묶음
  const pjs = sortProjects(projects.filter(p => p.status !== 'done' && list.some(it => it.project === p.id)));
  const pj = pjs.map(p => {
    const g = rowsOf(list.filter(it => it.project === p.id));
    const all = list.filter(it => it.project === p.id);
    const done = all.filter(isDone).length;
    const sub = ['프로젝트', p.status === 'hold' ? '보류' : '', p.due ? '마감 ' + fmtDay(p.due) : ''].filter(Boolean).join(' · ');
    return `<section class="ck-group ck-pgroup" data-project="${esc(p.id)}">
      <h2 class="sec-h ko"><span><button class="ck-plink" data-proj="${esc(p.id)}" title="프로젝트 열기">${esc(p.name)} <i aria-hidden="true">→</i></button><small>${esc(sub)}</small></span><span class="n">${done}/${all.length}</span></h2>
      <ol class="ck-rows">${g.map(it => itemHtml(it, name)).join('')}</ol>
      <form class="ck-add" data-project="${esc(p.id)}" autocomplete="off">
        <span class="box" aria-hidden="true"></span>
        <input name="text" placeholder="이 프로젝트에 할 일 추가" aria-label="${esc(p.name)} 프로젝트에 할 일 추가" maxlength="200" enterkeyhint="done">
      </form>
    </section>`;
  }).join('');
  return own + pj;
}
function fmtDay(s) { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; }

function itemHtml(it, ctx) {
  const done = isDone(it);
  if (editing === it.id) {
    return `<li class="ck-row edit"><form class="ck-edit" data-id="${esc(it.id)}" autocomplete="off">
      <input name="text" value="${esc(it.text)}" aria-label="내용" maxlength="200">
      <input type="hidden" name="repeat" value="once">
      <select name="owner" aria-label="담당">${members().map(m => `<option${it.owner === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <button type="submit" class="pri">저장</button><button type="button" data-a="cancel">취소</button>
    </form></li>`;
  }
  const others = it.owners.filter(o => o !== ctx);
  const by = done ? [fmtDone(it.doneAt), it.doneBy && it.doneBy !== ctx ? it.doneBy : ''].filter(Boolean).join(' · ')
    : (it.project && others.length ? '함께 ' + others.join(', ') : '');
  return `<li class="ck-row${done ? ' done' : ''}" data-id="${esc(it.id)}">
    <label class="ck-chk"><input type="checkbox" data-toggle="${esc(it.id)}"${done ? ' checked' : ''}${busy ? ' disabled' : ''} aria-label="${esc(it.text)}"><span class="box" aria-hidden="true"></span></label>
    <span class="tx">${esc(it.text)}</span>
    <span class="mt">${esc(by)}</span>
    <button class="ck-more" data-more="${esc(it.id)}" aria-label="더 보기" title="${it.project ? '끝냄 표시, 프로젝트 열기' : '고치기, 옮기기, 지우기'}">···</button>
  </li>`;
}

// ─────────── 오른쪽 요약 ───────────
function renderSummary() {
  if (!summaryEl) return;
  const ms = members();
  if (!started || !ms.length) { summaryEl.classList.add('hidden'); return; }
  summaryEl.classList.remove('hidden');
  const rows = ms.map(n => {
    const p = progress(ofMember(n));
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<button class="cs-row${p.total && !p.left ? ' ok' : ''}" data-open="${esc(n)}">
      <span class="nm">${esc(n)}</span><span class="ct">${p.total ? (p.left ? `${p.left}개 남음` : '끝') : '없음'}</span>
      <span class="ck-bar" aria-hidden="true"><i style="width:${pct}%"></i></span></button>`;
  }).join('');
  summaryEl.innerHTML = `<p class="kicker"><button data-open="${ALL}">Checklist</button></p>${rows}`;
}

// ─────────── 저장 ───────────
const readLocal = () => fix(readJson(K_LOCAL, []));
const writeLocal = () => ls.set(K_LOCAL, JSON.stringify(items));
const readLocalP = () => fixP(readJson(K_LOCAL_P, []));
const writeLocalP = () => ls.set(K_LOCAL_P, JSON.stringify(projects));
const saveCache = () => ls.set(K_CACHE(), JSON.stringify({ items, projects, hide }));

async function load() {
  if (!shared()) { items = readLocal(); projects = readLocalP(); if (!editing) render(); return; }
  try {
    const j = await MR.get({ action: 'checks' });
    items = fix(j.checks); projects = fixP(j.projects); hide = j.hide || [];
    saveCache();
    msg = '';
  } catch (e) {
    msg = /unknown action/.test(e.message)
      ? 'Apps Script를 새 버전으로 배포해야 체크리스트가 공유됩니다'
      : '체크리스트를 불러오지 못했습니다. ' + e.message;
  }
  if (!editing) render();
}

/** 체크리스트 항목 op: add / update / delete / toggle */
async function persist(op, d) {
  const owners = d.owners ? d.owners.slice() : splitOwners(d.owner);
  const fields = { id: d.id, owner: owners.join(', '), owners, text: d.text, repeat: d.repeat || 'once', order: d.order, project: d.project || '', due: d.due || '' };
  if (shared()) {
    const j = await MR.post(Object.assign({ action: 'check', op }, fields, op === 'toggle' ? { done: !!d.done } : {}));
    items = fix(j.checks); projects = fixP(j.projects); hide = j.hide || [];
    saveCache();
    return;
  }
  const who = me() || owners[0];
  if (op === 'add') items.push(Object.assign(fields, { id: 'l' + Date.now().toString(36), doneAt: '', doneBy: '', author: who, createdAt: stamp(), updatedAt: '' }));
  else if (op === 'update') { const it = items.find(x => x.id === d.id); if (it) Object.assign(it, fields, { updatedAt: stamp() }); }
  else if (op === 'toggle') { const it = items.find(x => x.id === d.id); if (it) { it.doneAt = d.done ? stamp() : ''; it.doneBy = d.done ? who : ''; } }
  else if (op === 'delete') items = items.filter(x => x.id !== d.id);
  writeLocal();
}
/** 프로젝트 op: add / update / delete. 지우면 그 프로젝트 항목도 지움. add 는 새 프로젝트 ID를 돌려줌 */
async function persistProject(op, d) {
  const fields = { id: d.id, name: d.name, lead: d.lead || '', due: d.due || '', status: d.status || 'active', memo: d.memo || '', order: d.order || 0 };
  if (shared()) {
    const j = await MR.post(Object.assign({ action: 'project', op }, fields));
    items = fix(j.checks); projects = fixP(j.projects); hide = j.hide || [];
    saveCache();
    return j.saved || d.id;
  }
  let id = d.id;
  if (op === 'add') { id = 'lp' + Date.now().toString(36); projects.push(Object.assign(fields, { id, author: me(), createdAt: stamp(), updatedAt: '' })); }
  else if (op === 'update') { const p = projOf(d.id); if (p) Object.assign(p, fields, { updatedAt: stamp() }); }
  else if (op === 'delete') { projects = projects.filter(p => p.id !== d.id); items = items.filter(it => it.project !== d.id); writeLocal(); }
  writeLocalP();
  return id;
}
/** kind: 'check' | 'project'. 저장 중에는 busy, 실패하면 msg 에 남기고 false */
async function run(op, d, kind) {
  busy = true; msg = ''; render();
  let out = true;
  try { out = kind === 'project' ? await persistProject(op, d) : (await persist(op, d), true); }
  catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 프로젝트를 저장할 수 있습니다' : '저장하지 못했습니다. ' + e.message;
    out = false;
  }
  busy = false; render();
  return out;
}
function nextOrder(owner, repeat) {
  return items.filter(it => !it.project && it.owner === owner && it.repeat === repeat).reduce((m, it) => Math.max(m, +it.order || 0), 0) + 1;
}
function nextProjectOrder(pid) {
  return items.filter(it => it.project === pid).reduce((m, it) => Math.max(m, +it.order || 0), 0) + 1;
}

// ─────────── 조작 ───────────
function bind() {
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  host.addEventListener('submit', onSubmit);
  host.addEventListener('keydown', onKey);
  host.addEventListener('contextmenu', onContext);
}
/** 패널 본문(#pBody)은 프로젝트·NAS 등 다른 앱과 같이 쓰므로, 닫을 때 반드시 떼어 냄
 *  (남아 있으면 다른 앱의 클릭·입력을 체크리스트가 가로챔) */
function unbind() {
  if (!host) return;
  host.removeEventListener('click', onClick);
  host.removeEventListener('change', onChange);
  host.removeEventListener('submit', onSubmit);
  host.removeEventListener('keydown', onKey);
  host.removeEventListener('contextmenu', onContext);
}
function onClick(e) {
  if (!host || !host.querySelector('.ck:not(.pj)')) return;
  const t = e.target.closest('[data-tab]');
  if (t) { ui.tab = t.dataset.tab; saveUi(); editing = null; render(); return; }
  const o = e.target.closest('[data-open]');
  if (o) { ui.tab = o.dataset.open; saveUi(); editing = null; render(); return; }
  const pl = e.target.closest('[data-proj]');
  if (pl) { openProject(pl.dataset.proj); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    try { navigator.clipboard.writeText(cp.dataset.copy); } catch (err) {}
    cp.textContent = '복사됨'; setTimeout(() => { cp.textContent = '바로가기 복사'; }, 1200);
    return;
  }
  const m = e.target.closest('[data-more]');
  if (m) { const r = m.getBoundingClientRect(); itemMenu(m.dataset.more, r.left, r.bottom + 4); return; }
  const c = e.target.closest('[data-a=cancel]');
  if (c) { editing = null; render(); }
}
function onChange(e) {
  if (!host || !host.querySelector('.ck:not(.pj)')) return;
  const cb = e.target.closest('[data-toggle]');
  if (!cb || busy) return;
  const it = items.find(x => x.id === cb.dataset.toggle); if (!it) return;
  run('toggle', { id: it.id, done: cb.checked });
}
function onSubmit(e) {
  if (!host || !host.querySelector('.ck:not(.pj)')) return;
  e.preventDefault();
  const f = e.target;
  if (f.id === 'ckNewMember') {
    const name = f.elements.name.value.trim(); if (!name) return;
    if (!members().includes(name) && !(CFG.MEMBERS || []).includes(name)) {
      // 항목이 생기기 전까지는 탭만 보이게 임시로 기억
      CFG.MEMBERS = (CFG.MEMBERS || []).concat(name);
    }
    ui.tab = name; saveUi(); render();
    const inp = host.querySelector('.ck-add input'); if (inp) inp.focus();
    return;
  }
  if (f.classList.contains('ck-add') && f.dataset.project) {
    const text = f.elements.text.value.trim(); if (!text || busy) return;
    const owner = currentTab(); if (owner === ALL) return;
    const pid = f.dataset.project;
    f.elements.text.value = '';
    run('add', { owners: [owner], text, project: pid, order: nextProjectOrder(pid) }).then(() => {
      const again = host && host.querySelector(`.ck-add[data-project="${pid}"] input`); if (again) again.focus();
    });
    return;
  }
  if (f.classList.contains('ck-add')) {
    const text = f.elements.text.value.trim(); if (!text || busy) return;
    const owner = currentTab(); if (owner === ALL) return;
    const repeat = f.dataset.repeat;
    f.elements.text.value = '';
    run('add', { owner, text, repeat, order: nextOrder(owner, repeat) }).then(() => {
      const again = host.querySelector(`.ck-add[data-repeat="${repeat}"] input`); if (again) again.focus();
    });
    return;
  }
  if (f.classList.contains('ck-edit')) {
    const it = items.find(x => x.id === f.dataset.id); if (!it || busy) return;
    const text = f.elements.text.value.trim(); if (!text) return;
    editing = null;
    run('update', { id: it.id, owner: f.elements.owner.value, text, repeat: f.elements.repeat.value, order: it.order });
  }
}
function onKey(e) {
  if (!host || !host.querySelector('.ck:not(.pj)')) return;
  if (e.key === 'Escape' && editing) { e.stopPropagation(); editing = null; render(); return; }
  if (e.key === 'Escape' && e.target.matches('input') && e.target.value) { e.stopPropagation(); e.target.value = ''; return; }
  const card = e.target.closest('.ck-card[data-open]');
  if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ui.tab = card.dataset.open; saveUi(); render(); }
}
function onContext(e) {
  if (!host || !host.querySelector('.ck:not(.pj)')) return;
  if (e.target.closest('input,select,textarea')) return;
  const row = e.target.closest('.ck-row[data-id]'); if (!row) return;
  e.preventDefault(); e.stopPropagation();
  itemMenu(row.dataset.id, e.clientX, e.clientY);
}
function itemMenu(id, x, y) {
  const D = window.MYRUBI_DESK; if (!D) return;
  const it = items.find(z => z.id === id); if (!it) return;
  const done = isDone(it);
  if (it.project) {
    // 프로젝트 항목은 고치기·담당 바꾸기·지우기를 프로젝트 화면에서
    D.menu(x, y, [
      { label: done ? '다시 해야 함으로' : '끝냄으로 표시', bold: true, act: () => run('toggle', { id, done: !done }) },
      { label: '프로젝트에서 열기', act: () => openProject(it.project) },
    ]);
    return;
  }
  const siblings = items.filter(z => !z.project && z.owner === it.owner && z.repeat === it.repeat).sort((a, b) => (a.order - b.order) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const i = siblings.indexOf(it);
  const swap = async (j) => {
    if (!siblings[j]) return;
    // 번호를 1부터 다시 매긴 뒤 두 줄을 맞바꿈. 바뀐 줄만 저장
    const ord = siblings.map((_, k) => k + 1);
    [ord[i], ord[j]] = [ord[j], ord[i]];
    busy = true; render();
    try {
      for (let k = 0; k < siblings.length; k++) {
        if (+siblings[k].order !== ord[k]) await persist('update', Object.assign({}, siblings[k], { order: ord[k] }));
      }
    } catch (err) { msg = '저장하지 못했습니다. ' + err.message; }
    busy = false; render();
  };
  const moveTo = r => () => run('update', Object.assign({}, it, { repeat: r, order: nextOrder(it.owner, r) }));
  const others = members().filter(m => m !== it.owner);
  D.menu(x, y, [
    { label: done ? '다시 해야 함으로' : '끝냄으로 표시', bold: true, act: () => run('toggle', { id, done: !done }) },
    { label: '고치기', act: () => { editing = id; render(); const f = host.querySelector('.ck-edit input'); if (f) { f.focus(); f.select(); } } },
    '-',
    { label: '위로', disabled: i <= 0, act: () => swap(i - 1) },
    { label: '아래로', disabled: i >= siblings.length - 1, act: () => swap(i + 1) },
    '-',
    ...REPEATS.filter(r => r !== it.repeat).map(r => ({ label: `${REPEAT_NAME[r]}로 옮기기`, act: moveTo(r) })),
    ...(others.length ? ['-', ...others.slice(0, 6).map(m => ({ label: `${m}에게 넘기기`, act: () => run('update', Object.assign({}, it, { owner: m, owners: [m], order: nextOrder(m, it.repeat) })) }))] : []),
    '-',
    { label: '지우기', act: () => { if (confirm(shared() ? `“${it.text}”를 지울까요? 모든 직원 화면에서 사라집니다.` : `“${it.text}”를 지울까요?`)) run('delete', { id }); } },
  ]);
}

function openProject(pid) {
  if (typeof window.MYRUBI_CHECK.onProject === 'function') window.MYRUBI_CHECK.onProject(pid);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && started && shared() && !editing) load(); });
setInterval(() => { if (!document.hidden && started && shared() && !editing && !busy) load(); }, POLL_MS);

// ─────────── 공개 ───────────
window.MYRUBI_CHECK = {
  /** 화면이 열릴 때(로그인 후) 호출. 오른쪽 요약 칸을 그리고 목록을 불러옴 */
  start(summary) {
    summaryEl = summary || summaryEl;
    if (summaryEl && !summaryEl.dataset.bound) {
      summaryEl.dataset.bound = '1';
      summaryEl.addEventListener('click', e => {
        const o = e.target.closest('[data-open]'); if (!o) return;
        ui.tab = o.dataset.open; saveUi();
        if (typeof window.MYRUBI_CHECK.onOpen === 'function') window.MYRUBI_CHECK.onOpen();
      });
    }
    started = true; editing = null; msg = '';
    if (shared()) {
      // 서버가 알려주기 전까지는 개인 목록 멤버를 일단 숨겨 둠 (본인이면 불러온 뒤 바로 보임)
      const c = readJson(K_CACHE(), null);
      items = fix(c && c.items); projects = fixP(c && c.projects); hide = c && c.hide ? c.hide : (CFG.PRIVATE_MEMBERS || []).filter(n => n !== me());
    } else { items = readLocal(); projects = readLocalP(); hide = []; }
    render(); load();
  },
  /** 패널 안에 붙이기. tab 을 주면 그 멤버 탭으로 */
  mount(el, tab) {
    host = el; editing = null;
    if (tab) { ui.tab = tab; saveUi(); }
    bind(); render();
    if (started) load();
    const first = host.querySelector('.ck-add input'); if (first && !matchMedia('(pointer:coarse)').matches) first.focus();
  },
  unmount() { unbind(); host = null; editing = null; },
  /** 그 멤버 탭을 보여줌 (주소 #checklist/이름 으로 들어왔을 때) */
  show(tab) { if (tab) { ui.tab = tab; saveUi(); } if (host) render(); },
  shortcut,
  progress(name) { return progress(name ? ofMember(name) : visible()); },
  members,
  /** 프로젝트 화면(project.js)용 */
  allMembers,
  me,
  isDone,
  fmtDone,
  data() { return { items, projects, hide, busy, msg, shared: shared(), started }; },
  run,
  nextProjectOrder,
  /** 목록이 바뀌거나 저장 중 상태가 바뀔 때마다 fn 호출 */
  subscribe(fn) { if (!subs.includes(fn)) subs.push(fn); },
  /** 지금 화면을 새로 불러옴 */
  reload() { if (started) load(); },
  /** 요약 칸에서 이름을 눌렀을 때 패널을 여는 함수 (shell.js 가 넣음) */
  onOpen: null,
  /** 프로젝트 이름을 눌렀을 때 프로젝트 패널을 여는 함수 (shell.js 가 넣음) */
  onProject: null,
};
})();
