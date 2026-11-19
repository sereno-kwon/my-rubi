// 아코디언 V6: 아임웹 상품 상세 아코디언 코드 만들기
// 출력은 v5 클래스 체계(rb-sum · rb-summary · rb-arrow · rb-body) + 인라인 CSS, 끝에 v6 연결 항목(제품 상담 · 워런티)
// 글자 크기: 아코디언 제목 15px, 내용 14px, 주석 13px (12px 미만 없음). 굵기 400, 서체는 사이트 서체를 그대로 받음(inherit)
// +/× 아이콘은 사이트 CSS 몫이라 코드에 넣지 않음 (rb-arrow 빈 칸만 둠)
(function () {
  'use strict';
  if (window.MR && !MR.requireLogin()) return;

  const CONSULT_URL = 'https://ai.rubiworkshop.com/';
  const WARRANTY_URL = 'https://rubisupply.com/warranty';
  const K_CUR = 'myrubi.acc.current', K_DRAFTS = 'myrubi.acc.drafts';

  // 인라인 스타일 (아임웹 사이트 톤: 흰 바탕, 1px 회색 선, 굵기 400)
  const S = {
    wrap: 'margin:0;padding:0;border-bottom:1px solid #e3e3e3;font-family:inherit;font-weight:400;letter-spacing:-0.3px;text-align:left;',
    det: 'margin:0;padding:0;border-top:1px solid #e3e3e3;',
    sum: 'display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0;padding:18px 0;list-style:none;cursor:pointer;font-size:15px;line-height:22px;font-weight:400;color:#101114;',
    arrow: 'flex:0 0 auto;',
    body: 'margin:0;padding:0 0 22px;font-size:14px;line-height:23px;font-weight:400;color:#4a4b4f;word-break:keep-all;overflow-wrap:break-word;',
    p: 'margin:0 0 12px;',
    ul: 'margin:0 0 12px;padding:0 0 0 18px;',
    li: 'margin:0 0 4px;',
    table: 'width:100%;margin:0 0 12px;border-collapse:collapse;border-top:1px solid #eeeeee;',
    th: 'width:34%;padding:9px 12px 9px 0;border-bottom:1px solid #eeeeee;text-align:left;vertical-align:top;font-size:14px;line-height:21px;font-weight:400;color:#6e6f73;',
    td: 'padding:9px 0;border-bottom:1px solid #eeeeee;text-align:left;vertical-align:top;font-size:14px;line-height:21px;font-weight:400;color:#101114;',
    note: 'margin:0 0 12px;font-size:13px;line-height:20px;color:#8a8b8f;',
    a: 'color:#101114;text-decoration:underline;text-underline-offset:3px;',
    btn: 'display:inline-block;margin:4px 0 0;padding:10px 16px;border:1px solid #101114;color:#101114;background:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:400;'
  };

  // 항목 구성 프리셋 (내용은 예시 문법만)
  const PRESETS = [
    { name: '부품', items: [
      ['제품 소개', '제품을 한두 문단으로 소개합니다.\n\n브랜드와 제작 방식, 이 제품만의 이유를 적습니다.'],
      ['주요 특징', '- 특징 하나\n- 특징 둘\n- 특징 셋'],
      ['스펙', '소재 | \n무게 | \n규격 | \n색상 | \n원산지 | '],
      ['호환 정보', '- 호환되는 규격\n\n※ 호환이 애매하면 제품 상담에서 먼저 확인해 주세요.'],
      ['구성품', '- 본체\n- 설명서']
    ] },
    { name: '자전거 · 프레임셋', items: [
      ['제품 소개', '모델을 한두 문단으로 소개합니다.'],
      ['주요 특징', '- 특징 하나\n- 특징 둘'],
      ['스펙', '프레임 | \n포크 | \n헤드셋 | \nBB | \n휠 사이즈 | \n타이어 클리어런스 | \n무게 | '],
      ['사이즈 · 지오메트리', '사이즈 | 권장 신장\nS | \nM | \nL | \n\n※ 정확한 사이즈는 쇼룸 피팅 또는 제품 상담에서 안내해 드립니다.'],
      ['구성', '- 프레임\n- 포크\n- 헤드셋']
    ] },
    { name: '슈즈', items: [
      ['제품 소개', '모델을 한두 문단으로 소개합니다.'],
      ['주요 특징', '- 아웃솔\n- 다이얼\n- 어퍼'],
      ['스펙', '아웃솔 | \n클리트 | \n클로저 | \n무게 | '],
      ['사이즈 가이드', 'EU | 발 길이(mm)\n40 | \n41 | \n42 | \n\n※ 발볼이 넓으면 반 사이즈 크게 권해 드립니다.'],
      ['소재와 관리', '- 관리 방법']
    ] },
    { name: '식품 · 요헤미티', items: [
      ['제품 소개', '제품을 한두 문단으로 소개합니다.'],
      ['섭취 방법', '- 언제\n- 얼마나'],
      ['영양 정보', '열량 | \n탄수화물 | \n나트륨 | \n카페인 | '],
      ['보관 방법', '- 직사광선을 피해 서늘한 곳에 보관\n\n※ 식품은 개봉 후 교환·반품이 어렵습니다.']
    ] },
    { name: '빈 항목 1개', items: [['', '']] }
  ];

  const DEF = () => ({
    brand: '', name: '',
    items: [],
    consult: { on: true, title: '제품 상담', text: '사이즈, 호환, 다른 제품과의 조합이 궁금하시면 AI 제품 상담에서 바로 물어보실 수 있습니다. 루비워크샵 모델·스펙 자료로 답하며, 필요하면 직원 상담으로 이어집니다.', label: 'AI 제품 상담 열기', url: CONSULT_URL },
    warranty: { on: true, title: '워런티', text: '제조사 공식 워런티 기준으로 보증합니다. 브랜드별 보증 기간과 범위, 접수 방법은 워런티 페이지에서 확인하실 수 있습니다.', label: '워런티 확인하기', url: WARRANTY_URL }
  });

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let uid = 0;
  const mk = (title, body, open) => ({ id: 'i' + (++uid), title: title || '', body: body || '', open: !!open });

  let st = normalize(store.get(K_CUR, null)) || DEF();
  let openAll = false;

  function normalize(s) {
    if (!s || typeof s !== 'object') return null;
    const d = DEF();
    return {
      brand: s.brand || '', name: s.name || '',
      items: Array.isArray(s.items) ? s.items.map(it => mk(it.title, it.body, it.open)) : [],
      consult: Object.assign(d.consult, s.consult || {}),
      warranty: Object.assign(d.warranty, s.warranty || {})
    };
  }

  // ───────── 내용 문법 → HTML ─────────
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }
  function link(href, text) {
    return `<a href="${esc(href)}" target="_blank" rel="noopener" style="${S.a}">${text}</a>`;
  }
  // 줄 안: [글자](주소), 맨 주소
  function inline(s) {
    const out = [];
    let rest = String(s), m;
    const re = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/i;
    while ((m = re.exec(rest))) {
      out.push(esc(rest.slice(0, m.index)));
      if (m[1]) { const u = safeUrl(m[2]); out.push(u ? link(u, esc(m[1])) : esc(m[0])); }
      else { const u = safeUrl(m[3]); out.push(u ? link(u, esc(m[3])) : esc(m[3])); }
      rest = rest.slice(m.index + m[0].length);
    }
    out.push(esc(rest));
    return out.join('');
  }

  const RE_LI = /^\s*[-•·]\s+(.*)$/;
  const RE_NOTE = /^\s*(※.*|\*\s+.*)$/;
  function rowOf(line) {
    let m = line.match(/^([^\t|]+?)\s*(?:\t|\s\|\s?|\|)\s*(.*)$/);
    if (m && m[1].trim()) return { k: m[1].trim(), v: m[2].trim(), strong: true };
    m = line.match(/^([^:：]{1,16}?)\s*[:：]\s+(.+)$/);
    if (m && !/[.?!]$/.test(m[1]) && m[1].trim().split(/\s+/).length <= 3) return { k: m[1].trim(), v: m[2].trim(), strong: false };
    return null;
  }

  // 줄을 종류별로 묶음: p(문단) li(목록) row(표) note(주석)
  function blocks(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = [];
    let cur = null;
    const push = (t, v) => {
      if (!cur || cur.t !== t) { cur = { t, v: [] }; out.push(cur); }
      cur.v.push(v);
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { cur = null; continue; }
      let m;
      if ((m = line.match(RE_LI))) push('li', m[1]);
      else if (RE_NOTE.test(line)) push('note', line.trim().replace(/^\*\s+/, ''));
      else { const r = rowOf(line.trim()); if (r) push('row', r); else push('p', line.trim()); }
    }
    // 콜론 방식 표는 2줄 이상일 때만 표로, 아니면 문단으로 되돌림
    return out.map(b => (b.t === 'row' && b.v.length < 2 && !b.v[0].strong) ? { t: 'p', v: [b.v[0].k + ': ' + b.v[0].v] } : b);
  }

  function bodyHtml(src, pad) {
    const bs = blocks(src);
    const html = bs.map((b, i) => {
      const last = i === bs.length - 1;
      const mb = st => last ? st.replace(/margin:0 0 12px;/, 'margin:0;') : st;
      if (b.t === 'li') return `${pad}<ul style="${mb(S.ul)}">\n` + b.v.map((x, j) => `${pad}  <li style="${j === b.v.length - 1 ? 'margin:0;' : S.li}">${inline(x)}</li>`).join('\n') + `\n${pad}</ul>`;
      if (b.t === 'row') return `${pad}<table style="${mb(S.table)}">\n${pad}  <tbody>\n` + b.v.map(r => `${pad}    <tr><th scope="row" style="${S.th}">${inline(r.k)}</th><td style="${S.td}">${inline(r.v) || '&nbsp;'}</td></tr>`).join('\n') + `\n${pad}  </tbody>\n${pad}</table>`;
      if (b.t === 'note') return `${pad}<p style="${mb(S.note)}">${b.v.map(inline).join('<br>')}</p>`;
      return `${pad}<p style="${mb(S.p)}">${b.v.map(inline).join('<br>')}</p>`;
    });
    return html.join('\n');
  }

  function item(title, inner, open) {
    return `  <details class="rb-sum" style="${S.det}"${open ? ' open' : ''}>\n` +
      `    <summary class="rb-summary" style="${S.sum}">${esc(title)}<span class="rb-arrow" style="${S.arrow}"></span></summary>\n` +
      `    <div class="rb-body" style="${S.body}">\n${inner}\n    </div>\n  </details>`;
  }

  function fixedItem(f) {
    const u = safeUrl(f.url);
    let text = f.text.trim() ? bodyHtml(f.text, '      ') : '';
    const at = text.lastIndexOf('margin:0;');   // 마지막 블록과 버튼 사이 간격
    if (at >= 0) text = text.slice(0, at) + 'margin:0 0 14px;' + text.slice(at + 9);
    const btn = u ? `      <a href="${esc(u)}" target="_blank" rel="noopener" style="${S.btn}">${esc(f.label || u)}</a>` : '';
    return item(f.title || '', [text, btn].filter(Boolean).join('\n'), false);
  }

  function build(forPreview) {
    const parts = [];
    st.items.forEach(it => {
      if (!it.title.trim() && !it.body.trim()) return;
      parts.push(item(it.title.trim() || '제목 없음', bodyHtml(it.body, '      ') || '      <p style="margin:0;">&nbsp;</p>', it.open || (forPreview && openAll)));
    });
    if (st.consult.on) parts.push(fixedItem(st.consult));
    if (st.warranty.on) parts.push(fixedItem(st.warranty));
    const label = [st.brand, st.name].map(s => s.trim()).filter(Boolean).join(' ');
    let html = `<!-- Rubi accordion v6${label ? ' · ' + label.replace(/--/g, '-') : ''} -->\n<div class="rb-acc" style="${S.wrap}">\n${parts.join('\n')}\n</div>`;
    if (forPreview && openAll) html = html.replace(/<details class="rb-sum" style="([^"]*)">/g, '<details class="rb-sum" style="$1" open>');
    return html;
  }

  // ───────── 미리보기 ─────────
  const PV_CSS = `
    html,body{margin:0;background:#fff}
    body{padding:28px 24px;font-family:"Pretendard","S-Core Dream","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;color:#101114;-webkit-font-smoothing:antialiased}
    summary::-webkit-details-marker{display:none}
    .rb-arrow{position:relative;width:12px;height:12px}
    .rb-arrow::before,.rb-arrow::after{content:"";position:absolute;left:0;top:5.5px;width:12px;height:1px;background:#101114;transition:transform .2s}
    .rb-arrow::after{transform:rotate(90deg)}
    details[open] .rb-arrow::before{transform:rotate(45deg)}
    details[open] .rb-arrow::after{transform:rotate(135deg)}
    @media(max-width:480px){body{padding:20px 16px}}`;
  let pvTimer = 0;
  function preview() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const html = build(true);
      const f = $('pv');
      const y = (() => { try { return f.contentWindow.scrollY; } catch (e) { return 0; } })();
      f.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PV_CSS}</style></head><body>${html}</body></html>`;
      f.onload = () => { try { f.contentWindow.scrollTo(0, y); } catch (e) {} };
      const code = build(false);
      $('code').value = code;
      const n = st.items.filter(it => it.title.trim() || it.body.trim()).length + (st.consult.on ? 1 : 0) + (st.warranty.on ? 1 : 0);
      $('codeInfo').textContent = `항목 ${n}개 · ${code.length.toLocaleString()}자`;
      $('status').textContent = n ? `항목 ${n}개. 코드 복사 후 아임웹 상품 상세의 HTML(코드) 블록에 붙여 넣으세요` : '항목을 채우면 오른쪽에 아임웹 화면처럼 보여줍니다';
      store.set(K_CUR, st);
    }, 120);
  }

  // ───────── 편집 화면 ─────────
  function renderItems() {
    const ol = $('items');
    ol.innerHTML = st.items.map((it, i) => `
      <li class="ac-item" data-id="${it.id}" draggable="false">
        <div class="ac-item-hd">
          <span class="no">${i + 1}</span>
          <input type="text" data-f="title" value="${esc(it.title)}" placeholder="아코디언 제목 (예: 스펙)" aria-label="${i + 1}번 항목 제목">
          <button class="ico" type="button" data-act="up" title="위로" aria-label="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ico" type="button" data-act="down" title="아래로" aria-label="아래로" ${i === st.items.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <label class="fld"><textarea data-f="body" rows="${Math.min(14, Math.max(4, it.body.split('\n').length + 1))}" placeholder="내용 (빈 줄로 문단, - 목록, 항목 | 내용 표, ※ 주석)" aria-label="${i + 1}번 항목 내용">${esc(it.body)}</textarea></label>
        <div class="ac-item-ft">
          <label class="chk"><input type="checkbox" data-f="open" ${it.open ? 'checked' : ''}> 처음부터 펼침</label>
          <span class="sp"></span>
          <button class="lnk" type="button" data-act="dup">복제</button>
          <button class="lnk danger" type="button" data-act="del">빼기</button>
        </div>
      </li>`).join('');
  }

  function renderFixed() {
    const box = $('fixed');
    box.innerHTML = ['consult', 'warranty'].map(k => {
      const f = st[k];
      return `
      <div class="ac-item${f.on ? '' : ' off'}" data-k="${k}">
        <div class="ac-item-hd">
          <b>${k === 'consult' ? '제품 상담' : '워런티'}</b>
          <label class="chk"><input type="checkbox" data-f="on" ${f.on ? 'checked' : ''}> 넣기</label>
        </div>
        <div class="ac-row2">
          <label class="fld"><span>아코디언 제목</span><input type="text" data-f="title" value="${esc(f.title)}"></label>
          <label class="fld"><span>버튼 글자</span><input type="text" data-f="label" value="${esc(f.label)}"></label>
        </div>
        <label class="fld" style="margin-top:8px"><span>안내 문구</span><textarea data-f="text" rows="3">${esc(f.text)}</textarea></label>
        <label class="fld" style="margin-top:8px"><span>연결 주소${k === 'warranty' ? ' (브랜드 워런티 상세 주소가 있으면 바꿔 넣으세요)' : ''}</span><input type="url" data-f="url" value="${esc(f.url)}" placeholder="${k === 'consult' ? CONSULT_URL : WARRANTY_URL}"></label>
      </div>`;
    }).join('');
  }

  function renderAll() {
    $('fBrand').value = st.brand;
    $('fName').value = st.name;
    renderItems();
    renderFixed();
    renderDrafts();
    preview();
  }

  $('presets').innerHTML = PRESETS.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}</button>`).join('');
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const p = PRESETS[+b.dataset.i];
    const filled = st.items.some(it => it.title.trim() || it.body.trim());
    if (filled && p.items.length > 1 && !confirm(`'${p.name}' 항목을 지금 항목 뒤에 이어 붙일까요?\n(취소하면 그대로 둡니다)`)) return;
    p.items.forEach(([t, b2]) => st.items.push(mk(t, b2)));
    renderItems(); preview();
    toast(`${p.name} 항목을 넣었습니다`);
  });

  $('btnAdd').addEventListener('click', () => {
    st.items.push(mk('', ''));
    renderItems(); preview();
    const ins = $('items').querySelectorAll('input[data-f="title"]');
    ins[ins.length - 1].focus();
  });

  $('fBrand').addEventListener('input', e => { st.brand = e.target.value; preview(); });
  $('fName').addEventListener('input', e => { st.name = e.target.value; preview(); });

  const itemOf = el => { const li = el.closest('.ac-item'); return li ? st.items.findIndex(it => it.id === li.dataset.id) : -1; };
  $('items').addEventListener('input', e => {
    const i = itemOf(e.target); if (i < 0) return;
    const f = e.target.dataset.f;
    if (f === 'open') st.items[i].open = e.target.checked;
    else if (f) st.items[i][f] = e.target.value;
    preview();
  });
  $('items').addEventListener('change', e => { if (e.target.dataset.f === 'open') { const i = itemOf(e.target); if (i >= 0) { st.items[i].open = e.target.checked; preview(); } } });
  $('items').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = itemOf(b); if (i < 0) return;
    const a = b.dataset.act;
    if (a === 'up' && i > 0) [st.items[i - 1], st.items[i]] = [st.items[i], st.items[i - 1]];
    else if (a === 'down' && i < st.items.length - 1) [st.items[i + 1], st.items[i]] = [st.items[i], st.items[i + 1]];
    else if (a === 'dup') st.items.splice(i + 1, 0, mk(st.items[i].title, st.items[i].body, st.items[i].open));
    else if (a === 'del') {
      const it = st.items[i];
      if ((it.title.trim() || it.body.trim()) && !confirm(`'${it.title || '제목 없음'}' 항목을 뺄까요?`)) return;
      st.items.splice(i, 1);
    }
    renderItems(); preview();
  });

  $('fixed').addEventListener('input', e => {
    const box = e.target.closest('[data-k]'); if (!box) return;
    const f = st[box.dataset.k], k = e.target.dataset.f;
    if (k === 'on') { f.on = e.target.checked; box.classList.toggle('off', !f.on); }
    else if (k) f[k] = e.target.value;
    preview();
  });
  $('fixed').addEventListener('change', e => {
    if (e.target.dataset.f !== 'url') return;
    const box = e.target.closest('[data-k]');
    const u = safeUrl(e.target.value);
    if (e.target.value.trim() && !u) toast('주소 형식이 맞지 않아 버튼을 넣지 않습니다');
    else if (u && u !== e.target.value) { e.target.value = u; st[box.dataset.k].url = u; preview(); }
  });

  // 미리보기 너비, 모두 펼침, 코드 보기
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('frameWrap').classList.toggle('mo', b.dataset.w === 'mo');
  }));
  $('openAll').addEventListener('change', e => { openAll = e.target.checked; preview(); });
  $('btnCode').addEventListener('click', () => {
    const w = $('codeWrap'); w.hidden = !w.hidden;
    $('btnCode').textContent = w.hidden ? '코드 보기' : '코드 닫기';
  });

  // 복사 · 내려받기
  async function copy() {
    const code = build(false);
    if (!st.items.some(it => it.title.trim() || it.body.trim()) && !confirm('아코디언 항목이 비어 있습니다. v6 연결 항목만 복사할까요?')) return;
    try { await navigator.clipboard.writeText(code); }
    catch (e) {
      const t = $('code'); $('codeWrap').hidden = false; $('btnCode').textContent = '코드 닫기';
      t.value = code; t.focus(); t.select();
      try { document.execCommand('copy'); } catch (e2) { toast('자동 복사가 막혀 있습니다. 코드 칸에서 직접 복사해 주세요'); return; }
    }
    toast('코드를 복사했습니다. 아임웹 상품 상세의 HTML 블록에 붙여 넣으세요');
  }
  $('btnCopy').addEventListener('click', copy);
  $('btnCopy2').addEventListener('click', copy);
  $('btnDown').addEventListener('click', () => {
    const name = (['accordion-v6', st.brand, st.name].filter(s => s && s.trim()).join('-').replace(/[\\/:*?"<>|\s]+/g, '-') || 'accordion-v6') + '.html';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([build(false)], { type: 'text/html;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  $('btnNew').addEventListener('click', () => {
    if ((st.items.length || st.brand || st.name) && !confirm('지금 내용을 비우고 새로 만들까요? 남겨 두려면 먼저 초안 저장을 누르세요.')) return;
    st = DEF(); renderAll();
  });

  // ───────── 초안 (이 브라우저) ─────────
  function drafts() { return store.get(K_DRAFTS, []); }
  function renderDrafts() {
    const list = drafts();
    $('draftSel').innerHTML = `<option value="">${list.length ? `저장한 초안 ${list.length}개` : '저장한 초안 없음'}</option>` +
      list.map((d, i) => `<option value="${i}">${esc(d.label)} · ${esc(d.at)}</option>`).join('');
  }
  $('btnSave').addEventListener('click', () => {
    const label = [st.brand, st.name].map(s => s.trim()).filter(Boolean).join(' ') || (st.items[0] && st.items[0].title) || '이름 없는 초안';
    const list = drafts().filter(d => d.label !== label);
    const now = new Date();
    const at = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    list.unshift({ label, at, data: JSON.parse(JSON.stringify(st)) });
    store.set(K_DRAFTS, list.slice(0, 60));
    renderDrafts();
    toast(`'${label}' 초안을 저장했습니다`);
  });
  $('btnLoad').addEventListener('click', () => {
    const v = $('draftSel').value; if (v === '') return toast('열 초안을 고르세요');
    const d = drafts()[+v]; if (!d) return;
    st = normalize(d.data) || DEF(); renderAll();
    toast(`'${d.label}' 초안을 열었습니다`);
  });
  $('btnDel').addEventListener('click', () => {
    const v = $('draftSel').value; if (v === '') return toast('지울 초안을 고르세요');
    const list = drafts(); const d = list[+v];
    if (!d || !confirm(`'${d.label}' 초안을 지울까요?`)) return;
    list.splice(+v, 1); store.set(K_DRAFTS, list); renderDrafts();
  });

  // ───────── 기존 코드 불러오기 (v4 · v5 · v6) ─────────
  function textOf(node) {
    // HTML 조각 → 이 앱의 내용 문법
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) s += n.textContent.replace(/\s+/g, ' ');
      else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'BR') s += '\n';
        else if (tag === 'A') {
          const href = n.getAttribute('href') || '', t = n.textContent.trim();
          s += (!href || href === t || href.replace(/\/$/, '') === t.replace(/\/$/, '')) ? (href || t) : `[${t}](${href})`;
        } else s += textOf(n);
      }
    });
    return s;
  }
  function bodyToSrc(body) {
    const out = [];
    const walk = el => {
      el.childNodes.forEach(n => {
        if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName, style = (n.getAttribute('style') || '').replace(/\s/g, '');
        if (tag === 'UL' || tag === 'OL') out.push([...n.querySelectorAll(':scope > li')].map(li => '- ' + textOf(li).trim()).join('\n'));
        else if (tag === 'TABLE') out.push([...n.querySelectorAll('tr')].map(tr => [...tr.children].map(c => textOf(c).trim()).join(' | ')).join('\n'));
        else if (tag === 'DL') { const ks = [...n.querySelectorAll('dt')], vs = [...n.querySelectorAll('dd')]; out.push(ks.map((k, i) => `${textOf(k).trim()} | ${vs[i] ? textOf(vs[i]).trim() : ''}`).join('\n')); }
        else if (/^(P|H[1-6]|BLOCKQUOTE|SPAN|STRONG|B|EM|SMALL)$/.test(tag)) {
          let t = textOf(n).split('\n').map(x => x.trim()).filter(Boolean).join('\n');
          if (!t) return;
          if ((tag === 'SMALL' || /font-size:1[23]px/.test(style)) && !/^※/.test(t)) t = t.split('\n').map(x => '※ ' + x).join('\n');
          out.push(t);
        } else if (tag === 'A') { const t = textOf({ childNodes: [n] }).trim(); if (t) out.push(t); }
        else if (tag === 'IMG') out.push(`[이미지](${n.getAttribute('src') || ''})`);
        else walk(n);
      });
    };
    walk(body);
    return out.join('\n\n');
  }
  function importHtml(html) {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    let dets = [...doc.querySelectorAll('details')];
    if (!dets.length) dets = [...doc.querySelectorAll('.rb-sum')];
    if (!dets.length) throw new Error('details 또는 rb-sum 아코디언을 찾지 못했습니다. 아코디언 부분이 들어간 코드인지 확인해 주세요');
    const next = DEF(); next.consult.on = false; next.warranty.on = false;
    const m = html.match(/Rubi accordion v\d+\s*·\s*([^\n]*?)\s*-->/);
    if (m) { const parts = m[1].trim().split(/\s+/); next.name = parts.pop() || ''; next.brand = parts.join(' '); }
    dets.forEach(d => {
      const sum = d.querySelector('.rb-summary, summary');
      const title = sum ? [...sum.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('rb-arrow'))).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim() : '';
      const body = d.querySelector('.rb-body') || (() => { const c = d.cloneNode(true); const s = c.querySelector('summary'); if (s) s.remove(); return c; })();
      const links = [...body.querySelectorAll('a[href]')];
      const consult = links.find(a => /ai\.rubiworkshop\.com/i.test(a.href));
      const warranty = links.find(a => /\/warranty/i.test(a.href));
      if (consult || warranty) {
        const k = consult ? 'consult' : 'warranty', a = consult || warranty;
        const c = body.cloneNode(true);
        c.querySelectorAll('a').forEach(x => { if (x.href === a.href && x.textContent.trim() === a.textContent.trim()) x.remove(); });
        Object.assign(next[k], { on: true, title: title || next[k].title, url: a.getAttribute('href'), label: a.textContent.trim() || next[k].label, text: bodyToSrc(c) || next[k].text });
        return;
      }
      next.items.push(mk(title, bodyToSrc(body), d.hasAttribute('open')));
    });
    // v4·v5에 연결 항목이 없었으면 v6 기본 연결을 붙임
    if (!next.consult.on && !next.warranty.on) { next.consult.on = true; next.warranty.on = true; }
    return next;
  }
  $('btnImport').addEventListener('click', () => { $('importErr').hidden = true; $('importIn').value = ''; $('dlgImport').showModal(); setTimeout(() => $('importIn').focus(), 30); });
  $('btnDoImport').addEventListener('click', e => {
    e.preventDefault();
    const v = $('importIn').value.trim();
    if (!v) { $('importErr').textContent = '코드를 붙여 넣어 주세요'; $('importErr').hidden = false; return; }
    try {
      const next = importHtml(v);
      st = next; renderAll();
      $('dlgImport').close();
      toast(`항목 ${next.items.length}개를 불러왔습니다. 내용을 확인한 뒤 코드 복사를 누르세요`);
    } catch (err) { $('importErr').textContent = err.message; $('importErr').hidden = false; }
  });

  let tt = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // 테스트용 (콘솔): 문법 변환 확인
  window.RubiAccordion = { build: () => build(false), importHtml, blocks };

  renderAll();
})();
