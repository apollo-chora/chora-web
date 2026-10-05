import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { CplusConnectionsService } from '../../services/cplus-connections.service';
import { CplusSharedAtomsService } from '../../services/cplus-shared-atoms.service';
import { CplusCardComponent } from '../shared/cplus-card/cplus-card.component';
import { CplusPersonCardComponent } from '../shared/cplus-person-card/cplus-person-card.component';
import { CplusEmptyStateComponent } from '../shared/cplus-empty-state/cplus-empty-state.component';
import { CplusPageHeaderComponent } from '../shared/cplus-page-header/cplus-page-header.component';
import {
  CplusTabsComponent,
  CplusTabItem,
} from '../shared/cplus-tabs/cplus-tabs.component';
import type { CplusBreadcrumbItem } from '../shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../../../core/auth/auth.service';
import type { ConnectionType, FollowSuggestionEntry } from '../../models/cplus-connections.model';
import type { SharedAtomFeedEntry } from '../../models/cplus-shared-atoms.model';

type FlowStep = 'browse' | 'profile';

type ConnectionsTab = ConnectionType | 'suggestions';

@Component({
  selector: 'chora-cplus-connections',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    CplusPageHeaderComponent,
    CplusCardComponent,
    CplusPersonCardComponent,
    CplusEmptyStateComponent,
    CplusTabsComponent,
  ],
  templateUrl: './cplus-connections.component.html',
  styleUrl: './cplus-connections.component.scss',
})
export class CplusConnectionsComponent implements OnInit {
  private readonly connectionsService = inject(CplusConnectionsService);
  private readonly feedService = inject(CplusSharedAtomsService);
  private readonly auth = inject(AuthService);

  readonly connectionsState = this.connectionsService.state;
  readonly connections = this.connectionsService.connections;
  readonly suggestionsState = this.connectionsService.suggestionsState;
  readonly relationSets = this.connectionsService.relationSets;
  readonly actionState = this.connectionsService.actionState;

  /** Current viewer's GCID (for the "You" badge on suggestions). */
  readonly myGcid = computed(() => this.auth.gcid());

  readonly suggestions = computed<readonly FollowSuggestionEntry[]>(() => {
    const s = this.suggestionsState();
    return s.status === 'success' ? s.suggestions : [];
  });

  readonly actingGcid = signal<string | null>(null);

  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Connections', path: null },
  ];

  readonly step = signal<FlowStep>('browse');
  readonly selectedGcid = signal<string | null>(null);
  readonly selectedDisplayName = signal<string>('');

  readonly typeTabs: CplusTabItem[] = [
    { id: 'following', label: 'cplus.connections.tab.following' },
    { id: 'followers', label: 'cplus.connections.tab.followers' },
    { id: 'suggestions', label: 'cplus.connections.tab.suggestions' },
    { id: 'blocked', label: 'cplus.connections.tab.blocked' },
  ];

  readonly activeTab = signal<ConnectionsTab>('following');

  readonly confirmBlockGcid = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadActiveTab();
    void this.connectionsService.loadRelationSets();
  }

  onTabChange(id: string): void {
    this.activeTab.set(id as ConnectionsTab);
    this.confirmBlockGcid.set(null);
    void this.loadActiveTab();
  }

  private loadActiveTab(): Promise<unknown> {
    const tab = this.activeTab();
    if (tab === 'suggestions') {
      return this.connectionsService.loadSuggestions();
    }
    return this.connectionsService.loadConnections(tab);
  }

  private async refreshAfterAction(): Promise<void> {
    await Promise.all([
      this.loadActiveTab(),
      this.connectionsService.loadRelationSets(),
    ]);
  }

  actionPending(gcid: string): boolean {
    const s = this.actionState();
    return s.status === 'pending' && s.gcid === gcid;
  }

  async onFollow(gcid: string): Promise<void> {
    if (await this.connectionsService.follow(gcid)) {
      await this.refreshAfterAction();
    }
  }

  async onUnfollow(gcid: string): Promise<void> {
    if (await this.connectionsService.unfollow(gcid)) {
      await this.refreshAfterAction();
    }
  }

  async onBlock(gcid: string): Promise<void> {
    if (this.confirmBlockGcid() !== gcid) {
      this.confirmBlockGcid.set(gcid);
      return;
    }
    this.confirmBlockGcid.set(null);
    if (await this.connectionsService.block(gcid)) {
      await this.refreshAfterAction();
    }
  }

  async onUnblock(gcid: string): Promise<void> {
    if (await this.connectionsService.unblock(gcid)) {
      await this.refreshAfterAction();
    }
  }

  viewConnectionProfile(gcid: string, displayName?: string): void {
    this.selectedGcid.set(gcid);
    this.selectedDisplayName.set(displayName ?? '');
    this.step.set('profile');
  }

  backToBrowse(): void {
    this.step.set('browse');
    this.selectedGcid.set(null);
  }

  connectionAtoms(gcid: string): SharedAtomFeedEntry[] {
    return this.feedService
      .cards()
      .filter((c) => c.author_gcid === gcid)
      .slice(0, 5);
  }

  connectionShareCount(gcid: string): number {
    return this.feedService.cards().filter((c) => c.author_gcid === gcid).length;
  }


  shortGcid(gcid: string): string {
    const short = gcid.replace(/^gcid-/, '').replace(/-/g, '').slice(0, 8);
    return short ? `gcid-${short}` : gcid;
  }

  /** Display name for a suggestion row, falling back to the GCID short handle. */
  displayName(entry: FollowSuggestionEntry): string {
    return entry.display_name || this.shortGcid(entry.gcid);
  }

  /** Comma-joined shared-interest tag label (empty when no shared tags). */
  sharedTagsLabel(entry: FollowSuggestionEntry): string {
    return entry.shared_tags.join(', ');
  }

  emptyKey(): string {
    return `cplus.connections.empty.${this.activeTab()}`;
  }
}
