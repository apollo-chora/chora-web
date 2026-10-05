/**
 * CourseContent shared model — CHO-1612.
 *
 * Shape for the heterogeneous course curriculum API:
 *   Learner read:  GET /api/v1/me/courses/{course_id}/content
 *   Admin read:    GET /api/v1/courses/{course_id}/content
 *   Admin mutate:  POST   /api/v1/courses/{course_id}/content
 *                  POST   /api/v1/courses/{course_id}/content/reorder
 *                  DELETE /api/v1/courses/{course_id}/content/{item_id}
 *
 * All shapes are fully readonly — mutation flows through service methods
 * that return a fresh `CourseContentResponse`.
 *
 * `ref` semantics:
 *   - atom / assessment / live_classroom → opaque UUIDv7 of the aggregate
 *   - video / youtube / document         → http(s) URL to the resource
 *
 * Per ddd-enforcement: `LearningAtom` is the primary aggregate root and is
 * referenced by UUID, never owned by the course. The other kinds (video,
 * youtube, document, live_classroom, assessment) are heterogeneous content
 * pointers — the course owns their ordering, not their payloads.
 */

/** The six heterogeneous content item kinds supported by CHO-1612. */
export type ContentKind =
  | 'atom'
  | 'video'
  | 'youtube'
  | 'document'
  | 'live_classroom'
  | 'assessment';

/**
 * A single item in the ordered course curriculum.
 * `position` is 1-based; the backend guarantees no gaps on GET.
 */
export interface CourseContentItem {
  readonly item_id: string;
  readonly kind: ContentKind;
  /**
   * For atom/assessment/live_classroom: a UUIDv7.
   * For video/youtube/document: an http(s) URL. On the read-paths an uploaded
   * `gs://` ref is resolved to a fresh signed GET URL (instructor: chora-delivery
   * inline; learner: BFF-merged from chora-delivery per ADR-185).
   */
  readonly ref: string;
  /**
   * Present only when a `gs://` ref was resolved to a signed `ref` (read-paths):
   * the durable `gs://` URI. Informational/debug; the FE plays/downloads `ref`.
   * ADR-185.
   */
  readonly object_ref?: string;
  readonly title: string;
  readonly position: number;
}

/** Envelope returned by all course-content GET endpoints. */
export interface CourseContentResponse {
  readonly course_id: string;
  readonly items: readonly CourseContentItem[];
}

// ── W7 StudentModuleProgress — A+ learner course-only read (CHO-2074) ──────────

/** The current learner's completion of one module in a course. */
export interface LearnerModuleProgress {
  readonly module_id: string;
  readonly title: string;
  readonly position: number;
  readonly total: number;
  readonly completed_count: number;
  readonly is_complete: boolean;
  readonly completed_at?: string;
}

/** Envelope from GET /api/v1/me/module-progress?course_id=. */
export interface LearnerModuleProgressResponse {
  readonly course_id: string;
  readonly modules: readonly LearnerModuleProgress[];
}

/** Request body for POST /api/v1/courses/{course_id}/content. */
export interface AddCourseContentItemRequest {
  readonly kind: ContentKind;
  readonly ref: string;
  readonly title: string;
}

/**
 * Request body for POST /api/v1/courses/{course_id}/content/upload-url (L3,
 * CHO-1793). Mints a V4 signed PUT URL for a video/PDF/image upload.
 */
export interface MintContentUploadUrlRequest {
  readonly mime: string;
  readonly size_bytes: number;
  readonly filename?: string;
}

/** Response of the upload-url mint — the FE PUTs bytes to `upload_url`, then
 * attaches `object_ref` (a gs:// URI) as the content item `ref`. */
export interface ContentUploadUrl {
  readonly upload_url: string;
  readonly object_ref: string;
  readonly expires_at: string;
  readonly max_size_bytes: number;
}

/**
 * MIME types accepted by the course-media uploader (mirrors the backend
 * ContentUploadMime enum). Used by the editor's file-picker `accept` attr.
 */
export const COURSE_MEDIA_MIME_BY_KIND: Record<'video' | 'document', readonly string[]> = {
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  document: ['application/pdf'],
};

/**
 * Returns true when `ref` is an http(s) URL (video/youtube/document kinds).
 * Atom / assessment / live_classroom refs are UUIDs, not URLs.
 */
export function isUrlRef(kind: ContentKind): boolean {
  return kind === 'video' || kind === 'youtube' || kind === 'document';
}

/**
 * Returns a FontAwesome icon name for each content kind.
 * Used across both the learner curriculum and the authoring editor.
 */
export function contentKindIcon(kind: ContentKind): string {
  switch (kind) {
    case 'atom':
      return 'atom';
    case 'video':
      return 'circle-play';
    case 'youtube':
      return 'brands fa-youtube';
    case 'document':
      return 'file-lines';
    case 'live_classroom':
      return 'chalkboard-user';
    case 'assessment':
      return 'clipboard-check';
  }
}

/**
 * Reorder helper — pure function, mirrors the backend reorder semantics.
 * Moves the item at `fromIndex` to `toIndex` and re-stamps 1-based positions.
 * Returns the input unchanged if indices are identical or out of range.
 */
export function reorderItems(
  items: readonly CourseContentItem[],
  itemId: string,
  delta: -1 | 1,
): readonly CourseContentItem[] {
  const idx = items.findIndex((it) => it.item_id === itemId);
  if (idx < 0) return items;
  const target = Math.max(0, Math.min(items.length - 1, idx + delta));
  if (target === idx) return items;
  const copy = items.slice();
  const [moved] = copy.splice(idx, 1);
  copy.splice(target, 0, moved);
  return copy.map((it, i) => ({ ...it, position: i + 1 }));
}
