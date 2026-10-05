/**
 * AssessmentBuilderComponent — Admin form for creating/editing AssessmentSessions.
 *
 * Routes:
 *   /admin/content/assessments/new          — create mode
 *   /admin/content/assessments/:id/edit     — edit mode
 *
 * Implements HasUnsavedChanges for the unsavedChangesGuard.
 * Supports 4-tier hierarchy: Session -> Paper -> Section -> Atoms
 */
import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  OnInit,
  OnDestroy,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subscription, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { HasUnsavedChanges } from '../../../../../core/guards/unsaved-changes.guard';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdminAssessmentService } from '../../services/admin-assessment.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import {
  SessionType,
  StructureMode,
  GradingMode,
  PaperDraft,
  SectionDraft,
  AtomAssignment,
  ALL_SESSION_TYPES,
  ALL_STRUCTURE_MODES,
  ALL_GRADING_MODES,
  SESSION_TYPE_LABELS,
  STRUCTURE_MODE_LABELS,
  GRADING_MODE_LABELS,
} from '../../models/admin-assessment.model';
import {
  AdminAtom,
  AuthorQuestionImages,
  getAtomTitle,
  ADMIN_ATOM_TYPE_ICONS,
} from '../../models/admin-atom.model';

type EditorMode = 'create' | 'edit';

let draftIdCounter = 0;
function nextDraftId(): string {
  draftIdCounter++;
  return `draft-${draftIdCounter}`;
}

@Component({
  selector: 'chora-assessment-builder',
  standalone: true,
  imports: [NgTemplateOutlet, ReactiveFormsModule, TranslatePipe],
  templateUrl: './assessment-builder.component.html',
  styleUrl: './assessment-builder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentBuilderComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly assessmentService = inject(AdminAssessmentService);
  private readonly atomService = inject(AdminAtomService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  // --- State ---
  readonly mode = signal<EditorMode>('create');
  readonly sessionId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly previewVisible = signal(false);

  // --- 4-Tier Hierarchy ---
  readonly papers = signal<PaperDraft[]>([]);
  readonly sections = signal<SectionDraft[]>([]);

  // --- MCQ illustration cache (CHO-1638) ---
  // Keyed by atom_id. Hydrated lazily (only once the author opens the
  // preview) via the two-hop author projection fetch. The assessment-builder
  // is an author surface, so BOTH the question + model-answer illustrations
  // are in scope here — never rendered on a learner-take path.
  private readonly _questionImages = signal<Readonly<Record<string, AuthorQuestionImages>>>({});
  readonly questionImages = this._questionImages.asReadonly();
  private readonly imagesInFlight = new Set<string>();

  // --- Atom Picker ---
  readonly atomPickerVisible = signal(false);
  readonly atomPickerAtoms = signal<AdminAtom[]>([]);
  readonly atomPickerLoading = signal(false);
  readonly atomPickerTarget = signal<{ type: 'session' | 'section'; sectionId?: string } | null>(null);

  // --- Constants ---
  readonly allSessionTypes = ALL_SESSION_TYPES;
  readonly allStructureModes = ALL_STRUCTURE_MODES;
  readonly allGradingModes = ALL_GRADING_MODES;
  readonly sessionTypeLabels = SESSION_TYPE_LABELS;
  readonly structureModeLabels = STRUCTURE_MODE_LABELS;
  readonly gradingModeLabels = GRADING_MODE_LABELS;

  // --- Form ---
  readonly sessionForm: FormGroup;

  // --- Computed ---
  readonly pageTitle = computed(() =>
    this.mode() === 'create'
      ? 'admin.assessments.builder.create_title'
      : 'admin.assessments.builder.edit_title',
  );

  readonly totalPoints = computed(() => {
    let total = 0;
    for (const paper of this.papers()) {
      for (const section of paper.sections) {
        total += this.sectionPoints(section);
      }
    }
    for (const section of this.sections()) {
      total += this.sectionPoints(section);
    }
    return total;
  });

  readonly structureMode = computed<StructureMode>(() => {
    return this.sessionForm.get('structure_mode')?.value ?? 'flat';
  });

  private dirty = false;
  private subscriptions = new Subscription();

  constructor() {
    this.sessionForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: [''],
      session_type: ['straight_up_exam' as SessionType, Validators.required],
      structure_mode: ['papers_and_sections' as StructureMode, Validators.required],
      time_limit_minutes: [null as number | null, [Validators.min(1)]],
    });

    // CHO-1638 — hydrate MCQ illustrations for the preview. Gated on
    // previewVisible() so the (potentially many) author projection fetches
    // only fire when the author actually opens the preview. For each MCQ
    // atom, resolve the embedded question_id via the learner-safe projection,
    // then fetch BOTH illustration URLs from the author question projection.
    effect(() => {
      if (!this.previewVisible()) return;
      const atoms = this.collectPreviewAtoms();
      const cache = this._questionImages();
      for (const atom of atoms) {
        if (atom.atom_type !== 'multiple_choice') continue;
        if (cache[atom.atom_id] !== undefined) continue;
        if (this.imagesInFlight.has(atom.atom_id)) continue;
        this.imagesInFlight.add(atom.atom_id);
        this.atomService
          .getAtomProjection(atom.atom_id)
          .pipe(
            switchMap((proj) => {
              const qid = proj.mcq_payload?.question_id;
              if (!qid) {
                return of<AuthorQuestionImages>({ image_url: null, answer_image_url: null });
              }
              return this.atomService.getQuestionImages(atom.atom_id, qid);
            }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe({
            next: (imgs) => {
              this.imagesInFlight.delete(atom.atom_id);
              this._questionImages.update((c) => ({ ...c, [atom.atom_id]: imgs }));
            },
            error: () => {
              this.imagesInFlight.delete(atom.atom_id);
              // Fail-soft — a missing/forbidden image just hides the figure;
              // leave uncached so a later effect run can retry.
            },
          });
      }
    });
  }

  /** Question illustration URL for a preview atom (CHO-1638), or null. */
  questionImageFor(atomId: string): string | null {
    return this._questionImages()[atomId]?.image_url ?? null;
  }

  /** Model-answer illustration URL for a preview atom (CHO-1638), or null. */
  answerImageFor(atomId: string): string | null {
    return this._questionImages()[atomId]?.answer_image_url ?? null;
  }

  /** Flatten every atom assignment (paper sections + standalone sections). */
  private collectPreviewAtoms(): AtomAssignment[] {
    const out: AtomAssignment[] = [];
    for (const paper of this.papers()) {
      for (const section of paper.sections) {
        out.push(...section.atoms);
      }
    }
    for (const section of this.sections()) {
      out.push(...section.atoms);
    }
    return out;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode.set('edit');
      this.sessionId.set(id);
      this.loadAssessment(id);
    }

    this.subscriptions.add(
      this.sessionForm.valueChanges.subscribe(() => { this.dirty = true; }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  // -------------------------------------------------------------------------
  // Data Loading
  // -------------------------------------------------------------------------

  private loadAssessment(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.assessmentService.getAssessment(id).subscribe({
        next: (session) => {
          this.sessionForm.patchValue({
            title: session.title ?? '',
            description: session.description ?? '',
            session_type: session.session_type,
            structure_mode: session.structure_mode,
            time_limit_minutes: session.time_limit_ms
              ? Math.round(session.time_limit_ms / 60000)
              : null,
          });
          this.loading.set(false);
          this.dirty = false;
        },
        error: () => {
          this.toast.show('admin.assessments.builder.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Paper Management
  // -------------------------------------------------------------------------

  addPaper(): void {
    const paper: PaperDraft = {
      id: nextDraftId(),
      title: `Paper ${this.papers().length + 1}`,
      time_limit_ms: null,
      sections: [],
      expanded: true,
    };
    this.papers.update((papers) => [...papers, paper]);
    this.dirty = true;
  }

  removePaper(paperId: string): void {
    this.papers.update((papers) => papers.filter((p) => p.id !== paperId));
    this.dirty = true;
  }

  updatePaperTitle(paperId: string, title: string): void {
    this.papers.update((papers) =>
      papers.map((p) => (p.id === paperId ? { ...p, title } : p)),
    );
    this.dirty = true;
  }

  updatePaperTimeLimit(paperId: string, minutes: number | null): void {
    this.papers.update((papers) =>
      papers.map((p) => (p.id === paperId
        ? { ...p, time_limit_ms: minutes ? minutes * 60000 : null }
        : p)),
    );
    this.dirty = true;
  }

  togglePaperExpand(paperId: string): void {
    this.papers.update((papers) =>
      papers.map((p) => (p.id === paperId ? { ...p, expanded: !p.expanded } : p)),
    );
  }

  // -------------------------------------------------------------------------
  // Section Management
  // -------------------------------------------------------------------------

  addSection(paperId?: string): void {
    const section: SectionDraft = {
      id: nextDraftId(),
      title: 'Section',
      points: 0,
      grading_mode: 'auto',
      atoms: [],
      expanded: true,
    };

    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return {
              ...p,
              sections: [...p.sections, { ...section, title: `Section ${p.sections.length + 1}` }],
            };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) => [
        ...sections,
        { ...section, title: `Section ${sections.length + 1}` },
      ]);
    }
    this.dirty = true;
  }

  removeSection(sectionId: string, paperId?: string): void {
    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return { ...p, sections: p.sections.filter((s) => s.id !== sectionId) };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) => sections.filter((s) => s.id !== sectionId));
    }
    this.dirty = true;
  }

  updateSectionTitle(sectionId: string, title: string, paperId?: string): void {
    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return {
              ...p,
              sections: p.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
            };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) =>
        sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
      );
    }
    this.dirty = true;
  }

  updateSectionGradingMode(sectionId: string, gradingMode: GradingMode, paperId?: string): void {
    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, grading_mode: gradingMode } : s,
              ),
            };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) =>
        sections.map((s) =>
          s.id === sectionId ? { ...s, grading_mode: gradingMode } : s,
        ),
      );
    }
    this.dirty = true;
  }

  toggleSectionExpand(sectionId: string, paperId?: string): void {
    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, expanded: !s.expanded } : s,
              ),
            };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) =>
        sections.map((s) => (s.id === sectionId ? { ...s, expanded: !s.expanded } : s)),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Atom Management
  // -------------------------------------------------------------------------

  openAtomPicker(target: { type: 'session' | 'section'; sectionId?: string }): void {
    this.atomPickerTarget.set(target);
    this.atomPickerVisible.set(true);
    if (this.atomPickerAtoms().length === 0) {
      this.loadAtomCatalog();
    }
  }

  closeAtomPicker(): void {
    this.atomPickerVisible.set(false);
    this.atomPickerTarget.set(null);
  }

  private loadAtomCatalog(): void {
    this.atomPickerLoading.set(true);
    this.subscriptions.add(
      this.atomService.getAtoms({ limit: 100, status: 'published' }).subscribe({
        next: (response) => {
          this.atomPickerAtoms.set(response.data);
          this.atomPickerLoading.set(false);
        },
        error: () => {
          this.atomPickerLoading.set(false);
        },
      }),
    );
  }

  selectAtom(atom: AdminAtom): void {
    const assignment: AtomAssignment = {
      atom_id: atom.id,
      atom_title: getAtomTitle(atom),
      atom_type: atom.atom_type,
      revision_id: atom.latest_revision?.id ?? null,
      available_revisions: atom.latest_revision
        ? [{
            id: atom.latest_revision.id,
            revision_number: atom.latest_revision.revision_number,
            visibility_status: atom.latest_revision.visibility_status,
            created_at: atom.latest_revision.created_at,
          }]
        : [],
      points: 1,
    };

    const target = this.atomPickerTarget();
    if (!target) return;

    if (target.type === 'section' && target.sectionId) {
      this.addAtomToSection(target.sectionId, assignment);
    }

    this.dirty = true;
    this.closeAtomPicker();
  }

  private addAtomToSection(sectionId: string, assignment: AtomAssignment): void {
    // Search in standalone sections first
    let found = false;
    this.sections.update((sections) =>
      sections.map((s) => {
        if (s.id === sectionId) {
          found = true;
          return { ...s, atoms: [...s.atoms, assignment] };
        }
        return s;
      }),
    );

    if (!found) {
      // Search in paper sections
      this.papers.update((papers) =>
        papers.map((p) => ({
          ...p,
          sections: p.sections.map((s) => {
            if (s.id === sectionId) {
              return { ...s, atoms: [...s.atoms, assignment] };
            }
            return s;
          }),
        })),
      );
    }
  }

  removeAtomFromSection(sectionId: string, atomId: string, paperId?: string): void {
    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return {
              ...p,
              sections: p.sections.map((s) => {
                if (s.id === sectionId) {
                  return { ...s, atoms: s.atoms.filter((a) => a.atom_id !== atomId) };
                }
                return s;
              }),
            };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) =>
        sections.map((s) => {
          if (s.id === sectionId) {
            return { ...s, atoms: s.atoms.filter((a) => a.atom_id !== atomId) };
          }
          return s;
        }),
      );
    }
    this.dirty = true;
  }

  updateAtomPoints(sectionId: string, atomId: string, points: number, paperId?: string): void {
    const updateFn = (s: SectionDraft): SectionDraft => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        atoms: s.atoms.map((a) =>
          a.atom_id === atomId ? { ...a, points } : a,
        ),
      };
    };

    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return { ...p, sections: p.sections.map(updateFn) };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) => sections.map(updateFn));
    }
    this.dirty = true;
  }

  updateAtomRevision(sectionId: string, atomId: string, revisionId: string, paperId?: string): void {
    const updateFn = (s: SectionDraft): SectionDraft => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        atoms: s.atoms.map((a) =>
          a.atom_id === atomId ? { ...a, revision_id: revisionId } : a,
        ),
      };
    };

    if (paperId) {
      this.papers.update((papers) =>
        papers.map((p) => {
          if (p.id === paperId) {
            return { ...p, sections: p.sections.map(updateFn) };
          }
          return p;
        }),
      );
    } else {
      this.sections.update((sections) => sections.map(updateFn));
    }
    this.dirty = true;
  }

  // -------------------------------------------------------------------------
  // Points Calculation
  // -------------------------------------------------------------------------

  sectionPoints(section: SectionDraft): number {
    return section.atoms.reduce((sum, a) => sum + a.points, 0);
  }

  paperPoints(paper: PaperDraft): number {
    return paper.sections.reduce((sum, s) => sum + this.sectionPoints(s), 0);
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  togglePreview(): void {
    this.previewVisible.update((v) => !v);
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  saveDraft(): void {
    this.save(false);
  }

  saveAndPublish(): void {
    this.save(true);
  }

  cancel(): void {
    this.router.navigate(['/admin/content/atoms']);
  }

  private save(publish: boolean): void {
    if (this.sessionForm.invalid) {
      this.sessionForm.markAllAsTouched();
      this.toast.show('admin.assessments.builder.fix_errors', 'warning');
      return;
    }

    this.saving.set(true);
    const formValue = this.sessionForm.value;
    const timeLimitMs = formValue.time_limit_minutes
      ? formValue.time_limit_minutes * 60000
      : null;

    const allAtomIds = this.collectAllAtomIds();
    const allRevisionIds = this.collectAllRevisionIds();

    const request = {
      title: formValue.title,
      description: formValue.description || undefined,
      session_type: formValue.session_type as SessionType,
      structure_mode: formValue.structure_mode as StructureMode,
      time_limit_ms: timeLimitMs,
      atom_ids: allAtomIds,
      atom_revision_ids: allRevisionIds,
    };

    const operation = this.mode() === 'create'
      ? this.assessmentService.createAssessment(request)
      : this.assessmentService.updateAssessment(this.sessionId()!, request);

    this.subscriptions.add(
      operation.subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty = false;
          const messageKey = publish
            ? 'admin.assessments.builder.published_success'
            : 'admin.assessments.builder.draft_saved';
          this.toast.show(messageKey, 'success');
          this.router.navigate(['/admin/content/atoms']);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.assessments.builder.save_error', 'error');
        },
      }),
    );
  }

  private collectAllAtomIds(): string[] {
    const ids: string[] = [];
    for (const paper of this.papers()) {
      for (const section of paper.sections) {
        for (const atom of section.atoms) {
          ids.push(atom.atom_id);
        }
      }
    }
    for (const section of this.sections()) {
      for (const atom of section.atoms) {
        ids.push(atom.atom_id);
      }
    }
    return ids;
  }

  private collectAllRevisionIds(): string[] {
    const ids: string[] = [];
    for (const paper of this.papers()) {
      for (const section of paper.sections) {
        for (const atom of section.atoms) {
          if (atom.revision_id) ids.push(atom.revision_id);
        }
      }
    }
    for (const section of this.sections()) {
      for (const atom of section.atoms) {
        if (atom.revision_id) ids.push(atom.revision_id);
      }
    }
    return ids;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getAtomTypeIcon(type: string): string {
    return ADMIN_ATOM_TYPE_ICONS[type as keyof typeof ADMIN_ATOM_TYPE_ICONS] ?? 'quiz';
  }

  getPaperTimeLimitMinutes(paper: PaperDraft): number | null {
    return paper.time_limit_ms ? Math.round(paper.time_limit_ms / 60000) : null;
  }
}
