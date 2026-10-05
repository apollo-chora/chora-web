import { Routes } from '@angular/router';
import { authGuard } from '../../core/auth/auth.guard';
import { addOnGuard } from '../../core/auth/add-on.guard';

/**
 * Choraverse feature routes — lazy-loaded.
 * Gated by authGuard + addOnGuard('choraverse').
 *
 * @see docs/design/ux_familiar_companion.md
 * @see .claude/skills/coding-angular/SKILL.md (Routing & Guards)
 */
export const CHORAVERSE_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, addOnGuard('choraverse')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./components/familiar-avatar/familiar-avatar.component').then(
            (m) => m.FamiliarAvatarComponent
          ),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./components/familiar-chat/familiar-chat.component').then(
            (m) => m.FamiliarChatComponent
          ),
      },
      {
        path: 'skins',
        loadComponent: () =>
          import('./components/skin-gallery/skin-gallery.component').then(
            (m) => m.SkinGalleryComponent
          ),
      },
      {
        path: 'evolution',
        loadComponent: () =>
          import('./components/evolution-timeline/evolution-timeline.component').then(
            (m) => m.EvolutionTimelineComponent
          ),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./components/stat-allocation/stat-allocation.component').then(
            (m) => m.StatAllocationComponent,
          ),
      },
      {
        path: 'tutorial',
        loadComponent: () =>
          import('./components/first-interaction-tutorial/first-interaction-tutorial.component').then(
            (m) => m.FirstInteractionTutorialComponent,
          ),
      },
      {
        path: 'persona',
        loadComponent: () =>
          import('./components/familiar-persona-card/familiar-persona-card.component').then(
            (m) => m.FamiliarPersonaCardComponent,
          ),
      },
      {
        path: 'memory',
        loadComponent: () =>
          import('./components/familiar-memory-panel/familiar-memory-panel.component').then(
            (m) => m.FamiliarMemoryPanelComponent,
          ),
      },
      {
        path: 'store',
        canActivate: [addOnGuard('reward_vault')],
        loadComponent: () =>
          import('./components/reward-store/reward-store.component').then(
            (m) => m.RewardStoreComponent
          ),
      },
      {
        path: 'transactions',
        canActivate: [addOnGuard('reward_vault')],
        loadComponent: () =>
          import('./components/transaction-history/transaction-history.component').then(
            (m) => m.TransactionHistoryComponent
          ),
      },
      {
        path: 'a2a-activity',
        loadComponent: () =>
          import('./components/a2a-activity-indicator/a2a-activity-indicator.component').then(
            (m) => m.A2AActivityIndicatorComponent,
          ),
      },
    ],
  },
];
