import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { InstructorRosterService } from './instructor-roster.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  TenantMemberSummary,
  TenantMemberSearchResponse,
} from '../assessments/assessment-instantiation/assessment-instantiation.model';

function member(gcid: string): TenantMemberSummary {
  return {
    gcid,
    email: `${gcid}@tenant.io`,
    display_name: `Instructor ${gcid}`,
    roles: ['INSTRUCTOR'],
    last_active_at: null,
  };
}

describe('InstructorRosterService', () => {
  let service: InstructorRosterService;
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        InstructorRosterService,
        { provide: BffClientService, useValue: { get } },
      ],
    });
    service = TestBed.inject(InstructorRosterService);
  });

  it('lists instructors via role=INSTRUCTOR with a full page size and NO free-text query', () => {
    get.mockReturnValue(
      of<TenantMemberSearchResponse>({ items: [], next_page_token: null }),
    );
    service.listInstructors().subscribe();

    expect(get).toHaveBeenCalledTimes(1);
    const [path, params] = get.mock.calls[0] as [string, HttpParams];
    expect(path).toBe('/api/v1/admin/tenant-members');
    expect(params.get('role')).toBe('INSTRUCTOR');
    expect(params.get('page_size')).toBe('100');
    // An empty/missing q is what makes the endpoint LIST rather than search.
    expect(params.get('q')).toBeNull();
    expect(params.get('page_token')).toBeNull();
  });

  it('pages through next_page_token and concatenates every instructor (no silent truncation)', () => {
    const page1: TenantMemberSearchResponse = {
      items: [member('a'), member('b')],
      next_page_token: 'tok-2',
    };
    const page2: TenantMemberSearchResponse = {
      items: [member('c')],
      next_page_token: null,
    };
    get.mockReturnValueOnce(of(page1)).mockReturnValueOnce(of(page2));

    let result: readonly TenantMemberSummary[] = [];
    service.listInstructors().subscribe((r) => (result = r));

    expect(get).toHaveBeenCalledTimes(2);
    const secondParams = get.mock.calls[1][1] as HttpParams;
    expect(secondParams.get('page_token')).toBe('tok-2');
    expect(result.map((i) => i.gcid)).toEqual(['a', 'b', 'c']);
  });

  it('propagates the error fail-loud (never a partial roster)', () => {
    get.mockReturnValue(throwError(() => new Error('upstream down')));
    let errored = false;
    let emitted = false;
    service.listInstructors().subscribe({
      next: () => (emitted = true),
      error: () => (errored = true),
    });
    expect(errored).toBe(true);
    expect(emitted).toBe(false);
  });
});
