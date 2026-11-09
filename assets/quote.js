// My Rubi 견적
// 예전 견적 시트(몰튼·바스티온 Log 시트의 DB·마스터·견적 테이블 탭)를 포털 안으로 옮긴 앱
// - 품목: 분류 › 세부항목 › 모델명, 소비자가 → 할인율 → 견적가, 비고·시리얼·전표처리. 증정은 할인율 100%
//   이카운트 품목 목록에서 찾아 넣으면 판매단가가 소비자가로 들어감 (NAS 재고 조회 서비스, assets/stock.js 의 api)
// - 금액: 견적가 합계와 별개로 협의한 최종 견적 금액을 적을 수 있고, 소비자가 합계와의 차이가 '스페셜오퍼'
// - 지불 현황(예약금·잔금·차액결제)과 결제 요청 금액, 자전거 정보(시리얼·프레임 넘버·출고일), 빌드 사양
// - 문서: Purchase Journey Log (견적 사항·지불 현황 / 빌드 사양 / 세부 품목), 같은 고객 건의 견적 비교표
// - 기록: 그 시점의 견적 전체를 이름 붙여 남김 (예전 시트의 날짜별·결제 단계별 탭)
// - 저장: 로그인하면 Index 스프레드시트의 '견적'·'견적기록' 탭 (Code.gs 의 quotes·quote·quotesnap), 로그인 전에는 이 브라우저
// 고객 정보·입금 계좌는 서버에만 있음. 이 파일이 올라가는 GitHub 리포지토리는 공개라서 고객 이름이나 계좌를 코드에 적지 않음
(() => {
'use strict';

const MR = window.MR, CFG = window.MYRUBI_CONFIG || {};
const Q = Object.assign({
  NAME: '루비워크샵', NAME_EN: 'Rubi Workshop', ADDRESS: '', TEL: '', WEB: '', EMAIL: '', BIZ_NO: '', CEO: '',
  VALID_DAYS: 14, POINT_RATE: 0.05, CARE_YEARS: 1, TERMS: [], CONFIDENTIAL: '',
}, CFG.QUOTE || {});
const K_LOCAL = 'myrubi.quote', K_SNAP = 'myrubi.quote.snaps', K_CACHE_BASE = 'myrubi.quote.cache', K_UI = 'myrubi.quote.ui';
const K_CACHE = () => K_CACHE_BASE + '.' + ((MR && MR.user().email) || '');
const ALL = '*';

// 분류와 세부항목. Code.gs 의 QUOTE_CATS 와 같게
const CATS = ['서비스', '완성차', '프레임', '드라이브트레인', '휠세트', '컴포넌트', '스몰 파츠', '자전거 악세사리', '라이더 이큅먼트'];
const SLOTS = {
  '서비스': ['공임'],
  '완성차': ['자전거'],
  '프레임': ['프레임', '포크', '헤드셋', '랙', '머드가드', '기타'],
  '드라이브트레인': ['그룹 세트', '시프트 레버 세트', '오른쪽 시프트 레버', '왼쪽 시프트 레버', '프론트 드레일러', '리어 드레일러', '크랭크세트 / 크랭크암', '아우터 체인링', '이너 체인링', '체인링 볼트', '스프라켓', '브레이크세트', '프론트 브레이크', '리어 브레이크', '바텀브라켓', '체인', '풀리', '프론트 브레이크 패드 / 로터', '리어 브레이크 패드 / 로터', '브레이크 레버 세트', '케이블 / 튠업 파츠', '인터페이스 / 전자파츠', '배터리', '충전기', '파워미터', '기타'],
  '휠세트': ['휠세트', '프론트 허브', '리어 허브', '프론트 림', '리어 림', '스포크', '니플', '프론트 타이어', '리어 타이어', '프론트 튜브 / 마운팅킷', '리어 튜브 / 마운팅킷', '퀵릴리스 레버 / 쓰루액슬', '기타'],
  '컴포넌트': ['핸들바 / 일체형콕핏', '스템', '시트포스트', '안장', '바테이프 / 그립', '페달', '기타'],
  '스몰 파츠': ['조립부품', '소모품', '볼트너트'],
  '자전거 악세사리': ['보틀 케이지', '벨', '바엔드', '라이트', '악세사리'],
  '라이더 이큅먼트': ['펌프', '헬멧', '슈즈', '클릿', '삭스', '이큅먼트'],
};
const CAT_OLD = { '프레임셋': '프레임', '구동계': '드라이브트레인', '휠·타이어': '휠세트', '콕핏': '컴포넌트', '안장·시트포스트': '컴포넌트', '페달': '컴포넌트', '액세서리': '자전거 악세사리', '공임': '서비스', '기타': '컴포넌트' };
// 문서 '견적 사항'의 분류 묶음 (예전 마스터 탭과 같게)
const SUMMARY = [
  ['프레임', ['완성차', '프레임']], ['구동계', ['드라이브트레인']], ['휠셋', ['휠세트']], ['컴포넌트', ['컴포넌트']],
  ['옵션아이템', ['스몰 파츠', '자전거 악세사리']], ['이큅먼트', ['라이더 이큅먼트']], ['서비스', ['서비스']],
];
// 빌드 사양 (예전 마스터 탭 아래쪽). 키는 Code.gs 에서 영문·숫자만 받음
const SPEC = [
  { title: '프레임', fields: [['size', '사이즈'], ['fork', '포크 또는 서스펜션'], ['bb', '바텀브라켓 규격'], ['clear', '타이어 클리어런스 (표준 | 너비)'], ['load', '한계 체중']] },
  { title: '드라이브트레인', fields: [['shift', '시프트 시스템'], ['shifter', '시프터'], ['fgear', '프론트기어 레이아웃'], ['rgear', '리어기어 레이아웃'], ['rotor', '로터 레이아웃'],
    ['brake', '브레이크 시스템'], ['caliper', '캘리퍼'], ['crank', '크랭크'], ['ring', '체인링'], ['crankLen', '크랭크암 길이']] },
  { title: '휠세트', fields: [['wheel', '휠 모델'], ['wheelSn', '휠 시리얼'], ['rimType', '림 유형'], ['tire', '타이어'], ['rimPsi', '림 최대 허용 공기압 (표준 | 공기압)'],
    ['rimSize', '림 사이즈'], ['spoke', '스포크 레이아웃'], ['tireType', '타이어 유형'], ['mount', '타이어 마운팅킷'], ['tirePsi', '권장 타이어 공기압 (표준 | 공기압)'],
    ['tireWidth', '타이어 너비 (F/R)'], ['wheelLoad', '휠 한계 체중']] },
  { title: '어셈블리 컴포넌트', fields: [['espBar', 'ESP to BAR'], ['bar', '핸들바'], ['stem', '스템'], ['post', '시트포스트'], ['postSpec', '시트포스트 규격'],
    ['bbEsp', 'BB to ESP'], ['saddle', '새들'], ['grip', '그립'], ['pedal', '페달'], ['weight', '무게 (조립 QC 기준)']] },
];
const STATUS = ['작성중', '보냄', '계약', '취소'];
const PAY_LABELS = ['계약금', '50% 예약금', '프레임 잔금', '최종 잔금', '완성차 지불', '차액결제'];
const PAY_METHODS = ['신용카드', '계좌이체', '현금 (현금영수증)', '현금', '마일리지', '루비워크샵 사이트', '네이버페이'];
const SNAP_LABELS = ['견적', '50% 예약금', '프레임 잔금', '최종 잔금', '출고'];
const LIVE_STAGES = ['문의', '상담', '견적', '계약금', '예약금', '발주', '입고', '조립', '출고', '루비케어'];
const CONFIDENTIAL = Q.CONFIDENTIAL || '본 문서는 루비컴퍼니와 고객 간에 교환된 기밀 정보를 담고 있으므로, 어떠한 경우에도 루비컴퍼니의 사전 허가 없이 외부로 유출되어서는 안 됩니다. 이에 대한 엄중한 준수를 요청드립니다.';

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
const fmtDot = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const fmtKo = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}년 ${+m[2]}월 ${+m[3]}일` : ''; };
const num = v => { const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''))); return isFinite(n) ? n : 0; };
const rateNum = v => { const n = Math.round((Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0) * 100) / 100; return Math.max(0, Math.min(100, n)); };
const qtyNum = v => Math.round((Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0) * 100) / 100;
const comma = n => (Math.round(+n || 0)).toLocaleString('ko-KR');
const won = n => comma(n) + '원';
const paren = n => n < 0 ? `(${comma(-n)})` : comma(n);   // 문서의 음수 표기 (예전 시트와 같게)
const pct = r => (Math.round(r * 100) / 100).toString();
const key = () => Math.random().toString(36).slice(2, 9);
const shared = () => !!(MR && MR.loginEnabled() && MR.session());
const stk = () => window.MYRUBI_STOCK;
const members = () => (CFG.MEMBERS || []).slice();
function me() {
  const u = MR ? MR.user() : null; if (!u) return '';
  const al = CFG.MEMBER_ALIASES || {};
  return al[u.email] || al[u.name] || u.name || '';
}
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const catIdx = c => { const i = CATS.indexOf(c); return i < 0 ? CATS.length : i; };
const careEnd = ship => { const m = String(ship || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[1] + (+Q.CARE_YEARS || 1)}-${m[2]}-${m[3]}` : ''; };
const bikeName = d => [d.brand, d.model, d.color].filter(Boolean).join(' ');

/** 이카운트 단가 → 소비자가 (부가세 포함). 별도(N)로 된 단가는 10% 더해 10원 단위로 */
const vatPrice = (price, vat) => vat === 'N' ? Math.round(price * 1.1 / 10) * 10 : Math.round(price);
const linePrice = (list, rate) => Math.round(list * (1 - rate / 100));

/** 금액 한 벌. 예전 시트의 DB 탭 합계와 마스터 탭 '견적 사항'·'지불 현황' */
function calc(d) {
  const items = (d.items || []).filter(it => String(it.name || '').trim());
  let L = 0, P = 0;
  const byCat = {};
  items.forEach(it => {
    const q = qtyNum(it.qty) || 1, l = Math.round(num(it.list) * q), p = Math.round(num(it.price) * q);
    L += l; P += p; byCat[it.cat] = (byCat[it.cat] || 0) + l;
  });
  const hasFinal = d.final !== '' && d.final != null;
  const F = hasFinal ? num(d.final) : P;
  const paid = (d.payments || []).reduce((m, p) => m + num(p.amount), 0);
  const supply = Math.round(F / 1.1);
  const summary = SUMMARY.map(([label, cats]) => [label, cats.reduce((m, c) => m + (byCat[c] || 0), 0)]);
  return {
    L, P, F, hasFinal, lineDisc: L - P, offer: F - L, rate: L ? (1 - F / L) * 100 : 0,
    points: Math.round(F * (+Q.POINT_RATE || 0)), supply, vat: F - supply, paid, remain: F - paid, summary,
  };
}

// ─────────── 상태 ───────────
let quotes = [];      // 서버 견적 (Code.gs quoteOut_)
let customers = [];   // 고객관리 고객 건 요약 { id, name, info, group, item, stage, owner }
let snaps = [];       // 기록 목록 { id, qid, no, label, total, by, at } (내용은 열 때 받아옴)
let bank = '';        // 입금 계좌 (서버 스크립트 속성 QUOTE_BANK)
let codes = [];       // 고객코드 (포털 로그인) { code, ckey, name, issuedAt, by, logins, lastLogin }
let recodeArmed = false;
let portals = [];     // 고객 포털 공개 상태 { key, qid, publishedAt, by, active, views, lastView } (Code.gs 포털 탭)
let unpubArmed = false;
let pointBal = {};    // 고객 이름(띄어쓰기 뺌)별 마일리지 잔액 (고객관리 마일리지, 시트는 '적립금' 탭)
let loaded = false, busy = false, msg = '', okMsg = '';
let host = null, bound = false;
let view = 'list';    // list | edit | paper | compare
let draft = null;     // 고치는 중인 견적 (items·payments 에 화면용 k 가 붙음)
let paperSrc = null;  // 문서로 볼 견적 (기록을 열면 그 시점 견적)
let paperSnap = null; // 열어 본 기록 { label, at, by }
let dirty = false;
let leaveArmed = false, delArmed = false, snapDelArmed = '';
let pendingCid = '';
const ui = Object.assign({ status: ALL, q: '', scat: '드라이브트레인', rate: 0, docSpec: true, docItems: false }, readJson(K_UI, {}));
const saveUi = () => ls.set(K_UI, JSON.stringify({ status: ui.status, scat: ui.scat, rate: ui.rate, docSpec: ui.docSpec, docItems: ui.docItems }));
const srch = { q: '', items: [], sel: 0, seq: 0, timer: 0, state: '', slot: '' };

const qById = id => quotes.find(q => q.id === id);
const cById = id => customers.find(c => c.id === id);

function blank(cid) {
  const c = cid ? cById(cid) : null;
  return {
    id: '', no: '', cid: cid || '', name: c ? c.name : '', title: '', owner: me(), status: STATUS[0], valid: addDays(+Q.VALID_DAYS || 14),
    brand: '', model: c ? c.item : '', color: '', sn: '', rubiSn: '', fn: '', ship: '',
    items: [], final: '', payments: [], request: { label: '', amount: '' }, spec: {}, memo: '', note: '', createdAt: '',
  };
}
/** 저장된 견적 → 고치는 사본. 첫 판(분류·단가만 있던 품목)도 지금 모양으로 */
function toDraft(q) {
  const d = Object.assign(blank(''), JSON.parse(JSON.stringify(q)));
  d.items = (d.items || []).map(it => {
    const o = Object.assign({ k: key(), slot: '', note: '', sn: '', slip: '', qty: 1 }, it);
    if (o.list == null) { o.list = num(o.price); o.rate = 0; }
    if (!CATS.includes(o.cat)) o.cat = CAT_OLD[o.cat] || '컴포넌트';
    o.list = num(o.list); o.rate = rateNum(o.rate); o.price = num(o.price);
    return o;
  });
  d.payments = (d.payments || []).map(p => Object.assign({ k: key(), label: '', date: '', amount: 0, method: '' }, p));
  d.request = Object.assign({ label: '', amount: '' }, d.request || {});
  d.spec = Object.assign({}, d.spec || {});
  d.final = d.final == null || d.final === '' ? '' : num(d.final);
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
  const body = view === 'edit' ? editHtml() : view === 'paper' ? paperView() : view === 'compare' ? compareView() : listHtml();
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
  const unpaid = quotes.filter(q => q.status === '계약' && num(q.total) - num(q.paid) > 0);
  const head = `<div class="crm-week">
    <div><h2>견적</h2><p>작성중 ${count('작성중')}<i class="dot">·</i>보냄 ${count('보냄')}<i class="dot">·</i>이번 달 계약 ${won_.length}건${won_.length ? ' ' + won(won_.reduce((m, q) => m + num(q.total), 0)) : ''}${unpaid.length ? `<i class="dot">·</i>잔금 남은 계약 ${unpaid.length}건 ${won(unpaid.reduce((m, q) => m + num(q.total) - num(q.paid), 0))}` : ''}</p></div>
    <div class="crm-acts"><button class="pj-btn pri" data-new>+ 새 견적</button></div>
  </div>`;
  const tabs = `<div class="ck-tabs crm-tabs" role="tablist" aria-label="상태">${[ALL].concat(STATUS).map(s =>
    `<button class="ck-tab" role="tab" data-stab="${esc(s)}" aria-selected="${ui.status === s}"><span class="nm">${s === ALL ? '전체' : esc(s)}</span><span class="ct">${count(s)}</span></button>`).join('')}
    <label class="crm-q"><input class="qt-lq" value="${esc(ui.q)}" placeholder="고객·모델·번호·시리얼·품목 찾기" aria-label="견적 찾기" autocomplete="off"></label></div>`;
  const term = ui.q.trim().toLowerCase();
  const list = quotes.filter(q => (ui.status === ALL || q.status === ui.status) &&
    (!term || [q.no, q.name, q.title, q.brand, q.model, q.color, q.sn, q.rubiSn, q.fn, q.memo, q.note, q.owner, (q.items || []).map(it => it.name + ' ' + (it.sn || '')).join(' ')].join(' ').toLowerCase().includes(term)))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const rows = list.map(q => {
    const c = q.cid && cById(q.cid);
    const total = num(q.total), paid = num(q.paid);
    const pay = paid ? (total - paid > 0 ? `지불 ${comma(paid)} · 남은 ${comma(total - paid)}` : '지불 완료') : '';
    return `<li><button class="qt-row s-${STATUS.indexOf(q.status)}" data-open="${esc(q.id)}">
      <span class="st">${esc(q.status)}</span>
      <span class="mn"><span class="nm">${esc(q.name)}${c ? `<small>고객관리 ${esc(c.stage)}</small>` : ''}</span>
        <span class="it">${esc(bikeName(q) || q.title || '자전거 미정')}${q.title && bikeName(q) ? `<small>${esc(q.title)}</small>` : ''}</span>
        <span class="me">${esc(q.no)}<i class="dot">·</i>품목 ${(q.items || []).length}개${q.owner ? `<i class="dot">·</i>${esc(q.owner)}` : ''}${q.fn ? `<i class="dot">·</i>F/N ${esc(q.fn)}` : ''}</span></span>
      <span class="rt"><span class="tt">${won(total)}</span>${pay ? `<span class="py">${esc(pay)}</span>` : ''}<span class="ow">${esc(fmtDay(q.updatedAt || q.createdAt))}</span></span>
    </button></li>`;
  }).join('');
  const empty = !loaded && !quotes.length ? '<p class="ck-none">견적을 불러오는 중입니다.</p>'
    : !quotes.length ? `<div class="crm-empty"><p>아직 견적이 없습니다. 고객 건을 고르고 이카운트 품목을 찾아 넣으면 할인율, 최종 금액, 지불 현황까지 한 장에서 관리하고 Purchase Journey Log로 뽑을 수 있습니다.</p><button class="pj-btn pri" data-new>+ 새 견적</button></div>`
    : !list.length ? '<p class="ck-none">조건에 맞는 견적이 없습니다.</p>' : '';
  return `${head}${tabs}${empty || `<ol class="qt-rows">${rows}</ol>`}`;
}

// ─── 편집 ───
function custOptions(sel) {
  const live = customers.filter(c => LIVE_STAGES.includes(c.stage) || c.id === sel).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const label = c => `${c.name}${c.item ? ' · ' + c.item : ''} (${c.stage})`;
  let html = '<option value="">연결 안 함</option>';
  html += live.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(label(c))}</option>`).join('');
  if (sel && !cById(sel)) html += `<option value="${esc(sel)}" selected>연결된 고객 건 (불러오는 중)</option>`;
  return html;
}
const datalists = () => `
  <datalist id="qtPayL">${PAY_LABELS.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <datalist id="qtPayM">${PAY_METHODS.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  <datalist id="qtSnapL">${SNAP_LABELS.concat([ymd(new Date()).slice(2).replace(/-/g, '')]).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
  ${CATS.map((c, i) => `<datalist id="qtSlot${i}">${SLOTS[c].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}`;

function lineHtml(it, first) {
  const q = qtyNum(it.qty) || 1;
  const gift = it.rate >= 100;
  return `<li class="qt-line${first ? ' first' : ''}${gift ? ' gift' : ''}" data-k="${esc(it.k)}">
    <div class="r1">
      <select data-lf="cat" aria-label="분류">${CATS.map(c => `<option${c === it.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <input data-lf="slot" value="${esc(it.slot)}" list="qtSlot${catIdx(it.cat)}" placeholder="세부항목" aria-label="세부항목" maxlength="40">
      <input data-lf="name" value="${esc(it.name)}" placeholder="[브랜드] 모델 - 규격 (컬러)" aria-label="모델명" maxlength="160">
      <input data-lf="list" value="${it.list ? esc(comma(it.list)) : ''}" inputmode="numeric" placeholder="소비자가" aria-label="소비자가" class="n">
      <label class="rt"><input data-lf="rate" value="${it.rate ? esc(pct(it.rate)) : ''}" inputmode="decimal" placeholder="0" aria-label="할인율 %" class="n"><span>%</span></label>
      <input data-lf="price" value="${it.price || it.list ? esc(comma(it.price)) : ''}" inputmode="numeric" placeholder="견적가" aria-label="견적가" class="n">
      <button type="button" class="x" data-dl="${esc(it.k)}" aria-label="이 줄 지우기" title="지우기"><svg class="i"><use href="#i-close"/></svg></button>
    </div>
    <div class="r2">
      <label><span>수량</span><input data-lf="qty" value="${esc(q)}" inputmode="decimal" class="n q"></label>
      <label class="wd"><span>비고</span><input data-lf="note" value="${esc(it.note)}" maxlength="200" placeholder="업그레이드, 임시 장착, 배치 위치"></label>
      <label><span>시리얼</span><input data-lf="sn" value="${esc(it.sn)}" maxlength="60"></label>
      <label class="slip"><input type="checkbox" data-slip${it.slip ? ' checked' : ''}><span>${it.slip ? '전표 ' + esc(fmtDay(it.slip)) : '전표처리'}</span></label>
      <span class="tag">${gift ? '증정' : q > 1 ? `× ${esc(q)} = ${comma(num(it.price) * q)}` : ''}${it.code ? `<i>이카운트 ${esc(it.code)}</i>` : ''}</span>
    </div>
  </li>`;
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
    <select data-scat aria-label="넣을 분류">${CATS.map(c => `<option${c === ui.scat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <input class="qt-sslot" value="${esc(srch.slot)}" list="qtSlot${catIdx(ui.scat)}" placeholder="세부항목" aria-label="넣을 세부항목" maxlength="40">
    <label class="qt-sbox"><svg class="i"><use href="#i-search"/></svg><input class="qt-sq" value="${esc(srch.q)}" placeholder="이카운트 품목 찾기 (이름, 품목코드, 바코드)" aria-label="이카운트 품목 찾기" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
    <button type="button" class="pj-btn" data-manual>직접 입력</button>
  </div><div class="qt-sresw" data-sres>${res}</div>`;
}

function moneyHtml(d) {
  const c = calc(d);
  return `<div class="qt-money">
    <div class="qt-bulk">
      <p class="lb">일괄 할인율</p>
      <div class="row"><label class="rt"><input id="qtRate" value="${ui.rate ? esc(pct(ui.rate)) : ''}" inputmode="decimal" placeholder="0" aria-label="일괄 할인율 %"><span>%</span></label><button type="button" class="pj-btn" data-bulk>모든 줄에 적용</button></div>
      <p class="h">증정(100%) 줄은 그대로 둡니다. 새로 넣는 품목에도 이 할인율이 들어갑니다.</p>
    </div>
    <dl class="qt-sum" data-sum>
      <div><dt>소비자가 합계</dt><dd data-v="L">${won(c.L)}</dd></div>
      <div><dt>줄 할인 <small data-v="lineRate">${c.L ? pct((c.lineDisc / c.L) * 100) + '%' : ''}</small></dt><dd data-v="lineDisc">${c.lineDisc ? '− ' + won(c.lineDisc) : '0원'}</dd></div>
      <div><dt>견적가 합계</dt><dd data-v="P">${won(c.P)}</dd></div>
      <div class="fn"><dt><label for="qtFinal">최종 견적 금액</label><small>비워두면 견적가 합계</small></dt>
        <dd><input id="qtFinal" data-f="final" value="${c.hasFinal ? esc(comma(d.final)) : ''}" placeholder="${esc(comma(c.P))}" inputmode="numeric">
          <span class="rd"><button type="button" data-round="10000">만원 내림</button><button type="button" data-round="100000">10만원 내림</button>${c.hasFinal ? '<button type="button" data-round="0">지우기</button>' : ''}</span></dd></div>
      <div class="tt"><dt>견적 금액<small>부가세 포함</small></dt><dd data-v="F">${won(c.F)}</dd></div>
      <div class="sx"><dt>스페셜오퍼 <small data-v="rate">총 할인 ${pct(c.rate)}%</small></dt><dd data-v="offer">${paren(c.offer)}</dd></div>
      <div class="vx"><dt>적립 예정 ${esc(pct((+Q.POINT_RATE || 0) * 100))}% · 공급가액 · 부가세</dt><dd data-v="vx">${won(c.points)} · ${won(c.supply)} · ${won(c.vat)}</dd></div>
      ${d.name ? `<div class="vx pb"><dt>${esc(d.name)} 고객 마일리지 잔액<small>지불 현황에서 결제 수단을 '마일리지'로 적으면 사용으로 기록</small></dt><dd>${won(pointBal[String(d.name).replace(/\s+/g, '')] || 0)}</dd></div>` : ''}
    </dl>
  </div>`;
}

function payHtml(d) {
  const c = calc(d);
  const rows = d.payments.map((p, i) => `<li class="qt-pay" data-pk="${esc(p.k)}">
    <input data-pf="label" value="${esc(p.label)}" list="qtPayL" placeholder="결제 내용" aria-label="결제 내용" maxlength="60">
    <input type="date" data-pf="date" value="${esc(p.date)}" aria-label="결제 날짜">
    <input data-pf="amount" value="${p.amount ? esc(comma(p.amount)) : ''}" inputmode="numeric" placeholder="금액" aria-label="결제 금액" class="n">
    <input data-pf="method" value="${esc(p.method)}" list="qtPayM" placeholder="결제 수단" aria-label="결제 수단" maxlength="30">
    <button type="button" class="x" data-pdl="${esc(p.k)}" aria-label="이 결제 지우기"><svg class="i"><use href="#i-close"/></svg></button>
  </li>`).join('');
  const rq = d.request || {};
  return `<section class="ck-group"><h2 class="sec-h ko"><span>지불 현황<small>계약금·예약금이 들어오면 고객관리 단계와 계약금이 함께 바뀜</small></span><span class="n">${d.payments.length || ''}</span></h2>
    ${rows ? `<ol class="qt-pays">${rows}</ol>` : ''}
    <button type="button" class="crm-more" data-padd>+ 결제 추가</button>
    <dl class="qt-psum"><div><dt>총 지불 금액</dt><dd data-v="paid">${won(c.paid)}</dd></div><div><dt>남은 금액</dt><dd data-v="remain">${won(c.remain)}</dd></div></dl>
    <div class="qt-req">
      <p class="lb">결제 요청 <small>문서 맨 위에 '결제 요청 금액 (₩) | 단계'로 나옴. 비워두면 남은 금액</small></p>
      <div class="row">
        <input data-rf="label" value="${esc(rq.label)}" list="qtPayL" placeholder="단계 (50% 예약금, 최종 잔금)" aria-label="결제 요청 단계" maxlength="40">
        <input data-rf="amount" value="${rq.amount !== '' && rq.amount != null ? esc(comma(rq.amount)) : ''}" inputmode="numeric" placeholder="금액" aria-label="결제 요청 금액" class="n">
        <button type="button" class="pj-btn" data-req="half">최종 금액의 50%</button>
        <button type="button" class="pj-btn" data-req="remain">남은 금액</button>
        ${rq.label || (rq.amount !== '' && rq.amount != null) ? '<button type="button" class="pj-btn" data-req="clear">비우기</button>' : ''}
      </div>
    </div>
  </section>`;
}

function specHtml(d) {
  const filled = SPEC.some(s => s.fields.some(([k]) => d.spec[k]));
  return `<details class="ck-group qt-spec"${filled ? ' open' : ''}><summary class="sec-h ko"><span>빌드 사양<small>문서 둘째 장, 출고 전에 채움</small></span><span class="n">${SPEC.reduce((m, s) => m + s.fields.filter(([k]) => d.spec[k]).length, 0) || ''}</span></summary>
    ${SPEC.map(s => `<p class="qt-sh">${esc(s.title)}</p><div class="qt-sgrid">${s.fields.map(([k, l]) =>
      `<label><span>${esc(l)}</span><input data-sf="${esc(k)}" value="${esc(d.spec[k])}" maxlength="120"></label>`).join('')}</div>`).join('')}
  </details>`;
}

function snapsHtml(d) {
  if (!d.id) return '';
  const mine = snaps.filter(s => s.qid === d.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `<section class="ck-group"><h2 class="sec-h ko"><span>기록<small>그 시점의 견적을 남겨 둠 (예전 시트의 날짜별·결제 단계별 탭)</small></span><span class="n">${mine.length || ''}</span></h2>
    ${mine.length ? `<ol class="crm-log qt-snaps">${mine.map(s => `<li><span class="at">${esc(fmtDay(s.at))}<small>${esc(String(s.at).slice(11, 16))}</small></span><span class="st">${esc(s.label)}</span>
      <span class="tx"><button class="crm-qlink" data-snap="${esc(s.id)}">문서 보기</button><span class="tv">${won(s.total)}</span></span>
      <span class="by">${esc(s.by)} <button class="qt-sdel" data-snapdel="${esc(s.id)}">${snapDelArmed === s.id ? '한 번 더 누르면 지워짐' : '지우기'}</button></span></li>`).join('')}</ol>` : ''}
    <div class="qt-snapadd"><input class="qt-snapl" list="qtSnapL" placeholder="기록 이름 (50% 예약금, ${esc(ymd(new Date()).slice(2).replace(/-/g, ''))})" aria-label="기록 이름" maxlength="40"><button type="button" class="pj-btn" data-snapadd>지금 내용으로 기록 남기기</button></div>
  </section>`;
}

function editHtml() {
  const d = draft; if (!d || d._wait) return '<p class="ck-none">견적을 불러오는 중입니다.</p>';
  sortItems(d);
  const ms = members(); if (d.owner && !ms.includes(d.owner)) ms.push(d.owner);
  const c = d.cid && cById(d.cid);
  const sibs = d.cid ? quotes.filter(q => q.cid === d.cid && q.status !== '취소') : [];
  let prevCat = null;
  const lines = d.items.map(it => { const f = it.cat !== prevCat; prevCat = it.cat; return lineHtml(it, f); }).join('');
  const care = careEnd(d.ship);
  return `${datalists()}<div class="pj-head">
    <button class="pj-back" data-back><span aria-hidden="true">←</span> 견적 목록</button>
    <div class="pj-ttl"><h2>${d.no ? esc(d.no) : '새 견적'}${d.name ? `<small>${esc(d.name)}</small>` : ''}</h2>
      <div class="seg qt-seg" role="group" aria-label="상태">${STATUS.map(s => `<button type="button" data-st="${esc(s)}" aria-pressed="${d.status === s}">${esc(s)}</button>`).join('')}</div></div>
    <p class="pj-meta">${[d.createdAt ? `${fmtDay(d.createdAt)} 작성` : '저장 전', d.author ? esc(d.author) : '', d.updatedAt ? `${fmtDay(d.updatedAt)} 수정` : ''].filter(Boolean).join('<i class="dot">·</i>')}
      ${c ? `<i class="dot">·</i><button class="qt-link" data-crm="${esc(c.id)}">고객관리에서 보기 (${esc(c.stage)})</button>` : ''}</p>
  </div>
  <div class="pj-form qt-form">
    <label class="wide2"><span>고객 건 (고객관리)</span><select data-f="cid">${custOptions(d.cid)}</select></label>
    <label><span>고객명</span><input data-f="name" value="${esc(d.name)}" maxlength="40" placeholder="문서에 '고객명'으로 나옴"></label>
    <label><span>담당</span><select data-f="owner"><option value="">없음</option>${ms.map(m => `<option${m === d.owner ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label><span>브랜드</span><input data-f="brand" value="${esc(d.brand)}" maxlength="60" placeholder="Moulton"></label>
    <label><span>모델</span><input data-f="model" value="${esc(d.model)}" maxlength="80" placeholder="Flyte Drop"></label>
    <label><span>컬러 · 사양</span><input data-f="color" value="${esc(d.color)}" maxlength="80" placeholder="Royal Blue, Featured Fit"></label>
    <label><span>옵션 이름 (비교표)</span><input data-f="title" value="${esc(d.title)}" maxlength="120" placeholder="kit 1 · 듀라에이스 Di2 · 스코프"></label>
    <label><span>고유 시리얼 (S/N)</span><input data-f="sn" value="${esc(d.sn)}" maxlength="60"></label>
    <label><span>프레임 넘버 (F/N)</span><input data-f="fn" value="${esc(d.fn)}" maxlength="60"></label>
    <label><span>루비 시리얼</span><input data-f="rubiSn" value="${esc(d.rubiSn)}" maxlength="60" placeholder="RB-MTBF-A00001"></label>
    <label><span>유효기간</span><input type="date" data-f="valid" value="${esc(d.valid)}"></label>
    <label><span>출고일</span><input type="date" data-f="ship" value="${esc(d.ship)}"></label>
    <p class="qt-care">루비케어 무상 보증 종료일 <b data-v="care">${care ? esc(fmtKo(care)) : '미정 (출고일을 넣으면 1년 뒤)'}</b></p>
  </div>
  <section class="ck-group"><h2 class="sec-h ko"><span>품목<small>소비자가 · 할인율 · 견적가는 부가세 포함, 증정은 할인율 100</small></span><span class="n">${d.items.length || ''}</span></h2>
    ${d.items.length ? `<div class="qt-lh" aria-hidden="true"><span>분류</span><span>세부항목</span><span>모델명</span><span class="n">소비자가</span><span class="n">할인율</span><span class="n">견적가</span><span></span></div><ol class="qt-lines">${lines}</ol>` : '<p class="ck-none">아래에서 분류와 세부항목을 고르고 이카운트 품목을 찾거나 직접 입력으로 넣습니다.</p>'}
    ${searchHtml()}
  </section>
  ${moneyHtml(d)}
  ${payHtml(d)}
  ${specHtml(d)}
  <div class="pj-form qt-memo">
    <label class="wide"><span>비고 (문서에 보임)</span><textarea data-f="memo" rows="3" maxlength="3000" placeholder="견적 기준(VIP 할인, 페달·파워미터 제외), 납기, 증정 구성">${esc(d.memo)}</textarea></label>
    <label class="wide"><span>내부 메모 (문서에 안 보임)</span><textarea data-f="note" rows="2" maxlength="3000">${esc(d.note)}</textarea></label>
    <div class="pj-fbtn">
      <button type="button" class="pri" data-save${busy ? ' disabled' : ''}>저장</button>
      <button type="button" data-paper>문서 보기 · 인쇄</button>
      ${sibs.length > 1 || (d.cid && !d.id && sibs.length) ? '<button type="button" data-compare>이 고객 건 견적 비교표</button>' : ''}
      ${d.id ? '<button type="button" data-dup>복제해서 새 견적 (다른 kit)</button>' : ''}
      ${d.id ? `<button type="button" class="danger" data-del>${delArmed ? '한 번 더 누르면 지워집니다' : '지우기'}</button>` : ''}
    </div>
  </div>
  ${portalHtml(d)}
  ${snapsHtml(d)}`;
}

// ─── 고객 포털 (portal.rubiworkshop.com) ───
const PORTAL_URL = (CFG.PORTAL_URL || 'https://portal.rubiworkshop.com/').replace(/\/?$/, '/');
const portalLink = key => PORTAL_URL + '#' + key;
/** 고객에게 보여줄 정제본. 줄별 가격·할인율·줄 비고·시리얼·전표·이카운트 코드·내부 메모는 넣지 않음
 *  서버(Code.gs portalClean_)가 이 모양의 칸만 다시 걸러 저장함 */
function portalView(d) {
  const c = calc(d);
  const items = (d.items || []).filter(it => String(it.name || '').trim()).map((it, i) => [it, i])
    .sort((a, b) => catIdx(a[0].cat) - catIdx(b[0].cat) || a[1] - b[1]).map(x => x[0]);
  return {
    no: d.no, issued: String(d.createdAt || '').slice(0, 10), valid: d.valid,
    name: d.name, owner: d.owner, brand: d.brand, model: d.model, color: d.color, title: d.title,
    sn: d.sn, fn: d.fn, rubiSn: d.rubiSn, ship: d.ship, care: careEnd(d.ship),
    summary: c.summary, list: c.L, offer: c.offer, total: c.F, paid: c.paid, remain: c.remain,
    request: d.request && d.request.amount !== '' && d.request.amount != null ? { label: d.request.label || '', amount: num(d.request.amount) } : { label: (d.request || {}).label || '', amount: '' },
    payments: (d.payments || []).filter(p => p.label || num(p.amount)).map(p => ({ label: p.label, date: p.date, amount: num(p.amount), method: p.method })),
    kit: items.map(it => ({ cat: it.cat, slot: it.slot, name: it.name, qty: qtyNum(it.qty) || 1, gift: rateNum(it.rate) >= 100 })),
    spec: SPEC.map(sec => ({ title: sec.title, fields: sec.fields.map(([k, l]) => [l, (d.spec || {})[k] || '']) })),
    memo: d.memo,
  };
}
function portalHtml(d) {
  if (!d.id) return '';
  const p = portals.find(x => x.qid === d.id);
  const q = qById(d.id);
  const stale = p && p.active && q && String(q.updatedAt || '') > String(p.publishedAt || '');
  const head = `<h2 class="sec-h ko"><span>고객 포털<small>portal.rubiworkshop.com, 고객이 고객코드로 로그인해 정제한 견적을 봄</small></span><span class="n">${p && p.active ? '공개 중' : ''}</span></h2>`;
  const what = `<p class="qt-pinfo"><b>보임</b> 자전거·시리얼·보증 종료일, 진행 단계와 날짜, 구성품 이름(증정 표시), 분류별 소비자가 · 스페셜오퍼 · 최종 견적 금액, 결제 내역 · 결제 요청 · 입금 계좌, 빌드 사양, 비고<br><b>안 보임</b> 줄별 소비자가 · 할인율 · 견적가, 줄 비고 · 시리얼, 전표처리, 이카운트 코드, 내부 메모, 마일리지, 기록</p>`;
  if (!shared()) return `<section class="ck-group">${head}<p class="ck-none">로그인한 뒤에 공개할 수 있습니다.</p></section>`;
  if (!p) return `<section class="ck-group">${head}${what}<div class="qt-prow"><button type="button" class="pj-btn pri" data-publish${busy ? ' disabled' : ''}>고객 포털에 공개</button></div></section>`;
  // 고객은 portal.rubiworkshop.com 에서 고객코드로 로그인해 '내 자전거' 목록을 봄 (같은 이름으로 공개한 견적이 모임)
  const preview = portalLink(p.ckey || p.key);
  const together = p.ckey ? portals.filter(x => x.ckey === p.ckey && x.active && x.qid !== p.qid).map(x => qById(x.qid)).filter(Boolean) : [];
  const cd = p.ckey && codes.find(c => c.ckey === p.ckey);
  const codeBox = !p.active ? '<p class="qt-warn">공개를 끝냈습니다. 다시 공개하면 고객 목록에 다시 나타납니다.</p>'
    : cd ? `<div class="qt-code"><div><p class="lb">고객코드 · ${esc(p.name || d.name)}</p><p class="cv" data-codev>${esc(cd.code)}</p></div>
        <div class="bt"><button type="button" class="pj-btn" data-codecopy>코드 복사</button><button type="button" class="pj-btn" data-codemsg>안내 문구 복사</button><a class="pj-btn" href="${esc(preview)}" target="_blank" rel="noopener">포털 미리보기</a></div></div>
      <p class="qt-pmeta">${esc(fmtDay(cd.issuedAt))} ${esc(cd.by)} 발급<i class="dot">·</i>${cd.logins ? `로그인 ${cd.logins}번 (마지막 ${esc(fmtDay(cd.lastLogin))} ${esc(String(cd.lastLogin).slice(11, 16))})` : '아직 로그인하지 않음'}
        <i class="dot">·</i><button type="button" class="qt-link" data-recode>${recodeArmed ? '한 번 더 누르면 새 코드로 바뀌고 예전 코드·로그인이 끊깁니다' : '다시 발급'}</button></p>`
    : `<div class="qt-prow"><button type="button" class="pj-btn pri" data-code${busy ? ' disabled' : ''}>고객코드 발급</button><a class="pj-btn" href="${esc(preview)}" target="_blank" rel="noopener">포털 미리보기</a></div>
      <p class="qt-pmeta">고객은 portal.rubiworkshop.com 에서 이 코드로 로그인해 자기 자전거 목록을 봅니다. 코드는 고객마다 하나, RUBI-가입연도-임의 8자 꼴입니다 (가입연도는 고객관리의 첫 건 연도).</p>`;
  return `<section class="ck-group">${head}
    ${codeBox}
    ${p.active ? `<p class="qt-pmeta">${esc(p.name || d.name)} 고객의 목록에 ${together.length ? `이 견적과 함께 공개 중: ${together.map(x => esc(x.no + (bikeName(x) ? ' ' + bikeName(x) : ''))).join(', ')}` : '지금은 이 견적 하나만 있습니다.'} 동명이인이면 고객관리에서 이름을 구분해 주세요 (예: 홍길동 분당).</p>` : ''}
    <p class="qt-pmeta">${esc(fmtDay(p.publishedAt))} ${esc(String(p.publishedAt).slice(11, 16))} ${esc(p.by)} 공개<i class="dot">·</i>고객이 ${p.views ? `${p.views}번 열어 봄 (마지막 ${esc(fmtDay(p.lastView))} ${esc(String(p.lastView).slice(11, 16))})` : '아직 열어 보지 않음'}</p>
    ${stale ? '<p class="qt-warn">공개한 뒤 견적이 바뀌었습니다. 지금 내용으로 다시 공개해야 고객 화면에 반영됩니다. 진행 단계는 고객관리에서 바로 반영됩니다.</p>' : ''}
    ${what}
    <div class="qt-prow"><button type="button" class="pj-btn pri" data-publish${busy ? ' disabled' : ''}>${p.active ? '지금 내용으로 다시 공개' : '다시 공개'}</button>
      ${p.active ? `<button type="button" class="pj-btn" data-unpublish>${unpubArmed ? '한 번 더 누르면 고객 화면에서 빠집니다' : '공개 끝내기'}</button>` : ''}</div>
  </section>`;
}

// ─── 문서: Purchase Journey Log ───
function brandMark() {
  return `<p class="qp-wm"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 5h14l6 8-13 15L3 13z" fill="#9b2335"/><path d="M3 13h26M9 5l7 23 7-23" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/></svg>${esc(Q.NAME_EN)}</p>`;
}
function footHtml() {
  const from = [Q.ADDRESS, Q.TEL && 'T ' + Q.TEL, Q.WEB, Q.EMAIL].filter(Boolean).map(esc).join('<i>·</i>');
  return `<footer class="qp-foot"><span>${esc(Q.NAME)}${Q.BIZ_NO ? ` · 사업자등록번호 ${esc(Q.BIZ_NO)}` : ''}</span>${from ? `<span>${from}</span>` : ''}</footer>`;
}
function titleLines(d) {
  const lines = [d.brand, d.model, d.color].filter(Boolean);
  return lines.length ? lines.map(esc).join('<br>') : esc(d.title || '자전거');
}

function paperHtml(d, opt) {
  opt = opt || {};
  const c = calc(d);
  const issued = String(opt.at || d.updatedAt || d.createdAt || ymd(new Date())).slice(0, 10);
  const care = careEnd(d.ship);
  const rq = d.request || {};
  let reqVal, reqLab;
  if (rq.amount !== '' && rq.amount != null) { reqVal = won(num(rq.amount)); reqLab = '결제 요청 금액 (₩)' + (rq.label ? ' | ' + rq.label : ''); }
  else if (c.paid > 0 && c.remain <= 0) { reqVal = won(c.F); reqLab = '최종 결제 금액'; }
  else { reqVal = c.remain > 0 ? won(c.remain) : '-'; reqLab = '결제 요청 금액 (₩)' + (rq.label ? ' | ' + rq.label : ''); }
  const sumRows = c.summary.map(([l, v]) => `<tr><th scope="row">${esc(l)}</th><td class="n">${paren(v)}</td></tr>`).join('')
    + `<tr><th scope="row">스페셜오퍼</th><td class="n">${paren(c.offer)}</td></tr>`
    + (c.paid ? `<tr><th scope="row">결제 완료 금액</th><td class="n">${paren(-c.paid)}</td></tr>` : '');
  const pays = (d.payments || []).filter(p => p.label || num(p.amount));
  const payRows = pays.length ? pays.map(p => `<tr><td>${esc(p.label)}</td><td>${esc(fmtKo(p.date))}</td><td class="n">${comma(p.amount)}</td><td>${esc(p.method)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="none">아직 결제 내역이 없습니다</td></tr>';
  const meta = [['견적 번호', d.no || '저장 전'], ['담당', d.owner], ['유효기간', d.valid && !c.paid ? fmtKo(d.valid) + '까지' : '']].filter(x => x[1])
    .map(([k, v]) => `<span><i>${k}</i>${esc(v)}</span>`).join('');
  const terms = (Q.TERMS || []).filter(Boolean);

  const page1 = `<article class="qt-paper" aria-label="Purchase Journey Log">
    <header class="qp-top">${brandMark()}<p class="qp-k"><span>#Purchase Journey Log</span><b>${esc(fmtDot(issued))}</b></p></header>
    <h1 class="qp-model">${titleLines(d)}</h1>
    <dl class="qp-facts">
      <div><dd>${esc(d.name || '-')}</dd><dt>고객명</dt></div>
      <div><dd>${care ? esc(fmtKo(care)) : '미정'}</dd><dt>루비케어 무상 보증 종료일</dt></div>
      <div class="rq"><dd>${esc(reqVal)}</dd><dt>${esc(reqLab)}</dt></div>
    </dl>
    <p class="qp-meta">${meta}</p>
    <div class="qp-two">
      <section><h2>견적 사항</h2>
        <table class="qp-t"><thead><tr><th scope="col">분류</th><th scope="col" class="n">소비자 가격</th></tr></thead><tbody>${sumRows}</tbody>
          <tfoot><tr><th scope="row">총 금액</th><td class="n">${paren(c.F - c.paid)}</td></tr></tfoot></table>
        <p class="qp-note">총 금액은 부가세 포함 최종 견적 금액 ${esc(won(c.F))}에서 결제 완료 금액을 뺀 금액입니다.</p>
      </section>
      <section><h2>지불 현황</h2>
        <table class="qp-t pay"><thead><tr><th scope="col">결제 내용</th><th scope="col">결제 날짜</th><th scope="col" class="n">결제 금액</th><th scope="col">결제 수단</th></tr></thead><tbody>${payRows}</tbody>
          <tfoot><tr><th scope="row" colspan="2">총 지불 금액</th><td class="n">${comma(c.paid)}</td><td></td></tr></tfoot></table>
        ${bank ? `<p class="qp-bank">입금 계좌 ${esc(bank)}</p>` : ''}
      </section>
    </div>
    ${d.memo || terms.length ? `<section class="qp-notes"><h2>비고</h2>${d.memo ? `<p class="memo">${esc(d.memo)}</p>` : ''}${terms.length ? `<ul>${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</section>` : ''}
    <p class="qp-conf">${esc(CONFIDENTIAL)}</p>
    ${footHtml()}
  </article>`;

  const specFilled = SPEC.some(s => s.fields.some(([k]) => (d.spec || {})[k]));
  const page2 = opt.spec && (specFilled || d.sn || d.fn) ? `<article class="qt-paper qp-break" aria-label="빌드 사양">
    <header class="qp-top">${brandMark()}<p class="qp-k"><span>#Build Specification</span><b>${esc(fmtDot(issued))}</b></p></header>
    <div class="qp-spech"><h1 class="qp-model sm">${titleLines(d)}</h1><p>${[d.sn ? 'S/N: ' + esc(d.sn) : 'S/N: -', d.fn ? 'F/N: ' + esc(d.fn) : '', d.rubiSn ? esc(d.rubiSn) : ''].filter(Boolean).join('<i>·</i>')}</p></div>
    ${SPEC.map(s => `<section class="qp-spec"><h2>${esc(s.title)}</h2><dl>${s.fields.map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${esc((d.spec || {})[k] || '-')}</dd></div>`).join('')}</dl></section>`).join('')}
    <p class="qp-conf">${esc(CONFIDENTIAL)}</p>
    ${footHtml()}
  </article>` : '';

  const items = (d.items || []).filter(it => String(it.name || '').trim()).map((it, i) => [it, i])
    .sort((a, b) => catIdx(a[0].cat) - catIdx(b[0].cat) || a[1] - b[1]).map(x => x[0]);
  let prev = null;
  const rows = items.map(it => {
    const first = it.cat !== prev; prev = it.cat;
    const q = qtyNum(it.qty) || 1;
    return `<tr${first ? ' class="g"' : ''}><th scope="row">${first ? esc(it.cat) : ''}</th><td>${esc(it.slot)}</td>
      <td class="nm">${esc(it.name)}${q > 1 ? ` <small>× ${esc(q)}</small>` : ''}${it.note ? `<small class="nt">${esc(it.note)}</small>` : ''}</td>
      <td class="n">${comma(num(it.list) * q)}</td><td class="n">${rateNum(it.rate) >= 100 ? '증정' : rateNum(it.rate) ? pct(rateNum(it.rate)) + '%' : ''}</td><td class="n">${comma(num(it.price) * q)}</td></tr>`;
  }).join('');
  const page3 = opt.items && items.length ? `<article class="qt-paper qp-break" aria-label="세부 품목">
    <header class="qp-top">${brandMark()}<p class="qp-k"><span>#Build Kit</span><b>${esc(fmtDot(issued))}</b></p></header>
    <div class="qp-spech"><h1 class="qp-model sm">${titleLines(d)}</h1><p>${esc(d.name || '')}</p></div>
    <table class="qp-items"><thead><tr><th scope="col" class="c">분류</th><th scope="col" class="s">세부항목</th><th scope="col">모델명</th><th scope="col" class="n">소비자가</th><th scope="col" class="n r">할인율</th><th scope="col" class="n">견적가</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th colspan="3">합계</th><td class="n">${comma(c.L)}</td><td class="n r">${c.L ? pct((c.lineDisc / c.L) * 100) + '%' : ''}</td><td class="n">${comma(c.P)}</td></tr>
        ${c.hasFinal ? `<tr><th colspan="3">최종 견적 금액 (스페셜오퍼 ${paren(c.offer)})</th><td></td><td></td><td class="n">${comma(c.F)}</td></tr>` : ''}</tfoot></table>
    <p class="qp-conf">${esc(CONFIDENTIAL)}</p>
    ${footHtml()}
  </article>` : '';
  return page1 + page2 + page3;
}

function docOptsHtml() {
  return `<div class="qt-dopts" role="group" aria-label="문서에 넣을 장">
    <label><input type="checkbox" checked disabled><span>견적 사항 · 지불 현황</span></label>
    <label><input type="checkbox" data-dopt="docSpec"${ui.docSpec ? ' checked' : ''}><span>빌드 사양</span></label>
    <label><input type="checkbox" data-dopt="docItems"${ui.docItems ? ' checked' : ''}><span>세부 품목 (소비자가 · 할인율 · 견적가)</span></label>
  </div>`;
}

function paperView() {
  const d = paperSrc || draft; if (!d) return '';
  return `<div class="pj-head qt-ptop">
    <button class="pj-back" data-go="edit"><span aria-hidden="true">←</span> 견적으로</button>
    <div class="crm-acts"><button class="pj-btn pri" data-print>인쇄 · PDF 저장</button></div>
  </div>
  ${paperSnap ? `<p class="qt-warn">기록 '${esc(paperSnap.label)}' (${esc(fmtDay(paperSnap.at))} ${esc(String(paperSnap.at).slice(11, 16))}, ${esc(paperSnap.by)})의 문서입니다. 지금 견적과 다를 수 있습니다.</p>`
    : dirty ? '<p class="qt-warn">저장하지 않은 변경이 있습니다. 문서는 지금 화면 내용으로 나옵니다.</p>' : ''}
  ${docOptsHtml()}
  <div class="qt-pwrap">${paperHtml(d, { spec: ui.docSpec, items: ui.docItems, at: paperSnap && paperSnap.at })}</div>
  <p class="qt-phint">인쇄 창에서 대상을 'PDF로 저장'으로 고르면 PDF 파일이 됩니다. 머리글·바닥글은 끄고, 용지는 A4로 둡니다.</p>`;
}

// ─── 비교표 (예전 시트의 '견적 테이블') ───
function compareRows() {
  if (!draft || !draft.cid) return [];
  const list = quotes.filter(q => q.cid === draft.cid && q.status !== '취소' && q.id !== draft.id).map(toDraft);
  list.push(draft);
  return list.sort((a, b) => calc(a).F - calc(b).F);
}
function firstName(d, cat, slots) {
  const it = (d.items || []).find(x => x.cat === cat && (!slots || slots.some(s => String(x.slot).includes(s))) && x.name) || (d.items || []).find(x => x.cat === cat && x.name);
  return it ? it.name.replace(/^\[[^\]]+\]\s*/, '') : '';
}
function compareHtml() {
  const list = compareRows();
  const gifts = (draft.items || []).filter(it => rateNum(it.rate) >= 100 && it.name);
  const rows = list.map(d => {
    const c = calc(d);
    // 빌드 사양에 적은 시프트 시스템·휠 모델을 먼저 쓰고, 없으면 품목에서 대표 줄을 찾음
    const sp = d.spec || {};
    const drive = [sp.shift, sp.shifter].filter(Boolean).join(' ') || firstName(d, '드라이브트레인', ['그룹', '리어 드레일러', '시프트']);
    const wheel = sp.wheel || firstName(d, '휠세트', ['휠세트', '허브', '림']);
    const parts = [['구동계', drive], ['휠', wheel]].filter(x => x[1]);
    return `<tr${d === draft ? ' class="me"' : ''}><td class="op">${esc(d.title || bikeName(d) || d.no || '이 견적')}</td>
      <td>${parts.map(([k, v]) => `<span class="pt"><i>${k}</i>${esc(v)}</span>`).join('')}</td>
      <td class="n">${comma(c.L)}</td><td class="n b">${comma(c.F)}</td><td class="nt">${esc(String(d.memo || '').split('\n')[0])}</td></tr>`;
  }).join('');
  return `<article class="qt-paper" aria-label="견적 비교">
    <header class="qp-top">${brandMark()}<p class="qp-k"><span>#Quotation Options</span><b>${esc(fmtDot(ymd(new Date())))}</b></p></header>
    <h1 class="qp-model">${titleLines(draft)}</h1>
    <dl class="qp-facts"><div><dd>${esc(draft.name || '-')}</dd><dt>고객명</dt></div><div><dd>${esc(draft.owner || '-')}</dd><dt>담당자</dt></div><div><dd>${list.length}가지</dd><dt>견적 구성</dt></div></dl>
    <table class="qp-cmp"><thead><tr><th scope="col">옵션</th><th scope="col">구성</th><th scope="col" class="n">소비자가</th><th scope="col" class="n">견적</th><th scope="col">비고</th></tr></thead><tbody>${rows}</tbody></table>
    ${gifts.length ? `<section class="qp-notes"><h2>기본 구성 · 증정</h2><ul>${gifts.map(g => `<li>${esc(g.name)}${g.note ? ` (${esc(g.note)})` : ''}</li>`).join('')}</ul></section>` : ''}
    ${draft.memo ? `<section class="qp-notes"><h2>비고</h2><p class="memo">${esc(draft.memo)}</p></section>` : ''}
    <p class="qp-conf">${esc(CONFIDENTIAL)}</p>
    ${footHtml()}
  </article>`;
}
function compareView() {
  return `<div class="pj-head qt-ptop">
    <button class="pj-back" data-go="edit"><span aria-hidden="true">←</span> 견적으로</button>
    <div class="crm-acts"><button class="pj-btn pri" data-print>인쇄 · PDF 저장</button></div>
  </div>
  <p class="qt-warn">같은 고객 건의 견적(취소 제외)을 견적 금액 순으로 놓았습니다. 옵션 이름은 각 견적의 '옵션 이름', 비고는 각 견적 비고의 첫 줄, 증정은 지금 견적의 할인율 100% 품목입니다.</p>
  <div class="qt-pwrap">${compareHtml()}</div>`;
}

/** 지금 보이는 문서만 인쇄 (화면의 다른 부분은 print CSS 로 숨김) */
function printPaper() {
  const src = host && host.querySelector('.qt-pwrap'); if (!src) return;
  let el = document.getElementById('qtPrint');
  if (!el) { el = document.createElement('div'); el.id = 'qtPrint'; document.body.appendChild(el); }
  el.innerHTML = src.innerHTML;
  const d = paperSrc || draft || {};
  const title = document.title;
  // PDF로 저장할 때 파일 이름이 됨. 예전 시트 이름(00_Log_고객_브랜드_모델_날짜)과 같은 꼴
  const date = String((paperSnap && paperSnap.at) || ymd(new Date())).slice(0, 10).replace(/-/g, '');
  document.title = [view === 'compare' ? '00_Quote' : '00_Log', d.name, d.brand, d.model, paperSnap ? paperSnap.label : '', date].filter(Boolean).join('_').replace(/\s+/g, ' ');
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
const saveCache = () => ls.set(K_CACHE(), JSON.stringify({ quotes, customers, snaps }));
function readLocal() {
  quotes = readJson(K_LOCAL, []);
  snaps = readJson(K_SNAP, []).map(s => { const o = Object.assign({}, s); delete o.data; return o; });
  pointBal = {}; (readJson('myrubi.crm', {}).points || []).forEach(p => { const k = String(p.name).replace(/\s+/g, ''); pointBal[k] = (pointBal[k] || 0) + (+p.amount || 0); });
  customers = (readJson('myrubi.crm', {}).customers || []).map(c => ({ id: c.id, name: c.name, info: c.info, group: c.group, item: c.item, stage: c.stage, owner: c.owner }));
}
const writeLocal = () => ls.set(K_LOCAL, JSON.stringify(quotes));

function take(j) {
  quotes = j.quotes || []; customers = j.customers || customers; snaps = j.snaps || []; bank = j.bank || ''; pointBal = j.pointBalance || {}; portals = j.portals || []; codes = j.codes || []; loaded = true;
  saveCache();
}
async function load() {
  if (!shared()) { readLocal(); loaded = true; afterLoad(); return; }
  try {
    take(await MR.get({ action: 'quotes' }));
    if (/불러오지|배포/.test(msg)) msg = '';
  } catch (e) {
    msg = /unknown action/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 견적을 쓸 수 있습니다' : '견적을 불러오지 못했습니다. ' + e.message;
  }
  afterLoad();
}
function afterLoad() {
  if (draft && pendingCid && view !== 'list') {
    const c = cById(pendingCid);
    if (c) { if (!draft.name) draft.name = c.name; if (!draft.model && !draft.brand) draft.model = c.item; }
    pendingCid = '';
  }
  if (draft && draft._wait) { const q = qById(draft._wait); if (q) { draft = toDraft(q); dirty = false; } else if (loaded) { draft = null; view = 'list'; } }
  if (!dirty) render();
}

const FIELDS = ['cid', 'name', 'title', 'owner', 'status', 'valid', 'brand', 'model', 'color', 'sn', 'rubiSn', 'fn', 'ship', 'memo', 'note'];
function payload(d) {
  const o = { id: d.id || '' };
  FIELDS.forEach(k => o[k] = d[k] == null ? '' : d[k]);
  o.final = d.final === '' || d.final == null ? '' : num(d.final);
  o.items = d.items.filter(it => String(it.name || '').trim()).map(it => ({
    cat: it.cat, slot: it.slot || '', name: it.name, list: num(it.list), rate: rateNum(it.rate), price: num(it.price),
    qty: qtyNum(it.qty) || 1, note: it.note || '', sn: it.sn || '', slip: it.slip || '', code: it.code || '',
  }));
  o.payments = d.payments.filter(p => p.label || num(p.amount)).map(p => ({ label: p.label || '', date: p.date || '', amount: num(p.amount), method: p.method || '' }));
  const rq = d.request || {};
  o.request = { label: rq.label || '', amount: rq.amount === '' || rq.amount == null ? '' : num(rq.amount) };
  o.spec = {}; Object.keys(d.spec || {}).forEach(k => { if (String(d.spec[k]).trim()) o.spec[k] = String(d.spec[k]).trim(); });
  return o;
}

/** 브라우저 저장일 때도 서버와 같은 모양으로 */
function localSave(p) {
  const c = calc(p);
  const prefix = 'Q' + ymd(new Date()).slice(2).replace(/-/g, '') + '-';
  const n = quotes.filter(q => String(q.no).startsWith(prefix)).reduce((m, q) => Math.max(m, parseInt(String(q.no).slice(prefix.length), 10) || 0), 0);
  const base = { subtotal: String(c.L), discount: String(c.L - c.F), total: String(c.F), paid: String(c.paid), final: String(p.final) };
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
      const body = op === 'save' ? payload(d) : op === 'snap' ? { id: d.id, label: d.label } : op === 'status' ? { id: d.id, status: d.status } : op === 'publish' ? { id: d.id, view: d.view } : { id: d.id };   // code·recode·unpublish 는 id 만
      const j = await MR.post(Object.assign({ action: 'quote', op }, body));
      take(j);
      out = j.saved || (op === 'delete' || op === 'snapdel' ? 'ok' : '');
    } else {
      if (op === 'delete') { quotes = quotes.filter(q => q.id !== d.id); ls.set(K_SNAP, JSON.stringify(readJson(K_SNAP, []).filter(s => s.qid !== d.id))); out = 'ok'; }
      else if (op === 'snapdel') { ls.set(K_SNAP, JSON.stringify(readJson(K_SNAP, []).filter(s => s.id !== d.id))); out = 'ok'; }
      else if (op === 'snap') {
        const q = qById(d.id); if (!q) throw new Error('저장한 견적만 기록으로 남길 수 있습니다');
        const all = readJson(K_SNAP, []);
        const s = { id: 'ls' + Date.now().toString(36), qid: q.id, no: q.no, label: d.label || ymd(new Date()).slice(2).replace(/-/g, ''), data: JSON.parse(JSON.stringify(q)), total: q.total, by: me() || '나', at: stamp() };
        all.push(s); ls.set(K_SNAP, JSON.stringify(all)); out = s.id;
      }
      else if (op === 'status') { const q = qById(d.id); if (q) Object.assign(q, { status: d.status, updatedAt: stamp() }); out = d.id; }
      else out = localSave(payload(d));
      writeLocal(); readLocal();
    }
  } catch (e) {
    msg = /unknown action|unknown op/.test(e.message) ? 'Apps Script를 새 버전으로 배포해야 견적을 저장할 수 있습니다' : '저장하지 못했습니다. ' + e.message;
    out = '';
  }
  busy = false;
  return out;
}

async function save() {
  if (!draft || busy) return '';
  if (!String(draft.name || '').trim()) { msg = '고객명을 적어 주세요'; render(); const f = host.querySelector('[data-f=name]'); if (f) f.focus(); return ''; }
  if (!draft.items.some(it => String(it.name || '').trim())) { msg = '품목을 하나 이상 넣어 주세요'; render(); return ''; }
  // 결제가 들어온 견적은 계약으로
  if (calc(draft).paid > 0 && (draft.status === '작성중' || draft.status === '보냄')) draft.status = '계약';
  const linked = draft.cid && cById(draft.cid);
  const before = linked ? linked.stage : '';
  const id = await run('save', draft);
  if (!id) { render(); return ''; }
  const q = qById(id);
  if (q) draft = toDraft(q);
  dirty = false; leaveArmed = false; delArmed = false;
  const after = draft.cid && cById(draft.cid);
  okMsg = after && before && after.stage !== before ? `저장했습니다. 고객관리 단계가 ${before}에서 ${after.stage}(으)로 넘어갔습니다` : '저장했습니다';
  render();
  return id;
}

async function openSnap(id) {
  const s = snaps.find(x => x.id === id); if (!s) return;
  let data = null;
  try {
    if (shared()) { busy = true; render(); const j = await MR.get({ action: 'quotesnap', id }); data = j.snap && j.snap.data; }
    else { const x = readJson(K_SNAP, []).find(y => y.id === id); data = x && x.data; }
  } catch (e) { msg = '기록을 불러오지 못했습니다. ' + e.message; }
  busy = false;
  if (!data) { render(); return; }
  paperSrc = toDraft(data); paperSnap = { label: s.label, at: s.at, by: s.by };
  view = 'paper'; msg = ''; okMsg = ''; render();
  const b = host.querySelector('.ck-body'); if (b) b.scrollTop = 0;
}

// ─────────── 조작 ───────────
function go(v, d) {
  if (v === 'list' && dirty && !leaveArmed && view === 'edit') {
    leaveArmed = true; okMsg = ''; msg = '저장하지 않은 변경이 있습니다. 한 번 더 누르면 저장하지 않고 나갑니다'; render(); return;
  }
  if (v === 'list') { draft = null; dirty = false; }
  if (d !== undefined) draft = d;
  if (v !== 'paper') { paperSrc = null; paperSnap = null; }
  view = v; leaveArmed = false; delArmed = false; snapDelArmed = ''; msg = ''; okMsg = '';
  srch.q = ''; srch.items = []; srch.state = '';
  render();
  const b = host && host.querySelector('.ck-body'); if (b) b.scrollTop = 0;
}

function openNew(cid) {
  pendingCid = cid && !cById(cid) ? cid : '';
  go('edit', blank(cid || ''));
  dirty = false;
  setTimeout(() => { const f = host && host.querySelector(draft.cid ? '[data-f=brand]' : '[data-f=cid]'); if (f) f.focus(); }, 30);
}

function addLine(it) {
  if (!draft) return null;
  const list = num(it.list), rate = it.rate != null ? it.rate : rateNum(ui.rate);
  const line = Object.assign({ k: key(), cat: ui.scat, slot: srch.slot || '', name: '', list, rate, price: linePrice(list, rate), qty: 1, note: '', sn: '', slip: '', code: '' }, it, { list, rate, price: linePrice(list, rate) });
  draft.items.push(line);
  dirty = true; msg = ''; okMsg = '';
  return line;
}

/** 금액 칸만 다시 씀 (입력 칸 포커스를 지키려고) */
function updateSums() {
  if (!host || !draft) return;
  const c = calc(draft);
  const set = (k, v) => { const el = host.querySelector(`[data-v="${k}"]`); if (el) el.textContent = v; };
  set('L', won(c.L)); set('lineDisc', c.lineDisc ? '− ' + won(c.lineDisc) : '0원'); set('lineRate', c.L ? pct((c.lineDisc / c.L) * 100) + '%' : '');
  set('P', won(c.P)); set('F', won(c.F)); set('offer', paren(c.offer)); set('rate', `총 할인 ${pct(c.rate)}%`);
  set('vx', `${won(c.points)} · ${won(c.supply)} · ${won(c.vat)}`); set('paid', won(c.paid)); set('remain', won(c.remain));
  const f = host.querySelector('#qtFinal'); if (f) f.placeholder = comma(c.P);
}
function paintLine(li, it) {
  const set = (lf, v) => { const el = li.querySelector(`[data-lf=${lf}]`); if (el && document.activeElement !== el) el.value = v; };
  set('list', it.list ? comma(it.list) : ''); set('rate', it.rate ? pct(it.rate) : ''); set('price', it.price || it.list ? comma(it.price) : '');
  const q = qtyNum(it.qty) || 1, gift = it.rate >= 100;
  li.classList.toggle('gift', gift);
  const tag = li.querySelector('.tag');
  if (tag) tag.innerHTML = `${gift ? '증정' : q > 1 ? `× ${esc(q)} = ${comma(num(it.price) * q)}` : ''}${it.code ? `<i>이카운트 ${esc(it.code)}</i>` : ''}`;
}

// 이카운트 품목 찾기
function findItems(q) {
  srch.q = q; srch.sel = 0;
  clearTimeout(srch.timer);
  const term = q.trim();
  if (!term || !(stk() && stk().configured() && stk().api)) { srch.items = []; srch.state = ''; paintSearch(); return; }
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
function paintSearch() {
  const w = host && host.querySelector('[data-sres]'); if (!w) return;
  const tmp = document.createElement('div'); tmp.innerHTML = searchHtml();
  w.innerHTML = tmp.querySelector('[data-sres]').innerHTML;
}
function pickResult(i) {
  const p = srch.items[i]; if (!p) return;
  const spec = [p.size].filter(Boolean).join(' ');
  addLine({ name: spec && !p.name.includes(spec) ? `${p.name} (${spec})` : p.name, code: p.code, list: vatPrice(num(p.price), p.vat) });
  srch.q = ''; srch.items = []; srch.state = ''; srch.slot = '';
  render();
  const s = host.querySelector('.qt-sslot'); if (s) s.focus();
}

function bind() {
  if (bound) return;
  bound = true;
  const inHost = e => host && host.contains(e.target);
  document.addEventListener('click', e => { if (inHost(e)) onClick(e); });
  document.addEventListener('input', e => { if (inHost(e) && !e.isComposing) onInput(e); });
  document.addEventListener('compositionend', e => { if (inHost(e)) onInput(e); });
  document.addEventListener('change', e => { if (inHost(e)) onChange(e); });
  // 화면을 다시 그리면 포커스가 body 로 빠지므로, 그때의 Esc 도 이 앱이 받음 (패널 전체가 닫히지 않게)
  document.addEventListener('keydown', e => { if (inHost(e) || (host && view !== 'list' && e.target === document.body)) onKey(e); }, true);
}

async function onClick(e) {
  const t = e.target;
  const hit = s => t.closest(s);
  if (hit('[data-new]')) { openNew(''); return; }
  if (hit('[data-open]')) { const q = qById(hit('[data-open]').dataset.open); if (q) go('edit', toDraft(q)); return; }
  if (hit('[data-stab]')) { ui.status = hit('[data-stab]').dataset.stab; saveUi(); render(); return; }
  if (hit('[data-back]')) { go('list'); return; }
  if (hit('[data-go]')) { const v = hit('[data-go]').dataset.go; if (v === 'list') go('list'); else { view = v; paperSrc = null; paperSnap = null; msg = ''; okMsg = ''; render(); const b = host.querySelector('.ck-body'); if (b) b.scrollTop = 0; } return; }
  if (hit('[data-paper]')) { view = 'paper'; paperSrc = null; paperSnap = null; msg = ''; okMsg = ''; render(); host.querySelector('.ck-body').scrollTop = 0; return; }
  if (hit('[data-compare]')) { view = 'compare'; msg = ''; okMsg = ''; render(); host.querySelector('.ck-body').scrollTop = 0; return; }
  if (hit('[data-crm]')) { const id = hit('[data-crm]').dataset.crm; if (dirty) { msg = '저장한 뒤에 고객관리로 넘어가 주세요'; render(); return; } location.hash = '#customers/' + encodeURIComponent(id); return; }
  if (hit('[data-st]')) { draft.status = hit('[data-st]').dataset.st; dirty = true; host.querySelectorAll('[data-st]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.st === draft.status))); return; }
  if (hit('[data-dl]')) { const k = hit('[data-dl]').dataset.dl; draft.items = draft.items.filter(it => it.k !== k); dirty = true; render(); return; }
  if (hit('[data-manual]')) {
    const line = addLine({ name: srch.q.trim() });
    srch.q = ''; srch.items = []; srch.slot = ''; render();
    const f = host.querySelector(`[data-k="${line.k}"] [data-lf=${line.name ? 'list' : 'name'}]`); if (f) f.focus();
    return;
  }
  if (hit('[data-sr]')) { pickResult(+hit('[data-sr]').dataset.sr); return; }
  if (hit('[data-bulk]')) {
    const r = rateNum(host.querySelector('#qtRate').value); ui.rate = r; saveUi();
    draft.items.forEach(it => { if (it.rate < 100 && num(it.list) > 0) { it.rate = r; it.price = linePrice(num(it.list), r); } });
    dirty = true; okMsg = `할인율 ${pct(r)}%를 모든 줄에 넣었습니다 (증정 제외)`; render(); return;
  }
  if (hit('[data-round]')) {
    const u = +hit('[data-round]').dataset.round;
    if (!u) draft.final = '';
    else { const c = calc(Object.assign({}, draft, { final: '' })); draft.final = Math.floor(c.P / u) * u; }
    dirty = true; render(); return;
  }
  if (hit('[data-padd]')) {
    const c = calc(draft);
    draft.payments.push({ k: key(), label: draft.request && draft.request.label ? draft.request.label : '', date: ymd(new Date()), amount: draft.request && draft.request.amount !== '' && draft.request.amount != null ? num(draft.request.amount) : Math.max(0, c.remain), method: '' });
    dirty = true; render();
    const rows = host.querySelectorAll('.qt-pay [data-pf=label]'); if (rows.length) rows[rows.length - 1].focus();
    return;
  }
  if (hit('[data-pdl]')) { const k = hit('[data-pdl]').dataset.pdl; draft.payments = draft.payments.filter(p => p.k !== k); dirty = true; render(); return; }
  if (hit('[data-req]')) {
    const m = hit('[data-req]').dataset.req, c = calc(draft);
    if (m === 'clear') draft.request = { label: '', amount: '' };
    else if (m === 'half') draft.request = { label: draft.request.label || '50% 예약금', amount: Math.round(c.F / 2 / 1000) * 1000 };
    else draft.request = { label: draft.request.label || (c.paid ? '최종 잔금' : ''), amount: Math.max(0, c.remain) };
    dirty = true; render(); return;
  }
  if (hit('[data-save]')) { save(); return; }
  if (hit('[data-print]')) { printPaper(); return; }
  if (hit('[data-dup]')) {
    const d = toDraft(Object.assign({}, draft, { id: '', no: '', status: STATUS[0], createdAt: '', updatedAt: '', author: '', valid: addDays(+Q.VALID_DAYS || 14), owner: me() || draft.owner, payments: [], request: { label: '', amount: '' }, title: draft.title ? draft.title + ' (복제)' : '' }));
    go('edit', d); dirty = true; okMsg = '복제했습니다. 지불 현황은 비웠습니다. 옵션 이름과 구성을 고친 뒤 저장하면 새 견적 번호가 붙습니다'; render(); return;
  }
  if (hit('[data-del]')) {
    if (!delArmed) { delArmed = true; render(); return; }
    const ok = await run('delete', { id: draft.id });
    if (ok) { dirty = false; go('list'); okMsg = '견적을 지웠습니다'; render(); } else render();
    return;
  }
  if (hit('[data-publish]')) {
    let id = draft.id;
    if (dirty || !id) { id = await save(); if (!id) return; }
    const key = await run('publish', { id, view: portalView(draft) });
    if (key) okMsg = codes.some(c => portals.some(p => p.qid === id && p.ckey === c.ckey)) ? '고객 포털에 공개했습니다. 고객은 쓰던 고객코드로 바로 봅니다' : '고객 포털에 공개했습니다. 고객코드를 발급해 고객에게 보내 주세요';
    unpubArmed = false; render(); return;
  }
  if (hit('[data-unpublish]')) {
    if (!unpubArmed) { unpubArmed = true; render(); return; }
    unpubArmed = false;
    if (await run('unpublish', { id: draft.id })) okMsg = '공개를 끝냈습니다. 고객 링크가 더 이상 열리지 않습니다';
    render(); return;
  }
  if (hit('[data-code]') || hit('[data-recode]')) {
    const renew = !!hit('[data-recode]');
    if (renew && !recodeArmed) { recodeArmed = true; render(); return; }
    recodeArmed = false;
    const code = await run(renew ? 'recode' : 'code', { id: draft.id });
    if (code) okMsg = renew ? `새 고객코드 ${code} 를 발급했습니다. 예전 코드와 로그인은 끊겼습니다` : `고객코드 ${code} 를 발급했습니다`;
    render(); return;
  }
  if (hit('[data-codecopy]') || hit('[data-codemsg]')) {
    const code = (host.querySelector('[data-codev]') || {}).textContent || '';
    const text = hit('[data-codemsg]')
      ? `${draft.name ? draft.name + ' 고객님, ' : ''}루비워크샵입니다. 고객님의 자전거 진행 상황과 견적, 결제 내역을 아래에서 보실 수 있습니다.\n\n${PORTAL_URL}\n고객코드: ${code}\n\n코드는 고객님만 쓰시도록 보관해 주세요. 문의 ${(CFG.QUOTE && CFG.QUOTE.TEL) || '1551-5320'}`
      : code;
    try { await navigator.clipboard.writeText(text); okMsg = hit('[data-codemsg]') ? '안내 문구를 복사했습니다. 카카오톡·문자에 붙여 보내 주세요' : '고객코드를 복사했습니다'; }
    catch (er) { okMsg = '복사하지 못했습니다. 코드를 직접 옮겨 적어 주세요'; }
    msg = ''; const f = host.querySelector('.ck-msg'); if (f) f.textContent = okMsg; else render();
    return;
  }
  if (hit('[data-plcopy]')) {
    const inp = host.querySelector('.qt-plink input');
    try { await navigator.clipboard.writeText(inp.value); okMsg = '링크를 복사했습니다'; } catch (er) { inp.select(); okMsg = '링크를 선택했습니다. 복사해 주세요'; }
    msg = ''; const f = host.querySelector('.ck-msg'); if (f) f.textContent = okMsg; else render();
    return;
  }
  if (hit('[data-snap]')) { openSnap(hit('[data-snap]').dataset.snap); return; }
  if (hit('[data-snapdel]')) {
    const id = hit('[data-snapdel]').dataset.snapdel;
    if (snapDelArmed !== id) { snapDelArmed = id; render(); return; }
    snapDelArmed = '';
    if (await run('snapdel', { id })) okMsg = '기록을 지웠습니다';
    render(); return;
  }
  if (hit('[data-snapadd]')) {
    const label = (host.querySelector('.qt-snapl') || {}).value || '';
    let id = draft.id;
    if (dirty || !id) { id = await save(); if (!id) return; }
    const s = await run('snap', { id, label: label.trim() });
    if (s) okMsg = `기록 '${label.trim() || '오늘 날짜'}'을(를) 남겼습니다`;
    render(); return;
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
  if (t.classList.contains('qt-sslot')) { srch.slot = t.value; return; }
  if (!draft) return;
  const f = t.dataset.f;
  if (f && f !== 'cid' && f !== 'owner') {
    dirty = true; leaveArmed = false;
    if (f === 'final') { const n = t.value.replace(/[^\d]/g, ''); draft.final = n === '' ? '' : +n; t.value = n ? comma(+n) : ''; updateSums(); return; }
    draft[f] = t.value;
    if (f === 'ship') { const el = host.querySelector('[data-v="care"]'); const c = careEnd(t.value); if (el) el.textContent = c ? fmtKo(c) : '미정 (출고일을 넣으면 1년 뒤)'; }
    return;
  }
  const lf = t.dataset.lf;
  if (lf && lf !== 'cat') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k); if (!it) return;
    dirty = true; leaveArmed = false;
    if (lf === 'list') { const n = num(t.value); it.list = n; t.value = n ? comma(n) : ''; it.price = linePrice(n, it.rate); }
    else if (lf === 'rate') { t.value = t.value.replace(/[^\d.]/g, ''); it.rate = rateNum(t.value); it.price = linePrice(num(it.list), it.rate); }
    else if (lf === 'price') { const neg = /^\s*-/.test(t.value); const n = num(t.value); it.price = n; t.value = n ? comma(n) : neg ? '-' : ''; it.rate = num(it.list) ? Math.max(0, Math.min(100, Math.round((1 - n / num(it.list)) * 10000) / 100)) : 0; }
    else if (lf === 'qty') { t.value = t.value.replace(/[^\d.]/g, ''); it.qty = t.value; }
    else it[lf] = t.value;
    if (['list', 'rate', 'price', 'qty'].includes(lf)) { paintLine(li, it); updateSums(); }
    return;
  }
  const pf = t.dataset.pf;
  if (pf) {
    const li = t.closest('[data-pk]'); const p = li && draft.payments.find(x => x.k === li.dataset.pk); if (!p) return;
    dirty = true; leaveArmed = false;
    if (pf === 'amount') { const n = num(t.value); p.amount = n; t.value = n ? comma(n) : ''; updateSums(); }
    else p[pf] = t.value;
    return;
  }
  const rf = t.dataset.rf;
  if (rf) {
    dirty = true; leaveArmed = false;
    if (rf === 'amount') { const n = t.value.replace(/[^\d]/g, ''); draft.request.amount = n === '' ? '' : +n; t.value = n ? comma(+n) : ''; }
    else draft.request.label = t.value;
    return;
  }
  const sf = t.dataset.sf;
  if (sf) { draft.spec[sf] = t.value; dirty = true; leaveArmed = false; }
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-scat]')) { ui.scat = t.value; saveUi(); const s = host.querySelector('.qt-sslot'); if (s) { s.setAttribute('list', 'qtSlot' + catIdx(ui.scat)); s.value = ''; srch.slot = ''; s.focus(); } return; }
  if (t.matches('[data-dopt]')) { ui[t.dataset.dopt] = t.checked; saveUi(); render(); return; }
  if (t.matches('#qtRate')) { ui.rate = rateNum(t.value); saveUi(); return; }
  if (!draft) return;
  const f = t.dataset.f;
  if (f === 'cid') {
    const prev = cById(draft.cid), c = cById(t.value);
    if (c) {
      if (!draft.name || (prev && draft.name === prev.name)) draft.name = c.name;
      if (!draft.brand && (!draft.model || (prev && draft.model === prev.item))) draft.model = c.item || draft.model;
    }
    draft.cid = t.value; dirty = true; render(); return;
  }
  if (f === 'owner') { draft.owner = t.value; dirty = true; return; }
  if (t.dataset.lf === 'cat') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k);
    if (it) { it.cat = t.value; dirty = true; render(); }
    return;
  }
  if (t.matches('[data-slip]')) {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k);
    if (it) { it.slip = t.checked ? ymd(new Date()) : ''; dirty = true; const sp = t.nextElementSibling; if (sp) sp.textContent = it.slip ? '전표 ' + fmtDay(it.slip) : '전표처리'; }
    return;
  }
  if (t.dataset.lf === 'qty') {
    const li = t.closest('[data-k]'); const it = li && draft.items.find(x => x.k === li.dataset.k);
    if (it) { it.qty = qtyNum(it.qty) || 1; t.value = it.qty; paintLine(li, it); updateSums(); }
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
  if (e.key === 'Enter' && t.classList && t.classList.contains('qt-sslot') && !e.isComposing) { e.preventDefault(); const s = host.querySelector('.qt-sq'); if (s) s.focus(); return; }
  // 줄 안에서 Enter: 다음 칸으로 (마지막 칸이면 품목 찾기로)
  if (e.key === 'Enter' && t.dataset && (t.dataset.lf || t.dataset.pf) && t.tagName === 'INPUT' && t.type !== 'checkbox' && !e.isComposing) {
    e.preventDefault();
    const inputs = [...host.querySelectorAll(t.dataset.lf ? '.qt-lines input:not([type=checkbox]), .qt-sslot' : '.qt-pays input, [data-padd]')];
    const i = inputs.indexOf(t); if (inputs[i + 1]) inputs[i + 1].focus();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && view === 'edit') { e.preventDefault(); e.stopPropagation(); save(); return; }
  if (e.key !== 'Escape') return;
  if (t.classList && t.classList.contains('qt-lq') && t.value) { e.stopPropagation(); ui.q = ''; render(); return; }
  if (view === 'paper' || view === 'compare') { e.stopPropagation(); view = 'edit'; paperSrc = null; paperSnap = null; render(); return; }
  if (view === 'edit') { e.stopPropagation(); go('list'); }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && host && shared() && !dirty && !busy) load(); });

// ─────────── 공개 ───────────
window.MYRUBI_QUOTE = {
  /** 패널 안에 붙이기. arg: '' 목록 / 'new' 새 견적 / 'new/고객건ID' 그 고객 건으로 새 견적 / 견적 ID */
  mount(el, arg) {
    host = el; bind();
    if (shared()) { const c = readJson(K_CACHE(), null); if (c && !quotes.length) { quotes = c.quotes || []; customers = c.customers || []; snaps = c.snaps || []; } }
    else readLocal();
    view = 'list'; draft = null; paperSrc = null; paperSnap = null; dirty = false; msg = ''; okMsg = ''; leaveArmed = false; delArmed = false;
    arg = String(arg || '');
    const nm = arg.match(/^new(?:\/(.+))?$/);
    if (nm) openNew(nm[1] || '');
    else if (arg) {
      const q = qById(arg);
      view = 'edit'; draft = q ? toDraft(q) : Object.assign(blank(''), { _wait: arg });
      render();
    } else render();
    load();
  },
  unmount() { host = null; draft = null; dirty = false; paperSrc = null; paperSnap = null; },
  show(arg) { if (host) this.mount(host, arg); },
  // 확인용
  _calc: calc, _paper: paperHtml, _toDraft: toDraft,
};
})();
