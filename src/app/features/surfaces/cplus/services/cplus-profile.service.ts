import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  CPlusProfile,
  CPlusProfileState,
  CPlusProfileViewMode,
} from '../models/cplus-profile.model';

/** Gateway-exposed social profile path (chora-gateway → chora-sharing). */
const ME_SOCIAL_PATH = '/v1/me/social';

/** Wire shape of `GET /v1/me/social` (chora-gateway SocialHandler). */
interface MeSocialResponse {
  readonly gcid: string;
  readonly display_name: string;
  readonly avatar_url: string;
  readonly atom_count: number;
  readonly follower_count: number;
  readonly following_count: number;
  readonly digital_skins: readonly unknown[];
}

/**
 * C+ (Circle+) profile service.
 *
 * Loads the caller's social profile from the BFF
 * (`GET /v1/me/social`, chora-gateway social aggregator fanning to
 * chora-sharing `/v1/connections`) and maps the wire DTO to the C+
 * profile view model. Fails loud with `cplus.profile.*` i18n keys —
 * no mock fallback.
 */
@Injectable({ providedIn: 'root' })
export class CPlusProfileService {
  private readonly bff = inject(BffClientService);

  private readonly _profileState = signal<CPlusProfileState>({ status: 'idle' });
  readonly profileState = this._profileState.asReadonly();

  /**
   * Loads the own-profile from `GET /v1/me/social`. `viewMode='peer'`
   * is not yet supported by the backend — only the own-profile is
   * fetched and returned with `view_mode='own'`.
   */
  async loadProfile(viewMode: CPlusProfileViewMode = 'own'): Promise<CPlusProfile> {
    this._profileState.set({ status: 'loading' });
    try {
      const resp = await firstValueFrom(
        this.bff.get<MeSocialResponse>(ME_SOCIAL_PATH),
      );
      const profile = this.mapProfile(resp, viewMode);
      this._profileState.set({ status: 'success', profile });
      return profile;
    } catch (err) {
      this._profileState.set({
        status: 'error',
        error: { code: 'PROFILE_LOAD_FAILED', message: this.errorKey(err) },
      });
      throw err;
    }
  }

  /** Swap between own and peer view modes — re-fetches from the BFF. */
  setViewMode(viewMode: CPlusProfileViewMode): void {
    void this.loadProfile(viewMode);
  }

  private mapProfile(resp: MeSocialResponse, viewMode: CPlusProfileViewMode): CPlusProfile {
    return {
      gcid: resp.gcid,
      display_name: resp.display_name,
      tenants: [],
      level: 0,
      is_following: viewMode === 'own' ? null : false,
      view_mode: viewMode,
      familiar: {
        name: '',
        level: 0,
        bond_meter_percent: 0,
        tagline: '',
      },
      currency: {
        xp: 0,
        xp_delta_week: 0,
        coins: 0,
        coins_delta_week: 0,
        reputation: 0,
        reputation_tier: 'bronze',
        reputation_tier_progress_percent: 0,
      },
      reputation: { authoring: 0, review: 0, mentorship: 0 },
      recent_completions: [],
      contributed_atoms: [],
      duel_record: null,
      followers_count: resp.follower_count,
      connections_count: resp.following_count,
      duel_score: 0,
      contributions_count: resp.atom_count,
      quality_score: 0,
    };
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.profile.error_unauthenticated';
      if (e.status === 403) return 'cplus.profile.error_forbidden';
      if (e.status >= 500) return 'cplus.profile.error_upstream';
    }
    return 'cplus.profile.error_generic';
  }
}
