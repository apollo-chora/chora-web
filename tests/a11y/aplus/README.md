# A+ Surface — WCAG 2.1 AA Accessibility Audit Suite

Workstream: **WS-11**
Standard: **WCAG 2.1 AA** (per `chora-design-system` skill + `chora-web/CLAUDE.md §10`)
Runner: **@axe-core/playwright ^4.11.1** (already in `devDependencies`)

---

## Directory layout

```
tests/a11y/aplus/
├── aplus-routes.a11y.spec.ts   Main per-route audit spec (all A+ routes)
├── fixtures/
│   └── axe-config.ts           Shared axe RunOptions, viewport constants,
│                               seeded IDs, violation formatter
└── README.md                   This file
```

---

## How to run (CI only)

Per `feedback_no_local_cicd_run`: **do not run Playwright locally**.
All verification happens via Cloud Build.

Cloud Build step example:

```yaml
- name: 'node:22'
  entrypoint: npx
  args:
    - playwright
    - test
    - --grep
    - '@a11y'
    - --project=A11y Tablet
    - --reporter=html,junit
  env:
    - 'PLAYWRIGHT_BASE_URL=https://dev.chora.site'
  dir: 'chora-web'
```

There are no `@planned` routes left, so there is nothing to filter out: every
test in this suite audits a route that exists.

---

## Viewports audited

Per tablet-first mandate (`CLAUDE.md §1`):

| Viewport | Width | Height | Purpose |
|---|---|---|---|
| Tablet landscape | 1024 | 768 | Primary audit surface |
| Desktop enhanced | 1440 | 900 | Secondary audit surface |

Each route is audited at both viewports in sequence.

---

## WCAG 2.1 AA tags used

- `wcag2a` — WCAG 2.0 Level A
- `wcag2aa` — WCAG 2.0 Level AA
- `wcag21aa` — WCAG 2.1 additions (1.4.10 Reflow, 1.4.11 Non-Text Contrast, 1.4.13 Content on Hover or Focus)

---

## Glassmorphism false-positive exclusion

Chora uses a glassmorphism design system with `backdrop-filter: blur()` on semi-transparent surfaces.  axe-core evaluates the CSS `background-color` value (e.g. `rgba(255,255,255,0.08)`) in isolation and flags it as insufficient contrast.  At runtime the frosted glass layer sits above a coloured gradient, yielding the required 4.5:1 ratio.

Excluded selectors (container only — child text nodes are still audited):

- `.glass-backdrop`
- `.glass-panel > .glass-surface`

See `fixtures/axe-config.ts` for the rationale comment.

---

## Auth strategy

Most A+ routes require an authenticated session.  The `auth-setup` Playwright project (see `chora-web/playwright.config.ts`) seeds storage state using the cookie pattern used by WS-9:

- `e2e/fixtures/.auth/learner.json` — used for all learner-facing routes
- Unauthenticated routes (login) use `storageState: { cookies: [], origins: [] }`

---

## Route coverage

### Active (15 routes)

| Route | Group | Auth |
|---|---|---|
| `/a/login` | Unauthenticated | No |
| `/a/catalog` | Catalog | Yes |
| `/a/courses/:id` | Course | Yes |
| `/a/courses/:id/learn` | Course | Yes |
| `/a/atoms/:id/play` | Atom player | Yes |
| `/a/me/assessments` | Assessments | Yes |
| `/a/me/assessments/:id` | Assessments | Yes |
| `/a/daily-dose` | Engagement | Yes |
| `/a/dashboard` | Engagement | Yes |
| `/me/knowledge-graph` | Knowledge graph | Yes |
| `/me/knowledge-graph/manage` | Knowledge graph | Yes |
| `/a/companion` | Familiar | Yes |
| `/a/companion/marketplace` | Familiar | Yes |
| `/a/companion/:id/chat` | Familiar | Yes |
| `/a/companion/:id/growth-log` | Familiar | Yes |

### Formerly planned, now live (3 routes)

| Route | Was | Now |
|---|---|---|
| `/a/study/collections` | WS-6a/6b, skipped | audited. `/a/collections` is a `pathMatch:'full'` redirect to the study mount, so the suite visits the mount rather than asserting through the hop |
| `/a/atoms/:id/revisions` | WS-7, skipped | audited, loads `AtomRevisionsComponent` |
| `/a/search` | WS-8, skipped | audited, loads `SearchComponent` |

Each skip said "enable once route is live". All three routes are live, checked
against `aplus.routes.ts`. They stayed skipped only because this whole suite
was uncollected until the `A11y Tablet` project was added, so nothing ever
reported that the condition had been met.

---

## How to interpret violations

A failing test emits:

```
WCAG 2.1 AA violations on "A+ Dashboard @ 1024x768":
  [critical] rule "color-contrast" on ".atom-card__title" — see https://dequeuniversity.com/...
  [serious] rule "button-name" on ".icon-btn" — see https://dequeuniversity.com/...
```

Each line contains:
- **impact** — `critical`, `serious`, `moderate`, or `minor`
- **rule id** — axe-core rule identifier
- **selector** — first failing DOM node target
- **help URL** — Deque University remediation guide

A screenshot `a11y-violation-<route>.png` is attached to the Playwright HTML report under the failed test.

---

## Remediation workflow

1. Identify the violation from the CI log (rule ID + selector).
2. Open the Deque help URL for remediation guidance.
3. File an a11y bug in Jira (CHO project, label `a11y`, theme matching the surface).
4. Fix in `chora-web/src/**` (the a11y audit is read-only — WS-11 does not touch source).
5. Re-run the audit in Cloud Build to confirm zero violations.

Common WCAG 2.1 AA requirements checked per `chora-web/CLAUDE.md §10`:

| Requirement | Rule IDs |
|---|---|
| Color contrast 4.5:1 (normal text) | `color-contrast` |
| Color contrast 3:1 (large text) | `color-contrast` |
| All interactive elements have accessible name | `button-name`, `link-name`, `input-button-name` |
| Form inputs have labels | `label`, `label-title-only` |
| Images have alt text | `image-alt` |
| Heading hierarchy (no skipped levels) | `heading-order` |
| Landmark regions present | `region`, `landmark-one-main` |
| Skip-to-content link present | `skip-link` |
| Focus order is logical | `tabindex` |
| ARIA attributes are valid | `aria-valid-attr`, `aria-valid-attr-value` |
