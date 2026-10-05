import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { APIInspectorComponent } from './api-inspector.component';

describe('APIInspectorComponent', () => {
  let component: APIInspectorComponent;
  let fixture: ComponentFixture<APIInspectorComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [APIInspectorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(APIInspectorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="api-inspector"]');
    expect(el).toBeTruthy();
  });

  it('should load request logs on init', () => {
    // Component calls loadLogs() in ngOnInit, which uses mock data via DeveloperService
    expect(component.requestLogs().length).toBeGreaterThan(0);
    expect(component.loading()).toBe(false);
  });

  it('should display summary section', () => {
    const summary = fixture.nativeElement.querySelector('[data-testid="api-summary"]');
    expect(summary).toBeTruthy();
  });

  it('should compute totalRequests', () => {
    expect(component.totalRequests()).toBeGreaterThan(0);
  });

  it('should compute avgDuration', () => {
    expect(component.avgDuration()).toBeGreaterThan(0);
  });

  it('should compute errorCount for 4xx and 5xx statuses', () => {
    // Mock data includes 403 and 500 status codes
    expect(component.errorCount()).toBeGreaterThan(0);
  });

  it('should display total requests in template', () => {
    fixture.detectChanges();
    const totalEl = fixture.nativeElement.querySelector('[data-testid="total-requests"]');
    expect(totalEl).toBeTruthy();
    expect(totalEl.textContent.trim()).toBe(String(component.totalRequests()));
  });

  it('should display method filter buttons', () => {
    const filters = fixture.nativeElement.querySelector('[data-testid="api-filters"]');
    expect(filters).toBeTruthy();
    const allBtn = fixture.nativeElement.querySelector('[data-testid="filter-all"]');
    expect(allBtn).toBeTruthy();
  });

  it('should filter logs by HTTP method', () => {
    const allLogsCount = component.requestLogs().length;
    component.onMethodFilter('GET');
    expect(component.methodFilter()).toBe('GET');

    const filtered = component.filteredLogs();
    expect(filtered.every((l) => l.method === 'GET')).toBe(true);
    expect(filtered.length).toBeLessThanOrEqual(allLogsCount);
  });

  it('should show all logs when method filter is null', () => {
    component.onMethodFilter('GET');
    component.onMethodFilter(null);
    expect(component.filteredLogs().length).toBe(component.requestLogs().length);
  });

  it('should toggle request expansion', () => {
    const firstId = component.requestLogs()[0].id;

    component.toggleExpand(firstId);
    expect(component.isExpanded(firstId)).toBe(true);

    component.toggleExpand(firstId);
    expect(component.isExpanded(firstId)).toBe(false);
  });

  it('should collapse previous request when expanding another', () => {
    const logs = component.requestLogs();
    if (logs.length < 2) {
      // pending('Need at least 2 logs for this test');
      return;
    }

    component.toggleExpand(logs[0].id);
    expect(component.isExpanded(logs[0].id)).toBe(true);

    component.toggleExpand(logs[1].id);
    expect(component.isExpanded(logs[1].id)).toBe(true);
    expect(component.isExpanded(logs[0].id)).toBe(false);
  });

  it('should return correct statusClass for 2xx', () => {
    expect(component.statusClass(200)).toBe('api-inspector__status--success');
  });

  it('should return correct statusClass for 4xx', () => {
    expect(component.statusClass(403)).toBe('api-inspector__status--client-error');
  });

  it('should return correct statusClass for 5xx', () => {
    expect(component.statusClass(500)).toBe('api-inspector__status--server-error');
  });

  it('should return correct statusClass for 3xx', () => {
    expect(component.statusClass(301)).toBe('api-inspector__status--redirect');
  });

  it('should return empty string for unknown status range', () => {
    expect(component.statusClass(100)).toBe('');
  });

  it('should return correct methodClass', () => {
    expect(component.methodClass('GET')).toBe('api-inspector__method--get');
    expect(component.methodClass('POST')).toBe('api-inspector__method--post');
  });

  it('should format timestamp correctly', () => {
    const result = component.formatTimestamp('2026-09-01T10:30:00Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return raw string for invalid timestamp', () => {
    const result = component.formatTimestamp('invalid');
    expect(result).toBeTruthy();
  });

  it('should convert header object to entries array', () => {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ***' };
    const entries = component.headerEntries(headers);
    expect(entries.length).toBe(2);
    expect(entries[0].key).toBe('Content-Type');
    expect(entries[0].value).toBe('application/json');
  });

  it('should replay a request and prepend result', () => {
    const initialCount = component.requestLogs().length;
    const firstId = component.requestLogs()[0].id;

    component.replayRequest(firstId);
    // After replay completes (mock returns synchronously via of())
    expect(component.requestLogs().length).toBe(initialCount + 1);
    expect(component.replaying()).toBeNull();
  });

  it('should display request list', () => {
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector('[data-testid="request-list"]');
    expect(list).toBeTruthy();
  });

  it('should expose allMethods constant', () => {
    expect(component.allMethods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
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
