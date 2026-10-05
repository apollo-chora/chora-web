import {
  Component, ChangeDetectionStrategy, inject, OnInit, computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RetentionService } from '../../services/retention.service';
import type { SuggestedAtom } from '../../services/retention.service';

@Component({
  selector: 'chora-nudge-preview',
  imports: [TranslatePipe],
  templateUrl: './nudge-preview.component.html',
  styleUrl: './nudge-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NudgePreviewComponent implements OnInit {
  private readonly retentionService = inject(RetentionService);
  private readonly router = inject(Router);

  readonly state = this.retentionService.nudgeState;
  readonly nudge = this.retentionService.nudge;

  readonly urgencyIcon = computed(() => {
    const n = this.nudge();
    if (!n) return 'notifications';
    switch (n.urgency) {
      case 'critical': return 'notification_important';
      case 'high': return 'notifications_active';
      case 'medium': return 'notifications';
      default: return 'notifications_none';
    }
  });

  readonly urgencyClass = computed(() => {
    const n = this.nudge();
    if (!n) return '';
    return `nudge-preview__urgency--${n.urgency}`;
  });

  ngOnInit(): void {
    if (this.state().status === 'idle') {
      this.retentionService.loadNudge('me').subscribe();
    }
  }

  openAtom(atomId: string): void {
    this.router.navigate(['/atoms', atomId]);
  }

  trackByAtomId(_index: number, atom: SuggestedAtom): string {
    return atom.atom_id;
  }
}
