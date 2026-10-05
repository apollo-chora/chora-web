import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrainingSessionDetailModalComponent } from './training-session-detail-modal.component';
import { TranslateService } from '../../../../core/services/translate.service';

describe('TrainingSessionDetailModalComponent', () => {
  let fixture: ComponentFixture<TrainingSessionDetailModalComponent>;
  let component: TrainingSessionDetailModalComponent;
  let element: HTMLElement;

  const session = {
    id: 's1',
    title: 'Angular Workshop',
    description: 'Learn Angular fundamentals',
    trainerName: 'John Doe',
    trainerBio: 'Expert trainer',
    dateTime: '2026-04-10T10:00:00Z',
    durationMinutes: 120,
    capacity: 30,
    enrolledCount: 15,
    isEnrolled: false,
    waitlistPosition: null,
    topics: ['Angular', 'TypeScript'],
    prerequisites: ['JavaScript basics'],
    location: 'Room A',
    virtualLink: null,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrainingSessionDetailModalComponent],
      providers: [
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrainingSessionDetailModalComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display session title', () => {
    expect(element.textContent).toContain('Angular Workshop');
  });

  it('should emit close on Escape key', () => {
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    element.querySelector('[data-testid="session-detail-backdrop"]')?.dispatchEvent(event);

    expect(emitted).toBe(true);
  });
});
