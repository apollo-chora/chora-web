import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { PathProgress } from '../../models/engagement.models';

@Component({
  selector: 'chora-path-progress-widget',
  imports: [TranslatePipe],
  templateUrl: './path-progress-widget.component.html',
  styleUrl: './path-progress-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathProgressWidgetComponent {
  readonly paths = input.required<PathProgress[]>();
  readonly pathSelected = output<string>();

  onPathClick(pathId: string): void {
    this.pathSelected.emit(pathId);
  }
}
