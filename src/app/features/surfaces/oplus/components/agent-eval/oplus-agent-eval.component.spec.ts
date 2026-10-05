import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OplusAgentEvalComponent } from './oplus-agent-eval.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { GovernanceService } from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_AGENT_EVAL,
  liveState,
  staleState,
  errorState,
} from '../../testing/governance.fixtures';

describe('OplusAgentEvalComponent (crew-run eval drill-down)', () => {
  let fixture: ComponentFixture<OplusAgentEvalComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setAgentEval(liveState(FIXTURE_AGENT_EVAL));

    await TestBed.configureTestingModule({
      imports: [OplusAgentEvalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusAgentEvalComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent + header', () => {
    it('renders the .surface-oplus accent root', () => {
      const root = element.querySelector('[data-testid="oplus-agent-eval-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });

    it('renders the title as h1 with the IMDA D2 badge', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
      const badge = h1?.querySelector('.dim-badge.dim-d2');
      expect(badge?.textContent?.trim()).toBe('D2');
    });
  });

  describe('crew runs', () => {
    it('renders one accordion item per crew run keyed by candidate_label', () => {
      const runs = element.querySelectorAll('[data-testid^="oplus-eval-run-toggle-"]');
      expect(runs.length).toBe(1);
      const li = element.querySelector('[data-candidate-label="depbump0607"]');
      expect(li).toBeTruthy();
    });

    it('renders the BigQuery deep-link for the run', () => {
      const link = element.querySelector<HTMLAnchorElement>(
        '[data-testid="oplus-eval-run-bq-depbump0607"]',
      );
      expect(link).toBeTruthy();
      // Targets the agent_eval_rows TABLE (Preview works), not the view (none).
      expect(link?.getAttribute('href')).toContain('agent_eval_rows');
      expect(link?.getAttribute('target')).toBe('_blank');
    });
  });

  describe('members (first run expanded by default)', () => {
    it('renders both crew members with short member labels', () => {
      const members = element.querySelectorAll('[data-testid^="oplus-eval-member-depbump0607-"]');
      expect(members.length).toBe(2);
      expect(element.textContent).toContain('qgen-critic');
      expect(element.textContent).toContain('qgen-question');
    });

    it('renders per-metric autorater chips (not blended)', () => {
      const safety = element.querySelector(
        '[data-testid="oplus-eval-metric-chora-agent-eval-qgen-question-safety"]',
      );
      const instr = element.querySelector(
        '[data-testid="oplus-eval-metric-chora-agent-eval-qgen-question-instruction_following"]',
      );
      expect(safety?.textContent).toContain('1.00');
      expect(instr?.textContent).toContain('4.75');
    });

    it('renders the adversarial block-rate chip for the member that has one', () => {
      const adv = element.querySelector(
        '[data-testid="oplus-eval-adv-chora-agent-eval-qgen-question"]',
      );
      expect(adv?.textContent).toContain('6/6');
      // critic had no adversarial rows → no chip
      const criticAdv = element.querySelector(
        '[data-testid="oplus-eval-adv-chora-agent-eval-qgen-critic"]',
      );
      expect(criticAdv).toBeNull();
    });

    it('renders the per-member Vertex Experiments deep-link', () => {
      const link = element.querySelector<HTMLAnchorElement>(
        '[data-testid="oplus-eval-member-vertex-depbump0607-chora-agent-eval-qgen-question"]',
      );
      expect(link?.getAttribute('href')).toContain('chora-agent-eval-qgen-question');
    });
  });

  describe('per-case evidence drill-down (lazy)', () => {
    it('is collapsed by default — no rows until toggled', () => {
      expect(
        element.querySelector('[data-testid="oplus-eval-evidence-depbump0607"]'),
      ).toBeNull();
    });

    it('loads + renders per-row evidence on toggle (autorater + adversarial verdict)', () => {
      const toggle = element.querySelector<HTMLButtonElement>(
        '[data-testid="oplus-eval-evidence-toggle-depbump0607"]',
      );
      toggle?.click();
      fixture.detectChanges();

      const body = element.querySelector('[data-testid="oplus-eval-evidence-depbump0607"]');
      expect(body).toBeTruthy();
      const rows = element.querySelectorAll('[data-testid^="oplus-eval-row-depbump0607-"]');
      expect(rows.length).toBe(2);
      // adversarial row carries the verdict pill
      const verdict = element.querySelector('.oplus-eval-verdict');
      expect(verdict?.textContent).toContain('BLOCKED(pass)');
      expect(verdict?.getAttribute('data-pass')).toBe('true');
    });

    it('renders the error branch when the evidence fetch fails', () => {
      stub.agentEvalEvidenceError = new Error('bq down');
      const toggle = element.querySelector<HTMLButtonElement>(
        '[data-testid="oplus-eval-evidence-toggle-depbump0607"]',
      );
      toggle?.click();
      fixture.detectChanges();
      const status = element.querySelector('.oplus-eval-evidence__status.is-error');
      expect(status).toBeTruthy();
    });
  });

  describe('state branches', () => {
    it('renders the auditor gate on a 403/forbidden state', () => {
      stub.setAgentEval(errorState('forbidden', 403));
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="oplus-agent-eval-auditor-gate"]'),
      ).toBeTruthy();
    });

    it('renders the error block on a 5xx state with no cached data', () => {
      stub.setAgentEval(errorState('server', 503));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="oplus-agent-eval-error"]')).toBeTruthy();
    });

    it('keeps rendering data on a stale state (data-state=stale)', () => {
      stub.setAgentEval(staleState(FIXTURE_AGENT_EVAL));
      fixture.detectChanges();
      const root = element.querySelector('[data-testid="oplus-agent-eval-root"]');
      expect(root?.getAttribute('data-state')).toBe('stale');
      expect(element.querySelector('[data-candidate-label="depbump0607"]')).toBeTruthy();
    });

    it('renders the empty state when there are no runs', () => {
      stub.setAgentEval(liveState({ fetched_at: 'x', runs: [] }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="oplus-agent-eval-empty"]')).toBeTruthy();
    });
  });
});
