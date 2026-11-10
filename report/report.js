/* My Rubi 매출 보고서 (/report/)
 *
 * 흐름
 *  1. 직원이 이카운트에서 판매현황·재고현황·품목등록을 엑셀로 내려받아 '이카운트 엑셀 올리기'에 놓음
 *  2. 이 페이지가 SheetJS로 읽어 종류를 알아보고(제목 줄과 머리글), 열을 맞춘 뒤 미리보기를 보여줌
 *  3. 저장하면 Apps Script(POST report)가 Index 스프레드시트 '매출'·'재고'·'품목' 탭에 씀
 *     판매현황은 파일 기간(과 거래처 필터) 안의 예전 줄을 바꾸므로 같은 달을 다시 올려도 겹치지 않음
 *  4. 집계와 그래프는 모두 이 페이지에서 함 (GET report 로 줄을 받아 옴)
 *
 * 계산 기준
 *  - 매출: 공급가액(부가세 별도)이 기본, 위 '기준'에서 합계(부가세 포함)로 바꿀 수 있음. 반품(음수 수량)은 빼고 셈
 *  - 브랜드: 품목명 맨 앞 [브랜드] (예: [QUOC] MONO 2 SAND (43) → QUOC). [OLD/3T] 처럼 OLD 는 건너뜀
 *  - 모델: 브랜드 뒤 이름에서 끝의 (사이즈) 와 ' - 규격' 을 뗀 것 (예: MONO 2 SAND). 사이즈별 품목을 모델로 묶음
 *  - 플랫폼: 거래처명을 REPORT.PLATFORMS 규칙으로 묶음 (config.js 에서 바꿀 수 있음)
 *  - 재고: 가장 최근 기준일의 재고현황. 재고 금액은 품목등록의 입고단가 × 수량 (입고단가가 없으면 최근 판매 단가)
 *  - 재고일수: 재고 ÷ 최근 90일 하루 평균 판매. 연 회전율: 365 ÷ 재고일수
 *  - 프로모션 필요: 장기 무판매(180일 넘게 안 팔림) · 과다 재고(재고일수 180일 초과) · 판매 둔화(최근 90일이 그 전 90일의 절반 미만)
 *    품절 위험(재고일수 30일 미만)은 '재주문 검토'로 따로 보여줌. 기준 날수는 config.js 의 REPORT 에서 바꿈
 */
(function () {
  'use strict';
  const CFG = window.MYRUBI_CONFIG || {};
  const RC = Object.assign({
    RATE_DAYS: 90,      // 하루 평균 판매를 계산하는 기간
    DEAD_DAYS: 180,     // 이 날수 넘게 안 팔리면 장기 무판매
    OVER_DAYS: 180,     // 재고일수가 이보다 길면 과다 재고
    LOW_DAYS: 30,       // 재고일수가 이보다 짧으면 품절 위험
    SLOW_RATIO: 0.5,    // 최근 기간 판매가 그 전 기간의 이 비율 미만이면 판매 둔화
    XLSX_URL: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    // 거래처명 → 플랫폼: [플랫폼 이름, 거래처명 규칙(정규식), 'RB'면 거래처명이 RB/ 또는 [RB] 로 시작할 때만, 'RS'면 그 밖일 때만]
    // 위에서부터 처음 맞는 규칙. 색은 이 순서로 고정 (거래처가 늘어도 색이 바뀌지 않음). 어디에도 안 맞는 RB 거래처는 '기타 (RB)'
    PLATFORMS: [
      ['루비워크샵 쇼룸', '쇼룸|매장|방문', 'RB'],
      ['루비워크샵 홈페이지', '^(?!.*몰튼).*(홈페이지|아임웹|사이트|온라인|rubiworkshop)', 'RB'],
      ['루비워크샵 스마트스토어', '^(?!.*개러지).*(워크샵.*스마트\\s*스토어|^\\s*(\\[RB\\]|RB\\s*/)\\s*스마트\\s*스토어)', 'RB'],
      ['루비개러지 스마트스토어', '개러지', 'RB'],
      ['루비서플라이 홈페이지', '루비\\s*서플라이|rubisupply', ''],
      ['몰튼코리아 사이트', '몰튼', 'RB'],
      ['도매 거래처', '.?', 'RS'],
    ],
    // 브랜드 표기: 이카운트의 대문자 표기를 보기 좋게 바꿀 때 예외 (원래 대문자인 브랜드)
    BRAND_UPPER: ['QUOC', 'MKS', 'THM', 'ENVE', 'ABUS', 'SRAM', 'BMC', 'DT', 'PRO', 'REX', 'EVT', 'KMC', 'SKS', 'BBB', 'CPLX', '3T', 'OLD'],
    BRAND_NAMES: {},    // 예: { 'WOLFTOOTH': 'Wolf Tooth', 'MUC-OFF': 'Muc-Off' }
  }, CFG.REPORT || {});

  // 데이터 시각화 색 (dataviz 기준 팔레트, 순서 고정)
  const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  const OTHER = '#a4a5a9';
  const STATUS = { good: '#0ca30c', warn: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
  const PLAT_RULES = RC.PLATFORMS.map(([name, re, only], i) => ({ name, re: new RegExp(re, 'i'), only: only || '', color: SLOTS[i] || OTHER }));
  const PLAT_OTHER = '기타 (RB)';

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = Number(String(v == null ? '' : v).replace(/[,\s원₩]/g, '').replace(/^\((.*)\)$/, '-$1')); return isFinite(n) ? n : 0; };
  const fmt = n => Math.round(n).toLocaleString('ko-KR');
  const fmtShort = n => {
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e8) return s + String(+(a / 1e8).toFixed(a >= 1e10 ? 0 : a >= 1e9 ? 1 : 2)) + '억';
    if (a >= 1e4) return s + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    return s + Math.round(a).toLocaleString('ko-KR');
  };
  const fmtPct = (p, d = 0) => p == null || !isFinite(p) ? '–' : (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(d) + '%';
  const share = (a, b) => b ? a / b * 100 : 0;
  const chg = (a, b) => b ? (a - b) / Math.abs(b) * 100 : null;

  // 날짜는 'YYYY-MM-DD' 문자열로 다루고 계산할 때만 UTC 로 바꿈
  const D = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const S = t => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => S(D(s) + n * 864e5);
  const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const ym = s => s.slice(0, 7);
  const monthStart = s => s.slice(0, 7) + '-01';
  const monthEnd = s => { const y = +s.slice(0, 4), m = +s.slice(5, 7); return S(Date.UTC(y, m, 0)); };
  const addMonths = (s, n) => { const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n; return S(Date.UTC(y, m, 1)); };
  const todayKST = () => S(Date.now() + 9 * 3600e3);
  const kDate = s => s ? `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '';
  const kDateY = s => s ? `${s.slice(0, 4)}년 ${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일` : '';

  // ─────────── 상태 ───────────
  const K_UI = 'myrubi.report.ui.v1';
  const ui = Object.assign({ preset: 'lastMonth', from: '', to: '', metric: 'supply', brand: '', plat: '', sort: 'value', dir: -1, q: '', tableN: 40, tableBrand: '' }, readJson(K_UI));
  function readJson(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function saveUi() { try { localStorage.setItem(K_UI, JSON.stringify({ preset: ui.preset, from: ui.from, to: ui.to, metric: ui.metric })); } catch (e) {} }

  let raw = null;     // 서버 응답
  let db = null;      // 정리한 데이터 { sales, stock, stockDate, items, uploads, minD, maxD }

  // ─────────── 이름 풀기 ───────────
  const normName = s => String(s || '').replace(/\s+/g, '').toLowerCase();
  function brandKey(name) {
    const m = String(name || '').match(/^\s*\[([^\]]+)\]/);
    if (!m) return '';
    const parts = m[1].split('/').map(x => x.trim()).filter(x => x && !/^old$/i.test(x));
    return (parts[0] || '').toUpperCase();
  }
  function brandLabel(k) {
    if (!k) return '브랜드 표기 없음';
    if (RC.BRAND_NAMES[k]) return RC.BRAND_NAMES[k];
    return k.split(/(\s+|-)/).map(w => {
      if (/^\s+$|^-$/.test(w) || !w) return w;
      if (RC.BRAND_UPPER.includes(w) || /\d/.test(w) || w.length <= 2) return w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    }).join('');
  }
  function modelOf(name) {
    let s = String(name || '').replace(/^\s*\[[^\]]*\]\s*/, '');
    for (let i = 0; i < 3; i++) s = s.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/, '');
    s = s.split(/\s+-\s+/)[0];
    return s.replace(/\s+/g, ' ').trim() || String(name || '').trim() || '품목명 없음';
  }
  function platformOf(partner) {
    const p = String(partner || '').trim(), rb = isRB(p);
    for (const r of PLAT_RULES) { if ((r.only === 'RB' && !rb) || (r.only === 'RS' && rb)) continue; if (r.re.test(p)) return r.name; }
    return PLAT_OTHER;
  }
  const platColor = name => (PLAT_RULES.find(r => r.name === name) || {}).color || OTHER;
  const partnerLabel = p => String(p || '').replace(/^\s*(\[(RB|RS)\]|(RB|RS)\s*\/)\s*/i, '').trim() || '거래처 없음';
  const isRB = p => /^\s*(\[RB\]|RB\s*\/)/i.test(String(p || ''));

  // ─────────── 데이터 정리 ───────────
  function prepare(r) {
    const C = r.cols;
    const pick = (row, cols) => { const o = {}; cols.forEach((k, i) => o[k] = row[i]); return o; };
    const items = new Map(), itemByName = new Map();
    (r.items || []).forEach(row => {
      const o = pick(row, C.items);
      const it = { code: o.code, name: o.name, cost: num(o.cost), retail: num(o.retail), supply: num(o.supply), cat: o.cat, group: o.group };
      if (it.code) items.set(it.code, it);
      if (it.name) itemByName.set(normName(it.name), it);
    });
    const findItem = (code, name) => (code && items.get(code)) || itemByName.get(normName(name)) || itemByName.get(normName(String(name || '').replace(/\s*\[[^\]]*\]\s*$/, ''))) || null;

    const sales = (r.sales || []).map(row => {
      const o = pick(row, C.sales);
      const it = findItem(o.code, o.name);
      const name = o.name || (it && it.name) || '';
      const bk = brandKey(name) || (it ? brandKey(it.name) : '');
      return {
        d: o.date, no: o.no, code: o.code || (it && it.code) || '', name,
        qty: num(o.qty), supply: num(o.supply), vat: num(o.vat), total: num(o.total) || num(o.supply) + num(o.vat),
        partner: o.partner, plat: platformOf(o.partner), rb: isRB(o.partner),
        brand: bk, model: modelOf(name), cat: it ? it.cat : '',
      };
    }).filter(x => x.d);
    sales.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);

    const stockAll = (r.stock || []).map(row => pick(row, C.stock));
    const stockDate = stockAll.reduce((m, o) => o.date > m ? o.date : m, '');
    const stock = stockAll.filter(o => o.date === stockDate).map(o => {
      const it = findItem(o.code, o.name);
      const name = o.name || (it && it.name) || '';
      return { code: o.code, name, wh: o.wh, qty: num(o.qty), brand: brandKey(name) || (it ? brandKey(it.name) : ''), model: modelOf(name), cost: it ? it.cost : 0, retail: it ? it.retail : 0 };
    }).filter(o => o.qty > 0);   // 마이너스 재고는 0으로 봄
    const stockDates = [...new Set(stockAll.map(o => o.date))].sort();

    return {
      sales, stock, stockDate, stockDates, items, uploads: r.uploads || [],
      minD: sales.length ? sales[0].d : '', maxD: sales.length ? sales[sales.length - 1].d : '',
    };
  }

  // ─────────── 기간 ───────────
  const PRESETS = [
    ['lastMonth', '지난달'], ['thisMonth', '이번 달'], ['lastWeek', '지난주'], ['3m', '최근 3개월'], ['12m', '최근 12개월'], ['ytd', '올해'], ['custom', '직접'],
  ];
  function period() {
    const today = todayKST();
    const anchor = db && db.maxD ? (db.maxD < today ? db.maxD : today) : today;
    let from, to, label;
    switch (ui.preset) {
      case 'thisMonth': from = monthStart(today); to = today; label = `${+today.slice(5, 7)}월 (진행 중)`; break;
      case 'lastWeek': {
        const wd = (new Date(D(today)).getUTCDay() + 6) % 7;   // 월요일 0
        to = addDays(today, -wd - 1); from = addDays(to, -6); label = `지난주 ${kDate(from)} ~ ${kDate(to)}`; break;
      }
      case '3m': to = lastFull(anchor); from = addMonths(to, -2); label = `${from.slice(0, 7).replace('-', '.')} ~ ${to.slice(0, 7).replace('-', '.')}`; break;
      case '12m': to = lastFull(anchor); from = addMonths(to, -11); label = `${from.slice(0, 7).replace('-', '.')} ~ ${to.slice(0, 7).replace('-', '.')}`; break;
      case 'ytd': from = today.slice(0, 4) + '-01-01'; to = today; label = `${today.slice(0, 4)}년 (${+today.slice(5, 7)}월까지)`; break;
      case 'custom': from = ui.from || monthStart(anchor); to = ui.to || anchor; if (from > to) [from, to] = [to, from]; label = `${from.replace(/-/g, '.')} ~ ${to.replace(/-/g, '.')}`; break;
      default: {   // 지난달: 오늘 기준 지난달. 데이터가 그보다 앞에서 끝나면 데이터가 있는 마지막 온전한 달
        let m = addMonths(today, -1);
        if (db && db.maxD && db.maxD < monthEnd(m)) m = db.maxD === monthEnd(db.maxD) ? monthStart(db.maxD) : addMonths(db.maxD, -1);
        from = monthStart(m); to = monthEnd(m); label = `${from.slice(0, 4)}년 ${+from.slice(5, 7)}월`;
      }
    }
    const len = days(from, to) + 1;
    // 비교: 바로 앞 같은 길이 (달 단위 기간이면 앞 달들), 전년 같은 기간
    const monthly = from.slice(8) === '01' && to === monthEnd(to);
    let pf, pt;
    if (monthly) { const n = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1; pf = addMonths(from, -n); pt = monthEnd(addMonths(from, -1)); }
    else { pt = addDays(from, -1); pf = addDays(pt, -(len - 1)); }
    const yf = (+from.slice(0, 4) - 1) + from.slice(4), yt = (+to.slice(0, 4) - 1) + (to.slice(4) === '-02-29' ? '-02-28' : to.slice(4));
    return { from, to, len, label, prev: { from: pf, to: pt }, yoy: { from: yf, to: yt } };
  }
  // 기준 날짜까지 끝난 마지막 달의 말일 (기준이 말일이면 그 달)
  function lastFull(s) { return s === monthEnd(s) ? s : monthEnd(addMonths(s, -1)); }
  const covers = (f, t) => db && db.minD && db.minD <= f && db.maxD >= t;

  // ─────────── 집계 ───────────
  const val = x => ui.metric === 'total' ? x.total : x.supply;
  function inRange(f, t, filt) {
    return db.sales.filter(x => x.d >= f && x.d <= t && (!filt || filt(x)));
  }
  const baseFilt = x => (!ui.brand || x.brand === ui.brand) && (!ui.plat || x.plat === ui.plat);
  function sum(list) {
    let v = 0, q = 0, ret = 0, retQ = 0; const orders = new Set();
    list.forEach(x => { v += val(x); q += x.qty; if (x.qty < 0 || val(x) < 0) { ret += val(x); retQ += x.qty; } if (x.no) orders.add(x.d + '-' + x.no); });
    return { v, q, ret, retQ, orders: orders.size };
  }
  function groupBy(list, key) {
    const m = new Map();
    list.forEach(x => { const k = key(x); const g = m.get(k) || { k, v: 0, q: 0, n: 0 }; g.v += val(x); g.q += x.qty; g.n++; m.set(k, g); });
    return m;
  }

  /** 모델별 회전율 표 (재고 기준일 또는 데이터 끝 날짜 기준) */
  function turnover() {
    const end = db.stockDate && db.maxD ? (db.stockDate < db.maxD ? db.stockDate : db.maxD) : (db.maxD || db.stockDate || todayKST());
    const cover = db.minD ? days(db.minD, end) + 1 : 0;
    const win = Math.max(1, Math.min(RC.RATE_DAYS, cover || RC.RATE_DAYS));
    const w1 = addDays(end, -win + 1), w0 = addDays(w1, -win), w0e = addDays(w1, -1);
    const P = period();
    const m = new Map();
    const get = (brand, model) => {
      const k = brand + '|' + model;
      let o = m.get(k);
      if (!o) { o = { k, brand, model, pq: 0, pv: 0, q90: 0, qPrev: 0, stock: 0, value: 0, costMissing: 0, last: '', unit: 0, uq: 0, skus: new Set(), names: new Set() }; m.set(k, o); }
      return o;
    };
    db.sales.forEach(x => {
      if (ui.plat && x.plat !== ui.plat) return;
      const o = get(x.brand, x.model);
      if (x.d >= P.from && x.d <= P.to) { o.pq += x.qty; o.pv += val(x); }
      if (x.d >= w1 && x.d <= end) o.q90 += x.qty;
      if (x.d >= w0 && x.d <= w0e) o.qPrev += x.qty;
      if (x.qty > 0 && x.d <= end && x.d > o.last) o.last = x.d;
      if (x.qty > 0 && x.supply > 0) { o.unit += x.supply; o.uq += x.qty; }
      o.names.add(x.name);
    });
    db.stock.forEach(s => {
      const o = get(s.brand, s.model);
      o.stock += s.qty; o.skus.add(s.code || s.name); o.names.add(s.name);
      if (s.cost) o.value += s.cost * s.qty; else o.costMissing += s.qty;
    });
    const rows = [...m.values()].map(o => {
      const unit = o.uq ? o.unit / o.uq : 0;
      if (o.costMissing && unit) o.value += o.costMissing * unit * 0.6;   // 입고단가가 없으면 판매 단가의 60%로 어림 (표에 표시)
      const daily = o.q90 > 0 ? o.q90 / win : 0;
      const dos = o.stock > 0 ? (daily > 0 ? o.stock / daily : Infinity) : 0;
      const turn = o.stock > 0 && daily > 0 ? 365 / dos : (o.stock <= 0 && daily > 0 ? null : 0);
      const since = o.last ? days(o.last, end) : null;
      let flag = '';
      if (o.stock > 0) {
        if (!o.last || since > RC.DEAD_DAYS) flag = 'dead';
        else if (dos > RC.OVER_DAYS) flag = 'over';
        else if (o.qPrev > 0 && o.q90 < o.qPrev * RC.SLOW_RATIO && dos > 90) flag = 'slow';
        else if (daily > 0 && dos < RC.LOW_DAYS) flag = 'low';
      } else if (daily > 0 && o.stock <= 0) flag = 'out';
      return Object.assign(o, { daily, dos, turn, since, flag, estimated: !!o.costMissing, skuN: o.skus.size });
    }).filter(o => (o.stock > 0 || o.pq || o.q90) && (!ui.brand || o.brand === ui.brand));
    return { rows, end, win, cover };
  }

  // ─────────── 그리기: 공통 ───────────
  const tip = $('#tip');
  function showTip(html, ev) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mousemove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e); else tip.hidden = true;
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  const deltaHtml = (p, label) => p == null ? `<span class="dl na">${esc(label)} 비교 없음</span>` : `<span class="dl ${p > 0.05 ? 'up' : p < -0.05 ? 'down' : ''}">${p > 0.05 ? '▲' : p < -0.05 ? '▼' : '·'} ${fmtPct(p, Math.abs(p) < 10 ? 1 : 0)} <small>${esc(label)}</small></span>`;
  const sec = (id, title, sub, body, acts) => `<section class="rp-sec" id="${id}"><header><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}</header>${body}</section>`;

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  // ─────────── 화면 ───────────
  function renderBar() {
    const P = db ? period() : null;
    $('#bar').innerHTML = `
      <div class="seg" role="group" aria-label="기간">${PRESETS.map(([k, l]) => `<button type="button" data-preset="${k}" aria-pressed="${ui.preset === k}">${l}</button>`).join('')}</div>
      ${ui.preset === 'custom' ? `<label class="dt"><span>시작</span><input type="date" id="cFrom" value="${esc(ui.from || (P && P.from) || '')}"></label><label class="dt"><span>끝</span><input type="date" id="cTo" value="${esc(ui.to || (P && P.to) || '')}"></label>` : ''}
      <div class="seg" role="group" aria-label="금액 기준"><button type="button" data-metric="supply" aria-pressed="${ui.metric === 'supply'}">공급가액</button><button type="button" data-metric="total" aria-pressed="${ui.metric === 'total'}">합계 (부가세 포함)</button></div>`;
    const chips = [];
    if (ui.brand) chips.push(`<button type="button" data-clear="brand">브랜드 ${esc(brandLabel(ui.brand))} <span aria-hidden="true">×</span></button>`);
    if (ui.plat) chips.push(`<button type="button" data-clear="plat">플랫폼 ${esc(ui.plat)} <span aria-hidden="true">×</span></button>`);
    $('#chips').innerHTML = chips.length ? `<span class="k">거른 조건</span>${chips.join('')}` : '';
  }

  function render() {
    renderBar();
    const main = $('#main');
    if (!db || (!db.sales.length && !db.stock.length)) { main.innerHTML = emptyView(); statusLine(); return; }
    statusLine();
    const P = period();
    const cur = inRange(P.from, P.to, baseFilt), prev = inRange(P.prev.from, P.prev.to, baseFilt), yoy = inRange(P.yoy.from, P.yoy.to, baseFilt);
    const sc = sum(cur), sp = sum(prev), sy = sum(yoy);
    const hasPrev = covers(P.prev.from, P.prev.to), hasYoy = covers(P.yoy.from, P.yoy.to);
    const T = turnover();
    const out = [];
    if (!covers(P.from, P.to)) out.push(`<p class="rp-warn">선택한 기간(${esc(P.label)}) 중 일부는 올린 판매현황 밖입니다. 판매현황은 ${esc(db.minD)} ~ ${esc(db.maxD)} 만 있습니다.</p>`);
    out.push(kpis(P, sc, sp, sy, hasPrev, hasYoy, T));
    out.push(trendView(P));
    out.push(`<div class="rp-two">${platformView(cur, prev, hasPrev)}${partnerView(cur)}</div>`);
    out.push(brandView(cur, prev, hasPrev, T));
    out.push(stockView(T));
    out.push(promoView(T));
    out.push(tableView(T, P));
    out.push(uploadsView());
    main.innerHTML = out.join('');
  }

  function statusLine() {
    const el = $('#status');
    if (!db) return;
    const parts = [];
    parts.push(db.sales.length ? `판매현황 ${db.minD.replace(/-/g, '.')} ~ ${db.maxD.replace(/-/g, '.')} (${fmt(db.sales.length)}줄)` : '판매현황 없음');
    parts.push(db.stockDate ? `재고 기준 ${db.stockDate.replace(/-/g, '.')}` : '재고현황 없음');
    parts.push(db.items.size ? `품목 ${fmt(db.items.size)}개` : '품목등록 없음');
    el.textContent = parts.join(' · ');
  }

  function emptyView() {
    return `<section class="rp-empty">
      <h2>아직 올린 자료가 없습니다</h2>
      <p>이카운트에서 아래 세 가지를 엑셀로 내려받아 <b>이카운트 엑셀 올리기</b>에 한꺼번에 놓으면 됩니다. 처음에는 판매현황을 12개월 이상 올려야 회전율과 장기 무판매가 정확해집니다.</p>
      ${guideList()}
      <p><button class="btn pri" type="button" data-open-upload>이카운트 엑셀 올리기</button></p>
    </section>`;
  }
  function guideList() {
    return `<ol class="rp-guide">
      <li><b>판매현황</b>: 영업관리 › 판매현황. 기간을 정하고 거래처 조건은 비운 채 조회해 엑셀로 받습니다. 표시 항목에 <b>품목코드</b>와 <b>거래처명</b>을 넣어 두면 재고와 정확히 이어집니다.</li>
      <li><b>재고현황</b>: 재고 › 재고현황(전 창고). 오늘 날짜로 조회해 엑셀로 받습니다. 품목코드, 품목명, 재고 수량 열이 있으면 됩니다.</li>
      <li><b>품목등록</b>: 기초등록 › 품목등록 목록을 엑셀로 받습니다. 입고단가로 재고 금액을, 계층그룹으로 분류를 계산합니다. 품목이 바뀔 때만 다시 올리면 됩니다.</li>
    </ol>`;
  }

  function kpis(P, sc, sp, sy, hasPrev, hasYoy, T) {
    const stockRows = T.rows.filter(r => r.stock > 0);
    const sv = stockRows.reduce((m, r) => m + r.value, 0), sq = stockRows.reduce((m, r) => m + r.stock, 0);
    const est = stockRows.some(r => r.estimated);
    const dosAll = (() => { const d = T.rows.reduce((m, r) => m + r.daily, 0); return d > 0 ? sq / d : null; })();
    const aov = sc.orders ? sc.v / sc.orders : 0, aovP = sp.orders ? sp.v / sp.orders : 0;
    const tile = (label, value, sub, d1, d2, tipTxt) => `<div class="kpi"${tipTxt ? ` data-tip="${esc(tipTxt)}"` : ''}><p class="l">${label}</p><p class="v">${value}</p>${sub ? `<p class="s">${sub}</p>` : ''}<p class="d">${d1 || ''}${d2 || ''}</p></div>`;
    const unit = ui.metric === 'total' ? '합계, 부가세 포함' : '공급가액, 부가세 별도';
    return `<section class="rp-sec rp-kpis" id="summary"><header><h2>${esc(P.label)} 요약</h2><p>${esc(P.from.replace(/-/g, '.'))} ~ ${esc(P.to.replace(/-/g, '.'))} · 매출은 ${unit}${ui.brand || ui.plat ? ' · 거른 조건 적용' : ''}</p></header>
      <div class="kpi-row">
        ${tile('매출', fmtShort(sc.v) + '원', fmt(sc.v) + '원', hasPrev ? deltaHtml(chg(sc.v, sp.v), '전 기간') : '', hasYoy ? deltaHtml(chg(sc.v, sy.v), '전년') : '')}
        ${tile('판매 수량', fmt(sc.q) + '개', sc.retQ ? `반품 ${fmt(-sc.retQ)}개 포함` : '', hasPrev ? deltaHtml(chg(sc.q, sp.q), '전 기간') : '', '')}
        ${tile('전표 수', fmt(sc.orders) + '건', aov ? `건당 ${fmtShort(aov)}원` : '', hasPrev ? deltaHtml(chg(sc.orders, sp.orders), '전 기간') : '', hasPrev && aovP ? deltaHtml(chg(aov, aovP), '건당') : '')}
        ${tile('반품·취소', sc.ret ? fmtShort(sc.ret) + '원' : '없음', sc.ret ? `매출의 ${share(-sc.ret, sc.v - sc.ret).toFixed(1)}%` : '', '', '')}
        ${tile('재고 금액', db.stockDate ? fmtShort(sv) + '원' : '–', db.stockDate ? `${fmt(sq)}개 · ${fmt(stockRows.length)}개 모델` : '재고현황을 올려 주세요', '', '', est ? '입고단가가 없는 품목은 최근 판매 단가의 60%로 어림했습니다' : '입고단가 × 재고 수량')}
        ${tile('평균 재고일수', dosAll == null ? '–' : (isFinite(dosAll) ? fmt(dosAll) + '일' : '판매 없음'), dosAll && isFinite(dosAll) ? `연 회전 ${(365 / dosAll).toFixed(1)}회` : '', '', '', `최근 ${T.win}일 판매 속도로 지금 재고를 다 파는 데 걸리는 날수`)}
      </div></section>`;
  }

  function trendView(P) {
    const endM = monthStart(P.to);
    const months = []; for (let i = 11; i >= 0; i--) months.push(addMonths(endM, -i).slice(0, 7));
    const list = db.sales.filter(x => ym(x.d) >= months[0] && ym(x.d) <= months[11] && baseFilt(x));
    const plats = PLAT_RULES.map(r => r.name).concat(PLAT_OTHER).filter(n => list.some(x => x.plat === n));
    const data = months.map(m => { const o = { m, tot: 0 }; plats.forEach(p => o[p] = 0); return o; });
    list.forEach(x => { const o = data[months.indexOf(ym(x.d))]; if (o) { o[x.plat] += val(x); o.tot += val(x); } });
    const W = 760, H = 260, L = 52, R = 8, Tp = 18, B = 30, iw = W - L - R, ih = H - Tp - B;
    const max = niceMax(Math.max(1, ...data.map(o => plats.reduce((m, p) => m + Math.max(0, o[p]), 0))));
    const y = v => Tp + ih - v / max * ih;
    const band = iw / 12, bw = Math.min(24, band * 0.56);
    const inP = m => m >= P.from.slice(0, 7) && m <= P.to.slice(0, 7);
    // 값 표시는 몇 개만: 기간이 석 달 이하면 그 달들, 길면 마지막 달과 가장 큰 달
    const sel = data.filter(o => inP(o.m) && o.tot > 0);
    const capAt = new Set(sel.length <= 3 ? sel.map(o => o.m) : [sel[sel.length - 1].m, sel.reduce((a, b) => b.tot > a.tot ? b : a).m]);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="${i ? 'grid' : 'base'}"/><text x="${L - 8}" y="${yy + 4}" class="ax" text-anchor="end">${i ? fmtShort(v) : '0'}</text>`; }
    data.forEach((o, i) => {
      const cx = L + band * i + band / 2, x0 = cx - bw / 2;
      let acc = 0;
      const segs = plats.filter(p => o[p] > 0);
      segs.forEach((p, j) => {
        const h = o[p] / max * ih, yy = y(acc + o[p]); acc += o[p];
        const top = j === segs.length - 1, hh = Math.max(0, h - (j ? 2 : 0));
        const op = inP(o.m) ? 1 : 0.38;
        if (hh <= 0) return;
        const r = top ? Math.min(4, hh) : 0;
        const d = `M${x0},${yy + hh} V${yy + r} ${r ? `Q${x0},${yy} ${x0 + r},${yy}` : ''} H${x0 + bw - r} ${r ? `Q${x0 + bw},${yy} ${x0 + bw},${yy + r}` : ''} V${yy + hh} Z`;
        g += `<path d="${d}" fill="${platColor(p)}" opacity="${op}"/>`;
      });
      const tipTxt = `<b>${o.m.replace('-', '년 ')}월</b><br>합계 ${fmt(o.tot)}원` + plats.filter(p => o[p]).map(p => `<br><i style="background:${platColor(p)}"></i>${esc(p)} ${fmt(o[p])}원 (${share(o[p], o.tot).toFixed(0)}%)`).join('');
      g += `<rect x="${L + band * i}" y="${Tp}" width="${band}" height="${ih}" class="hit" data-tip="${esc(tipTxt)}"/>`;
      g += `<text x="${cx}" y="${H - 10}" class="ax${inP(o.m) ? ' on' : ''}" text-anchor="middle">${+o.m.slice(5)}월</text>`;
      if (capAt.has(o.m) && o.tot > 0) g += `<text x="${cx}" y="${y(Math.max(0, o.tot)) - 6}" class="cap" text-anchor="middle">${fmtShort(o.tot)}</text>`;
    });
    const legend = plats.map(p => `<li><i style="background:${platColor(p)}"></i>${esc(p)}</li>`).join('');
    const tbl = `<details class="rp-tbl"><summary>표로 보기</summary><div class="scroll"><table><thead><tr><th>월</th>${plats.map(p => `<th class="n">${esc(p)}</th>`).join('')}<th class="n">합계</th></tr></thead><tbody>${data.map(o => `<tr><td>${o.m.replace('-', '.')}</td>${plats.map(p => `<td class="n">${fmt(o[p])}</td>`).join('')}<td class="n">${fmt(o.tot)}</td></tr>`).join('')}</tbody></table></div></details>`;
    return sec('trend', '월별 매출 추이', `최근 12개월, 플랫폼별로 쌓음 · 진한 막대가 선택한 기간`, `<ul class="legend">${legend}</ul><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 매출 추이">${g}</svg>${tbl}`);
  }

  function platformView(cur, prev, hasPrev) {
    const g = groupBy(cur.filter(x => !ui.brand || x.brand === ui.brand), x => x.plat), gp = groupBy(prev.filter(x => !ui.brand || x.brand === ui.brand), x => x.plat);
    const tot = [...g.values()].reduce((m, o) => m + o.v, 0);
    const rows = [...g.values()].sort((a, b) => b.v - a.v);
    const max = Math.max(1, ...rows.map(r => r.v));
    const rb = cur.filter(x => x.rb && (!ui.brand || x.brand === ui.brand)).reduce((m, x) => m + val(x), 0);
    const body = rows.length ? `<ul class="hbars">${rows.map(r => {
      const p = gp.get(r.k), d = hasPrev ? chg(r.v, p ? p.v : 0) : null;
      return `<li><button type="button" class="hb${ui.plat === r.k ? ' on' : ''}" data-plat="${esc(r.k)}" data-tip="${esc(`<b>${esc(r.k)}</b><br>${fmt(r.v)}원 · ${fmt(r.q)}개<br>비중 ${share(r.v, tot).toFixed(1)}%${hasPrev ? `<br>전 기간 ${fmt(p ? p.v : 0)}원` : ''}<br>누르면 이 플랫폼만 봅니다`)}">
        <span class="nm"><i style="background:${platColor(r.k)}"></i>${esc(r.k)}</span>
        <span class="tr"><span class="fill" style="width:${Math.max(0.5, r.v / max * 100)}%;background:${platColor(r.k)}"></span></span>
        <span class="vv">${fmtShort(r.v)}</span><span class="sh">${share(r.v, tot).toFixed(0)}%</span><span class="dd">${d == null ? '' : fmtPct(d)}</span></button></li>`;
    }).join('')}</ul><p class="foot">RB(직접 판매) ${share(rb, tot).toFixed(0)}% · RS(도매) ${share(tot - rb, tot).toFixed(0)}%</p>` : '<p class="none">이 기간 매출이 없습니다.</p>';
    return sec('platform', '플랫폼별 매출', '거래처명을 플랫폼으로 묶음 · 오른쪽 끝은 전 기간 대비', body);
  }

  function partnerView(cur) {
    const ws = cur.filter(x => !x.rb && (!ui.brand || x.brand === ui.brand) && (!ui.plat || x.plat === ui.plat));
    const g = [...groupBy(ws, x => x.partner).values()].sort((a, b) => b.v - a.v);
    const tot = g.reduce((m, o) => m + o.v, 0);
    const body = g.length ? `<table class="mini"><thead><tr><th>거래처</th><th class="n">매출</th><th class="n">비중</th><th class="n">수량</th></tr></thead><tbody>${g.slice(0, 10).map(o => `<tr><td>${esc(partnerLabel(o.k))}</td><td class="n">${fmtShort(o.v)}</td><td class="n">${share(o.v, tot).toFixed(0)}%</td><td class="n">${fmt(o.q)}</td></tr>`).join('')}</tbody></table>${g.length > 10 ? `<p class="foot">그 밖 ${g.length - 10}곳 ${fmtShort(g.slice(10).reduce((m, o) => m + o.v, 0))}원</p>` : ''}` : '<p class="none">이 기간 도매 거래처 매출이 없습니다.</p>';
    return sec('partners', '도매 거래처 상위 10', 'RB 채널을 뺀 거래처', body);
  }

  function brandView(cur, prev, hasPrev, T) {
    const list = cur.filter(x => !ui.plat || x.plat === ui.plat), plist = prev.filter(x => !ui.plat || x.plat === ui.plat);
    const g = groupBy(list, x => x.brand), gp = groupBy(plist, x => x.brand);
    const stockBy = new Map(); T.rows.forEach(r => { const o = stockBy.get(r.brand) || { v: 0, q: 0, d: 0 }; o.v += r.value; o.q += r.stock; o.d += r.daily; stockBy.set(r.brand, o); });
    const tot = [...g.values()].reduce((m, o) => m + o.v, 0);
    const rows = [...g.values()].sort((a, b) => b.v - a.v);
    const top = ui.brand ? rows : rows.slice(0, 15), rest = ui.brand ? [] : rows.slice(15);
    const max = Math.max(1, ...top.map(r => r.v));
    const line = r => {
      const p = gp.get(r.k), d = hasPrev ? chg(r.v, p ? p.v : 0) : null, s = stockBy.get(r.k) || { v: 0, q: 0, d: 0 };
      const dos = s.q > 0 ? (s.d > 0 ? s.q / s.d : Infinity) : null;
      return `<li><button type="button" class="hb br${ui.brand === r.k ? ' on' : ''}" data-brand="${esc(r.k)}" data-tip="${esc(`<b>${esc(brandLabel(r.k))}</b><br>${fmt(r.v)}원 · ${fmt(r.q)}개 · 비중 ${share(r.v, tot).toFixed(1)}%${hasPrev ? `<br>전 기간 ${fmt(p ? p.v : 0)}원` : ''}<br>재고 ${fmt(s.q)}개 · ${fmt(s.v)}원<br>누르면 이 브랜드만 봅니다`)}">
        <span class="nm">${esc(brandLabel(r.k))}</span>
        <span class="tr"><span class="fill" style="width:${Math.max(0.5, r.v / max * 100)}%"></span></span>
        <span class="vv">${fmtShort(r.v)}</span><span class="sh">${share(r.v, tot).toFixed(1)}%</span><span class="dd">${d == null ? '' : fmtPct(d)}</span>
        <span class="st">${s.q > 0 ? fmtShort(s.v) : '–'}</span><span class="ds ${dos == null ? '' : dos === Infinity || dos > RC.OVER_DAYS ? 'bad' : dos < RC.LOW_DAYS ? 'low' : ''}">${dos == null ? '–' : dos === Infinity ? '판매 없음' : fmt(dos) + '일'}</span></button></li>`;
    };
    const head = `<li class="hh"><span class="nm">브랜드</span><span class="tr">매출</span><span class="vv"></span><span class="sh">비중</span><span class="dd">전 기간</span><span class="st">재고 금액</span><span class="ds">재고일수</span></li>`;
    const restLine = rest.length ? `<li class="rest"><span class="nm">그 밖 ${rest.length}개 브랜드</span><span class="tr"></span><span class="vv">${fmtShort(rest.reduce((m, o) => m + o.v, 0))}</span><span class="sh">${share(rest.reduce((m, o) => m + o.v, 0), tot).toFixed(1)}%</span></li>` : '';
    const body = rows.length ? `<ul class="hbars brands">${head}${top.map(line).join('')}${restLine}</ul>` : '<p class="none">이 기간 매출이 없습니다.</p>';
    return sec('brands', '브랜드별 매출', `상위 15개 · 재고 금액과 재고일수는 ${db.stockDate ? kDateY(db.stockDate) + ' 재고 기준' : '재고현황을 올리면 보입니다'} · 브랜드를 누르면 페이지 전체가 그 브랜드로 걸러집니다`, body);
  }

  function stockView(T) {
    if (!db.stockDate) return sec('stock', '재고 수준', '', `<p class="none">재고현황을 올리면 브랜드별 재고와 재고 건강도가 보입니다.</p>`);
    const rows = T.rows.filter(r => r.stock > 0);
    const tot = rows.reduce((m, r) => m + r.value, 0);
    const groups = [
      ['ok', '정상', STATUS.good, '✓', r => !r.flag || r.flag === 'slow'],
      ['low', '품절 위험', STATUS.warn, '!', r => r.flag === 'low'],
      ['over', '과다 재고', STATUS.serious, '▲', r => r.flag === 'over'],
      ['dead', '장기 무판매', STATUS.critical, '■', r => r.flag === 'dead'],
    ].map(([k, l, c, ic, f]) => { const rs = rows.filter(f); return { k, l, c, ic, n: rs.length, v: rs.reduce((m, r) => m + r.value, 0), q: rs.reduce((m, r) => m + r.stock, 0) }; });
    const segbar = `<div class="segbar" role="img" aria-label="재고 금액 건강도">${groups.filter(g => g.v > 0).map(g => `<span style="flex:${g.v};background:${g.c}" data-tip="${esc(`<b>${g.l}</b><br>${fmt(g.v)}원 (${share(g.v, tot).toFixed(1)}%)<br>${g.n}개 모델 · ${fmt(g.q)}개`)}"></span>`).join('')}</div>
      <ul class="health">${groups.map(g => `<li><span class="ic" style="color:${g.c}" aria-hidden="true">${g.ic}</span><span class="l">${g.l}</span><span class="v">${fmtShort(g.v)}원</span><span class="s">${share(g.v, tot).toFixed(0)}% · ${g.n}개 모델</span></li>`).join('')}</ul>
      <p class="foot">기준: 장기 무판매는 ${RC.DEAD_DAYS}일 넘게 판매 없음, 과다 재고는 재고일수 ${RC.OVER_DAYS}일 초과, 품절 위험은 ${RC.LOW_DAYS}일 미만${T.cover && T.cover < RC.DEAD_DAYS ? ` · 지금 판매현황이 ${T.cover}일치라 장기 무판매 판단이 이릅니다` : ''}</p>`;
    const by = new Map(); rows.forEach(r => { const o = by.get(r.brand) || { k: r.brand, v: 0, q: 0, d: 0, dead: 0 }; o.v += r.value; o.q += r.stock; o.d += r.daily; if (r.flag === 'dead' || r.flag === 'over') o.dead += r.value; by.set(r.brand, o); });
    const br = [...by.values()].sort((a, b) => b.v - a.v);
    const top = br.slice(0, 12), max = Math.max(1, ...top.map(o => o.v));
    const bars = `<ul class="hbars stock">${top.map(o => { const dos = o.d > 0 ? o.q / o.d : Infinity; return `<li><button type="button" class="hb" data-brand="${esc(o.k)}" data-tip="${esc(`<b>${esc(brandLabel(o.k))}</b><br>재고 ${fmt(o.q)}개 · ${fmt(o.v)}원<br>그중 과다·장기 무판매 ${fmt(o.dead)}원<br>재고일수 ${isFinite(dos) ? fmt(dos) + '일' : '판매 없음'}`)}">
      <span class="nm">${esc(brandLabel(o.k))}</span><span class="tr"><span class="fill stk" style="width:${Math.max(0.5, o.v / max * 100)}%"></span>${o.dead > 0 ? `<span class="fill bad" style="width:${Math.max(0.5, o.dead / max * 100)}%"></span>` : ''}</span>
      <span class="vv">${fmtShort(o.v)}</span><span class="sh">${share(o.v, tot).toFixed(0)}%</span><span class="ds ${!isFinite(dos) || dos > RC.OVER_DAYS ? 'bad' : dos < RC.LOW_DAYS ? 'low' : ''}">${isFinite(dos) ? fmt(dos) + '일' : '판매 없음'}</span></button></li>`; }).join('')}</ul>
      <ul class="legend"><li><i style="background:${SLOTS[1]}"></i>재고 금액</li><li><i style="background:${STATUS.critical}"></i>그중 과다 재고·장기 무판매</li></ul>`;
    return sec('stock', '재고 수준', `${kDateY(db.stockDate)} 재고 · 금액은 입고단가 기준`, `<div class="rp-two"><div><h3>재고 건강도</h3>${segbar}</div><div><h3>브랜드별 재고 금액 상위 12</h3>${bars}</div></div>`);
  }

  const FLAG = {
    dead: { l: '장기 무판매', c: STATUS.critical, ic: '■', act: '할인 20~30% · 번들 구성 · 아울렛(루비개러지) 이동' },
    over: { l: '과다 재고', c: STATUS.serious, ic: '▲', act: '할인 10~15% · 거래처 프로모션 · 노출 강화' },
    slow: { l: '판매 둔화', c: STATUS.warn, ic: '▼', act: '상세페이지·콘텐츠 보강 · 소폭 할인 · 원인 확인' },
    low: { l: '품절 위험', c: STATUS.warn, ic: '!', act: '재주문 검토' },
    out: { l: '재고 없음', c: OTHER, ic: '○', act: '재주문 검토' },
  };
  function promoView(T) {
    if (!db.stockDate) return '';
    const promo = T.rows.filter(r => ['dead', 'over', 'slow'].includes(r.flag)).sort((a, b) => b.value - a.value);
    const reorder = T.rows.filter(r => r.flag === 'low' || r.flag === 'out').sort((a, b) => b.daily - a.daily);
    const line = r => {
      const f = FLAG[r.flag];
      const why = r.flag === 'dead' ? (r.last ? `${fmt(r.since)}일째 판매 없음 (마지막 ${r.last.replace(/-/g, '.')})` : `올린 기간(${T.cover}일) 동안 판매 없음`)
        : r.flag === 'over' ? `재고일수 ${fmt(r.dos)}일 · 최근 ${T.win}일 ${fmt(r.q90)}개 판매`
        : r.flag === 'slow' ? `최근 ${T.win}일 ${fmt(r.q90)}개, 그 전 ${T.win}일 ${fmt(r.qPrev)}개 (${fmtPct(chg(r.q90, r.qPrev))})`
        : r.flag === 'low' ? `재고 ${fmt(r.stock)}개 · 하루 ${r.daily.toFixed(1)}개 판매 · 약 ${fmt(r.dos)}일분`
        : `재고 없음 · 최근 ${T.win}일 ${fmt(r.q90)}개 판매`;
      return `<tr><td><span class="flag" style="--c:${f.c}"><span class="ic" aria-hidden="true">${f.ic}</span>${f.l}</span></td><td><b>${esc(brandLabel(r.brand))}</b> ${esc(r.model)}${r.skuN > 1 ? ` <small>${r.skuN}개 품목</small>` : ''}</td><td class="n">${fmt(r.stock)}</td><td class="n">${r.stock > 0 ? fmtShort(r.value) + (r.estimated ? '*' : '') : '–'}</td><td>${esc(why)}</td><td class="act">${esc(f.act)}</td></tr>`;
    };
    const head = `<thead><tr><th>구분</th><th>모델</th><th class="n">재고</th><th class="n">재고 금액</th><th>근거</th><th>제안</th></tr></thead>`;
    const sumV = promo.reduce((m, r) => m + r.value, 0);
    const body = `${promo.length ? `<p class="lead">프로모션이 필요한 모델 <b>${promo.length}개</b>, 묶여 있는 재고 <b>${fmtShort(sumV)}원</b> (재고 금액 큰 순)</p><div class="scroll"><table class="promo">${head}<tbody>${promo.slice(0, 60).map(line).join('')}</tbody></table></div>${promo.length > 60 ? `<p class="foot">그 밖 ${promo.length - 60}개는 CSV로 받아 보세요.</p>` : ''}` : '<p class="none">기준에 걸리는 모델이 없습니다.</p>'}
      ${reorder.length ? `<h3>재주문 검토 <small>${reorder.length}개 모델 · 잘 팔리는 순</small></h3><div class="scroll"><table class="promo">${head}<tbody>${reorder.slice(0, 20).map(line).join('')}</tbody></table></div>` : ''}
      <p class="foot">* 입고단가가 없어 최근 판매 단가의 60%로 어림한 금액</p>`;
    return sec('promo', '프로모션 필요 항목', `${kDateY(T.end)} 기준 · 판매 속도는 최근 ${T.win}일`, body, `<button class="btn sm" type="button" data-csv="promo">CSV 받기</button>`);
  }

  const COLS = [
    ['brand', '브랜드', r => brandLabel(r.brand)], ['model', '모델', r => r.model],
    ['pq', '판매 (기간)', r => r.pq, 'n'], ['pv', '매출 (기간)', r => r.pv, 'n'],
    ['q90', '최근 90일', r => r.q90, 'n'], ['stock', '재고', r => r.stock, 'n'], ['value', '재고 금액', r => r.value, 'n'],
    ['dos', '재고일수', r => r.dos, 'n'], ['turn', '연 회전율', r => r.turn, 'n'], ['last', '마지막 판매', r => r.last || ''],
  ];
  function tableView(T, P) {
    const q = ui.q.trim().toLowerCase();
    let rows = T.rows.filter(r => !q || (r.brand + ' ' + brandLabel(r.brand) + ' ' + r.model).toLowerCase().includes(q));
    const col = COLS.find(c => c[0] === ui.sort) || COLS[6];
    const key = ui.sort === 'value' ? r => r.value : col[2];
    rows = rows.slice().sort((a, b) => { let x = key(a), y = key(b); if (x == null) x = -1; if (y == null) y = -1; if (x === Infinity) x = 1e12; if (y === Infinity) y = 1e12; return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });
    const show = rows.slice(0, ui.tableN);
    const cell = (r, c) => {
      const v = c[2](r);
      if (c[0] === 'brand') return `<td>${esc(v)}</td>`;
      if (c[0] === 'model') return `<td>${esc(v)}${r.skuN > 1 ? ` <small>${r.skuN}</small>` : ''}${r.flag && FLAG[r.flag] ? ` <span class="flag sm" style="--c:${FLAG[r.flag].c}" title="${FLAG[r.flag].l}"><span class="ic">${FLAG[r.flag].ic}</span>${FLAG[r.flag].l}</span>` : ''}</td>`;
      if (c[0] === 'dos') return `<td class="n ${v === Infinity || v > RC.OVER_DAYS ? 'bad' : v && v < RC.LOW_DAYS ? 'low' : ''}">${r.stock <= 0 ? '–' : v === Infinity ? '판매 없음' : fmt(v)}</td>`;
      if (c[0] === 'turn') return `<td class="n">${v == null ? '품절' : v ? v.toFixed(1) + '회' : '–'}</td>`;
      if (c[0] === 'pv' || c[0] === 'value') return `<td class="n">${v ? fmtShort(v) + (c[0] === 'value' && r.estimated ? '*' : '') : '–'}</td>`;
      if (c[0] === 'last') return `<td class="n">${v ? v.slice(2).replace(/-/g, '.') : '–'}</td>`;
      return `<td class="n">${v ? fmt(v) : '–'}</td>`;
    };
    const th = c => `<th class="${c[3] || ''}"><button type="button" data-sort="${c[0]}" aria-sort="${ui.sort === c[0] ? (ui.dir < 0 ? 'descending' : 'ascending') : 'none'}">${c[1]}${ui.sort === c[0] ? (ui.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`;
    const body = `<div class="tbl-tools"><input type="search" id="tq" placeholder="브랜드·모델 찾기" value="${esc(ui.q)}" aria-label="브랜드·모델 찾기"><span class="cnt">${fmt(rows.length)}개 모델</span></div>
      <div class="scroll"><table class="turn"><thead><tr>${COLS.map(th).join('')}</tr></thead><tbody>${show.map(r => `<tr>${COLS.map(c => cell(r, c)).join('')}</tr>`).join('')}</tbody></table></div>
      ${rows.length > show.length ? `<p class="more"><button class="btn sm" type="button" data-more>${fmt(Math.min(100, rows.length - show.length))}개 더 보기</button></p>` : ''}
      <p class="foot">모델은 품목명에서 사이즈 (괄호)와 ' - 규격'을 뗀 이름으로 묶었습니다 · 판매 (기간)은 ${esc(P.label)} · 재고일수와 회전율은 ${kDateY(T.end)} 기준 최근 ${T.win}일 판매 속도</p>`;
    return sec('turnover', '모델별 회전율', '머리글을 누르면 정렬', body, `<button class="btn sm" type="button" data-csv="turn">CSV 받기</button>`);
  }

  function uploadsView() {
    const ups = db.uploads.slice(0, 12);
    const kind = { sales: '판매현황', stock: '재고현황', items: '품목등록' };
    return `<section class="rp-sec rp-ups" id="uploads"><header><h2>올린 기록</h2><p>최근 12건 · 지우면 그 파일로 들어간 줄이 모두 빠집니다. 판매현황을 다시 올려 바꾼 기간이면 지운 뒤 그 기간을 다시 올려 주세요</p></header>
      ${ups.length ? `<table class="mini"><thead><tr><th>종류</th><th>파일</th><th>기간</th><th class="n">줄</th><th>올린 사람</th><th></th></tr></thead><tbody>${ups.map(u => `<tr><td>${kind[u.kind] || esc(u.kind)}</td><td>${esc(u.file)}${u.scope ? `<br><small>거래처 ${esc(u.scope)}</small>` : ''}</td><td>${esc(u.from)}${u.to && u.to !== u.from ? ' ~ ' + esc(u.to) : ''}</td><td class="n">${fmt(num(u.rows))}</td><td>${esc(u.by)}<br><small>${esc(u.at)}</small></td><td><button class="btn sm ghost" type="button" data-del="${esc(u.id)}">지우기</button></td></tr>`).join('')}</tbody></table>` : '<p class="none">기록이 없습니다.</p>'}
      <details class="rp-tbl"><summary>이카운트에서 받는 법</summary>${guideList()}</details></section>`;
  }

  // ─────────── CSV ───────────
  function csv(name, head, rows) {
    const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + [head].concat(rows).map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportCsv(kind) {
    const T = turnover(), P = period();
    const base = r => [brandLabel(r.brand), r.model, r.stock, Math.round(r.value), r.dos === Infinity ? '판매 없음' : Math.round(r.dos), r.q90, r.qPrev, r.last];
    if (kind === 'promo') {
      const rows = T.rows.filter(r => ['dead', 'over', 'slow', 'low', 'out'].includes(r.flag)).sort((a, b) => b.value - a.value);
      csv(`프로모션필요_${T.end}.csv`, ['구분', '브랜드', '모델', '재고', '재고 금액', '재고일수', `최근 ${T.win}일 판매`, `그 전 ${T.win}일 판매`, '마지막 판매', '제안'], rows.map(r => [FLAG[r.flag].l].concat(base(r), [FLAG[r.flag].act])));
    } else {
      csv(`모델별회전율_${P.from}_${P.to}.csv`, ['브랜드', '모델', '재고', '재고 금액', '재고일수', `최근 ${T.win}일 판매`, `그 전 ${T.win}일 판매`, '마지막 판매', '기간 판매 수량', '기간 매출', '연 회전율', '상태'],
        T.rows.slice().sort((a, b) => b.value - a.value).map(r => base(r).concat([r.pq, Math.round(r.pv), r.turn == null ? '' : r.turn.toFixed(2), r.flag ? FLAG[r.flag].l : ''])));
    }
  }

  // ─────────── 이벤트 ───────────
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-open-upload]');
    if (!t) return;
    if (t.dataset.preset) { ui.preset = t.dataset.preset; if (ui.preset === 'custom' && !ui.from) { const P = period(); ui.from = P.from; ui.to = P.to; } saveUi(); render(); return; }
    if (t.dataset.metric) { ui.metric = t.dataset.metric; saveUi(); render(); return; }
    if (t.dataset.clear) { ui[t.dataset.clear] = ''; render(); return; }
    if (t.hasAttribute('data-brand')) { ui.brand = ui.brand === t.dataset.brand ? '' : t.dataset.brand; ui.tableN = 40; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.dataset.plat) { ui.plat = ui.plat === t.dataset.plat ? '' : t.dataset.plat; render(); return; }
    if (t.dataset.sort) { if (ui.sort === t.dataset.sort) ui.dir = -ui.dir; else { ui.sort = t.dataset.sort; ui.dir = ['brand', 'model'].includes(ui.sort) ? 1 : -1; } render(); keepAt('#turnover'); return; }
    if (t.hasAttribute('data-more')) { ui.tableN += 100; render(); keepAt('#turnover'); return; }
    if (t.dataset.csv) { exportCsv(t.dataset.csv); return; }
    if (t.dataset.del) { delUpload(t.dataset.del, t); return; }
    if (t.hasAttribute('data-open-upload')) { openUpload(); return; }
  });
  function keepAt(sel) { const el = $(sel); if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView(); }
  document.addEventListener('input', e => {
    if (e.target.id === 'tq') { ui.q = e.target.value; ui.tableN = 40; const pos = e.target.selectionStart; render(); const f = $('#tq'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'cFrom' || e.target.id === 'cTo') { ui[e.target.id === 'cFrom' ? 'from' : 'to'] = e.target.value; saveUi(); render(); }
  });
  $('#btnUpload').onclick = () => openUpload();
  $('#btnPrint').onclick = () => print();

  let armed = '';
  async function delUpload(id, btn) {
    if (armed !== id) { armed = id; btn.textContent = '한 번 더 누르면 지움'; setTimeout(() => { if (armed === id) { armed = ''; btn.textContent = '지우기'; } }, 4000); return; }
    armed = ''; btn.disabled = true; btn.textContent = '지우는 중…';
    try { await MR.post({ action: 'report', op: 'del', id }); await load(); }
    catch (err) { alert(err.message); btn.disabled = false; btn.textContent = '지우기'; }
  }

  // ─────────── 엑셀 올리기 ───────────
  const dlg = $('#dlg'), dlgBody = $('#dlgBody');
  let pending = [];   // 읽은 파일들

  function openUpload() {
    pending = [];
    drawUpload();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function drawUpload(msg) {
    dlgBody.innerHTML = `
      <label class="drop" id="drop"><input type="file" id="files" multiple accept=".xlsx,.xls,.csv"><span class="t">판매현황 · 재고현황 · 품목등록 엑셀을 여기에 놓거나 눌러서 고르세요</span><span class="s">여러 파일을 한꺼번에 놓아도 됩니다. 종류는 파일의 제목 줄과 머리글로 알아봅니다</span></label>
      ${msg ? `<p class="rp-warn">${esc(msg)}</p>` : ''}
      <div id="pend">${pending.map(pendView).join('')}</div>
      ${pending.length ? `<div class="dlg-acts"><button type="button" class="btn" value="cancel" id="dlgCancel">닫기</button><button type="button" class="btn pri" id="dlgSave"${pending.some(p => p.ok) ? '' : ' disabled'}>저장 (${pending.filter(p => p.ok).length}개 파일)</button></div>` : ''}
      <details class="rp-tbl"><summary>이카운트에서 받는 법</summary>${guideList()}</details>`;
    const inp = $('#files'), drop = $('#drop');
    inp.onchange = () => readFiles([...inp.files]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readFiles([...e.dataTransfer.files]); };
    const c = $('#dlgCancel'); if (c) c.onclick = () => dlg.close();
    const s = $('#dlgSave'); if (s) s.onclick = saveAll;
    dlgBody.querySelectorAll('[data-pi]').forEach(el => el.onchange = () => {
      const p = pending[+el.dataset.pi], f = el.dataset.f;
      if (f === 'kind') { p.kind = el.value; p.map = autoMap(p.kind, p.head); }
      else if (f === 'from' || f === 'to' || f === 'date') p[f] = el.value;
      else if (f === 'scopeMode') { p.scopeMode = el.value; p.scopeTouched = true; }
      else if (f === 'skip') p.skip = el.checked;
      else p.map[f] = el.value === '' ? -1 : +el.value;
      build(p); drawUpload();
    });
  }

  let xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = RC.XLSX_URL; s.onload = res; s.onerror = () => { xlsxLoading = null; rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }

  async function readFiles(files) {
    if (!files.length) return;
    try { await loadXlsx(); } catch (err) { drawUpload(err.message); return; }
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
        pending.push(inspect(f.name, aoa, wb.SheetNames[0]));
      } catch (err) { pending.push({ file: f.name, ok: false, err: '읽을 수 없는 파일입니다: ' + err.message, head: [], rows: [] }); }
    }
    drawUpload();
  }

  const FIELDS = {
    sales: [['date', '일자', /^(일자|판매\s*일자|전표\s*일자|일자\s*-\s*no)/i, true], ['code', '품목코드', /품목\s*코드/], ['name', '품목명', /품목명/, true], ['qty', '수량', /^수량$|판매\s*수량/, true], ['price', '단가', /^단가$/], ['supply', '공급가액', /공급가액/, true], ['vat', '부가세', /부가세/], ['total', '합계', /^합계$|합계\s*금액/], ['partner', '거래처명', /거래처\s*명|판매\s*채널|^거래처$/, true], ['wh', '창고', /창고/]],
    stock: [['code', '품목코드', /품목\s*코드/], ['name', '품목명', /품목명/, true], ['spec', '규격', /^규격$/], ['wh', '창고', /창고\s*명|^창고$/], ['qty', '재고 수량', /재고\s*수량|^재고$|^합계$|^계$|^수량$|현재\s*재고|재고\s*합계/, true]],
    items: [['code', '품목코드', /품목\s*코드/, true], ['name', '품목명', /품목명/, true], ['cost', '입고단가', /입고\s*단가/], ['out', '출고단가', /출고\s*단가/], ['retail', '소비자가격', /소비자\s*가/], ['supply', '서플라이', /서플라이|딜러/], ['cat', '계층그룹명', /계층\s*그룹/], ['group', '품목그룹1명', /품목\s*그룹\s*1/]],
  };
  const KIND_L = { sales: '판매현황', stock: '재고현황', items: '품목등록' };

  function inspect(file, aoa, sheet) {
    const rows = aoa.map(r => r.map(c => String(c == null ? '' : c).trim()));
    // 머리글 줄: 알려진 머리글이 3개 이상 있는 첫 줄. 그 위가 제목 줄 (예: 판매현황 / 회사명 : 루비컴퍼니 / 거래처 / 2026/10/01 ~ 2026/10/31)
    const known = /일자|품목\s*코드|품목명|수량|단가|공급가액|부가세|합계|거래처|창고|재고|소비자|계층/;
    let hi = rows.findIndex((r, i) => i < 20 && r.filter(c => known.test(c)).length >= 3);
    if (hi < 0) return { file, ok: false, err: '머리글 줄(품목명, 수량 같은 열 이름)을 찾지 못했습니다', head: [], rows: [] };
    const title = rows.slice(0, hi).map(r => r.filter(Boolean).join(' / ')).filter(Boolean).join(' / ') || String(sheet || '');
    const head = rows[hi];
    const H = head.join('|');
    const tt = title + ' ' + (sheet || '');
    let kind = /판매\s*현황|판매\s*조회/.test(tt) ? 'sales' : /재고/.test(tt) ? 'stock' : /품목\s*등록/.test(tt) ? 'items'
      : /공급가액/.test(H) && /거래처|판매\s*채널/.test(H) ? 'sales' : /입고\s*단가|소비자\s*가/.test(H) ? 'items' : /재고/.test(H) ? 'stock' : '';
    const p = { file, title, head, data: rows.slice(hi + 1), kind, map: {}, ok: false, from: '', to: '', date: '', scope: [], scopeMode: 'all' };
    const tm = title.match(/(\d{4})[\/.-](\d{2})[\/.-](\d{2})\s*~\s*(\d{4})[\/.-](\d{2})[\/.-](\d{2})/);
    if (tm) { p.from = `${tm[1]}-${tm[2]}-${tm[3]}`; p.to = `${tm[4]}-${tm[5]}-${tm[6]}`; }
    const one = title.match(/(\d{4})[\/.-](\d{2})[\/.-](\d{2})/);
    p.date = one ? `${one[1]}-${one[2]}-${one[3]}` : todayKST();
    if (p.date > todayKST()) p.date = todayKST();
    // 제목 줄의 조건 (회사명과 기간을 뺀 나머지): 거래처로 걸러 받은 판매현황인지 확인
    p.filters = title.split(/\s+\/\s+/).map(x => x.trim()).filter(x => x && !/회사명|^\d{4}[\/.-]\d{2}[\/.-]\d{2}/.test(x) && !/^(판매|재고)\s*현황$|품목\s*등록/.test(x) && !/~/.test(x));
    if (kind) p.map = autoMap(kind, head);
    build(p);
    return p;
  }
  function autoMap(kind, head) {
    const m = {};
    (FIELDS[kind] || []).forEach(([k, , re]) => { m[k] = head.findIndex(h => re.test(h)); });
    if (kind === 'stock' && m.qty >= 0) {   // 창고별 열이 있는 재고현황: '합계'·'계'·'재고수량' 열을 우선
      const pref = head.findIndex(h => /재고\s*수량|^합계$|^계$|재고\s*합계/.test(h)); if (pref >= 0) m.qty = pref;
    }
    return m;
  }

  const DATE_RE = /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:\s*-\s*(\d+))?\s*$/;
  function build(p) {
    p.ok = false; p.err = ''; p.warn = []; p.rows = [];
    if (!p.kind) { p.err = '판매현황·재고현황·품목등록 중 무엇인지 골라 주세요'; return; }
    const m = p.map, need = (FIELDS[p.kind] || []).filter(f => f[3] && !(m[f[0]] >= 0));
    if (need.length) { p.err = `열을 찾지 못했습니다: ${need.map(f => f[1]).join(', ')}. 아래에서 열을 골라 주세요`; return; }
    const g = (r, k) => m[k] >= 0 ? r[m[k]] : '';
    if (p.kind === 'sales') {
      let min = '', max = '', amt = 0, skipped = 0;
      p.data.forEach(r => {
        const dm = String(g(r, 'date')).match(DATE_RE);
        if (!dm) { skipped++; return; }
        const d = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
        const qty = num(g(r, 'qty')), supply = num(g(r, 'supply'));
        if (!qty && !supply) { skipped++; return; }
        const vat = num(g(r, 'vat')), total = m.total >= 0 ? num(g(r, 'total')) : supply + vat;
        p.rows.push([d, dm[4] || '', g(r, 'code'), g(r, 'name'), qty, num(g(r, 'price')), supply, vat, total, g(r, 'partner'), g(r, 'wh')]);
        amt += supply; if (!min || d < min) min = d; if (!max || d > max) max = d;
      });
      if (!p.rows.length) { p.err = '판매 줄을 찾지 못했습니다. 일자 열이 2026/10/01 -1 같은 모양인지 확인해 주세요'; return; }
      if (!p.from) { p.from = monthStart(min); p.to = max; p.warn.push('제목 줄에서 기간을 찾지 못해 줄의 날짜로 잡았습니다. 실제 조회 기간과 다르면 고쳐 주세요'); }
      const out = p.rows.filter(r => r[0] < p.from || r[0] > p.to).length;
      if (out) p.warn.push(`기간 밖의 줄 ${out}개는 저장하지 않습니다`);
      p.amount = amt; p.min = min; p.max = max; p.skipped = skipped;
      const partners = [...new Set(p.rows.map(r => r[9]).filter(Boolean))];
      p.partners = partners;
      const fp = (p.filters || []).filter(f => partners.includes(f) || partners.some(x => normName(x) === normName(f)));
      if ((p.filters || []).length) {
        if (fp.length && p.scopeMode === 'all' && !p.scopeTouched) { p.scopeMode = 'partners'; p.scopeTouched = true; }
        const other = p.filters.filter(f => !fp.includes(f));
        if (other.length) p.warn.push(`제목 줄에 조건이 있습니다: ${other.join(', ')}. 전체 판매현황이 아니면 같은 기간의 다른 매출이 지워질 수 있으니 '이 파일의 거래처만 바꾸기'를 고르세요`);
      }
      p.scope = p.scopeMode === 'partners' ? partners : [];
      if (!p.rows.some(r => r[2])) p.warn.push('품목코드 열이 없어 품목명으로 재고와 잇습니다. 이카운트 판매현황 표시 항목에 품목코드를 넣으면 더 정확합니다');
    } else if (p.kind === 'stock') {
      const agg = new Map();
      p.data.forEach(r => {
        const name = g(r, 'name'), code = g(r, 'code');
        if (!name && !code) return;
        if (/^(합계|총합계|계)$/.test(name) || /^(합계|총합계|계)$/.test(code)) return;
        if (/오전|오후/.test(name + code) && /:\d\d/.test(name + code)) return;
        const spec = g(r, 'spec');
        const full = spec && !name.includes(spec) ? `${name} [${spec}]` : name;
        const k = (code || normName(full)) + '|' + g(r, 'wh');
        const o = agg.get(k) || [code, full, g(r, 'wh'), 0];
        o[3] += num(g(r, 'qty')); agg.set(k, o);
      });
      p.rows = [...agg.values()].filter(r => r[3]);
      if (!p.rows.length) { p.err = '재고 줄을 찾지 못했습니다. 재고 수량 열을 확인해 주세요'; return; }
      p.qtySum = p.rows.reduce((s, r) => s + r[3], 0);
      if (p.rows.some(r => r[3] < 0)) p.warn.push(`마이너스 재고 ${p.rows.filter(r => r[3] < 0).length}개 품목은 재고 0으로 봅니다`);
      if (!p.rows.some(r => r[0])) p.warn.push('품목코드 열이 없어 품목명으로 판매와 잇습니다');
    } else {
      p.data.forEach(r => {
        const code = g(r, 'code'), name = g(r, 'name');
        if (!code && !name) return;
        if (/^\d{4}[\/.-]\d{2}[\/.-]\d{2}/.test(code) && !name) return;
        p.rows.push([code, name, num(g(r, 'cost')), num(g(r, 'out')), num(g(r, 'retail')), num(g(r, 'supply')), g(r, 'cat'), g(r, 'group')]);
      });
      if (!p.rows.length) { p.err = '품목 줄을 찾지 못했습니다'; return; }
      if (m.cost < 0) p.warn.push('입고단가 열이 없어 재고 금액을 판매 단가로 어림합니다');
    }
    p.ok = !p.skip;
  }

  function pendView(p, i) {
    const opts = (sel) => `<option value="">없음</option>` + p.head.map((h, j) => `<option value="${j}"${sel === j ? ' selected' : ''}>${esc(h || '(빈 열 ' + (j + 1) + ')')}</option>`).join('');
    const maps = p.kind ? (FIELDS[p.kind] || []).map(([k, l, , req]) => `<label><span>${l}${req ? '' : ' (선택)'}</span><select data-pi="${i}" data-f="${k}">${opts(p.map[k])}</select></label>`).join('') : '';
    let sum = '';
    if (p.ok || (p.rows && p.rows.length)) {
      if (p.kind === 'sales') sum = `${fmt(p.rows.filter(r => r[0] >= p.from && r[0] <= p.to).length)}줄 · 공급가액 ${fmt(p.amount)}원 · 거래처 ${p.partners.length}곳 · 날짜 ${p.min} ~ ${p.max}`;
      if (p.kind === 'stock') sum = `${fmt(p.rows.length)}개 품목(창고별) · 재고 ${fmt(p.qtySum)}개`;
      if (p.kind === 'items') sum = `${fmt(p.rows.length)}개 품목`;
    }
    const extra = p.kind === 'sales' ? `<div class="pf"><label><span>기간 시작</span><input type="date" data-pi="${i}" data-f="from" value="${esc(p.from)}"></label><label><span>기간 끝</span><input type="date" data-pi="${i}" data-f="to" value="${esc(p.to)}"></label>
        <label class="wide"><span>바꿀 범위</span><select data-pi="${i}" data-f="scopeMode"><option value="all"${p.scopeMode === 'all' ? ' selected' : ''}>이 기간의 매출 전체를 이 파일로 바꾸기</option><option value="partners"${p.scopeMode === 'partners' ? ' selected' : ''}>이 기간에서 이 파일에 있는 거래처 줄만 바꾸기</option></select></label></div>`
      : p.kind === 'stock' ? `<div class="pf"><label><span>재고 기준일</span><input type="date" data-pi="${i}" data-f="date" value="${esc(p.date)}"></label></div>`
      : p.kind === 'items' ? `<p class="s">품목등록은 통째로 바뀝니다 (예전 품목 목록을 이 파일로 대체)</p>` : '';
    return `<article class="pend${p.ok ? '' : ' bad'}">
      <header><b>${esc(p.file)}</b><select data-pi="${i}" data-f="kind" aria-label="종류"><option value="">종류 고르기</option>${Object.entries(KIND_L).map(([k, l]) => `<option value="${k}"${p.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <label class="skip"><input type="checkbox" data-pi="${i}" data-f="skip"${p.skip ? ' checked' : ''}> 빼기</label></header>
      ${p.title ? `<p class="s">제목 줄: ${esc(p.title.slice(0, 160))}</p>` : ''}
      ${sum ? `<p class="sum">${esc(sum)}</p>` : ''}
      ${p.err ? `<p class="rp-warn">${esc(p.err)}</p>` : ''}${(p.warn || []).map(w => `<p class="rp-note">${esc(w)}</p>`).join('')}
      ${extra}
      ${p.kind ? `<details${p.err ? ' open' : ''}><summary>열 맞추기</summary><div class="maps">${maps}</div></details>` : ''}
    </article>`;
  }

  async function saveAll() {
    const list = pending.filter(p => p.ok);
    // 품목 → 재고 → 판매 순 (뒤의 화면 계산이 품목 정보를 쓰므로)
    list.sort((a, b) => ['items', 'stock', 'sales'].indexOf(a.kind) - ['items', 'stock', 'sales'].indexOf(b.kind));
    const btn = $('#dlgSave'); btn.disabled = true;
    const CH = 1500;
    try {
      for (const p of list) {
        const rows = p.kind === 'sales' ? p.rows.filter(r => r[0] >= p.from && r[0] <= p.to) : p.rows;
        const up = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const n = Math.max(1, Math.ceil(rows.length / CH));
        for (let i = 0; i < n; i++) {
          btn.textContent = `${KIND_L[p.kind]} 저장 중… ${i + 1}/${n}`;
          const chunk = rows.slice(i * CH, (i + 1) * CH);
          await MR.post({ action: 'report', op: p.kind, up, file: p.file, from: p.from, to: p.to, date: p.date, scope: p.scope, rows: chunk, first: i === 0, last: i === n - 1, total_rows: rows.length, amount: p.amount || 0 });
        }
        p.saved = true;
      }
      dlg.close();
      await load();
    } catch (err) {
      btn.disabled = false; btn.textContent = '다시 저장';
      drawUpload('저장하지 못했습니다: ' + err.message + (list.some(p => p.saved) ? ' (앞의 파일은 저장됐습니다)' : ''));
    }
  }

  // ─────────── 불러오기 ───────────
  async function load() {
    $('#status').textContent = '불러오는 중…';
    try {
      raw = await MR.get({ action: 'report' });
      db = prepare(raw);
      render();
    } catch (err) {
      db = null;
      $('#main').innerHTML = `<section class="rp-empty"><h2>보고서를 열 수 없습니다</h2><p>${esc(err.message)}</p>${/unknown action/.test(err.message) ? '<p>Apps Script(Code.gs)를 새 판으로 배포해야 합니다. 관리자에게 알려 주세요.</p>' : ''}</section>`;
      $('#status').textContent = '';
      renderBar();
    }
  }

  if (window.MR && MR.requireLogin()) load();
  window.RubiReport = { reload: load, _db: () => db, _period: period, _turnover: turnover, _inspect: inspect, _modelOf: modelOf, _brandKey: brandKey, _platformOf: platformOf };
})();
