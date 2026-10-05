/**
 * RoomsComponent - the Campus Operations rooms screen (CHO-2294).
 *
 * This is the destination the campusops card's "Rooms" button has advertised
 * since M15a with no handler behind it. It renders the DURABLE tenant room list
 * (GET /api/v1/rooms, chora_delivery.rooms, mig 0051), which is the same list
 * the offering-workspace Schedule tab picks from: both go through RoomsService,
 * so they cannot drift.
 *
 * TENANT-SCOPED, NOT PER-CAMPUS, and that is deliberate. GET /api/v1/rooms has
 * no campus_id filter (rooms_handler.go lists by tenant), and every room created
 * before this screen existed carries a blank campus_id. A per-campus view would
 * therefore have to fetch everything and filter client-side, and would render
 * empty for every campus. Adding a campus filter is a backend change and is out
 * of scope here.
 *
 * Honest states: loading, error and empty are three DISTINCT renders. The
 * failure this guards against is the one campusops itself shipped, where a dead
 * backend was indistinguishable from a tenant with no rows.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RoomsService } from './rooms.service';
import type { RoomOption } from './rooms.model';

/** Distinct load states so a dead backend never renders as "no rooms yet". */
type LoadState = 'loading' | 'ready' | 'error';

/**
 * Client-side ordering for the rooms list. `default` preserves the server's
 * created_at order (GET /api/v1/rooms is created_at-ordered); the others are a
 * pure view concern and never round-trip to the backend.
 */
type RoomSortMode = 'default' | 'name' | 'capacity';

@Component({
  selector: 'chora-rplus-rooms',
  imports: [TranslatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
})
export class RoomsComponent {
  private readonly roomsService = inject(RoomsService);
  private readonly destroyRef = inject(DestroyRef);

  /** Refetch trigger: a successful create re-reads canonical server state. */
  private readonly reloadKey = signal(0);

  private readonly result = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() =>
        this.roomsService.listRooms().pipe(
          // Map the failure into an explicit sentinel rather than swallowing it
          // to []. `null` here means FAILED, not empty.
          catchError(() => of(null)),
        ),
      ),
    ),
    { initialValue: undefined },
  );

  readonly state = computed<LoadState>(() => {
    const r = this.result();
    if (r === undefined) return 'loading';
    return r === null ? 'error' : 'ready';
  });

  readonly rooms = computed<readonly RoomOption[]>(() => this.result() ?? []);
  readonly totalRooms = computed<number>(() => this.rooms().length);

  // --- Find / organize the list (client-side, no backend) --------------------
  // A management screen with a growing list needs to find + order rooms. This is
  // purely a view over the already-fetched list: it issues NO extra request and
  // never mutates the canonical rooms() signal (sort works on a copy).
  readonly filterQuery = signal('');
  readonly sortMode = signal<RoomSortMode>('default');

  /** True while a non-blank filter is applied (drives the clear button + count). */
  readonly filterActive = computed<boolean>(
    () => this.filterQuery().trim().length > 0,
  );

  /**
   * The rows actually rendered: rooms() filtered by a case-insensitive name
   * substring, then ordered per sortMode. `default` returns the (unsorted)
   * filtered slice verbatim so the server's created_at order is preserved.
   */
  readonly visibleRooms = computed<readonly RoomOption[]>(() => {
    const q = this.filterQuery().trim().toLowerCase();
    const base = this.rooms();
    const filtered = q
      ? base.filter((r) => r.name.toLowerCase().includes(q))
      : base;
    const mode = this.sortMode();
    if (mode === 'default') return filtered;
    // Copy before sorting: never reorder the canonical rooms() array in place.
    const ordered = [...filtered];
    if (mode === 'name') {
      ordered.sort((a, b) => byName(a, b));
    } else {
      // Capacity, most seats first; stable tie-break by name.
      ordered.sort((a, b) => b.capacity - a.capacity || byName(a, b));
    }
    return ordered;
  });

  /** Only offer the filter/sort toolbar for a ready, non-empty list. */
  readonly showToolbar = computed<boolean>(
    () => this.state() === 'ready' && this.rooms().length > 0,
  );

  /**
   * DISTINCT from the empty state: rooms exist, but the active filter matched
   * none. The operator is never told "no rooms yet" when rooms are present.
   */
  readonly noMatches = computed<boolean>(
    () =>
      this.state() === 'ready' &&
      this.rooms().length > 0 &&
      this.visibleRooms().length === 0,
  );

  /** Clear the filter and restore the full list. */
  onClearFilter(): void {
    this.filterQuery.set('');
  }

  // --- Create form state (signal-first, mirrors CampusopsComponent) ----------
  readonly createFormOpen = signal(false);
  readonly formName = signal('');
  readonly formCapacity = signal('');
  readonly submitting = signal(false);
  readonly createError = signal<string | null>(null);

  /**
   * Submit gate mirrors the chora-delivery NewRoom guards (name present,
   * capacity a positive integer) so the button stays disabled for input the
   * backend would reject anyway. Shares {@link isValidRoomInput} with the edit
   * form so create + edit validate identically.
   */
  readonly canSubmit = computed<boolean>(
    () => isValidRoomInput(this.formName(), this.formCapacity()) && !this.submitting(),
  );

  onCreateClicked(): void {
    this.createError.set(null);
    this.createFormOpen.set(true);
  }

  onCancelCreate(): void {
    this.createFormOpen.set(false);
    this.createError.set(null);
    this.formName.set('');
    this.formCapacity.set('');
  }

  onRetry(): void {
    this.reloadKey.update((n) => n + 1);
  }

  onCreateSubmit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.createError.set(null);
    this.roomsService
      .createRoom({
        name: this.formName().trim(),
        capacity: Number(this.formCapacity()),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.onCancelCreate();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          // Stay open so the operator can correct and retry.
          this.submitting.set(false);
          this.createError.set(describeHttpError(err));
        },
      });
  }

  // --- Edit one room (inline, pre-filled) ------------------------------------
  // Opening Edit expands an inline form ON the row, pre-filled with the room's
  // current name + capacity. Submit is a real PATCH /api/v1/rooms/{id}; success
  // refetches canonical server state (never an optimistic local mutation), and a
  // failure (400/403/404) surfaces LOUD with the form left open to correct.
  readonly editingRoomId = signal<string | null>(null);
  readonly editName = signal('');
  readonly editCapacity = signal('');
  readonly editSubmitting = signal(false);
  readonly editError = signal<string | null>(null);

  /** Edit submit gate: same guard as create ({@link isValidRoomInput}). */
  readonly canSubmitEdit = computed<boolean>(
    () =>
      isValidRoomInput(this.editName(), this.editCapacity()) &&
      !this.editSubmitting(),
  );

  onEditClicked(room: RoomOption): void {
    // Only one inline surface at a time: opening Edit closes any delete confirm.
    this.deletingRoomId.set(null);
    this.deleteError.set(null);
    this.editError.set(null);
    this.editName.set(room.name);
    this.editCapacity.set(String(room.capacity));
    this.editingRoomId.set(room.id);
  }

  onCancelEdit(): void {
    this.editingRoomId.set(null);
    this.editError.set(null);
    this.editName.set('');
    this.editCapacity.set('');
  }

  onEditSubmit(): void {
    const id = this.editingRoomId();
    if (id === null || !this.canSubmitEdit()) return;
    this.editSubmitting.set(true);
    this.editError.set(null);
    this.roomsService
      .updateRoom(id, {
        name: this.editName().trim(),
        capacity: Number(this.editCapacity()),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editSubmitting.set(false);
          this.onCancelEdit();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.editSubmitting.set(false);
          this.editError.set(describeHttpError(err));
        },
      });
  }

  // --- Delete one room (in-app confirm, NOT window.confirm) -------------------
  // The blocking native window.confirm is poor UX and cannot be focus-managed,
  // so deletion routes through an in-app, accessible confirmation (role
  // alertdialog, Esc to cancel, focus moved inside on open). Confirm is a real
  // soft-DELETE /api/v1/rooms/{id}; success refetches, a failure surfaces loud.
  readonly deletingRoomId = signal<string | null>(null);
  readonly deleteSubmitting = signal(false);
  readonly deleteError = signal<string | null>(null);

  private readonly deleteConfirm =
    viewChild<ElementRef<HTMLElement>>('deleteConfirm');

  constructor() {
    // Focus-manage the destructive confirm: when it opens, move focus to its
    // cancel button (the safe default for a destructive dialog) so keyboard
    // users land inside it and Esc has somewhere to fire from. Runs whenever the
    // confirm mounts; a no-op when it is closed or (in tests) detached from the
    // document.
    effect(() => {
      const host = this.deleteConfirm()?.nativeElement;
      if (this.deletingRoomId() !== null && host) {
        host.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      }
    });
  }

  onDeleteClicked(room: RoomOption): void {
    // Only one inline surface at a time: opening the confirm closes any edit.
    this.onCancelEdit();
    this.deleteError.set(null);
    this.deletingRoomId.set(room.id);
  }

  onCancelDelete(): void {
    this.deletingRoomId.set(null);
    this.deleteError.set(null);
  }

  onConfirmDelete(): void {
    const id = this.deletingRoomId();
    if (id === null || this.deleteSubmitting()) return;
    this.deleteSubmitting.set(true);
    this.deleteError.set(null);
    this.roomsService
      .deleteRoom(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteSubmitting.set(false);
          this.deletingRoomId.set(null);
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.deleteSubmitting.set(false);
          this.deleteError.set(describeHttpError(err));
        },
      });
  }
}

/**
 * Shared room-input guard: non-blank name + positive-integer capacity. Mirrors
 * the chora-delivery NewRoom guards so neither the create nor the edit submit
 * ever enables input the backend would 400.
 */
function isValidRoomInput(name: string, capacityRaw: string): boolean {
  const cap = Number(capacityRaw);
  return name.trim().length > 0 && Number.isInteger(cap) && cap > 0;
}

/** Case-insensitive room-name comparator (locale-aware A to Z). */
function byName(a: RoomOption, b: RoomOption): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Render an HTTP error as a "<status>: <message>" string for the alert panel. */
function describeHttpError(err: HttpErrorResponse): string {
  const status = err.status ?? 0;
  const body = err.error as { message?: string; error?: string } | string | null;
  let message = err.message || 'Request failed';
  if (body && typeof body === 'object') {
    message = body.message ?? body.error ?? message;
  } else if (typeof body === 'string' && body.trim()) {
    message = body;
  }
  return status ? `${status}: ${message}` : message;
}
