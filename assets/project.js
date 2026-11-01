// My Rubi 프로젝트
// 프로젝트 목록 → 프로젝트 하나를 열면 세부 항목. 세부 항목은 체크리스트의 줄이라서 담당 멤버의 체크리스트에도 그대로 보임
// 데이터는 assets/checklist.js(window.MYRUBI_CHECK)가 불러오고 저장함. 이 파일은 화면만 그림
// 프로젝트와 그 항목은 모든 직원에게 공개 (권오현·권오륜의 개인 항목 숨김과 별개)
// 담당은 여러 명. 끝냄은 항목 하나에 한 번 (담당 중 누가 체크해도 모두에게 끝남으로 보임)
(() => {
'use strict';

const C = () => window.MYRUBI_CHECK;
const K_UI = 'myrubi.projects.ui';
const ALL = '*';
const STATUS = { active: '진행 중', hold: '보류', done: '완료' };
const STATUS_ORDER = ['active', 'hold', 'done'];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = s => { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };
/** 마감까지 남은 날 (지나면 음수) */
const daysLeft = s => Math.round((new Date(s + 'T00:00') - new Date(ymd(new Date()) + 'T00:00')) / 864e5);
function dueLabel(s, closed) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return { t: '', late: false };
  if (closed) return { t: '마감 ' + fmtDay(s), late: false };
  const d = daysLeft(s);
  return { t: `${fmtDay(s)} · ${d === 0 ? 'D-day' : d > 0 ? 'D-' + d : -d + '일 지남'}`, late: d < 0 };
}

let host = null, summaryEl = null, bound = false;
let pid = null;            // 열려 있는 프로젝트 (없으면 목록)
let editItem = null;       // 고치는 중인 항목 id
let editProj = false;      // 프로젝트 정보 고치는 중
let editPick = [];         // 항목 고치기의 담당
let draft = '';            // 항목 추가 칸에 적던 글 (다시 그려도 남게)
let localMsg = '';
const ui = Object.assign({ filter: {}, pick: {} }, (() => { try { return JSON.parse(ls.get(K_UI)) || {}; } catch (e) { return {}; } })());
const saveUi = () => ls.set(K_UI, JSON.stringify(ui));

// ─────────── 데이터 ───────────
const D = () => C() ? C().data() : { items: [], projects: [], hide: [], busy: false, msg: '', shared: false, started: false };
const done = it => C().isDone(it);
const byOrder = (a, b) => (a.order - b.order) || String(a.createdAt).localeCompare(String(b.createdAt));
const itemsOf = id => D().items.filter(it => it.project === id).sort(byOrder);
const projOf = id => D().projects.find(p => p.id === id);
function stat(id) {
  const l = itemsOf(id), d = l.filter(done).length;
  return { done: d, total: l.length, left: l.length - d, pct: l.length ? Math.round(d / l.length * 100) : 0 };
}
/** 정렬: 마감일 있는 것 먼저(가까운 순), 그다음 만든 순 */
const sortP = list => list.slice().sort((a, b) => {
  if (!!a.due !== !!b.due) return a.due ? -1 : 1;
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  return byOrder(a, b);
});
const members = () => C() ? C().allMembers() : [];
const busy = () => D().busy;
const run = (op, d, kind) => C().run(op, d, kind);

// ─────────── 화면 ───────────
function syncHash() {
  if (!host) return;
  try { history.replaceState(null, '', '#project' + (pid ? '/' + encodeURIComponent(pid) : '')); } catch (e) {}
}

function render() {
  renderSummary();
  if (!host) return;
  if (pid && !projOf(pid) && D().started && !busy()) { pid = null; editProj = false; editItem = null; }
  syncHash();
  // 추가 칸에 쓰던 중이면 다시 그린 뒤 커서 자리를 되살림
  const ae = document.activeElement;
  const refocus = ae && host.contains(ae) && ae.name === 'text' && ae.closest('.pj-addf') ? ae.selectionStart : null;
  const d = D();
  const body = pid ? detailHtml(projOf(pid)) : listHtml();
  const m = localMsg || d.msg;
  const foot = m ? `<p class="ck-msg err" role="status">${esc(m)}</p>` : !d.shared ? '<p class="ck-msg">이 브라우저에만 저장됩니다</p>' : '';
  host.innerHTML = `<div class="ck pj"><div class="ck-body">${body}</div>${foot}</div>`;
  if (refocus != null) {
    const inp = host.querySelector('.pj-addf input[name=text]');
    if (inp) { inp.focus(); try { inp.setSelectionRange(refocus, refocus); } catch (e) {} }
  }
}

function listHtml() {
  const ps = D().projects;
  const secs = STATUS_ORDER.map(st => {
    const list = sortP(ps.filter(p => p.status === st));
    if (!list.length && st !== 'active') return '';
    const rows = list.map(p => {
      const s = stat(p.id), du = dueLabel(p.due, st === 'done');
      return `<li><button class="pj-row" data-open="${esc(p.id)}">
        <span class="nm">${esc(p.name)}</span>
        <span class="ld">${esc(p.lead)}</span>
        <span class="du${du.late ? ' late' : ''}">${esc(du.t)}</span>
        <span class="ct">${s.total ? `${s.done}/${s.total}` : '항목 없음'}</span>
        <span class="ck-bar" aria-hidden="true"><i style="width:${s.pct}%"></i></span>
      </button></li>`;
    }).join('');
    const add = st === 'active' ? `<form class="ck-add pj-newp" autocomplete="off">
        <span class="box" aria-hidden="true"></span>
        <input name="name" placeholder="새 프로젝트 이름" aria-label="새 프로젝트 이름" maxlength="60" enterkeyhint="done">
      </form>` : '';
    return `<section class="ck-group pj-sec" data-status="${st}">
      <h2 class="sec-h ko"><span>${STATUS[st]}</span><span class="n">${list.length || ''}</span></h2>
      ${list.length ? `<ol class="pj-rows">${rows}</ol>` : '<p class="ck-none">진행 중인 프로젝트가 없습니다. 아래에 이름을 적고 Enter를 누르면 만들어집니다.</p>'}
      ${add}
    </section>`;
  }).join('');
  return secs;
}

function pickHtml(sel, attr) {
  return `<div class="pj-pick" role="group" aria-label="담당">${members().map(m =>
    `<button type="button" ${attr}="${esc(m)}" aria-pressed="${sel.includes(m)}">${esc(m)}</button>`).join('')}</div>`;
}
/** 추가 칸의 담당: 멤버 거르기를 골라 두었으면 그 사람, 아니면 마지막으로 고른 사람들, 처음이면 나 */
function addPick() {
  const f = ui.filter[pid];
  if (f && f !== ALL) return [f];
  // 한 번이라도 골랐으면 (모두 뺀 상태 포함) 그대로
  if (Array.isArray(ui.pick[pid])) return ui.pick[pid].filter(m => members().includes(m));
  const me = C().me();
  return members().includes(me) ? [me] : [];
}

function detailHtml(p) {
  if (!p) return '<p class="ck-none">프로젝트를 불러오는 중입니다.</p>';
  const s = stat(p.id), closed = p.status === 'done', du = dueLabel(p.due, closed);
  const all = itemsOf(p.id);
  const inProj = members().filter(m => all.some(it => it.owners.includes(m)));
  const filter = inProj.includes(ui.filter[p.id]) ? ui.filter[p.id] : ALL;
  const shown = (filter === ALL ? all : all.filter(it => it.owners.includes(filter)))
    .sort((a, b) => (done(a) !== done(b)) ? (done(a) ? 1 : -1) : byOrder(a, b));
  const meta = [STATUS[p.status], p.lead ? '책임 ' + p.lead : '', du.t ? `<span class="${du.late ? 'late' : ''}">마감 ${esc(du.t)}</span>` : '', s.total ? `${s.done}/${s.total} 끝냄` : '']
    .filter(Boolean).map(x => x.startsWith('<') ? x : esc(x)).join('<i class="dot">·</i>');

  const head = `<div class="pj-head">
    <button class="pj-back" data-back><span aria-hidden="true">←</span> 프로젝트 목록</button>
    <div class="pj-ttl"><h2>${esc(p.name)}</h2>${editProj ? '' : '<button class="pj-btn" data-pedit>고치기</button>'}</div>
    <p class="pj-meta">${meta}</p>
    ${p.memo && !editProj ? `<p class="pj-memo">${esc(p.memo)}</p>` : ''}
    <span class="ck-bar pj-bar" aria-hidden="true"><i style="width:${s.pct}%"></i></span>
  </div>`;

  const form = editProj ? `<form class="pj-form" autocomplete="off">
    <label><span>이름</span><input name="name" value="${esc(p.name)}" maxlength="60" required></label>
    <label><span>책임자</span><select name="lead"><option value="">없음</option>${members().map(m => `<option${p.lead === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label><span>마감일</span><input type="date" name="due" value="${esc(p.due)}"></label>
    <label><span>상태</span><select name="status">${STATUS_ORDER.map(k => `<option value="${k}"${p.status === k ? ' selected' : ''}>${STATUS[k]}</option>`).join('')}</select></label>
    <label class="wide"><span>메모</span><textarea name="memo" rows="3" maxlength="1000">${esc(p.memo)}</textarea></label>
    <div class="pj-fbtn"><button type="submit" class="pri">저장</button><button type="button" data-pcancel>취소</button><button type="button" class="danger" data-pdel>프로젝트 지우기</button></div>
  </form>` : '';

  const tabs = inProj.length > 1 ? `<div class="ck-tabs pj-filter" role="tablist" aria-label="담당 멤버로 거르기">${[ALL, ...inProj].map(m => {
    const l = m === ALL ? all : all.filter(it => it.owners.includes(m));
    return `<button class="ck-tab" role="tab" data-filter="${esc(m)}" aria-selected="${filter === m}"><span class="nm">${m === ALL ? '전체' : esc(m)}</span><span class="ct">${l.filter(done).length}/${l.length}</span></button>`;
  }).join('')}</div>` : '';

  const pick = addPick();
  const rows = shown.map(it => itemHtml(it)).join('');
  const finished = s.total && !s.left && !closed
    ? `<p class="pj-alldone">모든 항목을 끝냈습니다.<button class="pj-btn" data-complete>완료로 옮기기</button></p>` : '';
  return `${head}${form}${tabs}
    <section class="ck-group">
      <h2 class="sec-h ko"><span>세부 항목<small>담당 멤버의 체크리스트에도 보입니다${closed ? '. 완료된 프로젝트라 체크리스트에서는 빠져 있습니다' : ''}</small></span><span class="n">${shown.length ? `${shown.filter(done).length}/${shown.length}` : ''}</span></h2>
      <ol class="ck-rows">${rows}</ol>
      ${!all.length ? '<p class="ck-none">아직 세부 항목이 없습니다. 할 일을 적고 담당을 고른 뒤 Enter를 누르세요.</p>' : ''}
      <form class="ck-add pj-addf" autocomplete="off">
        <span class="box" aria-hidden="true"></span>
        <input name="text" value="${esc(draft)}" placeholder="할 일 추가" aria-label="세부 항목 추가" maxlength="200" enterkeyhint="done">
        ${pickHtml(pick, 'data-pick')}
      </form>
    </section>${finished}`;
}

function itemHtml(it) {
  const d = done(it);
  if (editItem === it.id) {
    return `<li class="ck-row edit"><form class="ck-edit pj-iedit" data-id="${esc(it.id)}" autocomplete="off">
      <input name="text" value="${esc(it.text)}" aria-label="내용" maxlength="200">
      <button type="submit" class="pri">저장</button><button type="button" data-icancel>취소</button>
      ${pickHtml(editPick, 'data-epick')}
    </form></li>`;
  }
  const meta = d ? [C().fmtDone(it.doneAt), it.doneBy].filter(Boolean).join(' · ') : '';
  return `<li class="ck-row pj-item${d ? ' done' : ''}" data-id="${esc(it.id)}">
    <label class="ck-chk"><input type="checkbox" data-toggle="${esc(it.id)}"${d ? ' checked' : ''}${busy() ? ' disabled' : ''} aria-label="${esc(it.text)}"><span class="box" aria-hidden="true"></span></label>
    <span class="tx">${esc(it.text)}<span class="ow">${esc(it.owners.join(' · '))}</span></span>
    <span class="mt">${esc(meta)}</span>
    <button class="ck-more" data-more="${esc(it.id)}" aria-label="더 보기" title="고치기, 순서, 지우기">···</button>
  </li>`;
}

// ─────────── 오른쪽 요약 ───────────
function renderSummary() {
  if (!summaryEl) return;
  const d = D();
  const list = sortP(d.projects.filter(p => p.status === 'active'));
  if (!d.started || !list.length) { summaryEl.classList.add('hidden'); return; }
  summaryEl.classList.remove('hidden');
  const rows = list.slice(0, 5).map(p => {
    const s = stat(p.id), du = dueLabel(p.due, false);
    const ct = s.total ? (s.left ? `${s.left}개 남음` : '끝') : '항목 없음';
    return `<button class="cs-row${s.total && !s.left ? ' ok' : ''}" data-popen="${esc(p.id)}" title="${esc(du.t)}">
      <span class="nm">${esc(p.name)}</span><span class="ct${du.late ? ' late' : ''}">${esc(ct)}</span>
      <span class="ck-bar" aria-hidden="true"><i style="width:${s.pct}%"></i></span></button>`;
  }).join('');
  const more = list.length > 5 ? `<button class="cs-more" data-popen="">외 ${list.length - 5}개</button>` : '';
  summaryEl.innerHTML = `<p class="kicker"><button data-popen="">Project</button></p>${rows}${more}`;
}

// ─────────── 조작 ───────────
function bind() {
  if (bound) return;
  bound = true;
  // host 는 패널 본문이라 열 때마다 바뀔 수 있음. 이벤트는 위임해서 한 번만 붙임
  document.addEventListener('click', e => { if (host && host.contains(e.target)) onClick(e); });
  document.addEventListener('change', e => { if (host && host.contains(e.target)) onChange(e); });
  document.addEventListener('submit', e => { if (host && host.contains(e.target)) onSubmit(e); });
  document.addEventListener('input', e => { if (host && host.contains(e.target) && e.target.closest('.pj-addf') && e.target.name === 'text') draft = e.target.value; });
  document.addEventListener('keydown', e => { if (host && host.contains(e.target)) onKey(e); }, true);
  document.addEventListener('contextmenu', e => { if (host && host.contains(e.target)) onContext(e); });
}
function go(id) { pid = id || null; editItem = null; editProj = false; draft = ''; localMsg = ''; render(); if (host) host.querySelector('.ck-body').scrollTop = 0; }

function onClick(e) {
  const t = e.target;
  const open = t.closest('[data-open]'); if (open) { go(open.dataset.open); return; }
  if (t.closest('[data-back]')) { go(null); return; }
  if (t.closest('[data-pedit]')) { editProj = true; render(); const f = host.querySelector('.pj-form input[name=name]'); if (f) f.focus(); return; }
  if (t.closest('[data-pcancel]')) { editProj = false; render(); return; }
  if (t.closest('[data-pdel]')) {
    const p = projOf(pid); if (!p) return;
    const n = itemsOf(p.id).length;
    if (!confirm(`“${p.name}” 프로젝트를 지울까요?${n ? ` 세부 항목 ${n}개도 모든 멤버의 체크리스트에서 함께 지워집니다.` : ''}`)) return;
    const id = p.id; editProj = false;
    run('delete', { id }, 'project').then(ok => { if (ok) go(null); });
    return;
  }
  if (t.closest('[data-complete]')) {
    const p = projOf(pid); if (!p) return;
    run('update', Object.assign({}, p, { status: 'done' }), 'project');
    return;
  }
  const f = t.closest('[data-filter]'); if (f) { ui.filter[pid] = f.dataset.filter; saveUi(); render(); return; }
  const pk = t.closest('[data-pick]');
  if (pk) {
    const m = pk.dataset.pick, cur = addPick();
    // 멤버 거르기 중이면 거르기를 풀고 고른 사람 그대로 이어감
    if (ui.filter[pid] && ui.filter[pid] !== ALL) ui.filter[pid] = ALL;
    ui.pick[pid] = cur.includes(m) ? cur.filter(x => x !== m) : cur.concat(m);
    saveUi(); render();
    const inp = host.querySelector('.pj-addf input[name=text]'); if (inp && !matchMedia('(pointer:coarse)').matches) inp.focus();
    return;
  }
  const ep = t.closest('[data-epick]');
  if (ep) {
    const m = ep.dataset.epick;
    const f2 = host.querySelector('.pj-iedit'); const txt = f2 ? f2.elements.text.value : '';
    editPick = editPick.includes(m) ? editPick.filter(x => x !== m) : editPick.concat(m);
    render();
    const inp = host.querySelector('.pj-iedit input[name=text]'); if (inp) inp.value = txt;
    return;
  }
  if (t.closest('[data-icancel]')) { editItem = null; render(); return; }
  const more = t.closest('[data-more]'); if (more) { const r = more.getBoundingClientRect(); itemMenu(more.dataset.more, r.left, r.bottom + 4); }
}

function onChange(e) {
  const cb = e.target.closest('[data-toggle]');
  if (!cb || busy()) return;
  run('toggle', { id: cb.dataset.toggle, done: cb.checked });
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (busy()) return;
  if (f.classList.contains('pj-newp')) {
    const name = f.elements.name.value.trim(); if (!name) return;
    f.elements.name.value = '';
    run('add', { name, status: 'active', lead: members().includes(C().me()) ? C().me() : '' }, 'project').then(id => { if (id && id !== true) go(id); });
    return;
  }
  if (f.classList.contains('pj-addf')) {
    const text = f.elements.text.value.trim(); if (!text) return;
    const owners = addPick();
    if (!owners.length) { localMsg = '담당을 한 명 이상 골라 주세요'; render(); return; }
    localMsg = ''; draft = '';
    f.elements.text.value = '';
    run('add', { owners, text, project: pid, order: C().nextProjectOrder(pid) }).then(() => {
      const inp = host && host.querySelector('.pj-addf input[name=text]'); if (inp) inp.focus();
    });
    return;
  }
  if (f.classList.contains('pj-iedit')) {
    const it = D().items.find(x => x.id === f.dataset.id); if (!it) return;
    const text = f.elements.text.value.trim(); if (!text) return;
    if (!editPick.length) { localMsg = '담당을 한 명 이상 골라 주세요'; render(); return; }
    localMsg = ''; editItem = null;
    run('update', Object.assign({}, it, { text, owners: editPick.slice() }));
    return;
  }
  if (f.classList.contains('pj-form')) {
    const p = projOf(pid); if (!p) return;
    const name = f.elements.name.value.trim(); if (!name) return;
    editProj = false;
    run('update', Object.assign({}, p, { name, lead: f.elements.lead.value, due: f.elements.due.value, status: f.elements.status.value, memo: f.elements.memo.value }), 'project');
  }
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  // 고치는 중이면 취소, 프로젝트 안이면 목록으로. 목록에서는 패널 닫기(shell.js)
  if (editItem) { e.stopPropagation(); editItem = null; render(); return; }
  if (editProj) { e.stopPropagation(); editProj = false; render(); return; }
  if (e.target.matches('input') && e.target.value) { e.stopPropagation(); e.target.value = ''; draft = ''; return; }
  if (pid) { e.stopPropagation(); go(null); }
}

function onContext(e) {
  if (e.target.closest('input,select,textarea')) return;
  const row = e.target.closest('.ck-row[data-id]'); if (!row) return;
  e.preventDefault(); e.stopPropagation();
  itemMenu(row.dataset.id, e.clientX, e.clientY);
}

function itemMenu(id, x, y) {
  const M = window.MYRUBI_DESK; if (!M) return;
  const it = D().items.find(z => z.id === id); if (!it) return;
  const d = done(it);
  const sib = itemsOf(it.project);
  const i = sib.indexOf(it);
  const swap = async j => {
    if (!sib[j]) return;
    const ord = sib.map((_, k) => k + 1);
    [ord[i], ord[j]] = [ord[j], ord[i]];
    for (let k = 0; k < sib.length; k++) {
      if (+sib[k].order !== ord[k]) { const ok = await run('update', Object.assign({}, sib[k], { order: ord[k] })); if (!ok) break; }
    }
  };
  M.menu(x, y, [
    { label: d ? '다시 해야 함으로' : '끝냄으로 표시', bold: true, act: () => run('toggle', { id, done: !d }) },
    { label: '고치기 (내용, 담당)', act: () => { editItem = id; editPick = it.owners.slice(); render(); const f = host.querySelector('.pj-iedit input[name=text]'); if (f) { f.focus(); f.select(); } } },
    '-',
    { label: '위로', disabled: i <= 0, act: () => swap(i - 1) },
    { label: '아래로', disabled: i >= sib.length - 1, act: () => swap(i + 1) },
    '-',
    { label: '지우기', act: () => { if (confirm(`“${it.text}”를 지울까요? 담당 멤버의 체크리스트에서도 사라집니다.`)) run('delete', { id }); } },
  ]);
}

/** 체크리스트가 목록을 새로 받거나 저장 상태가 바뀔 때. 고치는 중에는 요약만 */
function onData() { if (!editItem && !editProj) render(); else renderSummary(); }

// ─────────── 공개 ───────────
window.MYRUBI_PROJECT = {
  /** 로그인 뒤 호출. 데이터는 체크리스트가 불러오므로 요약 칸만 연결 */
  start(summary) {
    summaryEl = summary || summaryEl;
    if (C()) C().subscribe(onData);
    if (summaryEl && !summaryEl.dataset.bound) {
      summaryEl.dataset.bound = '1';
      summaryEl.addEventListener('click', e => {
        const o = e.target.closest('[data-popen]'); if (!o) return;
        if (typeof window.MYRUBI_PROJECT.onOpen === 'function') window.MYRUBI_PROJECT.onOpen(o.dataset.popen || null);
      });
    }
    render();
  },
  /** 패널 안에 붙이기. id 를 주면 그 프로젝트를 바로 엶 */
  mount(el, id) {
    host = el; bind();
    pid = id || null; editItem = null; editProj = false; draft = ''; localMsg = '';
    render();
    if (C()) C().reload();
  },
  unmount() { host = null; editItem = null; editProj = false; },
  /** 열려 있는 패널에서 다른 프로젝트(또는 목록)로 */
  show(id) { if (host) go(id); },
  /** 요약 칸에서 눌렀을 때 패널을 여는 함수 (shell.js 가 넣음) */
  onOpen: null,
};
})();
