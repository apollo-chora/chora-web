/**
 * HplusKgConfigComponent — USR-H-KG-1.
 *
 * H+ Hub+ surface: tenant admin form for the KG fog config keys
 * (max_concurrent_kg_clusters_per_user, kg_fog_invalidation_grace_seconds).
 * Per ADR-142 precedent, lives under tenant_entitlements.config_overrides
 * — not a hard-coded tier.
 *
 * Role-gated: only visible to tenant_admin (the route guard applies the
 * RBAC check; the component assumes the user is already admin).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { startWith } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { KgFogService } from '../../aplus/dashboard/kg-fog/kg-fog.service';
import type { TenantKgConfig } from '../../aplus/dashboard/kg-fog/kg-fog.model';

const MIN_CAP = 1;
const MAX_CAP = 10;
const MIN_GRACE = 60;
const MAX_GRACE = 3600;

@Component({
  selector: 'chora-hplus-kg-config',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hplus-kg-config.component.html',
  styleUrl: './hplus-kg-config.component.scss',
})
export class HplusKgConfigComponent {
  private readonly kgFog = inject(KgFogService);
  private readonly route = inject(ActivatedRoute);

  /** Tenant ID resolved from route params (defaults to 'current'). */
  readonly tenantId = signal<string>(
    this.route.snapshot.paramMap.get('tenantId') ?? 'current',
  );

  private readonly initial$: Observable<TenantKgConfig | null> = this.kgFog
    .getTenantConfig(this.tenantId())
    .pipe(startWith(null as TenantKgConfig | null));

  private readonly initial = toSignal(this.initial$, { initialValue: null });

  // Editable form state — kept separate from the source-of-truth so we
  // can reset on cancel.
  readonly capDraft = signal<number>(3);
  readonly graceDraft = signal<number>(300);
  readonly saving = signal<boolean>(false);
  readonly saved = signal<boolean>(false);
  readonly saveError = signal<string | null>(null);

  readonly current = computed<TenantKgConfig | null>(() => this.initial());

  constructor() {
    // Seed the form drafts once the initial config arrives. effect() is
    // the right primitive for "react to a signal AND set other signals".
    effect(() => {
      const cfg = this.initial();
      if (cfg) {
        this.capDraft.set(cfg.maxConcurrentKgClustersPerUser);
        this.graceDraft.set(cfg.kgFogInvalidationGraceSeconds);
      }
    });
  }

  readonly isDirty = computed<boolean>(() => {
    const cfg = this.current();
    if (!cfg) return false;
    return (
      this.capDraft() !== cfg.maxConcurrentKgClustersPerUser ||
      this.graceDraft() !== cfg.kgFogInvalidationGraceSeconds
    );
  });

  readonly canSave = computed<boolean>(() => {
    const c = this.capDraft();
    const g = this.graceDraft();
    return (
      this.isDirty() &&
      !this.saving() &&
      c >= MIN_CAP &&
      c <= MAX_CAP &&
      g >= MIN_GRACE &&
      g <= MAX_GRACE
    );
  });

  onCapInput(value: string | number): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return;
    this.capDraft.set(Math.max(MIN_CAP, Math.min(MAX_CAP, Math.round(n))));
    this.clearStatus();
  }

  onGraceInput(value: string | number): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return;
    this.graceDraft.set(Math.max(MIN_GRACE, Math.min(MAX_GRACE, Math.round(n))));
    this.clearStatus();
  }

  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.kgFog
      .updateTenantConfig(this.tenantId(), {
        maxConcurrentKgClustersPerUser: this.capDraft(),
        kgFogInvalidationGraceSeconds: this.graceDraft(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 2400);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set('aplus.knowledge_graph.config_save_error');
        },
      });
  }

  cancel(): void {
    const cfg = this.current();
    if (!cfg) return;
    this.capDraft.set(cfg.maxConcurrentKgClustersPerUser);
    this.graceDraft.set(cfg.kgFogInvalidationGraceSeconds);
    this.clearStatus();
  }

  private clearStatus(): void {
    if (this.saved()) this.saved.set(false);
    if (this.saveError()) this.saveError.set(null);
  }

  // Expose constraint bounds to the template.
  readonly minCap = MIN_CAP;
  readonly maxCap = MAX_CAP;
  readonly minGrace = MIN_GRACE;
  readonly maxGrace = MAX_GRACE;
}
