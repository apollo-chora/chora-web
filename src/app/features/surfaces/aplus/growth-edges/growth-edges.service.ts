import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';

/**
 * A+ Growth Edges (Epic-1b W8) — the learner-facing model of "where you're
 * shaky and can grow next". The internal/instructor term is "weakness"; the
 * learner surface frames it as a Growth Edge (curiosity-first). Backed by
 * chora-consumption /v1/me/growth-edges, reached via the gateway BFF at
 * /api/v1/me/growth-edges (see chora-contracts/openapi/consumption-growth-edges.yaml).
 */

import type { WeaknessReviewPanel } from '../growth-edge-review/weakness-review.models';

export type GrowthEdgeStatus = 'active' | 'grown';
export type GrowthEdgeSource = 'explicit' | 'derived' | 'classroom';
export type GrowthEdgeUploadKind = 'marked_test' | 'notes' | 'scribble';
export type GrowthEdgeUploadStatus =
  | 'QUEUED'
  | 'ANALYZING'
  // ADR-205 D4: the graduated (graph-mode) crew parks at a bounded HITL
  // interrupt. synthesize_edges runs only AFTER the learner resumes, so this is
  // a SUCCESSFUL run waiting on them, never a failure.
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'FAILED';
export type GrowthEdgeSort =
  | 'strength_desc'
  | 'last_evidenced_desc'
  | 'first_seen_desc';

export interface GrowthEdgeSampleWrong {
  readonly prompt: string;
  readonly why_wrong: string;
}

export interface GrowthEdgeDescriptor {
  readonly summary?: string;
  readonly misconceptions?: string[];
  readonly suggested_angles?: string[];
  readonly sample_wrong?: GrowthEdgeSampleWrong[];
}

export interface GrowthEdge {
  readonly id: string;
  readonly concept_key: string;
  readonly concept_label: string;
  readonly category?: string;
  readonly tags: string[];
  readonly topic_id?: string;
  /** How shaky: 1 = very weak, 0 = mastered. */
  readonly strength: number;
  readonly sources: GrowthEdgeSource[];
  readonly descriptor: GrowthEdgeDescriptor;
  readonly cached_drill_atom_ids: string[];
  /** 'grown' = mastered + soft-archived (kept for KG history). */
  readonly status: GrowthEdgeStatus;
  readonly first_seen_at: string;
  readonly last_evidenced_at: string;
}

export interface GrowthEdgesPage {
  readonly items: GrowthEdge[];
  readonly next_page_token?: string;
}

export interface GrowthEdgeUploadJob {
  readonly upload_id: string;
  readonly status: GrowthEdgeUploadStatus;
  /** Present on COMPLETED (may be empty if nothing weak was detected). */
  readonly upserted_growth_edge_ids?: string[];
  /** Present on FAILED (non-leaky). */
  readonly failure_reason?: string;
  /**
   * Present ONLY while AWAITING_REVIEW (chora-consumption status-gates it so a
   * stale panel never rides a terminal state). Typed off the review feature's
   * canonical model rather than redeclared here: two hand-maintained copies of
   * one wire shape is how these drift.
   */
  readonly review?: WeaknessReviewPanel;
}

/**
 * One diagnosis parked at the bounded HITL review interrupt, as the collection
 * serves it (`growth_edge_pending_reviews.go:28-35`). A trimmed projection, not
 * the whole job: the blob URI, the shred marker and the upserted edge ids are
 * none of a list row's business.
 *
 * `status` is typed as the wire enum but read defensively downstream: the resume
 * path casts an arbitrary string into this shape, so the type is a statement of
 * intent rather than evidence about what can arrive.
 */
export interface PendingReviewItem {
  readonly upload_id: string;
  readonly upload_kind: string;
  readonly status: string;
  /** Present when the diagnosis was raised against a specific map (= Goal). */
  readonly goal_id?: string;
  readonly created_at: string;
  /** The panel the learner will decide on; present while AWAITING_REVIEW. */
  readonly review?: WeaknessReviewPanel;
}

export interface ListGrowthEdgesParams {
  readonly min_strength?: number;
  readonly include_grown?: boolean;
  readonly sort?: GrowthEdgeSort;
  readonly page_size?: 10 | 20 | 50 | 100;
  readonly page_token?: string;
}

@Injectable({ providedIn: 'root' })
export class GrowthEdgesService {
  private readonly bff = inject(BffClientService);
  private static readonly BASE = '/api/v1/me/growth-edges';
  /** Safety bound on listAll's page-follow loop (per-learner edge counts are
   * small; the backend already rolls up — this only guards a pathological
   * never-ending cursor). */
  private static readonly MAX_PAGES = 100;

  /** GET /api/v1/me/growth-edges — a filtered/sorted page of Growth Edges. */
  list(params: ListGrowthEdgesParams = {}): Observable<GrowthEdgesPage> {
    let hp = new HttpParams();
    if (params.min_strength != null) {
      hp = hp.set('min_strength', String(params.min_strength));
    }
    if (params.include_grown != null) {
      hp = hp.set('include_grown', String(params.include_grown));
    }
    if (params.sort) {
      hp = hp.set('sort', params.sort);
    }
    if (params.page_size != null) {
      hp = hp.set('page_size', String(params.page_size));
    }
    if (params.page_token) {
      hp = hp.set('page_token', params.page_token);
    }
    return this.bff.get<GrowthEdgesPage>(GrowthEdgesService.BASE, hp);
  }

  /**
   * Fetches EVERY Growth Edge by following `next_page_token` to its end and
   * accumulating the items into a single page. The backend rolls up
   * near-duplicate edges at read time; this just makes the FE walk all pages so
   * edges beyond the first page are no longer unreachable. Emits once, with all
   * items and no token. The per-page filters/sort are carried forward unchanged.
   */
  listAll(params: ListGrowthEdgesParams = {}): Observable<GrowthEdgesPage> {
    return this.list(params).pipe(
      expand((page, depth) =>
        page.next_page_token && depth < GrowthEdgesService.MAX_PAGES - 1
          ? this.list({ ...params, page_token: page.next_page_token })
          : EMPTY,
      ),
      reduce<GrowthEdgesPage, GrowthEdge[]>(
        (acc, page) => acc.concat(page.items),
        [],
      ),
      map((items) => ({ items })),
    );
  }

  /** GET /api/v1/me/growth-edges/{id}. */
  read(id: string): Observable<GrowthEdge> {
    return this.bff.get<GrowthEdge>(`${GrowthEdgesService.BASE}/${id}`);
  }

  /** DELETE /api/v1/me/growth-edges/{id} — dismiss (soft-delete, idempotent). */
  dismiss(id: string): Observable<void> {
    return this.bff.delete<void>(`${GrowthEdgesService.BASE}/${id}`);
  }

  /**
   * POST /api/v1/me/growth-edges/uploads — multipart upload of a marked-up
   * past test / notes / scribble for async multimodal analysis. Returns 202 +
   * a QUEUED job. Do NOT set Content-Type — the browser stamps the multipart
   * boundary (the gateway forwards it verbatim).
   *
   * `goalId` scopes the diagnosis to a whole goal (map): chora-consumption
   * resolves each detected weakness against the goal's concept set at ingest
   * (ADR-238 D1), so a marked test spanning sibling concepts lands where the
   * edges belong. `conceptId` is a SOFT emphasis/hint only (ADR-238 D2) — the
   * entry concept biases ranking, it never hard-filters off-concept weaknesses.
   * Both are appended only when present, so pre-ADR-238 callers are unchanged.
   */
  upload(
    file: File,
    kind: GrowthEdgeUploadKind,
    contextHint?: string,
    goalId?: string,
    conceptId?: string,
  ): Observable<GrowthEdgeUploadJob> {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_kind', kind);
    if (contextHint?.trim()) {
      form.append('context_hint', contextHint.trim());
    }
    if (goalId?.trim()) {
      form.append('goal_id', goalId.trim());
    }
    if (conceptId?.trim()) {
      form.append('concept_id', conceptId.trim());
    }
    return this.bff.post<GrowthEdgeUploadJob>(
      `${GrowthEdgesService.BASE}/uploads`,
      form,
    );
  }

  /**
   * GET /api/v1/me/growth-edges/uploads?status=awaiting_review — the learner's
   * diagnoses parked at the bounded HITL interrupt (ADR-205 D4).
   *
   * The status filter is FIXED here, not a parameter. The collection is read
   * only as `?status=awaiting_review`: the handler REFUSES a bare GET
   * (`growth_edge_pending_reviews.go:59`) because answering one would be the
   * learner's whole upload history, a much larger read nothing renders. Making
   * it a caller's choice would only offer callers a way to get it wrong.
   *
   * Goal scoping is the CALLER's, on `goal_id` in each row, because the
   * collection takes no goal parameter.
   */
  listAwaitingReview(): Observable<readonly PendingReviewItem[]> {
    return this.bff
      .get<{ items?: PendingReviewItem[] }>(
        `${GrowthEdgesService.BASE}/uploads`,
        new HttpParams().set('status', 'awaiting_review'),
      )
      .pipe(map((res) => res.items ?? []));
  }

  /** GET /api/v1/me/growth-edges/uploads/{id} — poll the async analysis. */
  pollUpload(uploadId: string): Observable<GrowthEdgeUploadJob> {
    return this.bff.get<GrowthEdgeUploadJob>(
      `${GrowthEdgesService.BASE}/uploads/${uploadId}`,
    );
  }
}
