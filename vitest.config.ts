/// <reference types="vitest" />
/**
 * Vite-based Vitest config for chora-web — ADR-176 (coverage instrumentation).
 *
 * WHY THIS EXISTS (not `vitest-base.config.ts`): the `@angular/build:unit-test`
 * builder is esbuild-based and does NOT instrument application source, so v8/
 * istanbul coverage is stuck at 0% (angular/angular-cli #30557, #31895; the
 * internal `instrumentForCoverage` lever is unexposed, #30742 OPEN). This config
 * runs the test pipeline through **Vite** via `@analogjs/vite-plugin-angular`,
 * where Vitest's coverage hooks actually live — so coverage genuinely measures.
 *
 * Invoke directly with `vitest run` (NOT `ng test`). The `@angular/build:unit-test`
 * builder ignores this filename (it only auto-discovers `vitest-base.config.*`),
 * so both runners coexist during the staged ADR-176 cutover.
 *
 * Semantics preserved from `vitest-base.config.ts`:
 *   - pool 'forks' + isolate true  → deliberate: fixes `vi.mock` firebase races
 *     (the builder default `isolate:false` shares the module graph across specs).
 *   - coverage include/exclude/reportsDirectory — identical to the builder config.
 * chora-web is ZONE-BASED (no `provideZonelessChangeDetection()` in app.config.ts;
 * zone.js dep; 13 fakeAsync + 10 whenStable specs) → `test-setup.ts` inits the
 * TestBed in zone mode (`setupTestBed({ zoneless: false })`).
 *
 * ---------------------------------------------------------------------------
 * C-GATE (owner ruling R38, 2026-09-02): TWO PROJECTS, ONE GATE.
 *
 * `vitest run` runs both, so the push gate is still one command and NOTHING is
 * skipped, excluded from the gate, or deleted. The only difference is that the
 * quarantined files run one at a time, in a single fork, after the rest.
 *
 * The problem it solves: three consecutive full-suite runs on an UNCHANGED tree
 * failed five different tests, a different set each run, every one passing in
 * isolation and none in a file the run had touched. A gate that reds on most
 * runs gets ignored, which wastes the rule rather than enforcing it.
 * ---------------------------------------------------------------------------
 */
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

/**
 * The quarantine list. Adding a member is a RECORDED DECISION: a spec only
 * belongs here with evidence that it fails under parallel load and passes in
 * isolation, and the line says what was observed. Removing one is equally a
 * decision, and the better outcome.
 *
 * Every member below comes from the same measurement: three consecutive
 * `npx vitest run` invocations on a clean tree at `c16f77263`, which failed a
 * DIFFERENT subset each time. Five of the six are axe (`@axe-core` runs a real
 * accessibility scan over a rendered DOM and is timing-sensitive under a loaded
 * box); the sixth polls.
 *
 * ⚠ Three of the six names in the log line were ambiguous, and each was
 * resolved by EVIDENCE rather than by picking the likely file. `surveys` has
 * three spec files and only `surveys.component.spec.ts` imports axe.
 * `live-session-dashboard` exists twice and only the `admin/training/` copy
 * imports axe. `members` matches five specs and only `members.component.spec.ts`
 * imports axe.
 *
 * ⚠ This is a LATENCY fix, not a correctness one. A quarantined spec still has
 * to pass; if one starts failing serially too, that is a real defect and the
 * gate reds exactly as it should.
 */
const QUARANTINED_SPECS = [
  // axe, flaked twice across three clean-tree runs
  'src/app/features/surfaces/aplus/dashboard/continue-learning-card/continue-learning-card.component.spec.ts',
  // polling, not axe: the only member whose flake is timer-driven
  'src/app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.spec.ts',
  // axe
  'src/app/shared/components/chora-collection-view/chora-collection-view.component.spec.ts',
  // axe (surveys.component, NOT surveys.model or surveys.service)
  'src/app/features/surfaces/rplus/surveys/surveys.component.spec.ts',
  // axe (the admin/training copy, NOT the admin/components one)
  'src/app/features/admin/training/components/live-session-dashboard/live-session-dashboard.component.spec.ts',
  // axe (members.component, NOT the four other files matching "members")
  'src/app/features/surfaces/hplus/members/members.component.spec.ts',
];

/**
 * OBSERVED CANDIDATE, deliberately NOT quarantined (orchestrator ruling,
 * 2026-09-03). A peer session reported `rplus/classroom` in the rotating set.
 * That is a lead, not a measurement this session made, and the discriminator
 * for membership is rotation under load PLUS green in isolation, never a
 * single run. Adding it on a report would put a file in the slow lane without
 * anyone having shown it belongs there, and quarantine is not free: it costs
 * wall clock on every push.
 *
 * To promote it: run the full suite three times on a clean tree, confirm it
 * fails in some runs and not others, confirm it passes on its own, then move
 * the path into QUARANTINED_SPECS with what was observed written beside it.
 */
const OBSERVED_CANDIDATES = [
  'src/app/features/surfaces/rplus/classroom',
];

// A candidate must never quietly become a member. If a path appears in both
// lists the config is claiming a lane it is not in, so fail at load rather
// than run a suite whose own description of itself is wrong.
const bothLanes = QUARANTINED_SPECS.filter((spec) =>
  OBSERVED_CANDIDATES.some((candidate) => spec.startsWith(candidate)),
);
if (bothLanes.length > 0) {
  throw new Error(
    `vitest.config: quarantined AND listed as an unproven candidate: ${bothLanes.join(', ')}`,
  );
}

/**
 * Both projects compile Angular the same way. Vitest projects do not inherit
 * the root `plugins` or `resolve`, so each one is built from this factory
 * rather than copied, which is what keeps them from drifting apart.
 */
const angularProjectBase = () => ({
  plugins: [
    angular({
      // Use the spec tsconfig (vitest/globals + node types) for test compilation.
      tsconfig: 'tsconfig.spec.json',
      // Inline `styles: [...]` blocks in @Component are SCSS in chora-web
      // (angular.json inlineStyleLanguage: scss).
      inlineStylesExtension: 'scss',
    }),
  ],
  // Silence Vite CJS/ESM interop noise from Angular's partial-compiled deps.
  resolve: {
    conditions: ['style', 'sass'],
  },
});

/** Test options shared by both projects. */
const sharedTest = {
  globals: true,
  environment: 'jsdom' as const,
  setupFiles: ['src/test-setup.ts'],
  // forks + isolate is intentional, see the header.
  pool: 'forks' as const,
  isolate: true,
};

export default defineConfig(() => ({
  ...angularProjectBase(),
  test: {
    coverage: {
      provider: 'v8',
      // Emit the report even when specs fail, so CI still gets a
      // coverage-summary.json during the ADR-176 advisory window. This does
      // NOT mean failures are tolerated - as of 2026-08-20 (CHO-2404) the
      // drift specs are repaired and the suite is green. The stale
      // "(12 files)" this comment used to carry had been copied as fact into
      // three other places; do not reintroduce a failure count here, because
      // a count in a comment goes stale the moment the suite moves.
      reportOnFailure: true,
      reporter: ['lcov', 'html', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage/chora-web',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.stories.ts',
        'src/**/*.integration.spec.ts',
        'src/integration-tests/**',
        'src/main.ts',
        'src/environments/**',
        'src/**/*.d.ts',
        'src/testing/**',
        'src/test-setup.ts',
      ],
    },
    projects: [
      {
        ...angularProjectBase(),
        test: {
          ...sharedTest,
          name: 'parallel',
          // Match the builder's spec discovery, minus the quarantine.
          include: ['src/**/*.spec.ts'],
          exclude: [...configDefaults.exclude, ...QUARANTINED_SPECS],
        },
      },
      {
        ...angularProjectBase(),
        test: {
          ...sharedTest,
          name: 'quarantine-serial',
          include: QUARANTINED_SPECS,
          // One file at a time. `fileParallelism: false` is the whole
          // mechanism in Vitest 4: it runs the files sequentially and forces
          // `maxWorkers` to 1, which is restated here so the intent survives a
          // future edit to either line.
          //
          // ⚠ It must be these two and NOT `poolOptions.forks.singleFork`,
          // which Vitest 4 REMOVED, nor `minWorkers`, which Vitest 4 does not
          // have. Both are accepted silently: the first only prints a
          // deprecation notice among hundreds of jsdom warnings and the second
          // says nothing at all, so a config written from Vitest 3 habits looks
          // serial and runs parallel. Verified against the v4 option types.
          fileParallelism: false,
          maxWorkers: 1,
          // A TIMEOUT IS NOT AN ASSERTION, and Vitest's default 5000 ms is not
          // a budget this lane can meet. Five of the six members run a real
          // @axe-core scan over a rendered DOM; one was measured at 5342 ms
          // under load 35 to 56 and the same file passed at load 23 minutes
          // earlier. So the default fails on machine contention rather than on
          // accessibility, which is the starved-artifact class this lane exists
          // to remove, not to reproduce.
          //
          // 20000 ms is a little under 4x the worst scan actually observed
          // (5342 ms), which leaves room for a box worse than any measured
          // today. It is set on the PROJECT, so it covers every spec in the
          // lane rather than the one file that was reported; a per-file budget
          // would have to be remembered by whoever quarantines the next axe
          // spec, and would not be.
          //
          // ⚠ The budget also removes a MISLEADING SECOND FAILURE. Reproduced
          // here at --testTimeout=800: the run reports 2 failures, "Test timed
          // out" and then "Axe is already running. Use `await axe.run()`...".
          // The second is a CONSEQUENCE of the first, because a scan killed
          // mid-run leaves axe's global running flag set for the next
          // assertion in the file. It reads as a second, unrelated defect in a
          // test that is fine, so one timeout costs two investigations.
          //
          // A generous budget costs nothing while tests pass: a timeout is an
          // upper bound, not a wait. It only spends wall clock on the runs that
          // were going to fail anyway.
          testTimeout: 20000,
        },
      },
    ],
  },
}));
