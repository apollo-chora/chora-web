import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GoalWidgetComponent } from './goal-widget.component';
import type { GoalChallenge } from '../../models/engagement.models';

describe('GoalWidgetComponent', () => {
  let fixture: ComponentFixture<GoalWidgetComponent>;
  let component: GoalWidgetComponent;

  const mockGoals: GoalChallenge[] = [
    {
      id: 'goal-001',
      tenant_id: 'tenant-001',
      assignee_gcid: 'gcid-001',
      created_by: 'instructor-001',
      title: 'Master Algebra',
      description: 'Complete 20 atoms',
      target_scope: { type: 'atom_count', topic_id: null, target_value: 20 },
      deadline: '2026-03-20T00:00:00Z',
      bounty_star_credits: 50,
      status: 'active',
      progress_pct: 65.5,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-12T00:00:00Z',
    },
    {
      id: 'goal-002',
      tenant_id: 'tenant-001',
      assignee_gcid: 'gcid-001',
      created_by: 'instructor-001',
      title: 'Complete Path',
      description: 'Finish the path',
      target_scope: { type: 'path_completion', topic_id: null, target_value: 100 },
      deadline: '2026-04-01T00:00:00Z',
      bounty_star_credits: 100,
      status: 'completed',
      progress_pct: 100,
      created_at: '2026-02-15T00:00:00Z',
      updated_at: '2026-03-10T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GoalWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GoalWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('goals', mockGoals);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should filter active goals', () => {
    expect(component.activeGoals().length).toBe(1);
    expect(component.activeGoals()[0].id).toBe('goal-001');
  });

  it('should round progress percent', () => {
    expect(component.progressPercent(mockGoals[0])).toBe(66);
  });

  it('should emit goalAccepted on accept', () => {
    const emitSpy = vi.spyOn(component.goalAccepted, 'emit');
    component.onAccept('goal-001');
    expect(emitSpy).toHaveBeenCalledWith('goal-001');
  });
});
