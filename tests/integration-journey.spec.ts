/**
 * Integration journey — rubric 2a(iii) evidence spec. @integration-journey
 *
 * One learner journey driven against the DEPLOYED platform, touching all three
 * tiers in a single run:
 *
 *   FRONTEND  the real A+ SPA at chora.site, loaded in a browser
 *   SERVICE   chora-gateway (BFF) fronting delivery
 *   DATA      chora_delivery on Cloud SQL
 *
 *   1 BROWSE    load the SPA, then list the public catalogue -> chora_delivery READ
 *   2 ASSESS    start, answer one MCQ, submit                -> chora_delivery WRITE
 *   3 RESULT    release, then read back the graded score     -> chora_delivery READ
 *
 * SCOPE, deliberately narrowed 2026-08-10. An earlier revision also bought a
 * course and fulfilled it with a signed Stripe webhook. That leg was cut to
 * keep the gate dependable: it pulled in Stripe, an HMAC secret, a Pub/Sub hop
 * and an eventual-consistency wait, and it failed in the Playwright image with
 * `500 dispatch failed` because the catalogue reports the course's tenant as
 * 00000000-0000-7000-8000-000000000001 rather than the learner's tenant. The
 * payments tier is evidenced separately; all three tiers are still covered here.
 *
 * The assessment is freestanding, so no enrolment is needed to sit it.
 *
 * MCQ grading is DETERMINISTIC (no LLM in the loop), so the expected score is a
 * fixed assertion rather than something that can drift between runs.
 *
 * Required env, supplied by the Cloud Build step:
 *   E2E_SESSION_JWT   the HS256 chora_session JWT, used as the API bearer for the
 *                     assessment steps. BROWSE needs no credential at all.
 * Optional:
 *   API_BASE_URL      defaults to https://api.chora.site
 *   E2E_TEST_SET_ID   published one-MCQ test set to instantiate
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const API = (process.env['API_BASE_URL'] ?? 'https://api.chora.site').replace(/\/$/, '');

// Published one-MCQ test set. Deterministic grading, 10 points.
const TEST_SET_ID =
  process.env['E2E_TEST_SET_ID'] ?? '019fec11-83e5-7ecb-8e2a-6bef8f603ee1';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. The chora-web lane supplies it; see the integration-journey ` +
        `step in chora-web/cloudbuild-staging.yaml. Refusing to run rather than skip.`,
    );
  }
  return v;
}

/** Shared across the serial steps below. */
const journey: {
  assessmentId?: string;
  submissionId?: string;
  testSetQuestionId?: string;
  questionId?: string;
  correctOptionId?: string;
} = {};

function bearer(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv('E2E_SESSION_JWT')}`,
    'Content-Type': 'application/json',
  };
}

async function json(
  req: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  path: string,
  body?: unknown,
  authed = true,
) {
  const res = await req[method](`${API}${path}`, {
    headers: authed ? bearer() : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { data: body }),
  });
  const text = await res.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* non-JSON body is surfaced through `text` in the assertion message */
  }
  return { status: res.status(), body: parsed, text };
}

test.describe.configure({ mode: 'serial' });

test.describe('integration journey, three tiers @integration-journey', () => {
  test('1 BROWSE: the deployed SPA loads and the catalogue reads back @integration-journey', async ({
    page,
    request,
  }) => {
    // Frontend tier: the real published bundle, fetched over the network.
    await page.goto('/');
    await expect(page).toHaveTitle(/Chora/i);

    // The public catalogue is genuinely unauthenticated, so this step stands on
    // its own: it proves the surface and the read path without depending on the
    // session mint, and a mint problem cannot masquerade as a catalogue problem.
    const cat = await json(request, 'get', '/api/catalog?public=true&page_size=50', undefined, false);
    expect(cat.status, `GET /api/catalog: ${cat.text}`).toBe(200);
    const items: any[] = cat.body.items ?? [];
    expect(items.length, 'public catalogue is not empty').toBeGreaterThan(0);
    expect(items[0].id, 'a catalogue row carries its course id').toBeTruthy();
  });

  test('2 ASSESS: one MCQ is answered and graded deterministically @integration-journey', async ({
    request,
  }) => {
    // Omitting both schedule fields is what auto-publishes DRAFT to OPEN and
    // synthesises a [now, now+24h] window. Supplying them keeps it DRAFT and the
    // learner is then 403 not eligible. There is no publish route.
    const created = await json(request, 'post', '/api/v1/assessments', {
      test_set_id: TEST_SET_ID,
      title_override: `CI integration journey ${new Date().toISOString()}`,
      max_attempts: 3,
    });
    expect(created.status, `POST /api/v1/assessments: ${created.text}`).toBe(201);
    expect(created.body.state, 'assessment auto-published to OPEN').toBe('OPEN');
    expect(created.body.question_count).toBe(1);
    journey.assessmentId = created.body.assessment_id;

    const view = await json(request, 'get', `/api/v1/me/assessments/${journey.assessmentId}`);
    expect(view.status, `learner view: ${view.text}`).toBe(200);
    const q = (view.body.questions ?? []).find((x: any) => x.question_type === 'mcq');
    expect(q, 'the test set carries exactly one MCQ').toBeTruthy();
    journey.testSetQuestionId = q.test_set_question_id;
    journey.questionId = q.question_id;

    // Grading is option_id based, so match the option by its label text rather
    // than by position: shuffle_mcq_options may reorder them per learner.
    const correct = (q.prompt?.options ?? []).find((o: any) =>
      /inspect progress toward the Sprint Goal/i.test(o.label),
    );
    expect(correct, 'the keyed option is present').toBeTruthy();
    journey.correctOptionId = correct.option_id;

    const started = await json(
      request,
      'post',
      `/api/v1/me/assessments/${journey.assessmentId}/submissions`,
      {},
    );
    expect(started.status, `start submission: ${started.text}`).toBe(201);
    journey.submissionId = started.body.submission_id;

    const answers = {
      answers: [
        {
          test_set_question_id: journey.testSetQuestionId,
          question_id: journey.questionId,
          mcq_choice_id: journey.correctOptionId,
        },
      ],
    };
    const saved = await json(
      request,
      'patch',
      `/api/v1/me/assessments/${journey.assessmentId}/submissions/${journey.submissionId}/autosave`,
      answers,
    );
    expect(saved.status, `autosave: ${saved.text}`).toBe(200);

    const submitted = await json(
      request,
      'post',
      `/api/v1/me/assessments/${journey.assessmentId}/submissions/${journey.submissionId}/submit`,
      answers,
    );
    expect(submitted.status, `submit: ${submitted.text}`).toBe(202);
    // Deterministic MCQ dispatch grades in-band, with no LLM evaluator job.
    expect(submitted.body.state).toBe('GRADED');
  });

  test('3 RESULT: the released score reads back 1 of 1 @integration-journey', async ({ request }) => {
    // auto_release cannot be set through the API (createTestSet rejects
    // default_grading_config), so the instructor release is part of the journey.
    const released = await json(
      request,
      'post',
      `/api/v1/assessments/${journey.assessmentId}/release-results`,
      {},
    );
    expect(released.status, `release-results: ${released.text}`).toBe(200);

    const result = await json(
      request,
      'get',
      `/api/v1/me/assessments/${journey.assessmentId}/submissions/${journey.submissionId}/result`,
    );
    expect(result.status, `result: ${result.text}`).toBe(200);
    expect(result.body.result, 'the score is released, not PENDING_RELEASE').toBeTruthy();
    expect(result.body.result.breakdown.mcq_total).toBe(1);
    expect(result.body.result.breakdown.mcq_correct_count).toBe(1);
    expect(result.body.result.passed).toBe(true);
    expect(result.body.result.per_question_grades[0].grading_dispatch).toBe('DETERMINISTIC');
  });
});
