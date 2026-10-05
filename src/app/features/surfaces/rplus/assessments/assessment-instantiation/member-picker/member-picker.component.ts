/**
 * MemberPickerComponent — R+ Phase X.4 chip-input member picker.
 *
 * Composable child of `AssessmentInstantiationComponent`. Renders:
 *   - The current chip set (from `chips` signal input)
 *   - A free-text search box with 300ms debounce + min-3-chars guard
 *   - A result dropdown (success/empty/error states fail-loud)
 *
 * The parent owns the canonical chip list — this component is a
 * dumb-emitter: `selected` fires when a result row is clicked,
 * `removed` fires when a chip × is clicked. Parent dedupes.
 *
 * Wire (via TenantMembersService): `GET /api/v1/admin/tenant-members?q=…`
 * per `identity-admin.yaml#searchTenantMembers`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import { TenantMembersService } from '../tenant-members.service';
import {
  formatMemberRowLabel,
  type TenantMemberSummary,
} from '../assessment-instantiation.model';

/** Debounce window per X.4 brief (≥300ms). */
const DEBOUNCE_MS = 300;
/** Minimum query length per X.4 brief (≥3 chars). */
const MIN_QUERY_CHARS = 3;

@Component({
  selector: 'chora-rplus-member-picker',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './member-picker.component.html',
  styleUrl: './member-picker.component.scss',
})
export class MemberPickerComponent {
  private readonly membersService = inject(TenantMembersService);
  private readonly destroyRef = inject(DestroyRef);

  /** Parent-owned chip set (the canonical invited_gcids list). */
  readonly chips = input.required<readonly TenantMemberSummary[]>();

  /** Emitted when a result row is clicked. Parent dedupes. */
  readonly selected = output<TenantMemberSummary>();

  /** Emitted when a chip × is clicked. Parent removes from chip set. */
  readonly removed = output<string>();

  /** Free-text search input (template `[(ngModel)]` two-way). */
  readonly query = signal('');

  /** Discriminated AsyncState surfaced by the picker service. */
  readonly searchState = this.membersService.searchState;
  readonly isLoading = computed<boolean>(
    () => this.searchState().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.searchState().status === 'error',
  );
  readonly errorKey = computed<string>(() => {
    const s = this.searchState();
    return s.status === 'error' ? s.error : '';
  });
  readonly results = computed<readonly TenantMemberSummary[]>(() => {
    const s = this.searchState();
    return s.status === 'success' ? s.items : [];
  });
  readonly isSuccessEmpty = computed<boolean>(() => {
    const s = this.searchState();
    return s.status === 'success' && s.items.length === 0;
  });

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  /** Internal debounce stream — coalesces keystrokes into a single call. */
  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        if (q.trim().length >= MIN_QUERY_CHARS) {
          this.membersService.search(q);
        } else {
          this.membersService.clear();
        }
      });
  }

  onQueryInput(value: string): void {
    this.query.set(value);
    this.query$.next(value);
  }

  selectMember(member: TenantMemberSummary): void {
    this.selected.emit(member);
    // Clear the input + collapse the dropdown.
    this.query.set('');
    if (this.inputEl) {
      this.inputEl.nativeElement.value = '';
    }
    this.membersService.clear();
  }

  removeChip(gcid: string): void {
    this.removed.emit(gcid);
  }

  /** Label-builder helper exposed to the template. */
  formatRow(member: TenantMemberSummary): string {
    return formatMemberRowLabel(member);
  }

  trackByGcid(_index: number, member: TenantMemberSummary): string {
    return member.gcid;
  }
}
