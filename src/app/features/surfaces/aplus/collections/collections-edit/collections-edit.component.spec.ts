/**
 * CollectionsEditComponent spec — WS-6b collection create + edit form.
 *
 * Tests cover:
 * - Root section renders
 * - Create-mode heading "New Collection" (no collectionId input)
 * - Edit-mode heading "Edit Collection" + service.loadDetail called with id
 * - Prefill: detail success populates the title input value
 * - Title required: empty-title submit shows error + create() NOT called
 * - Valid create: fill title → submit → create() called once with the title
 * - Valid update: edit mode → submit → update() called with id
 * - Cancel: click cancel calls resetEditState()
 * - Contract-gap banner for gateway_not_wired editState error
 * - Accessibility: exactly one h1
 *
 * Stubs CollectionsService (per detail spec) — no HttpTestingController.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { TranslateService } from '../../../../../core/services/translate.service';
import { CollectionsEditComponent } from './collections-edit.component';
import { CollectionsService } from '../collections.service';
import type {
  Collection,
  CollectionAtomOpState,
  CollectionDetailState,
  CollectionEditState,
  CreateCollectionRequest,
  PatchCollectionRequest,
} from '../collections.model';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const COL_ID = '30000000-0000-7000-8000-000000000001';

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
    atoms: [],
    ...overrides,
  };
}

// ── Stub service ───────────────────────────────────────────────────────────────

class StubCollectionsService {
  // Edit state (read by the component)
  readonly _editState: WritableSignal<CollectionEditState> = signal<CollectionEditState>({
    status: 'idle',
  });
  readonly editState: Signal<CollectionEditState> = this._editState.asReadonly();

  // Detail state (read by the component for edit-mode prefill)
  readonly _detailState: WritableSignal<CollectionDetailState> = signal<CollectionDetailState>({
    status: 'loading',
  });
  readonly detailState: Signal<CollectionDetailState> = this._detailState.asReadonly();
  readonly detailCollection = computed<Collection | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.collection : null;
  });

  // List state (unused by edit)
  readonly listState = signal({ status: 'loading' as const }).asReadonly();
  readonly collections = computed(() => [] as Collection[]);

  // Atom op state (unused by edit)
  readonly _atomOpState: WritableSignal<CollectionAtomOpState> = signal<CollectionAtomOpState>({
    status: 'idle',
  });
  readonly atomOpState: Signal<CollectionAtomOpState> = this._atomOpState.asReadonly();

  // ── Spy methods ─────────────────────────────────────────────────────────
  loadDetailCalls: string[] = [];
  loadDetail(id: string): void {
    this.loadDetailCalls.push(id);
  }

  createCalls: CreateCollectionRequest[] = [];
  create(req: CreateCollectionRequest): Observable<Collection> {
    this.createCalls.push(req);
    return of(buildCollection());
  }

  updateCalls: Array<{ id: string; patch: PatchCollectionRequest }> = [];
  update(id: string, patch: PatchCollectionRequest): Observable<Collection> {
    this.updateCalls.push({ id, patch });
    return of(buildCollection());
  }

  resetEditStateCalls = 0;
  resetEditState(): void {
    this.resetEditStateCalls += 1;
  }

  // Unused-by-edit surface (kept for parity with the real service)
  loadList = () => undefined;
  delete = () => of(undefined);
  addAtom = () => of(buildCollection());
  removeAtom = () => of(undefined);
}

// ── Setup ──────────────────────────────────────────────────────────────────────

function setup(opts: { editMode?: boolean } = {}): {
  fixture: ComponentFixture<CollectionsEditComponent>;
  component: CollectionsEditComponent;
  element: HTMLElement;
  service: StubCollectionsService;
} {
  const service = new StubCollectionsService();
  TestBed.configureTestingModule({
    imports: [CollectionsEditComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: CollectionsService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(CollectionsEditComponent);
  if (opts.editMode) {
    fixture.componentRef.setInput('collectionId', COL_ID);
  }
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

/**
 * Dispatch a real SubmitEvent on the <form> so the Angular
 * FormGroupDirective `(ngSubmit)` binding fires end-to-end.
 *
 * Calling `.click()` on a `type="submit"` button does NOT reliably fire
 * `(ngSubmit)` in the jsdom test environment (the fixture DOM is detached
 * from the document, so jsdom skips implicit form submission). The
 * established passing pattern — see
 * `bootstrap-tenant-form.component.spec.ts` (CHO-1651) — dispatches a
 * real `SubmitEvent` on the <form> element instead.
 */
function submitForm(element: HTMLElement, fixture: ComponentFixture<CollectionsEditComponent>): void {
  const form = element.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }));
  fixture.detectChanges();
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CollectionsEditComponent (WS-6b)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // ── init / heading ──────────────────────────────────────────────────────────

  describe('init', () => {
    it('renders the root section', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="collections-edit"]')).toBeTruthy();
    });

    it('renders "New Collection" heading in create mode', () => {
      const { element } = setup();
      const h1 = element.querySelector('[data-testid="collections-edit-heading"]');
      expect(h1?.textContent?.trim()).toBe('New Collection');
    });

    it('renders "Edit Collection" heading in edit mode', () => {
      const { element } = setup({ editMode: true });
      const h1 = element.querySelector('[data-testid="collections-edit-heading"]');
      expect(h1?.textContent?.trim()).toBe('Edit Collection');
    });

    it('calls service.loadDetail() with the id in edit mode', () => {
      const { service } = setup({ editMode: true });
      expect(service.loadDetailCalls).toContain(COL_ID);
    });

    it('does NOT call service.loadDetail() in create mode', () => {
      const { service } = setup();
      expect(service.loadDetailCalls.length).toBe(0);
    });
  });

  // ── prefill ──────────────────────────────────────────────────────────────────

  describe('prefill (edit mode)', () => {
    it('populates the title input from detail success state', () => {
      const { service, fixture, element } = setup({ editMode: true });
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ title: 'Prefilled Title' }),
      });
      fixture.detectChanges();
      const input = element.querySelector('[data-testid="collections-edit-title"]') as HTMLInputElement;
      expect(input.value).toBe('Prefilled Title');
    });
  });

  // ── title validation ─────────────────────────────────────────────────────────

  describe('title validation', () => {
    it('shows the title error and does NOT call create() when title is empty', () => {
      const { service, fixture, element } = setup();
      submitForm(element, fixture);
      expect(element.querySelector('[data-testid="collections-edit-title-error"]')).toBeTruthy();
      expect(service.createCalls.length).toBe(0);
    });
  });

  // ── valid create ─────────────────────────────────────────────────────────────

  describe('valid create', () => {
    it('calls create() once with the trimmed title on submit', () => {
      const { service, fixture, component, element } = setup();
      component.form.controls.title.setValue('Networking Basics');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.createCalls.length).toBe(1);
      expect(service.createCalls[0].title).toBe('Networking Basics');
      expect(service.updateCalls.length).toBe(0);
    });
  });

  // ── valid update ─────────────────────────────────────────────────────────────

  describe('valid update', () => {
    it('calls update() with the id on submit in edit mode', () => {
      const { service, fixture, component, element } = setup({ editMode: true });
      // The form is hidden while detail is loading (edit mode shows the prefill
      // GET spinner first), so resolve detail to success to render the form.
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      component.form.controls.title.setValue('Edited Title');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.updateCalls.length).toBe(1);
      expect(service.updateCalls[0].id).toBe(COL_ID);
      expect(service.updateCalls[0].patch.title).toBe('Edited Title');
      expect(service.createCalls.length).toBe(0);
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('calls service.resetEditState() without throwing', () => {
      const { service, element } = setup();
      expect(() => {
        (element.querySelector('[data-testid="collections-edit-cancel"]') as HTMLButtonElement).click();
      }).not.toThrow();
      expect(service.resetEditStateCalls).toBe(1);
    });
  });

  // ── contract-gap banner ──────────────────────────────────────────────────────

  describe('contract-gap banner', () => {
    it('renders the contract-gap banner for gateway_not_wired editState error', () => {
      const { service, fixture, element } = setup();
      service._editState.set({
        status: 'error',
        error: 'aplus.collections.error_gateway_not_wired',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-edit-contract-gap"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('renders the generic error banner for other editState errors', () => {
      const { service, fixture, element } = setup();
      service._editState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="collections-edit-error"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="collections-edit-contract-gap"]')).toBeNull();
    });
  });

  // ── edit-mode load states ─────────────────────────────────────────────────────

  describe('edit-mode load states', () => {
    it('renders the loading spinner while detail is loading in edit mode', () => {
      const { element, component } = setup({ editMode: true });
      // Stub default detail state is 'loading'.
      expect(component.isLoadingDetail()).toBe(true);
      const loading = element.querySelector('[data-testid="collections-edit-loading"]');
      expect(loading).toBeTruthy();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      // The form is hidden while loading.
      expect(element.querySelector('[data-testid="collections-edit-title"]')).toBeNull();
    });

    it('does NOT render the loading spinner in create mode', () => {
      const { element, component } = setup();
      expect(component.isLoadingDetail()).toBe(false);
      expect(element.querySelector('[data-testid="collections-edit-loading"]')).toBeNull();
      // The form is visible immediately in create mode.
      expect(element.querySelector('[data-testid="collections-edit-title"]')).toBeTruthy();
    });

    it('renders the load-error banner when detail fails in edit mode', () => {
      const { service, fixture, element, component } = setup({ editMode: true });
      service._detailState.set({
        status: 'error',
        error: 'aplus.collections.error_not_found',
      });
      fixture.detectChanges();
      expect(component.detailLoadError()).toBe('aplus.collections.error_not_found');
      const banner = element.querySelector('[data-testid="collections-edit-load-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('aplus.collections.error_not_found');
      // The form is hidden while the load error is showing.
      expect(element.querySelector('[data-testid="collections-edit-title"]')).toBeNull();
    });

    it('detailLoadError() is null in create mode even if detailState is error', () => {
      const { service, fixture, component } = setup();
      service._detailState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      fixture.detectChanges();
      // Create mode ignores detail state entirely.
      expect(component.detailLoadError()).toBeNull();
    });
  });

  // ── prefill (description + visibility) ─────────────────────────────────────────

  describe('prefill (description + visibility)', () => {
    it('prefills the description textarea from detail success', () => {
      const { service, fixture, element } = setup({ editMode: true });
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ description: 'Layered networking notes.' }),
      });
      fixture.detectChanges();
      const textarea = element.querySelector(
        '[data-testid="collections-edit-description"]',
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Layered networking notes.');
    });

    it('prefills the description as empty string when detail has no description', () => {
      const { service, fixture, component } = setup({ editMode: true });
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ description: undefined }),
      });
      fixture.detectChanges();
      expect(component.form.controls.description.value).toBe('');
    });

    it('prefills the visibility signal + control from detail success', () => {
      const { service, fixture, component } = setup({ editMode: true });
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ visibility: 'tenant' }),
      });
      fixture.detectChanges();
      expect(component.visibility()).toBe('tenant');
      expect(component.form.controls.visibility.value).toBe('tenant');
    });

    it('prefills the friends audience from detail success', () => {
      const { service, fixture, component } = setup({ editMode: true });
      service._detailState.set({
        status: 'success',
        collection: buildCollection({ visibility: 'friends' }),
      });
      fixture.detectChanges();
      expect(component.visibility()).toBe('friends');
      expect(component.form.controls.visibility.value).toBe('friends');
    });
  });

  // ── title validation: maxlength branch ─────────────────────────────────────────

  describe('title validation (maxlength)', () => {
    it('shows the 200-char error when title exceeds 200 trimmed characters', () => {
      const { component, fixture, element } = setup();
      component.form.controls.title.setValue('x'.repeat(201));
      fixture.detectChanges();
      submitForm(element, fixture);
      const err = element.querySelector('[data-testid="collections-edit-title-error"]');
      expect(err).toBeTruthy();
      expect(err?.textContent?.trim()).toBe('Title must be 200 characters or fewer.');
    });

    it('titleError() is null before the control is touched', () => {
      const { component } = setup();
      // Untouched control → no visible error even though required is unmet.
      expect(component.titleError()).toBeNull();
    });

    it('shows "Title is required." for an empty touched title', () => {
      const { fixture, element } = setup();
      submitForm(element, fixture); // markAllAsTouched
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="collections-edit-title-error"]');
      expect(err?.textContent?.trim()).toBe('Title is required.');
    });

    it('treats a null title value as empty in maxLengthTrimmed (?.trim() ?? "" arm)', () => {
      // The NonNullableFormBuilder control never yields null through the public
      // UI, but `reset(null)` drives the defensive `(value as string)?.trim() ?? ''`
      // optional-chain + nullish arm. With value coerced to '', length 0 ≤ 200
      // so maxLengthTrimmed returns null (no maxlength error) — required still fails.
      const { component, fixture } = setup();
      const ctrl = component.form.controls.title;
      // NonNullableFormBuilder types the value as `string`; the defensive null
      // arm is only reachable via a typed escape (not `as any`).
      ctrl.setValue(null as unknown as string);
      ctrl.markAsTouched();
      fixture.detectChanges();
      expect(ctrl.hasError('maxlength')).toBe(false);
      // The null/empty title is invalid via `required`, surfacing the required copy.
      expect(component.titleError()).toBe('Title is required.');
    });
  });

  // ── visibility interaction ─────────────────────────────────────────────────────

  // ADR-233 D7 — the form offers exactly three audiences: private | friends |
  // tenant. It previously POSTed `PRIVATE` / `TENANT_INTERNAL` / `PUBLIC`, which
  // `audience.Valid()` rejects outright → 400 on every create and edit.
  describe('onVisibilityChange', () => {
    it('updates both the form control and the visibility signal', () => {
      const { component } = setup();
      component.onVisibilityChange('tenant');
      expect(component.form.controls.visibility.value).toBe('tenant');
      expect(component.visibility()).toBe('tenant');
    });

    it('updates visibility when a radio change event fires', () => {
      const { component, element } = setup();
      const radio = element.querySelector(
        '[data-testid="collections-edit-visibility-tenant"] input',
      ) as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      expect(component.visibility()).toBe('tenant');
      expect(component.form.controls.visibility.value).toBe('tenant');
    });
  });

  // ── the `friends` audience — an option the UI has never offered ─────────────
  //
  // ADR-233 D7 aligns collections with atom reuse-visibility, which already
  // resolves `friends` against the ADR-230 friend set. The radio must exist AND
  // must submit the lowercase wire value the backend accepts.
  describe('friends audience option (new in ADR-233 D7)', () => {
    it('renders a friends radio with the user-group icon', () => {
      const { element } = setup();
      const option = element.querySelector('[data-testid="collections-edit-visibility-friends"]');
      expect(option).not.toBeNull();
      const input = option?.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('friends');
      expect(option?.querySelector('i')?.className).toBe('fa-solid fa-user-group');
    });

    it('offers exactly three audiences — the retired PUBLIC option is gone', () => {
      const { element } = setup();
      const radios = element.querySelectorAll('.collections-edit__radiogroup input[type="radio"]');
      expect(radios.length).toBe(3);
      expect(
        element.querySelector('[data-testid="collections-edit-visibility-PUBLIC"]'),
      ).toBeNull();
      expect(element.querySelector('.fa-earth-asia')).toBeNull();
    });

    it('submits visibility=friends on create when the friends radio is picked', () => {
      const { service, fixture, component, element } = setup();
      component.form.controls.title.setValue('Shared with my study group');
      const radio = element.querySelector(
        '[data-testid="collections-edit-visibility-friends"] input',
      ) as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.createCalls.length).toBe(1);
      expect(service.createCalls[0].visibility).toBe('friends');
    });

    it('submits visibility=friends on update', () => {
      const { service, fixture, component, element } = setup({ editMode: true });
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      component.form.controls.title.setValue('Edited Title');
      component.onVisibilityChange('friends');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.updateCalls[0].patch.visibility).toBe('friends');
    });

    // The three options are the learner's only explanation of who gets to see
    // this. A raw i18n key here would be worse than no hint at all — so assert
    // the copy actually RESOLVES, not merely that a key is referenced.
    it('renders resolved audience copy for all three options', async () => {
      const { element, fixture } = setup();
      const translate = TestBed.inject(TranslateService);
      const httpMock = TestBed.inject(HttpTestingController);
      const loaded = translate.loadTranslations('en');
      httpMock.expectOne('/assets/i18n/en.json').flush({
        aplus: {
          collections: {
            visibility_private: 'Private',
            visibility_private_hint: 'Only you can see this collection.',
            visibility_friends: 'Friends',
            visibility_friends_hint: 'You and your friends can see this collection.',
            visibility_tenant: 'Organisation',
            visibility_tenant_hint: 'Everyone in your organisation can see this collection.',
          },
        },
      });
      await loaded;
      fixture.detectChanges();

      const group = element.querySelector('.collections-edit__radiogroup');
      const text = group?.textContent ?? '';
      expect(text).toContain('Private');
      expect(text).toContain('Only you can see this collection.');
      expect(text).toContain('Friends');
      expect(text).toContain('You and your friends can see this collection.');
      expect(text).toContain('Organisation');
      expect(text).toContain('Everyone in your organisation can see this collection.');
      // No raw dotted key leaked into the form.
      expect(text).not.toContain('aplus.collections.');
    });
  });

  // ── submitting state ───────────────────────────────────────────────────────────

  describe('submitting state', () => {
    it('disables the submit button and shows "Saving…" while submitting', () => {
      const { service, fixture, element, component } = setup();
      service._editState.set({ status: 'submitting' });
      fixture.detectChanges();
      expect(component.isSubmitting()).toBe(true);
      const submitBtn = element.querySelector(
        '[data-testid="collections-edit-submit"]',
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toContain('Saving…');
    });

    it('does NOT call create() again while already submitting', () => {
      const { service, fixture, component, element } = setup();
      component.form.controls.title.setValue('Networking Basics');
      service._editState.set({ status: 'submitting' });
      fixture.detectChanges();
      submitForm(element, fixture);
      // Early-return guard: isSubmitting() short-circuits onSubmit().
      expect(service.createCalls.length).toBe(0);
    });
  });

  // ── submit payload trimming ─────────────────────────────────────────────────────

  describe('submit payload', () => {
    it('trims a padded title and omits an empty description on create', () => {
      const { service, fixture, component, element } = setup();
      component.form.controls.title.setValue('  Padded Title  ');
      component.form.controls.description.setValue('   ');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.createCalls.length).toBe(1);
      expect(service.createCalls[0].title).toBe('Padded Title');
      // Whitespace-only description → undefined (not sent).
      expect(service.createCalls[0].description).toBeUndefined();
    });

    it('forwards a non-empty trimmed description + visibility on create', () => {
      const { service, fixture, component, element } = setup();
      component.form.controls.title.setValue('Title');
      component.form.controls.description.setValue('  some notes  ');
      component.onVisibilityChange('tenant');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.createCalls[0].description).toBe('some notes');
      expect(service.createCalls[0].visibility).toBe('tenant');
    });

    it('omits a whitespace-only description on update (edit branch || undefined)', () => {
      // Mirrors the create payload test for the UPDATE submit branch.
      const { service, fixture, component, element } = setup({ editMode: true });
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      component.form.controls.title.setValue('  Padded Title  ');
      component.form.controls.description.setValue('   ');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.updateCalls.length).toBe(1);
      expect(service.updateCalls[0].patch.title).toBe('Padded Title');
      // Whitespace-only description → undefined (`.trim() || undefined`).
      expect(service.updateCalls[0].patch.description).toBeUndefined();
    });

    it('forwards a non-empty trimmed description + visibility on update', () => {
      const { service, fixture, component, element } = setup({ editMode: true });
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      component.form.controls.title.setValue('Edited Title');
      component.form.controls.description.setValue('  edited notes  ');
      component.onVisibilityChange('tenant');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.updateCalls[0].patch.description).toBe('edited notes');
      expect(service.updateCalls[0].patch.visibility).toBe('tenant');
    });
  });

  // ── navigation on success ───────────────────────────────────────────────────────

  describe('navigation', () => {
    it('navigates to the new collection after a successful create', () => {
      const { service, fixture, component, element } = setup();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      service.create = (req) => {
        service.createCalls.push(req);
        return of(buildCollection({ collection_id: COL_ID }));
      };
      component.form.controls.title.setValue('Networking Basics');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(navSpy).toHaveBeenCalledWith(['/a/study/collections', COL_ID]);
    });

    it('navigates to the collection after a successful update', () => {
      const { service, fixture, component, element } = setup({ editMode: true });
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.form.controls.title.setValue('Edited Title');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(navSpy).toHaveBeenCalledWith(['/a/study/collections', COL_ID]);
    });

    it('does NOT navigate when create() errors (catchError → null)', () => {
      const { service, fixture, component, element } = setup();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      service.create = (req) => {
        service.createCalls.push(req);
        return throwError(() => ({ status: 502 }));
      };
      component.form.controls.title.setValue('Networking Basics');
      fixture.detectChanges();
      submitForm(element, fixture);
      // The component swallows the error via catchError(() => of(null)).
      expect(service.createCalls.length).toBe(1);
      expect(navSpy).not.toHaveBeenCalled();
    });

    it('does NOT navigate when update() errors (catchError → null) in edit mode', () => {
      // Exercises the edit-branch `next: (col) => if (col)` FALSE arm — the
      // create-branch equivalent is covered above; the update branch was not.
      const { service, fixture, component, element } = setup({ editMode: true });
      service._detailState.set({ status: 'success', collection: buildCollection() });
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      service.update = (id, patch) => {
        service.updateCalls.push({ id, patch });
        return throwError(() => ({ status: 502 }));
      };
      component.form.controls.title.setValue('Edited Title');
      fixture.detectChanges();
      submitForm(element, fixture);
      expect(service.updateCalls.length).toBe(1);
      expect(navSpy).not.toHaveBeenCalled();
    });
  });

  // ── cancel navigation ───────────────────────────────────────────────────────────

  describe('cancel navigation', () => {
    it('navigates to the collections list in create mode', () => {
      const { component } = setup();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onCancel();
      expect(navSpy).toHaveBeenCalledWith(['/a/study/collections']);
    });

    it('navigates to the collection detail in edit mode', () => {
      const { component } = setup({ editMode: true });
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onCancel();
      expect(navSpy).toHaveBeenCalledWith(['/a/study/collections', COL_ID]);
    });
  });

  // ── submit error banner content ─────────────────────────────────────────────────

  describe('generic submit error banner content', () => {
    it('shows the raw error key text in the generic banner', () => {
      const { service, fixture, element } = setup();
      service._editState.set({
        status: 'error',
        error: 'aplus.collections.error_conflict',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-edit-error"]');
      expect(banner?.textContent).toContain('aplus.collections.error_conflict');
    });
  });

  // ── computed-signal arms (submitError / isContractGap) ──────────────────────────

  describe('editState computed arms', () => {
    it('submitError() is null and isContractGap() is false in the idle state', () => {
      // status !== 'error' short-circuits both computeds (ternary false arm +
      // `s.status === 'error' &&` false arm).
      const { component } = setup();
      expect(component.submitError()).toBeNull();
      expect(component.isContractGap()).toBe(false);
    });

    it('submitError() returns the error and isContractGap() is true for the gateway key', () => {
      const { service, component } = setup();
      service._editState.set({
        status: 'error',
        error: 'aplus.collections.error_gateway_not_wired',
      });
      expect(component.submitError()).toBe('aplus.collections.error_gateway_not_wired');
      expect(component.isContractGap()).toBe(true);
    });

    it('isContractGap() is false when status is error but the key differs (&& right arm false)', () => {
      const { service, component } = setup();
      service._editState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      expect(component.submitError()).toBe('aplus.collections.error_upstream');
      expect(component.isContractGap()).toBe(false);
    });
  });

  // ── accessibility ────────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('renders exactly one h1', () => {
      const { element } = setup();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });
  });
});
