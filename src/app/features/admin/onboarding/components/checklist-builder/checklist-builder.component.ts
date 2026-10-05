/**
 * ChecklistBuilderComponent — Admin interface for creating and editing
 * onboarding checklist templates with drag-and-drop item reordering.
 *
 * Route: admin/onboarding/templates/new | admin/onboarding/templates/:id/edit
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
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { OnboardingAdminService } from '../../services/onboarding-admin.service';
import type {
  ChecklistTemplate,
  ChecklistItem,
  ItemType,
} from '../../models/onboarding.model';
import {
  ALL_ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_TYPE_ICONS,
} from '../../models/onboarding.model';

@Component({
  selector: 'chora-checklist-builder',
  standalone: true,
  imports: [FormsModule, TranslatePipe, CdkDrag, CdkDropList],
  templateUrl: './checklist-builder.component.html',
  styleUrl: './checklist-builder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChecklistBuilderComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly onboardingAdmin = inject(OnboardingAdminService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly templateId = signal<string | null>(null);
  readonly templateName = signal('');
  readonly templateDescription = signal('');
  readonly targetRoles = signal<string[]>([]);
  readonly items = signal<ChecklistItem[]>([]);
  readonly selectedItemIndex = signal<number | null>(null);
  readonly roleInput = signal('');

  // --- Constants ---
  readonly allItemTypes = ALL_ITEM_TYPES;
  readonly itemTypeLabels = ITEM_TYPE_LABELS;
  readonly itemTypeIcons = ITEM_TYPE_ICONS;

  // --- Computed ---
  readonly isEditing = computed(() => this.templateId() !== null);
  readonly selectedItem = computed(() => {
    const index = this.selectedItemIndex();
    if (index === null) return null;
    return this.items()[index] ?? null;
  });
  readonly canSave = computed(
    () => this.templateName().trim().length > 0 && this.items().length > 0,
  );

  private subscriptions = new Subscription();
  private itemCounter = 0;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.templateId.set(id);
      this.loadTemplate(id);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Template Loading
  // ---------------------------------------------------------------------------

  private loadTemplate(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.onboardingAdmin.loadTemplate(id).subscribe({
        next: (template) => {
          if (template) {
            this.applyTemplate(template);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.onboarding.template_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  private applyTemplate(template: ChecklistTemplate): void {
    this.templateName.set(template.name);
    this.templateDescription.set(template.description);
    this.targetRoles.set([...template.target_roles]);
    this.items.set([...template.items]);
    this.itemCounter = template.items.length;
  }

  // ---------------------------------------------------------------------------
  // Item Management
  // ---------------------------------------------------------------------------

  addItem(type: ItemType): void {
    this.itemCounter++;
    const newItem: ChecklistItem = {
      id: `item-new-${this.itemCounter}`,
      name: '',
      description: '',
      type,
      required: true,
      due_date_offset_days: null,
      linked_resource_url: null,
      order: this.items().length,
    };
    this.items.update((current) => [...current, newItem]);
    this.selectedItemIndex.set(this.items().length - 1);
  }

  removeItem(index: number): void {
    this.items.update((current) => {
      const updated = current.filter((_, i) => i !== index);
      return updated.map((item, i) => ({ ...item, order: i }));
    });
    if (this.selectedItemIndex() === index) {
      this.selectedItemIndex.set(null);
    } else if (
      this.selectedItemIndex() !== null &&
      this.selectedItemIndex()! > index
    ) {
      this.selectedItemIndex.update((i) => (i !== null ? i - 1 : null));
    }
  }

  selectItem(index: number): void {
    this.selectedItemIndex.set(index);
  }

  onItemDrop(event: CdkDragDrop<ChecklistItem[]>): void {
    const current = [...this.items()];
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.items.set(current.map((item, i) => ({ ...item, order: i })));

    const selected = this.selectedItemIndex();
    if (selected !== null) {
      if (selected === event.previousIndex) {
        this.selectedItemIndex.set(event.currentIndex);
      } else if (selected > event.previousIndex && selected <= event.currentIndex) {
        this.selectedItemIndex.update((i) => (i !== null ? i - 1 : null));
      } else if (selected < event.previousIndex && selected >= event.currentIndex) {
        this.selectedItemIndex.update((i) => (i !== null ? i + 1 : null));
      }
    }
  }

  updateItemName(index: number, name: string): void {
    this.items.update((current) =>
      current.map((item, i) => (i === index ? { ...item, name } : item)),
    );
  }

  updateItemDescription(index: number, description: string): void {
    this.items.update((current) =>
      current.map((item, i) => (i === index ? { ...item, description } : item)),
    );
  }

  updateItemRequired(index: number, required: boolean): void {
    this.items.update((current) =>
      current.map((item, i) => (i === index ? { ...item, required } : item)),
    );
  }

  updateItemDueDateOffset(index: number, days: number | null): void {
    this.items.update((current) =>
      current.map((item, i) =>
        i === index ? { ...item, due_date_offset_days: days } : item,
      ),
    );
  }

  updateItemLinkedUrl(index: number, url: string): void {
    this.items.update((current) =>
      current.map((item, i) =>
        i === index ? { ...item, linked_resource_url: url || null } : item,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Role Management
  // ---------------------------------------------------------------------------

  addRole(): void {
    const role = this.roleInput().trim();
    if (role && !this.targetRoles().includes(role)) {
      this.targetRoles.update((roles) => [...roles, role]);
      this.roleInput.set('');
    }
  }

  removeRole(role: string): void {
    this.targetRoles.update((roles) => roles.filter((r) => r !== role));
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  save(): void {
    if (!this.canSave()) return;

    this.saving.set(true);
    const payload = this.buildPayload();

    const request$ = this.isEditing()
      ? this.onboardingAdmin.updateTemplate(this.templateId()!, payload)
      : this.onboardingAdmin.createTemplate(payload);

    this.subscriptions.add(
      request$.subscribe({
        next: (result) => {
          this.saving.set(false);
          if (result) {
            this.toast.show('admin.onboarding.template_saved', 'success');
            if (!this.isEditing()) {
              this.router.navigate([
                '/admin/onboarding/templates',
                result.id,
                'edit',
              ]);
            }
          } else {
            this.toast.show('admin.onboarding.template_save_error', 'error');
          }
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.onboarding.template_save_error', 'error');
        },
      }),
    );
  }

  cancel(): void {
    this.router.navigate(['/admin/onboarding']);
  }

  private buildPayload(): Omit<ChecklistTemplate, 'id' | 'created_at' | 'updated_at'> {
    return {
      name: this.templateName(),
      description: this.templateDescription(),
      items: this.items(),
      target_roles: this.targetRoles(),
    };
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByItemType(_index: number, type: ItemType): string {
    return type;
  }
}
