import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LeaderboardWidgetComponent } from './leaderboard-widget.component';
import type { LeaderboardData } from '../../models/engagement.models';

describe('LeaderboardWidgetComponent', () => {
  let fixture: ComponentFixture<LeaderboardWidgetComponent>;
  let component: LeaderboardWidgetComponent;

  const mockLeaderboard: LeaderboardData = {
    entries: [
      { rank: 1, gcid: 'gcid-001', display_name: 'Alice', avatar_url: null, total_xp: 5000, level: 10, streak_days: 30 },
      { rank: 2, gcid: 'gcid-002', display_name: 'Bob', avatar_url: null, total_xp: 4200, level: 9, streak_days: 14 },
    ],
    learner_rank: { rank: 5, gcid: 'gcid-me', display_name: 'Me', avatar_url: null, total_xp: 1250, level: 5, streak_days: 7 },
    period: 'weekly',
    scope: 'tenant',
    page_info: { has_next: false },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeaderboardWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeaderboardWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('leaderboard', mockLeaderboard);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose period options', () => {
    expect(component.periods).toEqual(['weekly', 'monthly', 'all_time']);
  });

  it('should emit periodChanged on period change', () => {
    const emitSpy = vi.spyOn(component.periodChanged, 'emit');
    component.onPeriodChange('monthly');
    expect(emitSpy).toHaveBeenCalledWith('monthly');
  });
});
