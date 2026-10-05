import { Injectable, signal, computed } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  EconomyConfig,
  EconomyConfigHistory,
  ConfigCategory,
  EconomyConfigUpdateRequest,
} from '../models/economy-config.model';

// TODO: Replace with BffClientService when backend routes are wired
// import { BffClientService } from '../../../../core/services/bff-client.service';

const MOCK_CONFIGS: EconomyConfig[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    tenant_id: null,
    config_category: 'fog_thresholds',
    config_key: 'mastery_threshold',
    config_value: { value: 0.6 },
    is_tenant_override: false,
    created_by_gcid: '00000000-0000-0000-0000-000000000000',
    updated_by_gcid: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    tenant_id: null,
    config_category: 'elo_settings',
    config_key: 'k_factor',
    config_value: { value: 32 },
    is_tenant_override: false,
    created_by_gcid: '00000000-0000-0000-0000-000000000000',
    updated_by_gcid: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    tenant_id: null,
    config_category: 'duel_limits',
    config_key: 'max_per_day',
    config_value: { value: 10 },
    is_tenant_override: false,
    created_by_gcid: '00000000-0000-0000-0000-000000000000',
    updated_by_gcid: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    tenant_id: null,
    config_category: 'material_drop_rates',
    config_key: 'common_rate',
    config_value: { value: 0.40 },
    is_tenant_override: false,
    created_by_gcid: '00000000-0000-0000-0000-000000000000',
    updated_by_gcid: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    tenant_id: null,
    config_category: 'lootbox_probabilities',
    config_key: 'real_money_enabled',
    config_value: { value: false },
    is_tenant_override: false,
    created_by_gcid: '00000000-0000-0000-0000-000000000000',
    updated_by_gcid: '00000000-0000-0000-0000-000000000000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

@Injectable({ providedIn: 'root' })
export class EconomyAdminService {
  private readonly _configs = signal<EconomyConfig[]>([]);
  private readonly _history = signal<EconomyConfigHistory[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly configs = this._configs.asReadonly();
  readonly history = this._history.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly configsByCategory = computed(() => {
    const map = new Map<ConfigCategory, EconomyConfig[]>();
    for (const config of this._configs()) {
      const list = map.get(config.config_category) ?? [];
      list.push(config);
      map.set(config.config_category, list);
    }
    return map;
  });

  getEffectiveConfig(category: ConfigCategory): Observable<EconomyConfig[]> {
    this._loading.set(true);
    this._error.set(null);
    // TODO: return this.bff.get<EconomyConfig[]>(`/api/v1/gamification/admin/economy-config?category=${category}`);
    const filtered = MOCK_CONFIGS.filter(c => c.config_category === category);
    return of(filtered).pipe(
      tap(configs => {
        this._configs.set(configs);
        this._loading.set(false);
      }),
    );
  }

  updateConfig(configId: string, request: EconomyConfigUpdateRequest): Observable<EconomyConfig> {
    this._loading.set(true);
    // TODO: return this.bff.patch<EconomyConfig>(`/api/v1/gamification/admin/economy-config/${configId}`, request);
    const existing = MOCK_CONFIGS.find(c => c.id === configId);
    if (!existing) {
      this._loading.set(false);
      this._error.set('Config not found');
      return of(MOCK_CONFIGS[0]);
    }
    const updated = { ...existing, config_value: request.config_value, updated_at: new Date().toISOString() };
    return of(updated).pipe(
      tap(() => this._loading.set(false)),
    );
  }

  getHistory(_configId: string): Observable<EconomyConfigHistory[]> {
    // TODO: return this.bff.get<EconomyConfigHistory[]>(`/api/v1/gamification/admin/economy-config/${_configId}/history`);
    return of([]).pipe(
      tap(entries => this._history.set(entries)),
    );
  }

  rollbackConfig(configId: string): Observable<EconomyConfig> {
    this._loading.set(true);
    // TODO: return this.bff.post<EconomyConfig>(`/api/v1/gamification/admin/economy-config/${configId}/rollback`, {});
    const existing = MOCK_CONFIGS.find(c => c.id === configId);
    return of(existing ?? MOCK_CONFIGS[0]).pipe(
      tap(() => this._loading.set(false)),
    );
  }

  deleteConfig(_configId: string): Observable<void> {
    // TODO: return this.bff.delete<void>(`/api/v1/gamification/admin/economy-config/${_configId}`);
    return of(undefined);
  }
}
