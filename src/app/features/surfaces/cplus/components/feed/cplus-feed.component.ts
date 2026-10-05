import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CplusSharedAtomsService } from '../../services/cplus-shared-atoms.service';
import { CplusBookmarksService } from '../../services/cplus-bookmarks.service';
import { CplusConnectionsService } from '../../services/cplus-connections.service';
import {
  CplusReactionsService,
  REACTIONS,
  type ReactionKind,
} from '../../services/cplus-reactions.service';
import { CplusCardComponent } from '../shared/cplus-card/cplus-card.component';
import { CplusPersonCardComponent } from '../shared/cplus-person-card/cplus-person-card.component';
import { CplusEmptyStateComponent } from '../shared/cplus-empty-state/cplus-empty-state.component';
import { CplusPageHeaderComponent } from '../shared/cplus-page-header/cplus-page-header.component';
import { CplusTabsComponent, type CplusTabItem } from '../shared/cplus-tabs/cplus-tabs.component';
import { TimeAgoPipe } from '../../../../../shared/pipes/time-ago.pipe';
import type { CplusBreadcrumbItem } from '../shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { FeedScope, SharedAtomFeedEntry } from '../../models/cplus-shared-atoms.model';
import { AuthService } from '../../../../../core/auth/auth.service';
import { AtomAuthoringService } from '../../../aplus/atom-authoring/atom-authoring.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

type SortMode = 'newest' | 'popular';

@Component({
  selector: 'chora-cplus-feed',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CplusCardComponent,
    CplusPersonCardComponent,
    CplusEmptyStateComponent,
    CplusPageHeaderComponent,
    CplusTabsComponent,
    TranslatePipe,
    TimeAgoPipe,
  ],
  templateUrl: './cplus-feed.component.html',
  styleUrl: './cplus-feed.component.scss',
})
export class CplusFeedComponent implements OnInit {
  private readonly feedService = inject(CplusSharedAtomsService);
  private readonly bookmarksService = inject(CplusBookmarksService);
  private readonly reactionsService = inject(CplusReactionsService);
  private readonly auth = inject(AuthService);
  private readonly authoringService = inject(AtomAuthoringService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly connectionsService = inject(CplusConnectionsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = this.feedService.state;
  readonly hasMore = computed(() => this.feedService.hasMore());
  readonly loadingMore = computed(() => this.feedService.loadingMore());
  readonly myGcid = computed(() => this.auth.gcid());

  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Feed', path: null },
  ];

  // ── Scope tabs (view switch, not a filter) ────────────────────────────
  readonly scopeTabs: CplusTabItem[] = [
    { id: 'following', label: 'cplus.feed.scope_following' },
    { id: 'tenant', label: 'cplus.feed.scope_tenant' },
    { id: 'global', label: 'cplus.feed.scope_global' },
  ];

  // ── Filter dropdowns ─────────────────────────────────────────────────
  readonly sortOptions: readonly { value: SortMode; labelKey: string }[] = [
    { value: 'newest', labelKey: 'cplus.feed.sort_newest' },
    { value: 'popular', labelKey: 'cplus.feed.sort_popular' },
  ];

  readonly questionTypeOptions: readonly { value: string; labelKey: string }[] = [
    { value: '', labelKey: 'cplus.feed.filter_all' },
    { value: 'mcq', labelKey: 'cplus.feed.question_type_mcq' },
    { value: 'oe', labelKey: 'cplus.feed.question_type_oe' },
  ];

  readonly reactions = REACTIONS;

  readonly scope = signal<FeedScope>('tenant');
  readonly sortMode = signal<SortMode>('newest');
  readonly questionTypeFilter = signal<string>('');

  readonly cards = computed<readonly SharedAtomFeedEntry[]>(() => {
    let cards = this.feedService.cards();
    const qt = this.questionTypeFilter();
    if (qt) {
      cards = cards.filter((c) => c.question_type === qt);
    }
    const mode = this.sortMode();
    if (mode === 'popular') {
      cards = [...cards].sort((a, b) => b.reaction_count - a.reaction_count);
    }
    return cards;
  });

  readonly selectedAuthor = signal<{ gcid: string; displayName: string } | null>(null);
  readonly revoking = signal<string | null>(null);
  readonly actingGcid = signal<string | null>(null);
  readonly followingGcids = signal<ReadonlySet<string>>(new Set());
  readonly blockedGcids = signal<ReadonlySet<string>>(new Set());

  readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer: IntersectionObserver | null = null;

  constructor() {
    // Sync feed cards into the reactions service so it knows the initial
    // counts + the viewer's active reaction (my_reaction) before the user
    // clicks anything. Runs whenever the card list changes (load + load-more).
    effect(() => {
      for (const card of this.cards()) {
        this.reactionsService.initFromCard(
          card.share_entry_id,
          card.reaction_counts as Record<string, number> | undefined,
          card.my_reaction,
        );
      }
    });
  }

  ngOnInit(): void {
    void this.feedService.loadFeed(this.scope());
    void this.bookmarksService.listBookmarks();
    this.setupIntersectionObserver();
  }

  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    setTimeout(() => {
      const el = this.sentinel()?.nativeElement;
      if (!el) return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && this.hasMore() && !this.loadingMore()) {
            void this.feedService.loadMore();
          }
        },
        { rootMargin: '200px' },
      );
      this.observer.observe(el);
    }, 100);
  }

  onScopeChange(id: string): void {
    this.scope.set(id as FeedScope);
    void this.feedService.loadFeed(id as FeedScope);
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortMode;
    this.sortMode.set(value);
  }

  onFilterChange(event: Event): void {
    this.questionTypeFilter.set((event.target as HTMLSelectElement).value);
  }
  getReaction(entryId: string): ReactionKind | null {
    return this.reactionsService.getReaction(entryId);
  }

  /** Per-type count — always from the service's live state (0 after unreact). */
  reactionCount(card: SharedAtomFeedEntry, kind: ReactionKind): number {
    const state = this.reactionsService.postState().get(card.share_entry_id);
    if (state) return state.counts?.[kind] ?? 0;
    return card.reaction_counts?.[kind] ?? 0;
  }

  async react(entryId: string, kind: ReactionKind, event: Event): Promise<void> {
    event.stopPropagation();
    await this.reactionsService.react(entryId, kind);
  }

  async toggleBookmark(atomId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.bookmarksService.toggle(atomId);
  }

  isBookmarked(atomId: string): boolean {
    return this.bookmarksService.isBookmarked(atomId);
  }

  async revokeShare(card: SharedAtomFeedEntry, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.revoking() === card.atom_id) return;
    const confirmed = await this.confirmDialog.confirm({
      title: 'cplus.feed.remove_from_feed',
      message: 'cplus.feed.remove_from_feed_confirm',
      confirmText: 'cplus.feed.remove_from_feed',
      variant: 'danger',
    });
    if (!confirmed) return;
    this.revoking.set(card.atom_id);
    this.authoringService
      .revokeShare(card.atom_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.revoking.set(null);
          this.feedService.removeCard(card.share_entry_id);
        },
        error: () => {
          this.revoking.set(null);
        },
      });
  }

  viewAuthor(gcid: string, displayName: string, event: Event): void {
    event.stopPropagation();
    this.selectedAuthor.set({ gcid, displayName });
    void this.refreshFollowing();
  }

  private async refreshFollowing(): Promise<void> {
    await this.connectionsService.loadConnections('following');
    this.followingGcids.set(new Set(this.connectionsService.connections().map((c) => c.gcid)));
    await this.connectionsService.loadConnections('blocked');
    this.blockedGcids.set(new Set(this.connectionsService.connections().map((c) => c.gcid)));
  }

  isFollowingAuthor(gcid: string): boolean {
    return this.followingGcids().has(gcid);
  }

  isBlockedAuthor(gcid: string): boolean {
    return this.blockedGcids().has(gcid);
  }
  async toggleFollowAuthor(gcid: string): Promise<void> {
    if (this.actingGcid() === gcid) return;
    this.actingGcid.set(gcid);
    const wasFollowing = this.isFollowingAuthor(gcid);
    const ok = wasFollowing
      ? await this.connectionsService.unfollow(gcid)
      : await this.connectionsService.follow(gcid);
    this.actingGcid.set(null);
    if (!ok) {
      this.toast.show(
        wasFollowing ? 'cplus.feed.unfollow_failed' : 'cplus.feed.follow_failed',
        'error',
      );
      return;
    }
    void this.refreshFollowing();
  }
  async toggleBlockAuthor(gcid: string): Promise<void> {
    if (this.actingGcid() === gcid) return;
    this.actingGcid.set(gcid);
    const wasBlocked = this.isBlockedAuthor(gcid);
    const ok = wasBlocked
      ? await this.connectionsService.unblock(gcid)
      : await this.connectionsService.block(gcid);
    this.actingGcid.set(null);
    if (!ok) {
      this.toast.show(
        wasBlocked ? 'cplus.feed.unblock_failed' : 'cplus.feed.block_failed',
        'error',
      );
      return;
    }
    if (wasBlocked) {
      this.blockedGcids.update((s) => {
        const next = new Set(s);
        next.delete(gcid);
        return next;
      });
    } else {
      this.blockedGcids.update((s) => {
        const next = new Set(s);
        next.add(gcid);
        return next;
      });
    }
  }

  closeAuthor(): void {
    this.selectedAuthor.set(null);
  }

  authorDisplay(card: SharedAtomFeedEntry): string {
    return card.author_display_name || this.shortGcid(card.author_gcid);
  }

  shortGcid(gcid: string): string {
    const short = gcid.replace(/^gcid-/, '').replace(/-/g, '').slice(0, 8);
    return short ? `gcid-${short}` : gcid;
  }

  authorInitial(card: SharedAtomFeedEntry): string {
    const name = card.author_display_name?.trim();
    if (name) return name.charAt(0).toUpperCase();
    const short = card.author_gcid.replace(/^gcid-/, '').replace(/-/g, '').slice(0, 1);
    return short ? short.toUpperCase() : '?';
  }

  authorShareCount(gcid: string): number {
    return this.feedService.cards().filter((c) => c.author_gcid === gcid).length;
  }

  authorAtoms(gcid: string): SharedAtomFeedEntry[] {
    return this.feedService
      .cards()
      .filter((c) => c.author_gcid === gcid)
      .slice(0, 5);
  }

  licenseKey(license: string): string {
    const map: Record<string, string> = {
      free: 'cplus.feed.license_free',
      royalty_pct: 'cplus.feed.license_royalty_pct',
      royalty_fixed: 'cplus.feed.license_royalty_fixed',
      cc_by_sa: 'cplus.feed.license_cc_by_sa',
      cc_nd: 'cplus.feed.license_cc_nd',
    };
    return map[license] ?? `cplus.feed.license_${license}`;
  }

  questionTypeKey(qt: string): string {
    const map: Record<string, string> = {
      mcq: 'cplus.feed.question_type_mcq',
      oe: 'cplus.feed.question_type_oe',
      essay: 'cplus.feed.question_type_essay',
      fill_blank: 'cplus.feed.question_type_fill_blank',
      true_false: 'cplus.feed.question_type_true_false',
      short_answer: 'cplus.feed.question_type_short_answer',
      matching: 'cplus.feed.question_type_matching',
      ordering: 'cplus.feed.question_type_ordering',
      code: 'cplus.feed.question_type_code',
      multimedia: 'cplus.feed.question_type_multimedia',
      simulation: 'cplus.feed.question_type_simulation',
    };
    return map[qt] ?? `cplus.feed.question_type_${qt}`;
  }

  royaltyDisplay(card: SharedAtomFeedEntry): string | null {
    if (!card.royalty_rate) return null;
    if (card.royalty_rate.kind === 'pct') {
      return `${card.royalty_rate.value}%`;
    }
    return `${card.royalty_rate.value}`;
  }
}
