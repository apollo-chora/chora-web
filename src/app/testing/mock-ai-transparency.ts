/**
 * Test stub for {@link AiTransparencyService} (ADR-225).
 *
 * The ADR-225 transparency chips/badge/notice self-load via `ensureLoaded()`
 * on construction. When they are dropped into another component's template
 * (e.g. the Familiar chat, the Daily Dose), that host's spec would otherwise
 * fire an unexpected `GET /api/v1/me/ai-transparency` (and depend on a real
 * `TranslateService.currentLang()`). Provide this stub in such host specs so
 * the transparency wiring is inert and the host is tested in isolation.
 */
import { Provider, signal } from '@angular/core';
import { AiTransparencyService } from '../core/services/ai-transparency.service';
import type {
  AiAcknowledgeState,
  AiDisclosure,
  AiTransparencyLoadState,
  AiTransparencyStatus,
} from '../core/services/ai-transparency.model';

/** Build an inert stub — no HTTP, no disclosure, notice hidden. */
export function buildAiTransparencyStub(disclosure: AiDisclosure | null = null) {
  return {
    disclosure: signal<AiDisclosure | null>(disclosure),
    transparency: signal<AiTransparencyStatus | null>(null),
    mustAcknowledge: signal(false),
    loadState: signal<AiTransparencyLoadState>({ status: 'idle' }),
    ackState: signal<AiAcknowledgeState>({ status: 'idle' }),
    ensureLoaded: (): void => undefined,
    getTransparency: (): void => undefined,
    acknowledge: (): void => undefined,
    clearAckState: (): void => undefined,
  };
}

/** A ready-to-spread Angular provider wiring the stub in a host spec. */
export function provideMockAiTransparency(): Provider {
  return { provide: AiTransparencyService, useValue: buildAiTransparencyStub() };
}
