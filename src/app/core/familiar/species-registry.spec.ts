/**
 * Species-registry drift guards (CHO-2037).
 *
 * chora-contracts/companion/species_registry.json is the single canonical
 * roster for Companion species. The frontend carries three copies of it —
 * the BreedArt canon set, the per-breed adjective table, and the shipped
 * 7-stage art PNGs — and each is pinned to the registry here so onboarding
 * species N+1 goes RED on any surface that was missed
 * (docs/references/familiar-species-onboarding.md).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANON_BREEDS } from '../../shared/components/breed-art/breed-art.component';
import { BREED_ADJECTIVE } from './familiar-growth.model';

interface RegistrySpecies {
  readonly key: string;
  readonly wire_value: number;
  readonly status: 'hero' | 'legacy';
}

interface SpeciesRegistryDoc {
  readonly schema_version: number;
  readonly species: readonly RegistrySpecies[];
}

/** Growth stages with shipped art (stage-0 egg … stage-6 final form). */
const ART_STAGES = [0, 1, 2, 3, 4, 5, 6] as const;

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'chora-contracts', 'companion', 'species_registry.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        'chora-contracts/companion/species_registry.json not found walking up from ' +
          start +
          ' — the canonical species roster is missing (see docs/references/familiar-species-onboarding.md)',
      );
    }
    dir = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());
const registry = JSON.parse(
  readFileSync(join(repoRoot, 'chora-contracts', 'companion', 'species_registry.json'), 'utf8'),
) as SpeciesRegistryDoc;

const allKeys = registry.species.map((s) => s.key);
const heroes = registry.species.filter((s) => s.status === 'hero').map((s) => s.key);

describe('species registry (chora-contracts/familiar/species_registry.json)', () => {
  it('is well-formed: unique keys, unique positive wire values, known statuses', () => {
    expect(registry.schema_version).toBe(1);
    expect(registry.species.length).toBeGreaterThan(0);
    expect(new Set(allKeys).size).toBe(allKeys.length);
    const wires = registry.species.map((s) => s.wire_value);
    expect(new Set(wires).size).toBe(wires.length);
    for (const s of registry.species) {
      expect(s.wire_value, `${s.key} wire_value (0 is UNSPECIFIED)`).toBeGreaterThan(0);
      expect(['hero', 'legacy'], `${s.key} status`).toContain(s.status);
    }
  });

  it('CANON_BREEDS matches the registry hero set exactly', () => {
    expect([...CANON_BREEDS].sort()).toEqual([...heroes].sort());
  });

  it('BREED_ADJECTIVE covers every registry species (union totality proxy)', () => {
    // BREED_ADJECTIVE is a total Record over BreedSpecies, so key-set
    // equality with the registry proves the BreedSpecies union itself
    // carries every wire species.
    expect(Object.keys(BREED_ADJECTIVE).sort()).toEqual([...allKeys].sort());
  });

  it('ships all 7 art stages for every hero', () => {
    const missing: string[] = [];
    for (const hero of heroes) {
      for (const stage of ART_STAGES) {
        const rel = join('public', 'assets', 'familiars', hero, `${hero}-stage-${stage}.png`);
        if (!existsSync(join(repoRoot, 'chora-web', rel))) {
          missing.push(rel);
        }
      }
    }
    expect(
      missing,
      'hero art missing — BreedArt renders these paths directly (docs/references/familiar-species-onboarding.md)',
    ).toEqual([]);
  });
});
