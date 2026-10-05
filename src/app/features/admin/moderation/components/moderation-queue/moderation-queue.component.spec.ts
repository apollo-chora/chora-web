import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ModerationQueueComponent } from './moderation-queue.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { ModerationActionRequest } from '../../models/moderation.model';

/**
 * Characterization spec for ModerationQueueComponent.
 *
 * NOTE: ModerationService is currently a MOCK adapter — every method returns a
 * synchronous `of(...)` over fixed in-memory data (no real HTTP). So there are
 * no HttpTestingController interactions to assert; the HTTP testing providers
 * are wired purely for house-convention parity. Because the observables resolve
 * synchronously, `loading()` flips true→false within the same subscribe tick,
 * meaning by the time change-detection runs the queue is already in the ready
 * state with the 5 seeded mock items.
 *
 * Mock seed (from moderation.service.ts):
 *   flag-001 atom      pending   (unassigned)
 *   flag-002 comment   reviewing (assigned: Moderator Kim)
 *   flag-003 forum_post resolved (assigned: Moderator Lee, 1 audit entry)
 *   flag-004 media     pending   (unassigned)
 *   flag-005 profile   dismissed (assigned: Moderator Kim, 1 audit entry)
 */

function setup(): {
  fixture: ComponentFixture<ModerationQueueComponent>;
  component: ModerationQueueComponent;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [ModerationQueueComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ModerationQueueComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges(); // triggers ngOnInit → loadItems()
  return { fixture, component, element };
}

describe('ModerationQueueComponent', () => {
  let fixture: ComponentFixture<ModerationQueueComponent>;
  let component: ModerationQueueComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    component = built.component;
    element = built.element;
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root with the moderation-queue surface class', () => {
      const root = element.querySelector('[data-testid="moderation-queue"]');
      expect(root).not.toBeNull();
      expect(root?.className).toContain('moderation-queue');
    });

    it('uses a semantic <section role="main"> root', () => {
      const root = element.querySelector('[data-testid="moderation-queue"]');
      expect(root?.tagName).toBe('SECTION');
      expect(root?.getAttribute('role')).toBe('main');
    });

    it('renders the page title with the i18n key', () => {
      const title = element.querySelector('[data-testid="moderation-title"]');
      expect(title?.textContent?.trim()).toBe('admin.moderation.title');
    });

    it('renders a refresh button', () => {
      const btn = element.querySelector('[data-testid="btn-refresh"]');
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
    });

    it('renders the status + content-type filter selects', () => {
      expect(
        element.querySelector('[data-testid="status-filter"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="type-filter"]'),
      ).not.toBeNull();
    });
  });

  describe('ready state (mock seed loaded)', () => {
    it('clears the loading signal after the synchronous mock load', () => {
      expect(component.loading()).toBe(false);
      expect(
        element.querySelector('[data-testid="moderation-loading"]'),
      ).toBeNull();
    });

    it('populates 5 seeded items + totalCount', () => {
      expect(component.items().length).toBe(5);
      expect(component.totalCount()).toBe(5);
    });

    it('renders one card per flagged item', () => {
      const cards = element.querySelectorAll('[data-testid^="flagged-flag-"]');
      expect(cards.length).toBe(5);
    });

    it('renders the flagged list region', () => {
      const list = element.querySelector('[data-testid="flagged-list"]');
      expect(list).not.toBeNull();
      expect(list?.getAttribute('role')).toBe('list');
    });

    it('shows the total stat = 5', () => {
      const total = element.querySelector('[data-testid="stat-total"]');
      expect(total?.textContent?.trim()).toBe('5');
    });

    it('shows the pending stat = 2 (flag-001, flag-004)', () => {
      const pending = element.querySelector('[data-testid="stat-pending"]');
      expect(pending?.textContent?.trim()).toBe('2');
      expect(component.pendingCount()).toBe(2);
    });

    it('shows the reviewing stat = 1 (flag-002)', () => {
      const reviewing = element.querySelector('[data-testid="stat-reviewing"]');
      expect(reviewing?.textContent?.trim()).toBe('1');
      expect(component.reviewingCount()).toBe(1);
    });

    it('renders the flagged-by display name + title on a card', () => {
      const card = element.querySelector('[data-testid="flagged-flag-001"]');
      expect(card?.textContent).toContain('Introduction to Algebra');
      expect(card?.textContent).toContain('Jane Student');
    });

    it('is NOT in the empty state when items exist', () => {
      expect(component.isEmpty()).toBe(false);
      expect(
        element.querySelector('[data-testid="moderation-empty"]'),
      ).toBeNull();
    });
  });

  describe('filtering', () => {
    it('filters by status="pending" → 2 cards remain', () => {
      component.onStatusFilter('pending');
      fixture.detectChanges();
      expect(component.filterStatus()).toBe('pending');
      const cards = element.querySelectorAll('[data-testid^="flagged-flag-"]');
      expect(cards.length).toBe(2);
      expect(component.totalCount()).toBe(2);
    });

    it('clears the status filter when the empty-value option is chosen', () => {
      component.onStatusFilter('pending');
      fixture.detectChanges();
      component.onStatusFilter('');
      fixture.detectChanges();
      expect(component.filterStatus()).toBeNull();
      expect(component.items().length).toBe(5);
    });

    it('filters by content type="atom" → only the atom item', () => {
      component.onContentTypeFilter('atom');
      fixture.detectChanges();
      expect(component.filterContentType()).toBe('atom');
      expect(component.items().length).toBe(1);
      expect(component.items()[0].id).toBe('flag-001');
    });

    it('renders the empty state when a filter matches no items', () => {
      // study_group_message has no seeded mock item
      component.onContentTypeFilter('study_group_message');
      fixture.detectChanges();
      expect(component.items().length).toBe(0);
      expect(component.isEmpty()).toBe(true);
      expect(
        element.querySelector('[data-testid="moderation-empty"]'),
      ).not.toBeNull();
    });
  });

  describe('selection + detail panel', () => {
    it('opens the detail panel when a card is selected', () => {
      component.selectItem('flag-001');
      fixture.detectChanges();
      expect(component.selectedItemId()).toBe('flag-001');
      const detail = element.querySelector('[data-testid="moderation-detail"]');
      expect(detail).not.toBeNull();
      expect(detail?.textContent).toContain('Introduction to Algebra');
    });

    it('exposes the selected content_id in the detail panel', () => {
      component.selectItem('flag-001');
      fixture.detectChanges();
      const id = element.querySelector('[data-testid="detail-content-id"]');
      expect(id?.textContent?.trim()).toBe('atom-123');
    });

    it('resolves selectedItem computed to the matching item', () => {
      component.selectItem('flag-002');
      expect(component.selectedItem()?.id).toBe('flag-002');
    });

    it('toggles selection off when the same card is re-selected', () => {
      component.selectItem('flag-001');
      expect(component.selectedItemId()).toBe('flag-001');
      component.selectItem('flag-001');
      expect(component.selectedItemId()).toBeNull();
      expect(component.auditTrail()).toEqual([]);
      expect(component.actionDialogOpen()).toBe(false);
    });

    it('selectedItem computed is null when nothing is selected', () => {
      expect(component.selectedItem()).toBeNull();
    });

    it('isSelected reflects the current selection', () => {
      expect(component.isSelected('flag-003')).toBe(false);
      component.selectItem('flag-003');
      expect(component.isSelected('flag-003')).toBe(true);
    });

    it('loads the audit trail for a selected item that has entries', () => {
      component.selectItem('flag-003');
      fixture.detectChanges();
      // flag-003 has 1 mock audit entry (audit-001)
      expect(component.auditTrail().length).toBe(1);
      expect(component.auditTrail()[0].id).toBe('audit-001');
      expect(component.auditLoading()).toBe(false);
      const auditList = element.querySelector('[data-testid="audit-list"]');
      expect(auditList).not.toBeNull();
    });

    it('shows an empty audit trail for an item without entries', () => {
      component.selectItem('flag-001');
      fixture.detectChanges();
      expect(component.auditTrail().length).toBe(0);
      expect(
        element.querySelector('[data-testid="audit-list"]'),
      ).toBeNull();
    });
  });

  describe('assign to self', () => {
    it('updates the item to reviewing + assigns the current user', () => {
      const item = component.items().find((i) => i.id === 'flag-001')!;
      component.assignToSelf(item);
      const updated = component.items().find((i) => i.id === 'flag-001')!;
      expect(updated.status).toBe('reviewing');
      expect(updated.assigned_moderator_gcid).toBe('current-gcid');
      expect(updated.assigned_moderator_name).toBe('Current User');
    });

    it('emits a success toast on assign', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      const item = component.items().find((i) => i.id === 'flag-001')!;
      component.assignToSelf(item);
      expect(spy).toHaveBeenCalledWith('admin.moderation.assigned', 'success');
    });
  });

  describe('action dialog', () => {
    it('openActionDialog / closeActionDialog flip the dialog signal', () => {
      expect(component.actionDialogOpen()).toBe(false);
      component.openActionDialog();
      expect(component.actionDialogOpen()).toBe(true);
      component.closeActionDialog();
      expect(component.actionDialogOpen()).toBe(false);
    });

    it('renders the take-action button for an actionable selected item', () => {
      component.selectItem('flag-001'); // pending → actionable
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="btn-take-action"]'),
      ).not.toBeNull();
    });

    it('does NOT render take-action for a resolved item', () => {
      component.selectItem('flag-003'); // resolved → not actionable
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="btn-take-action"]'),
      ).toBeNull();
    });

    it('mounts the inline action dialog when opened on a selected item', () => {
      component.selectItem('flag-001');
      component.openActionDialog();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="action-dialog-wrapper"]'),
      ).not.toBeNull();
    });

    it('onActionSubmit no-ops (no error) when nothing is selected', () => {
      const action: ModerationActionRequest = {
        decision: 'approve',
        reason: 'ok',
        notes: '',
      };
      expect(() => component.onActionSubmit(action)).not.toThrow();
      expect(component.actionSubmitting()).toBe(false);
    });

    it('onActionSubmit updates the item, closes the dialog, and reloads audit', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      component.selectItem('flag-001');
      component.openActionDialog();
      fixture.detectChanges();

      const action: ModerationActionRequest = {
        decision: 'remove',
        reason: 'violates policy',
        notes: 'escalated',
      };
      component.onActionSubmit(action);
      fixture.detectChanges();

      // 'remove' → status becomes 'resolved' per the mock submitAction
      const updated = component.items().find((i) => i.id === 'flag-001')!;
      expect(updated.status).toBe('resolved');
      expect(component.actionSubmitting()).toBe(false);
      expect(component.actionDialogOpen()).toBe(false);
      expect(spy).toHaveBeenCalledWith(
        'admin.moderation.action_submitted',
        'success',
      );
    });

    it('approve decision routes the mock item to dismissed', () => {
      component.selectItem('flag-001');
      const action: ModerationActionRequest = {
        decision: 'approve',
        reason: 'false positive',
        notes: '',
      };
      component.onActionSubmit(action);
      const updated = component.items().find((i) => i.id === 'flag-001')!;
      expect(updated.status).toBe('dismissed');
    });
  });

  describe('helper methods', () => {
    it('statusBadgeClass derives a per-status modifier class', () => {
      expect(component.statusBadgeClass('pending')).toBe(
        'moderation-queue__badge--pending',
      );
      expect(component.statusBadgeClass('resolved')).toBe(
        'moderation-queue__badge--resolved',
      );
    });

    it('canTakeAction is true for pending/reviewing, false otherwise', () => {
      const pending = component.items().find((i) => i.id === 'flag-001')!;
      const reviewing = component.items().find((i) => i.id === 'flag-002')!;
      const resolved = component.items().find((i) => i.id === 'flag-003')!;
      expect(component.canTakeAction(pending)).toBe(true);
      expect(component.canTakeAction(reviewing)).toBe(true);
      expect(component.canTakeAction(resolved)).toBe(false);
    });

    it('canAssign is true only for unassigned pending items', () => {
      const unassignedPending = component
        .items()
        .find((i) => i.id === 'flag-001')!;
      const assignedReviewing = component
        .items()
        .find((i) => i.id === 'flag-002')!;
      expect(component.canAssign(unassignedPending)).toBe(true);
      expect(component.canAssign(assignedReviewing)).toBe(false);
    });

    it('formatDateTime returns a localized string for a valid ISO date', () => {
      const out = component.formatDateTime('2026-06-04T10:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('formatDate returns a localized date string for a valid ISO date', () => {
      const out = component.formatDate('2026-06-04T10:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });
});
