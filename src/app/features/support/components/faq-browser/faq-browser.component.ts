/**
 * FaqBrowserComponent — Searchable FAQ browser with category sidebar and expandable articles.
 *
 * Route: /support/faq
 *
 * Features:
 *   - Category list sidebar for filtering
 *   - Search input for full-text search across articles
 *   - Article list with question and expandable answer detail
 *   - Empty state for no matching articles
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SupportService } from '../../services/support.service';
import type { FaqArticle, FaqCategory } from '../../models/support.model';

@Component({
  selector: 'chora-faq-browser',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './faq-browser.component.html',
  styleUrl: './faq-browser.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqBrowserComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);

  // --- State ---
  readonly faqListState = this.supportService.faqListState;
  readonly faqCategoryState = this.supportService.faqCategoryState;
  readonly faqArticles = this.supportService.faqArticles;
  readonly faqCategories = this.supportService.faqCategories;

  // --- Local state ---
  readonly searchQuery = signal('');
  readonly selectedCategoryId = signal<string | null>(null);
  readonly expandedArticleId = signal<string | null>(null);

  // --- Computed ---
  readonly filteredArticles = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    let articles = this.faqArticles();

    if (query) {
      articles = articles.filter(
        (a) =>
          a.question.toLowerCase().includes(query) ||
          a.answer.toLowerCase().includes(query),
      );
    }

    return articles;
  });

  readonly articleCount = computed(() => this.filteredArticles().length);

  readonly selectedCategoryName = computed(() => {
    const catId = this.selectedCategoryId();
    if (!catId) return null;
    const cat = this.faqCategories().find((c) => c.id === catId);
    return cat?.name ?? null;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.supportService.loadFaqCategories().subscribe(),
    );
    this.subscriptions.add(
      this.supportService.loadFaqArticles().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  updateSearch(query: string): void {
    this.searchQuery.set(query);
  }

  selectCategory(categoryId: string | null): void {
    this.selectedCategoryId.set(categoryId);
    this.expandedArticleId.set(null);

    // Reload articles with category filter
    this.subscriptions.add(
      this.supportService.loadFaqArticles({
        category_id: categoryId ?? undefined,
        search: this.searchQuery().trim() || undefined,
      }).subscribe(),
    );
  }

  searchArticles(): void {
    this.expandedArticleId.set(null);

    this.subscriptions.add(
      this.supportService.loadFaqArticles({
        category_id: this.selectedCategoryId() ?? undefined,
        search: this.searchQuery().trim() || undefined,
      }).subscribe(),
    );
  }

  toggleArticle(articleId: string): void {
    if (this.expandedArticleId() === articleId) {
      this.expandedArticleId.set(null);
    } else {
      this.expandedArticleId.set(articleId);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isExpanded(articleId: string): boolean {
    return this.expandedArticleId() === articleId;
  }

  trackArticle(_index: number, article: FaqArticle): string {
    return article.id;
  }

  trackCategory(_index: number, category: FaqCategory): string {
    return category.id;
  }
}
