import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SearchResultCardComponent } from './search-result-card.component';
import type { AtomSearchHit } from '../../models/search.model';

describe('SearchResultCardComponent', () => {
  let component: SearchResultCardComponent;
  let fixture: ComponentFixture<SearchResultCardComponent>;

  const mockHit: AtomSearchHit = {
    id: 'atom-1',
    title: 'Photosynthesis Light Reactions',
    content_excerpt: 'In the light reactions of <em>photosynthesis</em>, chlorophyll absorbs...',
    atom_type: 'multiple_choice',
    difficulty: 3,
    labels: ['biology', 'plants'],
    topic_names: ['Biology', 'Botany'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchResultCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchResultCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('hit', mockHit);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="search-result-card"]');
    expect(el).toBeTruthy();
  });

  it('should display atom title', () => {
    const titleEl = fixture.nativeElement.querySelector('[data-testid="result-title"]');
    expect(titleEl.textContent).toContain('Photosynthesis Light Reactions');
  });

  it('should display type badge', () => {
    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-type-badge"]');
    expect(badgeEl).toBeTruthy();
  });

  it('should display difficulty badge', () => {
    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-difficulty-badge"]');
    expect(badgeEl).toBeTruthy();
    expect(badgeEl.textContent.trim()).toContain('3');
  });

  it('should display content excerpt with innerHTML', () => {
    const excerptEl = fixture.nativeElement.querySelector('[data-testid="result-excerpt"]');
    expect(excerptEl).toBeTruthy();
    expect(excerptEl.innerHTML).toContain('<em>');
  });

  it('should display topic tags', () => {
    const tags = fixture.nativeElement.querySelectorAll('[data-testid="result-topic-tag"]');
    expect(tags.length).toBe(2);
    expect(tags[0].textContent.trim()).toContain('Biology');
    expect(tags[1].textContent.trim()).toContain('Botany');
  });

  it('should display label tags', () => {
    const tags = fixture.nativeElement.querySelectorAll('[data-testid="result-label-tag"]');
    expect(tags.length).toBe(2);
    expect(tags[0].textContent).toContain('#biology');
  });

  it('should compute correct difficulty class', () => {
    expect(component.difficultyClass()).toBe('search-result-card__difficulty--level-3');
  });

  it('should not display excerpt when content_excerpt is missing', () => {
    const hitWithoutExcerpt: AtomSearchHit = {
      id: 'atom-2',
      title: 'Test Atom',
      atom_type: 'true_false',
      difficulty: 1,
    };
    fixture.componentRef.setInput('hit', hitWithoutExcerpt);
    fixture.detectChanges();

    const excerptEl = fixture.nativeElement.querySelector('[data-testid="result-excerpt"]');
    expect(excerptEl).toBeNull();
  });

  it('should not display topics when topic_names is empty', () => {
    const hitWithoutTopics: AtomSearchHit = {
      id: 'atom-3',
      title: 'Test Atom',
      atom_type: 'fill_blank',
      difficulty: 2,
      topic_names: [],
    };
    fixture.componentRef.setInput('hit', hitWithoutTopics);
    fixture.detectChanges();

    const topicContainer = fixture.nativeElement.querySelector('[data-testid="result-topics"]');
    expect(topicContainer).toBeNull();
  });

  it('should not display labels when labels is empty', () => {
    const hitWithoutLabels: AtomSearchHit = {
      id: 'atom-4',
      title: 'Test Atom',
      atom_type: 'short_answer',
      difficulty: 4,
      labels: [],
    };
    fixture.componentRef.setInput('hit', hitWithoutLabels);
    fixture.detectChanges();

    const labelsContainer = fixture.nativeElement.querySelector('[data-testid="result-labels"]');
    expect(labelsContainer).toBeNull();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // --- Computed signal outputs ---

  it('should compute typeLabel from ATOM_TYPE_LABELS map', () => {
    expect(component.typeLabel()).toBe('search.atom_type_multiple_choice');
  });

  it('should compute difficultyLabel from DIFFICULTY_LABELS map', () => {
    expect(component.difficultyLabel()).toBe('search.difficulty_3');
  });

  it('should expose the atomTypeLabels and difficultyLabels constants', () => {
    expect(component.atomTypeLabels['essay']).toBe('search.atom_type_essay');
    expect(component.difficultyLabels[5]).toBe('search.difficulty_5');
  });

  it('should compute hasExcerpt true when content_excerpt present', () => {
    expect(component.hasExcerpt()).toBe(true);
  });

  it('should compute hasTopics true when topic_names present', () => {
    expect(component.hasTopics()).toBe(true);
  });

  it('should compute hasLabels true when labels present', () => {
    expect(component.hasLabels()).toBe(true);
  });

  // --- Template rendering of translated labels (translate pipe returns raw key) ---

  it('should render the translated type-badge key in template', () => {
    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-type-badge"]');
    expect(badgeEl.textContent.trim()).toBe('search.atom_type_multiple_choice');
  });

  it('should set aria-label on difficulty badge to translated difficulty key', () => {
    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-difficulty-badge"]');
    expect(badgeEl.getAttribute('aria-label')).toBe('search.difficulty_3');
  });

  it('should apply the computed difficulty class to the difficulty badge', () => {
    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-difficulty-badge"]');
    expect(badgeEl.classList).toContain('search-result-card__difficulty--level-3');
  });

  it('should set the article aria-label to the hit title', () => {
    const article = fixture.nativeElement.querySelector('[data-testid="search-result-card"]');
    expect(article.getAttribute('aria-label')).toBe('Photosynthesis Light Reactions');
  });

  // --- Other atom types / difficulty levels ---

  it('should compute correct type and difficulty labels for a code/level-5 hit', () => {
    const codeHit: AtomSearchHit = {
      id: 'atom-code',
      title: 'Binary Search Implementation',
      atom_type: 'code',
      difficulty: 5,
    };
    fixture.componentRef.setInput('hit', codeHit);
    fixture.detectChanges();

    expect(component.typeLabel()).toBe('search.atom_type_code');
    expect(component.difficultyLabel()).toBe('search.difficulty_5');
    expect(component.difficultyClass()).toBe('search-result-card__difficulty--level-5');

    const badgeEl = fixture.nativeElement.querySelector('[data-testid="result-difficulty-badge"]');
    expect(badgeEl.textContent.trim()).toContain('5');
    expect(badgeEl.classList).toContain('search-result-card__difficulty--level-5');
  });

  it('should compute level-1 difficulty class for a simulation/level-1 hit', () => {
    const simHit: AtomSearchHit = {
      id: 'atom-sim',
      title: 'Pendulum Simulation',
      atom_type: 'simulation',
      difficulty: 1,
    };
    fixture.componentRef.setInput('hit', simHit);
    fixture.detectChanges();

    expect(component.typeLabel()).toBe('search.atom_type_simulation');
    expect(component.difficultyClass()).toBe('search-result-card__difficulty--level-1');
    expect(component.difficultyLabel()).toBe('search.difficulty_1');
  });

  // --- Undefined (not just empty-array) optional fields ---

  it('should treat undefined topic_names / labels / content_excerpt as absent', () => {
    const bareHit: AtomSearchHit = {
      id: 'atom-bare',
      title: 'Bare Atom',
      atom_type: 'matching',
      difficulty: 2,
    };
    fixture.componentRef.setInput('hit', bareHit);
    fixture.detectChanges();

    expect(component.hasTopics()).toBe(false);
    expect(component.hasLabels()).toBe(false);
    expect(component.hasExcerpt()).toBe(false);

    expect(fixture.nativeElement.querySelector('[data-testid="result-topics"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="result-labels"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="result-excerpt"]')).toBeNull();
  });

  it('should treat an empty-string content_excerpt as absent', () => {
    const emptyExcerptHit: AtomSearchHit = {
      id: 'atom-empty-excerpt',
      title: 'Empty Excerpt',
      atom_type: 'ordering',
      difficulty: 4,
      content_excerpt: '',
    };
    fixture.componentRef.setInput('hit', emptyExcerptHit);
    fixture.detectChanges();

    expect(component.hasExcerpt()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="result-excerpt"]')).toBeNull();
  });

  it('should render a single topic and single label correctly', () => {
    const oneEachHit: AtomSearchHit = {
      id: 'atom-one',
      title: 'One Each',
      atom_type: 'true_false',
      difficulty: 2,
      topic_names: ['Chemistry'],
      labels: ['acids'],
    };
    fixture.componentRef.setInput('hit', oneEachHit);
    fixture.detectChanges();

    const topicTags = fixture.nativeElement.querySelectorAll('[data-testid="result-topic-tag"]');
    const labelTags = fixture.nativeElement.querySelectorAll('[data-testid="result-label-tag"]');
    expect(topicTags.length).toBe(1);
    expect(topicTags[0].textContent.trim()).toBe('Chemistry');
    expect(labelTags.length).toBe(1);
    expect(labelTags[0].textContent.trim()).toBe('#acids');
  });
});
