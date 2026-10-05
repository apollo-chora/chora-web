/**
 * Phyllis A+ journey — seeded test-data references.
 *
 * IDs come from the smoke baseline captured 2026-05-24 against production
 * chora.site (see `.smoke-artifacts/cj1-baseline-pre-2026-05-24/SUMMARY.md`).
 *
 * Authoring steps (Steps 2-4) are NOT in scope for this journey spec; those
 * tests are owned separately. The IDs here cover Steps 5-8 only.
 *
 * SEED REQUIREMENT:
 *   - The test environment at PLAYWRIGHT_BASE_URL must have these IDs live.
 *     On staging/dev environments that differ from production, override via
 *     the E2E_COURSE_ID / E2E_ATOM_ID env vars documented below.
 *   - If the seeded course has Stripe pricing, Step 6's enrol flow will
 *     redirect to a Stripe Checkout URL — the test asserts on the redirect
 *     URL pattern rather than completing checkout. For free courses, the test
 *     asserts on the direct enrolled-landing redirect.
 *
 * Baseline source:
 *   .smoke-artifacts/cj1-baseline-pre-2026-05-24/SUMMARY.md §1
 *   Step 5 → catalog with 10+ real courses (tenant "Mighty Mind Tuition Agency")
 *   Step 6 → course "Professional Scrum Product Owner II" ID `05000000-0000-7000-8000-0000000c5302`
 *   Step 7 → atomic session seed atom ID `00000000-0000-7000-8000-00000000a0a1`
 *   Step 8 → daily dose endpoint `GET /api/familiar/daily-dose` → 5-card stack
 */

/** UUIDv7 of the seeded course used in Step 6 (Course Detail → Enrol). */
export const SEEDED_COURSE_ID: string =
  process.env['E2E_COURSE_ID'] ?? '05000000-0000-7000-8000-0000000c5302';

/**
 * UUIDv7 of the seeded atom used in Step 7 (Atomic Session).
 *
 * This is the seed/fallback atom that the AtomicSession component loads when
 * no course-path atom is specified. In the DEGRADED state (Step 7 upstream
 * unavailable) the component renders this atom's title + body from the
 * local fallback; MCQ options are NOT rendered in degraded state.
 */
export const SEEDED_ATOM_ID: string =
  process.env['E2E_ATOM_ID'] ?? '00000000-0000-7000-8000-00000000a0a1';

/**
 * Number of courses the catalog must show to pass Step 5 assertion.
 * Baseline: 10 courses visible on production. Use 1 on staging (conservative).
 */
export const CATALOG_MIN_COURSE_COUNT: number =
  parseInt(process.env['E2E_CATALOG_MIN_COURSES'] ?? '1', 10);

/**
 * Number of daily-dose cards the carousel must show to pass Step 8 assertion.
 * Baseline: 5 cards on production (cold-start mix). Use 1 on staging.
 */
export const DAILY_DOSE_MIN_CARD_COUNT: number =
  parseInt(process.env['E2E_DOSE_MIN_CARDS'] ?? '1', 10);
