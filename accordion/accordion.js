// 아코디언 V6: 루비 상세페이지 아코디언 코드 만들기
// 기준은 v5 원본(크레인 벨 리튼 벨) 구조와 인라인 스타일 그대로
//   <!-- 머리 주석(제품 표기, 섹션 구성) -->
//   <!-- ── 1. 제목 [상품별] ── -->
//   div.rb-sum > details(첫 섹션만 open, border-top) > summary.rb-summary(&nbsp;제목&nbsp; + span.rb-arrow 셰브론 svg) + div.rb-body
// v6 = v5 + 전 상품 공통 섹션(배송 · 교환/반품 · A/S)에 제품 상담(ai.rubiworkshop.com) · 워런티(rubisupply.com/warranty) 링크
(function () {
  'use strict';
  if (window.MR && !MR.requireLogin()) return;

  const CONSULT_URL = 'https://ai.rubiworkshop.com/';
  const WARRANTY_URL = 'https://rubisupply.com/warranty';
  const K_CUR = 'myrubi.acc.current.v2', K_DRAFTS = 'myrubi.acc.drafts.v2', K_BRANDS = 'myrubi.acc.brands';

  // ───────── v5 인라인 스타일 (원본 그대로) ─────────
  const FF = "font-family:'S-CoreDream','S-CoreDream-4Regular','Apple SD Gothic Neo','Noto Sans KR',sans-serif;";
  const S = {
    wrap: FF,
    detFirst: 'border-top:1px solid #e4e1dd; border-bottom:1px solid #e4e1dd;',
    det: 'border-bottom:1px solid #e4e1dd;',
    sum: FF + ' list-style:none; cursor:pointer; display:block; position:relative; width:100%; padding:20px 30px 20px 2px; font-size:13px; font-weight:600; letter-spacing:.18em;',
    arrow: 'position:absolute; right:4px; top:50%; width:14px; height:14px; transform:translateY(-50%); line-height:0; transition:transform .3s ease;',
    svg: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;"><path d="M2.5 5 L7 9.5 L11.5 5" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    body: FF + ' padding:2px 2px 30px; font-size:14px; line-height:1.8; color:#555;',
    p: FF + ' margin:0 0 14px;',
    pLabel: FF + ' margin:0 0 10px;',
    pLast: FF + ' margin:0;',
    strong: FF + ' color:#222;',
    table: FF + ' width:100%; border-collapse:collapse; font-size:14px; color:#333; line-height:1.6; border-top:2px solid #222;',
    thFirst: FF + ' width:28%; background:#f7f7f7; border-bottom:1px solid #e3e3e3; padding:10px 12px; text-align:left; font-weight:600; color:#222;',
    th: FF + ' background:#f7f7f7; border-bottom:1px solid #e3e3e3; padding:10px 12px; text-align:left; font-weight:600; color:#222;',
    td: FF + ' border-bottom:1px solid #e3e3e3; padding:10px 12px;',
    h3: FF + ' font-size:17px; font-weight:700; color:#222; margin:24px 0 10px; letter-spacing:-0.3px;',
    h3sub: FF + ' font-size:13px; font-weight:400; color:#888;',
    note: FF + ' font-size:12px; color:#999; margin:16px 0 0; line-height:1.6;',
    ul: FF + ' margin:0 0 14px; padding:0 0 0 18px;',
    li: FF + ' margin:0 0 4px;',
    a: FF + ' color:#222; text-decoration:underline; text-underline-offset:3px;'
  };

  const SCOPES = { item: '상품별', brand: '브랜드 공통', common: '전 상품 공통' };

  // 전 상품 공통 섹션 (v5 문구 + v6 링크). em dash 대신 라벨 뒤 띄어쓰기
  const COMMON_TITLE = '배송 · 교환/반품 · A/S';
  const COMMON_BODY = [
    '**배송** 평일 오후 3시 이전 결제 건은 당일 출고를 원칙으로 합니다. 주문 제작 및 예약 상품은 상품 페이지의 안내 일정을 따릅니다.',
    '**교환/반품** 수령 후 7일 이내, 미사용·미장착 상태에 한해 가능합니다. 장착 흔적이 있는 부품, 커팅된 케이블류, 착화 흔적이 있는 슈즈는 교환/반품이 제한됩니다. 규격이나 호환 여부가 애매하시면 장착 전에 먼저 문의해 주세요.',
    `**A/S** 루비컴퍼니가 수입·유통하는 전 제품은 공식 수입원 정품 보증을 받습니다. 초기 불량 및 보증 범위 내 이슈는 루비 워크샵에서 직접 점검하고, 필요 시 본사 절차를 대행합니다. 브랜드별 보증 기간과 범위는 [워런티 페이지](${WARRANTY_URL})에서 확인하실 수 있습니다.`,
    `**제품 상담** 사이즈, 호환, 다른 부품과의 조합이 궁금하시면 [AI 제품 상담](${CONSULT_URL})에서 바로 물어보실 수 있습니다. 필요하면 루비워크샵 직원 상담으로 이어집니다.`
  ].join('\n\n');

  // 섹션 구성: 1 · 2 · 4 · 5는 같고 3번만 제품 종류에 맞춤
  const KINDS = [
    { name: '부품 · 액세서리', s3: '장착 및 사용 안내', b3: '핸들바 규격 | \n장착 위치 | \n조임 | \n관리 | \n\n※ ' },
    { name: '자전거 · 프레임셋', s3: '사이즈 및 구성 안내', b3: '사이즈 | 권장 신장\nS | \nM | \nL | \n\n※ 정확한 사이즈는 쇼룸 피팅 또는 제품 상담에서 안내해 드립니다.' },
    { name: '슈즈', s3: '사이즈 및 착용 안내', b3: 'EU | 발 길이(mm)\n40 | \n41 | \n42 | \n\n※ 발볼이 넓으면 반 사이즈 크게 권해 드립니다.' },
    { name: '식품 · 요헤미티', s3: '섭취 및 보관 안내', b3: '섭취 시점 | \n섭취량 | \n보관 | \n\n※ 식품은 개봉 후 교환·반품이 어렵습니다.' }
  ];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let uid = 0;
  const mk = (title, body, scope, open) => ({ id: 'i' + (++uid), title: title || '', body: body || '', scope: SCOPES[scope] ? scope : 'item', open: !!open });

  function standard(kind) {
    const k = KINDS[kind || 0];
    return [
      mk('제품 요약', '', 'item', true),
      mk('제품 특징', '브랜드 | \n모델 | \n소재 | \n무게 | \n원산지 | \n\n## English Title | 한글 부제\n특징 설명 문단\n\n※ 표기된 사항은 제조사의 품질 개선 및 부품 수급 일정에 따라 변경될 수 있습니다.', 'item'),
      mk(k.s3, k.b3, 'item'),
      mk('브랜드 이야기', '', 'brand'),
      mk(COMMON_TITLE, COMMON_BODY, 'common')
    ];
  }
  const DEF = () => ({ en: '', ko: '', brand: '', items: standard(0), ai: null });

  function normalize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
    return { en: s.en || '', ko: s.ko || '', brand: s.brand || '', items: s.items.map(it => mk(it.title, it.body, it.scope, it.open)), ai: s.ai && typeof s.ai === 'object' ? s.ai : null };
  }

  let st = normalize(store.get(K_CUR, null)) || DEF();
  let openAll = false;

  // ───────── 내용 문법 → HTML ─────────
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }
  const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener" style="${S.a}">${text}</a>`;
  // 줄 안: **굵게**, [글자](주소), 맨 주소
  function inline(s) {
    const out = [];
    let rest = String(s), m;
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/i;
    while ((m = re.exec(rest))) {
      out.push(esc(rest.slice(0, m.index)));
      if (m[1]) out.push(`<strong style="${S.strong}">${esc(m[1])}</strong>`);
      else if (m[2]) { const u = safeUrl(m[3]); out.push(u ? link(u, esc(m[2])) : esc(m[0])); }
      else { const u = safeUrl(m[4]); out.push(u ? link(u, esc(m[4])) : esc(m[4])); }
      rest = rest.slice(m.index + m[0].length);
    }
    out.push(esc(rest));
    return out.join('').replace(/ · /g, ' &middot; ');
  }

  // 줄을 종류별로 묶음: p 문단, li 목록, row 표, note 주석, h3 소제목
  function blocks(src) {
    const out = [];
    let cur = null;
    const push = (t, v, solo) => {
      if (solo || !cur || cur.t !== t) { cur = { t, v: [] }; out.push(cur); }
      cur.v.push(v);
      if (solo) cur = null;
    };
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      if (!line) { cur = null; continue; }
      let m;
      if ((m = line.match(/^#{2,3}\s+(.+)$/))) { const [en, ko] = m[1].split(/\s+\|\s+/); push('h3', { en: en.trim(), ko: (ko || '').trim() }, true); }
      else if ((m = line.match(/^[-•]\s+(.*)$/))) push('li', m[1]);
      else if (/^※/.test(line)) push('note', line);
      else if ((m = line.match(/^([^|\t]+?)\s*(?:\t|\|)\s*(.*)$/)) && !/^\*\*/.test(line)) push('row', { k: m[1].trim(), v: m[2].trim() });
      else push('p', line);
    }
    return out;
  }

  function bodyHtml(src) {
    const pad = '\t\t\t';
    const bs = blocks(src);
    const html = bs.map((b, i) => {
      const last = i === bs.length - 1, prev = bs[i - 1], next = bs[i + 1];
      if (b.t === 'h3') {
        const x = b.v[0];
        return `${pad}<h3 style="${S.h3}">${inline(x.en)}${x.ko ? ` <span style="${S.h3sub}">${inline(x.ko)}</span>` : ''}</h3>`;
      }
      if (b.t === 'row') {
        let st0 = S.table;
        if (prev) st0 += ' margin-top:20px;';
        if (next && next.t !== 'note' && next.t !== 'h3') st0 += ' margin-bottom:14px;';
        return `${pad}<table style="${st0}">\n${pad}\t<tbody>\n` + b.v.map((r, j) =>
          `${pad}\t\t<tr>\n${pad}\t\t\t<th style="${j === 0 ? S.thFirst : S.th}">${inline(r.k)}</th>\n${pad}\t\t\t<td style="${S.td}">${inline(r.v) || '&nbsp;'}</td>\n${pad}\t\t</tr>`).join('\n') + `\n${pad}\t</tbody>\n${pad}</table>`;
      }
      if (b.t === 'note') return `${pad}<p style="${S.note}">${b.v.map(inline).join('<br>')}</p>`;
      if (b.t === 'li') return `${pad}<ul style="${S.ul}">\n` + b.v.map(x => `${pad}\t<li style="${S.li}">${inline(x)}</li>`).join('\n') + `\n${pad}</ul>`;
      // 문단: **라벨** 로 시작하는 문단(배송 · A/S 등)은 원본처럼 간격 10px, 마지막은 0
      const label = /^\*\*[^*]+\*\*/.test(b.v[0]);
      const style = label ? (last ? S.pLast : S.pLabel) : S.p;
      const sep = label && next ? '\n' : '';
      return `${pad}<p style="${style}">${b.v.map(inline).join('<br>')}</p>${sep}`;
    });
    return html.join('\n');
  }

  const LINE = n => '─'.repeat(Math.max(3, n));
  function scopeTag(it) {
    if (it.scope === 'brand') return `[브랜드 공통${st.brand.trim() ? ' / ' + st.brand.trim() + ' 상품에 복붙' : ''}]`;
    if (it.scope === 'common') return '[전 상품 공통 복붙]';
    return '[상품별]';
  }
  const safeComment = s => String(s).replace(/--/g, '-').replace(/>/g, '');

  function build(forPreview) {
    const items = st.items.filter(it => it.title.trim() || it.body.trim());
    const prodLine = [st.en.trim(), st.ko.trim()].filter(Boolean).join(' / ');
    const head = [
      '<!-- ============================================================',
      '     루비 상세페이지 아코디언 v6 · 서체 에스코어 드림',
      prodLine ? `     (${safeComment(prodLine)})` : null,
      '',
      `     구성 (총 ${items.length}개 섹션)`,
      ...items.map((it, i) => {
        const mark = items.length === 1 ? '─' : i === 0 ? '┌' : i === items.length - 1 ? '└' : '├';
        const tag = { item: '[상품별]     ', brand: '[브랜드 공통] ', common: '[전 상품 공통] ' }[it.scope];
        return `     ${mark} ${tag}${i + 1}. ${safeComment(it.title.trim() || '제목 없음')}`;
      }),
      '',
      `     v6: 제품 상담 ${CONSULT_URL} · 워런티 ${WARRANTY_URL}`,
      '     서체: 아임웹 헤더 코드에 S-CoreDream @font-face가 있어야 적용됩니다.',
      '============================================================ -->'
    ].filter(x => x !== null).join('\n');

    const parts = items.map((it, i) => {
      const title = it.title.trim() || '제목 없음';
      const label = `── ${i + 1}. ${safeComment(title)} ${scopeTag(it)} `;
      const open = it.open || (forPreview && openAll);
      return `<!-- ${label}${LINE(54 - label.length)} -->\n` +
        `<div class="rb-sum" style="${S.wrap}">\n` +
        `\t<details${open ? ' open=""' : ''} style="${i === 0 ? S.detFirst : S.det}">\n` +
        `\t\t<summary class="rb-summary" style="${S.sum}">&nbsp;${inline(title)}&nbsp;<span class="rb-arrow" style="${S.arrow}">${S.svg}</span>&nbsp;</summary>\n` +
        `\t\t<div class="rb-body" style="${S.body}">\n\n` +
        (bodyHtml(it.body) || `\t\t\t<p style="${S.p}">&nbsp;</p>`) + '\n' +
        `\t\t</div>\n\t</details>\n</div>`;
    });
    return head + '\n' + parts.join('\n');
  }

  // ───────── 미리보기 ─────────
  const PV_CSS = `
    @font-face{font-family:"S-CoreDream";font-weight:400;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-4Regular.woff") format("woff")}
    @font-face{font-family:"S-CoreDream";font-weight:600;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-6Bold.woff") format("woff")}
    @font-face{font-family:"S-CoreDream";font-weight:700;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-7ExtraBold.woff") format("woff")}
    html,body{margin:0;background:#fff;color:#222}
    body{padding:28px 24px;-webkit-font-smoothing:antialiased}
    summary::-webkit-details-marker{display:none}
    details[open] > summary .rb-arrow{transform:translateY(-50%) rotate(180deg) !important}
    @media(max-width:480px){body{padding:20px 16px}}`;
  let pvTimer = 0;
  function preview() {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => {
      const f = $('pv');
      const y = (() => { try { return f.contentWindow.scrollY; } catch (e) { return 0; } })();
      f.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PV_CSS}</style></head><body>${build(true)}</body></html>`;
      f.onload = () => { try { f.contentWindow.scrollTo(0, y); } catch (e) {} };
      const code = build(false);
      $('code').value = code;
      const n = st.items.filter(it => it.title.trim() || it.body.trim()).length;
      $('codeInfo').textContent = `섹션 ${n}개 · ${code.length.toLocaleString()}자`;
      $('status').textContent = n ? `섹션 ${n}개. 코드 복사 후 아임웹 상품 상세의 HTML(코드) 블록에 붙여 넣으세요` : '섹션을 채우면 오른쪽에 아임웹 화면처럼 보여줍니다';
      // v6 링크 확인
      const hasC = code.includes('ai.rubiworkshop.com'), hasW = /rubisupply\.com\/warranty/.test(code);
      const c = $('v6check');
      c.textContent = hasC && hasW ? 'v6 링크 확인: 제품 상담 · 워런티 모두 들어 있습니다' :
        `v6 링크가 빠졌습니다: ${[!hasC && '제품 상담(ai.rubiworkshop.com)', !hasW && '워런티(rubisupply.com/warranty)'].filter(Boolean).join(', ')}. 공통 섹션을 확인해 주세요`;
      c.classList.toggle('warn', !(hasC && hasW));
      rememberBrand();
      store.set(K_CUR, st);
    }, 120);
  }

  // ───────── 브랜드 이야기 보관 (브랜드별, 이 브라우저) ─────────
  const brandLib = () => store.get(K_BRANDS, {});
  function rememberBrand() {
    const b = st.brand.trim(); if (!b) return;
    const it = st.items.find(x => x.scope === 'brand' && x.body.trim());
    if (!it) return;
    const lib = brandLib();
    if (lib[b] && lib[b].body === it.body && lib[b].title === it.title) return;
    lib[b] = { title: it.title, body: it.body };
    store.set(K_BRANDS, lib); renderBrandList();
  }
  function fillBrand() {
    const lib = brandLib(), b = st.brand.trim(), saved = lib[b];
    if (!saved) return;
    let it = st.items.find(x => x.scope === 'brand');
    if (it && it.body.trim()) return;
    if (!it) { it = mk(saved.title, '', 'brand'); const ci = st.items.findIndex(x => x.scope === 'common'); st.items.splice(ci < 0 ? st.items.length : ci, 0, it); }
    it.body = saved.body; it.title = it.title.trim() || saved.title;
    renderItems(); toast(`저장해 둔 '${b}' 브랜드 이야기를 넣었습니다`);
  }
  function renderBrandList() { $('brandList').innerHTML = Object.keys(brandLib()).sort().map(b => `<option value="${esc(b)}">`).join(''); }

  // ───────── 편집 화면 ─────────
  function renderItems() {
    $('items').innerHTML = st.items.map((it, i) => `
      <li class="ac-item" data-id="${it.id}" data-scope="${it.scope}">
        <div class="ac-item-hd">
          <span class="no">${i + 1}</span>
          <input type="text" data-f="title" value="${esc(it.title)}" placeholder="섹션 제목 (예: 제품 특징)" aria-label="${i + 1}번 섹션 제목">
          <select data-f="scope" aria-label="${i + 1}번 섹션 범위">${Object.entries(SCOPES).map(([k, v]) => `<option value="${k}"${k === it.scope ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button class="ico" type="button" data-act="up" title="위로" aria-label="위로" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ico" type="button" data-act="down" title="아래로" aria-label="아래로" ${i === st.items.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <label class="fld"><textarea data-f="body" rows="${Math.min(16, Math.max(4, it.body.split('\n').length + 1))}" placeholder="내용 (빈 줄로 문단, 항목 | 내용 표, ## 소제목, **라벨**, ※ 주석)" aria-label="${i + 1}번 섹션 내용">${esc(it.body)}</textarea></label>
        <div class="ac-item-ft">
          <label class="chk"><input type="checkbox" data-f="open" ${it.open ? 'checked' : ''}> 처음부터 펼침</label>
          <span class="sp"></span>
          ${it.scope === 'common' && it.body !== COMMON_BODY ? '<button class="lnk" type="button" data-act="reset">v6 기본 문구로</button>' : ''}
          <button class="lnk" type="button" data-act="dup">복제</button>
          <button class="lnk danger" type="button" data-act="del">빼기</button>
        </div>
      </li>`).join('');
  }

  function renderAll() {
    $('fEn').value = st.en; $('fKo').value = st.ko; $('fBrand').value = st.brand;
    renderItems(); renderDrafts(); renderBrandList(); renderAi(); preview();
  }

  // AI가 만든 초안: 확인할 것과 출처 (코드에는 들어가지 않음)
  function renderAi() {
    const box = $('aiBox'), a = st.ai;
    if (!a) { box.hidden = true; box.innerHTML = ''; return; }
    const un = (a.unverified || []).filter(Boolean);
    const src = (a.sources || []).filter(Boolean);
    box.hidden = false;
    box.innerHTML = `
      <h3>AI 초안 · 올리기 전에 확인해 주세요</h3>
      ${un.length ? `<ul class="warn">${un.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="ac-note" style="margin:0 0 10px">확인 못 한 항목 없음. 스펙 표의 빈칸이 있는지만 봐 주세요.</p>'}
      ${src.length ? `<details class="src"><summary>출처 ${src.length}곳</summary><ul>${src.map(u => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('')}</ul></details>` : ''}
      <div class="ft"><span>${esc(a.at || '')}${a.by ? ' · ' + esc(a.by) : ''}${a.model ? ' · ' + esc(a.model) : ''}</span><span class="sp"></span><button class="lnk" type="button" id="btnAiDone">확인 끝, 이 안내 닫기</button></div>`;
    $('btnAiDone').onclick = () => { st.ai = null; renderAi(); preview(); };
  }

  $('presets').innerHTML = KINDS.map((k, i) => `<button type="button" data-i="${i}">${esc(k.name)}</button>`).join('') + '<button type="button" data-i="-1">기본 5섹션 다시</button>';
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i;
    if (i < 0) {
      if (!confirm('섹션을 기본 5개(제품 요약 · 제품 특징 · 3번 · 브랜드 이야기 · 공통)로 다시 놓을까요? 지금 내용은 지워집니다.')) return;
      st.items = standard(0); fillBrand(); renderItems(); preview(); return;
    }
    const k = KINDS[i];
    // 3번 자리(상품별 섹션 중 세 번째)의 제목을 바꾸고, 비었거나 다른 종류의 기본값이면 내용도 바꿈
    const items = st.items.filter(x => x.scope === 'item');
    const t = items[2];
    if (!t) { const ci = st.items.findIndex(x => x.scope !== 'item'); st.items.splice(ci < 0 ? st.items.length : ci, 0, mk(k.s3, k.b3, 'item')); }
    else {
      const isDefault = !t.body.trim() || KINDS.some(x => x.b3 === t.body);
      if (!isDefault && !confirm(`3번 섹션 내용을 '${k.name}' 기본값으로 바꿀까요? (취소하면 제목만 바꿉니다)`)) { t.title = k.s3; }
      else { t.title = k.s3; t.body = k.b3; }
    }
    renderItems(); preview(); toast(`3번 섹션을 '${k.s3}'로 맞췄습니다`);
  });

  $('btnAdd').addEventListener('click', () => {
    const ci = st.items.findIndex(x => x.scope !== 'item');
    st.items.splice(ci < 0 ? st.items.length : ci, 0, mk('', '', 'item'));
    renderItems(); preview();
    const ins = $('items').querySelectorAll('input[data-f="title"]');
    ins[ci < 0 ? ins.length - 1 : ci].focus();
  });

  $('fEn').addEventListener('input', e => { st.en = e.target.value; preview(); });
  $('fKo').addEventListener('input', e => { st.ko = e.target.value; preview(); });
  $('fBrand').addEventListener('input', e => { st.brand = e.target.value; preview(); });
  $('fBrand').addEventListener('change', () => { fillBrand(); preview(); });

  const itemOf = el => { const li = el.closest('.ac-item'); return li ? st.items.findIndex(it => it.id === li.dataset.id) : -1; };
  $('items').addEventListener('input', e => {
    const i = itemOf(e.target); if (i < 0) return;
    const f = e.target.dataset.f;
    if (f === 'open') st.items[i].open = e.target.checked;
    else if (f === 'scope') { st.items[i].scope = e.target.value; e.target.closest('.ac-item').dataset.scope = e.target.value; }
    else if (f) st.items[i][f] = e.target.value;
    preview();
  });
  $('items').addEventListener('change', e => {
    const i = itemOf(e.target); if (i < 0) return;
    if (e.target.dataset.f === 'open') st.items[i].open = e.target.checked;
    if (e.target.dataset.f === 'scope') { st.items[i].scope = e.target.value; renderItems(); }
    preview();
  });
  $('items').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const i = itemOf(b); if (i < 0) return;
    const a = b.dataset.act, it = st.items[i];
    if (a === 'up' && i > 0) [st.items[i - 1], st.items[i]] = [st.items[i], st.items[i - 1]];
    else if (a === 'down' && i < st.items.length - 1) [st.items[i + 1], st.items[i]] = [st.items[i], st.items[i + 1]];
    else if (a === 'dup') st.items.splice(i + 1, 0, mk(it.title, it.body, it.scope, it.open));
    else if (a === 'reset') { if (!confirm('공통 섹션을 v6 기본 문구로 되돌릴까요?')) return; it.title = COMMON_TITLE; it.body = COMMON_BODY; }
    else if (a === 'del') {
      if ((it.title.trim() || it.body.trim()) && !confirm(`'${it.title || '제목 없음'}' 섹션을 뺄까요?`)) return;
      st.items.splice(i, 1);
    }
    renderItems(); preview();
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
    if (!code.includes('ai.rubiworkshop.com') || !/rubisupply\.com\/warranty/.test(code)) {
      if (!confirm('v6 링크(제품 상담 · 워런티)가 빠져 있습니다. 그래도 복사할까요?')) return;
    }
    if (st.ai && (st.ai.unverified || []).length && !confirm(`AI 초안에 확인할 항목이 ${st.ai.unverified.length}건 남아 있습니다. 확인을 마쳤으면 '확인 끝'을 누르세요.\n그래도 지금 복사할까요?`)) return;
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
    const name = (['accordion-v6', st.en].filter(s => s && s.trim()).join('-').replace(/[\\/:*?"<>|\s]+/g, '-').toLowerCase() || 'accordion-v6') + '.html';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([build(false)], { type: 'text/html;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  $('btnNew').addEventListener('click', () => {
    if ((st.en || st.ko || st.items.some(it => it.scope === 'item' && it.body.trim())) && !confirm('지금 내용을 비우고 새로 만들까요? 남겨 두려면 먼저 초안 저장을 누르세요.')) return;
    const brand = st.brand;
    st = DEF(); st.brand = brand; fillBrand(); renderAll();
  });

  // ───────── 초안 (이 브라우저) ─────────
  const drafts = () => store.get(K_DRAFTS, []);
  function renderDrafts() {
    const list = drafts();
    $('draftSel').innerHTML = `<option value="">${list.length ? `저장한 초안 ${list.length}개` : '저장한 초안 없음'}</option>` +
      list.map((d, i) => `<option value="${i}">${esc(d.label)} · ${esc(d.at)}</option>`).join('');
  }
  function stamp() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
  function saveDraft(state) {
    const label = state.ko.trim() || state.en.trim() || (state.items[0] && state.items[0].title) || '이름 없는 초안';
    const list = drafts().filter(d => d.label !== label);
    list.unshift({ label, at: stamp(), data: JSON.parse(JSON.stringify(state)) });
    store.set(K_DRAFTS, list.slice(0, 80));
    renderDrafts();
    return label;
  }
  $('btnSave').addEventListener('click', () => { toast(`'${saveDraft(st)}' 초안을 저장했습니다`); });
  $('btnLoad').addEventListener('click', () => {
    const v = $('draftSel').value; if (v === '') return toast('열 초안을 고르세요');
    const d = drafts()[+v]; if (!d) return;
    st = normalize(d.data) || DEF(); renderAll(); toast(`'${d.label}' 초안을 열었습니다`);
  });
  $('btnDel').addEventListener('click', () => {
    const v = $('draftSel').value; if (v === '') return toast('지울 초안을 고르세요');
    const list = drafts(), d = list[+v];
    if (!d || !confirm(`'${d.label}' 초안을 지울까요?`)) return;
    list.splice(+v, 1); store.set(K_DRAFTS, list); renderDrafts();
  });

  // ───────── 기존 코드 불러오기 (v5 · v6) ─────────
  const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  function textOf(node) {
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) s += clean(n.textContent).replace(/\s*\n\s*/g, ' ');
      else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'BR') s += '\n';
        else if (tag === 'A') {
          const href = n.getAttribute('href') || '', t = clean(n.textContent).trim();
          s += (!href || href.replace(/\/$/, '') === t.replace(/\/$/, '')) ? (href || t) : `[${t}](${href})`;
        } else if (tag === 'STRONG' || tag === 'B') s += `**${clean(n.textContent).trim()}**`;
        else s += textOf(n);
      }
    });
    return s;
  }
  function bodyToSrc(body) {
    const out = [];
    const walk = el => el.childNodes.forEach(n => {
      if (n.nodeType === 3) { const t = clean(n.textContent).trim(); if (t) out.push(t); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName, style = (n.getAttribute('style') || '').replace(/\s/g, '');
      if (tag === 'TABLE') out.push([...n.querySelectorAll('tr')].map(tr => [...tr.children].map(c => textOf(c).trim().replace(/\|/g, '/')).join(' | ')).join('\n'));
      else if (/^H[1-6]$/.test(tag)) {
        const sub = n.querySelector('span');
        const ko = sub ? clean(sub.textContent).trim() : '';
        const c = n.cloneNode(true); if (c.querySelector('span')) c.querySelector('span').remove();
        out.push(`## ${clean(c.textContent).trim()}${ko ? ' | ' + ko : ''}`);
      } else if (tag === 'UL' || tag === 'OL') out.push([...n.children].map(li => '- ' + textOf(li).trim()).join('\n'));
      else if (tag === 'P' || tag === 'DIV' && !n.children.length) {
        let t = textOf(n).split('\n').map(x => x.trim()).filter(Boolean).join('\n');
        t = t.replace(/^(\*\*[^*]+\*\*)\s*(?:—|–|-|:)\s*/, '$1 ');   // 라벨 뒤 대시는 띄어쓰기로
        if (!t) return;
        if (/font-size:1[12]px/.test(style) && !/^※/.test(t)) t = '※ ' + t;
        out.push(t);
      } else walk(n);
    });
    walk(body);
    return out.join('\n\n');
  }
  function importHtml(html) {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
    const root = doc.getElementById('r');
    const sums = [...root.querySelectorAll('.rb-sum')];
    const dets = sums.length ? sums.map(s => s.querySelector('details') || s) : [...root.querySelectorAll('details')];
    if (!dets.length) throw new Error('rb-sum 아코디언을 찾지 못했습니다. 아코디언 코드 전체를 붙여 넣었는지 확인해 주세요');

    const next = { en: '', ko: '', brand: '', items: [] };
    // 머리 주석: (영문 / 한글)
    const head = html.match(/아코디언\s+v\d+[^\n]*\n\s*\(([^)\n]+)\)/);
    if (head) { const [en, ko] = head[1].split(/\s+\/\s+/); next.en = (en || '').trim(); next.ko = (ko || '').trim(); }

    // 각 섹션 앞 주석에서 범위 읽기
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const comments = []; let c;
    while ((c = walker.nextNode())) comments.push(c);
    const scopeOf = el => {
      let best = null;
      comments.forEach(cm => { if (cm.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = cm; });
      const t = best ? best.textContent : '';
      if (/전\s*상품\s*공통/.test(t)) return { scope: 'common' };
      const m = t.match(/브랜드\s*공통(?:\s*\/\s*([^\]]+?)\s*상품에)?/);
      if (m) return { scope: 'brand', brand: (m[1] || '').trim() };
      return { scope: 'item' };
    };

    let upgraded = false;
    dets.forEach(d => {
      const sum = d.querySelector('.rb-summary, summary');
      let title = '';
      if (sum) { const s2 = sum.cloneNode(true); s2.querySelectorAll('.rb-arrow, svg').forEach(x => x.remove()); title = clean(s2.textContent).trim(); }
      const body = d.querySelector('.rb-body') || (() => { const x = d.cloneNode(true); const s = x.querySelector('summary'); if (s) s.remove(); return x; })();
      const sc = scopeOf(d.closest('.rb-sum') || d);
      if (sc.brand && !next.brand) next.brand = sc.brand;
      let src = bodyToSrc(body);
      if (sc.scope === 'common' && !/ai\.rubiworkshop\.com/.test(src) && !/\/warranty/.test(src)) { src = COMMON_BODY; title = COMMON_TITLE; upgraded = true; }
      next.items.push(mk(title, src, sc.scope, d.hasAttribute('open')));
    });
    if (!next.items.some(x => x.scope === 'common')) { next.items.push(mk(COMMON_TITLE, COMMON_BODY, 'common')); upgraded = true; }
    return { next, upgraded };
  }
  $('btnImport').addEventListener('click', () => { $('importErr').hidden = true; $('importIn').value = ''; $('dlgImport').showModal(); setTimeout(() => $('importIn').focus(), 30); });
  $('btnDoImport').addEventListener('click', e => {
    e.preventDefault();
    const v = $('importIn').value.trim();
    if (!v) { $('importErr').textContent = '코드를 붙여 넣어 주세요'; $('importErr').hidden = false; return; }
    try {
      const { next, upgraded } = importHtml(v);
      st = next; renderAll(); $('dlgImport').close();
      toast(`섹션 ${next.items.length}개를 불러왔습니다${upgraded ? '. 공통 섹션을 v6 문구로 바꿨습니다' : ''}`);
    } catch (err) { $('importErr').textContent = err.message; $('importErr').hidden = false; }
  });


  // ───────── 목록으로 만들기 (AI, Apps Script POST accGen) ─────────
  const cell = v => String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();
  const noteLine = v => { v = cell(v); return !v ? '' : /^※/.test(v) ? v : '※ ' + v; };
  function fromAi(r, kindIdx, brandIn) {
    const k = KINDS[kindIdx] || KINDS[0];
    const spec = (r.spec || []).filter(x => Array.isArray(x) && cell(x[0])).map(x => `${cell(x[0])} | ${cell(x[1])}`).join('\n');
    const feats = (r.features || []).filter(f => f && (f.en || f.text)).map(f => `## ${cell(f.en || f.ko)}${f.en && f.ko ? ' | ' + cell(f.ko) : ''}\n${String(f.text || '').trim()}`).join('\n\n');
    const guide = (r.guide || []).filter(x => Array.isArray(x) && cell(x[0])).map(x => `${cell(x[0])} | ${cell(x[1])}`).join('\n');
    const brand = (brandIn || r.brand_ko || '').trim();
    const lib = brandLib()[brand];
    const story = lib ? lib.body : (r.brand_story || []).map(x => String(x).trim()).filter(Boolean).join('\n\n');
    const next = DEF();
    next.en = cell(r.en); next.ko = cell(r.ko); next.brand = brand;
    next.items = [
      mk('제품 요약', (r.summary || []).map(x => String(x).trim()).filter(Boolean).join('\n\n'), 'item', true),
      mk('제품 특징', [spec, feats, noteLine(r.spec_note)].filter(Boolean).join('\n\n'), 'item'),
      mk(k.s3, [guide, noteLine(r.guide_note)].filter(Boolean).join('\n\n'), 'item'),
      mk(lib ? lib.title : '브랜드 이야기', story, 'brand'),
      mk(COMMON_TITLE, COMMON_BODY, 'common')
    ];
    // 스펙 빈칸도 확인 목록에
    const blanks = []
      .concat((r.spec || []).filter(x => Array.isArray(x) && cell(x[0]) && !cell(x[1])).map(x => `제품 특징 표 '${cell(x[0])}' 빈칸`))
      .concat((r.guide || []).filter(x => Array.isArray(x) && cell(x[0]) && !cell(x[1])).map(x => `${k.s3} 표 '${cell(x[0])}' 빈칸`));
    next.ai = { unverified: (r.unverified || []).map(cell).concat(blanks), sources: r.sources || [], at: stamp(), by: (window.MR && MR.user().name) || '', model: r._model || '' };
    // 브랜드 이야기를 새로 만들었으면 브랜드별로 보관
    if (brand && !lib && story) { const L = brandLib(); L[brand] = { title: '브랜드 이야기', body: story }; store.set(K_BRANDS, L); renderBrandList(); }
    return next;
  }

  const batch = { rows: [], running: false, stop: false };
  $('batchKind').innerHTML = KINDS.map((k, i) => `<option value="${i}">${esc(k.name)} · 3번 '${esc(k.s3)}'</option>`).join('');
  function renderBatch() {
    $('batchList').innerHTML = batch.rows.map((r, i) => `
      <li class="${r.st}" data-i="${i}">
        <span class="nm">${esc(r.line)}</span>
        <span class="st">${esc(r.msg)}</span>
        ${r.st === 'done' ? '<button class="btn sm" type="button" data-act="open">열기</button>' : ''}
        ${r.st === 'err' ? '<button class="btn sm ghost" type="button" data-act="retry">다시</button>' : ''}
      </li>`).join('');
    const done = batch.rows.filter(r => r.st === 'done').length, err = batch.rows.filter(r => r.st === 'err').length;
    $('batchInfo').textContent = batch.rows.length ? `${batch.rows.length}개 중 완료 ${done}${err ? ` · 실패 ${err}` : ''}${batch.running ? ' · 만드는 중' : ''}` : '';
    $('btnBatchGo').hidden = batch.running;
    $('btnBatchStop').hidden = !batch.running;
    $('btnBatch').textContent = batch.running ? `목록으로 만들기 (${done}/${batch.rows.length})` : '목록으로 만들기 (AI)';
  }
  async function runBatch() {
    if (batch.running) return;
    batch.running = true; batch.stop = false; renderBatch();
    for (const r of batch.rows) {
      if (batch.stop) break;
      if (r.st !== 'wait') continue;
      r.st = 'run'; r.msg = '조사하고 쓰는 중…'; renderBatch();
      try {
        const brandKnown = r.brand && brandLib()[r.brand];
        const j = await MR.post({ action: 'accGen', line: r.line, brand: r.brand, kind: KINDS[r.kind].s3, needBrand: !brandKnown });
        const res = Object.assign({}, j.result, { _model: j.model });
        r.state = fromAi(res, r.kind, r.brand);
        r.label = saveDraft(r.state);
        const un = r.state.ai.unverified.length;
        r.st = 'done'; r.msg = `${j.sec != null ? j.sec : '?'}초${un ? ` · 확인 ${un}건` : ''}`;
      } catch (e) {
        r.st = 'err'; r.msg = e.message || '실패';
      }
      renderBatch();
    }
    batch.running = false; renderBatch();
    const done = batch.rows.filter(r => r.st === 'done');
    if (done.length) toast(`${done.length}개를 만들어 초안에 저장했습니다. 열기로 확인해 주세요`);
  }
  $('btnBatch').addEventListener('click', () => { renderBatch(); $('dlgBatch').showModal(); });
  $('btnBatchGo').addEventListener('click', () => {
    const lines = $('batchIn').value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!lines.length && !batch.rows.some(r => r.st === 'wait')) { toast('제품을 한 줄에 하나씩 넣어 주세요'); return; }
    if (lines.length > 30) { toast('한 번에 30개까지 만들 수 있습니다'); return; }
    const kind = +$('batchKind').value || 0, brand = $('batchBrand').value.trim();
    batch.rows = batch.rows.filter(r => r.st === 'done' || r.st === 'wait').concat(lines.map(line => ({ line, kind, brand, st: 'wait', msg: '대기' })));
    $('batchIn').value = '';
    runBatch();
  });
  $('btnBatchStop').addEventListener('click', () => { batch.stop = true; toast('지금 만드는 제품까지 끝내고 멈춥니다'); });
  $('batchList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const r = batch.rows[+b.closest('li').dataset.i]; if (!r) return;
    if (b.dataset.act === 'open' && r.state) {
      st = normalize(JSON.parse(JSON.stringify(r.state))) || DEF(); renderAll();
      $('dlgBatch').close(); toast(`'${r.label}'을 열었습니다. 확인할 것을 보고 코드를 복사하세요`);
    }
    if (b.dataset.act === 'retry') { r.st = 'wait'; r.msg = '대기'; runBatch(); }
  });
  window.addEventListener('beforeunload', e => { if (batch.running) { e.preventDefault(); e.returnValue = ''; } });

  let tt = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // 콘솔 확인용
  window.RubiAccordion = { build: () => build(false), importHtml, blocks, state: () => st, fromAi };

  renderAll();
})();
