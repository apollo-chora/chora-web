/**
 * StudioSubNavComponent — the tab strip across every A+ Studio view.
 *
 * Three tabs, one per thing an author owns:
 *   - Atoms          → /a/studio/atoms          (the inventory)
 *   - Test sets      → /a/studio/test-sets
 *   - Question Banks → /a/studio/question-banks
 *
 * Replaces AuthoringSubNavComponent (Compose / Test sets / Courses). Two
 * changes are load-bearing:
 *
 * 1. The first tab is the INVENTORY, not the compose form. "Authoring" used to
 *    mean `/a/atoms/new` — a create-a-new-thing form with no way to see what
 *    you had already made. Studio puts the list first and reaches the canvas
 *    through it, which is why test-sets no longer sit under a path segment
 *    called `new`.
 *
 * 2. There is NO Courses tab. Courses left A+ entirely: chora_delivery owns the
 *    Course aggregate and ADR-232 rejected teaching roles on the A+ learner
 *    surface. The tab it replaces still pointed at `/a/courses/new`, which A+
 *    stopped routing when course authoring moved to R+ — and because
 *    `courses/:courseId` is still mounted, that link did not even 404: it
 *    rendered course-detail for a course whose id was the string "new".
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-studio-sub-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './studio-sub-nav.component.html',
  styleUrl: './studio-sub-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioSubNavComponent {}
