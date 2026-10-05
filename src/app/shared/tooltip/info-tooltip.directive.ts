import {
  ComponentRef,
  DestroyRef,
  Directive,
  ElementRef,
  OnInit,
  Renderer2,
  ViewContainerRef,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ConnectedPosition,
  Overlay,
  OverlayRef,
  VerticalConnectionPos,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

import { ChoraTooltipComponent, TooltipPosition } from './chora-tooltip.component';
import { TooltipRegistryService } from './tooltip-registry';

/** Process-wide counter so every trigger gets a unique aria-describedby target id. */
let nextTooltipId = 0;

/**
 * Which side of the trigger the tooltip ends up on, given CDK's resolved
 * vertical anchor. `overlayY: 'bottom'` pins the tooltip's bottom edge to the
 * trigger's top - i.e. it sits ABOVE; anything else sits below.
 */
export function tooltipSideFor(overlayY: VerticalConnectionPos): TooltipPosition {
  return overlayY === 'bottom' ? 'above' : 'below';
}

/**
 * Preferred placements: BELOW the trigger first, ABOVE as the fallback (CDK
 * flips automatically when there is no room below). Centred on the trigger.
 */
const POSITIONS: readonly ConnectedPosition[] = [
  { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
];

/**
 * `[choraInfo]="key"` - the Chora "Helpful-UX" info affordance (UX review §2).
 *
 * Appends a small, keyboard-accessible info button (`fa-circle-info`) to its
 * host and, on hover / keyboard-focus / tap, opens a {@link ChoraTooltipComponent}
 * in a CDK Overlay portaled to the body (so it is never clipped by an
 * `overflow` ancestor and positions itself above/below automatically). Content
 * is resolved from the {@link TooltipRegistryService} by `key`.
 *
 * Accessibility (WCAG 2.1 AA): the trigger is a real `<button>` (natively
 * focusable + operable), `aria-describedby` points at the open tooltip, and it
 * dismisses on Escape and blur - never hover-only. An unrecognised key renders
 * no affordance at all (graceful no-op).
 */
@Directive({
  selector: '[choraInfo]',
  standalone: true,
})
export class InfoTooltipDirective implements OnInit {
  /** Microcopy registry key whose label + description this affordance explains. */
  readonly choraInfo = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly registry = inject(TooltipRegistryService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly tooltipId = `chora-tooltip-${nextTooltipId++}`;
  private triggerEl: HTMLButtonElement | null = null;
  private overlayRef: OverlayRef | null = null;
  private tooltipRef: ComponentRef<ChoraTooltipComponent> | null = null;
  private currentPosition: TooltipPosition = 'below';

  /**
   * Set briefly while a touch interaction is in flight so the synthetic
   * mouseenter/focus events a tap also fires don't open-then-let-click-close
   * the tooltip - on touch the `click` handler alone drives the toggle.
   */
  private touchActive = false;
  private touchResetTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const content = this.registry.resolve(this.choraInfo());
    // Graceful fallback: an unknown key yields no affordance (no icon, no crash).
    if (!content) {
      return;
    }
    this.renderTrigger(content.label);
    this.destroyRef.onDestroy(() => this.dispose());
  }

  /** Build the focusable info button + icon and bind the open/close interactions. */
  private renderTrigger(label: string): void {
    const btn = this.renderer.createElement('button') as HTMLButtonElement;
    this.renderer.setAttribute(btn, 'type', 'button');
    // The button carries the term as its name; aria-describedby (set on open)
    // adds the description so screen-reader users get both tiers.
    this.renderer.setAttribute(btn, 'aria-label', label);
    this.renderer.addClass(btn, 'chora-info-trigger');

    const icon = this.renderer.createElement('i') as HTMLElement;
    this.renderer.addClass(icon, 'fa-solid');
    this.renderer.addClass(icon, 'fa-circle-info');
    this.renderer.setAttribute(icon, 'aria-hidden', 'true');
    this.renderer.appendChild(btn, icon);

    this.renderer.appendChild(this.host.nativeElement, btn);
    this.triggerEl = btn;

    this.renderer.listen(btn, 'pointerdown', (e: PointerEvent) => this.onPointerDown(e));
    this.renderer.listen(btn, 'mouseenter', () => {
      if (!this.touchActive) {
        this.open();
      }
    });
    this.renderer.listen(btn, 'mouseleave', () => this.close());
    this.renderer.listen(btn, 'focus', () => {
      if (!this.touchActive) {
        this.open();
      }
    });
    this.renderer.listen(btn, 'blur', () => this.close());
    this.renderer.listen(btn, 'click', (e: Event) => {
      // Don't let the affordance submit a form / navigate / bubble to the host.
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });
    this.renderer.listen(btn, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  /** A touch tap fires synthetic mouse/focus events; suppress those briefly. */
  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      return;
    }
    this.touchActive = true;
    if (this.touchResetTimer !== null) {
      clearTimeout(this.touchResetTimer);
    }
    this.touchResetTimer = setTimeout(() => {
      this.touchActive = false;
      this.touchResetTimer = null;
    }, 600);
  }

  isOpen(): boolean {
    return this.overlayRef?.hasAttached() ?? false;
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (!this.triggerEl || this.isOpen()) {
      return;
    }
    const content = this.registry.resolve(this.choraInfo());
    if (!content) {
      return;
    }
    const overlayRef = this.ensureOverlay();
    this.tooltipRef = overlayRef.attach(new ComponentPortal(ChoraTooltipComponent, this.viewContainerRef));
    this.tooltipRef.setInput('label', content.label);
    this.tooltipRef.setInput('description', content.description);
    this.tooltipRef.setInput('tooltipId', this.tooltipId);
    this.tooltipRef.setInput('position', this.currentPosition);
    // Portaled views attach to the ApplicationRef and render on the next tick;
    // flush now so the content + a11y wiring are present synchronously.
    this.tooltipRef.changeDetectorRef.detectChanges();
    this.renderer.setAttribute(this.triggerEl, 'aria-describedby', this.tooltipId);
  }

  close(): void {
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
    }
    this.tooltipRef = null;
    if (this.triggerEl) {
      this.renderer.removeAttribute(this.triggerEl, 'aria-describedby');
    }
  }

  /** Lazily create the overlay + connected position strategy on first open. */
  private ensureOverlay(): OverlayRef {
    if (this.overlayRef) {
      return this.overlayRef;
    }
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.triggerEl!)
      .withPositions([...POSITIONS])
      .withPush(false);

    positionStrategy.positionChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((change) => {
        this.currentPosition = tooltipSideFor(change.connectionPair.overlayY);
        this.tooltipRef?.setInput('position', this.currentPosition);
      });

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'chora-tooltip-panel',
    });
    return this.overlayRef;
  }

  private dispose(): void {
    if (this.touchResetTimer !== null) {
      clearTimeout(this.touchResetTimer);
      this.touchResetTimer = null;
    }
    this.tooltipRef = null;
    this.overlayRef?.dispose();
    this.overlayRef = null;
  }
}
