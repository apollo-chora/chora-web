import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { DeveloperConsoleComponent } from './developer-console.component';
import { DEVELOPER_TABS } from '../../models/developer.model';

describe('DeveloperConsoleComponent', () => {
  let component: DeveloperConsoleComponent;
  let fixture: ComponentFixture<DeveloperConsoleComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeveloperConsoleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DeveloperConsoleComponent);
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
    const el = fixture.nativeElement.querySelector('[data-testid="developer-console"]');
    expect(el).toBeTruthy();
  });

  it('should display console title', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="console-title"]');
    expect(title).toBeTruthy();
  });

  it('should render all tabs', () => {
    const tabs = fixture.nativeElement.querySelector('[data-testid="console-tabs"]');
    expect(tabs).toBeTruthy();
    expect(component.tabs).toEqual(DEVELOPER_TABS);
    expect(component.tabs.length).toBe(4);
  });

  it('should default activeTab to api-inspector', () => {
    expect(component.activeTab()).toBe('api-inspector');
  });

  it('should change active tab on onTabChange', () => {
    component.onTabChange('feature-flags');
    expect(component.activeTab()).toBe('feature-flags');

    component.onTabChange('event-bus');
    expect(component.activeTab()).toBe('event-bus');

    component.onTabChange('rls-context');
    expect(component.activeTab()).toBe('rls-context');
  });

  it('should render quick link cards', () => {
    const cards = fixture.nativeElement.querySelector('[data-testid="console-cards"]');
    expect(cards).toBeTruthy();
  });

  it('should render card for api-inspector', () => {
    const card = fixture.nativeElement.querySelector('[data-testid="card-api-inspector"]');
    expect(card).toBeTruthy();
  });

  it('should render card for feature-flags', () => {
    const card = fixture.nativeElement.querySelector('[data-testid="card-feature-flags"]');
    expect(card).toBeTruthy();
  });

  it('should render card for event-bus', () => {
    const card = fixture.nativeElement.querySelector('[data-testid="card-event-bus"]');
    expect(card).toBeTruthy();
  });

  it('should render card for rls-context', () => {
    const card = fixture.nativeElement.querySelector('[data-testid="card-rls-context"]');
    expect(card).toBeTruthy();
  });

  it('should use tablist role for navigation', () => {
    const nav = fixture.nativeElement.querySelector('[role="tablist"]');
    expect(nav).toBeTruthy();
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
