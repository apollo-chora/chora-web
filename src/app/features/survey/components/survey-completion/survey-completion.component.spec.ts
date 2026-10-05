import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { SurveyCompletionComponent } from './survey-completion.component';

describe('SurveyCompletionComponent', () => {
  let component: SurveyCompletionComponent;
  let fixture: ComponentFixture<SurveyCompletionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurveyCompletionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyCompletionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="survey-completion"]');
    expect(el).toBeTruthy();
  });

  it('should display thank you title', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="completion-title"]');
    expect(title).toBeTruthy();
  });

  it('should display completion message', () => {
    const message = fixture.nativeElement.querySelector('[data-testid="completion-message"]');
    expect(message).toBeTruthy();
  });

  it('should display completion icon', () => {
    const icon = fixture.nativeElement.querySelector('[data-testid="completion-icon"]');
    expect(icon).toBeTruthy();
  });

  it('should have dashboard navigation link', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-dashboard"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('href')).toBe('/dashboard');
  });

  it('should have browse surveys navigation link', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-browse-surveys"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('href')).toBe('/survey');
  });

  it('should compute surveyTitle as empty when no survey loaded', () => {
    expect(component.surveyTitle()).toBe('');
  });

  it('should compute hasResponse as false initially', () => {
    expect(component.hasResponse()).toBe(false);
  });

  it('should compute completedAt as empty when no response', () => {
    expect(component.completedAt()).toBe('');
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
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
