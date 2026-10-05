import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AtomListComponent } from './atom-list.component';
import { AdminAtomService } from '../../services/admin-atom.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { AdminAtom, AdminAtomListResponse } from '../../models/admin-atom.model';

function buildAdminAtom(overrides: Partial<AdminAtom> = {}): AdminAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math'],
    status: 'draft',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: {
      id: 'rev-001',
      atom_id: 'atom-001',
      revision_number: 1,
      content: { stem: 'What is 2+2?' },
      validation_rules: [],
      visibility_status: 'published',
      metadata: null,
      published_at: '2026-01-01T12:00:00Z',
      created_by: 'gcid-001',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function buildListResponse(atoms: AdminAtom[], hasNext = false): AdminAtomListResponse {
  return {
    data: atoms,
    page_info: {
      next_cursor: hasNext ? 'cursor-next' : null,
      has_next: hasNext,
    },
  };
}

describe('AtomListComponent', () => {
  let component: AtomListComponent;
  let fixture: ComponentFixture<AtomListComponent>;
  let router: Router;

  const mockAtomService = {
    getAtoms: vi.fn(),
    updateAtom: vi.fn(),
    deleteAtom: vi.fn(),
  };

  const mockToastService = {
    show: vi.fn(),
  };

  const mockConfirmService = {
    confirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: return empty list
    mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomListComponent, TranslatePipe],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminAtomService, useValue: mockAtomService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockConfirmService },
      ],
    });

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AtomListComponent);
    component = fixture.componentInstance;
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('loads atoms on init', () => {
      fixture.detectChanges();
      expect(mockAtomService.getAtoms).toHaveBeenCalled();
    });

    it('shows empty state when no atoms', () => {
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
    });

    it('shows atoms when data returned', () => {
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([
        buildAdminAtom({ id: 'a1' }),
        buildAdminAtom({ id: 'a2' }),
      ])));

      fixture.detectChanges();

      expect(component.atoms().length).toBe(2);
      expect(component.isEmpty()).toBe(false);
    });

    it('loading is false after data loads', () => {
      fixture.detectChanges();
      expect(component.loading()).toBe(false);
    });

    it('shows toast on load error', () => {
      mockAtomService.getAtoms.mockReturnValue(throwError(() => new Error('Network error')));
      fixture.detectChanges();

      expect(mockToastService.show).toHaveBeenCalledWith('admin.atoms.list.load_error', 'error');
    });
  });

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  describe('selection', () => {
    beforeEach(() => {
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([
        buildAdminAtom({ id: 'a1' }),
        buildAdminAtom({ id: 'a2' }),
        buildAdminAtom({ id: 'a3' }),
      ])));
      fixture.detectChanges();
    });

    it('toggles individual selection', () => {
      component.toggleSelection('a1');
      expect(component.isSelected('a1')).toBe(true);
      expect(component.selectionCount()).toBe(1);

      component.toggleSelection('a1');
      expect(component.isSelected('a1')).toBe(false);
      expect(component.selectionCount()).toBe(0);
    });

    it('selects all', () => {
      component.toggleSelectAll();
      expect(component.allSelected()).toBe(true);
      expect(component.selectionCount()).toBe(3);
    });

    it('deselects all when all are selected', () => {
      component.toggleSelectAll();
      component.toggleSelectAll();
      expect(component.selectionCount()).toBe(0);
    });

    it('hasSelection returns true when items selected', () => {
      expect(component.hasSelection()).toBe(false);
      component.toggleSelection('a1');
      expect(component.hasSelection()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    beforeEach(() => {
      fixture.detectChanges();
      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));
    });

    it('filters by status', () => {
      component.onStatusFilter('published');

      expect(mockAtomService.getAtoms).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
      );
    });

    it('clears status filter with empty string', () => {
      component.onStatusFilter('');

      const callArgs = mockAtomService.getAtoms.mock.calls[0][0];
      expect(callArgs.status).toBeUndefined();
    });

    it('filters by difficulty', () => {
      component.onDifficultyFilter('3');

      expect(mockAtomService.getAtoms).toHaveBeenCalledWith(
        expect.objectContaining({ difficulty: 3 }),
      );
    });

    it('toggles atom type filter', () => {
      component.onAtomTypeFilter('multiple_choice');

      expect(component.filterAtomTypes()).toEqual(['multiple_choice']);
      expect(mockAtomService.getAtoms).toHaveBeenCalledWith(
        expect.objectContaining({ atom_type: 'multiple_choice' }),
      );
    });

    it('removes atom type filter on second toggle', () => {
      component.onAtomTypeFilter('multiple_choice');
      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

      component.onAtomTypeFilter('multiple_choice');

      expect(component.filterAtomTypes()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('debounces search input', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

      const event = { target: { value: 'algebra' } } as unknown as Event;
      component.onSearchInput(event);

      expect(mockAtomService.getAtoms).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);

      expect(mockAtomService.getAtoms).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination', () => {
    beforeEach(() => {
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse(
        [buildAdminAtom({ id: 'a1' })],
        true, // has_next = true
      )));
      fixture.detectChanges();
    });

    it('starts on page 1', () => {
      expect(component.currentPage()).toBe(1);
    });

    it('has no previous page on page 1', () => {
      expect(component.hasPreviousPage()).toBe(false);
    });

    it('reports next page availability', () => {
      expect(component.hasNextPage()).toBe(true);
    });

    it('navigates to next page', () => {
      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([buildAdminAtom({ id: 'a2' })])));

      component.nextPage();

      expect(component.currentPage()).toBe(2);
      expect(mockAtomService.getAtoms).toHaveBeenCalled();
    });

    it('navigates back to previous page', () => {
      // Go to page 2
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([buildAdminAtom({ id: 'a2' })], true)));
      component.nextPage();

      // Go back to page 1
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([buildAdminAtom({ id: 'a1' })], true)));
      component.previousPage();

      expect(component.currentPage()).toBe(1);
    });

    it('changes page size and resets pagination', () => {
      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

      component.onPageSizeChange('50');

      expect(component.pageSize()).toBe(50);
      expect(component.currentPage()).toBe(1);
      expect(mockAtomService.getAtoms).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  describe('navigation', () => {
    beforeEach(() => {
      fixture.detectChanges();
      vi.spyOn(router, 'navigate').mockResolvedValue(true);
    });

    it('navigates to create on button click', () => {
      component.navigateToCreate();
      expect(router.navigate).toHaveBeenCalledWith(['/admin/content/atoms/new']);
    });

    it('navigates to edit on row click', () => {
      component.navigateToEdit('atom-001');
      expect(router.navigate).toHaveBeenCalledWith(['/admin/content/atoms', 'atom-001', 'edit']);
    });

    it('navigates on Enter key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');
      component.onRowKeydown(event, 'atom-001');

      expect(event.preventDefault).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/admin/content/atoms', 'atom-001', 'edit']);
    });
  });

  // -------------------------------------------------------------------------
  // Bulk Actions
  // -------------------------------------------------------------------------

  describe('bulk actions', () => {
    beforeEach(() => {
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([
        buildAdminAtom({ id: 'a1' }),
        buildAdminAtom({ id: 'a2' }),
      ])));
      fixture.detectChanges();
      component.toggleSelection('a1');
      component.toggleSelection('a2');
    });

    it('bulk publishes selected atoms', async () => {
      mockAtomService.updateAtom.mockReturnValue(of(buildAdminAtom({ status: 'published' })));
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

      await component.bulkPublish();

      expect(mockAtomService.updateAtom).toHaveBeenCalledTimes(2);
      expect(mockToastService.show).toHaveBeenCalledWith('admin.atoms.list.bulk_publish_success', 'success');
    });

    it('bulk archives selected atoms after confirm', async () => {
      mockConfirmService.confirm.mockResolvedValue(true);
      mockAtomService.deleteAtom.mockReturnValue(of(undefined));
      mockAtomService.getAtoms.mockReturnValue(of(buildListResponse([])));

      await component.bulkArchive();

      expect(mockConfirmService.confirm).toHaveBeenCalled();
      expect(mockAtomService.deleteAtom).toHaveBeenCalledTimes(2);
      expect(mockToastService.show).toHaveBeenCalledWith('admin.atoms.list.bulk_archive_success', 'success');
    });

    it('skips bulk archive when confirm is cancelled', async () => {
      mockConfirmService.confirm.mockResolvedValue(false);

      await component.bulkArchive();

      expect(mockAtomService.deleteAtom).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  describe('helpers', () => {
    it('getTitle extracts stem from revision content', () => {
      const atom = buildAdminAtom();
      expect(component.getTitle(atom)).toBe('What is 2+2?');
    });

    it('getTitle returns "Untitled Atom" when no revision', () => {
      const atom = buildAdminAtom({ latest_revision: null });
      expect(component.getTitle(atom)).toBe('Untitled Atom');
    });

    it('getDifficultyStars returns correct boolean array', () => {
      const stars = component.getDifficultyStars(3);
      expect(stars).toEqual([true, true, true, false, false]);
    });

    it('formatDate converts ISO string', () => {
      const formatted = component.formatDate('2026-01-15T00:00:00Z');
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe('2026-01-15T00:00:00Z');
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('does not throw on destroy', () => {
      fixture.detectChanges();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
