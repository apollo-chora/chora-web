import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AiLabelChipComponent } from './ai-label-chip.component';
import { AiTransparencyService } from '../../../core/services/ai-transparency.service';
import type {
  AiDisclosure,
  AiInlineLabelVariant,
} from '../../../core/services/ai-transparency.model';

/**
 * AiLabelChipComponent (ADR-225) — a reusable inline "AI-generated" /
 * "AI-assisted" / "AI-composed dose" chip. Renders the BFF-served
 * `disclosure.inlineLabels[variant]` label + tooltip DIRECTLY.
 */

function buildDisclosure(): AiDisclosure {
  return {
    version: '2026-07-07',
    locale: 'en',
    audienceVariant: 'standard',
    notice: { title: 't', body: 'b', action: 'Got it' },
    badge: { label: 'AI companion', tooltip: 'x' },
    inlineLabels: {
      aiGenerated: { label: 'AI-generated', tooltip: 'Created by AI.' },
      aiAssisted: { label: 'AI-assisted', tooltip: 'Drafted with AI help.' },
      doseHeader: {
        label: 'AI-composed dose',
        tooltip: 'Today’s dose was composed by AI.',
      },
    },
  };
}

class StubAiTransparencyService {
  readonly disclosure = signal<AiDisclosure | null>(null);
  ensureLoaded = vi.fn();
}

function setup(
  variant: AiInlineLabelVariant,
  withDisclosure = true,
): {
  fixture: ComponentFixture<AiLabelChipComponent>;
  element: HTMLElement;
  stub: StubAiTransparencyService;
} {
  const stub = new StubAiTransparencyService();
  if (withDisclosure) stub.disclosure.set(buildDisclosure());
  TestBed.configureTestingModule({
    imports: [AiLabelChipComponent],
    providers: [{ provide: AiTransparencyService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(AiLabelChipComponent);
  fixture.componentRef.setInput('variant', variant);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, stub };
}

describe('AiLabelChipComponent (ADR-225 inline AI label)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('drives ensureLoaded on init', () => {
    const { stub } = setup('aiGenerated');
    expect(stub.ensureLoaded).toHaveBeenCalled();
  });

  it('renders nothing until the disclosure loads', () => {
    const { element } = setup('aiGenerated', false);
    expect(element.querySelector('[data-testid="ai-label-chip"]')).toBeNull();
  });

  it('renders the aiGenerated label for variant=aiGenerated', () => {
    const { element } = setup('aiGenerated');
    const chip = element.querySelector('[data-testid="ai-label-chip"]');
    expect(chip?.textContent).toContain('AI-generated');
    expect(chip?.getAttribute('title')).toBe('Created by AI.');
  });

  it('renders the aiAssisted label for variant=aiAssisted', () => {
    const { element } = setup('aiAssisted');
    expect(
      element.querySelector('[data-testid="ai-label-chip"]')?.textContent,
    ).toContain('AI-assisted');
  });

  it('renders the doseHeader label for variant=doseHeader', () => {
    const { element } = setup('doseHeader');
    const chip = element.querySelector('[data-testid="ai-label-chip"]');
    expect(chip?.textContent).toContain('AI-composed dose');
    expect(chip?.getAttribute('title')).toBe('Today’s dose was composed by AI.');
  });

  it('has an accessible name composed from label + tooltip', () => {
    const { element } = setup('aiGenerated');
    const chip = element.querySelector('[data-testid="ai-label-chip"]');
    expect(chip?.getAttribute('aria-label')).toContain('AI-generated');
  });

  it('switches label when the variant input changes', () => {
    const { fixture, element } = setup('aiGenerated');
    expect(element.querySelector('[data-testid="ai-label-chip"]')?.textContent).toContain(
      'AI-generated',
    );
    fixture.componentRef.setInput('variant', 'doseHeader');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="ai-label-chip"]')?.textContent).toContain(
      'AI-composed dose',
    );
  });

  it('has no critical/serious axe violations', async () => {
    const { fixture } = setup('aiGenerated');
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.length).toBe(0);
  });
});
