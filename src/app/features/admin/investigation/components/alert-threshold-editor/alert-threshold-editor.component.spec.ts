import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AlertThresholdEditorComponent } from './alert-threshold-editor.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';

const CONFIG_URL = `${environment.bffBaseUrl}/api/v1/admin/alerts/config`;

interface AlertConfigStub {
  thresholds: {
    metric_key: string;
    label: string;
    min: number;
    max: number;
    current: number;
    unit: string;
  }[];
  channels: ('email' | 'slack' | 'pagerduty')[];
  breach_rules: {
    severity: string;
    metric_key: string;
    threshold: number;
    action: string;
  }[];
}

/**
 * Build the component. The first detectChanges() fires ngOnInit() →
 * loadConfig() which issues a single GET to /api/v1/admin/alerts/config.
 * Callers supply how that GET resolves (flush or error).
 */
function build(): {
  fixture: ComponentFixture<AlertThresholdEditorComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: AlertThresholdEditorComponent;
} {
  TestBed.configureTestingModule({
    imports: [AlertThresholdEditorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(AlertThresholdEditorComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // ngOnInit → GET
  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('AlertThresholdEditorComponent', () => {
  let fixture: ComponentFixture<AlertThresholdEditorComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: AlertThresholdEditorComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = build();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = built.element;
    component = built.component;
    // Resolve the initial GET with an empty error so the component keeps its
    // DEFAULT_THRESHOLDS and one auto-added breach rule (the steady "ready"
    // state most tests assert against). Override per-describe where needed.
    httpMock.expectOne(CONFIG_URL).error(new ProgressEvent('error'));
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root with the alert-threshold-editor testid + section', () => {
      const root = element.querySelector(
        '[data-testid="alert-threshold-editor"]',
      );
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.getAttribute('role')).toBe('main');
    });

    it('renders the translated title key + a back link', () => {
      const title = element.querySelector('[data-testid="alerts-title"]');
      expect(title?.textContent).toContain(
        'admin.investigation.alert_config_title',
      );
      const back = element.querySelector('[data-testid="btn-back"]');
      expect(back).not.toBeNull();
      expect(back?.tagName).toBe('A');
    });

    it('renders the three core sections (thresholds, channels, rules)', () => {
      expect(
        element.querySelector('[data-testid="threshold-list"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="channel-list"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="breach-rules"]')).not.toBeNull();
    });
  });

  describe('threshold sliders (default state)', () => {
    it('renders one card per default threshold (5 total)', () => {
      // Scope to the threshold list container so the `threshold-list`
      // container testid is not counted by the prefix selector.
      const list = element.querySelector('[data-testid="threshold-list"]')!;
      const cards = list.querySelectorAll('[data-testid^="threshold-"]');
      // 5 threshold cards (latency_p99, error_rate, token_usage, cpu, memory)
      expect(cards.length).toBe(5);
    });

    it('renders the latency_p99 slider with its current default value', () => {
      const slider = element.querySelector(
        '[data-testid="slider-latency_p99"]',
      ) as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.value).toBe('500');
      expect(slider.getAttribute('max')).toBe('5000');
    });

    it('updates the threshold signal + marks unsaved on slider input', () => {
      const slider = element.querySelector(
        '[data-testid="slider-error_rate"]',
      ) as HTMLInputElement;
      slider.value = '42';
      slider.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const updated = component
        .thresholds()
        .find((t) => t.metric_key === 'error_rate');
      expect(updated?.current).toBe(42);
      expect(component.hasUnsavedChanges()).toBe(true);
    });
  });

  describe('notification channels', () => {
    it('renders all three channel checkboxes', () => {
      expect(element.querySelector('[data-testid="channel-email"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="channel-slack"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="channel-pagerduty"]'),
      ).not.toBeNull();
    });

    it('starts with only email enabled (count = 1)', () => {
      expect(component.enabledChannelCount()).toBe(1);
    });

    it('counts enabled channels via the computed signal', () => {
      const channels = component.form.get('channels');
      channels?.patchValue({ email: true, slack: true, pagerduty: false });
      expect(component.enabledChannelCount()).toBe(2);
    });

    it('marks unsaved when a channel checkbox changes', () => {
      const slack = element.querySelector(
        '[data-testid="channel-slack"]',
      ) as HTMLInputElement;
      slack.checked = true;
      slack.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(component.hasUnsavedChanges()).toBe(true);
    });
  });

  describe('SLA breach rules', () => {
    it('auto-adds one breach rule on init', () => {
      expect(component.breachRules.length).toBe(1);
      expect(
        element.querySelector('[data-testid="breach-rule-0"]'),
      ).not.toBeNull();
    });

    it('seeds the auto-added rule with default severity/metric/action', () => {
      const rule = component.breachRules.at(0).value;
      expect(rule.severity).toBe('high');
      expect(rule.metric_key).toBe('latency_p99');
      expect(rule.threshold).toBe(1000);
      expect(rule.action).toBe('notify');
    });

    it('adds a new rule row when Add Rule is clicked', () => {
      (
        element.querySelector(
          '[data-testid="btn-add-rule"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(component.breachRules.length).toBe(2);
      expect(
        element.querySelector('[data-testid="breach-rule-1"]'),
      ).not.toBeNull();
    });

    it('removes a rule row when its remove button is clicked', () => {
      component.addBreachRule();
      fixture.detectChanges();
      expect(component.breachRules.length).toBe(2);

      (
        element.querySelector(
          '[data-testid="btn-remove-rule-0"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(component.breachRules.length).toBe(1);
    });

    it('renders one metric <option> per threshold in the rule metric select', () => {
      const opts = component.metricOptions();
      expect(opts.length).toBe(5);
      expect(opts[0]).toEqual({
        value: 'latency_p99',
        label: 'admin.investigation.metric_latency_p99',
      });
    });
  });

  describe('save flow', () => {
    it('keeps the save button disabled until there are unsaved changes', () => {
      // After init the auto-added rule sets hasUnsavedChanges=true, so the
      // button is enabled. Reset to characterize the disabled branch.
      component.hasUnsavedChanges.set(false);
      fixture.detectChanges();
      const save = element.querySelector(
        '[data-testid="btn-save-config"]',
      ) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });

    it('PUTs the full config payload and toasts success', () => {
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      // Make a change so save() proceeds (form is valid by default).
      component.hasUnsavedChanges.set(true);
      fixture.detectChanges();

      (
        element.querySelector(
          '[data-testid="btn-save-config"]',
        ) as HTMLButtonElement
      ).click();

      const put = httpMock.expectOne(CONFIG_URL);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body.channels).toEqual(['email']);
      expect(put.request.body.thresholds.length).toBe(5);
      expect(put.request.body.breach_rules.length).toBe(1);
      put.flush(null);
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.alerts_saved',
        'success',
      );
      expect(component.saving()).toBe(false);
      expect(component.hasUnsavedChanges()).toBe(false);
    });

    it('toasts an error and stays unsaved when the PUT fails (5xx)', () => {
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.hasUnsavedChanges.set(true);
      fixture.detectChanges();
      component.save();

      const put = httpMock.expectOne(CONFIG_URL);
      expect(put.request.method).toBe('PUT');
      put.flush(
        { error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.alerts_save_error',
        'error',
      );
      expect(component.saving()).toBe(false);
      // The error branch does NOT reset hasUnsavedChanges, so it stays true.
      expect(component.hasUnsavedChanges()).toBe(true);
    });

    it('still issues a PUT even with no unsaved changes (save() only guards on form validity + saving)', () => {
      // save() early-returns only on `form.invalid || saving()` — it does NOT
      // consult hasUnsavedChanges (that flag only disables the button). So a
      // direct save() call always fires the PUT when the form is valid.
      component.hasUnsavedChanges.set(false);
      component.save();
      const put = httpMock.expectOne(CONFIG_URL);
      expect(put.request.method).toBe('PUT');
      put.flush(null);
      fixture.detectChanges();
      expect(component.saving()).toBe(false);
    });

    it('early-returns without a PUT while a save is already in flight', () => {
      component.hasUnsavedChanges.set(true);
      component.save(); // fires PUT, sets saving()=true
      const inflight = httpMock.expectOne(CONFIG_URL);
      expect(component.saving()).toBe(true);

      component.save(); // guarded by saving() — no second PUT
      // verify() in afterEach asserts no stray second PUT fired.
      inflight.flush(null);
      fixture.detectChanges();
      expect(component.saving()).toBe(false);
    });
  });
});

describe('AlertThresholdEditorComponent — load success', () => {
  const SERVER_CONFIG: AlertConfigStub = {
    thresholds: [
      {
        metric_key: 'queue_depth',
        label: 'admin.investigation.metric_queue',
        min: 0,
        max: 500,
        current: 120,
        unit: 'msgs',
      },
    ],
    channels: ['email', 'pagerduty'],
    breach_rules: [
      {
        severity: 'critical',
        metric_key: 'queue_depth',
        threshold: 300,
        action: 'failover',
      },
      {
        severity: 'medium',
        metric_key: 'queue_depth',
        threshold: 150,
        action: 'throttle',
      },
    ],
  };

  let fixture: ComponentFixture<AlertThresholdEditorComponent>;
  let httpMock: HttpTestingController;
  let component: AlertThresholdEditorComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = build();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    httpMock.expectOne(CONFIG_URL).flush(SERVER_CONFIG);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('replaces the thresholds signal with the server thresholds', () => {
    expect(component.thresholds().length).toBe(1);
    expect(component.thresholds()[0].metric_key).toBe('queue_depth');
    expect(component.thresholds()[0].current).toBe(120);
  });

  it('patches the channel checkboxes from the server channels', () => {
    const channels = component.form.get('channels');
    expect(channels?.get('email')?.value).toBe(true);
    expect(channels?.get('slack')?.value).toBe(false);
    expect(channels?.get('pagerduty')?.value).toBe(true);
    expect(component.enabledChannelCount()).toBe(2);
  });

  it('clears the auto-added rule and rebuilds rules from the server payload', () => {
    expect(component.breachRules.length).toBe(2);
    expect(component.breachRules.at(0).value.severity).toBe('critical');
    expect(component.breachRules.at(1).value.action).toBe('throttle');
  });

  it('clears the loading flag after a successful load', () => {
    expect(component.loading()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Augmenting suite — drives the currently-uncovered conditional arms:
//   * loadConfig empty-body (thresholds?.length / channels / breach_rules?.length
//     all FALSE)
//   * onThresholdChange ternary FALSE arm (key matches nothing)
//   * addBreachRule(rule) supplied-value arms + partial-rule ?? fallbacks
//   * save() form.invalid early-return guard
//   * enabledChannelCount() = 3 and = 0 boundaries
//   * save() channel-push `if` arms: all-on and all-off
// ---------------------------------------------------------------------------
describe('AlertThresholdEditorComponent — uncovered branches', () => {
  let fixture: ComponentFixture<AlertThresholdEditorComponent>;
  let httpMock: HttpTestingController;
  let component: AlertThresholdEditorComponent;

  /** Build + answer the initial GET with `respond`, then settle. */
  function init(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void): void {
    TestBed.resetTestingModule();
    const built = build();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    respond(httpMock.expectOne(CONFIG_URL));
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  describe('loadConfig — empty body (all success-`if` FALSE arms)', () => {
    beforeEach(() => {
      // Empty object: thresholds undefined, channels undefined, breach_rules
      // undefined → every guarded block is skipped, defaults preserved.
      init((req) => req.flush({}));
    });

    it('keeps the 5 DEFAULT_THRESHOLDS when no thresholds returned', () => {
      expect(component.thresholds().length).toBe(5);
      expect(component.thresholds()[0].metric_key).toBe('latency_p99');
    });

    it('leaves the channel form at its built defaults when no channels returned', () => {
      const channels = component.form.get('channels');
      expect(channels?.get('email')?.value).toBe(true);
      expect(channels?.get('slack')?.value).toBe(false);
      expect(channels?.get('pagerduty')?.value).toBe(false);
    });

    it('keeps only the ngOnInit-added breach rule when none returned', () => {
      expect(component.breachRules.length).toBe(1);
    });

    it('clears loading after an empty success response', () => {
      expect(component.loading()).toBe(false);
    });
  });

  describe('loadConfig — empty arrays (?.length FALSE, channels [] truthy)', () => {
    it('treats empty thresholds/breach_rules arrays as the FALSE arm but patches empty channels', () => {
      init((req) =>
        req.flush({ thresholds: [], channels: [], breach_rules: [] }),
      );
      // empty arrays: thresholds?.length === 0 (falsy) and breach_rules?.length
      // === 0 (falsy) → both skipped. channels [] is truthy → patches all OFF.
      expect(component.thresholds().length).toBe(5); // defaults retained
      expect(component.breachRules.length).toBe(1); // ngOnInit rule retained
      const channels = component.form.get('channels');
      expect(channels?.get('email')?.value).toBe(false);
      expect(channels?.get('slack')?.value).toBe(false);
      expect(channels?.get('pagerduty')?.value).toBe(false);
      expect(component.enabledChannelCount()).toBe(0);
    });
  });

  describe('onThresholdChange — ternary FALSE arm', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('mutates nothing when the metric key matches no threshold', () => {
      const before = component.thresholds().map((t) => t.current);
      const event = { target: { value: '777' } } as unknown as Event;

      component.onThresholdChange('no_such_metric', event);

      expect(component.thresholds().map((t) => t.current)).toEqual(before);
      // The handler still flags unsaved even when nothing matched.
      expect(component.hasUnsavedChanges()).toBe(true);
    });
  });

  describe('addBreachRule — supplied-rule arms', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('uses every supplied field (?? left-hand arm)', () => {
      component.addBreachRule({
        severity: 'critical',
        metric_key: 'token_usage',
        threshold: 42,
        action: 'quarantine',
      });
      const added = component.breachRules.at(component.breachRules.length - 1).value;
      expect(added.severity).toBe('critical');
      expect(added.metric_key).toBe('token_usage');
      expect(added.threshold).toBe(42);
      expect(added.action).toBe('quarantine');
    });

    it('keeps threshold 0 (?? is nullish-only, 0 is not nullish)', () => {
      component.addBreachRule({
        severity: 'low',
        metric_key: 'error_rate',
        threshold: 0,
        action: 'throttle',
      });
      const added = component.breachRules.at(component.breachRules.length - 1).value;
      expect(added.threshold).toBe(0);
      expect(added.severity).toBe('low');
    });
  });

  describe('save — form.invalid early-return guard', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('does not PUT and does not set saving() when the form is invalid', () => {
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      // Required threshold → set null to make the rule (and form) invalid.
      component.breachRules.at(0).get('threshold')?.setValue(null);
      expect(component.form.invalid).toBe(true);

      component.save();

      expect(component.saving()).toBe(false);
      expect(toastSpy).not.toHaveBeenCalled();
      httpMock.expectNone(CONFIG_URL);
    });
  });

  describe('enabledChannelCount — boundary arms (0 and 3)', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('returns 3 when all channels enabled', () => {
      component.form
        .get('channels')
        ?.patchValue({ email: true, slack: true, pagerduty: true });
      expect(component.enabledChannelCount()).toBe(3);
    });

    it('returns 0 when no channels enabled', () => {
      component.form
        .get('channels')
        ?.patchValue({ email: false, slack: false, pagerduty: false });
      expect(component.enabledChannelCount()).toBe(0);
    });
  });

  describe('save — channel-push `if` arms', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('includes all three channels when all are enabled (all push TRUE arms)', () => {
      component.form
        .get('channels')
        ?.patchValue({ email: true, slack: true, pagerduty: true });
      component.save();
      const put = httpMock.expectOne(CONFIG_URL);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body.channels).toEqual(['email', 'slack', 'pagerduty']);
      put.flush(null);
    });

    it('includes no channels when all are disabled (all push FALSE arms, email FALSE)', () => {
      component.form
        .get('channels')
        ?.patchValue({ email: false, slack: false, pagerduty: false });
      component.save();
      const put = httpMock.expectOne(CONFIG_URL);
      expect(put.request.body.channels).toEqual([]);
      put.flush(null);
    });
  });

  describe('ngOnDestroy', () => {
    beforeEach(() => init((req) => req.error(new ProgressEvent('error'))));

    it('unsubscribes without throwing', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
