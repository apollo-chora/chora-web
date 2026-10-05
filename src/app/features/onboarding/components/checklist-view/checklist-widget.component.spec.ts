import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ChecklistWidgetComponent } from './checklist-widget.component';
import { ChecklistService } from '../../services/checklist.service';
import { TranslateService } from '../../../../core/services/translate.service';

describe('ChecklistWidgetComponent', () => {
  let fixture: ComponentFixture<ChecklistWidgetComponent>;
  let component: ChecklistWidgetComponent;
  let element: HTMLElement;

  const summaryStateSignal = signal<Record<string, unknown>>({
    status: 'success',
    data: {
      completed_count: 3,
      total_count: 5,
      percentage: 60,
      has_overdue: false,
    },
  });

  const checklistMock = {
    summaryState: summaryStateSignal.asReadonly(),
    getChecklistSummary: vi.fn().mockReturnValue(of(null)),
  };

  beforeEach(async () => {
    summaryStateSignal.set({
      status: 'success',
      data: {
        completed_count: 3,
        total_count: 5,
        percentage: 60,
        has_overdue: false,
      },
    });

    await TestBed.configureTestingModule({
      imports: [ChecklistWidgetComponent],
      providers: [
        provideRouter([]),
        { provide: ChecklistService, useValue: checklistMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChecklistWidgetComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display progress count', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="widget-progress"]')?.textContent?.trim()).toContain('3 / 5');
  });

  it('should have a view-all link', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="widget-view-all"]')).toBeTruthy();
  });
});
