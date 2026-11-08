// My Rubi 고객관리
// 고객 구매 건을 상담 10단계로 관리하고, 고객문의·구매진행중·구매완료 세 층위로 묶어 숫자로 보여줌
// 저장: 로그인하면 Index 스프레드시트의 '고객'·'고객로그' 탭 (Apps Script Code.gs 의 crm 동작), 로그인을 켜기 전에는 이 브라우저
// 매주 쓰던 주간 보고 텍스트를 붙여넣으면 고객별로 나눠 단계를 추정하고, 반대로 지금 데이터를 주간 보고 형식으로 뽑아냄
// 고객 정보는 서버(시트)에만 있음. 이 파일이 올라가는 GitHub 리포지토리는 공개라서 고객 이름을 코드에 적지 않음
(() => {
'use strict';

const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const K_LOCAL = 'myrubi.crm', K_CACHE_BASE = 'myrubi.crm.cache', K_UI = 'myrubi.crm.ui';
const K_CACHE = () => K_CACHE_BASE + '.' + ((MR && MR.user().email) || '');
const POLL_MS = 120000;
const ALL = '*';

// 상담 10단계 + 종료. Code.gs 의 CRM_STAGES 와 같게
const STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어'];
const END = '종료';
const ALL_STAGES = STAGES.concat(END);
const TIERS = [
  { key: 'inq',  name: '고객문의',   stages: ['문의', '상담', '견적'],                hint: '문의 · 상담 · 견적' },
  { key: 'buy',  name: '구매진행중', stages: ['계약금', '예약금', '발주', '입고', '조립'], hint: '계약금 ~ 조립' },
  { key: 'done', name: '구매완료',   stages: ['출고', '루비케어'],                   hint: '출고 · 루비케어' },
];
const GROUPS = ['개별 아카이브', '루비 브랜드', '컴포넌트 및 기타 브랜드'];
const GROUP_SHORT = { '개별 아카이브': '개별 아카이브', '루비 브랜드': '루비 브랜드', '컴포넌트 및 기타 브랜드': '컴포넌트 및 기타' };
const DONE_DAYS = 60;   // 구매완료 목록에는 단계가 바뀐 지 이 날수 안의 건만 (나머지는 '이전 건 보기')

// ─────────── 도우미 ───────────
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDay = s => { const m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };
const won = v => { const n = +String(v || '').replace(/[^\d]/g, ''); if (!n) return ''; return n % 10000 === 0 ? (n / 10000).toLocaleString('ko-KR') + '만원' : n.toLocaleString('ko-KR') + '원'; };
const normName = s => String(s || '').replace(/\s+/g, '');
const tierOf = st => { const t = TIERS.find(x => x.stages.includes(st)); return t ? t.key : 'end'; };
const stageIdx = st => STAGES.indexOf(st);
const shared = () => !!(MR && MR.loginEnabled() && MR.session());
const members = () => (CFG.MEMBERS || []).slice();
function me() {
  const u = MR ? MR.user() : null; if (!u) return '';
  const al = CFG.MEMBER_ALIASES || {};
  return al[u.email] || al[u.name] || u.name || '';
}

/** 주는 월요일에 시작. 'n월 n주차'는 그 주 목요일이 속한 달 기준 (11/2~11/8 → 11월 1주차) */
function weekOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  const thu = new Date(m); thu.setDate(m.getDate() + 3);
  const end = new Date(m); end.setDate(m.getDate() + 6);
  return { start: ymd(m) + ' 00:00', from: ymd(m), to: ymd(end), label: `${thu.getFullYear()}년 ${thu.getMonth() + 1}월 ${Math.ceil(thu.getDate() / 7)}주차` };
}

// ─────────── 상태 ───────────
let customers = [];   // { id, name, info, group, item, stage, memo, flag, owner, amount, stageAt, author, createdAt, updatedAt }
let logs = [];        // { id, cid, name, stage, memo, flag, by, at }
let quotes = [];      // 견적 요약 { id, no, cid, title, total, status, at } (견적 앱 assets/quote.js, 서버 crm 응답에 함께 옴)
let msg = '', busy = false, started = false, loaded = false;
let host = null, summaryEl = null, bound = false;
let view = 'list';    // list | detail | new | import | report
let cur = null;       // 보고 있는 고객 id
let preset = null;    // 새 건 만들 때 미리 채울 값 (같은 고객 다른 건)
let draft = null;     // 붙여넣기에서 읽은 줄들
let pasted = '';
let dirty = false;    // 입력 칸을 고치는 중이면 새로 불러와도 다시 그리지 않음
const ui = Object.assign({ group: ALL, stage: '', q: '', old: false, end: false }, readJson(K_UI, {}));
const saveUi = () => ls.set(K_UI, JSON.stringify({ group: ui.group, old: ui.old }));

const byId = id => customers.find(c => c.id === id);
// 같은 분에 쌓인 기록은 시트에 들어간 순서로 (나중 줄이 위)
const logsOf = id => logs.map((l, i) => [l, i]).filter(([l]) => l.cid === id)
  .sort((a, b) => String(b[0].at).localeCompare(String(a[0].at)) || b[1] - a[1]).map(x => x[0]);

// ─────────── 계산 ───────────
/** 이번 주 시작 시점의 단계 (그 전 기록이 없으면 null = 이번 주에 새로 들어온 건) */
function stageAtWeekStart(c, wk) {
  if (String(c.createdAt) >= wk.start) return null;
  const before = logs.filter(l => l.cid === c.id && String(l.at) < wk.start).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return before.length ? before[before.length - 1].stage : c.stage;   // 기록이 없던 예전 건은 그대로였다고 봄
}

function stats() {
  const wk = weekOf(new Date());
  const live = customers.filter(c => c.stage !== END);
  const tier = {}, entered = {};
  TIERS.forEach(t => { tier[t.key] = 0; entered[t.key] = 0; });
  let fresh = 0, moved = 0;
  live.forEach(c => {
    const k = tierOf(c.stage); tier[k]++;
    const s0 = stageAtWeekStart(c, wk);
    if (s0 == null) fresh++;
    else if (s0 !== c.stage) moved++;
    if (s0 == null || tierOf(s0) !== k) entered[k]++;
  });
  const stage = {}; STAGES.forEach(s => stage[s] = 0);
  live.forEach(c => stage[c.stage]++);
  const flagged = live.filter(c => c.flag && tierOf(c.stage) !== 'done').length;
  const deposit = live.filter(c => tierOf(c.stage) === 'buy').reduce((m, c) => m + (+c.amount || 0), 0);
  const people = new Set(live.map(c => normName(c.name))).size;
  return { wk, tier, entered, stage, flagged, deposit, fresh, moved, total: live.length, people, ended: customers.length - live.length };
}

function matches(c) {
  if (ui.group !== ALL && c.group !== ui.group) return false;
  if (ui.stage && c.stage !== ui.stage) return false;
  const q = ui.q.trim().toLowerCase();
  if (q && ![c.name, c.info, c.item, c.memo, c.flag, c.owner].join(' ').toLowerCase().includes(q)) return false;
  return true;
}
const byStage = (a, b) => (stageIdx(b.stage) - stageIdx(a.stage)) || String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
const recentDone = c => { const t = Date.parse(String(c.stageAt || c.updatedAt || c.createdAt).replace(' ', 'T')); return !t || Date.now() - t < DONE_DAYS * 864e5; };

// ─────────── 화면 ───────────
function syncHash() {
  if (!host) return;
  try { history.replaceState(null, '', '#customers' + (view === 'detail' && cur ? '/' + encodeURIComponent(cur) : '')); } catch (e) {}
}

function render() {
  renderSummary();
  if (!host) return;
  if (view === 'detail' && !byId(cur) && loaded && !busy) { view = 'list'; cur = null; }
  syncHash();
  const body = view === 'detail' ? detailHtml(byId(cur)) : view === 'new' ? formPage(null) : view === 'import' ? importHtml() : view === 'report' ? reportHtml() : listHtml();
  const foot = msg ? `<p class="ck-msg err" role="status">${esc(msg)}</p>` : busy ? '<p class="ck-msg">저장하는 중</p>' : !shared() ? '<p class="ck-msg">이 브라우저에만 저장됩니다</p>' : '';
  const keep = host.querySelector('.ck-body'); const top = keep ? keep.scrollTop : 0;
  host.innerHTML = `<div class="ck crm"><div class="ck-body">${body}</div>${foot}</div>`;
  if (view === 'list') host.querySelector('.ck-body').scrollTop = top;
}

function listHtml() {
  const s = stats();
  const metric = t => `<button class="crm-m" data-tier="${t.key}">
      <span class="lb">${t.name}</span><span class="v">${s.tier[t.key]}</span>
      <span class="sub">${s.entered[t.key] ? `이번 주 +${s.entered[t.key]}` : esc(t.hint)}</span></button>`;
  const metrics = `<div class="crm-ms">${TIERS.map(metric).join('')}
    <button class="crm-m${s.flagged ? ' warn' : ''}" data-flag><span class="lb">확인 필요</span><span class="v">${s.flagged}</span><span class="sub">지연 · 사양 미정</span></button></div>`;

  const strip = `<div class="crm-strip" role="group" aria-label="단계로 거르기">${TIERS.map(t =>
    `<div class="crm-tier">${t.stages.map(st => `<button data-stage="${esc(st)}" aria-pressed="${ui.stage === st}"${s.stage[st] ? '' : ' class="zero"'}><b>${s.stage[st]}</b>${esc(st)}</button>`).join('')}</div>`).join('')}</div>`;

  const groupCount = g => customers.filter(c => c.stage !== END && (g === ALL || c.group === g)).length;
  const tabs = `<div class="ck-tabs crm-tabs" role="tablist" aria-label="구분">${[ALL].concat(GROUPS).map(g =>
    `<button class="ck-tab" role="tab" data-group="${esc(g)}" aria-selected="${ui.group === g}"><span class="nm">${g === ALL ? '전체' : esc(GROUP_SHORT[g])}</span><span class="ct">${groupCount(g)}</span></button>`).join('')}
    <label class="crm-q"><input name="q" value="${esc(ui.q)}" placeholder="이름·모델·내용 찾기" aria-label="고객 찾기" autocomplete="off"></label></div>`;

  const week = `<div class="crm-week">
    <div><h2>${esc(s.wk.label)}</h2><p>${fmtDay(s.wk.from)}~${fmtDay(s.wk.to)}<i class="dot">·</i>${s.people}명 ${s.total}건<i class="dot">·</i>이번 주 새 건 ${s.fresh}<i class="dot">·</i>단계 이동 ${s.moved}${s.deposit ? `<i class="dot">·</i>진행중 계약금 ${won(s.deposit)}` : ''}</p></div>
    <div class="crm-acts"><button class="pj-btn" data-go="import">주간 보고 붙여넣기</button><button class="pj-btn" data-go="report">주간 보고 만들기</button><button class="pj-btn pri" data-go="new">+ 고객</button></div>
  </div>`;

  const filt = ui.stage || ui.q || ui.group !== ALL;
  const secs = TIERS.map(t => {
    let list = customers.filter(c => tierOf(c.stage) === t.key && matches(c)).sort(byStage);
    let more = '';
    if (t.key === 'done' && !ui.old && !ui.stage && !ui.q) {
      const old = list.filter(c => !recentDone(c));
      if (old.length) { list = list.filter(recentDone); more = `<button class="crm-more" data-old>${DONE_DAYS}일 지난 구매완료 ${old.length}건 보기</button>`; }
    }
    if (ui.stage && !t.stages.includes(ui.stage)) return '';
    return `<section class="ck-group"><h2 class="sec-h ko"><span>${t.name}<small>${esc(t.hint)}</small></span><span class="n">${list.length}</span></h2>
      ${list.length ? `<ol class="crm-rows">${list.map(rowHtml).join('')}</ol>` : `<p class="ck-none">${filt ? '조건에 맞는 고객이 없습니다.' : '해당 고객이 없습니다.'}</p>`}${more}</section>`;
  }).join('');
  const ended = customers.filter(c => c.stage === END && matches(c)).sort(byStage);
  const endSec = ended.length && !ui.stage ? `<section class="ck-group crm-end"><h2 class="sec-h ko"><span>종료<small>취소 · 보류</small></span><span class="n">${ended.length}</span></h2>
    ${ui.end ? `<ol class="crm-rows">${ended.map(rowHtml).join('')}</ol>` : '<button class="crm-more" data-end>종료된 건 보기</button>'}</section>` : '';

  const empty = loaded && !customers.length ? `<div class="crm-empty"><p>아직 고객이 없습니다. 매주 쓰던 주간 보고를 붙여넣으면 고객별로 나눠 한 번에 들어갑니다.</p><button class="pj-btn pri" data-go="import">주간 보고 붙여넣기</button></div>` : '';
  const loading = !loaded && !customers.length ? '<p class="ck-none">고객 목록을 불러오는 중입니다.</p>' : '';
  return `${week}${metrics}${strip}${tabs}${empty || loading || secs + endSec}`;
}

function rowHtml(c) {
  const t = tierOf(c.stage);
  const when = fmtDay(c.updatedAt || c.createdAt);
  return `<li><button class="crm-row t-${t}" data-open="${esc(c.id)}">
    <span class="st">${esc(c.stage)}</span>
    <span class="mn"><span class="nm">${esc(c.name)}${c.info ? `<small>${esc(c.info)}</small>` : ''}</span>
      ${c.item ? `<span class="it">${esc(c.item)}</span>` : ''}
      ${c.memo ? `<span class="me">${esc(c.memo)}</span>` : ''}</span>
    <span class="rt">${c.flag ? `<span class="fl">${esc(c.flag)}</span>` : ''}<span class="ow">${esc([c.owner, when].filter(Boolean).join(' · '))}</span></span>
  </button></li>`;
}

// ─── 고객 한 건 ───
function stepper(c) {
  return `<div class="crm-steps" role="group" aria-label="단계 (누르면 바로 저장)">${TIERS.map(t =>
    `<div class="crm-tier">${t.stages.map(st => {
      const i = stageIdx(st), ci = stageIdx(c.stage);
      return `<button type="button" data-step="${esc(st)}" class="${st === c.stage ? 'on' : ci >= 0 && i < ci ? 'past' : ''}"${busy ? ' disabled' : ''}>${esc(st)}</button>`;
    }).join('')}</div>`).join('')}</div>`;
}

function formHtml(c) {
  const v = c || Object.assign({ name: '', info: '', group: ui.group !== ALL ? ui.group : GROUPS[0], item: '', stage: '문의', memo: '', flag: '', owner: me(), amount: '' }, preset || {});
  const opt = (list, sel, blank) => (blank != null ? `<option value="">${blank}</option>` : '') + list.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const ms = members(); if (v.owner && !ms.includes(v.owner)) ms.push(v.owner);
  return `<form class="pj-form crm-form" autocomplete="off">
    <label><span>고객명</span><input name="name" value="${esc(v.name)}" maxlength="40" required></label>
    <label><span>고객 정보 (소속·관계)</span><input name="info" value="${esc(v.info)}" maxlength="100" placeholder="지인 소개, 소속"></label>
    <label><span>구분</span><select name="group">${opt(GROUPS, v.group)}</select></label>
    <label><span>단계</span><select name="stage">${opt(ALL_STAGES, v.stage)}</select></label>
    <label class="wide"><span>브랜드·모델</span><input name="item" value="${esc(v.item)}" maxlength="120" placeholder="몰튼 SST 와이드 실버그레이"></label>
    <label class="wide"><span>현재 상황</span><textarea name="memo" rows="4" maxlength="2000">${esc(v.memo)}</textarea></label>
    <label><span>확인 필요</span><input name="flag" value="${esc(v.flag)}" maxlength="60" placeholder="출고 지연, 사양 미정"></label>
    <label><span>담당</span><select name="owner">${opt(ms, v.owner, '없음')}</select></label>
    <label><span>계약금 (원)</span><input name="amount" value="${esc(v.amount ? (+v.amount).toLocaleString('ko-KR') : '')}" inputmode="numeric" placeholder="숫자만"></label>
    <div class="pj-fbtn"><button type="submit" class="pri"${busy ? ' disabled' : ''}>${c ? '저장' : '넣기'}</button><button type="button" data-go="list">${c ? '목록으로' : '취소'}</button>
      ${c ? '<button type="button" data-sibling>이 고객의 다른 건 추가</button><button type="button" class="danger" data-del>지우기</button>' : ''}</div>
  </form>`;
}

function formPage() {
  return `<div class="pj-head"><button class="pj-back" data-go="list"><span aria-hidden="true">←</span> 고객 목록</button>
    <div class="pj-ttl"><h2>${preset && preset.name ? esc(preset.name) + ' · 새 건' : '새 고객'}</h2></div></div>${formHtml(null)}`;
}

function detailHtml(c) {
  if (!c) return '<p class="ck-none">고객을 불러오는 중입니다.</p>';
  const tier = TIERS.find(t => t.key === tierOf(c.stage));
  const others = customers.filter(x => x.id !== c.id && normName(x.name) === normName(c.name));
  const meta = [c.group, tier ? tier.name : '종료', c.stageAt ? `${fmtDay(c.stageAt)}부터 ${c.stage}` : '', c.amount ? '계약금 ' + won(c.amount) : '', c.owner ? '담당 ' + c.owner : '']
    .filter(Boolean).map(esc).join('<i class="dot">·</i>');
  const hist = logsOf(c.id);
  const histHtml = hist.length ? `<ol class="crm-log">${hist.map((l, i) => {
    const prev = hist[i + 1];
    const moved = prev && prev.stage !== l.stage ? `${esc(prev.stage)} → ${esc(l.stage)}` : esc(l.stage);
    return `<li><span class="at">${esc(fmtDay(l.at))}<small>${esc(String(l.at).slice(11, 16))}</small></span><span class="st">${moved}</span>
      <span class="tx">${esc(l.memo)}${l.flag ? `<span class="fl">${esc(l.flag)}</span>` : ''}</span><span class="by">${esc(l.by)}</span></li>`;
  }).join('')}</ol>` : '<p class="ck-none">아직 기록이 없습니다. 단계나 현재 상황을 바꾸면 여기에 쌓입니다.</p>';
  return `<div class="pj-head">
    <button class="pj-back" data-go="list"><span aria-hidden="true">←</span> 고객 목록</button>
    <div class="pj-ttl"><h2>${esc(c.name)}${c.info ? `<small>${esc(c.info)}</small>` : ''}</h2></div>
    <p class="pj-meta">${meta}</p>
    ${c.item ? `<p class="crm-item">${esc(c.item)}</p>` : ''}
    ${others.length ? `<p class="crm-others">같은 고객의 다른 건 ${others.map(o => `<button data-open="${esc(o.id)}">${esc(o.item || o.stage)} · ${esc(o.stage)}</button>`).join('')}</p>` : ''}
  </div>
  ${stepper(c)}
  ${formHtml(c)}
  ${quotesHtml(c)}
  <section class="ck-group"><h2 class="sec-h ko"><span>기록<small>단계, 현재 상황, 확인 필요가 바뀔 때마다 남습니다</small></span><span class="n">${hist.length || ''}</span></h2>${histHtml}</section>`;
}

/** 이 고객 건의 견적 (견적 앱에서 고객 건을 고르고 저장한 것). 누르면 견적 패널로 */
function quotesHtml(c) {
  if (!window.MYRUBI_QUOTE) return '';
  const mine = quotes.filter(q => q.cid === c.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const wonFull = v => (+v || 0).toLocaleString('ko-KR') + '원';
  return `<section class="ck-group crm-quotes"><h2 class="sec-h ko"><span>견적<small>견적 앱에서 이 고객 건으로 저장한 견적</small></span><span class="n">${mine.length || ''}</span></h2>
    ${mine.length ? `<ol class="crm-log">${mine.map(q => `<li><span class="at">${esc(fmtDay(q.at))}<small>${esc(String(q.at).slice(11, 16))}</small></span><span class="st">${esc(q.status)}</span>
      <span class="tx"><button class="crm-qlink" data-quote="${esc(q.id)}">${esc(q.no)}${q.title ? ' ' + esc(q.title) : ''}</button></span><span class="by">${esc(wonFull(q.total))}</span></li>`).join('')}</ol>` : ''}
    <button class="crm-more" data-quote-new="${esc(c.id)}">+ 이 고객 건으로 견적 만들기</button></section>`;
}

// ─── 주간 보고 붙여넣기 ───
function importHtml() {
  const head = `<div class="pj-head"><button class="pj-back" data-go="list"><span aria-hidden="true">←</span> 고객 목록</button>
    <div class="pj-ttl"><h2>주간 보고 붙여넣기</h2></div>
    <p class="pj-meta">구분 제목(개별 아카이브, 루비 브랜드, 컴포넌트 및 기타 브랜드) 아래에 "이름 : 내용" 줄로 적은 보고를 그대로 붙여넣으세요. 이미 있는 고객은 이름으로 찾아 이어서 기록합니다.</p></div>`;
  if (!draft) {
    return `${head}<form class="crm-paste" autocomplete="off">
      <textarea name="text" rows="16" placeholder="${esc(weekOf(new Date()).label)} 고객 CRM 현황&#10;&#10;개별 아카이브&#10;* 이름 (소속) : 현재 상황&#10;&#10;루비 브랜드&#10;* 이름 : 현재 상황">${esc(pasted)}</textarea>
      <div class="pj-fbtn"><button type="submit" class="pri">읽기</button><button type="button" data-go="list">취소</button></div></form>`;
  }
  const rows = draft.map((d, i) => {
    const cands = customers.filter(c => normName(c.name) === normName(d.name));
    return `<li class="crm-dr${d.skip ? ' skip' : ''}" data-i="${i}">
      <label class="ck-chk"><input type="checkbox" data-dkeep="${i}"${d.skip ? '' : ' checked'} aria-label="${esc(d.name)} 넣기"><span class="box" aria-hidden="true"></span></label>
      <div class="crm-dm">
        <p class="nm">${esc(d.name)}${d.info ? `<small>${esc(d.info)}</small>` : ''}<span class="gp">${esc(GROUP_SHORT[d.group])}</span></p>
        <p class="me">${esc(d.memo)}</p>
        <div class="crm-df">
          <select data-dfield="target" aria-label="연결할 고객"><option value="">새 고객</option>${cands.map(c => `<option value="${esc(c.id)}"${d.target === c.id ? ' selected' : ''}>기존 · ${esc(c.item || c.name)} (${esc(c.stage)})</option>`).join('')}</select>
          <select data-dfield="stage" aria-label="단계">${ALL_STAGES.map(st => `<option${st === d.stage ? ' selected' : ''}>${esc(st)}</option>`).join('')}</select>
          <input data-dfield="item" value="${esc(d.item)}" placeholder="브랜드·모델" aria-label="브랜드·모델">
          <input data-dfield="flag" value="${esc(d.flag)}" placeholder="확인 필요" aria-label="확인 필요">
        </div>
      </div></li>`;
  }).join('');
  const n = draft.filter(d => !d.skip).length;
  return `${head}<p class="crm-dsum">${draft.length}줄을 읽었습니다. 단계는 내용의 단어로 추정한 값이니 확인하고 고쳐 주세요.</p>
    <ol class="crm-drows">${rows}</ol>
    <div class="pj-fbtn crm-dbtn"><button type="button" class="pri" data-dsave${busy || !n ? ' disabled' : ''}>${n}건 저장</button><button type="button" data-dback>다시 붙여넣기</button></div>`;
}

const GROUP_RE = [[/아카이브|아카아브|아카이부/, GROUPS[0]], [/루비\s*브랜드/, GROUPS[1]], [/컴포넌트|기타\s*브랜드/, GROUPS[2]]];
const STAGE_RE = [
  [/루비\s*케어/, '루비케어'], [/출고\s*(완료|했|함|됨|하였)/, '출고'], [/조립\s*(진행|중)/, '조립'],
  [/입고\s*(완료|됨|되었)/, '입고'], [/발주|수급|조립\s*예정/, '발주'], [/예약/, '예약금'],
  [/계약금|계약\s*완료|계약(?!\s*예정)/, '계약금'], [/견적/, '견적'], [/상담|원함|요청|희망|문의/, '상담'],
];
function guessStage(t) { for (const [re, st] of STAGE_RE) if (re.test(t)) return st; return '문의'; }
function guessFlag(t) {
  const f = [];
  if (/지연/.test(t)) f.push('지연');
  if (/미정|선택하지\s*않|확답|결정\s*예정/.test(t)) f.push('사양 미정');
  return f.join(', ');
}
const PERSON_RE = /지인|유저|고객|소개|매니저|대표|부회장|회장|님$/;
/** 내용에서 브랜드·모델로 보이는 첫 구절. 사람 소개("○○ 지인", "미니벨로 유저")나 너무 짧은 구절은 건너뜀 */
function guessItem(t) {
  const parts = String(t).split(/[,，.。]\s*/).map(x => x.trim()).filter(Boolean);
  for (const p of parts) {
    if (PERSON_RE.test(p) || /에서\s/.test(p) || p.length < 4) continue;
    const s = p.replace(/(을|를)\s*기반으로.*$/, '').replace(/\s*(계약금|견적|상담|예약|계약|조립|입고|발주|구매|진행)\S*.*$/, '').replace(/(을|를)$/, '').trim();
    if (s.length > 1 && s.length <= 60) return s;
  }
  return '';
}
/** 내용 첫 구절이 사람 소개면 고객 정보로 */
function guessInfo(t) { const p = String(t).split(/[,，]/)[0].trim(); return PERSON_RE.test(p) && p.length <= 30 ? p : ''; }
function guessAmount(t) {
  const m = String(t).match(/계약금\s*([\d,.]+)\s*(만\s*원|만원|만|원)?/);
  if (!m) return '';
  const n = parseFloat(m[1].replace(/,/g, '')); if (!n) return '';
  return String(Math.round(/만/.test(m[2] || '') ? n * 10000 : n));
}

/** 붙여넣은 보고 → [{ name, info, group, memo, stage, item, flag, amount, target, skip }] */
function parseReport(text) {
  const out = [];
  let group = GROUPS[GROUPS.length - 1], last = null;
  String(text || '').split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/^[\s*\-•·◦▪︎●○]+/, '').trim();
    if (!line) return;
    const m = line.match(/^([^:：]{1,24}?)\s*[:：]\s*(.+)$/);
    if (!m) {
      const g = GROUP_RE.find(([re]) => re.test(line));
      if (g && line.length <= 30) { group = g[1]; last = null; return; }
      if (/CRM|현황|주차/.test(line) && !last) return;   // 제목 줄
      if (last) last.memo += ' ' + line;                 // 앞 고객 내용이 이어진 줄
      return;
    }
    const head = m[1].trim();
    const pm = head.match(/^(.+?)\s*[(（](.+?)[)）]\s*$/);
    last = { name: (pm ? pm[1] : head).replace(/\s+/g, ' ').trim(), info: pm ? pm[2].trim() : '', group, memo: m[2].trim() };
    out.push(last);
  });
  return out.map(d => {
    // 내용 첫 구절이 사람 소개면 고객 정보로 옮김 ("○○ 매니저 지인, 설리 …")
    const gi = guessInfo(d.memo);
    if (gi && !d.info) { d.info = gi; d.memo = d.memo.slice(d.memo.indexOf(gi) + gi.length).replace(/^[\s,，]+/, ''); }
    const cands = customers.filter(c => normName(c.name) === normName(d.name)).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    const ex = cands[0];
    let stage = guessStage(d.memo);
    // 기존 고객이면 단계가 뒤로 가지 않게 (종료는 그대로 존중)
    if (ex && ex.stage !== END && stageIdx(ex.stage) > stageIdx(stage)) stage = ex.stage;
    return Object.assign(d, {
      stage, flag: guessFlag(d.memo), amount: guessAmount(d.memo) || (ex ? ex.amount : ''),
      item: ex && ex.item ? ex.item : guessItem(d.memo), target: ex ? ex.id : '',
      info: d.info || (ex ? ex.info : ''), skip: false,
    });
  });
}

// ─── 주간 보고 만들기 ───
/** 지금 데이터를 매주 쓰던 형식으로. 진행 중인 건 + 이번 주에 구매완료로 넘어간 건 */
function reportText() {
  const wk = weekOf(new Date());
  const pick = c => c.stage !== END && (tierOf(c.stage) !== 'done' || String(c.stageAt) >= wk.start);
  const lines = [`${wk.label} 고객 CRM 현황`, ''];
  GROUPS.forEach(g => {
    const list = customers.filter(c => c.group === g && pick(c)).sort(byStage);
    if (!list.length) return;
    lines.push(g, '');
    list.forEach(c => lines.push(`* ${c.name}${c.info ? ` (${c.info})` : ''} : ${c.memo || c.item || c.stage}`));
    lines.push('');
  });
  const s = stats();
  lines.push(`고객문의 ${s.tier.inq} · 구매진행중 ${s.tier.buy} · 구매완료 ${s.tier.done} · 확인 필요 ${s.flagged}`);
  return lines.join('\n');
}
function reportHtml() {
  return `<div class="pj-head"><button class="pj-back" data-go="list"><span aria-hidden="true">←</span> 고객 목록</button>
    <div class="pj-ttl"><h2>주간 보고</h2><button class="pj-btn pri" data-copy>복사</button></div>
    <p class="pj-meta">진행 중인 고객과 이번 주에 출고된 고객을 구분별로 모았습니다. 복사해서 그대로 쓰면 됩니다.</p></div>
    <textarea class="crm-report" readonly rows="24">${esc(reportText())}</textarea>`;
}

// ─────────── 오른쪽 요약 (첫 화면) ───────────
function renderSummary() {
  if (!summaryEl) return;
  if (!started || (!customers.length && !loaded)) { summaryEl.classList.add('hidden'); return; }
  summaryEl.classList.remove('hidden');
  const s = stats();
  const row = (k, name, n, plus, cls) => `<button class="cs-row${cls ? ' ' + cls : ''}" data-copen="${k}"><span class="nm">${name}</span><span class="ct">${plus ? `<i>+${plus}</i>` : ''}${n}</span></button>`;
  summaryEl.innerHTML = `<p class="kicker"><button data-copen="">Customer</button><span>${esc(s.wk.label.replace(/^\d{4}년 /, ''))}</span></p>
    ${TIERS.map(t => row(t.key, t.name, s.tier[t.key], s.entered[t.key])).join('')}
    ${s.flagged ? row('flag', '확인 필요', s.flagged, 0, 'warn') : ''}`;
}

// ─────────── 저장 ───────────
const saveCache = () => ls.set(K_CACHE(), JSON.stringify({ customers, logs, quotes }));
function readLocal() { const d = readJson(K_LOCAL, {}); customers = d.customers || []; logs = d.logs || []; }
const writeLocal = () => ls.set(K_LOCAL, JSON.stringify({ customers, logs }));

async function load() {
  if (!shared()) { readLocal(); loaded = true; if (!dirty) render(); else renderSummary(); return; }
  try {
    const j = await MR.get({ action: 'crm' });
    customers = j.customers || []; logs = j.crmLogs || []; quotes = j.quotes || []; loaded = true;
    saveCache(); msg = '';
  } catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 고객관리를 쓸 수 있습니다' : '고객 목록을 불러오지 못했습니다. ' + e.message;
  }
  if (!dirty) render(); else renderSummary();
}

const FIELDS = ['name', 'info', 'group', 'item', 'stage', 'memo', 'flag', 'owner', 'amount'];
const pickFields = d => { const o = {}; FIELDS.forEach(k => o[k] = d[k] == null ? '' : String(d[k])); o.amount = o.amount.replace(/[^\d]/g, ''); return o; };

/** 로그인 전(브라우저 저장)에도 서버와 같은 규칙으로 */
function localUpsert(d) {
  const who = me() || '나', v = pickFields(d);
  const log = o => logs.push({ id: 'l' + Math.random().toString(36).slice(2, 9), cid: o.id, name: o.name, stage: o.stage, memo: o.memo, flag: o.flag, by: who, at: stamp() });
  const c = d.id && byId(d.id);
  if (!c) {
    const o = Object.assign({ id: 'lc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }, v, { stageAt: stamp(), author: who, createdAt: stamp(), updatedAt: '' });
    customers.push(o); log(o); return o.id;
  }
  const changed = c.stage !== v.stage || c.memo !== v.memo || c.flag !== v.flag;
  if (c.stage !== v.stage) c.stageAt = stamp();
  Object.assign(c, v, { updatedAt: stamp() });
  if (changed) log(c);
  return c.id;
}

/** op: add / update / delete / bulk. add 는 새 id 를 돌려줌, 실패하면 false */
async function run(op, d) {
  busy = true; msg = ''; render();
  let out = true;
  try {
    if (shared()) {
      const body = op === 'bulk' ? { rows: d.rows.map(r => Object.assign({ id: r.id || '' }, pickFields(r))) } : op === 'delete' ? { id: d.id } : Object.assign({ id: d.id || '' }, pickFields(d));
      const j = await MR.post(Object.assign({ action: 'crm', op }, body));
      customers = j.customers || []; logs = j.crmLogs || []; quotes = j.quotes || quotes; loaded = true;
      saveCache();
      out = j.saved || true;
    } else {
      if (op === 'delete') { customers = customers.filter(c => c.id !== d.id); logs = logs.filter(l => l.cid !== d.id); }
      else if (op === 'bulk') d.rows.forEach(localUpsert);
      else out = localUpsert(op === 'add' ? Object.assign({}, d, { id: '' }) : d);
      writeLocal();
    }
  } catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 고객관리를 저장할 수 있습니다' : '저장하지 못했습니다. ' + e.message;
    out = false;
  }
  busy = false;
  return out;
}

// ─────────── 조작 ───────────
function go(v, id) {
  view = v; cur = id || null; dirty = false; msg = '';
  if (v !== 'new') preset = null;
  if (v !== 'import') { draft = null; }
  render();
  const b = host && host.querySelector('.ck-body'); if (b) b.scrollTop = 0;
  if (v === 'new') { const f = host.querySelector('.crm-form input[name=name]'); if (f && !preset) f.focus(); else if (f) { const it = host.querySelector('.crm-form input[name=item]'); if (it) it.focus(); } }
  if (v === 'import' && !draft) { const t = host.querySelector('.crm-paste textarea'); if (t) t.focus(); }
}
// f.elements.item 은 메서드라서 namedItem 으로 꺼냄
const formData = f => { const o = {}; FIELDS.forEach(k => { const el = f.elements.namedItem(k); if (el) o[k] = el.value.trim(); }); return o; };

function bind() {
  if (bound) return;
  bound = true;
  const inHost = e => host && host.contains(e.target);
  document.addEventListener('click', e => { if (inHost(e)) onClick(e); });
  document.addEventListener('submit', e => { if (inHost(e)) onSubmit(e); });
  document.addEventListener('input', e => { if (inHost(e) && !e.isComposing) onInput(e); });
  // 한글 조합 중에는 다시 그리지 않고, 조합이 끝나면 한 번 반영
  document.addEventListener('compositionend', e => { if (inHost(e)) onInput(e); });
  document.addEventListener('change', e => { if (inHost(e)) onChange(e); });
  document.addEventListener('keydown', e => { if (inHost(e)) onKey(e); }, true);
}

async function onClick(e) {
  const t = e.target;
  const g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  // 견적 묶음: 주소를 바꾸면 shell.js 가 견적 패널을 엶
  const qo = t.closest('[data-quote]'); if (qo) { location.hash = '#quote/' + encodeURIComponent(qo.dataset.quote); return; }
  const qn = t.closest('[data-quote-new]'); if (qn) { location.hash = '#quote/new/' + encodeURIComponent(qn.dataset.quoteNew); return; }
  const o = t.closest('[data-open]'); if (o) { go('detail', o.dataset.open); return; }
  const gr = t.closest('[data-group]'); if (gr) { ui.group = gr.dataset.group; saveUi(); render(); return; }
  const st = t.closest('[data-stage]'); if (st) { ui.stage = ui.stage === st.dataset.stage ? '' : st.dataset.stage; render(); return; }
  const tr = t.closest('[data-tier]');
  if (tr) {   // 층위 숫자를 누르면 그 구역으로
    ui.stage = ''; ui.q = ''; render();
    const sec = [...host.querySelectorAll('.ck-group')][TIERS.findIndex(x => x.key === tr.dataset.tier)];
    if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  if (t.closest('[data-flag]')) { ui.stage = ''; ui.q = ''; render(); const f = host.querySelector('.crm-row .fl'); if (f) f.closest('li').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  if (t.closest('[data-old]')) { ui.old = true; saveUi(); render(); return; }
  if (t.closest('[data-end]')) { ui.end = true; render(); return; }
  const step = t.closest('[data-step]');
  if (step && view === 'detail') {
    const c = byId(cur), f = host.querySelector('.crm-form'); if (!c || !f || busy) return;
    const d = Object.assign({ id: c.id }, formData(f), { stage: step.dataset.step });
    if (await run('update', d)) dirty = false;
    render();
    return;
  }
  if (t.closest('[data-sibling]')) {
    const c = byId(cur); if (!c) return;
    preset = { name: c.name, info: c.info, group: c.group, owner: c.owner, stage: '문의' };
    view = 'new'; cur = null; dirty = false; render();
    const it = host.querySelector('.crm-form input[name=item]'); if (it) it.focus();
    return;
  }
  if (t.closest('[data-del]')) {
    const c = byId(cur); if (!c) return;
    if (!confirm(`${c.name}${c.item ? ` (${c.item})` : ''} 건을 지울까요? 기록도 함께 지워집니다. 거래가 끝났거나 취소된 건은 지우지 말고 단계를 '종료'로 두면 기록이 남습니다.`)) return;
    if (await run('delete', { id: c.id })) go('list'); else render();
    return;
  }
  if (t.closest('[data-dback]')) { draft = null; render(); return; }
  if (t.closest('[data-dsave]')) {
    const rows = draft.filter(d => !d.skip).map(d => {
      const ex = d.target && byId(d.target);
      // 기존 고객은 시트에 있던 담당·계약금 등을 지키고 이번 주 내용으로 덮어씀
      return Object.assign({}, ex || { owner: '' }, { id: d.target || '', name: d.name, info: d.info, group: d.group, stage: d.stage, memo: d.memo, item: d.item, flag: d.flag, amount: d.amount || (ex ? ex.amount : '') });
    });
    if (!rows.length) return;
    if (await run('bulk', { rows })) { draft = null; pasted = ''; go('list'); } else render();
    return;
  }
  if (t.closest('[data-copy]')) {
    const ta = host.querySelector('.crm-report'); if (!ta) return;
    try { await navigator.clipboard.writeText(ta.value); t.closest('[data-copy]').textContent = '복사했습니다'; }
    catch (er) { ta.focus(); ta.select(); document.execCommand('copy'); t.closest('[data-copy]').textContent = '복사했습니다'; }
  }
}

function onInput(e) {
  const t = e.target;
  if (t.name === 'q' && t.closest('.crm-q')) {
    ui.q = t.value; const pos = t.selectionStart; render();
    const q = host.querySelector('.crm-q input'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) {} }
    return;
  }
  if (t.closest('.crm-paste')) { pasted = t.value; return; }
  if (t.closest('.crm-form')) {
    dirty = true;
    if (t.name === 'amount') { const n = t.value.replace(/[^\d]/g, ''); t.value = n ? (+n).toLocaleString('ko-KR') : ''; }
    return;
  }
  const df = t.closest('[data-dfield]');
  if (df && draft) { const i = +t.closest('[data-i]').dataset.i; draft[i][df.dataset.dfield] = t.value; }
}

function onChange(e) {
  const t = e.target;
  const k = t.closest('[data-dkeep]');
  if (k && draft) { draft[+k.dataset.dkeep].skip = !k.checked; render(); return; }
  const df = t.closest('select[data-dfield]');
  if (df && draft) {
    const i = +t.closest('[data-i]').dataset.i, d = draft[i];
    d[df.dataset.dfield] = t.value;
    if (df.dataset.dfield === 'target') { const ex = byId(t.value); if (ex && ex.item) d.item = ex.item; render(); }
    return;
  }
  if (t.closest('.crm-form')) dirty = true;
}

async function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (busy) return;
  if (f.classList.contains('crm-paste')) {
    pasted = f.elements.text.value;
    const d = parseReport(pasted);
    if (!d.length) { msg = '"이름 : 내용" 형식의 줄을 찾지 못했습니다'; render(); return; }
    msg = ''; draft = d; render();
    return;
  }
  if (f.classList.contains('crm-form')) {
    const d = formData(f);
    if (!d.name) return;
    if (view === 'new') {
      const id = await run('add', d);
      if (id) { preset = null; go('detail', id === true ? (customers[customers.length - 1] || {}).id : id); } else render();
    } else {
      if (await run('update', Object.assign({ id: cur }, d))) dirty = false;
      render();
    }
  }
}

function onKey(e) {
  if (e.key !== 'Escape') return;
  // 목록 밖이면 목록으로, 찾기 칸에 글이 있으면 지움. 목록에서는 패널 닫기(shell.js)
  if (e.target.matches('.crm-q input') && e.target.value) { e.stopPropagation(); ui.q = ''; render(); return; }
  if (view !== 'list') { e.stopPropagation(); if (view === 'import' && draft) { draft = null; render(); } else go('list'); }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && started && shared()) load(); });
setInterval(() => { if (!document.hidden && started && shared() && !busy) load(); }, POLL_MS);

// ─────────── 공개 ───────────
window.MYRUBI_CRM = {
  /** 로그인 뒤 호출. 첫 화면 오른쪽 요약을 그리고 목록을 불러옴 */
  start(summary) {
    summaryEl = summary || summaryEl;
    if (summaryEl && !summaryEl.dataset.bound) {
      summaryEl.dataset.bound = '1';
      summaryEl.addEventListener('click', e => {
        const o = e.target.closest('[data-copen]'); if (!o) return;
        if (typeof window.MYRUBI_CRM.onOpen === 'function') window.MYRUBI_CRM.onOpen(o.dataset.copen || '');
      });
    }
    started = true;
    if (shared()) { const c = readJson(K_CACHE(), null); if (c) { customers = c.customers || []; logs = c.logs || []; quotes = c.quotes || []; } }
    else readLocal();
    render(); load();
  },
  /** 패널 안에 붙이기. id 를 주면 그 고객을 바로 엶, 층위 key(inq·buy·done·flag)면 그 구역으로 */
  mount(el, arg) {
    host = el; bind();
    view = 'list'; cur = null; dirty = false; draft = null; msg = '';
    if (arg && byId(arg)) { view = 'detail'; cur = arg; }
    else if (arg && !TIERS.some(t => t.key === arg) && arg !== 'flag') { view = 'detail'; cur = arg; }   // 아직 안 불러온 고객 id
    render();
    if (arg && (TIERS.some(t => t.key === arg) || arg === 'flag')) {
      const b = host.querySelector(arg === 'flag' ? '[data-flag]' : `[data-tier="${arg}"]`); if (b) setTimeout(() => b.click(), 30);
    }
    if (started) load();
  },
  unmount() { host = null; dirty = false; draft = null; },
  show(arg) { if (host) this.mount(host, arg); },
  /** 요약 칸에서 눌렀을 때 패널을 여는 함수 (shell.js 가 넣음) */
  onOpen: null,
  // 확인용
  _parse: parseReport, _week: weekOf,
};
})();
