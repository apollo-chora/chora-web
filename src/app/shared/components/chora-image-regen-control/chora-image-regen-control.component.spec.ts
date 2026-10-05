/**
 * chora-image-regen-control.component.spec.ts — CHO-1824 P5.3b.
 *
 * Shared, presentational image-regenerate control: a refined-prompt input +
 * Regenerate button + spinner/error. It owns NO service — the host wires the
 * (regenerate) output to its own orchestration (reused across A+ batch-authoring
 * and R+ assessment-authoring). DRY for the verbose regen UI.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChoraImageRegenControlComponent } from './chora-image-regen-control.component';

describe('ChoraImageRegenControlComponent', () => {
  let fixture: ComponentFixture<ChoraImageRegenControlComponent>;
  let component: ChoraImageRegenControlComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraImageRegenControlComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ChoraImageRegenControlComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('placement', 'stem');
    fixture.detectChanges();
  });

  it('renders a prompt input and a regenerate button', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="image-regen-input"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="image-regen-button"]')).toBeTruthy();
  });

  it('emits the trimmed prompt on submit', () => {
    let emitted: string | undefined;
    component.regenerate.subscribe((p) => (emitted = p));
    component.onPromptInput('  a clearer diagram  ');
    component.submit();
    expect(emitted).toBe('a clearer diagram');
  });

  it('does not emit when the prompt is blank', () => {
    let count = 0;
    component.regenerate.subscribe(() => (count += 1));
    component.onPromptInput('   ');
    component.submit();
    expect(count).toBe(0);
  });

  it('does not emit while a regeneration is in flight', () => {
    let count = 0;
    component.regenerate.subscribe(() => (count += 1));
    fixture.componentRef.setInput('regenerating', true);
    component.onPromptInput('x');
    component.submit();
    expect(count).toBe(0);
  });

  it('disables the button while regenerating', () => {
    fixture.componentRef.setInput('regenerating', true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="image-regen-button"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders an inline error (role=alert) when error is set', () => {
    fixture.componentRef.setInput('error', 'some.error.key');
    fixture.detectChanges();
    const err = fixture.nativeElement.querySelector('[data-testid="image-regen-error"]');
    expect(err).toBeTruthy();
    expect(err.getAttribute('role')).toBe('alert');
  });

  it('prefixes test ids with testIdPrefix for per-instance uniqueness', () => {
    fixture.componentRef.setInput('testIdPrefix', 'd1-stem-');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="d1-stem-image-regen-button"]'),
    ).toBeTruthy();
  });

  it('has no critical/serious axe violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
  });
});
