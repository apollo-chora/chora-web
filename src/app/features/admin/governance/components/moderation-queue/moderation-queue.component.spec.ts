import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ModerationQueueComponent } from './moderation-queue.component';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import type { FlaggedContentItem } from './moderation-queue.component';

describe('ModerationQueueComponent', () => {
  let fixture: ComponentFixture<ModerationQueueComponent>;
  let component: ModerationQueueComponent;

  const mockItems: FlaggedContentItem[] = [
    {
      id: 'flag-001',
      content_type: 'atom',
      content_id: 'atom-001',
      title: 'Test Atom',
      excerpt: 'Some flagged content',
      thumbnail_url: null,
      flag_reason: 'spam',
      flag_count: 3,
      reporter_name: 'Bob',
      reported_at: '2026-03-12T10:00:00Z',
      author_gcid: 'gcid-001',
      author_name: 'Alice',
    },
  ];

  const mockBff = {
    get: vi.fn().mockReturnValue(of({ items: mockItems, next_cursor: null, total_count: 1 })),
    post: vi.fn().mockReturnValue(of(null)),
  };

  const mockToast = { show: vi.fn() };
  const mockConfirmDialog = { confirm: vi.fn().mockResolvedValue(true) };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [ModerationQueueComponent],
      providers: [
        { provide: BffClientService, useValue: mockBff },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load queue on init', () => {
    expect(mockBff.get).toHaveBeenCalled();
    expect(component.queueItems().length).toBe(1);
    expect(component.totalCount()).toBe(1);
  });

  it('should compute priority from flag count', () => {
    expect(component.getPriority(1)).toBe('normal');
    expect(component.getPriority(3)).toBe('high');
    expect(component.getPriority(5)).toBe('critical');
  });

  it('should compute priority CSS class', () => {
    expect(component.priorityClass(5)).toBe('moderation-queue__priority--critical');
  });

  it('should approve an item', () => {
    component.approveItem(mockItems[0]);
    expect(mockBff.post).toHaveBeenCalled();
  });

  it('should open and cancel edit notes', () => {
    component.openEditNotes('flag-001');
    expect(component.isEditNotesOpen('flag-001')).toBe(true);

    component.cancelEditNotes();
    expect(component.editNotesItemId()).toBeNull();
  });

  it('should compute isEmpty when no items and not loading', () => {
    component.loadQueue();
    mockBff.get.mockReturnValueOnce(of({ items: [], next_cursor: null, total_count: 0 }));
    component.loadQueue();
    fixture.detectChanges();
    // After reload with empty items, isEmpty should reflect state
    expect(component.loading()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — drives the mock adapter directly (synchronous of(...)).
// ---------------------------------------------------------------------------

describe('ModerationQueueComponent (augmented)', () => {
  let fixture: ComponentFixture<ModerationQueueComponent>;
  let component: ModerationQueueComponent;

  const makeItem = (overrides: Partial<FlaggedContentItem> = {}): FlaggedContentItem => ({
    id: 'flag-001',
    content_type: 'atom',
    content_id: 'atom-001',
    title: 'Test Atom',
    excerpt: 'Some flagged content',
    thumbnail_url: null,
    flag_reason: 'spam',
    flag_count: 3,
    reporter_name: 'Bob',
    reported_at: '2026-03-12T10:00:00Z',
    author_gcid: 'gcid-001',
    author_name: 'Alice',
    ...overrides,
  });

  const pageOne: FlaggedContentItem[] = [
    makeItem({ id: 'flag-001', flag_count: 5, content_type: 'post' }),
    makeItem({ id: 'flag-002', flag_count: 1, content_type: 'comment' }),
  ];

  const mockBff = {
    get: vi.fn(),
    post: vi.fn().mockReturnValue(of(null)),
  };
  const mockToast = { show: vi.fn() };
  const mockConfirmDialog = { confirm: vi.fn().mockResolvedValue(true) };

  // Default the get to a page with a cursor (so hasMore() === true)
  const defaultGet = () =>
    of({ items: pageOne, next_cursor: 'cursor-2', total_count: 5 });

  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ModerationQueueComponent],
      providers: [
        { provide: BffClientService, useValue: mockBff },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBff.get.mockImplementation(defaultGet);
    mockBff.post.mockReturnValue(of(null));
    mockConfirmDialog.confirm.mockResolvedValue(true);
    await build();
  });

  // --- Shell + ready-state DOM -------------------------------------------

  it('should render the queue shell and title', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="moderation-queue"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="queue-title"]')?.textContent).toContain(
      'admin.moderation.queue_title',
    );
  });

  it('should render a card per queue item with action buttons', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="queue-item-flag-001"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="queue-item-flag-002"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="btn-approve-flag-001"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="btn-request-edit-flag-001"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="btn-remove-flag-001"]')).toBeTruthy();
  });

  it('should render the pending count when total_count > 0', () => {
    const el = fixture.nativeElement as HTMLElement;
    const count = el.querySelector('[data-testid="queue-count"]');
    expect(count?.textContent).toContain('5');
  });

  it('should render the load-more button when a cursor is present', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(component.hasMore()).toBe(true);
    expect(component.nextCursor()).toBe('cursor-2');
    expect(el.querySelector('[data-testid="btn-load-more"]')).toBeTruthy();
  });

  it('should show the critical priority label for a 5-flag item', () => {
    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector('[data-testid="priority-flag-001"]');
    expect(badge?.textContent).toContain('admin.moderation.priority_critical');
  });

  // --- Empty + loading states --------------------------------------------

  it('should render the empty state when the queue has no items', async () => {
    mockBff.get.mockReturnValue(of({ items: [], next_cursor: null, total_count: 0 }));
    component.loadQueue();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(component.isEmpty()).toBe(true);
    expect(el.querySelector('[data-testid="queue-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="btn-load-more"]')).toBeNull();
  });

  it('should expose loading=true while the request has not resolved', () => {
    // Return an observable that never emits to hold the loading state.
    mockBff.get.mockReturnValue(of());
    component.loadQueue();
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="queue-loading"]')).toBeTruthy();
  });

  // --- loadQueue error path ----------------------------------------------

  it('should set error state and toast on loadQueue failure', () => {
    mockBff.get.mockReturnValue(throwError(() => new Error('boom')));
    component.loadQueue();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.queueItems().length).toBe(0);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.queue_load_error', 'error');
  });

  // --- Filters re-trigger loadQueue --------------------------------------

  it('should set the type filter and reload (empty string clears)', () => {
    component.onTypeFilter('comment');
    expect(component.filterType()).toBe('comment');

    component.onTypeFilter('');
    expect(component.filterType()).toBeNull();
    // initial + 2 filter loads
    expect(mockBff.get).toHaveBeenCalledTimes(3);
  });

  it('should set the priority filter and reload (empty string clears)', () => {
    component.onPriorityFilter('critical');
    expect(component.filterPriority()).toBe('critical');

    component.onPriorityFilter('');
    expect(component.filterPriority()).toBeNull();
  });

  it('should set the sort order and reload', () => {
    component.onSortChange('most_flagged');
    expect(component.sortOrder()).toBe('most_flagged');
    expect(mockBff.get).toHaveBeenCalledTimes(2);
  });

  // --- loadMore -----------------------------------------------------------

  it('should append items and update cursor on loadMore', () => {
    expect(component.queueItems().length).toBe(2);

    mockBff.get.mockReturnValueOnce(
      of({
        items: [makeItem({ id: 'flag-003' })],
        next_cursor: null,
        total_count: 5,
      }),
    );
    component.loadMore();

    expect(component.queueItems().map((i) => i.id)).toEqual([
      'flag-001',
      'flag-002',
      'flag-003',
    ]);
    expect(component.nextCursor()).toBeNull();
    expect(component.hasMore()).toBe(false);
  });

  it('should no-op loadMore when there is no cursor', () => {
    mockBff.get.mockReturnValue(of({ items: pageOne, next_cursor: null, total_count: 2 }));
    component.loadQueue();
    fixture.detectChanges();

    const callsBefore = mockBff.get.mock.calls.length;
    component.loadMore();
    expect(mockBff.get.mock.calls.length).toBe(callsBefore);
  });

  it('should toast on loadMore failure without dropping existing items', () => {
    mockBff.get.mockReturnValueOnce(throwError(() => new Error('more-fail')));
    component.loadMore();

    expect(component.queueItems().length).toBe(2);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.queue_load_error', 'error');
  });

  // --- approveItem --------------------------------------------------------

  it('should approve an item, remove it from the list and toast success', () => {
    expect(component.totalCount()).toBe(5);
    component.approveItem(pageOne[0]);

    expect(mockBff.post).toHaveBeenCalledWith(
      '/api/v1/governance/moderation/flag-001/action',
      { action: 'approve' },
    );
    expect(component.queueItems().map((i) => i.id)).toEqual(['flag-002']);
    expect(component.totalCount()).toBe(4);
    expect(component.actionInProgress()).toBeNull();
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.approved_success', 'success');
  });

  it('should toast and clear progress on approve failure', () => {
    mockBff.post.mockReturnValue(throwError(() => new Error('nope')));
    component.approveItem(pageOne[0]);

    expect(component.actionInProgress()).toBeNull();
    // item remains because the action failed
    expect(component.queueItems().length).toBe(2);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.action_error', 'error');
  });

  // --- edit notes flow ----------------------------------------------------

  it('should open, input and reflect edit-notes state', () => {
    component.openEditNotes('flag-001');
    expect(component.isEditNotesOpen('flag-001')).toBe(true);
    expect(component.editNotesText()).toBe('');

    component.onEditNotesInput('please fix the title');
    expect(component.editNotesText()).toBe('please fix the title');
  });

  it('should not submit an edit request when notes are blank', () => {
    component.openEditNotes('flag-001');
    component.onEditNotesInput('   ');
    component.submitEditRequest(pageOne[0]);

    expect(mockBff.post).not.toHaveBeenCalled();
    expect(component.actionInProgress()).toBeNull();
  });

  it('should submit an edit request, remove the item and toast success', () => {
    component.openEditNotes('flag-001');
    component.onEditNotesInput('fix the misleading claim');
    component.submitEditRequest(pageOne[0]);

    expect(mockBff.post).toHaveBeenCalledWith(
      '/api/v1/governance/moderation/flag-001/action',
      { action: 'request_edit', notes: 'fix the misleading claim' },
    );
    expect(component.editNotesItemId()).toBeNull();
    expect(component.editNotesText()).toBe('');
    expect(component.queueItems().map((i) => i.id)).toEqual(['flag-002']);
    expect(mockToast.show).toHaveBeenCalledWith(
      'admin.moderation.edit_requested_success',
      'success',
    );
  });

  it('should toast and clear progress on edit-request failure', () => {
    mockBff.post.mockReturnValue(throwError(() => new Error('boom')));
    component.openEditNotes('flag-001');
    component.onEditNotesInput('fix it');
    component.submitEditRequest(pageOne[0]);

    expect(component.actionInProgress()).toBeNull();
    expect(component.queueItems().length).toBe(2);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.action_error', 'error');
  });

  // --- removeItem (confirm dialog) ---------------------------------------

  it('should remove an item after confirmation and toast success', async () => {
    await component.removeItem(pageOne[0]);

    expect(mockConfirmDialog.confirm).toHaveBeenCalled();
    expect(mockBff.post).toHaveBeenCalledWith(
      '/api/v1/governance/moderation/flag-001/action',
      { action: 'remove' },
    );
    expect(component.queueItems().map((i) => i.id)).toEqual(['flag-002']);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.removed_success', 'success');
  });

  it('should NOT call the API when removal is not confirmed', async () => {
    mockConfirmDialog.confirm.mockResolvedValue(false);
    await component.removeItem(pageOne[0]);

    expect(mockBff.post).not.toHaveBeenCalled();
    expect(component.queueItems().length).toBe(2);
  });

  it('should toast and clear progress on remove failure', async () => {
    mockBff.post.mockReturnValue(throwError(() => new Error('del-fail')));
    await component.removeItem(pageOne[0]);

    expect(component.actionInProgress()).toBeNull();
    expect(component.queueItems().length).toBe(2);
    expect(mockToast.show).toHaveBeenCalledWith('admin.moderation.action_error', 'error');
  });

  // --- helpers ------------------------------------------------------------

  it('should compute the full priority spectrum', () => {
    expect(component.getPriority(0)).toBe('normal');
    expect(component.getPriority(2)).toBe('normal');
    expect(component.getPriority(3)).toBe('high');
    expect(component.getPriority(4)).toBe('high');
    expect(component.getPriority(5)).toBe('critical');
    expect(component.getPriority(10)).toBe('critical');
  });

  it('should compute priority CSS classes across tiers', () => {
    expect(component.priorityClass(1)).toBe('moderation-queue__priority--normal');
    expect(component.priorityClass(3)).toBe('moderation-queue__priority--high');
    expect(component.priorityClass(5)).toBe('moderation-queue__priority--critical');
  });

  it('should compute the content-type CSS class', () => {
    expect(component.contentTypeClass('media')).toBe('moderation-queue__content-type--media');
  });

  it('should report whether an action is in progress for a given id', () => {
    component.actionInProgress.set('flag-002');
    expect(component.isActionInProgress('flag-002')).toBe(true);
    expect(component.isActionInProgress('flag-001')).toBe(false);
  });

  it('should format a valid ISO datetime to a non-empty string', () => {
    const out = component.formatDateTime('2026-03-12T10:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('should echo back an unparseable datetime string', () => {
    // new Date(...) of garbage produces "Invalid Date" whose toLocaleString
    // does not throw, so the value is returned via toLocaleString, not the catch.
    const out = component.formatDateTime('not-a-date');
    expect(typeof out).toBe('string');
  });

  it('should unsubscribe on destroy without error', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage #2 — remaining conditional arms not yet exercised:
//   - loadQueue(cursor) explicit-cursor `if (cursor)` TRUE arm + all
//     filter `if` guards TRUE simultaneously (passes params to the adapter).
//   - removeItemFromList Math.max(0, total_count - 1) clamp branch
//     (total_count already 0 -> would go negative without the clamp).
//   - computed selectors falling back to defaults in non-'success' states
//     (idle before load, and after an error).
// ---------------------------------------------------------------------------

describe('ModerationQueueComponent (augmented #2)', () => {
  let fixture: ComponentFixture<ModerationQueueComponent>;
  let component: ModerationQueueComponent;

  const makeItem = (
    overrides: Partial<FlaggedContentItem> = {},
  ): FlaggedContentItem => ({
    id: 'flag-001',
    content_type: 'atom',
    content_id: 'atom-001',
    title: 'Test Atom',
    excerpt: 'Some flagged content',
    thumbnail_url: null,
    flag_reason: 'spam',
    flag_count: 3,
    reporter_name: 'Bob',
    reported_at: '2026-03-12T10:00:00Z',
    author_gcid: 'gcid-001',
    author_name: 'Alice',
    ...overrides,
  });

  const mockBff = {
    get: vi.fn(),
    post: vi.fn().mockReturnValue(of(null)),
  };
  const mockToast = { show: vi.fn() };
  const mockConfirmDialog = { confirm: vi.fn().mockResolvedValue(true) };

  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ModerationQueueComponent],
      providers: [
        { provide: BffClientService, useValue: mockBff },
        { provide: ToastService, useValue: mockToast },
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockBff.get.mockReturnValue(
      of({ items: [makeItem()], next_cursor: null, total_count: 1 }),
    );
    mockBff.post.mockReturnValue(of(null));
    mockConfirmDialog.confirm.mockResolvedValue(true);
    await build();
  });

  it('passes type/priority/sort and an explicit cursor to the adapter (all if-guards TRUE)', () => {
    component.filterType.set('comment');
    component.filterPriority.set('high');
    component.sortOrder.set('most_flagged');

    mockBff.get.mockClear();
    // Explicit cursor argument exercises the `if (cursor)` TRUE arm in loadQueue.
    component.loadQueue('cursor-xyz');

    expect(mockBff.get).toHaveBeenCalledTimes(1);
    const params = mockBff.get.mock.calls[0][1] as {
      get(name: string): string | null;
    };
    expect(params.get('type')).toBe('comment');
    expect(params.get('priority')).toBe('high');
    expect(params.get('sort')).toBe('most_flagged');
    expect(params.get('cursor')).toBe('cursor-xyz');
  });

  it('clamps total_count at zero when removing the last item (Math.max branch)', () => {
    // Reload with a single item but total_count already 0 so the decrement
    // would go negative were it not clamped.
    mockBff.get.mockReturnValue(
      of({ items: [makeItem({ id: 'only' })], next_cursor: null, total_count: 0 }),
    );
    component.loadQueue();
    fixture.detectChanges();

    expect(component.totalCount()).toBe(0);
    component.approveItem(makeItem({ id: 'only' }));

    expect(component.queueItems().length).toBe(0);
    expect(component.totalCount()).toBe(0);
  });

  it('computed selectors return defaults when state is error (non-success arm)', () => {
    mockBff.get.mockReturnValue(throwError(() => new Error('boom')));
    component.loadQueue();
    fixture.detectChanges();

    expect(component.queueItems()).toEqual([]);
    expect(component.nextCursor()).toBeNull();
    expect(component.totalCount()).toBe(0);
    expect(component.hasMore()).toBe(false);
    // not loading + zero items -> empty
    expect(component.isEmpty()).toBe(true);
  });

  it('isEmpty is false while a load is in flight (loading arm)', () => {
    // of() never emits -> stays in 'loading'.
    mockBff.get.mockReturnValue(of());
    component.loadQueue();
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect(component.isEmpty()).toBe(false);
  });

  it('isEditNotesOpen returns false for a non-matching id while another is open', () => {
    component.openEditNotes('flag-001');
    expect(component.isEditNotesOpen('flag-001')).toBe(true);
    expect(component.isEditNotesOpen('flag-999')).toBe(false);
  });
});
