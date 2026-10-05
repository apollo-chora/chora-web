import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SearchFiltersComponent } from './search-filters.component';
import type { ActiveFilters, AtomSearchFacets } from '../../models/search.model';

describe('SearchFiltersComponent', () => {
  let component: SearchFiltersComponent;
  let fixture: ComponentFixture<SearchFiltersComponent>;

  const emptyFilters: ActiveFilters = { types: [], difficulties: [], topic: null };

  const mockFacets: AtomSearchFacets = {
    atom_type: { multiple_choice: 12, fill_blank: 5, true_false: 3 },
    difficulty: { '1': 2, '2': 4, '3': 8, '4': 7, '5': 5 },
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SearchFiltersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchFiltersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('activeFilters', emptyFilters);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="search-filters"]');
    expect(el).toBeTruthy();
  });

  it('should render filter groups', () => {
    const typeGroup = fixture.nativeElement.querySelector('[data-testid="filter-group-type"]');
    const difficultyGroup = fixture.nativeElement.querySelector(
      '[data-testid="filter-group-difficulty"]',
    );
    const topicGroup = fixture.nativeElement.querySelector('[data-testid="filter-group-topic"]');

    expect(typeGroup).toBeTruthy();
    expect(difficultyGroup).toBeTruthy();
    expect(topicGroup).toBeTruthy();
  });

  it('should not show clear button when no active filters', () => {
    const clearBtn = fixture.nativeElement.querySelector('[data-testid="btn-clear-filters"]');
    expect(clearBtn).toBeNull();
  });

  it('should show clear button when filters are active', () => {
    fixture.componentRef.setInput('activeFilters', {
      types: ['multiple_choice'],
      difficulties: [],
      topic: null,
    });
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('[data-testid="btn-clear-filters"]');
    expect(clearBtn).toBeTruthy();
  });

  it('should compute active filter count', () => {
    fixture.componentRef.setInput('activeFilters', {
      types: ['multiple_choice', 'fill_blank'],
      difficulties: [3],
      topic: 'Biology',
    });
    fixture.detectChanges();

    expect(component.activeFilterCount()).toBe(4);
  });

  it('should emit filtersChanged on type toggle', () => {
    const spy = vi.fn();
    component.filtersChanged.subscribe(spy);

    component.toggleType('multiple_choice');

    expect(spy).toHaveBeenCalledWith({
      types: ['multiple_choice'],
      difficulties: [],
      topic: null,
    });
  });

  it('should emit filtersChanged removing type on second toggle', () => {
    fixture.componentRef.setInput('activeFilters', {
      types: ['multiple_choice'],
      difficulties: [],
      topic: null,
    });
    fixture.detectChanges();

    const spy = vi.fn();
    component.filtersChanged.subscribe(spy);

    component.toggleType('multiple_choice');

    expect(spy).toHaveBeenCalledWith({
      types: [],
      difficulties: [],
      topic: null,
    });
  });

  it('should emit filtersChanged on difficulty toggle', () => {
    const spy = vi.fn();
    component.filtersChanged.subscribe(spy);

    component.toggleDifficulty(3);

    expect(spy).toHaveBeenCalledWith({
      types: [],
      difficulties: [3],
      topic: null,
    });
  });

  it('should emit filtersChanged on topic set', () => {
    const spy = vi.fn();
    component.filtersChanged.subscribe(spy);

    component.setTopic('Biology');

    expect(spy).toHaveBeenCalledWith({
      types: [],
      difficulties: [],
      topic: 'Biology',
    });
  });

  it('should emit filtersCleared on clear all', () => {
    const spy = vi.fn();
    component.filtersCleared.subscribe(spy);

    component.clearAll();

    expect(spy).toHaveBeenCalled();
  });

  it('should return facet counts', () => {
    fixture.componentRef.setInput('facets', mockFacets);
    fixture.detectChanges();

    expect(component.getTypeCount('multiple_choice')).toBe(12);
    expect(component.getTypeCount('code')).toBe(0);
    expect(component.getDifficultyCount(3)).toBe(8);
    expect(component.getDifficultyCount(1)).toBe(2);
  });

  it('should return 0 for facet counts when facets are null', () => {
    expect(component.getTypeCount('multiple_choice')).toBe(0);
    expect(component.getDifficultyCount(3)).toBe(0);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
