import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  EntitySearchRegistry,
  ENTITY_SEARCH_PORTS,
} from './entity-search.registry';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
  EntitySearchPort,
  EntityType,
} from './entity-picker.model';

/** Minimal in-line fake port — registry isolation (NOT the mock adapter). */
function fakePort(entityType: EntityType, tag: string): EntitySearchPort {
  return {
    entityType,
    search(): ReturnType<EntitySearchPort['search']> {
      const page: EntitySearchPage = {
        items: [{ id: tag, label: tag } satisfies EntityRef],
        nextCursor: null,
      };
      return of<EntitySearchPage>(page);
    },
  };
}

function configure(ports: readonly EntitySearchPort[]): EntitySearchRegistry {
  TestBed.configureTestingModule({
    providers: ports.map((p) => ({
      provide: ENTITY_SEARCH_PORTS,
      useValue: p,
      multi: true,
    })),
  });
  return TestBed.inject(EntitySearchRegistry);
}

describe('EntitySearchRegistry', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('resolves the registered port for an entityType', () => {
    const coursePort = fakePort('course', 'course-port');
    const registry = configure([coursePort, fakePort('room', 'room-port')]);
    expect(registry.resolve('course')).toBe(coursePort);
  });

  it('throws fail-loud (no silent empty) for an unregistered entityType', () => {
    const registry = configure([fakePort('course', 'course-port')]);
    expect(() => registry.resolve('atom')).toThrowError(/atom/);
  });

  it('throws fail-loud when NO ports are registered at all', () => {
    TestBed.configureTestingModule({ providers: [] });
    const registry = TestBed.inject(EntitySearchRegistry);
    expect(() => registry.resolve('member')).toThrowError(
      /no EntitySearchPort registered/i,
    );
  });

  it('last-registered port wins when two register the same entityType (override)', () => {
    const first = fakePort('course', 'first');
    const second = fakePort('course', 'second');
    const registry = configure([first, second]);
    expect(registry.resolve('course')).toBe(second);
  });

  it('has() reflects registration state', () => {
    const registry = configure([fakePort('course', 'course-port')]);
    expect(registry.has('course')).toBe(true);
    expect(registry.has('atom')).toBe(false);
  });

  it('the resolved port is a usable EntitySearchPort', () => {
    const registry = configure([fakePort('course', 'course-port')]);
    const port = registry.resolve('course');
    const facets: EntityFacets = {};
    let received: EntitySearchPage | null = null;
    port.search('q', facets, null).subscribe((p) => (received = p));
    expect(received).not.toBeNull();
    expect(received!.items[0].id).toBe('course-port');
  });
});
