import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChoraEmptyStateComponent } from './chora-empty-state.component';

describe('ChoraEmptyStateComponent', () => {
  let fixture: ComponentFixture<ChoraEmptyStateComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraEmptyStateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChoraEmptyStateComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setInputs(inputs: Partial<{
    icon: string;
    heading: string;
    body: string;
    ctaLabel: string;
    tone: 'neutral' | 'info' | 'warning';
    testId: string;
  }>): void {
    if (inputs.icon !== undefined) {
      fixture.componentRef.setInput('icon', inputs.icon);
    }
    if (inputs.heading !== undefined) {
      fixture.componentRef.setInput('heading', inputs.heading);
    }
    if (inputs.body !== undefined) {
      fixture.componentRef.setInput('body', inputs.body);
    }
    if (inputs.ctaLabel !== undefined) {
      fixture.componentRef.setInput('ctaLabel', inputs.ctaLabel);
    }
    if (inputs.tone !== undefined) {
      fixture.componentRef.setInput('tone', inputs.tone);
    }
    if (inputs.testId !== undefined) {
      fixture.componentRef.setInput('testId', inputs.testId);
    }
    fixture.detectChanges();
  }

  // ─── Rendering ───────────────────────────────────────────────────────

  it('renders the FontAwesome icon class on the icon element', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'Nothing here yet',
    });
    const iconEl = host.querySelector('.chora-empty-state__icon i');
    expect(iconEl).not.toBeNull();
    expect(iconEl?.className).toContain('fa-solid');
    expect(iconEl?.className).toContain('fa-inbox');
  });

  it('renders the heading text', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No submissions yet',
    });
    const headingEl = host.querySelector('.chora-empty-state__heading');
    expect(headingEl?.textContent?.trim()).toBe('No submissions yet');
  });

  it('renders the optional body line when provided', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
      body: 'Generate something to see results.',
    });
    const bodyEl = host.querySelector('.chora-empty-state__body');
    expect(bodyEl?.textContent?.trim()).toBe('Generate something to see results.');
  });

  it('omits the body element when body is not provided', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
    });
    expect(host.querySelector('.chora-empty-state__body')).toBeNull();
  });

  // ─── CTA ─────────────────────────────────────────────────────────────

  it('renders a CTA button when ctaLabel is set', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
      ctaLabel: 'Generate now',
    });
    const cta = host.querySelector('button.chora-empty-state__cta');
    expect(cta).not.toBeNull();
    expect(cta?.textContent?.trim()).toBe('Generate now');
    expect(cta?.getAttribute('type')).toBe('button');
  });

  it('omits the CTA button when ctaLabel is not set', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
    });
    expect(host.querySelector('button.chora-empty-state__cta')).toBeNull();
  });

  it('emits ctaClick when the CTA button is clicked', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
      ctaLabel: 'Generate now',
    });
    let fired = 0;
    fixture.componentInstance.ctaClick.subscribe(() => fired++);
    const cta = host.querySelector('button.chora-empty-state__cta') as HTMLButtonElement;
    cta.click();
    expect(fired).toBe(1);
  });

  // ─── Attributes ──────────────────────────────────────────────────────

  it('exposes tone via data-tone attribute', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'Warning',
      tone: 'warning',
    });
    const root = host.querySelector('.chora-empty-state');
    expect(root?.getAttribute('data-tone')).toBe('warning');
  });

  it('defaults data-tone to neutral when tone input is unset', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
    });
    const root = host.querySelector('.chora-empty-state');
    expect(root?.getAttribute('data-tone')).toBe('neutral');
  });

  it('forwards testId to the host data-testid attribute', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No submissions',
      testId: 'submissions-empty',
    });
    const el = host.querySelector('[data-testid="submissions-empty"]');
    expect(el).not.toBeNull();
  });

  // ─── Accessibility ───────────────────────────────────────────────────

  it('marks the icon decorative via aria-hidden', () => {
    setInputs({
      icon: 'fa-solid fa-inbox',
      heading: 'No data',
    });
    const iconWrap = host.querySelector('.chora-empty-state__icon');
    expect(iconWrap?.getAttribute('aria-hidden')).toBe('true');
  });
});
