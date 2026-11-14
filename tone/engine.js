// 톤 매칭 엔진 (/tone/)
// 사진 한 장의 톤을 숫자로 요약(analyze)하고, 기준 톤(profile)에 맞추는 3D LUT를 만들어 픽셀에 입힙니다.
// 브라우저(window.ToneEngine)와 Node(require) 양쪽에서 같은 코드가 돌아서, 프리셋도 이 코드로 만듭니다.
//
// 맞추는 것 세 가지 (모두 Lab 색공간)
//   1. 밝기 곡선: 원본과 기준의 밝기 분포 백분위(0.5 · 5 · 25 · 50 · 75 · 95 · 99.5%)를 이어 부드러운 곡선을 만듦.
//      검은점·흰점은 거의 그대로 맞추고, 중간 밝기는 절반쯤만 맞춰서 장면 자체가 어두운 사진이 억지로 밝아지지 않게 함
//   2. 색 기운: 밝기 구간(그림자 → 하이라이트 5구간)마다 회색에 가까운 픽셀의 평균 색을 재서
//      원본의 회색이 기준의 회색과 같은 기운(화이트밸런스, 그림자·하이라이트 색)이 되도록 옮김
//   3. 채도: 색이 있는 픽셀(채도 10 이상)의 75% 지점 채도를 기준에 맞추되 70%만, 0.85–1.3배 안에서.
//      회색 벽이 대부분인 사진도 색이 있는 부분만 보기 때문에 장면 내용에 덜 휘둘림
(function (root) {
  'use strict';

  const P = [0.5, 5, 25, 50, 75, 95, 99.5];           // 밝기 곡선에 쓰는 백분위
  const PW = [1, 0.9, 0.6, 0.45, 0.6, 0.9, 1];         // 백분위별로 얼마나 기준에 맞출지
  const ZONES = [10, 30, 50, 70, 90];                  // 색 기운을 재는 밝기 구간 중심
  const ZSIG = 13;                                     // 구간 폭 (가우시안)
  const NEUTRAL_C = 12;                                // 이 채도 아래를 회색 계열로 봄
  const VERSION = 1;

  // sRGB ↔ Lab (D65)
  const lin = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const Xn = 0.95047, Zn = 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const finv = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const gam = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  function rgbLinToLab(r, g, b, out) {
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / Xn;
    const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / Zn;
    const fx = f(x), fy = f(y), fz = f(z);
    out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
    return out;
  }
  function labToRgb01(L, a, b, out) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const x = finv(fx) * Xn, y = finv(fy), z = finv(fz) * Zn;
    const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    const g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
    const bb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    out[0] = gam(Math.max(0, r)); out[1] = gam(Math.max(0, g)); out[2] = gam(Math.max(0, bb));
    return out;
  }

  function quantile(sorted, p) {
    if (!sorted.length) return 0;
    const i = (sorted.length - 1) * p / 100, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /** 사진 한 장 요약. data: RGBA(Uint8ClampedArray), 긴 변 512px 안팎으로 줄인 것이면 충분 */
  function analyze(data) {
    const n = data.length >> 2;
    const Ls = new Float32Array(n), As = new Float32Array(n), Bs = new Float32Array(n), Cs = new Float32Array(n);
    const lab = [0, 0, 0];
    let m = 0;
    for (let i = 0; i < n; i++) {
      const o = i << 2;
      if (data[o + 3] < 128) continue;
      rgbLinToLab(lin[data[o]], lin[data[o + 1]], lin[data[o + 2]], lab);
      Ls[m] = lab[0]; As[m] = lab[1]; Bs[m] = lab[2]; Cs[m] = Math.hypot(lab[1], lab[2]); m++;
    }
    // 구간별 회색 기운: 1차로 채도 낮은 픽셀 평균, 2차로 그 평균 둘레(반지름 7)만 다시 평균.
    // 완전한 검정·흰색(잘린 곳)은 색 정보가 없어서 뺌
    const tint = ZONES.map(zc => {
      let sa = 0, sb = 0, sw = 0;
      for (let i = 0; i < m; i++) {
        const L = Ls[i]; if (L <= 2 || L >= 98 || Cs[i] >= NEUTRAL_C) continue;
        const d = (L - zc) / ZSIG, w = Math.exp(-0.5 * d * d);
        sa += w * As[i]; sb += w * Bs[i]; sw += w;
      }
      if (sw <= 0) return [0, 0, 0];
      for (let pass = 0; pass < 2; pass++) {
        const ea = sa / sw, eb = sb / sw;
        let ta = 0, tb = 0, tw = 0;
        for (let i = 0; i < m; i++) {
          const L = Ls[i]; if (L <= 2 || L >= 98) continue;
          const da = As[i] - ea, db = Bs[i] - eb; if (da * da + db * db > 49) continue;
          const d = (L - zc) / ZSIG, w = Math.exp(-0.5 * d * d);
          ta += w * As[i]; tb += w * Bs[i]; tw += w;
        }
        if (tw <= 0) break;
        sa = ta; sb = tb; sw = tw;
      }
      return [+(sa / sw).toFixed(2), +(sb / sw).toFixed(2), +(sw / Math.max(1, m)).toFixed(4)];
    });
    const L = Array.from(Ls.subarray(0, m)).sort((x, y) => x - y);
    const C = Array.from(Cs.subarray(0, m)).sort((x, y) => x - y);
    const colored = C.filter(c => c >= 10);
    return {
      v: VERSION,
      n: m,
      lq: P.map(p => +quantile(L, p).toFixed(2)),
      c90: +quantile(C, 90).toFixed(2),
      c50: +quantile(C, 50).toFixed(2),
      cc: colored.length >= m * 0.01 ? +quantile(colored, 75).toFixed(2) : null,   // 색이 있는 픽셀의 채도 (너무 적으면 null)
      tint,   // 구간별 [a, b, 비중]. 비중은 전체 픽셀 대비 (너무 작으면 그 구간은 믿지 않음)
    };
  }

  /** 여러 장 요약을 하나의 기준 톤으로 합침 (사진마다 같은 비중) */
  function merge(list) {
    list = list.filter(Boolean);
    if (!list.length) return null;
    if (list.length === 1) return JSON.parse(JSON.stringify(list[0]));
    const avg = fn => list.reduce((s, x) => s + fn(x), 0) / list.length;
    return {
      v: VERSION,
      n: list.reduce((s, x) => s + x.n, 0),
      lq: P.map((_, i) => +avg(x => x.lq[i]).toFixed(2)),
      c90: +avg(x => x.c90).toFixed(2),
      c50: +avg(x => x.c50).toFixed(2),
      cc: (() => { const v = list.map(x => x.cc).filter(x => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; })(),
      tint: ZONES.map((_, z) => {
        const w = list.reduce((s, x) => s + x.tint[z][2], 0);
        if (!w) return [0, 0, 0];
        const a = list.reduce((s, x) => s + x.tint[z][0] * x.tint[z][2], 0) / w;
        const b = list.reduce((s, x) => s + x.tint[z][1] * x.tint[z][2], 0) / w;
        return [+a.toFixed(2), +b.toFixed(2), +(w / list.length).toFixed(4)];
      }),
    };
  }

  // 단조 3차 보간 (Fritsch–Carlson): 곡선이 뒤집히거나 출렁이지 않음
  function monoCurve(xs, ys) {
    const n = xs.length, d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0] + (x - xs[0]) * m[0];
      if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * m[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }

  // 구간별 기운을 밝기에 따라 이어 붙임. 믿을 수 없는 구간은 가까운 구간 값을 씀
  function tintFn(st) {
    const ok = st.tint.map(t => t[2] >= 0.003);
    if (!ok.some(Boolean)) return () => [0, 0];
    const vals = st.tint.map((t, z) => {
      if (ok[z]) return [t[0], t[1]];
      let best = -1, bd = 1e9;
      ok.forEach((v, j) => { if (v && Math.abs(j - z) < bd) { bd = Math.abs(j - z); best = j; } });
      return [st.tint[best][0], st.tint[best][1]];
    });
    return L => {
      if (L <= ZONES[0]) return vals[0];
      if (L >= ZONES[ZONES.length - 1]) return vals[vals.length - 1];
      let z = 0; while (L > ZONES[z + 1]) z++;
      const t = (L - ZONES[z]) / (ZONES[z + 1] - ZONES[z]);
      return [vals[z][0] + (vals[z + 1][0] - vals[z][0]) * t, vals[z][1] + (vals[z + 1][1] - vals[z][1]) * t];
    };
  }

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  /**
   * 원본 요약(src)을 기준 톤(ref)에 맞추는 LUT.
   * opt: strength 0–1.5 (1 = 기본), bright −1–1, temp −1–1 (+ 따뜻하게), sat −1–1, size 격자 수(기본 33)
   * 돌려주는 값: { size, data: Float32Array(size³·3, 0–255) } — 순서는 r 가장 빠르게, 그다음 g, b
   */
  function buildLUT(src, ref, opt) {
    opt = opt || {};
    const S = opt.size || 33;
    const k = opt.strength == null ? 1 : opt.strength;
    const bright = opt.bright || 0, temp = opt.temp || 0, satAdj = opt.sat || 0;

    // 1. 밝기 곡선 (0→0, 100→100 고정, 사이 점은 원본 백분위 → 기준 백분위)
    let curve = x => x;
    if (src && ref) {
      const xs = [0], ys = [0];
      P.forEach((_, i) => {
        const x = src.lq[i], y = x + clamp(k * PW[i], 0, 1.5) * (ref.lq[i] - x);
        if (x > xs[xs.length - 1] + 0.8 && x < 99.2) { xs.push(x); ys.push(Math.max(y, ys[ys.length - 1] + 0.05)); }
      });
      xs.push(100); ys.push(Math.max(100 - (100 - (ref.lq[6] + 3)) * clamp(k, 0, 1) * 0.6, ys[ys.length - 1] + 0.05));
      curve = monoCurve(xs, ys);
    }

    // 2. 색 기운
    const sT = src ? tintFn(src) : () => [0, 0];
    const rT = ref ? tintFn(ref) : () => [0, 0];

    // 3. 채도
    let sat = 1;
    // 예전 프로필(cc 없음)은 c90으로 비교
    const useCC = src && ref && src.cc != null && ref.cc != null;
    const sv = src ? (useCC ? src.cc : src.c90) : 0, rv = ref ? (useCC ? ref.cc : ref.c90) : 0;
    if (src && ref && sv > 1 && (useCC || ref.cc == null)) sat = Math.pow(clamp(Math.pow(rv / sv, 0.7), 0.85, 1.3), clamp(k, 0, 1.5));
    sat *= 1 + satAdj * 0.45;

    const data = new Float32Array(S * S * S * 3);
    const lab = [0, 0, 0], rgb = [0, 0, 0];
    let o = 0;
    for (let bi = 0; bi < S; bi++) for (let gi = 0; gi < S; gi++) for (let ri = 0; ri < S; ri++) {
      const r = ri / (S - 1), g = gi / (S - 1), b = bi / (S - 1);
      const lr = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
      const lg = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
      const lb = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
      rgbLinToLab(lr, lg, lb, lab);
      const L0 = lab[0];
      let L = curve(L0);
      if (bright) { const u = clamp(L / 100, 0, 1); L += bright * 14 * 4 * u * (1 - u); }
      L = clamp(L, 0, 100);
      // 원본에서 이 밝기의 회색 → 기준에서 바뀐 밝기의 회색
      const sn = sT(L0), rn = rT(L);
      let da = clamp((rn[0] - sn[0]) * k, -15, 15), db = clamp((rn[1] - sn[1]) * k, -15, 15);
      db += temp * 9; da += temp * 1.5;
      // 회색 기준점을 중심으로 채도 조절, 아주 어두운 곳·밝은 곳은 채도 변화를 줄여 얼룩을 막음
      const edge = clamp(Math.min(L, 100 - L) / 12, 0, 1);
      const s = 1 + (sat - 1) * edge;
      const na = sn[0] + da, nb = sn[1] + db;
      const a = na + (lab[1] - sn[0]) * s, bb = nb + (lab[2] - sn[1]) * s;
      labToRgb01(L, a, bb, rgb);
      data[o++] = clamp(rgb[0], 0, 1) * 255; data[o++] = clamp(rgb[1], 0, 1) * 255; data[o++] = clamp(rgb[2], 0, 1) * 255;
    }
    return { size: S, data };
  }

  /** LUT를 RGBA 픽셀에 입힘 (삼선형 보간). src와 dst가 같아도 됨. from/to 로 줄 범위를 나눠 처리 가능 */
  function applyLUT(src, dst, lut, from, to) {
    const S = lut.size, D = lut.data, s1 = S - 1, S2 = S * S, sc = s1 / 255;
    from = from || 0; to = to == null ? src.length : to;
    for (let o = from; o < to; o += 4) {
      const fr = src[o] * sc, fg = src[o + 1] * sc, fb = src[o + 2] * sc;
      let r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
      if (r0 >= s1) r0 = s1 - 1; if (g0 >= s1) g0 = s1 - 1; if (b0 >= s1) b0 = s1 - 1;
      const dr = fr - r0, dg = fg - g0, db = fb - b0;
      const i000 = (r0 + g0 * S + b0 * S2) * 3;
      const i100 = i000 + 3, i010 = i000 + S * 3, i110 = i010 + 3;
      const i001 = i000 + S2 * 3, i101 = i001 + 3, i011 = i001 + S * 3, i111 = i011 + 3;
      for (let c = 0; c < 3; c++) {
        const c00 = D[i000 + c] + (D[i100 + c] - D[i000 + c]) * dr;
        const c10 = D[i010 + c] + (D[i110 + c] - D[i010 + c]) * dr;
        const c01 = D[i001 + c] + (D[i101 + c] - D[i001 + c]) * dr;
        const c11 = D[i011 + c] + (D[i111 + c] - D[i011 + c]) * dr;
        const c0 = c00 + (c10 - c00) * dg, c1 = c01 + (c11 - c01) * dg;
        dst[o + c] = c0 + (c1 - c0) * db;
      }
      dst[o + 3] = src[o + 3];
    }
    return dst;
  }

  const api = { analyze, merge, buildLUT, applyLUT, VERSION, _curve: monoCurve };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ToneEngine = api;
})(typeof self !== 'undefined' ? self : this);
