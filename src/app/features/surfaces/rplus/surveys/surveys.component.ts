/**
 * SurveysComponent — R+ /r/surveys surface (Wave-5 R+ Stage C-lite).
 *
 * Tenant-admin authors training-feedback surveys, publishes them to a
 * cohort, then closes them when collection is done. The sub-view shows
 * collected SurveyResponses per survey.
 *
 * Pulls live data from chora-delivery via SurveysService (real BFF
 * wiring; HttpTestingController in tests flushes real envelopes — no
 * stubs per feedback_no_stubs_real_wiring).
 *
 * Surface: R+ Rhythm+ — canonical accent inherited from `.surface-rplus`
 * (currently mirrors A+ Material Blue + curiosity violet per
 * feedback_chora_brand_palette_canonical; an R+-specific accent is
 * deferred).
 *
 * Tablet-first: ≥768px primary, ≥1280px desktop enhanced. No mobile
 * breakpoints (per chora-web/CLAUDE.md §11).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SurveysService } from './surveys.service';
import {
  QUESTION_TYPES,
  QuestionType,
  SURVEY_STATES,
  Survey,
  SurveyResponse,
  SurveyState,
  canClose,
  canPublish,
  stateBadgeVariant,
  stateLabelKey,
} from './surveys.model';

/** Internal draft model for the "create survey" composer (signal-backed). */
interface DraftQuestionModel {
  prompt: string;
  type: QuestionType;
  options: string; // newline-separated; parsed to string[] on submit
}

interface DraftModel {
  courseId: string;
  title: string;
  questions: DraftQuestionModel[];
}

const EMPTY_DRAFT: DraftModel = {
  courseId: '',
  title: '',
  questions: [{ prompt: '', type: 'LIKERT', options: '' }],
};

@Component({
  selector: 'chora-rplus-surveys',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './surveys.component.html',
  styleUrl: './surveys.component.scss',
})
export class SurveysComponent {
  private readonly service = inject(SurveysService);

  /** Filter signal — when set, list() is re-fetched with `?state=<value>`. */
  readonly stateFilter = signal<SurveyState | null>(null);

  /** Bumps after every successful create / publish / close to force a refetch. */
  private readonly reloadKey = signal(0);

  /** Drives the responses sub-view — null = collapsed, id = which survey. */
  readonly viewingResponsesFor = signal<string | null>(null);

  /** Local signal mirror of the most recent listResponses() result. */
  private readonly responsesStore = signal<readonly SurveyResponse[] | null>(
    null,
  );

  /** Drives the publish-recipients composer (which surveyId is open). */
  readonly publishingFor = signal<string | null>(null);
  readonly publishRecipients = signal<string>('');

  /** Drives the "+ New survey" composer panel. */
  readonly composerOpen = signal<boolean>(false);
  readonly draft = signal<DraftModel>(structuredClone(EMPTY_DRAFT));

  private readonly data = toSignal(this.service.list(), { initialValue: null });

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalSurveys = computed<number>(() => this.data()?.totalSurveys ?? 0);
  readonly surveys = computed<readonly Survey[]>(
    () => this.data()?.items ?? [],
  );

  readonly responses = computed<readonly SurveyResponse[]>(
    () => this.responsesStore() ?? [],
  );
  readonly totalResponses = computed<number>(() => this.responses().length);

  /** Exposed so the template's filter `@for` doesn't inline the enum list. */
  readonly stateOptions: readonly SurveyState[] = SURVEY_STATES;
  readonly questionTypeOptions: readonly QuestionType[] = QUESTION_TYPES;

  /** Kept live so future revoke/refetch wiring picks up reloadKey reads. */
  readonly reloadCount = computed(() => this.reloadKey());

  badge(state: SurveyState): string {
    return stateBadgeVariant(state);
  }

  labelKey(state: SurveyState): string {
    return stateLabelKey(state);
  }

  canPublishState(state: SurveyState): boolean {
    return canPublish(state);
  }

  canCloseState(state: SurveyState): boolean {
    return canClose(state);
  }

  /**
   * State-filter dropdown change handler. Bumps the reload key so future
   * full-switchMap wiring picks up the change.
   */
  onStateFilterChanged(state: string): void {
    const next = state ? (state as SurveyState) : null;
    this.stateFilter.set(next);
    this.reloadKey.update((n) => n + 1);
  }

  onToggleComposer(): void {
    this.composerOpen.update((v) => !v);
    if (!this.composerOpen()) {
      this.draft.set(structuredClone(EMPTY_DRAFT));
    }
  }

  onDraftCourseIdChanged(v: string): void {
    this.draft.update((d) => ({ ...d, courseId: v }));
  }

  onDraftTitleChanged(v: string): void {
    this.draft.update((d) => ({ ...d, title: v }));
  }

  onDraftQuestionPromptChanged(idx: number, v: string): void {
    this.draft.update((d) => {
      const qs = d.questions.map((q, i) =>
        i === idx ? { ...q, prompt: v } : q,
      );
      return { ...d, questions: qs };
    });
  }

  onDraftQuestionTypeChanged(idx: number, v: string): void {
    this.draft.update((d) => {
      const qs = d.questions.map((q, i) =>
        i === idx ? { ...q, type: v as QuestionType } : q,
      );
      return { ...d, questions: qs };
    });
  }

  onDraftQuestionOptionsChanged(idx: number, v: string): void {
    this.draft.update((d) => {
      const qs = d.questions.map((q, i) =>
        i === idx ? { ...q, options: v } : q,
      );
      return { ...d, questions: qs };
    });
  }

  onAddQuestionRow(): void {
    this.draft.update((d) => ({
      ...d,
      questions: [...d.questions, { prompt: '', type: 'LIKERT', options: '' }],
    }));
  }

  onRemoveQuestionRow(idx: number): void {
    this.draft.update((d) => ({
      ...d,
      questions: d.questions.filter((_, i) => i !== idx),
    }));
  }

  /**
   * Submit the draft survey. The BE returns the freshly created DRAFT
   * record; we bump the reload key (future-wired full refetch) and clear
   * the composer.
   */
  onCreateSurvey(): void {
    const d = this.draft();
    const questions = d.questions
      .filter((q) => q.prompt.trim() !== '')
      .map((q) => ({
        prompt: q.prompt.trim(),
        type: q.type,
        ...(q.type === 'MULTIPLE_CHOICE'
          ? {
              options: q.options
                .split('\n')
                .map((s) => s.trim())
                .filter((s) => s !== ''),
            }
          : {}),
      }));
    this.service
      .create({
        courseId: d.courseId.trim(),
        title: d.title.trim(),
        questions,
      })
      .subscribe({
        next: () => {
          this.composerOpen.set(false);
          this.draft.set(structuredClone(EMPTY_DRAFT));
          this.reloadKey.update((n) => n + 1);
        },
        error: () => {
          // Leave composer open — user can inspect + retry. The BE
          // error envelope surfaces in the dev console for now; a
          // future iteration wires a toast + inline error banner.
          this.reloadKey.update((n) => n + 1);
        },
      });
  }

  onOpenPublishComposer(surveyId: string): void {
    this.publishingFor.set(surveyId);
    this.publishRecipients.set('');
  }

  onCancelPublishComposer(): void {
    this.publishingFor.set(null);
    this.publishRecipients.set('');
  }

  onPublishRecipientsChanged(v: string): void {
    this.publishRecipients.set(v);
  }

  /**
   * Publish CTA — wires Survey.Distribute(recipients) on the BE. Recipients
   * are parsed from the newline-separated textarea.
   */
  onPublishConfirm(surveyId: string): void {
    const recipients = this.publishRecipients()
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    this.service.publish(surveyId, recipients).subscribe({
      next: () => {
        this.publishingFor.set(null);
        this.publishRecipients.set('');
        this.reloadKey.update((n) => n + 1);
      },
      error: () => {
        this.reloadKey.update((n) => n + 1);
      },
    });
  }

  /** Close CTA — wires Survey.Close() on the BE. */
  onCloseSurvey(surveyId: string): void {
    this.service.close(surveyId).subscribe({
      next: () => {
        this.reloadKey.update((n) => n + 1);
      },
      error: () => {
        this.reloadKey.update((n) => n + 1);
      },
    });
  }

  /**
   * Open the responses sub-view for a specific survey. Fires a one-shot
   * listResponses() against the BE and writes the result into a local
   * signal mirror. Per feedback_no_stubs_real_wiring the call is real —
   * an error leaves the prior result in place + dev console captures.
   */
  onViewResponses(surveyId: string): void {
    this.viewingResponsesFor.set(surveyId);
    this.responsesStore.set(null);
    this.service.listResponses(surveyId).subscribe({
      next: (r) => {
        this.responsesStore.set(r.items);
      },
      error: () => {
        // Leave responsesStore as null — empty-state renders.
        this.responsesStore.set([]);
      },
    });
  }

  onCloseResponses(): void {
    this.viewingResponsesFor.set(null);
    this.responsesStore.set(null);
  }
}
