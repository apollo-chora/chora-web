import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChoraStatCardComponent } from './chora-stat-card.component';

describe('ChoraStatCardComponent', () => {
  let fixture: ComponentFixture<ChoraStatCardComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraStatCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChoraStatCardComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setInputs(inputs: Partial<{
    label: string;
    value: string | number;
    hint: string;
    accent: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
    state: 'value' | 'pending';
    valueTestid: string;
  }>): void {
    if (inputs.label !== undefined) {
      fixture.componentRef.setInput('label', inputs.label);
    }
    if (inputs.value !== undefined) {
      fixture.componentRef.setInput('value', inputs.value);
    }
    if (inputs.hint !== undefined) {
      fixture.componentRef.setInput('hint', inputs.hint);
    }
    if (inputs.accent !== undefined) {
      fixture.componentRef.setInput('accent', inputs.accent);
    }
    if (inputs.state !== undefined) {
      fixture.componentRef.setInput('state', inputs.state);
    }
    if (inputs.valueTestid !== undefined) {
      fixture.componentRef.setInput('valueTestid', inputs.valueTestid);
    }
    fixture.detectChanges();
  }

  // ─── Rendering ───────────────────────────────────────────────────────

  it('renders the label as UPPER-CASE micro-label', () => {
    setInputs({ label: 'Total points', value: 100 });
    const labelEl = host.querySelector('.chora-stat-card__label');
    expect(labelEl?.textContent?.trim()).toBe('Total points');
  });

  it('renders the value (string)', () => {
    setInputs({ label: 'Status', value: 'OPEN' });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('OPEN');
  });

  it('renders the value (number)', () => {
    setInputs({ label: 'Points', value: 42 });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('42');
  });

  it('renders em-dash placeholder when state is pending', () => {
    setInputs({ label: 'Avg', value: 0, state: 'pending' });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('–');
  });

  it('renders the optional hint line', () => {
    setInputs({ label: 'Closes', value: '2026-05-20', hint: 'in 3 days' });
    const hintEl = host.querySelector('.chora-stat-card__hint');
    expect(hintEl?.textContent?.trim()).toBe('in 3 days');
  });

  it('omits the hint element when hint is not provided', () => {
    setInputs({ label: 'Score', value: 100 });
    expect(host.querySelector('.chora-stat-card__hint')).toBeNull();
  });

  // ─── Attributes ──────────────────────────────────────────────────────

  it('exposes accent via data-accent attribute', () => {
    setInputs({ label: 'Avg', value: 95, accent: 'success' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-accent')).toBe('success');
  });

  it('defaults data-accent to neutral when accent input is unset', () => {
    setInputs({ label: 'X', value: 1 });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-accent')).toBe('neutral');
  });

  it('exposes state via data-state attribute', () => {
    setInputs({ label: 'Avg', value: 0, state: 'pending' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-state')).toBe('pending');
  });

  it('forwards valueTestid to the value element', () => {
    setInputs({
      label: 'Avg score',
      value: 95,
      valueTestid: 'cohort-progress-average-score',
    });
    const valueEl = host.querySelector(
      '[data-testid="cohort-progress-average-score"]',
    );
    expect(valueEl).not.toBeNull();
    expect(valueEl?.textContent?.trim()).toBe('95');
  });

  // ─── Accessibility ───────────────────────────────────────────────────

  it('groups the label + value via role="group" + aria-label', () => {
    setInputs({ label: 'Total points', value: 100 });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('role')).toBe('group');
    // aria-label should combine label + value for assistive tech
    expect(card?.getAttribute('aria-label')).toBe('Total points: 100');
  });

  it('combines aria-label with hint when present', () => {
    setInputs({
      label: 'Closes',
      value: '2026-05-20',
      hint: 'in 3 days',
    });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('aria-label')).toBe(
      'Closes: 2026-05-20, in 3 days',
    );
  });

  // ─── displayValue computed edge cases ────────────────────────────────

  it('renders zero (number) as "0" in value state (not blanked as falsy)', () => {
    setInputs({ label: 'Streak', value: 0 });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('0');
  });

  it('renders an empty-string value as empty in value state', () => {
    setInputs({ label: 'Note', value: '' });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('');
  });

  it('renders negative numbers via String() coercion', () => {
    setInputs({ label: 'Delta', value: -7 });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('-7');
  });

  it('ignores the underlying value when state is pending (still em-dash)', () => {
    setInputs({ label: 'Avg', value: 999, state: 'pending' });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('–');
  });

  it('switches from value to pending reactively when state input changes', () => {
    setInputs({ label: 'Avg', value: 88, state: 'value' });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl?.textContent?.trim()).toBe('88');
    setInputs({ state: 'pending' });
    expect(valueEl?.textContent?.trim()).toBe('–');
  });

  // ─── accent variants ─────────────────────────────────────────────────

  it('exposes the "primary" accent via data-accent', () => {
    setInputs({ label: 'X', value: 1, accent: 'primary' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-accent')).toBe('primary');
  });

  it('exposes the "warning" accent via data-accent', () => {
    setInputs({ label: 'X', value: 1, accent: 'warning' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-accent')).toBe('warning');
  });

  it('exposes the "danger" accent via data-accent', () => {
    setInputs({ label: 'X', value: 1, accent: 'danger' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-accent')).toBe('danger');
  });

  // ─── state attribute default ─────────────────────────────────────────

  it('defaults data-state to "value" when state input is unset', () => {
    setInputs({ label: 'X', value: 1 });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('data-state')).toBe('value');
  });

  // ─── valueTestid binding ─────────────────────────────────────────────

  it('omits the data-testid attribute when valueTestid is unset', () => {
    setInputs({ label: 'Score', value: 5 });
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(valueEl).not.toBeNull();
    expect(valueEl?.hasAttribute('data-testid')).toBe(false);
  });

  // ─── aria-label in pending state ─────────────────────────────────────

  it('uses the em-dash placeholder in aria-label when pending', () => {
    setInputs({ label: 'Avg', value: 95, state: 'pending' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('aria-label')).toBe('Avg: –');
  });

  it('combines pending placeholder with hint in aria-label', () => {
    setInputs({ label: 'Avg', value: 95, state: 'pending', hint: 'loading' });
    const card = host.querySelector('.chora-stat-card');
    expect(card?.getAttribute('aria-label')).toBe('Avg: –, loading');
  });

  // ─── label + value markup are aria-hidden (read via aria-label only) ──

  it('marks label and value spans aria-hidden so AT reads the group aria-label', () => {
    setInputs({ label: 'Total points', value: 100 });
    const labelEl = host.querySelector('.chora-stat-card__label');
    const valueEl = host.querySelector('.chora-stat-card__value');
    expect(labelEl?.getAttribute('aria-hidden')).toBe('true');
    expect(valueEl?.getAttribute('aria-hidden')).toBe('true');
  });
});
