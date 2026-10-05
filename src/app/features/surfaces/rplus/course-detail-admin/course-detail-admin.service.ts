/**
 * CourseDetailAdminService — per-course admin drill-down (real BFF wiring).
 *
 * Calls GET /api/v1/courses/{courseId} on the BFF which proxies to
 * chora-delivery's CJ#2 detail handler (handleCJ2CourseGet, RLS-scoped
 * to the current tenant via the validated mesh claims the gateway
 * stamps).
 *
 * Backend Course shape exposes: id / title / description / state /
 * author_gcid / instructor_gcids / test_set_ids / price_sgd_cents /
 * sf_eligible / created_at / updated_at + optional scheduled_open_at /
 * review_notes / published_at.
 *
 * The FE CourseDetailAdmin model expects atoms[] / cohorts[] /
 * enrolledLearners[] / kpis (enrolled/completed/avgScore) — none of
 * these are returned by the current backend. They default to empty
 * arrays + zero KPIs per feedback_no_stubs_real_wiring; the UI renders
 * empty-state sections clearly rather than faked fixtures. Wave 5
 * will fan-out to additional endpoints (rosters / metrics) when the
 * backend handlers land in Stage C / D of the R+ plan.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  CourseDetailAdmin,
  CourseStatus,
} from './course-detail-admin.model';

interface BackendCourse {
  readonly id: string;
  readonly tenant_id?: string;
  readonly title: string;
  readonly description?: string;
  readonly state: 'DRAFT' | 'AWAITING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  readonly author_gcid?: string;
  readonly instructor_gcids?: readonly string[];
  readonly test_set_ids?: readonly string[];
  readonly price_sgd_cents?: number;
  readonly sf_eligible?: boolean;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly scheduled_open_at?: string;
  readonly review_notes?: string;
  readonly published_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CourseDetailAdminService {
  private readonly bff = inject(BffClientService);

  getCourse(courseId: string): Observable<CourseDetailAdmin> {
    return this.bff
      .get<BackendCourse>(`/api/v1/courses/${encodeURIComponent(courseId)}`)
      .pipe(map(mapBackendCourseDetail));
  }
}

function mapBackendCourseDetail(c: BackendCourse): CourseDetailAdmin {
  return {
    courseId: c.id,
    title: c.title,
    code: deriveCode(c.title),
    version: 'v1',
    status: mapStatus(c.state),
    author: c.author_gcid ?? '–',
    summary: c.description ?? '',
    kpis: { enrolled: 0 },
    enrolledLearners: [],
  };
}

function mapStatus(s: BackendCourse['state']): CourseStatus {
  switch (s) {
    case 'DRAFT':
      return 'Draft';
    case 'AWAITING_REVIEW':
      // Per-course review/release now lives on THIS detail page (was the
      // global sidebar queue) — surface the real AWAITING_REVIEW state
      // rather than collapsing it into 'Draft'.
      return 'Awaiting Review';
    case 'PUBLISHED':
      return 'Published';
    case 'ARCHIVED':
      return 'Archived';
  }
}

function deriveCode(title: string): string {
  const words = title.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w));
  if (words.length >= 2) {
    return words
      .map((w) => w[0]!)
      .join('')
      .slice(0, 8)
      .toUpperCase();
  }
  return title.slice(0, 8).toUpperCase();
}
