import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';

import { CplusLeaderboardsService } from '../../services/cplus-leaderboards.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CplusCardComponent } from '../shared/cplus-card/cplus-card.component';
import { CplusEmptyStateComponent } from '../shared/cplus-empty-state/cplus-empty-state.component';
import { CplusPageHeaderComponent } from '../shared/cplus-page-header/cplus-page-header.component';
import { CplusStatCardComponent } from '../shared/cplus-stat-card/cplus-stat-card.component';
import { CplusTabsComponent, CplusTabItem } from '../shared/cplus-tabs/cplus-tabs.component';
import type { CplusBreadcrumbItem } from '../shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardScope,
} from '../../models/cplus-leaderboards.model';

@Component({
  selector: 'chora-cplus-leaderboards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CplusCardComponent,
    CplusEmptyStateComponent,
    CplusPageHeaderComponent,
    CplusStatCardComponent,
    CplusTabsComponent,
    TranslatePipe,
  ],
  templateUrl: './cplus-leaderboards.component.html',
  styleUrl: './cplus-leaderboards.component.scss',
})
export class CplusLeaderboardsComponent implements OnInit {
  private readonly leaderboardsService = inject(CplusLeaderboardsService);
  private readonly auth = inject(AuthService);

  readonly state = this.leaderboardsService.state;
  readonly entries = this.leaderboardsService.entries;
  readonly hasMore = computed(() => this.leaderboardsService.hasMore());
  readonly loadingMore = computed(() => this.leaderboardsService.loadingMore());

  readonly myGcid = computed(() => this.auth.gcid());
  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Leaderboards', path: null },
  ];

  readonly scope = signal<LeaderboardScope>('global');
  readonly metric = signal<LeaderboardMetric>('xp');
  readonly period = signal<LeaderboardPeriod>('all-time');

  readonly scopeTabs: CplusTabItem[] = [
    { id: 'global', label: 'cplus.leaderboards.tab.global' },
    { id: 'tenant', label: 'cplus.leaderboards.tab.tenant' },
    { id: 'class', label: 'cplus.leaderboards.tab.class' },
    { id: 'course', label: 'cplus.leaderboards.tab.course' },
  ];

  readonly metricTabs: CplusTabItem[] = [
    { id: 'xp', label: 'cplus.leaderboards.metric.xp' },
    { id: 'duel_elo', label: 'cplus.leaderboards.metric.duel_elo' },
    { id: 'duel_wins', label: 'cplus.leaderboards.metric.duel_wins' },
    { id: 'reputation', label: 'cplus.leaderboards.metric.reputation' },
    { id: 'streak_days', label: 'cplus.leaderboards.metric.streak_days' },
  ];

  readonly periodTabs: CplusTabItem[] = [
    { id: 'weekly', label: 'cplus.leaderboards.period.weekly' },
    { id: 'monthly', label: 'cplus.leaderboards.period.monthly' },
    { id: 'all-time', label: 'cplus.leaderboards.period.all-time' },
  ];

  readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    void this.leaderboardsService.loadBoard(this.scope(), this.metric(), this.period());
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
            void this.leaderboardsService.loadMore();
          }
        },
        { rootMargin: '200px' },
      );
      this.observer.observe(el);
    }, 100);
  }

  onScopeChange(id: string): void {
    this.scope.set(id as LeaderboardScope);
    void this.leaderboardsService.loadBoard(this.scope(), this.metric(), this.period());
  }

  onMetricChange(id: string): void {
    this.metric.set(id as LeaderboardMetric);
    void this.leaderboardsService.loadBoard(this.scope(), this.metric(), this.period());
  }

  onPeriodChange(id: string): void {
    this.period.set(id as LeaderboardPeriod);
    void this.leaderboardsService.loadBoard(this.scope(), this.metric(), this.period());
  }

  readonly podium = computed<readonly LeaderboardEntry[]>(() => this.entries().slice(0, 3));
  readonly rest = computed<readonly LeaderboardEntry[]>(() => this.entries().slice(3));

  podiumAccent(index: number): 'accent' | 'neutral' | 'success' {
    if (index === 0) return 'accent';
    if (index === 1) return 'neutral';
    return 'success';
  }
  podiumLabel(index: number): string {
    return `#${index + 1}`;
  }

  // shortGcid renders a truncated gcid when no display_name is available.
  // Mirrors the duels component's shortGcid helper.
  shortGcid(gcid: string): string {
    const short = gcid.replace(/-/g, '').slice(0, 8);
    return short ? `${short}…` : gcid;
  }

  // displayName returns the entry's display_name, or a short gcid fallback
  // when the profile has no display_name set.
  displayName(entry: LeaderboardEntry): string {
    return entry.display_name || this.shortGcid(entry.gcid);
  }

  // isMe checks if the entry is the currently authenticated user — used to
  // render a "You" badge on the user's own row.
  isMe(entry: LeaderboardEntry): boolean {
    return entry.gcid === this.myGcid();
  }

  // metricUnit returns the display label for the active metric — suffixed
  // to the score so "40" becomes "40 XP" instead of a bare number.
  metricUnit(): string {
    const units: Record<LeaderboardMetric, string> = {
      xp: 'XP',
      duel_wins: 'Wins',
      duel_elo: 'ELO',
      reputation: 'Rep',
      streak_days: 'Days',
    };
    return units[this.metric()] ?? '';
  }
}
