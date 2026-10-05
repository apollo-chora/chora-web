import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModerationFeedbackPanelComponent } from './moderation-feedback-panel.component';
import { TranslateService } from '../../../core/services/translate.service';
import { buildModerationVerdict } from '../../../testing/builders/buildModerationVerdict';

describe('ModerationFeedbackPanelComponent', () => {
  let fixture: ComponentFixture<ModerationFeedbackPanelComponent>;
  let component: ModerationFeedbackPanelComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModerationFeedbackPanelComponent],
      providers: [TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationFeedbackPanelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  function render(verdict = buildModerationVerdict()): void {
    fixture.componentRef.setInput('verdict', verdict);
    fixture.detectChanges();
  }

  it('creates', () => {
    render();
    expect(component).toBeTruthy();
  });

  it('exposes role="alert" + aria-live="polite" on the panel', () => {
    render();
    const panel = element.querySelector('[data-testid="moderation-feedback-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('role')).toBe('alert');
    expect(panel!.getAttribute('aria-live')).toBe('polite');
  });

  describe('refine verdict', () => {
    it('renders the reason text', () => {
      render(buildModerationVerdict({ verdict: 'refine', reason: 'Be kinder.' }));
      const reason = element.querySelector('[data-testid="moderation-feedback-reason"]');
      expect(reason!.textContent).toContain('Be kinder.');
    });

    it('renders the "Accept rewrite" CTA when suggested_rewrite is present', () => {
      render(
        buildModerationVerdict({
          verdict: 'refine',
          suggested_rewrite: 'A kinder version.',
        }),
      );
      const cta = element.querySelector('[data-testid="moderation-accept-rewrite"]');
      expect(cta).not.toBeNull();
    });

    it('does NOT render the "Accept rewrite" CTA when suggested_rewrite is absent', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: undefined }),
      );
      const cta = element.querySelector('[data-testid="moderation-accept-rewrite"]');
      expect(cta).toBeNull();
    });

    it('emits acceptRewrite with the suggested_rewrite string', () => {
      const rewrite = 'A kinder version of the post.';
      render(buildModerationVerdict({ verdict: 'refine', suggested_rewrite: rewrite }));
      let emitted: string | undefined;
      component.acceptRewrite.subscribe((v: string) => (emitted = v));

      (
        element.querySelector(
          '[data-testid="moderation-accept-rewrite"]',
        ) as HTMLButtonElement
      ).click();

      expect(emitted).toBe(rewrite);
    });

    it('renders a dismiss control', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      expect(
        element.querySelector('[data-testid="moderation-dismiss"]'),
      ).not.toBeNull();
    });
  });

  describe('reject verdict', () => {
    it('renders the reason text', () => {
      render(
        buildModerationVerdict({
          verdict: 'reject',
          reason: 'Violates guidelines.',
          suggested_rewrite: undefined,
        }),
      );
      const reason = element.querySelector('[data-testid="moderation-feedback-reason"]');
      expect(reason!.textContent).toContain('Violates guidelines.');
    });

    it('renders the "Edit and retry" CTA', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      expect(
        element.querySelector('[data-testid="moderation-edit-retry"]'),
      ).not.toBeNull();
    });

    it('does NOT render the "Accept rewrite" CTA', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      expect(
        element.querySelector('[data-testid="moderation-accept-rewrite"]'),
      ).toBeNull();
    });

    it('emits editRetry when "Edit and retry" is clicked', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      let emitted = false;
      component.editRetry.subscribe(() => (emitted = true));

      (
        element.querySelector(
          '[data-testid="moderation-edit-retry"]',
        ) as HTMLButtonElement
      ).click();

      expect(emitted).toBe(true);
    });
  });

  describe('unknown verdict', () => {
    it('renders a generic fail-safe message', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      const msg = element.querySelector('[data-testid="moderation-feedback-message"]');
      expect(msg).not.toBeNull();
      expect((msg!.textContent ?? '').length).toBeGreaterThan(0);
    });

    it('renders the "Edit and retry" CTA', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      expect(
        element.querySelector('[data-testid="moderation-edit-retry"]'),
      ).not.toBeNull();
    });

    it('does NOT render the "Accept rewrite" CTA', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      expect(
        element.querySelector('[data-testid="moderation-accept-rewrite"]'),
      ).toBeNull();
    });

    it('emits editRetry when "Edit and retry" is clicked', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      let emitted = false;
      component.editRetry.subscribe(() => (emitted = true));

      (
        element.querySelector(
          '[data-testid="moderation-edit-retry"]',
        ) as HTMLButtonElement
      ).click();

      expect(emitted).toBe(true);
    });
  });

  describe('dismiss', () => {
    it('emits dismiss when the dismiss control is clicked', () => {
      render();
      let emitted = false;
      component.dismiss.subscribe(() => (emitted = true));

      (
        element.querySelector(
          '[data-testid="moderation-dismiss"]',
        ) as HTMLButtonElement
      ).click();

      expect(emitted).toBe(true);
    });
  });

  describe('headingKey computed', () => {
    it('builds the refine heading key', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      expect(component.headingKey()).toBe(
        'shared.moderation_feedback.heading_refine',
      );
    });

    it('builds the reject heading key', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      expect(component.headingKey()).toBe(
        'shared.moderation_feedback.heading_reject',
      );
    });

    it('builds the unknown heading key', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      expect(component.headingKey()).toBe(
        'shared.moderation_feedback.heading_unknown',
      );
    });

    it('renders the heading key text in the heading element', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      const heading = element.querySelector('.moderation-feedback-panel__heading');
      // Translate pipe returns the raw key when no translations are loaded.
      expect(heading!.textContent).toContain(
        'shared.moderation_feedback.heading_refine',
      );
    });
  });

  describe('canAcceptRewrite computed', () => {
    it('is true for refine with a non-empty suggested_rewrite', () => {
      render(
        buildModerationVerdict({
          verdict: 'refine',
          suggested_rewrite: 'A kinder version.',
        }),
      );
      expect(component.canAcceptRewrite()).toBe(true);
    });

    it('is false for refine with an undefined suggested_rewrite', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: undefined }),
      );
      expect(component.canAcceptRewrite()).toBe(false);
    });

    it('is false for refine with an empty-string suggested_rewrite', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: '' }),
      );
      expect(component.canAcceptRewrite()).toBe(false);
    });

    it('is false for reject even when a suggested_rewrite is present', () => {
      render(
        buildModerationVerdict({
          verdict: 'reject',
          suggested_rewrite: 'A rewrite that should be ignored.',
        }),
      );
      expect(component.canAcceptRewrite()).toBe(false);
    });

    it('is false for unknown even when a suggested_rewrite is present', () => {
      render(
        buildModerationVerdict({
          verdict: 'unknown',
          suggested_rewrite: 'A rewrite that should be ignored.',
        }),
      );
      expect(component.canAcceptRewrite()).toBe(false);
    });
  });

  describe('rewrite blockquote', () => {
    it('renders the suggested_rewrite text for refine', () => {
      const rewrite = 'Here is a clearer, kinder phrasing.';
      render(buildModerationVerdict({ verdict: 'refine', suggested_rewrite: rewrite }));
      const blockquote = element.querySelector('.moderation-feedback-panel__rewrite');
      expect(blockquote).not.toBeNull();
      expect(blockquote!.textContent).toContain(rewrite);
    });

    it('renders the rewrite label key', () => {
      render(
        buildModerationVerdict({
          verdict: 'refine',
          suggested_rewrite: 'A kinder version.',
        }),
      );
      const label = element.querySelector('.moderation-feedback-panel__rewrite-label');
      expect(label!.textContent).toContain(
        'shared.moderation_feedback.rewrite_label',
      );
    });

    it('does NOT render the rewrite blockquote when suggested_rewrite is absent', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: undefined }),
      );
      expect(
        element.querySelector('.moderation-feedback-panel__rewrite'),
      ).toBeNull();
    });

    it('does NOT render the rewrite blockquote for reject', () => {
      render(
        buildModerationVerdict({
          verdict: 'reject',
          suggested_rewrite: 'Should not show.',
        }),
      );
      expect(
        element.querySelector('.moderation-feedback-panel__rewrite'),
      ).toBeNull();
    });
  });

  describe('verdict CSS modifier classes', () => {
    it('applies neither --reject nor --unknown for refine', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      const panel = element.querySelector('[data-testid="moderation-feedback-panel"]')!;
      expect(panel.classList.contains('moderation-feedback-panel--reject')).toBe(false);
      expect(panel.classList.contains('moderation-feedback-panel--unknown')).toBe(false);
    });

    it('applies --reject for reject', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      const panel = element.querySelector('[data-testid="moderation-feedback-panel"]')!;
      expect(panel.classList.contains('moderation-feedback-panel--reject')).toBe(true);
      expect(panel.classList.contains('moderation-feedback-panel--unknown')).toBe(false);
    });

    it('applies --unknown for unknown', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      const panel = element.querySelector('[data-testid="moderation-feedback-panel"]')!;
      expect(panel.classList.contains('moderation-feedback-panel--unknown')).toBe(true);
      expect(panel.classList.contains('moderation-feedback-panel--reject')).toBe(false);
    });
  });

  describe('verdict icon', () => {
    it('renders the ✎ icon for refine', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      const icon = element.querySelector('.moderation-feedback-panel__icon');
      expect(icon!.textContent).toContain('✎');
    });

    it('renders the ⚠ icon for reject', () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      const icon = element.querySelector('.moderation-feedback-panel__icon');
      expect(icon!.textContent).toContain('⚠');
    });

    it('renders the ? fallback icon for unknown', () => {
      render(
        buildModerationVerdict({ verdict: 'unknown', suggested_rewrite: undefined }),
      );
      const icon = element.querySelector('.moderation-feedback-panel__icon');
      expect(icon!.textContent).toContain('?');
    });

    it('marks the icon aria-hidden', () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      const icon = element.querySelector('.moderation-feedback-panel__icon');
      expect(icon!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('unknown verdict message vs reason', () => {
    it('renders the generic unknown_message key (not the reason) for unknown', () => {
      render(
        buildModerationVerdict({
          verdict: 'unknown',
          reason: 'Internal reason that should be hidden.',
          suggested_rewrite: undefined,
        }),
      );
      const msg = element.querySelector('[data-testid="moderation-feedback-message"]');
      expect(msg!.textContent).toContain(
        'shared.moderation_feedback.unknown_message',
      );
      // The unknown branch hides the raw reason — only the generic message shows.
      expect(
        element.querySelector('[data-testid="moderation-feedback-reason"]'),
      ).toBeNull();
    });

    it('renders the reason (not the generic message) for refine', () => {
      render(buildModerationVerdict({ verdict: 'refine', reason: 'Tone it down.' }));
      expect(
        element.querySelector('[data-testid="moderation-feedback-message"]'),
      ).toBeNull();
      const reason = element.querySelector('[data-testid="moderation-feedback-reason"]');
      expect(reason!.textContent).toContain('Tone it down.');
    });
  });

  describe('onAcceptRewrite guard (direct invocation)', () => {
    it('does NOT emit acceptRewrite when suggested_rewrite is undefined', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: undefined }),
      );
      let emitted = false;
      component.acceptRewrite.subscribe(() => (emitted = true));

      component.onAcceptRewrite();

      expect(emitted).toBe(false);
    });

    it('does NOT emit acceptRewrite when suggested_rewrite is empty string', () => {
      render(
        buildModerationVerdict({ verdict: 'refine', suggested_rewrite: '' }),
      );
      let emitted = false;
      component.acceptRewrite.subscribe(() => (emitted = true));

      component.onAcceptRewrite();

      expect(emitted).toBe(false);
    });

    it('emits the rewrite string when present', () => {
      const rewrite = 'A directly-invoked rewrite.';
      render(buildModerationVerdict({ verdict: 'refine', suggested_rewrite: rewrite }));
      let emitted: string | undefined;
      component.acceptRewrite.subscribe((v: string) => (emitted = v));

      component.onAcceptRewrite();

      expect(emitted).toBe(rewrite);
    });
  });

  describe('CTA exclusivity', () => {
    it('renders accept-rewrite and hides edit-retry when canAcceptRewrite is true', () => {
      render(
        buildModerationVerdict({
          verdict: 'refine',
          suggested_rewrite: 'A kinder version.',
        }),
      );
      expect(
        element.querySelector('[data-testid="moderation-accept-rewrite"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="moderation-edit-retry"]'),
      ).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('has no critical/serious axe violations (refine)', async () => {
      render(buildModerationVerdict({ verdict: 'refine' }));
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.length).toBe(0);
    });

    it('has no critical/serious axe violations (reject)', async () => {
      render(
        buildModerationVerdict({ verdict: 'reject', suggested_rewrite: undefined }),
      );
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.length).toBe(0);
    });
  });
});
