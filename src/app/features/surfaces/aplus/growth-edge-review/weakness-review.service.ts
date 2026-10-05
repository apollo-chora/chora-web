import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  WeaknessReviewPanel,
  StructuredClues,
  WeaknessReviewDecision,
  WeaknessUploadJob,
  WeaknessUploadKind,
} from './weakness-review.models';

/**
 * WeaknessReviewService — the BFF adapter for the graduated Growth-Edge HITL
 * crew (ADR-205 WS-8). Isolated from the LIVE single-shot `GrowthEdgesService`
 * so the dark feature can be cut over (or removed) without touching the live
 * upload path. Three calls:
 *
 *   1. `upload`     — POST /api/v1/me/growth-edges/uploads (multipart + the
 *                     additive `structured_clues` JSON part) → 202 QUEUED.
 *   2. `pollUpload` — GET  /api/v1/me/growth-edges/uploads/{id} → the job; when
 *                     `AWAITING_REVIEW` it carries the HITL `review` panel.
 *   3. `resume`     - POST /api/v1/me/growth-edges/uploads/{id}/resume with the
 *                     bounded `WeaknessReviewDecision` (the `Command(resume=…)`
 *                     payload). This is the GATEWAY path; the gateway forwards
 *                     to the orchestrator and returns ITS shape, which
 *                     `normaliseResumeResponse` maps back onto the job.
 *
 * CONTRACT GAP CLOSED (CHO-2301, 2026-07-20): the resume BFF exists and is
 * mounted at the path above, and `AWAITING_REVIEW` / `review` are live on the
 * consumption upload contract. The area is no longer gated: the panel has a
 * route (`/a/growth-edges/review/:uploadId`) and `featureReadyGuard` is applied
 * to it, so the guard is real rather than decorative. Still no stub and no
 * fixture: every call goes to the real gateway via `BffClientService`.
 */
@Injectable({ providedIn: 'root' })
export class WeaknessReviewService {
  private readonly bff = inject(BffClientService);
  private static readonly UPLOADS = '/api/v1/me/growth-edges/uploads';
  // The GATEWAY path, not the orchestrator-internal one. chora-gateway mounts
  // this under the uploads tree (weakness_resume_handler.go
  // PatternWeaknessResume) and forwards to the orchestrator itself. Pointing at
  // /api/v1/orchestrator/... 404s: nothing in the gateway mounts that prefix.
  private static readonly RESUME = (uploadId: string) =>
    `/api/v1/me/growth-edges/uploads/${uploadId}/resume`;

  /**
   * Upload a weakness document for the graduated multimodal HITL analysis.
   * `structured_clues` is serialised as a single JSON form part (bounded
   * pickers + the screened, DATA-only note); blank/whitespace fields are
   * dropped, and the part is omitted entirely when nothing is set. Do NOT set
   * Content-Type — the browser stamps the multipart boundary (the gateway
   * forwards it verbatim).
   */
  upload(
    file: File,
    kind: WeaknessUploadKind,
    clues: StructuredClues,
  ): Observable<WeaknessUploadJob> {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_kind', kind);
    const cleaned = pruneClues(clues);
    if (cleaned) {
      form.append('structured_clues', JSON.stringify(cleaned));
    }
    return this.bff.post<WeaknessUploadJob>(WeaknessReviewService.UPLOADS, form);
  }

  /** Poll the async job; `AWAITING_REVIEW` carries the HITL `review` panel. */
  pollUpload(uploadId: string): Observable<WeaknessUploadJob> {
    return this.bff.get<WeaknessUploadJob>(
      `${WeaknessReviewService.UPLOADS}/${uploadId}`,
    );
  }

  /**
   * Resume the checkpointed crew with the learner's bounded decisions
   * (`confirm` → synthesize + generate; `reiterate` → re-diagnose under the
   * decisions as constraints). The body IS the `Command(resume=…)` payload.
   */
  resume(
    uploadId: string,
    decision: WeaknessReviewDecision,
  ): Observable<WeaknessUploadJob> {
    return this.bff
      .post<OrchestratorResumeResponse>(
        WeaknessReviewService.RESUME(uploadId),
        decision,
      )
      .pipe(map((raw) => normaliseResumeResponse(uploadId, raw)));
  }
}

/**
 * The RAW orchestrator resume shape, as forwarded VERBATIM by the gateway.
 * Deliberately typed separately from `WeaknessUploadJob`: it is a different
 * contract that happens to describe the same job, and conflating the two is
 * what hid the mismatch below.
 */
interface OrchestratorResumeResponse {
  readonly upload_id?: string;
  /** LOWERCASE: 'awaiting_review' | 'completed' | 'blocked' | 'failed'. */
  readonly status?: string;
  /** The refreshed panel, keyed `panel` here and `review` on the job. */
  readonly panel?: WeaknessReviewPanel | null;
  readonly interrupted?: boolean;
  readonly governance_status?: string | null;
}

/**
 * Map the orchestrator's resume response onto the job shape the panel parses.
 *
 * Two mismatches, both silent: the orchestrator emits a LOWERCASE `status`
 * while the component switches on the uppercase wire enum, and it carries the
 * refreshed panel under `panel` while the job carries it under `review`. A
 * reiterate therefore fell through every case in the component's switch and did
 * nothing at all, with no error to show for it. Normalising here leaves the
 * orchestrator contract untouched for any other consumer.
 */
function normaliseResumeResponse(
  uploadId: string,
  raw: OrchestratorResumeResponse,
): WeaknessUploadJob {
  const status = String(raw?.status ?? '').trim().toUpperCase();
  return {
    upload_id: raw?.upload_id || uploadId,
    // An unrecognised status rides through as-is rather than being defaulted: a
    // default arm here would turn an unknown orchestrator state into a
    // plausible lie about a run the learner paid for.
    status: status as WeaknessUploadJob['status'],
    ...(raw?.panel ? { review: raw.panel } : {}),
  };
}

/**
 * Strip blank/whitespace fields from the structured clues and return `null`
 * when nothing meaningful remains — so the upload omits an empty
 * `structured_clues` part rather than sending `{}`.
 */
function pruneClues(clues: StructuredClues): StructuredClues | null {
  const out: Record<string, string> = {};
  const trimmed = (v: string | undefined): string => (v ?? '').trim();
  if (trimmed(clues.subject)) out['subject'] = trimmed(clues.subject);
  if (trimmed(clues.level)) out['level'] = trimmed(clues.level);
  if (clues.confidence) out['confidence'] = clues.confidence;
  if (trimmed(clues.note)) out['note'] = trimmed(clues.note);
  return Object.keys(out).length > 0 ? (out as StructuredClues) : null;
}
