import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExamSummaryWidgetComponent } from './exam-summary-widget.component';
import type { ExamReadiness } from '../../models/engagement.models';

describe('ExamSummaryWidgetComponent', () => {
  let fixture: ComponentFixture<ExamSummaryWidgetComponent>;
  let component: ExamSummaryWidgetComponent;

  const mockReadiness: ExamReadiness = {
    exam_title: 'Algebra Final',
    exam_date: '2026-04-01T09:00:00Z',
    overall_readiness: 78,
    pass_threshold: 60,
    predicted_score: 72,
    confidence_interval: { low: 65, high: 80 },
    topic_readiness: [
      { topic_id: 't-001', topic_name: 'Linear Equations', readiness: 90, atoms_reviewed: 18, atoms_total: 20, weak_areas: [] },
      { topic_id: 't-002', topic_name: 'Quadratics', readiness: 55, atoms_reviewed: 11, atoms_total: 20, weak_areas: ['factoring'] },
    ],
    revision_stats: {
      atoms_reviewed_today: 12,
      atoms_reviewed_week: 45,
      time_spent_today_ms: 3600000,
      time_spent_week_ms: 18000000,
      streak_days: 7,
      sessions_completed: 3,
    },
    familiar_message: 'Keep it up!',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExamSummaryWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExamSummaryWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('readiness', mockReadiness);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute readiness level as high for >= 75', () => {
    expect(component.readinessLevel()).toBe('high');
  });

  it('should compute readiness level as medium for >= 50', () => {
    fixture.componentRef.setInput('readiness', { ...mockReadiness, overall_readiness: 60 });
    fixture.detectChanges();
    expect(component.readinessLevel()).toBe('medium');
  });

  it('should compute readiness level as low for < 50', () => {
    fixture.componentRef.setInput('readiness', { ...mockReadiness, overall_readiness: 30 });
    fixture.detectChanges();
    expect(component.readinessLevel()).toBe('low');
  });

  it('should format time today from milliseconds', () => {
    expect(component.formattedTimeToday()).toBe('1h 0m');
  });

  it('should determine above threshold status', () => {
    expect(component.aboveThreshold()).toBe(true);
  });

  it('should sort topics by readiness ascending', () => {
    const topics = component.topTopics();
    expect(topics[0].topic_name).toBe('Quadratics');
    expect(topics[1].topic_name).toBe('Linear Equations');
  });
});
