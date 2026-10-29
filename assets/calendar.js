// My Rubi 첫 화면 오른쪽 달력 (구글 캘린더)
// 시계와 체크리스트 사이에 한 달 격자만 보여줌. 주·일 보기는 없음
// Apps Script(calendar 동작)가 CONFIG.CALENDARS 에 적은 구글 캘린더의 한 달치 일정을 돌려주고, 여기서는 읽기만 함
// 로그인이 꺼져 있으면(브라우저 저장 상태) 이 칸은 보이지 않음
(() => {
'use strict';

const MR = window.MR;
const K_CACHE_BASE = 'myrubi.cal.cache';
const POLL_MS = 300000;   // 5분마다, 그리고 탭으로 돌아올 때 다시 불러옴
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_DOTS = 3;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const ym = d => ymd(d).slice(0, 7);
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };
/** 공유 PC에서 앞사람의 일정이 보이지 않게 계정마다 저장 칸을 나눔 */
const K_CACHE = () => K_CACHE_BASE + '.' + ((MR && MR.user().email) || '');
const shared = () => !!(MR && MR.loginEnabled() && MR.session());

let host = null;            // 오른쪽 칸 (#cal)
let month = ym(new Date()); // 보고 있는 달 'YYYY-MM'
let picked = today();       // 고른 날 (그 날의 일정이 격자 아래에 보임)
let data = {};              // month → { start, end, calendars, events }
let loading = {}, msg = '', started = false;

// ─────────── 자료 ───────────
/** 날짜별 일정. 여러 날에 걸친 일정은 그 날마다 들어감 */
function byDay(d) {
  const map = {};
  if (!d) return map;
  d.events.forEach(ev => {
    let day = ev.date;
    const last = ev.endDate && ev.endDate >= ev.date ? ev.endDate : ev.date;
    for (let i = 0; i < 62 && day <= last; i++) {
      if (day >= d.start && day <= d.end) {
        (map[day] = map[day] || []).push(Object.assign({}, ev, { cont: day !== ev.date, last: day === last }));
      }
      day = addDays(day, 1);
    }
  });
  return map;
}
function label(m) { const [y, mo] = m.split('-'); return `${y}년 ${+mo}월`; }
function shiftMonth(m, n) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return ym(d); }
/** 구글 캘린더 월 보기 주소 */
function gcalUrl(m) { const [y, mo] = m.split('-'); return `https://calendar.google.com/calendar/u/0/r/month/${y}/${+mo}/1`; }

async function load(m, quiet) {
  if (!shared() || loading[m]) return;
  loading[m] = true;
  if (!quiet) render();
  try {
    const j = await MR.get({ action: 'calendar', month: m });
    data[j.month || m] = { start: j.start, end: j.end, calendars: j.calendars || [], events: j.events || [], at: Date.now() };
    msg = '';
    const c = readJson(K_CACHE(), {});
    c[m] = data[m];
    // 지난달·다음달 정도만 남겨 둠
    Object.keys(c).forEach(k => { if (Math.abs(monthDiff(k, month)) > 1) delete c[k]; });
    ls.set(K_CACHE(), JSON.stringify(c));
  } catch (e) {
    msg = e.message || '일정을 불러오지 못했습니다';
  } finally {
    loading[m] = false;
    render();
  }
}
function monthDiff(a, b) { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (ay - by) * 12 + (am - bm); }

// ─────────── 그리기 ───────────
function render() {
  if (!host) return;
  if (!started || !shared()) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');
  const d = data[month], days = byDay(d);
  const multi = d && d.calendars.length > 1;
  const t = today();

  // 격자: 일요일 시작 6주. 서버 범위(start)가 있으면 그걸, 없으면 직접 계산
  let cur = d ? d.start : (() => { const f = new Date(month + '-01T00:00'); f.setDate(1 - f.getDay()); return ymd(f); })();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const inMonth = cur.slice(0, 7) === month;
    const list = days[cur] || [];
    const dots = list.slice(0, MAX_DOTS).map(() => '<i></i>').join('');
    const cls = ['cal-d', inMonth ? '' : 'out', cur === t ? 'now' : '', cur === picked ? 'on' : '', list.length ? 'has' : ''].filter(Boolean).join(' ');
    const dow = new Date(cur + 'T00:00').getDay();
    cells += `<button class="${cls}" data-day="${cur}" aria-label="${esc(cur)} 일정 ${list.length}건"${cur === picked ? ' aria-current="date"' : ''}>
      <span class="n${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}">${+cur.slice(8)}</span><span class="dots" aria-hidden="true">${dots}</span></button>`;
    cur = addDays(cur, 1);
  }

  // 고른 날의 일정
  const list = days[picked] || [];
  const pd = new Date(picked + 'T00:00');
  const pLabel = picked === t ? '오늘' : `${pd.getMonth() + 1}/${pd.getDate()} (${DOW[pd.getDay()]})`;
  const items = list.length ? list.map(ev => {
    const when = ev.allDay ? '종일' : ev.cont ? (ev.last ? `~${ev.end}` : '계속') : ev.start + (ev.end && ev.end !== ev.start ? `–${ev.end}` : '');
    const cal = multi && d.calendars[ev.cal] ? `<span class="cl">${esc(d.calendars[ev.cal].name)}</span>` : '';
    return `<li class="cal-ev"><span class="tm">${esc(when)}</span><span class="tt" title="${esc(ev.title)}${ev.location ? '\n' + esc(ev.location) : ''}">${esc(ev.title)}</span>${cal}</li>`;
  }).join('') : `<li class="cal-none">${d ? '일정 없음' : loading[month] ? '불러오는 중' : ''}</li>`;

  host.innerHTML = `
    <p class="kicker"><a href="${gcalUrl(month)}" target="_blank" rel="noopener" title="구글 캘린더에서 열기">CALENDAR</a></p>
    <div class="cal-h">
      <span class="cal-m">${esc(label(month))}</span>
      <span class="cal-nav">
        ${month !== ym(new Date()) ? '<button data-nav="today">오늘</button>' : ''}
        <button data-nav="-1" aria-label="지난달">‹</button><button data-nav="1" aria-label="다음 달">›</button>
      </span>
    </div>
    <div class="cal-w" aria-hidden="true">${DOW.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
    <div class="cal-g" role="grid" aria-label="${esc(label(month))} 달력">${cells}</div>
    <div class="cal-day">
      <p class="cal-dl"><span>${esc(pLabel)}</span><span class="ct">${list.length ? list.length + '건' : ''}</span></p>
      <ul class="cal-list">${items}</ul>
    </div>
    ${msg ? `<p class="cal-msg" role="status">${esc(msg)}</p>` : ''}`;
}

function bind() {
  if (!host || host.dataset.bound) return;
  host.dataset.bound = '1';
  host.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      if (nav.dataset.nav === 'today') { month = ym(new Date()); picked = today(); }
      else { month = shiftMonth(month, +nav.dataset.nav); picked = month === ym(new Date()) ? today() : month + '-01'; }
      render();
      if (!data[month] || Date.now() - data[month].at > POLL_MS) load(month, true);
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      picked = day.dataset.day;
      // 지난달·다음달 칸을 누르면 그 달로 넘어감
      if (picked.slice(0, 7) !== month) { month = picked.slice(0, 7); render(); if (!data[month]) load(month, true); }
      else render();
    }
  });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && started) load(month, true); });
setInterval(() => { if (!document.hidden && started) load(month, true); }, POLL_MS);

// ─────────── 공개 ───────────
window.MYRUBI_CAL = {
  /** 화면이 열릴 때(로그인 후) 호출. 오른쪽 칸을 그리고 이번 달을 불러옴 */
  start(el) {
    host = el || host;
    bind();
    started = true; msg = '';
    month = ym(new Date()); picked = today();
    data = {};
    const c = readJson(K_CACHE(), {});
    Object.keys(c).forEach(k => { if (c[k] && c[k].events) data[k] = Object.assign({}, c[k], { at: 0 }); });
    render();
    load(month, true);
  },
  /** 지금 보는 달 다시 불러오기 */
  refresh() { if (started) load(month, true); },
};
})();
