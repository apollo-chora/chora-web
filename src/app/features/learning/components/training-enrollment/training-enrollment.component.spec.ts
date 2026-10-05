import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TrainingEnrollmentBrowserComponent } from './training-enrollment.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../core/services/translate.service';
import type { TrainingSession } from './models/training.model';

function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: 's1',
    title: 'Angular Workshop',
    description: 'Learn Angular',
    trainerName: 'John Doe',
    trainerGcid: 'gcid-1',
    trainerBio: null,
    dateTime: '2026-04-10T10:00:00Z',
    durationMinutes: 120,
    capacity: 30,
    enrolledCount: 15,
    topics: ['Angular', 'TypeScript'],
    prerequisites: [],
    location: 'Room A',
    virtualLink: null,
    status: 'published',
    isEnrolled: false,
    waitlistPosition: null,
    ...overrides,
  } as TrainingSession;
}

describe('TrainingEnrollmentBrowserComponent', () => {
  let fixture: ComponentFixture<TrainingEnrollmentBrowserComponent>;
  let component: TrainingEnrollmentBrowserComponent;
  let bffMock: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let toastMock: { show: ReturnType<typeof vi.fn> };

  const sessionData = {
    data: [
      {
        id: 's1',
        title: 'Angular Workshop',
        description: 'Learn Angular',
        trainerName: 'John Doe',
        trainerBio: null,
        dateTime: '2026-04-10T10:00:00Z',
        durationMinutes: 120,
        capacity: 30,
        enrolledCount: 15,
        isEnrolled: false,
        waitlistPosition: null,
        topics: ['Angular', 'TypeScript'],
        prerequisites: [],
        location: 'Room A',
        virtualLink: null,
      },
    ],
  };

  function configure(getValue = of(sessionData)) {
    TestBed.resetTestingModule();
    bffMock = {
      get: vi.fn().mockReturnValue(getValue),
      post: vi.fn().mockReturnValue(of({ waitlistPosition: null })),
      delete: vi.fn().mockReturnValue(of(undefined)),
    };
    toastMock = { show: vi.fn() };

    TestBed.configureTestingModule({
      imports: [TrainingEnrollmentBrowserComponent],
      providers: [
        { provide: BffClientService, useValue: bffMock },
        { provide: ToastService, useValue: toastMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    });

    fixture = TestBed.createComponent(TrainingEnrollmentBrowserComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    configure();
  });

  // --- Existing pre-existing tests (unchanged) ---------------------------

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load sessions on init', () => {
    fixture.detectChanges();

    expect(component.sessions().length).toBe(1);
    expect(component.sessions()[0].title).toBe('Angular Workshop');
    expect(component.loading()).toBe(false);
  });

  it('should compute available topics from sessions', () => {
    fixture.detectChanges();

    expect(component.availableTopics()).toEqual(['Angular', 'TypeScript']);
  });

  // --- loadSessions ------------------------------------------------------

  it('should call the correct training sessions endpoint on init', () => {
    fixture.detectChanges();
    expect(bffMock.get).toHaveBeenCalledWith(
      '/api/v1/training/sessions?status=published',
    );
  });

  it('should populate enrolledIds from already-enrolled sessions', () => {
    bffMock.get.mockReturnValue(
      of({
        data: [
          { ...sessionData.data[0], id: 'a', isEnrolled: true },
          { ...sessionData.data[0], id: 'b', isEnrolled: false },
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.enrolledIds().has('a')).toBe(true);
    expect(component.enrolledIds().has('b')).toBe(false);
  });

  it('should set error and clear loading when load fails', () => {
    configure(throwError(() => new Error('boom')));
    fixture.detectChanges();

    expect(component.error()).toBe('boom');
    expect(component.loading()).toBe(false);
    expect(component.sessions().length).toBe(0);
  });

  it('should fall back to default message when error has no message', () => {
    configure(throwError(() => new Error('')));
    fixture.detectChanges();

    expect(component.error()).toBe('Failed to load sessions');
  });

  it('should render the error state in the template', () => {
    configure(throwError(() => new Error('network down')));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const errorEl = el.querySelector('[data-testid="training-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl?.textContent).toContain('network down');
  });

  it('should render the empty state when no sessions match', () => {
    bffMock.get.mockReturnValue(of({ data: [] }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="training-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="session-grid"]')).toBeNull();
  });

  it('should render the session grid with a card per session', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="session-grid"]')).toBeTruthy();
    expect(el.querySelectorAll('[data-testid="session-card"]').length).toBe(1);
    expect(
      el.querySelector('[data-testid="session-title"]')?.textContent,
    ).toContain('Angular Workshop');
  });

  // --- filteredSessions / filter handlers --------------------------------

  it('should filter sessions by selected subject', () => {
    bffMock.get.mockReturnValue(
      of({
        data: [
          { ...sessionData.data[0], id: 'a', topics: ['Angular'] },
          { ...sessionData.data[0], id: 'b', topics: ['Python'] },
        ],
      }),
    );
    fixture.detectChanges();

    component.onSubjectFilterChange({
      target: { value: 'Python' },
    } as unknown as Event);

    expect(component.filteredSessions().map((s) => s.id)).toEqual(['b']);
  });

  it('should filter sessions by trainer search (case-insensitive, trimmed)', () => {
    bffMock.get.mockReturnValue(
      of({
        data: [
          { ...sessionData.data[0], id: 'a', trainerName: 'Alice Smith' },
          { ...sessionData.data[0], id: 'b', trainerName: 'Bob Jones' },
        ],
      }),
    );
    fixture.detectChanges();

    component.onTrainerSearchChange({
      target: { value: '  ALICE  ' },
    } as unknown as Event);

    expect(component.filteredSessions().map((s) => s.id)).toEqual(['a']);
  });

  it('should combine subject and trainer filters', () => {
    bffMock.get.mockReturnValue(
      of({
        data: [
          { ...sessionData.data[0], id: 'a', topics: ['Go'], trainerName: 'Ann' },
          { ...sessionData.data[0], id: 'b', topics: ['Go'], trainerName: 'Ben' },
          { ...sessionData.data[0], id: 'c', topics: ['Rust'], trainerName: 'Ann' },
        ],
      }),
    );
    fixture.detectChanges();

    component.selectedSubject.set('Go');
    component.trainerSearch.set('ann');

    expect(component.filteredSessions().map((s) => s.id)).toEqual(['a']);
  });

  it('should return all sessions when no filters applied', () => {
    fixture.detectChanges();
    expect(component.filteredSessions().length).toBe(1);
  });

  // --- detail modal open/close ------------------------------------------

  it('should open the detail modal for a session', () => {
    fixture.detectChanges();
    const session = component.sessions()[0];

    component.openDetail(session);
    fixture.detectChanges();

    expect(component.selectedSession()?.id).toBe(session.id);
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('chora-training-session-detail-modal'),
    ).toBeTruthy();
  });

  it('should close the detail modal', () => {
    fixture.detectChanges();
    component.openDetail(component.sessions()[0]);
    component.closeDetail();
    fixture.detectChanges();

    expect(component.selectedSession()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('chora-training-session-detail-modal')).toBeNull();
  });

  // --- onEnroll ----------------------------------------------------------

  it('should enroll and increment count when not waitlisted', () => {
    bffMock.post.mockReturnValue(of({ waitlistPosition: null }));
    fixture.detectChanges();

    component.onEnroll('s1');

    expect(bffMock.post).toHaveBeenCalledWith(
      '/api/v1/training/sessions/s1/enroll',
      {},
    );
    expect(component.enrolledIds().has('s1')).toBe(true);
    expect(component.enrollingId()).toBeNull();
    const updated = component.sessions().find((s) => s.id === 's1')!;
    expect(updated.isEnrolled).toBe(true);
    expect(updated.enrolledCount).toBe(16);
    expect(updated.waitlistPosition).toBeNull();
    expect(toastMock.show).toHaveBeenCalledWith('training.toast.enrolled', 'success');
  });

  it('should enroll onto waitlist without incrementing count', () => {
    bffMock.post.mockReturnValue(of({ waitlistPosition: 3 }));
    fixture.detectChanges();

    component.onEnroll('s1');

    const updated = component.sessions().find((s) => s.id === 's1')!;
    expect(updated.enrolledCount).toBe(15);
    expect(updated.waitlistPosition).toBe(3);
    expect(updated.isEnrolled).toBe(true);
  });

  it('should encode the session id in the enroll URL', () => {
    fixture.detectChanges();
    component.onEnroll('s 1/x');
    expect(bffMock.post).toHaveBeenCalledWith(
      '/api/v1/training/sessions/s%201%2Fx/enroll',
      {},
    );
  });

  it('should sync the open detail modal session on enroll', () => {
    bffMock.post.mockReturnValue(of({ waitlistPosition: null }));
    fixture.detectChanges();
    component.openDetail(component.sessions()[0]);

    component.onEnroll('s1');

    expect(component.selectedSession()?.isEnrolled).toBe(true);
    expect(component.selectedSession()?.enrolledCount).toBe(16);
  });

  it('should show an error toast and clear enrollingId when enroll fails', () => {
    bffMock.post.mockReturnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();

    component.onEnroll('s1');

    expect(component.enrollingId()).toBeNull();
    expect(component.enrolledIds().has('s1')).toBe(false);
    expect(toastMock.show).toHaveBeenCalledWith(
      'training.toast.enroll-failed',
      'error',
    );
  });

  // --- onWithdraw --------------------------------------------------------

  it('should withdraw and decrement count', () => {
    bffMock.get.mockReturnValue(
      of({ data: [{ ...sessionData.data[0], isEnrolled: true, enrolledCount: 10 }] }),
    );
    fixture.detectChanges();

    component.onWithdraw('s1');

    expect(bffMock.delete).toHaveBeenCalledWith(
      '/api/v1/training/sessions/s1/enroll',
    );
    expect(component.enrolledIds().has('s1')).toBe(false);
    expect(component.enrollingId()).toBeNull();
    const updated = component.sessions().find((s) => s.id === 's1')!;
    expect(updated.isEnrolled).toBe(false);
    expect(updated.enrolledCount).toBe(9);
    expect(updated.waitlistPosition).toBeNull();
    expect(toastMock.show).toHaveBeenCalledWith(
      'training.toast.withdrawn',
      'success',
    );
  });

  it('should clamp enrolledCount at zero on withdraw', () => {
    bffMock.get.mockReturnValue(
      of({ data: [{ ...sessionData.data[0], isEnrolled: true, enrolledCount: 0 }] }),
    );
    fixture.detectChanges();

    component.onWithdraw('s1');

    const updated = component.sessions().find((s) => s.id === 's1')!;
    expect(updated.enrolledCount).toBe(0);
  });

  it('should sync the open detail modal session on withdraw', () => {
    bffMock.get.mockReturnValue(
      of({ data: [{ ...sessionData.data[0], isEnrolled: true, enrolledCount: 10 }] }),
    );
    fixture.detectChanges();
    component.openDetail(component.sessions()[0]);

    component.onWithdraw('s1');

    expect(component.selectedSession()?.isEnrolled).toBe(false);
    expect(component.selectedSession()?.enrolledCount).toBe(9);
  });

  it('should show an error toast and clear enrollingId when withdraw fails', () => {
    bffMock.delete.mockReturnValue(throwError(() => new Error('fail')));
    bffMock.get.mockReturnValue(
      of({ data: [{ ...sessionData.data[0], isEnrolled: true }] }),
    );
    fixture.detectChanges();

    component.onWithdraw('s1');

    expect(component.enrollingId()).toBeNull();
    expect(toastMock.show).toHaveBeenCalledWith(
      'training.toast.withdraw-failed',
      'error',
    );
  });

  // --- formatDateTime / getCapacityLevel --------------------------------

  it('should format a valid ISO datetime', () => {
    fixture.detectChanges();
    const formatted = component.formatDateTime('2026-04-10T10:00:00Z');
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should delegate capacity level to the model helper', () => {
    fixture.detectChanges();
    expect(component.getCapacityLevel(makeSession({ enrolledCount: 30, capacity: 30 }))).toBe('full');
    expect(component.getCapacityLevel(makeSession({ enrolledCount: 28, capacity: 30 }))).toBe('nearly_full');
    expect(component.getCapacityLevel(makeSession({ enrolledCount: 20, capacity: 30 }))).toBe('filling');
    expect(component.getCapacityLevel(makeSession({ enrolledCount: 5, capacity: 30 }))).toBe('available');
  });

  it('should render a waitlist button for a full session', () => {
    bffMock.get.mockReturnValue(
      of({
        data: [{ ...sessionData.data[0], enrolledCount: 30, capacity: 30 }],
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="session-waitlist-btn"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="session-enroll-btn"]')).toBeNull();
  });

  it('should render an enrolled badge for an already-enrolled session', () => {
    bffMock.get.mockReturnValue(
      of({ data: [{ ...sessionData.data[0], isEnrolled: true }] }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="session-enrolled-badge"]'),
    ).toBeTruthy();
  });

  // --- lifecycle ---------------------------------------------------------

  it('should unsubscribe on destroy without error', () => {
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
