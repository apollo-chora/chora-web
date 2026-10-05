import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { CplusBookmarksService } from '../services/cplus-bookmarks.service';
import { CplusPageHeaderComponent } from '../components/shared/cplus-page-header/cplus-page-header.component';
import { CplusEmptyStateComponent } from '../components/shared/cplus-empty-state/cplus-empty-state.component';
import { CplusCardComponent } from '../components/shared/cplus-card/cplus-card.component';
import type { CplusBreadcrumbItem } from '../components/shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { BookmarkEntry } from '../models/cplus-bookmarks.model';

@Component({
  selector: 'chora-cplus-bookmarks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    CplusPageHeaderComponent,
    CplusEmptyStateComponent,
    CplusCardComponent,
  ],
  template: `
    <chora-cplus-page-header
      [title]="'cplus.bookmarks.title' | translate"
      [description]="'cplus.bookmarks.description' | translate"
      [breadcrumb]="breadcrumb"
    />

    @if (loading()) {
      <p class="cplus-bookmarks__loading">{{ 'cplus.bookmarks.loading' | translate }}</p>
    } @else if (bookmarks().length === 0) {
      <chora-cplus-empty-state
        [heading]="'cplus.bookmarks.empty_heading' | translate"
        [helper]="'cplus.bookmarks.empty_helper' | translate"
        icon="bookmark"
      />
    } @else {
      <div class="cplus-bookmarks__list">
        @for (bookmark of bookmarks(); track bookmark.id) {
          <chora-cplus-card [title]="bookmark.atom_id">
            <div class="cplus-bookmarks__item">
              <span class="cplus-bookmarks__atom-id">{{ bookmark.atom_id }}</span>
              <span class="cplus-bookmarks__date">{{ formatDate(bookmark.created_at) }}</span>
            </div>
          </chora-cplus-card>
        }
      </div>
    }
  `,
  styles: `
    .cplus-bookmarks__loading {
      padding: 2rem;
      text-align: center;
    }
    .cplus-bookmarks__list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .cplus-bookmarks__item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cplus-bookmarks__atom-id {
      font-weight: 500;
    }
    .cplus-bookmarks__date {
      color: var(--chora-text-muted, #888);
      font-size: 0.875rem;
    }
  `,
})
export class BookmarksComponent implements OnInit {
  private readonly bookmarksService = inject(CplusBookmarksService);

  readonly bookmarkState = this.bookmarksService.state;
  readonly loading = signal(false);
  readonly bookmarks = signal<readonly BookmarkEntry[]>([]);

  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Bookmarks', path: null },
  ];

  ngOnInit(): void {
    this.loading.set(true);
    void this.bookmarksService.listBookmarks().then((entries) => {
      this.bookmarks.set(entries);
      this.loading.set(false);
    });
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
