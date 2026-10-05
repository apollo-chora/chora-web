/**
 * CourseContentEditorComponent — R+ authoring panel. CHO-1612.
 *
 * Instructor-facing course curriculum editor at
 *   /r/catalog/:courseId/content
 *
 * Features:
 *  - Load and display the ordered item list (all 6 kinds)
 *  - Add a new item via a kind dropdown + ref + title form
 *  - Remove an item (with optimistic local removal)
 *  - Reorder items via up/down buttons (keyboard + Alt+Arrow parity)
 *    — commits to the backend on every move via POST .../reorder
 *
 * Load states: loading → ready | empty | error.
 * Mutation states tracked per-operation to prevent double-submit.
 *
 * Per [[feedback-no-stubs-real-wiring]] — all mutations call the BFF;
 * no in-memory fakes. The `CourseContentService` is the sole adapter.
 *
 * Tablet-first: the add-form collapses to a single-column stack on
 * ≥768px primary viewport; the item list uses a grid row at ≥1280px.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChoraEntityPickerComponent } from '../../../../shared/components/chora-entity-picker/entity-picker.component';
import type {
  EntityRef,
  EntitySearchPort,
  EntityType,
} from '../../../../shared/components/chora-entity-picker/entity-picker.model';
import { AtomEntitySearchPort } from '../offerings/adapters/atom-entity-search.port';
import { TestSetEntitySearchPort } from '../offerings/adapters/test-set-entity-search.port';
import { LiveQuizEntitySearchPort } from '../offerings/adapters/live-quiz-entity-search.port';
import { CourseContentService } from '../../../shared/course-content/course-content.service';
import {
  COURSE_MEDIA_MIME_BY_KIND,
  contentKindIcon,
  reorderItems,
} from '../../../shared/course-content/course-content.model';
import type {
  ContentKind,
  CourseContentItem,
  AddCourseContentItemRequest,
} from '../../../shared/course-content/course-content.model';

/** All supported content kinds — drives the dropdown. */
const ALL_KINDS: readonly ContentKind[] = [
  'atom',
  'video',
  'youtube',
  'document',
  'live_classroom',
  'assessment',
];

type EditorLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: readonly CourseContentItem[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

@Component({
  selector: 'chora-rplus-course-content-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, ChoraEntityPickerComponent],
  templateUrl: './course-content-editor.component.html',
  styleUrl: './course-content-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseContentEditorComponent implements OnInit {
  private readonly contentService = inject(CourseContentService);
  private readonly destroyRef = inject(DestroyRef);
  // CHO-2346: the same three real search adapters the offering workspace
  // curriculum tab uses (CHO-2134). Root-provided, so no extra wiring.
  private readonly atomSearch = inject(AtomEntitySearchPort);
  private readonly testSetSearch = inject(TestSetEntitySearchPort);
  private readonly liveQuizSearch = inject(LiveQuizEntitySearchPort);

  /** Route param wired via `withComponentInputBinding()`. */
  readonly courseId = input.required<string>();

  // ── Data state ────────────────────────────────────────────────────────

  private readonly _state = signal<EditorLoadState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isReady = computed(() => this._state().status === 'ready');
  readonly isEmpty = computed(() => this._state().status === 'empty');
  readonly isError = computed(() => this._state().status === 'error');

  /** In-memory reordering override — null means use server order. */
  private readonly _localItems = signal<readonly CourseContentItem[] | null>(
    null,
  );

  readonly items = computed<readonly CourseContentItem[]>(() => {
    const local = this._localItems();
    if (local !== null) return local;
    const s = this._state();
    return s.status === 'ready' ? s.items : [];
  });

  readonly errorMessage = computed<string>(() => {
    const s = this._state();
    return s.status === 'error' ? s.message : '';
  });

  // ── Add-item form state ───────────────────────────────────────────────

  /** All kinds exposed for template iteration. */
  readonly allKinds = ALL_KINDS;

  readonly addForm = signal<AddCourseContentItemRequest>({
    kind: 'atom',
    ref: '',
    title: '',
  });

  readonly addPending = signal(false);
  readonly addError = signal<string | null>(null);

  // ── Ref entity picker (CHO-2346) ──────────────────────────────────────
  //
  // Three of the six kinds carry an OPAQUE id, not a URL: atom, assessment
  // (stored as the reusable TestSet id) and live_classroom (the LiveQuiz
  // template id). Demanding those as hand-typed UUIDv7 made the form
  // unusable (an instructor cannot know an atom_id), so courses were built
  // with zero atoms, and chora-consumption derives a learner's LearningPath
  // from kind=atom items ONLY. A 0-atom course therefore never progresses,
  // never completes and never certificates. Mirrors the offering workspace.

  /** The entity kind picked by name; `null` keeps the plain URL text field. */
  private readonly refPickedSignal = signal<EntityRef | null>(null);

  readonly refPickerType = computed<EntityType | null>(() => {
    switch (this.addForm().kind) {
      case 'atom':
        return 'atom';
      case 'assessment':
        return 'testset';
      case 'live_classroom':
        return 'live_quiz';
      default:
        return null;
    }
  });

  /** The search adapter matching the picker type (single override source). */
  readonly refSearchPort = computed<EntitySearchPort | null>(() => {
    switch (this.refPickerType()) {
      case 'atom':
        return this.atomSearch;
      case 'testset':
        return this.testSetSearch;
      case 'live_quiz':
        return this.liveQuizSearch;
      default:
        return null;
    }
  });

  /** Selected entity as the picker's `value` (keeps the picked name shown). */
  readonly refPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.refPickedSignal();
    return picked ? [picked] : [];
  });

  /** A name-picked entity supplies the opaque id the BE stores as `ref`. */
  onRefPicked(ref: EntityRef): void {
    this.refPickedSignal.set(ref);
    this.addForm.update((f) => ({ ...f, ref: ref.id }));
    this.addError.set(null);
  }

  // ── Media upload state (L3 / CHO-1793) ────────────────────────────────

  readonly uploadPending = signal(false);
  readonly uploadError = signal<string | null>(null);
  /** Name of the last successfully-uploaded file (drives the "✓ Uploaded" chip). */
  readonly uploadedFileName = signal<string | null>(null);

  /** True for kinds whose ref can be an uploaded blob (video/document). */
  readonly isUploadKind = computed<boolean>(() => {
    const k = this.addForm().kind;
    return k === 'video' || k === 'document';
  });

  /** `accept` attribute for the file picker, per the current kind. */
  readonly acceptAttr = computed<string>(() => {
    const k = this.addForm().kind;
    if (k === 'video') return COURSE_MEDIA_MIME_BY_KIND.video.join(',');
    if (k === 'document') return COURSE_MEDIA_MIME_BY_KIND.document.join(',');
    return '';
  });

  // ── Mutation state ────────────────────────────────────────────────────

  /** IDs of items currently being deleted (shows spinner on that row). */
  readonly removingIds = signal<ReadonlySet<string>>(new Set());

  /** Reorder operation in-flight — disables all up/down buttons. */
  readonly reorderPending = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this._state.set({ status: 'loading' });
    this._localItems.set(null);
    this.contentService
      .listContent(this.courseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res.items.length === 0) {
            this._state.set({ status: 'empty' });
          } else {
            this._state.set({ status: 'ready', items: res.items });
          }
        },
        error: () => {
          this._state.set({
            status: 'error',
            message: 'rplus.courseContentEditor.error_load',
          });
        },
      });
  }

  // ── Add-item form mutations ───────────────────────────────────────────

  updateKind(kind: ContentKind): void {
    // Switching kind INVALIDATES the ref: an atom_id is not a URL and a URL is
    // not an atom_id. Clearing it stops a stale id being posted under the new
    // kind (CHO-2346).
    this.addForm.update((f) => ({ ...f, kind, ref: '' }));
    this.refPickedSignal.set(null);
    // Switching kind clears any prior upload context (the ref no longer applies).
    this.uploadedFileName.set(null);
    this.uploadError.set(null);
  }

  updateRef(ref: string): void {
    this.addForm.update((f) => ({ ...f, ref }));
  }

  /**
   * File-picker handler for video/document kinds: mint a signed URL, PUT the
   * bytes directly to GCS, then set the form `ref` to the returned gs://
   * object_ref (and default the title to the filename if blank).
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.uploadError.set(null);
    this.uploadedFileName.set(null);
    this.uploadPending.set(true);
    this.contentService
      .mintUploadUrl(this.courseId(), {
        mime: file.type,
        size_bytes: file.size,
        filename: file.name,
      })
      .pipe(
        switchMap((minted) =>
          this.contentService
            .uploadToSignedUrl(minted.upload_url, file)
            .pipe(map(() => minted)),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (minted) => {
          this.uploadPending.set(false);
          this.uploadedFileName.set(file.name);
          this.addForm.update((f) => ({
            ...f,
            ref: minted.object_ref,
            title: f.title.trim() || file.name,
          }));
        },
        error: () => {
          this.uploadPending.set(false);
          this.uploadError.set('rplus.courseContentEditor.upload_error');
        },
      });
    // Allow re-selecting the same file (clears the input value).
    input.value = '';
  }

  updateTitle(title: string): void {
    this.addForm.update((f) => ({ ...f, title }));
  }

  submitAddItem(): void {
    const form = this.addForm();
    if (!form.ref.trim() || !form.title.trim()) {
      this.addError.set('rplus.courseContentEditor.add_error_required');
      return;
    }
    this.addError.set(null);
    this.addPending.set(true);
    this.contentService
      .addItem(this.courseId(), form)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.addPending.set(false);
          this._localItems.set(null);
          this._state.set({ status: 'ready', items: res.items });
          // Reset the form ref/title but keep the selected kind.
          this.addForm.update((f) => ({ ...f, ref: '', title: '' }));
          this.refPickedSignal.set(null);
          this.uploadedFileName.set(null);
        },
        error: () => {
          this.addPending.set(false);
          this.addError.set('rplus.courseContentEditor.add_error_server');
        },
      });
  }

  // ── Remove ─────────────────────────────────────────────────────────────

  removeItem(itemId: string): void {
    this.removingIds.update((s) => {
      const next = new Set(s);
      next.add(itemId);
      return next;
    });
    this.contentService
      .removeItem(this.courseId(), itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.removingIds.update((s) => {
            const next = new Set(s);
            next.delete(itemId);
            return next;
          });
          this._localItems.set(null);
          if (res.items.length === 0) {
            this._state.set({ status: 'empty' });
          } else {
            this._state.set({ status: 'ready', items: res.items });
          }
        },
        error: () => {
          this.removingIds.update((s) => {
            const next = new Set(s);
            next.delete(itemId);
            return next;
          });
        },
      });
  }

  // ── Reorder ───────────────────────────────────────────────────────────

  /**
   * Move an item one position up (-1) or down (+1).
   * Immediately applies the local order so the UI snaps; then persists
   * to the backend and replaces the optimistic state with the server
   * response.
   */
  moveItem(itemId: string, delta: -1 | 1): void {
    if (this.reorderPending()) return;
    const current = this.items();
    const next = reorderItems(current, itemId, delta);
    if (next === current) return; // already at boundary

    // Optimistic local update
    this._localItems.set(next);

    this.reorderPending.set(true);
    const orderedIds = next.map((it) => it.item_id);
    this.contentService
      .reorder(this.courseId(), orderedIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.reorderPending.set(false);
          this._localItems.set(null);
          this._state.set({ status: 'ready', items: res.items });
        },
        error: () => {
          // Roll back to server order on failure
          this.reorderPending.set(false);
          this._localItems.set(null);
        },
      });
  }

  /** Keyboard handler: Alt+ArrowUp / Alt+ArrowDown reorder parity. */
  onItemKey(event: KeyboardEvent, itemId: string): void {
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveItem(itemId, -1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveItem(itemId, 1);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** FontAwesome icon class for a content kind. */
  icon(kind: ContentKind): string {
    return contentKindIcon(kind);
  }

  /** Translation key for the kind label in the item row. */
  kindLabelKey(kind: ContentKind): string {
    return `rplus.courseContentEditor.kind_${kind}`;
  }

  /**
   * Translation key for the ref field label, per kind.
   *
   * A picker kind gets a NAME label ("Atom"), not the raw-id label
   * ("Atom ID (UUIDv7)") the free-text field used: with a name search there is
   * no UUID for the instructor to supply, so the old label described a control
   * that is no longer there (CHO-2346).
   */
  refLabelKey(kind: ContentKind): string {
    const picker = kind === 'atom' || kind === 'assessment' || kind === 'live_classroom';
    const prefix = picker ? 'ref_label_pick_' : 'ref_label_';
    return `rplus.courseContentEditor.${prefix}${kind}`;
  }

  /** Placeholder text key for the ref input, per kind. */
  refPlaceholderKey(kind: ContentKind): string {
    return `rplus.courseContentEditor.ref_placeholder_${kind}`;
  }

  isRemovingItem(itemId: string): boolean {
    return this.removingIds().has(itemId);
  }
}
