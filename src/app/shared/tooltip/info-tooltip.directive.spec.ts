import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InfoTooltipDirective, tooltipSideFor } from './info-tooltip.directive';
import { TooltipRegistryService } from './tooltip-registry';
import { TranslateService } from '../../core/services/translate.service';

/** Build a 'pointerdown' event with a chosen pointerType (jsdom lacks PointerEvent ctor). */
function pointerDown(type: 'touch' | 'mouse'): Event {
  const event = new Event('pointerdown');
  Object.defineProperty(event, 'pointerType', { value: type });
  return event;
}

/** Deterministic copy for the seeded `mana` key. */
const COPY: Record<string, string> = {
  'tooltips.mana.label': 'Mana',
  'tooltips.mana.description': 'Your shared AI budget.',
};

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

@Component({
  standalone: true,
  imports: [InfoTooltipDirective],
  template: `<span class="host" [choraInfo]="key">Mana</span>`,
})
class HostComponent {
  key = 'mana';
}

describe('InfoTooltipDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  function setup(key = 'mana'): void {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        TooltipRegistryService,
        { provide: TranslateService, useValue: { instant: (k: string) => COPY[k] ?? k } },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.key = key;
    fixture.detectChanges();
  }

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.chora-info-trigger') as HTMLButtonElement;
  }

  /** The portaled tooltip body, if currently open. */
  function openTip(): HTMLElement | null {
    return document.querySelector('chora-tooltip .chora-tooltip');
  }

  afterEach(() => {
    fixture?.destroy();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('renders an accessible info trigger (fa-circle-info icon + aria-label) for a seeded key', () => {
    setup('mana');
    const btn = trigger();
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('Mana');
    expect(btn.querySelector('i.fa-circle-info')).not.toBeNull();
  });

  it('renders NO affordance for an unknown key (graceful fallback)', () => {
    setup('totally_unknown_key');
    expect(trigger()).toBeNull();
  });

  it('opens the tooltip on hover, wires aria-describedby, and renders registry copy', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new MouseEvent('mouseenter'));

    const tip = openTip();
    expect(tip).not.toBeNull();
    expect(tip?.getAttribute('role')).toBe('tooltip');

    const id = tip?.getAttribute('id');
    expect(id).toBeTruthy();
    expect(btn.getAttribute('aria-describedby')).toBe(id);

    expect(tip?.querySelector('.chora-tooltip__label')?.textContent?.trim()).toBe('Mana');
    expect(tip?.querySelector('.chora-tooltip__description')?.textContent?.trim()).toBe(
      'Your shared AI budget.',
    );
  });

  it('closes on mouseleave and clears aria-describedby', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(openTip()).not.toBeNull();

    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(openTip()).toBeNull();
    expect(btn.getAttribute('aria-describedby')).toBeNull();
  });

  it('opens on focus and closes on blur (keyboard accessible, not hover-only)', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new FocusEvent('focus'));
    expect(openTip()).not.toBeNull();

    btn.dispatchEvent(new FocusEvent('blur'));
    expect(openTip()).toBeNull();
  });

  it('toggles on click (tablet tap-to-toggle)', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new MouseEvent('click'));
    expect(openTip()).not.toBeNull();

    btn.dispatchEvent(new MouseEvent('click'));
    expect(openTip()).toBeNull();
  });

  it('closes when Escape is pressed', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new FocusEvent('focus'));
    expect(openTip()).not.toBeNull();

    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(openTip()).toBeNull();
  });

  it('honours prefers-reduced-motion (fade-only) on the opened tooltip', () => {
    const original = window.matchMedia;
    window.matchMedia = stubMatchMedia(true);
    try {
      setup();
      trigger().dispatchEvent(new MouseEvent('mouseenter'));
      expect(openTip()?.classList.contains('chora-tooltip--reduced-motion')).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });

  it('re-opens after closing, reusing the overlay', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new FocusEvent('focus'));
    expect(openTip()).not.toBeNull();
    btn.dispatchEvent(new FocusEvent('blur'));
    expect(openTip()).toBeNull();
    // Second open reuses the cached OverlayRef rather than creating a new one.
    btn.dispatchEvent(new FocusEvent('focus'));
    expect(openTip()).not.toBeNull();
  });

  it('suppresses the synthetic hover + focus a tap fires, leaving click to drive the toggle', () => {
    setup();
    const btn = trigger();
    // A tap = pointerdown(touch) then browser-synthesised mouseenter + focus.
    btn.dispatchEvent(pointerDown('touch'));
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    btn.dispatchEvent(new FocusEvent('focus'));
    expect(openTip()).toBeNull(); // hover/focus suppressed during the touch

    btn.dispatchEvent(new MouseEvent('click'));
    expect(openTip()).not.toBeNull(); // the tap's click opens it
  });

  it('treats a non-touch (mouse) pointerdown as a no-op so hover still opens', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(pointerDown('mouse'));
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(openTip()).not.toBeNull();
  });

  it('ignores a repeat open while already open (single tooltip, no duplicate)', () => {
    setup();
    const btn = trigger();
    btn.dispatchEvent(new FocusEvent('focus'));
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('chora-tooltip').length).toBe(1);
  });

  it('is a harmless no-op when closed before ever opening', () => {
    setup();
    const btn = trigger();
    expect(() => btn.dispatchEvent(new MouseEvent('mouseleave'))).not.toThrow();
    expect(openTip()).toBeNull();
  });
});

describe('tooltipSideFor', () => {
  it('maps overlayY=bottom to "above" (tooltip pinned above the trigger)', () => {
    expect(tooltipSideFor('bottom')).toBe('above');
  });

  it('maps overlayY=top / center to "below"', () => {
    expect(tooltipSideFor('top')).toBe('below');
    expect(tooltipSideFor('center')).toBe('below');
  });
});
