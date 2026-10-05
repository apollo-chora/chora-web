/**
 * CatalogService — R+ course catalog provider (real BFF wiring).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService.
 * Calls `GET /api/v1/courses` on chora-gateway which proxies to
 * chora-delivery's CJ#2 list handler (cj2CoursesRootHandler). The
 * downstream filters by the current tenant via the validated mesh
 * claims the gateway stamps, so the FE gets the courses for the
 * current logged-in tenant context automatically.
 *
 * Backend response shape: { items: BackendCourse[] }. Each Course has
 * id / title / description / state / author_gcid / instructor_gcids /
 * test_set_ids / price_sgd_cents / sf_eligible / updated_at + optional
 * scheduled_open_at / review_notes / published_at.
 *
 * Fields the FE CatalogCourse model expects but the backend doesn't
 * expose today (cohortCount / enrolments) default to 0 — the screen
 * renders the genuine value rather than a faked fixture per
 * feedback_no_stubs_real_wiring. atomCount is derived from
 * test_set_ids.length (closest proxy until the LearningPath →
 * LearningAtom join lands). `code` is derived from the title acronym.
 *
 * Read-only. This service used to carry a `create()` POSTing the CJ#2
 * payload to `POST /api/v1/courses`, driving an inline form on the catalog
 * header. CHO-2214 removed it: `CourseService` (rplus/course-authoring) owns
 * that same endpoint behind the full 7-endpoint Course lifecycle, and two
 * adapters onto one endpoint drift. The catalog's Create CTA now navigates to
 * /r/catalog/new instead.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  CatalogCourse,
  CatalogList,
  CatalogStatus,
  CourseStateFilter,
} from './catalog.model';

/**
 * PUBLISHED is the catalog's default storefront view. The CJ#2 list handler
 * (`GET /api/v1/courses`) REQUIRES a `state` query param and 400s without
 * one. The admin can switch the filter to DRAFT / AWAITING_REVIEW / ARCHIVED
 * (J1 / CHO-1829) — `getCatalog(state)` forwards the chosen state. Mirrors the
 * proven `CourseService.listCourses` pattern used by the R+ review queue
 * (`?state=AWAITING_REVIEW&page_size=50`).
 */
const CATALOG_STATE: CourseStateFilter = 'PUBLISHED';
const CATALOG_PAGE_SIZE = 50;

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

interface BackendCoursesList {
  readonly items: readonly BackendCourse[];
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * Fetch the catalog for the current tenant, filtered by course `state`
   * (defaults to PUBLISHED — the storefront view).
   *
   * Sends `?state=<state>&page_size=50` — the CJ#2 list handler requires the
   * `state` param (400s without it). The downstream chora-delivery handler
   * additionally scopes the read to the tenant stamped on the mesh claims
   * (RLS), so no explicit tenant_id query param is sent. A genuinely empty
   * list renders an empty-state in the component; an HTTP failure surfaces a
   * fail-loud error banner (never a silent empty list).
   */
  getCatalog(state: CourseStateFilter = CATALOG_STATE): Observable<CatalogList> {
    const params = new HttpParams()
      .set('state', state)
      .set('page_size', String(CATALOG_PAGE_SIZE));
    return this.bff
      .get<BackendCoursesList>('/api/v1/courses', params)
      .pipe(
        map((resp) => ({
          tenantName: this.tenants.currentTenant()?.name ?? 'Current tenant',
          totalCourses: resp.items.length,
          courses: resp.items.map(mapBackendCourse),
        })),
      );
  }

}

function mapBackendCourse(c: BackendCourse): CatalogCourse {
  return {
    courseId: c.id,
    title: c.title,
    code: deriveCode(c.title),
    summary: c.description ?? '',
    status: mapStatus(c.state),
    atomCount: c.test_set_ids?.length ?? 0,
    owner: c.author_gcid ?? '–',
    lastUpdated: formatRelative(c.updated_at),
  };
}

function mapStatus(s: BackendCourse['state']): CatalogStatus {
  switch (s) {
    case 'DRAFT':
      return 'Draft';
    case 'AWAITING_REVIEW':
      return 'Awaiting Review';
    case 'PUBLISHED':
      return 'Published';
    case 'ARCHIVED':
      return 'Archived';
  }
}

/**
 * Derive a short course code from the title. Takes the first letter of
 * each capitalised word, max 8 chars. Falls back to the first 8 upper-
 * cased chars when no capitalised word is present. Stable for typical
 * course titles like "Certified Scrum Product Owner" → "CSPO".
 */
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

/**
 * Format an ISO timestamp as a short relative-time string for the
 * catalog "last updated" column. Returns "—" when the input is missing.
 */
function formatRelative(iso: string | undefined): string {
  if (!iso) {
    return '–';
  }
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return '–';
  }
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) {
    return 'just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) {
    return `${diffD}d ago`;
  }
  return then.toLocaleDateString();
}
