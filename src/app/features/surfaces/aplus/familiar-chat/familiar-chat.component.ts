import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { ManaTopupModalComponent } from '../../../../shared/components/mana-topup-modal/mana-topup-modal.component';
import type { InsufficientManaUpsell } from '../../../../core/services/me-mana.model';
import { recommendedManaPackSku } from '../../../../core/services/me-mana.model';
import {
  FamiliarRealtimeService,
  type FamiliarStageTransition,
} from '../../../../core/familiar/familiar-realtime.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { breedStageLabel } from '../../../../core/familiar/familiar-growth.model';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarStageUpOverlayComponent } from '../familiar-stage-up/familiar-stage-up-overlay.component';
import { AiTransparencyNoticeComponent } from '../../../../shared/components/ai-transparency-notice/ai-transparency-notice.component';
import { AiCompanionBadgeComponent } from '../../../../shared/components/ai-companion-badge/ai-companion-badge.component';

import { GroundedAttributionComponent } from '../../../../shared/components/grounded-attribution/grounded-attribution.component';
import type { SeekerCitation } from '../../../../core/familiar/familiar-growth.model';
import { FamiliarChatService } from './familiar-chat.service';
import type {
  ChatEvent,
  ChatMessage,
  ChatStreamError,
  ChatTurnState,
  GroundingFrame,
  ToolName,
} from './familiar-chat.model';

/**
 * Shape the `grounding` frame for `<chora-grounded-attribution>` (CHO-2192).
 *
 * ⚠ `url: ''` is not a stub — it is the whole point. The persisted note kept
 * domain + title + snippet and deliberately NEVER the uri, because the Vertex
 * grounding-api-redirect expires ~30 days after the note was written (ADR-231
 * D4). The attribution component reads the empty url and renders the source as
 * TEXT. Do not "fix" this by substituting some other link: an `<a href="">`
 * resolves to the current page — a source that looks clickable and goes nowhere
 * is precisely the dead link D4 exists to prevent, and it is worse than no link
 * because it looks like it works.
 *
 * `hasProvenance` is derived from CONTENT, so a grounded-but-unrecorded turn
 * (a note older than mig 0094) collapses to the honest "not recorded" line
 * instead of rendering an empty sources block that implies a search we cannot
 * evidence.
 */
function toGroundedView(frame: GroundingFrame): NonNullable<ChatMessage['grounded']> {
  const citations: readonly SeekerCitation[] = (frame.citations ?? []).map((c) => ({
    url: '', // never persisted — it expires (ADR-231 D4)
    domain: c.domain ?? '',
    title: c.title ?? '',
    snippet: c.snippet ?? '',
  }));
  const webSearchQueries = frame.web_search_queries ?? [];
  return {
    hasProvenance: citations.length > 0 || webSearchQueries.length > 0,
    citations,
    webSearchQueries,
    unrecordedNotes: frame.unrecorded_notes ?? 0,
  };
}

/**
 * Phase J.2 — Familiar conversational chat surface (ADR-154).
 *
 * Standalone OnPush component mounted at `/a/companion/:familiarId/chat`.
 * Consumes the SSE stream from `FamiliarChatService`, builds the live
 * transcript signal, and orchestrates the 402 → topup-modal flow.
 *
 * The composer is locked while a turn is in flight (`status` !== 'idle');
 * the streaming assistant message holds the cumulative token text + any
 * tool-call pills so the user sees the engine's "thinking" in real time.
 */
@Component({
  selector: 'chora-aplus-familiar-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    ManaTopupModalComponent,
    FamiliarStageUpOverlayComponent,
    AiTransparencyNoticeComponent,
    AiCompanionBadgeComponent,
    BreedArtComponent,
    GroundedAttributionComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-chat.component.html',
  styleUrl: './familiar-chat.component.scss',
})
export class FamiliarChatComponent {
  private readonly chatService = inject(FamiliarChatService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manaService = inject(MeManaService);
  private readonly realtime = inject(FamiliarRealtimeService);
  private readonly translate = inject(TranslateService);
  private readonly growth = inject(FamiliarGrowthService);

  // CHO-2095: identity header — name WHICH familiar this chat belongs to.
  // Fed from the roster read; a miss or a fetch failure falls back to the
  // generic heading (identity is presentational — never blocks the chat).
  readonly identity = signal<FamiliarSummary | null>(null);
  /** Breed-adjective stage label for the identity chip. */
  readonly identityStage = computed(() => {
    const f = this.identity();
    return f ? breedStageLabel(f.species, f.growthStage) : '';
  });

  // ── WS-2: in-chat stage-up overlay ──────────────────────────────
  /** Non-null while a stage-up overlay is shown during the chat session. */
  readonly chatStageUpOverlay = signal<FamiliarStageTransition | null>(null);

  /**
   * Phase L (2026-05-16) — slug → UUID adapter for Phyllis's demo.
   *
   * BE round-15 (002b9647) seeded Eira at UUID
   * `00000000-0000-7000-8000-00000000e1a0`, but `GET /me/familiars`
   * read-side adapter is still stubbed until M14.1 (per BE note
   * "pg-side adapter's Get + ListByOwner row.Scan() placeholder").
   * The legacy slug `eira-001` is used in older deep links + the demo
   * walkthrough; transparently swap it to the canonical UUID here so
   * the chat endpoint resolves the seeded row.
   *
   * REMOVE THIS BLOCK after M14.1 closes — at that point the chat
   * route param will always be the resolved UUID from
   * `GET /me/familiars[0].familiar_id`.
   */
  private static readonly DEMO_EIRA_SLUG = 'eira-001';
  private static readonly DEMO_EIRA_UUID =
    '00000000-0000-7000-8000-00000000e1a0';

  readonly familiarId = this.resolveFamiliarId(
    this.route.snapshot.paramMap.get('familiarId') ?? '',
  );

  private resolveFamiliarId(param: string): string {
    if (param === FamiliarChatComponent.DEMO_EIRA_SLUG) {
      return FamiliarChatComponent.DEMO_EIRA_UUID;
    }
    return param;
  }

  readonly draft = signal('');
  readonly messages = signal<readonly ChatMessage[]>([]);
  readonly turnState = signal<ChatTurnState>({ status: 'idle' });
  readonly topupUpsell = signal<InsufficientManaUpsell | null>(null);

  readonly manaBalance = this.manaService.balanceUnits;
  readonly manaTopupState = this.manaService.topupState;

  readonly trimmed = computed(() => this.draft().trim());

  readonly canSend = computed(() => {
    if (this.trimmed().length === 0) return false;
    const s = this.turnState().status;
    // Allow retry on error; only mid-flight states block Send.
    return s !== 'sending' && s !== 'streaming';
  });

  readonly composerLocked = computed(() => {
    const s = this.turnState().status;
    return s === 'sending' || s === 'streaming';
  });

  readonly isStreaming = computed(
    () => this.turnState().status === 'streaming',
  );

  readonly errorBanner = computed(() => {
    const s = this.turnState();
    return s.status === 'error' ? s.error : null;
  });

  readonly topupModalOpen = computed(
    () => this.topupUpsell() !== null,
  );

  constructor() {
    this.manaService.load();

    // WS-2: subscribe to stage-up events during the chat session.
    // The overlay appears over the chat UI without navigating away.
    this.realtime.stageTransition$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => this.chatStageUpOverlay.set(t));

    // Growth-Edge deep-link (dashboard → "Ask Familiar"): pre-seed the composer
    // with a starter about the concept so the learner can edit + send. The chat
    // agent already receives the learner's growth-edge context server-side.
    this.seedDraftFromGrowthEdge();

    // CHO-2095: resolve the identity header from the roster (fail-soft).
    this.growth
      .listMyFamiliars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roster) =>
          this.identity.set(roster.find((f) => f.familiarId === this.familiarId) ?? null),
        error: () => this.identity.set(null),
      });
  }

  /**
   * Pre-seed the draft from `?growth_edge=&concept=` deep-link params — once, on
   * init, ONLY when the composer is empty (never clobbers a typed draft, never
   * auto-sends). `concept` present ⇒ a concept-specific starter; only an edge id
   * ⇒ a generic starter; neither ⇒ no seed.
   */
  private seedDraftFromGrowthEdge(): void {
    const qpm = this.route.snapshot.queryParamMap;
    const concept = (qpm.get('concept') ?? '').trim();
    const growthEdge = (qpm.get('growth_edge') ?? '').trim();
    if (this.draft().trim().length > 0 || (!concept && !growthEdge)) {
      return;
    }
    this.draft.set(
      concept
        ? `${this.translate.instant('aplus.familiar_chat.growth_edge_prefix')} ${concept}`
        : this.translate.instant('aplus.familiar_chat.growth_edge_generic'),
    );
  }

  /** Dismiss the in-chat stage-up overlay. */
  dismissChatStageUp(): void {
    this.chatStageUpOverlay.set(null);
  }

  onDraftInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.draft.set(value);
  }

  send(): void {
    if (!this.canSend()) return;
    const text = this.trimmed();
    const userMsg: ChatMessage = {
      id: this.newId(),
      role: 'user',
      text,
    };
    const assistantId = this.newId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'familiar',
      text: '',
      streaming: true,
      tool_calls: [],
    };
    this.messages.update((arr) => [...arr, userMsg, assistantMsg]);
    this.draft.set('');
    this.turnState.set({ status: 'sending' });

    this.chatService
      .streamChat(this.familiarId, { message: text })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => this.onFrame(event, assistantId),
        error: (err: ChatStreamError) => this.onStreamError(err, assistantId),
        complete: () => this.onStreamComplete(assistantId),
      });
  }

  private onFrame(event: ChatEvent, assistantId: string): void {
    if (event.type === 'session_open') {
      this.turnState.set({
        status: 'streaming',
        assistantMessageId: assistantId,
      });
      return;
    }
    if (event.type === 'tool_call') {
      this.patchAssistant(assistantId, (m) => ({
        ...m,
        tool_calls: [...(m.tool_calls ?? []), { tool: event.tool as ToolName }],
      }));
      return;
    }
    if (event.type === 'token') {
      this.patchAssistant(assistantId, (m) => ({
        ...m,
        text: m.text + event.text,
      }));
      return;
    }
    if (event.type === 'grounding') {
      // CHO-2192 — the turn recalled a research note, so it owes the learner its
      // sources. Arrives BEFORE the tokens: the attribution is attached to the
      // (already-created) placeholder and is on screen as the answer streams in.
      this.patchAssistant(assistantId, (m) => ({
        ...m,
        grounded: toGroundedView(event),
      }));
      return;
    }
    if (event.type === 'turn_complete') {
      this.patchAssistant(assistantId, (m) => ({
        ...m,
        streaming: false,
        completion: {
          mana_charged: event.mana_charged,
          model: event.model,
          finish_reason: event.finish_reason,
        },
      }));
      this.turnState.set({ status: 'idle' });
      this.manaService.load();
      return;
    }
    if (event.type === 'error') {
      this.patchAssistant(assistantId, (m) => ({
        ...m,
        streaming: false,
        error_frame: { code: event.code, message: event.message },
      }));
      this.turnState.set({
        status: 'error',
        error: 'aplus.familiar_chat.error_frame',
      });
      return;
    }
  }

  private onStreamError(err: ChatStreamError, assistantId: string): void {
    // Drop the in-flight assistant placeholder so the transcript is clean.
    this.messages.update((arr) => arr.filter((m) => m.id !== assistantId));

    if (err.kind === 'insufficient_mana') {
      this.topupUpsell.set(err.upsell);
      this.turnState.set({ status: 'idle' });
      return;
    }
    // Transport error — surface as banner, keep composer enabled for retry.
    this.turnState.set({
      status: 'error',
      error: this.transportErrorKey(err.status, err.code),
    });
  }

  private onStreamComplete(assistantId: string): void {
    // Defensive: if turn_complete didn't arrive, settle the placeholder.
    this.patchAssistant(assistantId, (m) =>
      m.streaming ? { ...m, streaming: false } : m,
    );
    if (this.turnState().status !== 'error') {
      this.turnState.set({ status: 'idle' });
    }
  }

  private patchAssistant(
    id: string,
    mut: (m: ChatMessage) => ChatMessage,
  ): void {
    this.messages.update((arr) =>
      arr.map((m) => (m.id === id ? mut(m) : m)),
    );
  }

  private transportErrorKey(status: number, code: string): string {
    if (status === 503 || code === 'ENGINE_NOT_CONFIGURED') {
      return 'aplus.familiar_chat.error_engine_unavailable';
    }
    if (status === 404) {
      return 'aplus.familiar_chat.error_not_found';
    }
    if (status === 401 || status === 403) {
      return 'aplus.familiar_chat.error_unauthorised';
    }
    if (status >= 500 || code === 'GATEWAY_UPSTREAM_5XX') {
      return 'aplus.familiar_chat.error_upstream';
    }
    return 'aplus.familiar_chat.error_generic';
  }

  // ── Topup modal handlers (mirrors atom-authoring Phase H) ─────────

  onTopupDismissed(): void {
    this.topupUpsell.set(null);
    this.manaService.clearTopupState();
  }

  onTopupRequested(): void {
    const upsell = this.topupUpsell();
    if (!upsell) return;
    // WS-2.2 — mint a Stripe Checkout Session for the covering mana pack and
    // redirect; on capture the webhook → identity subscriber credits the wallet.
    const gap = Math.max(0, upsell.required_units - upsell.current_balance_units);
    const sku = recommendedManaPackSku(upsell.recommended_topup_units ?? gap);
    this.manaService.checkoutMana(sku);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  trackMessageById(_i: number, m: ChatMessage): string {
    return m.id;
  }

  /** Turn ordinal — pairs each user+familiar message into a single turn index. */
  turnOrdinal(i: number): number {
    return Math.floor(i / 2);
  }

  trackToolCall(i: number, _t: { tool: ToolName }): number {
    return i;
  }

  private newId(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
