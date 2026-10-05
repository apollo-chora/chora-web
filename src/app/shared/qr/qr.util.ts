/**
 * qr.util — minimal dependency-free QR code generator (CHO-1704 WS3 E).
 *
 * Scope (deliberately small — sized for the classroom join URL):
 *   - Byte mode only (UTF-8 content, e.g. `https://chora.site/play/K7M3QX`)
 *   - Error-correction level M
 *   - Versions 1–6 (up to 106 content bytes; v7+ would need the 18-bit
 *     version-information blocks — out of scope)
 *   - All 8 masks evaluated with the 4-rule penalty score (ISO/IEC 18004
 *     §7.8.3); the best mask wins
 *
 * No third-party QR dependency exists in chora-web (package.json checked
 * 2026-06-10) — vendoring ~300 lines beats adding a supply-chain edge for
 * one presenter lobby panel. Rendering is SVG-path based (unit squares),
 * see `qrSvgPath` / `qrSvg`.
 *
 * Implementation follows the standard construction order: data analysis →
 * codewords + Reed-Solomon EC (+ block interleave for v4-6) → function
 * patterns → zigzag data placement → mask selection → format information
 * (BCH(15,5), masked with 0x5412).
 */

export interface QrCode {
  /** Modules per side (17 + 4·version). */
  readonly size: number;
  /** Row-major module matrix; true = dark. */
  readonly modules: readonly (readonly boolean[])[];
}

// ── GF(256) arithmetic (polynomial 0x11d) ────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** Reed-Solomon generator polynomial of the given degree (MSB-first). */
function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    // poly ← poly · (x + α^i)
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!; // poly · x
      next[j + 1] ^= gfMul(poly[j]!, GF_EXP[i]!); // poly · α^i
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder (the EC codewords) for one data block. */
function rsRemainder(data: readonly number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const res = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = res[i]!;
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      res[i + j]! ^= gfMul(gen[j]!, factor);
    }
  }
  return res.slice(data.length);
}

// ── Version tables — EC level M, versions 1-6 ────────────────────────────────

interface VersionSpec {
  /** EC codewords per block. */
  readonly ecPerBlock: number;
  /** Data codewords per block (one entry per block). */
  readonly blocks: readonly number[];
  /** Alignment pattern centre coordinates. */
  readonly alignment: readonly number[];
}

const VERSION_SPECS: readonly VersionSpec[] = [
  { ecPerBlock: 10, blocks: [16], alignment: [] }, // v1
  { ecPerBlock: 16, blocks: [28], alignment: [6, 18] }, // v2
  { ecPerBlock: 26, blocks: [44], alignment: [6, 22] }, // v3
  { ecPerBlock: 18, blocks: [32, 32], alignment: [6, 26] }, // v4
  { ecPerBlock: 24, blocks: [43, 43], alignment: [6, 30] }, // v5
  { ecPerBlock: 16, blocks: [27, 27, 27, 27], alignment: [6, 34] }, // v6
];

function dataCodewords(spec: VersionSpec): number {
  return spec.blocks.reduce((sum, b) => sum + b, 0);
}

/** Max content bytes for byte mode (4-bit mode + 8-bit count headers). */
function byteCapacity(spec: VersionSpec): number {
  return Math.floor((dataCodewords(spec) * 8 - 12) / 8);
}

// ── Codeword assembly ────────────────────────────────────────────────────────

function buildCodewords(bytes: Uint8Array, spec: VersionSpec): number[] {
  const totalDataCw = dataCodewords(spec);
  const capacityBits = totalDataCw * 8;
  const bits: number[] = [];
  const pushBits = (value: number, count: number): void => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4); // byte-mode indicator
  pushBits(bytes.length, 8); // char count (8 bits for v1-9)
  for (const b of bytes) pushBits(b, 8);
  // Terminator (up to 4 zero bits), then pad to a byte boundary.
  pushBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  // Alternating pad codewords 0xEC / 0x11 to fill the data capacity.
  const padBytes = [0xec, 0x11];
  for (let p = 0; bits.length < capacityBits; p++) {
    pushBits(padBytes[p % 2]!, 8);
  }
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    data.push(byte);
  }
  // Split into blocks, compute EC per block, interleave (v4-6 multi-block).
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const len of spec.blocks) {
    const block = data.slice(offset, offset + len);
    offset += len;
    blocks.push(block);
    ecBlocks.push(rsRemainder(block, spec.ecPerBlock));
  }
  const out: number[] = [];
  const maxBlockLen = Math.max(...spec.blocks);
  for (let i = 0; i < maxBlockLen; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]!);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ec of ecBlocks) out.push(ec[i]!);
  }
  return out;
}

// ── Matrix construction ──────────────────────────────────────────────────────

interface Grid {
  readonly size: number;
  /** true = dark. */
  readonly modules: boolean[][];
  /** true = function module (finder/timing/alignment/format/dark). */
  readonly isFunction: boolean[][];
}

function setFunction(g: Grid, row: number, col: number, dark: boolean): void {
  g.modules[row]![col] = dark;
  g.isFunction[row]![col] = true;
}

function drawFinder(g: Grid, top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = top + r;
      const cc = left + c;
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue;
      const dist = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      setFunction(g, rr, cc, dist <= 3 && dist !== 2);
    }
  }
}

function drawAlignment(g: Grid, row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const dist = Math.max(Math.abs(r), Math.abs(c));
      setFunction(g, row + r, col + c, dist !== 1);
    }
  }
}

function drawFunctionPatterns(g: Grid, spec: VersionSpec): void {
  const size = g.size;
  // Finders + separators.
  drawFinder(g, 0, 0);
  drawFinder(g, 0, size - 7);
  drawFinder(g, size - 7, 0);
  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFunction(g, 6, i, dark);
    setFunction(g, i, 6, dark);
  }
  // Alignment patterns (skip the three finder corners).
  const centers = spec.alignment;
  const last = centers.length - 1;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      ) {
        continue;
      }
      drawAlignment(g, centers[i]!, centers[j]!);
    }
  }
  // Reserve the format-information areas (written per-mask later) + the
  // always-dark module. Values are placeholders; reservation keeps the
  // zigzag data placement out of these cells.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunction(g, i, 8, false); // col 8, rows 0..8 (skip timing row)
      setFunction(g, 8, i, false); // row 8, cols 0..8 (skip timing col)
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunction(g, 8, size - 1 - i, false); // row 8, right side
    setFunction(g, size - 1 - i, 8, false); // col 8, bottom side
  }
  setFunction(g, size - 8, 8, true); // dark module
}

/** BCH(15,5)-protected format word for (EC level M, mask), pre-masked. */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // EC level M indicator = 00
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) & 1 ? 0x537 : 0);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** Write both format-information copies for the chosen mask. */
function drawFormatBits(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
  const size = g.size;
  // Copy 1 — around the top-left finder.
  for (let i = 0; i <= 5; i++) setFunction(g, i, 8, bit(i));
  setFunction(g, 7, 8, bit(6));
  setFunction(g, 8, 8, bit(7));
  setFunction(g, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFunction(g, 8, 14 - i, bit(i));
  // Copy 2 — split bottom-left / top-right.
  for (let i = 0; i < 8; i++) setFunction(g, 8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFunction(g, size - 15 + i, 8, bit(i));
  setFunction(g, size - 8, 8, true); // dark module stays dark
}

/** Zigzag data placement (bottom-right, 2-wide columns, skipping col 6). */
function drawCodewords(g: Grid, codewords: readonly number[]): void {
  const size = g.size;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // skip the timing column entirely
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (g.isFunction[row]![c]) continue;
        let dark = false;
        if (bitIndex < totalBits) {
          dark =
            ((codewords[bitIndex >> 3]! >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex++;
        }
        g.modules[row]![c] = dark; // remainder bits stay light
      }
    }
    upward = !upward;
  }
}

// ── Mask predicates + penalty (ISO/IEC 18004 §7.8) ───────────────────────────

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): void {
  const predicate = MASKS[mask]!;
  for (let r = 0; r < g.size; r++) {
    for (let c = 0; c < g.size; c++) {
      if (!g.isFunction[r]![c] && predicate(r, c)) {
        g.modules[r]![c] = !g.modules[r]![c];
      }
    }
  }
}

function penaltyScore(m: readonly (readonly boolean[])[]): number {
  const size = m.length;
  let score = 0;
  // N1 — runs of ≥5 same-coloured modules (rows + columns).
  for (let r = 0; r < size; r++) {
    let rowColor = m[r]![0]!;
    let rowRun = 1;
    let colColor = m[0]![r]!;
    let colRun = 1;
    for (let i = 1; i < size; i++) {
      if (m[r]![i] === rowColor) rowRun++;
      else {
        if (rowRun >= 5) score += 3 + rowRun - 5;
        rowColor = m[r]![i]!;
        rowRun = 1;
      }
      if (m[i]![r] === colColor) colRun++;
      else {
        if (colRun >= 5) score += 3 + colRun - 5;
        colColor = m[i]![r]!;
        colRun = 1;
      }
    }
    if (rowRun >= 5) score += 3 + rowRun - 5;
    if (colRun >= 5) score += 3 + colRun - 5;
  }
  // N2 — 2×2 blocks of the same colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r]![c]!;
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) {
        score += 3;
      }
    }
  }
  // N3 — finder-like 1:1:3:1:1 pattern with a 4-light flank (both axes).
  const PATTERN_A = 0b10111010000;
  const PATTERN_B = 0b00001011101;
  for (let r = 0; r < size; r++) {
    let rowBits = 0;
    let colBits = 0;
    for (let i = 0; i < size; i++) {
      rowBits = ((rowBits << 1) | (m[r]![i] ? 1 : 0)) & 0x7ff;
      colBits = ((colBits << 1) | (m[i]![r] ? 1 : 0)) & 0x7ff;
      if (i >= 10) {
        if (rowBits === PATTERN_A || rowBits === PATTERN_B) score += 40;
        if (colBits === PATTERN_A || colBits === PATTERN_B) score += 40;
      }
    }
  }
  // N4 — dark-module proportion deviation from 50% (10 per 5% step).
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encode `text` (UTF-8, byte mode, EC level M) into a QR module matrix.
 * Throws RangeError when the content exceeds version-6 capacity (106 bytes).
 */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  let version = -1;
  for (let v = 0; v < VERSION_SPECS.length; v++) {
    if (bytes.length <= byteCapacity(VERSION_SPECS[v]!)) {
      version = v;
      break;
    }
  }
  if (version < 0) {
    throw new RangeError(
      `qr.util: content is ${bytes.length} bytes: exceeds the ` +
        `${byteCapacity(VERSION_SPECS[VERSION_SPECS.length - 1]!)}-byte ` +
        'version-6 EC-M capacity',
    );
  }
  const spec = VERSION_SPECS[version]!;
  const size = 17 + 4 * (version + 1);
  const base: Grid = {
    size,
    modules: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    ),
    isFunction: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false),
    ),
  };
  drawFunctionPatterns(base, spec);
  drawCodewords(base, buildCodewords(bytes, spec));
  // Evaluate all 8 masks; keep the lowest penalty.
  let bestModules: boolean[][] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    const candidate: Grid = {
      size,
      modules: base.modules.map((row) => [...row]),
      isFunction: base.isFunction,
    };
    applyMask(candidate, mask);
    drawFormatBits(candidate, mask);
    const penalty = penaltyScore(candidate.modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate.modules;
    }
  }
  return { size, modules: bestModules! };
}

/**
 * Render the matrix as a single SVG path of unit squares (one `M…h1v1h-1z`
 * run per dark module). Pair with `viewBox="0 0 size size"` (+ your own
 * quiet-zone margin) and `shape-rendering="crispEdges"`.
 */
export function qrSvgPath(qr: QrCode): string {
  const parts: string[] = [];
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.modules[r]![c]) parts.push(`M${c} ${r}h1v1h-1z`);
    }
  }
  return parts.join('');
}

/** Convenience: encode + path in one call (size drives the viewBox). */
export function qrSvg(text: string): { size: number; path: string } {
  const qr = encodeQr(text);
  return { size: qr.size, path: qrSvgPath(qr) };
}
