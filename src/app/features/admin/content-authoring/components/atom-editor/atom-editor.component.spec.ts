import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { AtomEditorComponent } from './atom-editor.component';
import { AdminAtomService } from '../../services/admin-atom.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { AdminAtom, AtomRevision } from '../../models/admin-atom.model';

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
      content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4', is_correct: true }] },
      validation_rules: [{ rule_type: 'exact_match', expected: '1', tolerance: null, case_sensitive: false }],
      visibility_status: 'published',
      metadata: null,
      published_at: '2026-01-01T12:00:00Z',
      created_by: 'gcid-001',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('AtomEditorComponent', () => {
  let component: AtomEditorComponent;
  let fixture: ComponentFixture<AtomEditorComponent>;

  const mockAtomService = {
    getAtom: vi.fn(),
    createAtom: vi.fn(),
    updateAtom: vi.fn(),
    createRevision: vi.fn(),
  };

  const mockToastService = {
    show: vi.fn(),
  };

  function createComponent(routeParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [AtomEditorComponent, ReactiveFormsModule, TranslatePipe],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminAtomService, useValue: mockAtomService },
        { provide: ToastService, useValue: mockToastService },
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

    fixture = TestBed.createComponent(AtomEditorComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(component.atomId()).toBeNull();
    });

    it('has default form values', () => {
      expect(component.metaForm.get('atom_type')?.value).toBe('multiple_choice');
      expect(component.metaForm.get('difficulty')?.value).toBe(3);
      expect(component.metaForm.get('language_code')?.value).toBe('en');
    });

    it('reports no unsaved changes initially', () => {
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('reports unsaved changes after form edit', () => {
      component.metaForm.get('difficulty')?.setValue(5);
      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it('renders create title', () => {
      expect(component.pageTitle()).toBe('admin.atoms.editor.create_title');
    });
  });

  // -------------------------------------------------------------------------
  // Edit Mode
  // -------------------------------------------------------------------------

  describe('edit mode', () => {
    beforeEach(() => {
      createComponent({ id: 'atom-001' });
      mockAtomService.getAtom.mockReturnValue(of(buildAdminAtom()));
      fixture.detectChanges();
    });

    it('initializes in edit mode when id param present', () => {
      expect(component.mode()).toBe('edit');
      expect(component.atomId()).toBe('atom-001');
    });

    it('loads atom data from service', () => {
      expect(mockAtomService.getAtom).toHaveBeenCalledWith('atom-001');
    });

    it('populates meta form from loaded atom', () => {
      expect(component.metaForm.getRawValue().atom_type).toBe('multiple_choice');
      expect(component.metaForm.get('difficulty')?.value).toBe(3);
      expect(component.metaForm.get('tags')?.value).toBe('math');
    });

    it('disables atom_type in edit mode', () => {
      expect(component.metaForm.get('atom_type')?.disabled).toBe(true);
    });

    it('populates MCQ content from revision', () => {
      expect(component.contentForm.get('stem')?.value).toBe('What is 2+2?');
      expect(component.mcqOptions.length).toBe(1);
    });

    it('populates validation rules from revision', () => {
      expect(component.validationRulesForm.length).toBe(1);
      expect(component.validationRulesForm.at(0).get('rule_type')?.value).toBe('exact_match');
    });

    it('renders edit title', () => {
      expect(component.pageTitle()).toBe('admin.atoms.editor.edit_title');
    });
  });

  // -------------------------------------------------------------------------
  // MCQ Options
  // -------------------------------------------------------------------------

  describe('MCQ options management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds an MCQ option', () => {
      component.addMcqOption();
      expect(component.mcqOptions.length).toBe(1);
    });

    it('removes an MCQ option', () => {
      component.addMcqOption();
      component.addMcqOption();
      component.removeMcqOption(0);
      expect(component.mcqOptions.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Matching Pairs
  // -------------------------------------------------------------------------

  describe('matching pairs management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds a matching pair', () => {
      component.addMatchingPair();
      expect(component.matchingPairs.length).toBe(1);
    });

    it('removes a matching pair', () => {
      component.addMatchingPair();
      component.addMatchingPair();
      component.removeMatchingPair(0);
      expect(component.matchingPairs.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Ordering Items
  // -------------------------------------------------------------------------

  describe('ordering items management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds an ordering item', () => {
      component.addOrderingItem();
      expect(component.orderingItems.length).toBe(1);
    });

    it('removes an ordering item', () => {
      component.addOrderingItem();
      component.addOrderingItem();
      component.removeOrderingItem(0);
      expect(component.orderingItems.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Validation Rules
  // -------------------------------------------------------------------------

  describe('validation rules management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds a validation rule with default type', () => {
      component.addValidationRule();
      expect(component.validationRulesForm.length).toBe(1);
      expect(component.validationRulesForm.at(0).get('rule_type')?.value).toBe('exact_match');
    });

    it('removes a validation rule', () => {
      component.addValidationRule();
      component.addValidationRule();
      component.removeValidationRule(0);
      expect(component.validationRulesForm.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  describe('preview toggle', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('starts with preview hidden', () => {
      expect(component.previewVisible()).toBe(false);
    });

    it('toggles preview visibility', () => {
      component.togglePreview();
      expect(component.previewVisible()).toBe(true);
      component.togglePreview();
      expect(component.previewVisible()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Save (Create)
  // -------------------------------------------------------------------------

  describe('save (create mode)', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('shows warning toast on invalid form', () => {
      component.metaForm.get('language_code')?.setValue('');
      component.saveDraft();
      expect(mockToastService.show).toHaveBeenCalledWith('admin.atoms.editor.fix_errors', 'warning');
    });

    it('calls createAtom then createRevision for save draft', () => {
      const createdAtom = buildAdminAtom({ id: 'atom-new' });
      const revision: AtomRevision = {
        id: 'rev-new',
        atom_id: 'atom-new',
        revision_number: 1,
        content: {},
        validation_rules: [],
        visibility_status: 'draft',
        metadata: null,
        published_at: null,
        created_by: 'gcid-001',
        created_at: '2026-01-01T00:00:00Z',
      };

      mockAtomService.createAtom.mockReturnValue(of(createdAtom));
      mockAtomService.createRevision.mockReturnValue(of(revision));

      component.saveDraft();

      expect(mockAtomService.createAtom).toHaveBeenCalled();
      expect(mockAtomService.createRevision).toHaveBeenCalledWith(
        'atom-new',
        expect.objectContaining({ publish: false }),
      );
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
