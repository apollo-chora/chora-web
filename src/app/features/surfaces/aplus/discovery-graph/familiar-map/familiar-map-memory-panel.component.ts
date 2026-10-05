/**
 * FamiliarMapMemoryPanelComponent — the map-Familiar's memory + explainability
 * (ADR-212 WS-3, deliverable 5). Rewired from the choraverse singular
 * `familiar-memory-panel` onto the new per-Familiar memory contract and
 * promoted into the A+ Discovery surface.
 *
 * Presentational: it renders a `FamiliarMemoryState` — persona / focus /
 * rules / evolution tier / skills and RAG explainability (visibleNeighbors +
 * per-concept atom Citations). The raw remembered-facts recap list was
 * REMOVED (CHO-2116, owner ruling 2026-07-10); in its place an optional
 * goal-scoped knowledge block renders what the familiar knows about the
 * learner on the hosting map's goal (deterministic tier 1 — the host computes
 * it from painted concepts; the LLM narrative synthesis is CHO-2118).
 * Honest empty states throughout (no fabricated memories or knowledge).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { GroundedAttributionComponent } from '../../../../../shared/components/grounded-attribution/grounded-attribution.component';
import { BreedArtComponent } from '../../../../../shared/components/breed-art/breed-art.component';
import type {
  BreedSpecies,
  BreedStage,
} from '../../../../../shared/components/breed-art/breed-art.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { SeekerCitation } from '../../../../../core/familiar/familiar-growth.model';
import type {
  FamiliarGoalKnowledge,
  FamiliarMapMemory,
  FamiliarMemoryItem,
  FamiliarMemoryState,
  GoalReflection,
} from '../familiar-map.model';

/**
 * What the header needs to draw the Companion's own art (D1).
 *
 * The memory wire carries identity (name, tier) but NOT the growth axis, so the
 * species and stage come from the HOST, which already reads growth for the
 * bound Companion. Null means the host has not resolved one, which is a
 * different statement from "stage 0": the header draws nothing rather than
 * asserting a pod.
 */
export interface FamiliarPortrait {
  readonly species: BreedSpecies;
  readonly stage: BreedStage;
}

interface RuleEntry {
  readonly key: string;
  readonly value: string;
}

/**
 * A research note, ready to render: the prose, plus the provenance behind it
 * already shaped for `<chora-grounded-attribution>`.
 *
 * `hasProvenance` is derived from CONTENT, not from the mere presence of the
 * `sourceMetadata` key — so a NULL (pre-0094) note and a hypothetical empty husk
 * collapse to the same honest "we did not record this". The alternative is an
 * attribution block with nothing in it, which would imply a web search that never
 * happened.
 */
interface ResearchNoteView {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
  readonly hasProvenance: boolean;
  readonly citations: readonly SeekerCitation[];
  readonly webSearchQueries: readonly string[];
}

@Component({
  selector: 'chora-familiar-map-memory-panel',
  imports: [TranslatePipe, GroundedAttributionComponent, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-map-memory-panel.component.html',
  styleUrl: './familiar-map-memory-panel.component.scss',
})
export class FamiliarMapMemoryPanelComponent {
  readonly state = input.required<FamiliarMemoryState>();

  /**
   * The Companion's species + stage, for the header portrait (D1). Optional:
   * a host that has not read growth passes nothing and the header renders no
   * portrait at all. It previously rendered a hardcoded `fa-dragon` for EVERY
   * species, which an unloaded icon font turned into an empty circle — a wrong
   * portrait that read as a missing one.
   */
  readonly portrait = input<FamiliarPortrait | null>(null);

  /**
   * Goal-scoped knowledge (CHO-2116 tier 1) — null when the host has no goal
   * context (e.g. the discovery-graph host), which hides the block entirely.
   */
  readonly goalKnowledge = input<FamiliarGoalKnowledge | null>(null);

  /**
   * The Companion's narrative reflection (CHO-2118 tier 2) — null while the
   * host has not read it, or when the read FAILED. Fail-soft by construction:
   * an absent reflection costs the prose and nothing else, because the tier-1
   * block above renders from data the host already holds.
   */
  readonly reflection = input<GoalReflection | null>(null);

  readonly memory = computed<FamiliarMapMemory | null>(() => {
    const s = this.state();
    return s.status === 'success' ? s.memory : null;
  });

  /**
   * The prose to show, if any. `reflecting` KEEPS the last good text (the BE
   * serves stale while it regenerates), so it renders exactly like `fresh` —
   * just with a marker beside it. `none` has no prose by definition, and we
   * never invent one.
   */
  readonly reflectionText = computed<string>(() => {
    const r = this.reflection();
    if (!r || r.status === 'none') return '';
    return r.text;
  });

  /** A synthesis is wanted or in flight → a subtle marker, never a spinner. */
  readonly isReflecting = computed<boolean>(
    () => this.reflection()?.status === 'reflecting',
  );

  /**
   * The deterministic block is empty AND there is no prose ⇒ the Companion
   * genuinely knows nothing here yet. One honest line covers it; a second
   * "no reflection yet" underneath would just be the same silence twice.
   */
  readonly knowledgeIsEmpty = computed<boolean>(() => {
    const k = this.goalKnowledge();
    if (!k) return false;
    return (
      k.shaky.length === 0 && k.mastered.length === 0 && !this.reflectionText()
    );
  });

  /**
   * Say so when the Companion has learnt things here but has not formed a
   * reflection yet — honest silence beats a fabricated one (ADR-207). Suppressed
   * when the block is wholly empty, which has its own line.
   */
  readonly showNoReflection = computed<boolean>(
    () => this.reflection()?.status === 'none' && !this.knowledgeIsEmpty(),
  );

  /** Flatten the free-form `rules` object into displayable key/value rows. */
  readonly ruleEntries = computed<readonly RuleEntry[]>(() => {
    const m = this.memory();
    if (!m) return [];
    return Object.entries(m.rules).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  });

  /**
   * The Companion's grounded research notes, each carrying the account of where it
   * came from (CHO-2185 / ADR-231 D4).
   *
   * ⚠ These are the notes that made a live web search on the learner's behalf, so
   * they are the ones that owe an attribution. This is deliberately NOT the recap
   * laundry list of every remembered fact that CHO-2116 removed.
   *
   * The citations are mapped to `SeekerCitation` with an EMPTY `url`: the redirect
   * uri expires (~30d) and was never persisted, so there is genuinely nothing to
   * link to. The shared component renders a url-less source as plain text rather
   * than a dead anchor.
   */
  readonly researchNotes = computed<readonly ResearchNoteView[]>(() =>
    (this.memory()?.researchNotes ?? []).map((n) => this.toResearchNote(n)),
  );

  private toResearchNote(n: FamiliarMemoryItem): ResearchNoteView {
    const citations: readonly SeekerCitation[] = (n.sourceMetadata?.citations ?? []).map(
      (c) => ({
        url: '', // never persisted — it expires (D4)
        domain: c.domain ?? '',
        title: c.title ?? '',
        snippet: c.snippet ?? '',
      }),
    );
    const webSearchQueries = n.sourceMetadata?.webSearchQueries ?? [];

    return {
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      hasProvenance: citations.length > 0 || webSearchQueries.length > 0,
      citations,
      webSearchQueries,
    };
  }
}
