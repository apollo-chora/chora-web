/**
 * ReadonlyBannerComponent — Tier 4 persistent red/danger banner for
 * tenants in read-only mode.
 *
 * Global shared component used in MainLayout.
 *
 * Features:
 *   - Persistent red/danger banner — cannot be dismissed
 *   - "This tenant is in read-only mode" message
 *   - Explanation of what read-only means (no writes allowed)
 *   - Uses role="status"
 *   - Visually distinct from the amber warning banner
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-readonly-banner',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './readonly-banner.component.html',
  styleUrl: './readonly-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadonlyBannerComponent {
  /** Whether the tenant is currently in read-only mode */
  readonly isReadOnly = input.required<boolean>();

  /** Optional explanation override (uses default i18n key otherwise) */
  readonly explanation = input<string | null>(null);

  readonly isVisible = computed(() => this.isReadOnly());
}
