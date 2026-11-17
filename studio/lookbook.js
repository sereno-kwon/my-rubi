// 스튜디오 · 룩북 썸네일 (/studio/lookbook/)
// 흐름: 사진 추가 → 사진마다 문구를 적음(새 사진은 마지막 문구를 이어받음) → 미리보기·썸네일에 블랙 레이어와 가운데 문구를 그림
//       → 저장할 때 원본을 다시 읽어 고른 비율로 자르고(기본 원본 비율), 고른 가로로(기본 원본 크기) 계단식으로 줄인 뒤 레이어·문구를 얹어 JPG 최고 품질로 한 번만 인코딩
// 서체는 Pretendard(굵기 Thin–Medium, 기본 Light)를 쓸 때만 CDN에서 불러옴. 글자 크기는 결과 가로에 대한 % 라서 미리보기와 결과의 비례가 같음
// 자르기·저장(ZIP, 휴대폰 공유 창) 방식은 톤 매칭(/studio/tone.js)과 같음
(() => {
  'use strict';
  if (window.MR && !MR.requireLogin()) return;

  const K_OPT = 'myrubi.lookbook.opt', K_SIZE = 'myrubi.lookbook.size', K_TEXT = 'myrubi.lookbook.text';
  const FONT = 'StudioPretendard';
  const FONT_BASE = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/woff2/Pretendard-';
  const WEIGHTS = [{ w: 100, k: 'Thin' }, { w: 200, k: 'ExtraLight' }, { w: 300, k: 'Light' }, { w: 400, k: 'Regular' }, { w: 500, k: 'Medium' }];
  const OPT_DEF = { weight: 300, size: 6, track: 0, op: 60 };
  const RATIOS = [{ k: '원본', r: 0 }, { k: '4:3', r: 4 / 3 }, { k: '3:2', r: 3 / 2 }, { k: '1:1', r: 1 }, { k: '4:5', r: 4 / 5 }, { k: '16:9', r: 16 / 9 }];
  const WIDTHS = [0, 1080, 1600, 2000, 2560];  // 0 = 원본 (자른 영역의 원래 가로, 키우지 않음)
  const SIZE_DEF = { ratio: '원본', w: 0 }, W_MIN = 320, W_MAX = 6000;
  const MAX_AREA = 16000000;                   // iOS 사파리 캔버스 한계 안쪽
  const JPEG_Q = 1;
  const STEP_MAX = 4000;
  const TEXT_MAX = 0.92;                       // 문구가 가로의 92%를 넘으면 그만큼 글자를 줄임
  const COARSE = matchMedia('(pointer: coarse)').matches;
  const PREV_EDGE = COARSE ? 1200 : 1600;
  const TH_EDGE = 192;

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise(r => setTimeout(r, 0));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---- 상태 ----
  const SL_TYPE = [
    { k: 'size',  label: '크기',   min: 2,   max: 20, step: 0.5, fmt: v => v + '%' },
    { k: 'track', label: '자간',   min: -10, max: 20, step: 1,   fmt: v => (v > 0 ? '+' : '') + v },
  ];
  const SL_LAYER = [
    { k: 'op', label: '오퍼시티', min: 0, max: 100, step: 1, fmt: v => v + '%' },
  ];
  let opt = Object.assign({}, OPT_DEF, lsGet(K_OPT, {}));
  if (!WEIGHTS.some(x => x.w === opt.weight)) opt.weight = OPT_DEF.weight;
  let size = (() => {
    const v = lsGet(K_SIZE, SIZE_DEF) || SIZE_DEF;
    const w = Math.round(+v.w) || 0;
    return { ratio: RATIOS.some(x => x.k === v.ratio) ? v.ratio : SIZE_DEF.ratio, w: w ? clamp(w, W_MIN, W_MAX) : 0 };
  })();
  let lastText = lsGet(K_TEXT, '') || '';
  let items = [];        // { id, file, name, url, w, h, text, cx, cy, tsrc, tcv, state }
  let cur = null, curSrc = null, curFor = null;
  let prepared = null, busy = false, seq = 0;

  // ---- 서체 (쓰는 굵기만 불러옴) ----
  const fontJobs = {};
  function ensureFont(w) {
    if (!fontJobs[w]) {
      const k = WEIGHTS.find(x => x.w === w).k;
      fontJobs[w] = new FontFace(FONT, `url("${FONT_BASE}${k}.woff2") format("woff2")`, { weight: String(w) }).load()
        .then(f => { document.fonts.add(f); return true; })
        .catch(() => { delete fontJobs[w]; toast('서체를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요', 4000); return false; });
    }
    return fontJobs[w];
  }
  function useWeight(w) {
    ensureFont(w).then(ok => { if (ok && opt.weight === w) changed(); });
  }

  // ---- 그림 ----
  function loadImg(src) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('decode')); img.src = src; });
  }
  function draw(img, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, w, h);
    return c;
  }
  const free = c => { if (c) { c.width = 0; c.height = 0; } };

  const ratioOf = it => { const r = RATIOS.find(x => x.k === size.ratio).r; return r || (it && it.w ? it.w / it.h : 4 / 3); };
  function crop(it, W, H) {
    const R = ratioOf(it);
    let sw = W, sh = W / R;
    if (sh > H) { sh = H; sw = H * R; }
    return { sx: (W - sw) * (it.cx == null ? 0.5 : it.cx), sy: (H - sh) * (it.cy == null ? 0.5 : it.cy), sw, sh, fx: W - sw, fy: H - sh };
  }
  // 결과 픽셀 크기. 가로 '원본'이면 자른 영역의 원래 가로 그대로(비율 원본이면 사진 크기 그대로)
  function outSize(it) {
    if (!it || !it.w) { const R = ratioOf(null); const w = size.w || 2000; return [w, Math.round(w / R)]; }
    const r = crop(it, it.w, it.h);
    let w = size.w || Math.round(r.sw), h = size.ratio === '원본' && !size.w ? it.h : Math.round(w / ratioOf(it));
    if (w * h > MAX_AREA) { const k = Math.sqrt(MAX_AREA / (w * h)); w = Math.floor(w * k); h = Math.round(w / ratioOf(it)); }
    return [w, Math.max(1, h)];
  }
  const boxSize = (it, edge) => { const R = ratioOf(it); return R >= 1 ? [edge, Math.max(1, Math.round(edge / R))] : [Math.max(1, Math.round(edge * R)), edge]; };
  function srcSize(it, target) {
    const r = crop(it, it.w, it.h), s = Math.min(1, target / Math.max(r.sw, r.sh));
    return [Math.max(1, Math.round(it.w * s)), Math.max(1, Math.round(it.h * s))];
  }

  // 블랙 레이어 + 가운데 문구. W×H 캔버스에 이미 사진이 그려져 있다고 봄
  function overlay(x, W, H, text) {
    x.save();
    x.fillStyle = `rgba(0, 0, 0, ${opt.op / 100})`;
    x.fillRect(0, 0, W, H);
    text = String(text || '').trim();
    if (text) {
      let px = W * opt.size / 100;
      const setFont = () => {
        x.font = `${opt.weight} ${px}px "${FONT}", "Pretendard", system-ui, sans-serif`;
        if ('letterSpacing' in x) x.letterSpacing = (px * opt.track / 100) + 'px';
      };
      setFont();
      const tw = x.measureText(text).width;
      if (tw > W * TEXT_MAX) { px = px * W * TEXT_MAX / tw; setFont(); }
      // letterSpacing 은 마지막 글자 뒤에도 붙으므로 그 절반만큼 오른쪽으로 옮겨 가운데를 맞춤
      const ls = 'letterSpacing' in x ? px * opt.track / 100 : 0;
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(text, W / 2 + ls / 2, H / 2);
    }
    x.restore();
  }

  // ---- 사진 추가 ----
  const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(f.name);
  async function addFiles(list) {
    const files = [...list].filter(isImg);
    if (!files.length) { toast('사진 파일이 아닙니다'); return; }
    const fresh = files.map(f => ({ id: ++seq, file: f, name: f.name || ('photo-' + seq + '.jpg'), url: URL.createObjectURL(f), text: lastText, cx: 0.5, cy: 0.5, state: 'loading' }));
    items = items.concat(fresh);
    prepared = null;
    renderStrip(); updateUI();
    const bad = [];
    for (const it of fresh) {
      setStatus(`사진 읽는 중 ${fresh.indexOf(it) + 1}/${fresh.length}`);
      try {
        const img = await loadImg(it.url);
        it.w = img.naturalWidth; it.h = img.naturalHeight;
        const [tw, th] = srcSize(it, TH_EDGE * 3);
        it.tsrc = draw(img, tw, th);
        it.state = 'ready';
        if (!cur) select(it, img);
      } catch (e) { it.state = 'bad'; bad.push(it.name); }
      renderThumb(it);
      await tick();
    }
    if (bad.length) {
      items.filter(it => it.state === 'bad').forEach(it => { URL.revokeObjectURL(it.url); free(it.tsrc); });
      items = items.filter(it => it.state !== 'bad');
      renderStrip();
      toast(`열 수 없는 사진 ${bad.length}장은 뺐습니다 (${bad.slice(0, 2).join(', ')}${bad.length > 2 ? ' 외' : ''}). HEIC는 사파리에서만 열립니다`, 5000);
    }
    if (!cur && items.length) select(items[0]);
    updateUI();
  }

  // ---- 선택·미리보기 ----
  async function select(it, img) {
    if (!it || it.state !== 'ready') return;
    cur = it;
    $('text').value = it.text || '';
    renderStripSel(); updateUI();
    if (curFor !== it) {
      free(curSrc); curSrc = null; curFor = null;
      try {
        img = img || await loadImg(it.url);
        if (cur !== it) return;
        const [w, h] = srcSize(it, PREV_EDGE);
        curSrc = draw(img, w, h); curFor = it;
      } catch (e) { toast('사진을 다시 읽지 못했습니다'); return; }
    }
    paint();
  }

  const cv = $('cv'), cx2d = cv.getContext('2d');
  let raf = 0;
  function paint() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!cur || !curSrc || curFor !== cur) return;
      const r = crop(cur, curSrc.width, curSrc.height);
      const [pw, ph] = boxSize(cur, PREV_EDGE);
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      cx2d.imageSmoothingEnabled = true; cx2d.imageSmoothingQuality = 'high';
      cx2d.drawImage(curSrc, r.sx, r.sy, r.sw, r.sh, 0, 0, pw, ph);
      overlay(cx2d, pw, ph, cur.text);
      $('view').classList.toggle('pan', r.fx > 1 || r.fy > 1);
    });
  }

  // ---- 썸네일 ----
  const strip = $('strip');
  function renderStrip() {
    strip.innerHTML = items.map(it => `<li data-id="${it.id}"><button class="th" type="button" title="${esc(it.name)}" aria-label="${esc(it.name)}"><canvas></canvas></button><span class="busy">${it.state === 'loading' ? '읽는 중' : ''}</span></li>`).join('');
    items.forEach(it => { it.tcv = strip.querySelector(`li[data-id="${it.id}"] canvas`); if (it.state === 'ready') renderThumb(it); });
    renderStripSel();
  }
  function renderStripSel() {
    strip.querySelectorAll('li').forEach(li => li.querySelector('.th').setAttribute('aria-current', cur && +li.dataset.id === cur.id ? 'true' : 'false'));
  }
  function renderThumb(it) {
    const li = strip.querySelector(`li[data-id="${it.id}"]`);
    if (!li) return;
    li.querySelector('.busy').textContent = it.state === 'loading' ? '읽는 중' : it.state === 'bad' ? '열 수 없음' : '';
    if (it.state !== 'ready' || !it.tcv || !it.tsrc) return;
    const [w, h] = boxSize(it, TH_EDGE);
    const c = it.tcv; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d'), r = crop(it, it.tsrc.width, it.tsrc.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(it.tsrc, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    overlay(x, w, h, it.text);
  }
  let thumbTimer = 0;
  function refreshThumbs(only) {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(async () => { for (const it of (only ? [only] : items)) { renderThumb(it); await tick(); } }, 180);
  }
  strip.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const it = items.find(x => x.id === +li.dataset.id); if (it) select(it);
  });
  function changed() { prepared = null; paint(); refreshThumbs(); updateUI(); }

  // ---- 문구 ----
  const tIn = $('text');
  tIn.value = lastText;
  tIn.addEventListener('input', () => {
    lastText = tIn.value; lsSet(K_TEXT, lastText);
    if (cur) { cur.text = tIn.value; prepared = null; paint(); refreshThumbs(cur); }
    updateUI();
  });
  $('btnTextAll').addEventListener('click', () => {
    if (!items.length) return;
    items.forEach(it => { it.text = tIn.value; });
    changed(); toast(`${items.length}장 모두 '${tIn.value.trim() || '문구 없음'}'으로 맞췄습니다`);
  });

  // ---- 서체·레이어 ----
  const wSegEl = $('weightSeg');
  wSegEl.innerHTML = WEIGHTS.map(x => `<button type="button" data-w="${x.w}">${x.k}</button>`).join('');
  const showWeight = () => wSegEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.w === opt.weight ? 'true' : 'false'));
  wSegEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-w]'); if (!b) return;
    opt.weight = +b.dataset.w; lsSet(K_OPT, opt); showWeight(); useWeight(opt.weight); changed();
  });
  function sliders(box, defs) {
    const el = $(box);
    el.innerHTML = defs.map(s => `<label class="row"><span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${opt[s.k]}" data-k="${s.k}"><output data-o="${s.k}">${s.fmt(opt[s.k])}</output></label>`).join('');
    el.addEventListener('input', e => {
      const k = e.target.dataset.k; if (!k) return;
      opt[k] = +e.target.value; lsSet(K_OPT, opt);
      el.querySelector(`[data-o="${k}"]`).textContent = defs.find(s => s.k === k).fmt(opt[k]);
      changed();
    });
    el.addEventListener('dblclick', e => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      e.target.value = OPT_DEF[k]; e.target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return () => defs.forEach(s => { el.querySelector(`[data-k="${s.k}"]`).value = opt[s.k]; el.querySelector(`[data-o="${s.k}"]`).textContent = s.fmt(opt[s.k]); });
  }
  const syncType = sliders('typeSliders', SL_TYPE), syncLayer = sliders('layerSliders', SL_LAYER);
  $('btnTypeReset').addEventListener('click', () => {
    opt.weight = OPT_DEF.weight; opt.size = OPT_DEF.size; opt.track = OPT_DEF.track; lsSet(K_OPT, opt);
    showWeight(); syncType(); useWeight(opt.weight); changed();
  });
  $('btnLayerReset').addEventListener('click', () => { opt.op = OPT_DEF.op; lsSet(K_OPT, opt); syncLayer(); changed(); });

  // ---- 끌어서 자를 위치 옮기기 ----
  const view = $('view');
  let drag = null;
  view.addEventListener('pointerdown', e => {
    if (e.button || !cur || !curSrc) return;
    const r = crop(cur, curSrc.width, curSrc.height);
    if (r.fx <= 1 && r.fy <= 1) return;
    e.preventDefault();
    try { view.setPointerCapture(e.pointerId); } catch (_) {}
    drag = { x: e.clientX, y: e.clientY, cx: cur.cx, cy: cur.cy, k: r.sw / cv.getBoundingClientRect().width, fx: r.fx, fy: r.fy, it: cur };
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', e => {
    if (!drag || drag.it !== cur) return;
    const dx = (e.clientX - drag.x) * drag.k, dy = (e.clientY - drag.y) * drag.k;
    if (drag.fx > 1) cur.cx = clamp(drag.cx - dx / drag.fx, 0, 1);
    if (drag.fy > 1) cur.cy = clamp(drag.cy - dy / drag.fy, 0, 1);
    paint();
  });
  const endDrag = () => { if (!drag) return; const it = drag.it; drag = null; view.classList.remove('dragging'); prepared = null; renderThumb(it); updateUI(); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => view.addEventListener(t, endDrag));
  view.addEventListener('dblclick', () => { if (!cur) return; cur.cx = 0.5; cur.cy = 0.5; prepared = null; paint(); renderThumb(cur); });
  view.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && cur) {
      const ready = items.filter(x => x.state === 'ready'), i = ready.indexOf(cur);
      const n = ready[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) select(n);
    }
  });

  // ---- 빼기 ----
  $('btnRemove').addEventListener('click', () => {
    if (!cur) return;
    const i = items.indexOf(cur);
    URL.revokeObjectURL(cur.url); free(cur.tsrc);
    items.splice(i, 1);
    cur = null; free(curSrc); curSrc = null; curFor = null; prepared = null;
    renderStrip();
    const n = items[Math.min(i, items.length - 1)];
    if (n) select(n); else cx2d.clearRect(0, 0, cv.width, cv.height);
    updateUI();
  });

  // ---- 크기 ----
  const ratioSeg = $('ratioSeg'), wSeg = $('wSeg'), wIn = $('outW');
  ratioSeg.innerHTML = RATIOS.map(x => `<button type="button" data-r="${x.k}">${x.k}</button>`).join('');
  wSeg.innerHTML = WIDTHS.map(w => `<button type="button" data-w="${w}">${w || '원본'}</button>`).join('');
  function showSize() {
    ratioSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === size.ratio ? 'true' : 'false'));
    wSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.w === size.w ? 'true' : 'false'));
    if (document.activeElement !== wIn) wIn.value = size.w || '';
    const ex = cur ? outSize(cur) : null;
    const what = size.ratio === '원본' ? '자르지 않고' : `${size.ratio}로 잘라`;
    const wide = size.w ? `가로 ${size.w}px` : '원본 크기 그대로';
    $('sizeNote').textContent = `${what} ${wide}${ex ? ` (이 사진 ${ex[0]}×${ex[1]})` : ''}. ${size.w ? '' : '키우거나 줄이지 않습니다.'}`;
  }
  function setSize(next) {
    const w = next.w == null ? size.w : (Math.round(+next.w) || 0);
    const n = { ratio: next.ratio || size.ratio, w: w ? clamp(w, W_MIN, W_MAX) : 0 };
    if (n.ratio === size.ratio && n.w === size.w) { showSize(); return; }
    const ratioChanged = n.ratio !== size.ratio;
    size = n; lsSet(K_SIZE, size); prepared = null;
    if (ratioChanged && cur) { const c = cur; curFor = null; select(c); } else paint();
    refreshThumbs(); updateUI();
  }
  ratioSeg.addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b) setSize({ ratio: b.dataset.r }); });
  wSeg.addEventListener('click', e => { const b = e.target.closest('button[data-w]'); if (b) setSize({ w: +b.dataset.w }); });
  wIn.addEventListener('change', () => setSize({ w: wIn.value === '' ? 0 : +wIn.value }));
  wIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setSize({ w: wIn.value === '' ? 0 : +wIn.value }); wIn.blur(); } });
  wIn.addEventListener('blur', () => { wIn.value = size.w || ''; });
  $('btnSizeReset').addEventListener('click', () => setSize(SIZE_DEF));

  // ---- 파일 이름: rubi-lookbook-{문구}.jpg, 같은 문구가 여러 장이면 -01, -02 … ----
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
  const slug = v => String(v || '').trim().toLowerCase().replace(/[\\/:*?"<>|#%&{}$!'`@+=.,]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || today();
  function fileName(it) {
    const ready = items.filter(x => x.state === 'ready'), s = slug(it.text);
    const same = ready.filter(x => slug(x.text) === s);
    if (same.length < 2) return `rubi-lookbook-${s}.jpg`;
    const w = Math.max(2, String(same.length).length);
    return `rubi-lookbook-${s}-${String(same.indexOf(it) + 1).padStart(w, '0')}.jpg`;
  }

  // ---- 저장 ----
  async function render(it) {
    const img = await loadImg(it.url);
    const r = crop(it, it.w, it.h);
    const [OW, OH] = outSize(it), R = OW / OH, stepMax = Math.max(STEP_MAX, OW);
    const sizes = [];
    for (let w = r.sw; w > OW * 2;) { w = w / 2; sizes.push(Math.round(w)); }
    sizes.push(OW);
    let i = sizes.findIndex(w => w <= stepMax); if (i < 0) i = sizes.length - 1;
    let c = null;
    for (const w of sizes.slice(i)) {
      const n = document.createElement('canvas'); n.width = w; n.height = w === OW ? OH : Math.max(1, Math.round(w / R));
      const x = n.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      if (c) x.drawImage(c, 0, 0, c.width, c.height, 0, 0, n.width, n.height);
      else x.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, n.width, n.height);
      free(c); c = n;
      await tick();
    }
    overlay(c.getContext('2d'), OW, OH, it.text);
    const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', JPEG_Q));
    free(c);
    return { file: new File([blob], fileName(it), { type: 'image/jpeg', lastModified: Date.now() }), enlarged: !!size.w && r.sw < OW - 0.5 };
  }

  const keyOf = list => JSON.stringify([opt, size, list.map(it => [it.id, it.text, it.cx, it.cy])]);
  const zipName = () => { const ready = items.filter(x => x.state === 'ready'); const s = new Set(ready.map(x => slug(x.text))); return `rubi-lookbook-${s.size === 1 ? [...s][0] : today()}.zip`; };
  async function save(list) {
    if (busy) return;
    list = list.filter(it => it.state === 'ready');
    if (!list.length) return;
    if (prepared && prepared.key === keyOf(list)) { await share(prepared.files); return; }
    busy = true; updateUI();
    if (!(await ensureFont(opt.weight))) { busy = false; updateUI(); return; }
    const files = []; let enlarged = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        setStatus(`저장 준비 중 ${i + 1}/${list.length}`);
        const r = await render(list[i]);
        files.push(r.file); if (r.enlarged) enlarged++;
      }
    } catch (e) {
      toast('저장하지 못했습니다. 사진 수를 줄여 다시 해 보세요'); busy = false; updateUI(); return;
    }
    busy = false;
    if (enlarged) toast(`자른 가로가 ${size.w}px보다 작은 사진 ${enlarged}장은 키워서 저장했습니다`, 4000);
    if (COARSE && canShare(files)) {
      prepared = { key: keyOf(list), files };
      updateUI();
      setStatus(`${files.length}장 준비됨. 저장 버튼을 한 번 더 누르면 공유 창이 열립니다`);
      try { await navigator.share({ files }); prepared = null; updateUI(); } catch (e) { /* 막히거나 닫으면 다시 누르게 함 */ }
      return;
    }
    if (files.length === 1) download(files[0]);
    else download(new File([await makeZip(files)], zipName(), { type: 'application/zip' }));
    updateUI();
  }
  const canShare = files => { try { return !!(navigator.canShare && navigator.canShare({ files })); } catch (e) { return false; } };
  async function share(files) {
    try { await navigator.share({ files }); prepared = null; updateUI(); }
    catch (e) {
      if (e.name === 'AbortError') return;
      if (files.length === 1) download(files[0]); else download(new File([await makeZip(files)], zipName(), { type: 'application/zip' }));
      prepared = null; updateUI();
    }
  }
  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  // 압축 없는(store) ZIP, 파일 이름 UTF-8 (톤 매칭과 같은 방식)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function makeZip(files) {
    const enc = new TextEncoder(), parts = [], dir = [], used = {};
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0;
    for (const f of files) {
      let nm = f.name; const b = nm.replace(/\.jpg$/, '');
      for (let k = 2; used[nm]; k++) nm = `${b} (${k}).jpg`;
      used[nm] = 1;
      const name = enc.encode(nm), data = new Uint8Array(await f.arrayBuffer()), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);
      dir.push(c.buffer, name);
      off += 30 + name.length + data.length;
    }
    const dirSize = dir.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...dir, end.buffer], { type: 'application/zip' });
  }
  $('btnSaveOne').addEventListener('click', () => cur && save([cur]));
  $('btnSaveAll').addEventListener('click', () => save(items));

  // ---- 파일 고르기·끌어 놓기 ----
  $('btnAdd').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
  let dragN = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; $('stage').classList.add('over'); $('drop').classList.add('over'); } });
  document.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('stage').classList.remove('over'); $('drop').classList.remove('over'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dragN = 0; $('stage').classList.remove('over'); $('drop').classList.remove('over');
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // ---- 화면 상태 ----
  function setStatus(t) { $('status').textContent = t; }
  function updateUI() {
    const ready = items.filter(it => it.state === 'ready'), has = items.length > 0;
    $('drop').hidden = has; $('view').hidden = !has; $('viewBar').hidden = !has; $('hint').hidden = !has;
    $('curName').textContent = cur ? `${cur.name} → ${fileName(cur)} · 원본 ${cur.w}×${cur.h} → ${outSize(cur).join('×')}` : '';
    $('namePrev').textContent = cur ? fileName(cur) : `rubi-lookbook-${slug(tIn.value)}.jpg`;
    showSize();
    const sa = $('btnSaveAll');
    sa.disabled = busy || !ready.length;
    const pAll = prepared && prepared.key === keyOf(ready), pOne = prepared && cur && prepared.key === keyOf([cur]);
    sa.textContent = busy ? '만드는 중…' : pAll ? `공유 창 열기 (${ready.length}장)` : ready.length > 1 ? `전체 저장 (${ready.length}장)` : '전체 저장';
    const so = $('btnSaveOne');
    so.disabled = busy || !cur; so.textContent = pOne ? '공유 창 열기' : '이 사진 저장';
    $('btnRemove').disabled = busy;
    $('btnTextAll').hidden = items.length < 2;
    if (!busy && !prepared) {
      const w = WEIGHTS.find(x => x.w === opt.weight).k;
      setStatus(has ? `${ready.length}장 · 블랙 ${opt.op}% · Pretendard ${w}${items.length > ready.length ? ' · 읽는 중' : ''}` : '사진을 올리면 블랙 레이어와 문구를 얹어 보여줍니다');
    }
  }
  let toastTimer = 0;
  function toast(t, ms) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms || 2600); }

  showWeight();
  useWeight(opt.weight);
  updateUI();
})();
