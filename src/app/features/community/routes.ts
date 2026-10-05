import { Routes } from '@angular/router';

export const COMMUNITY_ROUTES: Routes = [
  { path: '', redirectTo: 'atom-bank', pathMatch: 'full' },
  {
    path: 'atom-bank',
    loadComponent: () =>
      import('./components/atom-bank/atom-bank.component').then(
        (m) => m.AtomBankComponent,
      ),
    data: { title: 'Atom Bank' },
  },
  {
    path: 'peer-review',
    loadComponent: () =>
      import('./components/peer-review-queue/peer-review-queue.component').then(
        (m) => m.PeerReviewQueueComponent,
      ),
    data: { title: 'Peer Review' },
  },
  {
    path: 'curation',
    loadComponent: () =>
      import('./components/curation-voting/curation-voting.component').then(
        (m) => m.CurationVotingComponent,
      ),
    data: { title: 'Curation' },
  },
  {
    path: 'contributor/:gcid',
    loadComponent: () =>
      import('./components/contributor-profile/contributor-profile.component').then(
        (m) => m.ContributorProfileComponent,
      ),
    data: { title: 'Contributor Profile' },
  },
  // -------------------------------------------------------------------------
  // Community Contributions (Phase 45.1)
  // -------------------------------------------------------------------------
  {
    path: 'contribute',
    loadComponent: () =>
      import('./components/community-atom-editor/community-atom-editor.component').then(
        (m) => m.CommunityAtomEditorComponent,
      ),
    data: { title: 'Contribute Atom' },
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./components/ai-extraction/ai-extraction.component').then(
        (m) => m.AiExtractionComponent,
      ),
    data: { title: 'AI Atom Extraction' },
  },
];
