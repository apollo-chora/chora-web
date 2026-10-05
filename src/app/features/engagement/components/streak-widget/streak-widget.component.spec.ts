import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StreakWidgetComponent } from './streak-widget.component';
import type { StreakData } from '../../models/engagement.models';

describe('StreakWidgetComponent', () => {
  let fixture: ComponentFixture<StreakWidgetComponent>;
  let component: StreakWidgetComponent;

  const mockStreak: StreakData = {
    current_days: 7,
    status: 'active',
    longest_streak: 14,
    last_activity_at: '2026-03-12T10:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StreakWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StreakWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('streak', mockStreak);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute flame class from streak status', () => {
    expect(component.flameClass()).toBe('streak-widget__flame--active');
  });

  it('should update flame class for at_risk status', () => {
    fixture.componentRef.setInput('streak', { ...mockStreak, status: 'at_risk' });
    fixture.detectChanges();
    expect(component.flameClass()).toBe('streak-widget__flame--at_risk');
  });

  it('should compute status label', () => {
    expect(component.statusLabel()).toBe('7-day streak, active');
  });
});
