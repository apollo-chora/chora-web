import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FarSightComponent } from './far-sight.component';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';

const FAM = '00000000-0000-7000-8000-00000000e1a0';
const base = environment.bffBaseUrl;

// The REAL errorInterceptor is registered here on purpose. Without it,
// HttpTestingController hands the component a bare HttpErrorResponse whose
// `.error` IS the body — a shape production NEVER produces, because the global
// interceptor converts every HTTP failure into an ApiError (CHO-1705). That
// divergence is exactly how the Far Sight error mapping shipped completely
// dead — every error rendered the generic "please try again" in prod while the
// spec stayed green. Drive the production error chain, or the spec proves
// nothing.
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: ActiveFamiliarService, useValue: { active: () => ({ familiarId: FAM }) } },
    ],
  });
  const fixture = TestBed.createComponent(FarSightComponent);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function q(fixture: ReturnType<typeof setup>['fixture'], testid: string): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
}

describe('FarSightComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders both Seeker tabs and defaults to fact_check', () => {
    const { fixture } = setup();
    expect(q(fixture, 'far-sight-aim-fact_check')).toBeTruthy();
    expect(q(fixture, 'far-sight-aim-web_research')).toBeTruthy();
    expect(q(fixture, 'far-sight-claim')).toBeTruthy(); // fact_check input shown
  });

  it('canAim reacts to the form value (empty ⇒ disabled, typed ⇒ enabled)', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance;
    expect(cmp.canAim()).toBe(false);
    cmp.form.controls.claim.setValue('The Earth is round');
    expect(cmp.canAim()).toBe(true);
  });

  it('web_research invoke renders reply + grounded sources + the Google chip + disclosure', () => {
    const { fixture, http } = setup();
    const cmp = fixture.componentInstance;
    cmp.aim('web_research');
    fixture.detectChanges();
    cmp.form.controls.direction.setValue('the James Webb Space Telescope');
    cmp.invoke();

    const req = http.expectOne(
      `${base}/api/v1/me/familiars/${FAM}/skills/web_research/invoke`,
    );
    expect(req.request.body).toEqual({ params: { direction: 'the James Webb Space Telescope', depth: 'survey' } });
    req.flush({
      skill_key: 'web_research',
      reply: 'JWST launched on 25 Dec 2021 (NASA/ESA/CSA).',
      recorded: true,
      mana_charged: 80,
      result_kind: 'chat',
      citations: [
        { url: 'https://vertexaisearch.cloud.google.com/redirect/abc', title: 'How JWST works', snippet: 'A space telescope.', domain: 'nasa.gov' },
      ],
      search_entry_point_html: '<div class="gsc">Related searches</div>',
      web_search_queries: ['james webb space telescope launch date'],
    });
    fixture.detectChanges();

    expect(q(fixture, 'far-sight-reply')?.textContent).toContain('JWST launched');
    // CHO-2179: the grounded attribution is now ONE shared component
    // (<chora-grounded-attribution>) — far-sight composes it and owns none of it.
    expect(q(fixture, 'grounded-sources')?.textContent).toContain('nasa.gov');
    expect(q(fixture, 'grounded-sources')?.textContent).toContain('How JWST works');
    // ADR-231 D4: the source is NAMED by its durable domain, never by the
    // ~30-day grounding-redirect URL (which stays only as the click-through).
    expect(q(fixture, 'grounded-sources')?.textContent).not.toContain('vertexaisearch');
    // the Google chip is rendered verbatim as trusted HTML
    expect(q(fixture, 'grounded-chip')?.innerHTML).toContain('Related searches');
    // ...and the durable "what I searched" line that outlives the chip's links
    expect(q(fixture, 'grounded-queries')?.textContent).toContain('james webb space telescope launch date');
    expect(q(fixture, 'grounded-disclosure')).toBeTruthy();
    http.verify();
  });

  it('a no-citation hedge shows the reply and WHAT IT SEARCHED, but no sources and no chip', () => {
    const { fixture, http } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.controls.claim.setValue('Aliens built the Eiffel Tower');
    cmp.invoke();
    http.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/fact_check/invoke`).flush({
      skill_key: 'fact_check',
      reply: 'I could not find grounded sources, so I will not guess.',
      result_kind: 'chat',
      // no citations, no chip — but the familiar DID search, and says so
      web_search_queries: ['who built the eiffel tower'],
    });
    fixture.detectChanges();
    expect(q(fixture, 'far-sight-reply')?.textContent).toContain('not guess');
    expect(q(fixture, 'grounded-sources')).toBeNull();
    expect(q(fixture, 'grounded-chip')).toBeNull();
    // The hedge invites the learner to rephrase — which is useless if it hides
    // what it tried. The queries survive (CHO-2179).
    expect(q(fixture, 'grounded-queries')?.textContent).toContain('who built the eiffel tower');
    http.verify();
  });

  it('a result with NO grounded channels at all renders no attribution block', () => {
    const { fixture, http } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.controls.claim.setValue('Water is wet');
    cmp.invoke();
    http.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/fact_check/invoke`).flush({
      skill_key: 'fact_check',
      reply: 'No search ran.',
      result_kind: 'chat',
    });
    fixture.detectChanges();
    // No fabrication: no husk, and no disclosure of a web search that never happened.
    expect(q(fixture, 'grounded-attribution')).toBeNull();
    expect(q(fixture, 'grounded-disclosure')).toBeNull();
    http.verify();
  });

  // A GOVERNANCE deny arrives as its own 4xx code (BE groundedSearchInvokeError,
  // CHO-2148 close-out). It used to be a blanket 502 FACT_CHECK_SEARCH_FAILED —
  // which chora-gateway then masked as GATEWAY_UPSTREAM_5XX (it normalises every
  // upstream 5xx; 2xx + 4xx pass through verbatim), so the reason never reached
  // this component and the learner got the generic "please try again" against a
  // gate that was deliberately shut. The old spec faked a code the FE could never
  // actually receive, so it passed while production was broken. These drive the
  // codes the BE really emits.
  const denials: readonly { code: string; status: number; want: string }[] = [
    { code: 'EXTERNAL_EGRESS_DISABLED', status: 403, want: 'far_sight.error.egress_off' },
    { code: 'EXTERNAL_EGRESS_KILL_SWITCH', status: 403, want: 'far_sight.error.egress_paused' },
    { code: 'EXTERNAL_EGRESS_CEILING_REACHED', status: 429, want: 'far_sight.error.ceiling' },
    { code: 'GROUNDED_QUERY_BLOCKED', status: 403, want: 'far_sight.error.blocked' },
  ];

  for (const d of denials) {
    it(`surfaces the ${d.code} deny honestly (${d.status} ⇒ ${d.want})`, () => {
      const { fixture, http } = setup();
      const cmp = fixture.componentInstance;
      cmp.form.controls.claim.setValue('The Earth is round');
      cmp.invoke();
      http.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/fact_check/invoke`).flush(
        { code: d.code, message: 'denied at the chokepoint' },
        { status: d.status, statusText: 'Denied' },
      );
      fixture.detectChanges();
      expect(q(fixture, 'far-sight-error')).toBeTruthy();
      expect(cmp.errorKey()).toBe(d.want);
      http.verify();
    });
  }

  // The converse: a GENUINE upstream failure must NOT read as "web search is off"
  // — that would tell the learner their workspace is unconfigured when Vertex is
  // merely down. "Try again" is the honest advice here, and only here.
  //
  // Both real body shapes are exercised: chora-consumption's FLAT {code,message}
  // (which survives the hop — the gateway passes 4xx through verbatim) and
  // chora-gateway's NESTED {error:{code,message}} (which it emits when it masks a
  // genuine upstream 5xx).
  // `body` is typed as an object rather than `unknown` so it satisfies flush()'s
  // body parameter — `unknown` was a pre-existing TS2345 under tsconfig.spec.json
  // (vitest runs through esbuild, which does not typecheck, so it stayed hidden).
  const failures: readonly { name: string; body: Record<string, unknown> }[] = [
    {
      name: 'consumption search failure (flat body)',
      body: { code: 'FACT_CHECK_SEARCH_FAILED', message: 'grounded search failed' },
    },
    {
      name: 'gateway 5xx mask (nested envelope)',
      body: { error: { code: 'GATEWAY_UPSTREAM_5XX', message: 'upstream returned 502' } },
    },
  ];

  for (const f of failures) {
    it(`keeps a real upstream failure generic, not egress-off (${f.name})`, () => {
      const { fixture, http } = setup();
      const cmp = fixture.componentInstance;
      cmp.form.controls.claim.setValue('The Earth is round');
      cmp.invoke();
      http
        .expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/fact_check/invoke`)
        .flush(f.body, { status: 502, statusText: 'Bad Gateway' });
      fixture.detectChanges();
      expect(q(fixture, 'far-sight-error')).toBeTruthy();
      expect(cmp.errorKey()).toBe('far_sight.error.generic');
      http.verify();
    });
  }

  // Regression guard for the ROOT cause: the whole errorKeyForCode switch was
  // dead at runtime (extractErrorCode read `err.error.code`, which is undefined
  // on an ApiError), so EVERY error rendered the generic message — mana and
  // stage-lock included, not just the egress ones. Pin a pre-existing code so a
  // future refactor of the error plumbing cannot silently kill the mapping again.
  const preExisting: readonly { code: string; status: number; want: string }[] = [
    { code: 'INSUFFICIENT_MANA', status: 402, want: 'far_sight.error.mana' },
    { code: 'SKILL_STAGE_LOCKED', status: 409, want: 'far_sight.error.locked' },
  ];

  for (const p of preExisting) {
    it(`still maps the pre-existing ${p.code} through the real interceptor`, () => {
      const { fixture, http } = setup();
      const cmp = fixture.componentInstance;
      cmp.form.controls.claim.setValue('The Earth is round');
      cmp.invoke();
      http.expectOne(`${base}/api/v1/me/familiars/${FAM}/skills/fact_check/invoke`).flush(
        { code: p.code, message: 'nope' },
        { status: p.status, statusText: 'Denied' },
      );
      fixture.detectChanges();
      expect(cmp.errorKey()).toBe(p.want);
      http.verify();
    });
  }
});
