import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  GovernanceService,
  type PromptCatalogueDetail,
  type PromptCatalogueList,
  type PromptCatalogueVersion,
} from '../../../../../core/services/governance.service';

/**
 * OplusPromptModalComponent - CHO-2368 (ADR-197 M-D): the version-select +
 * actual-prompt-content dialog for one agent's catalogue.
 *
 * O+'s first modal. Follows the mana-topup-modal structural pattern
 * (parent-owned `@if` visibility + signal inputs/outputs + inline focus trap
 * with restore-on-close) over the design-system `.modal-overlay` /
 * `.modal-content` glass tokens. Fetches lazily on open via the on-demand
 * GovernanceService catalogue methods (never polled): the version list once,
 * then segment content per selected version. Locked segments (output
 * contracts, safety preambles, fence frames) carry a lock badge - they are
 * display-only and never override-eligible.
 */
@Component({
  selector: 'chora-oplus-prompt-modal',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './oplus-prompt-modal.component.html',
  styleUrl: './oplus-prompt-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OplusPromptModalComponent {
  private readonly svc = inject(GovernanceService);

  /** The catalogue agent id (qgen_question / ... / familiar). */
  readonly agentId = input.required<string>();
  /** Version to preselect (e.g. the panel chip's version); newest active otherwise. */
  readonly initialVersion = input<string | undefined>(undefined);
  readonly dismissed = output<void>();

  protected readonly listState = signal<'loading' | 'error' | 'forbidden' | 'ready'>('loading');
  protected readonly versions = signal<readonly PromptCatalogueVersion[]>([]);
  protected readonly selectedVersion = signal<string | null>(null);
  protected readonly contentState = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly detail = signal<PromptCatalogueDetail | null>(null);

  private readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');
  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      this.agentId(); // re-arm per open (parent @if recreates per agent anyway)
      this.previouslyFocusedElement = document.activeElement;
      queueMicrotask(() => {
        this.dialogPanel()?.nativeElement.focus();
      });
      untracked(() => this.loadVersions());
    });
  }

  protected loadVersions(): void {
    this.listState.set('loading');
    this.svc.promptCatalogueVersions(this.agentId()).subscribe({
      next: (list: PromptCatalogueList) => {
        this.versions.set(list.versions);
        this.listState.set('ready');
        const pick = this.pickInitialVersion(list.versions);
        if (pick === null) {
          this.contentState.set('error');
          return;
        }
        this.selectVersion(pick);
      },
      error: (err: unknown) => {
        this.listState.set(this.isForbidden(err) ? 'forbidden' : 'error');
      },
    });
  }

  protected selectVersion(version: string): void {
    this.selectedVersion.set(version);
    this.contentState.set('loading');
    this.detail.set(null);
    this.svc.promptCatalogueVersion(this.agentId(), version).subscribe({
      next: (d: PromptCatalogueDetail) => {
        // Ignore a stale response after the selector moved on.
        if (this.selectedVersion() !== version) return;
        this.detail.set(d);
        this.contentState.set('ready');
      },
      error: () => {
        if (this.selectedVersion() !== version) return;
        this.contentState.set('error');
      },
    });
  }

  protected onVersionChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    if (value !== '' && value !== this.selectedVersion()) {
      this.selectVersion(value);
    }
  }

  /** Prefer the caller's version, else the newest ACTIVE, else the last row. */
  private pickInitialVersion(versions: readonly PromptCatalogueVersion[]): string | null {
    if (versions.length === 0) return null;
    const wanted = this.initialVersion();
    if (wanted !== undefined && versions.some((v) => v.version === wanted)) {
      return wanted;
    }
    const actives = versions.filter((v) => v.status === 'active');
    const pool = actives.length > 0 ? actives : versions;
    return pool[pool.length - 1].version;
  }

  private isForbidden(err: unknown): boolean {
    return (
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      (err as { status?: unknown }).status === 403
    );
  }

  /** Trims the registry's "YYYY-MM-DD HH:MM:SS.ss+00" stamps for display. */
  protected stamp(value: string | null): string {
    return value === null ? '' : value.slice(0, 16);
  }

  protected statusKey(status: string): string {
    const known = ['draft', 'pending_eval', 'pending_hitl', 'active', 'rejected', 'archived'];
    return known.includes(status)
      ? `oplus.agents.prompt_modal_status_${status}`
      : 'oplus.agents.prompt_modal_status_unknown';
  }

  /**
   * CHO-2379: the tag beside a version in the selector. 'override' told the
   * auditor nothing - every gated row is one - so an override reads as its
   * plain STATUS (active / archived / rejected / ...). A baseline keeps its
   * kind tag, because being the immutable embedded transcription IS the fact
   * that distinguishes it (it is always active).
   */
  protected tagKey(v: Pick<PromptCatalogueVersion, 'kind' | 'status'>): string {
    return v.kind === 'baseline'
      ? 'oplus.agents.prompt_modal_kind_baseline'
      : this.statusKey(v.status);
  }

  // ── Dialog mechanics (mana-topup-modal pattern) ─────────────────────

  protected onCancel(): void {
    this.restoreFocus();
    this.dismissed.emit();
  }

  protected onBackdropClick(): void {
    this.onCancel();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (panel === undefined) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
  }
}
