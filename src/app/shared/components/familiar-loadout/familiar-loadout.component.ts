/**
 * FamiliarLoadoutComponent — the Grimoire loadout (CHO-2013 P1.C).
 *
 * A reusable char-sheet section: renders a Familiar's owned Skills, its earned
 * slots, and equip/unequip + single-step invoke affordances for the activated
 * st2 Skills. Mounted BOTH in the Knowledge-Map drawer's Familiar tab
 * (goal-contextual — `focalConceptId` seeds explain_anew's target) and on the
 * standalone /a/companion/:id profile.
 *
 * Fail-loud (feedback_no_stubs_real_wiring): the loadout GET is a real
 * BffClientService call with a loading / error+retry / success discriminated
 * state; equip/unequip/invoke mutations toast their failures (409 slot/active
 * conflicts, 402 insufficient_mana) and never fabricate a success.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslateService } from '../../../core/services/translate.service';
import { ToastService } from '../toast/toast.service';
import { FamiliarAnswerableWidgetComponent } from '../familiar-answerable-widget/familiar-answerable-widget.component';
import { GroundedAttributionComponent } from '../grounded-attribution/grounded-attribution.component';
import { InfoTooltipDirective } from '../../tooltip/info-tooltip.directive';
import { FamiliarGrowthService } from '../../../core/familiar/familiar-growth.service';
import type {
  LoadoutGrant,
  LoadoutView,
  SkillInvokeResult,
} from '../../../core/familiar/familiar-growth.model';

type LoadoutState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly view: LoadoutView }
  | { readonly status: 'error'; readonly error: string };

/**
 * Skills the loadout can invoke.
 *
 * This tracks `skillInvokeBuilders` in
 * `companion_skill_invoke_handler.go`: a key present there is drivable, a key
 * absent 501s. It went stale, and the gap was not small. The server has driven
 * TEN skills since July 2026, while this list carried five, so `map_sight`,
 * `weakness_sight` and `kg_explore` were released, priced, slot-costing and
 * reachable from NOWHERE in the SPA. The learner earned and equipped a Skill
 * they could never use.
 *
 * Owner ruling R14 closes it: expose all ten. Two of the remaining five already
 * have their own surface (`fact_check` and `web_research` on `/a/far-sight`),
 * so the loadout adds the three that had none, taking SPA reach from five to
 * eight of the ten.
 *
 * ⚠ Keep this in step with the backend builder set. It is a client-side mirror
 * of a server truth, so the server stays the control: an unlisted key is
 * refused with 501 and a dark catalogue row is refused with 409, whatever this
 * set says.
 */
const INVOKABLE = new Set([
  // R4-1 st2 three.
  'progress_mirror',
  'recap_scribe',
  'explain_anew',
  // CHO-2016 answerable pair (result_kind="answerable", rendered by
  // FamiliarAnswerableWidgetComponent).
  'quiz_me',
  'socratic_drill',
  // CHO-2014 sight pair: chat-sink narration, so no new UI is needed.
  'map_sight',
  'weakness_sight',
  // Weaver scout: writes to the suggestion inbox rather than replying in chat.
  'kg_explore',
]);
/** Skills that need a concept/atom target the caller must supply. */
const NEEDS_TARGET = new Set(['explain_anew']);

function loadoutErrorKey(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) {
    return 'familiar_loadout.error_unauthorised';
  }
  return 'familiar_loadout.error';
}

@Component({
  selector: 'chora-familiar-loadout',
  imports: [
    TranslatePipe,
    FamiliarAnswerableWidgetComponent,
    GroundedAttributionComponent,
    InfoTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-loadout.component.html',
  styleUrl: './familiar-loadout.component.scss',
})
export class FamiliarLoadoutComponent {
  private readonly growth = inject(FamiliarGrowthService);
  /** Resolves skill names for `orderedGrants`; the list is sorted by what a
   *  learner reads, which only the translation layer knows. */
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);

  /** The Familiar whose loadout to render (required). */
  readonly familiarId = input.required<string>();
  /**
   * The map's focal concept id — the natural target for explain_anew when the
   * loadout is mounted on the Knowledge Map. Empty on the standalone profile;
   * explain_anew's Use is disabled without it.
   */
  readonly focalConceptId = input<string>('');

  /** Imperative reload after a mutation (equip/unequip). */
  private readonly reload$ = new Subject<void>();

  /** Fail-loud loadout state. */
  readonly state = toSignal(
    merge(
      toObservable(this.familiarId),
      this.reload$.pipe(map(() => this.familiarId())),
    ).pipe(switchMap((id) => this.loadFor(id))),
    { initialValue: { status: 'loading' } as LoadoutState },
  );

  private loadFor(id: string): Observable<LoadoutState> {
    if (!id) return of<LoadoutState>({ status: 'loading' });
    return this.growth.getLoadout(id).pipe(
      map((view): LoadoutState => ({ status: 'success', view })),
      catchError((err: unknown) =>
        of<LoadoutState>({ status: 'error', error: loadoutErrorKey(err) }),
      ),
      startWith<LoadoutState>({ status: 'loading' }),
    );
  }

  /** The last invoke's reply (rendered under the loadout); null until used. */
  readonly result = signal<SkillInvokeResult | null>(null);
  /** Skill key with an in-flight equip/unequip/invoke op (disables its row). */
  readonly busyKey = signal<string | null>(null);

  readonly view = computed<LoadoutView | null>(() => {
    const s = this.state();
    return s.status === 'success' ? s.view : null;
  });
  readonly isEmpty = computed<boolean>(() => {
    const v = this.view();
    return !!v && v.grants.length === 0;
  });

  /**
   * The two loadout counters, which are NOT the same number (ruling R-b).
   *
   * The cap binds the SUM OF SLOT COSTS, not a count: `Loadout.EquippedSlotCost`
   * adds `slot_cost` per equipped active Skill and some Skills cost 2
   * (`loadout.go:76-86`). So a learner holding one 1-cost and one 2-cost Skill
   * is "2 skills" and "3 of 4 slots" at the same time, and any single "X of Y"
   * phrased off one of them misreports the other. Both are published separately
   * so the copy cannot silently pick the wrong one; D3 phrases them.
   *
   * `skillsActive` reads the server's own active-equipped set rather than
   * recounting the grant rows. The server owns that set, and a recount would
   * let the SPA answer differently from the same payload.
   */
  readonly skillsActive = computed<number>(
    () => this.view()?.equippedSkills.length ?? 0,
  );
  /** Slot-cost units in use (craft Skills are slot-free and count zero). */
  readonly slotsUsed = computed<number>(() => this.view()?.slotsUsed ?? 0);
  /** Slot-cost units unlocked at the current growth stage. */
  readonly slotCap = computed<number>(
    () => this.view()?.skillSlotsUnlocked ?? 0,
  );

  /**
   * Grants in READING order: sorted by the name a learner actually sees.
   *
   * The server mints its order with `sort.Slice` on `SkillKey`
   * (`companion_skill_grant_handler.go:136`). That was harmless while the panel
   * showed machine keys and became wrong the moment D3 resolved display names:
   * `web_research` renders as "Far Sight" and sorts LAST by key, so it lands
   * after "Progress Mirror" and the list reads as alphabetical while not being
   * it.
   *
   * Sorted here rather than server-side on purpose. The order depends on the
   * RESOLVED name, which is locale-dependent: the same grants sort differently
   * in Tamil, and the handler has no business knowing the reader's locale.
   * `localeCompare` for the same reason, so accented and non-Latin names
   * collate by their own rules instead of by code point.
   *
   * Reads the translation signal, so a language switch reorders the list.
   */
  readonly orderedGrants = computed<readonly LoadoutGrant[]>(() => {
    const grants = this.view()?.grants ?? [];
    const name = (g: LoadoutGrant) =>
      this.translate.instant(`familiar_skill.${g.skillKey}`);
    return [...grants].sort((a, b) =>
      name(a).localeCompare(name(b), this.translate.currentLocale().code),
    );
  });

  /** Reload the loadout (error-state retry + post-mutation refresh). */
  reload(): void {
    this.reload$.next();
  }

  /**
   * CHO-2030 (R3-9): an owned grant whose catalogue row is not released
   * yet renders as the named-tease dormant — no equip/use affordances
   * (the server 409s equip + blocks invoke regardless).
   */
  isDormant(g: LoadoutGrant): boolean {
    return !g.catalogueActive;
  }

  /** Can this grant be invoked from the loadout? Mirrors the server builder set. */
  canInvoke(g: LoadoutGrant): boolean {
    return g.equipped && g.skillKind === 'active' && INVOKABLE.has(g.skillKey);
  }

  /** explain_anew needs a focal concept target; others don't. */
  invokeDisabled(g: LoadoutGrant): boolean {
    if (this.busyKey() !== null) return true;
    if (NEEDS_TARGET.has(g.skillKey)) return !this.focalConceptId();
    return false;
  }

  equip(g: LoadoutGrant): void {
    if (this.busyKey()) return;
    this.busyKey.set(g.skillKey);
    this.growth.equipSkill(this.familiarId(), g.skillKey).subscribe({
      next: () => {
        this.busyKey.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.busyKey.set(null);
        this.toast.show(this.equipErrorKey(err), 'error');
      },
    });
  }

  unequip(g: LoadoutGrant): void {
    if (this.busyKey()) return;
    this.busyKey.set(g.skillKey);
    this.growth.unequipSkill(this.familiarId(), g.skillKey).subscribe({
      next: () => {
        this.busyKey.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.busyKey.set(null);
        this.toast.show(this.equipErrorKey(err), 'error');
      },
    });
  }

  invoke(g: LoadoutGrant): void {
    if (this.invokeDisabled(g)) return;
    this.busyKey.set(g.skillKey);
    this.result.set(null);
    this.growth
      .invokeSkill(this.familiarId(), g.skillKey, this.invokeParams(g.skillKey))
      .subscribe({
        next: (r) => {
          this.busyKey.set(null);
          this.result.set(r);
        },
        error: (err: unknown) => {
          this.busyKey.set(null);
          this.toast.show(this.invokeErrorKey(err), 'error');
        },
      });
  }

  /** Compose the spec-§2 params for the P1 three (defaults + focal target). */
  private invokeParams(
    skillKey: string,
  ): Readonly<Record<string, string>> | undefined {
    if (skillKey === 'explain_anew') {
      return { target: this.focalConceptId(), style: 'analogy', length: 'short' };
    }
    return undefined; // progress_mirror / recap_scribe run on defaults
  }

  /** Map an equip/unequip error to a canonical i18n key (conflicts pass through). */
  private equipErrorKey(err: unknown): string {
    const code = (err as { error?: { code?: string } })?.error?.code;
    switch (code) {
      case 'SKILL_SLOTS_FULL':
        return 'familiar_loadout.equip_error_slots_full';
      case 'SKILL_NOT_ACTIVE':
        return 'familiar_loadout.equip_error_not_active';
      default:
        return 'familiar_loadout.equip_error';
    }
  }

  private invokeErrorKey(err: unknown): string {
    const status = (err as { status?: number })?.status;
    if (status === 402) return 'familiar_loadout.invoke_error_mana';
    return 'familiar_loadout.invoke_error';
  }
}
