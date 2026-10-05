/**
 * A+ hub-page layout consistency (CHO-2340).
 *
 * MOVED here in C2 slice 3 when the Learn hub sub-nav it used to sit beside
 * was retired. The guard OUTLIVES that strip: it is about container geometry,
 * not about which navigation a page renders, and its six pages all still carry
 * `.aplus-hub-page`. Only the dashboard's strip actually went away (the Courses
 * strip that replaced it carries no Dashboard tab), and geometry is untouched
 * by that.
 *
 * Five of the six render the Courses strip as the first child of their own
 * top-level <section>; the dashboard renders none since C2 slice 3, because
 * the strip carries no Dashboard tab. What all six still share, and what this
 * guards, is the container geometry. When those sections carried
 * their OWN padding / max-width the geometry drifted (my-courses + study had
 * none; me-transcript capped at 1024px, not 1280px), so the shared sub-nav pill
 * shifted position + width between pages.
 *
 * The fix centralises the container geometry into ONE global class,
 * `.aplus-hub-page` (src/styles/_aplus-hub.scss), applied to all 6 sections;
 * the per-page padding/max-width is removed so it CANNOT drift again. A scoped
 * component rule out-specifies a global class (the emulated-encapsulation
 * attribute adds specificity), so a page that keeps its own padding/max-width
 * would silently win over the shared class and reintroduce the drift. This
 * lexical spec is the anti-drift guard for exactly that:
 *   1. every hub-page <section> template carries `aplus-hub-page`;
 *   2. no hub-page component style re-declares padding/max-width on its own
 *      container selector;
 *   3. the shared class is defined once (geometry only) and wired into the
 *      global stylesheet.
 *
 * Lexical (reads the source files) rather than a mounted DOM assertion because
 * jsdom does not apply the global stylesheet or compute layout, and this must
 * cover all 6 pages including the ones whose components carry heavy deps.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSrcRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, 'src', 'styles', '_tokens.scss'));
      return join(dir, 'src');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `hub-page-layout.spec: could not locate src/styles/_tokens.scss from ${process.cwd()}`,
  );
}

const SRC = findSrcRoot();
const APLUS = join(SRC, 'app', 'features', 'surfaces', 'aplus');
const SHARED_CLASS = 'aplus-hub-page';
const SHARED_PARTIAL = join(SRC, 'styles', '_aplus-hub.scss');
const GLOBAL_STYLES = join(SRC, 'styles.scss');

/** The 6 A+ Learn hub pages: display name + top-level container class + files. */
interface HubPage {
  readonly name: string;
  readonly container: string;
  readonly html: string;
  readonly scss: string;
}
const HUB_PAGES: readonly HubPage[] = [
  {
    name: 'dashboard',
    container: 'aplus-dashboard',
    html: join(APLUS, 'dashboard/dashboard.component.html'),
    scss: join(APLUS, 'dashboard/dashboard.component.scss'),
  },
  {
    name: 'catalog',
    container: 'aplus-catalog',
    html: join(APLUS, 'catalog/catalog.component.html'),
    scss: join(APLUS, 'catalog/catalog.component.scss'),
  },
  {
    name: 'me-assessments',
    container: 'me-assessments-list',
    html: join(APLUS, 'me-assessments/me-assessments-list/me-assessments-list.component.html'),
    scss: join(APLUS, 'me-assessments/me-assessments-list/me-assessments-list.component.scss'),
  },
  {
    name: 'my-courses',
    container: 'my-courses',
    html: join(APLUS, 'my-courses/my-courses.component.html'),
    scss: join(APLUS, 'my-courses/my-courses.component.scss'),
  },
  {
    name: 'study',
    container: 'study-lists',
    html: join(APLUS, 'study/study-lists/study-lists.component.html'),
    scss: join(APLUS, 'study/study-lists/study-lists.component.scss'),
  },
  {
    name: 'me-transcript',
    container: 'me-transcript',
    html: join(APLUS, 'me-transcript/me-transcript.component.html'),
    scss: join(APLUS, 'me-transcript/me-transcript.component.scss'),
  },
];

/** The opening <section ...> tag of a hub-page template (its first element). */
function sectionOpenTag(html: string): string {
  const start = html.indexOf('<section');
  const end = html.indexOf('>', start);
  return html.slice(start, end + 1);
}

/**
 * The DIRECT declarations of a top-level selector, the text from its opening
 * `{` up to the NEXT `{` (which opens either a nested rule or the following
 * selector). This isolates the container's OWN properties from nested rules,
 * so the anti-drift check is not fooled by a nested `&__header { padding }` nor
 * by a sibling `.x__body { max-width }` selector elsewhere in the file.
 */
function directDeclarations(scss: string, selector: string): string {
  const re = new RegExp(`\\.${selector}\\s*\\{`);
  const m = re.exec(scss);
  if (!m) throw new Error(`selector .${selector} not found`);
  const openBrace = scss.indexOf('{', m.index);
  const nextBrace = scss.indexOf('{', openBrace + 1);
  const end = nextBrace < 0 ? scss.length : nextBrace;
  return scss.slice(openBrace + 1, end);
}

describe('A+ Learn hub-page layout consistency (CHO-2340)', () => {
  describe('every hub section opts into the shared geometry class', () => {
    for (const page of HUB_PAGES) {
      it(`${page.name}: <section> carries .${SHARED_CLASS}`, () => {
        const open = sectionOpenTag(readFileSync(page.html, 'utf8'));
        expect(open).toContain(SHARED_CLASS);
        // Sanity: still the right page (its own container class is present too).
        expect(open).toContain(page.container);
      });
    }
  });

  describe('no hub page re-declares its own container geometry (anti-drift)', () => {
    for (const page of HUB_PAGES) {
      it(`${page.name}: .${page.container} sets neither padding nor max-width`, () => {
        const own = directDeclarations(readFileSync(page.scss, 'utf8'), page.container);
        expect(own).not.toMatch(/(^|\s)padding\s*:/);
        expect(own).not.toMatch(/(^|\s)max-width\s*:/);
      });
    }
  });

  describe('the shared geometry class is defined once + wired globally', () => {
    it('defines .aplus-hub-page with the canonical hub geometry', () => {
      const own = directDeclarations(readFileSync(SHARED_PARTIAL, 'utf8'), SHARED_CLASS);
      expect(own).toMatch(/padding\s*:\s*2rem clamp\(1rem, 3vw, 2rem\)/);
      expect(own).toMatch(/max-width\s*:\s*1280px/);
      expect(own).toMatch(/margin-inline\s*:\s*auto/);
    });

    it('is imported by the global stylesheet', () => {
      expect(readFileSync(GLOBAL_STYLES, 'utf8')).toMatch(/@use\s+'styles\/aplus-hub'/);
    });
  });
});
