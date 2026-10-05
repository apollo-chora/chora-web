/**
 * CourseContentService — CHO-1612.
 *
 * Shared BFF adapter for the heterogeneous course curriculum API.
 * Used by both:
 *   - A+ CourseLearnComponent (learner path: getMyCourseContent)
 *   - R+ CourseContentEditorComponent (authoring path: listContent /
 *     addItem / removeItem / reorder)
 *
 * All calls go through `BffClientService` per chora-web CLAUDE.md §3.
 *
 * Backend routes (per CHO-1612 contract):
 *   GET    /api/v1/me/courses/{courseId}/content          (learner, auth-scoped)
 *   GET    /api/v1/courses/{courseId}/content             (instructor, tenant-scoped)
 *   POST   /api/v1/courses/{courseId}/content             (instructor add-item)
 *   POST   /api/v1/courses/{courseId}/content/reorder     (instructor reorder)
 *   DELETE /api/v1/courses/{courseId}/content/{itemId}    (instructor remove)
 *
 * All mutating endpoints return the full `CourseContentResponse` envelope
 * so callers can replace local state without a follow-up GET.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  AddCourseContentItemRequest,
  ContentUploadUrl,
  CourseContentResponse,
  LearnerModuleProgressResponse,
  MintContentUploadUrlRequest,
} from './course-content.model';

@Injectable({ providedIn: 'root' })
export class CourseContentService {
  private readonly bff = inject(BffClientService);
  // Direct HttpClient for the raw PUT to the GCS signed URL — that URL is
  // absolute (https://storage.googleapis.com/...), so the auth interceptor's
  // isGatewayRequest() check passes it through untouched (no Bearer, no
  // BFF base-URL wrap). See core/interceptors/auth.interceptor.ts.
  private readonly http = inject(HttpClient);

  // ── Learner read ──────────────────────────────────────────────────────

  /**
   * Learner-facing curriculum read.
   * GET /api/v1/me/courses/{courseId}/content
   *
   * Auth context is derived from the session JWT the gateway stamps;
   * no tenant or GCID query param is needed.
   */
  getMyCourseContent(courseId: string): Observable<CourseContentResponse> {
    return this.bff.get<CourseContentResponse>(
      `/api/v1/me/courses/${encodeURIComponent(courseId)}/content`,
    );
  }

  /**
   * The current learner's per-module completion for a course (W7, CHO-2074).
   * GET /api/v1/me/module-progress?course_id= — course-only + enrolment-gated
   * (A+ has no offeringId). Returns each module's {total, completed_count,
   * is_complete}; empty modules[] when the course has no module structure.
   */
  getMyModuleProgress(courseId: string): Observable<LearnerModuleProgressResponse> {
    return this.bff.get<LearnerModuleProgressResponse>(
      '/api/v1/me/module-progress',
      new HttpParams().set('course_id', courseId),
    );
  }

  // ── Authoring reads + mutations ───────────────────────────────────────

  /**
   * Instructor-facing curriculum read (includes draft items).
   * GET /api/v1/courses/{courseId}/content
   */
  listContent(courseId: string): Observable<CourseContentResponse> {
    return this.bff.get<CourseContentResponse>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/content`,
    );
  }

  /**
   * Append a new curriculum item.
   * POST /api/v1/courses/{courseId}/content
   * Body: { kind, ref, title }
   * Returns the full updated CourseContentResponse.
   */
  addItem(
    courseId: string,
    item: AddCourseContentItemRequest,
  ): Observable<CourseContentResponse> {
    return this.bff.post<CourseContentResponse>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/content`,
      item,
    );
  }

  /**
   * Remove a curriculum item.
   * DELETE /api/v1/courses/{courseId}/content/{itemId}
   * Returns the full updated CourseContentResponse.
   */
  removeItem(
    courseId: string,
    itemId: string,
  ): Observable<CourseContentResponse> {
    return this.bff.delete<CourseContentResponse>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/content/${encodeURIComponent(itemId)}`,
    );
  }

  /**
   * Persist a new item order.
   * POST /api/v1/courses/{courseId}/content/reorder
   * Body: { ordered_item_ids: string[] }
   * Returns the full updated CourseContentResponse.
   */
  reorder(
    courseId: string,
    orderedItemIds: readonly string[],
  ): Observable<CourseContentResponse> {
    return this.bff.post<CourseContentResponse>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/content/reorder`,
      { ordered_item_ids: orderedItemIds },
    );
  }

  // ── Media upload (L3 / CHO-1793) ──────────────────────────────────────

  /**
   * Mint a V4 signed PUT URL for a video/PDF/image upload.
   * POST /api/v1/courses/{courseId}/content/upload-url
   * The FE then PUTs the bytes to `upload_url` and attaches `object_ref`
   * (a gs:// URI) as the content item `ref`.
   */
  mintUploadUrl(
    courseId: string,
    req: MintContentUploadUrlRequest,
  ): Observable<ContentUploadUrl> {
    return this.bff.post<ContentUploadUrl>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/content/upload-url`,
      req,
    );
  }

  /**
   * PUT the raw bytes directly to the GCS signed URL. The URL is absolute, so
   * the auth interceptor does NOT attach a Bearer token (the BFF never proxies
   * the binary). Content-Type MUST match the mime declared at mint time.
   */
  uploadToSignedUrl(uploadUrl: string, file: File): Observable<unknown> {
    return this.http.put(uploadUrl, file, {
      headers: new HttpHeaders({
        'Content-Type': file.type || 'application/octet-stream',
      }),
    });
  }
}
