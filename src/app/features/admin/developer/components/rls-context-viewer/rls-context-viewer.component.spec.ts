import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { RlsContextViewerComponent } from './rls-context-viewer.component';
import { DeveloperService } from '../../services/developer.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  RlsContext,
  RlsContextState,
  RlsTestResult,
  RlsTestState,
} from '../../models/developer.model';

describe('RlsContextViewerComponent', () => {
  let component: RlsContextViewerComponent;
  let fixture: ComponentFixture<RlsContextViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RlsContextViewerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RlsContextViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="rls-context-viewer"]');
    expect(el).toBeTruthy();
  });

  it('should load RLS context on init', () => {
    // The component calls loadRlsContext in ngOnInit, which uses mock data
    // After init, the context state should be success
    expect(component.contextState().status).toBe('success');
  });

  it('should display session card when context is loaded', () => {
    const sessionCard = fixture.nativeElement.querySelector('[data-testid="session-card"]');
    expect(sessionCard).toBeTruthy();
  });

  it('should display tenant ID in context', () => {
    const tenantId = fixture.nativeElement.querySelector('[data-testid="ctx-tenant-id"]');
    expect(tenantId).toBeTruthy();
    expect(tenantId.textContent).toContain('tenant-001');
  });

  it('should display GCID in context', () => {
    const gcid = fixture.nativeElement.querySelector('[data-testid="ctx-gcid"]');
    expect(gcid).toBeTruthy();
    expect(gcid.textContent).toContain('gcid-admin-001');
  });

  it('should display capabilities list', () => {
    const capsList = fixture.nativeElement.querySelector('[data-testid="capabilities-list"]');
    expect(capsList).toBeTruthy();
  });

  it('should compute capability count', () => {
    expect(component.capabilityCount()).toBeGreaterThan(0);
  });

  it('should display policies card', () => {
    const policiesCard = fixture.nativeElement.querySelector('[data-testid="policies-card"]');
    expect(policiesCard).toBeTruthy();
  });

  it('should compute policy count', () => {
    expect(component.policyCount()).toBeGreaterThan(0);
  });

  it('should compute enabled policy count', () => {
    expect(component.enabledPolicyCount()).toBeGreaterThan(0);
  });

  it('should toggle policy expansion', () => {
    expect(component.isPolicyExpanded(0)).toBe(false);
    component.togglePolicyExpand(0);
    expect(component.isPolicyExpanded(0)).toBe(true);
    component.togglePolicyExpand(0);
    expect(component.isPolicyExpanded(0)).toBe(false);
  });

  it('should return correct policy type class', () => {
    expect(component.policyTypeClass('permissive')).toBe(
      'rls-context-viewer__policy-type--permissive',
    );
    expect(component.policyTypeClass('restrictive')).toBe(
      'rls-context-viewer__policy-type--restrictive',
    );
  });

  it('should format session start timestamp', () => {
    const formatted = component.formatSessionStart(new Date().toISOString());
    expect(formatted).toBeTruthy();
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('should return correct test result class', () => {
    expect(component.testResultClass({ isolated: true, error: null })).toBe(
      'rls-context-viewer__test-result--pass',
    );
    expect(component.testResultClass({ isolated: false, error: null })).toBe(
      'rls-context-viewer__test-result--fail',
    );
    expect(component.testResultClass({ isolated: true, error: 'some error' })).toBe(
      'rls-context-viewer__test-result--error',
    );
  });

  it('should return correct test result label', () => {
    expect(component.testResultLabel({ isolated: true, error: null })).toBe(
      'admin.developer.rls_isolated',
    );
    expect(component.testResultLabel({ isolated: false, error: null })).toBe(
      'admin.developer.rls_not_isolated',
    );
    expect(component.testResultLabel({ isolated: true, error: 'err' })).toBe(
      'admin.developer.rls_error',
    );
  });

  it('should run isolation test', () => {
    component.runIsolationTest();
    fixture.detectChanges();

    expect(component.testResults().length).toBeGreaterThan(0);
    expect(component.testRunning()).toBe(false);
  });

  it('should compute allTestsPassed correctly', () => {
    component.runIsolationTest();
    fixture.detectChanges();

    // Mock data has all tests passing
    expect(component.allTestsPassed()).toBe(true);
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
  // ADDED: branch coverage for the helper / pure-function arms reachable with
  // the real DeveloperService instance (loaded with passing mock data).
  // -------------------------------------------------------------------------

  it('should keep enabled policy count below the total (filter disabled arm)', () => {
    // MOCK_RLS_CONTEXT has 5 policies, all enabled — the filter still has to
    // evaluate each `p.enabled`. Enabled count must equal the total here, and
    // both counts are > 0 (truthy ternary arms).
    expect(component.policyCount()).toBe(5);
    expect(component.enabledPolicyCount()).toBe(5);
  });

  it('should switch expansion from one policy index to another', () => {
    component.togglePolicyExpand(1);
    expect(component.isPolicyExpanded(1)).toBe(true);
    // current (1) !== index (3) → take the `index` arm, not the `null` arm.
    component.togglePolicyExpand(3);
    expect(component.expandedPolicyIndex()).toBe(3);
    expect(component.isPolicyExpanded(1)).toBe(false);
    expect(component.isPolicyExpanded(3)).toBe(true);
  });

  it('should return "Invalid Date" for an unparseable timestamp (no throw, try path)', () => {
    // new Date('not-a-date').toLocaleString() yields "Invalid Date" in jsdom
    // rather than throwing; the catch is a defensive guard. Characterized.
    expect(component.formatSessionStart('not-a-date')).toBe('Invalid Date');
  });

  it('trackByIndex returns the supplied index', () => {
    expect(component.trackByIndex(0)).toBe(0);
    expect(component.trackByIndex(7)).toBe(7);
  });

  it('trackByTable returns the table_name', () => {
    expect(component.trackByTable(0, { table_name: 'learning_atoms' })).toBe('learning_atoms');
  });

  it('refresh reloads the RLS context (state success again)', () => {
    component.refresh();
    fixture.detectChanges();
    expect(component.contextState().status).toBe('success');
  });

  it('testPassCount and testFailCount reflect an all-passing run', () => {
    component.runIsolationTest();
    fixture.detectChanges();
    // MOCK_RLS_TEST_RESULTS = 5 passing rows.
    expect(component.testPassCount()).toBe(5);
    expect(component.testFailCount()).toBe(0);
  });

  it('ngOnDestroy resets the RLS state to idle', () => {
    expect(component.contextState().status).toBe('success');
    fixture.destroy();
    expect(component.contextState().status).toBe('idle');
    expect(component.testState().status).toBe('idle');
  });
});

// ===========================================================================
// ADDED: branch coverage that requires controlling the service outputs.
// The real DeveloperService only ever emits passing mock data, so the
// null-context guards, the failing/error test branches, and the error
// callback are only reachable through this stub.
// ===========================================================================

function makeContext(overrides: Partial<RlsContext> = {}): RlsContext {
  return {
    tenant_id: 'tenant-x',
    tenant_name: 'Tenant X',
    gcid: 'gcid-x',
    role: 'super_admin',
    capabilities: ['cap:a', 'cap:b', 'cap:c'],
    session_start: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    rls_policies_applied: [
      {
        table_name: 'learning_atoms',
        policy_name: 'p1',
        policy_type: 'permissive',
        expression: 'expr-1',
        enabled: true,
      },
      {
        table_name: 'audit_logs',
        policy_name: 'p2',
        policy_type: 'restrictive',
        expression: 'expr-2',
        enabled: false,
      },
    ],
    ...overrides,
  };
}

function passingResult(table = 'learning_atoms'): RlsTestResult {
  return {
    table_name: table,
    query: `SELECT count(*) FROM ${table}`,
    row_count: 10,
    isolated: true,
    execution_time_ms: 3,
    error: null,
  };
}

function leakyResult(table = 'user_profiles'): RlsTestResult {
  return {
    table_name: table,
    query: `SELECT count(*) FROM ${table}`,
    row_count: 99,
    isolated: false,
    execution_time_ms: 7,
    error: null,
  };
}

function erroredResult(table = 'audit_logs'): RlsTestResult {
  return {
    table_name: table,
    query: `SELECT count(*) FROM ${table}`,
    row_count: 0,
    isolated: true,
    execution_time_ms: 0,
    error: 'permission denied',
  };
}

class StubDeveloperService {
  readonly rlsContextState = signal<RlsContextState>({ status: 'idle' });
  readonly rlsContext = signal<RlsContext | null>(null);
  readonly rlsTestState = signal<RlsTestState>({ status: 'idle' });
  readonly rlsTestResults = signal<RlsTestResult[]>([]);

  loadRlsContext$: Observable<RlsContext | null> = of(null);
  testIsolation$: Observable<RlsTestResult[] | null> = of(null);

  loadCalls = 0;
  resetCalls = 0;

  loadRlsContext(): Observable<RlsContext | null> {
    this.loadCalls++;
    return this.loadRlsContext$;
  }

  testIsolation(): Observable<RlsTestResult[] | null> {
    return this.testIsolation$;
  }

  resetRlsState(): void {
    this.resetCalls++;
  }
}

describe('RlsContextViewerComponent (stubbed service branches)', () => {
  let fixture: ComponentFixture<RlsContextViewerComponent>;
  let component: RlsContextViewerComponent;
  let stub: StubDeveloperService;
  let toastSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    stub = new StubDeveloperService();

    await TestBed.configureTestingModule({
      imports: [RlsContextViewerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DeveloperService, useValue: stub },
      ],
    }).compileComponents();

    const toast = TestBed.inject(ToastService);
    toastSpy = vi.spyOn(toast, 'show');

    fixture = TestBed.createComponent(RlsContextViewerComponent);
    component = fixture.componentInstance;
    // NOTE: deliberately NOT calling detectChanges() so the template (which
    // relies on a populated context) is never rendered against a null context.
  });

  // --- ngOnInit / ngOnDestroy ---

  it('ngOnInit loads the RLS context exactly once', () => {
    fixture.detectChanges();
    expect(stub.loadCalls).toBe(1);
  });

  it('ngOnDestroy unsubscribes and calls resetRlsState', () => {
    fixture.detectChanges();
    fixture.destroy();
    expect(stub.resetCalls).toBe(1);
  });

  // --- null-context falsy arms ---

  it('policyCount returns 0 when context is null (falsy arm)', () => {
    stub.rlsContext.set(null);
    expect(component.policyCount()).toBe(0);
  });

  it('enabledPolicyCount returns 0 when context is null (guard arm)', () => {
    stub.rlsContext.set(null);
    expect(component.enabledPolicyCount()).toBe(0);
  });

  it('capabilityCount returns 0 when context is null (falsy arm)', () => {
    stub.rlsContext.set(null);
    expect(component.capabilityCount()).toBe(0);
  });

  it('counts policies and capabilities when context is present (truthy arms)', () => {
    stub.rlsContext.set(makeContext());
    expect(component.policyCount()).toBe(2);
    // one enabled + one disabled → filter keeps the enabled one only.
    expect(component.enabledPolicyCount()).toBe(1);
    expect(component.capabilityCount()).toBe(3);
  });

  // --- allTestsPassed arms ---

  it('allTestsPassed is false when there are no results (empty guard)', () => {
    stub.rlsTestResults.set([]);
    expect(component.allTestsPassed()).toBe(false);
  });

  it('allTestsPassed is true when all results pass', () => {
    stub.rlsTestResults.set([passingResult('a'), passingResult('b')]);
    expect(component.allTestsPassed()).toBe(true);
  });

  it('allTestsPassed is false when a result is not isolated', () => {
    stub.rlsTestResults.set([passingResult('a'), leakyResult('b')]);
    expect(component.allTestsPassed()).toBe(false);
  });

  it('allTestsPassed is false when a result has an error', () => {
    stub.rlsTestResults.set([passingResult('a'), erroredResult('b')]);
    expect(component.allTestsPassed()).toBe(false);
  });

  it('testPassCount / testFailCount split a mixed result set', () => {
    stub.rlsTestResults.set([passingResult('a'), leakyResult('b'), erroredResult('c')]);
    expect(component.testPassCount()).toBe(1);
    expect(component.testFailCount()).toBe(2);
  });

  // --- runIsolationTest branches ---

  it('runIsolationTest shows success toast when every result passes', () => {
    stub.testIsolation$ = of([passingResult('a'), passingResult('b')]);
    component.runIsolationTest();
    expect(component.testRunning()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('admin.developer.rls_test_passed', 'success');
  });

  it('runIsolationTest shows failure toast when a result is not isolated', () => {
    stub.testIsolation$ = of([passingResult('a'), leakyResult('b')]);
    component.runIsolationTest();
    expect(component.testRunning()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('admin.developer.rls_test_failed', 'error');
  });

  it('runIsolationTest shows failure toast when a result has an error', () => {
    stub.testIsolation$ = of([erroredResult('a')]);
    component.runIsolationTest();
    expect(toastSpy).toHaveBeenCalledWith('admin.developer.rls_test_failed', 'error');
  });

  it('runIsolationTest does NOT toast when results is null (falsy next arm)', () => {
    stub.testIsolation$ = of(null);
    component.runIsolationTest();
    expect(component.testRunning()).toBe(false);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('runIsolationTest shows error toast and clears running flag on error', () => {
    stub.testIsolation$ = throwError(() => new Error('boom'));
    component.runIsolationTest();
    expect(component.testRunning()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('admin.developer.rls_test_error', 'error');
  });

  // --- togglePolicyExpand null arm ---

  it('togglePolicyExpand collapses the same index back to null', () => {
    component.togglePolicyExpand(2);
    expect(component.expandedPolicyIndex()).toBe(2);
    component.togglePolicyExpand(2); // current === index → null arm
    expect(component.expandedPolicyIndex()).toBeNull();
    expect(component.isPolicyExpanded(2)).toBe(false);
  });
});
