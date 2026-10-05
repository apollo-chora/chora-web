/**
 * Familiar companion models — matches domain-vocabulary skill.
 *
 * @see PLAN.md §3.43 (Familiar & Choraverse)
 * @see docs/design/ux_familiar_companion.md
 */

export interface FamiliarProfile {
  id: string;
  gcid: string;
  tenantId: string;
  displayName: string;
  speciesType: FamiliarSpecies;
  personalityTraits: PersonalityTraits;
  evolutionLevel: number;
  currentSkinId: string | null;
  createdAt: string;
  updatedAt: string;
}

export enum FamiliarSpecies {
  Fox = 'fox',
  Owl = 'owl',
  Dragon = 'dragon',
  Cat = 'cat',
  Robot = 'robot',
  Phoenix = 'phoenix',
}

export interface PersonalityTraits {
  curiosity: number;      // 0-100
  encouragement: number;  // 0-100
  humor: number;          // 0-100
  detail: number;         // 0-100
  formality: number;      // 0-100
}

/** Archetype definition for summoning ceremony */
export interface ArchetypeDefinition {
  species: FamiliarSpecies;
  nameKey: string;
  flavorKey: string;
  icon: string;
  defaultTraits: PersonalityTraits;
}

/** All available archetypes with default personality distributions */
export const FAMILIAR_ARCHETYPES: ArchetypeDefinition[] = [
  {
    species: FamiliarSpecies.Fox,
    nameKey: 'choraverse.summoning.archetype_fox',
    flavorKey: 'choraverse.summoning.flavor_fox',
    icon: '🦊',
    defaultTraits: { curiosity: 6, encouragement: 4, humor: 4, detail: 3, formality: 3 },
  },
  {
    species: FamiliarSpecies.Owl,
    nameKey: 'choraverse.summoning.archetype_owl',
    flavorKey: 'choraverse.summoning.flavor_owl',
    icon: '🦉',
    defaultTraits: { curiosity: 3, encouragement: 3, humor: 2, detail: 6, formality: 6 },
  },
  {
    species: FamiliarSpecies.Dragon,
    nameKey: 'choraverse.summoning.archetype_dragon',
    flavorKey: 'choraverse.summoning.flavor_dragon',
    icon: '🐉',
    defaultTraits: { curiosity: 5, encouragement: 5, humor: 3, detail: 4, formality: 3 },
  },
  {
    species: FamiliarSpecies.Cat,
    nameKey: 'choraverse.summoning.archetype_cat',
    flavorKey: 'choraverse.summoning.flavor_cat',
    icon: '🐱',
    defaultTraits: { curiosity: 5, encouragement: 3, humor: 6, detail: 3, formality: 3 },
  },
  {
    species: FamiliarSpecies.Robot,
    nameKey: 'choraverse.summoning.archetype_robot',
    flavorKey: 'choraverse.summoning.flavor_robot',
    icon: '🤖',
    defaultTraits: { curiosity: 3, encouragement: 3, humor: 2, detail: 6, formality: 6 },
  },
  {
    species: FamiliarSpecies.Phoenix,
    nameKey: 'choraverse.summoning.archetype_phoenix',
    flavorKey: 'choraverse.summoning.flavor_phoenix',
    icon: '🔥',
    defaultTraits: { curiosity: 4, encouragement: 6, humor: 3, detail: 3, formality: 4 },
  },
];

/** Summoning ceremony state */
export type SummoningState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; profile: FamiliarProfile }
  | { status: 'error'; error: { code: string; message: string } };

export interface FamiliarSkin {
  id: string;
  name: string;
  speciesType: FamiliarSpecies;
  rarity: SkinRarity;
  previewUrl: string;
  starCreditCost: number;
  isOwned: boolean;
}

export enum SkinRarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}

export interface FamiliarChatMessage {
  id: string;
  role: 'familiar' | 'learner';
  content: string;
  timestamp: string;
  citations: Citation[];
}

export interface Citation {
  atomId: string;
  atomTitle: string;
  topicNodePath: string;
}

export interface EvolutionMilestone {
  level: number;
  unlockedAt: string | null;
  reward: string;
  description: string;
}

/**
 * Async state discriminated union for Familiar data loading.
 * @see coding-angular skill — TypeScript Strict Mode
 */
export type FamiliarState =
  | { status: 'loading' }
  | { status: 'success'; profile: FamiliarProfile }
  | { status: 'error'; error: { code: string; message: string } }
  | { status: 'not_summoned' };
