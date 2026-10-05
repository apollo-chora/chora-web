import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { MainLayoutComponent } from './main-layout.component';
import { RbacService } from '../../core/services/rbac.service';

/** Roles on the session; the shell reads only `hasRole`. */
function provideRoles(roles: readonly string[]) {
  const held = new Set(roles.map((r) => r.trim().toLowerCase()));
  return {
    provide: RbacService,
    useValue: {
      hasRole: (role: string) => held.has(role.trim().toLowerCase()),
      hasCapability: () => false,
    },
  };
}

describe('MainLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [provideRouter([]), provideHttpClient(), provideRoles(['admin'])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  // Was "should render sidebar, top-nav, and surface-rail". The default test URL
  // is `/`, which `resolveActiveSurface` reads as A+, and A+ now wears the
  // compass instead of the sidebar (C2, plan section 3.1). The sidebar is still
  // asserted, on the surfaces that still have one, in the compass-swap block
  // below; weakening this to "one of the two" would have asserted nothing.
  it('should render the compass, top-nav, and surface-rail on the A+ default', async () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('chora-compass-bar')).toBeTruthy();
    expect(el.querySelector('chora-sidebar')).toBeNull();
    expect(el.querySelector('chora-top-nav')).toBeTruthy();
    expect(el.querySelector('chora-surface-rail')).toBeTruthy();
  });

  it('should have main content with correct aria role', async () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    await fixture.whenStable();
    const main = (fixture.nativeElement as HTMLElement).querySelector('main');
    expect(main?.getAttribute('role')).toBe('main');
    expect(main?.getAttribute('aria-label')).toBe('Main content');
  });

  it('should toggle sidebar collapsed state', () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    const component = fixture.componentInstance;

    const initial = component.sidebarCollapsed();
    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(!initial);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R39: when the rail is hidden the content column takes the full width from
// the left edge. The layout reads the SAME predicate the rail reads, so the
// column and the chips can never disagree about whether there is a rail.
// ─────────────────────────────────────────────────────────────────────────
describe('MainLayoutComponent rail gate (R39)', () => {
  async function render(roles: readonly string[]): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [provideRouter([]), provideHttpClient(), provideRoles(roles)],
    }).compileComponents();
    const fixture = TestBed.createComponent(MainLayoutComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the rail for an eligible session', async () => {
    const el = await render(['admin']);
    expect(el.querySelector('chora-surface-rail')).toBeTruthy();
  });

  it('does NOT render the rail element at all for a learner', async () => {
    const el = await render(['learner']);
    expect(el.querySelector('chora-surface-rail')).toBeNull();
  });

  it('does NOT render the rail element for an author-only session', async () => {
    const el = await render(['author']);
    expect(el.querySelector('chora-surface-rail')).toBeNull();
  });

  it('fails CLOSED on an empty role payload', async () => {
    const el = await render([]);
    expect(el.querySelector('chora-surface-rail')).toBeNull();
  });

  it('marks the layout railless so the content reclaims the left edge', async () => {
    const el = await render(['learner']);
    const layout = el.querySelector('[data-testid="main-layout"]');
    expect(layout?.classList.contains('main-layout--no-rail')).toBe(true);
  });

  it('does not mark the layout railless when the rail is shown', async () => {
    const el = await render(['auditor']);
    const layout = el.querySelector('[data-testid="main-layout"]');
    expect(layout?.classList.contains('main-layout--no-rail')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The A+ shell: the compass bar REPLACES the 280px sidebar on A+ only
// (plan section 3.1). C+/H+/O+/R+ keep the sidebar.
// ─────────────────────────────────────────────────────────────────────────
describe('MainLayoutComponent A+ compass swap', () => {
  async function renderAt(url: string, roles: readonly string[] = ['admin']) {
    TestBed.resetTestingModule();
    const events$ = new Subject<unknown>();
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [provideRouter([]), provideHttpClient(), provideRoles(roles)],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue(url);
    Object.defineProperty(router, 'events', {
      value: events$.asObservable(),
      configurable: true,
    });
    const fixture = TestBed.createComponent(MainLayoutComponent);
    fixture.detectChanges();
    events$.next(new NavigationEnd(1, url, url));
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the compass and NOT the sidebar on an A+ route', async () => {
    const el = await renderAt('/a/knowledge');
    expect(el.querySelector('chora-compass-bar')).toBeTruthy();
    expect(el.querySelector('chora-sidebar')).toBeNull();
  });

  it('renders the compass on the A+ home', async () => {
    const el = await renderAt('/a/home');
    expect(el.querySelector('chora-compass-bar')).toBeTruthy();
  });

  for (const [surface, url] of [
    ['cplus', '/c/feed'],
    ['hplus', '/h/tenant'],
    ['oplus', '/o/dashboard'],
    ['rplus', '/r/offerings'],
  ] as const) {
    it(`keeps the sidebar and hides the compass on ${surface}`, async () => {
      const el = await renderAt(url);
      expect(el.querySelector('chora-sidebar')).toBeTruthy();
      expect(el.querySelector('chora-compass-bar')).toBeNull();
    });
  }

  it('marks the layout as compass-driven so the sidebar column collapses', async () => {
    const el = await renderAt('/a/knowledge');
    const layout = el.querySelector('[data-testid="main-layout"]');
    expect(layout?.classList.contains('main-layout--compass')).toBe(true);
  });

  it('does not mark a non-A+ layout as compass-driven', async () => {
    const el = await renderAt('/r/offerings');
    const layout = el.querySelector('[data-testid="main-layout"]');
    expect(layout?.classList.contains('main-layout--compass')).toBe(false);
  });

  it('puts the yields strip in the top bar on A+ and nowhere else', async () => {
    const aplus = await renderAt('/a/knowledge');
    expect(aplus.querySelector('chora-yields-strip')).toBeTruthy();
  });

  it('keeps the yields strip off a non-A+ surface', async () => {
    const rplus = await renderAt('/r/offerings');
    expect(rplus.querySelector('chora-yields-strip')).toBeNull();
  });

  it('mounts the HUD on A+', async () => {
    const el = await renderAt('/a/knowledge');
    expect(el.querySelector('chora-hud')).toBeTruthy();
  });

  it('mounts NO HUD on a non-A+ surface', async () => {
    const el = await renderAt('/r/offerings');
    expect(el.querySelector('chora-hud')).toBeNull();
  });

  it('a learner on A+ sees NEITHER rail NOR sidebar, only the compass (R39)', async () => {
    const el = await renderAt('/a/knowledge', ['learner']);
    expect(el.querySelector('chora-surface-rail')).toBeNull();
    expect(el.querySelector('chora-sidebar')).toBeNull();
    expect(el.querySelector('chora-compass-bar')).toBeTruthy();
  });
});
