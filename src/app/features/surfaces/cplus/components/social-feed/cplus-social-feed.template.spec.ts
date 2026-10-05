import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * C+ social feed template guard: no anchor to an unmounted route.
 *
 * WHY THIS EXISTS
 * The feed rendered `href="/c/leaderboards"` on the first post whenever it
 * carried a `leaderboard_bump`. `cplus.routes.ts` mounts five children (feed,
 * duels, interests, connections, bookmarks) and leaderboards is not one of
 * them, so the target does not exist. Worse, it was a plain `href` rather than
 * a `routerLink`, so the browser leaves the SPA entirely: a full page reload
 * that lands on not-found and throws away the learner's session state on the
 * way. A dead `routerLink` at least fails inside the app.
 *
 * Found by UX-subagent1 while retiring the home pin to the same path
 * (d66d94d8e) and left because the C+ feed was not its fence.
 *
 * WHAT THIS ASSERTS
 * The template carries no anchor to `/c/leaderboards`, in either the `href` or
 * the `routerLink` form. It asserts against the TEMPLATE TEXT because this
 * component is an orphan: the directory holds the `.html` and nothing else, no
 * component class and no existing spec, so there is nothing to instantiate and
 * render. That is also why the file is easy to forget.
 *
 * WHAT THIS DOES NOT ASSERT
 * That leaderboards can never be linked. Mounting the route is a Circle build
 * row that waits on ADR-258; when it lands, this guard should be replaced by
 * one asserting the link resolves, not deleted silently.
 */

const TEMPLATE = [
  'src',
  'app',
  'features',
  'surfaces',
  'cplus',
  'components',
  'social-feed',
  'cplus-social-feed.component.html',
];

/** Locate the chora-web root. Fails loud rather than passing over nothing. */
function findWebRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, ...TEMPLATE));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `cplus-social-feed.template.spec: could not locate ${TEMPLATE.join('/')} walking up from ${process.cwd()}`,
  );
}

const html = readFileSync(join(findWebRoot(), ...TEMPLATE), 'utf8');

describe('C+ social feed template', () => {
  it('reads the real template (guards against a vacuous pass)', () => {
    // A guard that greps an empty string passes trivially. Anchor on markup
    // that must survive the fix: the bump badge itself stays, only its CTA goes.
    expect(html.length).toBeGreaterThan(2000);
    expect(html).toContain('leaderboard_bump');
  });

  it('carries no anchor to the unmounted /c/leaderboards route', () => {
    const hits = html
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /\/c\/leaderboards/.test(line));
    expect(
      hits.map(([n, line]) => `  ${n}: ${line.trim()}`),
      `The template links to /c/leaderboards, which cplus.routes.ts does not ` +
        `mount. A plain href leaves the SPA and full-page-reloads into ` +
        `not-found:\n` + hits.map(([n, line]) => `  ${n}: ${line.trim()}`).join('\n'),
    ).toEqual([]);
  });

  it('still shows the rank bump itself, which stands without the CTA', () => {
    // The fix removes a dead link, not the news. The badge above the footer
    // already tells the learner their rank and what it was.
    expect(html).toContain('Rank #');
    expect(html).toContain('previous_rank');
  });
});
