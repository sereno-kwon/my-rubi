/* My Rubi 지오메트리 (my.rubiworkshop.com/geometry/)
   BikeCAD Pro의 화면 짜임(메뉴바, 두 줄 툴바, 흰 도면, 부품별로 떠 있는 대화상자)을 따른 프레임 지오메트리 도구.
   - 기본 치수: BikeCAD처럼 드롭다운으로 기준을 고르면(리치/유효 탑튜브/프론트 센터 등) 그 값이 고정되고 나머지가 계산됨
   - 원점은 BB 중심, 단위 mm, y는 위쪽이 +
   - 저장: 이 브라우저(localStorage). 파일(.json)로 내보내고 가져오며, BikeCAD 파일(.bcad)도 기본 치수를 읽어옴 */
(() => {
'use strict';

// ─────────── 기본 ───────────
const $ = s => document.querySelector(s);
const D = Math.PI / 180;
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => Math.round(v * 10) / 10;
const LS_CUR = 'myrubi.geo.cur.v1', LS_LIB = 'myrubi.geo.lib.v1', LS_VIEW = 'myrubi.geo.view.v1', LS_DLG = 'myrubi.geo.dlg.v1';
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const FONT = 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

// 기본 자전거: BikeCAD Pro 19 기본 도면과 같은 기본 치수 (안장 718, 시트 74°, 헤드 73°, 리치 392.3, 스택 565.6 …)
const DEF = {
  name: '새 자전거', brand: '', model: '', size: '', note: '',
  saddleMode: 'bb', saddleVal: 718, seatAngle: 74,
  stMode: 'cc', stVal: 466, bbMode: 'drop', bbVal: 70, csMode: 'len', csVal: 405,
  headAngle: 73, reachMode: 'reach', reachVal: 392.3, stackMode: 'stack', stackVal: 565.6,
  htTopExt: 28.9, htBotExt: 49.2, stExt: 49.2,
  rearBSD: 622, rearTire: 26, frontBSD: 622, frontTire: 26, sameWheels: true, spokes: 32, rimDepth: 20,
  forkType: 'curved', forkLen: 375, rake: 45, bladeDia: 28,
  lowerStack: 12, upperStack: 16, spacers: 10, stemLen: 100, stemAngle: -5, stemH: 40,
  barType: 'drop', barReach: 80, barDrop: 125, barWidth: 420, barRise: 0, barSweep: 0,
  saddleLen: 270, saddleRail: 0, postSetback: 21, postDia: 27.2,
  crankLen: 172.5, ring: 50, cog: 15, crankAng: 0, showChain: true,
  ttDia: 31.8, dtDia: 34.9, stDia: 28.6, htDia: 40, csDia: 22, ssDia: 16, ssDrop: 18,
  frameColor: '#1597d0', forkSame: false, forkColor: '#151515', compColor: '#3a3a3a', tireColor: '#1e1e1e', tanwall: false, rimColor: '#707070', decal: '', decalColor: '#ffffff',
};

// 템플릿 (예시 치수, 특정 브랜드 제품이 아님)
const TEMPLATES = [
  { id: 'road', name: '예시 · 로드 54', b: {} },
  { id: 'gravel', name: '예시 · 그래블 54', b: { seatAngle: 73.5, stVal: 500, bbVal: 75, csVal: 430, headAngle: 71, reachVal: 380, stackVal: 585, rearTire: 40, frontTire: 40, forkLen: 395, rake: 50, stemLen: 90, stemAngle: -6, ring: 40, cog: 20, saddleVal: 712, htTopExt: 30, htBotExt: 40 } },
  { id: 'atb', name: '예시 · 투어링 ATB 26"', b: { rearBSD: 559, frontBSD: 559, rearTire: 50, frontTire: 50, seatAngle: 73, stVal: 430, bbVal: 60, csVal: 450, headAngle: 70, reachVal: 395, stackVal: 600, forkLen: 425, rake: 44, barType: 'swept', barRise: 30, barSweep: 120, stemLen: 80, stemAngle: 6, ring: 36, cog: 24, saddleVal: 700, crankLen: 170 } },
  { id: 'mini', name: '예시 · 미니벨로 20" (451)', b: { rearBSD: 451, frontBSD: 451, rearTire: 28, frontTire: 28, bbMode: 'height', bbVal: 275, csVal: 400, seatAngle: 73, stVal: 470, headAngle: 72, reachVal: 385, stackMode: 'ht', stackVal: 175, forkLen: 330, rake: 45, stemLen: 90, stemAngle: 0, saddleVal: 705, ring: 53, cog: 13, crankLen: 165, htTopExt: 30, htBotExt: 35 } },
];

// ─────────── 계산 ───────────
const v2 = (x, y) => ({ x, y });
const add = (a, b) => v2(a.x + b.x, a.y + b.y);
const sub = (a, b) => v2(a.x - b.x, a.y - b.y);
const mul = (a, k) => v2(a.x * k, a.y * k);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = a => Math.hypot(a.x, a.y);
const nrmz = a => { const l = len(a) || 1; return v2(a.x / l, a.y / l); };
const rot90 = a => v2(-a.y, a.x);
const O = v2(0, 0);

function solve(b) {
  const w = [];
  const sa = b.seatAngle * D, ha = b.headAngle * D;
  const Rr = b.rearBSD / 2 + b.rearTire, Rf = b.frontBSD / 2 + b.frontTire;
  const d = b.bbMode === 'height' ? Rr - b.bbVal : b.bbVal;     // 뒷바퀴 축이 BB보다 높은 정도
  const yg = d - Rr, yf = yg + Rf;                                // 지면, 앞바퀴 축 높이
  const s = v2(-Math.cos(sa), Math.sin(sa));                      // 시트튜브 축 (BB → 위)
  const u = v2(Math.cos(ha), -Math.sin(ha));                      // 헤드튜브 축 (위 → 아래)
  const n = v2(Math.sin(ha), Math.cos(ha));                       // 조향축에 수직, 앞쪽
  // 뒷바퀴 축
  let rx;
  if (b.csMode === 'horiz') rx = -b.csVal;
  else if (b.csMode === 'gap') rx = -(b.csVal + Rr + b.stDia / 2 + Math.cos(sa) * d) / Math.sin(sa);
  else { const q = b.csVal * b.csVal - d * d; if (q <= 0) { w.push('체인스테이가 BB 드롭보다 짧습니다'); rx = -Math.abs(b.csVal); } else rx = -Math.sqrt(q); }
  const R = v2(rx, d);
  // 스택 → 헤드튜브 길이
  const fl = b.forkLen, rk = b.rake, ls = b.lowerStack;
  const stack = b.stackMode === 'ht' ? (b.stackVal + ls + fl) * Math.sin(ha) - rk * Math.cos(ha) + yf : b.stackVal;
  const Ltot = (stack + rk * Math.cos(ha) - yf) / Math.sin(ha);
  const ht = Ltot - ls - fl;
  if (ht < 40) w.push('헤드튜브 길이가 너무 짧습니다 (' + r1(ht) + ' mm)');
  // 리치
  let reach;
  if (b.reachMode === 'ett') reach = b.reachVal - stack / Math.tan(sa);
  else if (b.reachMode === 'fc') { const q = b.reachVal * b.reachVal - yf * yf; reach = (q > 0 ? Math.sqrt(q) : 0) - Ltot * Math.cos(ha) - rk * Math.sin(ha); }
  else reach = b.reachVal;
  const T = v2(reach, stack), B = add(T, mul(u, ht)), C = add(B, mul(u, ls));
  const Fa = add(C, mul(u, fl)), F = add(Fa, mul(n, rk));
  // 시트튜브
  const stCC = b.stMode === 'ct' ? b.stVal - b.stExt : b.stVal;
  const Jst = mul(s, stCC), stTop = mul(s, stCC + b.stExt);
  const Jtt = add(T, mul(u, b.htTopExt)), Jdt = add(B, mul(u, -b.htBotExt));
  const ssTop = mul(s, stCC - b.ssDrop);
  // 안장
  const saddleH = b.saddleMode === 'ground' ? (b.saddleVal + yg) / Math.sin(sa) : b.saddleVal;
  const Sa = mul(s, saddleH);                                     // 시트튜브 축과 안장 윗면이 만나는 점
  const Sx = Sa.x - b.postSetback + b.saddleRail;                 // 안장 레일 클램프 중심 (수평)
  const topY = Sa.y;
  const nose = v2(Sx + b.saddleLen * 0.52, topY), tail = v2(Sx - b.saddleLen * 0.48, topY);
  // 스템·핸들바
  const steerUp = mul(u, -1);
  const Q = add(T, mul(steerUp, b.upperStack + b.spacers + b.stemH / 2));
  const th = (90 - b.headAngle + b.stemAngle) * D;
  const E = add(Q, v2(b.stemLen * Math.cos(th), b.stemLen * Math.sin(th)));
  // 측정값
  const tt = sub(Jtt, Jst);
  const mid = mul(add(Jst, Jtt), 0.5);
  const sinH = Math.sin(ha);
  const gs = add(T, mul(u, (T.y - yg) / sinH));                   // 조향축이 지면과 만나는 점
  const fdir = nrmz(F);
  const m = {
    stack, reach, ett: reach + stack / Math.tan(sa), htLen: ht, seatAngle: b.seatAngle, headAngle: b.headAngle,
    stCC, stCT: stCC + b.stExt, csLen: len(R), rc: -R.x, csGap: (-Math.sin(sa) * R.x - Math.cos(sa) * d) - Rr - b.stDia / 2,
    bbDrop: d, bbH: -yg, wb: F.x - R.x, fc: len(F), fcH: F.x, trail: (Rf * Math.cos(ha) - rk) / sinH,
    forkLen: fl, rake: rk, ttLen: len(tt), ttAngle: Math.atan2(tt.y, tt.x) / D, dtLen: len(Jdt),
    standover: mid.y + b.ttDia / 2 - yg,
    saddleH, saddleGround: topY - yg, setback: -nose.x, effSA: Math.atan2(topY, -Sx) / D,
    barX: E.x, barY: E.y, s2b: E.x - nose.x, barDrop: topY - (E.y + 12),
    toe: len(F) - Rf - b.crankLen, wheelR: Rr, wheelF: Rf,
    hbStack: E.y, hbReach: E.x,
  };
  if (m.toe < 0) w.push('크랭크가 앞바퀴와 겹칩니다');
  if (m.csGap < 3 && b.csMode !== 'gap') w.push('뒷바퀴와 시트튜브 간격이 ' + r1(m.csGap) + ' mm 입니다');
  return { b, m, w, sa, ha, s, u, n, R, F, Fa, T, B, C, Jst, Jtt, Jdt, stTop, ssTop, Sa, Sx, topY, nose, tail, Q, E, th, yg, yf, Rr, Rf, mid, gs, fdir, stCC, saddleH };
}

// 드롭다운으로 기준을 바꿀 때, 지금 도면을 그대로 두는 값
const EQUIV = {
  reach: (g, md) => md === 'ett' ? g.m.ett : md === 'fc' ? g.m.fc : g.m.reach,
  stack: (g, md) => md === 'ht' ? g.m.htLen : g.m.stack,
  bb:    (g, md) => md === 'height' ? g.m.bbH : g.m.bbDrop,
  cs:    (g, md) => md === 'horiz' ? g.m.rc : md === 'gap' ? g.m.csGap : g.m.csLen,
  st:    (g, md) => md === 'ct' ? g.m.stCT : g.m.stCC,
  saddle:(g, md) => md === 'ground' ? g.m.saddleGround : g.m.saddleH,
};

// ─────────── 상태 ───────────
let bike = Object.assign(clone(DEF), lsGet(LS_CUR, {}));
let G = solve(bike);
const viewDef = { mode: 'color', dims: ['stack', 'reach', 'ha', 'sa', 'cs', 'wb', 'bbdrop'], dimsOn: true, dimNames: true, units: 'mm', dec: 1, text: 13, ground: true, grid: false, hide: {}, dimOff: {} };
const view = Object.assign(clone(viewDef), lsGet(LS_VIEW, {}));
let compares = [];          // { id, name, bike, color, align, on }
let docState = lsGet('myrubi.geo.doc.v1', { libId: null, dirty: false });
const CMP_COLORS = ['#d0312d', '#e08a00', '#2a9d5b', '#7b4fc9', '#c2185b', '#00838f'];

// ─────────── 도면 그리기 ───────────
const svg = $('#cv');
let vb = { x: -900, y: -1100, w: 2000, h: 1200 }, scale = 1, fitted = false;
const P = p => `${r1(p.x)},${r1(-p.y)}`;
const ln = (a, b, w, c, cap = 'butt', ex = '') => `<line x1="${r1(a.x)}" y1="${r1(-a.y)}" x2="${r1(b.x)}" y2="${r1(-b.y)}" stroke="${c}" stroke-width="${r1(w * 100) / 100}" stroke-linecap="${cap}" ${ex}/>`;
const circ = (c, r, fill, st = 'none', sw = 0, ex = '') => `<circle cx="${r1(c.x)}" cy="${r1(-c.y)}" r="${r1(Math.max(r, 0))}" fill="${fill}" stroke="${st}" stroke-width="${sw}" ${ex}/>`;
const NS = 'vector-effect="non-scaling-stroke"';

function shade(hex, k) { // k<0 어둡게, k>0 밝게
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = n >> 16 & 255, g = n >> 8 & 255, bl = n & 255;
  const f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return '#' + [f(r), f(g), f(bl)].map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

function wheelSvg(c, bsd, tire, b, mode) {
  const rr = bsd / 2, out = rr + tire;
  if (mode !== 'color') {
    const st = mode === 'line' ? '#111' : '#111';
    return circ(c, out, 'none', st, 1.2, NS) + circ(c, rr, 'none', st, 1, NS) + circ(c, 6, 'none', st, 1, NS) + (mode === 'line' ? circ(c, rr - b.rimDepth, 'none', '#111', 0.8, NS) : '');
  }
  let s = '';
  const rimIn = rr - b.rimDepth;
  const N = b.spokes || 32;
  for (let i = 0; i < N; i++) {
    const a = i * 2 * Math.PI / N, sg = i % 2 ? 1 : -1;
    const h = add(c, v2(Math.cos(a) * 24, Math.sin(a) * 24));
    const a2 = a + sg * (3 * 2 * Math.PI / N) * 0.9;
    const e = add(c, v2(Math.cos(a2) * (rimIn + 1), Math.sin(a2) * (rimIn + 1)));
    s += ln(h, e, 1.6, '#8a8a8a');
  }
  s += circ(c, rr - b.rimDepth / 2, 'none', b.rimColor, b.rimDepth);
  s += circ(c, rr - 3, 'none', shade(b.rimColor, 0.45), 2.2);
  s += circ(c, rr + tire / 2, 'none', b.tireColor, tire);
  if (b.tanwall) s += circ(c, rr + tire * 0.3, 'none', '#c9a574', tire * 0.42);
  else s += circ(c, rr + tire * 0.32, 'none', '#3a3a3a', 1.2);
  s += circ(c, 26, '#a9a9a9', '#7a7a7a', 1.5) + circ(c, 9, '#5c5c5c');
  return s;
}

function bikeSvg(g, mode, opt = {}) {
  const b = g.b, hide = opt.ghost ? {} : view.hide, out = [];
  const fc = b.frameColor, oc = shade(fc, -0.38), kc = b.forkSame ? fc : b.forkColor, cc = b.compColor;
  const grp = (dlg, inner) => inner ? (opt.ghost ? inner : `<g class="hit" data-dlg="${dlg}">${inner}</g>`) : '';
  if (mode === 'center' || opt.ghost) {
    const col = opt.color || '#111', sw = opt.ghost ? 1.8 : 1.4, L = (a, c) => ln(a, c, sw, col, 'round', NS);
    let s = '';
    if (!hide.wheels) s += grp('wheels', `<g>${circ(g.R, g.Rr, 'none', col, sw, NS)}${circ(g.R, b.rearBSD / 2, 'none', col, 1, NS + ' stroke-dasharray="6 5"')}${circ(g.F, g.Rf, 'none', col, sw, NS)}${circ(g.F, b.frontBSD / 2, 'none', col, 1, NS + ' stroke-dasharray="6 5"')}</g>`);
    if (!hide.frame) s += grp('basic', [L(O, g.stTop), L(g.Jst, g.Jtt), L(O, g.Jdt), L(g.T, g.B), L(O, g.R), L(g.R, g.ssTop), circ(O, 5, col)].join(''));
    if (!hide.fork) s += grp('fork', L(g.B, g.C) + `<path d="M${P(g.C)} Q${P(add(g.C, mul(g.u, b.forkLen * 0.78)))} ${P(g.F)}" fill="none" stroke="${col}" stroke-width="${sw}" ${NS}/>` + L(g.C, g.Fa) + circ(g.F, 4, col) + circ(g.R, 4, col));
    if (!hide.stem) s += grp('stem', L(g.T, add(g.T, mul(g.u, -(b.upperStack + b.spacers + b.stemH)))) + L(g.Q, g.E));
    if (!hide.bar) s += grp('bar', barPath(g, col, sw, true));
    if (!hide.saddle) s += grp('saddle', L(g.stTop, g.Sa) + L(g.tail, g.nose) + circ(g.Sa, 3.5, col));
    if (!hide.crank) s += grp('crank', L(O, v2(b.crankLen * Math.cos(b.crankAng * D), b.crankLen * Math.sin(b.crankAng * D))) + circ(O, ringR(b.ring), 'none', col, 1, NS + ' stroke-dasharray="3 4"'));
    return s;
  }
  const line = mode === 'line';
  const tube = (a, c, dia, col) => line ? [ln(a, c, dia + 2.4 / scale, '#111'), ln(a, c, dia, '#fff')] : [ln(a, c, dia + 2.2 / scale * 1.4, shade(col, -0.38)), ln(a, c, dia, col)];
  // 바퀴
  if (!hide.wheels) out.push(grp('wheels', wheelSvg(g.R, b.rearBSD, b.rearTire, b, mode) + wheelSvg(g.F, b.frontBSD, b.frontTire, b, mode)));
  // 반대편 크랭크, 체인, 스프라켓 (프레임 뒤)
  if (!hide.crank) {
    const a = (b.crankAng + 180) * D, pe = v2(b.crankLen * Math.cos(a), b.crankLen * Math.sin(a));
    let s = ln(O, pe, 15, line ? '#bbb' : '#6d6d6d', 'round');
    const rc = ringR(b.cog), rr = ringR(b.ring);
    if (b.showChain) s += ln(v2(0, rr), add(g.R, v2(0, rc)), 5.5, line ? '#777' : '#4a4a4a', 'round', 'stroke-dasharray="7 3"') + ln(v2(0, -rr), add(g.R, v2(0, -rc)), 5.5, line ? '#777' : '#4a4a4a', 'round', 'stroke-dasharray="7 3"');
    s += circ(g.R, rc, 'none', line ? '#555' : '#8d8d8d', 7, 'stroke-dasharray="3 3"');
    out.push(grp('crank', s));
  }
  // 시트포스트
  if (!hide.post) {
    const pt = mul(g.s, g.saddleH - 55), K = v2(g.Sx, g.topY - 48);
    out.push(grp('post', ln(g.stTop, pt, b.postDia, line ? '#fff' : shade(cc, 0.12)) + (line ? ln(g.stTop, pt, 1, '#111', 'butt', NS) : '') + ln(pt, K, 20, line ? '#555' : shade(cc, 0.05), 'round')));
  }
  // 프레임
  if (!hide.frame) {
    const tubes = [
      [O, g.R, b.csDia], [g.R, g.ssTop, b.ssDia], [O, g.stTop, b.stDia], [O, g.Jdt, b.dtDia], [g.Jst, g.Jtt, b.ttDia], [g.T, g.B, b.htDia],
    ].map(t => tube(t[0], t[1], t[2], fc));
    let s = tubes.map(t => t[0]).join('') + tubes.map(t => t[1]).join('');
    s += circ(O, 22, line ? '#fff' : fc, line ? '#111' : oc, line ? 1.2 / scale : 1.6);
    s += circ(g.R, 15, line ? '#fff' : fc, line ? '#111' : oc, line ? 1.2 / scale : 1.6);
    // 시트 클램프
    s += ln(mul(g.s, g.stCC + b.stExt - 14), g.stTop, b.stDia + 7, line ? '#333' : shade(cc, 0.05));
    if (b.decal && !line) {
      const a = Math.atan2(-(g.Jdt.y), g.Jdt.x) / D, mp = mul(g.Jdt, 0.55);
      s += `<text x="${r1(mp.x)}" y="${r1(-mp.y)}" transform="rotate(${r1(a)} ${r1(mp.x)} ${r1(-mp.y)})" font-family="${FONT}" font-weight="700" font-size="${r1(b.dtDia * 0.56)}" fill="${b.decalColor}" text-anchor="middle" dominant-baseline="central" letter-spacing="1">${esc(b.decal)}</text>`;
    }
    out.push(grp('basic', s));
  }
  // 포크
  if (!hide.fork) {
    const kcol = line ? '#fff' : kc, ko = line ? '#111' : shade(kc === '#151515' ? '#555555' : kc, -0.35), crownEnd = add(g.C, mul(g.u, 24));
    let s = '';
    const legs = [];
    if (b.forkType === 'straight') legs.push(['l', crownEnd, g.F, b.bladeDia]);
    else if (b.forkType === 'susp') { const mp = add(g.C, add(mul(g.u, b.forkLen * 0.5), mul(g.n, b.rake * 0.5))); legs.push(['l', crownEnd, mp, 30], ['l', mp, g.F, 38]); }
    else legs.push(['q', crownEnd, g.F, b.bladeDia]);
    legs.forEach(L => {
      const w2 = L[3];
      if (L[0] === 'q') {
        const cp = add(g.C, mul(g.u, b.forkLen * 0.8));
        const d = `M${P(L[1])} Q${P(cp)} ${P(L[2])}`;
        s += `<path d="${d}" fill="none" stroke="${ko}" stroke-width="${r1(w2 + 2.5 / scale)}"/><path d="${d}" fill="none" stroke="${kcol}" stroke-width="${w2}"/>`;
        s += `<path d="${d}" fill="none" stroke="${kcol}" stroke-width="${w2 * 0.55}" stroke-linecap="round"/>`;
      } else s += ln(L[1], L[2], w2 + 2.5 / scale, ko) + ln(L[1], L[2], w2, kcol);
    });
    s += ln(g.C, crownEnd, 48, ko) + ln(add(g.C, mul(g.u, 1)), add(crownEnd, mul(g.u, -1)), 45, kcol);
    s += circ(g.F, 11, kcol, ko, 1.6);
    out.push(grp('fork', s));
  }
  // 헤드셋·스템
  if (!hide.stem) {
    const up = mul(g.u, -1), hs = line ? '#fff' : shade(cc, 0.1), hk = line ? '#111' : shade(cc, -0.3);
    const a0 = add(g.T, mul(up, b.upperStack)), a1 = add(a0, mul(up, b.spacers)), a2 = add(a1, mul(up, b.stemH)), a3 = add(a2, mul(up, 4));
    let s = ln(g.B, g.C, b.htDia + 4, hk) + ln(g.B, g.C, b.htDia + 1, hs) + ln(g.T, a0, b.htDia + 4, hk) + ln(g.T, a0, b.htDia + 1, hs);
    if (b.spacers > 0) s += ln(a0, a1, 33, hk) + ln(a0, a1, 31, line ? '#fff' : shade(cc, 0.05));
    s += ln(a1, a2, 42, hk) + ln(a1, a2, 39, line ? '#fff' : cc) + ln(a2, a3, 30, line ? '#555' : '#222');
    s += ln(g.Q, g.E, 33, hk) + ln(g.Q, g.E, 30, line ? '#fff' : cc) + circ(g.E, 20, line ? '#fff' : cc, hk, 1.6);
    out.push(grp('stem', s));
  }
  if (!hide.bar) out.push(grp('bar', barPath(g, line ? '#111' : '#1c1c1c', 23, false, line)));
  // 안장
  if (!hide.saddle) {
    const t = g.topY, x0 = g.tail.x, x1 = g.nose.x, L = b.saddleLen;
    const d = `M${x0},${-(t - 12)} C${x0},${-(t + 1)} ${x0 + 25},${-t} ${x0 + 45},${-t} L${x1 - 70},${-(t - 4)} C${x1 - 35},${-(t - 5)} ${x1 - 6},${-(t - 6)} ${x1},${-(t - 13)} C${x1 - 30},${-(t - 22)} ${x1 - L * 0.35},${-(t - 24)} ${x0 + L * 0.35},${-(t - 34)} C${x0 + 30},${-(t - 40)} ${x0 + 6},${-(t - 38)} ${x0},${-(t - 12)} Z`;
    const rail = ln(v2(g.Sx - 70, t - 34), v2(g.Sx + 75, t - 30), 6, line ? '#111' : '#777', 'round') + ln(v2(g.Sx - 70, t - 34), v2(g.Sx - 90, t - 28), 6, line ? '#111' : '#777', 'round') + ln(v2(g.Sx + 75, t - 30), v2(g.Sx + 105, t - 18), 6, line ? '#111' : '#777', 'round');
    out.push(grp('saddle', rail + `<path d="${d}" fill="${line ? '#fff' : '#161616'}" stroke="${line ? '#111' : '#000'}" stroke-width="${line ? 1.2 : 1}" ${line ? NS : ''}/>`));
  }
  // 크랭크 (드라이브 쪽, 맨 앞)
  if (!hide.crank) {
    const rr = ringR(b.ring), a = b.crankAng * D, pe = v2(b.crankLen * Math.cos(a), b.crankLen * Math.sin(a));
    const silver = line ? '#fff' : '#9b9b9b', dk = line ? '#111' : '#5e5e5e';
    let s = circ(O, rr, 'none', dk, 9, 'stroke-dasharray="3.2 3.2"') + circ(O, rr - 3, 'none', silver, 7);
    for (let i = 0; i < 4; i++) { const aa = a + Math.PI + (i - 1.5) * 72 * D * 0.98 + 36 * D; s += ln(O, v2((rr - 6) * Math.cos(aa), (rr - 6) * Math.sin(aa)), 13, silver, 'round'); }
    s += ln(O, pe, 19, dk, 'round') + ln(O, pe, 16, silver, 'round') + circ(O, 17, silver, dk, 1.4) + circ(O, 6, dk);
    const pd = 48;
    s += `<rect x="${r1(pe.x - pd)}" y="${r1(-pe.y - 9)}" width="${pd * 2}" height="18" fill="${line ? '#fff' : '#2c2c2c'}" stroke="${dk}" stroke-width="1"/>` + circ(pe, 7, silver, dk, 1);
    out.push(grp('crank', s));
  }
  return out.join('');
}

function ringR(t) { return t * 12.7 / (2 * Math.PI); }

function barPath(g, col, w, thin, line) {
  const b = g.b, E = g.E;
  if (b.barType === 'drop') {
    const R = b.barReach, Dp = b.barDrop;
    const d = `M${E.x - 12},${-E.y} L${E.x + R * 0.5},${-E.y} C${E.x + R * 0.85},${-E.y} ${E.x + R + 14},${-(E.y - Dp * 0.1)} ${E.x + R + 12},${-(E.y - Dp * 0.42)} C${E.x + R + 10},${-(E.y - Dp * 0.8)} ${E.x + R * 0.8},${-(E.y - Dp)} ${E.x + R * 0.35},${-(E.y - Dp)} L${E.x - 25},${-(E.y - Dp + 8)}`;
    if (thin) return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${NS}/>`;
    const hx = E.x + R * 0.86, hy = E.y;
    const hood = `M${hx - 8},${-(hy + 6)} C${hx + 8},${-(hy + 36)} ${hx + 32},${-(hy + 40)} ${hx + 44},${-(hy + 26)} C${hx + 52},${-(hy + 12)} ${hx + 46},${-(hy - 20)} ${hx + 36},${-(hy - 38)} L${hx + 22},${-(hy - 12)} Z`;
    const lever = `M${hx + 34},${-(hy - 30)} C${hx + 40},${-(hy - 70)} ${hx + 34},${-(hy - 110)} ${hx + 26},${-(hy - Dp * 0.95)}`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<path d="${lever}" fill="none" stroke="${line ? '#111' : '#4b4b4b'}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="${hood}" fill="${line ? '#fff' : '#262626'}" stroke="${line ? '#111' : '#000'}" stroke-width="1" ${NS}/>`;
  }
  const rise = b.barType === 'flat' ? 0 : b.barRise, back = b.barType === 'flat' ? Math.min(b.barSweep, 40) : b.barSweep;
  const Gp = v2(E.x - back, E.y + rise), c1 = v2(E.x + 20, E.y + rise * 0.6), c2 = v2(Gp.x + back * 0.6, Gp.y + 6);
  const d = `M${P(E)} C${P(c1)} ${P(c2)} ${P(Gp)}`;
  if (thin) return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${NS}/>` + circ(Gp, 4, col);
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>` + circ(Gp, 17, line ? '#fff' : '#2a2a2a', line ? '#111' : '#000', 1) + (b.barType !== 'flat' ? '' : '');
}

// ─────────── 치수 ───────────
const fmtL = v => view.units === 'in' ? (v / 25.4).toFixed(Math.min(3, view.dec + 1)) + '"' : v.toFixed(view.dec);
const fmtA = v => v.toFixed(view.dec) + '°';
const fmt = (v, kind) => kind === 'a' ? fmtA(v) : fmtL(v);

const DIMS = [
  // id, 탭, 이름, 종류, 값, 그리기
  { id: 'stack', cat: '프레임', name: '스택', k: 'l', v: g => g.m.stack, draw: g => dimLin('stack', O, g.T, v2(0, 1), v2(g.T.x + 70, 0)) },
  { id: 'reach', cat: '프레임', name: '리치', k: 'l', v: g => g.m.reach, draw: g => dimLin('reach', O, g.T, v2(1, 0), v2(0, g.T.y + 150)) },
  { id: 'ett', cat: '프레임', name: '유효 탑튜브', k: 'l', v: g => g.m.ett, draw: g => dimLin('ett', v2(-g.T.y / Math.tan(g.sa), g.T.y), g.T, v2(1, 0), v2(0, g.T.y + 60)) },
  { id: 'ht', cat: '프레임', name: '헤드튜브 길이', k: 'l', v: g => g.m.htLen, draw: g => dimLin('ht', g.T, g.B, g.u, add(g.T, mul(g.n, 60))) },
  { id: 'stcc', cat: '프레임', name: '시트튜브 (c-c)', k: 'l', v: g => g.m.stCC, draw: g => dimLin('stcc', O, g.Jst, g.s, mul(rot90(g.s), 55)) },
  { id: 'stct', cat: '프레임', name: '시트튜브 (c-t)', k: 'l', v: g => g.m.stCT, draw: g => dimLin('stct', O, g.stTop, g.s, mul(rot90(g.s), 95)) },
  { id: 'sa', cat: '프레임', name: '시트 각도', k: 'a', v: g => g.m.seatAngle, draw: g => dimAng('sa', O, Math.PI - g.sa, Math.PI, 125, true) },
  { id: 'ha', cat: '프레임', name: '헤드 각도', k: 'a', v: g => g.m.headAngle, draw: g => ln(g.C, g.gs, 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + dimAng('ha', g.gs, Math.PI - g.ha, Math.PI, 110, true) },
  { id: 'tta', cat: '프레임', name: '탑튜브 각도', k: 'a', v: g => g.m.ttAngle, draw: g => dimAng('tta', g.Jst, 0, g.m.ttAngle * D, 120, true) },
  { id: 'ttcc', cat: '프레임', name: '탑튜브 (c-c)', k: 'l', v: g => g.m.ttLen, draw: g => dimLin('ttcc', g.Jst, g.Jtt, nrmz(sub(g.Jtt, g.Jst)), add(g.Jst, mul(rot90(nrmz(sub(g.Jtt, g.Jst))), -60))) },
  { id: 'cs', cat: '프레임', name: '체인스테이', k: 'l', v: g => g.m.csLen, draw: g => dimLin('cs', g.R, O, nrmz(sub(O, g.R)), add(g.R, mul(rot90(nrmz(sub(O, g.R))), -60))) },
  { id: 'rc', cat: '프레임', name: '리어 센터 (수평)', k: 'l', v: g => g.m.rc, draw: g => dimLin('rc', g.R, O, v2(1, 0), v2(0, g.yg - 30)) },
  { id: 'bbdrop', cat: '프레임', name: 'BB 드롭', k: 'l', v: g => g.m.bbDrop, draw: g => ln(g.R, v2(60, g.R.y), 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + dimLin('bbdrop', v2(0, g.R.y), O, v2(0, 1), v2(g.R.x + 40, 0)) },
  { id: 'bbh', cat: '프레임', name: 'BB 높이', k: 'l', v: g => g.m.bbH, draw: g => dimLin('bbh', v2(0, g.yg), O, v2(0, 1), v2(95, 0)) },
  { id: 'wb', cat: '프레임', name: '휠베이스', k: 'l', v: g => g.m.wb, draw: g => dimLin('wb', g.R, g.F, v2(1, 0), v2(0, g.yg - 70)) },
  { id: 'fc', cat: '프레임', name: '프론트 센터', k: 'l', v: g => g.m.fc, draw: g => dimLin('fc', O, g.F, g.fdir, mul(rot90(g.fdir), -45)) },
  { id: 'so', cat: '프레임', name: '스탠드오버', k: 'l', v: g => g.m.standover, draw: g => dimLin('so', v2(g.mid.x, g.yg), v2(g.mid.x, g.mid.y + g.b.ttDia / 2), v2(0, 1), v2(g.mid.x + 40, 0)) },
  { id: 'csgap', cat: '프레임', name: '뒷타이어-시트튜브 간격', k: 'l', v: g => g.m.csGap, draw: null },
  { id: 'dt', cat: '프레임', name: '다운튜브 길이', k: 'l', v: g => g.m.dtLen, draw: g => dimLin('dt', O, g.Jdt, nrmz(g.Jdt), mul(rot90(nrmz(g.Jdt)), -50)) },
  { id: 'fork', cat: '앞바퀴·포크', name: '포크 길이 (축-크라운)', k: 'l', v: g => g.m.forkLen, draw: g => dimLin('fork', g.C, g.Fa, g.u, add(g.C, mul(g.n, g.b.rake + 70))) },
  { id: 'rake', cat: '앞바퀴·포크', name: '포크 오프셋 (레이크)', k: 'l', v: g => g.m.rake, draw: g => ln(g.C, g.Fa, 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + dimLin('rake', g.Fa, g.F, g.n, add(g.F, mul(g.u, 55))) },
  { id: 'trail', cat: '앞바퀴·포크', name: '트레일', k: 'l', v: g => g.m.trail, draw: g => ln(g.F, v2(g.F.x, g.yg), 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + ln(g.C, g.gs, 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + dimLin('trail', g.gs, v2(g.F.x, g.yg), v2(1, 0), v2(0, g.yg - 30)) },
  { id: 'fch', cat: '앞바퀴·포크', name: '프론트 센터 (수평)', k: 'l', v: g => g.m.fcH, draw: g => dimLin('fch', O, g.F, v2(1, 0), v2(0, g.yg - 30)) },
  { id: 'toe', cat: '앞바퀴·포크', name: '크랭크 끝-앞타이어 간격', k: 'l', v: g => g.m.toe, draw: g => dimLin('toe', mul(g.fdir, g.b.crankLen), sub(g.F, mul(g.fdir, g.Rf)), g.fdir, mul(rot90(g.fdir), 40)) },
  { id: 'sh', cat: '핏', name: '안장 높이 (BB 기준)', k: 'l', v: g => g.m.saddleH, draw: g => dimLin('sh', O, g.Sa, g.s, mul(rot90(g.s), -70)) },
  { id: 'shg', cat: '핏', name: '안장 높이 (지면 기준)', k: 'l', v: g => g.m.saddleGround, draw: g => dimLin('shg', v2(g.tail.x, g.yg), v2(g.tail.x, g.topY), v2(0, 1), v2(g.tail.x - 50, 0)) },
  { id: 'setback', cat: '핏', name: '안장 셋백 (코 기준)', k: 'l', v: g => g.m.setback, draw: g => dimLin('setback', g.nose, O, v2(1, 0), v2(0, g.topY + 70)) },
  { id: 's2b', cat: '핏', name: '안장 코-핸들바 거리', k: 'l', v: g => g.m.s2b, draw: g => dimLin('s2b', g.nose, g.E, v2(1, 0), v2(0, g.topY + 130)) },
  { id: 'bdrop', cat: '핏', name: '안장-핸들바 높이 차', k: 'l', v: g => g.m.barDrop, draw: g => dimLin('bdrop', g.nose, v2(g.E.x, g.E.y + 12), v2(0, 1), v2(g.E.x + (g.b.barType === 'drop' ? g.b.barReach : 0) + 70, 0)) },
  { id: 'hbx', cat: '핏', name: '핸들바 리치 (BB→바 X)', k: 'l', v: g => g.m.barX, draw: g => dimLin('hbx', O, g.E, v2(1, 0), v2(0, g.topY + 190)) },
  { id: 'hby', cat: '핏', name: '핸들바 스택 (BB→바 Y)', k: 'l', v: g => g.m.barY, draw: g => dimLin('hby', O, g.E, v2(0, 1), v2(g.E.x + (g.b.barType === 'drop' ? g.b.barReach : 0) + 130, 0)) },
  { id: 'esa', cat: '핏', name: '유효 시트 각도', k: 'a', v: g => g.m.effSA, draw: g => ln(O, v2(g.Sx, g.topY), 1, '#666', 'butt', NS + ' stroke-dasharray="5 4"') + dimAng('esa', O, Math.atan2(g.topY, g.Sx), Math.PI, 210, false) },
];
const DIM_BY = Object.fromEntries(DIMS.map(d => [d.id, d]));

let exporting = false;
const tScale = () => exporting ? 1 : Math.max(0.7, Math.min(1, (svg.clientWidth || 1200) / 1100));   // 좁은 화면에서는 치수 글자를 조금 작게
function dimText(id, pos, ang, val, name, above) {
  const fs = view.text * tScale() / scale, t = view.dimNames && name ? `${name} ${val}` : val;
  return `<text x="${r1(pos.x)}" y="${r1(-pos.y)}" transform="rotate(${r1(ang)} ${r1(pos.x)} ${r1(-pos.y)})" font-family="${FONT}" font-size="${(fs).toFixed(2)}" fill="#111" text-anchor="middle" dy="${above ? '-0.4em' : '0.35em'}" stroke="#fff" stroke-width="${(4 / scale).toFixed(2)}" paint-order="stroke" stroke-linejoin="round">${esc(t)}</text>`;
}
function arrow(at, dir) { // at = 끝점, dir = 화살표가 가리키는 방향
  const k = 1 / scale, L = 9 * k, W = 3.2 * k, bk = sub(at, mul(dir, L)), nn = rot90(dir);
  const a = add(bk, mul(nn, W)), c = sub(bk, mul(nn, W));
  return `<path d="M${P(at)} L${P(a)} L${P(c)} Z" fill="#111"/>`;
}
function dimLin(id, p1, p2, d, P0) {
  const k = 1 / scale, nr = rot90(d), off = view.dimOff[id] || 0;
  const base = add(P0, mul(nr, off));
  const q1 = add(p1, mul(nr, dot(sub(base, p1), nr))), q2 = add(p2, mul(nr, dot(sub(base, p2), nr)));
  const val = Math.abs(dot(sub(p2, p1), d)), def = DIM_BY[id];
  const ext = (p, q) => { const v = sub(q, p), l = len(v); if (l < 3 * k) return ''; const dv = mul(v, 1 / l); return ln(add(p, mul(dv, 3 * k)), add(q, mul(dv, 6 * k)), 1, '#555', 'butt', NS); };
  const dd = nrmz(sub(q2, q1));
  let s = ext(p1, q1) + ext(p2, q2) + ln(q1, q2, 1, '#111', 'butt', NS);
  if (len(sub(q2, q1)) > 22 * k) s += arrow(q1, mul(dd, -1)) + arrow(q2, dd);
  let ang = Math.atan2(-d.y, d.x) / D; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
  s += dimText(id, mul(add(q1, q2), 0.5), ang, fmt(val, 'l'), def && def.name, true);
  return `<g class="dimg" data-id="${id}" data-t="lin" data-nx="${nr.x}" data-ny="${nr.y}">${s}</g>`;
}
function dimAng(id, c, a0, a1, r0, refLine) {
  const k = 1 / scale, r = Math.max(30, r0 + (view.dimOff[id] || 0));
  const pa = add(c, v2(r * Math.cos(a0), r * Math.sin(a0))), pb = add(c, v2(r * Math.cos(a1), r * Math.sin(a1)));
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0, sweep = a1 > a0 ? 0 : 1;
  let s = `<path d="M${P(pa)} A${r1(r)},${r1(r)} 0 ${large} ${sweep} ${P(pb)}" fill="none" stroke="#111" stroke-width="1" ${NS}/>`;
  if (refLine) s += ln(c, add(c, v2((r + 14 * k) * Math.cos(a1), (r + 14 * k) * Math.sin(a1))), 1, '#555', 'butt', NS) + ln(c, add(c, v2((r + 14 * k) * Math.cos(a0), (r + 14 * k) * Math.sin(a0))), 1, '#555', 'butt', NS);
  const sg = a1 > a0 ? 1 : -1;
  s += arrow(pa, v2(-Math.sin(a0) * -sg, Math.cos(a0) * -sg)) + arrow(pb, v2(-Math.sin(a1) * sg, Math.cos(a1) * sg));
  const am = (a0 + a1) / 2, tp = add(c, v2((r + 14 * k) * Math.cos(am), (r + 14 * k) * Math.sin(am)));
  const val = Math.abs(a1 - a0) / D, def = DIM_BY[id];
  s += dimText(id, tp, 0, fmt(DIM_BY[id] ? DIM_BY[id].v(G) : val, 'a'), def && def.name);
  return `<g class="dimg" data-id="${id}" data-t="ang" data-cx="${c.x}" data-cy="${c.y}">${s}</g>`;
}

// ─────────── 화면 ───────────
function bounds(g) {
  const b = g.b, xs = [g.R.x - g.Rr, g.F.x + g.Rf, g.E.x + (b.barType === 'drop' ? b.barReach + 40 : 30), g.tail.x - 20];
  const ys = [g.yg, g.topY + 30, g.E.y + 40, add(g.T, mul(g.u, -(b.upperStack + b.spacers + b.stemH + 10))).y];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function fit() {
  const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return;
  const bb = bounds(G); compares.forEach(c => { if (!c.on) return; const g2 = c.g, sh = c.shift; const b2 = bounds(g2); bb.x0 = Math.min(bb.x0, b2.x0 + sh.x); bb.x1 = Math.max(bb.x1, b2.x1 + sh.x); bb.y0 = Math.min(bb.y0, b2.y0 + sh.y); bb.y1 = Math.max(bb.y1, b2.y1 + sh.y); });
  const pad = view.dimsOn && view.dims.length ? 0.16 : 0.07;
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0, W = w * (1 + pad * 2), H = h * (1 + pad * 2.4);
  const asp = r.width / r.height;
  let vw = W, vh = W / asp; if (vh < H) { vh = H; vw = H * asp; }
  vb = { x: (bb.x0 + bb.x1) / 2 - vw / 2, y: -((bb.y0 + bb.y1) / 2) - vh / 2, w: vw, h: vh };
  fitted = true; render();
}
function setVB() {
  const r = svg.getBoundingClientRect(); if (r.width) { vb.h = vb.w * r.height / r.width; scale = r.width / vb.w; }
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function render() {
  setVB();
  let s = '';
  if (view.grid) {
    const step = 100, x0 = Math.floor(vb.x / step) * step, y0 = Math.floor(vb.y / step) * step;
    let gs = '';
    for (let x = x0; x < vb.x + vb.w; x += step) gs += `<line x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}" stroke="${x === 0 ? '#c8d6e5' : '#eef1f4'}" stroke-width="1" ${NS}/>`;
    for (let y = y0; y < vb.y + vb.h; y += step) gs += `<line x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}" stroke="${y === 0 ? '#c8d6e5' : '#eef1f4'}" stroke-width="1" ${NS}/>`;
    s += `<g>${gs}</g>`;
  }
  if (view.ground) s += ln(v2(G.R.x - G.Rr - 200, G.yg), v2(G.F.x + G.Rf + 200, G.yg), 1, '#b9b9b9', 'butt', NS);
  // 비교 자전거는 뒤에
  compares.forEach(c => { if (c.on) s += `<g transform="translate(${r1(c.shift.x)},${r1(-c.shift.y)})" opacity=".95">${bikeSvg(c.g, 'center', { ghost: true, color: c.color })}</g>`; });
  s += `<g id="bk">${bikeSvg(G, view.mode)}</g>`;
  if (view.dimsOn) s += `<g id="dims">${view.dims.map(id => { const d = DIM_BY[id]; return d && d.draw ? d.draw(G) : ''; }).join('')}</g>`;
  svg.innerHTML = s;
  status();
}

let cursor = null;
function status() {
  const el = $('#status'); const parts = [];
  if (cursor) parts.push(`X ${fmtL(cursor.x)}  Y ${fmtL(cursor.y)}`);
  parts.push(`리치 ${fmtL(G.m.reach)} · 스택 ${fmtL(G.m.stack)} · 헤드 ${fmtA(G.m.headAngle)} · 트레일 ${fmtL(G.m.trail)}`);
  el.innerHTML = parts.map(p => `<span>${esc(p)}</span>`).join('') + G.w.map(w => `<span class="warn">${esc(w)}</span>`).join('');
}

// ─────────── 변경·되돌리기·저장 ───────────
let hist = [JSON.stringify(bike)], hi = 0, histT = 0, saveT = 0;
function changed(opts = {}) {
  G = solve(bike);
  compares.forEach(alignCmp);
  render();
  refreshDlgs(opts.except);
  docState.dirty = true; doc();
  clearTimeout(saveT); saveT = setTimeout(() => { lsSet(LS_CUR, bike); lsSet('myrubi.geo.doc.v1', docState); }, 250);
  if (!opts.noHist) { clearTimeout(histT); histT = setTimeout(pushHist, 450); }
}
function pushHist() {
  const j = JSON.stringify(bike); if (hist[hi] === j) return;
  hist = hist.slice(0, hi + 1); hist.push(j); if (hist.length > 120) hist.shift(); hi = hist.length - 1; tbState();
}
function undo() { pushHist(); if (hi > 0) { hi--; bike = JSON.parse(hist[hi]); changed({ noHist: true }); tbState(); } }
function redo() { if (hi < hist.length - 1) { hi++; bike = JSON.parse(hist[hi]); changed({ noHist: true }); tbState(); } }
function setBike(nb, keepDoc) {
  bike = Object.assign(clone(DEF), nb); G = solve(bike);
  hist = [JSON.stringify(bike)]; hi = 0;
  if (!keepDoc) docState = { libId: null, dirty: false };
  lsSet(LS_CUR, bike); lsSet('myrubi.geo.doc.v1', docState);
  refreshDlgs(); compares.forEach(alignCmp); fit(); doc(); tbState();
}
function saveView() { lsSet(LS_VIEW, view); }
function doc() {
  const lib = docState.libId ? libAll().find(x => x.id === docState.libId) : null;
  const sub2 = [bike.brand, bike.model, bike.size].filter(Boolean).join(' ');
  $('#doc').innerHTML = `<b>${esc(bike.name || '이름 없음')}</b>${sub2 ? `<span>${esc(sub2)}</span>` : ''}<span>${lib ? (docState.dirty ? '<span class="dirty">● 저장 안 한 변경</span>' : '라이브러리에 저장됨') : '라이브러리에 없음'}</span>`;
  document.title = `${bike.name || '지오메트리'} · My Rubi`;
}
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800); }

// ─────────── 라이브러리 (이 브라우저) ───────────
const libAll = () => lsGet(LS_LIB, []);
const libPut = list => lsSet(LS_LIB, list);
function libSave(asNew, meta) {
  const list = libAll(); const now = new Date().toISOString();
  if (meta) Object.assign(bike, meta);
  let it = !asNew && docState.libId ? list.find(x => x.id === docState.libId) : null;
  if (it) { it.bike = clone(bike); it.updated = now; }
  else { it = { id: uid(), bike: clone(bike), updated: now }; list.unshift(it); docState.libId = it.id; }
  libPut(list); docState.dirty = false; lsSet('myrubi.geo.doc.v1', docState); lsSet(LS_CUR, bike); doc(); refreshDlgs();
  toast('라이브러리에 저장했습니다');
}

// ─────────── 비교 ───────────
function alignCmp(c) {
  c.g = solve(Object.assign(clone(DEF), c.bike));
  c.shift = c.align === 'rear' ? sub(G.R, c.g.R) : c.align === 'front' ? sub(G.F, c.g.F) : c.align === 'ground' ? v2(0, G.yg - c.g.yg) : v2(0, 0);
}
function addCompare(nb, name) {
  const used = compares.map(c => c.color), color = CMP_COLORS.find(c => !used.includes(c)) || CMP_COLORS[compares.length % CMP_COLORS.length];
  const c = { id: uid(), name: name || nb.name || '비교', bike: clone(nb), color, align: 'bb', on: true };
  alignCmp(c); compares.push(c); render(); refreshDlgs(); toast(`비교에 넣었습니다: ${c.name}`);
}

// ─────────── 파일 ───────────
function download(name, data, type) {
  const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileBase = () => (bike.name || 'geometry').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'geometry';
function exportJson() { download(fileBase() + '.rubigeo.json', JSON.stringify({ type: 'myrubi-geometry', v: 1, bike }, null, 1), 'application/json'); }
function parseBcad(text, fname) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const e = {}; xml.querySelectorAll('entry').forEach(n => { e[n.getAttribute('key')] = n.textContent; });
  if (!Object.keys(e).length) throw new Error('BikeCAD 파일에서 값을 찾지 못했습니다');
  const num = (k, d) => { const v = parseFloat(e[k]); return isFinite(v) ? v : d; };
  const b = clone(DEF);
  b.name = (fname || 'BikeCAD').replace(/\.(bcad|xml)$/i, '');
  b.saddleVal = num('Saddle height', b.saddleVal); b.seatAngle = num('Seat angle', b.seatAngle);
  b.stVal = num('Seat tube length', b.stVal); b.headAngle = num('Head angle', b.headAngle);
  b.bbMode = num('BB measure style', 0) === 1 ? 'height' : 'drop'; b.bbVal = num('BB textfield', b.bbVal);
  const cst = num('CS measure style', 0); b.csMode = cst === 1 ? 'gap' : 'len'; b.csVal = num('CS textfield', b.csVal);
  const rs = num('Top tube front center measure style', 3);
  b.reachMode = rs === 0 ? 'ett' : rs === 1 ? 'fc' : 'reach'; b.reachVal = num('FCD textfield', b.reachVal);
  b.stackMode = 'stack'; b.stackVal = num('Stack', b.stackVal);
  b.htTopExt = num('Head tube upper extension2', b.htTopExt); b.htBotExt = num('Head tube lower extension2', b.htBotExt); b.stExt = num('Seat tube extension2', b.stExt);
  b.rearBSD = num('BSD rear', b.rearBSD); b.frontBSD = num('BSD front', b.frontBSD);
  b.rearTire = r1((num('Wheel diameter rear', b.rearBSD + 52) - b.rearBSD) / 2); b.frontTire = r1((num('Wheel diameter front', b.frontBSD + 52) - b.frontBSD) / 2);
  b.sameWheels = b.rearBSD === b.frontBSD && b.rearTire === b.frontTire;
  const ft = num('Fork type', 0); b.forkLen = num('FORK' + ft + 'L', num('FORK0L', b.forkLen)); b.rake = num('FORK' + ft + 'R', num('FORK0R', b.rake));
  b.lowerStack = num('Lower stack height', b.lowerStack); b.upperStack = num('Upper stack height', b.upperStack); b.spacers = num('Headset spacers', b.spacers);
  b.stemLen = num('Stem length', b.stemLen); b.stemAngle = num('Stem angle', b.stemAngle);
  b.barReach = num('Road bar reach', b.barReach); b.barDrop = num('Road bar drop', b.barDrop); b.barWidth = num('Handlebar width', b.barWidth);
  b.crankLen = num('Crank length', b.crankLen); b.postSetback = num('Seatpost setback', b.postSetback);
  b.ttDia = num('Top tube diameter', b.ttDia); b.dtDia = num('Down tube diameter', b.dtDia); b.stDia = num('Seat tube diameter', b.stDia); b.htDia = Math.min(50, num('Head tube diameter', b.htDia));
  b.ring = num('Teeth on chainring 0', b.ring) || b.ring;
  if (e['Head tube length textfield'] && Math.abs(solve(b).m.htLen - num('Head tube length textfield', 0)) > 2) { /* 헤드튜브 값이 맞지 않으면 스택을 그대로 둠 */ }
  return b;
}
function readFiles(files, mode) {
  [...files].forEach(f => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const t = String(rd.result).trim(); let list = [];
        if (/^[\[{]/.test(t)) {
          const j = JSON.parse(t);
          if (j.type === 'myrubi-geometry-library') list = j.items.map(x => Object.assign({}, x.bike));
          else if (j.bike) list = [j.bike]; else list = [j];
        } else list = [parseBcad(t, f.name)];
        if (mode === 'compare') list.forEach(b => addCompare(b, b.name));
        else if (mode === 'lib' || list.length > 1) {
          const all = libAll(); list.forEach(b => all.unshift({ id: uid(), bike: Object.assign(clone(DEF), b), updated: new Date().toISOString() })); libPut(all); refreshDlgs(); toast(`라이브러리에 ${list.length}개를 넣었습니다`);
          if (mode !== 'lib') setBike(list[0]);
        } else { setBike(list[0]); toast(`열었습니다: ${list[0].name || f.name}`); }
      } catch (err) { toast('파일을 읽지 못했습니다: ' + err.message); }
    };
    rd.readAsText(f);
  });
}
let fileMode = 'open';
function pickFile(mode) { fileMode = mode; const i = $('#fileIn'); i.value = ''; i.click(); }
$('#fileIn').onchange = e => readFiles(e.target.files, fileMode);

function exportSvgString(w) {
  const bb = bounds(G); const pad = 120;
  const x = bb.x0 - pad, y = -(bb.y1 + pad), W = bb.x1 - bb.x0 + pad * 2, H = bb.y1 - bb.y0 + pad * 2;
  const keep = { vb: { ...vb }, scale };
  vb = { x, y, w: W, h: H }; scale = w / W; exporting = true;
  let s = '';
  if (view.ground) s += ln(v2(G.R.x - G.Rr - 100, G.yg), v2(G.F.x + G.Rf + 100, G.yg), 1, '#b9b9b9', 'butt', NS);
  compares.forEach(c => { if (c.on) s += `<g transform="translate(${r1(c.shift.x)},${r1(-c.shift.y)})">${bikeSvg(c.g, 'center', { ghost: true, color: c.color })}</g>`; });
  s += bikeSvg(G, view.mode);
  if (view.dimsOn) s += view.dims.map(id => { const d = DIM_BY[id]; return d && d.draw ? d.draw(G) : ''; }).join('');
  vb = keep.vb; scale = keep.scale; exporting = false;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${W} ${H}" width="${w}" height="${Math.round(w * H / W)}"><rect x="${x}" y="${y}" width="${W}" height="${H}" fill="#fff"/>${s}</svg>`, w, h: Math.round(w * H / W) };
}
function exportPng() {
  const { svg: s, w, h } = exportSvgString(2400);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); c.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = fileBase() + '.png'; a.click(); }, 'image/png'); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
function exportSvg() { download(fileBase() + '.svg', exportSvgString(1600).svg, 'image/svg+xml'); }
function doPrint() {
  const { svg: s } = exportSvgString(1600);
  const meta = [bike.brand, bike.model, bike.size].filter(Boolean).join(' · ');
  $('#printArea').innerHTML = `<h1>${esc(bike.name || '지오메트리')}</h1><p class="meta">${esc(meta)}${meta ? ' · ' : ''}루비워크샵 · ${new Date().toLocaleDateString('ko-KR')}${bike.note ? ' · ' + esc(bike.note) : ''}</p>${s}<div class="pcols">${geoTable(true)}</div>`;
  setTimeout(() => window.print(), 50);
}

// ─────────── 지오메트리 표 ───────────
const ROWS = [
  ['프레임'], ['stack', '스택'], ['reach', '리치'], ['ett', '유효 탑튜브'], ['ttLen', '탑튜브 (c-c)'], ['ttAngle', '탑튜브 각도', 'a'], ['stCC', '시트튜브 (c-c)'], ['stCT', '시트튜브 (c-t)'],
  ['seatAngle', '시트 각도', 'a'], ['headAngle', '헤드 각도', 'a'], ['htLen', '헤드튜브 길이'], ['csLen', '체인스테이'], ['rc', '리어 센터 (수평)'], ['bbDrop', 'BB 드롭'], ['bbH', 'BB 높이'],
  ['wb', '휠베이스'], ['fc', '프론트 센터'], ['standover', '스탠드오버'], ['csGap', '뒷타이어-시트튜브 간격'],
  ['앞바퀴·포크'], ['forkLen', '포크 길이 (축-크라운)'], ['rake', '포크 오프셋'], ['trail', '트레일'], ['toe', '크랭크 끝-앞타이어 간격'],
  ['핏'], ['saddleH', '안장 높이 (BB 기준)'], ['saddleGround', '안장 높이 (지면 기준)'], ['setback', '안장 셋백 (코 기준)'], ['effSA', '유효 시트 각도', 'a'], ['hbReach', '핸들바 리치 (BB→바)'], ['hbStack', '핸들바 스택 (BB→바)'], ['s2b', '안장 코-핸들바 거리'], ['barDrop', '안장-핸들바 높이 차'],
];
const SPEC = b => [
  ['바퀴', `${b.rearBSD}×${b.rearTire}` + (b.frontBSD !== b.rearBSD || b.frontTire !== b.rearTire ? ` / ${b.frontBSD}×${b.frontTire}` : '')],
  ['스템', `${b.stemLen} mm ${b.stemAngle > 0 ? '+' : ''}${b.stemAngle}° · 스페이서 ${b.spacers}`],
  ['핸들바', b.barType === 'drop' ? `드롭 리치 ${b.barReach} · 드롭 ${b.barDrop}` : `${{ flat: '플랫', riser: '라이저', swept: '스웹트' }[b.barType]} 라이즈 ${b.barRise} · 뒤로 ${b.barSweep}`],
  ['크랭크', `${b.crankLen} mm · ${b.ring}T/${b.cog}T`],
];
function geoTable(print) {
  const cols = [{ name: bike.name || '현재', g: G, color: '#111' }].concat(compares.filter(c => c.on).map(c => ({ name: c.name, g: c.g, color: c.color })));
  let h = `<table class="gtab"><thead><tr><th>치수</th>${cols.map(c => `<th><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
  ROWS.forEach(r => {
    if (r.length === 1) { h += `<tr class="sec"><td colspan="${cols.length + 1}">${r[0]}</td></tr>`; return; }
    const kind = r[2] || 'l', v0 = cols[0].g.m[r[0]];
    h += `<tr><td class="k">${r[1]}</td>${cols.map((c, i) => { const v = c.g.m[r[0]]; let dd = ''; if (i && isFinite(v0)) { const df = v - v0; if (Math.abs(df) >= 0.05) dd = `<span class="d ${df > 0 ? 'p' : 'm'}">${df > 0 ? '+' : ''}${kind === 'a' ? df.toFixed(1) + '°' : fmtL(df)}</span>`; } return `<td>${fmt(v, kind)}${dd}</td>`; }).join('')}</tr>`;
  });
  h += `<tr class="sec"><td colspan="${cols.length + 1}">구성</td></tr>`;
  SPEC(bike).forEach((r, i) => { h += `<tr><td class="k">${r[0]}</td>${cols.map(c => `<td>${esc(SPEC(c.g.b)[i][1])}</td>`).join('')}</tr>`; });
  return h + '</tbody></table>' + (print ? '' : '');
}
function geoTsv() {
  const cols = [{ name: bike.name || '현재', g: G }].concat(compares.filter(c => c.on).map(c => ({ name: c.name, g: c.g })));
  const lines = [['치수'].concat(cols.map(c => c.name)).join('\t')];
  ROWS.forEach(r => { if (r.length === 1) return; lines.push([r[1]].concat(cols.map(c => r1(c.g.m[r[0]]))).join('\t')); });
  return lines.join('\n');
}

// ─────────── 대화상자 틀 ───────────
const dlgs = {};
let dlgPos = lsGet(LS_DLG, {}), zTop = 60, cascade = 0;
function openDlg(id) {
  const def = DLG[id]; if (!def) return;
  closeMenus();
  if (dlgs[id]) { front(dlgs[id].el); return; }
  const el = document.createElement('div'); el.className = 'dlg'; el.dataset.id = id;
  el.innerHTML = `<div class="dt"><span>${esc(def.title)}</span><button title="닫기" aria-label="닫기">×</button></div><div class="db"></div>`;
  $('#stage').appendChild(el);
  const body = el.querySelector('.db');
  const api = { el, body, refresh: () => {} };
  dlgs[id] = api;
  def.build(body, api);
  const st = $('#stage').getBoundingClientRect();
  const p = dlgPos[id] || { x: 8 + (cascade % 6) * 26, y: 8 + (cascade % 6) * 26 }; cascade++;
  el.style.left = Math.max(0, Math.min(p.x, st.width - 120)) + 'px'; el.style.top = Math.max(0, Math.min(p.y, st.height - 40)) + 'px';
  if (def.w) el.style.width = def.w + 'px';
  el.querySelector('.dt button').onclick = () => closeDlg(id);
  el.addEventListener('pointerdown', () => front(el));
  dragBar(el, id);
  front(el); api.refresh(); tbState();
}
function closeDlg(id) { const d = dlgs[id]; if (!d) return; d.el.remove(); delete dlgs[id]; tbState(); }
function front(el) { document.querySelectorAll('.dlg.front').forEach(x => x.classList.remove('front')); el.classList.add('front'); el.style.zIndex = ++zTop; }
function dragBar(el, id) {
  const bar = el.querySelector('.dt');
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop; bar.setPointerCapture(e.pointerId);
    const mv = ev => { el.style.left = Math.max(-el.offsetWidth + 80, ox + ev.clientX - sx) + 'px'; el.style.top = Math.max(0, oy + ev.clientY - sy) + 'px'; };
    const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); dlgPos[id] = { x: el.offsetLeft, y: el.offsetTop }; lsSet(LS_DLG, dlgPos); };
    bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
  });
}
function refreshDlgs(except) { Object.values(dlgs).forEach(d => d.refresh(except)); }

// 숫자 칸: Enter·포커스 이동 때 확정, 입력 중에도 바로 그림이 바뀜. ↑↓ (Shift ×10, Alt ×0.1), 마우스 휠
function num(get, set, o = {}) {
  const step = o.step || 1;
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'num' + (o.ro ? ' ro' : ''); inp.inputMode = 'decimal'; inp.spellcheck = false; if (o.ro) inp.readOnly = true;
  if (o.w) inp.style.width = o.w + 'px';
  const show = () => { if (document.activeElement !== inp) { const v = get(); inp.value = v == null || !isFinite(v) ? '' : (o.int ? Math.round(v) : (o.dec != null ? (+v).toFixed(o.dec) : r1(v).toFixed(1))); inp.classList.remove('bad'); } };
  const apply = (v, live) => {
    if (!isFinite(v)) { inp.classList.add('bad'); return; }
    if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v);
    inp.classList.remove('bad'); set(v);
    if (o.local) show(); else changed({ except: inp, noHist: live });
  };
  if (!o.ro) {
    // BikeCAD처럼 Enter나 칸을 벗어날 때 확정 (입력 도중 '4'→'40'→'405'로 도면이 튀지 않게)
    inp.addEventListener('change', () => { apply(parseFloat(inp.value.replace(',', '.')), false); inp.blur(); show(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { inp.blur(); return; }
      if (e.key === 'Escape') { inp.blur(); show(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); const m = e.shiftKey ? 10 : e.altKey ? 0.1 : 1; const v = (parseFloat(inp.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * m;
        const vv = Math.round(v * 100) / 100; inp.value = o.int ? Math.round(vv) : vv; apply(vv, false);
      }
    });
    inp.addEventListener('wheel', e => { if (document.activeElement !== inp) return; e.preventDefault(); const v = (parseFloat(inp.value) || 0) + (e.deltaY < 0 ? 1 : -1) * step * (e.shiftKey ? 10 : 1); const vv = Math.round(v * 100) / 100; inp.value = vv; apply(vv, false); }, { passive: false });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  }
  inp._show = show; show();
  if (o.spin && !o.ro) {
    const w = document.createElement('span'); w.className = 'spin'; w.appendChild(inp);
    const sb = document.createElement('span'); sb.className = 'sb'; sb.innerHTML = '<button tabindex="-1">▲</button><button tabindex="-1">▼</button>';
    sb.children[0].onclick = () => { apply(r1((parseFloat(inp.value) || 0) + step), false); show(); };
    sb.children[1].onclick = () => { apply(r1((parseFloat(inp.value) || 0) - step), false); show(); };
    w.appendChild(sb); w._show = show; return w;
  }
  return inp;
}
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function row(label, ctrl, unit, left) { const r = el('div', 'row'); const l = el('span', 'lb' + (left ? ' l' : '')); if (label instanceof Node) l.appendChild(label); else l.textContent = label || ''; r.appendChild(l); if (ctrl) r.appendChild(ctrl); if (unit != null) r.appendChild(el('span', 'unit', unit)); return r; }
function combo(opts, get, set) {
  const s = document.createElement('select'); s.className = 'combo';
  s.innerHTML = opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
  s.value = get(); s.onchange = () => { set(s.value); s.blur(); };
  s._show = () => { if (document.activeElement !== s) s.value = get(); };
  return s;
}
function chk(label, get, set) { const l = el('label', 'chk'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!get(); c.onchange = () => set(c.checked); l.appendChild(c); l.appendChild(document.createTextNode(label)); l._show = () => { c.checked = !!get(); }; return l; }
function eyeBtn(part) {
  const b = el('button', 'eye'); b.title = '그림에서 보이기/숨기기';
  const paint = () => { b.innerHTML = eyeSvg(!view.hide[part]); };
  b.onclick = () => { view.hide[part] = !view.hide[part]; saveView(); paint(); render(); };
  paint(); b._show = paint; return b;
}
// 기준을 고르는 드롭다운 + 값 (BikeCAD 기본 치수 방식)
function modeNum(group, modeKey, valKey, opts, o = {}) {
  const wrap = el('div', 'row');
  const cb = combo(opts, () => bike[modeKey], md => { const v = EQUIV[group](G, md); bike[modeKey] = md; bike[valKey] = r1(v); changed(); });
  const n = num(() => bike[valKey], v => { bike[valKey] = v; }, o);
  const l = el('span', 'lb'); l.appendChild(cb); wrap.appendChild(l); wrap.appendChild(n); wrap.appendChild(el('span', 'unit', o.unit || 'mm'));
  wrap._show = () => { cb._show(); n._show(); };
  return wrap;
}
// 값 갱신 대상 모으기
function binder(api, root) {
  api.refresh = except => root.querySelectorAll('*').forEach(x => { if (x._show && x !== except && !(except && x.contains && x.contains(except) && x.classList.contains('spin'))) x._show(); });
}
function fieldN(label, key, unit = 'mm', o = {}) { return row(label, num(() => bike[key], v => { bike[key] = v; if (o.after) o.after(v); }, o), unit); }

// ─────────── 아이콘 ───────────
function eyeSvg(on) {
  return `<svg viewBox="0 0 40 24"><path d="M2 12C8 3 32 3 38 12 32 21 8 21 2 12Z" fill="#fff" stroke="#1b1b1b" stroke-width="1.6"/><circle cx="20" cy="12" r="7.2" fill="#2f78c4"/><circle cx="20" cy="12" r="5" fill="#5aa7ec"/><circle cx="20" cy="12" r="2.8" fill="#0d1b2a"/><circle cx="22" cy="10" r="1.3" fill="#fff"/>${on ? '' : '<path d="M5 3L35 21" stroke="#d0312d" stroke-width="3" stroke-linecap="round"/>'}</svg>`;
}
const BL = '#1d8fc9', DK = '#2b2b2b';
const ICONS = {
  new: `<svg viewBox="0 0 36 36"><path d="M8 3h14l6 6v24H8z" fill="#fff" stroke="${DK}" stroke-width="1.4"/><path d="M22 3v6h6" fill="none" stroke="${DK}" stroke-width="1.4"/><circle cx="14" cy="25" r="4" fill="none" stroke="${BL}" stroke-width="1.4"/><circle cx="24" cy="25" r="4" fill="none" stroke="${BL}" stroke-width="1.4"/><path d="M14 25l4-7h5l1 7M17 18l1 7" fill="none" stroke="${BL}" stroke-width="1.4"/></svg>`,
  open: `<svg viewBox="0 0 36 36"><path d="M3 9h11l3 3h15v18H3z" fill="#f2c45a" stroke="#9b7417" stroke-width="1.3"/><path d="M3 30l5-13h27l-3 13z" fill="#ffd877" stroke="#9b7417" stroke-width="1.3"/></svg>`,
  save: `<svg viewBox="0 0 36 36"><path d="M4 4h24l4 4v24H4z" fill="#3a6fb0" stroke="#1d3f6b" stroke-width="1.3"/><rect x="9" y="4" width="16" height="10" fill="#e9eef5"/><rect x="20" y="6" width="3" height="6" fill="#3a6fb0"/><rect x="8" y="19" width="20" height="13" fill="#fff"/><path d="M11 23h14M11 27h10" stroke="#9fb3cc" stroke-width="1.2"/></svg>`,
  lib: `<svg viewBox="0 0 36 36"><rect x="4" y="6" width="6" height="25" fill="${BL}" stroke="#155f86"/><rect x="11" y="4" width="6" height="27" fill="#d0312d" stroke="#8d1f1c"/><rect x="18" y="8" width="5" height="23" fill="#e0a21b" stroke="#8f6610"/><path d="M24 9l5-1 4 22-5 1z" fill="#2a9d5b" stroke="#1b6a3c"/><path d="M3 32h31" stroke="${DK}" stroke-width="1.4"/></svg>`,
  undo: `<svg viewBox="0 0 36 36"><path d="M10 15a10 10 0 1 1 3 12" fill="none" stroke="#7f7f7f" stroke-width="3.2" stroke-linecap="round"/><path d="M3 15l8-7v14z" fill="#7f7f7f"/></svg>`,
  redo: `<svg viewBox="0 0 36 36"><path d="M26 15a10 10 0 1 0-3 12" fill="none" stroke="#7f7f7f" stroke-width="3.2" stroke-linecap="round"/><path d="M33 15l-8-7v14z" fill="#7f7f7f"/></svg>`,
  mode: `<svg viewBox="0 0 36 36"><rect x="2" y="4" width="32" height="28" fill="#fff" stroke="#8aa2bd"/><path d="M4 30L10 12l6 10 5-14 6 8 5-4v18z" fill="#7aa9d6" stroke="#3a6fb0"/><path d="M4 30l6-9 6 4 6-10 10 9" fill="none" stroke="#1b1b1b" stroke-width="1.2"/></svg>`,
  grid: `<svg viewBox="0 0 36 36"><rect x="4" y="4" width="28" height="28" fill="#fff" stroke="#7a8a99"/><path d="M11 4v28M18 4v28M25 4v28M4 11h28M4 18h28M4 25h28" stroke="#b8c7d8"/></svg>`,
  dims: `<svg viewBox="0 0 36 36"><path d="M5 6v24M31 6v24" stroke="${DK}" stroke-width="1.6"/><path d="M5 18h26" stroke="${DK}" stroke-width="1.4"/><path d="M5 18l6-4v8zM31 18l-6-4v8z" fill="${DK}"/><text x="18" y="13" font-size="8" text-anchor="middle" font-family="sans-serif" fill="${DK}">mm</text></svg>`,
  table: `<svg viewBox="0 0 36 36"><rect x="4" y="5" width="28" height="26" fill="#fff" stroke="${DK}" stroke-width="1.3"/><rect x="4" y="5" width="28" height="6" fill="#cfdbe8" stroke="${DK}" stroke-width="1.3"/><path d="M4 17h28M4 24h28M14 5v26" stroke="${DK}" stroke-width="1"/><path d="M18 14h10M18 21h8M18 28h11" stroke="${BL}" stroke-width="1.6"/></svg>`,
  fit: `<svg viewBox="0 0 36 36"><circle cx="18" cy="8" r="5.2" fill="#1f4f86"/><path d="M6 34c0-11 4-17 12-17s12 6 12 17z" fill="#1f4f86"/><path d="M18 18l-5 9h10z" fill="#3c7cc5"/></svg>`,
  color: `<svg viewBox="0 0 36 36"><defs><radialGradient id="cw" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><g transform="translate(18 18)">${Array.from({ length: 12 }, (_, i) => `<path d="M0 0L${(15 * Math.cos(i * 30 * D)).toFixed(2)} ${(15 * Math.sin(i * 30 * D)).toFixed(2)}A15 15 0 0 1 ${(15 * Math.cos((i + 1) * 30 * D)).toFixed(2)} ${(15 * Math.sin((i + 1) * 30 * D)).toFixed(2)}Z" fill="hsl(${i * 30},85%,52%)"/>`).join('')}<circle r="15" fill="url(#cw)"/></g></svg>`,
  png: `<svg viewBox="0 0 36 36"><rect x="3" y="6" width="30" height="24" fill="#fff" stroke="${DK}" stroke-width="1.3"/><path d="M5 28l8-10 6 7 4-4 8 7z" fill="#5aa7ec"/><circle cx="25" cy="13" r="3" fill="#e0a21b"/></svg>`,
  print: `<svg viewBox="0 0 36 36"><rect x="9" y="3" width="18" height="10" fill="#fff" stroke="${DK}" stroke-width="1.3"/><rect x="3" y="12" width="30" height="13" rx="2" fill="#8c8c8c" stroke="#555"/><rect x="9" y="21" width="18" height="12" fill="#fff" stroke="${DK}" stroke-width="1.3"/><path d="M12 25h12M12 29h9" stroke="#999"/><circle cx="28" cy="16" r="1.5" fill="#6fd06f"/></svg>`,
  zoom: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="11" fill="#fff" stroke="#3a6fb0" stroke-width="2.6"/><path d="M18 2v6M18 28v6M2 18h6M28 18h6" stroke="#3a6fb0" stroke-width="2.6"/><path d="M18 1l-3 4h6zM18 35l-3-4h6zM1 18l4-3v6zM35 18l-4-3v6z" fill="#3a6fb0"/></svg>`,
  basic: `<svg viewBox="0 0 36 36"><path d="M5 27L13 11h17L20 27zM13 11l7 16M30 11l1-3" fill="none" stroke="${BL}" stroke-width="2.6" stroke-linejoin="round"/><path d="M3 27h18" stroke="${BL}" stroke-width="2.6"/></svg>`,
  wheels: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#222" stroke-width="3"/><circle cx="18" cy="18" r="12" fill="none" stroke="#8a8a8a" stroke-width="1.6"/>${Array.from({ length: 12 }, (_, i) => `<path d="M18 18L${(18 + 12 * Math.cos(i * 30 * D)).toFixed(2)} ${(18 + 12 * Math.sin(i * 30 * D)).toFixed(2)}" stroke="#777" stroke-width=".8"/>`).join('')}<circle cx="18" cy="18" r="2.6" fill="#555"/></svg>`,
  fork: `<svg viewBox="0 0 36 36"><path d="M11 3l3 1-1 6" stroke="#555" stroke-width="3"/><path d="M12 9c1 9 3 17 10 23" fill="none" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round"/><path d="M9 9h8" stroke="#1a1a1a" stroke-width="4"/><circle cx="23" cy="32" r="2.2" fill="#666"/></svg>`,
  stem: `<svg viewBox="0 0 36 36"><rect x="6" y="14" width="7" height="18" fill="#9a9a9a" stroke="#444"/><rect x="5" y="9" width="9" height="6" fill="#3d3d3d"/><rect x="5" y="15" width="9" height="3" fill="#6e6e6e"/><path d="M10 13l18-5" stroke="#3d3d3d" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="8" r="4.6" fill="#3d3d3d"/><circle cx="28" cy="8" r="2" fill="#9a9a9a"/></svg>`,
  bar: `<svg viewBox="0 0 36 36"><path d="M4 8h14c8 0 12 4 12 10s-4 11-11 11h-8" fill="none" stroke="#1d1d1d" stroke-width="4" stroke-linecap="round"/><path d="M19 4c4 0 7 3 7 8l-3 5-5-8z" fill="#3a3a3a"/></svg>`,
  saddle: `<svg viewBox="0 0 36 36"><path d="M3 13c0-4 4-4 8-4h9c6 0 11 1 13 3-5 1-8 4-15 6-6 2-14 1-15-5z" fill="#1d1d1d"/><path d="M9 19l2 4h12l3-6" fill="none" stroke="#777" stroke-width="1.6"/></svg>`,
  post: `<svg viewBox="0 0 36 36"><path d="M13 34l6-24" stroke="#8a8a8a" stroke-width="6"/><path d="M19 10l3-4" stroke="#555" stroke-width="5" stroke-linecap="round"/><path d="M14 6h16" stroke="#333" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  crank: `<svg viewBox="0 0 36 36"><circle cx="15" cy="17" r="12" fill="none" stroke="#5e5e5e" stroke-width="3" stroke-dasharray="2 1.6"/><circle cx="15" cy="17" r="9.5" fill="none" stroke="#a5a5a5" stroke-width="2.4"/><path d="M15 17l17 6" stroke="#5e5e5e" stroke-width="5" stroke-linecap="round"/><circle cx="15" cy="17" r="3.4" fill="#bdbdbd" stroke="#555"/><rect x="27" y="21" width="8" height="4" fill="#2c2c2c"/></svg>`,
  tubes: `<svg viewBox="0 0 36 36"><circle cx="11" cy="12" r="7.5" fill="#fff" stroke="${BL}" stroke-width="3"/><circle cx="25" cy="13" r="5.5" fill="#fff" stroke="${BL}" stroke-width="2.6"/><circle cx="16" cy="27" r="6.5" fill="#fff" stroke="${BL}" stroke-width="2.8"/></svg>`,
  compare: `<svg viewBox="0 0 36 36"><path d="M14 4h8v10h10v8H22v10h-8V22H4v-8h10z" fill="#1f4f86"/></svg>`,
  fitt: `<svg viewBox="0 0 36 36"><circle cx="13" cy="7" r="3.6" fill="#1f4f86"/><path d="M14 11l8 6h8M13 11l-3 11 6 5 1 6M10 22l-6 6" fill="none" stroke="#1f4f86" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ─────────── 대화상자 ───────────
const BSD = [[622, '700C · 29" (622)'], [584, '650B · 27.5" (584)'], [571, '650C (571)'], [559, '26" MTB (559)'], [507, '24" (507)'], [451, '20" 451'], [406, '20" 406'], [369, '17" 몰튼 (369)'], [355, '18" (355)'], [349, '16" 349'], [305, '16" 305']];
const DLG = {
  basic: { title: '기본 치수', w: 640, build(body, api) {
    const top = el('div', 'cols');
    const L = el('div'), Rt = el('div');
    const g1 = el('div', 'grp'); const head = el('div', 'row'); head.appendChild(eyeBtn('frame'));
    const sh = modeNum('saddle', 'saddleMode', 'saddleVal', [['bb', '안장 높이'], ['ground', '안장 높이 (지면 기준)']]); sh.style.flex = '1'; head.appendChild(sh);
    g1.appendChild(head);
    g1.appendChild(row('시트 각도', num(() => bike.seatAngle, v => { bike.seatAngle = v; }, { step: 0.5, spin: true, min: 55, max: 89 }), '°'));
    L.appendChild(g1);
    L.appendChild(modeNum('st', 'stMode', 'stVal', [['cc', '시트튜브 길이 (c-c)'], ['ct', '시트튜브 길이 (c-t)']]));
    L.appendChild(modeNum('bb', 'bbMode', 'bbVal', [['drop', 'BB 드롭'], ['height', 'BB 높이']]));
    L.appendChild(modeNum('cs', 'csMode', 'csVal', [['len', '체인스테이 길이'], ['horiz', '리어 센터 (수평)'], ['gap', '뒷타이어-시트튜브 간격']]));
    L.appendChild(row(icoExt('st'), num(() => bike.stExt, v => { bike.stExt = v; }), 'mm'));
    L.lastChild.title = '시트튜브 연장 (탑튜브 중심선 위로)';
    const g2 = el('div', 'grp');
    g2.appendChild(row('헤드 각도', num(() => bike.headAngle, v => { bike.headAngle = v; }, { step: 0.5, spin: true, min: 55, max: 85 }), '°'));
    Rt.appendChild(g2);
    const g3 = el('div', 'grp');
    g3.appendChild(modeNum('reach', 'reachMode', 'reachVal', [['reach', '리치'], ['ett', '유효 탑튜브 길이'], ['fc', '프론트 센터']]));
    g3.appendChild(modeNum('stack', 'stackMode', 'stackVal', [['stack', '스택'], ['ht', '헤드튜브 길이']]));
    Rt.appendChild(g3);
    const e1 = row(icoExt('ht'), num(() => bike.htTopExt, v => { bike.htTopExt = v; }), 'mm'); e1.title = '헤드튜브 윗끝에서 탑튜브 중심선까지';
    const e2 = row(icoExt('hb'), num(() => bike.htBotExt, v => { bike.htBotExt = v; }), 'mm'); e2.title = '헤드튜브 아랫끝에서 다운튜브 중심선까지';
    Rt.appendChild(e1); Rt.appendChild(e2);
    top.appendChild(L); top.appendChild(Rt); body.appendChild(top);
    const out = el('div', 'grp'); out.innerHTML = '<div class="gt">계산값</div>';
    const ro = (lbl, f, u = 'mm') => row(lbl, num(f, () => {}, { ro: true }), u);
    const oc = el('div', 'cols'); const o1 = el('div'), o2 = el('div'), o3 = el('div');
    o1.appendChild(ro('헤드튜브', () => G.m.htLen)); o1.appendChild(ro('유효 탑튜브', () => G.m.ett)); o1.appendChild(ro('탑튜브 각도', () => G.m.ttAngle, '°'));
    o2.appendChild(ro('휠베이스', () => G.m.wb)); o2.appendChild(ro('프론트 센터', () => G.m.fc)); o2.appendChild(ro('트레일', () => G.m.trail));
    o3.appendChild(ro('BB 높이', () => G.m.bbH)); o3.appendChild(ro('스탠드오버', () => G.m.standover)); o3.appendChild(ro('토 간격', () => G.m.toe));
    oc.append(o1, o2, o3); out.appendChild(oc); body.appendChild(out);
    body.appendChild(el('p', 'hint', '드롭다운으로 기준을 고르면 그 값이 고정되고 나머지가 따라 계산됩니다. 칸에서 ↑↓ (Shift ×10, Alt ×0.1)'));
    binder(api, body);
  } },
  wheels: { title: '휠', w: 470, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('wheels')); h.appendChild(chk('앞뒤 같게', () => bike.sameWheels, v => { bike.sameWheels = v; if (v) { bike.frontBSD = bike.rearBSD; bike.frontTire = bike.rearTire; } changed(); })); h.appendChild(el('span', 'lb'));
    body.appendChild(h);
    const cols = el('div', 'cols');
    const side = (lbl, bk, tk) => {
      const g = el('div', 'grp'); g.innerHTML = `<div class="gt">${lbl}</div>`;
      g.appendChild(row('림 BSD', combo(BSD.map(x => [String(x[0]), x[1]]), () => String(bike[bk]), v => { bike[bk] = +v; if (bike.sameWheels) { bike.frontBSD = bike.rearBSD = +v; } changed(); }), null));
      g.appendChild(row('BSD 직접', num(() => bike[bk], v => { bike[bk] = v; if (bike.sameWheels) { bike.frontBSD = bike.rearBSD = v; } }, { min: 100, max: 800 }), 'mm'));
      g.appendChild(row('타이어 폭', num(() => bike[tk], v => { bike[tk] = v; if (bike.sameWheels) { bike.frontTire = bike.rearTire = v; } }, { min: 10, max: 130, spin: true }), 'mm'));
      g.appendChild(row('바퀴 지름', num(() => bike[bk] + bike[tk] * 2, () => {}, { ro: true }), 'mm'));
      return g;
    };
    cols.append(side('뒷바퀴', 'rearBSD', 'rearTire'), side('앞바퀴', 'frontBSD', 'frontTire')); body.appendChild(cols);
    const g = el('div', 'grp'); g.appendChild(row('스포크 수', num(() => bike.spokes, v => { bike.spokes = Math.round(v); }, { int: true, min: 12, max: 48, step: 4 }), '')); g.appendChild(row('림 높이', num(() => bike.rimDepth, v => { bike.rimDepth = v; }, { min: 8, max: 90 }), 'mm'));
    body.appendChild(g);
    body.appendChild(el('p', 'hint', '바퀴 지름 = BSD + 타이어 폭 × 2. BB 드롭이 기준이면 바퀴를 바꿀 때 BB 높이가 달라지고, BB 높이가 기준이면 드롭이 달라집니다.'));
    binder(api, body);
  } },
  fork: { title: '포크', w: 430, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('fork'));
    h.appendChild(combo([['curved', '커브드 (로드·클래식)'], ['straight', '스트레이트'], ['susp', '서스펜션']], () => bike.forkType, v => { bike.forkType = v; changed(); }));
    h.appendChild(el('span', 'lb')); body.appendChild(h);
    const c = el('div', 'cols'); const a = el('div'); a.appendChild(forkDiagram());
    const b2 = el('div');
    b2.appendChild(fieldN('A 포크 길이', 'forkLen', 'mm', { min: 200, max: 650 }));
    b2.appendChild(fieldN('B 오프셋', 'rake', 'mm', { min: -20, max: 90 }));
    b2.appendChild(fieldN('하부 헤드셋', 'lowerStack', 'mm', { min: 0, max: 60 }));
    b2.appendChild(fieldN('블레이드 굵기', 'bladeDia', 'mm', { min: 10, max: 50 }));
    b2.appendChild(row('트레일', num(() => G.m.trail, () => {}, { ro: true }), 'mm'));
    c.append(a, b2); body.appendChild(c);
    body.appendChild(el('p', 'hint', '포크 길이는 앞바퀴 축에서 크라운 레이스까지 조향축 방향으로 잽니다.'));
    binder(api, body);
  } },
  stem: { title: '헤드셋 · 스템', w: 360, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('stem')); h.appendChild(el('span', 'lb')); body.appendChild(h);
    body.appendChild(fieldN('상부 헤드셋 스택', 'upperStack', 'mm', { min: 0, max: 80 }));
    body.appendChild(fieldN('스페이서', 'spacers', 'mm', { min: 0, max: 120, step: 5, spin: true }));
    body.appendChild(fieldN('스템 길이', 'stemLen', 'mm', { min: 20, max: 200, step: 10, spin: true }));
    body.appendChild(row('스템 각도', num(() => bike.stemAngle, v => { bike.stemAngle = v; }, { min: -45, max: 45, spin: true }), '°'));
    body.appendChild(fieldN('스템 클램프 높이', 'stemH', 'mm', { min: 20, max: 80 }));
    const g = el('div', 'grp'); g.innerHTML = '<div class="gt">핸들바 클램프 위치 (BB 기준)</div>';
    g.appendChild(row('X', num(() => G.m.barX, () => {}, { ro: true }), 'mm')); g.appendChild(row('Y', num(() => G.m.barY, () => {}, { ro: true }), 'mm'));
    body.appendChild(g);
    body.appendChild(el('p', 'hint', '스템 각도는 조향축에 수직인 선 기준입니다 (−6°, +6° 표기와 같음).'));
    binder(api, body);
  } },
  bar: { title: '핸들바', w: 360, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('bar'));
    h.appendChild(combo([['drop', '드롭바'], ['flat', '플랫바'], ['riser', '라이저바'], ['swept', '스웹트바 (백스윕)']], () => bike.barType, v => { bike.barType = v; changed(); api.redraw(); }));
    h.appendChild(el('span', 'lb')); body.appendChild(h);
    const box = el('div'); body.appendChild(box);
    api.redraw = () => {
      box.innerHTML = '';
      if (bike.barType === 'drop') { box.appendChild(fieldN('리치', 'barReach', 'mm', { min: 40, max: 140 })); box.appendChild(fieldN('드롭', 'barDrop', 'mm', { min: 60, max: 180 })); }
      else { box.appendChild(fieldN('라이즈', 'barRise', 'mm', { min: -40, max: 120 })); box.appendChild(fieldN('그립까지 뒤로', 'barSweep', 'mm', { min: 0, max: 260 })); }
      box.appendChild(fieldN('폭', 'barWidth', 'mm', { min: 300, max: 900, step: 10 }));
      binder(api, body); api.refresh();
    };
    api.redraw();
  } },
  saddle: { title: '안장', w: 360, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('saddle')); h.appendChild(el('span', 'lb')); body.appendChild(h);
    body.appendChild(modeNum('saddle', 'saddleMode', 'saddleVal', [['bb', '안장 높이'], ['ground', '안장 높이 (지면 기준)']]));
    body.appendChild(fieldN('안장 길이', 'saddleLen', 'mm', { min: 180, max: 320 }));
    body.appendChild(fieldN('레일 앞뒤 위치 (+앞)', 'saddleRail', 'mm', { min: -60, max: 60 }));
    const g = el('div', 'grp'); g.innerHTML = '<div class="gt">결과</div>';
    g.appendChild(row('안장 셋백 (코 기준)', num(() => G.m.setback, () => {}, { ro: true }), 'mm'));
    g.appendChild(row('유효 시트 각도', num(() => G.m.effSA, () => {}, { ro: true }), '°'));
    body.appendChild(g); binder(api, body);
  } },
  post: { title: '시트포스트', w: 320, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('post')); h.appendChild(el('span', 'lb')); body.appendChild(h);
    body.appendChild(fieldN('셋백', 'postSetback', 'mm', { min: -20, max: 60 }));
    body.appendChild(fieldN('지름', 'postDia', 'mm', { min: 22, max: 34.9 }));
    binder(api, body);
  } },
  crank: { title: '크랭크 · 구동계', w: 340, build(body, api) {
    const h = el('div', 'row'); h.appendChild(eyeBtn('crank')); h.appendChild(chk('체인 보이기', () => bike.showChain, v => { bike.showChain = v; changed(); })); h.appendChild(el('span', 'lb')); body.appendChild(h);
    body.appendChild(fieldN('크랭크 길이', 'crankLen', 'mm', { min: 100, max: 200, step: 2.5, spin: true }));
    body.appendChild(row('크랭크 각도', num(() => bike.crankAng, v => { bike.crankAng = v; }, { min: -180, max: 180, step: 15, spin: true }), '°'));
    body.appendChild(row('체인링', num(() => bike.ring, v => { bike.ring = Math.round(v); }, { int: true, min: 20, max: 62 }), 'T'));
    body.appendChild(row('스프라켓', num(() => bike.cog, v => { bike.cog = Math.round(v); }, { int: true, min: 9, max: 52 }), 'T'));
    body.appendChild(row('크랭크 끝-앞타이어', num(() => G.m.toe, () => {}, { ro: true }), 'mm'));
    binder(api, body);
  } },
  tubes: { title: '튜브', w: 330, build(body, api) {
    [['탑튜브', 'ttDia'], ['다운튜브', 'dtDia'], ['시트튜브', 'stDia'], ['헤드튜브', 'htDia'], ['체인스테이', 'csDia'], ['시트스테이', 'ssDia']].forEach(x => body.appendChild(fieldN(x[0] + ' 지름', x[1], 'mm', { min: 8, max: 70 })));
    body.appendChild(fieldN('시트스테이 위치 (탑튜브 아래)', 'ssDrop', 'mm', { min: -40, max: 300 }));
    binder(api, body);
  } },
  color: { title: '색상', w: 340, build(body, api) {
    const pal = ['#1597d0', '#9b2335', '#151515', '#f2f0ea', '#c0c4c8', '#1f4d3a', '#d9622b', '#e3b23c', '#2b3f6b', '#7d8b6a', '#c96b8a', '#5b3a29'];
    const pick = (lbl, key) => { const r = el('div', 'row'); r.appendChild(el('span', 'lb l', lbl)); const i = document.createElement('input'); i.type = 'color'; i.value = bike[key]; i.oninput = () => { bike[key] = i.value; changed({ noHist: true }); }; i.onchange = () => changed(); i._show = () => { i.value = bike[key]; }; r.appendChild(i); return r; };
    body.appendChild(pick('프레임', 'frameColor'));
    const sw = el('div', 'sw'); pal.forEach(c => { const b = el('button'); b.style.background = c; b.title = c; b.onclick = () => { bike.frameColor = c; changed(); }; sw.appendChild(b); }); body.appendChild(sw);
    body.appendChild(chk('포크도 프레임 색', () => bike.forkSame, v => { bike.forkSame = v; changed(); }));
    body.appendChild(pick('포크', 'forkColor'));
    body.appendChild(row('부품', combo([['#3a3a3a', '블랙'], ['#a9acb0', '실버'], ['#6b5640', '브라운'], ['#c9a46a', '골드']], () => bike.compColor, v => { bike.compColor = v; changed(); })));
    body.appendChild(row('림', combo([['#707070', '실버'], ['#1d1d1d', '블랙'], ['#b8b8b8', '폴리시드']], () => bike.rimColor, v => { bike.rimColor = v; changed(); })));
    body.appendChild(chk('스킨월 타이어', () => bike.tanwall, v => { bike.tanwall = v; changed(); }));
    const dr = el('div', 'row'); dr.appendChild(el('span', 'lb l', '다운튜브 글자')); const dt = document.createElement('input'); dt.type = 'text'; dt.className = 'txt'; dt.value = bike.decal; dt.oninput = () => { bike.decal = dt.value; changed(); }; dt._show = () => { if (document.activeElement !== dt) dt.value = bike.decal; }; dr.appendChild(dt); body.appendChild(dr);
    body.appendChild(pick('글자 색', 'decalColor'));
    binder(api, body);
  } },
  dims: { title: '치수', w: 560, build(body, api) {
    const t = el('div', 'row');
    t.appendChild(eyeDims());
    t.appendChild(el('span', 'lb', '단위'));
    t.appendChild(combo([['mm', 'mm'], ['in', 'inch']], () => view.units, v => { view.units = v; saveView(); render(); refreshDlgs(); }));
    t.appendChild(el('span', 'lb', '소수 자리'));
    t.appendChild(combo([['0', '0'], ['1', '1'], ['2', '2']], () => String(view.dec), v => { view.dec = +v; saveView(); render(); refreshDlgs(); }));
    t.appendChild(chk('이름 함께', () => view.dimNames, v => { view.dimNames = v; saveView(); render(); }));
    body.appendChild(t);
    const ts = el('div', 'row'); ts.appendChild(el('span', 'lb l', '글자 크기')); const rg = document.createElement('input'); rg.type = 'range'; rg.min = 10; rg.max = 22; rg.value = view.text; rg.style.flex = '3'; rg.oninput = () => { view.text = +rg.value; saveView(); render(); }; ts.appendChild(rg); body.appendChild(ts);
    const tabs = el('div', 'tabs'); const list = el('div', 'dimlist'); let cur = '전체';
    const cats = ['전체', '프레임', '앞바퀴·포크', '핏'];
    const draw = () => {
      tabs.innerHTML = ''; cats.forEach(c => { const b = el('button', c === cur ? 'on' : '', c); b.onclick = () => { cur = c; draw(); }; tabs.appendChild(b); });
      list.innerHTML = '';
      DIMS.filter(d => cur === '전체' || d.cat === cur).forEach(d => {
        const l = el('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = view.dims.includes(d.id); c.disabled = !d.draw;
        c.onchange = () => { view.dims = c.checked ? view.dims.concat(d.id) : view.dims.filter(x => x !== d.id); view.dimsOn = true; saveView(); render(); };
        const v = el('span', 'v'); v._show = () => { v.textContent = fmt(d.v(G), d.k); };
        l.append(c, el('span', '', esc(d.name) + (d.draw ? '' : ' <span style="color:#999">(표에만)</span>')), v); list.appendChild(l);
      });
      binder(api, body); api.refresh();
    };
    body.append(tabs, list);
    const bb = el('div', 'libbar'); bb.style.marginTop = '8px';
    const b1 = el('button', 'btn', '주요 치수'); b1.onclick = () => { view.dims = ['stack', 'reach', 'ha', 'sa', 'cs', 'wb', 'bbdrop']; view.dimsOn = true; saveView(); render(); draw(); };
    const b2 = el('button', 'btn', '핏 치수'); b2.onclick = () => { view.dims = ['sh', 'setback', 's2b', 'bdrop', 'hbx', 'hby']; view.dimsOn = true; saveView(); render(); draw(); };
    const b3 = el('button', 'btn', '모두 끄기'); b3.onclick = () => { view.dims = []; saveView(); render(); draw(); };
    const b4 = el('button', 'btn', '치수 위치 되돌리기'); b4.onclick = () => { view.dimOff = {}; saveView(); render(); };
    bb.append(b1, b2, b3, b4); body.appendChild(bb);
    body.appendChild(el('p', 'hint', '도면의 치수 글자를 끌면 치수선 자리를 옮길 수 있습니다.'));
    draw();
  } },
  table: { title: '지오메트리 표', w: 520, build(body, api) {
    const bar = el('div', 'libbar');
    const b1 = el('button', 'btn', '표 복사 (시트에 붙여넣기)'); b1.onclick = () => { navigator.clipboard.writeText(geoTsv()).then(() => toast('복사했습니다')).catch(() => toast('복사하지 못했습니다')); };
    const b2 = el('button', 'btn', '인쇄'); b2.onclick = doPrint;
    const b3 = el('button', 'btn', '비교 자전거…'); b3.onclick = () => openDlg('compare');
    bar.append(b1, b2, b3); body.appendChild(bar);
    const box = el('div'); box.style.marginTop = '6px'; body.appendChild(box);
    api.refresh = () => { box.innerHTML = geoTable(); };
  } },
  compare: { title: '비교 자전거', w: 470, build(body, api) {
    const add1 = el('div', 'libbar');
    const sel = document.createElement('select'); sel.className = 'combo'; sel.style.flex = '1';
    const b1 = el('button', 'btn pri', '비교에 넣기');
    const b2 = el('button', 'btn', '현재 상태 복사'); b2.title = '지금 도면을 그대로 비교용으로 남겨 두고 값을 바꿔 보기';
    const b3 = el('button', 'btn', '파일에서…');
    add1.append(sel, b1); body.appendChild(add1);
    const add2 = el('div', 'libbar'); add2.style.marginTop = '4px'; add2.append(b2, b3); body.appendChild(add2);
    const list = el('div'); list.style.marginTop = '8px'; body.appendChild(list);
    b1.onclick = () => { const v = sel.value; if (!v) return; if (v.startsWith('t:')) { const t = TEMPLATES.find(x => x.id === v.slice(2)); addCompare(Object.assign(clone(DEF), t.b, { name: t.name }), t.name); } else { const it = libAll().find(x => x.id === v.slice(2)); if (it) addCompare(it.bike, it.bike.name); } };
    b2.onclick = () => addCompare(clone(bike), (bike.name || '현재') + ' (복사 ' + new Date().toTimeString().slice(0, 5) + ')');
    b3.onclick = () => pickFile('compare');
    api.refresh = () => {
      const lib = libAll();
      sel.innerHTML = '<option value="">라이브러리·템플릿에서 고르기</option>' + (lib.length ? `<optgroup label="라이브러리">${lib.map(x => `<option value="l:${x.id}">${esc(x.bike.name)}${x.bike.size ? ' · ' + esc(x.bike.size) : ''}</option>`).join('')}</optgroup>` : '') + `<optgroup label="템플릿">${TEMPLATES.map(t => `<option value="t:${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`;
      list.innerHTML = compares.length ? '' : '<div class="empty">비교할 자전거가 없습니다. 위에서 고르면 현재 도면 위에 선으로 겹쳐 그립니다.</div>';
      compares.forEach(c => {
        const r = el('div', 'cmpitem');
        const on = document.createElement('input'); on.type = 'checkbox'; on.checked = c.on; on.onchange = () => { c.on = on.checked; render(); refreshDlgs(); };
        const col = document.createElement('input'); col.type = 'color'; col.value = c.color; col.oninput = () => { c.color = col.value; render(); };
        const nm = el('span', 'nm', esc(c.name)); nm.title = c.name;
        const al = combo([['bb', 'BB 맞춤'], ['rear', '뒷바퀴 축 맞춤'], ['front', '앞바퀴 축 맞춤'], ['ground', '지면·BB 수직선 맞춤']], () => c.align, v => { c.align = v; alignCmp(c); render(); });
        const op = el('button', 'btn', '열기'); op.title = '이 자전거를 편집 화면으로'; op.onclick = () => { setBike(c.bike); };
        const rm = el('button', 'btn', '빼기'); rm.onclick = () => { compares = compares.filter(x => x !== c); render(); refreshDlgs(); };
        r.append(on, col, nm, al, op, rm); list.appendChild(r);
      });
    };
  } },
  fit: { title: '핏 맞추기', w: 520, build(body, api) {
    const tg = lsGet('myrubi.geo.fit.v1', null) || { sh: r1(G.m.saddleH), sb: r1(G.m.setback), bx: r1(G.m.barX), by: r1(G.m.barY) };
    const saveT = () => lsSet('myrubi.geo.fit.v1', tg);
    const cols = el('div', 'cols');
    const a = el('div', 'grp'); a.innerHTML = '<div class="gt">고객 핏 (목표, BB 중심 기준)</div>';
    const tnum = (k) => num(() => tg[k], v => { tg[k] = v; saveT(); }, { local: true });
    a.appendChild(row('안장 높이', tnum('sh'), 'mm')); a.appendChild(row('안장 셋백 (코)', tnum('sb'), 'mm')); a.appendChild(row('핸들바 X', tnum('bx'), 'mm')); a.appendChild(row('핸들바 Y', tnum('by'), 'mm'));
    const fromCur = el('button', 'btn', '지금 자전거 값 넣기'); fromCur.onclick = () => { Object.assign(tg, { sh: r1(G.m.saddleH), sb: r1(G.m.setback), bx: r1(G.m.barX), by: r1(G.m.barY) }); saveT(); api.refresh(); };
    a.appendChild(fromCur);
    const b = el('div', 'grp'); b.innerHTML = '<div class="gt">지금 자전거</div>';
    b.appendChild(row('안장 높이', num(() => G.m.saddleH, () => {}, { ro: true }), 'mm')); b.appendChild(row('안장 셋백 (코)', num(() => G.m.setback, () => {}, { ro: true }), 'mm')); b.appendChild(row('핸들바 X', num(() => G.m.barX, () => {}, { ro: true }), 'mm')); b.appendChild(row('핸들바 Y', num(() => G.m.barY, () => {}, { ro: true }), 'mm'));
    cols.append(a, b); body.appendChild(cols);
    const go = el('button', 'btn pri', '이 프레임에서 맞는 스템·스페이서 찾기'); body.appendChild(go);
    const res = el('div'); res.style.marginTop = '6px'; body.appendChild(res);
    go.onclick = () => {
      // 안장: 높이는 그대로, 셋백은 레일 위치(±15) → 안 되면 시트포스트 셋백 후보
      const sa = G.sa; const ax = -tg.sh * Math.cos(sa);
      const railFor = ps => -tg.sb - ax + ps - bike.saddleLen * 0.52;
      let ps = bike.postSetback, rail = railFor(ps);
      if (Math.abs(rail) > 15) { const c = [0, 10, 15, 20, 25, 32].map(p => ({ p, r: railFor(p) })).sort((x, y) => Math.abs(x.r) - Math.abs(y.r))[0]; ps = c.p; rail = c.r; }
      // 핸들바: 스템 길이·각도·스페이서 조합
      const cands = [];
      const ha = G.ha, u = G.u;
      for (const ang of [-17, -12, -10, -8, -6, 0, 6, 10, 17]) for (let L = 50; L <= 140; L += 10) for (let sp = 0; sp <= 40; sp += 5) {
        const Q = add(G.T, mul(u, -(bike.upperStack + sp + bike.stemH / 2))); const th = (90 - bike.headAngle + ang) * D;
        const E = add(Q, v2(L * Math.cos(th), L * Math.sin(th)));
        cands.push({ ang, L, sp, dx: E.x - tg.bx, dy: E.y - tg.by, err: Math.hypot(E.x - tg.bx, E.y - tg.by) + sp * 0.02 });
      }
      cands.sort((x, y) => x.err - y.err);
      const top = []; cands.forEach(c => { if (top.length < 6 && !top.some(t => t.L === c.L && t.ang === c.ang)) top.push(c); });
      res.innerHTML = `<div class="grp"><div class="gt">안장</div>안장 높이 ${fmtL(tg.sh)} · 시트포스트 셋백 ${ps} mm · 레일 ${rail > 0 ? '+' : ''}${r1(rail)} mm${Math.abs(rail) > 15 ? ' <span style="color:#b0303f">(레일 범위를 넘음)</span>' : ''} <button class="btn" id="fitS">안장 적용</button></div>` +
        `<table class="gtab"><thead><tr><th>스템</th><th>각도</th><th>스페이서</th><th>X 차이</th><th>Y 차이</th></tr></thead><tbody>${top.map((c, i) => `<tr class="pick" data-i="${i}"><td>${c.L} mm</td><td>${c.ang > 0 ? '+' : ''}${c.ang}°</td><td>${c.sp} mm</td><td>${c.dx > 0 ? '+' : ''}${r1(c.dx)}</td><td>${c.dy > 0 ? '+' : ''}${r1(c.dy)}</td></tr>`).join('')}</tbody></table><p class="hint">줄을 누르면 스템·스페이서가 바뀝니다. 차이가 + 이면 목표보다 앞(X)·위(Y)입니다.</p>`;
      res.querySelector('#fitS').onclick = () => { bike.saddleMode = 'bb'; bike.saddleVal = r1(tg.sh); bike.postSetback = ps; bike.saddleRail = r1(Math.max(-60, Math.min(60, rail))); changed(); };
      res.querySelectorAll('tr.pick').forEach(tr => tr.onclick = () => { const c = top[+tr.dataset.i]; bike.stemLen = c.L; bike.stemAngle = c.ang; bike.spacers = c.sp; changed(); res.querySelectorAll('tr').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); });
    };
    binder(api, body);
  } },
  lib: { title: '라이브러리', w: 600, build(body, api) {
    const info = el('div', 'grp'); info.innerHTML = '<div class="gt">현재 자전거</div>';
    const tf = (lbl, key, w) => { const r = el('div', 'row'); r.appendChild(el('span', 'lb l', lbl)); r.firstChild.style.flex = '0 0 54px'; const i = document.createElement('input'); i.type = 'text'; i.className = 'txt'; i.style.flex = '1'; if (w) i.style.maxWidth = w + 'px'; i.value = bike[key] || ''; i.oninput = () => { bike[key] = i.value; docState.dirty = true; doc(); lsSet(LS_CUR, bike); }; i._show = () => { if (document.activeElement !== i) i.value = bike[key] || ''; }; r.appendChild(i); return r; };
    const c2 = el('div', 'cols'); const x1 = el('div'), x2 = el('div');
    x1.append(tf('이름', 'name'), tf('브랜드', 'brand')); x2.append(tf('모델', 'model'), tf('사이즈', 'size'));
    c2.append(x1, x2); info.appendChild(c2); info.appendChild(tf('메모', 'note'));
    const sb = el('div', 'libbar'); sb.style.marginTop = '6px';
    const s1 = el('button', 'btn pri', '저장'); s1.onclick = () => libSave(false);
    const s2 = el('button', 'btn', '새 항목으로 저장'); s2.onclick = () => libSave(true);
    const s3 = el('button', 'btn', '파일로 내보내기'); s3.onclick = exportJson;
    sb.append(s1, s2, s3); info.appendChild(sb); body.appendChild(info);
    const bar = el('div', 'libbar');
    const q = document.createElement('input'); q.type = 'text'; q.className = 'txt'; q.placeholder = '찾기 (이름, 브랜드, 모델, 사이즈)'; q.style.flex = '1';
    const im = el('button', 'btn', '가져오기 (.json, .bcad)'); im.onclick = () => pickFile('lib');
    const ex = el('button', 'btn', '모두 내보내기'); ex.onclick = () => download('my-rubi-geometry-library.json', JSON.stringify({ type: 'myrubi-geometry-library', v: 1, items: libAll() }, null, 1), 'application/json');
    bar.append(q, im, ex); body.appendChild(bar);
    const list = el('div', 'liblist'); body.appendChild(list);
    q.oninput = () => api.refresh();
    const inner = binder.bind(null, api, info); inner();
    const r0 = api.refresh;
    api.refresh = (except) => {
      r0(except);
      const all = libAll(), t = q.value.trim().toLowerCase();
      const items = all.filter(x => !t || [x.bike.name, x.bike.brand, x.bike.model, x.bike.size, x.bike.note].join(' ').toLowerCase().includes(t));
      if (!items.length) { list.innerHTML = `<div class="empty">${all.length ? '찾는 항목이 없습니다' : '저장한 지오메트리가 없습니다. 위에서 이름을 적고 저장하세요.'}</div>`; return; }
      list.innerHTML = `<table class="gtab"><thead><tr><th>이름</th><th>브랜드 · 모델</th><th>사이즈</th><th>스택</th><th>리치</th><th>저장</th><th></th></tr></thead><tbody>${items.map(x => { const g = solve(Object.assign(clone(DEF), x.bike)); return `<tr class="pick${x.id === docState.libId ? ' sel' : ''}" data-id="${x.id}"><td>${esc(x.bike.name)}</td><td>${esc([x.bike.brand, x.bike.model].filter(Boolean).join(' '))}</td><td>${esc(x.bike.size || '')}</td><td class="n">${r1(g.m.stack)}</td><td class="n">${r1(g.m.reach)}</td><td>${esc((x.updated || '').slice(2, 10))}</td><td><button class="btn" data-a="cmp">비교</button> <button class="btn" data-a="del">지우기</button></td></tr>`; }).join('')}</tbody></table>`;
      list.querySelectorAll('tr.pick').forEach(tr => tr.onclick = e => {
        const id = tr.dataset.id, it = libAll().find(x => x.id === id); if (!it) return;
        const a = e.target.closest('button') && e.target.closest('button').dataset.a;
        if (a === 'cmp') { addCompare(it.bike, it.bike.name); return; }
        if (a === 'del') { if (!confirm(`'${it.bike.name}' 을(를) 라이브러리에서 지울까요?`)) return; libPut(libAll().filter(x => x.id !== id)); if (docState.libId === id) docState.libId = null; doc(); api.refresh(); return; }
        if (docState.dirty && !confirm('저장하지 않은 변경이 있습니다. 열까요?')) return;
        setBike(it.bike, true); docState = { libId: id, dirty: false }; lsSet('myrubi.geo.doc.v1', docState); doc(); api.refresh();
      });
    };
  } },
  help: { title: '사용법', w: 520, build(body) {
    body.innerHTML = `<div style="line-height:19px">
      <p style="margin-top:0">BikeCAD Pro와 같은 짜임입니다. 아랫줄 아이콘이 부품별 대화상자이고, 도면의 부품을 눌러도 그 대화상자가 열립니다.</p>
      <p><b style="font-weight:400;color:#1f4f86">기본 치수</b>: 드롭다운으로 무엇을 기준으로 둘지 고릅니다. 예를 들어 '유효 탑튜브 길이'를 고르면 시트 각도를 바꿔도 유효 탑튜브가 그대로이고 리치가 바뀝니다. 스택을 넣으면 헤드튜브 길이는 포크·바퀴·하부 헤드셋으로 계산됩니다.</p>
      <p><b style="font-weight:400;color:#1f4f86">치수</b>: 도면에 보일 치수를 고릅니다. 치수 글자를 끌어 자리를 옮깁니다.</p>
      <p><b style="font-weight:400;color:#1f4f86">비교 (+)</b>: 라이브러리나 템플릿의 자전거를 선으로 겹쳐 그리고, 지오메트리 표에 차이가 나옵니다.</p>
      <p><b style="font-weight:400;color:#1f4f86">핏 맞추기</b>: 고객이 타던 자전거의 안장·핸들바 위치를 넣으면 이 프레임에 맞는 스템 길이·각도·스페이서 조합을 찾습니다.</p>
      <p><b style="font-weight:400;color:#1f4f86">저장</b>: 라이브러리는 이 브라우저에 저장됩니다. 다른 기기와 나누려면 파일로 내보내고 가져오세요. BikeCAD 파일(.bcad)은 기본 치수·휠·포크·스템을 읽어옵니다.</p>
      <p style="margin-bottom:0;color:#6e6f73">단축키: Ctrl+Z 되돌리기 · Ctrl+Shift+Z 다시 · Ctrl+S 저장 · Ctrl+O 열기 · F 화면 맞춤 · D 치수 켜고 끄기 · T 지오메트리 표 · 휠로 확대, 빈 곳을 끌어 이동</p></div>`;
  } },
};

function eyeDims() { const b = el('button', 'eye'); b.title = '치수 보이기/숨기기'; const p = () => { b.innerHTML = eyeSvg(view.dimsOn); }; b.onclick = () => { view.dimsOn = !view.dimsOn; saveView(); p(); render(); tbState(); }; p(); b._show = p; return b; }
function icoExt(kind) {
  // BikeCAD 기본 치수의 튜브 연장 아이콘을 다시 그린 것
  const c = '#5aa7d8', r = '#d0312d';
  const s = kind === 'st'
    ? `<svg class="ico" viewBox="0 0 30 26"><path d="M11 26l3-22h7l-3 22z" fill="${c}"/><path d="M0 14h26v6H0z" fill="${c}" opacity=".85"/><path d="M14 4l2 14" stroke="${r}" stroke-width="2"/></svg>`
    : kind === 'ht' ? `<svg class="ico" viewBox="0 0 30 26"><path d="M14 0h8l3 26h-8z" fill="${c}"/><path d="M0 10h18v7H0z" fill="${c}" opacity=".85"/><path d="M19 0l1 13" stroke="${r}" stroke-width="2"/></svg>`
    : `<svg class="ico" viewBox="0 0 30 26"><path d="M14 0h8l3 26h-8z" fill="${c}"/><path d="M0 20L18 6l4 5L4 26z" fill="${c}" opacity=".85"/><path d="M21 12l1 14" stroke="${r}" stroke-width="2"/></svg>`;
  const sp = el('span'); sp.innerHTML = s; return sp;
}
function forkDiagram() {
  const d = el('div');
  d.innerHTML = `<svg class="diagram" viewBox="0 0 150 190" width="150" height="190"><path d="M55 8l6 30" stroke="#999" stroke-width="10"/><path d="M48 38h28" stroke="#222" stroke-width="12"/><path d="M62 44c4 50 12 100 40 132" fill="none" stroke="#222" stroke-width="8" stroke-linecap="round"/><circle cx="102" cy="176" r="5" fill="#666"/>
  <path d="M62 38L95 178" stroke="#1d8fc9" stroke-dasharray="4 3"/><path d="M95 178l7-2" stroke="#d0312d" stroke-width="2"/>
  <path d="M30 40L62 178" stroke="#111" stroke-width=".8"/><rect x="31" y="98" width="13" height="13" fill="#111"/><text x="37.5" y="108" fill="#fff" font-size="10" text-anchor="middle">A</text>
  <rect x="112" y="160" width="13" height="13" fill="#111"/><text x="118.5" y="170" fill="#fff" font-size="10" text-anchor="middle">B</text><path d="M103 172l10-4" stroke="#111" stroke-width=".8"/></svg>`;
  return d;
}

// ─────────── 메뉴·툴바 ───────────
const ROW1 = [
  ['new', '새로 만들기 (Ctrl+N)', () => newBike()], ['open', '열기 (Ctrl+O)', () => pickFile('open')], ['save', '라이브러리에 저장 (Ctrl+S)', () => saveCmd()], ['lib', '라이브러리 (Ctrl+L)', () => openDlg('lib')], '|',
  ['undo', '되돌리기 (Ctrl+Z)', () => undo()], ['redo', '다시 실행 (Ctrl+Shift+Z)', () => redo()], '|',
  ['mode', '그림 방식: 컬러 · 외곽선 · 중심선', () => cycleMode(), 'split'], ['grid', '격자 (100 mm)', () => { view.grid = !view.grid; saveView(); render(); tbState(); }], ['dims', '치수 (D: 켜고 끄기)', () => openDlg('dims')], ['table', '지오메트리 표 (T)', () => openDlg('table')], ['fit', '핏 맞추기', () => openDlg('fit')], ['color', '색상', () => openDlg('color')], '|',
  ['png', '이미지로 저장 (PNG)', () => exportPng()], ['print', '인쇄 (Ctrl+P)', () => doPrint()], ['zoom', '화면에 맞춤 (F)', () => fit()],
];
const ROW2 = [
  ['basic', '기본 치수', 'basic'], ['wheels', '휠', 'wheels'], ['fork', '포크', 'fork'], ['stem', '헤드셋 · 스템', 'stem'], ['bar', '핸들바', 'bar'], ['saddle', '안장', 'saddle'], ['post', '시트포스트', 'post'], ['crank', '크랭크 · 구동계', 'crank'], ['tubes', '튜브', 'tubes'], '|', ['compare', '비교 자전거 추가', 'compare'],
];
function buildToolbar() {
  const mk = (row, items) => {
    const r = $(row);
    items.forEach(it => {
      if (it === '|') { r.appendChild(el('span', 'tsep')); return; }
      const b = el('button', 'tb' + (it[3] === 'split' ? ' split' : '')); b.title = it[1]; b.dataset.k = it[0]; b.innerHTML = ICONS[it[0]] || '';
      b.onclick = typeof it[2] === 'function' ? it[2] : () => (dlgs[it[2]] ? closeDlg(it[2]) : openDlg(it[2]));
      r.appendChild(b);
    });
  };
  mk('#row1', ROW1); mk('#row2', ROW2);
}
function tbState() {
  const q = k => document.querySelector(`.tb[data-k="${k}"]`);
  if (q('undo')) q('undo').disabled = hi <= 0 && hist[hi] === JSON.stringify(bike);
  if (q('redo')) q('redo').disabled = hi >= hist.length - 1;
  if (q('grid')) q('grid').classList.toggle('on', view.grid);
  if (q('dims')) q('dims').classList.toggle('on', view.dimsOn && view.dims.length > 0);
  ROW2.forEach(it => { if (it !== '|' && q(it[0])) q(it[0]).classList.toggle('on', !!dlgs[it[2]]); });
  ['table', 'fit', 'color', 'lib'].forEach(k => q(k) && q(k).classList.toggle('on', !!dlgs[k]));
  if (q('mode')) q('mode').title = '그림 방식: ' + { color: '컬러', line: '외곽선', center: '중심선' }[view.mode] + ' (누르면 바뀜)';
}
function cycleMode() { view.mode = { color: 'line', line: 'center', center: 'color' }[view.mode]; saveView(); render(); tbState(); toast('그림 방식: ' + { color: '컬러', line: '외곽선', center: '중심선' }[view.mode]); }
function newBike(t) {
  if (docState.dirty && !confirm('저장하지 않은 변경이 있습니다. 새로 만들까요?')) return;
  const tpl = t ? TEMPLATES.find(x => x.id === t) : null;
  setBike(Object.assign(clone(DEF), tpl ? tpl.b : {}, { name: tpl ? tpl.name : '새 자전거' }));
}
function saveCmd() { if (docState.libId) libSave(false); else { openDlg('lib'); toast('이름을 적고 저장을 누르세요'); } }

function buildMenus() {
  const M = (sel, items) => {
    const m = $(sel); m.innerHTML = '';
    items.forEach(it => {
      if (it === '-') { m.appendChild(el('hr')); return; }
      const b = el('button', it.on && it.on() ? 'on' : ''); b.innerHTML = `${esc(it.t)}${it.k ? `<span class="kb">${it.k}</span>` : ''}`;
      b.onclick = () => { closeMenus(); it.f(); }; m.appendChild(b);
    });
  };
  M('#mFile', [
    { t: '새로 만들기', k: 'Ctrl+N', f: () => newBike() },
    ...TEMPLATES.map(t => ({ t: '템플릿: ' + t.name, f: () => newBike(t.id) })),
    '-',
    { t: '열기… (.json, BikeCAD .bcad)', k: 'Ctrl+O', f: () => pickFile('open') },
    { t: '라이브러리…', k: 'Ctrl+L', f: () => openDlg('lib') },
    { t: '라이브러리에 저장', k: 'Ctrl+S', f: () => saveCmd() },
    { t: '새 항목으로 저장', f: () => libSave(true) },
    '-',
    { t: '파일로 내보내기 (.json)', f: exportJson },
    { t: '이미지로 저장 (PNG)', f: exportPng },
    { t: 'SVG로 저장', f: exportSvg },
    { t: '인쇄…', k: 'Ctrl+P', f: doPrint },
  ]);
  M('#mView', [
    { t: '치수 보이기', k: 'D', on: () => view.dimsOn, f: () => { view.dimsOn = !view.dimsOn; saveView(); render(); tbState(); } },
    { t: '치수 설정…', f: () => openDlg('dims') },
    { t: '지오메트리 표…', k: 'T', f: () => openDlg('table') },
    '-',
    { t: '컬러', on: () => view.mode === 'color', f: () => { view.mode = 'color'; saveView(); render(); tbState(); } },
    { t: '외곽선', on: () => view.mode === 'line', f: () => { view.mode = 'line'; saveView(); render(); tbState(); } },
    { t: '중심선', on: () => view.mode === 'center', f: () => { view.mode = 'center'; saveView(); render(); tbState(); } },
    '-',
    { t: '지면선', on: () => view.ground, f: () => { view.ground = !view.ground; saveView(); render(); } },
    { t: '격자', on: () => view.grid, f: () => { view.grid = !view.grid; saveView(); render(); tbState(); } },
    { t: '화면에 맞춤', k: 'F', f: fit },
    '-',
    { t: '비교 자전거…', f: () => openDlg('compare') },
    { t: '핏 맞추기…', f: () => openDlg('fit') },
    { t: '대화상자 모두 닫기', k: 'Esc', f: () => Object.keys(dlgs).forEach(closeDlg) },
    { t: '대화상자 자리 되돌리기', f: () => { dlgPos = {}; lsSet(LS_DLG, dlgPos); toast('다음에 열 때 처음 자리에 열립니다'); } },
  ]);
  M('#mHelp', [
    { t: '사용법', f: () => openDlg('help') },
    { t: '포털로 돌아가기', f: () => { (window.top !== window ? window.top : window).location.href = '/'; } },
  ]);
}
function closeMenus() { document.querySelectorAll('.mbar .mi.open').forEach(x => x.classList.remove('open')); }
document.querySelectorAll('.mbar .mi > button').forEach(b => {
  b.addEventListener('click', e => { const mi = b.parentElement, was = mi.classList.contains('open'); closeMenus(); if (!was) { buildMenus(); mi.classList.add('open'); } e.stopPropagation(); });
  b.addEventListener('mouseenter', () => { if (document.querySelector('.mbar .mi.open') && !b.parentElement.classList.contains('open')) { closeMenus(); buildMenus(); b.parentElement.classList.add('open'); } });
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.mbar')) closeMenus(); });

// ─────────── 도면 조작 ───────────
const toModel = (cx, cy) => { const r = svg.getBoundingClientRect(); return v2(vb.x + (cx - r.left) / scale, -(vb.y + (cy - r.top) / scale)); };
svg.addEventListener('wheel', e => {
  e.preventDefault(); const f = Math.exp(e.deltaY * 0.0015); const r = svg.getBoundingClientRect();
  const mx = vb.x + (e.clientX - r.left) / scale, my = vb.y + (e.clientY - r.top) / scale;
  const nw = Math.max(150, Math.min(20000, vb.w * f)); const k = nw / vb.w;
  vb.x = mx - (mx - vb.x) * k; vb.y = my - (my - vb.y) * k; vb.w = nw; render();
}, { passive: false });
let drag = null;
svg.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const dg = e.target.closest('.dimg'), hit = e.target.closest('.hit');
  drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, dim: dg ? dg.dataset : null, hit: hit ? hit.dataset.dlg : null, off: dg ? (view.dimOff[dg.dataset.id] || 0) : 0, m0: toModel(e.clientX, e.clientY) };
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove', e => {
  cursor = toModel(e.clientX, e.clientY); if (!drag) { status(); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  if (!drag.moved) return;
  if (drag.dim) {
    const m = toModel(e.clientX, e.clientY);
    if (drag.dim.t === 'ang') { const c = v2(+drag.dim.cx, +drag.dim.cy); view.dimOff[drag.dim.id] = drag.off + len(sub(m, c)) - len(sub(drag.m0, c)); }
    else { const nr = v2(+drag.dim.nx, +drag.dim.ny); view.dimOff[drag.dim.id] = drag.off + dot(sub(m, drag.m0), nr); }
    render(); return;
  }
  svg.classList.add('panning'); vb.x = drag.vx - dx / scale; vb.y = drag.vy - dy / scale; render();
});
svg.addEventListener('pointerup', () => {
  if (drag && drag.dim && drag.moved) saveView();
  if (drag && !drag.moved && drag.hit) openDlg(drag.hit);
  drag = null; svg.classList.remove('panning');
});
svg.addEventListener('pointerleave', () => { cursor = null; status(); });
svg.addEventListener('dblclick', e => { if (!e.target.closest('.hit') && !e.target.closest('.dimg')) fit(); });
$('#zIn').onclick = () => zoomBy(0.8); $('#zOut').onclick = () => zoomBy(1.25); $('#zFit').onclick = fit;
function zoomBy(f) { const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; vb.w *= f; vb.h *= f; vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; render(); }
new ResizeObserver(() => { if (!fitted) fit(); else render(); }).observe(svg);

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveCmd(); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFile('open'); return; }
  if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); openDlg('lib'); return; }
  if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); doPrint(); return; }
  if (mod && e.key.toLowerCase() === 'n' && !typing) { e.preventDefault(); newBike(); return; }
  if (typing || mod || e.altKey) return;
  if (e.key === 'Escape') { const fr = document.querySelector('.dlg.front'); if (fr) closeDlg(fr.dataset.id); closeMenus(); }
  else if (e.key === 'f' || e.key === 'F') fit();
  else if (e.key === 'd' || e.key === 'D') { view.dimsOn = !view.dimsOn; saveView(); render(); tbState(); }
  else if (e.key === 't' || e.key === 'T') openDlg('table');
  else if (e.key === '+' || e.key === '=') zoomBy(0.8);
  else if (e.key === '-') zoomBy(1.25);
});
window.addEventListener('beforeunload', () => { lsSet(LS_CUR, bike); });

// ─────────── 시작 ───────────
buildToolbar(); buildMenus(); doc(); tbState();
requestAnimationFrame(() => { fit(); if (innerWidth > 720 && !lsGet(LS_DLG, null) && !localStorage.getItem('myrubi.geo.seen')) { openDlg('basic'); try { localStorage.setItem('myrubi.geo.seen', '1'); } catch (e) {} } });
window.__geo = { solve, get bike() { return bike; }, get G() { return G; }, DEF, parseBcad, openDlg, fit };
})();
