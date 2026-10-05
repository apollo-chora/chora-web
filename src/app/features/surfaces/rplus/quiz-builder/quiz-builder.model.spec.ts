import { describe, it, expect } from 'vitest';
import {
  blankDraft,
  blankItem,
  coerceExplainerMode,
  isQuizDraftValid,
  itemFromAtom,
  mapBackendLiveQuiz,
  toCreatePayload,
  toPatchPayload,
  totalScore,
  totalSeconds,
  validateQuizItem,
  DEFAULT_EXPLAINER_MODE,
  DEFAULT_QUIZ_TIME_LIMIT_SECONDS,
  DEFAULT_SCORE_POINTS,
  DEFAULT_TIMER_SECONDS,
  EXPLAINER_MODES,
  type BackendLiveQuiz,
  type QuizDraft,
  type QuizItemDraft,
} from './quiz-builder.model';

const baseItem = (
  override: Partial<QuizItemDraft> = {},
): QuizItemDraft => ({
  questionId: 'q1',
  prompt: 'What ceremony kicks off a Sprint?',
  options: [
    { key: 'A', text: 'Sprint Review', explainer: '' },
    { key: 'B', text: 'Sprint Planning', explainer: 'Correct — kicks it off.' },
    { key: 'C', text: 'Daily Scrum', explainer: '' },
    { key: 'D', text: 'Retrospective', explainer: '' },
  ],
  correctKey: 'B',
  timerSeconds: DEFAULT_TIMER_SECONDS,
  scorePoints: DEFAULT_SCORE_POINTS,
  atomId: '',
  doublePoints: false,
  ...override,
});

const baseDraft = (items: readonly QuizItemDraft[] = []): QuizDraft => ({
  id: '',
  state: 'DRAFT',
  courseId: 'course-cspo',
  title: 'CSPO Sprint Planning',
  items,
  publishedAt: '',
  quizTimeLimitSeconds: DEFAULT_QUIZ_TIME_LIMIT_SECONDS,
  explainerMode: DEFAULT_EXPLAINER_MODE,
});

describe('quiz-builder.model — validateQuizItem', () => {
  it('returns no errors for a well-formed item', () => {
    expect(validateQuizItem(baseItem())).toEqual([]);
  });

  it('flags an empty prompt', () => {
    const out = validateQuizItem(baseItem({ prompt: '   ' }));
    expect(out.some((e) => e.includes('Prompt'))).toBe(true);
  });

  it('flags an empty option text', () => {
    const out = validateQuizItem(
      baseItem({
        options: [
          { key: 'A', text: '', explainer: '' },
          { key: 'B', text: 'Sprint Planning', explainer: '' },
          { key: 'C', text: 'Daily Scrum', explainer: '' },
          { key: 'D', text: 'Retrospective', explainer: '' },
        ],
      }),
    );
    expect(out.some((e) => e.includes('option'))).toBe(true);
  });

  it('flags a timer below the minimum', () => {
    const out = validateQuizItem(baseItem({ timerSeconds: 1 }));
    expect(out.some((e) => e.includes('Timer'))).toBe(true);
  });

  it('flags a timer above the maximum', () => {
    const out = validateQuizItem(baseItem({ timerSeconds: 9999 }));
    expect(out.some((e) => e.includes('Timer'))).toBe(true);
  });

  it('flags a score below the minimum', () => {
    const out = validateQuizItem(baseItem({ scorePoints: 0 }));
    expect(out.some((e) => e.includes('Score'))).toBe(true);
  });

  it('flags a score above the maximum', () => {
    const out = validateQuizItem(baseItem({ scorePoints: 9999 }));
    expect(out.some((e) => e.includes('Score'))).toBe(true);
  });

  it('flags a wrong option count (!== 4 TRUE arm)', () => {
    const out = validateQuizItem(
      baseItem({
        options: [
          { key: 'A', text: 'Sprint Review', explainer: '' },
          { key: 'B', text: 'Sprint Planning', explainer: '' },
          { key: 'C', text: 'Daily Scrum', explainer: '' },
        ],
        correctKey: 'B',
      }),
    );
    expect(out.some((e) => e.includes('4 options'))).toBe(true);
  });

  it('flags a correctKey that matches no option key (negated some TRUE arm)', () => {
    // All four positional keys are A/B/C/D; correctKey 'D' exists, but here
    // we override the option set so that no option carries key 'D'.
    const out = validateQuizItem(
      baseItem({
        options: [
          { key: 'A', text: 'Sprint Review', explainer: '' },
          { key: 'B', text: 'Sprint Planning', explainer: '' },
          { key: 'C', text: 'Daily Scrum', explainer: '' },
          { key: 'A', text: 'Retrospective', explainer: '' },
        ],
        correctKey: 'D',
      }),
    );
    expect(
      out.some((e) => e.includes('Correct-answer key must match')),
    ).toBe(true);
  });
});

describe('quiz-builder.model — isQuizDraftValid', () => {
  it('is true for a 5-item well-formed CSPO draft', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      baseItem({ questionId: `q${i + 1}` }),
    );
    expect(isQuizDraftValid(baseDraft(items))).toBe(true);
  });

  it('is false for an empty draft', () => {
    expect(isQuizDraftValid(baseDraft([]))).toBe(false);
  });

  it('is false if the title is blank', () => {
    const items = [baseItem()];
    expect(
      isQuizDraftValid({ ...baseDraft(items), title: '   ' }),
    ).toBe(false);
  });

  it('is false if any item is invalid', () => {
    const items = [baseItem(), baseItem({ prompt: '' })];
    expect(isQuizDraftValid(baseDraft(items))).toBe(false);
  });
});

describe('quiz-builder.model — totalScore', () => {
  it('sums scorePoints across items (5 × 10 = 50)', () => {
    const items = Array.from({ length: 5 }, () => baseItem());
    expect(totalScore(baseDraft(items))).toBe(50);
  });
});

describe('quiz-builder.model — totalSeconds', () => {
  it('sums timerSeconds across items (5 × 60 = 300)', () => {
    const items = Array.from({ length: 5 }, () => baseItem());
    expect(totalSeconds(baseDraft(items))).toBe(300);
  });
});

describe('quiz-builder.model — blankDraft / blankItem', () => {
  it('blankDraft has empty id + DRAFT state + zero items', () => {
    const d = blankDraft();
    expect(d.id).toBe('');
    expect(d.state).toBe('DRAFT');
    expect(d.items).toEqual([]);
    expect(d.publishedAt).toBe('');
  });

  it('blankItem has 4 empty options A/B/C/D + default timer/score', () => {
    const i = blankItem('q-new');
    expect(i.questionId).toBe('q-new');
    expect(i.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(i.options.every((o) => o.text === '')).toBe(true);
    expect(i.correctKey).toBe('A');
    expect(i.timerSeconds).toBe(DEFAULT_TIMER_SECONDS);
    expect(i.scorePoints).toBe(DEFAULT_SCORE_POINTS);
  });
});

describe('quiz-builder.model — mapBackendLiveQuiz', () => {
  const beQuiz: BackendLiveQuiz = {
    id: 'lq-001',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-mr-chen',
    title: 'CSPO Sprint Planning',
    state: 'DRAFT',
    questions: [
      {
        question_id: 'q1',
        prompt: 'Which ceremony kicks off a Sprint?',
        timer_seconds: 60,
        points: 10,
        options: [
          { label: 'Sprint Review', is_correct: false },
          { label: 'Sprint Planning', is_correct: true },
          { label: 'Daily Scrum', is_correct: false },
          { label: 'Retrospective', is_correct: false },
        ],
      },
    ],
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
  };

  it('maps id/title/state/courseId verbatim', () => {
    const d = mapBackendLiveQuiz(beQuiz);
    expect(d.id).toBe('lq-001');
    expect(d.title).toBe('CSPO Sprint Planning');
    expect(d.state).toBe('DRAFT');
    expect(d.courseId).toBe('course-cspo');
    expect(d.publishedAt).toBe('');
  });

  it('promotes BE is_correct flag to positional correctKey (Sprint Planning = B)', () => {
    const d = mapBackendLiveQuiz(beQuiz);
    expect(d.items).toHaveLength(1);
    const item = d.items[0]!;
    expect(item.correctKey).toBe('B');
    expect(item.options.map((o) => o.text)).toEqual([
      'Sprint Review',
      'Sprint Planning',
      'Daily Scrum',
      'Retrospective',
    ]);
  });

  it('captures publishedAt when the BE supplies it', () => {
    const d = mapBackendLiveQuiz({
      ...beQuiz,
      state: 'PUBLISHED',
      published_at: '2026-05-26T11:30:00Z',
    });
    expect(d.state).toBe('PUBLISHED');
    expect(d.publishedAt).toBe('2026-05-26T11:30:00Z');
  });

  it('falls back to defaults when BE omits fields', () => {
    const d = mapBackendLiveQuiz({
      ...beQuiz,
      questions: [
        {
          question_id: 'qx',
          prompt: 'P?',
          timer_seconds: 0,
          points: 0,
          options: [
            { label: 'A', is_correct: false },
            { label: 'B', is_correct: false },
          ],
        },
      ],
    });
    const it = d.items[0]!;
    expect(it.correctKey).toBe('A'); // no is_correct → default A
    // Missing options for keys C/D synthesised as empty text.
    expect(it.options[2]!.key).toBe('C');
    expect(it.options[2]!.text).toBe('');
    expect(it.options[3]!.key).toBe('D');
    expect(it.options[3]!.text).toBe('');
  });
});

describe('quiz-builder.model — payload mappers', () => {
  it('toCreatePayload trims title and forwards courseId', () => {
    const d: QuizDraft = {
      ...baseDraft(),
      title: '   CSPO   ',
      courseId: 'course-cspo',
    };
    // toCreatePayload returns the FE-shaped CreateLiveQuizRequest
    // ({courseId,title}); QuizBuilderService.create maps courseId →
    // course_id at the wire boundary.
    expect(toCreatePayload(d)).toEqual({
      courseId: 'course-cspo',
      title: 'CSPO',
    });
  });

  it('toPatchPayload encodes title + questions with is_correct flag', () => {
    const items = [baseItem({ questionId: 'q1' })];
    const out = toPatchPayload(baseDraft(items));
    expect(out.title).toBe('CSPO Sprint Planning');
    expect(out.questions).toHaveLength(1);
    const q = out.questions[0]!;
    expect(q.question_id).toBe('q1');
    expect(q.timer_seconds).toBe(DEFAULT_TIMER_SECONDS);
    expect(q.points).toBe(DEFAULT_SCORE_POINTS);
    expect(q.options).toHaveLength(4);
    // Sprint Planning (key B) should be the sole is_correct.
    expect(q.options.filter((o) => o.is_correct)).toHaveLength(1);
    expect(q.options.find((o) => o.is_correct)?.label).toBe(
      'Sprint Planning',
    );
  });

  it('toPatchPayload trims option labels', () => {
    const items = [
      baseItem({
        options: [
          { key: 'A', text: '  Sprint Review  ', explainer: '' },
          { key: 'B', text: 'Sprint Planning', explainer: '' },
          { key: 'C', text: 'Daily Scrum', explainer: '' },
          { key: 'D', text: 'Retrospective', explainer: '' },
        ],
      }),
    ];
    const out = toPatchPayload(baseDraft(items));
    expect(out.questions[0]!.options[0]!.label).toBe('Sprint Review');
  });
});

describe('quiz-builder.model — ADR-168 Live Classroom fields', () => {
  it('blankDraft seeds quiz-level time-limit + explainer-mode defaults', () => {
    const d = blankDraft();
    expect(d.quizTimeLimitSeconds).toBe(DEFAULT_QUIZ_TIME_LIMIT_SECONDS);
    expect(d.explainerMode).toBe(DEFAULT_EXPLAINER_MODE);
  });

  it('blankItem seeds empty per-option explainers + empty atomId', () => {
    const i = blankItem('q-new');
    expect(i.options.every((o) => o.explainer === '')).toBe(true);
    expect(i.atomId).toBe('');
  });

  it('EXPLAINER_MODES enumerates the 4 disclosure policies in order', () => {
    expect(EXPLAINER_MODES).toEqual([
      'NEVER',
      'IMMEDIATE',
      'END_OF_QUESTION',
      'END_OF_SESSION',
    ]);
  });

  it('coerceExplainerMode passes through known modes, defaults the rest', () => {
    expect(coerceExplainerMode('IMMEDIATE')).toBe('IMMEDIATE');
    expect(coerceExplainerMode('END_OF_SESSION')).toBe('END_OF_SESSION');
    expect(coerceExplainerMode('GARBAGE')).toBe(DEFAULT_EXPLAINER_MODE);
    expect(coerceExplainerMode(undefined)).toBe(DEFAULT_EXPLAINER_MODE);
  });

  it('itemFromAtom snapshots prompt/options/explainers + sets atomId', () => {
    const i = itemFromAtom('q-atom', '  atom-123  ', {
      prompt: 'Newton question?',
      options: [
        { text: 'Newton', explainer: 'First law of motion.' },
        { text: 'Einstein', explainer: 'Relativity, not this one.' },
        { text: 'Bohr' },
        { text: 'Curie' },
      ],
      correctKey: 'A',
    });
    expect(i.atomId).toBe('atom-123'); // trimmed
    expect(i.prompt).toBe('Newton question?');
    expect(i.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(i.options[0]!.text).toBe('Newton');
    expect(i.options[0]!.explainer).toBe('First law of motion.');
    expect(i.options[2]!.explainer).toBe(''); // missing explainer → ''
    expect(i.correctKey).toBe('A');
  });

  it('mapBackendLiveQuiz decodes quiz_time_limit_seconds + explainer_mode', () => {
    const d = mapBackendLiveQuiz({
      id: 'lq-2',
      tenant_id: 't',
      course_id: 'c',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      quiz_time_limit_seconds: 900,
      explainer_mode: 'IMMEDIATE',
      questions: [
        {
          question_id: 'q1',
          prompt: 'P?',
          timer_seconds: 60,
          points: 10,
          atom_id: 'atom-xyz',
          options: [
            { label: 'A', is_correct: true, explainer: 'because A' },
            { label: 'B', is_correct: false },
            { label: 'C', is_correct: false },
            { label: 'D', is_correct: false },
          ],
        },
      ],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    expect(d.quizTimeLimitSeconds).toBe(900);
    expect(d.explainerMode).toBe('IMMEDIATE');
    expect(d.items[0]!.atomId).toBe('atom-xyz');
    expect(d.items[0]!.options[0]!.explainer).toBe('because A');
  });

  it('mapBackendLiveQuiz takes the nullish-default arms for state/course_id/title/questions', () => {
    // Drive the FALSE / nullish arm of every defaulting expression:
    //   - (b.state || 'DRAFT') with empty string state → 'DRAFT'
    //   - b.course_id ?? '' with null course_id → ''
    //   - b.title ?? '' with null title → ''
    //   - (b.questions ?? []) with null questions → [] (empty items)
    const d = mapBackendLiveQuiz({
      id: 'lq-null',
      tenant_id: 't',
      course_id: null as unknown as string,
      instructor_gcid: 'g',
      title: null as unknown as string,
      state: '',
      questions: null as unknown as BackendLiveQuiz['questions'],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    expect(d.state).toBe('DRAFT');
    expect(d.courseId).toBe('');
    expect(d.title).toBe('');
    expect(d.items).toEqual([]);
  });

  it('mapBackendLiveQuizQuestion takes nullish arms for question_id/prompt/atom_id with empty options', () => {
    // q.question_id ?? '', q.prompt ?? '', q.atom_id ?? '' driven to the
    // nullish-default side, and q.options[i] yields undefined for every
    // index (empty array) so beOpt?.label ?? '' / beOpt?.explainer ?? ''
    // take their optional-chain-undefined arms.
    const d = mapBackendLiveQuiz({
      id: 'lq-q-null',
      tenant_id: 't',
      course_id: 'c',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      questions: [
        {
          question_id: null as unknown as string,
          prompt: null as unknown as string,
          timer_seconds: 60,
          points: 10,
          atom_id: undefined,
          options: [],
        },
      ],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    const item = d.items[0]!;
    expect(item.questionId).toBe('');
    expect(item.prompt).toBe('');
    expect(item.atomId).toBe('');
    // All four positional options synthesised empty since options was empty.
    expect(item.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(item.options.every((o) => o.text === '')).toBe(true);
    expect(item.correctKey).toBe('A'); // findIndex on [] → -1 → default A
  });

  it('mapBackendLiveQuizQuestion THROWS on null options (prod bug — inconsistent guard)', () => {
    // PROD BUG: line 348 guards `(q.options ?? [])` for findIndex, but
    // line 350 dereferences `q.options[i]` WITHOUT the guard. A null
    // `options` therefore survives the findIndex but throws inside the
    // for-loop. Characterised, NOT fixed — the spec stays green by
    // asserting the actual throw.
    expect(() =>
      mapBackendLiveQuiz({
        id: 'lq-q-null-throw',
        tenant_id: 't',
        course_id: 'c',
        instructor_gcid: 'g',
        title: 'T',
        state: 'DRAFT',
        questions: [
          {
            question_id: 'q',
            prompt: 'P?',
            timer_seconds: 60,
            points: 10,
            options:
              null as unknown as BackendLiveQuiz['questions'][number]['options'],
          },
        ],
        created_at: '2026-05-29T00:00:00Z',
        updated_at: '2026-05-29T00:00:00Z',
      }),
    ).toThrow();
  });

  it('mapBackendLiveQuizQuestion clamps an out-of-range is_correct index (< 4 FALSE arm)', () => {
    // is_correct sits at positional index 4 (the 5th option), so
    // correctKeyIndex >= 0 is TRUE but correctKeyIndex < 4 is FALSE →
    // falls back to default 'A'.
    const d = mapBackendLiveQuiz({
      id: 'lq-oob',
      tenant_id: 't',
      course_id: 'c',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      questions: [
        {
          question_id: 'q-oob',
          prompt: 'P?',
          timer_seconds: 60,
          points: 10,
          options: [
            { label: 'A', is_correct: false },
            { label: 'B', is_correct: false },
            { label: 'C', is_correct: false },
            { label: 'D', is_correct: false },
            { label: 'E', is_correct: true },
          ],
        },
      ],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    expect(d.items[0]!.correctKey).toBe('A');
  });

  it('mapBackendLiveQuizQuestion defaults timer_seconds + points when undefined (?? DEFAULT arms)', () => {
    // Existing "falls back to defaults" test supplies 0, which `??` keeps
    // (0 is non-nullish). Only undefined/null triggers the DEFAULT arm.
    const d = mapBackendLiveQuiz({
      id: 'lq-defaults',
      tenant_id: 't',
      course_id: 'c',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      questions: [
        {
          question_id: 'q-defaults',
          prompt: 'P?',
          timer_seconds: undefined as unknown as number,
          points: undefined as unknown as number,
          options: [
            { label: 'A', is_correct: true },
            { label: 'B', is_correct: false },
            { label: 'C', is_correct: false },
            { label: 'D', is_correct: false },
          ],
        },
      ],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    expect(d.items[0]!.timerSeconds).toBe(DEFAULT_TIMER_SECONDS);
    expect(d.items[0]!.scorePoints).toBe(DEFAULT_SCORE_POINTS);
  });

  it('itemFromAtom defaults correctKey to A when snapshot omits it (?? A arm)', () => {
    const i = itemFromAtom('q-atom2', 'atom-456', {
      prompt: 'No correctKey provided?',
      options: [
        { text: 'One' },
        { text: 'Two' },
        { text: 'Three' },
        { text: 'Four' },
      ],
      // correctKey intentionally omitted → snapshot.correctKey is undefined
    });
    expect(i.correctKey).toBe('A');
    expect(i.atomId).toBe('atom-456');
  });

  it('itemFromAtom synthesises empty text/explainer when snapshot has fewer options', () => {
    // snapshot.options[i]?.text ?? '' and snapshot.options[i]?.explainer ?? ''
    // both take the optional-chain-undefined arm for the missing indices.
    const i = itemFromAtom('q-atom3', '', {
      prompt: 'Short option list?',
      options: [{ text: 'Only one', explainer: 'sole explainer' }],
    });
    expect(i.options).toHaveLength(4);
    expect(i.options[0]!.text).toBe('Only one');
    expect(i.options[0]!.explainer).toBe('sole explainer');
    expect(i.options[1]!.text).toBe('');
    expect(i.options[1]!.explainer).toBe('');
    expect(i.options[3]!.text).toBe('');
    expect(i.atomId).toBe(''); // empty atomId trims to ''
  });

  it('mapBackendLiveQuiz defaults missing quiz-level fields', () => {
    const d = mapBackendLiveQuiz({
      id: 'lq-3',
      tenant_id: 't',
      course_id: 'c',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      questions: [],
      created_at: '2026-05-29T00:00:00Z',
      updated_at: '2026-05-29T00:00:00Z',
    });
    expect(d.quizTimeLimitSeconds).toBe(DEFAULT_QUIZ_TIME_LIMIT_SECONDS);
    expect(d.explainerMode).toBe(DEFAULT_EXPLAINER_MODE);
  });

  it('toPatchPayload emits quiz-level fields + per-option explainer + atom_id', () => {
    const items = [
      baseItem({
        questionId: 'q1',
        atomId: 'atom-99',
        options: [
          { key: 'A', text: ' Newton ', explainer: ' First law. ' },
          { key: 'B', text: 'Einstein', explainer: '' },
          { key: 'C', text: 'Bohr', explainer: '' },
          { key: 'D', text: 'Curie', explainer: '' },
        ],
        correctKey: 'A',
      }),
    ];
    const out = toPatchPayload({
      ...baseDraft(items),
      quizTimeLimitSeconds: 600,
      explainerMode: 'END_OF_SESSION',
    });
    expect(out.quiz_time_limit_seconds).toBe(600);
    expect(out.explainer_mode).toBe('END_OF_SESSION');
    const q = out.questions[0]!;
    expect(q.atom_id).toBe('atom-99');
    // Explainers trimmed on the wire.
    expect(q.options[0]!.explainer).toBe('First law.');
  });
});

describe('quiz-builder.model — L5.2 double points (CHO-1704 WS3)', () => {
  it('blankItem defaults doublePoints off', () => {
    expect(blankItem('q-x').doublePoints).toBe(false);
  });

  it('toPatchPayload round-trips double_points per question', () => {
    const out = toPatchPayload(
      baseDraft([
        baseItem({ questionId: 'q1', doublePoints: true }),
        baseItem({ questionId: 'q2', doublePoints: false }),
      ]),
    );
    expect(out.questions[0]!.double_points).toBe(true);
    expect(out.questions[1]!.double_points).toBe(false);
  });

  it('mapBackendLiveQuiz reads double_points (defaulting false)', () => {
    const d = mapBackendLiveQuiz({
      id: 'lq-1',
      tenant_id: 't',
      course_id: '',
      instructor_gcid: 'g',
      title: 'T',
      state: 'DRAFT',
      questions: [
        {
          question_id: 'q1',
          prompt: 'P?',
          options: [
            { label: 'a', is_correct: true },
            { label: 'b', is_correct: false },
            { label: 'c', is_correct: false },
            { label: 'd', is_correct: false },
          ],
          timer_seconds: 30,
          points: 10,
          double_points: true,
        },
        {
          question_id: 'q2',
          prompt: 'Q?',
          options: [
            { label: 'a', is_correct: true },
            { label: 'b', is_correct: false },
            { label: 'c', is_correct: false },
            { label: 'd', is_correct: false },
          ],
          timer_seconds: 30,
          points: 10,
        },
      ],
      created_at: '2026-06-10T00:00:00Z',
      updated_at: '2026-06-10T00:00:00Z',
    });
    expect(d.items[0]!.doublePoints).toBe(true);
    expect(d.items[1]!.doublePoints).toBe(false);
  });
});
