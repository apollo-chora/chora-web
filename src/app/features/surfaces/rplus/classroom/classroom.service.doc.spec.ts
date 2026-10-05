/**
 * R6 D4: the ClassroomService docblock must list every endpoint the file calls.
 *
 * The docblock claimed a "5-endpoint contract" while the service made ten calls
 * to NINE distinct endpoints (`submitResponse` and `submitResponseDetailed`
 * both POST `/responses`). Four were undocumented: resolve-by-code, join,
 * advance, and the live-quiz questions read.
 *
 * Fixing the prose once would leave it free to rot again the next time an
 * endpoint is added, which is how it got to five-of-nine. So this asserts the
 * doc against the CODE by reading the source file: every `/api/v1/...` path the
 * service calls has to appear in the header comment, and the header must not
 * advertise a path the service does not call.
 *
 * It reads the file rather than the compiled module because a comment does not
 * survive compilation, which is exactly why nothing caught the drift.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'classroom.service.ts');

/** The file's leading block comment, which is the endpoint contract. */
function headerBlock(src: string): string {
  const end = src.indexOf('*/');
  expect(end).toBeGreaterThan(0);
  return src.slice(0, end);
}

/**
 * Normalise a path to its SHAPE, so `${encodeURIComponent(id)}` and `{id}`
 * compare equal: the doc writes placeholders, the code writes interpolations.
 */
function shape(path: string): string {
  return path
    .replace(/\$\{[^}]*\}/g, '{}')
    .replace(/\{[^}]*\}/g, '{}')
    .replace(/\/+$/, '');
}

/** Every /api/v1 path the service actually calls, by shape. */
function calledPaths(src: string): Set<string> {
  const body = src.slice(src.indexOf('*/'));
  const out = new Set<string>();
  for (const m of body.matchAll(/[`'"](\/api\/v1\/[^`'"]*)[`'"]/g)) {
    out.add(shape(m[1]));
  }
  return out;
}

/** Every /api/v1 path the header advertises, by shape. */
function documentedPaths(header: string): Set<string> {
  const out = new Set<string>();
  for (const m of header.matchAll(/(\/api\/v1\/[^\s]+)/g)) {
    out.add(shape(m[1]));
  }
  return out;
}

describe('ClassroomService endpoint documentation (R6 D4)', () => {
  const src = readFileSync(SOURCE, 'utf8');
  const called = calledPaths(src);
  const documented = documentedPaths(headerBlock(src));

  it('documents every endpoint it calls', () => {
    const undocumented = [...called].filter((p) => !documented.has(p)).sort();
    expect(undocumented).toEqual([]);
  });

  it('advertises no endpoint it does not call', () => {
    // The other direction matters too: a doc naming a route the service
    // dropped sends the next reader to a path nothing hits.
    const phantom = [...documented].filter((p) => !called.has(p)).sort();
    expect(phantom).toEqual([]);
  });

  it('calls more endpoints than the original docblock claimed', () => {
    // A positive control on the two assertions above: if the extraction ever
    // silently matched nothing, both would pass over an empty set. Nine
    // distinct endpoints were measured on a475e2791.
    expect(called.size).toBeGreaterThanOrEqual(9);
  });
});
