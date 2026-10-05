import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { AccessDeniedComponent } from './access-denied.component';
import { provideHttpClient } from '@angular/common/http';

function createMockActivatedRoute(
  queryParams: Record<string, string> = {},
  data: Record<string, unknown> = {},
): Partial<ActivatedRoute> {
  return {
    snapshot: {
      queryParamMap: {
        get: (key: string) => queryParams[key] ?? null,
        has: (key: string) => key in queryParams,
        getAll: (key: string) => (queryParams[key] ? [queryParams[key]] : []),
        keys: Object.keys(queryParams),
      },
      data,
    } as ActivatedRoute['snapshot'],
  } as Partial<ActivatedRoute>;
}

describe('AccessDeniedComponent', () => {
  let fixture: ComponentFixture<AccessDeniedComponent>;
  let element: HTMLElement;

  function setup(
    queryParams: Record<string, string> = {},
    data: Record<string, unknown> = {},
  ): void {
    TestBed.configureTestingModule({
      imports: [AccessDeniedComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        {
          provide: ActivatedRoute,
          useValue: createMockActivatedRoute(queryParams, data),
        },
      ],
    });

    fixture = TestBed.createComponent(AccessDeniedComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('should create', () => {
    setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display 403 code', () => {
    setup();
    const code = element.querySelector('.access-denied__code');
    expect(code?.textContent?.trim()).toBe('403');
  });

  it('should display access denied title', () => {
    setup();
    const title = element.querySelector('.access-denied__title');
    expect(title?.textContent?.trim()).toBe('errors.access_denied.title');
  });

  it('should display descriptive message', () => {
    setup();
    const message = element.querySelector('.access-denied__message');
    expect(message?.textContent?.trim()).toBe('errors.access_denied.message');
  });

  it('should have a link to dashboard', () => {
    setup();
    const link = element.querySelector('[data-testid="access-denied-dashboard-link"]');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('errors.access_denied.go_dashboard');
  });

  it('should display correlation ID from query params', () => {
    setup({ correlationId: 'abc-123-def' });
    const el = element.querySelector('[data-testid="correlation-id"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('abc-123-def');
  });

  it('should display correlation ID from route data', () => {
    setup({}, { correlationId: 'route-corr-456' });
    const el = element.querySelector('[data-testid="correlation-id"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('route-corr-456');
  });

  it('should not display correlation ID when absent', () => {
    setup();
    const el = element.querySelector('[data-testid="correlation-id"]');
    expect(el).toBeNull();
  });

  it('should prefer query param correlationId over route data', () => {
    setup({ correlationId: 'query-wins' }, { correlationId: 'route-loses' });
    const el = element.querySelector('[data-testid="correlation-id"]');
    expect(el?.textContent).toContain('query-wins');
  });

  it('should have proper data-testid on the page container', () => {
    setup();
    const page = element.querySelector('[data-testid="access-denied-page"]');
    expect(page).toBeTruthy();
  });

  it('should have accessible SVG icon with aria-hidden', () => {
    setup();
    const icon = element.querySelector('.access-denied__icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should render lock SVG icon', () => {
    setup();
    const svg = element.querySelector('.access-denied__icon svg');
    expect(svg).toBeTruthy();
  });
});
