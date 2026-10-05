/**
 * AtomEditorComponent — Admin form for creating and editing LearningAtoms.
 *
 * Routes:
 *   /admin/content/atoms/new       — create mode (blank form)
 *   /admin/content/atoms/:id/edit  — edit mode (pre-populated from API)
 *
 * Implements HasUnsavedChanges for the unsavedChangesGuard.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { HasUnsavedChanges } from '../../../../../core/guards/unsaved-changes.guard';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import {
  AdminAtom,
  AdminAtomType,
  VisibilityStatus,
  ValidationRuleType,
  ALL_ATOM_TYPES,
  ALL_VISIBILITY_STATUSES,
  ADMIN_ATOM_TYPE_LABELS,
  ADMIN_ATOM_TYPE_ICONS,
  VALIDATION_RULE_LABELS,
  AnswerValidationRule,
  CreateRevisionRequest,
} from '../../models/admin-atom.model';

type EditorMode = 'create' | 'edit';

const ALL_VALIDATION_RULE_TYPES: ValidationRuleType[] = [
  'exact_match', 'regex', 'range', 'keyword', 'manual', 'llm_graded',
];

@Component({
  selector: 'chora-atom-editor',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './atom-editor.component.html',
  styleUrl: './atom-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomEditorComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly atomService = inject(AdminAtomService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly mode = signal<EditorMode>('create');
  readonly atomId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly previewVisible = signal(false);
  readonly currentAtom = signal<AdminAtom | null>(null);

  // --- Constants for template ---
  readonly allAtomTypes = ALL_ATOM_TYPES;
  readonly allStatuses = ALL_VISIBILITY_STATUSES;
  readonly allRuleTypes = ALL_VALIDATION_RULE_TYPES;
  readonly atomTypeLabels = ADMIN_ATOM_TYPE_LABELS;
  readonly atomTypeIcons = ADMIN_ATOM_TYPE_ICONS;
  readonly ruleLabels = VALIDATION_RULE_LABELS;

  // --- Computed ---
  readonly pageTitle = computed(() =>
    this.mode() === 'create'
      ? 'admin.atoms.editor.create_title'
      : 'admin.atoms.editor.edit_title',
  );

  readonly selectedAtomType = computed<AdminAtomType>(() => {
    const val = this.metaForm.get('atom_type')?.value;
    return val ?? 'multiple_choice';
  });

  readonly statusBadgeClass = computed(() => {
    const atom = this.currentAtom();
    if (!atom) return '';
    return `atom-editor__status-badge--${atom.status}`;
  });

  // --- Forms ---
  readonly metaForm: FormGroup;
  readonly contentForm: FormGroup;
  readonly validationRulesForm: FormArray;

  private dirty = false;
  private subscriptions = new Subscription();

  constructor() {
    this.metaForm = this.fb.group({
      atom_type: ['multiple_choice', Validators.required],
      difficulty: [3, [Validators.required, Validators.min(1), Validators.max(5)]],
      language_code: ['en', [Validators.required, Validators.minLength(2), Validators.maxLength(10)]],
      tags: [''],
    });

    this.contentForm = this.fb.group({
      // MCQ
      stem: [''],
      options: this.fb.array([]),
      explanation: [''],
      // Fill Blank
      blanks: [''],
      // Flashcard
      front: [''],
      back: [''],
      // Slide
      title: [''],
      body: [''],
      media_url: [''],
      // Short Answer
      expected_answers: [''],
      tolerance: [null],
      // Matching pairs
      pairs: this.fb.array([]),
      // Ordering items
      items: this.fb.array([]),
      // Hotspot
      image_url: [''],
      hotspots: this.fb.array([]),
    });

    this.validationRulesForm = this.fb.array([]);

    // Track dirty state
    effect(() => {
      // reading signals in effect to track re-evaluation
      this.currentAtom();
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode.set('edit');
      this.atomId.set(id);
      this.loadAtom(id);
    }

    // Track form changes for dirty detection
    this.subscriptions.add(
      this.metaForm.valueChanges.subscribe(() => { this.dirty = true; }),
    );
    this.subscriptions.add(
      this.contentForm.valueChanges.subscribe(() => { this.dirty = true; }),
    );
    this.subscriptions.add(
      this.validationRulesForm.valueChanges.subscribe(() => { this.dirty = true; }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  private loadAtom(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.atomService.getAtom(id).subscribe({
        next: (atom) => {
          this.currentAtom.set(atom);
          this.populateForm(atom);
          this.loading.set(false);
          this.dirty = false;
        },
        error: () => {
          this.toast.show('admin.atoms.editor.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  private populateForm(atom: AdminAtom): void {
    this.metaForm.patchValue({
      atom_type: atom.atom_type,
      difficulty: atom.difficulty,
      language_code: atom.language_code,
      tags: atom.tags.join(', '),
    });

    // Disable atom_type in edit mode (immutable after creation)
    this.metaForm.get('atom_type')?.disable();

    if (atom.latest_revision) {
      this.populateContentForm(atom.atom_type, atom.latest_revision.content);
      this.populateValidationRules(atom.latest_revision.validation_rules);
    }
  }

  private populateContentForm(atomType: AdminAtomType, content: Record<string, unknown>): void {
    switch (atomType) {
      case 'multiple_choice':
        this.contentForm.patchValue({
          stem: content['stem'] ?? '',
          explanation: content['explanation'] ?? '',
        });
        this.populateMcqOptions(content['options'] as Record<string, unknown>[] ?? []);
        break;
      case 'fill_blank':
        this.contentForm.patchValue({
          stem: content['stem'] ?? '',
          blanks: (content['blanks'] as string[] ?? []).join(', '),
        });
        break;
      case 'true_false':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        break;
      case 'short_answer':
        this.contentForm.patchValue({
          stem: content['stem'] ?? '',
          expected_answers: (content['expected_answers'] as string[] ?? []).join(', '),
          tolerance: content['tolerance'] ?? null,
        });
        break;
      case 'matching':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        this.populateMatchingPairs(content['pairs'] as Record<string, unknown>[] ?? []);
        break;
      case 'ordering':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        this.populateOrderingItems(content['items'] as string[] ?? []);
        break;
      case 'code':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        break;
      case 'essay':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        break;
      case 'multimedia':
        this.contentForm.patchValue({
          stem: content['stem'] ?? '',
          media_url: content['media_url'] ?? '',
        });
        break;
      case 'simulation':
        this.contentForm.patchValue({ stem: content['stem'] ?? '' });
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // MCQ Options
  // -------------------------------------------------------------------------

  get mcqOptions(): FormArray {
    return this.contentForm.get('options') as FormArray;
  }

  addMcqOption(): void {
    this.mcqOptions.push(this.fb.group({
      text: ['', Validators.required],
      is_correct: [false],
    }));
  }

  removeMcqOption(index: number): void {
    this.mcqOptions.removeAt(index);
  }

  private populateMcqOptions(options: Record<string, unknown>[]): void {
    this.mcqOptions.clear();
    for (const opt of options) {
      this.mcqOptions.push(this.fb.group({
        text: [opt['text'] ?? '', Validators.required],
        is_correct: [opt['is_correct'] ?? false],
      }));
    }
  }

  // -------------------------------------------------------------------------
  // Matching Pairs
  // -------------------------------------------------------------------------

  get matchingPairs(): FormArray {
    return this.contentForm.get('pairs') as FormArray;
  }

  addMatchingPair(): void {
    this.matchingPairs.push(this.fb.group({
      left: ['', Validators.required],
      right: ['', Validators.required],
    }));
  }

  removeMatchingPair(index: number): void {
    this.matchingPairs.removeAt(index);
  }

  private populateMatchingPairs(pairs: Record<string, unknown>[]): void {
    this.matchingPairs.clear();
    for (const pair of pairs) {
      this.matchingPairs.push(this.fb.group({
        left: [pair['left'] ?? '', Validators.required],
        right: [pair['right'] ?? '', Validators.required],
      }));
    }
  }

  // -------------------------------------------------------------------------
  // Ordering Items
  // -------------------------------------------------------------------------

  get orderingItems(): FormArray {
    return this.contentForm.get('items') as FormArray;
  }

  addOrderingItem(): void {
    this.orderingItems.push(this.fb.control('', Validators.required));
  }

  removeOrderingItem(index: number): void {
    this.orderingItems.removeAt(index);
  }

  private populateOrderingItems(items: string[]): void {
    const arr = this.contentForm.get('items') as FormArray;
    arr.clear();
    for (const item of items) {
      arr.push(this.fb.control(item, Validators.required));
    }
  }

  // -------------------------------------------------------------------------
  // Validation Rules
  // -------------------------------------------------------------------------

  addValidationRule(): void {
    this.validationRulesForm.push(this.fb.group({
      rule_type: ['exact_match', Validators.required],
      expected: [''],
      tolerance: [null],
      case_sensitive: [false],
    }));
  }

  removeValidationRule(index: number): void {
    this.validationRulesForm.removeAt(index);
  }

  private populateValidationRules(rules: AnswerValidationRule[]): void {
    this.validationRulesForm.clear();
    for (const rule of rules) {
      this.validationRulesForm.push(this.fb.group({
        rule_type: [rule.rule_type, Validators.required],
        expected: [typeof rule.expected === 'string' ? rule.expected : JSON.stringify(rule.expected)],
        tolerance: [rule.tolerance ?? null],
        case_sensitive: [rule.case_sensitive],
      }));
    }
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  togglePreview(): void {
    this.previewVisible.update((v) => !v);
  }

  // -------------------------------------------------------------------------
  // Form Submission
  // -------------------------------------------------------------------------

  saveDraft(): void {
    this.saveAtom(false);
  }

  saveAndPublish(): void {
    this.saveAtom(true);
  }

  cancel(): void {
    this.router.navigate(['/admin/content/atoms']);
  }

  private saveAtom(publish: boolean): void {
    if (this.metaForm.invalid) {
      this.metaForm.markAllAsTouched();
      this.toast.show('admin.atoms.editor.fix_errors', 'warning');
      return;
    }

    this.saving.set(true);
    const tagsValue = this.metaForm.get('tags')?.value ?? '';
    const tags = tagsValue
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);

    if (this.mode() === 'create') {
      this.createAtom(tags, publish);
    } else {
      this.updateExistingAtom(tags, publish);
    }
  }

  private createAtom(tags: string[], publish: boolean): void {
    const atomType = this.metaForm.get('atom_type')?.value as AdminAtomType;

    this.subscriptions.add(
      this.atomService.createAtom({
        atom_type: atomType,
        difficulty: this.metaForm.get('difficulty')?.value,
        language_code: this.metaForm.get('language_code')?.value,
        tags,
      }).subscribe({
        next: (atom) => {
          // Create the first revision with content
          this.createRevisionForAtom(atom.id, publish);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.atoms.editor.create_error', 'error');
        },
      }),
    );
  }

  private updateExistingAtom(tags: string[], publish: boolean): void {
    const id = this.atomId()!;

    this.subscriptions.add(
      this.atomService.updateAtom(id, {
        difficulty: this.metaForm.get('difficulty')?.value,
        language_code: this.metaForm.get('language_code')?.value,
        tags,
      }).subscribe({
        next: () => {
          // Create a new revision with updated content
          this.createRevisionForAtom(id, publish);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.atoms.editor.update_error', 'error');
        },
      }),
    );
  }

  private createRevisionForAtom(atomId: string, publish: boolean): void {
    const content = this.buildContentPayload();
    const validationRules = this.buildValidationRules();

    const request: CreateRevisionRequest = {
      content,
      validation_rules: validationRules,
      publish,
    };

    this.subscriptions.add(
      this.atomService.createRevision(atomId, request).subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty = false;
          const messageKey = publish
            ? 'admin.atoms.editor.published_success'
            : 'admin.atoms.editor.draft_saved';
          this.toast.show(messageKey, 'success');
          this.router.navigate(['/admin/content/atoms']);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.atoms.editor.revision_error', 'error');
        },
      }),
    );
  }

  private buildContentPayload(): Record<string, unknown> {
    const atomType = this.metaForm.getRawValue().atom_type as AdminAtomType;

    switch (atomType) {
      case 'multiple_choice':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          options: this.mcqOptions.value.map((opt: Record<string, unknown>, i: number) => ({
            id: i + 1,
            text: opt['text'],
            is_correct: opt['is_correct'],
          })),
          explanation: this.contentForm.get('explanation')?.value || undefined,
        };
      case 'fill_blank':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          blanks: (this.contentForm.get('blanks')?.value ?? '')
            .split(',')
            .map((b: string) => b.trim())
            .filter((b: string) => b.length > 0),
        };
      case 'true_false':
        return { stem: this.contentForm.get('stem')?.value ?? '' };
      case 'short_answer':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          expected_answers: (this.contentForm.get('expected_answers')?.value ?? '')
            .split(',')
            .map((a: string) => a.trim())
            .filter((a: string) => a.length > 0),
          tolerance: this.contentForm.get('tolerance')?.value ?? undefined,
        };
      case 'matching':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          pairs: this.matchingPairs.value,
        };
      case 'ordering':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          items: this.orderingItems.value,
        };
      case 'code':
        return { stem: this.contentForm.get('stem')?.value ?? '' };
      case 'essay':
        return { stem: this.contentForm.get('stem')?.value ?? '' };
      case 'multimedia':
        return {
          stem: this.contentForm.get('stem')?.value ?? '',
          media_url: this.contentForm.get('media_url')?.value ?? '',
        };
      case 'simulation':
        return { stem: this.contentForm.get('stem')?.value ?? '' };
      default: {
        // Flashcard (not in task spec atom types but covering as fallback)
        return {
          front: this.contentForm.get('front')?.value ?? '',
          back: this.contentForm.get('back')?.value ?? '',
        };
      }
    }
  }

  private buildValidationRules(): AnswerValidationRule[] {
    return this.validationRulesForm.value.map((rule: Record<string, unknown>) => {
      let expected: unknown = rule['expected'];
      // Try to parse JSON for complex expected values
      if (typeof expected === 'string') {
        try {
          expected = JSON.parse(expected as string);
        } catch {
          // Keep as string
        }
      }
      return {
        rule_type: rule['rule_type'] as ValidationRuleType,
        expected,
        tolerance: rule['tolerance'] as number | null ?? null,
        case_sensitive: rule['case_sensitive'] as boolean,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Template Helpers
  // -------------------------------------------------------------------------

  getAtomTypeIcon(type: AdminAtomType): string {
    return ADMIN_ATOM_TYPE_ICONS[type];
  }

  getAtomTypeLabel(type: AdminAtomType): string {
    return ADMIN_ATOM_TYPE_LABELS[type];
  }

  getDifficultyValue(): number {
    return this.metaForm.get('difficulty')?.value ?? 3;
  }

  getStatusLabel(): VisibilityStatus {
    return this.currentAtom()?.status ?? 'draft';
  }
}
