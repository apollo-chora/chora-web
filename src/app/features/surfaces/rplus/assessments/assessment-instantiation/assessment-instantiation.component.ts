/**
 * AssessmentInstantiationComponent — R+ /r/assessments/new (Phase X.4).
 *
 * Instructor-facing R+ surface for instantiating a published Test-Set as
 * a live Assessment per ADR-155 D9 (explicit-cohort mode). Composes:
 *   - The test-set picker (loaded via AssessmentInstantiationService)
 *   - The title input (≤200 chars, required)
 *   - A `<chora-rplus-member-picker>` chip input bound to invited_gcids
 *   - An "Add me as test learner" canned shortcut (AuthService.gcid())
 *   - An auto-release toggle + optional date pickers
 *   - The submit CTA → POST /api/v1/assessments → router.navigate(...)
 *
 * Fail-loud per `feedback_no_stubs_real_wiring`. No mock fallback. 4xx
 * surfaces inline field errors; 5xx surfaces a role=alert banner with a
 * retry CTA wired to `service.resetCreate()`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AssessmentInstantiationService } from './assessment-instantiation.service';
import { MemberPickerComponent } from './member-picker/member-picker.component';
import {
  buildCreateAssessmentRequest,
  isFormValid,
  isTitleValid,
  type TenantMemberSummary,
  type TestSetPickerRow,
} from './assessment-instantiation.model';

@Component({
  selector: 'chora-rplus-assessment-instantiation',
  standalone: true,
  imports: [FormsModule, TranslatePipe, MemberPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assessment-instantiation.component.html',
  styleUrl: './assessment-instantiation.component.scss',
})
export class AssessmentInstantiationComponent {
  private readonly instantiationService = inject(AssessmentInstantiationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // ── Test-set picker state (driven by the service) ──────────────────
  readonly testSetsState = this.instantiationService.testSetsState;
  readonly isTestSetsLoading = computed<boolean>(
    () => this.testSetsState().status === 'loading',
  );
  readonly isTestSetsError = computed<boolean>(
    () => this.testSetsState().status === 'error',
  );
  readonly testSetsErrorKey = computed<string>(() => {
    const s = this.testSetsState();
    return s.status === 'error' ? s.error : '';
  });
  readonly testSets = computed<readonly TestSetPickerRow[]>(() => {
    const s = this.testSetsState();
    return s.status === 'success' ? s.items : [];
  });

  // ── Form fields (component-local writable signals) ─────────────────
  readonly selectedTestSetId = signal<string | null>(null);
  readonly title = signal('');
  readonly autoRelease = signal(false);
  /** Anti-cheat per-learner MCQ option scramble — OFF by default. */
  readonly shuffleMcqOptions = signal(false);
  readonly startAt = signal<string | null>(null);
  readonly endAt = signal<string | null>(null);

  /** Canonical chip set — parent-owned, mirrors invited_gcids. */
  readonly invitedMembers = signal<readonly TenantMemberSummary[]>([]);

  /** Inline "couldn't fetch your GCID" flag for the Add-Me CTA. */
  readonly addMeError = signal(false);

  // ── Submit (create) state (service-driven) ─────────────────────────
  readonly createState = this.instantiationService.createState;
  readonly isSubmitting = computed<boolean>(
    () => this.createState().status === 'submitting',
  );
  readonly isSubmitError = computed<boolean>(
    () => this.createState().status === 'error',
  );
  readonly submitErrorKey = computed<string>(() => {
    const s = this.createState();
    return s.status === 'error' ? s.errorKey : '';
  });
  readonly fieldErrors = computed<Record<string, string>>(() => {
    const s = this.createState();
    if (s.status === 'error' && s.fieldErrors) {
      return { ...s.fieldErrors };
    }
    return {};
  });
  readonly fieldErrorTitle = computed<string>(
    () => this.fieldErrors()['title'] ?? '',
  );
  readonly fieldErrorTestSet = computed<string>(
    () => this.fieldErrors()['test_set_id'] ?? '',
  );
  readonly fieldErrorCohort = computed<string>(
    () => this.fieldErrors()['invited_gcids'] ?? '',
  );

  /** Validity gate for the submit CTA. */
  readonly canSubmit = computed<boolean>(() => {
    if (this.isSubmitting()) return false;
    return isFormValid({
      testSetId: this.selectedTestSetId(),
      title: this.title(),
      invitedGcids: this.invitedMembers().map((m) => m.gcid),
    });
  });

  /** Title validation flag for the inline help text. */
  readonly isTitleInvalid = computed<boolean>(
    () => this.title().length > 0 && !isTitleValid(this.title()),
  );

  constructor() {
    this.instantiationService.loadPublishedTestSets();
    // Navigate-on-success — effect runs when createState flips to success.
    effect(() => {
      const s = this.createState();
      if (s.status === 'success') {
        void this.router.navigate([
          '/r',
          'assessments',
          s.assessment.assessment_id,
          'monitor',
        ]);
      }
    });
  }

  // ── Form-input handlers (parsed from native events for testability) ──

  onTestSetChange(value: string): void {
    this.selectedTestSetId.set(value && value.length > 0 ? value : null);
  }

  onTitleInput(value: string): void {
    this.title.set(value);
  }

  onAutoReleaseChange(value: boolean): void {
    this.autoRelease.set(value);
  }

  onShuffleMcqOptionsChange(value: boolean): void {
    this.shuffleMcqOptions.set(value);
  }

  onStartChange(value: string): void {
    this.startAt.set(value && value.length > 0 ? value : null);
  }

  onEndChange(value: string): void {
    this.endAt.set(value && value.length > 0 ? value : null);
  }

  // ── Member picker integration ─────────────────────────────────────

  /** Add a member chip — dedupes on GCID. */
  onMemberSelected(member: TenantMemberSummary): void {
    const current = this.invitedMembers();
    if (current.some((m) => m.gcid === member.gcid)) return;
    this.invitedMembers.set([...current, member]);
  }

  /** Remove a chip by GCID. */
  onMemberRemoved(gcid: string): void {
    this.invitedMembers.set(
      this.invitedMembers().filter((m) => m.gcid !== gcid),
    );
  }

  /**
   * "Add me" — read AuthService.gcid() and synthesise a self-chip.
   *
   * Reads the caller user from the auth service. If `gcid()` is null
   * (auth state miss), surface the inline error message + skip. Dedupes
   * via the `onMemberSelected` path.
   */
  addMeAsLearner(): void {
    const myGcid = this.authService.gcid();
    if (!myGcid) {
      this.addMeError.set(true);
      return;
    }
    this.addMeError.set(false);
    const me: TenantMemberSummary = {
      gcid: myGcid,
      email: null,
      display_name: null,
      avatar_url: null,
      roles: ['INSTRUCTOR'],
      last_active_at: null,
    };
    this.onMemberSelected(me);
  }

  // ── Submit ────────────────────────────────────────────────────────

  submit(): void {
    if (!this.canSubmit()) return;
    const testSetId = this.selectedTestSetId();
    if (!testSetId) return;
    const body = buildCreateAssessmentRequest({
      testSetId,
      title: this.title(),
      invitedGcids: this.invitedMembers().map((m) => m.gcid),
      autoRelease: this.autoRelease(),
      startAt: this.startAt(),
      endAt: this.endAt(),
      shuffleMcqOptions: this.shuffleMcqOptions(),
    });
    this.instantiationService.createAssessment(body);
  }

  retry(): void {
    this.instantiationService.resetCreate();
  }

  trackByTestSetId(_index: number, item: TestSetPickerRow): string {
    return item.test_set_id;
  }
}
