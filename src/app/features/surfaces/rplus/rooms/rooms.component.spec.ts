// rooms.component.spec.ts - the Rooms admin screen (CHO-2294).
//
// This is the destination the Campus Operations "Rooms" button has advertised
// since M15a with no handler behind it. It renders the DURABLE tenant room list
// (GET /api/v1/rooms), not a new concept.
//
// Honest-state coverage is the point: loading, error and empty must be three
// DISTINCT renders. The failure mode being guarded against is the one campusops
// itself shipped, where a dead backend rendered as a clean empty state.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import axe from 'axe-core';
import { RoomsComponent } from './rooms.component';
import { environment } from '../../../../../environments/environment';

const ROOMS_URL = `${environment.bffBaseUrl}/api/v1/rooms`;

const STUB_ROOMS = [
  { id: 'room-1', name: 'Lab A', capacity: 30 },
  { id: 'room-2', name: 'Hall B', capacity: 120 },
];

function setup() {
  TestBed.configureTestingModule({
    imports: [RoomsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(RoomsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('RoomsComponent', () => {
  let fixture: ComponentFixture<RoomsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: RoomsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the surface-rplus accent on a semantic section root', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    const root = element.querySelector('[data-testid="rplus-rooms"]');
    expect(root?.className).toContain('surface-rplus');
    expect(root?.tagName.toLowerCase()).toBe('section');
  });

  it('renders one row per room with its capacity', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    const rows = element.querySelectorAll('[data-testid^="rooms-row-"]');
    expect(rows.length).toBe(2);
    expect(element.textContent).toContain('Lab A');
    expect(element.textContent).toContain('30');
  });

  it('shows a LOADING state while the request is in flight', () => {
    // Deliberately not flushed yet.
    expect(element.querySelector('[data-testid="rooms-loading"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-error"]')).toBeNull();
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
  });

  it('shows an EMPTY state distinct from the error state', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-error"]')).toBeNull();
  });

  // The load-bearing one: a dead backend must NOT render as "no rooms yet".
  it('shows a LOUD error state on failure, never an empty list', () => {
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('[data-testid="rooms-empty"]')).toBeNull();
  });

  // The submit gate, driven through the DOM so the template binding is covered.
  it('keeps submit disabled until a name and a positive capacity are present', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="rooms-create-cta"]')?.click();
    fixture.detectChanges();

    const submit = element.querySelector<HTMLButtonElement>(
      '[data-testid="rooms-form-submit"]',
    );
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(true);

    component.formName.set('Studio C');
    fixture.detectChanges();
    expect(submit!.disabled).toBe(true); // capacity still missing

    component.formCapacity.set('0'); // not a positive capacity
    fixture.detectChanges();
    expect(submit!.disabled).toBe(true);

    component.formCapacity.set('12');
    fixture.detectChanges();
    expect(submit!.disabled).toBe(false);
  });

  it('creates a room and refetches canonical server state', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
    fixture.detectChanges();

    component.onCreateClicked();
    component.formName.set('Studio C');
    component.formCapacity.set('12');
    fixture.detectChanges();

    component.onCreateSubmit();

    const post = httpMock.expectOne((r) => r.url === ROOMS_URL && r.method === 'POST');
    expect(post.request.body).toEqual({ name: 'Studio C', capacity: 12 });
    post.flush({ id: 'room-9', name: 'Studio C', capacity: 12 }, { status: 201, statusText: 'Created' });

    // Success bumps reloadKey, whose toObservable->switchMap GET only fires on
    // the next change-detection cycle (matches the campusops create pattern).
    fixture.detectChanges();
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ rooms: [{ id: 'room-9', name: 'Studio C', capacity: 12 }] });
    fixture.detectChanges();

    expect(element.textContent).toContain('Studio C');
    // Form closed on success.
    expect(element.querySelector('[data-testid="rooms-form"]')).toBeNull();
  });

  it('surfaces a create failure loudly and keeps the form open', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
    fixture.detectChanges();

    component.onCreateClicked();
    component.formName.set('Bad Room');
    component.formCapacity.set('5');
    fixture.detectChanges();

    component.onCreateSubmit();
    httpMock
      .expectOne((r) => r.url === ROOMS_URL && r.method === 'POST')
      .flush({ error: 'nope' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-form-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toContain('400');
    // The form stays open so the operator can correct and retry.
    expect(element.querySelector('[data-testid="rooms-form"]')).not.toBeNull();
  });

  it('has no critical or serious WCAG violations', async () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    const results = await axe.run(element);
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });

  // --- Find / organize the list (CHO-2294 follow-up: client-side, no backend) --
  // A room-management screen with a growing list needs a way to find + order
  // rooms. This is purely client-side over the already-fetched list: it adds NO
  // new backend call. The load-bearing invariant carries over: a filter that
  // matches nothing is a DISTINCT state from "no rooms yet" and from a dead
  // backend, so the operator is never told "no rooms" when rooms exist.

  // A varied stub: names deliberately unsorted + mixed-case, capacities varied,
  // so sort order and case-insensitive filtering are both observable.
  const SORT_ROOMS = [
    { id: 'r-a', name: 'Zeta Hall', capacity: 10 },
    { id: 'r-b', name: 'alpha Lab', capacity: 200 },
    { id: 'r-c', name: 'Mid Room', capacity: 50 },
  ];

  /** Names of the currently-rendered room rows, in DOM order. */
  function renderedRoomNames(): string[] {
    return Array.from(element.querySelectorAll('[data-testid^="rooms-row-"]')).map(
      (row) =>
        row
          .querySelector('.rooms__row-name')
          ?.textContent?.trim() ?? '',
    );
  }

  it('renders the filter + sort toolbar only when the ready list is non-empty', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-toolbar"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-filter-input"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-sort-select"]')).not.toBeNull();
  });

  it('hides the toolbar when the tenant has no rooms (nothing to filter)', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-toolbar"]')).toBeNull();
    expect(element.querySelector('[data-testid="rooms-empty"]')).not.toBeNull();
  });

  it('hides the toolbar in the error state (never filter a dead backend)', () => {
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-toolbar"]')).toBeNull();
  });

  it('filters the visible rows by name, case-insensitively', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    // Drive the filter through the DOM so the template binding is covered.
    const input = element.querySelector<HTMLInputElement>(
      '[data-testid="rooms-filter-input"]',
    );
    expect(input).not.toBeNull();
    input!.value = 'lab';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(renderedRoomNames()).toEqual(['alpha Lab']);
  });

  it('shows a DISTINCT no-match state when a filter matches nothing', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    component.filterQuery.set('nothing-matches-this');
    fixture.detectChanges();

    // No-match is its own render, and it is NOT the "no rooms yet" empty state.
    expect(element.querySelector('[data-testid="rooms-no-match"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-empty"]')).toBeNull();
    expect(element.querySelectorAll('[data-testid^="rooms-row-"]').length).toBe(0);
  });

  it('clears the filter via the clear control and restores every row', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    component.filterQuery.set('nothing-matches-this');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-no-match"]')).not.toBeNull();

    element
      .querySelector<HTMLButtonElement>('[data-testid="rooms-filter-clear"]')
      ?.click();
    fixture.detectChanges();

    expect(component.filterQuery()).toBe('');
    expect(element.querySelectorAll('[data-testid^="rooms-row-"]').length).toBe(3);
  });

  it('sorts by name A to Z when the name sort is chosen', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    component.sortMode.set('name');
    fixture.detectChanges();

    expect(renderedRoomNames()).toEqual(['alpha Lab', 'Mid Room', 'Zeta Hall']);
  });

  it('sorts by capacity, most seats first, when the capacity sort is chosen', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    component.sortMode.set('capacity');
    fixture.detectChanges();

    expect(renderedRoomNames()).toEqual(['alpha Lab', 'Mid Room', 'Zeta Hall']);
  });

  it('defaults to the server (created_at) order and does not mutate the source', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();

    // Default = server order, untouched.
    expect(renderedRoomNames()).toEqual(['Zeta Hall', 'alpha Lab', 'Mid Room']);

    // Sorting the view must not reorder the underlying rooms() signal.
    component.sortMode.set('name');
    fixture.detectChanges();
    expect(component.rooms().map((r) => r.name)).toEqual([
      'Zeta Hall',
      'alpha Lab',
      'Mid Room',
    ]);
  });

  it('breaks a capacity tie by name so the sort is stable', () => {
    httpMock.expectOne(ROOMS_URL).flush({
      rooms: [
        { id: 't-1', name: 'Beta', capacity: 40 },
        { id: 't-2', name: 'Delta', capacity: 40 },
        { id: 't-3', name: 'Alpha', capacity: 40 },
      ],
    });
    fixture.detectChanges();

    component.sortMode.set('capacity');
    fixture.detectChanges();

    // Equal capacities fall back to A-to-Z by name.
    expect(renderedRoomNames()).toEqual(['Alpha', 'Beta', 'Delta']);
  });

  it('re-fetches when Retry is clicked after a load error', () => {
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-error"]')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('[data-testid="rooms-retry"]')?.click();
    fixture.detectChanges();

    // Retry bumps reloadKey → a fresh GET fires; a good response clears the error.
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rooms-error"]')).toBeNull();
    expect(element.querySelectorAll('[data-testid^="rooms-row-"]').length).toBe(2);
  });

  it('keeps the toolbar accessible (no critical or serious WCAG violations)', async () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: SORT_ROOMS });
    fixture.detectChanges();
    component.filterQuery.set('zzz'); // force the no-match branch into view
    fixture.detectChanges();
    const results = await axe.run(element);
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });

  // --- CHO-2332: per-room Edit + soft-Delete (coordinated FE+BE) -------------
  // The prior wave shipped Create + Read + a client-side filter/sort only, on
  // the correct read that Update/Delete had no backend. CHO-2332 lands the real
  // PATCH/DELETE /api/v1/rooms/{id} endpoints, so these controls are wired to
  // real routes (NOT no-op stubs). Edit is an inline pre-filled form; Delete is
  // an in-app, focus-managed confirmation (never the blocking window.confirm).
  // The load-bearing invariants carry over: a failure surfaces LOUD, and the
  // filter/sort view still holds after a mutation.

  it('renders an Edit and a Delete control on each room row', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rooms-edit-room-1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-delete-room-1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-edit-room-2"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-delete-room-2"]')).not.toBeNull();
  });

  it('opens an inline edit form pre-filled with the room name and capacity', async () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    element
      .querySelector<HTMLButtonElement>('[data-testid="rooms-edit-room-1"]')
      ?.click();
    fixture.detectChanges();
    // ngModel writes the initial control value in a microtask, so flush it
    // before reading the rendered input value.
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rooms-edit-form"]')).not.toBeNull();
    const name = element.querySelector<HTMLInputElement>('[data-testid="rooms-edit-name"]');
    const cap = element.querySelector<HTMLInputElement>('[data-testid="rooms-edit-capacity"]');
    expect(component.editName()).toBe('Lab A');
    expect(name?.value).toBe('Lab A');
    expect(cap?.value).toBe('30');
  });

  it('keeps the edit submit disabled until a name and a positive capacity are present', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    component.onEditClicked(component.rooms()[0]);
    fixture.detectChanges();

    const submit = element.querySelector<HTMLButtonElement>(
      '[data-testid="rooms-edit-submit"]',
    );
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(false); // pre-filled with valid values

    component.editName.set('   '); // blank name
    fixture.detectChanges();
    expect(submit!.disabled).toBe(true);

    component.editName.set('Lab A');
    component.editCapacity.set('0'); // not a positive capacity
    fixture.detectChanges();
    expect(submit!.disabled).toBe(true);

    component.editCapacity.set('42');
    fixture.detectChanges();
    expect(submit!.disabled).toBe(false);
  });

  it('updates a room via PATCH and refetches canonical server state', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onEditClicked(component.rooms()[0]); // room-1 / Lab A
    component.editName.set('Lab A Renamed');
    component.editCapacity.set('45');
    fixture.detectChanges();

    component.onEditSubmit();

    const patch = httpMock.expectOne(
      (r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'PATCH',
    );
    expect(patch.request.body).toEqual({ name: 'Lab A Renamed', capacity: 45 });
    patch.flush({ id: 'room-1', name: 'Lab A Renamed', capacity: 45 });

    // Success bumps reloadKey → the switchMap GET only fires next CD cycle.
    fixture.detectChanges();
    httpMock.expectOne(ROOMS_URL).flush({
      rooms: [
        { id: 'room-1', name: 'Lab A Renamed', capacity: 45 },
        { id: 'room-2', name: 'Hall B', capacity: 120 },
      ],
    });
    fixture.detectChanges();

    expect(element.textContent).toContain('Lab A Renamed');
    // Edit form closed on success.
    expect(element.querySelector('[data-testid="rooms-edit-form"]')).toBeNull();
  });

  it('surfaces an update failure loudly and keeps the edit form open', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onEditClicked(component.rooms()[0]);
    component.editName.set('Nope');
    component.editCapacity.set('5');
    fixture.detectChanges();

    component.onEditSubmit();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'PATCH')
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-edit-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toContain('403');
    // Stays open so the operator can correct and retry.
    expect(element.querySelector('[data-testid="rooms-edit-form"]')).not.toBeNull();
  });

  // The delete confirmation MUST be an in-app control, not the blocking native
  // window.confirm (poor UX + not focus-manageable).
  it('opens an in-app delete confirmation and never calls window.confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    element
      .querySelector<HTMLButtonElement>('[data-testid="rooms-delete-room-1"]')
      ?.click();
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rooms-delete-confirm"]')).not.toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('confirms a delete, DELETEs, and refetches so the row is gone', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onDeleteClicked(component.rooms()[0]); // room-1
    fixture.detectChanges();

    component.onConfirmDelete();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });

    fixture.detectChanges();
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ rooms: [{ id: 'room-2', name: 'Hall B', capacity: 120 }] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rooms-row-room-1"]')).toBeNull();
    expect(element.querySelector('[data-testid="rooms-row-room-2"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-delete-confirm"]')).toBeNull();
  });

  it('surfaces a delete failure loudly in the confirm and keeps it open', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onDeleteClicked(component.rooms()[0]);
    fixture.detectChanges();

    component.onConfirmDelete();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE')
      .flush({ error: 'gone' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-delete-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('404');
    expect(element.querySelector('[data-testid="rooms-delete-confirm"]')).not.toBeNull();
  });

  it('renders the confirm as an accessible dialog and cancels it on Escape', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onDeleteClicked(component.rooms()[0]);
    fixture.detectChanges();
    const confirm = element.querySelector('[data-testid="rooms-delete-confirm"]');
    expect(confirm).not.toBeNull();
    expect(confirm?.getAttribute('role')).toBe('alertdialog');
    // A dialog needs an accessible name.
    expect(confirm?.getAttribute('aria-labelledby')).toBeTruthy();

    confirm!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rooms-delete-confirm"]')).toBeNull();
    expect(component.deletingRoomId()).toBeNull();
  });

  it('moves focus into the delete confirm when it opens (focus management)', async () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    // Focus lands only for elements connected to the document.
    document.body.appendChild(fixture.nativeElement);
    try {
      component.onDeleteClicked(component.rooms()[0]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const cancel = element.querySelector('[data-testid="rooms-delete-cancel"]');
      expect(document.activeElement).toBe(cancel);
    } finally {
      document.body.removeChild(fixture.nativeElement);
    }
  });

  it('keeps the active filter applied after a delete mutates the list', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS }); // Lab A + Hall B
    fixture.detectChanges();

    component.filterQuery.set('lab'); // matches Lab A only
    fixture.detectChanges();
    expect(renderedRoomNames()).toEqual(['Lab A']);

    // Delete the one matching room; the refetch returns only Hall B.
    component.onDeleteClicked(component.rooms()[0]); // room-1 / Lab A
    fixture.detectChanges();
    component.onConfirmDelete();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    httpMock
      .expectOne(ROOMS_URL)
      .flush({ rooms: [{ id: 'room-2', name: 'Hall B', capacity: 120 }] });
    fixture.detectChanges();

    // The filter is still applied: Hall B does not match "lab", so the DISTINCT
    // no-match state renders, never the "no rooms yet" empty state.
    expect(component.filterQuery()).toBe('lab');
    expect(element.querySelector('[data-testid="rooms-no-match"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="rooms-empty"]')).toBeNull();
  });

  it('has no critical or serious WCAG violations with the controls and an open confirm', async () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    component.onDeleteClicked(component.rooms()[0]); // render the confirm dialog
    fixture.detectChanges();
    const results = await axe.run(element);
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);
  });

  it('confirming a delete with nothing selected is a no-op (guard)', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();
    // No confirm is open → the guard returns before any request.
    component.onConfirmDelete();
    httpMock.expectNone((r) => r.method === 'DELETE');
    expect(component.deleteSubmitting()).toBe(false);
  });

  it('ignores a second confirm click while a delete is already in flight', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onDeleteClicked(component.rooms()[0]);
    fixture.detectChanges();

    component.onConfirmDelete(); // starts the delete (in flight)
    const del = httpMock.expectOne(
      (r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE',
    );
    component.onConfirmDelete(); // must NOT fire a second DELETE
    httpMock.expectNone((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE');

    del.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    httpMock.expectOne(ROOMS_URL).flush({ rooms: [] });
  });

  // A plain-string error body must render on the alert (not just JSON bodies).
  it('renders a plain-string error body on the edit alert', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onEditClicked(component.rooms()[0]);
    component.editName.set('Retry');
    component.editCapacity.set('3');
    fixture.detectChanges();

    component.onEditSubmit();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'PATCH')
      .flush('capacity is too low', { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-edit-error"]');
    expect(err?.textContent).toContain('capacity is too low');
    expect(err?.textContent).toContain('400');
  });

  // A transport-level failure (status 0) renders without a bogus "0:" prefix.
  it('renders a network (status 0) delete error without a status prefix', () => {
    httpMock.expectOne(ROOMS_URL).flush({ rooms: STUB_ROOMS });
    fixture.detectChanges();

    component.onDeleteClicked(component.rooms()[0]);
    fixture.detectChanges();

    component.onConfirmDelete();
    httpMock
      .expectOne((r) => r.url === `${ROOMS_URL}/room-1` && r.method === 'DELETE')
      .error(new ProgressEvent('network error'));
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="rooms-delete-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).not.toContain('0:');
    // The confirm stays open so the operator can retry.
    expect(element.querySelector('[data-testid="rooms-delete-confirm"]')).not.toBeNull();
  });
});
