/**
 * FarSightComponent — the A+ "Far Sight" Seeker surface (P5 Far Sight, CHO-2113
 * step 3). The learner points a matured Familiar at the WEB through the ONE
 * governed egress: chora-model-gateway's grounded-search surface (Armor-screened,
 * mana-metered, external_egress-gated). Two Seekers:
 *   - fact_check   — verify a CLAIM against grounded, cited web sources (verdict).
 *   - web_research — research a DIRECTION into a durable, cited memory note.
 *
 * The result panel renders, with a progressive/staggered reveal (Dale's design
 * language — cubic-bezier(0.165,0.84,0.44,1) + translate3d): the verdict/note,
 * the grounded web SOURCES (IMDA D2 — domain·title·link·snippet), the Google
 * Search-Suggestions CHIP verbatim (Google ToS display obligation, ADR-231 D5),
 * and a live-web-search DISCLOSURE.
 *
 * Fail-loud (feedback_no_stubs_real_wiring): the invoke is a real
 * FamiliarGrowthService.invokeSkill call; 402 insufficient_mana / 409
 * (not owned/equipped/active/stage) / 403 external_egress_disabled surface
 * honestly in the error banner — never a fabricated verdict.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { GroundedAttributionComponent } from '../../../../shared/components/grounded-attribution/grounded-attribution.component';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import type { SkillInvokeResult } from '../../../../core/familiar/familiar-growth.model';

/** The two grounded-egress Seekers this surface drives. */
type SeekerKey = 'fact_check' | 'web_research';

/** Screened input bounds mirror the BE (familiar_skill_invoke_seeker.go). */
const CLAIM_MAX = 200;
const DIRECTION_MAX = 120;

type InvokeState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'chora-aplus-far-sight',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, GroundedAttributionComponent],
  templateUrl: './far-sight.component.html',
  styleUrl: './far-sight.component.scss',
})
export class FarSightComponent {
  private readonly growth = inject(FamiliarGrowthService);
  private readonly activeFamiliar = inject(ActiveFamiliarService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly claimMax = CLAIM_MAX;
  readonly directionMax = DIRECTION_MAX;

  /** Which Seeker is aimed. */
  readonly seeker = signal<SeekerKey>('fact_check');

  /** The active Familiar the Seeker runs on (must be st5 + own the skill). */
  readonly familiarId = computed(() => this.activeFamiliar.active()?.familiarId ?? '');

  readonly state = signal<InvokeState>('idle');
  readonly result = signal<SkillInvokeResult | null>(null);
  /** i18n key of the last invoke error (null when none). */
  readonly errorKey = signal<string | null>(null);

  /** One reactive form; the visible controls switch on the aimed Seeker. */
  readonly form = this.fb.nonNullable.group({
    claim: ['', [Validators.maxLength(CLAIM_MAX)]],
    direction: ['', [Validators.maxLength(DIRECTION_MAX)]],
    depth: ['survey' as 'survey' | 'deep'],
  });

  /** The form value as a SIGNAL so {@link canAim} recomputes as the learner
   * types (a plain form.getRawValue() read in a computed is not reactive). */
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // The grounded sources, the "what I searched" line, Google's chip (and the
  // `bypassSecurityTrustHtml` its ToS forces) and the ADR-225 disclosure all now
  // live in ONE shared component — <chora-grounded-attribution> (CHO-2179). This
  // surface passes the SkillInvokeResult's three grounded channels straight to
  // it, and owns none of that rendering itself. That XSS-boundary exception
  // should exist in exactly one place, reviewed once, not per surface.

  /** True when the aimed Seeker's input is non-empty and not mid-search. */
  readonly canAim = computed(() => {
    if (this.state() === 'loading') return false;
    const v = this.formValue();
    return this.seeker() === 'fact_check'
      ? (v.claim ?? '').trim().length > 0
      : (v.direction ?? '').trim().length > 0;
  });

  aim(key: SeekerKey): void {
    if (this.seeker() === key) return;
    this.seeker.set(key);
    // A fresh aim clears the prior result so the panel never mixes Seekers.
    this.result.set(null);
    this.state.set('idle');
    this.errorKey.set(null);
  }

  invoke(): void {
    const fid = this.familiarId();
    if (!fid) {
      this.errorKey.set('far_sight.error.no_familiar');
      this.state.set('error');
      return;
    }
    const v = this.form.getRawValue();
    const key = this.seeker();
    const params: Record<string, string> =
      key === 'fact_check'
        ? { claim: v.claim.trim() }
        : { direction: v.direction.trim(), depth: v.depth };

    this.state.set('loading');
    this.result.set(null);
    this.errorKey.set(null);

    this.growth.invokeSkill(fid, key, params).subscribe({
      next: (r) => {
        this.result.set(r);
        this.state.set('success');
      },
      error: (err: unknown) => {
        const code = extractErrorCode(err);
        const key = errorKeyForCode(code);
        this.errorKey.set(key);
        this.state.set('error');
        this.toast.show(key, 'error');
      },
    });
  }
}

/**
 * Pull the domain error `code` out of whichever error shape actually arrives.
 *
 * This MUST go through httpErrorView (CHO-1705's normaliser). The global
 * errorInterceptor converts every HTTP failure into an ApiError, so the old
 * `err.error.code` read was ALWAYS undefined at runtime and every Far Sight
 * error — mana, stage-locked, params, egress — fell through to the generic
 * "please try again". The component spec passed regardless because
 * HttpTestingController without the interceptor chain yields a bare
 * HttpErrorResponse, whose `.error` IS the body. Specs now register the real
 * errorInterceptor so that divergence cannot hide a live bug again.
 *
 * TWO body shapes reach us and both are load-bearing:
 *   - FLAT   {code, message}          — chora-consumption's own envelope, which
 *                                        survives the hop because chora-gateway
 *                                        passes 2xx + 4xx through VERBATIM;
 *   - NESTED {error: {code, message}} — chora-gateway's own envelope, used when
 *                                        it masks a genuine upstream 5xx as
 *                                        GATEWAY_UPSTREAM_5XX.
 * ApiError.code itself is NOT usable here: the interceptor only parses the
 * nested envelope, so a flat body lands as code='UNKNOWN_ERROR' with the real
 * payload preserved on `.body`.
 */
function extractErrorCode(err: unknown): string {
  const view = httpErrorView(err);
  if (!view) return 'UNKNOWN';
  const body = view.body as { code?: unknown; error?: { code?: unknown } } | null;
  const flat = body?.code;
  if (typeof flat === 'string' && flat) return flat;
  const nested = body?.error?.code;
  if (typeof nested === 'string' && nested) return nested;
  return `HTTP_${view.status}`;
}

/**
 * Map the BE error code to a learner-facing i18n key (fail-loud, honest).
 *
 * A GOVERNANCE deny and an UPSTREAM FAILURE are different things and must read
 * differently (CHO-2148 close-out, live-caught 2026-07-14). The BE now emits a
 * distinct 4xx per deny reason; previously every deny collapsed into a 502
 * *_SEARCH_FAILED, which chora-gateway then masked as GATEWAY_UPSTREAM_5XX (it
 * normalises every upstream 5xx — 2xx + 4xx pass through verbatim), so the reason
 * never survived the hop and this surface fell back to a generic "please try
 * again" against a gate that was deliberately shut.
 *
 * The two egress denies stay SEPARATE on purpose: telling a learner to ask their
 * admin when the admin already enabled it and the platform paused it globally is
 * the exact misdirection this mapping exists to prevent.
 */
function errorKeyForCode(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_MANA':
      return 'far_sight.error.mana';
    case 'SKILL_NOT_ACTIVE':
    case 'SKILL_STAGE_LOCKED':
    case 'SKILL_NOT_OWNED':
      return 'far_sight.error.locked';
    case 'INVALID_SKILL_PARAMS':
      return 'far_sight.error.params';
    case 'EXTERNAL_EGRESS_DISABLED':
      // Tenant has not opted in (ADR-220 D4 franchise default-deny) → the admin
      // can fix this in H+ → Web Access.
      return 'far_sight.error.egress_off';
    case 'EXTERNAL_EGRESS_KILL_SWITCH':
      // The O+ platform kill-switch is engaged — beats tenant opt-in. Nobody's
      // admin can fix it; the honest advice is "wait".
      return 'far_sight.error.egress_paused';
    case 'EXTERNAL_EGRESS_CEILING_REACHED':
      return 'far_sight.error.ceiling';
    case 'GROUNDED_QUERY_BLOCKED':
      return 'far_sight.error.blocked';
    default:
      // *_SEARCH_FAILED and the gateway's GATEWAY_UPSTREAM_5XX mask are GENUINE
      // upstream failures (vendor down, timeout, crash). "Try again" is honest
      // advice for those — and ONLY for those. They are deliberately NOT mapped to
      // egress_off any more: that would claim the workspace is unconfigured when
      // the real problem is that the search vendor is down.
      return 'far_sight.error.generic';
  }
}
