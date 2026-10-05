/**
 * TopicTreeComponent — Admin tree view for managing TopicNode hierarchy.
 *
 * Route: /admin/content/topics
 *
 * Features:
 *   - Recursive tree rendering with expand/collapse
 *   - Inline create, rename, delete
 *   - Drag-and-drop reorder and reparent (HTML5 drag/drop API)
 *   - Mini atom picker panel for assigning atoms to topics
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
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AdminTopicService } from '../../services/admin-topic.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import { TopicNode, TopicTreeState } from '../../models/admin-topic.model';
import {
  AdminAtom,
  getAtomTitle,
  ADMIN_ATOM_TYPE_ICONS,
} from '../../models/admin-atom.model';

@Component({
  selector: 'chora-topic-tree',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, TranslatePipe],
  templateUrl: './topic-tree.component.html',
  styleUrl: './topic-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicTreeComponent implements OnInit, OnDestroy {
  private readonly topicService = inject(AdminTopicService);
  private readonly atomService = inject(AdminAtomService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- Tree State ---
  readonly treeState = signal<TopicTreeState>({ status: 'idle' });
  readonly expandedIds = signal<Set<string>>(new Set());

  // --- Create Form ---
  readonly showCreateForm = signal(false);
  readonly newTopicName = signal('');
  readonly newTopicParentId = signal<string | null>(null);
  readonly creating = signal(false);

  // --- Inline Rename ---
  readonly editingNodeId = signal<string | null>(null);
  readonly editingName = signal('');

  // --- Drag and Drop ---
  readonly draggedNodeId = signal<string | null>(null);
  readonly dropTargetId = signal<string | null>(null);
  readonly dropPosition = signal<'before' | 'after' | 'inside' | null>(null);

  // --- Atom Picker ---
  readonly atomPickerVisible = signal(false);
  readonly atomSearchTerm = signal('');
  readonly atomPickerAtoms = signal<AdminAtom[]>([]);
  readonly atomPickerLoading = signal(false);
  readonly draggedAtomId = signal<string | null>(null);

  // --- Computed ---
  readonly topics = computed(() => {
    const state = this.treeState();
    return state.status === 'success' ? state.topics : [];
  });

  readonly loading = computed(() => this.treeState().status === 'loading');
  readonly isEmpty = computed(() => !this.loading() && this.topics().length === 0);

  readonly flatTopics = computed<{ id: string; name: string; depth: number }[]>(() => {
    const result: { id: string; name: string; depth: number }[] = [];
    const walk = (nodes: TopicNode[], depth: number): void => {
      for (const node of nodes) {
        result.push({ id: node.id, name: node.name, depth });
        if (node.children?.length) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(this.topics(), 0);
    return result;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadTree();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadTree(): void {
    this.treeState.set({ status: 'loading' });
    this.subscriptions.add(
      this.topicService.getTopicTree().subscribe({
        next: (topics) => {
          this.treeState.set({ status: 'success', topics });
        },
        error: () => {
          this.treeState.set({
            status: 'error',
            error: { code: 'LOAD_FAILED', message: 'Failed to load topic tree' },
          });
          this.toast.show('admin.topics.load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Expand / Collapse
  // -------------------------------------------------------------------------

  isExpanded(nodeId: string): boolean {
    return this.expandedIds().has(nodeId);
  }

  toggleExpand(nodeId: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Create Topic
  // -------------------------------------------------------------------------

  openCreateForm(parentId: string | null = null): void {
    this.showCreateForm.set(true);
    this.newTopicParentId.set(parentId);
    this.newTopicName.set('');
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newTopicName.set('');
    this.newTopicParentId.set(null);
  }

  submitCreate(): void {
    const name = this.newTopicName().trim();
    if (!name) return;

    this.creating.set(true);
    this.subscriptions.add(
      this.topicService.createTopic({
        name,
        parent_id: this.newTopicParentId(),
      }).subscribe({
        next: () => {
          this.creating.set(false);
          this.showCreateForm.set(false);
          this.newTopicName.set('');
          this.toast.show('admin.topics.create_success', 'success');
          this.loadTree();
        },
        error: () => {
          this.creating.set(false);
          this.toast.show('admin.topics.create_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Inline Rename
  // -------------------------------------------------------------------------

  startRename(node: TopicNode): void {
    this.editingNodeId.set(node.id);
    this.editingName.set(node.name);
  }

  cancelRename(): void {
    this.editingNodeId.set(null);
    this.editingName.set('');
  }

  submitRename(nodeId: string): void {
    const newName = this.editingName().trim();
    if (!newName) {
      this.cancelRename();
      return;
    }

    this.subscriptions.add(
      this.topicService.updateTopic(nodeId, { name: newName }).subscribe({
        next: () => {
          this.editingNodeId.set(null);
          this.editingName.set('');
          this.toast.show('admin.topics.rename_success', 'success');
          this.loadTree();
        },
        error: () => {
          this.toast.show('admin.topics.rename_error', 'error');
        },
      }),
    );
  }

  onRenameKeydown(event: KeyboardEvent, nodeId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submitRename(nodeId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
  }

  // -------------------------------------------------------------------------
  // Delete Topic
  // -------------------------------------------------------------------------

  async deleteTopic(node: TopicNode): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.topics.delete_confirm_title',
      message: 'admin.topics.delete_confirm_message',
      confirmText: 'admin.topics.delete_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.topicService.deleteTopic(node.id).subscribe({
        next: () => {
          this.toast.show('admin.topics.delete_success', 'success');
          this.loadTree();
        },
        error: () => {
          this.toast.show('admin.topics.delete_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Drag and Drop (Topic Reorder / Reparent)
  // -------------------------------------------------------------------------

  onDragStart(event: DragEvent, nodeId: string): void {
    this.draggedNodeId.set(nodeId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', nodeId);
    }
  }

  onDragOver(event: DragEvent, nodeId: string, position: 'before' | 'after' | 'inside'): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropTargetId.set(nodeId);
    this.dropPosition.set(position);
  }

  onDragLeave(): void {
    this.dropTargetId.set(null);
    this.dropPosition.set(null);
  }

  onDrop(event: DragEvent, targetNodeId: string): void {
    event.preventDefault();

    const draggedId = this.draggedNodeId();
    const atomId = this.draggedAtomId();

    if (atomId) {
      // Dropping an atom onto a topic
      this.assignAtom(targetNodeId, atomId);
    } else if (draggedId && draggedId !== targetNodeId) {
      // Reordering/reparenting topics
      this.moveTopic(draggedId, targetNodeId);
    }

    this.draggedNodeId.set(null);
    this.draggedAtomId.set(null);
    this.dropTargetId.set(null);
    this.dropPosition.set(null);
  }

  onDragEnd(): void {
    this.draggedNodeId.set(null);
    this.draggedAtomId.set(null);
    this.dropTargetId.set(null);
    this.dropPosition.set(null);
  }

  /**
   * Drag-and-drop reparents `sourceId` under `targetId` via the real move
   * endpoint (cycle-guarded server-side — a drop onto a descendant returns 409
   * and surfaces the move-error toast). The tree reloads on success.
   */
  private moveTopic(sourceId: string, targetId: string): void {
    this.subscriptions.add(
      this.topicService.moveTopic(sourceId, { parent_id: targetId }).subscribe({
        next: () => {
          this.toast.show('admin.topics.move_success', 'success');
          this.loadTree();
        },
        error: () => {
          this.toast.show('admin.topics.move_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Atom Picker
  // -------------------------------------------------------------------------

  toggleAtomPicker(): void {
    this.atomPickerVisible.update((v) => !v);
    if (this.atomPickerVisible() && this.atomPickerAtoms().length === 0) {
      this.loadAtomPicker();
    }
  }

  onAtomSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.atomSearchTerm.set(value);
    this.loadAtomPicker();
  }

  private loadAtomPicker(): void {
    this.atomPickerLoading.set(true);
    this.subscriptions.add(
      this.atomService.getAtoms({ limit: 50, status: 'published' }).subscribe({
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

  onAtomDragStart(event: DragEvent, atomId: string): void {
    this.draggedAtomId.set(atomId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', `atom:${atomId}`);
    }
  }

  private assignAtom(topicId: string, atomId: string): void {
    this.subscriptions.add(
      this.topicService.assignAtomToTopic(topicId, atomId).subscribe({
        next: () => {
          this.toast.show('admin.topics.assign_atom_success', 'success');
          this.loadTree();
        },
        error: () => {
          this.toast.show('admin.topics.assign_atom_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getAtomTitle(atom: AdminAtom): string {
    return getAtomTitle(atom);
  }

  getAtomTypeIcon(type: string): string {
    return ADMIN_ATOM_TYPE_ICONS[type as keyof typeof ADMIN_ATOM_TYPE_ICONS] ?? 'quiz';
  }

  getDropClass(nodeId: string): string {
    if (this.dropTargetId() !== nodeId) return '';
    const pos = this.dropPosition();
    if (pos === 'before') return 'topic-tree__node--drop-before';
    if (pos === 'after') return 'topic-tree__node--drop-after';
    if (pos === 'inside') return 'topic-tree__node--drop-inside';
    return '';
  }
}
