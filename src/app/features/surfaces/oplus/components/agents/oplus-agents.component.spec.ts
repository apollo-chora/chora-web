import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { OplusAgentsComponent } from './oplus-agents.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceService,
  type PromptsData,
} from '../../../../../core/services/governance.service';
import {
  GovernanceServiceStub,
  FIXTURE_AGENTS,
  FIXTURE_PROMPTS,
  liveState,
  loadingState,
  staleState,
  errorState,
} from '../../testing/governance.fixtures';

describe('OplusAgentsComponent (Crews + Agents accordion)', () => {
  let fixture: ComponentFixture<OplusAgentsComponent>;
  let element: HTMLElement;
  let stub: GovernanceServiceStub;

  beforeEach(async () => {
    stub = new GovernanceServiceStub();
    stub.setAgents(liveState(FIXTURE_AGENTS));

    await TestBed.configureTestingModule({
      imports: [OplusAgentsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: GovernanceService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OplusAgentsComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  describe('surface accent', () => {
    it('renders the .surface-oplus accent class on the screen root', () => {
      const root = element.querySelector('[data-testid="oplus-agents-root"]');
      expect(root).toBeTruthy();
      expect(root?.className).toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('renders the page title as h1', () => {
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
      const title = element.querySelector('[data-testid="oplus-agents-title"]');
      expect(title?.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  describe('Crews L1', () => {
    it('renders one item per crew from the BFF response (NOT the deprecated 7-agent invariant)', () => {
      const crews = element.querySelectorAll('[data-testid^="oplus-crew-toggle-"]');
      expect(crews.length).toBe(2); // FIXTURE_AGENTS has 2 crews
    });

    it('exposes the crew name as a data attribute', () => {
      const items = Array.from(
        element.querySelectorAll<HTMLElement>('[data-testid^="oplus-crew-"][data-crew-name]'),
      );
      const names = items.map((c) => c.dataset['crewName']);
      expect(names).toContain('mcq_ai_assist');
      expect(names).toContain('phyllis_content_gate');
    });

    it('shows the agent count chip per crew', () => {
      const chip = element.querySelector(
        '[data-testid="oplus-crew-count-mcq_ai_assist"]',
      );
      expect(chip).toBeTruthy();
      expect(chip?.textContent?.trim()).toContain('2');
    });

    it('flags crews with no recent activity', () => {
      const quiet = element.querySelector(
        '[data-testid="oplus-crew-quiet-phyllis_content_gate"]',
      );
      expect(quiet).toBeTruthy();
      const activeQuiet = element.querySelector(
        '[data-testid="oplus-crew-quiet-mcq_ai_assist"]',
      );
      expect(activeQuiet).toBeNull();
    });
  });

  describe('Crew expansion', () => {
    it('first crew is expanded by default', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-crew-toggle-mcq_ai_assist"]',
      );
      expect(btn?.getAttribute('aria-expanded')).toBe('true');
    });

    it('clicking a crew header toggles its panel', () => {
      const btn = element.querySelector(
        '[data-testid="oplus-crew-toggle-phyllis_content_gate"]',
      ) as HTMLButtonElement;
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      btn.click();
      fixture.detectChanges();
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      // Second click collapses.
      btn.click();
      fixture.detectChanges();
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Agent L2 rows', () => {
    it('renders one row per agent in the expanded crew', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="oplus-agent-row-mcq_ai_assist-"]',
      );
      expect(rows.length).toBe(2); // qgen_question + qgen_critic
    });

    it('renders the agent id + role per row', () => {
      const row = element.querySelector(
        '[data-testid="oplus-agent-row-mcq_ai_assist-qgen-mcq"]',
      );
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('qgen-mcq');
      expect(row?.textContent?.toLowerCase()).toContain('question generator');
    });

    it('renders "View in Cloud Trace ↗" deep-link when URL present', () => {
      const link = element.querySelector(
        '[data-testid="oplus-agent-trace-mcq_ai_assist-qgen-mcq"]',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.target).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.href).toContain('console.cloud.google.com/traces');
    });

    it('omits the Cloud Trace deep-link when the URL is null (orchestrator in phyllis crew)', () => {
      // Expand the phyllis crew first.
      const toggle = element.querySelector(
        '[data-testid="oplus-crew-toggle-phyllis_content_gate"]',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();

      const trace = element.querySelector(
        '[data-testid="oplus-agent-trace-phyllis_content_gate-orchestrator"]',
      );
      expect(trace).toBeNull();
    });

    it('renders stats with em-dash for null values', () => {
      // Expand the phyllis crew (all stats null).
      const toggle = element.querySelector(
        '[data-testid="oplus-crew-toggle-phyllis_content_gate"]',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const stats = element.querySelector(
        '[data-testid="oplus-agent-stats-phyllis_content_gate-orchestrator"]',
      ) as HTMLElement;
      expect(stats).toBeTruthy();
      // refusal_rate + p95 latency are null → "—"; invocations_24h is 0.
      expect(stats.textContent).toContain('–');
    });

    it('renders the engine_id when present', () => {
      const stats = element.querySelector(
        '[data-testid="oplus-agent-stats-mcq_ai_assist-qgen-mcq"]',
      ) as HTMLElement;
      expect(stats.textContent).toContain('8635637442075951104');
    });
  });

  describe('empty crew empty-state', () => {
    it('shows the "no recent activity" message for crews without traffic', () => {
      const toggle = element.querySelector(
        '[data-testid="oplus-crew-toggle-phyllis_content_gate"]',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const empty = element.querySelector(
        '[data-testid="oplus-crew-empty-phyllis_content_gate"]',
      );
      expect(empty).toBeTruthy();
      // It must NOT use the old "Mock — wave N" wording.
      expect(empty?.textContent?.toLowerCase()).not.toContain('mock');
      expect(empty?.textContent?.toLowerCase()).not.toContain('wave');
    });
  });

  describe('state branches', () => {
    it('renders auditor gate on 403 forbidden', () => {
      stub.setAgents(errorState('forbidden', 403));
      fixture.detectChanges();
      const gate = element.querySelector('[data-testid="oplus-agents-auditor-gate"]');
      expect(gate).toBeTruthy();
    });

    it('renders error block on server error with no cached data', () => {
      stub.setAgents(errorState('server', 503));
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="oplus-agents-error"]');
      expect(err).toBeTruthy();
    });

    it('keeps crews rendered in stale state', () => {
      stub.setAgents(staleState(FIXTURE_AGENTS));
      fixture.detectChanges();
      const crews = element.querySelectorAll('[data-testid^="oplus-crew-toggle-"]');
      expect(crews.length).toBe(2);
      const live = element.querySelector('[data-testid="oplus-agents-live"]') as HTMLElement;
      expect(live.dataset['variant']).toBe('stale');
    });
  });

  describe('prompt versioning (ADR-197 read slice, CHO-2364)', () => {
    /** ISO timestamp a whole number of days in the past (runtime-relative). */
    function daysAgoIso(days: number): string {
      return new Date(Date.now() - days * 86_400_000).toISOString();
    }

    /** FIXTURE_PROMPTS with a runtime-relative qgen_question evidence time. */
    function promptsWithRuntimeTimes(): PromptsData {
      return {
        agents: FIXTURE_PROMPTS.agents.map((a) =>
          a.evidence_kind === 'decisions' && a.agent_id === 'qgen_question'
            ? { ...a, last_decision_at: daysAgoIso(3) }
            : a,
        ),
      };
    }

    /** A future-shaped familiar row that HAS ritual version stamps. */
    function promptsWithFamiliarStamp(): PromptsData {
      return {
        agents: FIXTURE_PROMPTS.agents.map((a) =>
          a.evidence_kind === 'ritual_stamps'
            ? {
                ...a,
                runs_total: 12,
                last_run_at: daysAgoIso(1),
                versions: [
                  { prompt_version: 'v1', runs: 12, last_seen: daysAgoIso(1) },
                ],
              }
            : a,
        ),
      };
    }

    /** Load real i18n values for the prompt copy under test. */
    async function seedI18n(): Promise<void> {
      const i18n = TestBed.inject(TranslateService);
      const httpMock = TestBed.inject(HttpTestingController);
      const load = i18n.loadTranslations('en');
      httpMock.expectOne('/assets/i18n/en.json').flush({
        oplus: {
          agents: {
            prompt_ago_days: '{{n}}d ago',
            prompt_no_evidence: 'No prompt evidence yet',
            prompt_use_case_ai_assist_single: 'AI assist (single)',
            prompt_use_case_batch: 'Batch',
            prompt_use_case_daily_dose: 'Daily dose',
            prompt_runs_label: 'runs',
            prompt_from_ritual_stamps: 'from Routine run stamps',
            prompt_crew_qgen: 'QGen',
            prompt_crew_oe_grading: 'OE Grading',
            prompt_crew_familiar: 'Familiar',
            prompt_total_decisions: '{{n}} decisions',
            prompt_total_runs: '{{n}} runs',
          },
        },
      });
      await load;
    }

    function textOf(el: Element | null): string {
      return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    describe('standalone evidence panel + cards', () => {
      it('renders the panel above the crews list with one card per evidence agent, in payload order', () => {
        const panel = element.querySelector('[data-testid="oplus-prompts-panel"]');
        expect(panel).toBeTruthy();
        const list = element.querySelector('.oplus-agents__crew-list');
        expect(list).toBeTruthy();
        // The crews list FOLLOWS the panel in DOM order.
        expect(
          panel!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        const cards = Array.from(
          element.querySelectorAll<HTMLElement>(
            '[data-testid^="oplus-prompt-card-"]',
          ),
        );
        expect(cards.map((c) => c.dataset['agentId'])).toEqual([
          'qgen_question',
          'qgen_critic',
          'oe_evaluator',
          'oe_moderator',
          'familiar',
        ]);
      });

      it('is driven purely by the prompts payload: registry roster ids never match and carry no prompt chrome', () => {
        // The roster renders registry.json ids (qgen-mcq / qgen-critique);
        // the evidence rows are runtime roles (qgen_question / qgen_critic).
        // Two registry generator rows map onto ONE runtime role, so a
        // per-registry-row merge is structurally impossible.
        const rosterRows = Array.from(
          element.querySelectorAll<HTMLElement>('[data-testid^="oplus-agent-row-"]'),
        );
        const rosterIds = rosterRows.map((r) => r.dataset['agentId']);
        expect(rosterIds).toContain('qgen-mcq');
        expect(rosterIds).not.toContain('qgen_question');
        for (const row of rosterRows) {
          expect(row.querySelector('[data-testid^="oplus-prompt-"]')).toBeNull();
        }
        expect(
          element.querySelector('[data-testid="oplus-prompt-card-qgen_question"]'),
        ).toBeTruthy();
      });

      it('shows agent id, crew label and evidence total on each card', async () => {
        await seedI18n();
        fixture.detectChanges();

        const card = element.querySelector(
          '[data-testid="oplus-prompt-card-qgen_question"]',
        );
        expect(textOf(card?.querySelector('.oplus-prompt-card__id') ?? null)).toBe(
          'qgen_question',
        );
        expect(
          textOf(
            element.querySelector('[data-testid="oplus-prompt-crew-qgen_question"]'),
          ),
        ).toBe('QGen');
        expect(
          textOf(
            element.querySelector('[data-testid="oplus-prompt-total-qgen_question"]'),
          ),
        ).toBe('55 decisions');
        expect(
          textOf(
            element.querySelector('[data-testid="oplus-prompt-crew-oe_evaluator"]'),
          ),
        ).toBe('OE Grading');
        expect(
          textOf(element.querySelector('[data-testid="oplus-prompt-total-familiar"]')),
        ).toBe('4 runs');
      });

      it('renders version, source rung and relative evidence time on the card chip', async () => {
        await seedI18n();
        stub.setPrompts(liveState(promptsWithRuntimeTimes()));
        fixture.detectChanges();

        const chip = element.querySelector(
          '[data-testid="oplus-prompt-chip-qgen_question"]',
        );
        expect(chip).toBeTruthy();
        expect(textOf(chip)).toBe('v1 · embedded · 3d ago');
      });

      it('renders the designed empty chip when latest_* keys are absent (live oe pair), never a fabricated version', () => {
        for (const agentId of ['oe_evaluator', 'oe_moderator']) {
          const none = element.querySelector(
            `[data-testid="oplus-prompt-none-${agentId}"]`,
          );
          expect(none).toBeTruthy();
          // In dev/test a missing translation resolves to the raw key, so
          // this also proves the i18n key wiring.
          expect(none?.textContent).toContain('prompt_no_evidence');
          expect(
            element.querySelector(`[data-testid="oplus-prompt-chip-${agentId}"]`),
          ).toBeNull();
          const card = element.querySelector(
            `[data-testid="oplus-prompt-card-${agentId}"]`,
          );
          expect(card?.textContent).not.toContain('v1');
        }
      });
    });

    describe('qgen use-case matrix disclosure', () => {
      it('exposes a keyboard-operable disclosure button, collapsed by default', () => {
        const toggle = element.querySelector(
          '[data-testid="oplus-prompt-matrix-toggle-qgen_question"]',
        );
        expect(toggle).toBeTruthy();
        expect(toggle?.tagName).toBe('BUTTON');
        expect(toggle?.getAttribute('aria-expanded')).toBe('false');

        const controlled = toggle?.getAttribute('aria-controls');
        expect(controlled).toBeTruthy();
        const matrix = element.querySelector(`#${controlled}`);
        expect(matrix).toBeTruthy();
        expect(matrix?.getAttribute('role')).toBe('region');
        expect(matrix?.hasAttribute('hidden')).toBe(true);
      });

      it('expands into the 3-row use-case matrix with labels, counts, latest prompt and last seen', async () => {
        await seedI18n();
        fixture.detectChanges();

        const toggle = element.querySelector(
          '[data-testid="oplus-prompt-matrix-toggle-qgen_question"]',
        ) as HTMLButtonElement;
        toggle.click();
        fixture.detectChanges();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        const matrix = element.querySelector(
          '[data-testid="oplus-prompt-matrix-qgen_question"]',
        );
        expect(matrix?.hasAttribute('hidden')).toBe(false);

        // Live shape: the ai_assist_single lane HAS decisions + a last-seen
        // time but NO version evidence - the version cell must stay honest
        // while the last-seen cell still shows the real activity time.
        const single = element.querySelector(
          '[data-testid="oplus-prompt-usecase-qgen_question-ai_assist_single"]',
        );
        expect(textOf(single)).toContain('AI assist (single)');
        expect(textOf(single)).toContain('54');
        expect(textOf(single)).toContain('No prompt evidence yet');
        expect(textOf(single)).toContain('d ago');
        expect(textOf(single)).not.toContain('v1');

        const batch = element.querySelector(
          '[data-testid="oplus-prompt-usecase-qgen_question-batch"]',
        );
        expect(textOf(batch)).toContain('Batch');
        expect(textOf(batch)).toContain('1');
        expect(textOf(batch)).toContain('v1 · embedded');

        const rows = element.querySelectorAll(
          '[data-testid^="oplus-prompt-usecase-qgen_question-"]',
        );
        expect(rows.length).toBe(3);
      });

      it('renders the honest no-evidence state on a zero-decision use-case row', async () => {
        await seedI18n();
        const toggle = element.querySelector(
          '[data-testid="oplus-prompt-matrix-toggle-qgen_question"]',
        ) as HTMLButtonElement;
        toggle.click();
        fixture.detectChanges();

        const dose = element.querySelector(
          '[data-testid="oplus-prompt-usecase-qgen_question-daily_dose"]',
        );
        expect(dose).toBeTruthy();
        expect(textOf(dose)).toContain('Daily dose');
        expect(textOf(dose)).toContain('0');
        expect(textOf(dose)).toContain('No prompt evidence yet');
        expect(textOf(dose)).not.toContain('v1');
      });

      it('both qgen rows expand; a second click collapses again', () => {
        for (const agentId of ['qgen_question', 'qgen_critic']) {
          const toggle = element.querySelector(
            `[data-testid="oplus-prompt-matrix-toggle-${agentId}"]`,
          ) as HTMLButtonElement;
          expect(toggle).toBeTruthy();
          toggle.click();
          fixture.detectChanges();
          expect(toggle.getAttribute('aria-expanded')).toBe('true');
          toggle.click();
          fixture.detectChanges();
          expect(toggle.getAttribute('aria-expanded')).toBe('false');
        }
      });

      it('renders NO matrix toggle for decisions agents without use_cases on the wire (oe pair)', () => {
        expect(
          element.querySelector('[data-testid="oplus-prompt-card-oe_evaluator"]'),
        ).toBeTruthy();
        expect(
          element.querySelector(
            '[data-testid="oplus-prompt-matrix-toggle-oe_evaluator"]',
          ),
        ).toBeNull();
        expect(
          element.querySelector(
            '[data-testid="oplus-prompt-matrix-toggle-oe_moderator"]',
          ),
        ).toBeNull();
      });
    });

    describe('familiar ritual stamps', () => {
      it('renders version + runs + last-seen stamp chips and names the evidence kind', async () => {
        await seedI18n();
        stub.setPrompts(liveState(promptsWithFamiliarStamp()));
        fixture.detectChanges();

        const card = element.querySelector(
          '[data-testid="oplus-prompt-card-familiar"]',
        );
        expect(card).toBeTruthy();
        expect(textOf(card)).toContain('from Routine run stamps');

        const stamp = element.querySelector(
          '[data-testid="oplus-prompt-stamp-familiar-v1"]',
        );
        expect(stamp).toBeTruthy();
        expect(textOf(stamp)).toBe('v1 · 12 runs · 1d ago');
      });

      it('renders no fabricated stamp on the live shape (runs_total 4, versions empty)', async () => {
        await seedI18n();
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid^="oplus-prompt-stamp-familiar"]'),
        ).toBeNull();
        const none = element.querySelector(
          '[data-testid="oplus-prompt-none-familiar"]',
        );
        expect(none).toBeTruthy();
        expect(textOf(none)).toBe('No prompt evidence yet');
        // The evidence-kind copy + the honest runs total still render.
        const card = element.querySelector(
          '[data-testid="oplus-prompt-card-familiar"]',
        );
        expect(textOf(card)).toContain('from Routine run stamps');
        expect(
          textOf(element.querySelector('[data-testid="oplus-prompt-total-familiar"]')),
        ).toBe('4 runs');
      });
    });

    describe('prompts fetch states (on the panel)', () => {
      it('shows the loading skeleton while prompt evidence loads (no cards yet)', () => {
        stub.setPrompts(loadingState());
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid="oplus-prompts-loading"]'),
        ).toBeTruthy();
        expect(
          element.querySelector('[data-testid^="oplus-prompt-card-"]'),
        ).toBeNull();
        expect(
          element.querySelector('[data-testid^="oplus-prompt-chip-"]'),
        ).toBeNull();
      });

      it('shows the error state with a retry CTA that re-polls the prompts route', () => {
        stub.setPrompts(errorState('server', 503));
        fixture.detectChanges();

        const block = element.querySelector('[data-testid="oplus-prompts-error"]');
        expect(block).toBeTruthy();
        expect(block?.getAttribute('role')).toBe('alert');

        const retry = element.querySelector(
          '[data-testid="oplus-prompts-retry"]',
        ) as HTMLButtonElement;
        expect(retry).toBeTruthy();
        expect(retry.tagName).toBe('BUTTON');
        retry.click();
        fixture.detectChanges();
        expect(stub.retryPromptsCalls).toBe(1);
      });

      it('mirrors the auditor-gate treatment when the prompts fetch is forbidden', () => {
        stub.setPrompts(errorState('forbidden', 403));
        fixture.detectChanges();

        const gate = element.querySelector(
          '[data-testid="oplus-prompts-auditor-gate"]',
        );
        expect(gate).toBeTruthy();
        expect(gate?.getAttribute('role')).toBe('alert');
        // The screen-level agents gate must NOT fire - the agents fetch is live.
        expect(
          element.querySelector('[data-testid="oplus-agents-auditor-gate"]'),
        ).toBeNull();
      });

      it('hides the whole panel behind the screen-level gate when the agents fetch is forbidden', () => {
        stub.setAgents(errorState('forbidden', 403));
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid="oplus-agents-auditor-gate"]'),
        ).toBeTruthy();
        expect(
          element.querySelector('[data-testid="oplus-prompts-panel"]'),
        ).toBeNull();
      });

      it('shows the designed empty state when the wire returns no agents', () => {
        stub.setPrompts(liveState<PromptsData>({ agents: [] }));
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid="oplus-prompts-empty"]'),
        ).toBeTruthy();
      });

      it('renders no state block when prompt evidence is live', () => {
        for (const testid of [
          'oplus-prompts-loading',
          'oplus-prompts-error',
          'oplus-prompts-auditor-gate',
          'oplus-prompts-empty',
        ]) {
          expect(element.querySelector(`[data-testid="${testid}"]`)).toBeNull();
        }
      });

      it('keeps cards rendered from the cached payload in the stale state', () => {
        stub.setPrompts(staleState(FIXTURE_PROMPTS));
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid="oplus-prompt-chip-qgen_question"]'),
        ).toBeTruthy();
        expect(
          element.querySelectorAll('[data-testid^="oplus-prompt-card-"]').length,
        ).toBe(5);
      });
    });
  });

  describe('accessibility', () => {
    it('uses aria-expanded + aria-controls + role=region wiring', () => {
      const toggle = element.querySelector(
        '[data-testid="oplus-crew-toggle-mcq_ai_assist"]',
      ) as HTMLButtonElement;
      const ctrlId = toggle.getAttribute('aria-controls');
      expect(ctrlId).toBeTruthy();
      const panel = element.querySelector(`#${ctrlId}`);
      expect(panel?.getAttribute('role')).toBe('region');
    });

    it('deep-link buttons open in a new window with noopener', () => {
      const links = element.querySelectorAll<HTMLAnchorElement>('a.oplus-deep-link');
      expect(links.length).toBeGreaterThan(0);
      for (const link of Array.from(links)) {
        expect(link.target).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    });
  });

  describe('prompt catalogue modal (CHO-2368)', () => {
    it('renders version chips as buttons that open the modal preselected', () => {
      const chip = element.querySelector<HTMLButtonElement>(
        '[data-testid="oplus-prompt-chip-qgen_question"]',
      );
      expect(chip).toBeTruthy();
      expect(chip?.tagName).toBe('BUTTON');
      chip?.click();
      fixture.detectChanges();
      const modal = element.querySelector('[data-testid="oplus-prompt-modal"]');
      expect(modal).toBeTruthy();
      // The chip's version (v1) is preselected into the content fetch.
      expect(stub.promptCatalogueCalls.at(-1)).toEqual({
        agentId: 'qgen_question',
        version: 'v1',
      });
    });

    it('opens the modal from a no-evidence chip too (v1 baseline is viewable)', () => {
      const promptsNoEvidence = structuredClone(
        FIXTURE_PROMPTS,
      ) as unknown as PromptsData;
      const first = promptsNoEvidence.agents[0] as unknown as Record<string, unknown>;
      delete first['latest_prompt_version'];
      delete first['latest_prompt_source'];
      stub.setPrompts(liveState(promptsNoEvidence));
      fixture.detectChanges();

      const chip = element.querySelector<HTMLButtonElement>(
        '[data-testid="oplus-prompt-none-qgen_question"]',
      );
      expect(chip).toBeTruthy();
      chip?.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="oplus-prompt-modal"]'),
      ).toBeTruthy();
    });

    it('closes the modal on dismiss', () => {
      element
        .querySelector<HTMLButtonElement>(
          '[data-testid="oplus-prompt-chip-qgen_question"]',
        )
        ?.click();
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>(
          '[data-testid="oplus-prompt-modal-close"]',
        )
        ?.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="oplus-prompt-modal"]'),
      ).toBeNull();
    });
  });
});
