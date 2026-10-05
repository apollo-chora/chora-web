import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PolicyReferenceComponent } from './policy-reference.component';
import type { PolicyReference } from '../../services/explainability.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildPolicies(): PolicyReference[] {
  return [
    {
      name: 'Content Safety Policy',
      description: 'All recommended content must pass safety screening.',
      trigger_reason: 'Routine safety check — passed.',
    },
    {
      name: 'Notification Rate Limit',
      description: 'Max 3 nudges per learner per 24 hours.',
      trigger_reason: 'Rate limit exceeded.',
    },
    {
      name: 'Age-Appropriate Content',
      description: 'Content must match learner age bracket.',
      trigger_reason: 'Age verification — compliant.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolicyReferenceComponent', () => {
  let fixture: ComponentFixture<PolicyReferenceComponent>;
  let component: PolicyReferenceComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyReferenceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyReferenceComponent);
    component = fixture.componentInstance;
  });

  function setPolicies(policies: PolicyReference[] = buildPolicies()): void {
    fixture.componentRef.setInput('policies', policies);
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders all policy names', () => {
    setPolicies();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Content Safety Policy');
    expect(text).toContain('Notification Rate Limit');
    expect(text).toContain('Age-Appropriate Content');
  });

  it('renders policy descriptions', () => {
    setPolicies();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('All recommended content must pass safety screening.');
    expect(text).toContain('Max 3 nudges per learner per 24 hours.');
  });

  it('renders trigger reasons', () => {
    setPolicies();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Routine safety check');
    expect(text).toContain('Rate limit exceeded.');
  });

  it('renders empty state when no policies', () => {
    setPolicies([]);
    // Component should render but with no policy items
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('Content Safety Policy');
  });

  // -----------------------------------------------------------------------
  // Input binding
  // -----------------------------------------------------------------------

  it('reflects policies input correctly', () => {
    setPolicies();
    expect(component.policies().length).toBe(3);
    expect(component.policies()[0].name).toBe('Content Safety Policy');
  });
});
