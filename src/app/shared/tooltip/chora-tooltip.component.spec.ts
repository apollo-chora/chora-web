import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChoraTooltipComponent } from './chora-tooltip.component';

interface TooltipInputs {
  label: string;
  description: string;
  tooltipId: string;
  position: 'above' | 'below';
}

/** Build a matchMedia stub that always reports the given `matches`. */
function stubMatchMedia(matches: boolean): typeof window.matchMedia {
  return ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('ChoraTooltipComponent', () => {
  let fixture: ComponentFixture<ChoraTooltipComponent>;

  function create(inputs: Partial<TooltipInputs> = {}): HTMLElement {
    fixture = TestBed.createComponent(ChoraTooltipComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the label and description as two tiers', () => {
    const el = create({ label: 'Mana', description: 'Your shared AI budget.' });
    expect(el.querySelector('.chora-tooltip__label')?.textContent?.trim()).toBe('Mana');
    expect(el.querySelector('.chora-tooltip__description')?.textContent?.trim()).toBe(
      'Your shared AI budget.',
    );
  });

  it('exposes role=tooltip and the supplied id (the aria-describedby target)', () => {
    const el = create({ label: 'Mana', tooltipId: 'chora-tooltip-7' });
    const tip = el.querySelector('.chora-tooltip');
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.getAttribute('id')).toBe('chora-tooltip-7');
  });

  it('omits the description tier when no description is supplied', () => {
    const el = create({ label: 'Mana' });
    expect(el.querySelector('.chora-tooltip__description')).toBeNull();
  });

  it('flips to the above-trigger modifier when position=above', () => {
    const el = create({ label: 'x', position: 'above' });
    expect(el.querySelector('.chora-tooltip')?.classList.contains('chora-tooltip--above')).toBe(
      true,
    );
  });

  it('defaults to below the trigger (no above modifier)', () => {
    const el = create({ label: 'x' });
    expect(el.querySelector('.chora-tooltip')?.classList.contains('chora-tooltip--above')).toBe(
      false,
    );
  });

  it('adds the reduced-motion modifier when the OS prefers reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = stubMatchMedia(true);
    try {
      const el = create({ label: 'x' });
      expect(
        el.querySelector('.chora-tooltip')?.classList.contains('chora-tooltip--reduced-motion'),
      ).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });

  it('keeps full motion when reduced motion is not requested', () => {
    const original = window.matchMedia;
    window.matchMedia = stubMatchMedia(false);
    try {
      const el = create({ label: 'x' });
      expect(
        el.querySelector('.chora-tooltip')?.classList.contains('chora-tooltip--reduced-motion'),
      ).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
