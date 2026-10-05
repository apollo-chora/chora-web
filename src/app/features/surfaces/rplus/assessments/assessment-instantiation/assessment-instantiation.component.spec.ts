import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AssessmentInstantiationComponent } from './assessment-instantiation.component';
import { AssessmentInstantiationService } from './assessment-instantiation.service';
import { TenantMembersService } from './tenant-members.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import type {
  CreateAssessmentRequest,
  CreateAssessmentState,
  CreatedAssessment,
  MemberSearchState,
  TenantMemberSummary,
  TestSetListLoadState,
  TestSetPickerRow,
} from './assessment-instantiation.model';

/**
 * AssessmentInstantiationComponent spec — R+ /r/assessments/new.
 *
 * Covers:
 *   - Form sections render (test-set / title / cohort / dates / submit)
 *   - Test-set picker loads via service.loadPublishedTestSets() on init
 *   - "Add me" button reads AuthService.gcid() once + dedupes
 *   - Submit invalid → no service.createAssessment call (gate on validity)
 *   - Submit valid → service.createAssessment with canonical body
 *   - On success → router.navigate to /r/assessments/:id/monitor
 *   - 4xx → inline field errors + banner
 *   - 5xx → error banner with retry CTA
 */

const TEST_SET_A: TestSetPickerRow = {
  test_set_id: '01985e7f-1234-7abc-8def-000000000a01',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  author_gcid: '00000000-0000-7000-8000-000000001999',
  title: 'Agile Estimation Test Set',
  description: null,
  learner_facing_name: null,
  state: 'PUBLISHED',
  total_points: 100,
  question_count: 10,
  revision_number: 1,
  created_at: '2026-05-10T10:00:00Z',
  updated_at: '2026-05-12T10:00:00Z',
  published_at: '2026-05-12T10:00:00Z',
};

const TEST_SET_B: TestSetPickerRow = {
  ...TEST_SET_A,
  test_set_id: '01985e7f-1234-7abc-8def-000000000a02',
  title: 'Velocity Test Set',
  question_count: 5,
};

const MEMBER_A: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002001',
  email: 'alice@mtm.test',
  display_name: 'Alice Tan',
  avatar_url: null,
  roles: ['LEARNER'],
  last_active_at: '2026-05-16T09:30:00Z',
};

const MEMBER_INSTRUCTOR_SELF: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000001999',
  email: 'phyllis@mtm.test',
  display_name: 'Phyllis (instructor)',
  avatar_url: null,
  roles: ['INSTRUCTOR'],
  last_active_at: '2026-05-16T12:00:00Z',
};

const CREATED: CreatedAssessment = {
  assessment_id: '019e2b24-759f-76b8-bad8-000000000a01',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  instructor_gcid: '00000000-0000-7000-8000-000000001999',
  test_set_id: TEST_SET_A.test_set_id,
  title: 'Cohort May 2026',
  invited_gcids: [MEMBER_A.gcid],
  state: 'DRAFT',
  created_at: '2026-05-16T10:00:00Z',
};

class StubInstantiationService {
  readonly _testSetsState: WritableSignal<TestSetListLoadState> = signal({
    status: 'idle',
  });
  readonly testSetsState = this._testSetsState.asReadonly();
  readonly _createState: WritableSignal<CreateAssessmentState> = signal({
    status: 'idle',
  });
  readonly createState = this._createState.asReadonly();

  loadCalls = 0;
  createCalls: CreateAssessmentRequest[] = [];
  resetCreateCalls = 0;
  loadPublishedTestSets(): void {
    this.loadCalls++;
  }
  createAssessment(req: CreateAssessmentRequest): void {
    this.createCalls.push(req);
  }
  resetCreate(): void {
    this.resetCreateCalls++;
  }
}

class StubTenantMembersService {
  readonly _searchState: WritableSignal<MemberSearchState> = signal({
    status: 'idle',
  });
  readonly searchState = this._searchState.asReadonly();
  search(): void { /* stub */ }
  clear(): void { /* stub */ }
}

class StubAuthService {
  private readonly _gcid = signal<string | null>(
    MEMBER_INSTRUCTOR_SELF.gcid,
  );
  readonly gcid = computed<string | null>(() => this._gcid());
  setGcid(value: string | null): void {
    this._gcid.set(value);
  }
}

function setup(): {
  fixture: ComponentFixture<AssessmentInstantiationComponent>;
  element: HTMLElement;
  service: StubInstantiationService;
  membersService: StubTenantMembersService;
  authService: StubAuthService;
  router: Router;
  navigateSpy: ReturnType<typeof vi.fn>;
} {
  const service = new StubInstantiationService();
  const membersService = new StubTenantMembersService();
  const authService = new StubAuthService();
  TestBed.configureTestingModule({
    imports: [AssessmentInstantiationComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AssessmentInstantiationService, useValue: service },
      { provide: TenantMembersService, useValue: membersService },
      { provide: AuthService, useValue: authService },
    ],
  });
  const router = TestBed.inject(Router);
  const navigateSpy = vi.fn().mockResolvedValue(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (router as any).navigate = navigateSpy;
  const fixture = TestBed.createComponent(AssessmentInstantiationComponent);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    service,
    membersService,
    authService,
    router,
    navigateSpy,
  };
}

describe('AssessmentInstantiationComponent (R+ /r/assessments/new)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init', () => {
    it('creates', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the surface-rplus accent root + heading', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="rplus-assessment-instantiation"]',
      );
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-rplus');
    });

    it('calls service.loadPublishedTestSets() on init', () => {
      const { service } = setup();
      expect(service.loadCalls).toBe(1);
    });
  });

  describe('test-set picker', () => {
    it('renders the loading state while testSetsState is loading', () => {
      const { service, fixture, element } = setup();
      service._testSetsState.set({ status: 'loading' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="test-set-picker-loading"]'),
      ).toBeTruthy();
    });

    it('renders an option per published test-set on success', () => {
      const { service, fixture, element } = setup();
      service._testSetsState.set({
        status: 'success',
        items: [TEST_SET_A, TEST_SET_B],
      });
      fixture.detectChanges();
      const select = element.querySelector(
        '[data-testid="test-set-picker-select"]',
      ) as HTMLSelectElement;
      // 2 published rows + 1 placeholder = 3 options
      expect(select.options.length).toBe(3);
      expect(select.options[1].value).toBe(TEST_SET_A.test_set_id);
    });

    it('renders role=alert error banner when testSetsState is error', () => {
      const { service, fixture, element } = setup();
      service._testSetsState.set({
        status: 'error',
        error: 'rplus.assessment_instantiation.test_set_picker_error',
      });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="test-set-picker-error"]',
      );
      expect(err).toBeTruthy();
      expect(err?.getAttribute('role')).toBe('alert');
    });
  });

  describe('title input', () => {
    it('renders a text input for the title', () => {
      const { element } = setup();
      const input = element.querySelector(
        '[data-testid="instantiation-title"]',
      ) as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.tagName.toLowerCase()).toBe('input');
    });
  });

  describe('"Add me" shortcut', () => {
    it('reads AuthService.gcid() once + adds chip on first click', () => {
      const { service, fixture, element } = setup();
      service._testSetsState.set({
        status: 'success',
        items: [TEST_SET_A],
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="instantiation-add-me"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      const chips = element.querySelectorAll(
        '[data-testid="member-picker-chip"]',
      );
      expect(chips.length).toBe(1);
      expect(chips[0].getAttribute('data-gcid')).toBe(
        MEMBER_INSTRUCTOR_SELF.gcid,
      );
    });

    it('add-me clicking twice does NOT add a duplicate chip', () => {
      const { fixture, element } = setup();
      const btn = element.querySelector(
        '[data-testid="instantiation-add-me"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      btn.click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="member-picker-chip"]').length,
      ).toBe(1);
    });

    it('renders error message when AuthService.gcid() returns null', () => {
      const { authService, fixture, element } = setup();
      authService.setGcid(null);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="instantiation-add-me"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="instantiation-add-me-error"]'),
      ).toBeTruthy();
    });
  });

  describe('member picker integration', () => {
    it('chip remove emits → component drops the GCID from invited_gcids', () => {
      const { fixture, element } = setup();
      (
        element.querySelector(
          '[data-testid="instantiation-add-me"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const remove = element.querySelector(
        '[data-testid="member-picker-chip-remove"]',
      ) as HTMLButtonElement;
      remove.click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="member-picker-chip"]').length,
      ).toBe(0);
    });
  });

  describe('submit validation gating', () => {
    function selectTestSet(
      fixture: ComponentFixture<AssessmentInstantiationComponent>,
      element: HTMLElement,
      service: StubInstantiationService,
    ): void {
      service._testSetsState.set({
        status: 'success',
        items: [TEST_SET_A, TEST_SET_B],
      });
      fixture.detectChanges();
      const select = element.querySelector(
        '[data-testid="test-set-picker-select"]',
      ) as HTMLSelectElement;
      select.value = TEST_SET_A.test_set_id;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function setTitle(
      fixture: ComponentFixture<AssessmentInstantiationComponent>,
      element: HTMLElement,
      value: string,
    ): void {
      const input = element.querySelector(
        '[data-testid="instantiation-title"]',
      ) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    function addMe(
      fixture: ComponentFixture<AssessmentInstantiationComponent>,
      element: HTMLElement,
    ): void {
      (
        element.querySelector(
          '[data-testid="instantiation-add-me"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
    }

    it('submit CTA is disabled when no test-set picked + no title + no chips', () => {
      const { element } = setup();
      const submit = element.querySelector(
        '[data-testid="instantiation-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('clicking submit while invalid does NOT call service.createAssessment', () => {
      const { service, element } = setup();
      const submit = element.querySelector(
        '[data-testid="instantiation-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      expect(service.createCalls.length).toBe(0);
    });

    it('submit enabled only after test-set + title + ≥1 chip are present', () => {
      const { fixture, element, service } = setup();
      selectTestSet(fixture, element, service);
      setTitle(fixture, element, 'Cohort May 2026');
      addMe(fixture, element);
      const submit = element.querySelector(
        '[data-testid="instantiation-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    it('valid submit calls service.createAssessment with the canonical body', () => {
      const { fixture, element, service } = setup();
      selectTestSet(fixture, element, service);
      setTitle(fixture, element, 'Cohort May 2026');
      addMe(fixture, element);
      const submit = element.querySelector(
        '[data-testid="instantiation-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      expect(service.createCalls.length).toBe(1);
      const body = service.createCalls[0];
      expect(body.test_set_id).toBe(TEST_SET_A.test_set_id);
      expect(body.title_override).toBe('Cohort May 2026');
      expect(body.invited_gcids).toEqual([MEMBER_INSTRUCTOR_SELF.gcid]);
      expect(body.grading_config_override?.auto_release).toBe(false);
      // Anti-cheat option scramble is OFF by default (owner 2026-06-21).
      expect(body.shuffle_mcq_options).toBe(false);
    });

    it('toggling scramble-answer-options (anti-cheat) sets shuffle_mcq_options', () => {
      const { fixture, element, service } = setup();
      selectTestSet(fixture, element, service);
      setTitle(fixture, element, 'Cohort May 2026');
      addMe(fixture, element);
      const toggle = element.querySelector(
        '[data-testid="instantiation-shuffle-mcq"]',
      ) as HTMLInputElement;
      expect(toggle).toBeTruthy();
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="instantiation-submit"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.createCalls[0].shuffle_mcq_options).toBe(true);
    });

    it('toggling auto-release adjusts the body payload', () => {
      const { fixture, element, service } = setup();
      selectTestSet(fixture, element, service);
      setTitle(fixture, element, 'Cohort May 2026');
      addMe(fixture, element);
      const toggle = element.querySelector(
        '[data-testid="instantiation-auto-release"]',
      ) as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="instantiation-submit"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.createCalls[0].grading_config_override?.auto_release).toBe(true);
    });

    it('includes start/end window dates in the body when provided', () => {
      const { fixture, element, service } = setup();
      selectTestSet(fixture, element, service);
      setTitle(fixture, element, 'Cohort May 2026');
      addMe(fixture, element);
      const open = element.querySelector(
        '[data-testid="instantiation-start"]',
      ) as HTMLInputElement;
      const close = element.querySelector(
        '[data-testid="instantiation-end"]',
      ) as HTMLInputElement;
      open.value = '2026-05-20T09:00';
      open.dispatchEvent(new Event('input'));
      close.value = '2026-05-20T11:00';
      close.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="instantiation-submit"]',
        ) as HTMLButtonElement
      ).click();
      const body = service.createCalls[0];
      expect(body.scheduled_open_at).toBe('2026-05-20T09:00');
      expect(body.scheduled_close_at).toBe('2026-05-20T11:00');
    });
  });

  describe('post-submit behaviour', () => {
    function fillValid(
      fixture: ComponentFixture<AssessmentInstantiationComponent>,
      element: HTMLElement,
      service: StubInstantiationService,
    ): void {
      service._testSetsState.set({
        status: 'success',
        items: [TEST_SET_A],
      });
      fixture.detectChanges();
      const select = element.querySelector(
        '[data-testid="test-set-picker-select"]',
      ) as HTMLSelectElement;
      select.value = TEST_SET_A.test_set_id;
      select.dispatchEvent(new Event('change'));
      const input = element.querySelector(
        '[data-testid="instantiation-title"]',
      ) as HTMLInputElement;
      input.value = 'Cohort May 2026';
      input.dispatchEvent(new Event('input'));
      (
        element.querySelector(
          '[data-testid="instantiation-add-me"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="instantiation-submit"]',
        ) as HTMLButtonElement
      ).click();
    }

    it('on success → router.navigate to /r/assessments/:id/monitor', () => {
      const { service, fixture, element, navigateSpy } = setup();
      fillValid(fixture, element, service);
      service._createState.set({ status: 'success', assessment: CREATED });
      fixture.detectChanges();
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith([
        '/r',
        'assessments',
        CREATED.assessment_id,
        'monitor',
      ]);
    });

    it('renders submitting state while createState is submitting', () => {
      const { service, fixture, element } = setup();
      service._createState.set({ status: 'submitting' });
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="instantiation-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(submit.textContent).toContain('submit_pending');
    });

    it('renders 5xx banner with retry CTA on submit error', () => {
      const { service, fixture, element } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_5xx',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="instantiation-error-banner"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(
        element.querySelector('[data-testid="instantiation-retry"]'),
      ).toBeTruthy();
    });

    it('renders inline field errors on 4xx with details', () => {
      const { service, fixture, element } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_4xx',
        fieldErrors: {
          title: 'Title too long',
        },
      });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="instantiation-field-error-title"]',
      );
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('Title too long');
    });

    it('retry CTA calls service.resetCreate()', () => {
      const { service, fixture, element } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_5xx',
      });
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="instantiation-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.resetCreateCalls).toBe(1);
    });

    it('5xx error state yields no field errors (error WITHOUT fieldErrors arm)', () => {
      const { service, fixture } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_5xx',
      });
      fixture.detectChanges();
      // fieldErrors() takes the `error && s.fieldErrors`-false branch → {}.
      expect(fixture.componentInstance.fieldErrors()).toEqual({});
      expect(fixture.componentInstance.fieldErrorTitle()).toBe('');
    });
  });

  // ── Branch-coverage augmentation (uncovered conditional arms) ────────
  describe('input handler ternaries — empty/blank arms', () => {
    it('onTestSetChange("") clears the selection to null (falsy ternary arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onTestSetChange(TEST_SET_A.test_set_id);
      expect(cmp.selectedTestSetId()).toBe(TEST_SET_A.test_set_id);
      // Re-selecting the placeholder (value === '') hits the `: null` arm.
      cmp.onTestSetChange('');
      expect(cmp.selectedTestSetId()).toBeNull();
    });

    it('onStartChange("") sets startAt to null (falsy ternary arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onStartChange('2026-05-20T09:00');
      expect(cmp.startAt()).toBe('2026-05-20T09:00');
      cmp.onStartChange('');
      expect(cmp.startAt()).toBeNull();
    });

    it('onEndChange("") sets endAt to null (falsy ternary arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onEndChange('2026-05-20T11:00');
      expect(cmp.endAt()).toBe('2026-05-20T11:00');
      cmp.onEndChange('');
      expect(cmp.endAt()).toBeNull();
    });

    it('onAutoReleaseChange(true) flips the autoRelease signal', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.autoRelease()).toBe(false);
      cmp.onAutoReleaseChange(true);
      expect(cmp.autoRelease()).toBe(true);
    });

    it('onTitleInput sets the title signal verbatim', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onTitleInput('My cohort');
      expect(cmp.title()).toBe('My cohort');
    });
  });

  describe('isTitleInvalid — both arms of the && guard', () => {
    it('is false when the title is empty (length 0 short-circuits &&)', () => {
      const { fixture } = setup();
      // Default title is '' → length === 0 → first operand falsy → false.
      expect(fixture.componentInstance.isTitleInvalid()).toBe(false);
    });

    it('is true when the title exceeds 200 chars (length>0 && invalid)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onTitleInput('x'.repeat(201));
      expect(cmp.isTitleInvalid()).toBe(true);
    });

    it('renders the inline title-error when over the maxLength', () => {
      const { fixture, element } = setup();
      fixture.componentInstance.onTitleInput('y'.repeat(201));
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="instantiation-title-error"]'),
      ).toBeTruthy();
    });
  });

  describe('field-error computeds — truthy (key-present) arms', () => {
    it('fieldErrorTestSet returns the test_set_id detail when present', () => {
      const { service, fixture, element } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_4xx',
        fieldErrors: { test_set_id: 'Test-set is required' },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.fieldErrorTestSet()).toBe(
        'Test-set is required',
      );
      const err = element.querySelector(
        '[data-testid="instantiation-field-error-test-set"]',
      );
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('Test-set is required');
    });

    it('fieldErrorCohort returns the invited_gcids detail when present', () => {
      const { service, fixture, element } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_4xx',
        fieldErrors: { invited_gcids: 'Add at least one learner' },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.fieldErrorCohort()).toBe(
        'Add at least one learner',
      );
      const err = element.querySelector(
        '[data-testid="instantiation-field-error-cohort"]',
      );
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('Add at least one learner');
    });

    it('field-error computeds fall back to "" when the key is absent (?? arm)', () => {
      const { service, fixture } = setup();
      service._createState.set({
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_4xx',
        fieldErrors: { title: 'Only a title error here' },
      });
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      expect(cmp.fieldErrorTitle()).toBe('Only a title error here');
      expect(cmp.fieldErrorTestSet()).toBe('');
      expect(cmp.fieldErrorCohort()).toBe('');
    });
  });

  describe('submit() guard rails', () => {
    it('submit() early-returns when canSubmit() is false (no service call)', () => {
      const { service, fixture } = setup();
      // Nothing filled → canSubmit() is false → first guard returns early.
      fixture.componentInstance.submit();
      expect(service.createCalls.length).toBe(0);
    });

    it('submit() early-returns when testSetId is null despite a passing cohort+title (null-guard arm)', () => {
      const { service, fixture } = setup();
      const cmp = fixture.componentInstance;
      // Drive title + cohort valid but leave selectedTestSetId null.
      cmp.onTitleInput('Cohort May 2026');
      cmp.onMemberSelected(MEMBER_A);
      // canSubmit() is false here (no test-set) so the FIRST guard fires;
      // this characterises the no-op path without a service call.
      cmp.submit();
      expect(service.createCalls.length).toBe(0);
    });
  });

  describe('onMemberSelected dedupe — both arms', () => {
    it('adds a distinct member then ignores a duplicate GCID (some()-true arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onMemberSelected(MEMBER_A);
      expect(cmp.invitedMembers().length).toBe(1);
      // Same GCID again → some() true → early return, no growth.
      cmp.onMemberSelected({ ...MEMBER_A, display_name: 'Alice (dupe)' });
      expect(cmp.invitedMembers().length).toBe(1);
    });

    it('onMemberRemoved drops only the matching GCID (filter predicate arms)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      cmp.onMemberSelected(MEMBER_A);
      cmp.onMemberSelected(MEMBER_INSTRUCTOR_SELF);
      expect(cmp.invitedMembers().length).toBe(2);
      cmp.onMemberRemoved(MEMBER_A.gcid);
      const remaining = cmp.invitedMembers();
      expect(remaining.length).toBe(1);
      expect(remaining[0].gcid).toBe(MEMBER_INSTRUCTOR_SELF.gcid);
    });
  });

  describe('testSetsErrorKey / testSets computeds — non-matching status arms', () => {
    it('testSetsErrorKey is "" while idle (ternary false arm)', () => {
      const { fixture } = setup();
      // Default service state is idle → status !== 'error' → ''.
      expect(fixture.componentInstance.testSetsErrorKey()).toBe('');
    });

    it('testSets is [] while loading (ternary false arm)', () => {
      const { service, fixture } = setup();
      service._testSetsState.set({ status: 'loading' });
      fixture.detectChanges();
      expect(fixture.componentInstance.testSets()).toEqual([]);
    });

    it('testSets returns the items array on success (ternary true arm)', () => {
      const { service, fixture } = setup();
      service._testSetsState.set({
        status: 'success',
        items: [TEST_SET_A, TEST_SET_B],
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.testSets().length).toBe(2);
    });

    it('trackByTestSetId returns the row id', () => {
      const { fixture } = setup();
      expect(
        fixture.componentInstance.trackByTestSetId(0, TEST_SET_A),
      ).toBe(TEST_SET_A.test_set_id);
    });
  });
});
