// 상품 업로드: 이카운트 품목 ↔ 아임웹 두 사이트 SKU 비교, 미업로드 상품 검토, 초안(공식 사이트 + Claude), 아임웹 일괄 추가 엑셀·이미지 zip
// 서버: NAS 컨테이너 rubi-upload (nas/upload/upload.py), 연결 파일 nas/proxy/upload.php, 주소 config.js UPLOAD_API
(function () {
  'use strict';
  if (window.MR && !MR.requireLogin()) return;

  const CFG = window.MYRUBI_CONFIG || {};
  const SITES = { supply: '루비서플라이', workshop: '루비워크샵' };
  const ST = { new: '검토 대기', approved: '업로드', built: '엑셀 완료', hold: '보류', excluded: '제외', uploaded: '완료' };
  const TABS = [['new', '검토 대기'], ['approved', '업로드'], ['hold', '보류'], ['excluded', '제외'], ['uploaded', '완료']];
  const tabOf = s => (s === 'built' ? 'approved' : s || 'new');

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const won = n => (Number(n) || 0).toLocaleString('ko-KR');
  const when = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  let data = null, status = null, tab = 'new', sel = new Set(), poll = 0;
  const cats = {};   // site → [{code,name}]

  // ───────── 서버 ─────────
  const configured = () => !!CFG.UPLOAD_API;
  function endpoint(route, qs) {
    const u = CFG.UPLOAD_API + (CFG.UPLOAD_API.includes('?') ? '&' : '?') + 'r=' + route;
    return qs ? u + '&' + new URLSearchParams(qs).toString() : u;
  }
  async function api(route, opt) {
    opt = opt || {};
    const s = MR.session();
    let r;
    try {
      r = await fetch(endpoint(route, opt.qs), {
        method: opt.body ? 'POST' : (opt.method || 'GET'),
        headers: Object.assign({ 'X-MyRubi-Session': s ? s.token : '' }, opt.body ? { 'Content-Type': 'application/json' } : {}),
        body: opt.body ? JSON.stringify(opt.body) : undefined,
      });
    } catch (e) { throw new Error('NAS 상품 업로드 서비스에 연결할 수 없습니다'); }
    if (opt.blob) {
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || '파일을 받지 못했습니다'); }
      return r.blob();
    }
    let j; try { j = await r.json(); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다'); }
    if (!j.ok) {
      if (j.error === 'unauthorized') { MR.kick(); throw new Error('다시 로그인해 주세요'); }
      throw new Error(j.error || '오류');
    }
    return j;
  }

  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 3200);
  }

  // ───────── 불러오기 · 점검 ─────────
  async function load() {
    if (!configured()) return setup();
    try {
      [status, data] = await Promise.all([api('status'), api('families')]);
    } catch (e) {
      $('status').textContent = e.message;
      $('main').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      return;
    }
    renderConn();
    if (data.scan && data.scan.running) startPoll();
    render();
  }

  function setup() {
    $('status').textContent = 'NAS 서비스가 아직 연결되지 않았습니다';
    $('main').innerHTML = `<div class="setup"><h2>처음 한 번 설정</h2>
      <p>NAS에 상품 업로드 서비스(rubi-upload)를 띄우고, <code>config.js</code> 의 <code>UPLOAD_API</code> 에 연결 파일 주소를 넣으면 이 화면을 쓸 수 있습니다.
      설치 순서는 저장소의 <code>nas/upload/README.md</code> 에 있습니다.</p></div>`;
    ['btnScan', 'btnBuild', 'btnRequest'].forEach(id => { $(id).disabled = true; });
  }

  function renderConn() {
    const c = status || {};
    const parts = [];
    const cat = c.catalog || {};
    parts.push(cat.count ? `<span class="ok">이카운트 품목 ${won(cat.count)}개 · ${when(cat.at)} 기준</span>` : `<span class="no">${esc(cat.error || '이카운트 품목 목록 없음')}</span>`);
    Object.entries(c.sites || {}).forEach(([k, s]) => {
      parts.push(s.connected ? `<span class="ok">${esc(s.name)} 아임웹 연결됨</span>` : `<span class="no">${esc(s.name)} ${esc(s.error || '아임웹 토큰 없음')}</span>`);
    });
    parts.push(c.claude ? `<span class="ok">Claude 초안 ${esc(c.model || '')}</span>` : '<span class="no">Claude API 키 없음 (초안 만들기 불가)</span>');
    $('conn').innerHTML = parts.join('');
  }

  function statusLine() {
    if (!data) return;
    const sc = data.scan || {};
    if (sc.running) { $('status').innerHTML = `<span class="busy">점검 중 · ${esc(sc.msg || '')}</span>`; return; }
    if (sc.error) { $('status').textContent = sc.error; return; }
    if (!data.scanned) { $('status').textContent = '아직 점검하지 않았습니다. 다시 점검을 눌러 주세요'; return; }
    const n = data.families.filter(f => tabOf(f.status) === 'new').length;
    $('status').textContent = `${when(data.at)} 점검 · 미업로드 품목이 있는 상품 ${data.families.length}개, 검토 대기 ${n}개`;
  }

  async function scan() {
    try {
      const j = await api('scan', { body: {} });
      if (!j.started) toast('이미 점검 중입니다');
      startPoll();
    } catch (e) { toast(e.message); }
  }
  function startPoll() {
    clearInterval(poll);
    $('btnScan').disabled = true;
    poll = setInterval(async () => {
      try {
        data = await api('families');
        statusLine();
        if (!data.scan || !data.scan.running) {
          clearInterval(poll); $('btnScan').disabled = false;
          if (data.scan && data.scan.error) toast(data.scan.error, 6000);
          render();
        }
      } catch (e) { clearInterval(poll); $('btnScan').disabled = false; toast(e.message); }
    }, 2500);
    statusLine();
  }

  // ───────── 목록 ─────────
  function filtered() {
    if (!data || !data.scanned) return [];
    const b = $('fBrand').value, s = $('fSite').value, q = $('fQ').value.trim().toLowerCase();
    return data.families.filter(f => {
      if (tabOf(f.status) !== tab) return false;
      if (b && f.brand !== b) return false;
      if (s && !f.missing[s]) return false;
      if (q && !(f.base.toLowerCase().includes(q) || f.brandKo.toLowerCase().includes(q) || f.variants.some(v => v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)))) return false;
      return true;
    });
  }

  function render() {
    statusLine();
    // 탭
    const counts = {};
    (data && data.families || []).forEach(f => { const t = tabOf(f.status); counts[t] = (counts[t] || 0) + 1; });
    $('tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}<span class="n">${counts[k] || 0}</span></button>`).join('');
    // 브랜드 목록
    const bsel = $('fBrand'), cur = bsel.value;
    const brands = [...new Set((data && data.families || []).map(f => f.brand))].sort();
    bsel.innerHTML = '<option value="">모든 브랜드</option>' + brands.map(b => {
      const f = data.families.find(x => x.brand === b);
      return `<option value="${esc(b)}">${esc(f.brandKo || b)}</option>`;
    }).join('');
    bsel.value = brands.includes(cur) ? cur : '';

    const list = filtered();
    sel.forEach(k => { if (!list.some(f => f.key === k)) sel.delete(k); });
    selBar();
    if (!data || !data.scanned) { $('main').innerHTML = '<div class="empty">다시 점검을 누르면 이카운트 품목과 두 사이트 상품을 비교합니다</div>'; return; }
    if (!list.length) { $('main').innerHTML = `<div class="empty">${tab === 'new' ? '검토할 상품이 없습니다' : '해당하는 상품이 없습니다'}</div>`; return; }

    const groups = {};
    list.forEach(f => { (groups[f.brand] = groups[f.brand] || []).push(f); });
    const miss = (f, s) => {
      const n = f.missing[s], t = f.variants.length;
      if (!n) return '<span class="miss none">있음</span>';
      return `<span class="miss${f.partial && f.partial[s] ? ' part' : ''}" title="${f.partial && f.partial[s] ? '일부 옵션만 없음: 기존 상품에 옵션 추가' : '사이트에 없음'}"><b>${n}</b>/${t}${f.partial && f.partial[s] ? ' 옵션 추가' : ''}</span>`;
    };
    const rows = Object.entries(groups).map(([b, fs]) => {
      const allSel = fs.every(f => sel.has(f.key));
      return `<tr class="brand-h"><td class="ck"><input type="checkbox" data-brand="${esc(b)}" ${allSel ? 'checked' : ''} aria-label="${esc(fs[0].brandKo)} 전체 선택"></td>
        <td colspan="6">${esc(fs[0].brandKo || b)}<span class="small muted">${fs.length}개 상품</span></td></tr>` +
        fs.map(f => {
          const opts = f.variants.map(v => v.opt).filter(Boolean);
          const optTxt = opts.length ? opts.slice(0, 5).join(' · ') + (opts.length > 5 ? ` 외 ${opts.length - 5}` : '') : f.variants[0].code;
          return `<tr class="row" data-key="${f.key}">
            <td class="ck"><input type="checkbox" data-key="${f.key}" ${sel.has(f.key) ? 'checked' : ''} aria-label="선택"></td>
            <td><span class="nm">${esc(f.base)}</span><span class="opt">${esc(optTxt)}</span></td>
            <td class="num hide-s">${f.variants.length}</td>
            <td>${miss(f, 'supply')}</td>
            <td>${miss(f, 'workshop')}</td>
            <td><span class="tag ${f.status}">${ST[f.status] || f.status}</span>${f.note ? `<span class="opt">${esc(f.note)}</span>` : ''}</td>
            <td class="hide-s small muted">${f.hasDraft ? '초안 있음' : ''}${f.built && Object.keys(f.built).length ? '<br>' + Object.keys(f.built).map(s => SITES[s]).join(' · ') + ' 엑셀' : ''}</td>
          </tr>`;
        }).join('');
    }).join('');
    $('main').innerHTML = `<table class="up-tbl"><thead><tr><th class="ck"></th><th>상품 (이카운트 품목명)</th><th class="num hide-s">옵션</th><th>루비서플라이</th><th>루비워크샵</th><th>상태</th><th class="hide-s">초안</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function selBar() {
    $('selBar').hidden = !sel.size;
    $('selN').textContent = `${sel.size}개 선택`;
  }

  async function setStatus(keys, st) {
    try {
      const j = await api('review', { body: { keys, status: st } });
      data = Object.assign(data, j);
      sel.clear();
      render();
      toast(`${keys.length}개를 ${ST[st]}(으)로 옮겼습니다`);
    } catch (e) { toast(e.message); }
  }

  // ───────── 상품 상세 · 초안 ─────────
  const rowsTxt = rows => (rows || []).map(r => r.join(' | ')).join('\n');
  const txtRows = t => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('|');
    return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });

  let cur = null;   // { family, review, brand, draft }

  async function openItem(key) {
    const dlg = $('dlgItem');
    $('itemT').textContent = '불러오는 중…';
    $('itemBody').innerHTML = '<p class="busy">불러오는 중</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const j = await api('item', { qs: { key } });
      cur = { family: j.family, review: j.review || {}, brand: j.brand || {}, draft: (j.review || {}).draft || null };
      renderItem();
    } catch (e) { $('itemBody').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  function renderItem() {
    const f = cur.family, d = cur.draft, b = cur.brand;
    $('itemT').textContent = (b.ko || f.brand) + ' · ' + f.base;
    const partial = Object.keys(SITES).filter(s => f.partial && f.partial[s]);
    const vars = d ? d.variants : f.variants.map(v => ({ code: v.code, label: v.opt || v.code, include: !(v.on.supply && v.on.workshop), price: v.price }));
    const byCode = Object.fromEntries(f.variants.map(v => [v.code, v]));
    const st = cur.review.status || 'new';

    let h = '';
    if (partial.length) h += `<div class="warn">${partial.map(s => SITES[s]).join(', ')}에는 이 상품의 일부 옵션이 이미 있습니다. 새 상품으로 올리지 말고 기존 상품에 빠진 옵션을 더하는 쪽을 먼저 검토해 주세요. 사이트에 이미 있는 옵션은 처음부터 빼 두었습니다.</div>`;

    h += `<div class="sec"><div class="row-acts">
        <span class="tag ${st}">${ST[st]}</span>
        <button class="btn sm" data-set="approved" type="button">업로드</button>
        <button class="btn sm" data-set="hold" type="button">보류</button>
        <button class="btn sm" data-set="excluded" type="button">제외</button>
        <span class="sp"></span>
        <input id="iNote" type="text" placeholder="메모 (보류·제외 이유)" value="${esc(cur.review.note || '')}" style="height:28px;border:1px solid var(--line);padding:0 8px;font-size:13px;min-width:220px">
        <button class="btn sm ghost" id="iNoteSave" type="button">메모 저장</button>
      </div>${cur.review.by ? `<p class="hint">${esc(cur.review.by)} · ${when((cur.review.at || 0) * 1000)}</p>` : ''}</div>`;

    h += `<div class="sec"><h3>옵션 (이카운트 품목)</h3>
      <table class="vtbl"><thead><tr><th>넣기</th><th>품목코드</th><th>이카운트 품목명</th><th class="num">단가</th><th>서플라이</th><th>워크샵</th><th>옵션값 (사이트 표기)</th></tr></thead><tbody>` +
      vars.map((v, i) => {
        const o = byCode[v.code] || { on: {}, name: '' };
        return `<tr><td><input type="checkbox" data-vi="${i}" ${v.include !== false ? 'checked' : ''}></td><td>${esc(v.code)}</td><td class="small">${esc(o.name)}</td>
          <td class="num">${won(v.price)}</td><td class="${o.on.supply ? 'on' : 'off'}">${o.on.supply ? '있음' : '없음'}</td><td class="${o.on.workshop ? 'on' : 'off'}">${o.on.workshop ? '있음' : '없음'}</td>
          <td><input type="text" data-vl="${i}" value="${esc(v.label)}"></td></tr>`;
      }).join('') + `</tbody></table><p class="hint">체크한 옵션만 엑셀에 들어갑니다. 재고는 엑셀을 만들 때 이카운트 ${esc(CFG.MAIN_WH || 'RLD')} 창고 수량을 넣습니다.</p></div>`;

    h += `<div class="sec"><h3>공식 페이지</h3>
      <div class="src" id="srcList"><span class="busy">공식 사이트에서 비슷한 제품을 찾는 중</span></div>
      <div class="row-acts"><input id="iUrl" type="url" placeholder="https://… 제품 페이지 주소" value="${esc(d && d.source ? d.source.url : '')}" style="flex:1;min-width:240px;height:36px;border:1px solid var(--line);padding:0 10px;font-size:14px">
      <button class="btn ${d ? '' : 'pri'}" id="iDraft" type="button">${d ? '초안 다시 만들기' : '초안 만들기'}</button></div>
      <p class="hint">공식 페이지를 읽고 Claude가 아코디언 문구, 스펙, 옵션 표기, 대표 이미지 후보를 채웁니다. 1분 안팎 걸립니다.${b.site ? '' : ' 이 브랜드는 공식 사이트가 등록되어 있지 않아 주소를 직접 넣어야 합니다 (아래 브랜드 정보에 등록하면 다음부터 자동으로 찾습니다).'}</p></div>`;

    if (d) {
      h += `<div class="sec"><h3>초안</h3>
        <div class="grid2">
          <label class="fld"><span>사이트 상품명</span><input id="dName" value="${esc(d.name)}"></label>
          <label class="fld"><span>필수 옵션명 (옵션이 하나면 비움)</span><input id="dOpt" value="${esc(d.optName)}"></label>
          <label class="fld"><span>영문 제목 (제품 특징 h3)</span><input id="dEn" value="${esc(d.en)}"></label>
          <label class="fld"><span>한글 부제</span><input id="dKo" value="${esc(d.ko)}"></label>
        </div>
        <label class="fld"><span>제품 요약</span><textarea id="dSum">${esc(d.summary)}</textarea></label>
        <label class="fld"><span>스펙 표 (한 줄에 <code>항목 | 내용</code>)</span><textarea id="dSpecs" class="tall">${esc(rowsTxt(d.specs))}</textarea></label>
        <label class="fld"><span>제품 특징 (한 줄에 <code>짧은 제목. | 설명</code>)</span><textarea id="dFeat" class="tall">${esc(rowsTxt(d.features))}</textarea></label>
        <label class="fld"><span>장착 및 호환성 안내 (한 줄에 <code>항목 | 내용</code>)</span><textarea id="dInst" class="tall">${esc(rowsTxt(d.install))}</textarea></label>
        <label class="fld"><span>주석 (※ 다음 문장)</span><input id="dNote" value="${esc(d.note)}"></label>
        <div class="grid3">
          <label class="fld"><span>판매가 (원, 옵션은 이카운트 단가)</span><input id="dPrice" type="number" value="${esc(d.price)}"></label>
          <label class="fld"><span>무게 (kg)</span><input id="dWeight" type="number" step="0.01" value="${esc(d.weight)}"></label>
          <label class="fld"><span>이미지 파일명 (비우면 자동)</span><input id="dImgSlug" value="${esc(d.imgSlug || '')}" placeholder="예: bsa-bottom-bracket"></label>
        </div>
        <div class="grid2">
          <label class="fld"><span>루비서플라이 카테고리ID</span><input id="dCatS" list="catList_supply" value="${esc((d.cats || {}).supply || '')}" placeholder="예: CATE384 (여러 개는 쉼표)"></label>
          <label class="fld"><span>루비워크샵 카테고리ID</span><input id="dCatW" list="catList_workshop" value="${esc((d.cats || {}).workshop || '')}" placeholder="예: CATE120"></label>
        </div>
        <datalist id="catList_supply"></datalist><datalist id="catList_workshop"></datalist>
        <p class="hint">출처: <a href="${esc(d.source && d.source.url)}" target="_blank" rel="noopener">${esc(d.source && d.source.title)}</a> · ${esc(d.model || '')}</p></div>`;

      h += `<div class="sec"><h3>대표 이미지</h3><div class="imgs" id="imgs">` +
        (d.images || []).map((im, i) => `<button type="button" data-img="${i}" aria-pressed="${im.src === d.image}" title="${esc(im.alt)}"><img src="${esc(im.src)}" alt="" loading="lazy"></button>`).join('') +
        `</div><div class="row-acts" style="margin-top:10px">
          <input id="dImg" type="url" value="${esc(d.image)}" placeholder="이미지 주소를 직접 넣을 수도 있습니다" style="flex:1;min-width:240px;height:32px;border:1px solid var(--line);padding:0 10px;font-size:13px">
          <label class="small"><input type="checkbox" id="dTrim" ${d.trimCaption !== false ? 'checked' : ''}> 제품 아래 설명 문구 지우기</label></div>
        <p class="hint">엑셀을 만들 때 1000×1000 흰 배경, 사방 10% 여백, 가운데 정렬로 바꿉니다.</p></div>`;
    }

    h += `<details class="sec"><summary class="small">브랜드 정보 · ${esc(b.ko || f.brand)}</summary><div style="margin-top:12px">
      <div class="grid3">
        <label class="fld"><span>한글 표기</span><input id="bKo" value="${esc(b.ko || '')}"></label>
        <label class="fld"><span>영문 표기</span><input id="bEn" value="${esc(b.en || '')}"></label>
        <label class="fld"><span>파일명용 영문 (소문자)</span><input id="bSlug" value="${esc(b.slug || '')}"></label>
        <label class="fld"><span>공식 사이트</span><input id="bSite" value="${esc(b.site || '')}" placeholder="https://…"></label>
        <label class="fld"><span>사이트 방식</span><select id="bPlat"><option value="">일반 (주소 직접 입력)</option><option value="shopify" ${b.platform === 'shopify' ? 'selected' : ''}>쇼피파이 (제품 자동 찾기)</option></select></label>
        <label class="fld"><span>원산지</span><input id="bOrigin" value="${esc(b.origin || '')}"></label>
        <label class="fld"><span>제조사 (띄어쓰기 없이)</span><input id="bMaker" value="${esc(b.maker || '')}"></label>
        <label class="fld"><span>기본 카테고리 · 서플라이</span><input id="bCatS" list="catList_supply" value="${esc((b.cats || {}).supply || '')}"></label>
        <label class="fld"><span>기본 카테고리 · 워크샵</span><input id="bCatW" list="catList_workshop" value="${esc((b.cats || {}).workshop || '')}"></label>
      </div>
      <label class="fld"><span>브랜드 이야기 (모든 상품 아코디언에 들어감)</span><textarea id="bStory">${esc(b.story || (d && d.brandStory) || '')}</textarea></label>
    </div></details>`;

    h += `<div class="row-acts"><span class="sp"></span><button class="btn" type="button" data-close>닫기</button><button class="btn pri" id="iSave" type="button">저장</button></div>`;
    $('itemBody').innerHTML = h;

    loadSources();
    loadCats();
  }

  async function loadSources() {
    const box = $('srcList');
    try {
      const j = await api('sources', { qs: { key: cur.family.key } });
      const curUrl = $('iUrl').value;
      if (!j.items.length) { box.innerHTML = '<span class="small muted">자동으로 찾은 후보가 없습니다. 주소를 직접 넣어 주세요.</span>'; return; }
      box.innerHTML = j.items.map((s, i) => `<label><input type="radio" name="src" value="${esc(s.url)}" ${(curUrl ? s.url === curUrl : i === 0) ? 'checked' : ''}> ${esc(s.title)} <a href="${esc(s.url)}" target="_blank" rel="noopener">열기</a></label>`).join('');
      if (!curUrl) $('iUrl').value = j.items[0].url;
    } catch (e) { box.innerHTML = `<span class="small muted">${esc(e.message)}</span>`; }
  }

  async function loadCats() {
    for (const s of Object.keys(SITES)) {
      if (!cats[s]) { try { cats[s] = (await api('categories', { qs: { site: s } })).items; } catch (e) { cats[s] = []; } }
      const dl = $('catList_' + s);
      if (dl) dl.innerHTML = cats[s].map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
    }
  }

  function collect() {
    const f = cur.family, d = cur.draft;
    const vars = (d ? d.variants : f.variants.map(v => ({ code: v.code, label: v.opt || v.code, include: true, price: v.price }))).map((v, i) => Object.assign({}, v, {
      include: !!(document.querySelector(`[data-vi="${i}"]`) || {}).checked,
      label: ((document.querySelector(`[data-vl="${i}"]`) || {}).value || v.label).trim(),
    }));
    const brandInfo = {
      ko: $('bKo').value.trim(), en: $('bEn').value.trim(), slug: $('bSlug').value.trim(), site: $('bSite').value.trim(),
      platform: $('bPlat').value, origin: $('bOrigin').value.trim(), maker: $('bMaker').value.trim(), story: $('bStory').value.trim(),
      cats: { supply: $('bCatS').value.trim(), workshop: $('bCatW').value.trim() },
    };
    if (!d) return { draft: null, brandInfo, variants: vars };
    const draft = Object.assign({}, d, {
      name: $('dName').value.trim(), optName: $('dOpt').value.trim(), en: $('dEn').value.trim(), ko: $('dKo').value.trim(),
      summary: $('dSum').value.trim(), specs: txtRows($('dSpecs').value), features: txtRows($('dFeat').value), install: txtRows($('dInst').value),
      note: $('dNote').value.trim(), price: Number($('dPrice').value) || 0, weight: Number($('dWeight').value) || 0.1,
      imgSlug: $('dImgSlug').value.trim(), cats: { supply: $('dCatS').value.trim(), workshop: $('dCatW').value.trim() },
      image: $('dImg').value.trim(), trimCaption: $('dTrim').checked, variants: vars,
    });
    return { draft, brandInfo, variants: vars };
  }

  async function saveItem(silent) {
    const c = collect();
    if (!c.draft) {
      // 초안이 없으면 브랜드 정보만 저장
      await api('save', { body: { key: cur.family.key, draft: { variants: c.variants, pending: true }, brand: cur.family.brand, brandInfo: c.brandInfo } });
      cur.brand = Object.assign({}, cur.brand, c.brandInfo);
      if (!silent) toast('브랜드 정보를 저장했습니다');
      return;
    }
    await api('save', { body: { key: cur.family.key, draft: c.draft, brand: cur.family.brand, brandInfo: c.brandInfo } });
    cur.draft = c.draft;
    cur.brand = Object.assign({}, cur.brand, c.brandInfo);
    if (!silent) toast('저장했습니다');
  }

  async function makeDraft() {
    const url = $('iUrl').value.trim();
    if (!/^https?:\/\//.test(url)) { toast('공식 페이지 주소를 넣어 주세요'); return; }
    if (cur.draft && !confirm('지금 초안을 새 초안으로 바꿉니다. 고친 내용은 사라집니다. 계속할까요?')) return;
    const btn = $('iDraft');
    btn.disabled = true; btn.innerHTML = '<span class="busy">공식 페이지를 읽고 쓰는 중</span>';
    try {
      // 브랜드 정보를 먼저 저장해 두면 새 브랜드도 이야기·표기를 바로 씀
      try { await saveItem(true); } catch (e) {}
      const j = await api('draft', { body: { key: cur.family.key, url } });
      cur.draft = j.draft;
      cur.review.status = 'approved';
      renderItem();
      toast('초안을 만들었습니다. 내용을 확인하고 저장해 주세요', 5000);
      refreshList();
    } catch (e) {
      toast(e.message, 6000);
      btn.disabled = false; btn.textContent = cur.draft ? '초안 다시 만들기' : '초안 만들기';
    }
  }

  async function refreshList() {
    try { data = Object.assign(data || {}, await api('families')); render(); } catch (e) {}
  }

  // ───────── 엑셀 만들기 ─────────
  function openBuild() {
    if (!data || !data.scanned) { toast('먼저 점검해 주세요'); return; }
    const ready = data.families.filter(f => ['approved', 'built'].includes(f.status) && f.hasDraft);
    const notReady = data.families.filter(f => f.status === 'approved' && !f.hasDraft);
    let h = '';
    if (!ready.length) h = '<p class="small muted">초안까지 만든 업로드 상품이 없습니다. 검토 목록에서 상품을 열어 초안을 만들어 주세요.</p>';
    else {
      h += `<div class="sec"><div class="seg" id="bSite" role="tablist">${Object.entries(SITES).map(([k, v], i) => `<button type="button" data-site="${k}" aria-selected="${i === 0}">${v}</button>`).join('')}</div>
        <p class="hint" id="bHint"></p></div>
        <div class="sec"><table class="vtbl"><thead><tr><th></th><th>상품</th><th>옵션</th><th>엑셀</th></tr></thead><tbody id="bRows"></tbody></table></div>`;
      if (notReady.length) h += `<p class="hint">초안이 없는 업로드 상품 ${notReady.length}개는 목록에 없습니다.</p>`;
      h += `<div class="row-acts"><span class="sp"></span><button class="btn" type="button" data-close>닫기</button><button class="btn pri" id="bGo" type="button">엑셀과 이미지 만들기</button></div><div id="bOut"></div>`;
    }
    $('buildBody').innerHTML = h;
    $('dlgBuild').showModal();
    if (!ready.length) return;
    let site = 'supply';
    const draw = () => {
      $('bHint').textContent = site === 'supply'
        ? 'v5 아코디언(요약설명), 배송 안내(상세정보), 과세상품, 적립금 원, 할인 회원·% 단위, 배송방법 줄바꿈으로 만듭니다.'
        : 'v6 아코디언(요약설명, 끝에 제품 상담·워런티), 과세상품, 배송방법 줄바꿈으로 만듭니다.';
      $('bRows').innerHTML = ready.map(f => {
        const need = f.missing[site] > 0 && !(f.partial && f.partial[site]);
        const done = f.built && f.built[site];
        return `<tr><td><input type="checkbox" data-bk="${f.key}" ${need && !done ? 'checked' : ''}></td><td>${esc(f.brandKo)} · ${esc(f.base)}</td>
          <td class="small">${f.missing[site] ? `${f.missing[site]}/${f.variants.length} 없음${f.partial && f.partial[site] ? ' · 옵션 추가 대상' : ''}` : '사이트에 있음'}</td>
          <td class="small muted">${done ? when(done.at * 1000) + ' 만듦' : ''}</td></tr>`;
      }).join('');
    };
    draw();
    $('bSite').addEventListener('click', e => {
      const b = e.target.closest('[data-site]'); if (!b) return;
      site = b.dataset.site;
      $('bSite').querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b));
      draw();
    });
    $('bGo').addEventListener('click', async () => {
      const keys = [...document.querySelectorAll('[data-bk]:checked')].map(x => x.dataset.bk);
      if (!keys.length) { toast('상품을 골라 주세요'); return; }
      const go = $('bGo');
      go.disabled = true; go.innerHTML = `<span class="busy">이미지와 재고를 정리하는 중 (${keys.length}개)</span>`;
      $('bOut').innerHTML = '';
      try {
        const j = await api('build', { body: { site, keys } });
        const blob = await api('file', { qs: { id: j.id }, blob: true });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = j.file;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        $('bOut').innerHTML = `<div class="warn" style="margin-top:14px">${esc(SITES[site])} 엑셀과 대표 이미지 ${j.count}개를 <b>${esc(j.file)}</b> 로 내려받았습니다. 아임웹 관리자 → 상품 → 일괄 추가에서 엑셀과 images 폴더의 이미지를 함께 올려 주세요.` +
          (j.notes && j.notes.length ? '<br><br>' + j.notes.map(esc).join('<br>') : '') + '</div>';
        refreshList();
      } catch (e) { $('bOut').innerHTML = `<div class="err" style="margin-top:14px">${esc(e.message)}</div>`; }
      go.disabled = false; go.textContent = '엑셀과 이미지 만들기';
    });
  }

  // ───────── 검토 요청 (체크리스트) ─────────
  function openRequest() {
    if (!data || !data.scanned) { toast('먼저 점검해 주세요'); return; }
    const pend = data.families.filter(f => tabOf(f.status) === 'new' && (!$('fBrand').value || f.brand === $('fBrand').value));
    if (!pend.length) { toast('검토 대기 상품이 없습니다'); return; }
    const byBrand = {};
    pend.forEach(f => { byBrand[f.brandKo || f.brand] = (byBrand[f.brandKo || f.brand] || 0) + 1; });
    const text = '상품 업로드 검토: ' + Object.entries(byBrand).map(([b, n]) => `${b} ${n}건`).join(', ');
    const members = (CFG.MEMBERS || []);
    $('reqBody').innerHTML = `<div class="sec"><p class="small">검토 대기 상품 ${pend.length}개를 담당자 체크리스트에 한 줄로 넣습니다. 항목을 누르면 이 화면으로 옵니다.</p>
      <label class="fld"><span>담당자</span><select id="rWho">${members.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
      <label class="fld"><span>체크리스트 내용</span><input id="rText" value="${esc(text.slice(0, 190))}"></label>
      <label class="fld"><span>기한 (선택)</span><input id="rDue" type="date"></label></div>
      <div class="row-acts"><span class="sp"></span><button class="btn" type="button" data-close>닫기</button><button class="btn pri" id="rGo" type="button">체크리스트에 넣기</button></div>`;
    $('dlgReq').showModal();
    $('rGo').addEventListener('click', async () => {
      const btn = $('rGo'); btn.disabled = true;
      try {
        await MR.post({ action: 'check', op: 'add', owners: [$('rWho').value], owner: $('rWho').value, text: $('rText').value.trim(), repeat: 'once', order: 0, project: '', due: $('rDue').value, link: location.origin + '/upload/' });
        $('dlgReq').close();
        toast(`${$('rWho').value}님 체크리스트에 넣었습니다`);
      } catch (e) { toast(e.message, 5000); btn.disabled = false; }
    });
  }

  // ───────── 이벤트 ─────────
  $('btnScan').addEventListener('click', scan);
  $('btnBuild').addEventListener('click', openBuild);
  $('btnRequest').addEventListener('click', openRequest);
  ['fBrand', 'fSite'].forEach(id => $(id).addEventListener('change', render));
  $('fQ').addEventListener('input', () => { clearTimeout(render.t); render.t = setTimeout(render, 150); });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; sel.clear(); render(); } });
  $('selClear').addEventListener('click', () => { sel.clear(); render(); });
  $('selBar').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) setStatus([...sel], b.dataset.st); });
  $('main').addEventListener('click', e => {
    const ck = e.target.closest('input[type="checkbox"]');
    if (ck) {
      if (ck.dataset.key) { ck.checked ? sel.add(ck.dataset.key) : sel.delete(ck.dataset.key); selBar(); }
      else if (ck.dataset.brand) { filtered().filter(f => f.brand === ck.dataset.brand).forEach(f => ck.checked ? sel.add(f.key) : sel.delete(f.key)); render(); }
      return;
    }
    const tr = e.target.closest('tr.row');
    if (tr) openItem(tr.dataset.key);
  });
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) d.close();
  }));
  $('itemBody').addEventListener('click', async e => {
    const set = e.target.closest('[data-set]');
    if (set) {
      try { const j = await api('review', { body: { keys: [cur.family.key], status: set.dataset.set, note: $('iNote').value } }); data = Object.assign(data, j); cur.review.status = set.dataset.set; render(); renderItem(); toast(ST[set.dataset.set] + '(으)로 옮겼습니다'); }
      catch (err) { toast(err.message); }
      return;
    }
    if (e.target.id === 'iNoteSave') {
      try { const j = await api('review', { body: { keys: [cur.family.key], status: cur.review.status || 'new', note: $('iNote').value } }); data = Object.assign(data, j); render(); toast('메모를 저장했습니다'); }
      catch (err) { toast(err.message); }
      return;
    }
    if (e.target.id === 'iDraft') { makeDraft(); return; }
    if (e.target.id === 'iSave') { try { await saveItem(); refreshList(); } catch (err) { toast(err.message); } return; }
    const im = e.target.closest('[data-img]');
    if (im && cur.draft) {
      const src = cur.draft.images[Number(im.dataset.img)].src;
      $('dImg').value = src;
      $('imgs').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === im));
    }
  });
  $('itemBody').addEventListener('change', e => {
    if (e.target.name === 'src') $('iUrl').value = e.target.value;
  });

  load();
})();
