import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, type Mock } from 'vitest';
import { EconomyDashboardComponent } from './economy-dashboard.component';
import { EconomyAdminService } from '../../services/economy-admin.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { EconomyConfig, EconomyConfigHistory } from '../../models/economy-config.model';

interface EconomyAdminServiceMock {
  configs: ReturnType<typeof signal<EconomyConfig[]>>;
  history: ReturnType<typeof signal<EconomyConfigHistory[]>>;
  loading: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<string | null>>;
  configsByCategory: ReturnType<typeof signal<Map<string, EconomyConfig[]>>>;
  getEffectiveConfig: Mock;
  updateConfig: Mock;
  getHistory: Mock;
  rollbackConfig: Mock;
  deleteConfig: Mock;
}

describe('EconomyDashboardComponent', () => {
  let component: EconomyDashboardComponent;
  let fixture: ComponentFixture<EconomyDashboardComponent>;
  let mockService: EconomyAdminServiceMock;

  const mockConfigs: EconomyConfig[] = [
    {
      id: 'cfg-1',
      tenant_id: null,
      config_category: 'fog_thresholds',
      config_key: 'mastery_threshold',
      config_value: { value: 0.6 },
      is_tenant_override: false,
      created_by_gcid: 'gcid-1',
      updated_by_gcid: 'gcid-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockService = {
      configs: signal(mockConfigs),
      history: signal([] as EconomyConfigHistory[]),
      loading: signal(false),
      error: signal(null as string | null),
      configsByCategory: signal(new Map()),
      getEffectiveConfig: vi.fn().mockReturnValue(of(mockConfigs)),
      updateConfig: vi.fn().mockReturnValue(of(mockConfigs[0])),
      getHistory: vi.fn().mockReturnValue(of([])),
      rollbackConfig: vi.fn().mockReturnValue(of(mockConfigs[0])),
      deleteConfig: vi.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [EconomyDashboardComponent],
      providers: [{ provide: EconomyAdminService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(EconomyDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load fog_thresholds on init', () => {
    expect(mockService.getEffectiveConfig).toHaveBeenCalledWith('fog_thresholds');
  });

  it('should render category tabs', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(9);
  });

  it('should set first tab as active', () => {
    expect(component.activeCategory()).toBe('fog_thresholds');
  });

  it('should switch category on tab click', () => {
    component.selectCategory('elo_settings');
    expect(component.activeCategory()).toBe('elo_settings');
    expect(mockService.getEffectiveConfig).toHaveBeenCalledWith('elo_settings');
  });

  it('should display config rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('.economy-dashboard__row');
    expect(rows.length).toBe(1);
  });

  it('should show Platform Default badge for non-override configs', () => {
    const badge = fixture.nativeElement.querySelector('.economy-dashboard__default-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('Platform Default');
  });

  it('should open history drawer', () => {
    component.openHistory(mockConfigs[0]);
    expect(component.historyPanelOpen()).toBe(true);
    expect(component.historyConfigId()).toBe('cfg-1');
    expect(mockService.getHistory).toHaveBeenCalledWith('cfg-1');
  });

  it('should close history drawer', () => {
    component.openHistory(mockConfigs[0]);
    component.closeHistory();
    expect(component.historyPanelOpen()).toBe(false);
    expect(component.historyConfigId()).toBeNull();
  });

  it('should format boolean values', () => {
    expect(component.formatValue({ value: true })).toBe('Enabled');
    expect(component.formatValue({ value: false })).toBe('Disabled');
  });

  it('should format numeric values', () => {
    expect(component.formatValue({ value: 0.6 })).toBe('0.6');
    expect(component.formatValue({ value: 32 })).toBe('32');
  });

  it('should call rollback', () => {
    component.rollback('cfg-1');
    expect(mockService.rollbackConfig).toHaveBeenCalledWith('cfg-1');
  });

  it('should call clearOverride', () => {
    component.clearOverride('cfg-1');
    expect(mockService.deleteConfig).toHaveBeenCalledWith('cfg-1');
  });

  it('should close history when switching categories', () => {
    component.openHistory(mockConfigs[0]);
    component.selectCategory('elo_settings');
    expect(component.historyPanelOpen()).toBe(false);
  });
});
