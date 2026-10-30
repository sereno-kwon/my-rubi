// My Rubi NAS 앱: Synology DSM File Station API로 공유 폴더 탐색과 파일 이름 검색
// - 검색은 대소문자를 가리지 않고, 한글로 찾으면 영어 이름도 함께 찾음 (단어 목록은 /nas-words.js)
// - NAS 계정 비밀번호는 저장하지 않음. 로그인 후 NAS가 발급한 세션(sid)만 이 브라우저에 보관
// - 요청은 config.js 의 NAS_API(NAS Web Station의 프록시 주소)로 보냄. 프록시 코드는 nas/proxy/index.php
(() => {
'use strict';
const CFG = window.MYRUBI_CONFIG || {};
const KEY = 'myrubi.nas';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
  set(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {} },
};
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const configured = () => !!CFG.NAS_API;

const AUTH_ERR = {
  400: '아이디 또는 비밀번호가 맞지 않습니다', 401: '사용이 중지된 계정입니다', 402: '이 계정은 File Station 권한이 없습니다',
  403: '2단계 인증 코드를 입력해 주세요', 404: '2단계 인증 코드가 맞지 않습니다', 406: 'NAS에서 2단계 인증을 먼저 설정해야 합니다',
  407: '로그인 실패가 많아 이 접속이 잠시 차단되었습니다', 408: '비밀번호가 만료되었습니다. DSM에서 먼저 바꿔 주세요',
};
const FS_ERR = { 407: '이 폴더에 접근할 권한이 없습니다', 408: '파일이나 폴더가 없습니다', 402: 'NAS가 바쁩니다. 잠시 뒤 다시 시도해 주세요' };
const EXPIRED = [105, 106, 107, 119];

// ─────────── API ───────────
class NasError extends Error { constructor(msg, code, expired) { super(msg); this.code = code; this.expired = expired; } }

async function call(params, opt = {}) {
  const s = store.get();
  const body = new URLSearchParams(params);
  if (s && !opt.noSession) body.set('_sid', s.sid);
  let r;
  try { r = await fetch(CFG.NAS_API, { method: 'POST', body }); }
  catch (e) { throw new NasError('NAS에 연결할 수 없습니다. NAS가 켜져 있는지, 연결 주소 설정이 맞는지 확인해 주세요'); }
  if (opt.raw) {
    const ct = r.headers.get('Content-Type') || '';
    if (!ct.includes('json')) return r;
  }
  let j; try { j = await r.json(); } catch (e) { throw new NasError('NAS 응답을 읽을 수 없습니다 (' + r.status + ')'); }
  if (j.success) return j.data || {};
  const code = j.error && j.error.code;
  if (EXPIRED.includes(code)) {
    // 로그인 직후(1분 안)에 세션이 거절되면 시간 만료가 아니라 NAS 설정 문제이므로 다른 안내를 보여줌
    const fresh = s && Date.now() - s.at < 60000;
    store.set(null);
    throw new NasError(fresh ? 'NAS가 방금 만든 로그인을 받아주지 않았습니다 (코드 ' + code + '). 관리자에게 알려주세요'
                             : 'NAS 로그인 시간이 지났습니다. 다시 로그인해 주세요 (코드 ' + code + ')', code, true);
  }
  const map = params.api === 'SYNO.API.Auth' ? AUTH_ERR : FS_ERR;
  throw new NasError(map[code] || ('NAS 오류 ' + code), code);
}

const NAS = {
  configured,
  session: () => store.get(),
  async login(account, passwd, otp) {
    const p = { api: 'SYNO.API.Auth', version: '6', method: 'login', account, passwd, session: 'FileStation', format: 'sid' };
    if (otp) p.otp_code = otp;
    const d = await call(p, { noSession: true });
    store.set({ sid: d.sid, account, at: Date.now() });
  },
  async logout() {
    const s = store.get(); if (!s) return;
    try { await call({ api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'FileStation' }); } catch (e) {}
    store.set(null);
  },
  async shares() {
    const d = await call({ api: 'SYNO.FileStation.List', version: '1', method: 'list_share', additional: 'time', sort_by: 'name', limit: '500' });
    return (d.shares || []).map(norm);
  },
  async list(path) {
    const d = await call({ api: 'SYNO.FileStation.List', version: '1', method: 'list', folder_path: path, additional: 'size,time', sort_by: 'name', limit: '2000' });
    return (d.files || []).map(norm);
  },
  async searchStart(paths, pattern) {
    const d = await call({ api: 'SYNO.FileStation.Search', version: '1', method: 'start', folder_path: paths.join(','), pattern, filetype: 'all', recursive: 'true' });
    return d.taskid;
  },
  async searchList(taskid) {
    const d = await call({ api: 'SYNO.FileStation.Search', version: '1', method: 'list', taskid, offset: '0', limit: '500', additional: 'size,time', sort_by: 'name' });
    return { finished: !!d.finished, total: d.total || 0, files: (d.files || []).map(norm) };
  },
  async searchStop(taskid) {
    try { await call({ api: 'SYNO.FileStation.Search', version: '1', method: 'stop', taskid }); await call({ api: 'SYNO.FileStation.Search', version: '1', method: 'clean', taskid }); } catch (e) {}
  },
  async download(path, open) {
    const r = await call({ api: 'SYNO.FileStation.Download', version: '1', method: 'download', path, mode: open ? 'open' : 'download' }, { raw: true });
    return r.blob();
  },
  // 이미지 미리보기. NAS가 만들어 둔 작은 썸네일(SYNO.FileStation.Thumb)을 먼저 쓰고,
  // 연결 파일이 아직 Thumb를 막고 있으면(예전 index.php) 크지 않은 사진만 원본을 받아 대신 보여줌
  thumbApi: true,
  async thumb(f) {
    if (NAS.thumbApi) {
      try {
        const r = await call({ api: 'SYNO.FileStation.Thumb', version: '2', method: 'get', path: f.path, size: 'medium' }, { raw: true });
        if (r instanceof Response) return r.blob();
      } catch (e) {
        if (e.expired) throw e;
        if (e.code === 'api_not_allowed') NAS.thumbApi = false; // 그 밖의 오류는 아래 원본 받기로 넘어감
      }
    }
    if (!WEB_IMG.test(f.name) || (f.size || 0) > 15 * 1024 * 1024) throw new NasError('미리보기를 만들 수 없습니다');
    return NAS.download(f.path, true);
  },
  fileStationUrl(path) {
    if (!CFG.NAS_WEB) return '';
    return CFG.NAS_WEB.replace(/\/$/, '') + '/?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=' + encodeURIComponent('openfile=' + encodeURIComponent(path));
  },
};
function norm(f) {
  const a = f.additional || {};
  return { name: f.name, path: f.path, dir: !!f.isdir, size: a.size, mtime: a.time && a.time.mtime };
}

// ─────────── 검색어 넓히기 ───────────
// DSM 검색은 대소문자를 그대로 비교하는 경우가 있어서 'moulton' 으로 'Moulton' 파일이 안 나올 수 있음.
// 그래서 검색어 하나를 여러 개로 풀어, NAS 검색을 각각 따로(File Station 화면과 같은 단순한 검색어로) 돌리고 결과를 합침
//  1) 대소문자: 그대로 · 소문자 · 첫 글자 대문자 · 대문자
//  2) 한글 ↔ 영어: nas-words.js 의 단어 묶음으로 '몰튼' → 'Moulton' 처럼 바꾼 검색어도 함께
//  3) 띄어쓰기는 * 로: 'sst wide' 가 SST_WIDE, SST-Wide 도 찾음
//  4) 맥에서 올린 파일은 한글 이름이 자모로 풀려(NFD) 저장되는 경우가 있어 그 형태도 함께
// 파일과 폴더를 모두 찾음
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compact = s => s.replace(/[\s_\-]+/g, '').toLowerCase();
let WORDS = null;
function words() {
  if (WORDS) return WORDS;
  WORDS = [];
  (window.MYRUBI_NAS_WORDS || []).forEach(g => {
    if (!Array.isArray(g)) return;
    const members = [...new Set(g.map(w => String(w || '').trim()).filter(Boolean))];
    if (members.length < 2) return;
    members.forEach(m => {
      const body = m.split(/\s+/).map(reEsc).join('[\\s_\\-]*');
      let re;
      if (HANGUL.test(m) && !/[a-z]/i.test(m)) {
        // 한 글자 한글(폴, 휠)은 '폴더' 같은 다른 단어 안에서는 바꾸지 않음
        re = compact(m).length === 1 ? new RegExp('(^|[^\\uac00-\\ud7af])(' + body + ')(?![\\uac00-\\ud7af])', 'g') : new RegExp('()(' + body + ')', 'g');
      } else {
        re = new RegExp('(^|[^a-z0-9])(' + body + ')(?![a-z0-9])', 'gi');
      }
      WORDS.push({ re, len: compact(m).length, group: members });
    });
  });
  WORDS.sort((a, b) => b.len - a.len); // 긴 말부터 (폴 컴포넌트 → 폴)
  return WORDS;
}

function expand(q) {
  q = String(q || '').trim();
  const hits = [];
  for (const w of words()) {
    if (hits.length >= 4) break;
    w.re.lastIndex = 0;
    let m;
    while ((m = w.re.exec(q))) {
      const start = m.index + m[1].length, end = start + m[2].length;
      if (hits.some(h => start < h.end && end > h.start)) continue; // 이미 다른 말로 바꾼 자리
      const seen = new Set([compact(m[2])]);
      const opts = w.group.filter(x => { const k = compact(x); if (seen.has(k)) return false; seen.add(k); return true; });
      if (opts.length) hits.push({ start, end, orig: m[2], opts });
      break;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  // 바꾼 검색어 만들기. 원래 검색어 → 모두 바꾼 것(Moulton Quote) → 하나만 바꾼 것 순서, 최대 12개
  let combos = [[]];
  hits.forEach(h => { combos = combos.flatMap(c => [h.orig, ...h.opts].map((_, i) => c.concat(i))).slice(0, 256); });
  const subs = c => c.filter(i => i > 0).length;
  const rank = c => (subs(c) === 0 ? 0 : subs(c) === hits.length ? 1 : 2) * 1000 + c.reduce((x, i) => x + i, 0);
  combos.sort((a, b) => rank(a) - rank(b));
  const build = c => { let out = '', pos = 0; hits.forEach((h, k) => { out += q.slice(pos, h.start) + [h.orig, ...h.opts][c[k]]; pos = h.end; }); return out + q.slice(pos); };
  const alts = [...new Set(combos.slice(0, 12).map(build))];
  const ql = q.toLowerCase();
  const also = [...new Set(hits.flatMap(h => h.opts))].filter(x => !ql.includes(x.toLowerCase()));
  return { q, alts, also, patterns: patternsFor(alts) };
}

// NAS에 보낼 검색어 목록. 중요한 것부터: 입력한 그대로 → 바꾼 말 → 대소문자 바꾼 것 → 자모(NFD). 최대 MAX_TASKS개
const MAX_TASKS = 8;
function patternsFor(alts) {
  const forms = alts.map(s => {
    const glob = /[*?]/.test(s); // 직접 * ? 를 쓴 검색어는 그대로 패턴으로
    const ws = glob ? [s] : s.split(/\s+/).filter(Boolean);
    // 한 단어는 그대로 보냄(DSM이 앞뒤에 * 를 붙여 '포함'으로 찾음), 여러 단어는 *a*b*
    const join = f => { const w = ws.map(f); return glob || w.length === 1 ? w.join(' ') : '*' + w.join('*') + '*'; };
    return [join(w => w), join(w => w.toLowerCase()), join(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()), join(w => w.toUpperCase())];
  });
  const out = [];
  const add = p => { if (p && p.replace(/\*/g, '') && !out.includes(p)) out.push(p); };
  for (let i = 0; i < 4; i++) forms.forEach(f => add(f[i]));
  alts.forEach((s, i) => { const n = forms[i][0].normalize('NFD'); if (n !== forms[i][0]) add(n); });
  // 자모(NFD) 형태는 개수 제한 안에서 밀려나지 않게 앞쪽 몇 개와 함께 넣음
  const nfd = out.filter(p => p !== p.normalize('NFC'));
  const main = out.filter(p => p === p.normalize('NFC'));
  return main.slice(0, MAX_TASKS - Math.min(nfd.length, 2)).concat(nfd.slice(0, 2));
}
const alsoText = also => also.length ? also.slice(0, 3).join(' · ') + (also.length > 3 ? ' 외' : '') : '';

// ─────────── 화면 ───────────
const KIND = [
  [/\.(jpe?g|png|gif|webp|heic|tiff?|bmp|svg)$/i, 'img', '이미지'],
  [/\.(mp4|mov|avi|mkv|m4v)$/i, 'vid', '영상'],
  [/\.pdf$/i, 'pdf', 'PDF'],
  [/\.(xlsx?|csv|numbers)$/i, 'xls', '표'],
  [/\.(docx?|hwpx?|pages|txt|md|rtf)$/i, 'doc', '문서'],
  [/\.(pptx?|key)$/i, 'ppt', '발표'],
  [/\.(zip|rar|7z|tar|gz)$/i, 'zip', '압축'],
  [/\.(ai|psd|indd|eps|sketch|fig)$/i, 'art', '디자인'],
];
const WEB_IMG = /\.(jpe?g|png|gif|webp|bmp|svg)$/i;
const THUMBABLE = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|svg|cr2|cr3|nef|arw|dng|raf)$/i;
const OPENABLE = /\.(jpe?g|png|gif|webp|svg|pdf|txt|mp4|mov|m4v)$/i;
function kindOf(f) { if (f.dir) return ['dir', '폴더']; const k = KIND.find(x => x[0].test(f.name)); return k ? [k[1], k[2]] : ['file', '파일']; }
function fmtSize(n) {
  if (n == null) return ''; if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 10 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}
function fmtTime(t) {
  if (!t) return ''; const d = new Date(t * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const ICON = k => `<span class="nf nf-${k}"></span>`;

let view = null; // 현재 열린 창 하나만 관리

function mount(body, q) {
  if (view) view.destroy();
  view = new View(body);
  view.start(q);
}
function search(q) { if (view) view.runSearch(q); }

class View {
  constructor(body) {
    this.body = body; this.path = ''; this.items = []; this.mode = 'browse'; this.tasks = []; this.run = 0; this.sel = null; this.shares = [];
    this.searchQ = ''; this.searchAlso = []; this.alive = true;
    this.thumbs = new Map(); this.tip = null; this.tipFor = null; this.tipTimer = 0;
  }
  destroy() {
    this.alive = false; this.stopSearch();
    this.hideTip(); if (this.tip) { this.tip.remove(); this.tip = null; }
    this.thumbs.forEach(v => { if (v.url) URL.revokeObjectURL(v.url); }); this.thumbs.clear();
  }

  // ─── 이미지 위에 마우스를 올리면 그 줄 위쪽에 썸네일 ───
  bindTips(list) {
    if (matchMedia('(hover: none)').matches) return;
    list.addEventListener('mouseover', e => {
      const r = e.target.closest('.nas-row'); if (!r || r === this.tipFor) return;
      const f = this.items[+r.dataset.i];
      if (!f || f.dir || !THUMBABLE.test(f.name)) { this.hideTip(); return; }
      this.hideTip(); this.tipFor = r;
      this.tipTimer = setTimeout(() => this.showTip(r, f), 220);
    });
    list.addEventListener('mouseleave', () => this.hideTip());
    list.addEventListener('scroll', () => this.hideTip(), { passive: true });
  }
  hideTip() {
    clearTimeout(this.tipTimer); this.tipFor = null;
    if (this.tip) this.tip.classList.remove('on');
  }
  placeTip(row) {
    const t = this.tip, rr = row.getBoundingClientRect(), name = row.querySelector('.n') || row;
    const nr = name.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, gap = 8;
    let top = rr.top - h - gap, below = false;
    if (top < 8) { top = rr.bottom + gap; below = true; }          // 위에 자리가 없으면 아래로
    const left = Math.max(8, Math.min(nr.left, innerWidth - w - 8));
    t.style.top = Math.round(top) + 'px'; t.style.left = Math.round(left) + 'px';
    t.classList.toggle('below', below);
  }
  async showTip(row, f) {
    if (this.tipFor !== row || !this.alive) return;
    if (!this.tip) { this.tip = document.createElement('div'); this.tip.className = 'nas-thumb'; this.tip.setAttribute('aria-hidden', 'true'); document.body.appendChild(this.tip); }
    const t = this.tip;
    const label = `<span class="cap"><span class="cn">${esc(f.name)}</span><span class="cs">${esc(fmtSize(f.size))}</span></span>`;
    let c = this.thumbs.get(f.path);
    if (c && c.url) t.innerHTML = `<img src="${c.url}" alt="">${label}`;
    else if (c && c.err) t.innerHTML = `<span class="msg">${esc(c.err)}</span>${label}`;
    else t.innerHTML = `<span class="msg">미리보기 불러오는 중</span>${label}`;
    this.placeTip(row); t.classList.add('on');
    if (c) return;
    c = {}; this.thumbs.set(f.path, c);
    try {
      const blob = await NAS.thumb(f);
      if (!blob || !/^image\//.test(blob.type || 'image/')) throw new Error('미리보기를 만들 수 없습니다');
      c.url = URL.createObjectURL(blob);
      if (this.thumbs.size > 80) { const [k, v] = this.thumbs.entries().next().value; if (v.url) URL.revokeObjectURL(v.url); this.thumbs.delete(k); }
    } catch (e) {
      if (e.expired) { this.thumbs.delete(f.path); this.hideTip(); return this.fail(e); }
      c.err = e.message || '미리보기를 만들 수 없습니다';
    }
    if (this.tipFor !== row || !this.alive) return;
    t.innerHTML = c.url ? `<img src="${c.url}" alt="">${label}` : `<span class="msg">${esc(c.err)}</span>${label}`;
    const img = t.querySelector('img');
    if (img && !img.complete) img.onload = () => { if (this.tipFor === row) this.placeTip(row); };
    else this.placeTip(row);
  }
  start(q) {
    if (!configured()) return this.renderSetup();
    if (!store.get()) return this.renderLogin(q);
    this.renderMain();
    if (q) this.runSearch(q); else this.go('');
  }

  renderSetup() {
    this.body.innerHTML = `<div class="pane"><h2>NAS 연결 전입니다</h2>
      <p>Synology NAS에 연결 파일을 올리고, <code>config.js</code> 의 <code>NAS_API</code> 에 그 주소를 넣으면 이 창에서 공유 폴더를 보고 파일·폴더 이름으로 검색할 수 있습니다.</p>
      <p>설치 순서는 저장소의 <code>nas/README.md</code> 에 있습니다.</p></div>`;
  }

  renderLogin(q, msg) {
    this.body.innerHTML = `<form class="nas-login" autocomplete="on">
      <span class="nf nf-nas big"></span>
      <h2>NAS 로그인</h2>
      <p>Synology 계정으로 로그인하세요. 비밀번호는 저장되지 않습니다.</p>
      <label>계정<input name="username" autocomplete="username" spellcheck="false" autocapitalize="off" required value="${esc((store.get() || {}).account || localStorage.getItem('myrubi.nas.last') || '')}"></label>
      <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
      <label class="otp hidden">2단계 인증 코드<input name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></label>
      <button class="btn primary" type="submit">로그인</button>
      <div class="nas-msg" role="status">${esc(msg || '')}</div>
    </form>`;
    const f = this.body.querySelector('form'), m = this.body.querySelector('.nas-msg');
    setTimeout(() => (f.username.value ? f.password : f.username).focus(), 30);
    f.onsubmit = async e => {
      e.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true; m.textContent = '확인하는 중'; m.classList.add('ok');
      try {
        await NAS.login(f.username.value.trim(), f.password.value, f.otp.value.trim());
        try { localStorage.setItem('myrubi.nas.last', f.username.value.trim()); } catch (err) {}
        f.password.value = '';
        if (!this.alive) return;
        this.renderMain(); if (q) this.runSearch(q); else this.go('');
      } catch (err) {
        m.classList.remove('ok'); m.textContent = err.message;
        if (err.code === 403 || err.code === 404) { f.querySelector('.otp').classList.remove('hidden'); f.otp.focus(); }
      } finally { btn.disabled = false; }
    };
  }

  renderMain() {
    const s = store.get();
    this.body.innerHTML = `<div class="nas">
      <div class="nas-bar">
        <button class="nas-btn" data-a="up" title="위로" aria-label="위 폴더로"><svg class="i"><use href="#i-back"/></svg></button>
        <div class="nas-path" aria-label="현재 위치"></div>
        <form class="nas-q" role="search"><svg class="i"><use href="#i-search"/></svg><input type="search" placeholder="파일·폴더 이름으로 검색" aria-label="NAS 파일 검색" spellcheck="false"></form>
      </div>
      <div class="nas-head"><span>이름</span><span>수정한 날짜</span><span>크기</span></div>
      <div class="nas-list" role="listbox" tabindex="0"></div>
      <div class="nas-status"><span class="st"></span><span class="who">${esc(s ? s.account : '')}<button class="lnk" data-a="logout">로그아웃</button></span></div>
    </div>`;
    const b = this.body;
    b.querySelector('[data-a=up]').onclick = () => this.up();
    b.querySelector('[data-a=logout]').onclick = async () => { this.destroy(); this.alive = true; await NAS.logout(); this.renderLogin(); };
    b.querySelector('.nas-q').onsubmit = e => { e.preventDefault(); const v = e.target.querySelector('input').value.trim(); v ? this.runSearch(v) : this.go(this.path); };
    b.querySelector('.nas-q input').addEventListener('keydown', e => { if (e.key === 'Escape' && this.mode === 'search') { e.target.value = ''; this.go(this.path); } });
    const list = b.querySelector('.nas-list');
    this.bindTips(list);
    list.addEventListener('click', e => { const r = e.target.closest('.nas-row'); if (!r) return; this.select(+r.dataset.i); if (e.detail === 0 || matchMedia('(pointer:coarse)').matches) this.open(this.items[+r.dataset.i]); });
    list.addEventListener('dblclick', e => { const r = e.target.closest('.nas-row'); if (r) this.open(this.items[+r.dataset.i]); });
    list.addEventListener('contextmenu', e => { const r = e.target.closest('.nas-row'); if (!r) return; e.preventDefault(); e.stopPropagation(); this.select(+r.dataset.i); this.menu(this.items[+r.dataset.i], e.clientX, e.clientY); });
    list.addEventListener('keydown', e => {
      if (!this.items.length) return;
      let i = this.sel == null ? -1 : this.sel;
      if (e.key === 'ArrowDown') { e.preventDefault(); this.select(Math.min(this.items.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.select(Math.max(0, i - 1)); }
      if (e.key === 'Enter' && i >= 0) this.open(this.items[i]);
      if (e.key === 'Backspace') { e.preventDefault(); this.up(); }
    });
  }

  status(t) { const el = this.body.querySelector('.nas-status .st'); if (el) el.textContent = t; }
  crumbs() {
    const el = this.body.querySelector('.nas-path'); if (!el) return;
    if (this.mode === 'search') { const al = alsoText(this.searchAlso); el.innerHTML = `<b>"${esc(this.searchQ)}" 검색 결과</b><span class="in">${al ? esc(al) + ' 함께 · ' : ''}${esc(this.path || '모든 공유 폴더')}</span>`; return; }
    const parts = this.path.split('/').filter(Boolean);
    let acc = '';
    el.innerHTML = `<button data-p="">NAS</button>` + parts.map(p => { acc += '/' + p; return `<span>›</span><button data-p="${esc(acc)}">${esc(p)}</button>`; }).join('');
    el.querySelectorAll('button').forEach(x => x.onclick = () => this.go(x.dataset.p));
  }

  async go(path) {
    this.stopSearch();
    this.mode = 'browse'; this.path = path; this.sel = null;
    const inp = this.body.querySelector('.nas-q input'); if (inp) inp.value = '';
    this.crumbs(); this.status('불러오는 중'); this.draw([], true);
    try {
      const items = path ? await NAS.list(path) : await NAS.shares();
      if (!path) this.shares = items;
      items.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'ko'));
      if (!this.alive || this.path !== path || this.mode !== 'browse') return;
      this.draw(items);
      this.status(`항목 ${items.length}개`);
    } catch (e) { this.fail(e); }
  }
  up() {
    if (this.mode === 'search') return this.go(this.path);
    if (!this.path) return;
    this.go(this.path.split('/').slice(0, -1).join('/'));
  }

  async runSearch(q) {
    q = String(q || '').trim(); if (!q) return;
    if (!store.get()) return this.renderLogin(q);
    if (!this.body.querySelector('.nas')) this.renderMain();
    this.stopSearch();
    const ex = expand(q), run = ++this.run;
    this.mode = 'search'; this.searchQ = q; this.searchAlso = ex.also; this.sel = null;
    const inp = this.body.querySelector('.nas-q input'); if (inp) inp.value = q;
    this.crumbs(); this.draw([], true); this.status('검색하는 중');
    const live = () => this.alive && this.run === run;
    try {
      let roots = this.path ? [this.path] : (this.shares.length ? this.shares : await NAS.shares()).map(s => s.path);
      if (!roots.length) { this.draw([]); this.status('검색할 공유 폴더가 없습니다'); return; }
      // 검색어마다 NAS 검색을 하나씩 시작. 몇 개가 실패해도 나머지로 찾음
      let firstErr = null;
      const ids = (await Promise.all(ex.patterns.map(p => NAS.searchStart(roots, p).catch(e => { if (e.expired) throw e; firstErr = firstErr || e; return null; })))).filter(Boolean);
      if (!live()) { ids.forEach(id => NAS.searchStop(id)); return; }
      if (!ids.length) throw firstErr || new NasError('검색을 시작하지 못했습니다');
      this.tasks = ids;
      const t0 = Date.now(), done = new Set(), found = new Map(), totals = {};
      while (live()) {
        await new Promise(r => setTimeout(r, 700));
        if (!live()) return;
        const rs = await Promise.all(ids.filter(id => !done.has(id)).map(id => NAS.searchList(id).then(r => ({ id, r })).catch(e => { if (e.expired) throw e; return { id, r: { finished: true, total: 0, files: [] } }; })));
        if (!live()) return;
        rs.forEach(({ id, r }) => {
          r.files.forEach(f => found.set(f.path, f));
          totals[id] = r.total;
          if (r.finished) { done.add(id); NAS.searchStop(id); }
        });
        const items = [...found.values()].sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'ko'));
        this.draw(items);
        const more = Object.keys(totals).some(id => totals[id] > 500) ? ' (검색어마다 앞 500개까지 표시)' : '';
        if (done.size === ids.length || Date.now() - t0 > 90000) {
          const al = alsoText(ex.also), alP = al ? ` (${al} 함께)` : '';
          const nd = items.filter(f => f.dir).length;
          this.status(items.length ? `"${q}" ${items.length}개 찾음${nd ? `, 폴더 ${nd}개 · 파일 ${items.length - nd}개` : ''}${alP}${more}` : `"${q}"${alP}와 이름이 맞는 파일이나 폴더가 없습니다`);
          this.stopSearch(); return;
        }
        this.status(`검색하는 중, 지금까지 ${items.length}개`);
      }
    } catch (e) { this.fail(e); }
  }

  stopSearch() {
    this.run++;
    (this.tasks || []).forEach(id => NAS.searchStop(id)); this.tasks = [];
  }
  fail(e) {
    if (e.expired) { this.renderLogin(this.mode === 'search' ? this.searchQ : '', e.message); return; }
    this.status(e.message); this.draw([]);
  }

  draw(items, loading) {
    this.hideTip();
    this.items = items;
    const list = this.body.querySelector('.nas-list'); if (!list) return;
    if (!items.length) { list.innerHTML = loading ? '' : `<div class="nas-empty">${this.mode === 'search' ? '' : '비어 있는 폴더입니다'}</div>`; return; }
    const showPath = this.mode === 'search';
    list.innerHTML = items.map((f, i) => {
      const [k, label] = kindOf(f);
      const parent = f.path.split('/').slice(0, -1).join('/') || '/';
      return `<div class="nas-row${this.sel === i ? ' sel' : ''}" role="option" data-i="${i}" title="${esc(f.path)}">
        <span class="nm">${ICON(k)}<span class="t"><span class="n">${esc(f.name)}</span>${showPath ? `<span class="p">${esc(parent)}</span>` : ''}</span></span>
        <span class="tm">${esc(fmtTime(f.mtime))}</span><span class="sz">${f.dir ? label : esc(fmtSize(f.size))}</span></div>`;
    }).join('');
  }
  select(i) {
    this.sel = i;
    this.body.querySelectorAll('.nas-row').forEach(r => r.classList.toggle('sel', +r.dataset.i === i));
    const el = this.body.querySelector(`.nas-row[data-i="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  }

  async open(f) {
    if (!f) return;
    if (f.dir) return this.go(f.path);
    const viewable = OPENABLE.test(f.name);
    const tab = viewable ? window.open('', '_blank') : null; // 팝업 차단을 피하려고 먼저 탭을 열어 둠
    this.status(`${f.name} 받는 중`);
    try {
      const blob = await NAS.download(f.path, viewable);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location = url;
      else { const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.status(viewable ? `${f.name} 열었습니다` : `${f.name} 내려받았습니다`);
    } catch (e) { if (tab) tab.close(); this.fail(e); }
  }

  menu(f, x, y) {
    const items = [
      { label: f.dir ? '열기' : (OPENABLE.test(f.name) ? '새 탭에서 보기' : '내려받기'), bold: true, act: () => this.open(f) },
    ];
    if (!f.dir && OPENABLE.test(f.name)) items.push({ label: '내려받기', act: () => this.downloadOnly(f) });
    if (this.mode === 'search') items.push({ label: '들어 있는 폴더로 가기', act: () => this.go(f.path.split('/').slice(0, -1).join('/')) });
    items.push('-', { label: '경로 복사', act: () => { try { navigator.clipboard.writeText(f.path); } catch (e) {} this.status('경로를 복사했습니다'); } });
    const fs = NAS.fileStationUrl(f.dir ? f.path : f.path.split('/').slice(0, -1).join('/'));
    if (fs) items.push({ label: 'File Station에서 열기', act: () => window.open(fs, '_blank', 'noopener') });
    if (window.MYRUBI_DESK) window.MYRUBI_DESK.menu(x, y, items);
  }
  async downloadOnly(f) {
    this.status(`${f.name} 받는 중`);
    try {
      const blob = await NAS.download(f.path, false), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); this.status(`${f.name} 내려받았습니다`);
    } catch (e) { this.fail(e); }
  }
}

window.MYRUBI_NAS = Object.assign(NAS, { mount, search, expand, alsoText, unmount() { if (view) view.destroy(); view = null; } });
})();
