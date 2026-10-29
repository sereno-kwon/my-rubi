// My Rubi 재고 확인 앱: NAS의 재고 조회 서비스(nas/stock)를 거쳐 이카운트 창고별 재고를 봄
// - 검색은 NAS에 받아 둔 품목 목록에서 (이름·품목코드·규격·바코드), 이카운트를 부르지 않음
// - 품목을 고르면(Enter·클릭) 그 순간 이카운트에 그 품목 하나의 창고별 재고를 물어봄
// - 요청에는 포털 로그인 세션을 붙이고, NAS 서비스가 Apps Script에 확인함
(() => {
'use strict';
const CFG = window.MYRUBI_CONFIG || {};
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const configured = () => !!CFG.STOCK_API;
// 주소 하나(…/stock.php)로 보내고 동작은 r= 로 구분함: 'search?q=x' → stock.php?r=search&q=x
const endpoint = path => { const [ep, qs] = path.split('?'); return CFG.STOCK_API + (CFG.STOCK_API.includes('?') ? '&' : '?') + 'r=' + ep + (qs ? '&' + qs : ''); };
const pad = n => String(n).padStart(2, '0');
const fmtQty = n => (n == null ? '–' : Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 3 }));
const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const mdhm = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`; };
// 품목코드처럼 보이는 검색어 (공백 없는 영문·숫자·기호): 목록에 없어도 코드로 바로 조회할 수 있게 함
const LIST_FRESH = 5 * 60 * 1000;  // 목록 재고는 5분 안에 확인한 값이면 다시 묻지 않음
const LIST_MAX = 30;               // 검색 한 번에 목록 재고를 부르는 최대 개수 (이카운트 하루 호출 한도 보호)
const codeLike = q => /^[A-Za-z0-9][A-Za-z0-9\-_.\/]{1,39}$/.test(q);

async function api(path, method) {
  const MR = window.MR, s = MR && MR.session();
  let r;
  try { r = await fetch(endpoint(path), { method: method || 'GET', headers: { 'X-MyRubi-Session': s ? s.token : '' } }); }
  catch (e) { throw new Error('재고 서버에 연결할 수 없습니다. NAS가 켜져 있는지, 연결 주소 설정이 맞는지 확인해 주세요'); }
  let j; try { j = await r.json(); } catch (e) { throw new Error(`재고 서버 응답을 읽을 수 없습니다 (${r.status})`); }
  if (!j.ok) {
    if (j.error === 'unauthorized') {
      if (MR && MR.loginEnabled()) { MR.kick(); throw new Error('다시 로그인해 주세요'); }
      throw new Error('재고 확인은 포털에 구글 계정으로 로그인해야 쓸 수 있습니다');
    }
    throw new Error(j.error || '오류');
  }
  return j;
}

let view = null;

class View {
  constructor(body) {
    this.body = body; this.alive = true;
    this.items = []; this.sel = 0; this.q = ''; this.seq = 0; this.timer = null;
    this.detail = null; this.loadingCode = ''; this.mainWh = 'RLD';
    // 목록 재고: 화면에 보이는 줄의 재고를 한 줄씩 차례로 불러옴 (이카운트 단건 조회 1초 1회 제한)
    this.queue = []; this.running = false; this.qTimer = null; this.fetched = 0; this.observer = null;
  }
  destroy() { this.alive = false; clearTimeout(this.timer); clearTimeout(this.qTimer); if (this.observer) this.observer.disconnect(); }

  start(q) {
    if (!configured()) {
      this.body.innerHTML = `<div class="pane"><h2>재고 서버 연결 전입니다</h2>
        <p>NAS에 재고 조회 서비스를 띄우고, <code>config.js</code> 의 <code>STOCK_API</code> 에 그 주소를 넣으면 이 창에서 이카운트 창고별 재고를 볼 수 있습니다.</p>
        <p>설치 순서는 저장소의 <code>nas/stock/README.md</code> 에 있습니다.</p></div>`;
      return;
    }
    this.body.innerHTML = `<div class="stk">
      <form class="stk-bar" role="search">
        <svg class="i"><use href="#i-search"/></svg>
        <input type="text" placeholder="품목 이름, 품목코드, 바코드" aria-label="재고 찾을 품목" spellcheck="false" autocomplete="off" autocapitalize="off" enterkeyhint="search">
      </form>
      <div class="stk-main">
        <div class="stk-list" role="listbox" aria-label="품목"></div>
        <section class="stk-detail" aria-live="polite"></section>
      </div>
      <div class="stk-status"><span class="st"></span><span class="ct"></span></div>
    </div>`;
    const b = this.body, inp = b.querySelector('input');
    this.inp = inp; this.listEl = b.querySelector('.stk-list'); this.detailEl = b.querySelector('.stk-detail');
    b.querySelector('form').onsubmit = e => {
      e.preventDefault();
      // 검색어가 바뀐 직후의 Enter(바코드 스캐너 포함)는 새로 찾고, 맞는 품목이 하나면 바로 조회
      if (inp.value.trim() !== this.q) { clearTimeout(this.timer); this.find(inp.value, true); } else this.pick(this.sel);
    };
    inp.addEventListener('input', () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.find(inp.value), 160); });
    inp.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; this.find(''); }
    });
    this.listEl.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) this.pick(+r.dataset.i); });
    b.querySelector('.stk-main').addEventListener('click', e => { if (e.target.closest('[data-a=back]')) b.querySelector('.stk').classList.remove('show-detail'); });
    this.renderDetail();
    this.loadStatus();
    if (q) { inp.value = q; this.find(q, true); }
    else this.find('');
    setTimeout(() => { if (this.alive && !matchMedia('(pointer:coarse)').matches) inp.focus(); }, 30);
  }

  status(t) { const el = this.body.querySelector('.stk-status .st'); if (el) el.textContent = t || ''; }

  async loadStatus() {
    try { const s = await api('status'); if (this.alive) this.footer(s); }
    catch (e) { if (this.alive) this.status(e.message); }
  }
  footer(s) {
    const el = this.body.querySelector('.stk-status .ct'); if (!el) return;
    this.mainWh = s.mainWh || this.mainWh;
    const c = s.catalog || {};
    el.innerHTML = `품목 ${Number(c.count || 0).toLocaleString('ko-KR')}개 · 목록 ${esc(mdhm(c.at) || '없음')}
      <button class="lnk" data-a="catalog">품목 목록 다시 받기</button>`;
    el.querySelector('[data-a=catalog]').onclick = () => this.refreshCatalog();
    if (s.lastError) this.status(s.lastError);
  }
  async refreshCatalog() {
    this.status('이카운트에서 품목 목록을 받는 중');
    try { const s = await api('catalog', 'POST'); if (!this.alive) return; this.footer(s); this.status('품목 목록을 새로 받았습니다'); this.find(this.inp.value); }
    catch (e) { if (this.alive) this.status(e.message); }
  }

  async find(raw, auto) {
    const q = String(raw || '').trim(); this.q = q;
    const my = ++this.seq;
    if (!q) { this.items = []; this.queue = []; this.sel = 0; this.drawList(); return; }
    try {
      const j = await api('search?q=' + encodeURIComponent(q));
      if (!this.alive || my !== this.seq) return;
      this.mainWh = j.mainWh || this.mainWh;
      this.items = j.items.slice();
      // 목록에 맞는 품목이 없거나, 숫자·기호가 섞인 코드 같은 검색어일 때만 '코드로 바로 조회' 줄을 붙임
      if (codeLike(q) && (!this.items.length || /[\d\-_.\/]/.test(q)) && !this.items.some(p => p.code.toLowerCase() === q.toLowerCase() || (p.barcode && p.barcode === q)))
        this.items.push({ code: q, direct: true });
      this.queue = []; this.fetched = 0; this.qReady = false;
      this.sel = 0; this.drawList();
      // 입력이 멈춘 뒤에만 목록 재고를 불러옴 (치는 도중의 검색어로 호출을 쓰지 않게)
      clearTimeout(this.qTimer);
      this.qTimer = setTimeout(() => { if (my === this.seq) { this.qReady = true; this.runQueue(); } }, 700);
      this.status(j.items.length ? `“${q}” ${j.items.length}개${j.items.length >= 60 ? ' (앞 60개)' : ''}` : `“${q}”와 맞는 품목이 없습니다`);
      // 바코드를 찍었거나 결과가 하나뿐이면 바로 조회
      const exact = this.items.findIndex(p => !p.direct && (p.barcode === q || p.code.toLowerCase() === q.toLowerCase()));
      if (exact >= 0) this.pick(exact);
      else if (auto && j.items.length === 1) this.pick(0);
    } catch (e) { if (this.alive && my === this.seq) { this.items = []; this.drawList(); this.status(e.message); } }
  }

  drawList() {
    const el = this.listEl; if (!el) return;
    if (!this.items.length) {
      el.innerHTML = this.q ? '' : `<div class="stk-hint"><p>품목 이름, 품목코드, 바코드로 찾습니다.</p><p>↑↓로 고르고 Enter를 누르면 그 순간의 이카운트 재고를 불러옵니다. 바코드 스캐너로 찍으면 바로 조회됩니다.</p></div>`;
      return;
    }
    el.innerHTML = this.items.map((p, i) => {
      const on = i === this.sel ? ' sel' : '', cur = this.detail && this.detail.code === p.code ? ' cur' : '';
      if (p.direct) return `<div class="stk-row direct${on}" role="option" data-i="${i}"><span class="t"><span class="n">품목코드 “${esc(p.code)}”로 바로 조회</span><span class="s">목록에 없는 새 품목일 때</span></span><span class="q">→</span></div>`;
      return `<div class="stk-row${on}${cur}" role="option" data-i="${i}">
        <span class="t"><span class="n">${esc(p.name || p.code)}</span><span class="s">${esc([p.code, p.size].filter(Boolean).join(' · '))}</span></span>${this.qtyCell(p)}</div>`;
    }).join('');
    this.watchRows();
  }
  qtyCell(p) {
    if (p.last) return `<span class="q${p.last.qty <= 0 ? ' zero' : ''}${p.pending ? ' busy' : ''}" title="${esc(this.mainWh)} 재고, ${esc(ago(p.last.at))} 확인">${fmtQty(p.last.qty)}</span>`;
    return p.pending ? '<span class="q none busy" title="불러오는 중">…</span>' : '<span class="q none" title="아직 조회 전">·</span>';
  }
  updateRow(p) {
    const i = this.items.indexOf(p);
    const q = this.listEl && this.listEl.querySelector(`.stk-row[data-i="${i}"] .q`);
    if (q) q.outerHTML = this.qtyCell(p);
  }

  // ── 목록 재고 불러오기 ──
  // 화면에 보이는 줄 중 5분 안에 확인한 값이 없는 품목만, 검색 한 번에 최대 LIST_MAX 개까지
  stale(p) { return !p.direct && (!p.last || Date.now() - p.last.at > LIST_FRESH); }
  watchRows() {
    if (this.observer) this.observer.disconnect();
    if (!('IntersectionObserver' in window) || !this.listEl) return;
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const p = this.items[+en.target.dataset.i];
        if (p && this.stale(p) && !this.queue.includes(p) && !p.pending) this.queue.push(p);
      });
      this.runQueue();
    }, { root: this.listEl });
    this.listEl.querySelectorAll('.stk-row:not(.direct)').forEach(r => this.observer.observe(r));
  }
  async runQueue() {
    if (this.running || !this.qReady) return;
    this.running = true;
    const my = this.seq;
    try {
      while (this.alive && my === this.seq && this.queue.length && this.fetched < LIST_MAX) {
        const p = this.queue.shift();
        if (!this.stale(p)) continue;
        p.pending = true; this.updateRow(p);
        this.status(`목록 재고 불러오는 중 · ${p.name || p.code}`);
        try {
          const j = await api('stock?code=' + encodeURIComponent(p.code));
          this.fetched++;
          p.last = { qty: j.main.qty, at: j.at };
        } catch (e) {
          p.pending = false; this.updateRow(p);
          this.queue = []; this.status(e.message);   // 오류(한도·제한 등)가 나면 더 부르지 않음
          break;
        }
        p.pending = false;
        if (this.alive && my === this.seq) this.updateRow(p);
      }
      if (this.alive && my === this.seq && !this.queue.length) this.status(`“${this.q}” ${this.items.filter(p => !p.direct).length}개 · 숫자는 ${this.mainWh} 재고`);
    } finally { this.running = false; }
  }
  move(d) {
    if (!this.items.length) return;
    this.sel = (this.sel + d + this.items.length) % this.items.length;
    this.listEl.querySelectorAll('.stk-row').forEach(r => r.classList.toggle('sel', +r.dataset.i === this.sel));
    const r = this.listEl.querySelector(`.stk-row[data-i="${this.sel}"]`); if (r) r.scrollIntoView({ block: 'nearest' });
  }

  async pick(i) {
    const p = this.items[i]; if (!p) return;
    this.sel = i;
    const code = p.code;
    this.loadingCode = code;
    this.detail = { code, name: p.name, size: p.size, loading: true };
    this.drawList(); this.renderDetail();
    this.body.querySelector('.stk').classList.add('show-detail');
    try {
      const j = await api('stock?code=' + encodeURIComponent(code));
      if (!this.alive || this.loadingCode !== code) return;
      this.detail = j;
      const it = this.items.find(x => x.code === code && !x.direct); if (it) it.last = { qty: j.main.qty, at: j.at };
      this.drawList(); this.renderDetail();
      this.status(`${j.name || code} ${hm(j.at)} 조회`);
    } catch (e) {
      if (!this.alive || this.loadingCode !== code) return;
      this.detail = { code, name: p.name, size: p.size, error: e.message };
      this.renderDetail(); this.status(e.message);
    }
  }

  renderDetail() {
    const el = this.detailEl; if (!el) return;
    const d = this.detail;
    if (!d) { el.innerHTML = `<div class="stk-empty"><span class="kicker">Stock</span><p>품목을 고르면 창고별 재고가 여기에 보입니다.</p></div>`; return; }
    const head = `<button class="stk-back" data-a="back" aria-label="목록으로"><svg class="i"><use href="#i-back"/></svg>목록</button>
      <p class="kicker">${esc(d.code)}</p><h2>${esc(d.name || d.code)}</h2>${d.size ? `<p class="sz">${esc(d.size)}</p>` : ''}`;
    if (d.loading) { el.innerHTML = head + `<p class="stk-wait">이카운트에서 불러오는 중</p>`; return; }
    if (d.error) {
      el.innerHTML = head + `<p class="stk-err">${esc(d.error)}</p><button class="btn" data-a="again">다시 조회</button>`;
      el.querySelector('[data-a=again]').onclick = () => this.pick(this.items.findIndex(x => x.code === d.code));
      return;
    }
    if (!d.known) {
      el.innerHTML = head + `<p class="stk-err">이카운트에 이 품목코드가 없거나 어느 창고에도 기록이 없습니다.</p>`;
      return;
    }
    const others = d.rows.filter(w => w.wh !== d.main.wh);
    el.innerHTML = head + `
      <div class="stk-main-wh"><span class="lb">${esc(d.main.wh)}${d.main.name ? ' · ' + esc(d.main.name) : ''}</span>
        <span class="big${d.main.qty <= 0 ? ' zero' : ''}">${fmtQty(d.main.qty)}</span></div>
      <table class="stk-wh"><thead><tr><th>창고</th><th></th><th>재고</th></tr></thead><tbody>
        ${others.map(w => `<tr><td class="c">${esc(w.wh)}</td><td>${esc(w.name)}</td><td class="n${w.qty < 0 ? ' neg' : w.qty === 0 ? ' zero' : ''}">${fmtQty(w.qty)}</td></tr>`).join('')}
        ${others.length ? '' : '<tr><td colspan="3" class="none">다른 창고 재고 없음</td></tr>'}
      </tbody><tfoot><tr><td>전체</td><td></td><td class="n">${fmtQty(d.total)}</td></tr></tfoot></table>
      <p class="stk-at">${hm(d.at)} 이카운트 기준${d.cached ? ' (30초 안에 조회한 값)' : ''}
        <button class="lnk" data-a="re">다시 조회</button><button class="lnk" data-a="copy">품목코드 복사</button></p>`;
    el.querySelector('[data-a=re]').onclick = () => { const i = this.items.findIndex(x => x.code === d.code); if (i >= 0) this.pick(i); else { this.items.unshift({ code: d.code, name: d.name, size: d.size }); this.pick(0); } };
    el.querySelector('[data-a=copy]').onclick = () => { try { navigator.clipboard.writeText(d.code); } catch (e) {} this.status('품목코드를 복사했습니다'); };
  }
}

function mount(body, q) { if (view) view.destroy(); view = new View(body); view.start(q); }
function search(q) { if (view && view.inp) { view.inp.value = q; view.find(q, true); view.inp.focus(); } }
window.MYRUBI_STOCK = { configured, mount, search, unmount() { if (view) view.destroy(); view = null; } };
})();
