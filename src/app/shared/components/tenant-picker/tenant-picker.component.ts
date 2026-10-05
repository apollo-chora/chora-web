/**
 * TenantPickerComponent — a presentational radiogroup that lists the
 * tenant memberships resolved inline from the mint response after the
 * Stage-2 cutover (2026-05-14).
 *
 * Pure presentation: takes `memberships` as a signal input, emits the
 * chosen `tenant.id` via the `select` output. The host (the
 * `/select-tenant` page or any future surface) owns the side effect of
 * actually re-minting the session.
 *
 * Each row is keyboard-activatable (Enter / Space) and ARIA-correct
 * (`role="radiogroup"` container, `role="radio"` rows with
 * `aria-checked`).
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { TenantContext } from '../../../core/auth/tenant-context.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-tenant-picker',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './tenant-picker.component.html',
  styleUrl: './tenant-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantPickerComponent {
  /** Tenant memberships to choose from — one selectable row each. */
  readonly memberships = input.required<TenantContext[]>();

  /** Emits the chosen `tenant.id`. */
  readonly tenantSelected = output<string>();

  /** Primary label for a row: slug, falling back to name when blank. */
  rowLabel(tenant: TenantContext): string {
    return tenant.slug?.trim() ? tenant.slug : tenant.name;
  }

  /** Activate a row via pointer. */
  onRowClick(tenant: TenantContext): void {
    this.tenantSelected.emit(tenant.id);
  }

  /** Activate a row via keyboard — Enter or Space only. */
  onRowKeydown(event: KeyboardEvent, tenant: TenantContext): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.tenantSelected.emit(tenant.id);
    }
  }
}
