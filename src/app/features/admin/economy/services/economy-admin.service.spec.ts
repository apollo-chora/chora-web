import { TestBed } from '@angular/core/testing';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { EconomyAdminService } from './economy-admin.service';

describe('EconomyAdminService', () => {
  let service: EconomyAdminService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EconomyAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty configs', () => {
    expect(service.configs()).toEqual([]);
  });

  it('should start with loading false', () => {
    expect(service.loading()).toBe(false);
  });

  it('should start with no error', () => {
    expect(service.error()).toBeNull();
  });

  describe('getEffectiveConfig', () => {
    it('should return configs for fog_thresholds category', async () => {
      const configs = await firstValueFrom(service.getEffectiveConfig('fog_thresholds'));
      expect(configs.length).toBeGreaterThan(0);
      expect(configs[0].config_category).toBe('fog_thresholds');
    });

    it('should update configs signal', async () => {
      await firstValueFrom(service.getEffectiveConfig('elo_settings'));
      expect(service.configs().length).toBeGreaterThan(0);
    });

    it('should set loading to false after fetch', async () => {
      await firstValueFrom(service.getEffectiveConfig('duel_limits'));
      expect(service.loading()).toBe(false);
    });
  });

  describe('configsByCategory', () => {
    it('should group configs by category', async () => {
      await firstValueFrom(service.getEffectiveConfig('fog_thresholds'));
      const grouped = service.configsByCategory();
      expect(grouped.get('fog_thresholds')).toBeDefined();
    });
  });

  describe('getHistory', () => {
    it('should return history entries', async () => {
      const entries = await firstValueFrom(service.getHistory('test-id'));
      expect(entries).toEqual([]);
    });
  });

  describe('rollbackConfig', () => {
    it('should return a config after rollback', async () => {
      const config = await firstValueFrom(
        service.rollbackConfig('00000000-0000-0000-0000-000000000001'),
      );
      expect(config).toBeDefined();
      expect(config.id).toBeTruthy();
    });

    it('should fall back to the first mock config for an unknown id and clear loading', async () => {
      const config = await firstValueFrom(service.rollbackConfig('unknown-id'));
      expect(config.id).toBe('00000000-0000-0000-0000-000000000001');
      expect(service.loading()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update an existing config value and clear loading', async () => {
      const updated = await firstValueFrom(
        service.updateConfig('00000000-0000-0000-0000-000000000001', {
          config_value: { value: 0.75 },
          reason: 'rebalanced mastery threshold',
        }),
      );
      expect(updated.id).toBe('00000000-0000-0000-0000-000000000001');
      expect(updated.config_value).toEqual({ value: 0.75 });
      expect(typeof updated.updated_at).toBe('string');
      expect(service.loading()).toBe(false);
    });

    it('should surface an error and fall back to the first mock config for an unknown id', async () => {
      const returned = await firstValueFrom(
        service.updateConfig('does-not-exist', {
          config_value: { value: 1 },
          reason: 'x',
        }),
      );
      expect(service.error()).toBe('Config not found');
      expect(service.loading()).toBe(false);
      expect(returned.id).toBe('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('error signal lifecycle', () => {
    it('getEffectiveConfig clears a previously set error', async () => {
      await firstValueFrom(
        service.updateConfig('does-not-exist', { config_value: { value: 1 }, reason: 'x' }),
      );
      expect(service.error()).toBe('Config not found');

      await firstValueFrom(service.getEffectiveConfig('elo_settings'));
      expect(service.error()).toBeNull();
    });

    it('getEffectiveConfig for a category with no mock configs yields an empty configs signal', async () => {
      await firstValueFrom(service.getEffectiveConfig('store_limits'));
      expect(service.configs()).toEqual([]);
      expect(service.loading()).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    it('should complete without error', async () => {
      await lastValueFrom(service.deleteConfig('test-id'), { defaultValue: undefined });
      expect(true).toBe(true);
    });
  });
});
