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
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TopicTreeComponent } from './topic-tree.component';
import { AdminTopicService } from '../../services/admin-topic.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { TopicNode } from '../../models/admin-topic.model';
import type { AdminAtom } from '../../models/admin-atom.model';

function buildTopicNode(overrides: Partial<TopicNode> = {}): TopicNode {
  return {
    id: 'topic-001',
    name: 'Mathematics',
    parent_id: null,
    sort_order: 0,
    children: [],
    atom_count: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function buildTopicTree(): TopicNode[] {
  return [
    buildTopicNode({
      id: 'topic-001',
      name: 'Mathematics',
      children: [
        buildTopicNode({
          id: 'topic-002',
          name: 'Algebra',
          parent_id: 'topic-001',
          atom_count: 3,
        }),
        buildTopicNode({
          id: 'topic-003',
          name: 'Geometry',
          parent_id: 'topic-001',
          atom_count: 2,
        }),
      ],
    }),
    buildTopicNode({
      id: 'topic-004',
      name: 'Science',
      atom_count: 7,
    }),
  ];
}

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

describe('TopicTreeComponent', () => {
  let component: TopicTreeComponent;
  let fixture: ComponentFixture<TopicTreeComponent>;

  const mockTopicService = {
    getTopicTree: vi.fn(),
    createTopic: vi.fn(),
    updateTopic: vi.fn(),
    deleteTopic: vi.fn(),
    moveTopic: vi.fn(),
    assignAtomToTopic: vi.fn(),
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

  function createComponent(): void {
    TestBed.configureTestingModule({
      imports: [TopicTreeComponent, TranslatePipe],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminTopicService, useValue: mockTopicService },
        { provide: AdminAtomService, useValue: mockAtomService },
        { provide: ToastService, useValue: mockToastService },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    });

    fixture = TestBed.createComponent(TopicTreeComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicService.getTopicTree.mockReturnValue(of(buildTopicTree()));
    mockTopicService.moveTopic.mockReturnValue(of(buildTopicNode({ id: 'topic-003', parent_id: 'topic-001' })));
    mockTopicService.assignAtomToTopic.mockReturnValue(of(undefined));
    mockAtomService.getAtoms.mockReturnValue(of({ data: [buildAtom()], page_info: { next_cursor: null, has_next: false } }));
  });

  // -------------------------------------------------------------------------
  // Tree Rendering
  // -------------------------------------------------------------------------

  describe('tree rendering', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('loads topic tree on init', () => {
      expect(mockTopicService.getTopicTree).toHaveBeenCalled();
    });

    it('renders root-level topics', () => {
      expect(component.topics().length).toBe(2);
      expect(component.topics()[0].name).toBe('Mathematics');
      expect(component.topics()[1].name).toBe('Science');
    });

    it('shows atom count badge for nodes with atoms', () => {
      const topics = component.topics();
      expect(topics[0].atom_count).toBe(5);
      expect(topics[1].atom_count).toBe(7);
    });

    it('renders children for nodes with children', () => {
      const math = component.topics()[0];
      expect(math.children.length).toBe(2);
      expect(math.children[0].name).toBe('Algebra');
    });

    it('shows loading state initially', () => {
      const comp2 = TestBed.createComponent(TopicTreeComponent);
      const instance = comp2.componentInstance;
      expect(instance.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Expand / Collapse
  // -------------------------------------------------------------------------

  describe('expand and collapse', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('starts with all nodes collapsed', () => {
      expect(component.isExpanded('topic-001')).toBe(false);
    });

    it('toggles node expansion', () => {
      component.toggleExpand('topic-001');
      expect(component.isExpanded('topic-001')).toBe(true);

      component.toggleExpand('topic-001');
      expect(component.isExpanded('topic-001')).toBe(false);
    });

    it('can expand multiple nodes independently', () => {
      component.toggleExpand('topic-001');
      component.toggleExpand('topic-004');
      expect(component.isExpanded('topic-001')).toBe(true);
      expect(component.isExpanded('topic-004')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Create Topic
  // -------------------------------------------------------------------------

  describe('create topic', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('opens create form at root level', () => {
      component.openCreateForm(null);
      expect(component.showCreateForm()).toBe(true);
      expect(component.newTopicParentId()).toBeNull();
    });

    it('opens create form with parent', () => {
      component.openCreateForm('topic-001');
      expect(component.showCreateForm()).toBe(true);
      expect(component.newTopicParentId()).toBe('topic-001');
    });

    it('cancels create form', () => {
      component.openCreateForm(null);
      component.cancelCreate();
      expect(component.showCreateForm()).toBe(false);
    });

    it('submits create request', () => {
      mockTopicService.createTopic.mockReturnValue(of(buildTopicNode({ id: 'new-topic' })));

      component.openCreateForm(null);
      component.newTopicName.set('Physics');
      component.submitCreate();

      expect(mockTopicService.createTopic).toHaveBeenCalledWith({
        name: 'Physics',
        parent_id: null,
      });
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.create_success', 'success');
    });

    it('does not submit empty name', () => {
      component.openCreateForm(null);
      component.newTopicName.set('   ');
      component.submitCreate();
      expect(mockTopicService.createTopic).not.toHaveBeenCalled();
    });

    it('handles create error', () => {
      mockTopicService.createTopic.mockReturnValue(throwError(() => new Error('fail')));

      component.openCreateForm(null);
      component.newTopicName.set('Physics');
      component.submitCreate();

      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.create_error', 'error');
    });
  });

  // -------------------------------------------------------------------------
  // Rename Topic
  // -------------------------------------------------------------------------

  describe('rename topic', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('starts inline rename', () => {
      const node = component.topics()[0];
      component.startRename(node);
      expect(component.editingNodeId()).toBe('topic-001');
      expect(component.editingName()).toBe('Mathematics');
    });

    it('cancels rename', () => {
      const node = component.topics()[0];
      component.startRename(node);
      component.cancelRename();
      expect(component.editingNodeId()).toBeNull();
    });

    it('submits rename', () => {
      mockTopicService.updateTopic.mockReturnValue(of(buildTopicNode({ name: 'Maths' })));

      const node = component.topics()[0];
      component.startRename(node);
      component.editingName.set('Maths');
      component.submitRename('topic-001');

      expect(mockTopicService.updateTopic).toHaveBeenCalledWith('topic-001', { name: 'Maths' });
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.rename_success', 'success');
    });

    it('handles Enter key for rename', () => {
      const node = component.topics()[0];
      component.startRename(node);
      component.editingName.set('Maths');

      vi.spyOn(component, 'submitRename');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      vi.spyOn(event, 'preventDefault');
      component.onRenameKeydown(event, 'topic-001');

      expect(component.submitRename).toHaveBeenCalledWith('topic-001');
    });

    it('handles Escape key for rename cancel', () => {
      const node = component.topics()[0];
      component.startRename(node);

      vi.spyOn(component, 'cancelRename');
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      vi.spyOn(event, 'preventDefault');
      component.onRenameKeydown(event, 'topic-001');

      expect(component.cancelRename).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Delete Topic
  // -------------------------------------------------------------------------

  describe('delete topic', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('confirms before deleting', async () => {
      mockConfirmDialog.confirm.mockResolvedValue(true);
      mockTopicService.deleteTopic.mockReturnValue(of(undefined));

      const node = component.topics()[0];
      await component.deleteTopic(node);

      expect(mockConfirmDialog.confirm).toHaveBeenCalled();
      expect(mockTopicService.deleteTopic).toHaveBeenCalledWith('topic-001');
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.delete_success', 'success');
    });

    it('does not delete when cancelled', async () => {
      mockConfirmDialog.confirm.mockResolvedValue(false);

      const node = component.topics()[0];
      await component.deleteTopic(node);

      expect(mockTopicService.deleteTopic).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Drag and Drop
  // -------------------------------------------------------------------------

  describe('drag and drop', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('sets dragged node on drag start', () => {
      const event = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      component.onDragStart(event, 'topic-001');
      expect(component.draggedNodeId()).toBe('topic-001');
    });

    it('sets drop target on drag over', () => {
      const event = new DragEvent('dragover', { dataTransfer: new DataTransfer() });
      vi.spyOn(event, 'preventDefault');
      component.onDragOver(event, 'topic-002', 'inside');
      expect(component.dropTargetId()).toBe('topic-002');
      expect(component.dropPosition()).toBe('inside');
    });

    it('clears drop target on drag leave', () => {
      component.dropTargetId.set('topic-002');
      component.onDragLeave();
      expect(component.dropTargetId()).toBeNull();
    });

    it('clears state on drag end', () => {
      component.draggedNodeId.set('topic-001');
      component.onDragEnd();
      expect(component.draggedNodeId()).toBeNull();
    });

    it('returns correct drop class', () => {
      component.dropTargetId.set('topic-001');
      component.dropPosition.set('before');
      expect(component.getDropClass('topic-001')).toBe('topic-tree__node--drop-before');

      component.dropPosition.set('inside');
      expect(component.getDropClass('topic-001')).toBe('topic-tree__node--drop-inside');
    });

    it('reparents a dropped topic via the real move endpoint (parent_id body)', () => {
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      vi.spyOn(event, 'preventDefault');
      component.onDragStart(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }), 'topic-003');
      component.dropPosition.set('inside');

      component.onDrop(event, 'topic-001');

      // The honest wire key is `parent_id` (NOT `new_parent_id`), and it goes
      // through moveTopic — never a rename/updateTopic stand-in.
      expect(mockTopicService.moveTopic).toHaveBeenCalledWith('topic-003', { parent_id: 'topic-001' });
      expect(mockTopicService.updateTopic).not.toHaveBeenCalled();
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.move_success', 'success');
    });

    it('does not reparent a node onto itself', () => {
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      component.onDragStart(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }), 'topic-001');

      component.onDrop(event, 'topic-001');

      expect(mockTopicService.moveTopic).not.toHaveBeenCalled();
    });

    it('surfaces a move-error toast when the reparent fails (e.g. 409 cycle)', () => {
      mockTopicService.moveTopic.mockReturnValue(throwError(() => new Error('cycle')));
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      component.onDragStart(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }), 'topic-003');
      component.dropPosition.set('inside');

      component.onDrop(event, 'topic-001');

      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.move_error', 'error');
    });

    it('assigns a dropped atom to the target topic', () => {
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      component.onAtomDragStart(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }), 'atom-99');

      component.onDrop(event, 'topic-001');

      expect(mockTopicService.assignAtomToTopic).toHaveBeenCalledWith('topic-001', 'atom-99');
      expect(mockTopicService.moveTopic).not.toHaveBeenCalled();
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.assign_atom_success', 'success');
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

    it('toggles atom picker visibility', () => {
      expect(component.atomPickerVisible()).toBe(false);
      component.toggleAtomPicker();
      expect(component.atomPickerVisible()).toBe(true);
    });

    it('loads atoms when picker is opened', () => {
      component.toggleAtomPicker();
      expect(mockAtomService.getAtoms).toHaveBeenCalled();
    });

    it('sets dragged atom on atom drag start', () => {
      const event = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      component.onAtomDragStart(event, 'atom-001');
      expect(component.draggedAtomId()).toBe('atom-001');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('shows error toast on tree load failure', () => {
      mockTopicService.getTopicTree.mockReturnValue(throwError(() => new Error('fail')));
      createComponent();
      fixture.detectChanges();

      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.load_error', 'error');
      expect(component.treeState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------

  describe('computed values', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('computes flat topic list for parent selector', () => {
      const flat = component.flatTopics();
      expect(flat.length).toBeGreaterThanOrEqual(2);
      expect(flat[0].name).toBe('Mathematics');
      expect(flat[0].depth).toBe(0);
    });

    it('computes isEmpty correctly', () => {
      expect(component.isEmpty()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Helpers & edge branches
  // -------------------------------------------------------------------------

  describe('helpers and edge branches', () => {
    beforeEach(() => {
      createComponent();
      fixture.detectChanges();
    });

    it('resolves an atom title via the shared helper', () => {
      expect(component.getAtomTitle(buildAtom())).toBe('What is 2+2?');
    });

    it('maps a known atom type to its icon and falls back to "quiz"', () => {
      expect(component.getAtomTypeIcon('multiple_choice')).not.toBe('quiz');
      expect(component.getAtomTypeIcon('totally_unknown_type')).toBe('quiz');
    });

    it('returns the after / inside drop classes and empty otherwise', () => {
      component.dropTargetId.set('topic-001');
      component.dropPosition.set('after');
      expect(component.getDropClass('topic-001')).toBe('topic-tree__node--drop-after');
      // Different node -> no class.
      expect(component.getDropClass('other')).toBe('');
      // Target set but no position -> empty.
      component.dropPosition.set(null);
      expect(component.getDropClass('topic-001')).toBe('');
    });

    it('does nothing on a drop with neither a dragged topic nor atom', () => {
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      component.onDrop(event, 'topic-001');
      expect(mockTopicService.moveTopic).not.toHaveBeenCalled();
      expect(mockTopicService.assignAtomToTopic).not.toHaveBeenCalled();
    });

    it('surfaces an assign-error toast when atom assignment fails', () => {
      mockTopicService.assignAtomToTopic.mockReturnValue(throwError(() => new Error('nope')));
      const event = new DragEvent('drop', { dataTransfer: new DataTransfer() });
      component.onAtomDragStart(new DragEvent('dragstart', { dataTransfer: new DataTransfer() }), 'atom-99');
      component.onDrop(event, 'topic-001');
      expect(mockToastService.show).toHaveBeenCalledWith('admin.topics.assign_atom_error', 'error');
    });

    it('reloads the atom picker on search input', () => {
      component.onAtomSearchInput({ target: { value: 'physics' } } as unknown as Event);
      expect(component.atomSearchTerm()).toBe('physics');
      expect(mockAtomService.getAtoms).toHaveBeenCalled();
    });

    it('stops the picker spinner when atom loading fails', () => {
      mockAtomService.getAtoms.mockReturnValue(throwError(() => new Error('boom')));
      component.toggleAtomPicker();
      expect(component.atomPickerLoading()).toBe(false);
    });

    it('cancels an inline rename submitted with an empty name', () => {
      const node = component.topics()[0];
      component.startRename(node);
      component.editingName.set('   ');
      component.submitRename(node.id);
      expect(mockTopicService.updateTopic).not.toHaveBeenCalled();
      expect(component.editingNodeId()).toBeNull();
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
