/**
 * HomeComponent - the shell /home launcher screen (ADR-240 Track B H3, D1).
 *
 * A cross-surface, pinnable air-drop launcher that sits ABOVE the five CHORA
 * surfaces (a Group-4 route with no surfaceGuard, so it can never strand). It
 * renders the user's pinned entry points as draggable cards, evolving the A+
 * dashboard's shipped cdkDropList into a wrapping grid, and lets the user
 * air-drop cards in / out from the reachable-but-unpinned registry.
 *
 * Since C1b it carries the RANKED section above the pin grid: the composed,
 * data-driven list the home is becoming (owner rulings R2 and R4). The pin
 * grid stays beneath it and retires in C2 only once
 * `home-pin.retirement-census.spec.ts` says it may.
 *
 * The persistence, first-run default (D7), and fail-loud sync all live in
 * HomeLayoutService (over the shared PreferenceLayoutEngine). This component
 * owns only the view: it filters the pinned + addable sets to what the LIVE
 * session can reach (D4, render-time only, never deleting a persisted pin), and
 * reconstructs a full persisted order on drop so a temporarily-unreachable pin
 * is never dropped by a reorder.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { HomeLayoutService } from './home-layout.service';
import {
  HOME_PIN_REGISTRY,
  homePinById,
  type HomePinDefinition,
} from './home-pin.registry';
import { filterVisiblePins } from './home-pin.filter';
import { HomeQuestsComponent } from './home-quests.component';

@Component({
  selector: 'chora-home',
  imports: [RouterLink, DragDropModule, TranslatePipe, HomeQuestsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly homeLayout = inject(HomeLayoutService);

  /** Server-sync health (observability only; never gates the render). */
  readonly syncState = this.homeLayout.syncState;

  /** Edit mode reveals the drag handles, remove buttons, and the add palette. */
  readonly editMode = signal<boolean>(false);

  /** Press-and-hold to drag by default; immediate from the handle in edit mode. */
  readonly longPressDelay = { touch: 600, mouse: 2000 };

  /**
   * The pinned pins resolved to their definitions, filtered to what the LIVE
   * session can currently reach (D4). A pin the session cannot reach is not
   * rendered and not draggable, but it stays in the persisted layout (the filter
   * never writes) and returns when access returns.
   */
  readonly pinnedDefs = computed<HomePinDefinition[]>(() => {
    const reachable = new Set(
      filterVisiblePins(HOME_PIN_REGISTRY, this.homeLayout.filterInputs()).map(
        (d) => d.id,
      ),
    );
    return this.homeLayout
      .pins()
      .map((p) => homePinById(p.id))
      .filter(
        (d): d is HomePinDefinition => d !== undefined && reachable.has(d.id),
      );
  });

  /** The reachable-but-unpinned registry entries: the air-drop palette (D4/D7). */
  readonly addablePins = computed<HomePinDefinition[]>(() => {
    const pinned = new Set(this.homeLayout.pins().map((p) => p.id));
    return filterVisiblePins(
      HOME_PIN_REGISTRY,
      this.homeLayout.filterInputs(),
    ).filter((d) => !pinned.has(d.id));
  });

  readonly isEmpty = computed<boolean>(() => this.pinnedDefs().length === 0);

  /** A save failed: the server copy is out of sync (a subtle non-blocking notice). */
  readonly syncDegraded = computed<boolean>(
    () => this.syncState().status === 'degraded',
  );

  constructor() {
    this.homeLayout.load();
  }

  enterEditMode(): void {
    this.editMode.set(true);
  }

  exitEditMode(): void {
    this.editMode.set(false);
  }

  /**
   * A drag settled: reorder within the VISIBLE list, then reconstruct the full
   * persisted order as (reordered visible pins) + (any hidden-but-persisted pin
   * kept at the tail), so a reorder never drops a pin the session temporarily
   * cannot reach.
   */
  onDrop(event: CdkDragDrop<readonly HomePinDefinition[]>): void {
    const visibleIds = this.pinnedDefs().map((d) => d.id);
    moveItemInArray(visibleIds, event.previousIndex, event.currentIndex);
    const visible = new Set(visibleIds);
    const hidden = this.homeLayout.pins().filter((p) => !visible.has(p.id));
    this.homeLayout.reorder([...visibleIds.map((id) => ({ id })), ...hidden]);
  }

  addPin(id: string): void {
    this.homeLayout.pin(id);
  }

  removePin(id: string): void {
    this.homeLayout.unpin(id);
  }
}
