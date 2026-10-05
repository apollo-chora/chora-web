import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { SurveyListComponent } from './survey-list.component';

describe('SurveyListComponent', () => {
  let component: SurveyListComponent;
  let fixture: ComponentFixture<SurveyListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurveyListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="survey-list"]');
    expect(el).toBeTruthy();
  });

  it('should have filter buttons', () => {
    const filterAll = fixture.nativeElement.querySelector('[data-testid="filter-all"]');
    const filterPublished = fixture.nativeElement.querySelector('[data-testid="filter-published"]');
    const filterDraft = fixture.nativeElement.querySelector('[data-testid="filter-draft"]');
    const filterArchived = fixture.nativeElement.querySelector('[data-testid="filter-archived"]');
    expect(filterAll).toBeTruthy();
    expect(filterPublished).toBeTruthy();
    expect(filterDraft).toBeTruthy();
    expect(filterArchived).toBeTruthy();
  });

  it('should default to all filter', () => {
    expect(component.activeFilter()).toBe('all');
  });

  it('should change filter when setFilter is called', () => {
    component.setFilter('published');
    expect(component.activeFilter()).toBe('published');
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('published')).toBe('survey-list__status--published');
    expect(component.statusClass('draft')).toBe('survey-list__status--draft');
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T00:00:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
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
