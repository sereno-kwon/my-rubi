// 톤 매칭 앱 (/tone/)
// 흐름: 사진 추가 → 사진마다 톤 요약(engine.analyze, 긴 변 512px) → 기준 톤과 조정값으로 LUT를 만들어 미리보기·썸네일에 입힘
//       → 저장할 때 원본 크기로 다시 읽어 같은 LUT를 입히고 JPG로 내보냄
// 메모리를 아끼려고 큰 미리보기는 지금 보고 있는 사진 한 장만 들고 있고, 나머지는 작은 썸네일과 요약 숫자만 들고 있음
(() => {
  'use strict';
  if (window.MR && !MR.requireLogin()) return;

  const E = window.ToneEngine;
  const BUILTIN = window.TONE_PRESETS || [];
  const K_PRESETS = 'myrubi.tone.presets', K_SEL = 'myrubi.tone.sel';
  const MAX_AREA = 16000000;                 // iOS 사파리 캔버스 한계(약 1,670만 화소) 안쪽
  const COARSE = matchMedia('(pointer: coarse)').matches;
  const PREV_EDGE = COARSE ? 1400 : 2000;    // 미리보기 긴 변
  const THUMB_EDGE = 192;

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = () => new Promise(r => setTimeout(r, 0));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // ---- 상태 ----
  let custom = lsGet(K_PRESETS, []).filter(p => p && p.profile && p.profile.lq);
  let selId = lsGet(K_SEL, 'rubi');
  const SLIDERS = [
    { k: 'strength', label: '강도',   min: 0,    max: 150, def: 100, fmt: v => v + '%' },
    { k: 'bright',   label: '밝기',   min: -100, max: 100, def: 0,   fmt: v => (v > 0 ? '+' : '') + v },
    { k: 'temp',     label: '색온도', min: -100, max: 100, def: 0,   fmt: v => (v > 0 ? '+' : '') + v },
    { k: 'sat',      label: '채도',   min: -100, max: 100, def: 0,   fmt: v => (v > 0 ? '+' : '') + v },
  ];
  const val = {}; SLIDERS.forEach(s => { val[s.k] = s.def; });
  let items = [];        // { id, file, name, url, w, h, stats, thumb(ImageData), tcv(canvas), lut, lutKey, state }
  let cur = null;        // 지금 보는 사진
  let curOrig = null;    // 지금 사진의 미리보기 원본 ImageData
  let curFor = null;     // curOrig 가 어느 사진 것인지
  let showOrig = false;
  let prepared = null;   // 휴대폰: 다 만든 파일을 공유 창으로 넘기기 전에 들고 있음
  let seq = 0;

  const presets = () => BUILTIN.concat(custom);
  const preset = () => presets().find(p => p.id === selId) || presets()[0];
  const opts = () => ({ strength: val.strength / 100, bright: val.bright / 100, temp: val.temp / 100, sat: val.sat / 100 });
  const optKey = () => (preset() ? preset().id : '') + '|' + SLIDERS.map(s => val[s.k]).join(',');

  function lutFor(it) {
    const key = optKey();
    if (it.lut && it.lutKey === key) return it.lut;
    const p = preset();
    it.lut = E.buildLUT(it.stats, p ? p.profile : null, opts());
    it.lutKey = key;
    return it.lut;
  }

  // ---- 그림 읽기 ----
  function loadImg(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('decode'));
      img.src = src;
    });
  }
  function fit(w, h, edge, area) {
    let s = Math.min(1, edge / Math.max(w, h));
    if (area && w * h * s * s > area) s = Math.sqrt(area / (w * h));
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
  }
  function draw(img, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, w, h);
    return c;
  }
  const pixels = c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  const free = c => { if (c) { c.width = 0; c.height = 0; } };

  // ---- 사진 추가 ----
  const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(f.name);

  async function addFiles(list) {
    const files = [...list].filter(isImg);
    if (!files.length) { toast('사진 파일이 아닙니다'); return; }
    const fresh = files.map(f => ({ id: ++seq, file: f, name: f.name || ('photo-' + seq + '.jpg'), url: URL.createObjectURL(f), state: 'loading' }));
    items = items.concat(fresh);
    prepared = null;
    renderStrip(); updateUI();
    const bad = [];
    for (const it of fresh) {
      setStatus(`사진 읽는 중 ${fresh.indexOf(it) + 1}/${fresh.length}`);
      try {
        const img = await loadImg(it.url);
        it.w = img.naturalWidth; it.h = img.naturalHeight;
        const [aw, ah] = fit(it.w, it.h, 512);
        const ac = draw(img, aw, ah);
        it.stats = E.analyze(pixels(ac).data);
        free(ac);
        const [tw, th] = fit(it.w, it.h, THUMB_EDGE);
        const tc = draw(img, tw, th);
        it.thumb = pixels(tc); free(tc);
        it.state = 'ready';
        if (!cur) select(it, img);
      } catch (e) {
        it.state = 'bad'; bad.push(it.name);
      }
      renderThumb(it);
      await tick();
    }
    if (bad.length) {
      items.filter(it => it.state === 'bad').forEach(it => URL.revokeObjectURL(it.url));
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
    renderStripSel();
    updateUI();
    if (curFor !== it) {
      curOrig = null; curFor = null;
      paint();
      try {
        img = img || await loadImg(it.url);
        if (cur !== it) return;
        const [w, h] = fit(it.w, it.h, PREV_EDGE);
        const c = draw(img, w, h);
        curOrig = pixels(c); curFor = it; free(c);
      } catch (e) { toast('사진을 다시 읽지 못했습니다'); return; }
    }
    paint();
  }

  const cv = $('cv');
  let raf = 0;
  function paint() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!cur || !curOrig || curFor !== cur) return;
      if (cv.width !== curOrig.width || cv.height !== curOrig.height) { cv.width = curOrig.width; cv.height = curOrig.height; }
      const x = cv.getContext('2d');
      if (showOrig) { x.putImageData(curOrig, 0, 0); }
      else {
        const out = new ImageData(curOrig.width, curOrig.height);
        E.applyLUT(curOrig.data, out.data, lutFor(cur));
        x.putImageData(out, 0, 0);
      }
      $('badge').hidden = !showOrig;
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
    if (it.state !== 'ready' || !it.tcv) return;
    const c = it.tcv; c.width = it.thumb.width; c.height = it.thumb.height;
    const out = new ImageData(it.thumb.width, it.thumb.height);
    E.applyLUT(it.thumb.data, out.data, lutFor(it));
    c.getContext('2d').putImageData(out, 0, 0);
  }
  // 조정이 바뀌면 썸네일은 잠시 뒤 한 장씩 (슬라이더가 끊기지 않게)
  let thumbJob = 0, thumbTimer = 0;
  function refreshThumbs() {
    clearTimeout(thumbTimer);
    const job = ++thumbJob;
    thumbTimer = setTimeout(async () => {
      for (const it of items) {
        if (job !== thumbJob) return;
        renderThumb(it);
        await tick();
      }
    }, 220);
  }
  strip.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return;
    const it = items.find(x => x.id === +li.dataset.id); if (it) select(it);
  });

  function changed() { prepared = null; paint(); refreshThumbs(); updateUI(); }

  // ---- 기준 톤 목록 ----
  const presetUl = $('presets');
  function renderPresets() {
    const list = presets();
    if (!list.find(p => p.id === selId) && list.length) selId = list[0].id;
    presetUl.innerHTML = list.map(p => {
      const mine = !BUILTIN.includes(p);
      return `<li data-id="${esc(p.id)}">
        <label><input type="radio" name="preset" value="${esc(p.id)}"${p.id === selId ? ' checked' : ''}>
          <span class="n">${esc(p.name)}</span>
          <span class="d">${esc(p.note || '')}</span>
          ${p.thumbs && p.thumbs.length ? `<span class="thumbs">${p.thumbs.map(t => `<img src="${esc(t)}" alt="">`).join('')}</span>` : ''}
        </label>
        ${mine ? `<span class="acts"><button class="lnk" type="button" data-act="code">프리셋 코드 복사</button><button class="lnk" type="button" data-act="del">지우기</button></span>` : ''}
      </li>`;
    }).join('');
  }
  presetUl.addEventListener('change', e => {
    if (e.target.name !== 'preset') return;
    selId = e.target.value; lsSet(K_SEL, selId); changed();
  });
  presetUl.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.closest('li').dataset.id, p = custom.find(x => x.id === id); if (!p) return;
    if (b.dataset.act === 'code') {
      const line = `  { id: ${JSON.stringify(p.id)}, name: ${JSON.stringify(p.name)}, note: ${JSON.stringify(p.note.replace(' · 이 브라우저', ''))}, profile: ${JSON.stringify(p.profile)} },`;
      try { await navigator.clipboard.writeText(line); toast('복사했습니다. tone/presets.js 에 붙이면 모든 직원이 함께 씁니다'); }
      catch (err) { prompt('아래 줄을 복사하세요', line); }
    } else if (b.dataset.act === 'del') {
      if (!b.classList.contains('warn')) { b.classList.add('warn'); b.textContent = '한 번 더 누르면 지움'; setTimeout(() => { if (b.isConnected) { b.classList.remove('warn'); b.textContent = '지우기'; } }, 3000); return; }
      custom = custom.filter(x => x.id !== id); lsSet(K_PRESETS, custom);
      if (selId === id) { selId = (BUILTIN[0] || custom[0] || {}).id; lsSet(K_SEL, selId); }
      renderPresets(); changed();
    }
  });

  // ---- 조정 슬라이더 ----
  const slBox = $('sliders');
  slBox.innerHTML = SLIDERS.map(s => `<label class="row"><span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="1" value="${s.def}" data-k="${s.k}"><output data-o="${s.k}">${s.fmt(s.def)}</output></label>`).join('');
  slBox.addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    val[k] = +e.target.value;
    slBox.querySelector(`[data-o="${k}"]`).textContent = SLIDERS.find(s => s.k === k).fmt(val[k]);
    changed();
  });
  // 두 번 누르면 그 항목만 처음 값으로
  slBox.addEventListener('dblclick', e => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return;
    const s = SLIDERS.find(x => x.k === k); e.target.value = s.def; e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('btnReset').addEventListener('click', () => {
    SLIDERS.forEach(s => { val[s.k] = s.def; slBox.querySelector(`[data-k="${s.k}"]`).value = s.def; slBox.querySelector(`[data-o="${s.k}"]`).textContent = s.fmt(s.def); });
    changed();
  });

  // ---- 원본 비교 (누르고 있는 동안) ----
  const hold = on => { if (showOrig === on) return; showOrig = on; $('btnHold').classList.toggle('on', on); paint(); };
  [$('btnHold'), $('view')].forEach(el => {
    el.addEventListener('pointerdown', e => { if (e.button) return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} hold(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, () => hold(false)));
    el.addEventListener('contextmenu', e => e.preventDefault());
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, dialog[open]')) return;
    if (e.code === 'Space') { e.preventDefault(); hold(true); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && cur) {
      const ready = items.filter(x => x.state === 'ready'), i = ready.indexOf(cur);
      const n = ready[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) select(n);
    }
  });
  document.addEventListener('keyup', e => { if (e.code === 'Space') hold(false); });
  addEventListener('blur', () => hold(false));

  // ---- 빼기 ----
  $('btnRemove').addEventListener('click', () => {
    if (!cur) return;
    const i = items.indexOf(cur);
    URL.revokeObjectURL(cur.url);
    items.splice(i, 1);
    cur = null; curOrig = null; curFor = null; prepared = null;
    renderStrip();
    const n = items[Math.min(i, items.length - 1)];
    if (n) select(n); else { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); }
    updateUI();
  });

  // ---- 저장 ----
  const suffix = () => (preset() && preset().id === 'rubi' ? '_rubi' : '_tone');
  const baseName = n => n.replace(/\.[^.]+$/, '') || 'photo';

  async function render(it) {
    const img = await loadImg(it.url);
    const [w, h] = fit(it.w, it.h, Infinity, MAX_AREA);
    const c = draw(img, w, h);
    const x = c.getContext('2d', { willReadFrequently: true });
    const im = x.getImageData(0, 0, w, h);
    const lut = lutFor(it), d = im.data, step = 4 * 1500000;
    for (let o = 0; o < d.length; o += step) { E.applyLUT(d, d, lut, o, Math.min(d.length, o + step)); await tick(); }
    x.putImageData(im, 0, 0);
    const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', 0.92));
    free(c);
    return { file: new File([blob], baseName(it.name) + suffix() + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }), scaled: w < it.w };
  }

  let busy = false;
  async function save(list) {
    if (busy) return;
    list = list.filter(it => it.state === 'ready');
    if (!list.length) return;
    // 휴대폰에서 이미 만들어 둔 파일이 있으면 바로 공유 창 (공유는 누른 순간에만 열 수 있음)
    if (prepared && prepared.key === keyOf(list)) { await share(prepared.files); return; }
    busy = true; updateUI();
    const files = []; let scaled = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        setStatus(`저장 준비 중 ${i + 1}/${list.length}`);
        const r = await render(list[i]);
        files.push(r.file); if (r.scaled) scaled++;
      }
    } catch (e) {
      toast('저장하지 못했습니다. 사진 수를 줄여 다시 해 보세요'); busy = false; updateUI(); return;
    }
    busy = false;
    if (scaled) toast(`큰 사진 ${scaled}장은 1,600만 화소로 줄여 저장했습니다`, 4000);
    if (COARSE && canShare(files)) {
      prepared = { key: keyOf(list), files };
      updateUI();
      setStatus(`${files.length}장 준비됨. 저장 버튼을 한 번 더 누르면 공유 창이 열립니다`);
      // 바로 열어보고, 막히면 버튼을 한 번 더 누르게 함
      try { await navigator.share({ files }); prepared = null; updateUI(); } catch (e) { if (e.name === 'AbortError') { /* 닫음, 다시 누르면 열림 */ } }
      return;
    }
    if (files.length === 1) download(files[0]);
    else download(new File([await makeZip(files)], `rubi-tone-${stamp()}.zip`, { type: 'application/zip' }));
    updateUI();
  }
  const keyOf = list => optKey() + '#' + list.map(it => it.id).join(',');
  const canShare = files => { try { return !!(navigator.canShare && navigator.canShare({ files })); } catch (e) { return false; } };
  async function share(files) {
    try { await navigator.share({ files }); prepared = null; updateUI(); }
    catch (e) {
      if (e.name === 'AbortError') return;
      if (files.length === 1) download(files[0]); else download(new File([await makeZip(files)], `rubi-tone-${stamp()}.zip`, { type: 'application/zip' }));
      prepared = null; updateUI();
    }
  }
  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

  // 압축 없는(store) ZIP. JPG는 이미 압축되어 있어서 그대로 담음. 파일 이름은 UTF-8
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

  // ---- 기준 톤 만들기 ----
  const dlg = $('refDlg');
  let refData = [];   // { stats, thumb(dataURL 작은 것), big(미리보기 dataURL) }
  $('btnRef').addEventListener('click', () => {
    refData = []; $('refThumbs').innerHTML = ''; $('refCount').textContent = ''; $('btnRefMake').disabled = true;
    $('refName').value = ''; $('refName').placeholder = `예: 기준 톤 ${custom.length + 1}`;
    dlg.showModal();
  });
  $('btnRefPick').addEventListener('click', () => $('refIn').click());
  $('refIn').addEventListener('change', async e => {
    const files = [...e.target.files].filter(isImg).slice(0, 10); e.target.value = '';
    if (!files.length) return;
    $('btnRefMake').disabled = true; $('refCount').textContent = '분석 중…';
    refData = [];
    for (const f of files) {
      const u = URL.createObjectURL(f);
      try {
        const img = await loadImg(u);
        const [aw, ah] = fit(img.naturalWidth, img.naturalHeight, 512);
        const ac = draw(img, aw, ah);
        const stats = E.analyze(pixels(ac).data); free(ac);
        const [tw, th] = fit(img.naturalWidth, img.naturalHeight, 96);
        const tc = draw(img, tw, th); const thumb = tc.toDataURL('image/jpeg', 0.7); free(tc);
        const [bw, bh] = fit(img.naturalWidth, img.naturalHeight, 240);
        const bc = draw(img, bw, bh); const big = bc.toDataURL('image/jpeg', 0.8); free(bc);
        refData.push({ stats, thumb, big });
      } catch (err) { /* 못 읽는 사진은 건너뜀 */ }
      URL.revokeObjectURL(u);
      await tick();
    }
    $('refThumbs').innerHTML = refData.map(r => `<img src="${r.big}" alt="">`).join('');
    $('refCount').textContent = refData.length ? `${refData.length}장` : '읽을 수 있는 사진이 없습니다';
    $('btnRefMake').disabled = !refData.length;
  });
  $('btnRefMake').addEventListener('click', () => {
    if (!refData.length) return;
    const name = $('refName').value.trim() || `기준 톤 ${custom.length + 1}`;
    const p = { id: 'c' + Date.now().toString(36), name, note: `사진 ${refData.length}장 기준 · 이 브라우저`, profile: E.merge(refData.map(r => r.stats)), thumbs: refData.slice(0, 4).map(r => r.thumb) };
    custom.push(p);
    if (!lsSet(K_PRESETS, custom)) { p.thumbs = []; if (!lsSet(K_PRESETS, custom)) toast('브라우저 저장 공간이 부족해 이번 창에서만 쓸 수 있습니다', 4000); }
    selId = p.id; lsSet(K_SEL, selId);
    renderPresets(); changed();
    dlg.close();
    toast(`'${name}'을 만들었습니다`);
  });

  // ---- 파일 고르기·끌어 놓기 ----
  $('btnAdd').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) addFiles(f); });
  let dragN = 0;
  document.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; $('stage').classList.add('over'); $('drop').classList.add('over'); } });
  document.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('stage').classList.remove('over'); $('drop').classList.remove('over'); } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dragN = 0; $('stage').classList.remove('over'); $('drop').classList.remove('over');
    if (dlg.open) return;
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // ---- 화면 상태 ----
  let statusTimer = 0;
  function setStatus(t) { $('status').textContent = t; }
  function updateUI() {
    const ready = items.filter(it => it.state === 'ready');
    const has = items.length > 0;
    $('drop').hidden = has; $('view').hidden = !has; $('viewBar').hidden = !has;
    $('curName').textContent = cur ? `${cur.name} · ${cur.w}×${cur.h}` : '';
    const sa = $('btnSaveAll');
    sa.disabled = busy || !ready.length;
    const pAll = prepared && prepared.key === keyOf(ready);
    const pOne = prepared && cur && prepared.key === keyOf([cur]);
    sa.textContent = busy ? '만드는 중…' : pAll ? `공유 창 열기 (${ready.length}장)` : ready.length > 1 ? `전체 저장 (${ready.length}장)` : '전체 저장';
    const so = $('btnSaveOne');
    so.disabled = busy || !cur; so.textContent = pOne ? '공유 창 열기' : '이 사진 저장';
    $('btnRemove').disabled = busy;
    if (!busy && !(prepared)) {
      clearTimeout(statusTimer);
      const p = preset();
      setStatus(has ? `${ready.length}장 · ${p ? p.name : '기준 톤 없음'}${items.length > ready.length ? ' · 읽는 중' : ''}` : '사진을 올리면 고른 기준 톤으로 맞춰 보여줍니다');
    }
  }
  let toastTimer = 0;
  function toast(t, ms) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), ms || 2600); }

  renderPresets();
  updateUI();
})();
