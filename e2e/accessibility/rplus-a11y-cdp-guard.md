# W0-F4 (CHO-2200) — R+ §10.7 a11y GUARD (chrome-devtools recipe)

> **This is the persistent guard for W0-F4.** Owner directive: run the §10.7
> invariants via **chrome-devtools against the live deployed bundle**, NOT
> Playwright (`feedback_honest_e2e_chrome_devtools` — the deployed-reality
> write-walk is the sole proof; a jsdom/unit `axe()` CANNOT compute
> color-contrast, so the contrast invariant *requires* a real browser).
>
> The colour-contrast defect this gate exists to catch (`--primary` 4.4:1
> active tab · `--danger` 3.76:1 buttons) was **invisible to every unit and
> e2e suite** — only a real-browser axe run over the live paths sees it.
> Re-run this whenever an R+ route or a design token changes.

## What it asserts (§10.7)
- **axe-core WCAG 2.1 AA** (`wcag2a`/`wcag2aa`/`wcag21aa`): **0 critical / 0 serious** on every R+ critical path.
- **keyboard/ARIA**: 0 non-contrast axe violations + a correct roving-tabindex tablist + every interactive element named.
- **tablet-first**: no horizontal body overflow at 768×1024 and 1280×900.
- **role-matrix**: the surface-boundary + nav-capability gating (the config half is also locked deterministically in `rplus.nav.spec.ts`; the per-persona surface-boundary half is the live probe below).

## R+ critical paths (run each as an **instructor** session)
```
/r/roster
/r/rostering
/r/offerings
/r/offerings/:id            ← the workspace; sweep ALL delivery-type tabs (graduate=8, short=7, async=4)
/r/catalog
/r/certifications
/r/assessments
/r/exams
```
GRADUATE walk offering (live 2026-07-15): `/r/offerings/019f5f04-92e6-79d3-a048-f98d8d47cd51` (graduate, 8 tabs).

## Procedure (chrome-devtools MCP)
1. Ensure a debug Chrome is reachable on `:9222` and logged in as an **instructor** (only `instructor`/`trainer`/`supervisor` reach R+ per the backend `roleSurfaceMap`; an agent cannot log in — the owner must).
   `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/claude-cdp-profile --new-window "https://chora.site/r/roster"`
2. For each critical path: `navigate_page` to it, then `evaluate_script` with `auditPage` (below). For the workspace, use `auditWorkspaceTabs` (clicks through every tab).
3. **PASS = `allPass: true`** (0 critical, 0 serious) on every path/tab.
4. Post-deploy, FIRST purge the SW + caches and hard-reload (`ignoreCache`) — the browser serves a STALE bundle otherwise (`reusable_gotcha_a_deploy_can_report_success...`); confirm the fetched `styles-*.css` is the just-deployed hash before trusting the read.

## The runnable payloads (paste into `evaluate_script`)

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

// workspace: click every tab and audit each (delivery-type-derived tab set).
async function auditWorkspaceTabs() {
  if (!(window.axe && window.axe.version)) { const r = await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.11.0/axe.min.js'); (0, eval)(await r.text()); }
  const tabs = [...document.querySelectorAll('[id^="offering-tab-"]')].map(t => t.id.replace('offering-tab-', ''));
  const out = [];
  for (const t of tabs) {
    document.querySelector('#offering-tab-' + t)?.click();
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

// role-matrix surface-boundary probe (run per persona — the deferred "#3"):
// navigate to /r/roster as each persona; instructor stays, others must redirect off R+.
function surfaceProbe() {
  return { url: location.href, onRplus: location.pathname.startsWith('/r/'), redirectedTo: location.pathname.startsWith('/r/') ? null : location.pathname, navItems: [...document.querySelectorAll('nav[aria-label="Main Navigation"] a')].map(a => a.getAttribute('href')) };
}
```

## Last verified (keep current)
- **2026-07-15**, deployed bundle `styles-2WWMLNEM.css`, instructor session: `/r/roster` · `/r/offerings` · `/r/certifications` · `/r/catalog` axe-clean; graduate workspace `auditWorkspaceTabs` → all 8 tabs `pass:true`; tablet 768/1280 no overflow; keyboard/ARIA clean (42/42 named). Fix `8df58cf8a`.
- role-matrix code-derived (masterplan §0.5 F4); full per-persona live `surfaceProbe` = the deferred owner "#3".
