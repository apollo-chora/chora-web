/**
 * AiCompanionBadgeComponent — ADR-225 persistent "AI companion" badge
 * (EU AI Act Art 50 + IMDA MGF D2 transparency).
 *
 * A small, always-present disclosure chip mounted on AI (Familiar) surfaces —
 * the Familiar chat header and the Familiar profile header. It renders the
 * BFF-served `disclosure.badge` label + tooltip DIRECTLY (governance-config
 * source of truth); it shows NOTHING until the disclosure loads (no fabricated
 * fallback copy — fail-loud). Drives `ensureLoaded()` itself so it works
 * standalone wherever it is dropped.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { AiTransparencyService } from '../../../core/services/ai-transparency.service';
import type { AiDisclosureBadge } from '../../../core/services/ai-transparency.model';

@Component({
  selector: 'chora-ai-companion-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (badge(); as b) {
      <span
        class="ai-companion-badge"
        data-testid="ai-companion-badge"
        [attr.title]="b.tooltip"
        [attr.aria-label]="b.label + '. ' + b.tooltip">
        <i class="fa-solid fa-robot ai-companion-badge__icon" aria-hidden="true"></i>
        <span class="ai-companion-badge__label">{{ b.label }}</span>
      </span>
    }
  `,
  styleUrl: './ai-companion-badge.component.scss',
})
export class AiCompanionBadgeComponent {
  private readonly service = inject(AiTransparencyService);

  readonly badge = computed<AiDisclosureBadge | null>(
    () => this.service.disclosure()?.badge ?? null,
  );

  constructor() {
    this.service.ensureLoaded();
  }
}
