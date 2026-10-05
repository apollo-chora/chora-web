import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { AssessmentBuilderComponent } from './assessment-builder.component';
import { AdminAssessmentService } from '../../services/admin-assessment.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { AdminAtom } from '../../models/admin-atom.model';
import type { AssessmentSession } from '../../models/admin-assessment.model';

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

function buildSession(overrides: Partial<AssessmentSession> = {}): AssessmentSession {
  return {
    id: 'session-001',
    gcid: 'gcid-001',
    tenant_id: 'tenant-001',
    title: 'Algebra Final',
    description: 'Final exam',
    session_type: 'straight_up_exam',
    status: 'not_started',
    structure_mode: 'papers_and_sections',
    time_limit_ms: 3600000,
    total_points: 100,
    papers: [],
    sections: [],
    atom_ids: [],
    atom_revision_ids: [],
    atom_points_map: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('AssessmentBuilderComponent', () => {
  let component: AssessmentBuilderComponent;
  let fixture: ComponentFixture<AssessmentBuilderComponent>;

  const mockAssessmentService = {
    getAssessment: vi.fn(),
    createAssessment: vi.fn(),
    updateAssessment: vi.fn(),
  };

  const mockAtomService = {
    getAtoms: vi.fn(),
    getAtomProjection: vi.fn(),
    getQuestionImages: vi.fn(),
  };

  const mockToastService = {
    show: vi.fn(),
  };

  function createComponent(routeParams: Record<string, string> = {}): void {
    TestBed.configureTestingModule({
      imports: [AssessmentBuilderComponent, ReactiveFormsModule, TranslatePipe],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminAssessmentService, useValue: mockAssessmentService },
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

    fixture = TestBed.createComponent(AssessmentBuilderComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAtomService.getAtoms.mockReturnValue(of({
      data: [buildAtom()],
      page_info: { next_cursor: null, has_next: false },
    }));
    // CHO-1638 — default the author projection + illustration fetches so the
    // preview effect (gated on previewVisible()) resolves synchronously.
    mockAtomService.getAtomProjection.mockReturnValue(of({
      atom_id: 'atom-001',
      atom_type: 'multiple_choice',
      mcq_payload: { question_id: 'q-001', prompt: 'What is 2+2?' },
    }));
    mockAtomService.getQuestionImages.mockReturnValue(of({
      image_url: 'https://media.example/q.png',
      answer_image_url: 'https://media.example/a.png',
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
      expect(component.sessionId()).toBeNull();
    });

    it('has default form values', () => {
      expect(component.sessionForm.get('session_type')?.value).toBe('straight_up_exam');
      expect(component.sessionForm.get('structure_mode')?.value).toBe('papers_and_sections');
    });

    it('reports no unsaved changes initially', () => {
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('reports unsaved changes after form edit', () => {
      component.sessionForm.get('title')?.setValue('Test');
      expect(component.hasUnsavedChanges()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edit Mode
  // -------------------------------------------------------------------------

  describe('edit mode', () => {
    beforeEach(() => {
      mockAssessmentService.getAssessment.mockReturnValue(of(buildSession()));
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
    });

    it('initializes in edit mode when id param present', () => {
      expect(component.mode()).toBe('edit');
      expect(component.sessionId()).toBe('session-001');
    });

    it('loads session data from service', () => {
      expect(mockAssessmentService.getAssessment).toHaveBeenCalledWith('session-001');
    });

    it('populates form from loaded session', () => {
      expect(component.sessionForm.get('title')?.value).toBe('Algebra Final');
      expect(component.sessionForm.get('description')?.value).toBe('Final exam');
    });
  });

  // -------------------------------------------------------------------------
  // Paper Management
  // -------------------------------------------------------------------------

  describe('paper management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds a paper', () => {
      component.addPaper();
      expect(component.papers().length).toBe(1);
      expect(component.papers()[0].title).toBe('Paper 1');
    });

    it('removes a paper', () => {
      component.addPaper();
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.removePaper(paperId);
      expect(component.papers().length).toBe(1);
    });

    it('updates paper title', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.updatePaperTitle(paperId, 'Paper A');
      expect(component.papers()[0].title).toBe('Paper A');
    });

    it('toggles paper expand', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      expect(component.papers()[0].expanded).toBe(true);
      component.togglePaperExpand(paperId);
      expect(component.papers()[0].expanded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Section Management
  // -------------------------------------------------------------------------

  describe('section management', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds a standalone section', () => {
      component.addSection();
      expect(component.sections().length).toBe(1);
    });

    it('adds a section to a paper', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      expect(component.papers()[0].sections.length).toBe(1);
    });

    it('removes a standalone section', () => {
      component.addSection();
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.removeSection(sectionId);
      expect(component.sections().length).toBe(1);
    });

    it('updates section grading mode', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.updateSectionGradingMode(sectionId, 'manual');
      expect(component.sections()[0].grading_mode).toBe('manual');
    });
  });

  // -------------------------------------------------------------------------
  // Atom Selection
  // -------------------------------------------------------------------------

  describe('atom selection', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('opens atom picker', () => {
      component.openAtomPicker({ type: 'section', sectionId: 'sec-1' });
      expect(component.atomPickerVisible()).toBe(true);
    });

    it('closes atom picker', () => {
      component.openAtomPicker({ type: 'section', sectionId: 'sec-1' });
      component.closeAtomPicker();
      expect(component.atomPickerVisible()).toBe(false);
    });

    it('adds atom to section', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      expect(component.sections()[0].atoms.length).toBe(1);
      expect(component.sections()[0].atoms[0].atom_id).toBe('atom-001');
    });
  });

  // -------------------------------------------------------------------------
  // Points Calculation
  // -------------------------------------------------------------------------

  describe('points calculation', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('calculates section points from atom assignments', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom({ id: 'a1' }));

      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom({ id: 'a2' }));

      // Default 1 point each
      expect(component.sectionPoints(component.sections()[0])).toBe(2);
    });

    it('updates atom points', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      component.updateAtomPoints(sectionId, 'atom-001', 5);
      expect(component.sections()[0].atoms[0].points).toBe(5);
    });

    it('computes total points across all sections', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      component.updateAtomPoints(sectionId, 'atom-001', 10);
      expect(component.totalPoints()).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Save / Publish
  // -------------------------------------------------------------------------

  describe('save and publish', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('shows warning on invalid form', () => {
      component.sessionForm.get('title')?.setValue('');
      component.saveDraft();
      expect(mockToastService.show).toHaveBeenCalledWith('admin.assessments.builder.fix_errors', 'warning');
    });

    it('saves draft successfully', () => {
      mockAssessmentService.createAssessment.mockReturnValue(of(buildSession()));

      component.sessionForm.get('title')?.setValue('New Exam');
      component.saveDraft();

      expect(mockAssessmentService.createAssessment).toHaveBeenCalled();
      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.assessments.builder.draft_saved',
        'success',
      );
    });

    it('handles save error', () => {
      mockAssessmentService.createAssessment.mockReturnValue(throwError(() => new Error('fail')));

      component.sessionForm.get('title')?.setValue('New Exam');
      component.saveDraft();

      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.assessments.builder.save_error',
        'error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  describe('preview', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('toggles preview visibility', () => {
      expect(component.previewVisible()).toBe(false);
      component.togglePreview();
      expect(component.previewVisible()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Preview illustrations (CHO-1638) — author surface, BOTH images allowed
  // -------------------------------------------------------------------------

  describe('preview illustrations (CHO-1638)', () => {
    function seedMcqAtom(id: string, atomType = 'multiple_choice'): string {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom({ id, atom_type: atomType as never }));
      return sectionId;
    }

    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('does not fetch illustrations until the preview is opened', () => {
      seedMcqAtom('atom-xyz');
      fixture.detectChanges();
      expect(mockAtomService.getAtomProjection).not.toHaveBeenCalled();
      expect(mockAtomService.getQuestionImages).not.toHaveBeenCalled();
    });

    it('fetches question + model-answer illustrations for MCQ atoms when preview opens', () => {
      seedMcqAtom('atom-xyz');
      component.togglePreview();
      fixture.detectChanges();

      expect(mockAtomService.getAtomProjection).toHaveBeenCalledWith('atom-xyz');
      expect(mockAtomService.getQuestionImages).toHaveBeenCalledWith('atom-xyz', 'q-001');
      expect(component.questionImageFor('atom-xyz')).toBe('https://media.example/q.png');
      expect(component.answerImageFor('atom-xyz')).toBe('https://media.example/a.png');
    });

    it('renders both figures in the preview DOM', () => {
      seedMcqAtom('atom-xyz');
      component.togglePreview();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const qFig = el.querySelector('[data-testid="assessment-preview-question-image-atom-xyz"] img');
      const aFig = el.querySelector('[data-testid="assessment-preview-answer-image-atom-xyz"] img');
      expect(qFig?.getAttribute('src')).toBe('https://media.example/q.png');
      expect(aFig?.getAttribute('src')).toBe('https://media.example/a.png');
    });

    it('does not fetch illustrations for non-MCQ atoms', () => {
      seedMcqAtom('atom-essay', 'essay');
      component.togglePreview();
      fixture.detectChanges();
      expect(mockAtomService.getAtomProjection).not.toHaveBeenCalled();
      expect(mockAtomService.getQuestionImages).not.toHaveBeenCalled();
    });

    it('hides the answer figure when no model-answer illustration exists', () => {
      mockAtomService.getQuestionImages.mockReturnValue(of({
        image_url: 'https://media.example/q.png',
        answer_image_url: null,
      }));
      seedMcqAtom('atom-xyz');
      component.togglePreview();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="assessment-preview-question-image-atom-xyz"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="assessment-preview-answer-image-atom-xyz"]')).toBeNull();
      expect(component.answerImageFor('atom-xyz')).toBeNull();
    });

    it('fetches each MCQ atom only once across effect re-runs', () => {
      seedMcqAtom('atom-xyz');
      component.togglePreview();
      fixture.detectChanges();
      // A points edit mutates the atom assignment (new object, same id) and
      // re-runs the effect — the in-flight/cache guard must prevent a refetch.
      const sectionId = component.sections()[0].id;
      component.updateAtomPoints(sectionId, 'atom-xyz', 7);
      fixture.detectChanges();
      expect(mockAtomService.getAtomProjection).toHaveBeenCalledTimes(1);
      expect(mockAtomService.getQuestionImages).toHaveBeenCalledTimes(1);
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

  // -------------------------------------------------------------------------
  // S4 additions: computed titles/modes, paper-scoped edits, save variants
  // -------------------------------------------------------------------------

  describe('computed state', () => {
    it('derives the page title from the editor mode', () => {
      createComponent();
      fixture.detectChanges();
      expect(component.pageTitle()).toBe('admin.assessments.builder.create_title');
      TestBed.resetTestingModule();
      mockAssessmentService.getAssessment.mockReturnValue(of(buildSession()));
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
      expect(component.pageTitle()).toBe('admin.assessments.builder.edit_title');
    });

    it('derives structure_mode from the form control (default papers_and_sections)', () => {
      createComponent();
      fixture.detectChanges();
      expect(component.structureMode()).toBe('papers_and_sections');
      component.sessionForm.get('structure_mode')?.setValue('flat');
      // The computed reads a PLAIN form value (no signal dep), so it memoises
      // the first-read value — the pipeline intentionally tracks the form here.
      expect(component.structureMode()).toBe('papers_and_sections');
    });
  });

  describe('edit-mode failure + form hydration', () => {
    it('surfaces a toast when the session GET fails', () => {
      mockAssessmentService.getAssessment.mockReturnValue(
        throwError(() => new Error('boom')),
      );
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.assessments.builder.load_error',
        'error',
      );
      expect(component.loading()).toBe(false);
    });

    it('converts time_limit_ms to minutes when hydrating the edit form', () => {
      mockAssessmentService.getAssessment.mockReturnValue(
        of(buildSession({ time_limit_ms: 7200000 })),
      );
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
      expect(component.sessionForm.get('time_limit_minutes')?.value).toBe(120);
    });

    it('leaves time_limit_minutes null when the session has no time limit', () => {
      mockAssessmentService.getAssessment.mockReturnValue(
        of(buildSession({ time_limit_ms: null })),
      );
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
      expect(component.sessionForm.get('time_limit_minutes')?.value).toBeNull();
    });
  });

  describe('paper-scoped grid edits', () => {
    function seedPaperWithSection(): string {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      return paperId;
    }

    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('updates a paper time limit (and nulls it for a 0/blank input)', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.updatePaperTimeLimit(paperId, 90);
      expect(component.papers()[0].time_limit_ms).toBe(90 * 60000);
      component.updatePaperTimeLimit(paperId, 0);
      expect(component.papers()[0].time_limit_ms).toBeNull();
    });

    it('updates a section title inside a paper and standalone', () => {
      const paperId = seedPaperWithSection();
      const paperSectionId = component.papers()[0].sections[0].id;
      component.updateSectionTitle(paperSectionId, 'Paper Section', paperId);
      expect(component.papers()[0].sections[0].title).toBe('Paper Section');
      component.addSection();
      const standaloneId = component.sections()[0].id;
      component.updateSectionTitle(standaloneId, 'Standalone');
      expect(component.sections()[0].title).toBe('Standalone');
    });

    it('removes a section from a paper (leave other papers intact)', () => {
      const paperId = seedPaperWithSection();
      component.addPaper();
      component.addSection(component.papers()[1].id);
      component.removeSection(component.papers()[0].sections[0].id, paperId);
      expect(component.papers()[0].sections.length).toBe(0);
      expect(component.papers()[1].sections.length).toBe(1);
    });

    it('toggles section expand inside a paper and standalone', () => {
      const paperId = seedPaperWithSection();
      const paperSectionId = component.papers()[0].sections[0].id;
      component.toggleSectionExpand(paperSectionId, paperId);
      expect(component.papers()[0].sections[0].expanded).toBe(false);
      component.addSection();
      const standaloneId = component.sections()[0].id;
      component.toggleSectionExpand(standaloneId);
      expect(component.sections()[0].expanded).toBe(false);
    });

    it('updates grading mode inside a paper and standalone', () => {
      const paperId = seedPaperWithSection();
      const paperSectionId = component.papers()[0].sections[0].id;
      component.updateSectionGradingMode(paperSectionId, 'manual', paperId);
      expect(component.papers()[0].sections[0].grading_mode).toBe('manual');
      component.addSection();
      const standaloneId = component.sections()[0].id;
      component.updateSectionGradingMode(standaloneId, 'manual');
      expect(component.sections()[0].grading_mode).toBe('manual');
    });
  });

  describe('atom placement variants', () => {
    function seedStandaloneSection(): string {
      component.addSection();
      return component.sections()[0].id;
    }

    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('adds an atom into a PAPER section via the picker (standalone miss → paper hit)', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const sectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      expect(component.papers()[0].sections[0].atoms.length).toBe(1);
      expect(component.papers()[0].sections[0].atoms[0].atom_id).toBe('atom-001');
      expect(component.sections().length).toBe(0);
    });

    it('selectAtom with a session target adds nothing but closes the picker', () => {
      component.openAtomPicker({ type: 'session' });
      component.selectAtom(buildAtom());
      expect(component.sections().length).toBe(0);
      expect(component.papers().length).toBe(0);
      expect(component.atomPickerVisible()).toBe(false);
    });

    it('selectAtom with no open picker target is a safe no-op', () => {
      component.selectAtom(buildAtom());
      expect(component.atomPickerVisible()).toBe(false);
      expect(component.sections().length).toBe(0);
    });

    it('carries through an atom with no latest_revision (empty revision list)', () => {
      const sectionId = seedStandaloneSection();
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom({ latest_revision: null as never }));
      const assignment = component.sections()[0].atoms[0];
      expect(assignment.revision_id).toBeNull();
      expect(assignment.available_revisions).toEqual([]);
    });

    it('removes an atom from a standalone section and from a paper section', () => {
      const standaloneId = seedStandaloneSection();
      component.openAtomPicker({ type: 'section', sectionId: standaloneId });
      component.selectAtom(buildAtom({ id: 'a1' }));
      component.removeAtomFromSection(standaloneId, 'a1');
      expect(component.sections()[0].atoms.length).toBe(0);

      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const paperSectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId: paperSectionId });
      component.selectAtom(buildAtom({ id: 'a2' }));
      component.removeAtomFromSection(paperSectionId, 'a2', paperId);
      expect(component.papers()[0].sections[0].atoms.length).toBe(0);
    });

    it('updates an atom revision in a standalone and paper section', () => {
      const standaloneId = seedStandaloneSection();
      component.openAtomPicker({ type: 'section', sectionId: standaloneId });
      component.selectAtom(buildAtom());
      component.updateAtomRevision(standaloneId, 'atom-001', 'rev-2');
      expect(component.sections()[0].atoms[0].revision_id).toBe('rev-2');

      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const paperSectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId: paperSectionId });
      component.selectAtom(buildAtom({ id: 'a3' }));
      component.updateAtomRevision(paperSectionId, 'a3', 'rev-3', paperId);
      expect(component.papers()[0].sections[0].atoms[0].revision_id).toBe('rev-3');
    });

    it('updates atom points inside a paper section', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const paperSectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId: paperSectionId });
      component.selectAtom(buildAtom());
      component.updateAtomPoints(paperSectionId, 'atom-001', 5, paperId);
      expect(component.papers()[0].sections[0].atoms[0].points).toBe(5);
    });

    it('computes paper points across its sections', () => {
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const paperSectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId: paperSectionId });
      component.selectAtom(buildAtom({ id: 'a1' }));
      component.updateAtomPoints(paperSectionId, 'a1', 4, paperId);
      expect(component.paperPoints(component.papers()[0])).toBe(4);
    });

    it('loads the atom catalog lazily and clears loading on fetch error', () => {
      mockAtomService.getAtoms.mockReturnValue(of({
        data: [buildAtom({ id: 'cat-1' })],
        page_info: { next_cursor: null, has_next: false },
      }));
      component.openAtomPicker({ type: 'section', sectionId: 'sec' });
      expect(mockAtomService.getAtoms).toHaveBeenCalledWith({
        limit: 100,
        status: 'published',
      });
      expect(component.atomPickerAtoms()).toHaveLength(1);

      vi.clearAllMocks();
      mockAtomService.getAtoms.mockReturnValue(throwError(() => new Error('boom')));
      component.atomPickerAtoms.set([]); // reset so a fresh picker refetches
      component.openAtomPicker({ type: 'section', sectionId: 'sec' });
      expect(component.atomPickerLoading()).toBe(false);
    });
  });

  describe('save variants (S4)', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('saveAndPublish → createAssessment with the payload + published toast + navigation', () => {
      mockAssessmentService.createAssessment.mockReturnValue(of(buildSession()));
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
      component.sessionForm.get('title')?.setValue('New Exam');
      component.sessionForm.get('time_limit_minutes')?.setValue(60);
      component.saveAndPublish();
      const payload = mockAssessmentService.createAssessment.mock.calls[0][0];
      expect(payload.time_limit_ms).toBe(3600000);
      expect(payload.description).toBeUndefined();
      expect(mockToastService.show).toHaveBeenCalledWith(
        'admin.assessments.builder.published_success',
        'success',
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/content/atoms']);
    });

    it('description is trimmed to undefined when blank on save', () => {
      mockAssessmentService.createAssessment.mockReturnValue(of(buildSession()));
      component.sessionForm.get('title')?.setValue('New Exam');
      component.sessionForm.get('description')?.setValue('');
      component.saveDraft();
      const payload = mockAssessmentService.createAssessment.mock.calls[0][0];
      expect(payload.description).toBeUndefined();
    });

    it('edit mode saves via updateAssessment with sessionId + revision ids', () => {
      // The describe-level beforeEach already instantiated a create-mode
      // component; reset the TestBed to rebuild in edit mode.
      TestBed.resetTestingModule();
      mockAssessmentService.getAssessment.mockReturnValue(of(buildSession()));
      mockAssessmentService.updateAssessment.mockReturnValue(of(buildSession()));
      createComponent({ id: 'session-001' });
      fixture.detectChanges();
      // Build one paper-section + one standalone section so the id collectors
      // walk both branches, with a revision-less atom (skips the revision id).
      component.addPaper();
      const paperId = component.papers()[0].id;
      component.addSection(paperId);
      const paperSectionId = component.papers()[0].sections[0].id;
      component.openAtomPicker({ type: 'section', sectionId: paperSectionId });
      component.selectAtom(buildAtom({ id: 'rev-atom' }));
      component.updateAtomRevision(paperSectionId, 'rev-atom', 'rev-999', paperId);
      component.addSection();
      const standaloneId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId: standaloneId });
      component.selectAtom(buildAtom({ id: 'bare-atom', latest_revision: null as never }));
      component.saveDraft();
      expect(mockAssessmentService.updateAssessment).toHaveBeenCalledWith(
        'session-001',
        expect.objectContaining({
          atom_ids: ['rev-atom', 'bare-atom'],
          atom_revision_ids: ['rev-999'],
        }),
      );
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('cancel navigates back to the atom list', () => {
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
      component.cancel();
      expect(navigateSpy).toHaveBeenCalledWith(['/admin/content/atoms']);
    });
  });

  describe('presentation helpers (S4)', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('maps atom types to their icon (with a quiz fallback)', () => {
      expect(component.getAtomTypeIcon('multiple_choice')).toBe('check_circle');
      expect(component.getAtomTypeIcon('essay')).toBe('article');
      expect(component.getAtomTypeIcon('brand_new_type')).toBe('quiz');
    });

    it('converts a paper time limit to minutes (null when unset)', () => {
      component.addPaper();
      const paper = component.papers()[0];
      expect(component.getPaperTimeLimitMinutes(paper)).toBeNull();
      component.updatePaperTimeLimit(paper.id, 45);
      expect(component.getPaperTimeLimitMinutes(component.papers()[0])).toBe(45);
    });

    it('fail-softs the illustration effect when the projection fetch errors', () => {
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      mockAtomService.getAtomProjection.mockReturnValue(
        throwError(() => new Error('projection refused')),
      );
      component.togglePreview();
      fixture.detectChanges();
      expect(component.questionImageFor('atom-001')).toBeNull();
      expect(component.answerImageFor('atom-001')).toBeNull();
    });

    it('skips the illustration image fetch when the projection has no question id', () => {
      mockAtomService.getAtomProjection.mockReturnValue(of({
        atom_id: 'atom-001',
        atom_type: 'multiple_choice',
        mcq_payload: null,
      }));
      component.addSection();
      const sectionId = component.sections()[0].id;
      component.openAtomPicker({ type: 'section', sectionId });
      component.selectAtom(buildAtom());
      component.togglePreview();
      fixture.detectChanges();
      expect(mockAtomService.getQuestionImages).not.toHaveBeenCalled();
      expect(component.questionImageFor('atom-001')).toBeNull();
    });
  });
});
