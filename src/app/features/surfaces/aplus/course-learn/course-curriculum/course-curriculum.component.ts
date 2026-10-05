/**
 * CourseCurriculumComponent — A+ heterogeneous curriculum panel.
 * CHO-1612.
 *
 * Renders the ordered list of heterogeneous content items fetched from
 *   GET /api/v1/me/courses/{courseId}/content
 *
 * Each item kind gets an appropriate affordance:
 *   atom           → [routerLink] to /a/atoms/{ref}/play
 *   video          → <a> external link (opens in new tab)
 *   youtube        → <a> external link (opens in new tab)
 *   document       → <a> external link / download (opens in new tab)
 *   live_classroom → non-link "live session" indicator (ref is a LiveQuiz id)
 *   assessment     → [routerLink] to /a/me/assessments/{ref}
 *
 * Load states:
 *   loading  → spinner
 *   ready    → item list
 *   empty    → empty-state message
 *   error    → fail-loud banner with retry
 *
 * This component is intentionally a leaf — it owns its own data fetch.
 * The parent CourseLearnComponent continues to own the LearningPath
 * polling state machine for the atoms-only Straight-Up flow; this
 * component supplements it with the full heterogeneous curriculum.
 *
 * Per [[feedback-no-stubs-real-wiring]] + CLAUDE.md §3 (BFF-only).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { CourseContentService } from '../../../../shared/course-content/course-content.service';
import {
  contentKindIcon,
  isUrlRef,
} from '../../../../shared/course-content/course-content.model';
import type {
  ContentKind,
  CourseContentItem,
  LearnerModuleProgress,
} from '../../../../shared/course-content/course-content.model';

/**
 * Fixed display order for the grouped curriculum (CHO-2321), mirroring the R+
 * admin Course-content view (CHO-2317): assessments and media first, atoms last.
 */
const CONTENT_KIND_ORDER: readonly ContentKind[] = [
  'assessment',
  'video',
  'youtube',
  'document',
  'live_classroom',
  'atom',
];

type CurriculumLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: readonly CourseContentItem[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

@Component({
  selector: 'chora-aplus-course-curriculum',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './course-curriculum.component.html',
  styleUrl: './course-curriculum.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseCurriculumComponent implements OnInit {
  private readonly contentService = inject(CourseContentService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param forwarded from CourseLearnComponent. */
  readonly courseId = input.required<string>();

  private readonly _state = signal<CurriculumLoadState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isReady = computed(() => this._state().status === 'ready');
  readonly isEmpty = computed(() => this._state().status === 'empty');
  readonly isError = computed(() => this._state().status === 'error');

  readonly items = computed<readonly CourseContentItem[]>(() => {
    const s = this._state();
    return s.status === 'ready' ? s.items : [];
  });

  /**
   * Curriculum items bucketed into ordered, non-empty groups by kind (CHO-2321),
   * mirroring the R+ admin Course-content view. Empty in any non-ready state.
   */
  readonly contentGroups = computed(() => {
    const its = this.items();
    return CONTENT_KIND_ORDER.map((kind) => ({
      kind,
      labelKey: `aplus.course_curriculum.group_${kind}`,
      items: its
        .filter((i) => i.kind === kind)
        .slice()
        .sort((a, b) => a.position - b.position),
    })).filter((group) => group.items.length > 0);
  });

  readonly errorMessage = computed<string>(() => {
    const s = this._state();
    return s.status === 'error' ? s.message : '';
  });

  // ── W7 module progress (CHO-2074) — the learner's own per-module completion ──
  private readonly _moduleProgress = signal<readonly LearnerModuleProgress[]>([]);
  /** Per-module completion rows (empty when the course has no module structure). */
  readonly moduleProgress = this._moduleProgress.asReadonly();
  readonly hasModules = computed(() => this._moduleProgress().length > 0);
  readonly modulesTotal = computed(() => this._moduleProgress().length);
  readonly modulesComplete = computed(
    () => this._moduleProgress().filter((m) => m.is_complete).length,
  );

  /** A module's completion fraction (0–1) for its progress bar width. */
  modulePercent(m: LearnerModuleProgress): number {
    return m.total > 0 ? Math.round((m.completed_count / m.total) * 100) : 0;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this._state.set({ status: 'loading' });
    this.contentService
      .getMyCourseContent(this.courseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.items.length === 0) {
            this._state.set({ status: 'empty' });
          } else {
            this._state.set({ status: 'ready', items: res.items });
          }
        },
        error: () => {
          this._state.set({
            status: 'error',
            message: 'aplus.course_curriculum.error_load',
          });
        },
      });
    // Module completion (CHO-2074), lazy + resilient: a failed read simply hides
    // the module summary (never blocks the curriculum list).
    this.contentService
      .getMyModuleProgress(this.courseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this._moduleProgress.set(res.modules),
        error: () => this._moduleProgress.set([]),
      });
  }

  /**
   * Returns the routerLink commands array for an atom item.
   * Routes to /a/atoms/{ref}/play (AtomAttempt player).
   */
  atomPlayLink(item: CourseContentItem): readonly string[] {
    return ['/a/atoms', item.ref, 'play'];
  }

  /**
   * Returns the routerLink commands array for an assessment item.
   * Routes to /a/me/assessments/{ref}.
   */
  assessmentLink(item: CourseContentItem): readonly string[] {
    return ['/a/me/assessments', item.ref];
  }

  /**
   * Returns true when the item's ref is a URL (video/youtube/document) and the
   * item renders as an <a href> rather than a routerLink. live_classroom is NOT
   * external: its ref is a LiveQuiz TEMPLATE id (UUIDv7), rendered as a non-link
   * instructor-led indicator — there is no learner route to launch a live
   * session from a template id (CHO-2134 follow-up).
   */
  isExternalLink(item: CourseContentItem): boolean {
    return isUrlRef(item.kind);
  }

  /** Returns the FA icon name for the item kind. */
  icon(item: CourseContentItem): string {
    return contentKindIcon(item.kind);
  }

  /** Translation key for the item kind label chip. */
  kindLabelKey(item: CourseContentItem): string {
    return `aplus.course_curriculum.kind_${item.kind}`;
  }

  /** Translation key for the item action CTA. */
  actionLabelKey(item: CourseContentItem): string {
    switch (item.kind) {
      case 'atom':
        return 'aplus.course_curriculum.action_atom';
      case 'video':
        return 'aplus.course_curriculum.action_video';
      case 'youtube':
        return 'aplus.course_curriculum.action_youtube';
      case 'document':
        return 'aplus.course_curriculum.action_document';
      case 'live_classroom':
        return 'aplus.course_curriculum.action_live_classroom';
      case 'assessment':
        return 'aplus.course_curriculum.action_assessment';
    }
  }
}
