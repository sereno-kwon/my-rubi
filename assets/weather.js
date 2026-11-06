// My Rubi 첫 화면 오른쪽 주간 날씨
// 시계 바로 아래에 지금 날씨 한 줄과 오늘부터 7일 예보(날씨, 최고·최저, 강수확률)를 보여줌
// 자료는 Open-Meteo (키 없음, 브라우저에서 바로 부름). 위치는 config.js 의 WEATHER (기본 반포 쇼룸)
// 30분마다, 그리고 탭으로 돌아올 때 다시 불러옴. 마지막 자료는 이 브라우저에 남겨 두고 먼저 보여줌
(() => {
'use strict';

const CFG = (window.MYRUBI_CONFIG || {}).WEATHER || {};
const PLACE = { name: CFG.NAME || '반포', lat: CFG.LAT || 37.5065, lon: CFG.LON || 127.0050 };
const K_CACHE = 'myrubi.weather.v1';
const FRESH_MS = 30 * 60 * 1000;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const RAIN_HIGH = 60;     // 이 값 이상이면 강수확률을 진하게
// 자세히 보기: 네이버 날씨 검색
const MORE_URL = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(PLACE.name + ' 날씨');

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deg = n => (n == null || isNaN(n) ? '–' : Math.round(n) + '°');

// ─────────── 날씨 코드 (WMO) → 이름, 아이콘 ───────────
function kind(code) {
  const c = +code;
  if (c === 0) return ['맑음', 'sun'];
  if (c === 1) return ['대체로 맑음', 'part'];
  if (c === 2) return ['구름 조금', 'part'];
  if (c === 3) return ['흐림', 'cloud'];
  if (c === 45 || c === 48) return ['안개', 'fog'];
  if (c >= 51 && c <= 55) return ['이슬비', 'rain'];
  if (c === 56 || c === 57 || c === 66 || c === 67) return ['어는 비', 'rain'];
  if (c === 61) return ['약한 비', 'rain'];
  if (c === 63) return ['비', 'rain'];
  if (c === 65) return ['강한 비', 'rain'];
  if (c === 71) return ['약한 눈', 'snow'];
  if (c === 73) return ['눈', 'snow'];
  if (c === 75) return ['강한 눈', 'snow'];
  if (c === 77) return ['싸락눈', 'snow'];
  if (c === 80) return ['약한 소나기', 'rain'];
  if (c === 81) return ['소나기', 'rain'];
  if (c === 82) return ['강한 소나기', 'rain'];
  if (c === 85 || c === 86) return ['눈 소나기', 'snow'];
  if (c === 95) return ['뇌우', 'storm'];
  if (c === 96 || c === 99) return ['우박 동반 뇌우', 'storm'];
  return ['–', 'cloud'];
}
// 선 아이콘 (svg.i 와 같은 굵기·끝 모양)
const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 11.2 3.5 3.5 0 0 0 7 18z"/>';
const CLOUD_UP = '<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 8.2 3.5 3.5 0 0 0 7 15z"/>';
const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z"/>',
  part: '<path d="M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1"/><path d="M5.3 10.2A3 3 0 0 1 10.7 7"/><path d="M9 19h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.7 13 3 3 0 0 0 9 19z"/>',
  partNight: '<path d="M11 6.5A4 4 0 0 1 5.5 2 4 4 0 1 0 11 6.5z"/><path d="M9 19h8.5a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.7 13 3 3 0 0 0 9 19z"/>',
  cloud: CLOUD,
  fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  rain: CLOUD_UP + '<path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  snow: CLOUD_UP + '<path d="M8 18.5h.01M12 18.5h.01M16 18.5h.01M10 21h.01M14 21h.01"/>',
  storm: CLOUD_UP + '<path d="M12.5 15.5l-2 3.5h3l-2 3"/>',
};
const icon = (name, cls) => `<svg class="i wx-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.cloud}</svg>`;

// ─────────── 자료 ───────────
let host = null, started = false, data = null, loading = false, msg = '';

function url() {
  const q = new URLSearchParams({
    latitude: PLACE.lat, longitude: PLACE.lon, timezone: 'Asia/Seoul', forecast_days: 7,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + q;
}
async function load(force) {
  if (loading || (!force && data && Date.now() - data.at < FRESH_MS)) return;
  loading = true;
  try {
    const r = await fetch(url());
    const j = await r.json();
    if (!r.ok || j.error || !j.daily) throw new Error(j.reason || r.status);
    data = { at: Date.now(), current: j.current || null, daily: j.daily };
    ls.set(K_CACHE, JSON.stringify(data));
    msg = '';
  } catch (e) {
    msg = data ? '날씨를 새로 불러오지 못해 이전 자료를 보여줍니다' : '날씨를 불러오지 못했습니다';
  } finally {
    loading = false;
    render();
  }
}

// ─────────── 그리기 ───────────
function render() {
  if (!host || !started) return;
  host.classList.remove('hidden');
  const head = `<p class="kicker"><a href="${MORE_URL}" target="_blank" rel="noopener" title="네이버 날씨에서 자세히 보기">Weather</a></p>`;
  if (!data) {
    host.innerHTML = head + `<p class="wx-none">${esc(msg || '불러오는 중')}</p>`;
    return;
  }
  const d = data.daily, t = ymd(new Date());
  // 날짜가 지난 자료는 오늘부터만 보여줌
  const days = (d.time || []).map((date, i) => ({ date, i })).filter(x => x.date >= t);
  const today = days.length && days[0].date === t ? days[0].i : -1;

  const c = data.current;
  let now = '';
  if (c) {
    const [nm, ic] = kind(c.weather_code);
    const night = c.is_day === 0;
    const ico = night && ic === 'sun' ? 'moon' : night && ic === 'part' ? 'partNight' : ic;
    const hl = today >= 0 ? `<span class="hl">최고 ${deg(d.temperature_2m_max[today])} · 최저 ${deg(d.temperature_2m_min[today])}</span>` : '';
    const feel = c.apparent_temperature != null && Math.round(c.apparent_temperature) !== Math.round(c.temperature_2m) ? ` · 체감 ${deg(c.apparent_temperature)}` : '';
    now = `<div class="wx-now">${icon(ico, 'big')}<span class="tp">${deg(c.temperature_2m)}</span>
      <span class="tx"><span class="nm">${esc(nm)}${esc(feel)}</span>${hl}</span></div>`;
  }

  const cols = days.slice(0, 7).map(({ date, i }) => {
    const dt = new Date(date + 'T00:00'), dow = dt.getDay();
    const [nm, ic] = kind(d.weather_code[i]);
    const pp = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
    const lb = date === t ? '오늘' : DOW[dow];
    const tip = `${dt.getMonth() + 1}/${dt.getDate()} (${DOW[dow]}) ${nm} · 최고 ${deg(d.temperature_2m_max[i])} 최저 ${deg(d.temperature_2m_min[i])}${pp != null ? ' · 강수확률 ' + pp + '%' : ''}`;
    return `<div class="wx-d${date === t ? ' now' : ''}" title="${esc(tip)}" role="listitem" aria-label="${esc(tip)}">
      <span class="w${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}">${lb}</span>
      <span class="dt">${dt.getMonth() + 1}/${dt.getDate()}</span>
      ${icon(ic)}
      <span class="hi">${deg(d.temperature_2m_max[i])}</span>
      <span class="lo">${deg(d.temperature_2m_min[i])}</span>
      <span class="pp${pp >= RAIN_HIGH ? ' hi' : ''}">${pp == null ? '' : pp + '%'}</span>
    </div>`;
  }).join('');

  const at = new Date(data.at);
  host.innerHTML = head + now +
    `<div class="wx-g" role="list" aria-label="${esc(PLACE.name)} 7일 예보">${cols}</div>
    <p class="wx-ft"><span>${esc(PLACE.name)} · ${pad(at.getHours())}:${pad(at.getMinutes())} 기준</span><span>% 강수확률</span></p>
    ${msg ? `<p class="wx-msg" role="status">${esc(msg)}</p>` : ''}`;
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && started) load(); });
setInterval(() => { if (!document.hidden && started) load(); }, 10 * 60 * 1000);
// 자정을 넘기면 '오늘' 칸이 바뀌도록 다시 그림
let lastDay = ymd(new Date());
setInterval(() => { const t = ymd(new Date()); if (t !== lastDay) { lastDay = t; render(); load(true); } }, 60 * 1000);

// ─────────── 공개 ───────────
window.MYRUBI_WEATHER = {
  /** 화면이 열릴 때 호출. 남겨 둔 자료를 먼저 그리고, 30분이 지났으면 새로 불러옴 */
  start(el) {
    host = el || host;
    started = true;
    if (!data) { try { data = JSON.parse(ls.get(K_CACHE)) || null; } catch (e) { data = null; } }
    render();
    load();
  },
  refresh() { if (started) load(true); },
};
})();
