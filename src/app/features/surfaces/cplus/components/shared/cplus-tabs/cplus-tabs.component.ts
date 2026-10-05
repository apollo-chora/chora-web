import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChildren,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';

export interface CplusTabItem {
  /** Stable id emitted on selection change. */
  id: string;
  /** Visible label. */
  label: string;
}

/**
 * CplusTabs — flat, accessible tablist (ADR-196).
 *
 * Implements the WAI-ARIA tabs pattern: `role="tablist"` + `role="tab"`,
 * roving `tabindex` (active=0, others=-1), `aria-selected`, and full
 * keyboard navigation (ArrowLeft/Right wrap, Home/End jump, with wrap).
 * Selection is announced via the CDK LiveAnnouncer for assistive-tech
 * users. The active indicator is a flat solid underline — never a gradient
 * pill.
 *
 * Keyboard handling is driven by the component's own active-index signal
 * (computed directly from the key) rather than delegating to the CDK
 * FocusKeyManager's internal state — this keeps selection + focus roving
 * deterministic and testable. The LiveAnnouncer is still used for the
 * a11y announcement.
 */
@Component({
  selector: 'chora-cplus-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './cplus-tabs.component.html',
  styleUrl: './cplus-tabs.component.scss',
})
export class CplusTabsComponent {
  readonly tabs = input.required<CplusTabItem[]>();
  /** Initial active tab id; defaults to the first tab. */
  readonly activeId = input<string | undefined>(undefined);
  readonly activeChange = output<string>();

  private readonly liveAnnouncer = inject(LiveAnnouncer);

  @ViewChildren('tabButtons') private tabButtons?: ElementRef<HTMLButtonElement>[];

  private readonly _activeIndex = signal(0);

  readonly activeIndex = computed(() => this._activeIndex());

  constructor() {
    // Re-sync the active tab ONLY when the tabs list or the initial activeId
    // input changes. The current _activeIndex is read untracked so this
    // effect does not re-run (and clobber) on user-driven selection.
    effect(() => {
      const list = this.tabs();
      const want = this.activeId();
      if (list.length === 0) return;
      let idx = 0;
      if (want) {
        const found = list.findIndex((t) => t.id === want);
        if (found >= 0) idx = found;
      }
      const current = untracked(this._activeIndex);
      if (idx !== current) {
        this._activeIndex.set(idx);
      }
    });
  }

  /** WAI-ARIA tabs keyboard model: ←/→ move ±1 (wrap), Home/End jump. */
  onKeydown(event: KeyboardEvent, currentIndex: number): void {
    const count = this.tabs().length;
    if (count === 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'Right':
        next = (currentIndex + 1) % count;
        break;
      case 'ArrowLeft':
      case 'Left':
        next = (currentIndex - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return; // Unhandled key — do nothing.
    }
    event.preventDefault();
    this.select(next);
    // Move DOM focus to the newly active tab (roving tabindex).
    this.tabButtons?.[next]?.nativeElement.focus();
  }

  select(index: number): void {
    const list = this.tabs();
    if (index < 0 || index >= list.length) return;
    if (index === this._activeIndex()) return;
    this._activeIndex.set(index);
    this.liveAnnouncer.announce(`${list[index].label} tab selected`);
    this.activeChange.emit(list[index].id);
  }

  tabindexFor(index: number): number {
    return index === this._activeIndex() ? 0 : -1;
  }

  isSelected(index: number): boolean {
    return index === this._activeIndex();
  }

  trackByIndex(index: number): number {
    return index;
  }
}
