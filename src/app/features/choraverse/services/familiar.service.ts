import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { GraphQLService } from '../../../core/services/graphql.service';
import { BffClientService } from '../../../core/services/bff-client.service';
import { QUERY_MY_FAMILIAR } from '../../../core/graphql/queries';
import type { GqlFamiliar } from '../../../core/graphql/types';
import { FamiliarProfile, FamiliarSpecies, PersonalityTraits, FamiliarSkin, FamiliarChatMessage, FamiliarState, EvolutionMilestone, SummoningState } from '../models/familiar.model';

/**
 * FamiliarService — manages Familiar companion state via BFF.
 *
 * Learner-facing reads (myCompanion) use GraphQL (ADR-025).
 * Mutations (summon, purchase skin) use REST via BffClientService.
 *
 * @see .claude/skills/coding-angular/SKILL.md (HTTP & API Client Patterns)
 * @see docs/design/ux_familiar_companion.md
 */

// ---------------------------------------------------------------------------
// GraphQL → domain mappers
// ---------------------------------------------------------------------------

function mapFamiliarProfile(gql: GqlFamiliar): FamiliarProfile {
  return {
    id: gql.id,
    gcid: gql.gcid,
    tenantId: '', // Tenant context from JWT, not in GraphQL response
    displayName: gql.name,
    speciesType: gql.species as FamiliarSpecies,
    personalityTraits: {
      curiosity: 0,
      encouragement: 0,
      humor: 0,
      detail: 0,
      formality: 0,
    },
    evolutionLevel: gql.level,
    currentSkinId: null,
    createdAt: gql.createdAt,
    updatedAt: gql.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class FamiliarService {
  private readonly gql = inject(GraphQLService);
  private readonly bff = inject(BffClientService);

  /** Familiar profile state — discriminated union */
  readonly state = signal<FamiliarState>({ status: 'loading' });

  /** Chat message history */
  readonly messages = signal<FamiliarChatMessage[]>([]);

  /** Available skins for gallery */
  readonly skins = signal<FamiliarSkin[]>([]);

  /** Evolution milestones */
  readonly milestones = signal<EvolutionMilestone[]>([]);

  /** Derived: is familiar summoned? */
  readonly isSummoned = computed(() => {
    const s = this.state();
    return s.status === 'success';
  });

  /** Derived: current evolution level */
  readonly evolutionLevel = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.profile.evolutionLevel : 0;
  });

  // ---------------------------------------------------------------------------
  // Load familiar profile via GraphQL
  // ---------------------------------------------------------------------------

  loadProfile(): Observable<FamiliarProfile | null> {
    this.state.set({ status: 'loading' });

    return this.gql.query<{ myCompanion: GqlFamiliar | null }>(QUERY_MY_FAMILIAR).pipe(
      map((data) => data?.myCompanion ? mapFamiliarProfile(data.myCompanion) : null),
      tap((profile) => {
        if (profile) {
          this.state.set({ status: 'success', profile });
        } else {
          this.state.set({ status: 'not_summoned' });
        }
      }),
      catchError((err: Error) => {
        this.state.set({
          status: 'error',
          error: { code: 'FAMILIAR_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Summon familiar via REST
  // ---------------------------------------------------------------------------

  /** Summoning ceremony state */
  readonly summoningState = signal<SummoningState>({ status: 'idle' });

  /** Whether the summoning ceremony has completed (for tutorial flow) */
  readonly justSummoned = signal(false);

  summonFamiliar(species: FamiliarSpecies, displayName: string, traits: PersonalityTraits): Observable<FamiliarProfile | null> {
    this.summoningState.set({ status: 'submitting' });

    return this.bff
      .post<FamiliarProfile>('/api/v1/familiar', {
        species_type: species,
        display_name: displayName,
        personality_traits: traits,
      })
      .pipe(
        tap((profile) => {
          this.summoningState.set({ status: 'success', profile });
          this.state.set({ status: 'success', profile });
          this.justSummoned.set(true);
        }),
        catchError((err: Error) => {
          this.summoningState.set({
            status: 'error',
            error: { code: 'SUMMON_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Update personality traits via REST
  // ---------------------------------------------------------------------------

  updatePersonality(familiarId: string, traits: PersonalityTraits): Observable<FamiliarProfile | null> {
    return this.bff
      .put<FamiliarProfile>(`/api/v1/familiar/${familiarId}/personality`, {
        personality_traits: traits,
      })
      .pipe(
        tap((profile) => {
          this.state.set({ status: 'success', profile });
        }),
        catchError((err: Error) => {
          this.state.set({
            status: 'error',
            error: { code: 'PERSONALITY_UPDATE_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this.state.set({ status: 'loading' });
    this.summoningState.set({ status: 'idle' });
    this.justSummoned.set(false);
    this.messages.set([]);
    this.skins.set([]);
    this.milestones.set([]);
  }
}
