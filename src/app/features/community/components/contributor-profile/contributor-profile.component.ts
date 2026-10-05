/**
 * ContributorProfileComponent — Displays contribution stats for a community member.
 *
 * Route: /community/contributors/:gcid
 *
 * Features:
 *   - Submissions count and approval rate
 *   - Reputation score and contributor level badge
 *   - Reviews completed count
 *   - Loading, error, and empty states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CommunityService } from '../../services/community.service';
import { CONTRIBUTOR_LEVEL_LABELS } from '../../models/community.model';

@Component({
  selector: 'chora-contributor-profile',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contributor-profile.component.html',
  styleUrl: './contributor-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributorProfileComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly communityService = inject(CommunityService);

  // --- State ---
  readonly profileState = this.communityService.contributorProfileState;
  readonly profile = this.communityService.contributorProfile;

  // --- Constants ---
  readonly levelLabels = CONTRIBUTOR_LEVEL_LABELS;

  // --- Computed ---
  readonly approvalRate = computed(() => {
    const p = this.profile();
    if (!p || p.atoms_submitted === 0) return 0;
    return Math.round((p.atoms_approved / p.atoms_submitted) * 100);
  });

  readonly levelClass = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `contributor-profile__level--${p.level}`;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const gcid = this.route.snapshot.paramMap.get('gcid') ?? '';
    if (gcid) {
      this.subscriptions.add(
        this.communityService.loadContributorProfile(gcid).subscribe(),
      );
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
