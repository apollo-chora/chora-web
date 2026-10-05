/**
 * SearchComponent — A+ Search Hub (WS-8).
 *
 * Route: /a/search  (parent adds to aplus.routes.ts — do NOT add here)
 * Selector: chora-aplus-search
 *
 * Reads the `q` query param via withComponentInputBinding-compatible
 * `input()` signal. If present on load, fires the initial search.
 *
 * Tabs: All | Atoms | Courses | Collections (counts per tab from service)
 * Result cards: atom → /a/atoms/{id}/play; course → /a/courses/{id};
 *               collection → /a/collections/{id} (route TBD post-WS-6a/6b)
 *
 * Initial state (empty query): recent searches (localStorage) + popular tags.
 * Error state: role="alert" banner + retry CTA.
 * Empty-results state: "No results for '{query}'" message.
 *
 * Integrative UI: no mode toggles — role-conditional rendering for author
 * tools (atom card shows edit link for authors).
 *
 * WCAG 2.1 AA:
 *   - search input: aria-label, autofocus on init
 *   - tabs: role="tablist", role="tab", aria-selected
 *   - results: role="list", tabindex on cards for keyboard nav
 *   - error: role="alert"
 *   - loading: role="status", aria-busy="true"
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SearchService } from './search.service';
import { loadRecentSearches } from './models';

type TabId = 'all' | 'atoms' | 'courses' | 'collections';

const POPULAR_TAGS = [
  'Machine Learning',
  'Data Science',
  'Python',
  'Mathematics',
  'Cloud Computing',
  'Security',
  'Project Management',
  'Communication',
] as const;

@Component({
  selector: 'chora-aplus-search',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent implements OnInit {
  // ── Route query param (withComponentInputBinding) ─────────────────────────
  readonly q = input<string>('');

  // ── DI ────────────────────────────────────────────────────────────────────
  protected readonly searchService = inject(SearchService);
  private readonly router = inject(Router);

  // ── Local state ───────────────────────────────────────────────────────────
  readonly activeTab = signal<TabId>('all');
  readonly inputValue = signal<string>('');
  readonly recentSearches = signal<readonly string[]>([]);
  readonly popularTags: readonly string[] = POPULAR_TAGS;

  // ── Service state accessors ────────────────────────────────────────────────
  readonly state = this.searchService.state;
  readonly atoms = this.searchService.atoms;
  readonly courses = this.searchService.courses;
  readonly collections = this.searchService.collections;
  readonly totalCount = this.searchService.totalCount;
  readonly atomCount = this.searchService.atomCount;
  readonly courseCount = this.searchService.courseCount;
  readonly collectionCount = this.searchService.collectionCount;

  // ── Derived ───────────────────────────────────────────────────────────────

  readonly isIdle = computed<boolean>(() => this.state().status === 'idle');
  readonly isLoading = computed<boolean>(
    () => this.state().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.state().status === 'error',
  );
  readonly isSuccess = computed<boolean>(
    () => this.state().status === 'success',
  );

  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  readonly currentQuery = computed<string>(() => {
    const s = this.state();
    return s.status === 'success' ? s.query : '';
  });

  readonly hasResults = computed<boolean>(() => this.totalCount() > 0);

  /** Results for the active tab. */
  readonly visibleAtoms = computed(() =>
    this.activeTab() === 'all' || this.activeTab() === 'atoms'
      ? this.atoms()
      : [],
  );
  readonly visibleCourses = computed(() =>
    this.activeTab() === 'all' || this.activeTab() === 'courses'
      ? this.courses()
      : [],
  );
  readonly visibleCollections = computed(() =>
    this.activeTab() === 'all' || this.activeTab() === 'collections'
      ? this.collections()
      : [],
  );

  readonly hasVisibleResults = computed<boolean>(
    () =>
      this.visibleAtoms().length > 0 ||
      this.visibleCourses().length > 0 ||
      this.visibleCollections().length > 0,
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  constructor() {
    // Sync q query param → search service on change (e.g., back-nav)
    effect(() => {
      const queryParam = this.q();
      if (queryParam && queryParam !== this.inputValue()) {
        this.inputValue.set(queryParam);
        this.searchService.search(queryParam);
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.recentSearches.set(loadRecentSearches());

    // Autofocus is handled via `autofocus` attr on the input element.
    // Fire initial search if q param present.
    const initialQ = this.q();
    if (initialQ) {
      this.inputValue.set(initialQ);
      this.searchService.search(initialQ);
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  onQueryInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.inputValue.set(val);
    this.searchService.search(val);
    // Sync q param without navigation so the URL is shareable
    void this.router.navigate([], {
      queryParams: { q: val || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    // Reset to "all" tab when query changes
    this.activeTab.set('all');
  }

  onTagClick(tag: string): void {
    this.inputValue.set(tag);
    this.searchService.search(tag);
    void this.router.navigate([], {
      queryParams: { q: tag },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.activeTab.set('all');
  }

  selectTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  retry(): void {
    this.searchService.retry();
  }

  clearSearch(): void {
    this.inputValue.set('');
    this.searchService.search('');
    void this.router.navigate([], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.activeTab.set('all');
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  difficultyLabel(level: number): string {
    const labels: Record<number, string> = {
      1: 'Beginner',
      2: 'Elementary',
      3: 'Intermediate',
      4: 'Advanced',
      5: 'Expert',
    };
    return labels[level] ?? String(level);
  }

  formatPrice(cents: number, isFree: boolean): string {
    if (isFree || cents === 0) return 'Free';
    const sgd = cents / 100;
    return `SGD ${sgd.toFixed(2)}`;
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  trackByString(_index: number, s: string): string {
    return s;
  }
}
