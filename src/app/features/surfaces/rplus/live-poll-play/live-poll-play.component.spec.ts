import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { LivePollPlayComponent } from './live-poll-play.component';
import { LivePollPlayService } from './live-poll-play.service';
import type { LivePollConnectionState } from './live-poll-play.service';
import {
  buildTallyRows,
  isVotingOpen,
  type LivePollSnapshot,
} from './live-poll-play.model';

/**
 * Fake LivePollPlayService with writable signals so the spec can drive the
 * play view's render states without a real WebSocket. The component reads
 * `connectionState`, `snapshot`, `tallyRows`, `hasVoted`, `votingOpen` and
 * calls `connect` / `disconnect` / `castVote`.
 */
class FakePlayService {
  readonly connectionState = signal<LivePollConnectionState>('connecting');
  readonly snapshot = signal<LivePollSnapshot | null>(null);
  readonly hasVoted = signal<boolean>(false);
  readonly tallyRows = computed(() => buildTallyRows(this.snapshot()));
  readonly votingOpen = computed(() => isVotingOpen(this.snapshot()));

  connectSpy = vi.fn<(id: string) => void>();
  disconnectSpy = vi.fn<() => void>();
  castVoteSpy = vi.fn<(label: string) => void>();
  voteShouldError = false;

  connect(id: string): void {
    this.connectSpy(id);
  }
  disconnect(): void {
    this.disconnectSpy();
  }
  castVote(label: string) {
    this.castVoteSpy(label);
    this.hasVoted.set(true);
    return this.voteShouldError
      ? throwError(() => new Error('vote failed'))
      : of({});
  }
}

function snap(override: Partial<LivePollSnapshot> = {}): LivePollSnapshot {
  return {
    id: 'poll-1',
    tenantId: 't',
    instructorGcid: 'g',
    question: 'Which is fastest?',
    options: [
      { label: 'Cheetah', voteCount: 6 },
      { label: 'Falcon', voteCount: 2 },
    ],
    state: 'OPEN',
    openedAt: null,
    closedAt: null,
    totalVotes: 8,
    ...override,
  };
}

describe('LivePollPlayComponent', () => {
  let fixture: ComponentFixture<LivePollPlayComponent>;
  let element: HTMLElement;
  let fake: FakePlayService;

  beforeEach(() => {
    fake = new FakePlayService();
    TestBed.configureTestingModule({
      imports: [LivePollPlayComponent],
      providers: [{ provide: LivePollPlayService, useValue: fake }],
    });
    fixture = TestBed.createComponent(LivePollPlayComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('connects to the poll id from the route input on init', () => {
    fixture.componentRef.setInput('pollId', 'poll-99');
    fixture.detectChanges();
    expect(fake.connectSpy).toHaveBeenCalledWith('poll-99');
  });

  it('renders the surface-rplus accent root', () => {
    fixture.detectChanges();
    const root = element.querySelector('[data-testid="rplus-live-poll-play"]');
    expect(root?.className).toContain('surface-rplus');
  });

  it('shows the connection-state badge', () => {
    fixture.detectChanges();
    const badge = element.querySelector('[data-testid="poll-play-connection"]');
    expect(badge?.textContent).toContain('rplus.livePoll.connection.connecting');
  });

  it('shows the waiting state before a snapshot arrives', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="poll-play-empty"]'),
    ).not.toBeNull();
  });

  it('renders the question and one button per option with live tallies', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap());
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="poll-play-question"]')?.textContent,
    ).toContain('Which is fastest?');
    const opt0 = element.querySelector('[data-testid="poll-play-option-0"]');
    expect(opt0?.textContent).toContain('Cheetah');
    expect(opt0?.textContent).toContain('6');
    expect(opt0?.textContent).toContain('75%');
  });

  it('casts a vote on option click while OPEN and not yet voted', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap());
    fixture.detectChanges();
    const opt0 = element.querySelector<HTMLButtonElement>(
      '[data-testid="poll-play-option-0"]',
    );
    opt0!.click();
    expect(fake.castVoteSpy).toHaveBeenCalledWith('Cheetah');
  });

  it('disables option buttons once the learner has voted', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap());
    fake.hasVoted.set(true);
    fixture.detectChanges();
    const opt0 = element.querySelector<HTMLButtonElement>(
      '[data-testid="poll-play-option-0"]',
    );
    expect(opt0!.disabled).toBe(true);
    expect(
      element.querySelector('[data-testid="poll-play-voted"]'),
    ).not.toBeNull();
  });

  it('disables option buttons when the poll is CLOSED', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap({ state: 'CLOSED' }));
    fixture.detectChanges();
    const opt0 = element.querySelector<HTMLButtonElement>(
      '[data-testid="poll-play-option-0"]',
    );
    expect(opt0!.disabled).toBe(true);
  });

  it('does not cast a vote when the poll is CLOSED', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap({ state: 'CLOSED' }));
    fixture.detectChanges();
    const opt0 = element.querySelector<HTMLButtonElement>(
      '[data-testid="poll-play-option-0"]',
    );
    opt0!.click();
    expect(fake.castVoteSpy).not.toHaveBeenCalled();
  });

  it('shows the closed banner when the poll is CLOSED', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.snapshot.set(snap({ state: 'CLOSED' }));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="poll-play-closed"]'),
    ).not.toBeNull();
  });

  it('swallows a failed vote POST without throwing', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fake.voteShouldError = true;
    fake.snapshot.set(snap());
    fixture.detectChanges();
    const opt0 = element.querySelector<HTMLButtonElement>(
      '[data-testid="poll-play-option-0"]',
    );
    expect(() => opt0!.click()).not.toThrow();
  });

  it('disconnects on destroy', () => {
    fixture.componentRef.setInput('pollId', 'poll-1');
    fixture.detectChanges();
    fixture.destroy();
    expect(fake.disconnectSpy).toHaveBeenCalled();
  });
});
