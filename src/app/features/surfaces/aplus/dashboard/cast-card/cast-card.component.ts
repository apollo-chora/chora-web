/**
 * CastCardComponent — the A+ dashboard "Your Cast" wrapper (dashboard-as-hub;
 * the Familiar group, default position 1).
 *
 * A SINGLE-ROW carousel of the learner's Familiars, read from the
 * AUTHORITATIVE roster `FamiliarGrowthService.listMyFamiliars()`
 * (`GET /api/v1/me/familiars`) — the same source the (now-removed) header
 * mascot used, so each member renders its REAL breed art (owl/fox/dragon/…)
 * at its real growth stage. The ‹ › arrows appear only when the row overflows
 * and disable at each end. A hatch-new egg is ALWAYS pinned at the row end,
 * OUTSIDE the scroll (→ the marketplace).
 *
 * Per-member interaction:
 *   - the Familiar's PORTRAIT is a link to its profile (`/a/companion/{id}`) at
 *     ANY stage — egg or hatched (the hatch ceremony + management live there);
 *   - a HATCHED Familiar NOT yet bound to a learning goal also shows a small
 *     secondary "summon to a goal" trigger that opens the SummonWizard (ADR-212
 *     D5 goal→Familiar bond). A Familiar already bound to a goal (its portrait
 *     already summoned) shows no trigger — bound-state is derived from
 *     `GoalService.goals()` (a goal carries `attachedFamiliarId`), never faked.
 *
 * Fail-loud: the roster fetch surfaces a loading spinner, then an honest error
 * + Retry on failure — it NEVER renders a fabricated roster. Empty renders the
 * pinned hatch egg only.
 *
 * Self-contained per the SP2 wrapper contract: no @Input/@Output — it reads
 * root-provided services (FamiliarGrowthService + GoalService). Per chora-web
 * CLAUDE.md §3 — standalone, signal state, OnPush.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../../shared/components/breed-art/breed-art.component';
import type {
  BreedSpecies,
  BreedStage,
} from '../../../../../shared/components/breed-art/breed-art.component';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import {
  breedStageLabel,
  learnerFamiliarName,
} from '../../../../../core/familiar/familiar-growth.model';
import type { FamiliarSummary } from '../../../../../core/familiar/familiar-growth.model';
import { GoalService } from '../goal/goal.service';
import { MapsService } from '../../my-knowledge/maps.service';
import { stationFrom } from '../../../../../core/familiar/station';
import type { MapsReport, Station } from '../../../../../core/familiar/station';
import type { FamiliarRosterItem } from '../dashboard.model';
import { SummonWizardComponent } from './summon-wizard.component';

/** The species keys the shared BreedArt component understands (else generic ''). */
const KNOWN_BREEDS: ReadonlySet<string> = new Set([
  'owl',
  'fox',
  'cat',
  'dragon',
  'phoenix',
  'turtle',
  'wolf',
  'raven',
  'penguin',
]);

/** Fail-loud discriminated roster state (mirrors the DashboardState pattern). */
type RosterState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly FamiliarSummary[] }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-aplus-cast-card',
  imports: [RouterLink, TranslatePipe, BreedArtComponent, SummonWizardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cast-card.component.html',
  styleUrl: './cast-card.component.scss',
})
export class CastCardComponent {
  private readonly growth = inject(FamiliarGrowthService);
  private readonly goalService = inject(GoalService);
  private readonly maps = inject(MapsService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The maps read, as a REPORT (C3).
   *
   * ⚠ Read rather than reusing the bond this card already derives from
   * `GoalService.goals()`, for two reasons. `GoalDTO` has no title, so the
   * goals read cannot NAME the map: the map's evolving name is the root
   * concept's title and only the maps card carries it. And `goals()` collapses
   * to `[]` on loading AND on error, so nothing downstream can tell "no maps"
   * from "I could not find out", which is exactly the distinction the
   * where-line has to make.
   *
   * Starts UNREPORTED, so an in-flight read renders as unknown rather than as
   * a premature "not on a map".
   */
  private readonly _mapsReport = signal<MapsReport>({
    reported: false,
    cards: [],
  });

  /** Where one companion is stationed, or why the strip cannot say (C3). */
  stationOf(f: FamiliarSummary): Station {
    return stationFrom(this._mapsReport(), f.familiarId);
  }

  /** Fail-loud roster load state. */
  private readonly _roster = signal<RosterState>({ status: 'loading' });
  readonly roster = this._roster.asReadonly();

  /** The learner's Familiar roster (empty until loaded / on error). */
  readonly familiars = computed<readonly FamiliarSummary[]>(() => {
    const s = this._roster();
    return s.status === 'success' ? s.items : [];
  });

  /** Set of Familiar ids currently bound to a learning goal (derived, never faked). */
  private readonly boundFamiliarIds = computed<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    for (const g of this.goalService.goals()) {
      if (g.attachedFamiliarId) ids.add(g.attachedFamiliarId);
    }
    return ids;
  });

  /** The Familiar the SummonWizard is open for (null = closed). */
  readonly summonTarget = signal<FamiliarRosterItem | null>(null);

  // ── Overflow-scroll state (measured off the viewport; jsdom returns 0) ──────
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly _scrollLeft = signal<number>(0);
  private readonly _maxScroll = signal<number>(0);

  /** True when the row overflows its viewport (⇒ the ‹ › arrows are shown). */
  readonly hasOverflow = computed<boolean>(() => this._maxScroll() > 1);
  /** Enabled left arrow: overflowing AND not already at the start. */
  readonly canScrollLeft = computed<boolean>(
    () => this.hasOverflow() && this._scrollLeft() > 1,
  );
  /** Enabled right arrow: overflowing AND not already at the end. */
  readonly canScrollRight = computed<boolean>(
    () => this.hasOverflow() && this._scrollLeft() < this._maxScroll() - 1,
  );

  constructor() {
    this.load();

    // Initial measure once the viewport has laid out, plus a ResizeObserver so
    // the arrows track content/viewport size changes (roster arriving, resize).
    afterNextRender(() => {
      this.recomputeScroll();
      const el = this.viewport()?.nativeElement;
      if (el && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => this.recomputeScroll());
        ro.observe(el);
        this.destroyRef.onDestroy(() => ro.disconnect());
      }
    });
  }

  /**
   * Fetch the maps the where-line names (C3).
   *
   * Fail-SOFT and separate from the roster load on purpose: the station is one
   * line on a member, so losing this read must not lose the strip. On failure
   * the report stays UNREPORTED, which renders as unknown rather than as a
   * false "not on a map".
   */
  private loadMaps(): void {
    this.maps
      .listMaps()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cards) => this._mapsReport.set({ reported: true, cards }),
        error: () => this._mapsReport.set({ reported: false, cards: [] }),
      });
  }

  /** Fetch the authoritative roster. Idempotent — also the Retry CTA. Fail-loud. */
  load(): void {
    this.loadMaps();
    this._roster.set({ status: 'loading' });
    this.growth
      .listMyFamiliars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this._roster.set({ status: 'success', items }),
        error: () => this._roster.set({ status: 'error' }),
      });
  }

  /** Re-read the viewport's scroll metrics into the overflow signals. */
  recomputeScroll(): void {
    const el = this.viewport()?.nativeElement;
    if (!el) return;
    this._scrollLeft.set(el.scrollLeft);
    this._maxScroll.set(Math.max(0, el.scrollWidth - el.clientWidth));
  }

  /** Scroll the row ~80% of a viewport toward `dir` (-1 left, +1 right). */
  scrollByStep(dir: -1 | 1): void {
    const el = this.viewport()?.nativeElement;
    if (!el) return;
    const step = Math.max(180, el.clientWidth * 0.8);
    el.scrollBy?.({ left: dir * step, behavior: 'smooth' });
  }

  /** An unhatched (stage-0) Familiar — its portrait links to the hatch ceremony. */
  isEgg(f: FamiliarSummary): boolean {
    return (f.growthStage ?? 0) <= 0;
  }

  /** True when this Familiar is already summoned (bound to a learning goal). */
  isBound(f: FamiliarSummary): boolean {
    return this.boundFamiliarIds().has(f.familiarId);
  }

  /**
   * Show the "summon to a goal" trigger only for a HATCHED Familiar that is NOT
   * yet bound — a bound Familiar is already summoned (no trigger); an egg must
   * hatch first (on its profile), so it carries none.
   */
  canSummon(f: FamiliarSummary): boolean {
    return !this.isEgg(f) && !this.isBound(f);
  }

  /** Coerce a roster breed to a BreedArt species (unknown → generic ''). */
  breedSpecies(f: FamiliarSummary): BreedSpecies {
    const sp = (f.species ?? '').trim().toLowerCase();
    return (KNOWN_BREEDS.has(sp) ? sp : '') as BreedSpecies;
  }

  /** Clamp the roster growth stage to the BreedArt 0–6 range. */
  breedStage(f: FamiliarSummary): BreedStage {
    const n = Math.round(f.growthStage ?? 0);
    return Math.min(6, Math.max(0, n)) as BreedStage;
  }

  /** Species-flavoured growth-stage label (e.g. "fledgling"); "Pod" at stage 0. */
  stageLabel(f: FamiliarSummary): string {
    return breedStageLabel(this.breedSpecies(f), this.breedStage(f));
  }

  /**
   * The learner's own name for this member, or '' while it is still a Pod.
   *
   * A pre-hatch roster row carries the backend's NOT NULL placeholder in
   * `name`, never a learner-chosen one (see learnerFamiliarName). The template
   * substitutes the untitled-Pod string for the empty case.
   */
  memberName(f: FamiliarSummary): string {
    return learnerFamiliarName(f.growthStage, f.displayName);
  }

  /**
   * Tap the summon trigger → open the SummonWizard for this Familiar. The wizard
   * takes the legacy `FamiliarRosterItem` shape (it reads id + name only), so we
   * project the rich summary into it — no behavioural change to the wizard.
   */
  openSummon(f: FamiliarSummary): void {
    this.summonTarget.set({
      familiar_id: f.familiarId,
      name: f.displayName,
      species: this.breedSpecies(f),
      evolution_level: this.breedStage(f),
      stage_label: this.stageLabel(f),
    });
  }

  /** Wizard closed (cancel / keep-both) → clear the target. */
  closeSummon(): void {
    this.summonTarget.set(null);
  }

  /** Wizard reported a successful summon → close it (GoalService already refreshed). */
  onSummoned(): void {
    this.summonTarget.set(null);
  }
}
