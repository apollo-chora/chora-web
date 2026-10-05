/**
 * AtomListComponent — Admin data table for browsing and managing LearningAtoms.
 *
 * Route: /admin/content/atoms (default admin content view)
 *
 * Features:
 *   - Data table with type, title, status, difficulty, author, updated columns
 *   - Filter bar: atom type multi-select, status select, difficulty range
 *   - Debounced search input
 *   - Bulk actions: publish selected, archive selected
 *   - Cursor-based pagination with page size selector
 *   - Loading skeleton, empty state
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
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import {
  AdminAtom,
  AdminAtomType,
  VisibilityStatus,
  AdminPageInfo,
  AtomListParams,
  ALL_ATOM_TYPES,
  ALL_VISIBILITY_STATUSES,
  ADMIN_ATOM_TYPE_LABELS,
  ADMIN_ATOM_TYPE_ICONS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  getAtomTitle,
} from '../../models/admin-atom.model';

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'chora-atom-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './atom-list.component.html',
  styleUrl: './atom-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomListComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly atomService = inject(AdminAtomService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly atoms = signal<AdminAtom[]>([]);
  readonly pageInfo = signal<AdminPageInfo>({ next_cursor: null, has_next: false });
  readonly loading = signal(false);
  readonly searchTerm = signal('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly cursorStack = signal<string[]>([]);
  readonly currentCursor = signal<string | null>(null);
  readonly bulkActionInProgress = signal(false);

  // --- Filters ---
  readonly filterAtomTypes = signal<AdminAtomType[]>([]);
  readonly filterStatus = signal<VisibilityStatus | null>(null);
  readonly filterDifficulty = signal<number | null>(null);

  // --- Constants ---
  readonly allAtomTypes = ALL_ATOM_TYPES;
  readonly allStatuses = ALL_VISIBILITY_STATUSES;
  readonly atomTypeLabels = ADMIN_ATOM_TYPE_LABELS;
  readonly atomTypeIcons = ADMIN_ATOM_TYPE_ICONS;
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  // --- Computed ---
  readonly hasSelection = computed(() => this.selectedIds().size > 0);
  readonly selectionCount = computed(() => this.selectedIds().size);
  readonly isEmpty = computed(() => !this.loading() && this.atoms().length === 0);
  readonly allSelected = computed(() =>
    this.atoms().length > 0 && this.selectedIds().size === this.atoms().length,
  );
  readonly hasPreviousPage = computed(() => this.cursorStack().length > 0);
  readonly hasNextPage = computed(() => this.pageInfo().has_next);
  readonly currentPage = computed(() => this.cursorStack().length + 1);

  // --- Search debounce ---
  private readonly searchSubject = new Subject<string>();
  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.searchSubject.pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
      ).subscribe((term) => {
        this.searchTerm.set(term);
        this.resetPagination();
        this.loadAtoms();
      }),
    );

    this.loadAtoms();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.searchSubject.complete();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAtoms(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());

    const params: AtomListParams = {
      limit: this.pageSize(),
    };

    if (this.currentCursor()) {
      params.cursor = this.currentCursor()!;
    }

    // Apply filters
    const types = this.filterAtomTypes();
    if (types.length === 1) {
      params.atom_type = types[0];
    }
    const status = this.filterStatus();
    if (status) {
      params.status = status;
    }
    const difficulty = this.filterDifficulty();
    if (difficulty) {
      params.difficulty = difficulty;
    }

    this.subscriptions.add(
      this.atomService.getAtoms(params).subscribe({
        next: (response) => {
          this.atoms.set(response.data);
          this.pageInfo.set(response.page_info);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.atoms.list.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onAtomTypeFilter(type: AdminAtomType): void {
    this.filterAtomTypes.update((current) => {
      const newTypes = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      return newTypes;
    });
    this.resetPagination();
    this.loadAtoms();
  }

  onStatusFilter(status: string): void {
    const newStatus = status === '' ? null : status as VisibilityStatus;
    this.filterStatus.set(newStatus);
    this.resetPagination();
    this.loadAtoms();
  }

  onDifficultyFilter(difficulty: string): void {
    const newDifficulty = difficulty === '' ? null : parseInt(difficulty, 10);
    this.filterDifficulty.set(newDifficulty);
    this.resetPagination();
    this.loadAtoms();
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  toggleSelection(atomId: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(atomId)) {
        next.delete(atomId);
      } else {
        next.add(atomId);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      const allIds = new Set(this.atoms().map((a) => a.id));
      this.selectedIds.set(allIds);
    }
  }

  isSelected(atomId: string): boolean {
    return this.selectedIds().has(atomId);
  }

  // -------------------------------------------------------------------------
  // Bulk actions
  // -------------------------------------------------------------------------

  async bulkPublish(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkActionInProgress.set(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        await this.atomService.updateAtom(id, { status: 'published' }).toPromise();
        successCount++;
      } catch {
        errorCount++;
      }
    }

    this.bulkActionInProgress.set(false);

    if (successCount > 0) {
      this.toast.show('admin.atoms.list.bulk_publish_success', 'success');
    }
    if (errorCount > 0) {
      this.toast.show('admin.atoms.list.bulk_publish_error', 'error');
    }

    this.loadAtoms();
  }

  async bulkArchive(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.atoms.list.archive_confirm_title',
      message: 'admin.atoms.list.archive_confirm_message',
      confirmText: 'admin.atoms.list.archive_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.bulkActionInProgress.set(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        await this.atomService.deleteAtom(id).toPromise();
        successCount++;
      } catch {
        errorCount++;
      }
    }

    this.bulkActionInProgress.set(false);

    if (successCount > 0) {
      this.toast.show('admin.atoms.list.bulk_archive_success', 'success');
    }
    if (errorCount > 0) {
      this.toast.show('admin.atoms.list.bulk_archive_error', 'error');
    }

    this.loadAtoms();
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  nextPage(): void {
    const nextCursor = this.pageInfo().next_cursor;
    if (!nextCursor) return;

    const current = this.currentCursor();
    this.cursorStack.update((stack) => [...stack, current ?? '']);
    this.currentCursor.set(nextCursor);
    this.loadAtoms();
  }

  previousPage(): void {
    this.cursorStack.update((stack) => {
      const copy = [...stack];
      const prev = copy.pop() ?? null;
      this.currentCursor.set(prev);
      return copy;
    });
    this.loadAtoms();
  }

  onPageSizeChange(size: string): void {
    this.pageSize.set(parseInt(size, 10));
    this.resetPagination();
    this.loadAtoms();
  }

  private resetPagination(): void {
    this.cursorStack.set([]);
    this.currentCursor.set(null);
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  navigateToCreate(): void {
    this.router.navigate(['/admin/content/atoms/new']);
  }

  navigateToEdit(atomId: string): void {
    this.router.navigate(['/admin/content/atoms', atomId, 'edit']);
  }

  onRowKeydown(event: KeyboardEvent, atomId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.navigateToEdit(atomId);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getTitle(atom: AdminAtom): string {
    return getAtomTitle(atom);
  }

  getTypeIcon(type: AdminAtomType): string {
    return ADMIN_ATOM_TYPE_ICONS[type];
  }

  getTypeLabel(type: AdminAtomType): string {
    return ADMIN_ATOM_TYPE_LABELS[type];
  }

  getDifficultyStars(difficulty: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < difficulty);
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
}
