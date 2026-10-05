/**
 * DeveloperConsoleComponent — Main layout for the developer experience module.
 *
 * Route: /admin/developer
 *
 * Features:
 *   - Tab navigation: API Inspector, Feature Flags, Event Bus
 *   - Role-gated: super_admin only
 *   - Inline tab content + deep-link routes
 */
import {
  Component,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { DEVELOPER_TABS, DeveloperTab } from '../../models/developer.model';

@Component({
  selector: 'chora-developer-console',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './developer-console.component.html',
  styleUrl: './developer-console.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeveloperConsoleComponent {
  readonly tabs = DEVELOPER_TABS;
  readonly activeTab = signal<DeveloperTab>('api-inspector');

  onTabChange(tab: DeveloperTab): void {
    this.activeTab.set(tab);
  }
}
