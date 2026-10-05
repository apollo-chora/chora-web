# A+ (CHO-1602) — A+ a11y GUARD (chrome-devtools recipe)

> **This is the persistent browser guard for the A+ surface (chora.site/a/\*).**
> Owner directive: run the colour-contrast + a11y invariants via
> **chrome-devtools against the live deployed bundle**, NOT Playwright
> (`feedback_honest_e2e_chrome_devtools` — the deployed-reality write-walk is the
> sole proof; a jsdom/unit `axe()` CANNOT compute colour-contrast, so the
> contrast invariant *requires* a real browser).
>
> The colour-contrast defects this gate exists to catch were **invisible to every
> unit and e2e suite**: mid-grey `--text-muted` (#64748b) text that clears AA on
> pure white (4.76:1) but fails on the #f5f5f5 card (4.37:1), and brand
> `--primary`/semantic tokens used as small text. Only a real-browser axe run over
> the live A+ paths — on the actual composited glassmorphism surfaces — sees them.
> Re-run this whenever an A+ route or a design token changes.

## Division of labour — what the jsdom ratchets do NOT cover

Three jsdom specs run in CI and are the cheap first line; they are NOT the
arbiter:

- `src/styles/token-contract.spec.ts` — every referenced `--chora-color-*` is
  defined (no silent `var()` fallback).
- `src/styles/text-token-contrast.spec.ts` — statically resolves every `color:
  var(…)` through the token layers and holds the painted colour to AA on the
  **worst-case flat surface** (min over #ffffff and #f5f5f5).
- `src/styles/legacy-color-ban.spec.ts` — lexical ratchet banning new
  `var(--text-muted, …)` and raw failing hexes as `color:`.

They catch drift, bans, and a **static worst-case bound**. They deliberately
CANNOT see:

1. **Composited contrast.** Glassmorphism paints text over `rgba()` glass on a
   blurred radial-gradient background, not a flat token surface. The real ratio
   depends on what is behind the blur. Only the browser composites it.
2. **Text-size classification.** WCAG allows large text (>=24px, or >=18.66px
   bold) at 3:1. The static bound flags e.g. `wallet.component.scss ::
   var(--primary, #1976d2)` (the 3rem balance hero) as failing 4.5:1 and parks it
   in `PRE_EXISTING_CONTRAST_DEBT`. **A jsdom debt entry is NOT a confirmed a11y
   failure** — it is a site the static bound cannot clear on its own. THIS recipe
   is where axe classifies the text size and returns the verdict.

So: jsdom ratchets keep the debt list shrinking and stop new drift; **this
browser recipe is the contrast arbiter.**

## What it asserts
- **axe-core WCAG 2.1 AA** (`wcag2a`/`wcag2aa`/`wcag21aa`): **0 critical / 0 serious** on every A+ critical path.
- **keyboard/ARIA**: 0 non-contrast axe violations + every interactive element named + a correct roving-tabindex on any tab/lens strip.
- **tablet-first**: no horizontal body overflow at 768×1024 and 1280×900 (A+ is tablet-first; no mobile-phone layout).
- **role-matrix**: the A+ surface boundary — a learner/author stays on `/a/*`; an `owner` is redirected OFF every `/a/*` route (surface-boundary probe below).

## A+ critical paths (route × identity matrix)
Run the learner set as **`dale+dodlearner`** (learner-only, non-admin) and the
author path as **`auth-a1-smoke`** (author, TOTP):

```
# learner  (dale+dodlearner)
/a/dashboard
/a/wallet          ← HIGHEST-VALUE: the single money surface (ONE-WALLET, CHO-2236/37/38); mana-pool + transactions REDIRECT in
/a/knowledge       ← the KG; /a/map, /a/discovery, /a/growth-edges all REDIRECT here (Explore is a LENS inside it)
/a/learning        ← Study is INSIDE Learning (CHO-2226): courses + the `study` wrapper
/a/study
/a/me/transcript

# author  (auth-a1-smoke, TOTP)
/a/studio
```

## Procedure (chrome-devtools MCP)
1. The **owner** launches a debug Chrome on `:9222` and logs in — an agent CANNOT
   log in (no interactive credential; `?dev_jwt=` is DEAD in prod, and an `owner`
   role is bounced off every `/a/*` route, so the owner logs in as the learner /
   author persona for the run, not as owner).
   `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/claude-cdp-profile --new-window "https://chora.site/a/dashboard"`
2. For each critical path: `navigate_page` to it, then `evaluate_script` with
   `auditPage` (below). For a surface with a tab/lens strip, use
   `auditTabStrip('<id-prefix>')` — but see the **Companion caveat** below before
   sweeping any tab.
3. **PASS = `pass: true`** (0 critical, 0 serious) on every path/tab.
4. Post-deploy, FIRST purge the SW + caches and hard-reload (`ignoreCache`) — the
   browser serves a STALE bundle otherwise
   (`reusable_gotcha_a_deploy_can_report_success...`); confirm the fetched
   `styles-*.css` is the just-deployed hash BEFORE trusting any read.

## The runnable payloads (paste into `evaluate_script`)

`auditPage()` and `overflowProbe()` are surface-agnostic and are reused
UNCHANGED from `rplus-a11y-cdp-guard.md`. `auditTabStrip()` is the generalised
form of R+'s `auditWorkspaceTabs()` (same audit loop; the tab-id prefix is the
only surface-specific part). `surfaceProbe()` is retargeted to `/a/`.

```js
// axe over the current page — replicates e2e/helpers/axe.ts expectNoSeriousViolations.
async function auditPage() {
  if (!(window.axe && window.axe.version)) {
    const r = await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.11.0/axe.min.js');
    (0, eval)(await r.text()); // local fallback: chora-web/node_modules/axe-core/axe.min.js
  }
  const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
  const pick = (imp) => res.violations.filter(v => v.impact === imp)
    .map(v => ({ id: v.id, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => (n.target || []).join(' ')) }));
  return { url: location.href, pass: pick('critical').length === 0 && pick('serious').length === 0, critical: pick('critical'), serious: pick('serious') };
}

// generalised tab/lens sweep: click every tab whose id starts with `prefix` and audit each.
// e.g. the Knowledge lens switcher, or a Learning courses/study segment. Derive the prefix
// from DevTools (Elements) the same way R+ used [id^="offering-tab-"].
// ⚠ COMPANION CAVEAT (ADR-235): do NOT point this at the Companion's per-goal
// reflection tab. Reading that tab CLAIMS a reflection row + schedules an LLM
// call as a side effect — sweeping it fabricates state and spends tokens. Audit
// the Companion's default view with auditPage() only; never auto-click its tabs.
async function auditTabStrip(prefix) {
  if (!(window.axe && window.axe.version)) { const r = await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.11.0/axe.min.js'); (0, eval)(await r.text()); }
  const tabs = [...document.querySelectorAll('[id^="' + prefix + '"]')].map(t => t.id.replace(prefix, ''));
  const out = [];
  for (const t of tabs) {
    document.querySelector('#' + prefix + t)?.click();
    await new Promise(r => setTimeout(r, 1200));
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    const ser = res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    out.push({ tab: t, pass: ser.length === 0, violations: ser.map(v => ({ id: v.id, nodes: v.nodes.length })) });
  }
  return { url: location.href, allPass: out.every(o => o.pass), tabs: out };
}

// tablet-first: no horizontal body overflow (resize the CDP window to 768x1024 / 1280x900 FIRST, then run).
function overflowProbe() {
  const de = document.documentElement, vw = window.innerWidth;
  const offenders = [];
  if (de.scrollWidth > de.clientWidth + 1) {
    document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 40) offenders.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 50), right: Math.round(r.right) }); });
  }
  return { viewport: vw, overflow: de.scrollWidth > de.clientWidth + 1, overflowPx: de.scrollWidth - de.clientWidth, offenders: offenders.sort((a, b) => b.right - a.right).slice(0, 6) };
}

// role-matrix surface-boundary probe (run per persona):
// navigate to /a/dashboard as each persona; learner/author stay on /a/*, an owner must redirect off.
function surfaceProbe() {
  return { url: location.href, onAplus: location.pathname.startsWith('/a/'), redirectedTo: location.pathname.startsWith('/a/') ? null : location.pathname, navItems: [...document.querySelectorAll('nav[aria-label="Main Navigation"] a')].map(a => a.getAttribute('href')) };
}
```

## A+-specific traps (carry forward)
- **`/a/wallet` is the highest-value path** — the single money surface (ONE-WALLET
  ruling). Audit it first and on every deploy; contrast regressions on money UI
  are the costliest. Its 7 `--text-muted` sub-labels were migrated to
  `--chora-color-text-muted` (#616161) under CHO-1602; the 3rem balance hero
  (`var(--primary, #1976d2)`) is legitimate large text (>=3:1) and is parked in
  the jsdom debt list on purpose — **axe here is what confirms it passes.**
- **Companion reflection tab side effect (ADR-235)** — never auto-sweep it (see
  the `auditTabStrip` caveat); `auditPage()` on its default view only.
- **`?dev_jwt=` is DEAD in prod** and an `owner` is bounced off every `/a/*`
  route — the owner must drive as the learner/author persona, not as owner.
- **Glassmorphism is why the browser is the arbiter** — text sits on `rgba()`
  glass over a blurred gradient; the flat-surface jsdom bound is a conservative
  proxy, not the truth.

## Last verified (keep current)
- **RUN IN-BROWSER 2026-07-17** on the live bundle `main-MNYD6AUG.js` /
  `styles-6E36LULT.css` (the CHO-1602 AA tokens are the deployed CSS). axe-core
  4.11.0, tags `wcag2a`/`wcag2aa`/`wcag21aa`.

  | path | axe critical | axe serious | overflow @768 |
  |---|---|---|---|
  | `/a/knowledge` | 0 | 0 | none |
  | `/a/learning` | 0 | 0 | none |
  | `/a/study` | 0 | 0 | none |
  | `/a/me/transcript` | 0 | 0 | none |
  | `/a/studio` | 0 | 0 | none |

  `/a/dashboard` + `/a/wallet` were cleared earlier under CHO-1602 (the gate's
  first live catch, `scrollable-region-focusable`, was fixed in `d9377ac95`).

  **Both zeros were control-proven — a 0 is otherwise indistinguishable from a
  broken harness** ([[reusable_measurement_discipline_five_wrong_diagnoses_2026_07_16]]):
  - *axe positive control*: injecting an `<img>` with no alt + `#f2f2f2`-on-white
    text was caught as `image-alt` (critical) + `color-contrast` (serious); after
    removal the page returned to 0/0 with no contamination.
  - *overflow negative control*: a forced 3000px child was detected (2232px
    overflow), so `overflowProbe` is live.
  - *render control*: the 5 routes produced 5 DISTINCT `main` fingerprints, so
    the sweep measured 5 pages — not one page five times.

- ⚠ **Identity deviation — this run was driven as `dale@pageii.com`**, who holds
  learner+author+instructor+admin+auditor, NOT the pure-learner `dale+dodlearner`
  the matrix above specifies. Extra roles render extra chrome (the H+/O+/R+
  surface switcher), so a **pure-learner re-run is still owed** and could differ.
  The author path `/a/studio` rendered real content ("Create — Everything you
  author lives here…"), so it was not an empty-page false pass.

- 🔴 **The gate is green on a broken page — a11y PASS is not a health check.**
  `/a/learning` scores 0/0 while rendering *"Could not load atoms. Please try
  again."* with **no `h1` at all** (only `h2: Topics`): a missing h1 is
  `page-has-heading-one`, best-practice, NOT wcag2aa, so this sweep cannot see
  it. Root cause is an edge gap, not a11y — `GET /api/v1/atoms` + `/api/v1/topics`
  are unregistered in chora-gateway (404), which also makes the **Daily Dose
  silently drop atoms** → **CHO-2261**. `/a/learning` itself is an explicit
  legacy delegate (`aplus.routes.ts` "Legacy delegates — kept for in-progress
  migration") with no nav entry, so its breakage is a known remnant, not a new
  defect. Consider adding `best-practice` to the axe tags if heading structure
  should be in scope.
