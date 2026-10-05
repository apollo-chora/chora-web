/**
 * FamiliarRitualService — chora-gateway client for the Grimoire Rituals v1
 * designer (CHO-2016 P4, ADR-219 D3/D4). Dedicated (not folded into
 * FamiliarGrowthService) so the Rituals aggregate has a clean DDD boundary
 * on the FE.
 *
 * The rituals wire is camelCase END-TO-END and NOT `{data:T}`-enveloped
 * (FamiliarBridge proxies with `classify`, raw pass-through). Every response
 * is validated with a type guard and fails LOUD on a malformed shape — no
 * fabricated data (feedback_no_stubs_real_wiring). Downstream conflicts
 * (403 RITUALS_LOCKED / 404 RITUAL_NOT_FOUND / 409 RITUAL_QUOTA_REACHED /
 * 422 RITUAL_INVALID) propagate with their status preserved so callers render
 * the honest conflict.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BffClientService } from '../services/bff-client.service';
import type {
  CreateRitualRequest,
  PublishRitualRequest,
  Ritual,
  RitualRun,
  RunRitualRequest,
} from './familiar-ritual.model';
import {
  isListRitualRunsResponse,
  isListRitualsResponse,
  wiredSinksOf,
  type RitualListing,
  isRitual,
  isRitualRun,
} from './familiar-ritual.model';

/** Throw on a malformed single-Ritual response (fail-loud). */
function expectRitual(raw: unknown): Ritual {
  if (!isRitual(raw)) {
    throw new Error('familiar-ritual: malformed ritual response');
  }
  return raw;
}

/** Throw on a malformed run response (fail-loud). */
function expectRun(raw: unknown): RitualRun {
  if (!isRitualRun(raw)) {
    throw new Error('familiar-ritual: malformed run response');
  }
  return raw;
}

@Injectable({ providedIn: 'root' })
export class FamiliarRitualService {
  private readonly bff = inject(BffClientService);

  private base(familiarId: string): string {
    return `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/rituals`;
  }

  private one(familiarId: string, ritualId: string): string {
    return `${this.base(familiarId)}/${encodeURIComponent(ritualId)}`;
  }

  /**
   * GET the caller's Rituals for a familiar, WITH the deployment's wired-sink
   * set (B3b).
   *
   * Returns the envelope rather than the bare array because the composer needs
   * both: the rituals to list and the wired sinks to grey the picker from the
   * server's own answer instead of a client-side guess.
   */
  listRituals(familiarId: string): Observable<RitualListing> {
    return this.bff.get<unknown>(this.base(familiarId)).pipe(
      map((raw) => {
        if (!isListRitualsResponse(raw)) {
          throw new Error('familiar-ritual: malformed list response');
        }
        const wired = wiredSinksOf(raw);
        return {
          rituals: raw.rituals,
          wiredSinks: wired.sinks,
          sinksReported: wired.reported,
        };
      }),
    );
  }

  /** POST a new DRAFT ritual (disabled, no revisions). */
  createRitual(familiarId: string, body: CreateRitualRequest): Observable<Ritual> {
    return this.bff
      .post<unknown>(this.base(familiarId), body)
      .pipe(map(expectRitual));
  }

  /** GET one ritual by id. */
  getRitual(familiarId: string, ritualId: string): Observable<Ritual> {
    return this.bff.get<unknown>(this.one(familiarId, ritualId)).pipe(map(expectRitual));
  }

  /**
   * POST a step pipeline to /publish — validates, composes+freezes the price,
   * appends an immutable revision, and auto-enables within quota. Returns the
   * updated ritual.
   */
  publishRitual(
    familiarId: string,
    ritualId: string,
    body: PublishRitualRequest,
  ): Observable<Ritual> {
    return this.bff
      .post<unknown>(`${this.one(familiarId, ritualId)}/publish`, body)
      .pipe(map(expectRitual));
  }

  /** POST /run — runs the current revision now, charging flat per run. */
  runRitual(
    familiarId: string,
    ritualId: string,
    body: RunRitualRequest = {},
  ): Observable<RitualRun> {
    return this.bff
      .post<unknown>(`${this.one(familiarId, ritualId)}/run`, body)
      .pipe(map(expectRun));
  }

  /**
   * GET /runs/{runId} - ONE run, for replaying an old story.
   *
   * Not a filter over `listRuns`: that read is capped at 50 and ordered
   * newest-first, so an older run is not addressable there at all, and pulling
   * fifty rows to render one is a read the editor should not have to make.
   * Server side is `handleGetRitualRun`, which deliberately skips the list
   * handler's stale-sweep, so a run still 'running' here reads as running.
   */
  getRun(
    familiarId: string,
    ritualId: string,
    runId: string,
  ): Observable<RitualRun> {
    return this.bff
      .get<unknown>(
        `${this.one(familiarId, ritualId)}/runs/${encodeURIComponent(runId)}`,
      )
      .pipe(map(expectRun));
  }

  /** GET /runs — the decision-stamped run history. */
  listRuns(familiarId: string, ritualId: string): Observable<readonly RitualRun[]> {
    return this.bff.get<unknown>(`${this.one(familiarId, ritualId)}/runs`).pipe(
      map((raw) => {
        if (!isListRitualRunsResponse(raw)) {
          throw new Error('familiar-ritual: malformed runs response');
        }
        return raw.runs;
      }),
    );
  }
}
