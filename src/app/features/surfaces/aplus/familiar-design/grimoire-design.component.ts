/**
 * GrimoireDesignComponent — the Grimoire, a learner's Familiar-design surface
 * (CHO-2016 / ADR-219 D1). A tabbed builder at `/a/companion/:familiarId/design`,
 * launched from the Familiar profile + map lens (never on `/a/knowledge`).
 *
 * Tabs unlock progressively with the Familiar's growth stage — Loadout at st2
 * (awakening), Rituals at st4 (structural) — and the st3 Aha moment previews
 * the FULL Grimoire for its 24h window. Locked tabs render an honest "unlocks
 * at {stage}" tease; they are NEVER hidden (the carrot, ADR-149/219).
 *
 * The Persona tab (ADR-219 D2) lands with CHO-2015; the tab strip is
 * data-driven so it slots in with no shell change. Every tab shown here mounts
 * REAL content — no placeholder tabs (fail-loud / no-stubs).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarLoadoutComponent } from '../../../../shared/components/familiar-loadout/familiar-loadout.component';
import { RoutinesTabComponent } from './routines/routines-tab.component';
import { PersonaTabComponent } from './persona/persona-tab.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import {
  STAGE_NAMES,
  type FamiliarGrowthState,
  type GrowthStage,
} from '../../../../core/familiar/familiar-growth.model';
import { RITUAL_UNLOCK_STAGE } from '../../../../core/familiar/familiar-ritual.model';

/** Loadout unlocks at st2 (awakening). */
const LOADOUT_UNLOCK_STAGE = 2 as GrowthStage;
/** Persona unlocks at st1 (once hatched — the "who your Familiar IS" surface). */
const PERSONA_UNLOCK_STAGE = 1 as GrowthStage;

export type GrimoireTabKey = 'persona' | 'loadout' | 'routines';

interface GrimoireTab {
  readonly key: GrimoireTabKey;
  readonly labelKey: string;
  readonly unlockStage: GrowthStage;
}

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly growth: FamiliarGrowthState }
  | { readonly status: 'error'; readonly error: string };

@Component({
  selector: 'chora-grimoire-design',
  standalone: true,
  imports: [
    TranslatePipe,
    BreedArtComponent,
    FamiliarLoadoutComponent,
    RoutinesTabComponent,
    PersonaTabComponent,
  ],
  templateUrl: './grimoire-design.component.html',
  styleUrl: './grimoire-design.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrimoireDesignComponent {
  private readonly growthSvc = inject(FamiliarGrowthService);

  /** Route param bound via withComponentInputBinding. */
  readonly familiarId = input.required<string>();

  /** Imperative reload after an error-state retry. */
  private readonly reload$ = new Subject<void>();

  /** Fail-loud growth-state load (drives progressive-unlock + breed chrome). */
  readonly state = toSignal(
    merge(
      toObservable(this.familiarId),
      this.reload$.pipe(map(() => this.familiarId())),
    ).pipe(switchMap((id) => this.loadFor(id))),
    { initialValue: { status: 'loading' } as ViewState },
  );

  readonly tabs: readonly GrimoireTab[] = [
    { key: 'persona', labelKey: 'familiar_grimoire.tab.persona', unlockStage: PERSONA_UNLOCK_STAGE },
    { key: 'loadout', labelKey: 'familiar_grimoire.tab.loadout', unlockStage: LOADOUT_UNLOCK_STAGE },
    {
      key: 'routines',
      labelKey: 'familiar_grimoire.tab.routines',
      unlockStage: RITUAL_UNLOCK_STAGE as GrowthStage,
    },
  ];

  readonly activeTab = signal<GrimoireTabKey>('persona');

  readonly growth = computed<FamiliarGrowthState | null>(() => {
    const s = this.state();
    return s.status === 'success' ? s.growth : null;
  });

  readonly stage = computed<GrowthStage>(() => this.growth()?.growthStage ?? 0);
  readonly species = computed(() => this.growth()?.species ?? '');
  readonly displayName = computed(() => this.growth()?.displayName ?? '');

  /**
   * The st3 Aha moment previews the whole Grimoire for its 24h window
   * (ADR-219 D1) — every tab is temporarily unlocked while it is active.
   */
  readonly ahaPreviewActive = computed<boolean>(() => {
    const until = this.growth()?.ahaMomentActiveUntil;
    if (!until) return false;
    const t = Date.parse(until);
    return Number.isFinite(t) && t > Date.now();
  });

  /** The GrimoireTab currently selected. */
  readonly activeTabModel = computed<GrimoireTab>(
    () => this.tabs.find((t) => t.key === this.activeTab()) ?? this.tabs[0],
  );

  /** Whether the selected tab is usable (vs showing its unlock tease). */
  readonly activeTabUnlocked = computed<boolean>(() =>
    this.isUnlocked(this.activeTabModel()),
  );

  constructor() {
    // Land on the first unlocked tab once growth resolves, so a structural
    // Familiar opens on Rituals-capable chrome without an extra click, while a
    // pre-st2 Familiar still sees (locked) tabs rather than a blank surface.
    effect(() => {
      const s = this.state();
      if (s.status !== 'success') return;
      const firstUnlocked = this.tabs.find((t) => this.isUnlocked(t));
      if (firstUnlocked && !this.activeTabUnlocked()) {
        this.activeTab.set(firstUnlocked.key);
      }
    });
  }

  private loadFor(id: string): Observable<ViewState> {
    if (!id) return of<ViewState>({ status: 'loading' });
    return this.growthSvc.getGrowth(id).pipe(
      map((growth): ViewState => ({ status: 'success', growth })),
      catchError(() =>
        of<ViewState>({ status: 'error', error: 'familiar_grimoire.load_error' }),
      ),
      startWith<ViewState>({ status: 'loading' }),
    );
  }

  /** A tab is usable at its unlock stage, or during the Aha preview window. */
  isUnlocked(tab: GrimoireTab): boolean {
    return this.ahaPreviewActive() || this.stage() >= tab.unlockStage;
  }

  /** i18n key for the stage a locked tab unlocks at (the tease copy). */
  unlockStageNameKey(tab: GrimoireTab): string {
    return `familiar_grimoire.stage.${STAGE_NAMES[tab.unlockStage]}`;
  }

  selectTab(tab: GrimoireTab): void {
    if (this.isUnlocked(tab)) {
      this.activeTab.set(tab.key);
    }
  }

  /** Re-run the growth-state load after a fail-loud error. */
  retry(): void {
    this.reload$.next();
  }
}
