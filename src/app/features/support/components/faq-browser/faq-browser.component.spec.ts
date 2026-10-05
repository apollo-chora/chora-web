import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { FaqBrowserComponent } from './faq-browser.component';
import { SupportService } from '../../services/support.service';
import type { FaqArticle, FaqCategory, PageInfo } from '../../models/support.model';

const FAQ_URL = 'https://api.chora.site/api/v1/support/faq';
const FAQ_CATEGORIES_URL = 'https://api.chora.site/api/v1/support/faq/categories';

const PAGE_INFO: PageInfo = { next_cursor: null, has_next: false };

function makeArticle(over: Partial<FaqArticle> = {}): FaqArticle {
  return {
    id: 'art-1',
    tenant_id: 't-1',
    category_id: 'cat-1',
    question: 'How do I reset my password?',
    answer: 'Click the reset link in the login page.',
    sort_order: 0,
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeCategory(over: Partial<FaqCategory> = {}): FaqCategory {
  return {
    id: 'cat-1',
    tenant_id: 't-1',
    name: 'Account',
    description: 'Account questions',
    sort_order: 0,
    ...over,
  };
}

describe('FaqBrowserComponent', () => {
  let component: FaqBrowserComponent;
  let fixture: ComponentFixture<FaqBrowserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaqBrowserComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FaqBrowserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="faq-browser"]');
    expect(el).toBeTruthy();
  });

  it('should have search input', () => {
    const input = fixture.nativeElement.querySelector('[data-testid="input-search"]');
    expect(input).toBeTruthy();
  });

  it('should have search button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-search"]');
    expect(btn).toBeTruthy();
  });

  it('should have sidebar', () => {
    const sidebar = fixture.nativeElement.querySelector('[data-testid="faq-sidebar"]');
    expect(sidebar).toBeTruthy();
  });

  it('should update search query', () => {
    component.updateSearch('test query');
    expect(component.searchQuery()).toBe('test query');
  });

  it('should select category', () => {
    expect(component.selectedCategoryId()).toBeNull();

    component.selectCategory('cat-1');
    expect(component.selectedCategoryId()).toBe('cat-1');

    component.selectCategory(null);
    expect(component.selectedCategoryId()).toBeNull();
  });

  it('should toggle article expansion', () => {
    expect(component.isExpanded('art-1')).toBe(false);

    component.toggleArticle('art-1');
    expect(component.isExpanded('art-1')).toBe(true);

    component.toggleArticle('art-1');
    expect(component.isExpanded('art-1')).toBe(false);
  });

  it('should collapse previous article when expanding another', () => {
    component.toggleArticle('art-1');
    expect(component.isExpanded('art-1')).toBe(true);

    component.toggleArticle('art-2');
    expect(component.isExpanded('art-1')).toBe(false);
    expect(component.isExpanded('art-2')).toBe(true);
  });

  it('should reset expanded article when selecting category', () => {
    component.toggleArticle('art-1');
    expect(component.isExpanded('art-1')).toBe(true);

    component.selectCategory('cat-1');
    expect(component.expandedArticleId()).toBeNull();
  });

  it('should track articles by id', () => {
    const article = { id: 'art-1' } as FaqArticle;
    expect(component.trackArticle(0, article)).toBe('art-1');
  });

  it('should track categories by id', () => {
    const category = { id: 'cat-1' } as FaqCategory;
    expect(component.trackCategory(0, category)).toBe('cat-1');
  });

  it('should compute articleCount as 0 when no articles', () => {
    expect(component.articleCount()).toBe(0);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Branch-coverage augmentation
  //
  // The component reads faqArticles/faqCategories from SupportService signals.
  // We drive the REAL service via loadFaqArticles/loadFaqCategories and flush
  // the HTTP responses so the success-state signals populate, then exercise
  // the computed/action branches.
  // -------------------------------------------------------------------------
  describe('branch coverage', () => {
    let support: SupportService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      support = TestBed.inject(SupportService);
      httpMock = TestBed.inject(HttpTestingController);
      // ngOnInit (from the outer detectChanges) fired two GETs — flush them so
      // the signals settle and the controller is clean for per-test assertions.
      const categoryReq = httpMock.expectOne(FAQ_CATEGORIES_URL);
      categoryReq.flush({ data: [] });
      const articleReq = httpMock.expectOne(FAQ_URL);
      articleReq.flush({ data: [], page_info: PAGE_INFO });
    });

    afterEach(() => {
      httpMock.verify();
    });

    function loadArticles(articles: FaqArticle[]): void {
      support.loadFaqArticles().subscribe();
      httpMock.expectOne(FAQ_URL).flush({ data: articles, page_info: PAGE_INFO });
    }

    function loadCategories(categories: FaqCategory[]): void {
      support.loadFaqCategories().subscribe();
      httpMock.expectOne(FAQ_CATEGORIES_URL).flush({ data: categories });
    }

    // --- filteredArticles computed: if (query) FALSE arm + empty-list loop ---
    it('returns all articles unfiltered when search query is empty (if FALSE arm)', () => {
      loadArticles([makeArticle({ id: 'a1' }), makeArticle({ id: 'a2' })]);
      component.updateSearch('');
      const result = component.filteredArticles();
      expect(result.length).toBe(2);
      expect(component.articleCount()).toBe(2);
    });

    // --- filteredArticles: if (query) TRUE arm, match on QUESTION (|| left true) ---
    it('filters by question text (|| left operand true)', () => {
      loadArticles([
        makeArticle({ id: 'a1', question: 'Reset password', answer: 'zzz' }),
        makeArticle({ id: 'a2', question: 'Billing info', answer: 'yyy' }),
      ]);
      component.updateSearch('reset');
      const result = component.filteredArticles();
      expect(result.map((a) => a.id)).toEqual(['a1']);
    });

    // --- filteredArticles: TRUE arm, match on ANSWER only (|| left false, right true) ---
    it('filters by answer text when question does not match (|| right operand)', () => {
      loadArticles([
        makeArticle({ id: 'a1', question: 'General', answer: 'unique-keyword here' }),
        makeArticle({ id: 'a2', question: 'Other', answer: 'nothing' }),
      ]);
      component.updateSearch('unique-keyword');
      const result = component.filteredArticles();
      expect(result.map((a) => a.id)).toEqual(['a1']);
    });

    // --- filteredArticles: TRUE arm, no match (both || operands false) ---
    it('returns empty list when query matches neither question nor answer', () => {
      loadArticles([makeArticle({ id: 'a1', question: 'Foo', answer: 'Bar' })]);
      component.updateSearch('zzz-no-match');
      expect(component.filteredArticles()).toEqual([]);
      expect(component.articleCount()).toBe(0);
    });

    // --- filteredArticles: query with surrounding whitespace is trimmed/lowered ---
    it('trims and lowercases the query before filtering', () => {
      loadArticles([makeArticle({ id: 'a1', question: 'Password Reset', answer: 'x' })]);
      component.updateSearch('   PASSWORD   ');
      expect(component.filteredArticles().map((a) => a.id)).toEqual(['a1']);
    });

    // --- selectedCategoryName: !catId TRUE arm (no category selected) -> null ---
    it('selectedCategoryName is null when no category is selected (guard TRUE)', () => {
      loadCategories([makeCategory({ id: 'cat-1', name: 'Account' })]);
      component.selectedCategoryId.set(null);
      expect(component.selectedCategoryName()).toBeNull();
    });

    // --- selectedCategoryName: catId present + found (cat?.name truthy, ?? left) ---
    it('selectedCategoryName resolves the name of the selected category (found)', () => {
      loadCategories([
        makeCategory({ id: 'cat-1', name: 'Account' }),
        makeCategory({ id: 'cat-2', name: 'Billing' }),
      ]);
      component.selectedCategoryId.set('cat-2');
      expect(component.selectedCategoryName()).toBe('Billing');
    });

    // --- selectedCategoryName: catId present but NOT found (cat undefined, ?? null) ---
    it('selectedCategoryName is null when selected id is not in categories (?? null fallback)', () => {
      loadCategories([makeCategory({ id: 'cat-1', name: 'Account' })]);
      component.selectedCategoryId.set('missing-id');
      expect(component.selectedCategoryName()).toBeNull();
    });

    // --- selectCategory: categoryId present (?? left) + non-empty search (|| left) ---
    it('selectCategory sends category_id and search when both present', () => {
      component.updateSearch('  hello  ');
      component.selectCategory('cat-7');
      // Service bakes the query string into the path, so it appears on urlWithParams.
      const req = httpMock.expectOne(
        (r) =>
          r.urlWithParams.includes('category_id=cat-7') && r.urlWithParams.includes('search=hello'),
      );
      req.flush({ data: [], page_info: PAGE_INFO });
    });

    // --- selectCategory: categoryId null (?? undefined) + empty search (|| undefined) ---
    it('selectCategory omits category_id and search when null/empty', () => {
      component.updateSearch('');
      component.selectCategory(null);
      const req = httpMock.expectOne(FAQ_URL);
      expect(req.request.urlWithParams).toBe(FAQ_URL);
      req.flush({ data: [], page_info: PAGE_INFO });
    });

    // --- searchArticles: selectedCategoryId present (?? left) + search non-empty (|| left) ---
    it('searchArticles sends both category_id and search when set', () => {
      component.selectedCategoryId.set('cat-9');
      component.updateSearch(' query ');
      component.searchArticles();
      const req = httpMock.expectOne(
        (r) =>
          r.urlWithParams.includes('search=query') && r.urlWithParams.includes('category_id=cat-9'),
      );
      req.flush({ data: [], page_info: PAGE_INFO });
    });

    // --- searchArticles: selectedCategoryId null (?? undefined) + search empty (|| undefined) ---
    it('searchArticles omits both params when category null and search empty', () => {
      component.selectedCategoryId.set(null);
      component.updateSearch('   ');
      component.searchArticles();
      const req = httpMock.expectOne(FAQ_URL);
      expect(req.request.urlWithParams).toBe(FAQ_URL);
      expect(component.expandedArticleId()).toBeNull();
      req.flush({ data: [], page_info: PAGE_INFO });
    });

    // --- toggleArticle: else arm (expand a different article) ---
    it('toggleArticle expands a new article when none/another is expanded (else arm)', () => {
      component.toggleArticle('art-x');
      expect(component.expandedArticleId()).toBe('art-x');
    });

    // --- toggleArticle: if arm (collapse the currently-expanded article) ---
    it('toggleArticle collapses the same article when re-toggled (if arm)', () => {
      component.toggleArticle('art-x');
      component.toggleArticle('art-x');
      expect(component.expandedArticleId()).toBeNull();
    });

    // --- ngOnDestroy unsubscribes cleanly ---
    it('ngOnDestroy tears down subscriptions without error', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
