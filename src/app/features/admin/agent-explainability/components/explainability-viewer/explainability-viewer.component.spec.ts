import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ExplainabilityViewerComponent } from './explainability-viewer.component';
import { ExplainabilityService } from '../../services/explainability.service';
import type {
  InvestigationState,
  Investigation,
  InvestigationResponse,
} from '../../services/explainability.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildInvestigations(): Investigation[] {
  return [
    {
      decision_id: 'dec-001',
      agent_name: 'Recommender',
      verdict: 'approved',
      reasoning_steps: [
        { step_number: 1, description: 'Checked history', evidence: 'Passed', confidence: 0.92 },
      ],
      reasoning_summary: 'Approved based on learner history.',
      policy_references: [
        { name: 'Safety Policy', description: 'Content safety check', trigger_reason: 'Routine — passed' },
      ],
      timestamp: '2026-03-15T10:30:00Z',
    },
    {
      decision_id: 'dec-002',
      agent_name: 'Nudger',
      verdict: 'denied',
      reasoning_steps: [
        { step_number: 1, description: 'Rate limit', evidence: '3 nudges sent', confidence: 0.95 },
      ],
      reasoning_summary: 'Denied due to rate limit.',
      policy_references: [
        { name: 'Rate Limit', description: 'Max 3 per day', trigger_reason: 'Exceeded' },
      ],
      timestamp: '2026-03-15T11:00:00Z',
    },
  ];
}

function buildResponse(): InvestigationResponse {
  return {
    investigations: buildInvestigations(),
    governance: {},
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const investigationState = signal<InvestigationState>({ status: 'idle' });
const investigationsSignal = signal<Investigation[]>([]);

const mockExplainabilityService = {
  investigationState: investigationState.asReadonly(),
  investigations: investigationsSignal.asReadonly(),
  investigate: vi.fn().mockReturnValue(of(buildResponse())),
  reset: vi.fn(),
};

const mockToast = { show: vi.fn() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExplainabilityViewerComponent', () => {
  let fixture: ComponentFixture<ExplainabilityViewerComponent>;
  let component: ExplainabilityViewerComponent;


  beforeEach(async () => {
    vi.clearAllMocks();
    investigationState.set({ status: 'success', data: buildResponse() });
    investigationsSignal.set(buildInvestigations());

    await TestBed.configureTestingModule({
      imports: [ExplainabilityViewerComponent],
      providers: [
        { provide: ExplainabilityService, useValue: mockExplainabilityService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExplainabilityViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with empty filters', () => {
    expect(component.agentNameFilter()).toBe('');
    expect(component.verdictFilter()).toBe('');
    expect(component.dateFromFilter()).toBe('');
    expect(component.dateToFilter()).toBe('');
  });

  it('starts with no expanded investigation', () => {
    expect(component.expandedDecisionId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Filter interaction
  // -----------------------------------------------------------------------

  it('updates agentNameFilter on input', () => {
    const event = { target: { value: 'Recommender' } } as unknown as Event;
    component.onAgentNameInput(event);
    expect(component.agentNameFilter()).toBe('Recommender');
  });

  it('updates verdictFilter on change', () => {
    const event = { target: { value: 'denied' } } as unknown as Event;
    component.onVerdictChange(event);
    expect(component.verdictFilter()).toBe('denied');
  });

  it('updates dateFromFilter on input', () => {
    const event = { target: { value: '2026-03-01' } } as unknown as Event;
    component.onDateFromInput(event);
    expect(component.dateFromFilter()).toBe('2026-03-01');
  });

  it('updates dateToFilter on input', () => {
    const event = { target: { value: '2026-03-15' } } as unknown as Event;
    component.onDateToInput(event);
    expect(component.dateToFilter()).toBe('2026-03-15');
  });

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  it('calls investigate with filters', () => {
    component.agentNameFilter.set('Recommender');
    component.verdictFilter.set('approved');
    component.dateFromFilter.set('2026-03-01');
    component.dateToFilter.set('2026-03-15');

    component.search();

    expect(mockExplainabilityService.investigate).toHaveBeenCalledWith({
      agent_name: 'Recommender',
      verdict: 'approved',
      date_from: '2026-03-01',
      date_to: '2026-03-15',
    });
  });

  it('omits empty filters', () => {
    component.agentNameFilter.set('');
    component.verdictFilter.set('');
    component.dateFromFilter.set('');
    component.dateToFilter.set('');

    component.search();

    expect(mockExplainabilityService.investigate).toHaveBeenCalledWith({
      agent_name: undefined,
      verdict: undefined,
      date_from: undefined,
      date_to: undefined,
    });
  });

  it('collapses expanded investigation on search', () => {
    component.expandedDecisionId.set('dec-001');
    component.search();
    expect(component.expandedDecisionId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Toggle expand / collapse
  // -----------------------------------------------------------------------

  it('expands investigation on toggle', () => {
    component.toggleInvestigation('dec-001');
    expect(component.expandedDecisionId()).toBe('dec-001');
    expect(component.isExpanded('dec-001')).toBe(true);
  });

  it('collapses on second toggle', () => {
    component.toggleInvestigation('dec-001');
    component.toggleInvestigation('dec-001');
    expect(component.expandedDecisionId()).toBeNull();
    expect(component.isExpanded('dec-001')).toBe(false);
  });

  it('switches to different investigation', () => {
    component.toggleInvestigation('dec-001');
    component.toggleInvestigation('dec-002');
    expect(component.expandedDecisionId()).toBe('dec-002');
    expect(component.isExpanded('dec-001')).toBe(false);
    expect(component.isExpanded('dec-002')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // getExpandedInvestigation
  // -----------------------------------------------------------------------

  it('returns null when nothing expanded', () => {
    expect(component.getExpandedInvestigation()).toBeNull();
  });

  it('returns investigation when expanded', () => {
    component.toggleInvestigation('dec-001');
    const inv = component.getExpandedInvestigation();
    expect(inv?.decision_id).toBe('dec-001');
    expect(inv?.agent_name).toBe('Recommender');
  });

  it('returns null when expanded id not found', () => {
    component.expandedDecisionId.set('dec-999');
    expect(component.getExpandedInvestigation()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  it('verdictClass returns correct BEM class', () => {
    expect(component.verdictClass('approved')).toBe('explainability-viewer__verdict--approved');
    expect(component.verdictClass('denied')).toBe('explainability-viewer__verdict--denied');
    expect(component.verdictClass('escalated')).toBe('explainability-viewer__verdict--escalated');
  });

  it('formatTimestamp converts ISO to locale string', () => {
    const result = component.formatTimestamp('2026-03-15T10:30:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('2026-03-15T10:30:00Z');
  });

  it('formatTimestamp returns raw value on invalid date', () => {
    expect(component.formatTimestamp('not-a-date')).toBe('Invalid Date');
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('unsubscribes on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
