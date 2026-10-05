/**
 * AtomBankComponent — Browse community-submitted atoms with filtering.
 *
 * Route: /community/atom-bank
 *
 * Features:
 *   - List of approved community atoms with vote scores
 *   - Filter by atom type, status, and search term
 *   - Upvote / downvote on each atom
 *   - Link to contributor profile
 *   - Empty, loading, and error states
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { CommunityService } from '../../services/community.service';
import {
  ALL_ATOM_TYPES,
  ATOM_TYPE_LABELS,
  COMMUNITY_ATOM_STATUS_LABELS,
} from '../../models/community.model';
import type { AtomType, CommunityAtom } from '../../models/community.model';

@Component({
  selector: 'chora-atom-bank',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './atom-bank.component.html',
  styleUrl: './atom-bank.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomBankComponent implements OnInit, OnDestroy {
  private readonly communityService = inject(CommunityService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly atomListState = this.communityService.atomListState;
  readonly atoms = this.communityService.atoms;

  // --- Filters ---
  readonly filterType = signal<AtomType | 'all'>('all');
  readonly searchTerm = signal('');

  // --- Constants ---
  readonly allAtomTypes = ALL_ATOM_TYPES;
  readonly atomTypeLabels = ATOM_TYPE_LABELS;
  readonly statusLabels = COMMUNITY_ATOM_STATUS_LABELS;

  // --- Computed ---
  readonly filteredAtoms = computed(() => {
    let result = this.atoms();
    const type = this.filterType();
    const search = this.searchTerm().toLowerCase().trim();

    if (type !== 'all') {
      result = result.filter((a) => a.atom_type === type);
    }
    if (search) {
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(search) ||
          a.tags.some((t) => t.toLowerCase().includes(search)),
      );
    }
    return result;
  });

  readonly atomCount = computed(() => this.filteredAtoms().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.communityService.loadApprovedAtoms().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onFilterTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filterType.set(value as AtomType | 'all');
  }

  onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  vote(atom: CommunityAtom, direction: 'up' | 'down'): void {
    this.subscriptions.add(
      this.communityService.voteOnAtom(atom.id, { direction }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('community.vote_recorded', 'success');
          }
        },
        error: () => {
          this.toast.show('community.vote_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  statusClass(status: string): string {
    return `atom-bank__status--${status}`;
  }

  trackByAtomId(_index: number, atom: CommunityAtom): string {
    return atom.id;
  }
}
