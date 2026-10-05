import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CplusStatCardComponent } from './cplus-stat-card.component';

describe('CplusStatCardComponent', () => {
  let fixture: ComponentFixture<CplusStatCardComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusStatCardComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusStatCardComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setInputs(
    inputs: Partial<{
      label: string;
      value: string | number;
      hint: string;
      accent: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
      state: 'value' | 'pending';
    }>,
  ): void {
    if (inputs.label !== undefined) fixture.componentRef.setInput('label', inputs.label);
    if (inputs.value !== undefined) fixture.componentRef.setInput('value', inputs.value);
    if (inputs.hint !== undefined) fixture.componentRef.setInput('hint', inputs.hint);
    if (inputs.accent !== undefined) fixture.componentRef.setInput('accent', inputs.accent);
    if (inputs.state !== undefined) fixture.componentRef.setInput('state', inputs.state);
    fixture.detectChanges();
  }

  it('renders the micro-label upper-cased', () => {
    setInputs({ label: 'Total shares', value: 100 });
    expect(host.querySelector('.cplus-stat-card__label')?.textContent?.trim()).toBe('Total shares');
  });

  it('renders the numeric value', () => {
    setInputs({ label: 'Points', value: 42 });
    expect(host.querySelector('.cplus-stat-card__value')?.textContent?.trim()).toBe('42');
  });

  it('renders a hyphen when state is pending', () => {
    setInputs({ label: 'Avg', value: 0, state: 'pending' });
    expect(host.querySelector('.cplus-stat-card__value')?.textContent?.trim()).toBe('-');
  });

  it('exposes an aria-label combining label, value and hint', () => {
    setInputs({ label: 'Streak', value: 7, hint: 'days' });
    const root = host.querySelector('.cplus-stat-card');
    expect(root?.getAttribute('aria-label')).toBe('Streak: 7, days');
  });

  it('applies the accent as a data attribute, not a side-stripe', () => {
    setInputs({ label: 'Wins', value: 3, accent: 'success' });
    const root = host.querySelector('.cplus-stat-card');
    expect(root?.getAttribute('data-accent')).toBe('success');
    // Anti-slop guard: no `::before` pseudo generates a colored stripe. The
    // host carries no marker class that the SCSS would stripe via ::before.
    expect(root?.classList.contains('has-stripe')).toBe(false);
  });

  it('has no critical/serious axe violations', async () => {
    setInputs({ label: 'Score', value: 99 });
    const axe = (await import('axe-core')).default;
    const results = await axe.run(host);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
