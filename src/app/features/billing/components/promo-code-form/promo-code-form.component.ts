/**
 * PromoCodeFormComponent — Reactive form for creating new promo codes.
 *
 * Used inline within PromoCodeManagerComponent.
 *
 * Features:
 *   - Code input (alphanumeric + dashes)
 *   - Discount type selector (percentage or fixed_amount)
 *   - Discount value with dynamic max validation
 *   - Date range (valid_from / valid_until)
 *   - Max redemptions input
 *   - Submit + Cancel actions
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
  output,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BillingService } from '../../services/billing.service';
import type { DiscountType } from '../../models/billing.model';

@Component({
  selector: 'chora-promo-code-form',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './promo-code-form.component.html',
  styleUrl: './promo-code-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromoCodeFormComponent implements OnDestroy {
  private readonly billingService = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  // --- Outputs ---
  readonly created = output<void>();
  readonly cancelled = output<void>();

  // --- State ---
  readonly submitting = signal(false);

  // --- Form ---
  readonly form: FormGroup = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Za-z0-9-]+$/)],
    ],
    discount_type: ['percentage' as DiscountType, [Validators.required]],
    discount_value: [0, [Validators.required, Validators.min(0)]],
    valid_from: ['', [Validators.required]],
    valid_until: ['', [Validators.required]],
    max_redemptions: [1, [Validators.required, Validators.min(1)]],
  });

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Getters for template validation access
  // -------------------------------------------------------------------------

  get codeControl() {
    return this.form.get('code')!;
  }

  get discountTypeControl() {
    return this.form.get('discount_type')!;
  }

  get discountValueControl() {
    return this.form.get('discount_value')!;
  }

  get validFromControl() {
    return this.form.get('valid_from')!;
  }

  get validUntilControl() {
    return this.form.get('valid_until')!;
  }

  get maxRedemptionsControl() {
    return this.form.get('max_redemptions')!;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onSubmit(): void {
    this.form.markAllAsTouched();

    if (!this.isFormValid()) return;

    this.submitting.set(true);

    const formValue = this.form.getRawValue();

    // Wire unit: money is stored as CENTS across the billing module (see
    // PromoCodeManager.discountDisplay, which divides fixed_amount by 100).
    // The user types whole dollars, so convert dollars → cents for
    // fixed_amount. Percentage is NOT money — a 15% discount is sent as 15.
    const discountValue =
      formValue.discount_type === 'fixed_amount'
        ? Math.round(formValue.discount_value * 100)
        : formValue.discount_value;

    this.subscriptions.add(
      this.billingService
        .createPromoCode({
          code: formValue.code,
          discount_type: formValue.discount_type,
          discount_value: discountValue,
          max_redemptions: formValue.max_redemptions,
          valid_from: formValue.valid_from,
          valid_until: formValue.valid_until,
          is_active: true,
        })
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            if (result) {
              this.toast.show('billing.promo_code_created', 'success');
              this.created.emit();
            }
          },
          error: () => {
            this.submitting.set(false);
            this.toast.show('billing.promo_code_create_error', 'error');
          },
        }),
    );
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  // -------------------------------------------------------------------------
  // Validation Helpers
  // -------------------------------------------------------------------------

  isFormValid(): boolean {
    if (this.form.invalid) return false;

    const formValue = this.form.getRawValue();

    // Percentage max 100
    if (formValue.discount_type === 'percentage' && formValue.discount_value > 100) {
      return false;
    }

    // valid_until must be after valid_from
    if (formValue.valid_from && formValue.valid_until) {
      const from = new Date(formValue.valid_from);
      const until = new Date(formValue.valid_until);
      if (until <= from) return false;
    }

    return true;
  }

  isPercentage(): boolean {
    return this.form.get('discount_type')?.value === 'percentage';
  }

  hasDateRangeError(): boolean {
    const formValue = this.form.getRawValue();
    if (!formValue.valid_from || !formValue.valid_until) return false;
    const from = new Date(formValue.valid_from);
    const until = new Date(formValue.valid_until);
    return until <= from;
  }

  hasPercentageMaxError(): boolean {
    const formValue = this.form.getRawValue();
    return formValue.discount_type === 'percentage' && formValue.discount_value > 100;
  }
}
