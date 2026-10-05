/**
 * PersonaTabComponent — the Grimoire's Persona tab (CHO-2015, ADR-219 D2).
 *
 * The learner shapes "who their Familiar IS": bounded typed knobs (tone / hint
 * policy / difficulty cap / citation strictness / language / address style) +
 * an archetype + interest chips + ONE fenced free-text guidance note (≤280
 * chars — the single sanctioned exception to ADR-205's zero-free-form rule).
 *
 * Every knob offers only legal choices (bounded grammar mirrors persona.go), so
 * the server's 422 is a backstop. The guidance note is Model-Armor-screened at
 * SAVE server-side: a Block returns 422 PERSONA_NOTE_BLOCKED which this tab
 * surfaces fail-loud (no fabricated success). Load + save are real BFF calls.
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
import { catchError, map, startWith, switchMap, tap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { FamiliarPersonaService } from '../../../../../core/familiar/familiar-persona.service';
import {
  PERSONA_ADDRESS_STYLES,
  PERSONA_ARCHETYPE_MAX_LEN,
  PERSONA_CITATIONS,
  PERSONA_DIFFICULTIES,
  PERSONA_HINT_PROGRESSIONS,
  PERSONA_INTEREST_CHIP_MAX_LEN,
  PERSONA_LANGUAGES,
  PERSONA_MAX_HINTS_CEILING,
  PERSONA_MAX_INTEREST_CHIPS,
  PERSONA_NOTE_MAX_LEN,
  PERSONA_TONES,
  type PersonaAddressStyle,
  type PersonaCitation,
  type PersonaDifficulty,
  type PersonaEditRequest,
  type PersonaHintProgression,
  type PersonaLanguage,
  type PersonaTone,
  type PersonaView,
} from '../../../../../core/familiar/familiar-persona.model';

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly view: PersonaView }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-persona-tab',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './persona-tab.component.html',
  styleUrl: './persona-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonaTabComponent {
  private readonly personaSvc = inject(FamiliarPersonaService);
  private readonly toast = inject(ToastService);

  readonly familiarId = input.required<string>();

  // Bounded-grammar option lists + limits (for the template selects/counters).
  readonly tones = PERSONA_TONES;
  readonly hintProgressions = PERSONA_HINT_PROGRESSIONS;
  readonly difficulties = PERSONA_DIFFICULTIES;
  readonly citations = PERSONA_CITATIONS;
  readonly languages = PERSONA_LANGUAGES;
  readonly addressStyles = PERSONA_ADDRESS_STYLES;
  readonly hintCeiling = PERSONA_MAX_HINTS_CEILING;
  readonly noteMaxLen = PERSONA_NOTE_MAX_LEN;
  readonly archetypeMaxLen = PERSONA_ARCHETYPE_MAX_LEN;
  readonly chipMaxLen = PERSONA_INTEREST_CHIP_MAX_LEN;
  readonly maxChips = PERSONA_MAX_INTEREST_CHIPS;

  private readonly reload$ = new Subject<void>();

  /** Fail-loud persona load; hydrates the edit signals on success. */
  readonly loadState = toSignal(
    merge(
      toObservable(this.familiarId),
      this.reload$.pipe(map(() => this.familiarId())),
    ).pipe(switchMap((id) => this.loadPersona(id))),
    { initialValue: { status: 'loading' } as LoadState },
  );

  readonly loading = computed(() => this.loadState().status === 'loading');
  readonly errored = computed(() => this.loadState().status === 'error');
  readonly ready = computed(() => this.loadState().status === 'success');

  // Editable persona surface (signals — the primary state primitive).
  readonly tone = signal<PersonaTone>('encouraging');
  readonly hintProgression = signal<PersonaHintProgression>('ladder');
  readonly maxHints = signal<number>(3);
  readonly difficultyCap = signal<PersonaDifficulty>('intermediate');
  readonly language = signal<PersonaLanguage>('en');
  readonly citationStrictness = signal<PersonaCitation>('strict');
  readonly archetype = signal<string>('');
  readonly addressStyle = signal<PersonaAddressStyle>('first_name');
  readonly interestChips = signal<readonly string[]>([]);
  readonly guidanceNote = signal<string>('');
  readonly version = signal<number>(0);

  readonly newChip = signal<string>('');
  readonly saving = signal<boolean>(false);

  // Live validation (bounded grammar mirrors persona.go; server is the backstop).
  readonly noteLen = computed(() => [...this.guidanceNote()].length);
  readonly noteRemaining = computed(() => this.noteMaxLen - this.noteLen());
  readonly noteOver = computed(() => this.noteLen() > this.noteMaxLen);
  readonly archetypeTrim = computed(() => this.archetype().trim());
  readonly archetypeInvalid = computed(
    () => this.archetypeTrim().length === 0 || this.archetypeTrim().length > this.archetypeMaxLen,
  );
  readonly atChipCap = computed(() => this.interestChips().length >= this.maxChips);
  readonly newChipTrim = computed(() => this.newChip().trim());
  readonly canAddChip = computed(() => {
    const c = this.newChipTrim();
    return (
      c.length > 0 &&
      c.length <= this.chipMaxLen &&
      !this.atChipCap() &&
      !this.interestChips().includes(c)
    );
  });
  readonly canSave = computed(
    () => this.ready() && !this.saving() && !this.noteOver() && !this.archetypeInvalid(),
  );

  private loadPersona(id: string): Observable<LoadState> {
    if (!id) return of<LoadState>({ status: 'loading' });
    return this.personaSvc.getPersona(id).pipe(
      tap((view) => this.hydrate(view)),
      map((view): LoadState => ({ status: 'success', view })),
      catchError(() => of<LoadState>({ status: 'error' })),
      startWith<LoadState>({ status: 'loading' }),
    );
  }

  /** Copy a loaded view into the editable signals. */
  private hydrate(view: PersonaView): void {
    this.tone.set(view.tone);
    this.hintProgression.set(view.hintProgression);
    this.maxHints.set(view.maxHintsBeforeReveal);
    this.difficultyCap.set(view.difficultyCap);
    this.language.set(view.language);
    this.citationStrictness.set(view.citationStrictness);
    this.archetype.set(view.archetype);
    this.addressStyle.set(view.addressStyle);
    this.interestChips.set([...view.interestChips]);
    this.guidanceNote.set(view.guidanceNote);
    this.version.set(view.version);
  }

  retry(): void {
    this.reload$.next();
  }

  // ── Interest chips ──────────────────────────────────────────────────────────
  addChip(): void {
    if (!this.canAddChip()) return;
    this.interestChips.update((chips) => [...chips, this.newChipTrim()]);
    this.newChip.set('');
  }

  removeChip(index: number): void {
    this.interestChips.update((chips) => chips.filter((_, i) => i !== index));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    const body: PersonaEditRequest = {
      tone: this.tone(),
      hintProgression: this.hintProgression(),
      maxHintsBeforeReveal: this.maxHints(),
      difficultyCap: this.difficultyCap(),
      language: this.language(),
      citationStrictness: this.citationStrictness(),
      archetype: this.archetypeTrim(),
      addressStyle: this.addressStyle(),
      interestChips: this.interestChips(),
      guidanceNote: this.guidanceNote(),
    };
    this.personaSvc.updatePersona(this.familiarId(), body).subscribe({
      next: (view) => {
        this.saving.set(false);
        this.hydrate(view);
        this.toast.show('familiar_grimoire.persona.toast.saved', 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.show(this.personaErrorKey(err), 'error');
      },
    });
  }

  /** Map a persona conflict to a canonical i18n key (status/code preserved). */
  private personaErrorKey(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const code = (err as { error?: { code?: string } })?.error?.code;
    switch (code) {
      case 'PERSONA_NOTE_BLOCKED':
        return 'familiar_grimoire.persona.error.note_blocked';
      case 'PERSONA_INVALID':
        return 'familiar_grimoire.persona.error.invalid';
      case 'PERSONA_GUARDRAIL_NOT_WIRED':
      case 'PERSONA_NOT_WIRED':
        return 'familiar_grimoire.persona.error.unavailable';
      case 'PERSONA_SCREEN_FAILED':
        return 'familiar_grimoire.persona.error.screen_failed';
      case 'FAMILIAR_NOT_FOUND':
        return 'familiar_grimoire.persona.error.not_found';
      default:
        return status === 422
          ? 'familiar_grimoire.persona.error.invalid'
          : 'familiar_grimoire.persona.error.generic';
    }
  }

  // ── Native-control change helpers (signal-driven; no template-driven forms) ──
  setTone(v: string): void {
    this.tone.set(v as PersonaTone);
  }
  setHintProgression(v: string): void {
    this.hintProgression.set(v as PersonaHintProgression);
  }
  setMaxHints(v: string): void {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) this.maxHints.set(Math.min(Math.max(n, 0), this.hintCeiling));
  }
  setDifficulty(v: string): void {
    this.difficultyCap.set(v as PersonaDifficulty);
  }
  setLanguage(v: string): void {
    this.language.set(v as PersonaLanguage);
  }
  setCitation(v: string): void {
    this.citationStrictness.set(v as PersonaCitation);
  }
  setAddressStyle(v: string): void {
    this.addressStyle.set(v as PersonaAddressStyle);
  }

  toneLabelKey(v: string): string {
    return `familiar_grimoire.persona.tone.${v}`;
  }
  hintProgressionLabelKey(v: string): string {
    return `familiar_grimoire.persona.hint.${v}`;
  }
  difficultyLabelKey(v: string): string {
    return `familiar_grimoire.persona.difficulty.${v}`;
  }
  citationLabelKey(v: string): string {
    return `familiar_grimoire.persona.citation.${v}`;
  }
  languageLabelKey(v: string): string {
    return `familiar_grimoire.persona.language.${v}`;
  }
  addressStyleLabelKey(v: string): string {
    return `familiar_grimoire.persona.address.${v}`;
  }

  trackByChip(_index: number, chip: string): string {
    return chip;
  }
}
