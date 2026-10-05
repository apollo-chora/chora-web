import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../pipes/translate.pipe';
import {
  MemberDirectoryRole,
  MemberDirectoryService,
} from './member-directory.service';
import {
  formatMemberRowLabel,
  type TenantMemberSummary,
} from '../../../features/surfaces/rplus/assessments/assessment-instantiation/assessment-instantiation.model';

/** Load lifecycle for the tenant-member roster. */
type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly members: readonly TenantMemberSummary[] };

let nextInstanceId = 0;

/**
 * `chora-member-multiselect` - reusable searchable CHECKBOX list of the current
 * tenant's members filtered by role, with a "select all (filtered)" toggle and
 * a running selected count. Suited to ticking up to ~100 (R+ offering Roster
 * enrolment; reusable by Sections / Schedule / Attendance people-pickers).
 *
 * This is a LIST/table multi-select, NOT the chip-style typeahead
 * (`assessment-instantiation` member-picker). It loads ALL members for the
 * role once (paged to completion, fail-loud with a retry) and filters the
 * rendered rows client-side.
 *
 * Consumer contract:
 *   <chora-member-multiselect
 *     [memberRole]="'learner'"
 *     [preselectedGcids]="alreadyEnrolled()"
 *     [maxSelectable]="100"
 *     (selectionChange)="onSelection($event)" />
 *
 * Presentational + self-contained: it owns the ticked set and emits the gcid
 * array on every change; it does NOT persist enrolment (the consumer wires the
 * mutation). Text is keyed under `shared.member_multiselect.*`.
 */
@Component({
  selector: 'chora-member-multiselect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './member-multiselect.component.html',
  styleUrl: './member-multiselect.component.scss',
})
export class MemberMultiselectComponent implements OnInit {
  private readonly directory = inject(MemberDirectoryService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Which tenant role to enrol from. Required. Named `memberRole` (not `role`)
   * so a consumer template binding never lands an invalid ARIA `role` attribute
   * on the host element (axe aria-roles).
   */
  readonly memberRole = input.required<MemberDirectoryRole>();
  /** GCIDs to pre-tick on init (e.g. already-enrolled members). */
  readonly preselectedGcids = input<readonly string[]>([]);
  /** Optional hard cap on how many may be ticked (null = unlimited). */
  readonly maxSelectable = input<number | null>(null);

  /** Emits the ticked gcid array whenever the selection changes. */
  readonly selectionChange = output<readonly string[]>();

  /** Stable id so the group label ties to the visible title for a11y. */
  readonly titleId = `member-multiselect-title-${nextInstanceId++}`;

  readonly loadState = signal<LoadState>({ status: 'loading' });
  readonly searchTerm = signal<string>('');
  readonly selected = signal<ReadonlySet<string>>(new Set<string>());

  /** All loaded members (empty until ready). */
  readonly members = computed<readonly TenantMemberSummary[]>(() => {
    const s = this.loadState();
    return s.status === 'ready' ? s.members : [];
  });

  /** Members matching the current search term (name or email, case-insensitive). */
  readonly filteredMembers = computed<readonly TenantMemberSummary[]>(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.members();
    if (term.length === 0) return all;
    return all.filter(
      (m) =>
        (m.display_name?.toLowerCase().includes(term) ?? false) ||
        (m.email?.toLowerCase().includes(term) ?? false),
    );
  });

  readonly selectedCount = computed<number>(() => this.selected().size);

  /** True iff at least one filtered row exists and all are ticked. */
  readonly allFilteredSelected = computed<boolean>(() => {
    const filtered = this.filteredMembers();
    if (filtered.length === 0) return false;
    const sel = this.selected();
    return filtered.every((m) => sel.has(m.gcid));
  });

  /** True once the tick count has reached the cap (if any). */
  readonly atMax = computed<boolean>(() => {
    const max = this.maxSelectable();
    return max !== null && this.selectedCount() >= max;
  });

  ngOnInit(): void {
    const pre = this.preselectedGcids();
    if (pre.length > 0) {
      this.selected.set(new Set<string>(pre));
    }
    this.load();
  }

  /** (Re)load every member for the role, paged to completion. Fail-loud. */
  load(): void {
    this.loadState.set({ status: 'loading' });
    this.directory
      .listMembers(this.memberRole())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (members) => this.loadState.set({ status: 'ready', members }),
        error: () => this.loadState.set({ status: 'error' }),
      });
  }

  /** Display line for a row - reuses the assessment-picker label helper. */
  rowLabel(member: TenantMemberSummary): string {
    return formatMemberRowLabel(member);
  }

  isSelected(gcid: string): boolean {
    return this.selected().has(gcid);
  }

  /** Whether an untouched row must be disabled because the cap is reached. */
  isDisabled(gcid: string): boolean {
    return this.atMax() && !this.isSelected(gcid);
  }

  /** Tick / untick one member. Refuses to exceed `maxSelectable`. */
  toggle(gcid: string): void {
    const next = new Set<string>(this.selected());
    if (next.has(gcid)) {
      next.delete(gcid);
    } else {
      const max = this.maxSelectable();
      if (max !== null && next.size >= max) return;
      next.add(gcid);
    }
    this.commit(next);
  }

  /** Tick every filtered row (up to the cap) or untick them if all are ticked. */
  toggleSelectAllFiltered(): void {
    const filtered = this.filteredMembers();
    if (filtered.length === 0) return;
    const next = new Set<string>(this.selected());
    if (this.allFilteredSelected()) {
      for (const m of filtered) next.delete(m.gcid);
    } else {
      const max = this.maxSelectable();
      for (const m of filtered) {
        if (max !== null && next.size >= max) break;
        next.add(m.gcid);
      }
    }
    this.commit(next);
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  private commit(next: ReadonlySet<string>): void {
    this.selected.set(next);
    this.selectionChange.emit([...next]);
  }
}
