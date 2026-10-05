/**
 * FamiliarStageUpOverlayComponent — lightweight modal overlay variant
 * of the stage-up celebration (WS-2, 2026-05-26).
 *
 * This is the OVERLAY form: invoked imperatively via a signal input that
 * carries a `FamiliarStageTransition` payload. The full-page routed
 * component (`FamiliarStageUpComponent`) is unchanged.
 *
 * Trigger path:
 *   FamiliarRealtimeService.stageTransition$ (SSE `stage_up` event)
 *   → FamiliarComponent / FamiliarChatComponent subscribe
 *   → set `transition` input → overlay renders
 *
 * A11y:
 *   - role="dialog" aria-modal="true" aria-labelledby
 *   - focus trap (manual Tab cycling without CDK dep; mirrors ManaTopupModal)
 *   - Escape closes
 *   - focus restores to previous element on close
 *
 * Glassmorphism tokens (per chora-design-system skill):
 *   --glass-bg / --glass-border / --glass-shadow / --primary / --secondary
 *   A+ accent: --secondary = #ec4899 (Pink 500)
 *
 * Tablet-first: centered modal, max-width 600px (≥768px primary).
 * No mobile breakpoints.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type Signal,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import {
  breedStageLabel,
  type GrowthStage,
  type LoadoutGrant,
  type NextUnlock,
} from '../../../../core/familiar/familiar-growth.model';
import type { BreedSpecies } from '../../../../shared/components/breed-art/breed-art.component';
import type { FamiliarStageTransition } from '../../../../core/familiar/familiar-realtime.service';

/**
 * CHO-2030 (R3-9) ceremony reveals: the slot grant + the Path Skills that
 * just woke at the new stage + the next-stage named-tease. Fetched from
 * the growth + loadout reads when the overlay opens (the realtime event
 * stays payload-thin — no binary-schema change).
 */
type RevealState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | {
      readonly status: 'success';
      readonly slotsUnlocked: number;
      readonly justWoke: readonly LoadoutGrant[];
      readonly nextUnlocks: readonly NextUnlock[];
    };

@Component({
  selector: 'chora-aplus-familiar-stage-up-overlay',
  standalone: true,
  imports: [TranslatePipe, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-stage-up-overlay.component.html',
  styleUrl: './familiar-stage-up-overlay.component.scss',
})
export class FamiliarStageUpOverlayComponent {
  private readonly growth = inject(FamiliarGrowthService);

  /** Required: the transition payload from FamiliarRealtimeService. */
  readonly transition = input.required<FamiliarStageTransition>();
  /** Optional: breed/species for the breed-art visuals. Defaults '' (shows stage icon). */
  readonly species = input<BreedSpecies>('');
  /** Emitted when the overlay should close (button click / Escape). */
  readonly closed = output<void>();

  readonly dialogPanel =
    viewChild<ElementRef<HTMLElement>>('dialogPanel');

  /**
   * CHO-2030 reveals — refetched whenever a new transition opens the
   * overlay. Errors degrade to an honest "couldn't load" line (the
   * ceremony art still plays); nothing is fabricated.
   */
  readonly reveals: Signal<RevealState> = toSignal(
    toObservable(this.transition).pipe(
      switchMap((t) =>
        forkJoin({
          growth: this.growth.getGrowth(t.familiarId),
          loadout: this.growth.getLoadout(t.familiarId),
        }).pipe(
          map(
            ({ growth, loadout }): RevealState => ({
              status: 'success',
              slotsUnlocked: loadout.skillSlotsUnlocked,
              justWoke: loadout.grants.filter(
                (g) => g.unlockedAtStage === t.toStage,
              ),
              nextUnlocks: growth.nextUnlocks ?? [],
            }),
          ),
          catchError(() => of<RevealState>({ status: 'error' })),
          startWith<RevealState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as RevealState },
  );

  /** Convenience view over the success state (null while loading/error). */
  readonly revealData = computed(() => {
    const r = this.reveals();
    return r.status === 'success' ? r : null;
  });

  // Both labels go through the shared breedStageLabel() rather than repeating
  // the BREED_ADJECTIVE lookup. Behaviour is unchanged for hatched stages; the
  // reason to share it is stage 0, where the overlay's own copy printed the raw
  // i18n key segment 'egg' (species-less first hatch) instead of "Pod".
  readonly fromLabel = computed<string>(() =>
    breedStageLabel(this.species(), this.transition().fromStage as GrowthStage),
  );

  readonly toLabel = computed<string>(() =>
    breedStageLabel(this.species(), this.transition().toStage as GrowthStage),
  );

  readonly fromStage = computed<GrowthStage>(
    () => this.transition().fromStage as GrowthStage,
  );

  readonly toStage = computed<GrowthStage>(
    () => this.transition().toStage as GrowthStage,
  );

  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      // Re-run focus capture every time transition changes (new overlay shown).
      this.transition();
      this.previouslyFocusedElement = document.activeElement;
      queueMicrotask(() => {
        this.dialogPanel()?.nativeElement.focus();
      });
    });
  }

  onClose(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onClose();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === panel) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }
}
