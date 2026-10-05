import { describe, it, expect, beforeEach, vi } from 'vitest';

// Polyfill DataTransfer and DragEvent for jsdom which does not implement them
if (typeof globalThis.DataTransfer === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)['DataTransfer'] = class DataTransfer {
    dropEffect = 'none';
    effectAllowed = 'all';
    readonly files: FileList = [] as unknown as FileList;
    readonly items: DataTransferItemList = [] as unknown as DataTransferItemList;
    readonly types: readonly string[] = [];
    clearData(): void { /* test mock no-op */ }
    getData(): string { return ''; }
    setData(): void { /* test mock no-op */ }
    setDragImage(): void { /* test mock no-op */ }
  };
}
if (typeof globalThis.DragEvent === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)['DragEvent'] = class DragEvent extends MouseEvent {
    readonly dataTransfer: DataTransfer | null;
    constructor(type: string, init?: DragEventInit) {
      super(type, init);
      this.dataTransfer = init?.dataTransfer ?? null;
    }
  };
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { PathBuilderComponent } from './path-builder.component';
import { AdminPathService } from '../../services/admin-path.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { AdminAtom } from '../../models/admin-atom.model';
import type { LockedPath } from '../../models/admin-path.model';

function buildAtom(overrides: Partial<AdminAtom> = {}): AdminAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: [],
    status: 'published',
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
      published_at: '2026-01-01T00:00:00Z',
      created_by: 'gcid-001',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function buildPath(overrides: Partial<LockedPath> = {}): LockedPath {
  return {
    id: 'path-001',
    tenant_id: 'tenant-001',
    title: 'Algebra Foundations',
    description: 'Learn algebra basics',
    estimated_duration_ms: 3600000,
    enrollment_type: 'open',
    status: 'draft',
    steps: [
      {
        id: 'step-1',
        path_id: 'path-001',
        atom_id: 'atom-001',
        atom_title: 'What is 2+2?',
        atom_type: 'multiple_choice',
        step_order: 1,
        prerequisite_step_id: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('PathBuilderComponent', () => {
  let component: PathBuilderComponent;
  let fixture: ComponentFixture<PathBuilderComponent>;

  const mockPathService = {
    getPath: vi.fn(),
    createPath: vi.fn(),
    updatePath: vi.fn(),
  };

  const mockAtomService = {
    getAtoms: vi.fn(),
  };

  const mockToastService = {
    show: vi.fn(),
  };

  const mockConfirmDialog = {
    confirm: vi.fn(),
  };

  function createComponent(routeParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [PathBuilderComponent, ReactiveFormsModule, TranslatePipe],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminPathService, useValue: mockPathService },
        { provide: AdminAtomService, useValue: mockAtomService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => routeParams[key] ?? null,
              },
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(PathBuilderComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAtomService.getAtoms.mockReturnValue(of({
      data: [buildAtom(), buildAtom({ id: 'atom-002' })],
      page_info: { next_cursor: null, has_next: false },
    }));
  });

  // -------------------------------------------------------------------------
  // Create Mode
  // -------------------------------------------------------------------------

  describe('create mode', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('initializes in create mode when no id param', () => {
      expect(component.mode()).toBe('create');
      expect(component.pathId()).toBeNull();
    });

    it('has default form values', () => {
      expect(component.metaForm.get('enrollment_type')?.value).toBe('open');
    });

    it('reports no unsaved changes initially', () => {
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('renders create title', () => {
      expect(component.pageTitle()).toBe('admin.paths.builder.create_title');
    });
  });

  // -------------------------------------------------------------------------
  // Edit Mode
  // -------------------------------------------------------------------------

  describe('edit mode', () => {
    beforeEach(() => {
      mockPathService.getPath.mockReturnValue(of(buildPath()));
      createComponent({ id: 'path-001' });
      fixture.detectChanges();
    });

    it('initializes in edit mode when id param present', () => {
      expect(component.mode()).toBe('edit');
      expect(component.pathId()).toBe('path-001');
    });

    it('loads path from service', () => {
      expect(mockPathService.getPath).toHaveBeenCalledWith('path-001');
    });

    it('populates form from loaded path', () => {
      expect(component.metaForm.get('title')?.value).toBe('Algebra Foundations');
      expect(component.metaForm.get('description')?.value).toBe('Learn algebra basics');
      expect(component.metaForm.get('enrollment_type')?.value).toBe('open');
    });

    it('loads steps from path', () => {
      expect(component.steps().length).toBe(1);
      expect(component.steps()[0].atom_title).toBe('What is 2+2?');
    });
  });

  // -------------------------------------------------------------------------
  // Step CRUD
  // -------------------------------------------------------------------------

  describe('step management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds a step from atom', () => {
      component.addAtom(buildAtom());
      expect(component.steps().length).toBe(1);
      expect(component.steps()[0].atom_id).toBe('atom-001');
      expect(component.steps()[0].step_order).toBe(1);
    });

    it('auto-increments step order', () => {
      component.addAtom(buildAtom({ id: 'a1' }));
      component.addAtom(buildAtom({ id: 'a2' }));
      expect(component.steps()[1].step_order).toBe(2);
    });

    it('sets requires_previous for non-first steps', () => {
      component.addAtom(buildAtom({ id: 'a1' }));
      component.addAtom(buildAtom({ id: 'a2' }));
      expect(component.steps()[0].requires_previous).toBe(false);
      expect(component.steps()[1].requires_previous).toBe(true);
    });

    it('removes a step and reorders', () => {
      component.addAtom(buildAtom({ id: 'a1' }));
      component.addAtom(buildAtom({ id: 'a2' }));
      component.addAtom(buildAtom({ id: 'a3' }));

      // Remove middle step (no confirm needed since count > 1)
      component.removeStep(1);
      expect(component.steps().length).toBe(2);
      expect(component.steps()[1].step_order).toBe(2);
    });

    it('confirms before removing last step', async () => {
      mockConfirmDialog.confirm.mockResolvedValue(true);
      component.addAtom(buildAtom());

      await component.removeStep(0);

      expect(mockConfirmDialog.confirm).toHaveBeenCalled();
      expect(component.steps().length).toBe(0);
    });

    it('cancels removal of last step when not confirmed', async () => {
      mockConfirmDialog.confirm.mockResolvedValue(false);
      component.addAtom(buildAtom());

      await component.removeStep(0);

      expect(component.steps().length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Drag and Drop Reorder
  // -------------------------------------------------------------------------

  describe('drag and drop reorder', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
      component.addAtom(buildAtom({ id: 'a1' }));
      component.addAtom(buildAtom({ id: 'a2' }));
      component.addAtom(buildAtom({ id: 'a3' }));
    });

    it('sets dragged step on drag start', () => {
      const event = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      component.onStepDragStart(event, 0);
      expect(component.draggedStepIndex()).toBe(0);
    });

    it('sets drop target on drag over', () => {
      const event = new DragEvent('dragover', { dataTransfer: new DataTransfer() });
      vi.spyOn(event, 'preventDefault');
      component.onStepDragOver(event, 2);
      expect(component.dropTargetIndex()).toBe(2);
    });

    it('reorders steps on drop', () => {
      const dragEvent = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      component.onStepDragStart(dragEvent, 0);

      const dropEvent = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      vi.spyOn(dropEvent, 'preventDefault');
      component.onStepDrop(dropEvent, 2);

      expect(component.steps()[0].atom_id).toBe('a2');
      expect(component.steps()[1].atom_id).toBe('a3');
      expect(component.steps()[2].atom_id).toBe('a1');
      // Step orders updated
      expect(component.steps()[0].step_order).toBe(1);
      expect(component.steps()[2].step_order).toBe(3);
    });

    it('clears drag state on drag end', () => {
      component.draggedStepIndex.set(0);
      component.onStepDragEnd();
      expect(component.draggedStepIndex()).toBeNull();
    });

    it('returns correct drop class', () => {
      component.dropTargetIndex.set(1);
      expect(component.getDropClass(1)).toBe('path-builder__step--drop-target');
      expect(component.getDropClass(0)).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Prerequisites
  // -------------------------------------------------------------------------

  describe('prerequisites', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
      component.addAtom(buildAtom({ id: 'a1' }));
      component.addAtom(buildAtom({ id: 'a2' }));
    });

    it('toggles prerequisite on a step', () => {
      const initial = component.steps()[1].requires_previous;
      component.togglePrerequisite(1);
      expect(component.steps()[1].requires_previous).toBe(!initial);
    });
  });

  // -------------------------------------------------------------------------
  // Metadata Form
  // -------------------------------------------------------------------------

  describe('metadata form', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('marks as dirty when form values change', () => {
      component.metaForm.get('title')?.setValue('New Path');
      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it('validates required title', () => {
      component.metaForm.get('title')?.setValue('');
      expect(component.metaForm.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  describe('save', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('shows warning on invalid form', () => {
      component.metaForm.get('title')?.setValue('');
      component.saveDraft();
      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.paths.builder.fix_errors',
        'warning',
      );
    });

    it('saves successfully', () => {
      mockPathService.createPath.mockReturnValue(of(buildPath()));

      component.metaForm.get('title')?.setValue('My Path');
      component.saveDraft();

      expect(mockPathService.createPath).toHaveBeenCalled();
      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.paths.builder.save_success',
        'success',
      );
    });

    it('handles save error', () => {
      mockPathService.createPath.mockReturnValue(throwError(() => new Error('fail')));

      component.metaForm.get('title')?.setValue('My Path');
      component.saveDraft();

      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.paths.builder.save_error',
        'error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Atom Picker
  // -------------------------------------------------------------------------

  describe('atom picker', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('opens atom picker', () => {
      component.openAtomPicker();
      expect(component.atomPickerVisible()).toBe(true);
    });

    it('closes atom picker', () => {
      component.openAtomPicker();
      component.closeAtomPicker();
      expect(component.atomPickerVisible()).toBe(false);
    });

    it('loads atoms when picker opens', () => {
      component.openAtomPicker();
      expect(mockAtomService.getAtoms).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('does not throw on destroy', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
