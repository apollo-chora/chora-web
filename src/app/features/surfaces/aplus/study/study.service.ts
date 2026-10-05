/**
 * StudyService — A+ Study surface BFF wrapper (CHO-2217).
 *
 *   GET /api/v1/me/learning-paths → loadStudyLists()
 *
 * The route is already at the edge: chora-gateway registers it in all three
 * lists (gatewayproxy_handler.go proxy list + mux + jwt_auth.go) and the Istio
 * allowlist permits it (chora-infra/k8s/services/chora-consumption/
 * authz-allow-gateway.yaml). No new gateway/mesh wiring was needed.
 *
 * The filter to study lists is CLIENT-SIDE: the BE route returns every kind of
 * LearningPath and takes no source_type query param.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  MeLearningPath,
  MeLearningPathListResponse,
  StudyListState,
} from './study.model';

/**
 * Is this path a WS-4 study list?
 *
 * 🔴 POSITIVE discriminator, per ADR-233 D2. `source_type !== 'course'` would
 * admit every legacy `ad_hoc` path — the BE guards the same invariant in
 * TestGetMeLearningPaths_StudyListDiscriminatorIsPositive_ADR233_D2.
 */
export function isStudyList(p: MeLearningPath): boolean {
  return p.source_type === 'collection';
}

@Injectable({ providedIn: 'root' })
export class StudyService {
  private readonly bff = inject(BffClientService);

  private readonly _listState = signal<StudyListState>({ status: 'loading' });
  readonly listState = this._listState.asReadonly();

  /** Convenience: the study lists when success, else an empty readonly array. */
  readonly studyLists = computed<readonly MeLearningPath[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });

  loadStudyLists(): void {
    this._listState.set({ status: 'loading' });
    this.bff
      .get<MeLearningPathListResponse>('/api/v1/me/learning-paths')
      .pipe(
        take(1),
        map(
          (resp): StudyListState => ({
            status: 'success',
            items: (resp.items ?? []).filter(isStudyList),
          }),
        ),
        catchError((err: unknown) =>
          of<StudyListState>({ status: 'error', error: this.listErrorKey(err) }),
        ),
      )
      .subscribe((s) => this._listState.set(s));
  }

  private listErrorKey(err: unknown): string {
    const status = httpErrorView(err)?.status ?? null;
    if (status === 401 || status === 403) return 'aplus.study.error_unauthorised';
    if (status !== null && status >= 500) return 'aplus.study.error_upstream';
    return 'aplus.study.error_generic';
  }
}
