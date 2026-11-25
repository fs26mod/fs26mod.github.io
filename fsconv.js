/*
 * FS25 -> FS26 doku dönüştürücü (DDS / PNG -> AST)
 * .ast = 52 baytlık GIANTS başlığı ("GS2D") + ASTC 6x6 blokları (mipler KÜÇÜKTEN büyüğe, her seviye dikey çevrili)
 * Tarayıcıda ve Node'da çalışır, bağımlılığı yoktur.
 */
(function (root) {
'use strict';

const BW = 6, BH = 6, NPIX = 36;

/* ------------------------------------------------------------------ */
/*  ISE (integer sequence encoding): bit / trit / quint                */
/* ------------------------------------------------------------------ */
const QMAX = [1,2,3,4,5,7,9,11,15,19,23,31,39,47,63,79,95,127,159,191,255];

function qinfo(max) {
  const L = max + 1;
  const isPow2 = x => (x & (x - 1)) === 0;
  const lg = x => Math.round(Math.log2(x));
  if (isPow2(L)) return { n: lg(L), k: 0 };
  if (L % 3 === 0 && isPow2(L / 3)) return { n: lg(L / 3), k: 1 };
  if (L % 5 === 0 && isPow2(L / 5)) return { n: lg(L / 5), k: 2 };
  throw new Error('bad range ' + max);
}
function iseBits(count, max) {
  const q = qinfo(max);
  if (q.k === 1) return q.n * count + Math.ceil(8 * count / 5);
  if (q.k === 2) return q.n * count + Math.ceil(7 * count / 3);
  return q.n * count;
}

function tritDecode(T) {
  let C, t4, t3;
  if (((T >> 2) & 7) === 7) { C = (((T >> 5) & 7) << 2) | (T & 3); t4 = 2; t3 = 2; }
  else {
    C = T & 31;
    if (((T >> 5) & 3) === 3) { t4 = 2; t3 = (T >> 7) & 1; }
    else { t4 = (T >> 7) & 1; t3 = (T >> 5) & 3; }
  }
  let t2, t1, t0;
  if ((C & 3) === 3) {
    t2 = 2; t1 = (C >> 4) & 1;
    const c3 = (C >> 3) & 1, c2 = (C >> 2) & 1;
    t0 = (c3 << 1) | (c2 & (1 - c3));
  } else if (((C >> 2) & 3) === 3) { t2 = 2; t1 = 2; t0 = C & 3; }
  else { t2 = (C >> 4) & 1; t1 = (C >> 2) & 3; t0 = C & 3; }
  return [t0, t1, t2, t3, t4];
}
function quintDecode(Q) {
  let q0, q1, q2;
  if (((Q >> 1) & 3) === 3 && ((Q >> 5) & 3) === 0) {
    const a = Q & 1, q3 = (Q >> 3) & 1, q4 = (Q >> 4) & 1;
    q2 = (a << 2) | ((q4 & (1 - a)) << 1) | (q3 & (1 - a)); q1 = 4; q0 = 4;
  } else {
    let C;
    if (((Q >> 1) & 3) === 3) { q2 = 4; C = (((Q >> 3) & 3) << 3) | ((3 - ((Q >> 5) & 3)) << 1) | (Q & 1); }
    else { q2 = (Q >> 5) & 3; C = Q & 31; }
    if ((C & 7) === 5) { q1 = 4; q0 = (C >> 3) & 3; }
    else { q1 = (C >> 3) & 3; q0 = C & 7; }
  }
  return [q0, q1, q2];
}
const TRIT_DEC = [], TRIT_ENC = new Int16Array(243).fill(-1);
for (let T = 0; T < 256; T++) {
  const d = tritDecode(T); TRIT_DEC.push(d);
  const key = d[0] + 3 * d[1] + 9 * d[2] + 27 * d[3] + 81 * d[4];
  if (TRIT_ENC[key] < 0) TRIT_ENC[key] = T;
}
const QUINT_DEC = [], QUINT_ENC = new Int16Array(125).fill(-1);
for (let Q = 0; Q < 128; Q++) {
  const d = quintDecode(Q); QUINT_DEC.push(d);
  const key = d[0] + 5 * d[1] + 25 * d[2];
  if (QUINT_ENC[key] < 0) QUINT_ENC[key] = Q;
}

function readBits(bits, pos, n) {
  let v = 0;
  for (let i = 0; i < n; i++) v |= bits[pos + i] << i;
  return v;
}
function writeBits(bits, pos, n, v) {
  for (let i = 0; i < n; i++) bits[pos + i] = (v >> i) & 1;
}
const T_LEN = [2, 2, 1, 2, 1], T_POS = [0, 2, 4, 5, 7];
const Q_LEN = [3, 2, 2], Q_POS = [0, 3, 5];

function iseDecode(bits, pos, count, max) {
  const inf = qinfo(max), n = inf.n, out = new Array(count);
  if (inf.k === 0) { for (let i = 0; i < count; i++) out[i] = readBits(bits, pos + i * n, n); return out; }
  const isT = inf.k === 1, per = isT ? 5 : 3, LEN = isT ? T_LEN : Q_LEN, POS = isT ? T_POS : Q_POS;
  let p = pos;
  for (let g = 0; g < count; g += per) {
    const k = Math.min(per, count - g), m = [];
    let T = 0;
    for (let j = 0; j < k; j++) {
      m[j] = readBits(bits, p, n); p += n;
      T |= readBits(bits, p, LEN[j]) << POS[j]; p += LEN[j];
    }
    const dig = isT ? TRIT_DEC[T] : QUINT_DEC[T];
    for (let j = 0; j < k; j++) out[g + j] = (dig[j] << n) | m[j];
  }
  return out;
}
function iseEncode(vals, max, bits, pos) {
  const inf = qinfo(max), n = inf.n, count = vals.length, mask = (1 << n) - 1;
  if (inf.k === 0) { for (let i = 0; i < count; i++) writeBits(bits, pos + i * n, n, vals[i]); return pos + count * n; }
  const isT = inf.k === 1, per = isT ? 5 : 3, LEN = isT ? T_LEN : Q_LEN, POS = isT ? T_POS : Q_POS;
  let p = pos;
  for (let g = 0; g < count; g += per) {
    const k = Math.min(per, count - g), m = [], d = [0, 0, 0, 0, 0];
    for (let j = 0; j < k; j++) { m[j] = vals[g + j] & mask; d[j] = vals[g + j] >> n; }
    const T = isT ? TRIT_ENC[d[0] + 3 * d[1] + 9 * d[2] + 27 * d[3] + 81 * d[4]]
                  : QUINT_ENC[d[0] + 5 * d[1] + 25 * d[2]];
    for (let j = 0; j < k; j++) {
      writeBits(bits, p, n, m[j]); p += n;
      writeBits(bits, p, LEN[j], (T >> POS[j]) & ((1 << LEN[j]) - 1)); p += LEN[j];
    }
  }
  return p;
}

/* ---------------- unquantization tables ---------------- */
function patt(s, bitsVal) {           // "cb000cbcb" gibi şablonu bit değerlerinden kur
  // harfler: a=bit0, b=bit1, c=bit2 ...
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], bit = s.length - 1 - i;
    if (ch !== '0') r |= ((bitsVal >> (ch.charCodeAt(0) - 97)) & 1) << bit;
  }
  return r;
}
const C_TRIT = { 1: [204, '000000000'], 2: [93, 'b000b0bb0'], 3: [44, 'cb000cbcb'], 4: [22, 'dcb000dcb'], 5: [11, 'edcb000ed'], 6: [5, 'fedcb000f'] };
const C_QUINT = { 1: [113, '000000000'], 2: [54, 'b0000bb00'], 3: [26, 'cb000cbcb'], 4: [13, 'dcb000dcb'], 5: [6, 'edcb000ed'] };
const W_TRIT = { 1: [50, '0000000'], 2: [23, 'b000b00'], 3: [11, 'cb000cb'] };
const W_QUINT = { 1: [28, '0000000'], 2: [13, 'b0000b0'] };

const colorUnqCache = {}, weightUnqCache = {};
function colorUnq(max) {
  if (colorUnqCache[max]) return colorUnqCache[max];
  const inf = qinfo(max), tab = new Uint8Array(max + 1);
  for (let v = 0; v <= max; v++) {
    let r;
    if (inf.k === 0) {
      const n = inf.n; let x = v;
      // bitleri 8 bite çoğalt
      r = 0; let sh = 8 - n;
      while (sh > -n) { r |= sh >= 0 ? x << sh : x >> -sh; sh -= n; }
      r &= 255;
    } else {
      const n = inf.n, D = v >> n, bitsV = v & ((1 << n) - 1);
      if (n === 0) r = Math.round(D * 255 / max);          // endpoint olarak kullanılmaz
      else {
        const [C, B] = (inf.k === 1 ? C_TRIT : C_QUINT)[n];
        const a = bitsV & 1, A = a ? 0x1FF : 0;
        let T = D * C + patt(B, bitsV);
        T ^= A;
        r = (A & 0x80) | (T >> 2);
      }
    }
    tab[v] = r;
  }
  return (colorUnqCache[max] = tab);
}
function weightUnq(max) {
  if (weightUnqCache[max]) return weightUnqCache[max];
  const inf = qinfo(max), tab = new Uint8Array(max + 1);
  for (let v = 0; v <= max; v++) {
    let r;
    if (inf.k === 0) {
      const n = inf.n;
      if (n === 1) r = v ? 63 : 0;
      else if (n === 2) r = v * 21;
      else if (n === 3) r = v * 9;
      else if (n === 4) r = (v << 2) | (v >> 2);
      else r = (v << 1) | (v >> 4);
    } else {
      const n = inf.n, D = v >> n, bitsV = v & ((1 << n) - 1);
      if (n === 0) r = inf.k === 1 ? [0, 32, 63][D] : [0, 16, 32, 47, 63][D];
      else {
        const [C, B] = (inf.k === 1 ? W_TRIT : W_QUINT)[n];
        const a = bitsV & 1, A = a ? 0x7F : 0;
        let T = D * C + patt(B, bitsV);
        T ^= A;
        r = (A & 0x20) | (T >> 2);
      }
    }
    if (r > 32) r++;
    tab[v] = r;
  }
  return (weightUnqCache[max] = tab);
}

/* ------------------------------------------------------------------ */
/*  ASTC blok çözücü (LDR, tek bölüm)                                   */
/* ------------------------------------------------------------------ */
const W_RANGE_LO = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 7 };
const W_RANGE_HI = { 2: 9, 3: 11, 4: 15, 5: 19, 6: 23, 7: 31 };

function parseBlockMode(mode) {
  let nx, ny, D = (mode >> 10) & 1, H = (mode >> 9) & 1, R = (mode >> 4) & 1;
  const A = (mode >> 5) & 3;
  if ((mode & 3) !== 0) {
    R |= (mode & 3) << 1;
    let B = (mode >> 7) & 3;
    switch ((mode >> 2) & 3) {
      case 0: nx = B + 4; ny = A + 2; break;
      case 1: nx = B + 8; ny = A + 2; break;
      case 2: nx = A + 2; ny = B + 8; break;
      default:
        B &= 1;
        if (mode & 0x100) { nx = B + 2; ny = A + 2; } else { nx = A + 2; ny = B + 6; }
    }
  } else {
    R |= ((mode >> 2) & 3) << 1;
    if (((mode >> 2) & 3) === 0) return null;
    const B = (mode >> 9) & 3;
    switch ((mode >> 7) & 3) {
      case 0: nx = 12; ny = A + 2; break;
      case 1: nx = A + 2; ny = 12; break;
      case 2: nx = A + 6; ny = B + 6; D = 0; H = 0; break;
      default:
        if (((mode >> 5) & 3) === 0) { nx = 6; ny = 10; }
        else if (((mode >> 5) & 3) === 1) { nx = 10; ny = 6; }
        else return null;
    }
  }
  if (R < 2) return null;
  return { nx, ny, D, H, wmax: (H ? W_RANGE_HI : W_RANGE_LO)[R], R };
}

const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;
function blueContract(r, g, b, a) { return [(r + b) >> 1, (g + b) >> 1, b, a]; }
function bitTransfer(a, b) {
  b = (b >> 1) | (a & 0x80); a = (a >> 1) & 0x3F;
  if (a & 0x20) a -= 0x40;
  return [a, b];
}
function decodeEndpoints(cem, v) {
  let e0, e1;
  switch (cem) {
    case 0: e0 = [v[0], v[0], v[0], 255]; e1 = [v[1], v[1], v[1], 255]; break;
    case 1: {
      const l0 = (v[0] >> 2) | (v[1] & 0xC0), l1 = Math.min(255, l0 + (v[1] & 0x3F));
      e0 = [l0, l0, l0, 255]; e1 = [l1, l1, l1, 255]; break;
    }
    case 4: e0 = [v[0], v[0], v[0], v[2]]; e1 = [v[1], v[1], v[1], v[3]]; break;
    case 5: {
      const [o0, b0] = bitTransfer(v[1], v[0]), [o1, b1] = bitTransfer(v[3], v[2]);
      e0 = [b0, b0, b0, b1]; e1 = [clamp255(b0 + o0), clamp255(b0 + o0), clamp255(b0 + o0), clamp255(b1 + o1)]; break;
    }
    case 6: e0 = [(v[0] * v[3]) >> 8, (v[1] * v[3]) >> 8, (v[2] * v[3]) >> 8, 255]; e1 = [v[0], v[1], v[2], 255]; break;
    case 10: e0 = [(v[0] * v[3]) >> 8, (v[1] * v[3]) >> 8, (v[2] * v[3]) >> 8, v[4]]; e1 = [v[0], v[1], v[2], v[5]]; break;
    case 8: case 12: {
      const a0 = cem === 12 ? v[6] : 255, a1 = cem === 12 ? v[7] : 255;
      if (v[1] + v[3] + v[5] >= v[0] + v[2] + v[4]) { e0 = [v[0], v[2], v[4], a0]; e1 = [v[1], v[3], v[5], a1]; }
      else { e0 = blueContract(v[1], v[3], v[5], a1); e1 = blueContract(v[0], v[2], v[4], a0); }
      break;
    }
    case 9: case 13: {
      const t0 = bitTransfer(v[1], v[0]), t1 = bitTransfer(v[3], v[2]), t2 = bitTransfer(v[5], v[4]);
      let ta = [0, 255];
      if (cem === 13) { const t3 = bitTransfer(v[7], v[6]); ta = [t3[1], clamp255(t3[1] + t3[0])]; }
      const sum = t0[0] + t1[0] + t2[0];
      e0 = [t0[1], t1[1], t2[1], ta[0]];
      e1 = [clamp255(t0[1] + t0[0]), clamp255(t1[1] + t1[0]), clamp255(t2[1] + t2[0]), ta[1]];
      if (sum < 0) { const c0 = blueContract(e1[0], e1[1], e1[2], e1[3]), c1 = blueContract(e0[0], e0[1], e0[2], e0[3]); e0 = c0; e1 = c1; }
      break;
    }
    default: return null;
  }
  return [e0.map(clamp255), e1.map(clamp255)];
}

const _bits = new Uint8Array(128), _rev = new Uint8Array(128);
// stats: kaç blok desteklenmeyen modda
const decodeStats = { unsupported: 0, multiPartition: 0, void: 0, blocks: 0 };

function hash52(p) {
  p >>>= 0;
  p ^= p >>> 15; p = Math.imul(p, 0xEEDE0891) >>> 0;
  p ^= p >>> 5; p = (p + (p << 16)) >>> 0; p ^= p >>> 7; p ^= p >>> 3; p = (p ^ (p << 6)) >>> 0; p ^= p >>> 17;
  return p >>> 0;
}
function selectPartition(seed, x, y, count) {
  seed += (count - 1) * 1024;
  const rnum = hash52(seed);
  let s1 = rnum & 15, s2 = (rnum >>> 4) & 15, s3 = (rnum >>> 8) & 15, s4 = (rnum >>> 12) & 15, s5 = (rnum >>> 16) & 15, s6 = (rnum >>> 20) & 15,
      s7 = (rnum >>> 24) & 15, s8 = (rnum >>> 28) & 15, s9 = (rnum >>> 18) & 15, s10 = (rnum >>> 22) & 15, s11 = (rnum >>> 26) & 15, s12 = ((rnum >>> 30) | (rnum << 2)) & 15;
  s1 *= s1; s2 *= s2; s3 *= s3; s4 *= s4; s5 *= s5; s6 *= s6; s7 *= s7; s8 *= s8; s9 *= s9; s10 *= s10; s11 *= s11; s12 *= s12;
  let sh1, sh2;
  if (seed & 1) { sh1 = (seed & 2) ? 4 : 5; sh2 = count === 3 ? 6 : 5; }
  else { sh1 = count === 3 ? 6 : 5; sh2 = (seed & 2) ? 4 : 5; }
  const sh3 = (seed & 0x10) ? sh1 : sh2;
  s1 >>= sh1; s2 >>= sh2; s3 >>= sh1; s4 >>= sh2; s5 >>= sh1; s6 >>= sh2; s7 >>= sh1; s8 >>= sh2; s9 >>= sh3; s10 >>= sh3; s11 >>= sh3; s12 >>= sh3;
  let a = (s1 * x + s2 * y + (rnum >>> 14)) & 63, b = (s3 * x + s4 * y + (rnum >>> 10)) & 63,
      c = (s5 * x + s6 * y + (rnum >>> 6)) & 63, d = (s7 * x + s8 * y + (rnum >>> 2)) & 63;
  if (count < 4) d = 0; if (count < 3) c = 0;
  if (a >= b && a >= c && a >= d) return 0;
  if (b >= c && b >= d) return 1;
  return c >= d ? 2 : 3;
}

function decodeBlock(data, off, out) {          // out: 36*4 RGBA
  decodeStats.blocks++;
  for (let i = 0; i < 128; i++) _bits[i] = (data[off + (i >> 3)] >> (i & 7)) & 1;
  const mode = readBits(_bits, 0, 11);
  if ((mode & 0x1FF) === 0x1FC) {
    decodeStats.void++;
    const c = [];
    for (let i = 0; i < 4; i++) c.push((data[off + 8 + i * 2 + 1]));   // üst 8 bit
    for (let p = 0; p < NPIX; p++) { out[p * 4] = c[0]; out[p * 4 + 1] = c[1]; out[p * 4 + 2] = c[2]; out[p * 4 + 3] = c[3]; }
    return true;
  }
  const bm = parseBlockMode(mode);
  const err = () => { for (let p = 0; p < NPIX; p++) { out[p * 4] = 255; out[p * 4 + 1] = 0; out[p * 4 + 2] = 255; out[p * 4 + 3] = 255; } return false; };
  if (!bm) { decodeStats.unsupported++; return err(); }
  const parts = readBits(_bits, 11, 2) + 1;
  if (parts > 1) decodeStats.multiPartition++;
  const planes = bm.D ? 2 : 1;
  const wcount = bm.nx * bm.ny * planes;
  const wbits = iseBits(wcount, bm.wmax);
  if (wcount > 64 || wbits < 24 || wbits > 96 || (parts === 4 && bm.D)) { decodeStats.unsupported++; return err(); }
  let below = 128 - wbits, ccs = -1;
  if (bm.D) { below -= 2; ccs = readBits(_bits, below, 2); }
  const cems = [];
  let colorStart, extra = 0;
  if (parts === 1) { cems.push(readBits(_bits, 13, 4)); colorStart = 17; }
  else {
    colorStart = 29;
    const low = readBits(_bits, 23, 6);
    if ((low & 3) === 0) { for (let i = 0; i < parts; i++) cems.push((low >> 2) & 15); }
    else {
      extra = 3 * parts - 4;
      const et = low | (readBits(_bits, below - extra, extra) << 6), cls = (et & 3) - 1;
      for (let i = 0; i < parts; i++) cems.push((cls + ((et >> (2 + i)) & 1)) << 2);
      for (let i = 0; i < parts; i++) cems[i] |= (et >> (2 + parts + 2 * i)) & 3;
    }
  }
  let nvals = 0; for (const c of cems) nvals += ((c >> 2) + 1) * 2;
  const avail = below - extra - colorStart;
  let cmax = -1;
  for (const m of QMAX) if (iseBits(nvals, m) <= avail) cmax = m;
  if (cmax < 5) { decodeStats.unsupported++; return err(); }
  const raw = iseDecode(_bits, colorStart, nvals, cmax), cu = colorUnq(cmax);
  const eps = []; let ri = 0;
  for (const c of cems) {
    const n = ((c >> 2) + 1) * 2, vv = raw.slice(ri, ri + n).map(x => cu[x]); ri += n;
    const e = decodeEndpoints(c, vv);
    if (!e) { decodeStats.unsupported++; return err(); }
    eps.push(e);
  }
  for (let i = 0; i < 128; i++) _rev[i] = _bits[127 - i];
  const wq = iseDecode(_rev, 0, wcount, bm.wmax), wu = weightUnq(bm.wmax);
  const W = [new Array(bm.nx * bm.ny), new Array(bm.nx * bm.ny)];
  for (let i = 0; i < bm.nx * bm.ny; i++) for (let pl = 0; pl < planes; pl++) W[pl][i] = wu[wq[i * planes + pl]];
  const pidx = parts > 1 ? readBits(_bits, 13, 10) : 0;
  const Ds = Math.floor((1024 + (BW >> 1)) / (BW - 1)), Dt = Math.floor((1024 + (BH >> 1)) / (BH - 1));
  for (let t = 0; t < BH; t++) for (let s = 0; s < BW; s++) {
    const gs = ((Ds * s) * (bm.nx - 1) + 32) >> 6, gt = ((Dt * t) * (bm.ny - 1) + 32) >> 6;
    const js = gs >> 4, fs = gs & 15, jt = gt >> 4, ft = gt & 15;
    const w11 = (fs * ft + 8) >> 4, w10 = ft - w11, w01 = fs - w11, w00 = 16 - fs - ft + w11;
    const wts = [0, 0];
    for (let pl = 0; pl < planes; pl++) {
      const g = W[pl], at = (x, y) => g[Math.min(y, bm.ny - 1) * bm.nx + Math.min(x, bm.nx - 1)];
      wts[pl] = (w00 * at(js, jt) + w01 * at(js + 1, jt) + w10 * at(js, jt + 1) + w11 * at(js + 1, jt + 1) + 8) >> 4;
    }
    const ep = eps[parts > 1 ? selectPartition(pidx, s, t, parts) : 0];
    const p = (t * BW + s) * 4;
    for (let c = 0; c < 4; c++) {
      const w = (bm.D && c === ccs) ? wts[1] : wts[0];
      const c0 = ep[0][c] * 257, c1 = ep[1][c] * 257;
      out[p + c] = (((c0 * (64 - w) + c1 * w + 32) >> 6) >> 8);
    }
  }
  return true;
}

/** ASTC 6x6 veri akışını (tek mip) RGBA'ya çöz */
function decodeASTC(data, off, w, h) {
  const bx = Math.ceil(w / BW), by = Math.ceil(h / BH), rgba = new Uint8ClampedArray(w * h * 4), blk = new Uint8ClampedArray(NPIX * 4);
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) {
    decodeBlock(data, off + (y * bx + x) * 16, blk);
    for (let t = 0; t < BH; t++) { const py = y * BH + t; if (py >= h) break;
      for (let s = 0; s < BW; s++) { const px = x * BW + s; if (px >= w) break;
        const si = (t * BW + s) * 4, di = (py * w + px) * 4;
        rgba[di] = blk[si]; rgba[di + 1] = blk[si + 1]; rgba[di + 2] = blk[si + 2]; rgba[di + 3] = blk[si + 3]; } }
  }
  return rgba;
}

/* ------------------------------------------------------------------ */
/*  ASTC blok kodlayıcı (tek bölüm, 6x6 ızgara, RGB/RGBA direkt)        */
/* ------------------------------------------------------------------ */
// Aday yapılandırmalar: ağırlık aralığı R (H=0, 6x6 ızgara)
const CANDS = [3, 4, 5].map(R => {
  const wmax = W_RANGE_LO[R], wbits = iseBits(NPIX, wmax), mode = 0x100 | ((R >> 1) << 2) | ((R & 1) << 4);
  const wu = weightUnq(wmax);
  // ağırlıkları değere göre sırala (akış değeri ↔ gerçek ağırlık)
  const lv = []; for (let i = 0; i <= wmax; i++) lv.push({ q: i, w: wu[i] });
  lv.sort((a, b) => a.w - b.w);
  const out = { R, wmax, wbits, mode, levels: lv, lw: Float64Array.from(lv.map(l => l.w / 64)), lq: Int32Array.from(lv.map(l => l.q)), ep: {} };
  for (const nv of [6, 8]) {
    const avail = 128 - wbits - 17; let cm = -1;
    for (const m of QMAX) if (iseBits(nv, m) <= avail) cm = m;
    out.ep[nv] = cm;
  }
  return out;
});

const cqCache = {};
function colorQuantTable(cmax) {          // 0..255 -> en yakın akış değeri
  if (cqCache[cmax]) return cqCache[cmax];
  const u = colorUnq(cmax), t = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let best = 0, bd = 1e9;
    for (let q = 0; q <= cmax; q++) { const d = Math.abs(u[q] - v); if (d < bd) { bd = d; best = q; } }
    t[v] = best;
  }
  return (cqCache[cmax] = t);
}

const _px = new Float64Array(NPIX * 4), _f = new Float64Array(NPIX), _wi = new Int32Array(NPIX);
const _bitsOut = new Uint8Array(128), _revOut = new Uint8Array(128);

function encodeVoid(px, out, o) {
  out[o] = 0xFC; out[o + 1] = 0xFD;
  for (let i = 2; i < 8; i++) out[o + i] = 0xFF;
  for (let c = 0; c < 4; c++) { const v = px[c]; out[o + 8 + c * 2] = v; out[o + 9 + c * 2] = v; }
}

/** px: 36*4 RGBA bayt; out[o..o+16) bloğu yazılır */
function encodeBlock(px, out, o) {
  let same = true, hasAlpha = false;
  for (let i = 4; i < NPIX * 4; i++) if (px[i] !== px[i & 3]) { same = false; break; }
  if (same) { encodeVoid(px, out, o); return; }
  for (let i = 3; i < NPIX * 4; i += 4) if (px[i] !== 255) { hasAlpha = true; break; }
  const nc = hasAlpha ? 4 : 3, nv = nc * 2, cem = hasAlpha ? 12 : 8;
  for (let i = 0; i < NPIX; i++) for (let c = 0; c < nc; c++) _px[i * nc + c] = px[i * 4 + c];

  // ortalama + ana eksen
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < NPIX; i++) for (let c = 0; c < nc; c++) mean[c] += _px[i * nc + c];
  for (let c = 0; c < nc; c++) mean[c] /= NPIX;
  const cov = new Float64Array(16);
  for (let i = 0; i < NPIX; i++) for (let a = 0; a < nc; a++) { const da = _px[i * nc + a] - mean[a]; for (let b = a; b < nc; b++) cov[a * 4 + b] += da * (_px[i * nc + b] - mean[b]); }
  for (let a = 0; a < nc; a++) for (let b = 0; b < a; b++) cov[a * 4 + b] = cov[b * 4 + a];
  let ax = [1, 1, 1, 1].slice(0, nc), mn = [255, 255, 255, 255], mx = [0, 0, 0, 0];
  for (let i = 0; i < NPIX; i++) for (let c = 0; c < nc; c++) { const v = _px[i * nc + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
  for (let c = 0; c < nc; c++) ax[c] = mx[c] - mn[c] + 1e-3;
  for (let it = 0; it < 5; it++) {
    const nx = new Array(nc).fill(0);
    for (let a = 0; a < nc; a++) for (let b = 0; b < nc; b++) nx[a] += cov[a * 4 + b] * ax[b];
    let len = 0; for (let c = 0; c < nc; c++) len += nx[c] * nx[c];
    len = Math.sqrt(len); if (len < 1e-9) break;
    for (let c = 0; c < nc; c++) ax[c] = nx[c] / len;
  }
  { let len = 0; for (let c = 0; c < nc; c++) len += ax[c] * ax[c]; len = Math.sqrt(len) || 1; for (let c = 0; c < nc; c++) ax[c] /= len; }
  let tmin = 1e9, tmax = -1e9;
  for (let i = 0; i < NPIX; i++) { let t = 0; for (let c = 0; c < nc; c++) t += (_px[i * nc + c] - mean[c]) * ax[c]; _f[i] = t; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
  const e0 = new Float64Array(4), e1 = new Float64Array(4);
  for (let c = 0; c < nc; c++) { e0[c] = clamp255(mean[c] + ax[c] * tmin); e1[c] = clamp255(mean[c] + ax[c] * tmax); }
  // ana eksen yönü: toplam parlaklık artan olsun (blue-contract için)
  const s0 = e0[0] + e0[1] + e0[2], s1 = e1[0] + e1[1] + e1[2];
  if (s1 < s0) for (let c = 0; c < nc; c++) { const t = e0[c]; e0[c] = e1[c]; e1[c] = t; }

  let best = null;
  for (const cand of CANDS) {
    const cmax = cand.ep[nv];
    if (cmax < 5) continue;
    const L = cand.lw.length, lw = cand.lw;
    const a0 = Float64Array.from(e0), a1 = Float64Array.from(e1);
    const cu = colorUnq(cmax), cq = colorQuantTable(cmax);
    let q0 = new Int32Array(nc), q1 = new Int32Array(nc);

    const assign = (p0, p1) => {            // piksel başına en yakın ağırlık seviyesi
      let dd = 0; for (let c = 0; c < nc; c++) { const d = p1[c] - p0[c]; dd += d * d; }
      for (let i = 0; i < NPIX; i++) {
        let s = 0.5;
        if (dd > 1e-6) { let t = 0; for (let c = 0; c < nc; c++) t += (_px[i * nc + c] - p0[c]) * (p1[c] - p0[c]); s = t / dd; }
        let bi = 0, bd = 1e9;
        for (let k = 0; k < L; k++) { const d = Math.abs(lw[k] - s); if (d < bd) { bd = d; bi = k; } }
        _wi[i] = bi;
      }
    };
    const refit = () => {                   // en küçük kareler ile uçları güncelle
      let A = 0, B = 0, Cc = 0; const r0 = new Float64Array(nc), r1 = new Float64Array(nc);
      for (let i = 0; i < NPIX; i++) {
        const f = lw[_wi[i]], g = 1 - f; A += g * g; B += g * f; Cc += f * f;
        for (let c = 0; c < nc; c++) { r0[c] += g * _px[i * nc + c]; r1[c] += f * _px[i * nc + c]; }
      }
      const det = A * Cc - B * B;
      if (Math.abs(det) < 1e-6) return;
      for (let c = 0; c < nc; c++) {
        a0[c] = clamp255((r0[c] * Cc - r1[c] * B) / det);
        a1[c] = clamp255((r1[c] * A - r0[c] * B) / det);
      }
    };
    assign(a0, a1); refit(); assign(a0, a1); refit();

    // uçları nicemle
    for (let c = 0; c < nc; c++) { q0[c] = cq[Math.round(a0[c])]; q1[c] = cq[Math.round(a1[c])]; }
    let u0 = [], u1 = [];
    for (let c = 0; c < nc; c++) { u0[c] = cu[q0[c]]; u1[c] = cu[q1[c]]; }
    const sum = u => u[0] + u[1] + u[2];
    if (sum(u1) < sum(u0)) { const tq = q0; q0 = q1; q1 = tq; const tu = u0; u0 = u1; u1 = tu; }
    // son ağırlıklar (nicemlenmiş uçlara göre)
    assign(u0, u1);
    let err = 0;
    for (let i = 0; i < NPIX; i++) {
      const w = Math.round(lw[_wi[i]] * 64);
      for (let c = 0; c < nc; c++) {
        const v = (((u0[c] * 257) * (64 - w) + (u1[c] * 257) * w + 32) >> 6) >> 8, d = v - _px[i * nc + c]; err += d * d;
      }
    }
    if (!best || err < best.err) best = { err, cand, cmax, q0: Array.from(q0), q1: Array.from(q1), wi: Array.from(_wi) };
    if (err === 0) break;
  }

  // bloğu yaz
  const cand = best.cand, bits = _bitsOut, rev = _revOut;
  bits.fill(0); rev.fill(0);
  writeBits(bits, 0, 11, cand.mode);
  writeBits(bits, 11, 2, 0);
  writeBits(bits, 13, 4, cem);
  const vals = [];
  for (let c = 0; c < nc; c++) { vals.push(best.q0[c]); vals.push(best.q1[c]); }
  if (nc === 4 || nc === 3) { /* sıra: r0 r1 g0 g1 b0 b1 (a0 a1) */ }
  iseEncode(vals, best.cmax, bits, 17);
  const wv = best.wi.map(k => cand.lq[k]);
  iseEncode(wv, cand.wmax, rev, 0);
  for (let i = 0; i < cand.wbits; i++) bits[127 - i] = rev[i];
  for (let b = 0; b < 16; b++) { let v = 0; for (let i = 0; i < 8; i++) v |= bits[b * 8 + i] << i; out[o + b] = v; }
}

/* ------------------------------------------------------------------ */
/*  Görüntü yardımcıları                                                */
/* ------------------------------------------------------------------ */
function boxDown(src, w, h, nw, nh) {           // alan ortalaması ile küçült
  const dst = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++; }
      const o = (y * nw + x) * 4; dst[o] = (r / n + 0.5) | 0; dst[o + 1] = (g / n + 0.5) | 0; dst[o + 2] = (b / n + 0.5) | 0; dst[o + 3] = (a / n + 0.5) | 0;
    }
  }
  return dst;
}
function flipY(src, w, h) {
  const dst = new Uint8ClampedArray(src.length), row = w * 4;
  for (let y = 0; y < h; y++) dst.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  return dst;
}
function mipCount(w, h) {                       // örneklerde: en küçük kenar 4 olana dek
  const m = Math.min(w, h);
  return Math.max(1, Math.round(Math.log2(m)) - 1);
}
const tick = () => new Promise(r => setTimeout(r, 0));

async function encodeLevel(rgba, w, h, onBlocks) {
  const bx = Math.ceil(w / BW), by = Math.ceil(h / BH), out = new Uint8Array(bx * by * 16), blk = new Uint8Array(NPIX * 4);
  let last = Date.now();
  for (let y = 0; y < by; y++) {
    for (let x = 0; x < bx; x++) {
      for (let t = 0; t < BH; t++) {
        const py = Math.min(h - 1, y * BH + t);
        for (let s = 0; s < BW; s++) {
          const px = Math.min(w - 1, x * BW + s), si = (py * w + px) * 4, di = (t * BW + s) * 4;
          blk[di] = rgba[si]; blk[di + 1] = rgba[si + 1]; blk[di + 2] = rgba[si + 2]; blk[di + 3] = rgba[si + 3];
        }
      }
      encodeBlock(blk, out, (y * bx + x) * 16);
    }
    if (onBlocks) onBlocks(bx);
    if (Date.now() - last > 30) { await tick(); last = Date.now(); }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  .ast kapsayıcısı                                                    */
/* ------------------------------------------------------------------ */
// Başlık (52 bayt, örnek dosyalardan çıkarıldı):
//  0  "GS2D"   4  sürüm=8   8  genişlik   12 yükseklik   16 =1
//  20 [kanal(3/4), mip-1, 1, 0]   24 =4   28..43 (16 bayt kimlik)   44 =0x01010022   48 0x56 (mipli) / 0x17 (tek mip)
function makeHeader(w, h, channels, mips, idBytes) {
  const hd = new Uint8Array(52), dv = new DataView(hd.buffer);
  dv.setUint32(0, 0x44325347, true);            // "GS2D"
  dv.setUint32(4, 8, true); dv.setUint32(8, w, true); dv.setUint32(12, h, true); dv.setUint32(16, 1, true);
  hd[20] = channels; hd[21] = mips - 1; hd[22] = 1; hd[23] = 0;
  dv.setUint32(24, 4, true);
  hd.set(idBytes, 28);
  dv.setUint32(44, 0x01010022, true);
  hd[48] = 0; hd[49] = 0; hd[50] = 0; hd[51] = mips > 1 ? 0x56 : 0x17;
  return hd;
}
function fnv128(bytes) {                         // 16 baytlık deterministik kimlik
  const out = new Uint8Array(16);
  for (let k = 0; k < 4; k++) {
    let h = (0x811c9dc5 ^ (k * 0x9e3779b1)) >>> 0;
    for (let i = k; i < bytes.length; i += 1 + (bytes.length > 4096 ? 7 : 0)) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
    new DataView(out.buffer).setUint32(k * 4, h >>> 0, true);
  }
  return out;
}

/**
 * RGBA -> .ast
 * opts: { maxSize, mips (bool), channels (3|4), onProgress(0..1) }
 */
async function encodeAST(rgba, w, h, opts) {
  opts = opts || {};
  let cur = rgba, cw = w, ch = h;
  if (opts.maxSize && Math.max(w, h) > opts.maxSize) {
    const k = opts.maxSize / Math.max(w, h);
    cw = Math.max(1, Math.round(w * k)); ch = Math.max(1, Math.round(h * k));
    cur = boxDown(rgba, w, h, cw, ch);
  }
  const mips = opts.mips === false ? 1 : mipCount(cw, ch);
  const sizes = []; { let a = cw, b = ch; for (let i = 0; i < mips; i++) { sizes.push([a, b]); a = Math.max(1, a >> 1); b = Math.max(1, b >> 1); } }
  const totalBlocks = sizes.reduce((s, [a, b]) => s + Math.ceil(a / BW) * Math.ceil(b / BH), 0);
  let done = 0;
  // Seviyeleri hesapla (büyükten küçüğe), sonra KÜÇÜKTEN BÜYÜĞE ve her biri dikey çevrilmiş olarak kodla
  const levels = []; let level = cur, lw = cw, lh = ch;
  for (let i = 0; i < mips; i++) {
    const [a, b] = sizes[i];
    if (i > 0) { level = boxDown(level, lw, lh, a, b); lw = a; lh = b; }
    levels.push(level);
  }
  const chunks = [];
  for (let i = mips - 1; i >= 0; i--) {
    const [a, b] = sizes[i];
    chunks.push(await encodeLevel(flipY(levels[i], a, b), a, b, n => { done += n; if (opts.onProgress) opts.onProgress(Math.min(1, done / totalBlocks)); }));
  }
  const payload = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of chunks) { payload.set(c, p); p += c.length; }
  const channels = opts.channels || 4;
  const file = new Uint8Array(52 + payload.length);
  file.set(makeHeader(cw, ch, channels, mips, fnv128(payload)), 0);
  file.set(payload, 52);
  return { bytes: file, width: cw, height: ch, mips, channels };
}

/** .ast -> en büyük mip RGBA (önizleme / doğrulama). Mipler küçükten büyüğe, her biri dikey çevrili saklanır. */
function decodeAST(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x44325347) throw new Error('GS2D başlığı yok');
  const w = dv.getUint32(8, true), h = dv.getUint32(12, true);
  const baseBlocks = Math.ceil(w / BW) * Math.ceil(h / BH), total = (bytes.length - 52) / 16;
  const off = 52 + (total - baseBlocks) * 16;
  return { width: w, height: h, mips: bytes[21] + 1, channels: bytes[20], rgba: flipY(decodeASTC(bytes, off, w, h), w, h) };
}

/* ------------------------------------------------------------------ */
/*  DDS çözücü                                                          */
/* ------------------------------------------------------------------ */
function c565(v) { return [((v >> 11) & 31) * 255 / 31 + 0.5 | 0, ((v >> 5) & 63) * 255 / 63 + 0.5 | 0, (v & 31) * 255 / 31 + 0.5 | 0]; }
function decodeBC1Block(d, o, out, op, stride, hasAlphaMode) {
  const c0 = d[o] | (d[o + 1] << 8), c1 = d[o + 2] | (d[o + 3] << 8), a = c565(c0), b = c565(c1);
  const pal = [[a[0], a[1], a[2], 255], [b[0], b[1], b[2], 255]];
  if (c0 > c1 || !hasAlphaMode) {
    pal.push([(2 * a[0] + b[0]) / 3 | 0, (2 * a[1] + b[1]) / 3 | 0, (2 * a[2] + b[2]) / 3 | 0, 255]);
    pal.push([(a[0] + 2 * b[0]) / 3 | 0, (a[1] + 2 * b[1]) / 3 | 0, (a[2] + 2 * b[2]) / 3 | 0, 255]);
  } else {
    pal.push([(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1, 255]); pal.push([0, 0, 0, 0]);
  }
  const bitsv = (d[o + 4] | (d[o + 5] << 8) | (d[o + 6] << 16) | (d[o + 7] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const c = pal[(bitsv >>> (i * 2)) & 3], x = i & 3, y = i >> 2, p = op + y * stride + x * 4;
    out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = c[3];
  }
}
function decodeBC4Block(d, o, out, op, stride, ch) {      // tek kanal bloğu -> out[ch]
  const a0 = d[o], a1 = d[o + 1], pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i <= 6; i++) pal.push(((7 - i) * a0 + i * a1) / 7 + 0.5 | 0);
  else { for (let i = 1; i <= 4; i++) pal.push(((5 - i) * a0 + i * a1) / 5 + 0.5 | 0); pal.push(0, 255); }
  let lo = d[o + 2] | (d[o + 3] << 8) | (d[o + 4] << 16), hi = d[o + 5] | (d[o + 6] << 8) | (d[o + 7] << 16);
  for (let i = 0; i < 16; i++) {
    const idx = i < 8 ? (lo >> (i * 3)) & 7 : (hi >> ((i - 8) * 3)) & 7, x = i & 3, y = i >> 2;
    out[op + y * stride + x * 4 + ch] = pal[idx];
  }
}
function parseDDS(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x20534444) throw new Error('Geçerli bir DDS dosyası değil');
  const h = dv.getUint32(12, true), w = dv.getUint32(16, true), pf = 76;
  const flags = dv.getUint32(pf + 4, true), fourCC = String.fromCharCode(buf[pf + 8], buf[pf + 9], buf[pf + 10], buf[pf + 11]);
  const bpp = dv.getUint32(pf + 12, true), rm = dv.getUint32(pf + 16, true), gm = dv.getUint32(pf + 20, true), bm = dv.getUint32(pf + 24, true), am = dv.getUint32(pf + 28, true);
  let off = 128, fmt = null;
  if (flags & 4) {
    if (fourCC === 'DXT1') fmt = 'BC1'; else if (fourCC === 'DXT3') fmt = 'BC2'; else if (fourCC === 'DXT5') fmt = 'BC3';
    else if (fourCC === 'ATI1' || fourCC === 'BC4U') fmt = 'BC4'; else if (fourCC === 'ATI2' || fourCC === 'BC5U') fmt = 'BC5';
    else if (fourCC === 'DX10') {
      const dxgi = dv.getUint32(128, true); off = 148;
      const map = { 71: 'BC1', 72: 'BC1', 74: 'BC2', 75: 'BC2', 77: 'BC3', 78: 'BC3', 80: 'BC4', 81: 'BC4', 83: 'BC5', 84: 'BC5', 28: 'RGBA', 29: 'RGBA', 87: 'BGRA', 91: 'BGRA' };
      fmt = map[dxgi]; if (!fmt) throw new Error('Desteklenmeyen DDS biçimi (DXGI ' + dxgi + '). BC7 henüz desteklenmiyor.');
    } else throw new Error('Desteklenmeyen DDS biçimi: ' + fourCC);
  } else if ((flags & 0x40) && (bpp === 32 || bpp === 24)) fmt = 'RAW';
  else throw new Error('Desteklenmeyen DDS piksel biçimi');
  return { w, h, fmt, off, bpp, rm, gm, bm, am, hasAlphaMask: !!(flags & 1) };
}
function decodeDDS(buf) {
  const info = parseDDS(buf), { w, h, fmt, off } = info, out = new Uint8ClampedArray(w * h * 4);
  if (fmt === 'RAW' || fmt === 'RGBA' || fmt === 'BGRA') {
    const bytes = fmt === 'RAW' ? info.bpp / 8 : 4;
    const sh = m => { if (!m) return -1; let s = 0; while (!((m >>> s) & 1)) s++; return s; };
    let rs, gs, bs, as;
    if (fmt === 'RAW') { rs = sh(info.rm); gs = sh(info.gm); bs = sh(info.bm); as = sh(info.am); }
    else if (fmt === 'RGBA') { rs = 0; gs = 8; bs = 16; as = 24; } else { rs = 16; gs = 8; bs = 0; as = 24; }
    for (let i = 0; i < w * h; i++) {
      let v = 0; for (let k = 0; k < bytes; k++) v |= buf[off + i * bytes + k] << (8 * k);
      out[i * 4] = (v >>> rs) & 255; out[i * 4 + 1] = (v >>> gs) & 255; out[i * 4 + 2] = (v >>> bs) & 255; out[i * 4 + 3] = as >= 0 ? (v >>> as) & 255 : 255;
    }
    return { width: w, height: h, rgba: out, hasAlpha: as >= 0, format: fmt };
  }
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4), tmp = new Uint8ClampedArray(16 * 4), bsz = (fmt === 'BC1' || fmt === 'BC4') ? 8 : 16;
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) {
    const o = off + (y * bx + x) * bsz;
    tmp.fill(255);
    if (fmt === 'BC1') decodeBC1Block(buf, o, tmp, 0, 16, true);
    else if (fmt === 'BC2') {
      decodeBC1Block(buf, o + 8, tmp, 0, 16, false);
      for (let i = 0; i < 16; i++) { const n = (buf[o + (i >> 1)] >> ((i & 1) * 4)) & 15; tmp[((i >> 2) * 4 + (i & 3)) * 4 + 3] = n * 17; }
    } else if (fmt === 'BC3') { decodeBC1Block(buf, o + 8, tmp, 0, 16, false); decodeBC4Block(buf, o, tmp, 0, 16, 3); }
    else if (fmt === 'BC4') { decodeBC4Block(buf, o, tmp, 0, 16, 0); for (let i = 0; i < 16; i++) { tmp[i * 4 + 1] = tmp[i * 4 + 2] = tmp[i * 4]; tmp[i * 4 + 3] = 255; } }
    else if (fmt === 'BC5') {
      decodeBC4Block(buf, o, tmp, 0, 16, 0); decodeBC4Block(buf, o + 8, tmp, 0, 16, 1);
      for (let i = 0; i < 16; i++) {                      // Z'yi yeniden kur
        const nx = tmp[i * 4] / 127.5 - 1, ny = tmp[i * 4 + 1] / 127.5 - 1, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        tmp[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255); tmp[i * 4 + 3] = 255;
      }
    }
    for (let t = 0; t < 4; t++) { const py = y * 4 + t; if (py >= h) break;
      for (let s = 0; s < 4; s++) { const px = x * 4 + s; if (px >= w) break; const si = (t * 4 + s) * 4, di = (py * w + px) * 4;
        out[di] = tmp[si]; out[di + 1] = tmp[si + 1]; out[di + 2] = tmp[si + 2]; out[di + 3] = tmp[si + 3]; } }
  }
  const hasAlpha = fmt === 'BC2' || fmt === 'BC3';
  return { width: w, height: h, rgba: out, hasAlpha, format: fmt };
}

const api = { encodeAST, decodeAST, decodeDDS, parseDDS, decodeASTC, encodeBlock, decodeBlock, boxDown, flipY, mipCount, decodeStats,
  _internal: { iseEncode, iseDecode, iseBits, colorUnq, weightUnq, TRIT_ENC, QUINT_ENC, TRIT_DEC, QUINT_DEC, QMAX } };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FSConv = api;
})(typeof self !== 'undefined' ? self : this);
