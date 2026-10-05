/**
 * AiTransparencyService — ADR-225 notice-only AI transparency (EU AI Act
 * Art 50 + IMDA MGF D2 transparency / D4 fairness-and-human-oversight).
 *
 * Wraps two BFF endpoints (camelCase over the wire — governance-config
 * source of truth):
 *   GET  /api/v1/me/ai-transparency?locale={loc} — the localised disclosure +
 *        whether this learner must acknowledge the one-time first-interaction
 *        notice.
 *   POST /api/v1/me/ai-transparency/acknowledge  — record the acknowledgement
 *        (an ACKNOWLEDGEMENT, not a consent gate — idempotent, 201 on repeat).
 *
 * Consumers (all read the same singleton signals):
 *   - AiTransparencyNoticeComponent — the one-time "Got it" notice modal.
 *   - AiCompanionBadgeComponent      — the persistent "AI companion" badge.
 *   - AiLabelChipComponent           — inline "AI-generated" / "AI-assisted" /
 *     "AI-composed dose" chips.
 *
 * Pattern: §2 signal-backed `AsyncState` discriminated union (fail-loud — no
 * mock fallback, never fabricate a disclosure on a 4xx/5xx). `ensureLoaded`
 * fetches the disclosure ONCE per app session; `acknowledge` optimistically
 * flips `mustAcknowledge` to false on success so the notice dismisses without
 * a refetch round-trip.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from './bff-client.service';
import { TranslateService } from './translate.service';
import type {
  AiAcknowledgeRequest,
  AiAcknowledgeResponse,
  AiAcknowledgeState,
  AiDisclosure,
  AiTransparencyLoadState,
  AiTransparencyStatus,
} from './ai-transparency.model';

@Injectable({ providedIn: 'root' })
export class AiTransparencyService {
  private readonly bff = inject(BffClientService);
  private readonly translate = inject(TranslateService);

  // ── Load state (GET /api/v1/me/ai-transparency) ────────────────────
  private readonly _loadState = signal<AiTransparencyLoadState>({ status: 'idle' });
  readonly loadState = this._loadState.asReadonly();

  // ── Acknowledge state (POST .../acknowledge) ───────────────────────
  private readonly _ackState = signal<AiAcknowledgeState>({ status: 'idle' });
  readonly ackState = this._ackState.asReadonly();

  /**
   * Local echo of a successful acknowledge this session — flips
   * `mustAcknowledge` to false immediately so the notice dismisses without a
   * refetch (the BE's next GET would also report false).
   */
  private readonly _acknowledgedLocally = signal(false);

  /** The full loaded transparency status, or null when not yet loaded/errored. */
  readonly transparency = computed<AiTransparencyStatus | null>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.transparency : null;
  });

  /** The loaded disclosure payload, or null. Rendered DIRECTLY by consumers. */
  readonly disclosure = computed<AiDisclosure | null>(
    () => this.transparency()?.disclosure ?? null,
  );

  /**
   * Whether the one-time first-interaction notice must be shown. True only when
   * the disclosure is loaded, the BE says so, AND it hasn't been acknowledged
   * locally this session. Fail-closed: any load error reads false (no gate on a
   * fabricated disclosure).
   */
  readonly mustAcknowledge = computed<boolean>(() => {
    if (this._acknowledgedLocally()) return false;
    return this.transparency()?.mustAcknowledge ?? false;
  });

  /**
   * Fetch the caller's locale-scoped disclosure. Safe to call repeatedly (e.g.
   * on a locale switch). `locale` defaults to the active UI language.
   */
  getTransparency(locale?: string): void {
    this._loadState.set({ status: 'loading' });
    const loc = locale ?? this.translate.currentLang();
    const params = new HttpParams().set('locale', loc);
    this.bff
      .get<AiTransparencyStatus>('/api/v1/me/ai-transparency', params)
      .pipe(
        take(1),
        map(
          (transparency): AiTransparencyLoadState => ({
            status: 'success',
            transparency,
          }),
        ),
        catchError((err: unknown) =>
          of<AiTransparencyLoadState>({
            status: 'error',
            error: this.loadErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._loadState.set(s));
  }

  /**
   * Idempotent loader — the notice/badge/chip all call this on init. Skips
   * when a load is already in flight or has succeeded; RETRIES after a prior
   * error (fail-loud: a transient 503 must not permanently suppress a mandated
   * disclosure — the next mount/navigation re-attempts).
   */
  ensureLoaded(locale?: string): void {
    const status = this._loadState().status;
    if (status === 'loading' || status === 'success') return;
    this.getTransparency(locale);
  }

  /**
   * Record the first-interaction acknowledgement. `surface` + `scope` are
   * REQUIRED; `disclosureVersion` + `locale` are back-filled from the loaded
   * disclosure when the caller omits them. Idempotent — a repeat still resolves
   * success (201). On success, `mustAcknowledge` flips false (local echo).
   */
  acknowledge(req: AiAcknowledgeRequest): void {
    this._ackState.set({ status: 'submitting' });
    const disclosure = this.disclosure();
    const body: AiAcknowledgeRequest = {
      surface: req.surface,
      scope: req.scope,
      disclosureVersion: req.disclosureVersion ?? disclosure?.version,
      locale: req.locale ?? disclosure?.locale ?? this.translate.currentLang(),
      ...(req.firstShownAt ? { firstShownAt: req.firstShownAt } : {}),
    };
    this.bff
      .post<AiAcknowledgeResponse>('/api/v1/me/ai-transparency/acknowledge', body)
      .pipe(
        take(1),
        map(
          (result): AiAcknowledgeState => ({ status: 'success', result }),
        ),
        catchError((err: unknown) =>
          of<AiAcknowledgeState>({
            status: 'error',
            error: this.ackErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._ackState.set(s);
        if (s.status === 'success' && s.result.acknowledged) {
          this._acknowledgedLocally.set(true);
        }
      });
  }

  /** Reset the acknowledge state (e.g. before a retry). */
  clearAckState(): void {
    this._ackState.set({ status: 'idle' });
  }

  // ── Error mapping (i18n keys — chrome only, disclosure copy is BFF-served) ──
  private loadErrorKey(err: unknown): string {
    const e = err as { status?: number; error?: { code?: string } };
    if (e?.error?.code === 'GOV_TRANSPARENCY_UNAVAILABLE' || e?.status === 503) {
      return 'core.ai_transparency.error_unavailable';
    }
    if (typeof e?.status === 'number') {
      if (e.status === 400) return 'core.ai_transparency.error_invalid';
      if (e.status === 401 || e.status === 403) {
        return 'core.ai_transparency.error_unauthorised';
      }
      if (e.status >= 500) return 'core.ai_transparency.error_upstream';
    }
    return 'core.ai_transparency.error_generic';
  }

  private ackErrorKey(err: unknown): string {
    const e = err as { status?: number; error?: { code?: string } };
    if (e?.error?.code === 'GOV_TRANSPARENCY_UNAVAILABLE' || e?.status === 503) {
      return 'core.ai_transparency.ack_error_unavailable';
    }
    if (typeof e?.status === 'number') {
      if (e.status === 400) return 'core.ai_transparency.ack_error_invalid';
      if (e.status === 401 || e.status === 403) {
        return 'core.ai_transparency.ack_error_unauthorised';
      }
      if (e.status >= 500) return 'core.ai_transparency.ack_error_upstream';
    }
    return 'core.ai_transparency.ack_error_generic';
  }
}
