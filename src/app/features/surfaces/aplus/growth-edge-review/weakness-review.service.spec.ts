import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { WeaknessReviewService } from './weakness-review.service';
import {
  WeaknessReviewDecision,
  WeaknessUploadJob,
} from './weakness-review.models';

const UPLOADS = 'https://api.chora.site/api/v1/me/growth-edges/uploads';
const resumeUrl = (id: string) =>
  `https://api.chora.site/api/v1/me/growth-edges/uploads/${id}/resume`;

describe('WeaknessReviewService', () => {
  let service: WeaknessReviewService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WeaknessReviewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POST upload sends multipart with file + upload_kind + structured_clues JSON', () => {
    const file = new File(['marks'], 'past-test.png', { type: 'image/png' });
    let job: WeaknessUploadJob | undefined;
    service
      .upload(file, 'marked_test', {
        subject: 'math',
        level: 'primary',
        confidence: 'low',
        note: 'I rushed the last page',
      })
      .subscribe((j) => (job = j));

    const req = http.expectOne(UPLOADS);
    expect(req.request.method).toBe('POST');
    const form = req.request.body as FormData;
    expect(form instanceof FormData).toBe(true);
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('upload_kind')).toBe('marked_test');
    // structured_clues is a single JSON part (bounded fields, screened note).
    const clues = JSON.parse(form.get('structured_clues') as string);
    expect(clues).toEqual({
      subject: 'math',
      level: 'primary',
      confidence: 'low',
      note: 'I rushed the last page',
    });
    // The browser sets the multipart Content-Type/boundary — we must NOT.
    expect(req.request.headers.has('Content-Type')).toBe(false);

    req.flush(
      { upload_id: 'u1', status: 'QUEUED' },
      { status: 202, statusText: 'Accepted' },
    );
    expect(job?.status).toBe('QUEUED');
  });

  it('POST upload omits structured_clues when no clue fields are set', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    service.upload(file, 'notes', {}).subscribe();
    const req = http.expectOne(UPLOADS);
    const form = req.request.body as FormData;
    expect(form.get('upload_kind')).toBe('notes');
    expect(form.get('structured_clues')).toBeNull();
    req.flush({ upload_id: 'u2', status: 'QUEUED' });
  });

  it('POST upload drops blank/whitespace clue fields before serialising', () => {
    const file = new File(['x'], 'scribble.jpg', { type: 'image/jpeg' });
    service
      .upload(file, 'scribble', { subject: '  ', level: 'secondary', note: '   ' })
      .subscribe();
    const req = http.expectOne(UPLOADS);
    const clues = JSON.parse(
      (req.request.body as FormData).get('structured_clues') as string,
    );
    expect(clues).toEqual({ level: 'secondary' });
    req.flush({ upload_id: 'u3', status: 'QUEUED' });
  });

  it('GET pollUpload returns the job and review panel when AWAITING_REVIEW', () => {
    let job: WeaknessUploadJob | undefined;
    service.pollUpload('u1').subscribe((j) => (job = j));
    const req = http.expectOne(`${UPLOADS}/u1`);
    expect(req.request.method).toBe('GET');
    req.flush({
      upload_id: 'u1',
      status: 'AWAITING_REVIEW',
      review: {
        familiar: { familiar_id: 'f1', name: 'Ignis', species: 'dragon' },
        proposed_edges: [
          {
            proposed_edge_id: 'p1',
            concept_label: 'Fractions',
            summary: 'Shaky converting improper fractions.',
            strength: 0.7,
            suggested_difficulty: 'standard',
          },
        ],
        candidate_struggles: [
          { concept_key: 'decimals', concept_label: 'Decimals' },
        ],
        available_outputs: [
          { kind: 'focused_dose', mana_price: 0, default_selected: true },
          { kind: 'practice_test', mana_price: 30 },
        ],
      },
    });
    expect(job?.status).toBe('AWAITING_REVIEW');
    expect(job?.review?.familiar?.name).toBe('Ignis');
    expect(job?.review?.proposed_edges[0].concept_label).toBe('Fractions');
  });

  it('POST resume sends the bounded decision to the orchestrator resume route', () => {
    const decision: WeaknessReviewDecision = {
      action: 'confirm',
      edges: [
        { proposed_edge_id: 'p1', decision: 'accept', difficulty: 'harder' },
        { proposed_edge_id: 'p2', decision: 'merge', merge_into_id: 'p1' },
        { proposed_edge_id: 'p3', decision: 'reject' },
      ],
      added_struggles: ['decimals'],
      selected_outputs: ['focused_dose', 'practice_test'],
    };
    let job: WeaknessUploadJob | undefined;
    service.resume('u1', decision).subscribe((j) => (job = j));

    const req = http.expectOne(resumeUrl('u1'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(decision);
    req.flush({ upload_id: 'u1', status: 'COMPLETED', upserted_growth_edge_ids: ['e1'] });
    expect(job?.status).toBe('COMPLETED');
  });

  it('POST resume with action=reiterate carries the decisions as constraints', () => {
    const decision: WeaknessReviewDecision = {
      action: 'reiterate',
      edges: [{ proposed_edge_id: 'p1', decision: 'reject' }],
      added_struggles: [],
      selected_outputs: [],
    };
    service.resume('u9', decision).subscribe();
    const req = http.expectOne(resumeUrl('u9'));
    expect(req.request.body).toEqual(decision);
    expect((req.request.body as WeaknessReviewDecision).action).toBe('reiterate');
    req.flush({ upload_id: 'u9', status: 'ANALYZING' });
  });

  it('resume posts to the GATEWAY path, not the orchestrator-internal one', () => {
    // CHO-2301 A4. This pointed at /api/v1/orchestrator/weakness/{id}/resume,
    // a path NOTHING in chora-gateway mounts, so confirm/reiterate was a flat
    // 404. The gateway serves it under the /me/growth-edges/uploads tree
    // (weakness_resume_handler.go PatternWeaknessResume).
    service
      .resume('u-9', {
        action: 'confirm',
        edges: [],
        added_struggles: [],
        selected_outputs: [],
      })
      .subscribe();
    const req = http.expectOne(
      'https://api.chora.site/api/v1/me/growth-edges/uploads/u-9/resume',
    );
    expect(req.request.method).toBe('POST');
    http.expectNone(
      'https://api.chora.site/api/v1/orchestrator/weakness/u-9/resume',
    );
    req.flush({ upload_id: 'u-9', status: 'completed', edges: [] });
  });

  it('resume normalises the orchestrator response shape', () => {
    // CHO-2301 A5. The orchestrator returns lowercase `status` plus a `panel`
    // key; the panel component switches on UPPERCASE status and reads `review`.
    // Forwarded verbatim, a reiterate fell through every case and silently did
    // nothing. Normalise at this boundary rather than changing the orchestrator
    // contract, which other consumers may depend on.
    let got: WeaknessUploadJob | undefined;
    service
      .resume('u-10', {
        action: 'reiterate',
        edges: [],
        added_struggles: [],
        selected_outputs: [],
      })
      .subscribe((j) => {
      got = j;
    });
    http
      .expectOne('https://api.chora.site/api/v1/me/growth-edges/uploads/u-10/resume')
      .flush({
      upload_id: 'u-10',
      status: 'awaiting_review',
      panel: { proposed_edges: [], candidate_struggles: [], available_outputs: [] },
    });

    expect(got?.status).toBe('AWAITING_REVIEW');
    expect(got?.review).toBeDefined();
  });
});
