/**
 * KgSeedFormComponent — reusable "seed a curiosity topic" form (ADR-204 §10).
 *
 * Extracted from the retired dashboard explorations panel so the A+ dashboard
 * map hero's empty state reuses the exact same seed input + create call + error
 * mapping (rather than duplicating it a third time). Presentational seam: it
 * owns the `KgFogService.createCluster` side-effect, surfaces the discriminated
 * `ClusterCreateError` inline, and emits `(created)` with the new cluster on
 * success — the parent decides what to do (append to a preview / navigate).
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import { KgFogService } from '../kg-fog.service';
import { mapClusterCreateError } from '../kg-fog.model';
import type { ClusterCreateError, ClusterCreateResponse } from '../kg-fog.model';

@Component({
  selector: 'chora-aplus-kg-seed-form',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kg-seed-form.component.html',
  styleUrl: './kg-seed-form.component.scss',
})
export class KgSeedFormComponent {
  private readonly kgFog = inject(KgFogService);

  /** Active-map cap, used only to compose the `cap_reached` error message. */
  readonly capMax = input<number>(3);

  /** Emitted with the created cluster on a successful seed. */
  readonly created = output<ClusterCreateResponse>();

  readonly seedTopic = signal<string>('');
  readonly seeding = signal<boolean>(false);
  readonly seedError = signal<ClusterCreateError | null>(null);

  /** A non-blank, ≤128-char topic with no in-flight request can be seeded. */
  readonly canSeed = computed<boolean>(() => {
    const t = this.seedTopic().trim();
    return t.length > 0 && t.length <= 128 && !this.seeding();
  });

  onSeedInput(value: string): void {
    this.seedTopic.set(value);
    if (this.seedError()) this.seedError.set(null);
  }

  startExploration(): void {
    if (!this.canSeed()) return;
    const seed = this.seedTopic().trim();
    this.seeding.set(true);
    this.seedError.set(null);
    this.kgFog.createCluster({ seedTopic: seed }).subscribe({
      next: (result) => {
        this.seeding.set(false);
        this.seedTopic.set('');
        this.created.emit(result);
      },
      error: (err: unknown) => {
        this.seeding.set(false);
        // Shared discriminated mapping (incl. the 502 FOG_INSUFFICIENT_CATALOGUE
        // carve-out, ADR-204 §F) so the inline message + remediation are honest.
        this.seedError.set(mapClusterCreateError(err, this.capMax()));
      },
    });
  }
}
