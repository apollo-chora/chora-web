/**
 * AtomAttemptService - A+ atom-playback provider (Phyllis demo Step 7).
 *
 * Wired LIVE 2026-05-15 (post chora-creation `AtomRepository` RLS fix
 * `827deff6`): calls the real BFF routes
 *   GET  /api/atoms/{atomId}                         → chora-gateway → chora-creation
 *   POST /api/atoms/{atomId}/session                 → chora-gateway → chora-consumption
 *   POST /api/atoms/{atomId}/session/submit          → chora-gateway → chora-consumption
 *
 * Replaces the wave-2 mock provider that returned `of(CSPO_ATOM_FIXTURE)`
 * + `of(EIRA_HINT_FIXTURE)`. No more `void this.bff` — every method is a
 * real `bff.get/post` against the gateway-facing route. No mock fallback
 * (no-stubs / no-debts directive 2026-05-14, memory
 * `feedback_no_stubs_real_wiring`).
 *
 * Cloud Armor caveat — `POST /api/atoms/{atomId}/session/submit` is
 * edge-blocked (INFRA-3) with a 403 HTML response while the WAF
 * `chora-armor-policy` over-aggressively blocks POST-with-body. The FE
 * is wired correctly and surfaces the 403 honestly through the
 * fail-loud `AsyncState` — works the moment infra picks a Cloud Armor
 * fix path (A / B / C per `docs/m13/handoff-to-infra-claude-2026-05-14.md`
 * §8 INFRA-3). The session-start POST has **no body**, so Cloud Armor
 * passes it cleanly (201 Created).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AtomAttempt,
  AtomAttemptLoadState,
  AtomAttemptStartState,
  AtomAttemptSubmitState,
  LearningAtom,
  LearningAtomEnvelope,
  SubmissionResult,
} from './atomic-session.model';

@Injectable({ providedIn: 'root' })
export class AtomAttemptService {
  private readonly bff = inject(BffClientService);

  // ── Atom-load state (GET /api/atoms/{atomId}) ─────────────────────
  private readonly _loadState = signal<AtomAttemptLoadState>({ status: 'loading' });
  readonly loadState = this._loadState.asReadonly();
  /** Convenience selector: the atom when success, else `null`. */
  readonly atom = computed<LearningAtom | null>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.atom : null;
  });

  // ── Session-start state (POST /api/atoms/{atomId}/session) ─────────
  private readonly _startState = signal<AtomAttemptStartState>({ status: 'idle' });
  readonly startState = this._startState.asReadonly();
  /** Convenience selector: the session when started, else `null`. */
  readonly session = computed<AtomAttempt | null>(() => {
    const s = this._startState();
    return s.status === 'started' ? s.session : null;
  });

  // ── Submit state (POST /api/atoms/{atomId}/session/submit) ─────────
  private readonly _submitState = signal<AtomAttemptSubmitState>({ status: 'idle' });
  readonly submitState = this._submitState.asReadonly();

  /**
   * Clear the PREVIOUS atom's session view (CHO-2350).
   *
   * `load()` deliberately does not touch these: a retry after a load error
   * must not discard an in-flight session. But moving to a DIFFERENT atom
   * must, or the next atom renders already "Graded." with the last atom's
   * outcome.
   */
  resetSession(): void {
    this._startState.set({ status: 'idle' });
    this._submitState.set({ status: 'idle' });
  }

  /**
   * Fetch the atom and publish to `loadState`. Called by the component
   * on init + by the retry CTA. Safe to call repeatedly.
   */
  load(atomId: string): void {
    this._loadState.set({ status: 'loading' });
    this.bff
      .get<LearningAtomEnvelope>('/api/atoms/' + encodeURIComponent(atomId))
      .pipe(
        take(1),
        map(
          (envelope): AtomAttemptLoadState => ({
            status: 'success',
            atom: envelope.atom,
            partial: envelope.session_error ?? null,
          }),
        ),
        catchError((err: unknown) =>
          of<AtomAttemptLoadState>({
            status: 'error',
            error: this.loadErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._loadState.set(s));
  }

  /**
   * Start a new AtomAttempt against `atomId`. No body - the gateway
   * synthesises `{atom_id}` from the path → chora-consumption POST. Cloud
   * Armor passes no-body POSTs cleanly (the WAF false-positives match
   * SQL/XSS patterns in the BODY, not in the path).
   */
  start(atomId: string): void {
    this._startState.set({ status: 'starting' });
    this.bff
      .post<AtomAttempt>(
        '/api/atoms/' + encodeURIComponent(atomId) + '/session',
        {},
      )
      .pipe(
        take(1),
        map(
          (session): AtomAttemptStartState => ({
            status: 'started',
            session,
          }),
        ),
        catchError((err: unknown) =>
          of<AtomAttemptStartState>({
            status: 'error',
            error: this.startErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._startState.set(s));
  }

  /**
   * Submit an answer for the started session. Body shape per BE round-9:
   * must include `session_id` (from `start()` response) plus the answer
   * fields. The gateway lifts the body into
   * `POST /v1/me/atom-sessions/{session_id}/answers` → MCQ grade.
   *
   * Currently fails loud at Cloud Armor's edge (INFRA-3) — the 403 HTML
   * response surfaces as `submitState.status === 'error'`. No mock
   * fallback; demo step 7's submit will visibly fail until Cloud Armor
   * is tuned.
   */
  submit(atomId: string, body: Record<string, unknown>): void {
    this._submitState.set({ status: 'submitting' });
    this.bff
      .post<SubmissionResult>(
        '/api/atoms/' + encodeURIComponent(atomId) + '/session/submit',
        body,
      )
      .pipe(
        take(1),
        map(
          (result): AtomAttemptSubmitState => ({
            status: 'graded',
            result,
          }),
        ),
        catchError((err: unknown) =>
          of<AtomAttemptSubmitState>({
            status: 'error',
            error: this.submitErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._submitState.set(s));
  }

  private loadErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.atomic_session.error_atom_not_found';
      if (e.status >= 500) return 'aplus.atomic_session.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atomic_session.error_unauthorised';
      }
    }
    return 'aplus.atomic_session.error_generic';
  }

  private startErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.atomic_session.start_error_atom_not_found';
      if (e.status >= 500) return 'aplus.atomic_session.start_error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atomic_session.start_error_unauthorised';
      }
    }
    return 'aplus.atomic_session.start_error_generic';
  }

  private submitErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 403) return 'aplus.atomic_session.submit_error_edge_blocked';
      if (e.status === 404) return 'aplus.atomic_session.submit_error_session_not_found';
      if (e.status >= 500) return 'aplus.atomic_session.submit_error_upstream';
      if (e.status === 401) return 'aplus.atomic_session.submit_error_unauthorised';
    }
    return 'aplus.atomic_session.submit_error_generic';
  }
}
