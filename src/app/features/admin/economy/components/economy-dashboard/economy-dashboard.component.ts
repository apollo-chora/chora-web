import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EconomyAdminService } from '../../services/economy-admin.service';
import {
  ConfigCategory,
  CONFIG_CATEGORY_LABELS,
  ALL_CONFIG_CATEGORIES,
  EconomyConfig,
} from '../../models/economy-config.model';

@Component({
  selector: 'chora-economy-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './economy-dashboard.component.html',
  styleUrl: './economy-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EconomyDashboardComponent implements OnInit {
  private readonly economyService = inject(EconomyAdminService);

  readonly configs = this.economyService.configs;
  readonly loading = this.economyService.loading;
  readonly error = this.economyService.error;
  readonly history = this.economyService.history;
  readonly categories = ALL_CONFIG_CATEGORIES;
  readonly categoryLabels = CONFIG_CATEGORY_LABELS;

  readonly activeCategory = signal<ConfigCategory>('fog_thresholds');
  readonly historyPanelOpen = signal(false);
  readonly historyConfigId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadCategory(this.activeCategory());
  }

  selectCategory(category: ConfigCategory): void {
    this.activeCategory.set(category);
    this.historyPanelOpen.set(false);
    this.loadCategory(category);
  }

  openHistory(config: EconomyConfig): void {
    this.historyConfigId.set(config.id);
    this.historyPanelOpen.set(true);
    this.economyService.getHistory(config.id).subscribe();
  }

  closeHistory(): void {
    this.historyPanelOpen.set(false);
    this.historyConfigId.set(null);
  }

  rollback(configId: string): void {
    this.economyService.rollbackConfig(configId).subscribe(() => {
      this.loadCategory(this.activeCategory());
    });
  }

  clearOverride(configId: string): void {
    this.economyService.deleteConfig(configId).subscribe(() => {
      this.loadCategory(this.activeCategory());
    });
  }

  formatValue(value: Record<string, unknown>): string {
    const v = value['value'];
    if (typeof v === 'boolean') return v ? 'Enabled' : 'Disabled';
    if (typeof v === 'number') return String(v);
    return JSON.stringify(v);
  }

  private loadCategory(category: ConfigCategory): void {
    this.economyService.getEffectiveConfig(category).subscribe();
  }
}
