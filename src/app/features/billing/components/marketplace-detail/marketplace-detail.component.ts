/**
 * MarketplaceDetailComponent — Add-on catalog detail page with features,
 * screenshots carousel, reviews, compatibility matrix, and activation.
 *
 * Route: /billing/marketplace/:itemId
 *
 * Features:
 *   - Add-on feature list
 *   - Screenshots carousel (horizontal scroll with arrow buttons)
 *   - Reviews section (star rating + text)
 *   - Compatibility matrix (compatible/required/incompatible)
 *   - Pricing info and "Activate" CTA button
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  input,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type {
  MarketplaceItem,
  MarketplaceItemState,
  MarketplaceReview,
  CompatibilityEntry,
} from '../../models/marketplace.model';

@Component({
  selector: 'chora-marketplace-detail',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './marketplace-detail.component.html',
  styleUrl: './marketplace-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketplaceDetailComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  /** Route param bound via withComponentInputBinding() */
  readonly itemId = input.required<string>();

  // --- State ---
  private readonly _state = signal<MarketplaceItemState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly item = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Carousel state ---
  readonly carouselIndex = signal(0);

  readonly currentScreenshot = computed(() => {
    const i = this.item();
    if (!i || i.screenshots.length === 0) return null;
    return i.screenshots[this.carouselIndex()];
  });

  readonly canScrollPrev = computed(() => this.carouselIndex() > 0);
  readonly canScrollNext = computed(() => {
    const i = this.item();
    if (!i) return false;
    return this.carouselIndex() < i.screenshots.length - 1;
  });

  // --- Reviews ---
  readonly reviews = computed<MarketplaceReview[]>(() => this.item()?.reviews ?? []);
  readonly averageRating = computed(() => this.item()?.average_rating ?? 0);
  readonly reviewCount = computed(() => this.item()?.review_count ?? 0);

  // --- Compatibility ---
  readonly compatibility = computed<CompatibilityEntry[]>(() => this.item()?.compatibility ?? []);

  // --- Activation ---
  readonly activating = signal(false);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadItem();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadItem(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff
        .get<MarketplaceItem>(
          `/api/v1/billing/marketplace/${encodeURIComponent(this.itemId())}`,
        )
        .subscribe({
          next: (data) => this._state.set({ status: 'success', data }),
          error: (err: Error) =>
            this._state.set({
              status: 'error',
              error: { code: 'MARKETPLACE_LOAD_FAILED', message: err.message },
            }),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Carousel
  // -------------------------------------------------------------------------

  scrollPrev(): void {
    if (this.canScrollPrev()) {
      this.carouselIndex.update((i) => i - 1);
    }
  }

  scrollNext(): void {
    if (this.canScrollNext()) {
      this.carouselIndex.update((i) => i + 1);
    }
  }

  // -------------------------------------------------------------------------
  // Activation
  // -------------------------------------------------------------------------

  async activate(): Promise<void> {
    // Activation is a PAID action — confirm before charging, then give loud
    // success/error feedback (never fire-and-forget silently).
    const confirmed = await this.confirmDialog.confirm({
      title: 'billing.activate_confirm_title',
      message: 'billing.activate_confirm_message',
      confirmText: 'billing.activate_confirm_button',
      variant: 'warning',
    });

    if (!confirmed) return;

    this.activating.set(true);
    this.subscriptions.add(
      this.bff
        .post<void>(`/api/v1/billing/marketplace/${encodeURIComponent(this.itemId())}/activate`, {})
        .subscribe({
          next: () => {
            this.activating.set(false);
            this.toast.show('billing.activate_success', 'success');
          },
          error: () => {
            this.activating.set(false);
            this.toast.show('billing.activate_error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatPrice(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  starArray(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  compatibilityClass(relationship: string): string {
    return `marketplace-detail__compat--${relationship}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
