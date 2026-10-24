// My Rubi NAS 앱: Synology DSM File Station API로 공유 폴더 탐색과 파일 이름 검색
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
  if (s && !opt.noSession) { body.set('_sid', s.sid); if (s.token) body.set('SynoToken', s.token); }
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
  if (EXPIRED.includes(code)) { store.set(null); throw new NasError('NAS 로그인 시간이 지났습니다. 다시 로그인해 주세요', code, true); }
  const map = params.api === 'SYNO.API.Auth' ? AUTH_ERR : FS_ERR;
  throw new NasError(map[code] || ('NAS 오류 ' + code), code);
}

const NAS = {
  configured,
  session: () => store.get(),
  async login(account, passwd, otp) {
    const p = { api: 'SYNO.API.Auth', version: '6', method: 'login', account, passwd, session: 'FileStation', format: 'sid', enable_syno_token: 'yes' };
    if (otp) p.otp_code = otp;
    const d = await call(p, { noSession: true });
    store.set({ sid: d.sid, token: d.synotoken || '', account, at: Date.now() });
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
  async searchStart(paths, q) {
    const d = await call({ api: 'SYNO.FileStation.Search', version: '1', method: 'start', folder_path: paths.join(','), pattern: q, recursive: 'true' });
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
  fileStationUrl(path) {
    if (!CFG.NAS_WEB) return '';
    return CFG.NAS_WEB.replace(/\/$/, '') + '/?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=' + encodeURIComponent('openfile=' + encodeURIComponent(path));
  },
};
function norm(f) {
  const a = f.additional || {};
  return { name: f.name, path: f.path, dir: !!f.isdir, size: a.size, mtime: a.time && a.time.mtime };
}

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
    this.body = body; this.path = ''; this.items = []; this.mode = 'browse'; this.task = null; this.sel = null; this.shares = [];
    this.searchQ = ''; this.alive = true;
  }
  destroy() { this.alive = false; if (this.task) NAS.searchStop(this.task); this.task = null; }
  start(q) {
    if (!configured()) return this.renderSetup();
    if (!store.get()) return this.renderLogin(q);
    this.renderMain();
    if (q) this.runSearch(q); else this.go('');
  }

  renderSetup() {
    this.body.innerHTML = `<div class="pane"><h2>NAS 연결 전입니다</h2>
      <p>Synology NAS에 연결 파일을 올리고, <code>config.js</code> 의 <code>NAS_API</code> 에 그 주소를 넣으면 이 창에서 공유 폴더를 보고 파일 이름으로 검색할 수 있습니다.</p>
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
        <form class="nas-q" role="search"><svg class="i"><use href="#i-search"/></svg><input type="search" placeholder="파일 이름으로 검색" aria-label="NAS 파일 검색" spellcheck="false"></form>
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
    if (this.mode === 'search') { el.innerHTML = `<b>"${esc(this.searchQ)}" 검색 결과</b><span class="in">${esc(this.path || '모든 공유 폴더')}</span>`; return; }
    const parts = this.path.split('/').filter(Boolean);
    let acc = '';
    el.innerHTML = `<button data-p="">NAS</button>` + parts.map(p => { acc += '/' + p; return `<span>›</span><button data-p="${esc(acc)}">${esc(p)}</button>`; }).join('');
    el.querySelectorAll('button').forEach(x => x.onclick = () => this.go(x.dataset.p));
  }

  async go(path) {
    if (this.task) { NAS.searchStop(this.task); this.task = null; }
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
    if (this.task) { NAS.searchStop(this.task); this.task = null; }
    this.mode = 'search'; this.searchQ = q; this.sel = null;
    const inp = this.body.querySelector('.nas-q input'); if (inp) inp.value = q;
    this.crumbs(); this.draw([], true); this.status('검색하는 중');
    try {
      let roots = this.path ? [this.path] : (this.shares.length ? this.shares : await NAS.shares()).map(s => s.path);
      if (!roots.length) { this.draw([]); this.status('검색할 공유 폴더가 없습니다'); return; }
      const id = await NAS.searchStart(roots, q);
      this.task = id;
      const t0 = Date.now();
      while (this.alive && this.task === id) {
        await new Promise(r => setTimeout(r, 700));
        if (!this.alive || this.task !== id) return;
        const r = await NAS.searchList(id);
        r.files.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'ko'));
        this.draw(r.files);
        const more = r.total > r.files.length ? ` (앞 ${r.files.length}개 표시)` : '';
        if (r.finished || Date.now() - t0 > 90000) {
          this.status(r.total ? `"${q}" ${r.total}개 찾음${more}` : `"${q}"와 이름이 맞는 파일이 없습니다`);
          NAS.searchStop(id); if (this.task === id) this.task = null; return;
        }
        this.status(`검색하는 중, 지금까지 ${r.total}개`);
      }
    } catch (e) { this.fail(e); }
  }

  fail(e) {
    if (e.expired) { this.renderLogin(this.mode === 'search' ? this.searchQ : '', e.message); return; }
    this.status(e.message); this.draw([]);
  }

  draw(items, loading) {
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

window.MYRUBI_NAS = Object.assign(NAS, { mount, search, unmount() { if (view) view.destroy(); view = null; } });
})();
