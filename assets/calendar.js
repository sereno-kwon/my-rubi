// My Rubi 첫 화면 오른쪽 달력 (구글 캘린더)
// 시계와 체크리스트 사이에 한 달 격자만 보여줌. 주·일 보기는 없음
// Apps Script(calendar 동작)가 CONFIG.CALENDARS 에 적은 구글 캘린더의 한 달치 일정을 돌려줌
// 날짜 아래 '+ 일정'으로 넣고, 일정을 누르면 고치거나 지움 (event 동작). 반복 일정은 구글 캘린더에서만 고침
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
let form = null;            // 열린 입력 칸 { mode:'add'|'edit', id, cal, v:{…}, busy, err, delArm }
let pending = false;        // 입력 중에 새 자료가 오면 칸을 닫을 때 다시 그림

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
    saveCache(m);
  } catch (e) {
    msg = e.message || '일정을 불러오지 못했습니다';
  } finally {
    loading[m] = false;
    if (form) pending = true; else render();
  }
}
function saveCache(m) {
  const c = readJson(K_CACHE(), {});
  c[m] = data[m];
  // 지난달·다음달 정도만 남겨 둠
  Object.keys(c).forEach(k => { if (Math.abs(monthDiff(k, month)) > 1) delete c[k]; });
  ls.set(K_CACHE(), JSON.stringify(c));
}
function monthDiff(a, b) { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (ay - by) * 12 + (am - bm); }

// ─────────── 그리기 ───────────
let dayList = [];           // 지금 보이는 날의 일정 (누르면 고치기)
function render() {
  if (!host) return;
  if (!started || !shared()) { host.classList.add('hidden'); return; }
  syncForm();
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
  const list = dayList = days[picked] || [];
  const pd = new Date(picked + 'T00:00');
  const pLabel = picked === t ? '오늘' : `${pd.getMonth() + 1}/${pd.getDate()} (${DOW[pd.getDay()]})`;
  const items = list.length ? list.map((ev, i) => {
    const when = ev.allDay ? '종일' : ev.cont ? (ev.last ? `~${ev.end}` : '계속') : ev.start + (ev.end && ev.end !== ev.start ? `–${ev.end}` : '');
    const cal = multi && d.calendars[ev.cal] ? `<span class="cl">${esc(d.calendars[ev.cal].name)}</span>` : '';
    const tip = esc(ev.title) + (ev.location ? '\n' + esc(ev.location) : '') + (ev.rec ? '\n반복 일정은 구글 캘린더에서 고칩니다' : '');
    return `<li class="cal-ev${ev.rec ? ' rec' : ''}" data-ev="${i}" tabindex="0" role="button" aria-label="${esc(ev.title)} ${ev.rec ? '' : '고치기'}"><span class="tm">${esc(when)}</span><span class="tt" title="${tip}">${esc(ev.title)}</span>${cal}</li>`;
  }).join('') : `<li class="cal-none">${d ? '일정 없음' : loading[month] ? '불러오는 중' : ''}</li>`;

  host.innerHTML = `
    <p class="kicker"><a href="${gcalUrl(month)}" target="_blank" rel="noopener" title="구글 캘린더에서 열기">Calendar</a></p>
    <div class="cal-h">
      <span class="cal-m">${esc(label(month))}</span>
      <span class="cal-nav">
        ${month !== ym(new Date()) ? '<button data-nav="today">오늘</button>' : ''}
        <button data-nav="-1" aria-label="지난달">‹</button><button data-nav="1" aria-label="다음 달">›</button>
      </span>
    </div>
    <div class="cal-w" aria-hidden="true">${DOW.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
    <div class="cal-g" role="grid" aria-label="${esc(label(month))} 달력">${cells}</div>
    ${form ? formHtml(d) : `<div class="cal-day">
      <p class="cal-dl"><span>${esc(pLabel)}</span><span class="ct">${list.length ? list.length + '건' : ''}<button class="cal-add" data-act="add" aria-label="${esc(pLabel)}에 일정 넣기">+ 일정</button></span></p>
      <ul class="cal-list">${items}</ul>
    </div>`}
    ${msg ? `<p class="cal-msg" role="status">${esc(msg)}</p>` : ''}`;
}

// ─────────── 일정 넣기·고치기 ───────────
const hhmm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const mins = t => { const [h, m] = String(t || '').split(':').map(Number); return h * 60 + (m || 0); };
/** 새 일정 기본값: 오늘이면 다음 정시, 다른 날이면 10시. 1시간짜리 */
function blank(day) {
  const now = new Date();
  const st = day === today() ? Math.min(23 * 60, (now.getHours() + 1) * 60) : 600;
  return { title: '', allDay: false, date: day, endDate: day, start: hhmm(st), end: hhmm(Math.min(st + 60, 23 * 60 + 59)), location: '', desc: '', cal: 0 };
}
function openAdd() {
  form = { mode: 'add', v: blank(picked), busy: false, err: '', delArm: false };
  render(); focusTitle();
}
function openEdit(ev) {
  if (ev.rec) { msg = '반복 일정은 구글 캘린더에서 고쳐 주세요'; render(); return; }
  form = { mode: 'edit', id: ev.id, cal: ev.cal, busy: false, err: '', delArm: false, v: {
    title: ev.title === '(제목 없음)' ? '' : ev.title, allDay: !!ev.allDay, date: ev.date, endDate: ev.endDate || ev.date,
    start: ev.start || '10:00', end: ev.end || hhmm(mins(ev.start || '10:00') + 60), location: ev.location || '', desc: ev.desc || '', cal: ev.cal,
  } };
  msg = ''; render(); focusTitle();
}
function closeForm() {
  form = null; pending = false;
  render();
}
function focusTitle() { setTimeout(() => { const t = host && host.querySelector('.cal-f [name=title]'); if (t) t.focus(); }, 20); }
/** 다시 그리기 전에 입력 칸의 값을 받아 둠 */
function syncForm() {
  const f = form && host && host.querySelector('.cal-f');
  if (!f) return;
  const v = form.v;
  ['title', 'date', 'endDate', 'start', 'end', 'location', 'desc'].forEach(k => { if (f[k]) v[k] = f[k].value; });
  v.allDay = f.allDay.checked;
  if (f.cal) v.cal = +f.cal.value;
}
function formHtml(d) {
  const v = form.v, cals = (d && d.calendars) || [];
  const calSel = form.mode === 'add' && cals.length > 1
    ? `<select name="cal" aria-label="캘린더">${cals.map((c, i) => `<option value="${i}"${i === v.cal ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';
  return `<form class="cal-f${v.allDay ? ' ad' : ''}" autocomplete="off" novalidate>
    <p class="cal-dl"><span>${form.mode === 'add' ? '새 일정' : '일정 고치기'}</span><label class="cal-ad"><input type="checkbox" name="allDay"${v.allDay ? ' checked' : ''}>종일</label></p>
    <input name="title" maxlength="200" placeholder="제목" aria-label="제목" value="${esc(v.title)}">
    <div class="cal-row"><span class="lb">시작</span><input type="date" name="date" value="${esc(v.date)}" aria-label="시작 날짜"><input type="time" name="start" class="t" value="${esc(v.start)}" aria-label="시작 시간"></div>
    <div class="cal-row"><span class="lb">끝</span><input type="date" name="endDate" value="${esc(v.endDate)}" aria-label="끝 날짜"><input type="time" name="end" class="t" value="${esc(v.end)}" aria-label="끝 시간"></div>
    <input name="location" maxlength="300" placeholder="장소 (선택)" aria-label="장소" value="${esc(v.location)}">
    <textarea name="desc" rows="2" maxlength="4000" placeholder="메모 (선택)" aria-label="메모">${esc(v.desc)}</textarea>
    ${calSel}
    <div class="cal-fb">
      <button type="submit" class="cal-b pri"${form.busy ? ' disabled' : ''}>${form.busy ? '저장하는 중' : '저장'}</button>
      <button type="button" class="cal-b" data-act="cancel">취소</button>
      ${form.mode === 'edit' ? `<button type="button" class="cal-del${form.delArm ? ' arm' : ''}" data-act="del"${form.busy ? ' disabled' : ''}>${form.delArm ? '한 번 더 누르면 지워집니다' : '지우기'}</button>` : ''}
    </div>
    ${form.err ? `<p class="cal-msg" role="alert">${esc(form.err)}</p>` : ''}
  </form>`;
}
/** 시작을 바꾸면 끝이 앞서지 않게 따라 옮김 */
function follow(f, changed) {
  if (changed === 'date' && (f.endDate.value < f.date.value || !f.endDate.value)) f.endDate.value = f.date.value;
  if (changed === 'start' && f.endDate.value === f.date.value && f.start.value && (!f.end.value || mins(f.end.value) <= mins(f.start.value))) {
    f.end.value = hhmm(Math.min(mins(f.start.value) + 60, 23 * 60 + 59));
  }
}
async function submit(op) {
  syncForm();
  const v = form.v;
  if (op !== 'delete') {
    if (!v.title.trim()) { form.err = '제목을 입력해 주세요'; render(); focusTitle(); return; }
    if (!v.date) { form.err = '날짜를 골라 주세요'; render(); return; }
    if (v.endDate && v.endDate < v.date) { form.err = '끝나는 날이 시작하는 날보다 앞입니다'; render(); return; }
    if (!v.allDay && (!v.start || (v.end && (v.endDate || v.date) === v.date && mins(v.end) <= mins(v.start)))) { form.err = '시간을 확인해 주세요'; render(); return; }
  }
  form.busy = true; form.err = ''; render();
  const showMonth = op === 'delete' ? month : v.date.slice(0, 7);
  try {
    const j = await MR.post({
      action: 'event', op, id: form.id || '', cal: form.mode === 'edit' ? form.cal : v.cal, month: showMonth,
      title: v.title.trim(), allDay: v.allDay, date: v.date, endDate: v.endDate || v.date,
      start: v.allDay ? '' : v.start, end: v.allDay ? '' : v.end, location: v.location.trim(), desc: v.desc,
    });
    // 다른 달 자료는 다음에 볼 때 새로 불러옴
    Object.keys(data).forEach(k => { data[k].at = 0; });
    // 지운 일정은 서버 목록에 남아 있더라도 화면에서 빼 둠
    const gone = op === 'delete' ? (j.deleted || form.id) : '';
    const evs = (j.events || []).filter(x => !gone || x.id !== gone);
    data[j.month || showMonth] = { start: j.start, end: j.end, calendars: j.calendars || [], events: evs, at: Date.now() };
    month = j.month || showMonth;
    if (op !== 'delete') picked = v.date;
    saveCache(month);
    msg = ''; form = null; pending = false;
    render();
  } catch (e) {
    if (!form) return;
    form.busy = false; form.delArm = false; form.err = e.message || '저장하지 못했습니다';
    render();
  }
}

function bind() {
  if (!host || host.dataset.bound) return;
  host.dataset.bound = '1';
  host.addEventListener('submit', e => { e.preventDefault(); if (form && !form.busy) submit(form.mode === 'add' ? 'add' : 'update'); });
  host.addEventListener('change', e => {
    const f = e.target.closest('.cal-f'); if (!f || !form) return;
    if (e.target.name === 'allDay') { f.classList.toggle('ad', e.target.checked); form.v.allDay = e.target.checked; }
    if (e.target.name === 'date' || e.target.name === 'start') follow(f, e.target.name);
  });
  host.addEventListener('keydown', e => {
    if (e.key === 'Escape' && form && !form.busy) { e.preventDefault(); e.stopPropagation(); closeForm(); return; }
    const li = e.target.closest && e.target.closest('[data-ev]');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const ev = dayList[+li.dataset.ev]; if (ev) openEdit(ev); }
  });
  host.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'add') openAdd();
      else if (a === 'cancel') closeForm();
      else if (a === 'del' && form && !form.busy) {
        if (form.delArm) submit('delete');
        else { syncForm(); form.delArm = true; render(); }
      }
      return;
    }
    const li = e.target.closest('[data-ev]');
    if (li) { const ev = dayList[+li.dataset.ev]; if (ev) openEdit(ev); return; }
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
      // 입력 칸이 열려 있으면 누른 날이 시작 날짜가 됨 (기간은 그대로 유지)
      const f = form && !form.busy && host.querySelector('.cal-f');
      if (f) {
        const span = f.endDate.value && f.date.value ? Math.round((new Date(f.endDate.value + 'T00:00') - new Date(f.date.value + 'T00:00')) / 86400000) : 0;
        f.date.value = picked; f.endDate.value = addDays(picked, Math.max(0, span));
      }
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
    started = true; msg = ''; form = null; pending = false;
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
