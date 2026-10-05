import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SurveyCertificateGateComponent } from './survey-certificate-gate.component';

describe('SurveyCertificateGateComponent', () => {
  let fixture: ComponentFixture<SurveyCertificateGateComponent>;
  let component: SurveyCertificateGateComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurveyCertificateGateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyCertificateGateComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  function setInputs(opts: {
    surveyId?: string;
    completedTitle?: string;
    totalQuestions?: number;
    answeredQuestions?: number;
    surveyComplete?: boolean;
  }): void {
    fixture.componentRef.setInput('surveyId', opts.surveyId ?? 'survey-001');
    if (opts.completedTitle !== undefined) {
      fixture.componentRef.setInput('completedTitle', opts.completedTitle);
    }
    if (opts.totalQuestions !== undefined) {
      fixture.componentRef.setInput('totalQuestions', opts.totalQuestions);
    }
    if (opts.answeredQuestions !== undefined) {
      fixture.componentRef.setInput('answeredQuestions', opts.answeredQuestions);
    }
    if (opts.surveyComplete !== undefined) {
      fixture.componentRef.setInput('surveyComplete', opts.surveyComplete);
    }
  }

  it('should create', () => {
    setInputs({ surveyId: 'survey-001' });
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  describe('visibility', () => {
    it('renders the banner by default (not complete, not dismissed)', () => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="survey-certificate-gate"]');
      expect(banner).toBeTruthy();
      expect(component.visible()).toBe(true);
    });

    it('hides the banner when survey is complete', () => {
      setInputs({ surveyId: 'survey-001', surveyComplete: true });
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="survey-certificate-gate"]');
      expect(banner).toBeNull();
      expect(component.visible()).toBe(false);
    });

    it('hides the banner after dismiss', () => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="survey-certificate-gate"]')).toBeTruthy();

      component.dismiss();
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="survey-certificate-gate"]');
      expect(banner).toBeNull();
      expect(component.dismissed()).toBe(true);
      expect(component.visible()).toBe(false);
    });

    it('stays hidden when both complete and dismissed', () => {
      setInputs({ surveyId: 'survey-001', surveyComplete: true });
      fixture.detectChanges();
      component.dismiss();
      fixture.detectChanges();

      expect(component.visible()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Shell render (ARIA + content)
  // -------------------------------------------------------------------------

  describe('shell render', () => {
    beforeEach(() => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();
    });

    it('renders an alert with aria-live=polite', () => {
      const banner = element.querySelector('[data-testid="survey-certificate-gate"]');
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.getAttribute('aria-live')).toBe('polite');
    });

    it('renders the complete-survey message i18n key', () => {
      const msg = element.querySelector('.survey-gate__message');
      expect(msg?.textContent?.trim()).toBe(
        'shared.survey_gate.complete_survey_message',
      );
    });

    it('renders the go-to-survey CTA i18n key', () => {
      const cta = element.querySelector('[data-testid="btn-go-to-survey"]');
      expect(cta?.textContent?.trim()).toBe('shared.survey_gate.go_to_survey');
    });

    it('renders the dismiss button i18n key', () => {
      const btn = element.querySelector('[data-testid="btn-dismiss-gate"]');
      expect(btn?.textContent?.trim()).toBe('shared.survey_gate.dismiss');
    });

    it('renders the decorative icon as aria-hidden', () => {
      const icon = element.querySelector('.survey-gate__icon');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // -------------------------------------------------------------------------
  // completedTitle context
  // -------------------------------------------------------------------------

  describe('completed title context', () => {
    it('does not render context when completedTitle is empty (default)', () => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();

      const ctx = element.querySelector('.survey-gate__context');
      expect(ctx).toBeNull();
    });

    it('renders the completedTitle when provided', () => {
      setInputs({
        surveyId: 'survey-001',
        completedTitle: 'Intro to Algebra',
      });
      fixture.detectChanges();

      const ctx = element.querySelector('.survey-gate__context');
      expect(ctx).toBeTruthy();
      expect(ctx?.textContent).toContain('Intro to Algebra');
    });
  });

  // -------------------------------------------------------------------------
  // Progress: progressText / progressPct / progressbar rendering
  // -------------------------------------------------------------------------

  describe('progress', () => {
    it('does not render the progress block when totalQuestions is 0', () => {
      setInputs({ surveyId: 'survey-001', totalQuestions: 0, answeredQuestions: 0 });
      fixture.detectChanges();

      const progress = element.querySelector('.survey-gate__progress');
      expect(progress).toBeNull();
    });

    it('returns empty progressText and zero pct when total is 0', () => {
      setInputs({ surveyId: 'survey-001', totalQuestions: 0, answeredQuestions: 3 });
      fixture.detectChanges();

      expect(component.progressText()).toBe('');
      expect(component.progressPct()).toBe(0);
    });

    it('renders the progress block when totalQuestions > 0', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 5,
        answeredQuestions: 2,
      });
      fixture.detectChanges();

      const progress = element.querySelector('.survey-gate__progress');
      expect(progress).toBeTruthy();
    });

    it('computes progressText as answered/total', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 5,
        answeredQuestions: 2,
      });
      fixture.detectChanges();

      expect(component.progressText()).toBe('2/5');

      const text = element.querySelector('[data-testid="survey-progress"]');
      expect(text?.textContent).toContain('2/5');
      expect(text?.textContent).toContain('shared.survey_gate.questions_answered');
    });

    it('computes progressPct rounded to nearest integer', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 3,
        answeredQuestions: 1,
      });
      fixture.detectChanges();

      // 1/3 => 33.33 => rounded 33
      expect(component.progressPct()).toBe(33);
    });

    it('computes progressPct as 100 when all answered', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 4,
        answeredQuestions: 4,
      });
      fixture.detectChanges();

      expect(component.progressPct()).toBe(100);
    });

    it('reflects progressPct on the progressbar aria-valuenow and fill width', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 4,
        answeredQuestions: 1,
      });
      fixture.detectChanges();

      const bar = element.querySelector('.survey-gate__progress-bar');
      expect(bar?.getAttribute('role')).toBe('progressbar');
      expect(bar?.getAttribute('aria-valuenow')).toBe('25');
      expect(bar?.getAttribute('aria-valuemin')).toBe('0');
      expect(bar?.getAttribute('aria-valuemax')).toBe('100');

      const fill = element.querySelector('.survey-gate__progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('25%');
    });

    it('updates progress reactively when answeredQuestions changes', () => {
      setInputs({
        surveyId: 'survey-001',
        totalQuestions: 5,
        answeredQuestions: 1,
      });
      fixture.detectChanges();
      expect(component.progressText()).toBe('1/5');

      fixture.componentRef.setInput('answeredQuestions', 4);
      fixture.detectChanges();

      expect(component.progressText()).toBe('4/5');
      expect(component.progressPct()).toBe(80);
    });
  });

  // -------------------------------------------------------------------------
  // surveyLink
  // -------------------------------------------------------------------------

  describe('surveyLink', () => {
    it('computes the survey route from surveyId', () => {
      setInputs({ surveyId: 'abc-123' });
      fixture.detectChanges();

      expect(component.surveyLink()).toBe('/survey/abc-123');
    });

    it('binds the routerLink href to the survey route', () => {
      setInputs({ surveyId: 'abc-123' });
      fixture.detectChanges();

      const cta = element.querySelector(
        '[data-testid="btn-go-to-survey"]',
      ) as HTMLAnchorElement;
      expect(cta.getAttribute('href')).toBe('/survey/abc-123');
    });

    it('recomputes surveyLink when surveyId changes', () => {
      setInputs({ surveyId: 'first' });
      fixture.detectChanges();
      expect(component.surveyLink()).toBe('/survey/first');

      fixture.componentRef.setInput('surveyId', 'second');
      fixture.detectChanges();
      expect(component.surveyLink()).toBe('/survey/second');
    });
  });

  // -------------------------------------------------------------------------
  // dismiss interaction via DOM
  // -------------------------------------------------------------------------

  describe('dismiss interaction', () => {
    it('dismisses when the dismiss button is clicked', () => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();

      const btn = element.querySelector(
        '[data-testid="btn-dismiss-gate"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      expect(component.dismissed()).toBe(true);
      expect(element.querySelector('[data-testid="survey-certificate-gate"]')).toBeNull();
    });

    it('starts not dismissed', () => {
      setInputs({ surveyId: 'survey-001' });
      fixture.detectChanges();
      expect(component.dismissed()).toBe(false);
    });
  });
});
