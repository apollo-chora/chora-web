/**
 * MapCanvasComponent — the "My Knowledge" L1 unified map canvas (WS-C —
 * CHO-2005, epic CHO-2004; ADR-212 / ADR-214).
 *
 * One themed map = one Goal (ADR-214: `Goal.RootConceptID` is the map's root).
 * This canvas renders the map's sovereign concept sub-graph as a directly
 * manipulable graph FISHEYE LENS (via the unit-tested `ConceptLensMapComponent`):
 * the WHOLE map on one bounded canvas, a lens magnifying the focus while the
 * periphery shrinks but never vanishes (owner-approved 2026-07-03; no pan/zoom).
 * It fixes every "not great" issue the owner named in the old `/a/discovery`:
 *
 *   - direct manipulation on the canvas (create a concept, click-to-connect an
 *     edge, make-this-my-root) instead of divorced right-rail forms;
 *   - a breadcrumb TRAIL with a working Back (selecting a node pushes history);
 *   - the grand picture stays in view (every concept on the lens — no truncation);
 *   - provenance badges (● you / ✨ Familiar) in the detail panel;
 *   - atom attach via the shared `AtomQuestionPicker` (NO raw-UUID paste).
 *
 * Composes the new affordances (trail, drawer, tabs, lenses, connector) around
 * the lens: a node `select` focuses + opens its detail, and the lens `settled`
 * event redraws the node→drawer connector. Fail-loud: honest loading /
 * error(retry) / empty states; every mutation toasts and re-fetches; nothing is
 * fabricated (no mock data). Per chora-web CLAUDE.md §3 — standalone, signal
 * state, OnPush, BFF-only HTTP.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Observable, map, of, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { LayoutService } from '../../../../../core/services/layout.service';
import { LastVisitedMapService } from '../../../../../core/services/last-visited-map.service';
import { MapsService } from '../maps.service';
import { MapLayersService } from '../map-layers.service';
import { conceptRoadEntries, mapHasRoads } from './map-roads';
import type { ConceptRoadEntry } from './map-roads';
import type { MapLens } from '../map-layers.service';
import type { MapGraph } from '../maps.model';
import { normalizeConceptKey } from '../concept-key';
import { ConceptGraphService } from '../../discovery-graph/concept-graph.service';
import { ConceptLensMapComponent } from '../concept-lens-map/concept-lens-map.component';
import {
  LENS_VIEWBOX_W,
  LENS_VIEWBOX_H,
} from '../concept-lens-map/concept-lens';
import type {
  ConceptEdge,
  ConceptNode,
  ConceptSuggestion,
  EdgeClass,
} from '../../discovery-graph/concept-graph.model';
import {
  CampaignService,
  campaignErrorCode,
  campaignErrorKey,
} from '../campaign.service';
import type {
  CampaignNodeState,
  CampaignSealResult,
  FogGhost,
  MapCampaign,
} from '../campaign.model';
import {
  CAMPAIGN_RUNG_LABEL_KEYS,
  CAMPAIGN_TOTAL_RUNGS,
} from '../campaign.model';
import { GoalService } from '../../dashboard/goal/goal.service';
import {
  GrowthEdgesService,
  type GrowthEdge,
} from '../../growth-edges/growth-edges.service';
import { masteryPercent } from '../../growth-edges/growth-edge-mastery';
import { AtomQuestionPickerComponent } from '../../atom-question-picker/atom-question-picker.component';
import type { QuestionRef } from '../../atom-question-picker/atom-question-picker.model';
import { MapFamiliarPanelComponent } from '../map-familiar/map-familiar-panel.component';

/** Fail-loud async state for the L1 canvas (discriminated `AsyncState<T>`). */
type MapCanvasState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly graph: MapGraph }
  | { readonly status: 'error'; readonly errorKey: string };

/** How a concept entered the map — drives the detail-panel provenance badge. */
export type ProvenanceKind = 'you' | 'familiar' | 'system';

/** Bucket a raw `provenance` string (ADR-212 D4) into a badge kind. */
export function provenanceKind(provenance?: string): ProvenanceKind {
  if (provenance === 'learner_authored') return 'you';
  if (provenance === 'familiar_suggested_accepted') return 'familiar';
  return 'system';
}

/**
 * A map LENS (WS-D, design §5). Lenses are composable view-OVERLAYS over the
 * one graph — NOT capability-flipping modes (design §5.1 "no toggles"). Explore
 * is the always-useful default; Growth/Mastery only RE-EMPHASISE the same nodes
 * and change what the node-detail panel foregrounds. The shaky/due cues stay
 * faintly always-on in every lens, and no lens ever hides a capability.
 */
export type { MapLens } from '../map-layers.service';

/** One lens option in the header selector (a radio in the group). */
interface LensOption {
  readonly value: MapLens;
  readonly labelKey: string;
  readonly captionKey: string;
  readonly icon: string;
}

/** The lens selector's radio options (order = Explore → Growth → Mastery). */
const LENS_OPTIONS: readonly LensOption[] = [
  {
    value: 'explore',
    labelKey: 'aplus.knowledge.lens_explore',
    captionKey: 'aplus.knowledge.lens_explore_caption',
    icon: 'fa-compass',
  },
  {
    value: 'growth',
    labelKey: 'aplus.knowledge.lens_growth',
    captionKey: 'aplus.knowledge.lens_growth_caption',
    icon: 'fa-seedling',
  },
  {
    value: 'mastery',
    labelKey: 'aplus.knowledge.lens_mastery',
    captionKey: 'aplus.knowledge.lens_mastery_caption',
    icon: 'fa-award',
  },
  // NB: 'familiar' is NOT a map lens — the Familiar view now lives as a drawer
  // TAB (Overview·Suggestions·Familiar·Diagnose). The 3 lenses above are map-hex
  // overlays (Explore = all · Growth = shaky · Mastery = mastered).
];

/**
 * A drawer TAB (owner: declutter → tabs). The detail drawer organises the focal
 * concept's content into four single-column tabs (default Overview). Tabs are
 * ORTHOGONAL to the map LENS: the lens colours the map hexes; the tabs organise
 * the drawer. Overview holds provenance + growth diagnosis + mastery band +
 * atoms; the other three each render one slice of the shared Familiar panel.
 */
export type DrawerTab = 'overview' | 'suggestions' | 'familiar' | 'diagnose';

/** One tab in the drawer tablist. */
interface TabOption {
  readonly value: DrawerTab;
  readonly labelKey: string;
  readonly icon: string;
}

/** The four drawer tabs in display order (Overview is the default). */
const TAB_OPTIONS: readonly TabOption[] = [
  {
    value: 'overview',
    labelKey: 'aplus.knowledge.overview',
    icon: 'fa-circle-info',
  },
  {
    value: 'suggestions',
    labelKey: 'aplus.knowledge.familiar_suggest',
    icon: 'fa-wand-magic-sparkles',
  },
  {
    value: 'familiar',
    labelKey: 'aplus.knowledge.lens_familiar',
    icon: 'fa-dragon',
  },
  {
    value: 'diagnose',
    labelKey: 'aplus.knowledge.diagnose',
    icon: 'fa-bolt',
  },
];

@Component({
  selector: 'chora-aplus-map-canvas',
  imports: [
    RouterLink,
    TranslatePipe,
    DatePipe,
    ConceptLensMapComponent,
    AtomQuestionPickerComponent,
    MapFamiliarPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-canvas.component.html',
  styleUrl: './map-canvas.component.scss',
})
export class MapCanvasComponent implements OnInit, OnDestroy {
  private readonly mapsService = inject(MapsService);
  private readonly conceptGraph = inject(ConceptGraphService);
  private readonly campaignService = inject(CampaignService);
  private readonly goalService = inject(GoalService);
  private readonly growthEdges = inject(GrowthEdgesService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);
  private readonly lastVisited = inject(LastVisitedMapService);
  /**
   * The SINGLE owner of the map's view-layer state (lens + Roads). It lives
   * outside this component because the campaign HUD flips the same switches; a
   * second copy here would drift the moment either side set one.
   */
  private readonly layers = inject(MapLayersService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Route param → signal input (withComponentInputBinding). A map = a Goal. */
  readonly goalId = input.required<string>();

  /** The goalId whose graph is currently loaded — guards the re-fetch effect. */
  private loadedGoalId: string | null = null;

  /**
   * In-place map switch: the overlay switcher navigates to a new
   * `/a/knowledge/{goalId}`, updating this route-param input. Angular reuses the
   * component (default RouteReuseStrategy) so `ngOnInit` does NOT re-run — re-drive
   * the load here on a genuine goalId change, resetting the trail + closing the
   * concept drawer (its concept belonged to the OLD map). The FIRST load stays
   * synchronous in `ngOnInit`; the guard skips it here.
   */
  private readonly _reloadOnGoalChange = effect(() => {
    const id = this.goalId();
    untracked(() => {
      // Record the open so the dashboard's map-preview card can honestly surface
      // the "last visited learning goal". Every entry path (tile, Atlas, switch,
      // deep link) lands here; runs before the reload guard so the first load and
      // in-place switches are all captured.
      this.lastVisited.record(id);
      // Hoisting the lens into a root service outlives this component, so the
      // per-map reset it used to get for free is now explicit. The service
      // no-ops for the map already open, so a refetch never wipes a lens the
      // learner just picked.
      this.layers.resetFor(id);
      if (this.loadedGoalId === id) return;
      this.loadedGoalId = id;
      this.trail.set([]);
      this.closeDetail();
      this.load();
    });
  });

  /** Static lens-selector options for the header radio group. */
  readonly lensOptions = LENS_OPTIONS;

  private readonly _state = signal<MapCanvasState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Visit history; the LAST id is the current focal. Drives breadcrumb + Back. */
  readonly trail = signal<readonly string[]>([]);
  /** True while a mutation is in flight (dims the hex, blocks re-entry). */
  readonly mutating = signal(false);

  // ── Lens layer (WS-D — composable overlays, §5.1 no-toggles) ─────────
  /**
   * Re-exposed from MapLayersService so the template and every existing caller
   * keep reading `lens()` unchanged. The state itself is NOT owned here.
   */
  readonly lens = this.layers.lens;

  /** Whether the Roads layer is drawn (C4). Owned by MapLayersService. */
  readonly roadsVisible = this.layers.roadsVisible;

  /**
   * Does this map carry any road, i.e. is the Roads toggle worth offering. A
   * switch that changes nothing is a switch the learner must try to learn it
   * does nothing.
   */
  readonly hasRoads = computed<boolean>(() => mapHasRoads(this.concepts()));

  /**
   * The Roads layer was NOT READ this request (chora-consumption could not
   * compute it). Distinct from "this map has no roads": the lens bar says so
   * rather than silently looking like a map with no course, which would be a
   * claim built from a read that never happened.
   */
  readonly roadsUnread = computed<boolean>(() => this.graph()?.roadsPartial === true);

  /**
   * The learner's Growth Edges, fetched ONCE (lazily, on first Growth entry) and
   * cached. Fail-soft: an error leaves the graph untouched and just yields no
   * diagnosis (`error` status drives an honest note, never the misleading "no
   * weakness yet").
   */
  private readonly edgesStatus = signal<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  readonly edges = signal<readonly GrowthEdge[]>([]);

  // ── Direct-manipulation UI state ────────────────────────────────────
  readonly createOpen = signal(false);
  readonly createTitle = signal('');
  readonly createConnect = signal(true);

  /** The create-form name input; opening the form lands focus + scroll here. */
  private readonly createTitleInputRef =
    viewChild<ElementRef<HTMLInputElement>>('createTitleInput');
  /** Bumped on EVERY openCreate() so re-opening the form re-focuses even when it
   *  is already open (selecting another node leaves createOpen true; the effect
   *  would otherwise fire only on the first false->true flip) (CHO-2320). */
  private readonly _focusTick = signal(0);
  /** When the create form opens (or is re-opened via +Concept), focus the name
   *  field and scroll it into view, so it lands the learner ready to type
   *  instead of revealing the form off the top of the map, far from the button. */
  private readonly _focusCreateOnOpen = effect(() => {
    this._focusTick(); // re-run on every +Concept, even when already open
    if (!this.createOpen()) return;
    const el = this.createTitleInputRef()?.nativeElement;
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  });

  readonly connectMode = signal(false);
  /** The chosen connect SOURCE (first tap); the second tap is the target. */
  readonly connectSourceId = signal<string | null>(null);
  readonly connectClass = signal<EdgeClass>('hierarchy');

  readonly showPicker = signal(false);

  /**
   * Detail drawer (`map-canvas-detail`) open state. CLOSED by default on load;
   * OPENED by clicking a concept hex (the focal, or a recentred neighbour);
   * CLOSED by the × button or Escape. No persistence — a fresh map load always
   * starts full-width. Long detail content scrolls INSIDE the drawer, so the
   * page never grows tall behind it.
   */
  private readonly _detailOpen = signal<boolean>(false);
  readonly detailOpen = this._detailOpen.asReadonly();

  /**
   * Two-step inline delete confirm for the focal concept. A styled in-drawer
   * arm→confirm (NOT `window.confirm` — a JS dialog would block the extension /
   * the whole page). Reset whenever the focal changes or the drawer closes.
   */
  private readonly _deleteArmed = signal<boolean>(false);
  readonly deleteArmed = this._deleteArmed.asReadonly();

  // ── Per-node objective / sub-goal (ADR-247, CHO-2328) ──────────────
  /**
   * Inline-edit state for the focal concept's objective (its "sub-goal"). Read
   * mode shows the objective + a provenance pill (you / Companion); clicking it
   * (or the "set an objective" affordance when unset) opens a text input with
   * Save/Cancel; Enter saves, Esc cancels. Reset whenever the focal changes or
   * the drawer closes (mirrors the inline-delete-confirm lifecycle).
   */
  private readonly _subGoalEditing = signal<boolean>(false);
  readonly subGoalEditing = this._subGoalEditing.asReadonly();
  /** The in-flight objective draft, bound to the inline input. */
  readonly subGoalDraft = signal<string>('');

  private readonly subGoalInputRef =
    viewChild<ElementRef<HTMLInputElement>>('subGoalInput');
  /**
   * Land focus in the objective input the moment inline edit opens (mirrors the
   * create-form focus effect). Editing always transitions false→true on open
   * (save / cancel / a focal change all close it), so a plain effect suffices;
   * no focus tick needed.
   */
  private readonly _focusSubGoalOnEdit = effect(() => {
    if (!this._subGoalEditing()) return;
    const el = this.subGoalInputRef()?.nativeElement;
    if (!el) return;
    el.focus();
    el.select?.();
  });

  // ── Map switcher (overlay drawer; SP1) ──────────────────────────────
  /** The learner's maps for the switcher list (shared Atlas provider). */
  readonly maps = this.mapsService.maps;
  /**
   * Overlay map-switcher open state. MUTUALLY EXCLUSIVE with the concept detail
   * drawer — opening the switcher closes the concept drawer, so the two never
   * coexist (the collision the overlay form would otherwise cause).
   */
  private readonly _switcherOpen = signal(false);
  readonly switcherOpen = this._switcherOpen.asReadonly();
  /** The map being deleted from the switcher (in-flight guard); `null` = idle. */
  private readonly _mapDeletingId = signal<string | null>(null);
  readonly mapDeletingId = this._mapDeletingId.asReadonly();

  /**
   * Horizontal shift (viewBox units, ≤0) handed to the lens so the focus
   * re-centres on the VISIBLE canvas while the drawer overlays the right: the
   * focus (normally dead-centre) glides to the middle of the uncovered left
   * region at the same size. 0 when the drawer is closed. Measured from the live
   * lens + drawer geometry (below), recomputed on open / resize / settle.
   */
  readonly lensShiftX = signal<number>(0);

  /**
   * The active drawer TAB (owner: declutter → tabs). Default Overview. Switching
   * tabs re-slices the drawer content; it does NOT touch the map lens.
   */
  readonly tabs = TAB_OPTIONS;
  private readonly _activeTab = signal<DrawerTab>('overview');
  readonly activeTab = this._activeTab.asReadonly();

  /**
   * The Familiar-panel section for the current tab. Overview renders its OWN
   * content (not the Familiar panel), so it maps to `all` as an inert default;
   * the three Familiar tabs map to their matching section so a SINGLE shared
   * Familiar-panel instance re-slices via its input rather than remounting +
   * refetching on every tab switch.
   */
  readonly panelSection = computed<
    'all' | 'suggestions' | 'familiar' | 'diagnose'
  >(() => {
    const t = this._activeTab();
    return t === 'overview' ? 'all' : t;
  });

  // ── Derived graph views ─────────────────────────────────────────────
  readonly graph = computed<MapGraph | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.graph : null;
  });
  readonly concepts = computed<readonly ConceptNode[]>(
    () => this.graph()?.concepts ?? [],
  );
  /** The map's concept edges (fed to the lens). NB: distinct from the Growth
   *  `edges` cache below — this is the graph topology, not weakness signals. */
  readonly conceptEdges = computed<readonly ConceptEdge[]>(
    () => this.graph()?.edges ?? [],
  );
  readonly mapTitle = computed<string>(() => this.graph()?.title ?? '');
  readonly rootConceptId = computed<string | undefined>(
    () => this.graph()?.rootConceptId,
  );
  readonly focalId = computed<string>(() => {
    const t = this.trail();
    return t.length ? t[t.length - 1] : '';
  });
  readonly focalConcept = computed<ConceptNode | null>(() => {
    const id = this.focalId();
    return this.concepts().find((c) => c.conceptId === id) ?? null;
  });
  readonly canGoBack = computed(() => this.trail().length > 1);

  /** The focal IS the map root ⇒ NOT deletable (deleting it would orphan the map). */
  readonly isFocalRoot = computed<boolean>(
    () => !!this.focalId() && this.focalId() === this.rootConceptId(),
  );

  /** Breadcrumb crumbs (id + resolved title); the last is the current focal. */
  readonly crumbs = computed(() =>
    this.trail().map((id) => ({ id, title: this.conceptTitle(id) })),
  );

  /** The focal's provenance bucket for the detail badge. */
  readonly focalProvenance = computed<ProvenanceKind>(() =>
    provenanceKind(this.focalConcept()?.provenance),
  );

  /**
   * The course roads through the FOCAL concept, for the Overview's "also on"
   * list (C4 slice 2). Independent of the Roads map LAYER: the layer draws runs
   * across the whole map and is toggled off by default, while this answers "what
   * else is this one node on" and is always shown when the wire carries it.
   *
   * Empty whenever the graph was painted by the flat `/concept-graph` read,
   * which sends no roads at all, so the section simply does not render rather
   * than claiming the concept is on no course.
   */
  readonly focalRoads = computed<readonly ConceptRoadEntry[]>(() =>
    conceptRoadEntries(this.focalConcept()),
  );

  /** The focal concept's objective / sub-goal text ('' when unset). */
  readonly focalSubGoal = computed<string>(
    () => this.focalConcept()?.subGoal?.trim() ?? '',
  );
  readonly hasSubGoal = computed<boolean>(() => this.focalSubGoal().length > 0);
  /** The objective's OWN provenance bucket (distinct from the concept's); drives
   *  the you / Companion pill beside the objective. */
  readonly subGoalProvenanceKind = computed<ProvenanceKind>(() =>
    provenanceKind(this.focalConcept()?.subGoalProvenance),
  );

  // ── Lens-derived views (WS-D) ───────────────────────────────────────

  /** i18n key for the one-line caption under the active lens's selector. */
  readonly lensCaptionKey = computed<string>(
    () =>
      LENS_OPTIONS.find((o) => o.value === this.lens())?.captionKey ??
      'aplus.knowledge.lens_explore_caption',
  );

  /** Growth Edges indexed by their normalised `concept_key` (the slug join key). */
  private readonly edgesByKey = computed<ReadonlyMap<string, GrowthEdge>>(
    () => new Map(this.edges().map((e) => [e.concept_key, e])),
  );

  /**
   * Growth Edges indexed by their STABLE server id (`GrowthEdge.id`). The map read
   * paints each concept's `growthEdge.edgeId` from the SAME server id
   * (`LearnerWeakness.ID`), so joining on it is immune to slug / `concept_key`
   * drift between the overlay and the list — the robust primary join key.
   */
  private readonly edgesById = computed<ReadonlyMap<string, GrowthEdge>>(
    () => new Map(this.edges().map((e) => [e.id, e])),
  );

  readonly edgesLoading = computed(() => this.edgesStatus() === 'loading');
  readonly edgesFailed = computed(() => this.edgesStatus() === 'error');

  /**
   * The Growth Edge diagnosing the FOCAL concept, or null. Joins in precedence,
   * returning the first hit:
   *   1. the painted `growthEdge.edgeId` against the by-id index — the robust,
   *      slug-drift-proof primary (the overlay's `edgeId` IS the list
   *      `GrowthEdge.id`; both are the server `LearnerWeakness.ID`);
   *   2. the painted `growthEdge.conceptKey` (WS-A1 authoritative slug); then
   *   3. the title slugged with the shared `normalizeConceptKey`.
   * Reads the cached list — never breaks the canvas when edges are absent
   * (fail-soft) and preserves the slug path for concepts with no overlay.
   */
  readonly focalDiagnosis = computed<GrowthEdge | null>(() => {
    const fc = this.focalConcept();
    if (!fc) return null;
    // 1. Stable server-id join — immune to slug / concept_key drift.
    const edgeId = fc.growthEdge?.edgeId;
    if (edgeId) {
      const byId = this.edgesById().get(edgeId);
      if (byId) return byId;
    }
    // 2. Authoritative painted key, then 3. title-slug fallback.
    const byKey = this.edgesByKey();
    const painted = fc.growthEdge?.conceptKey;
    if (painted) {
      const hit = byKey.get(painted);
      if (hit) return hit;
    }
    return byKey.get(normalizeConceptKey(fc.title)) ?? null;
  });

  readonly focalMisconceptions = computed<readonly string[]>(
    () => this.focalDiagnosis()?.descriptor.misconceptions ?? [],
  );
  /** "Try next" angles = the edge's `suggested_angles` (may be empty). */
  readonly focalTryNext = computed<readonly string[]>(
    () => this.focalDiagnosis()?.descriptor.suggested_angles ?? [],
  );
  /** Cached remediation drills for ⚡ Practice (empty ⇒ no Practice affordance). */
  readonly focalDrills = computed<readonly string[]>(
    () => this.focalDiagnosis()?.cached_drill_atom_ids ?? [],
  );
  /**
   * Query params that scope the daily-dose surface to this map's work. The dose
   * surface reads `?growth_edge_id=<id>&concept=<label>` and, when present,
   * opens a concept-scoped RAG-grounded session instead of a generic dose; with
   * no focal diagnosis those two are omitted and the dose stays generic.
   *
   * `goal_id` rides along UNCONDITIONALLY (ADR-242 D2): a learner practising
   * from a map is practising a Goal whether or not a growth edge is painted, so
   * the dose scopes to that Goal and discloses how much of what it served
   * actually came from it.
   */
  readonly doseQueryParams = computed<Record<string, string>>(() => {
    const dx = this.focalDiagnosis();
    const params: Record<string, string> = {};
    if (dx) {
      params['growth_edge_id'] = dx.id;
      params['concept'] = dx.concept_label;
    }
    params['goal_id'] = this.goalId();
    return params;
  });

  /**
   * The focal's mastery band as INFORMATION (not a gate, ADR-213 / design §5):
   * a mastered concept reads 100, else `masteryPercent(strength)` when a Growth
   * Edge is painted, else null ("not enough signal yet"). Null ≠ 0 — a fully
   * shaky concept is a legitimate 0.
   */
  readonly focalMasteryPercent = computed<number | null>(() => {
    const fc = this.focalConcept();
    if (!fc) return null;
    if (fc.mastered) return 100;
    const s = fc.growthEdge?.strength;
    return typeof s === 'number' ? masteryPercent(s) : null;
  });

  /** The map's PERSONAL "done for me" state (ADR-213 personal axis). */
  readonly isDone = computed<boolean>(
    () => !!this.graph()?.personalCompletedAt,
  );

  // ── Detail drawer (map-canvas-detail) ───────────────────────────────

  /** Open the detail drawer — a concept hex was clicked (focal or neighbour). */
  openDetail(): void {
    this._detailOpen.set(true);
    // Collapse the app nav so the canvas + drawer get the full width (owner
    // 2026-07-04); restored on close / leave.
    this.layout.requestSidebarCollapsed(true);
    // Glide the map so the focus re-centres on the uncovered left region (the
    // lens's own fit then keeps the whole immediate ring beside the drawer). The
    // drawer width + lens rect are stable immediately (no reflow), so measure now
    // for a cohesive glide; re-measure once the open paint + nav-collapse settle.
    this.recomputeLensShift();
    this.scheduleLensShift();
  }

  /** Close the detail drawer (× button or Escape). Map glides back to centre. */
  closeDetail(): void {
    this._detailOpen.set(false);
    this._deleteArmed.set(false);
    this._subGoalEditing.set(false);
    this.resetCampaignPanels();
    this.lensShiftX.set(0);
    // Restore the app nav (responsive default + the user's manual toggle).
    this.layout.requestSidebarCollapsed(null);
  }

  /** Re-measure the drawer-aware lens shift once the open reflow has painted. */
  private scheduleLensShift(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.recomputeLensShift()),
    );
  }

  /**
   * Measure how much of the lens the open drawer covers on the right, and set the
   * viewBox-unit shift that re-centres the focus on the uncovered left region.
   * Clears to 0 when the drawer is closed or geometry is absent (e.g. jsdom → no
   * layout). With `xMidYMid meet` the viewBox is uniformly scaled to FIT the scene
   * (letterboxed + centred), so the covered region is measured against the
   * rendered viewBox rect, not the raw scene box.
   */
  private recomputeLensShift(): void {
    if (!this._detailOpen()) {
      this.lensShiftX.set(0);
      return;
    }
    const root = this.host.nativeElement;
    const scene = root.querySelector('.concept-lens__scene');
    const drawer = root.querySelector<HTMLElement>('.mc-detail--drawer');
    if (!scene || !drawer) {
      this.lensShiftX.set(0);
      return;
    }
    const s = scene.getBoundingClientRect();
    if (s.width <= 0 || s.height <= 0) {
      this.lensShiftX.set(0);
      return;
    }
    // meet ⇒ uniform scale = min(w/vbW, h/vbH); the viewBox rect is centred in
    // the scene box (letterbox), so its right edge is inset by half the slack.
    const scale = Math.min(s.width / LENS_VIEWBOX_W, s.height / LENS_VIEWBOX_H);
    if (scale <= 0) {
      this.lensShiftX.set(0);
      return;
    }
    const renderedRight = s.left + (s.width + LENS_VIEWBOX_W * scale) / 2;
    // Drawer's FINAL left edge (offsetWidth is transform-independent → stable even
    // mid-slide); how much of the RENDERED map it covers on the right.
    const drawerLeft = Math.max(0, window.innerWidth - drawer.offsetWidth);
    const covered = Math.max(0, renderedRight - drawerLeft);
    if (covered <= 0) {
      this.lensShiftX.set(0);
      return;
    }
    this.lensShiftX.set(-Math.round(covered / 2 / scale));
  }

  /** Keep the re-centre shift aligned when the viewport resizes. */
  @HostListener('window:resize')
  onWindowResize(): void {
    if (this._detailOpen()) this.recomputeLensShift();
  }

  /** Escape closes the drawer while it is open (a11y — the modal-esque close). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this._detailOpen()) this.closeDetail();
  }

  /** Switch the active drawer tab (re-slices the drawer; the lens is untouched). */
  setTab(tab: DrawerTab): void {
    this._activeTab.set(tab);
  }

  /**
   * Goal-level Diagnose entry (ADR-238 D2). Because resolution is now goal-wide,
   * ANY entry is effectively goal-level — so this header action opens the Diagnose
   * tab WITHOUT needing a pre-picked concept. It anchors the drawer on the goal's
   * root (the goal IS the map, ADR-214), falling back to the current focal or the
   * first concept when there is no root. The upload from there carries `goal_id`,
   * so the backend resolves goal-wide regardless of which concept was the entry —
   * that concept is only a soft hint. No-op on an empty map (nothing to open).
   */
  /** ADR-238 D2: 'goal' while the goal-level entry owns the Diagnose form, so
   *  the panel omits the concept hint. Any explicit node selection resets it. */
  private readonly _diagnoseScope = signal<'concept' | 'goal'>('concept');
  readonly diagnoseScope = this._diagnoseScope.asReadonly();

  diagnoseMyMap(): void {
    const target =
      this.rootConceptId() || this.focalId() || this.concepts()[0]?.conceptId;
    if (!target) return;
    this.onSelect(target);
    this.setTab('diagnose');
    // AFTER onSelect: that call resets the scope to 'concept'. The concept here
    // is a drawer host, not a hint (ADR-238 D2 prerequisite).
    this._diagnoseScope.set('goal');
  }

  // ── Map switcher (overlay) — SP1 ────────────────────────────────────

  /**
   * Open the overlay map-switcher. Closes the concept drawer first (mutual
   * exclusion — never two drawers at once) and refreshes the maps list.
   */
  openSwitcher(): void {
    this.closeDetail();
    this.mapsService.load();
    this._switcherOpen.set(true);
  }

  /** Close the switcher (× / backdrop / after a pick). */
  closeSwitcher(): void {
    this._switcherOpen.set(false);
  }

  /**
   * Switch to another map IN PLACE: navigate to its route (the URL updates), and
   * the `goalId` effect then re-fetches its graph. No-op when it's already the
   * current map. Closes the switcher + the concept drawer (old-map concept).
   */
  switchToMap(targetGoalId: string): void {
    this.closeSwitcher();
    if (targetGoalId === this.goalId()) return;
    this.closeDetail();
    void this.router.navigate(['/a/knowledge', targetGoalId]);
  }

  /**
   * Trash clicked → open the confirm MODAL (danger variant). Delete only if
   * confirmed. A custom overlay dialog, NOT window.confirm — safe for the
   * browser-automation extension and non-blocking to the app.
   */
  async promptDeleteMap(goalId: string): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'aplus.knowledge.map_delete',
      message: 'aplus.knowledge.map_delete_confirm',
      confirmText: 'aplus.knowledge.map_delete_yes',
      cancelText: 'aplus.knowledge.cancel',
      variant: 'danger',
    });
    if (ok) this.deleteMap(goalId);
  }

  /**
   * Soft-delete a whole map from the switcher (reuses `MapsService.deleteMap`).
   * A "Map removed" toast on success; a fail-loud error toast on failure. If the
   * DELETED map is the one we're standing in, fall back to another map (else the
   * Atlas — SP4 repoints this at the dashboard). Guards against double-delete.
   */
  deleteMap(goalId: string): void {
    if (this._mapDeletingId()) return;
    this._mapDeletingId.set(goalId);
    this.mapsService
      .deleteMap(goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this._mapDeletingId.set(null);
          this.toast.show('aplus.knowledge.map_removed', 'success');
          const wasCurrent = goalId === this.goalId();
          // Read the fallback BEFORE load() blanks the list during its refetch.
          const next = wasCurrent
            ? this.mapsService.maps().find((m) => m.goalId !== goalId)
            : undefined;
          this.mapsService.load();
          if (wasCurrent) {
            this.closeSwitcher();
            void this.router.navigate(
              next ? ['/a/knowledge', next.goalId] : ['/a/knowledge'],
            );
          }
        },
        error: () => {
          this._mapDeletingId.set(null);
          this.toast.show('aplus.knowledge.map_delete_error', 'error');
        },
      });
  }

  ngOnInit(): void {
    this.loadedGoalId = this.goalId();
    this.load();
  }

  ngOnDestroy(): void {
    // Explicit effect teardown (idiomatic manual cleanup — also marks the ref read).
    this._reloadOnGoalChange.destroy();
    this._loadEdgesOnGrowthLens.destroy();
    this._focusCreateOnOpen.destroy();
    this._focusSubGoalOnEdit.destroy();
    // Leaving the map (drawer possibly open) must not leave the nav collapsed.
    this.layout.requestSidebarCollapsed(null);
  }

  // ── Load / refresh ──────────────────────────────────────────────────

  /** Initial fetch — shows the loading panel then the canvas (or error panel). */
  load(): void {
    this._state.set({ status: 'loading' });
    // A fresh map (initial or in-place switch) must not carry a stale seal modal
    // / campaign notice from the previous map.
    this._sealResult.set(null);
    this.sealError.set('');
    this.resetCampaignPanels();
    this.fetch(true);
  }

  private fetch(initial: boolean): void {
    this.mapsService
      .getGraph(this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (graph) => {
          this._state.set({ status: 'success', graph });
          this.reconcileFocal(graph);
          this.mutating.set(false);
          // Keep the Growth cache in step with the freshly-painted graph so the
          // Growth lens can't show a false "no weakness yet" that contradicts a
          // just-painted Shaky chip (e.g. right after a diagnose refetch).
          this.reloadEdgesIfLoaded();
          // Refresh the fog-ghost source alongside the graph so pending concept
          // suggestions fan onto the lens (and a just-accepted one clears). Fail-
          // soft: a suggestions error leaves the map intact with zero ghosts.
          if (graph.concepts.length > 0) this.loadSuggestions();
        },
        error: () => {
          if (initial) {
            this._state.set({
              status: 'error',
              errorKey: 'aplus.knowledge.canvas_error',
            });
          } else {
            this.toast.show('aplus.knowledge.reload_error', 'error');
          }
          this.mutating.set(false);
        },
      });
  }

  /** Keep the trail on still-existing concepts; seed to the root when empty. */
  private reconcileFocal(graph: MapGraph): void {
    const existing = new Set(graph.concepts.map((c) => c.conceptId));
    let t = this.trail().filter((id) => existing.has(id));
    if (t.length === 0) {
      const root =
        graph.rootConceptId && existing.has(graph.rootConceptId)
          ? graph.rootConceptId
          : (graph.concepts[0]?.conceptId ?? '');
      t = root ? [root] : [];
    }
    this.trail.set(t);
  }

  /** Retry the map load after an error. */
  retry(): void {
    this.load();
  }

  /**
   * Silent refetch used by lens children (the Familiar panel's `changed` output):
   * re-pulls the map graph WITHOUT the full loading panel, so a summon / accepted
   * suggestion / completed diagnose refreshes the map (and re-paints the shaky /
   * bond overlays) in place rather than flashing the whole canvas.
   */
  refresh(): void {
    // A lens child (the Familiar panel) asked to re-sync. Skip while a map-canvas
    // mutation is in flight — its own completion refetch will pull the child's
    // change too — so a child refresh can't prematurely clear the mutating guard.
    if (!this.mutating()) this.fetch(false);
  }

  /**
   * The Familiar panel just placed ≥1 growth edge (ADR-238 D5 auto-reveal). Switch
   * to the Growth lens so every node chora-consumption resolved lights up (the
   * server paints `growthEdge` on the affected concepts) — the learner sees WHERE
   * the marked test's weaknesses landed, not just a "done" banner. The paired
   * `changed` output already triggered the silent map refetch that repaints them.
   */
  onDiagnosed(): void {
    this.setLens('growth');
  }

  private mutate<T>(
    op: Observable<T>,
    successKey: string,
    onSuccess?: (result: T) => void,
  ): void {
    if (this.mutating()) return;
    this.mutating.set(true);
    op.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        onSuccess?.(result);
        this.toast.show(successKey, 'success');
        this.fetch(false);
      },
      error: () => {
        this.toast.show('aplus.knowledge.action_error', 'error');
        // Refetch on failure too: a chained op (create+connect, reroot+re-anchor)
        // may have committed its FIRST leg server-side, so pull the real state
        // rather than leaving an invisible orphan / a stale goal root. fetch()
        // clears `mutating` when it settles.
        this.fetch(false);
      },
    });
  }

  // ── Navigation (trail / Back / overflow) ────────────────────────────

  /**
   * A concept node was tapped on the lens → focus it (push the trail) AND open
   * its detail (the concept is the trigger — ADR-212 direct manipulation). The
   * lens component itself eases onto the node + keeps its immediate ring in view.
   * Tapping the current focus is a no-op on the trail and simply (re)opens the
   * drawer.
   */
  onSelect(conceptId: string): void {
    this._deleteArmed.set(false); // a fresh concept starts un-armed
    this._subGoalEditing.set(false); // …and its objective editor closed
    this._diagnoseScope.set('concept'); // an explicit pick IS the hint
    this.resetCampaignPanels(); // …and un-restructuring (old focal's merge/split)
    this.pushFocal(conceptId);
    this.openDetail();
    // Load the learner's Growth Edges the moment a concept is opened (idempotent —
    // loads once, caches) so the drawer's growth diagnosis is available in EVERY
    // lens, not only after an explicit Growth-lens entry. Fail-soft, mirroring
    // setLens('growth'): an edges-load error can't break the canvas.
    this.ensureEdgesLoaded();
  }

  private pushFocal(id: string): void {
    if (!id) return;
    // Truncate-to-existing on a cycle-back move (e.g. recenter child → its
    // parent): keep the trail a simple path so the breadcrumb never carries a
    // duplicate id (which Angular's @for track flags as NG0955 + doubles the
    // crumb). Mirrors jumpTo's semantics.
    this.trail.update((t) => {
      const at = t.indexOf(id);
      return at >= 0 ? t.slice(0, at + 1) : [...t, id];
    });
  }

  back(): void {
    this.trail.update((t) => (t.length > 1 ? t.slice(0, -1) : t));
  }

  /** Jump to an earlier crumb (truncates the trail to that point). */
  jumpTo(index: number): void {
    this.trail.update((t) =>
      index >= 0 && index < t.length ? t.slice(0, index + 1) : t,
    );
  }

  conceptTitle(id: string): string {
    return this.concepts().find((c) => c.conceptId === id)?.title ?? id;
  }

  // ── Create a concept (＋ concept) ────────────────────────────────────

  openCreate(): void {
    this.createTitle.set('');
    this.createConnect.set(true);
    this.createOpen.set(true);
    // Bump so the focus/scroll effect re-runs even if the form was already open
    // (e.g. +Concept after selecting another node), CHO-2320.
    this._focusTick.update((n) => n + 1);
  }

  cancelCreate(): void {
    this.createOpen.set(false);
    this.createTitle.set('');
  }

  onCreateTitleInput(event: Event): void {
    this.createTitle.set((event.target as HTMLInputElement).value);
  }

  onCreateConnectChange(event: Event): void {
    this.createConnect.set((event.target as HTMLInputElement).checked);
  }

  /**
   * Create a concept, then (when there is a focal and "connect" is on) draw a
   * hierarchy edge focal→new so the map grows as a tree. Focuses the new concept
   * once the refetch lands. Explicit + manual, zero-LLM.
   */
  submitCreate(): void {
    if (this.mutating()) return;
    const title = this.createTitle().trim();
    if (!title) return;
    const focal = this.focalId();
    const connect = this.createConnect() && !!focal;
    const op = this.conceptGraph.createConcept({ title }).pipe(
      switchMap((created) =>
        connect
          ? this.conceptGraph
              .createEdge({
                sourceConceptId: focal,
                targetConceptId: created.conceptId,
                class: 'hierarchy',
              })
              .pipe(map(() => created))
          : of(created),
      ),
    );
    this.mutate(op, 'aplus.knowledge.concept_created', (created) => {
      // Focus the freshly-minted concept — it exists after the refetch, so the
      // reconcile keeps it on the trail tip.
      this.trail.update((t) => [...t, created.conceptId]);
      this.cancelCreate();
    });
  }

  // ── Connect two concepts (click-to-connect) ─────────────────────────

  openConnect(): void {
    this.connectSourceId.set(null);
    this.connectClass.set('hierarchy');
    this.connectMode.set(true);
  }

  cancelConnect(): void {
    this.connectMode.set(false);
    this.connectSourceId.set(null);
  }

  setConnectClass(cls: EdgeClass): void {
    this.connectClass.set(cls);
  }

  /**
   * Click-to-connect: the first node tap picks the SOURCE, the second the TARGET
   * (fires the edge with the chosen class). Tapping the source again deselects.
   */
  pickConnectNode(id: string): void {
    if (this.mutating()) return;
    const src = this.connectSourceId();
    if (!src) {
      this.connectSourceId.set(id);
      return;
    }
    if (src === id) {
      this.connectSourceId.set(null);
      return;
    }
    this.mutate(
      this.conceptGraph.createEdge({
        sourceConceptId: src,
        targetConceptId: id,
        class: this.connectClass(),
      }),
      'aplus.knowledge.edge_created',
      () => this.cancelConnect(),
    );
  }

  // ── Make root (re-root the map + re-anchor the Goal, ADR-214 D1) ─────

  /**
   * Re-root the concept graph on the focal, THEN re-anchor the Goal's
   * `rootConceptId` to match (goal evolution = re-rooting). Chained so the Goal
   * only moves once the graph reroot succeeds.
   */
  onMakeRoot(): void {
    const id = this.focalId();
    if (!id || this.mutating()) return;
    const goalId = this.goalId();
    const op = this.conceptGraph.reroot({ newRootId: id }).pipe(
      switchMap((res) =>
        this.goalService
          .update(goalId, { rootConceptId: id })
          .pipe(map(() => res)),
      ),
    );
    this.mutate(op, 'aplus.knowledge.reroot_success');
  }

  // ── Atoms (attach via the shared picker; NO raw-UUID paste) ─────────

  togglePicker(): void {
    this.showPicker.update((v) => !v);
  }

  onAtomPicked(ref: QuestionRef): void {
    this.attachAtoms([ref.id]);
  }

  onAtomsPicked(refs: readonly QuestionRef[]): void {
    this.attachAtoms(refs.map((r) => r.id));
  }

  private attachAtoms(ids: readonly string[]): void {
    const focal = this.focalId();
    if (!focal || ids.length === 0) return;
    this.mutate(
      this.conceptGraph.patchConcept(focal, { addAtomRefs: [...ids] }),
      'aplus.knowledge.atoms_attached',
    );
  }

  detachAtom(ref: string): void {
    const focal = this.focalId();
    if (!focal) return;
    this.mutate(
      this.conceptGraph.patchConcept(focal, { removeAtomRefs: [ref] }),
      'aplus.knowledge.atom_detached',
    );
  }

  /** Arm / disarm the two-step inline delete confirm for the focal concept. */
  armDelete(): void {
    this._deleteArmed.set(true);
  }
  disarmDelete(): void {
    this._deleteArmed.set(false);
  }

  /**
   * Soft-delete the focal concept (learner-owned; server soft-deletes). NEVER the
   * map root — deleting it would orphan the map (guarded here + the affordance is
   * hidden for the root). On success drop it from the trail so focus falls back to
   * its parent/root, close the drawer, and let the completion refetch reconcile
   * the graph. Dangling edges to it are refetched away (the canvas guards them).
   */
  deleteFocalConcept(): void {
    const id = this.focalId();
    if (!id || this.isFocalRoot()) return;
    this._deleteArmed.set(false);
    this.mutate(
      this.conceptGraph.deleteConcept(id),
      'aplus.knowledge.concept_deleted',
      () => {
        this.trail.update((t) => t.filter((x) => x !== id));
        this.closeDetail();
      },
    );
  }

  // ── Per-node objective / sub-goal (ADR-247, CHO-2328) ──────────────

  /** Open the inline objective editor, seeding the draft with the current value. */
  openSubGoalEdit(): void {
    this.subGoalDraft.set(this.focalSubGoal());
    this._subGoalEditing.set(true);
  }

  /** Close the inline objective editor without saving. */
  cancelSubGoalEdit(): void {
    this._subGoalEditing.set(false);
  }

  onSubGoalInput(event: Event): void {
    this.subGoalDraft.set((event.target as HTMLInputElement).value);
  }

  /**
   * Esc inside the objective input cancels the edit WITHOUT bubbling to the
   * drawer-close Escape handler (which would otherwise close the whole drawer).
   */
  onSubGoalEscape(event: Event): void {
    event.stopPropagation();
    this.cancelSubGoalEdit();
  }

  /**
   * Save the focal concept's objective. A trimmed-empty value CLEARS it
   * (PATCH `{ subGoal: "" }`). On success, splice the echoed DTO's `subGoal` +
   * `subGoalProvenance` into the LOCAL focal node so the drawer reflects it
   * without a full map reload (mirrors the local-state update pattern). Fail-
   * loud: a failure toasts and leaves the editor open so the learner can retry.
   */
  saveSubGoal(): void {
    if (this.mutating()) return;
    const focal = this.focalId();
    if (!focal) return;
    const next = this.subGoalDraft().trim();
    this.mutating.set(true);
    this.conceptGraph
      .patchConcept(focal, { subGoal: next })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dto) => {
          this.applySubGoalLocally(
            focal,
            dto.subGoal ?? '',
            dto.subGoalProvenance ?? '',
          );
          this._subGoalEditing.set(false);
          this.mutating.set(false);
          this.toast.show('aplus.knowledge.subgoal_saved', 'success');
        },
        error: () => {
          this.mutating.set(false);
          this.toast.show('aplus.knowledge.action_error', 'error');
        },
      });
  }

  /**
   * Splice a saved objective into the local graph's matching concept so the
   * drawer reflects it in place (no refetch). No-op off the success state.
   */
  private applySubGoalLocally(
    conceptId: string,
    subGoal: string,
    subGoalProvenance: string,
  ): void {
    this._state.update((s) => {
      if (s.status !== 'success') return s;
      const concepts = s.graph.concepts.map((c) =>
        c.conceptId === conceptId ? { ...c, subGoal, subGoalProvenance } : c,
      );
      return { status: 'success', graph: { ...s.graph, concepts } };
    });
  }

  // ── Lens layer (WS-D) ───────────────────────────────────────────────

  /**
   * Switch the active lens. Purely a view-overlay change (no capability flips):
   * it re-emphasises the same nodes + retargets the detail panel. Entering the
   * Growth lens lazily loads the learner's Growth Edges once (fail-soft).
   */
  setLens(lens: MapLens): void {
    this.layers.setLens(lens);
  }

  /** Show or hide the Roads layer (C4). Delegates to the layer owner. */
  toggleRoads(): void {
    this.layers.toggleRoads();
  }

  /**
   * Load the Growth Edges the FIRST time the Growth lens comes on, wherever the
   * switch was thrown.
   *
   * This is an effect rather than a line inside `setLens` because `setLens` is no
   * longer the only way in: the HUD flips the lens through MapLayersService
   * directly, and a lazy load hanging off one caller would leave the Growth lens
   * painted from an empty cache when the other caller was used. Owner ruling D3
   * keeps the load LAZY either way: it never runs on map open.
   */
  private readonly _loadEdgesOnGrowthLens = effect(() => {
    const lens = this.lens();
    untracked(() => {
      if (lens === 'growth') this.ensureEdgesLoaded();
    });
  });

  /**
   * Re-pull the Growth Edges when they were ALREADY loaded (Growth lens opened),
   * so a map refetch that follows a diagnose (which mints/updates edges + paints
   * new shaky nodes server-side) refreshes the cache the Growth lens reads from.
   * Fail-soft: a transient reload failure keeps the last-good cache (never blanks
   * the lens or flips it to error). No-op until the learner opens the Growth lens.
   */
  private reloadEdgesIfLoaded(): void {
    if (this.edgesStatus() !== 'ready') return;
    this.growthEdges
      .listAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.edges.set(page.items),
        error: () => {
          /* keep the last-good edges cache; a reload blip must not blank Growth */
        },
      });
  }

  /** Fetch every Growth Edge ONCE for the Growth lens; fail-soft (no throw). */
  private ensureEdgesLoaded(): void {
    const s = this.edgesStatus();
    if (s === 'loading' || s === 'ready') return;
    this.edgesStatus.set('loading');
    this.growthEdges
      .listAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.edges.set(page.items);
          this.edgesStatus.set('ready');
        },
        error: () => {
          // Fail-soft: the canvas is unaffected; the Growth panel shows an honest
          // "couldn't load your growth signals" note rather than a false empty.
          this.edges.set([]);
          this.edgesStatus.set('error');
        },
      });
  }

  /**
   * ⚡ Practice — take the learner to the live drill/dose surface to work the
   * focal concept's weakness. Navigates to `/a/daily-dose` (the same surface the
   * Familiar panel's dose CTA uses); the button is shown only when the focal has
   * cached drill atoms (template gate), so this is never a dead affordance.
   */
  requestPractice(): void {
    // A live campaign hex practices in the ?campaign_node= banner lane (rung /
    // paced / won feedback), never the campaign-blind weakness dose (CHO-2314),
    // reachable even when the hex is not the march-here focus. Non-campaign
    // concepts keep the growth-edge weakness dose.
    if (this.focalIsCampaignHex()) {
      this.practiceHex();
      return;
    }
    // Always a scoped navigation now: `doseQueryParams` carries this map's
    // goal_id even with no growth edge painted (ADR-242 D2), so there is no
    // param-less arm left to guard.
    this.router.navigate(['/a/daily-dose'], {
      queryParams: this.doseQueryParams(),
    });
  }

  /**
   * Toggle the map's PERSONAL "done for me" axis (ADR-213). Self-declared — this
   * is NOT an operator-verified credential. PATCHes the Goal then re-fetches so
   * `personalCompletedAt` (and the badge) reflect the server's truth.
   */
  toggleDoneForMe(): void {
    if (!this.graph() || this.mutating()) return;
    const next = !this.isDone();
    this.mutate(
      this.goalService.update(this.goalId(), { personalComplete: next }),
      next ? 'aplus.knowledge.done_for_me_set' : 'aplus.knowledge.reopened',
    );
  }

  // ═══ Familiar Campaign (WS-C7 — CHO-2086, ADR-227 D14/D15/D16) ═══════
  // Campaign chrome is an ALWAYS-ON overlay composing with every lens paint (the
  // lens fills hexes; the campaign paints ladder / frontier / province). The HUD,
  // march copy and seal ceremony celebrate via the Familiar and show ONLY when a
  // Familiar is attached; the base ladder paint renders for every learner.

  /** Pending suggestions (whole-map) — the fog-ghost source. Fail-soft empty. */
  private readonly _suggestions = signal<readonly ConceptSuggestion[]>([]);

  /** The goal-level campaign block, or null (rootless / fail-soft read). */
  readonly campaign = computed<MapCampaign | null>(
    () => this.graph()?.campaign ?? null,
  );
  readonly hasCampaign = computed<boolean>(() => this.campaign() !== null);

  /** True when the focal concept is a LIVE (unwon) campaign hex that carries a
   *  per-node ladder state in the campaign block. Drives the practice-lane
   *  reroute (CHO-2314): a campaign hex practices in the ?campaign_node= banner
   *  lane (rung / paced / won feedback), never the campaign-blind weakness dose. */
  readonly focalIsCampaignHex = computed<boolean>(() => {
    const id = this.focalId();
    const node = id ? this.campaign()?.nodes?.[id] : undefined;
    return !!node && !node.wonAt;
  });

  /** The map's designated Familiar (0..1) — the HUD / march / seal gate on it. */
  readonly attachedFamiliarId = computed<string | undefined>(
    () => this.graph()?.attachedFamiliarId,
  );
  readonly hasFamiliar = computed<boolean>(() => !!this.attachedFamiliarId());
  /**
   * The bound Familiar's learner-safe display name (CHO-2109); '' when the map
   * read omitted it (fail-soft) — the HUD then keeps the neutral march copy.
   */
  readonly familiarName = computed<string>(
    () => this.graph()?.attachedFamiliarName?.trim() ?? '',
  );

  /**
   * Fog ghosts = PENDING concept-kind suggestions fanned around the node the
   * learner is actually looking at (CHO-2115, owner ruling 2026-07-10): only
   * the SELECTED non-root focal fans its own ghosts — the root (or no
   * selection) shows none, and a focal without pending suggestions shows
   * none. The always-on all-nodes fan (WS-C7) read as noise on
   * suggestion-rich maps. Needs the suggestion's `focalConceptId` on the
   * wire; a missing anchor yields zero ghosts (fail-soft), never a broken map.
   */
  readonly fogGhosts = computed<readonly FogGhost[]>(() => {
    const focal = this.focalId();
    if (!focal || focal === this.rootConceptId()) return [];
    const onMap = new Set(this.concepts().map((c) => c.conceptId));
    if (!onMap.has(focal)) return [];
    return this._suggestions()
      .filter(
        (s): s is ConceptSuggestion & { focalConceptId: string } =>
          s.status === 'pending' &&
          s.kind === 'concept' &&
          s.focalConceptId === focal,
      )
      .map((s) => ({
        suggestionId: s.suggestionId,
        title: s.title ?? '',
        focalConceptId: s.focalConceptId,
      }));
  });

  // ── Campaign FOCUS (the single "March here" pointer, D16) ────────────
  readonly campaignFocusId = computed<string | undefined>(
    () => this.campaign()?.focusConceptId,
  );
  readonly focusConcept = computed<ConceptNode | null>(() => {
    const id = this.campaignFocusId();
    return id ? (this.concepts().find((c) => c.conceptId === id) ?? null) : null;
  });
  readonly focusTitle = computed<string>(() => this.focusConcept()?.title ?? '');
  readonly isFocusUnassigned = computed<boolean>(() => !this.campaignFocusId());

  // ── HUD (frontier tally + focus today-state) ─────────────────────────
  readonly frontierWon = computed<number>(() => this.campaign()?.frontierWon ?? 0);
  readonly frontierTotal = computed<number>(
    () => this.campaign()?.frontierTotal ?? 0,
  );
  readonly canSeal = computed<boolean>(() => this.campaign()?.canSeal ?? false);
  /** The marching HUD shows only when a Familiar rides the campaign. */
  readonly showCampaignHud = computed<boolean>(
    () => this.hasCampaign() && this.hasFamiliar(),
  );
  /** Campaign present but no Familiar → an inviting empty slot (no HUD). */
  readonly showCampaignHudEmpty = computed<boolean>(
    () => this.hasCampaign() && !this.hasFamiliar(),
  );

  /** The campaign-focus node's today-state (drives the HUD chip). */
  private readonly focusNodeState = computed<CampaignNodeState | null>(() => {
    const id = this.campaignFocusId();
    const c = this.campaign();
    return id && c ? (c.nodes[id] ?? null) : null;
  });
  readonly focusAdvancedToday = computed<boolean>(
    () => this.focusNodeState()?.advancedToday ?? false,
  );
  readonly focusCooling = computed<boolean>(
    () => this.focusNodeState()?.cooling ?? false,
  );

  // ── Drawer campaign panel (the FOCAL concept's ladder) ───────────────
  /** The FOCAL concept's ladder state (distinct from the campaign focus). */
  readonly focalNodeState = computed<CampaignNodeState | null>(() => {
    const id = this.focalId();
    const c = this.campaign();
    return id && c ? (c.nodes[id] ?? null) : null;
  });
  readonly focalWon = computed<boolean>(() => !!this.focalNodeState()?.wonAt);
  readonly focalWonAt = computed<string | undefined>(
    () => this.focalNodeState()?.wonAt,
  );
  readonly focalCooling = computed<boolean>(
    () => this.focalNodeState()?.cooling ?? false,
  );
  readonly focalRungsCleared = computed<number>(
    () => this.focalNodeState()?.rungsCleared ?? 0,
  );
  /** Is the drawer's focal concept the campaign's march target? */
  readonly focalIsCampaignFocus = computed<boolean>(
    () => !!this.focalId() && this.focalId() === this.campaignFocusId(),
  );
  /** Six ladder pips; `true` = a cleared rung (original-Bloom order). */
  readonly focalRungPips = computed<readonly boolean[]>(() => {
    const cleared = this.focalRungsCleared();
    return Array.from({ length: CAMPAIGN_TOTAL_RUNGS }, (_, i) => i < cleared);
  });
  /** The revised-Bloom i18n label of the NEXT rung (rungsCleared+1); null=won. */
  readonly focalNextRungLabelKey = computed<string | null>(() => {
    if (this.focalWon()) return null;
    return CAMPAIGN_RUNG_LABEL_KEYS[this.focalRungsCleared() + 1] ?? null;
  });
  /** Province (won) → cooling → frontier. A live node is never "fog" (ghosts are). */
  readonly focalCampaignStateKey = computed<string>(() => {
    if (this.focalWon()) return 'aplus.knowledge.campaign_state_province';
    if (this.focalCooling()) return 'aplus.knowledge.campaign_cooling';
    return 'aplus.knowledge.campaign_state_frontier';
  });
  /** Held-count: won hierarchy-descendants under a won focal (province badge). */
  readonly focalHeldCount = computed<number>(() => {
    const c = this.campaign();
    const rootId = this.focalId();
    if (!c || !rootId || !this.focalWon()) return 0;
    const childrenOf = new Map<string, string[]>();
    for (const e of this.conceptEdges()) {
      if (e.class === 'hierarchy') {
        const arr = childrenOf.get(e.sourceConceptId) ?? [];
        arr.push(e.targetConceptId);
        childrenOf.set(e.sourceConceptId, arr);
      }
    }
    let held = 0;
    const seen = new Set<string>([rootId]);
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      if (c.nodes[id]?.wonAt) held += 1;
      stack.push(...(childrenOf.get(id) ?? []));
    }
    return held;
  });

  /** Direct neighbours (hierarchy parent + children + laterals) — merge
   *  survivor candidates. */
  readonly focalNeighbours = computed<readonly ConceptNode[]>(() => {
    const id = this.focalId();
    if (!id) return [];
    const ids = new Set<string>();
    for (const e of this.conceptEdges()) {
      if (e.sourceConceptId === id) ids.add(e.targetConceptId);
      else if (e.targetConceptId === id) ids.add(e.sourceConceptId);
    }
    const byId = new Map(this.concepts().map((c) => [c.conceptId, c]));
    const out: ConceptNode[] = [];
    for (const nid of ids) {
      const c = byId.get(nid);
      if (c) out.push(c);
    }
    return out;
  });

  /** Merge/split are offered on NON-ROOT campaign nodes only (root can't be
   *  merged away or split). */
  readonly focalCanRestructure = computed<boolean>(
    () => this.hasCampaign() && !!this.focalId() && !this.isFocalRoot(),
  );

  // ── Campaign action UI state ─────────────────────────────────────────
  /** Inline notice (i18n key) for a failed focus / merge / split; '' = none. */
  readonly campaignActionError = signal<string>('');
  private readonly _mergeOpen = signal<boolean>(false);
  readonly mergeOpen = this._mergeOpen.asReadonly();
  private readonly _splitOpen = signal<boolean>(false);
  readonly splitOpen = this._splitOpen.asReadonly();
  /** Split child titles (2 default, ≤6). */
  readonly splitChildren = signal<readonly string[]>(['', '']);
  private readonly _splitFocusIndex = signal<number>(0);
  readonly splitFocusIndex = this._splitFocusIndex.asReadonly();
  /** Split is submittable with ≥2 children, each named. */
  readonly canSplit = computed<boolean>(() => {
    const cs = this.splitChildren();
    return cs.length >= 2 && cs.every((t) => t.trim().length > 0);
  });

  // ── Seal ceremony state ──────────────────────────────────────────────
  readonly sealing = signal<boolean>(false);
  private readonly _sealResult = signal<CampaignSealResult | null>(null);
  readonly sealResult = this._sealResult.asReadonly();
  /** Inline seal notice (i18n key) for a 409/422; '' = none. */
  readonly sealError = signal<string>('');
  /** Hexes still holding out (FRONTIER_NOT_EMPTY) — the seal notice's count. */
  readonly sealErrorCount = signal<number>(0);

  /**
   * Fog tap: focus the anchor node + open its Suggestions tab (the ghost is a
   * pending suggestion around that node). Mirrors `onSelect`'s prefetch.
   */
  onFogTap(conceptId: string): void {
    if (!conceptId) return;
    this.disarmDelete();
    this._subGoalEditing.set(false);
    this.resetCampaignPanels();
    this.pushFocal(conceptId);
    this.openDetail();
    this.setTab('suggestions');
    this.ensureEdgesLoaded();
  }

  /** March here — set the single campaign focus to the focal (BE also retargets
   *  Familiar resonance). On success the graph silently refetches. */
  marchHere(): void {
    const id = this.focalId();
    if (!id) return;
    this.runCampaignMutation(
      this.campaignService.setFocus(this.goalId(), id),
      'focus',
    );
  }

  /** Stand down — clear the campaign focus (offered on the current focus node). */
  clearFocus(): void {
    this.runCampaignMutation(
      this.campaignService.setFocus(this.goalId(), null),
      'focus',
    );
  }

  /** Practice THIS hex — the node-scoped campaign practice lane on the dose
   *  surface (FE3 mounts campaign-practice mode from these params). */
  practiceHex(): void {
    const fc = this.focalConcept();
    if (!fc) return;
    void this.router.navigate(['/a/daily-dose'], {
      queryParams: {
        campaign_node: fc.conceptId,
        goal_id: this.goalId(),
        concept: fc.title,
      },
    });
  }

  // ── Merge (absorb the focal into a chosen neighbour) ─────────────────
  openMerge(): void {
    this._splitOpen.set(false);
    this.campaignActionError.set('');
    this._mergeOpen.set(true);
  }
  cancelMerge(): void {
    this._mergeOpen.set(false);
  }
  confirmMerge(survivorId: string): void {
    const id = this.focalId();
    if (!id || !survivorId) return;
    this.runCampaignMutation(
      this.campaignService.merge(id, survivorId),
      'merge',
      () => this.closeDetail(),
    );
  }

  // ── Split (divide the focal into ≥2 children) ────────────────────────
  openSplit(): void {
    this._mergeOpen.set(false);
    this.campaignActionError.set('');
    this.splitChildren.set(['', '']);
    this._splitFocusIndex.set(0);
    this._splitOpen.set(true);
  }
  cancelSplit(): void {
    this._splitOpen.set(false);
  }
  addSplitChild(): void {
    this.splitChildren.update((cs) => (cs.length >= 6 ? cs : [...cs, '']));
  }
  onSplitChildInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.splitChildren.update((cs) => cs.map((t, i) => (i === index ? value : t)));
  }
  setSplitFocusIndex(index: number): void {
    this._splitFocusIndex.set(index);
  }
  confirmSplit(): void {
    const parent = this.focalId();
    if (!parent || !this.canSplit()) return;
    const children = this.splitChildren().map((t) => ({ title: t.trim() }));
    this.runCampaignMutation(
      this.campaignService.split(parent, {
        children,
        focusChildIndex: this.splitFocusIndex(),
      }),
      'split',
      () => this.closeDetail(),
    );
  }

  /**
   * Seal the campaign (frontier empty → fortify every province). Success opens
   * the celebration modal + silently refetches; a 409/422 surfaces an honest
   * inline notice (FRONTIER_NOT_EMPTY carries the remaining-hex count).
   */
  sealNow(): void {
    if (this.sealing() || this.mutating()) return;
    this.sealError.set('');
    this.sealErrorCount.set(0);
    this.sealing.set(true);
    this.campaignService
      .seal(this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.sealing.set(false);
          this._sealResult.set(res);
          this.fetch(false);
        },
        error: (err) => {
          this.sealing.set(false);
          if (campaignErrorCode(err) === 'FRONTIER_NOT_EMPTY') {
            this.sealErrorCount.set(
              Math.max(0, this.frontierTotal() - this.frontierWon()),
            );
          }
          this.sealError.set(campaignErrorKey('seal', err));
        },
      });
  }
  dismissSeal(): void {
    this._sealResult.set(null);
  }

  private resetCampaignPanels(): void {
    this._mergeOpen.set(false);
    this._splitOpen.set(false);
    this.campaignActionError.set('');
  }

  /** Pull whole-map pending suggestions for the fog-ghost overlay (fail-soft). */
  private loadSuggestions(): void {
    this.conceptGraph
      .getSuggestions(undefined, this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => this._suggestions.set(list.suggestions ?? []),
        error: () => this._suggestions.set([]),
      });
  }

  /**
   * Run a focus / merge / split mutation with the `mutating` guard + an HONEST
   * per-door error notice (`campaignErrorKey`). On success the graph silently
   * refetches (which clears `mutating` + repaints the campaign); a 4xx sets the
   * inline notice and leaves the drawer open so the learner can adjust + retry.
   */
  private runCampaignMutation<T>(
    op$: Observable<T>,
    errorOp: 'focus' | 'merge' | 'split',
    onSuccess?: (result: T) => void,
  ): void {
    if (this.mutating()) return;
    this.campaignActionError.set('');
    this.mutating.set(true);
    op$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        onSuccess?.(result);
        this.fetch(false);
      },
      error: (err) => {
        this.campaignActionError.set(campaignErrorKey(errorOp, err));
        this.mutating.set(false);
      },
    });
  }
}
