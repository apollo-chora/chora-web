/**
 * Assessment lifecycle, driven through the A+ UI. @assessment-lifecycle
 *
 * The assessment lifecycle is the platform's critical use case, so this spec
 * walks the WHOLE of it against the DEPLOYED platform with a real browser and
 * real services, starting from an empty canvas:
 *
 *   1 AUTHOR    an author hand-writes one MCQ, no AI assist
 *   2 ASSEMBLE  the authored question is assembled into a test set and published
 *   3 PUBLISH   an assessment is instantiated from that test set and opens
 *   4 ATTEMPT   the learner sits it IN THE BROWSER and submits
 *   5 GATE      the grade stays withheld until the instructor releases it
 *   6 RELEASE   the released grade reads back IN THE BROWSER
 *   7 OTLP      the deployed gateway stamps a W3C traceparent
 *
 * NO AI ANYWHERE IN THIS PATH, by construction and by owner instruction:
 *   - Authoring uses the canvas's `manual` mode ("By hand"), which the
 *     component renders with NO AI compose form. The `ai` mode is never
 *     touched, and no generation job is dispatched.
 *   - Every question is MCQ. MCQ grading is `mcq_dispatch: DETERMINISTIC` and
 *     grades in-band, so no LLM evaluator job runs. Open-ended is deliberately
 *     avoided precisely because it would route through an LLM evaluator.
 * The result is a lifecycle whose every step is deterministic and reproducible.
 *
 * BECAUSE THE SPEC AUTHORS THE QUESTION, IT KNOWS THE ANSWER. The keyed
 * option is the one this spec typed in, matched on its own label text. That is
 * what lets the run assert full marks without depending on any external fixture
 * or on a seeded answer key.
 *
 * HOW THIS DIFFERS FROM integration-journey.spec.ts. That spec proves the same
 * lifecycle across three tiers, but drives the assessment legs over the API and
 * starts from an already-published test set. This one starts from nothing, and
 * the learner-facing half runs in a browser. Both run, and both are kept.
 *
 * NOTHING IS MOCKED. There is no route interception and no stubbed session:
 * `seedFirebaseSession` hands the Firebase SDK a genuine credential and the app
 * mints a real Chora session against the deployed gateway (see the fixture for
 * why that is the only honest way in). Failures here are real failures.
 *
 * WHY THE INSTRUCTOR LEGS ARE API CALLS. Instantiating and releasing are
 * instructor acts on the R+ surface, and driving two surfaces as two identities
 * in one spec would test the R+ console rather than the lifecycle. They are
 * issued as real authenticated calls by the same identity, which holds
 * `author`, `instructor` and `learner` alike.
 *
 * WHAT A RUN LEAVES BEHIND (owner ruling 2026-08-24, "artifacts capturing is a
 * must and the whole point"). This spec used to assert all seven beats and
 * produce nothing durable, so the only frames that existed were captured out
 * of band by hand. Every run now emits, into `E2E_EVIDENCE_DIR`:
 *   - one screenshot per browser beat, named for the beat
 *   - beat-3-publish.json and beat-7-otlp.json, because those two beats are an
 *     API response and a response header with no UI to photograph
 *   - http-calls.json, every gateway call the run actually made
 *   - beats-manifest.json, the seven beats and their artefacts
 * plus the JUnit XML from the Playwright junit reporter, whose path the lane
 * sets through PLAYWRIGHT_JUNIT_OUTPUT_NAME.
 *
 * Required env:
 *   E2E_SESSION_JWT          HS256 Chora session JWT; bearer for the API legs
 *   E2E_FIREBASE_ID_TOKEN    Firebase ID token; browser sign-in (see fixture)
 *   E2E_FIREBASE_EMAIL       that account's email; browser sign-in
 *   E2E_FIREBASE_UID         that account's Firebase uid; browser sign-in
 * Optional:
 *   API_BASE_URL             defaults to https://api.chora.site
 *   E2E_EVIDENCE_DIR         where the artefacts land; defaults to
 *                            chora-web/playwright-evidence/assessment-lifecycle
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  captureBeat,
  evidenceDir,
  noteBeat,
  recordApiCall,
  recordBeatJson,
  recordBrowserApiCalls,
  writeRunArtefacts,
} from './fixtures/beat-evidence';
import { seedFirebaseSession } from './fixtures/firebase-session';

const API = (process.env['API_BASE_URL'] ?? 'https://api.chora.site').replace(/\/$/, '');

/** Unique to this run, so the question picker can find exactly these questions. */
const RUN_TAG = `e2e-${Date.now()}`;

/**
 * The question this run hand-authors. Option B is the keyed correct answer.
 *
 * ONE question by owner instruction. The assessment is deliberately a single
 * MCQ: it is the smallest thing that exercises the whole lifecycle, it keeps
 * the authored residue in the live tenant to a minimum, and it grades
 * deterministically.
 *
 * Labels are built per question rather than shared, because two questions
 * carrying identical option labels are issued colliding `option_id`s within one
 * test-set snapshot, which would make a locator keyed on the option id alone
 * ambiguous. The list is kept as a list so the shape survives if the count ever
 * changes, and every count below is derived from it rather than hard-coded.
 */
const AUTHORED = [1].map((n) => ({
  prompt: `${RUN_TAG} Q${n}: select the keyed option.`,
  distractor: `${RUN_TAG} Q${n} option A, deliberately incorrect.`,
  keyed: `${RUN_TAG} Q${n} option B, the keyed correct answer.`,
}));

/** Points the platform assigns per question by default. Asserted, not assumed. */
const POINTS_PER_QUESTION = 10;
const EXPECTED_TOTAL_POINTS = POINTS_PER_QUESTION * AUTHORED.length;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. The chora-web lane supplies it; see the ` +
        `integration-journey step in chora-web/cloudbuild-staging.yaml. ` +
        `Refusing to run rather than skip.`,
    );
  }
  return v;
}

function bearer(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv('E2E_SESSION_JWT')}`,
    'Content-Type': 'application/json',
  };
}

/** Only the fields these assertions read are modelled. */
interface CreatedAssessment {
  assessment_id: string;
  state: string;
  question_count: number;
  total_points: number;
}

interface McqOption {
  option_id: string;
  label: string;
}

interface LearnerQuestion {
  question_type: string;
  test_set_question_id: string;
  question_id: string;
  prompt?: { stem?: string; options?: McqOption[] };
}

interface LearnerAssessmentView {
  state: string;
  questions?: LearnerQuestion[];
}

interface ReleasedAssessment {
  state: string;
}

async function json<T>(
  req: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T; text: string }> {
  const res = await req[method](`${API}${path}`, {
    headers: bearer(),
    ...(body === undefined ? {} : { data: body }),
  });
  recordApiCall(test.info().title, method, `${API}${path}`, res.status());
  const text = await res.text();
  let parsed: T | undefined = undefined;
  try {
    parsed = text ? (JSON.parse(text) as T) : undefined;
  } catch {
    /* non-JSON body is surfaced through `text` in the assertion message */
  }
  // Callers assert on `status` first, so an unparsable body surfaces as a
  // status assertion failure carrying `text`, not as a confusing type error.
  return { status: res.status(), body: parsed as T, text };
}

/** Carried across the serial steps below. */
const journey: {
  testSetId?: string;
  assessmentId?: string;
  keyed?: { testSetQuestionId: string; optionId: string; label: string }[];
  resultPath?: string;
} = {};

/** Escape a literal for use inside a RegExp. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe.configure({ mode: 'serial' });

test.describe('assessment lifecycle through the A+ UI @assessment-lifecycle', () => {
  // Every test gets a fresh context, so the browser session is seeded per test.
  // Seeding must happen on the context before the first navigation.
  test.beforeEach(async ({ context }, testInfo) => {
    await seedFirebaseSession(context);
    // Record what the SPA actually asks the gateway for, per beat. This is the
    // artefact the sequence diagram is reconciled against: a diagram drawn from
    // the spec's intent can depict a call the run never makes.
    recordBrowserApiCalls(context, testInfo.title);
  });

  // Runs whether the suite passed or failed. A failed run's evidence is the
  // evidence that matters most, so the manifest must not be gated on green.
  test.afterAll(async () => {
    writeRunArtefacts({
      run_tag: RUN_TAG,
      api_base_url: API,
      test_set_id: journey.testSetId ?? null,
      assessment_id: journey.assessmentId ?? null,
      result_path: journey.resultPath ?? null,
      expected_total_points: EXPECTED_TOTAL_POINTS,
      authored_question_count: AUTHORED.length,
    });
    console.log(`BEAT EVIDENCE  directory  ${evidenceDir()}`);
  });

  test('1 AUTHOR: an author hand-writes one MCQ with no AI assist @assessment-lifecycle', async ({
    page,
  }) => {
    // ONE question per accept, deliberately.
    //
    // Staging several rows into a SINGLE accept trips a live defect: only the
    // first row's atom is minted with its `stem`, every later row's atom is
    // minted with `stem: ""`, and all of them inherit the FIRST row's `title`.
    // A test set built from those questions then serves a learner a question
    // with no stem, which reads as a blank question on the page. Authoring one
    // at a time is a normal thing for an author to do and is unaffected. This
    // note is here so the loop is not "simplified" back into one accept, and
    // the defect itself is reported rather than hidden.
    for (const [index, authored] of AUTHORED.entries()) {
      await page.goto('/a/studio/atoms/new');
      await expect(
        page.getByTestId('unified-authoring'),
        'the authoring canvas renders for a holder of assessment:author',
      ).toBeVisible({ timeout: 40_000 });

      // "By hand" drops straight into hand-authoring with no AI compose form.
      // The `ai` mode is never clicked, so no generation job is ever dispatched.
      await page.getByTestId('unified-mode-manual').click();
      await expect(
        page.getByTestId('unified-manual-intro'),
        'manual mode is active, so no AI compose form is in play',
      ).toBeVisible();

      // MCQ only. The open-ended button sits beside it and is deliberately
      // never used, because OE grading routes through an LLM evaluator.
      await page.getByTestId('unified-review-add-mcq').click();
      const row = page.locator('[data-testid^="unified-review-row-"]');
      await expect(row, 'exactly one question is staged for this accept').toHaveCount(1);

      // A fresh MCQ row seeds two blank options with the FIRST marked correct.
      // This types the key into the SECOND and moves the marker there, so a
      // later pass cannot come from the starter row's default marker.
      await row.locator('[data-testid$="-prompt"]').fill(authored.prompt);
      await row.locator('textarea[data-testid$="-option-0"]').fill(authored.distractor);
      await row.locator('textarea[data-testid$="-option-1"]').fill(authored.keyed);
      await row.locator('[data-testid$="-correct-1"]').click();

      await expect(
        row.locator('[data-testid$="-errors"]'),
        'the row satisfies the editor rules (prompt, 2 labelled options, exactly one correct)',
      ).toHaveCount(0);

      // The frame that proves the beat: "By hand" is the selected mode, no AI
      // compose form is on the page, both option labels read back, and the
      // correct marker sits on B. Captured BEFORE accept, which is the moment
      // the hand-committed evidence at commit 62e1f2105 also shows.
      await captureBeat(
        1,
        'AUTHOR',
        AUTHORED.length === 1
          ? '1-author-by-hand-no-ai-assist'
          : `1-author-by-hand-no-ai-assist-q${index + 1}`,
        page,
      );

      const accept = page.getByTestId('unified-review-accept');
      await expect(accept, 'the accept CTA enables once the row validates').toBeEnabled();
      await accept.click();

      await expect(
        page.getByTestId('unified-authoring-done'),
        'accept mints the atom and reports done',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        page.getByTestId('unified-authoring-error'),
        'authoring reports no error',
      ).toHaveCount(0);
    }
    noteBeat(
      1,
      'AUTHOR',
      'manual mode only: the AI compose form is never rendered and no generation job is dispatched',
    );
  });

  test('2 ASSEMBLE: the authored question is assembled into a published test set @assessment-lifecycle', async ({
    page,
  }) => {
    // Navigating to `new` creates a DRAFT test set and redirects to its editor.
    await page.goto('/a/studio/test-sets/new');
    await expect(
      page.getByTestId('aplus-test-set-editor'),
      'the test-set editor opens on a fresh draft',
    ).toBeVisible({ timeout: 40_000 });

    await expect(page, 'the draft test set has an id in the URL').toHaveURL(
      /\/a\/studio\/test-sets\/[0-9a-f-]{36}\/edit/,
    );
    journey.testSetId = /test-sets\/([0-9a-f-]{36})\/edit/.exec(page.url())![1];

    await page.getByTestId('aplus-test-set-title-input').fill(`Hand-authored MCQ set ${RUN_TAG}`);

    // Find this run's own questions by their run tag, then add them. Searching
    // rather than deep-linking by id is also what proves the authored questions
    // reached the author's own bank.
    await page.getByTestId('aplus-question-picker-search-input').fill(RUN_TAG);
    const cards = page.locator('[data-testid^="aplus-question-picker-quick-add-"]');
    await expect(
      cards,
      'the picker finds exactly the questions this run authored',
    ).toHaveCount(AUTHORED.length, { timeout: 30_000 });

    // Add each DISTINCT question by its own quick-add control. The picker keeps
    // a card in the list after it is added, so clicking "the first match" twice
    // adds the SAME question twice and yields a test set that references one
    // question in both slots.
    const addTestIds = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')!),
    );
    const distinct = [...new Set(addTestIds)];
    expect(
      distinct.length,
      'the picker offers one distinct card per authored question',
    ).toBe(AUTHORED.length);

    for (let i = 0; i < distinct.length; i++) {
      await page.getByTestId(distinct[i]!).click();
      await expect(
        page.locator('[data-testid^="aplus-tsq-card-"]'),
        `question ${i + 1} is included in the test set`,
      ).toHaveCount(i + 1, { timeout: 20_000 });
    }

    const publish = page.getByTestId('aplus-test-set-publish-cta');
    await expect(publish, 'an assembled test set can be published').toBeEnabled();
    await publish.click();
    await expect(
      page.getByTestId('aplus-test-set-publish-error'),
      'publishing the test set reports no error',
    ).toHaveCount(0, { timeout: 20_000 });

    // ASSERT THE PUBLISHED STATE, not merely the absence of an error. Until
    // 2026-08-24 this beat stopped at "no error", which is a weaker claim than
    // the beat's own name makes, and the evidence frame proved it: captured
    // straight after the click it still showed the DRAFT badge and the Publish
    // button, because the POST had returned and the view had not moved on.
    //
    // `publish()` calls `navigateByUrl('/a/studio/test-sets')` on success, so
    // the observable published state is the card in the author's list, NOT the
    // editor's `aplus-test-set-published-explainer`. That explainer renders
    // only when an already-published test set is re-opened, so waiting on it
    // here times out. Measured: build 5a1cb153 failed on exactly that, which is
    // the gate doing its job rather than a frame quietly over-claiming.
    await expect(
      page,
      'a successful publish returns the author to the test-set list',
    ).toHaveURL(/\/a\/studio\/test-sets\/?$/, { timeout: 20_000 });

    const publishedCard = page.getByTestId(`aplus-test-set-card-${journey.testSetId}`);
    await expect(
      publishedCard,
      'the test set this run assembled appears in the author list',
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      publishedCard.locator('[data-state]'),
      'the test set reads back as PUBLISHED, not merely free of errors',
    ).toHaveAttribute('data-state', 'PUBLISHED');

    // The card also prints its question count and total points, so the frame
    // taken here evidences every word of its own filename.
    await captureBeat(2, 'ASSEMBLE', '2-testset-published-1q-10pts', page);
    noteBeat(2, 'ASSEMBLE', `test_set_id ${journey.testSetId}`);
  });

  test('3 PUBLISH: an assessment is instantiated from the authored test set @assessment-lifecycle', async ({
    request,
  }) => {
    // Omitting BOTH schedule fields is what auto-publishes DRAFT to OPEN and
    // synthesises a [now, now+24h] window. Supplying them keeps it DRAFT and the
    // learner is then 403 not eligible. There is no publish route.
    const created = await json<CreatedAssessment>(request, 'post', '/api/v1/assessments', {
      test_set_id: journey.testSetId,
      title_override: `Authored lifecycle ${RUN_TAG}`,
      max_attempts: 3,
    });
    expect(created.status, `POST /api/v1/assessments: ${created.text}`).toBe(201);
    expect(created.body.state, 'assessment auto-published to OPEN').toBe('OPEN');
    expect(
      created.body.question_count,
      'the assessment carries every authored question',
    ).toBe(AUTHORED.length);
    expect(created.body.total_points, 'each authored question is worth 10 points').toBe(
      EXPECTED_TOTAL_POINTS,
    );
    journey.assessmentId = created.body.assessment_id;

    // Resolve the keyed option id per question. The learner view never reveals
    // the key, but this run typed it, so it is matched by its own label text.
    const view = await json<LearnerAssessmentView>(
      request,
      'get',
      `/api/v1/me/assessments/${journey.assessmentId}`,
    );
    expect(view.status, `learner view: ${view.text}`).toBe(200);
    expect(view.body.state, 'the learner sees it OPEN').toBe('OPEN');

    const questions = view.body.questions ?? [];
    expect(questions.length, 'the learner sees every authored question').toBe(AUTHORED.length);

    journey.keyed = questions.map((q) => {
      expect(q.question_type, 'every authored question is MCQ').toBe('mcq');
      // Assert the stem explicitly. A question snapshotted without one is
      // served to the learner as a blank question, and it would otherwise
      // surface here only as an obscure "no authored match" failure.
      expect(
        q.prompt?.stem,
        'the question carries its stem, an empty stem renders a blank question',
      ).toBeTruthy();
      const authored = AUTHORED.find((a) => a.prompt === q.prompt?.stem);
      expect(authored, `question "${q.prompt?.stem}" is one this run authored`).toBeTruthy();
      const keyed = (q.prompt?.options ?? []).find((o) => o.label === authored!.keyed);
      // `q.prompt?.prompt` here until 2026-08-24. That property does not exist
      // on the learner view, so the message this assertion prints when it fails
      // read `the keyed option is present on "undefined"` and named nothing.
      // `tests/**` is outside tsconfig.spec.json's include, so tsc never saw it.
      expect(keyed, `the keyed option is present on "${q.prompt?.stem}"`).toBeTruthy();
      return {
        testSetQuestionId: q.test_set_question_id,
        optionId: keyed!.option_id,
        label: authored!.keyed,
      };
    });

    // NO SCREENSHOT, DELIBERATELY. Beat 3 is instructor-side and runs entirely
    // over the API: there is no screen to photograph, and a frame of some other
    // page would be a frame that does not evidence the claim. The artefact is
    // the recorded response plus BEAT EVIDENCE log lines in the build log.
    await recordBeatJson(3, 'PUBLISH', '3-publish', {
      request: {
        method: 'POST',
        path: '/api/v1/assessments',
        test_set_id: journey.testSetId,
        max_attempts: 3,
        schedule_fields_omitted: true,
      },
      response: {
        status: created.status,
        state: created.body.state,
        question_count: created.body.question_count,
        total_points: created.body.total_points,
        assessment_id: journey.assessmentId,
      },
      learner_view: {
        method: 'GET',
        path: `/api/v1/me/assessments/${journey.assessmentId}`,
        status: view.status,
        state: view.body.state,
        question_count: questions.length,
        question_types: questions.map((q) => q.question_type),
        stems_present: questions.every((q) => !!q.prompt?.stem),
      },
    });
  });

  test('4 ATTEMPT: the learner sits the assessment in the browser and submits @assessment-lifecycle', async ({
    page,
  }) => {
    const assessmentId = journey.assessmentId!;

    // The assessment must reach the learner's own list, this is the learner
    // discovering it, not the test navigating straight to a known id.
    await page.goto('/a/me/assessments');
    const card = page.getByTestId(`me-assessments-card-${assessmentId}`);
    await expect(card, 'the new assessment appears in the learner list').toBeVisible({
      timeout: 30_000,
    });
    await card.getByTestId('me-assessments-card-open').click();

    await expect(
      page.getByTestId('me-assessment-cover-title'),
      'the assessment cover renders',
    ).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('me-assessment-start').click();

    await expect(
      page.getByTestId('me-assessment-canvas'),
      'starting the attempt opens the answer canvas',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId('me-assessment-question-prompt'),
      'every authored question renders its stem',
    ).toHaveCount(AUTHORED.length);

    for (const keyed of journey.keyed!) {
      // Scope to the question that owns this option before matching the option
      // id. Scoping matters: two questions carrying identical option labels are
      // issued colliding option ids, so an unscoped id match is ambiguous.
      const question = page.getByTestId(
        `me-assessment-question-${keyed.testSetQuestionId}`,
      );
      await expect(question, 'the authored question renders').toBeVisible();

      // Locate by the id the API keyed, then assert the rendered text matches
      // that id's label. Together these prove the UI bound the right option to
      // the right id, which a positional or letter-based match would not.
      const option = question.locator(`[data-testid$="${keyed.optionId}"]`);
      await expect(
        option,
        'exactly one option in this question carries the keyed option id',
      ).toHaveCount(1);
      await expect(
        option,
        'the option rendered against the keyed id shows the label for that id',
      ).toHaveText(new RegExp(escapeRegExp(keyed.label)));

      await option.click();
      await expect(option, 'the clicked option is selected').toHaveAttribute(
        'aria-checked',
        'true',
      );
    }

    // Do NOT submit until every answer is observably held. Submitting straight
    // after the click races the autosave and posts an EMPTY answer set, which
    // still grades, as a zero. Gating on this makes that race a failure rather
    // than a silent wrong-answer pass.
    await expect(
      page.getByTestId('me-assessment-autosave-pill'),
      'the answers autosave before submit',
    ).toHaveAttribute('data-state', 'saved', { timeout: 20_000 });

    // Half of beat 4: the keyed option selected and the answer observably held.
    // This is the moment the hand-committed frame 3 shows, and it is the only
    // half that set evidenced.
    await captureBeat(4, 'ATTEMPT', '4a-answered-autosaved', page);

    await page.getByTestId('me-assessment-submit').click();

    const goResult = page.getByTestId('me-assessment-go-result');
    await expect(goResult, 'the submitted attempt offers its result').toBeVisible({
      timeout: 30_000,
    });

    // The other half of beat 4, which the hand-committed set never evidenced:
    // the attempt is submitted and its result is offered. Captured before the
    // click, because the click leaves this screen.
    //
    // NAMED FOR WHAT THE FRAME SHOWS. It is not called "graded": the screen
    // shows a closed attempt offering its result, and the word GRADED belongs
    // to the 202 on the submit call, which is recorded in http-calls.json. A
    // filename is a claim, and this one should not claim more than its pixels.
    await captureBeat(4, 'ATTEMPT', '4b-submitted-result-offered', page);
    noteBeat(
      4,
      'ATTEMPT',
      'the GRADED transition is the 202 on POST /api/v1/me/assessments/{id}/submissions/{id}/submit, recorded in http-calls.json, not something the screen prints',
    );

    await goResult.click();

    await expect(
      page,
      'the result CTA lands on the result route for this assessment',
    ).toHaveURL(new RegExp(`/a/me/assessments/${assessmentId}/result/`));
    journey.resultPath = new URL(page.url()).pathname;
  });

  test('5 GATE: the grade is withheld from the learner until it is released @assessment-lifecycle', async ({
    page,
  }) => {
    await page.goto(journey.resultPath!);

    // auto_release is false and cannot be set through the API, so an unreleased
    // result must read as pending, never as a score and never as an error.
    await expect(
      page.getByTestId('me-result-pending'),
      'an unreleased result renders the pending state',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId('me-result-released'),
      'no score is shown before release',
    ).toHaveCount(0);
    await expect(
      page.getByTestId('me-result-error'),
      'withholding a grade is not an error state',
    ).toHaveCount(0);

    await captureBeat(5, 'GATE', '5-grade-withheld', page);
  });

  test('6 RELEASE: the released grade reads back in the browser @assessment-lifecycle', async ({
    page,
    request,
  }) => {
    // The instructor releases. This is the act the learner was waiting on.
    const released = await json<ReleasedAssessment>(
      request,
      'post',
      `/api/v1/assessments/${journey.assessmentId}/release-results`,
      {},
    );
    expect(released.status, `release-results: ${released.text}`).toBe(200);
    expect(released.body.state, 'the assessment moves to RELEASED').toBe('RELEASED');

    await page.goto(journey.resultPath!);

    await expect(
      page.getByTestId('me-result-released'),
      'the released result renders for the learner',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId('me-result-pending'),
      'the pending state is gone once released',
    ).toHaveCount(0);

    // Every authored MCQ was answered with its own key, so the learner sees
    // full marks, a pass, and one correct mark per question.
    await expect(
      page.getByTestId('me-result-passed-badge'),
      'the learner passed',
    ).toHaveAttribute('data-passed', 'true');
    await expect(
      page.getByTestId('me-result-row-correct-mark'),
      'one graded row per authored question',
    ).toHaveCount(AUTHORED.length);
    for (let i = 0; i < AUTHORED.length; i++) {
      await expect(
        page.getByTestId('me-result-row-correct-mark').nth(i),
        `authored question ${i + 1} is marked correct`,
      ).toHaveAttribute('data-correct', 'true');
    }
    await expect(
      page.getByTestId('me-result-score'),
      `the score reads ${EXPECTED_TOTAL_POINTS} of ${EXPECTED_TOTAL_POINTS}`,
    ).toHaveText(new RegExp(`${EXPECTED_TOTAL_POINTS}\\s*/\\s*${EXPECTED_TOTAL_POINTS}`));

    await captureBeat(
      6,
      'RELEASE',
      `6-released-${EXPECTED_TOTAL_POINTS}of${EXPECTED_TOTAL_POINTS}-passed`,
      page,
    );
    noteBeat(
      6,
      'RELEASE',
      'the release itself is an instructor API call, POST /api/v1/assessments/{id}/release-results, 200 RELEASED',
    );
  });

  test('7 OTLP: the deployed gateway stamps W3C traceparent on a lifecycle read @assessment-lifecycle', async ({
    request,
  }) => {
    // The counterpart assertion in e2e/phyllis-step8-n-familiar.spec.ts can only
    // inspect a header its own fixture injected, because that spec runs against
    // a mocked BFF. This one reads a REAL response from the deployed gateway, so
    // it is the assertion that actually evidences OTLP context propagation.
    const res = await request.get(
      `${API}/api/v1/me/assessments/${journey.assessmentId}`,
      { headers: bearer() },
    );
    recordApiCall(
      test.info().title,
      'get',
      `${API}/api/v1/me/assessments/${journey.assessmentId}`,
      res.status(),
    );
    expect(res.status(), 'the lifecycle read succeeds').toBe(200);

    const traceparent = res.headers()['traceparent'] ?? null;
    expect(
      traceparent,
      'the deployed gateway returns a traceparent response header',
    ).not.toBeNull();
    // version-trace_id-parent_id-trace_flags, all hex per W3C trace-context.
    expect(traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/);
    // An all-zero trace id is the spec's "invalid" sentinel, so a well-formed
    // header carrying it would mean no trace was actually recorded.
    expect(traceparent, 'the trace id is not the all-zero sentinel').not.toMatch(
      /^00-0{32}-/,
    );

    // NO SCREENSHOT, DELIBERATELY. Beat 7 asserts a RESPONSE HEADER. A header
    // does not render, so the honest artefact is the header itself, recorded
    // verbatim with its parsed fields, plus BEAT EVIDENCE log lines. The trace
    // id is written out so the span is findable in Cloud Trace afterwards,
    // which a screenshot could never give.
    const [version, traceId, parentId, flags] = (traceparent ?? '').split('-');
    await recordBeatJson(7, 'OTLP', '7-otlp', {
      request: {
        method: 'GET',
        path: `/api/v1/me/assessments/${journey.assessmentId}`,
        status: res.status(),
      },
      traceparent,
      parsed: { version, trace_id: traceId, parent_id: parentId, trace_flags: flags },
      w3c_shape_ok: /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(traceparent ?? ''),
      trace_id_is_all_zero_sentinel: /^0{32}$/.test(traceId ?? ''),
      cloud_trace_url:
        `https://console.cloud.google.com/traces/list?project=chora-489812&tid=${traceId}`,
    });
  });
});

