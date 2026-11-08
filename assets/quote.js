// My Rubi 견적
// 자전거 견적을 품목별로 세팅하고, 고객에게 줄 A4 견적서(인쇄·PDF)로 뽑음
// - 품목은 이카운트 품목 목록에서 찾아 넣으면 판매단가가 채워짐 (NAS 재고 조회 서비스의 search, assets/stock.js 의 api)
//   목록에 없는 품목·공임은 직접 입력
// - 저장: 로그인하면 Index 스프레드시트의 '견적' 탭 (Apps Script Code.gs 의 quotes·quote 동작), 로그인을 켜기 전에는 이 브라우저
// - 고객관리의 고객 건에 연결하면, 저장할 때 그 건의 단계가 문의·상담이면 '견적'으로 넘어가고 고객 기록에 견적 번호와 금액이 남음
// 고객 정보는 서버(시트)에만 있음. 이 파일이 올라가는 GitHub 리포지토리는 공개라서 고객 이름을 코드에 적지 않음
(() => {
'use strict';

const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const Q = Object.assign({
  NAME: '루비워크샵', NAME_EN: 'Rubi Workshop', ADDRESS: '', TEL: '', WEB: '', EMAIL: '', BIZ_NO: '', CEO: '',
  VALID_DAYS: 14, TERMS: [],
}, CFG.QUOTE || {});
const K_LOCAL = 'myrubi.quote', K_CACHE_BASE = 'myrubi.quote.cache', K_UI = 'myrubi.quote.ui';
const K_CACHE = () => K_CACHE_BASE + '.' + ((MR && MR.user().email) || '');
const ALL = '*';

// 품목 구분. Code.gs 의 QUOTE_CATS 와 같게 (견적서에는 이 순서로 묶여 나옴)
const CATS = ['프레임셋', '구동계', '휠·타이어', '콕핏', '안장·시트포스트', '페달', '액세서리', '공임', '기타'];
// 상태. Code.gs 의 QUOTE_STATUS 와 같게
const STATUS = ['작성중', '보냄', '계약', '취소'];
const LIVE_STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립'];   // 고객 건 고르기에서 위에 보일 단계

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
const fmtDate = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : ''; };
const num = v => { const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''))); return isFinite(n) ? n : 0; };
const qtyNum = v => { const n = Math.round((Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0) * 100) / 100; return n; };
const comma = n => (Math.round(+n || 0)).toLocaleString('ko-KR');
const won = n => comma(n) + '원';
const key = () => Math.random().toString(36).slice(2, 9);
const shared = () => !!(MR && MR.loginEnabled() && MR.session());
const stk = () => window.MYRUBI_STOCK;
const members = () => (CFG.MEMBERS || []).slice();
function me() {
  const u = MR ? MR.user() : null; if (!u) return '';
  const al = CFG.MEMBER_ALIASES || {};
  return al[u.email] || al[u.name] || u.name || '';
}
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const catIdx = c => { const i = CATS.indexOf(c); return i < 0 ? CATS.length : i; };

/** 이카운트 단가 → 견적 단가 (부가세 포함). 별도(N)로 된 단가는 10% 더해 10원 단위로 */
const vatPrice = (price, vat) => vat === 'N' ? Math.round(price * 1.1 / 10) * 10 : Math.round(price);

function sums(d) {
  const sub = (d.items || []).reduce((m, it) => m + Math.round((+it.qty || 0) * (+it.price || 0)), 0);
  const disc = Math.min(Math.max(0, num(d.discount)), Math.max(sub, 0));
  const total = sub - disc;
  const supply = Math.round(total / 1.1);
  return { sub, disc, total, supply, vat: total - supply };
}

// ─────────── 상태 ───────────
let quotes = [];      // { id, no, cid, name, title, items:[{cat,name,spec,code,qty,price}], subtotal, discount, total, memo, note, valid, status, owner, author, createdAt, updatedAt }
let customers = [];   // 고객관리 고객 건 요약 { id, name, info, group, item, stage, owner }
let loaded = false, busy = false, msg = '', okMsg = '';
let host = null, bound = false;
let view = 'list';    // list | edit | paper
let draft = null;     // 고치는 중인 견적 (items 에 화면용 k 가 붙음)
let dirty = false;
let leaveArmed = false, delArmed = false;
let pendingCid = '';  // 고객 건을 불러오기 전에 '새 견적(고객 건)'으로 열었을 때
const ui = Object.assign({ status: ALL, q: '', scat: CATS[0] }, readJson(K_UI, {}));
const saveUi = () => ls.set(K_UI, JSON.stringify({ status: ui.status, scat: ui.scat }));
// 이카운트 품목 찾기
const srch = { q: '', items: [], sel: 0, seq: 0, timer: 0, state: '' };   // state: '' | loading | error 문구

const qById = id => quotes.find(q => q.id === id);
const cById = id => customers.find(c => c.id === id);

function blank(cid) {
  const c = cid ? cById(cid) : null;
  return {
    id: '', no: '', cid: cid || '', name: c ? c.name : '', title: c ? c.item : '',
    items: [], discount: 0, memo: '', note: '', valid: addDays(+Q.VALID_DAYS || 14), status: STATUS[0], owner: me(),
    createdAt: '',
  };
}
function toDraft(q) {
  const d = JSON.parse(JSON.stringify(q));
  d.items = (d.items || []).map(it => Object.assign({ k: key() }, it));
  d.discount = num(d.discount);
  return d;
}
const sortItems = d => { d.items = d.items.map((it, i) => [it, i]).sort((a, b) => catIdx(a[0].cat) - catIdx(b[0].cat) || a[1] - b[1]).map(x => x[0]); };

// ─────────── 화면 ───────────
function syncHash() {
  if (!host) return;
  const h = view === 'list' ? '#quote' : draft && draft.id ? '#quote/' + encodeURIComponent(draft.id) : '#quote/new';
  try { history.replaceState(null, '', h); } catch (e) {}
}

function render() {
  if (!host) return;
  syncHash();
  const body = view === 'edit' ? editHtml() : view === 'paper' ? paperView() : listHtml();
  const foot = msg ? `<p class="ck-msg err" role="status">${esc(msg)}</p>`
    : busy ? '<p class="ck-msg">저장하는 중</p>'
    : okMsg ? `<p class="ck-msg" role="status">${esc(okMsg)}</p>`
    : !shared() ? '<p class="ck-msg">이 브라우저에만 저장됩니다</p>' : '';
  const keep = host.querySelector('.ck-body'); const top = keep ? keep.scrollTop : 0;
  host.innerHTML = `<div class="ck qt qt-v-${view}"><div class="ck-body">${body}</div>${foot}</div>`;
  const b = host.querySelector('.ck-body'); if (b) b.scrollTop = top;
}

// ─── 목록 ───
function listHtml() {
  const count = s => quotes.filter(q => s === ALL || q.status === s).length;
  const month = ymd(new Date()).slice(0, 7);
  const won_ = quotes.filter(q => q.status === '계약' && String(q.updatedAt || q.createdAt).slice(0, 7) === month);
  const head = `<div class="crm-week">
    <div><h2>견적</h2><p>작성중 ${count('작성중')}<i class="dot">·</i>보냄 ${count('보냄')}<i class="dot">·</i>이번 달 계약 ${won_.length}건${won_.length ? ' ' + won(won_.reduce((m, q) => m + num(q.total), 0)) : ''}</p></div>
    <div class="crm-acts"><button class="pj-btn pri" data-new>+ 새 견적</button></div>
  </div>`;
  const tabs = `<div class="ck-tabs crm-tabs" role="tablist" aria-label="상태">${[ALL].concat(STATUS).map(s =>
    `<button class="ck-tab" role="tab" data-stab="${esc(s)}" aria-selected="${ui.status === s}"><span class="nm">${s === ALL ? '전체' : esc(s)}</span><span class="ct">${count(s)}</span></button>`).join('')}
    <label class="crm-q"><input class="qt-lq" value="${esc(ui.q)}" placeholder="고객·제목·번호·품목 찾기" aria-label="견적 찾기" autocomplete="off"></label></div>`;
  const term = ui.q.trim().toLowerCase();
  const list = quotes.filter(q => (ui.status === ALL || q.status === ui.status) &&
    (!term || [q.no, q.name, q.title, q.memo, q.note, q.owner, (q.items || []).map(it => it.name + ' ' + it.spec).join(' ')].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const rows = list.map(q => {
    const c = q.cid && cById(q.cid);
    return `<li><button class="qt-row s-${STATUS.indexOf(q.status)}" data-open="${esc(q.id)}">
      <span class="st">${esc(q.status)}</span>
      <span class="mn"><span class="nm">${esc(q.name)}${c ? `<small>고객관리 ${esc(c.stage)}</small>` : ''}</span>
        ${q.title ? `<span class="it">${esc(q.title)}</span>` : ''}
        <span class="me">${esc(q.no)}<i class="dot">·</i>품목 ${(q.items || []).length}개${q.owner ? `<i class="dot">·</i>${esc(q.owner)}` : ''}</span></span>
      <span class="rt"><span class="tt">${won(q.total)}</span><span class="ow">${esc(fmtDay(q.updatedAt || q.createdAt))}</span></span>
    </button></li>`;
  }).join('');
  const empty = !loaded && !quotes.length ? '<p class="ck-none">견적을 불러오는 중입니다.</p>'
    : !quotes.length ? `<div class="crm-empty"><p>아직 견적이 없습니다. 고객 건을 고르고 이카운트 품목을 찾아 넣으면 합계와 견적서가 바로 만들어집니다.</p><button class="pj-btn pri" data-new>+ 새 견적</button></div>`
    : !list.length ? '<p class="ck-none">조건에 맞는 견적이 없습니다.</p>' : '';
  return `${head}${tabs}${empty || `<ol class="qt-rows">${rows}</ol>`}`;
}

// ─── 편집 ───
function custOptions(sel) {
  const live = customers.filter(c => LIVE_STAGES.includes(c.stage) || c.id === sel)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const label = c => `${c.name}${c.item ? ' · ' + c.item : ''} (${c.stage})`;
  let html = `<option value="">연결 안 함</option>`;
  html += live.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(label(c))}</option>`).join('');
  if (sel && !cById(sel)) html += `<option value="${esc(sel)}" selected>연결된 고객 건 (불러오는 중)</option>`;
  return html;
}

function lineHtml(it, first) {
  const amt = Math.round((+it.qty || 0) * (+it.price || 0));
  return `<li class="qt-line${first ? ' first' : ''}" data-k="${esc(it.k)}">
    <select data-lf="cat" aria-label="구분">${CATS.map(c => `<option${c === it.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <input data-lf="name" value="${esc(it.name)}" placeholder="품명" aria-label="품명" maxlength="120">
    <input data-lf="spec" value="${esc(it.spec)}" placeholder="규격·옵션·컬러" aria-label="규격" maxlength="160">
    <input data-lf="qty" value="${esc(it.qty)}" inputmode="decimal" aria-label="수량" class="n">
    <input data-lf="price" value="${it.price ? esc(comma(it.price)) : ''}" inputmode="numeric" placeholder="단가" aria-label="단가 (부가세 포함)" class="n">
    <span class="amt" data-amt>${amt ? comma(amt) : ''}</span>
    <button type="button" class="x" data-dl="${esc(it.k)}" aria-label="이 줄 지우기" title="지우기"><svg class="i"><use href="#i-close"/></svg></button>
    ${it.code ? `<span class="cd">이카운트 ${esc(it.code)}</span>` : ''}
  </li>`;
}

function sumHtml(d) {
  const s = sums(d);
  return `<dl class="qt-sum" data-sum>
    <div><dt>합계</dt><dd>${won(s.sub)}</dd></div>
    <div class="dc"><dt><label for="qtDisc">할인</label></dt><dd><input id="qtDisc" data-f="discount" value="${s.disc ? esc(comma(s.disc)) : ''}" inputmode="numeric" placeholder="0 또는 5%" aria-describedby="qtDiscH"><span id="qtDiscH" class="h">금액이나 %로 적음</span></dd></div>
    <div class="tt"><dt>견적 금액<small>부가세 포함</small></dt><dd>${won(s.total)}</dd></div>
    <div class="vx"><dt>공급가액 · 부가세</dt><dd>${won(s.supply)} · ${won(s.vat)}</dd></div>
  </dl>`;
}

function searchHtml() {
  const ok = stk() && stk().configured && stk().configured() && stk().api;
  let res = '';
  if (srch.q) {
    if (!ok) res = '<p class="qt-snote">이카운트 연결 전입니다. 직접 입력으로 넣어 주세요.</p>';
    else if (srch.state === 'loading' && !srch.items.length) res = '<p class="qt-snote">찾는 중</p>';
    else if (srch.state && srch.state !== 'loading') res = `<p class="qt-snote err">${esc(srch.state)}</p>`;
    else if (!srch.items.length) res = `<p class="qt-snote">“${esc(srch.q)}”와 맞는 이카운트 품목이 없습니다. 직접 입력을 써 주세요.</p>`;
    else res = `<ol class="qt-sres" role="listbox" aria-label="이카운트 품목">${srch.items.map((p, i) => {
      const pr = num(p.price), vp = vatPrice(pr, p.vat);
      const price = !pr ? '단가 없음' : p.vat === 'N' ? `${comma(vp)}원 <small>별도 ${comma(pr)}</small>` : `${comma(vp)}원`;
      return `<li><button type="button" class="qt-sr${i === srch.sel ? ' on' : ''}" data-sr="${i}" role="option" aria-selected="${i === srch.sel}">
        <span class="nm">${esc(p.name)}${p.size ? `<small>${esc(p.size)}</small>` : ''}</span><span class="cd">${esc(p.code)}</span><span class="pr">${price}</span></button></li>`;
    }).join('')}</ol>`;
  }
  return `<div class="qt-add">
    <select data-scat aria-label="넣을 구분">${CATS.map(c => `<option${c === ui.scat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label class="qt-sbox"><svg class="i"><use href="#i-search"/></svg><input class="qt-sq" value="${esc(srch.q)}" placeholder="이카운트 품목 찾기 (이름, 품목코드, 바코드)" aria-label="이카운트 품목 찾기" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
    <button type="button" class="pj-btn" data-manual>직접 입력</button>
  </div><div class="qt-sresw" data-sres>${res}</div>`;
}

function editHtml() {
  const d = draft; if (!d || d._wait) return '<p class="ck-none">견적을 불러오는 중입니다.</p>';
  sortItems(d);
  const ms = members(); if (d.owner && !ms.includes(d.owner)) ms.push(d.owner);
  const c = d.cid && cById(d.cid);
  let prevCat = null;
  const lines = d.items.map(it => { const f = it.cat !== prevCat; prevCat = it.cat; return lineHtml(it, f); }).join('');
  return `<div class="pj-head">
    <button class="pj-back" data-back><span aria-hidden="true">←</span> 견적 목록</button>
    <div class="pj-ttl"><h2>${d.no ? esc(d.no) : '새 견적'}${d.name ? `<small>${esc(d.name)}</small>` : ''}</h2>
      <div class="seg qt-seg" role="group" aria-label="상태">${STATUS.map(s => `<button type="button" data-st="${esc(s)}" aria-pressed="${d.status === s}">${esc(s)}</button>`).join('')}</div></div>
    <p class="pj-meta">${[d.createdAt ? `${fmtDay(d.createdAt)} 작성` : '저장 전', d.author ? esc(d.author) : '', d.updatedAt ? `${fmtDay(d.updatedAt)} 수정` : ''].filter(Boolean).join('<i class="dot">·</i>')}
      ${c ? `<i class="dot">·</i><button class="qt-link" data-crm="${esc(c.id)}">고객관리에서 보기 (${esc(c.stage)})</button>` : ''}</p>
  </div>
  <div class="pj-form qt-form">
    <label class="wide2"><span>고객 건 (고객관리)</span><select data-f="cid">${custOptions(d.cid)}</select></label>
    <label><span>고객명</span><input data-f="name" value="${esc(d.name)}" maxlength="40" placeholder="견적서에 '○○○ 님'으로 나옴"></label>
    <label><span>담당</span><select data-f="owner"><option value="">없음</option>${ms.map(m => `<option${m === d.owner ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label class="wide2"><span>견적 제목</span><input data-f="title" value="${esc(d.title)}" maxlength="120" placeholder="몰튼 SST 와이드 커스텀 빌드"></label>
    <label><span>유효기간</span><input type="date" data-f="valid" value="${esc(d.valid)}"></label>
  </div>
  <section class="ck-group"><h2 class="sec-h ko"><span>품목<small>단가는 부가세 포함 금액</small></span><span class="n">${d.items.length || ''}</span></h2>
    ${d.items.length ? `<div class="qt-lh" aria-hidden="true"><span>구분</span><span>품명</span><span>규격·옵션</span><span class="n">수량</span><span class="n">단가</span><span class="n">금액</span><span></span></div><ol class="qt-lines">${lines}</ol>` : '<p class="ck-none">아래에서 이카운트 품목을 찾거나 직접 입력으로 넣습니다. 구분을 먼저 고르면 그 구분으로 들어갑니다.</p>'}
    ${searchHtml()}
  </section>
  ${sumHtml(d)}
  <div class="pj-form qt-memo">
    <label class="wide"><span>비고 (견적서에 보임)</span><textarea data-f="memo" rows="3" maxlength="2000" placeholder="납기, 사이즈, 옵션 안내">${esc(d.memo)}</textarea></label>
    <label class="wide"><span>내부 메모 (견적서에 안 보임)</span><textarea data-f="note" rows="2" maxlength="2000">${esc(d.note)}</textarea></label>
    <div class="pj-fbtn">
      <button type="button" class="pri" data-save${busy ? ' disabled' : ''}>저장</button>
      <button type="button" data-go="paper">견적서 보기 · 인쇄</button>
      ${d.id ? '<button type="button" data-dup>복제해서 새 견적</button>' : ''}
      ${d.id ? `<button type="button" class="danger" data-del>${delArmed ? '한 번 더 누르면 지워집니다' : '지우기'}</button>` : ''}
    </div>
  </div>`;
}

// ─── 견적서 (A4) ───
function paperHtml(d) {
  const s = sums(d);
  const items = (d.items || []).filter(it => String(it.name || '').trim());
  const groups = [];
  items.map((it, i) => [it, i]).sort((a, b) => catIdx(a[0].cat) - catIdx(b[0].cat) || a[1] - b[1]).forEach(([it]) => {
    let g = groups[groups.length - 1];
    if (!g || g.cat !== it.cat) groups.push(g = { cat: it.cat, items: [] });
    g.items.push(it);
  });
  const rows = groups.map(g => g.items.map((it, i) => {
    const amt = Math.round((+it.qty || 0) * (+it.price || 0));
    return `<tr${i === 0 ? ' class="g"' : ''}>${i === 0 ? `<th scope="rowgroup" rowspan="${g.items.length}">${esc(g.cat)}</th>` : ''}
      <td class="nm">${esc(it.name)}${it.spec ? `<small>${esc(it.spec)}</small>` : ''}</td>
      <td class="n">${esc(it.qty)}</td><td class="n">${comma(it.price)}</td><td class="n">${comma(amt)}</td></tr>`;
  }).join('')).join('');
  const issued = d.createdAt ? String(d.createdAt).slice(0, 10) : ymd(new Date());
  const meta = [['견적 번호', d.no || '저장 전'], ['견적일', fmtDate(issued)], ['유효기간', d.valid ? fmtDate(d.valid) + '까지' : ''], ['담당', d.owner]]
    .filter(x => x[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  const terms = (Q.TERMS || []).filter(Boolean);
  const from = [Q.ADDRESS, Q.TEL && 'T ' + Q.TEL, Q.WEB, Q.EMAIL].filter(Boolean).map(esc).join('<i>·</i>');
  return `<article class="qt-paper" aria-label="견적서 미리보기">
    <header class="qp-head">
      <div><p class="qp-k">Quotation</p><h1>견적서</h1></div>
      <div class="qp-brand">
        <p class="qp-wm"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14l6 8-13 15L3 13z" fill="#9b2335"/><path d="M3 13h26M9 5l7 23 7-23" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/></svg>${esc(Q.NAME_EN)}</p>
        <p>${esc(Q.NAME)}${Q.CEO ? ` · 대표 ${esc(Q.CEO)}` : ''}</p>
        ${Q.BIZ_NO ? `<p>사업자등록번호 ${esc(Q.BIZ_NO)}</p>` : ''}
      </div>
    </header>
    <section class="qp-to">
      <p class="qp-name">${esc(d.name || '고객')} 님</p>
      ${d.title ? `<p class="qp-title">${esc(d.title)}</p>` : ''}
      <p class="qp-lead">아래와 같이 견적을 드립니다.</p>
    </section>
    <dl class="qp-meta">${meta}</dl>
    <div class="qp-total"><span>견적 금액 <small>부가세 포함</small></span><b>${won(s.total)}</b></div>
    <table class="qp-items">
      <thead><tr><th scope="col" class="c">구분</th><th scope="col">품명 · 규격</th><th scope="col" class="n">수량</th><th scope="col" class="n">단가</th><th scope="col" class="n">금액</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="none">품목이 없습니다</td></tr>'}</tbody>
    </table>
    <dl class="qp-sum">
      <div><dt>합계</dt><dd>${won(s.sub)}</dd></div>
      ${s.disc ? `<div><dt>할인</dt><dd>− ${won(s.disc)}</dd></div>` : ''}
      <div class="tt"><dt>견적 금액</dt><dd>${won(s.total)}</dd></div>
      <div class="vx"><dt>공급가액 · 부가세</dt><dd>${won(s.supply)} · ${won(s.vat)}</dd></div>
    </dl>
    ${d.memo || terms.length ? `<section class="qp-notes"><h2>비고</h2>
      ${d.memo ? `<p class="memo">${esc(d.memo)}</p>` : ''}
      ${terms.length ? `<ul>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</section>` : ''}
    <footer class="qp-foot"><span>${esc(Q.NAME)}</span>${from ? `<span>${from}</span>` : ''}</footer>
  </article>`;
}

function paperView() {
  if (!draft) return '';
  return `<div class="pj-head qt-ptop">
    <button class="pj-back" data-go="edit"><span aria-hidden="true">←</span> 견적으로</button>
    <div class="crm-acts"><button class="pj-btn pri" data-print>인쇄 · PDF 저장</button></div>
  </div>
  ${dirty ? '<p class="qt-warn">저장하지 않은 변경이 있습니다. 견적서는 지금 화면 내용으로 나옵니다.</p>' : ''}
  <div class="qt-pwrap">${paperHtml(draft)}</div>
  <p class="qt-phint">인쇄 창에서 대상을 'PDF로 저장'으로 고르면 PDF 파일이 됩니다. 머리글·바닥글은 끄고, 용지는 A4로 둡니다.</p>`;
}

/** 견적서만 인쇄 (화면의 다른 부분은 print CSS 로 숨김) */
function printPaper() {
  if (!draft) return;
  let el = document.getElementById('qtPrint');
  if (!el) { el = document.createElement('div'); el.id = 'qtPrint'; document.body.appendChild(el); }
  el.innerHTML = paperHtml(draft);
  const title = document.title;
  // PDF로 저장할 때 파일 이름이 됨
  document.title = ['견적서', draft.no, draft.name].filter(Boolean).join(' ');
  document.documentElement.classList.add('qt-print');
  const done = () => {
    document.documentElement.classList.remove('qt-print');
    document.title = title; el.innerHTML = '';
    removeEventListener('afterprint', done);
  };
  addEventListener('afterprint', done);
  window.print();
}

// ─────────── 저장 ───────────
const saveCache = () => ls.set(K_CACHE(), JSON.stringify({ quotes, customers }));
function readLocal() {
  quotes = readJson(K_LOCAL, []);
  customers = (readJson('myrubi.crm', {}).customers || []).map(c => ({ id: c.id, name: c.name, info: c.info, group: c.group, item: c.item, stage: c.stage, owner: c.owner }));
}
const writeLocal = () => ls.set(K_LOCAL, JSON.stringify(quotes));

async function load() {
  if (!shared()) { readLocal(); loaded = true; afterLoad(); return; }
  try {
    const j = await MR.get({ action: 'quotes' });
    quotes = j.quotes || []; customers = j.customers || []; loaded = true;
    saveCache(); if (/불러오지/.test(msg) || /배포/.test(msg)) msg = '';
  } catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 견적을 쓸 수 있습니다' : '견적을 불러오지 못했습니다. ' + e.message;
  }
  afterLoad();
}
function afterLoad() {
  // 고객 건을 불러오기 전에 연 새 견적이면 고객명·제목을 채움
  if (draft && pendingCid && view !== 'list') {
    const c = cById(pendingCid);
    if (c) { if (!draft.name) draft.name = c.name; if (!draft.title) draft.title = c.item; }
    pendingCid = '';
  }
  // 아직 안 불러온 견적 id 로 열었던 경우
  if (draft && draft._wait) { const q = qById(draft._wait); if (q) { draft = toDraft(q); dirty = false; } else if (loaded) { draft = null; view = 'list'; } }
  if (!dirty) render();
}

const payload = d => ({
  id: d.id || '', cid: d.cid || '', name: d.name, title: d.title, discount: num(d.discount), memo: d.memo, note: d.note,
  valid: d.valid, status: d.status, owner: d.owner,
  items: d.items.filter(it => String(it.name || '').trim()).map(it => ({ cat: it.cat, name: it.name, spec: it.spec || '', code: it.code || '', qty: qtyNum(it.qty) || 1, price: num(it.price) })),
});

/** 브라우저 저장일 때도 서버와 같은 모양으로 */
function localSave(p) {
  const s = sums(p);
  const prefix = 'Q' + ymd(new Date()).slice(2).replace(/-/g, '') + '-';
  const n = quotes.filter(q => String(q.no).startsWith(prefix)).reduce((m, q) => Math.max(m, parseInt(String(q.no).slice(prefix.length), 10) || 0), 0);
  const base = { subtotal: String(s.sub), discount: String(s.disc), total: String(s.total) };
  const ex = p.id && qById(p.id);
  if (ex) { Object.assign(ex, p, base, { updatedAt: stamp() }); return ex.id; }
  const o = Object.assign({}, p, base, { id: 'lq' + Date.now().toString(36), no: prefix + pad(n + 1), author: me() || '나', createdAt: stamp(), updatedAt: '' });
  quotes.push(o); return o.id;
}

async function run(op, d) {
  busy = true; msg = ''; okMsg = ''; render();
  let out = '';
  try {
    if (shared()) {
      const body = op === 'save' ? payload(d) : { id: d.id, status: d.status };
      const j = await MR.post(Object.assign({ action: 'quote', op }, body));
      quotes = j.quotes || []; customers = j.customers || customers; loaded = true;
      saveCache();
      out = j.saved || (op === 'delete' ? 'ok' : '');
    } else {
      if (op === 'delete') quotes = quotes.filter(q => q.id !== d.id);
      else if (op === 'status') { const q = qById(d.id); if (q) Object.assign(q, { status: d.status, updatedAt: stamp() }); out = d.id; }
      else out = localSave(payload(d));
      writeLocal();
      if (op === 'delete') out = 'ok';
    }
  } catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 견적을 저장할 수 있습니다' : '저장하지 못했습니다. ' + e.message;
    out = '';
  }
  busy = false;
  return out;
}

async function save() {
  if (!draft || busy) return;
  if (!String(draft.name || '').trim()) { msg = '고객명을 적어 주세요'; render(); const f = host.querySelector('[data-f=name]'); if (f) f.focus(); return; }
  if (!draft.items.some(it => String(it.name || '').trim())) { msg = '품목을 하나 이상 넣어 주세요'; render(); return; }
  const linked = draft.cid && cById(draft.cid);
  const before = linked ? linked.stage : '';
  const id = await run('save', draft);
  if (!id) { render(); return; }
  const q = qById(id);
  if (q) draft = toDraft(q);
  dirty = false; leaveArmed = false; delArmed = false;
  const after = draft.cid && cById(draft.cid);
  okMsg = after && before && after.stage !== before ? `저장했습니다. 고객관리 단계가 ${before}에서 ${after.stage}(으)로 넘어갔습니다` : '저장했습니다';
  render();
}

// ─────────── 조작 ───────────
function go(v, d) {
  if (v === 'list' && dirty && !leaveArmed && view === 'edit') {
    leaveArmed = true; okMsg = ''; msg = '저장하지 않은 변경이 있습니다. 한 번 더 누르면 저장하지 않고 나갑니다'; render(); return;
  }
  if (v === 'list') { draft = null; dirty = false; }
  if (d !== undefined) draft = d;
  view = v; leaveArmed = false; delArmed = false; msg = ''; okMsg = '';
  srch.q = ''; srch.items = []; srch.state = '';
  render();
  const b = host && host.querySelector('.ck-body'); if (b) b.scrollTop = 0;
}

function openNew(cid) {
  pendingCid = cid && !cById(cid) ? cid : '';
  go('edit', blank(cid || ''));
  dirty = false;
  setTimeout(() => { const f = host && host.querySelector(draft.cid ? '.qt-sq' : '[data-f=cid]'); if (f) f.focus(); }, 30);
}

function addLine(it) {
  if (!draft) return;
  const line = Object.assign({ k: key(), cat: ui.scat, name: '', spec: '', code: '', qty: 1, price: 0 }, it);
  draft.items.push(line);
  dirty = true; msg = ''; okMsg = '';
  return line;
}

function updateSums() {
  const el = host && host.querySelector('[data-sum]'); if (!el || !draft) return;
  const s = sums(draft);
  const dd = el.querySelectorAll('dd');
  dd[0].textContent = won(s.sub);
  dd[2].textContent = won(s.total);
  dd[3].textContent = `${won(s.supply)} · ${won(s.vat)}`;
}

// 이카운트 품목 찾기
function findItems(q) {
  srch.q = q; srch.sel = 0;
  clearTimeout(srch.timer);
  const term = q.trim();
  if (!term) { srch.items = []; srch.state = ''; paintSearch(); return; }
  if (!(stk() && stk().configured() && stk().api)) { srch.items = []; srch.state = ''; paintSearch(); return; }
  srch.state = 'loading'; paintSearch();
  const my = ++srch.seq;
  srch.timer = setTimeout(async () => {
    try {
      const j = await stk().api('search?q=' + encodeURIComponent(term));
      if (my !== srch.seq) return;
      srch.items = (j.items || []).slice(0, 12); srch.state = '';
    } catch (e) {
      if (my !== srch.seq) return;
      srch.items = []; srch.state = e.message || '이카운트 품목을 찾지 못했습니다';
    }
    paintSearch();
  }, 180);
}
/** 검색 결과만 다시 그림 (입력 칸 포커스를 지키려고) */
function paintSearch() {
  const w = host && host.querySelector('[data-sres]'); if (!w) return;
  const tmp = document.createElement('div'); tmp.innerHTML = searchHtml();
  w.innerHTML = tmp.querySelector('[data-sres]').innerHTML;
}
function pickResult(i) {
  const p = srch.items[i]; if (!p) return;
  addLine({ name: p.name, spec: p.size || '', code: p.code, price: vatPrice(num(p.price), p.vat) });
  srch.q = ''; srch.items = []; srch.state = '';
  render();
  const s = host.querySelector('.qt-sq'); if (s) s.focus();
}

function bind() {
  if (bound) return;
  bound = true;
  const inHost = e => host && host.contains(e.target);
  document.addEventListener('click', e => { if (inHost(e)) onClick(e); });
  document.addEventListener('input', e => { if (inHost(e) && !e.isComposing) onInput(e); });
  document.addEventListener('compositionend', e => { if (inHost(e)) onInput(e); });
  document.addEventListener('change', e => { if (inHost(e)) onChange(e); });
  document.addEventListener('keydown', e => { if (inHost(e)) onKey(e); }, true);
}

async function onClick(e) {
  const t = e.target;
  const hit = s => t.closest(s);
  if (hit('[data-new]')) { openNew(''); return; }
  if (hit('[data-open]')) { const q = qById(hit('[data-open]').dataset.open); if (q) go('edit', toDraft(q)); return; }
  if (hit('[data-stab]')) { ui.status = hit('[data-stab]').dataset.stab; saveUi(); render(); return; }
  if (hit('[data-back]')) { go('list'); return; }
  if (hit('[data-go]')) { const v = hit('[data-go]').dataset.go; if (v === 'list') go('list'); else { view = v; msg = ''; okMsg = ''; render(); const b = host.querySelector('.ck-body'); if (b) b.scrollTop = 0; } return; }
  if (hit('[data-crm]')) { const id = hit('[data-crm]').dataset.crm; if (dirty) { msg = '저장한 뒤에 고객관리로 넘어가 주세요'; render(); return; } location.hash = '#customers/' + encodeURIComponent(id); return; }
  if (hit('[data-st]')) { draft.status = hit('[data-st]').dataset.st; dirty = true; host.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.st === draft.status))); return; }
  if (hit('[data-dl]')) { const k = hit('[data-dl]').dataset.dl; draft.items = draft.items.filter(it => it.k !== k); dirty = true; render(); return; }
  if (hit('[data-manual]')) {
    const line = addLine({ name: srch.q.trim() });
    srch.q = ''; srch.items = []; render();
    const f = host.querySelector(`[data-k="${line.k}"] [data-lf=${line.name ? 'price' : 'name'}]`); if (f) f.focus();
    return;
  }
  if (hit('[data-sr]')) { pickResult(+hit('[data-sr]').dataset.sr); return; }
  if (hit('[data-save]')) { save(); return; }
  if (hit('[data-print]')) { printPaper(); return; }
  if (hit('[data-dup]')) {
    const d = toDraft(Object.assign({}, draft, { id: '', no: '', status: STATUS[0], createdAt: '', updatedAt: '', author: '', valid: addDays(+Q.VALID_DAYS || 14), owner: me() || draft.owner }));
    go('edit', d); dirty = true; okMsg = '복제했습니다. 고칠 곳을 고친 뒤 저장하면 새 견적 번호가 붙습니다'; render(); return;
  }
  if (hit('[data-del]')) {
    if (!delArmed) { delArmed = true; render(); return; }
    const ok = await run('delete', { id: draft.id });
    if (ok) { dirty = false; go('list'); okMsg = '견적을 지웠습니다'; render(); } else render();
  }
}

function onInput(e) {
  const t = e.target;
  if (t.classList.contains('qt-lq')) {
    ui.q = t.value; const pos = t.selectionStart; render();
    const q = host.querySelector('.qt-lq'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (er) {} }
    return;
  }
  if (t.classList.contains('qt-sq')) { findItems(t.value); return; }
  if (!draft) return;
  const f = t.dataset.f;
  if (f && f !== 'cid' && f !== 'owner') {
    dirty = true; leaveArmed = false;
    if (f === 'discount') {
      if (t.value.includes('%')) return;   // 5% 처럼 적는 중이면 바꿀 때(change) 계산
      const n = num(t.value); draft.discount = n; t.value = n ? comma(n) : t.value.replace(/[^\d]/g, '');
      updateSums(); return;
    }
    draft[f] = t.value;
    return;
  }
  const lf = t.dataset.lf;
  if (lf && lf !== 'cat') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k); if (!it) return;
    dirty = true; leaveArmed = false;
    if (lf === 'price') {
      const neg = /^\s*-/.test(t.value);
      const n = num(t.value); it.price = n;
      t.value = n ? comma(n) : neg ? '-' : '';
    } else if (lf === 'qty') {
      t.value = t.value.replace(/[^\d.]/g, '');
      it.qty = t.value;
    } else it[lf] = t.value;
    if (lf === 'price' || lf === 'qty') {
      const amt = Math.round((qtyNum(it.qty)) * (+it.price || 0));
      li.querySelector('[data-amt]').textContent = amt ? comma(amt) : '';
      updateSums();
    }
  }
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-scat]')) { ui.scat = t.value; saveUi(); const s = host.querySelector('.qt-sq'); if (s) s.focus(); return; }
  if (!draft) return;
  const f = t.dataset.f;
  if (f === 'cid') {
    const prev = cById(draft.cid), c = cById(t.value);
    // 고객명·제목이 비어 있거나 앞서 고른 고객 건 그대로였으면 새 고객 건으로 채움
    if (c) {
      if (!draft.name || (prev && draft.name === prev.name)) draft.name = c.name;
      if (!draft.title || (prev && draft.title === prev.item)) draft.title = c.item || draft.title;
    }
    draft.cid = t.value; dirty = true; render(); return;
  }
  if (f === 'owner') { draft.owner = t.value; dirty = true; return; }
  if (f === 'discount') {
    const m = t.value.match(/([\d.]+)\s*%/);
    if (m) { const s = sums(Object.assign({}, draft, { discount: 0 })); draft.discount = Math.round(s.sub * (+m[1] || 0) / 100 / 10) * 10; t.value = draft.discount ? comma(draft.discount) : ''; }
    else { draft.discount = num(t.value); }
    const s = sums(draft); if (s.disc !== draft.discount) { draft.discount = s.disc; t.value = s.disc ? comma(s.disc) : ''; }
    updateSums(); return;
  }
  if (t.dataset.lf === 'cat') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k);
    if (it) { it.cat = t.value; dirty = true; render(); }
    return;
  }
  if (t.dataset.lf === 'qty') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k);
    if (it) { it.qty = qtyNum(it.qty) || 1; t.value = it.qty; const amt = Math.round(it.qty * (+it.price || 0)); li.querySelector('[data-amt]').textContent = amt ? comma(amt) : ''; updateSums(); }
  }
}

function onKey(e) {
  const t = e.target;
  if (t.classList && t.classList.contains('qt-sq') && !e.isComposing && e.keyCode !== 229) {
    if (e.key === 'ArrowDown' && srch.items.length) { e.preventDefault(); srch.sel = (srch.sel + 1) % srch.items.length; paintSearch(); return; }
    if (e.key === 'ArrowUp' && srch.items.length) { e.preventDefault(); srch.sel = (srch.sel - 1 + srch.items.length) % srch.items.length; paintSearch(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (srch.items.length && srch.state !== 'loading') pickResult(srch.sel); return; }
    if (e.key === 'Escape' && t.value) { e.preventDefault(); e.stopPropagation(); t.value = ''; findItems(''); return; }
  }
  // 줄 안에서 Enter: 다음 칸으로 (마지막 칸이면 품목 찾기로)
  if (e.key === 'Enter' && t.dataset && t.dataset.lf && t.tagName === 'INPUT') {
    e.preventDefault();
    const inputs = [...host.querySelectorAll('.qt-lines input, .qt-sq')];
    const i = inputs.indexOf(t); if (inputs[i + 1]) inputs[i + 1].focus();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && view === 'edit') { e.preventDefault(); e.stopPropagation(); save(); return; }
  if (e.key !== 'Escape') return;
  if (t.classList && t.classList.contains('qt-lq') && t.value) { e.stopPropagation(); ui.q = ''; render(); return; }
  if (view === 'paper') { e.stopPropagation(); view = 'edit'; render(); return; }
  if (view === 'edit') { e.stopPropagation(); go('list'); }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && host && shared() && !dirty && !busy) load(); });

// ─────────── 공개 ───────────
window.MYRUBI_QUOTE = {
  /** 패널 안에 붙이기. arg: '' 목록 / 'new' 새 견적 / 'new/고객건ID' 그 고객 건으로 새 견적 / 견적 ID */
  mount(el, arg) {
    host = el; bind();
    if (shared()) { const c = readJson(K_CACHE(), null); if (c && !quotes.length) { quotes = c.quotes || []; customers = c.customers || []; } }
    else readLocal();
    view = 'list'; draft = null; dirty = false; msg = ''; okMsg = ''; leaveArmed = false; delArmed = false;
    arg = String(arg || '');
    const nm = arg.match(/^new(?:\/(.+))?$/);
    if (nm) { openNew(nm[1] || ''); }
    else if (arg) {
      const q = qById(arg);
      if (q) { view = 'edit'; draft = toDraft(q); }
      else { view = 'edit'; draft = Object.assign(blank(''), { _wait: arg }); }
      render();
    } else render();
    load();
  },
  unmount() { host = null; draft = null; dirty = false; },
  show(arg) { if (host) this.mount(host, arg); },
  // 확인용
  _sums: sums, _paper: paperHtml,
};
})();
