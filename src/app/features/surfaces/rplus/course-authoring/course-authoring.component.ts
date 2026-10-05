/**
 * CourseAuthoringComponent — A+ Phyllis-instructor Course shell.
 *
 * Dual-mode per route:
 *   - `/a/courses/new`           — Author a new DRAFT, single-step submit
 *                                  (create → publish → AWAITING_REVIEW).
 *   - `/a/courses/:courseId/edit` — Edit an existing DRAFT (typically
 *                                  one that was rejected back from
 *                                  AWAITING_REVIEW with review_notes).
 *                                  Two actions: "Save draft" (PATCH only)
 *                                  + "Save + resubmit for review"
 *                                  (PATCH + publish).
 *
 * Flow per `chora-contracts/openapi/delivery-courses.yaml`:
 *   - new mode: createCourse() → publishCourse() → /a/dashboard banner.
 *   - edit mode: updateCourse() ± publishCourse() →
 *                /a/dashboard banner.
 *
 * Per `feedback_no_stubs_real_wiring` — no fixtures. Per BFF-only +
 * standalone + signals (chora-web CLAUDE.md §3).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TestSetService } from '../../aplus/test-set-editor/test-set.service';
import type { TestSet } from '../../aplus/test-set-editor/test-set-editor.model';
import { CourseService } from './course.service';
import {
  CERT_TYPES,
  type CertType,
  type Course,
  type CourseActionState,
  type CourseCertification,
  type CreateCourseRequest,
  type UpdateCourseRequest,
} from './course-authoring.model';

@Component({
  selector: 'chora-aplus-course-authoring',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-authoring.component.html',
  styleUrl: './course-authoring.component.scss',
})
export class CourseAuthoringComponent implements OnInit {
  private readonly service = inject(CourseService);
  private readonly testSetService = inject(TestSetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // ── Mode ────────────────────────────────────────────────────────────
  /** `null` when authoring fresh (`/a/courses/new`); set to the courseId
   *  when editing an existing DRAFT (`/a/courses/:courseId/edit`). */
  readonly courseId = signal<string | null>(null);
  readonly isEditMode = computed(() => this.courseId() !== null);

  /** Existing-course review_notes shown on edit mode when the BE rejected
   *  the prior AWAITING_REVIEW submission with notes for the instructor. */
  readonly reviewNotes = signal<string | null>(null);

  /** Edit-mode load state (separate from the submit action signal). */
  readonly editLoad = signal<'idle' | 'loading' | 'error'>('idle');
  readonly editLoadError = signal<string>('');

  // ── Form state ──────────────────────────────────────────────────────
  readonly title = signal('');
  readonly description = signal('');
  readonly objectives = signal<string[]>(['']);
  readonly prerequisites = signal<string[]>([]);
  readonly selectedTestSetIds = signal<readonly string[]>([]);

  // ── Certification definition (CHO-1795) ─────────────────────────────
  readonly certTypes = CERT_TYPES;
  readonly certEnabled = signal(false);
  readonly certType = signal<CertType | ''>('');
  readonly certPassingScore = signal<number>(70);
  readonly certRequireAllContent = signal(true);

  // ── Test-set picker state ───────────────────────────────────────────
  readonly publishedTestSets = signal<readonly TestSet[]>([]);
  readonly testSetsLoading = signal(true);
  readonly testSetsError = signal<string | null>(null);

  // ── Submit action ───────────────────────────────────────────────────
  readonly action = signal<CourseActionState>({ status: 'idle' });
  readonly actionError = computed(() => {
    const a = this.action();
    return a.status === 'error' ? a.error : '';
  });

  // ── Validation ──────────────────────────────────────────────────────
  readonly canSubmit = computed(() => {
    const titleOk = this.title().trim().length > 0;
    const objectivesOk = this.objectives().filter((o) => o.trim().length > 0).length > 0;
    const testSetsOk = this.selectedTestSetIds().length > 0;
    const submitting = this.action().status === 'submitting';
    return titleOk && objectivesOk && testSetsOk && !submitting;
  });

  ngOnInit(): void {
    this.loadPublishedTestSets();
    const id = this.route.snapshot.paramMap.get('courseId');
    if (id) {
      this.courseId.set(id);
      this.loadCourse(id);
    }
  }

  private loadCourse(id: string): void {
    this.editLoad.set('loading');
    this.service
      .getCourse(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (course) => this.prefillFromCourse(course),
        error: (err: unknown) => {
          this.editLoad.set('error');
          this.editLoadError.set(this.errorKey(err, 'submit'));
        },
      });
  }

  private prefillFromCourse(course: Course): void {
    this.title.set(course.title);
    this.description.set(course.description ?? '');
    const objs = course.learning_objectives && course.learning_objectives.length > 0
      ? [...course.learning_objectives]
      : [''];
    this.objectives.set(objs);
    this.prerequisites.set(
      course.prerequisites ? [...course.prerequisites] : [],
    );
    this.selectedTestSetIds.set([...course.test_set_ids]);
    const cert = course.certification;
    this.certEnabled.set(cert?.enabled ?? false);
    this.certType.set(cert?.cert_type ?? '');
    this.certPassingScore.set(cert?.passing_score_pct ?? 70);
    this.certRequireAllContent.set(cert?.require_all_content ?? true);
    this.reviewNotes.set(course.review_notes ?? null);
    this.editLoad.set('idle');
  }

  // ── Certification form handlers ─────────────────────────────────────
  toggleCertEnabled(enabled: boolean): void {
    this.certEnabled.set(enabled);
  }

  setCertType(value: string): void {
    this.certType.set((value as CertType) || '');
  }

  setCertPassingScore(value: string): void {
    const n = Number(value);
    this.certPassingScore.set(Number.isFinite(n) ? n : 0);
  }

  setCertRequireAllContent(value: boolean): void {
    this.certRequireAllContent.set(value);
  }

  /** Build the certification block from the form (undefined ⇒ omit). */
  private buildCertification(): CourseCertification {
    if (!this.certEnabled()) {
      return { enabled: false };
    }
    const t = this.certType();
    return {
      enabled: true,
      passing_score_pct: this.certPassingScore(),
      require_all_content: this.certRequireAllContent(),
      ...(t ? { cert_type: t } : {}),
    };
  }

  // ── Test-set picker ─────────────────────────────────────────────────
  private loadPublishedTestSets(): void {
    this.testSetsLoading.set(true);
    this.testSetsError.set(null);
    this.testSetService
      .listTestSets({ state: ['PUBLISHED'], page_size: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.publishedTestSets.set(res.items);
          this.testSetsLoading.set(false);
        },
        error: (err: unknown) => {
          this.testSetsError.set(this.errorKey(err, 'test_sets'));
          this.testSetsLoading.set(false);
        },
      });
  }

  retryTestSets(): void {
    this.loadPublishedTestSets();
  }

  toggleTestSet(testSetId: string): void {
    const current = this.selectedTestSetIds();
    if (current.includes(testSetId)) {
      this.selectedTestSetIds.set(current.filter((id) => id !== testSetId));
    } else {
      this.selectedTestSetIds.set([...current, testSetId]);
    }
  }

  isTestSetSelected(testSetId: string): boolean {
    return this.selectedTestSetIds().includes(testSetId);
  }

  // ── Objectives + prerequisites row mgmt ─────────────────────────────
  addObjective(): void {
    this.objectives.set([...this.objectives(), '']);
  }

  removeObjective(index: number): void {
    const next = this.objectives().filter((_, i) => i !== index);
    this.objectives.set(next.length > 0 ? next : ['']);
  }

  updateObjective(index: number, value: string): void {
    const next = [...this.objectives()];
    next[index] = value;
    this.objectives.set(next);
  }

  addPrerequisite(): void {
    this.prerequisites.set([...this.prerequisites(), '']);
  }

  removePrerequisite(index: number): void {
    this.prerequisites.set(this.prerequisites().filter((_, i) => i !== index));
  }

  updatePrerequisite(index: number, value: string): void {
    const next = [...this.prerequisites()];
    next[index] = value;
    this.prerequisites.set(next);
  }

  // ── Build a CreateCourseRequest from current form state ─────────────
  private buildCreateRequest(): CreateCourseRequest {
    return {
      title: this.title().trim(),
      description: this.description().trim() || undefined,
      learning_objectives: this.objectives()
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
      prerequisites: this.prerequisites()
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      test_set_ids: this.selectedTestSetIds(),
      certification: this.buildCertification(),
    };
  }

  /** Update payload omits any field that wasn't changed by the editor.
   *  For demo simplicity we just send all current values — BE PATCH
   *  accepts partial bodies and we want the canonical state to match
   *  the form. */
  private buildUpdateRequest(): UpdateCourseRequest {
    return {
      title: this.title().trim(),
      description: this.description().trim() || undefined,
      learning_objectives: this.objectives()
        .map((o) => o.trim())
        .filter((o) => o.length > 0),
      prerequisites: this.prerequisites()
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      test_set_ids: this.selectedTestSetIds(),
      certification: this.buildCertification(),
    };
  }

  // ── Submit ──────────────────────────────────────────────────────────
  /** Primary submit. In new mode: create + publish. In edit mode:
   *  PATCH + publish. */
  submitForReview(): void {
    if (!this.canSubmit()) return;
    const id = this.courseId();
    this.action.set({ status: 'submitting' });
    const create$ = id
      ? this.service.updateCourse(id, this.buildUpdateRequest())
      : this.service.createCourse(this.buildCreateRequest());
    create$
      .pipe(
        switchMap((course) => this.service.publishCourse(course.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.action.set({ status: 'success' });
          const banner = id ? 'course_resubmitted' : 'course_submitted';
          this.router.navigate(['/a/dashboard'], {
            queryParams: { [banner]: '1' },
          });
        },
        error: (err: unknown) => {
          this.action.set({
            status: 'error',
            error: this.errorKey(err, 'submit'),
          });
        },
      });
  }

  /** Edit-mode only: PATCH the DRAFT without publishing. */
  saveDraft(): void {
    const id = this.courseId();
    if (!id || !this.canSubmit()) return;
    this.action.set({ status: 'submitting' });
    this.service
      .updateCourse(id, this.buildUpdateRequest())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.action.set({ status: 'success' });
          this.router.navigate(['/a/dashboard'], {
            queryParams: { course_saved: '1' },
          });
        },
        error: (err: unknown) => {
          this.action.set({
            status: 'error',
            error: this.errorKey(err, 'submit'),
          });
        },
      });
  }

  // ── Error key normaliser ────────────────────────────────────────────
  private errorKey(err: unknown, scope: 'test_sets' | 'submit'): string {
    const e = err as { status?: number };
    const base = `aplus.course_authoring.error_${scope}`;
    if (typeof e?.status === 'number') {
      if (e.status === 401 || e.status === 403) {
        return 'aplus.course_authoring.error_unauthorised';
      }
      if (e.status === 409) {
        return `${base}_conflict`;
      }
      if (e.status >= 500) return `${base}_upstream`;
    }
    return `${base}_generic`;
  }
}
