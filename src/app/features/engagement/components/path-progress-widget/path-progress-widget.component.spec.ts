import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PathProgressWidgetComponent } from './path-progress-widget.component';
import type { PathProgress } from '../../models/engagement.models';

describe('PathProgressWidgetComponent', () => {
  let fixture: ComponentFixture<PathProgressWidgetComponent>;
  let component: PathProgressWidgetComponent;

  const mockPaths: PathProgress[] = [
    {
      path_id: 'path-001',
      path_title: 'Algebra Foundations',
      completion_pct: 60,
      steps_completed: 30,
      steps_total: 50,
    },
    {
      path_id: 'path-002',
      path_title: 'Geometry Basics',
      completion_pct: 25,
      steps_completed: 5,
      steps_total: 20,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PathProgressWidgetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PathProgressWidgetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('paths', mockPaths);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should receive paths input', () => {
    expect(component.paths().length).toBe(2);
  });

  it('should emit pathSelected on path click', () => {
    const emitSpy = vi.spyOn(component.pathSelected, 'emit');
    component.onPathClick('path-001');
    expect(emitSpy).toHaveBeenCalledWith('path-001');
  });
});
