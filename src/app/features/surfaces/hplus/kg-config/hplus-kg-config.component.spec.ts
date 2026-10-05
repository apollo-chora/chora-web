import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { HplusKgConfigComponent } from './hplus-kg-config.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';
import type { TenantKgConfig } from '../../aplus/dashboard/kg-fog/kg-fog.model';

/**
 * Per ADR-143: per-user KG, hexagonal fog. Defaults of 3 clusters
 * + 300s grace come from `tenant_entitlements.config_overrides`.
 * KgFogService.getTenantConfig() is now fail-loud (mock fallback
 * stripped 2026-05-16) — specs feed an envelope-wrapped success
 * response through HttpTestingController so the `@if (current())`
 * template branch renders the form.
 */
const DEFAULT_CFG: TenantKgConfig = {
  maxConcurrentKgClustersPerUser: 3,
  kgFogInvalidationGraceSeconds: 300,
  updatedAt: '2026-05-13T00:00:00Z',
  updatedByDisplayName: 'system',
};

function flushConfig(
  httpMock: HttpTestingController,
  body: TenantKgConfig = DEFAULT_CFG,
): void {
  httpMock
    .expectOne(`${environment.bffBaseUrl}/api/v1/tenants/t-1/knowledge-graph/config`)
    .flush({ data: body });
}

function setup(): {
  fixture: ComponentFixture<HplusKgConfigComponent>;
  el: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [HplusKgConfigComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ tenantId: 't-1' }) },
          paramMap: of(convertToParamMap({ tenantId: 't-1' })),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(HplusKgConfigComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('HplusKgConfigComponent (USR-H-KG-1)', () => {
  let fixture: ComponentFixture<HplusKgConfigComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setup();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders the form seeded from the tenant config response', () => {
    fixture.detectChanges();
    flushConfig(httpMock);
    fixture.detectChanges();

    const capInput = element.querySelector(
      '[data-testid="hplus-kg-cap-input"]',
    ) as HTMLInputElement;
    expect(capInput.value).toBe('3');
    const graceInput = element.querySelector(
      '[data-testid="hplus-kg-grace-input"]',
    ) as HTMLInputElement;
    expect(graceInput.value).toBe('300');
  });

  it('Save is disabled when no changes', () => {
    fixture.detectChanges();
    flushConfig(httpMock);
    fixture.detectChanges();
    const save = element.querySelector(
      '[data-testid="hplus-kg-save"]',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('Save enables when cap changes within bounds', () => {
    fixture.detectChanges();
    flushConfig(httpMock);
    fixture.detectChanges();

    const capInput = element.querySelector(
      '[data-testid="hplus-kg-cap-input"]',
    ) as HTMLInputElement;
    capInput.value = '5';
    capInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const save = element.querySelector(
      '[data-testid="hplus-kg-save"]',
    ) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('clamps cap to bounds 1..10', () => {
    fixture.detectChanges();
    flushConfig(httpMock);
    fixture.detectChanges();
    const capInput = element.querySelector(
      '[data-testid="hplus-kg-cap-input"]',
    ) as HTMLInputElement;
    capInput.value = '99';
    capInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.capDraft()).toBe(10);

    capInput.value = '0';
    capInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.capDraft()).toBe(1);
  });
});
