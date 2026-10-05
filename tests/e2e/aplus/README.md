# A+ Phyllis E2E Journey — `tests/e2e/aplus/`

Canonical Playwright headless test suite for the A+ surface learner journey
(Phyllis 8-step, Steps 1/5/6/7/8). Steps 2-4 (atom authoring) are excluded
from this workstream.

## Files

| File | Purpose |
|---|---|
| `phyllis-journey.spec.ts` | Single journey spec — Steps 1→5→6→7→8 tagged `@phyllis-aplus` |
| `fixtures/auth.ts` | `mintSession(page)` — exchanges `E2E_TEST_TOKEN` for BFF session cookie |
| `fixtures/test-data.ts` | Seeded production IDs (course, atom) from 2026-05-24 baseline |
| `screenshots/` | Step screenshots written per test run (not committed; CI attaches as artifact) |

## Prerequisites

1. **`E2E_TEST_TOKEN`** — a valid Firebase ID token for the allowlisted test account.
   The account email must be on the `idp-google-email-allowlist` Secret Manager secret
   in `chora-489812`. Coordinate with the infra team if a new email needs to be added.

2. **`PLAYWRIGHT_BASE_URL`** — the base URL of the deployed A+ surface.
   Defaults to `https://chora.site` if not set.

3. Seeded data — the course and atom IDs in `fixtures/test-data.ts` must exist at the
   target environment. Override via env vars if running against staging:
   - `E2E_COURSE_ID` — course to enrol in (Step 6)
   - `E2E_ATOM_ID` — atom to play (Step 7)
   - `E2E_CATALOG_MIN_COURSES` — minimum course count for Step 5 (default: 1)
   - `E2E_DOSE_MIN_CARDS` — minimum dose cards for Step 8 (default: 1)

## Local run (manual, explicit — NOT on commit)

Per `feedback_no_local_cicd_run`: do NOT run Playwright locally as part of CI.
Manual one-shot validation under explicit approval only:

```bash
cd chora-web

PLAYWRIGHT_BASE_URL=https://chora.site \
E2E_TEST_TOKEN=<your-firebase-id-token> \
  npx playwright test \
    --grep "@phyllis-aplus" \
    --config=playwright.config.ts \
    --project=phyllis-aplus-tablet
```

To also run the desktop viewport variant:

```bash
PLAYWRIGHT_BASE_URL=https://chora.site \
E2E_TEST_TOKEN=<your-firebase-id-token> \
  npx playwright test \
    --grep "@phyllis-aplus" \
    --config=playwright.config.ts \
    --project=phyllis-aplus-tablet \
    --project=phyllis-aplus-desktop
```

To update visual baseline screenshots (requires reviewer approval before commit):

```bash
npx playwright test --update-snapshots --grep "@phyllis-aplus"
```

## CI integration (Cloud Build)

Per `feedback_cicd_no_mass_trip`: triggers must be enabled manually per user direction.
Do NOT auto-enable the trigger on commit.

**Trigger config** (to be applied by the infra team when directed):

```yaml
# cloudbuild-e2e-aplus.yaml
steps:
  - name: 'mcr.microsoft.com/playwright:v1.58.2-jammy'
    entrypoint: 'npx'
    args:
      - playwright
      - test
      - --grep
      - '@phyllis-aplus'
      - --config=playwright.config.ts
      - --project=phyllis-aplus-tablet
      - --project=phyllis-aplus-desktop
    env:
      - 'PLAYWRIGHT_BASE_URL=https://chora.site'
    secretEnv:
      - 'E2E_TEST_TOKEN'
    dir: 'chora-web'
availableSecrets:
  secretManager:
    - versionName: projects/chora-489812/secrets/e2e-test-firebase-token/versions/latest
      env: 'E2E_TEST_TOKEN'
artifacts:
  objects:
    location: 'gs://chora-cicd-artifacts/e2e-aplus/'
    paths:
      - 'chora-web/playwright-report/**'
      - 'chora-web/tests/e2e/aplus/screenshots/**'
```

## Step 7 — DEGRADED state (A16 blocker)

The atomic session page is currently in DEGRADED mode (`upstream_unavailable`)
per the 2026-05-24 production baseline. The test:

- **PASSES** when atom title + body render (degraded fallback content).
- **FAILS loud** if MCQ option buttons render — this signals A16 has unblocked
  full MCQ rendering. The test error message reads:
  `"Step 7: A16 unblocked — MCQ option buttons are rendering. Re-tag this assertion."`

When A16 is confirmed deployed, update `phyllis-journey.spec.ts` Step 7:
1. Change `expect(mcqCount).toBe(0)` → `expect(mcqCount).toBeGreaterThanOrEqual(1)`.
2. Update the test name to remove `(DEGRADED state)`.

## Assertion count

The journey spec contains **21 explicit assertions** across Steps 1, 5, 6, 7, 8:

| Step | Assertions |
|---|---|
| Step 1 login | login page visible; Google btn visible; post-session URL not /login |
| Step 5 catalog | container visible; course card count >= CATALOG_MIN_COURSE_COUNT |
| Step 6 detail | container visible; enrol btn visible |
| Step 6 enrol | post-enrol URL is Stripe / /enrolled / /learn; if /enrolled: success banner + start btn |
| Step 7 player | session container visible; atom card visible; MCQ count == 0 (degraded) |
| Step 8 dose | container visible; stack visible; current card visible; title non-empty; counter >= min |

Desktop viewport variant adds 2 additional assertions (Step 5 catalog only).

## Test data seeding status

**Seeded IDs from production baseline (2026-05-24):**
- Course: `05000000-0000-7000-8000-0000000c5302` ("Professional Scrum Product Owner II", SGD 240)
- Atom: `00000000-0000-7000-8000-00000000a0a1` (seed atom used by degraded atomic session)

These IDs are live on `chora.site`. For staging/dev environments, override via env vars.
