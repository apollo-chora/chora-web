import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CertPreviewModalComponent } from './cert-preview-modal.component';
import type { RosterLearner } from '../class-roster/class-roster.model';

function buildLearner(overrides: Partial<RosterLearner> = {}): RosterLearner {
  return {
    gcid: 'GCID-001',
    displayName: 'Phyllis Tan',
    avatarUrl: null,
    status: 'Active',
    atomicSessionsCompleted: 4,
    atomicSessionsTotal: 12,
    lastActivity: 'today',
    certPreviewEnabled: true,
    ...overrides,
  };
}

function setupComponent(
  learner: RosterLearner = buildLearner(),
  courseName = 'DSA-101 — Data Structures & Algorithms 101',
  instructorName = 'Mr. Chen',
): ComponentFixture<CertPreviewModalComponent> {
  TestBed.configureTestingModule({
    imports: [CertPreviewModalComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(CertPreviewModalComponent);
  fixture.componentRef.setInput('learner', learner);
  fixture.componentRef.setInput('courseName', courseName);
  fixture.componentRef.setInput('instructorName', instructorName);
  fixture.detectChanges();
  return fixture;
}

describe('CertPreviewModalComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders a dialog with aria-modal=true', () => {
    const fixture = setupComponent();
    const dialog = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-overlay"]',
    ) as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('aria-labelledby points at the title element', () => {
    const fixture = setupComponent();
    const dialog = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-overlay"]',
    ) as HTMLElement;
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleEl = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-title"]',
    ) as HTMLElement;
    expect(titleEl.id).toBe(labelledBy);
  });

  it('renders the learner display name + GCID', () => {
    const fixture = setupComponent();
    const name = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-learner-name"]',
    ) as HTMLElement;
    const gcid = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-gcid"]',
    ) as HTMLElement;
    expect(name.textContent?.trim()).toBe('Phyllis Tan');
    expect(gcid.textContent?.trim()).toBe('GCID-001');
  });

  it('renders the cohort course name', () => {
    const fixture = setupComponent();
    const course = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-course-name"]',
    ) as HTMLElement;
    expect(course.textContent?.trim()).toContain('DSA-101');
  });

  it('renders atomic-session progress as completed/total', () => {
    const fixture = setupComponent();
    const atoms = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-atoms"]',
    ) as HTMLElement;
    expect(atoms.textContent).toContain('4');
    expect(atoms.textContent).toContain('12');
  });

  it('emits close() when the close button is clicked', () => {
    const fixture = setupComponent();
    const closeSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closeSpy);
    const closeBtn = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-close"]',
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits close() when the dismiss footer button is clicked', () => {
    const fixture = setupComponent();
    const closeSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closeSpy);
    const dismiss = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-dismiss"]',
    ) as HTMLButtonElement;
    dismiss.click();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits close() on Escape key', () => {
    const fixture = setupComponent();
    const closeSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closeSpy);
    fixture.componentInstance.onEscape();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits close() when backdrop is clicked directly', () => {
    const fixture = setupComponent();
    const closeSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closeSpy);
    const overlay = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-overlay"]',
    ) as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: overlay });
    Object.defineProperty(event, 'currentTarget', { value: overlay });
    fixture.componentInstance.handleBackdropClick(event);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit close() when the click lands inside the modal card', () => {
    const fixture = setupComponent();
    const closeSpy = vi.fn();
    fixture.componentInstance.closed.subscribe(closeSpy);
    const overlay = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-overlay"]',
    ) as HTMLElement;
    const card = overlay.querySelector('.modal-content') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: card });
    Object.defineProperty(event, 'currentTarget', { value: overlay });
    fixture.componentInstance.handleBackdropClick(event);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('moves initial focus to the close button (WAI-ARIA dialog pattern)', () => {
    const fixture = setupComponent();
    const closeBtn = fixture.nativeElement.querySelector(
      '[data-testid="cert-preview-close"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);
  });
});
