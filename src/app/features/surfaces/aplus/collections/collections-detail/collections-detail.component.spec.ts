/**
 * CollectionsDetailComponent spec — WS-6b collection detail view.
 *
 * Tests cover:
 * - Loading panel renders (aria-busy + role=status)
 * - Contract-gap banner for gateway_not_wired error
 * - Not-found banner for error_not_found
 * - Generic error banner + retry CTA
 * - Success: title, description, visibility badge, atom count
 * - Atom list renders ordered rows; empty-atoms state when no atoms
 * - Remove-atom button present per atom
 * - Delete confirm flow: open → cancel; open → confirm
 * - service.loadDetail() called on init with collectionId
 * - Accessibility: h1 present, dialog role
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { TranslateService } from '../../../../../core/services/translate.service';
import { CollectionsDetailComponent } from './collections-detail.component';
import { CollectionsService } from '../collections.service';
import type {
  Collection,
  CollectionAtomOpState,
  CollectionAtomRef,
  CollectionConvertState,
  CollectionDetailState,
  ConvertToStudyListResponse,
} from '../collections.model';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const COL_ID = '30000000-0000-7000-8000-000000000001';
const ATOM_ID_1 = '40000000-0000-7000-8000-000000000001';
const ATOM_ID_2 = '40000000-0000-7000-8000-000000000002';

function buildAtomRef(atomId: string, position: number): CollectionAtomRef {
  return {
    collection_id: COL_ID,
    atom_id: atomId,
    position,
    added_at: '2026-05-26T10:00:00.000Z',
  };
}

function buildCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    collection_id: COL_ID,
    tenant_id: '10000000-0000-7000-8000-000000000001',
    owner_gcid: '20000000-0000-7000-8000-000000000002',
    title: 'OSI Model Study Guide',
    description: 'Atoms covering all 7 OSI layers.',
    visibility: 'private',
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: '2026-05-26T10:00:00.000Z',
    atoms: [buildAtomRef(ATOM_ID_1, 0), buildAtomRef(ATOM_ID_2, 1)],
    ...overrides,
  };
}

/** WS-4 / ADR-233 D11 — the 201 partial-success envelope. */
function buildConvertResult(
  overrides: Partial<ConvertToStudyListResponse> = {},
): ConvertToStudyListResponse {
  return {
    study_list_event_id: '019f0000-0000-7000-8000-00000000000a',
    atom_count: 2,
    excluded: [],
    ...overrides,
  };
}

// ── Stub service ───────────────────────────────────────────────────────────────

class StubCollectionsService {
  readonly _detailState: WritableSignal<CollectionDetailState> = signal<CollectionDetailState>({
    status: 'loading',
  });
  readonly detailState: Signal<CollectionDetailState> = this._detailState.asReadonly();
  readonly detailCollection = computed<Collection | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.collection : null;
  });

  readonly _atomOpState: WritableSignal<CollectionAtomOpState> = signal<CollectionAtomOpState>({
    status: 'idle',
  });
  readonly atomOpState: Signal<CollectionAtomOpState> = this._atomOpState.asReadonly();

  // List state (unused by detail)
  readonly listState = signal({ status: 'loading' as const }).asReadonly();
  readonly collections = computed(() => [] as Collection[]);

  // Edit state (unused by detail)
  readonly editState = signal({ status: 'idle' as const }).asReadonly();

  loadDetailCalls: string[] = [];
  loadDetail(id: string): void {
    this.loadDetailCalls.push(id);
  }

  removeAtomCalls: { collectionId: string; atomId: string }[] = [];
  removeAtomShouldError = false;
  removeAtom(collectionId: string, atomId: string): Observable<void> {
    this.removeAtomCalls.push({ collectionId, atomId });
    return this.removeAtomShouldError
      ? throwError(() => ({ status: 500 }))
      : of(undefined);
  }

  deleteCalls: string[] = [];
  deleteShouldError = false;
  delete(id: string): Observable<void> {
    this.deleteCalls.push(id);
    return this.deleteShouldError ? throwError(() => ({ status: 500 })) : of(undefined);
  }

  // ── Convert-to-study-list (WS-4 · ADR-233) ──────────────────────────────
  readonly _convertState: WritableSignal<CollectionConvertState> = signal<CollectionConvertState>({
    status: 'idle',
  });
  readonly convertState: Signal<CollectionConvertState> = this._convertState.asReadonly();
  readonly convertResult = computed<ConvertToStudyListResponse | null>(() => {
    const s = this._convertState();
    return s.status === 'success' ? s.result : null;
  });

  convertCalls: string[] = [];
  convertShouldError = false;
  convertResultToReturn: ConvertToStudyListResponse = buildConvertResult();
  convertToStudyList(collectionId: string): Observable<ConvertToStudyListResponse> {
    this.convertCalls.push(collectionId);
    if (this.convertShouldError) {
      this._convertState.set({
        status: 'error',
        error: 'aplus.collections.convert_error_no_entitled_atoms',
      });
      return throwError(() => ({ status: 409 }));
    }
    this._convertState.set({ status: 'success', result: this.convertResultToReturn });
    return of(this.convertResultToReturn);
  }

  resetConvertCalls = 0;
  resetConvertState(): void {
    this.resetConvertCalls += 1;
    this._convertState.set({ status: 'idle' });
  }

  loadList = () => undefined;
  create = () => of(buildCollection());
  update = () => of(buildCollection());
  addAtom = () => of(buildCollection());
  resetEditState = () => undefined;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

function setup(): {
  fixture: ComponentFixture<CollectionsDetailComponent>;
  component: CollectionsDetailComponent;
  element: HTMLElement;
  service: StubCollectionsService;
} {
  const service = new StubCollectionsService();
  TestBed.configureTestingModule({
    imports: [CollectionsDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: CollectionsService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(CollectionsDetailComponent);
  fixture.componentRef.setInput('collectionId', COL_ID);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CollectionsDetailComponent (WS-6b)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // ── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('renders the root section', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="collections-detail"]')).toBeTruthy();
    });

    it('calls service.loadDetail() with collectionId on init', () => {
      const { service } = setup();
      expect(service.loadDetailCalls).toContain(COL_ID);
    });
  });

  // ── loading ───────────────────────────────────────────────────────────────

  describe('loading branch', () => {
    it('renders loading panel with aria-busy and role=status', () => {
      const { element } = setup();
      const panel = element.querySelector('[data-testid="collections-detail-loading"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
      expect(panel?.getAttribute('role')).toBe('status');
    });
  });

  // ── error: contract gap ──────────────────────────────────────────────────

  describe('error branch — contract gap', () => {
    it('renders contract-gap banner for gateway_not_wired', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_gateway_not_wired' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-detail-contract-gap"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });

  // ── error: not found ──────────────────────────────────────────────────────

  describe('error branch — not found', () => {
    it('renders not-found banner for error_not_found', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_not_found' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-detail-not-found"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });

  // ── error: generic ─────────────────────────────────────────────────────────

  describe('error branch — generic', () => {
    it('renders error banner with retry CTA for upstream errors', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_upstream' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="collections-detail-error"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="collections-detail-retry"]')).toBeTruthy();
    });

    it('retry CTA re-fires service.loadDetail()', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_upstream' });
      fixture.detectChanges();
      const before = service.loadDetailCalls.length;
      (element.querySelector('[data-testid="collections-detail-retry"]') as HTMLButtonElement).click();
      expect(service.loadDetailCalls.length).toBe(before + 1);
    });
  });

  // ── success branch ─────────────────────────────────────────────────────────

  describe('success branch', () => {
    function setupSuccess(col = buildCollection()) {
      const ctx = setup();
      ctx.service._detailState.set({ status: 'success', collection: col });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders a single h1 with the collection title', () => {
      const { element } = setupSuccess();
      const h1 = element.querySelector('[data-testid="collections-detail-title"]');
      expect(h1?.textContent?.trim()).toBe('OSI Model Study Guide');
    });

    it('renders the visibility badge', () => {
      const { element } = setupSuccess();
      const badge = element.querySelector('[data-testid="collections-detail-visibility"]');
      expect(badge).not.toBeNull();
      // Translations are not seeded in this describe, so the label resolves to
      // its raw key — enough to prove the template binds the PRIVATE audience.
      // Resolution to human copy is covered in "visibility helpers — all arms".
      expect(badge?.textContent).toContain('aplus.collections.visibility_private');
      expect(badge?.querySelector('i')?.classList.contains('fa-lock')).toBe(true);
    });

    it('renders the atom count badge', () => {
      const { element } = setupSuccess();
      const count = element.querySelector('[data-testid="collections-detail-atom-count"]');
      expect(count?.textContent).toContain('2');
    });

    it('renders description when present', () => {
      const { element } = setupSuccess();
      const desc = element.querySelector('[data-testid="collections-detail-description"]');
      expect(desc?.textContent?.trim()).toBe('Atoms covering all 7 OSI layers.');
    });

    it('does NOT render description when absent', () => {
      const { element } = setupSuccess(buildCollection({ description: undefined }));
      expect(element.querySelector('[data-testid="collections-detail-description"]')).toBeNull();
    });

    it('renders atoms list with correct row count', () => {
      const { element } = setupSuccess();
      const list = element.querySelector('[data-testid="collections-detail-atoms-list"]');
      expect(list).toBeTruthy();
      expect(list?.querySelectorAll('li').length).toBe(2);
    });

    it('renders remove button for each atom', () => {
      const { element } = setupSuccess();
      const btn1 = element.querySelector(`[data-testid="collections-detail-remove-${ATOM_ID_1}"]`);
      const btn2 = element.querySelector(`[data-testid="collections-detail-remove-${ATOM_ID_2}"]`);
      expect(btn1).toBeTruthy();
      expect(btn2).toBeTruthy();
    });

    it('remove button has aria-label', () => {
      const { element } = setupSuccess();
      const btn = element.querySelector(`[data-testid="collections-detail-remove-${ATOM_ID_1}"]`);
      expect(btn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('clicking remove button calls service.removeAtom()', () => {
      const { service, element } = setupSuccess();
      const btn = element.querySelector(
        `[data-testid="collections-detail-remove-${ATOM_ID_1}"]`,
      ) as HTMLButtonElement;
      btn.click();
      expect(service.removeAtomCalls).toContainEqual({
        collectionId: COL_ID,
        atomId: ATOM_ID_1,
      });
    });

    it('renders empty-atoms state when atoms array is empty', () => {
      const { element } = setupSuccess(buildCollection({ atoms: [] }));
      expect(element.querySelector('[data-testid="collections-detail-empty-atoms"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="collections-detail-atoms-list"]')).toBeNull();
    });

    it('renders edit CTA linking to /a/study/collections/{id}/edit', () => {
      const { element } = setupSuccess();
      const btn = element.querySelector('[data-testid="collections-detail-edit-btn"]') as HTMLAnchorElement;
      expect(btn?.getAttribute('href')).toContain(`/a/study/collections/${COL_ID}/edit`);
    });

    it('renders delete button', () => {
      const { element } = setupSuccess();
      expect(element.querySelector('[data-testid="collections-detail-delete-btn"]')).toBeTruthy();
    });
  });

  // ── delete confirm dialog ─────────────────────────────────────────────────

  describe('delete confirm dialog', () => {
    function setupSuccess() {
      const ctx = setup();
      ctx.service._detailState.set({ status: 'success', collection: buildCollection() });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('dialog is not shown initially', () => {
      const { element } = setupSuccess();
      expect(element.querySelector('[data-testid="collections-detail-delete-dialog"]')).toBeNull();
    });

    it('clicking delete opens the dialog', () => {
      const { fixture, element } = setupSuccess();
      (element.querySelector('[data-testid="collections-detail-delete-btn"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const dialog = element.querySelector('[data-testid="collections-detail-delete-dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.getAttribute('role')).toBe('dialog');
    });

    it('cancel button closes the dialog', () => {
      const { fixture, element } = setupSuccess();
      (element.querySelector('[data-testid="collections-detail-delete-btn"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector('[data-testid="collections-detail-delete-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="collections-detail-delete-dialog"]')).toBeNull();
    });

    it('confirm button calls service.delete()', () => {
      const { service, fixture, element } = setupSuccess();
      (element.querySelector('[data-testid="collections-detail-delete-btn"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector('[data-testid="collections-detail-delete-confirm"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(service.deleteCalls).toContain(COL_ID);
    });
  });

  // ── accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('renders a single h1 in success state', () => {
      const ctx = setup();
      ctx.service._detailState.set({ status: 'success', collection: buildCollection() });
      ctx.fixture.detectChanges();
      expect(ctx.element.querySelectorAll('h1').length).toBe(1);
    });
  });

  // ── BRANCH: visibility helpers (each arm of the if-chains) ───────────────────

  // ADR-233 D7 — one audience vocabulary: private | friends | tenant. `PUBLIC`
  // is RETIRED (RLS capped collections at the tenant, so it was never public;
  // cross-tenant distribution is a syndication concern, not a visibility level).
  // The labels are i18n KEYS — a raw key must never reach the learner.
  describe('visibility helpers — all arms', () => {
    function setupSuccess(visibility: Collection['visibility']) {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        collection: buildCollection({ visibility }),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    /** Seed the audience copy so the badge renders words, not raw keys. */
    async function seedAudience(): Promise<void> {
      const translate = TestBed.inject(TranslateService);
      const httpMock = TestBed.inject(HttpTestingController);
      const loaded = translate.loadTranslations('en');
      httpMock.expectOne('/assets/i18n/en.json').flush({
        aplus: {
          collections: {
            visibility_private: 'Private',
            visibility_friends: 'Friends',
            visibility_tenant: 'Organisation',
            visibility_badge_aria: 'Audience: {{audience}}',
          },
        },
      });
      await loaded;
    }

    it('private visibility → lock icon + "Private"', async () => {
      const { component, element, fixture } = setupSuccess('private');
      await seedAudience();
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="collections-detail-visibility"]');
      expect(badge?.textContent).toContain('Private');
      expect(component.visibilityIcon('private')).toBe('fa-solid fa-lock');
      expect(component.visibilityLabelKey('private')).toBe('aplus.collections.visibility_private');
    });

    it('friends visibility → user-group icon + "Friends"', async () => {
      const { component, element, fixture } = setupSuccess('friends');
      await seedAudience();
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="collections-detail-visibility"]');
      expect(badge?.textContent).toContain('Friends');
      expect(component.visibilityIcon('friends')).toBe('fa-solid fa-user-group');
      expect(component.visibilityLabelKey('friends')).toBe('aplus.collections.visibility_friends');
    });

    it('tenant visibility → building icon + "Organisation" — NOT a padlock', async () => {
      const { component, element, fixture } = setupSuccess('tenant');
      await seedAudience();
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="collections-detail-visibility"]');
      expect(badge?.textContent).toContain('Organisation');
      expect(component.visibilityIcon('tenant')).toBe('fa-solid fa-building');
      expect(component.visibilityLabelKey('tenant')).toBe('aplus.collections.visibility_tenant');
    });

    it('labels the badge for screen readers with the resolved audience', async () => {
      const { element, fixture } = setupSuccess('friends');
      await seedAudience();
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="collections-detail-visibility"]');
      expect(badge?.getAttribute('aria-label')).toBe('Audience: Friends');
    });

    it('gcidShort truncates to first 8 chars + ellipsis', () => {
      const { component } = setupSuccess('private');
      expect(component.gcidShort('0123456789abcdef')).toBe('01234567…');
    });
  });

  // ── BRANCH: atom-count singular/plural ternary ──────────────────────────────

  describe('atom-count ternary (singular vs plural)', () => {
    it('renders singular "atom" when exactly one atom', () => {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        collection: buildCollection({ atoms: [buildAtomRef(ATOM_ID_1, 0)] }),
      });
      ctx.fixture.detectChanges();
      const count = ctx.element.querySelector('[data-testid="collections-detail-atom-count"]');
      expect(count?.textContent).toContain('1 atom');
      expect(count?.textContent).not.toContain('atoms');
    });
  });

  // ── BRANCH: atoms computed — null collection + undefined atoms ───────────────

  describe('atoms computed — nullish guard arms', () => {
    it('returns empty array when collection is null (loading state)', () => {
      const { component } = setup(); // default loading state → detailCollection() null
      expect(component.atoms()).toEqual([]);
    });

    it('returns empty array when collection has no atoms field (?? fallback)', () => {
      const { component, service, fixture } = setup();
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ atoms: undefined }),
      });
      fixture.detectChanges();
      expect(component.atoms()).toEqual([]);
    });

    it('returns the atoms array when present', () => {
      const { component, service, fixture } = setup();
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      expect(component.atoms().length).toBe(2);
    });
  });

  // ── BRANCH: errorKey / atomOpError ternary falsy arms ───────────────────────

  describe('errorKey + atomOpError ternary arms', () => {
    it('errorKey is "" when not in error state (loading)', () => {
      const { component } = setup();
      expect(component.errorKey()).toBe('');
    });

    it('errorKey returns the error string when in error state', () => {
      const { component, service } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_upstream' });
      expect(component.errorKey()).toBe('aplus.collections.error_upstream');
    });

    it('atomOpError is "" when atom-op state is idle', () => {
      const { component } = setup();
      expect(component.atomOpError()).toBe('');
    });

    it('atomOpError returns the error string when atom-op state is error', () => {
      const { component, service } = setup();
      service._atomOpState.set({
        status: 'error',
        error: 'aplus.collections.error_atom_not_found',
        atomId: ATOM_ID_1,
      });
      expect(component.atomOpError()).toBe('aplus.collections.error_atom_not_found');
    });

    it('renders atom-op error banner in success state when atom-op errored', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({ status: 'success', collection: buildCollection() });
      service._atomOpState.set({
        status: 'error',
        error: 'aplus.collections.error_atom_not_found',
        atomId: ATOM_ID_1,
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-detail-atom-op-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('aplus.collections.error_atom_not_found');
    });
  });

  // ── BRANCH: isContractGap / isNotFound short-circuit (non-error state) ───────

  describe('contract-gap + not-found computed short-circuits', () => {
    it('isContractGap is false when not in error state', () => {
      const { component } = setup(); // loading
      expect(component.isContractGap()).toBe(false);
    });

    it('isContractGap is false when error is a different key', () => {
      const { component, service } = setup();
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_upstream' });
      expect(component.isContractGap()).toBe(false);
    });

    it('isNotFound is false when not in error state', () => {
      const { component } = setup();
      expect(component.isNotFound()).toBe(false);
    });

    it('isError / isLoading reflect state transitions', () => {
      const { component, service } = setup();
      expect(component.isLoading()).toBe(true);
      expect(component.isError()).toBe(false);
      service._detailState.set({ status: 'error', error: 'aplus.collections.error_upstream' });
      expect(component.isLoading()).toBe(false);
      expect(component.isError()).toBe(true);
    });
  });

  // ── BRANCH: confirmDelete error callback + guard ────────────────────────────

  describe('confirmDelete — error + guard branches', () => {
    // CHARACTERIZATION: confirmDelete pipes catchError(() => of(null)) BEFORE
    // subscribe, so a delete error is converted into a value-then-complete
    // stream. The subscribe `error:` callback (which would set deleteError) is
    // therefore UNREACHABLE dead code — the `complete:` callback always wins.
    // We characterize the real behavior: on error, the dialog still closes and
    // deleteError stays null (the error arm never fires).
    it('on delete error, catchError swallows it → complete path runs (deleteError stays null)', () => {
      const { component, service, fixture } = setup();
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      service.deleteShouldError = true;
      component.openDeleteConfirm();
      component.confirmDelete();
      expect(component.deleteInProgress()).toBe(false);
      // dead-code error arm never fires → deleteError remains null
      expect(component.deleteError()).toBeNull();
      // complete arm closes the dialog
      expect(component.showDeleteConfirm()).toBe(false);
    });

    it('successful delete clears progress + closes dialog', () => {
      const { component, service, fixture } = setup();
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      component.openDeleteConfirm();
      component.confirmDelete();
      expect(service.deleteCalls).toContain(COL_ID);
      expect(component.deleteInProgress()).toBe(false);
      expect(component.showDeleteConfirm()).toBe(false);
    });

    it('confirmDelete is a no-op when collectionId is empty (guard arm)', () => {
      const { component, service, fixture } = setup();
      fixture.componentRef.setInput('collectionId', '');
      fixture.detectChanges();
      const before = service.deleteCalls.length;
      component.confirmDelete();
      expect(service.deleteCalls.length).toBe(before);
      expect(component.deleteInProgress()).toBe(false);
    });
  });

  // ── BRANCH: removeAtom guard + error short-circuit ──────────────────────────

  describe('removeAtom — guard + error branches', () => {
    it('removeAtom is a no-op when collectionId is empty (guard arm)', () => {
      const { component, service, fixture } = setup();
      fixture.componentRef.setInput('collectionId', '');
      fixture.detectChanges();
      const before = service.removeAtomCalls.length;
      component.removeAtom(ATOM_ID_1);
      expect(service.removeAtomCalls.length).toBe(before);
    });

    it('removeAtom swallows service errors via catchError (stays green)', () => {
      const { component, service, fixture } = setup();
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      service.removeAtomShouldError = true;
      expect(() => component.removeAtom(ATOM_ID_1)).not.toThrow();
      expect(service.removeAtomCalls).toContainEqual({
        collectionId: COL_ID,
        atomId: ATOM_ID_1,
      });
    });
  });

  // ── BRANCH: load effect guard (empty id) ────────────────────────────────────

  describe('load effect — empty id guard', () => {
    it('does not call loadDetail when collectionId is empty', () => {
      const service = new StubCollectionsService();
      TestBed.configureTestingModule({
        imports: [CollectionsDetailComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: CollectionsService, useValue: service },
        ],
      });
      const fixture = TestBed.createComponent(CollectionsDetailComponent);
      fixture.componentRef.setInput('collectionId', '');
      fixture.detectChanges();
      expect(service.loadDetailCalls).not.toContain('');
      expect(service.loadDetailCalls.length).toBe(0);
    });
  });

  // ── Convert to study list (WS-4 · ADR-233 D11) ────────────────────────────
  //
  // The UI must express D11 in plain language: conversion is a PARTIAL SUCCESS.
  // Entitled atoms convert; atoms the author has since restricted are dropped
  // and NAMED — never dropped silently, never shown as a raw reason code. The
  // collection is not mutated, so a later convert can still pick them up.
  describe('convert to study list', () => {
    function successState(service: StubCollectionsService): void {
      service._detailState.set({ status: 'success', collection: buildCollection() });
    }

    /**
     * Seed the TranslateService over the HTTP testing backend so `{{count}}`
     * interpolation actually runs. Mirrors the real en.json copy for the keys
     * the result panel renders — without this, `instant()` misses and returns
     * the raw key, so no count would ever reach the DOM.
     */
    async function seedTranslations(): Promise<void> {
      const translate = TestBed.inject(TranslateService);
      const httpMock = TestBed.inject(HttpTestingController);
      const loaded = translate.loadTranslations('en');
      httpMock.expectOne('/assets/i18n/en.json').flush({
        aplus: {
          collections: {
            convert_success_headline: '{{count}} atoms added to your study list',
            convert_success_body:
              'They will start appearing in your Daily Dose as they come up for review.',
            convert_open_study_list: 'Open your Daily Dose',
            convert_excluded_title: '{{count}} atoms were not added',
          },
        },
      });
      await loaded;
    }

    it('renders the convert CTA in the actions bar', () => {
      const { service, fixture, element } = setup();
      successState(service);
      fixture.detectChanges();
      const btn = element.querySelector('[data-testid="collections-detail-convert-btn"]');
      expect(btn).not.toBeNull();
    });

    it('opens the confirm dialog on click (role=dialog, aria-modal)', () => {
      const { service, fixture, element } = setup();
      successState(service);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="collections-detail-convert-dialog"]'),
      ).toBeNull();

      element
        .querySelector<HTMLButtonElement>('[data-testid="collections-detail-convert-btn"]')
        ?.click();
      fixture.detectChanges();

      const dialog = element.querySelector('[data-testid="collections-detail-convert-dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('cancel closes the dialog without calling the service', () => {
      const { service, fixture, element } = setup();
      successState(service);
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="collections-detail-convert-btn"]')
        ?.click();
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="collections-detail-convert-cancel"]')
        ?.click();
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="collections-detail-convert-dialog"]')).toBeNull();
      expect(service.convertCalls.length).toBe(0);
    });

    it('confirm calls convertToStudyList with the collectionId', () => {
      const { service, fixture, component } = setup();
      successState(service);
      fixture.detectChanges();
      component.openConvertConfirm();
      fixture.detectChanges();
      component.confirmConvert();
      fixture.detectChanges();

      expect(service.convertCalls).toEqual([COL_ID]);
    });

    it('on success shows the result panel with the converted atom count', async () => {
      const { service, fixture, component, element } = setup();
      // Seed real translations so {{count}} actually interpolates — otherwise
      // TranslateService returns the raw key and the count never reaches the DOM.
      await seedTranslations();
      successState(service);
      service.convertResultToReturn = buildConvertResult({ atom_count: 18, excluded: [] });
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();

      const panel = element.querySelector('[data-testid="collections-detail-convert-result"]');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain('18');
      expect(component.convertedCount()).toBe(18);
      // Clean conversion — nothing was left behind, so no exclusions section.
      expect(
        element.querySelector('[data-testid="collections-detail-convert-excluded"]'),
      ).toBeNull();
    });

    it('closes the confirm dialog once conversion succeeds', () => {
      const { service, fixture, component, element } = setup();
      successState(service);
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="collections-detail-convert-dialog"]')).toBeNull();
    });

    it('links through to the study list on success', () => {
      const { service, fixture, component, element } = setup();
      successState(service);
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();

      const link = element.querySelector('[data-testid="collections-detail-convert-open-link"]');
      expect(link).not.toBeNull();
    });

    // The heart of D11 — every dropped atom is named, with a human explanation.
    it('names each excluded atom with a human explanation, never a raw code', () => {
      const { service, fixture, component, element } = setup();
      successState(service);
      service.convertResultToReturn = buildConvertResult({
        atom_count: 2,
        excluded: [
          { atom_id: ATOM_ID_1, reason: 'REUSE_VISIBILITY_NARROWED' },
          { atom_id: ATOM_ID_2, reason: 'ATOM_NOT_PUBLISHED' },
        ],
      });
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();

      const excluded = element.querySelector('[data-testid="collections-detail-convert-excluded"]');
      expect(excluded).not.toBeNull();

      const rows = element.querySelectorAll('[data-testid^="collections-detail-convert-excluded-"]');
      expect(rows.length).toBe(2);

      // The raw reason code must NEVER be rendered to the learner.
      const text = excluded?.textContent ?? '';
      expect(text).not.toContain('REUSE_VISIBILITY_NARROWED');
      expect(text).not.toContain('ATOM_NOT_PUBLISHED');
    });

    it('maps each known reason code to a distinct i18n key', () => {
      const { component } = setup();
      expect(component.exclusionReasonKey('REUSE_VISIBILITY_NARROWED')).toBe(
        'aplus.collections.convert_excluded_reason_narrowed',
      );
      expect(component.exclusionReasonKey('ATOM_NOT_PUBLISHED')).toBe(
        'aplus.collections.convert_excluded_reason_not_published',
      );
      expect(component.exclusionReasonKey('NOT_IN_FRIEND_SET')).toBe(
        'aplus.collections.convert_excluded_reason_not_friend',
      );
      expect(component.exclusionReasonKey('ATOM_NOT_FOUND')).toBe(
        'aplus.collections.convert_excluded_reason_unavailable',
      );
    });

    it('falls back to a generic human line for an UNKNOWN reason code', () => {
      const { component } = setup();
      expect(component.exclusionReasonKey('SOME_FUTURE_CODE')).toBe(
        'aplus.collections.convert_excluded_reason_unavailable',
      );
    });

    it('on 409 explains that nothing is available to study — not the raw code', () => {
      const { service, fixture, component, element } = setup();
      successState(service);
      service.convertShouldError = true;
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="collections-detail-convert-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const text = err?.textContent ?? '';
      expect(text).not.toContain('CREATION_COLLECTION_NO_ENTITLED_ATOMS');
      expect(text).toContain('convert_error_no_entitled_atoms');
    });

    it('dismissing the result panel resets convert state', () => {
      const { service, fixture, component, element } = setup();
      successState(service);
      fixture.detectChanges();
      component.openConvertConfirm();
      component.confirmConvert();
      fixture.detectChanges();

      element
        .querySelector<HTMLButtonElement>('[data-testid="collections-detail-convert-dismiss"]')
        ?.click();
      fixture.detectChanges();

      expect(service.resetConvertCalls).toBe(1);
      expect(
        element.querySelector('[data-testid="collections-detail-convert-result"]'),
      ).toBeNull();
    });

    it('guards against an empty collectionId', () => {
      const service = new StubCollectionsService();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [CollectionsDetailComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          TranslateService,
          { provide: CollectionsService, useValue: service },
        ],
      });
      const fixture = TestBed.createComponent(CollectionsDetailComponent);
      fixture.componentRef.setInput('collectionId', '');
      fixture.detectChanges();
      fixture.componentInstance.confirmConvert();
      expect(service.convertCalls.length).toBe(0);
    });
  });
});
