/**
 * qr.util spec — minimal dependency-free QR generator (CHO-1704 WS3 E).
 *
 * Structural-invariant checks (byte mode, EC level M, versions 1-6):
 *   - encodes the join URL without throwing + square matrix sizing
 *   - finder / timing / dark-module placement
 *   - format-information self-consistency (BCH(15,5) remainder 0, EC level
 *     M indicator, both copies agree) — catches placement transcription bugs
 *   - SVG path rendering helper
 */
import { describe, it, expect } from 'vitest';
import { encodeQr, qrSvg, qrSvgPath, type QrCode } from './qr.util';

const JOIN_URL = 'https://chora.site/play/K7M3QX';

/** Read the 15 raw format bits from copy 1 (around the top-left finder). */
function readFormatCopy1(m: readonly (readonly boolean[])[]): number {
  let bits = 0;
  const set = (i: number, v: boolean) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i++) set(i, m[i][8]); // col 8, rows 0..5
  set(6, m[7][8]);
  set(7, m[8][8]);
  set(8, m[8][7]);
  for (let i = 9; i < 15; i++) set(i, m[8][14 - i]); // row 8, cols 5..0
  return bits;
}

/** Read the 15 raw format bits from copy 2 (split bottom-left / top-right). */
function readFormatCopy2(m: readonly (readonly boolean[])[]): number {
  const size = m.length;
  let bits = 0;
  const set = (i: number, v: boolean) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i < 8; i++) set(i, m[8][size - 1 - i]); // row 8, right side
  for (let i = 8; i < 15; i++) set(i, m[size - 15 + i][8]); // col 8, bottom
  return bits;
}

/** BCH(15,5) remainder over generator 0x537 — 0 for a valid format word. */
function bchRemainder(value15: number): number {
  let r = value15;
  for (let i = 14; i >= 10; i--) {
    if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
  }
  return r;
}

describe('qr.util — encodeQr', () => {
  it('encodes the play join URL without throwing', () => {
    expect(() => encodeQr(JOIN_URL)).not.toThrow();
  });

  it('returns a square module matrix sized 17 + 4·version', () => {
    const qr: QrCode = encodeQr(JOIN_URL);
    expect((qr.size - 17) % 4).toBe(0);
    const version = (qr.size - 17) / 4;
    expect(version).toBeGreaterThanOrEqual(1);
    expect(version).toBeLessThanOrEqual(6);
    expect(qr.modules.length).toBe(qr.size);
    for (const row of qr.modules) expect(row.length).toBe(qr.size);
  });

  it('picks a small version for short content and grows for longer', () => {
    expect(encodeQr('AB').size).toBe(21); // v1 (≤14 bytes at EC-M)
    // 30-byte URL needs v3 (42-byte EC-M capacity)
    expect(encodeQr(JOIN_URL).size).toBe(29);
  });

  it('draws the three finder patterns + separators', () => {
    const { modules: m, size } = encodeQr(JOIN_URL);
    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      // Center of the 3×3 core is dark; the ring at distance 2 is light.
      expect(m[top + 3][left + 3]).toBe(true);
      expect(m[top + 1][left + 1]).toBe(false);
      expect(m[top][left]).toBe(true);
      expect(m[top + 6][left + 6]).toBe(true);
    }
    // Separator module just inside the symbol from the TL finder is light.
    expect(m[7][7]).toBe(false);
  });

  it('draws the alternating timing pattern on row/col 6', () => {
    const { modules: m, size } = encodeQr(JOIN_URL);
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it('always sets the dark module at (size-8, 8)', () => {
    const { modules: m, size } = encodeQr(JOIN_URL);
    expect(m[size - 8][8]).toBe(true);
  });

  it('writes BCH-valid EC-M format information in both copies', () => {
    const { modules } = encodeQr(JOIN_URL);
    const raw1 = readFormatCopy1(modules);
    const raw2 = readFormatCopy2(modules);
    expect(raw1).toBe(raw2);
    const unmasked = raw1 ^ 0x5412;
    expect(bchRemainder(unmasked)).toBe(0);
    const data5 = unmasked >>> 10;
    expect((data5 >>> 3) & 0b11).toBe(0b00); // EC level M indicator
    const mask = data5 & 0b111;
    expect(mask).toBeGreaterThanOrEqual(0);
    expect(mask).toBeLessThanOrEqual(7);
  });

  it('is deterministic for the same input', () => {
    const a = encodeQr(JOIN_URL);
    const b = encodeQr(JOIN_URL);
    expect(a.size).toBe(b.size);
    expect(a.modules).toEqual(b.modules);
  });

  it('throws a RangeError when the content exceeds version-6 capacity', () => {
    expect(() => encodeQr('x'.repeat(107))).toThrow(RangeError);
  });
});

describe('qr.util — SVG rendering', () => {
  it('qrSvgPath emits a non-empty path of unit squares', () => {
    const qr = encodeQr(JOIN_URL);
    const d = qrSvgPath(qr);
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('h1v1h-1z');
  });

  it('qrSvg convenience returns size + path together', () => {
    const { size, path } = qrSvg(JOIN_URL);
    expect(size).toBe(29);
    expect(path.startsWith('M')).toBe(true);
  });
});
