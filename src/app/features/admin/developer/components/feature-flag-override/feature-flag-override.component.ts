/**
 * FeatureFlagOverrideComponent — Toggle add-on feature flags for testing.
 *
 * Route: /admin/developer/feature-flags
 *
 * Features:
 *   - List all add-on feature flags with current tenant state
 *   - Per-flag override toggle (enable/disable for testing)
 *   - Clear all overrides button
 *   - Visual indicator for overridden vs production state
 *   - Role-gated: super_admin only
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { DeveloperService } from '../../services/developer.service';
import type { FeatureFlagOverride } from '../../models/developer.model';

@Component({
  selector: 'chora-feature-flag-override',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './feature-flag-override.component.html',
  styleUrl: './feature-flag-override.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureFlagOverrideComponent implements OnInit, OnDestroy {
  private readonly developerService = inject(DeveloperService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly flags = signal<FeatureFlagOverride[]>([]);
  readonly loading = signal(false);

  // --- Computed ---
  readonly overrideCount = computed(
    () => this.flags().filter((f) => f.overrideActive).length,
  );
  readonly enabledCount = computed(
    () => this.flags().filter((f) => f.overrideActive ? f.overrideValue : f.enabled).length,
  );
  readonly totalFlags = computed(() => this.flags().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadFlags();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadFlags(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.developerService.getFeatureFlagOverrides().subscribe({
        next: (flags) => {
          this.flags.set(flags);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.developer.flags_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleOverride(flag: FeatureFlagOverride): void {
    const newOverrideActive = !flag.overrideActive;
    const newOverrideValue = newOverrideActive ? !flag.enabled : false;

    this.subscriptions.add(
      this.developerService
        .setFeatureFlagOverride(flag.addOnCode, newOverrideActive, newOverrideValue)
        .subscribe({
          next: () => {
            this.flags.update((current) =>
              current.map((f) =>
                f.addOnCode === flag.addOnCode
                  ? { ...f, overrideActive: newOverrideActive, overrideValue: newOverrideValue }
                  : f,
              ),
            );
            this.toast.show('admin.developer.flag_updated', 'success');
          },
          error: () => {
            this.toast.show('admin.developer.flag_update_error', 'error');
          },
        }),
    );
  }

  toggleOverrideValue(flag: FeatureFlagOverride): void {
    if (!flag.overrideActive) return;

    const newValue = !flag.overrideValue;
    this.subscriptions.add(
      this.developerService
        .setFeatureFlagOverride(flag.addOnCode, true, newValue)
        .subscribe({
          next: () => {
            this.flags.update((current) =>
              current.map((f) =>
                f.addOnCode === flag.addOnCode
                  ? { ...f, overrideValue: newValue }
                  : f,
              ),
            );
          },
          error: () => {
            this.toast.show('admin.developer.flag_update_error', 'error');
          },
        }),
    );
  }

  clearAllOverrides(): void {
    this.subscriptions.add(
      this.developerService.clearAllOverrides().subscribe({
        next: () => {
          this.flags.update((current) =>
            current.map((f) => ({ ...f, overrideActive: false, overrideValue: false })),
          );
          this.toast.show('admin.developer.overrides_cleared', 'success');
        },
        error: () => {
          this.toast.show('admin.developer.clear_overrides_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  effectiveState(flag: FeatureFlagOverride): boolean {
    return flag.overrideActive ? flag.overrideValue : flag.enabled;
  }

  effectiveStateLabel(flag: FeatureFlagOverride): string {
    return this.effectiveState(flag)
      ? 'admin.developer.flag_enabled'
      : 'admin.developer.flag_disabled';
  }
}
