import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GraphQLService, GraphQLClientError } from './graphql.service';
import { environment } from '../../../environments/environment';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestData {
  hero: { name: string; id: string };
}

const TEST_QUERY = `
  query GetHero($id: ID!) {
    hero(id: $id) { name id }
  }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphQLService', () => {
  let service: GraphQLService;
  let httpMock: HttpTestingController;
  const graphqlUrl = `${environment.bffBaseUrl}/api/v1/graphql`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GraphQLService,
      ],
    });
    service = TestBed.inject(GraphQLService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // query() — success cases
  // -------------------------------------------------------------------------

  describe('query()', () => {
    it('sends POST to /api/v1/graphql', () => {
      service.query<TestData>(TEST_QUERY, { id: '1' }).subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.method).toBe('POST');
      req.flush({ data: { hero: { name: 'Luke', id: '1' } } });
    });

    it('sends query and variables in request body', () => {
      service.query<TestData>(TEST_QUERY, { id: '42' }).subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.query).toBe(TEST_QUERY);
      expect(req.request.body.variables).toEqual({ id: '42' });
      req.flush({ data: { hero: { name: 'Han', id: '42' } } });
    });

    it('sends operationName when provided', () => {
      service.query<TestData>(TEST_QUERY, { id: '1' }, 'GetHero').subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.operationName).toBe('GetHero');
      req.flush({ data: { hero: { name: 'Leia', id: '1' } } });
    });

    it('returns typed data on success', () => {
      let result: TestData | undefined;
      service.query<TestData>(TEST_QUERY, { id: '1' }).subscribe((data) => {
        result = data;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: { hero: { name: 'Luke', id: '1' } },
      });

      expect(result).toEqual({ hero: { name: 'Luke', id: '1' } });
    });

    it('works without variables', () => {
      service.query<TestData>(TEST_QUERY).subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.variables).toBeUndefined();
      req.flush({ data: { hero: { name: 'Yoda', id: '0' } } });
    });

    // -----------------------------------------------------------------------
    // query() — error handling
    // -----------------------------------------------------------------------

    it('throws GraphQLClientError when data is null and errors present', () => {
      let caughtError: GraphQLClientError | undefined;

      service.query<TestData>(TEST_QUERY).subscribe({
        error: (err: GraphQLClientError) => {
          caughtError = err;
        },
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [{ message: 'Not authorized' }],
      });

      expect(caughtError).toBeInstanceOf(GraphQLClientError);
      expect(caughtError?.message).toBe('Not authorized');
      expect(caughtError?.errors).toHaveLength(1);
      expect(caughtError?.errors[0].message).toBe('Not authorized');
    });

    it('throws GraphQLClientError with first error message from multiple errors', () => {
      let caughtError: GraphQLClientError | undefined;

      service.query<TestData>(TEST_QUERY).subscribe({
        error: (err: GraphQLClientError) => {
          caughtError = err;
        },
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [
          { message: 'Field "hero" not found' },
          { message: 'Cannot return null for non-nullable field' },
        ],
      });

      expect(caughtError?.message).toBe('Field "hero" not found');
      expect(caughtError?.errors).toHaveLength(2);
    });

    it('returns data even when partial errors are present', () => {
      let result: TestData | undefined;

      service.query<TestData>(TEST_QUERY).subscribe((data) => {
        result = data;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: { hero: { name: 'Luke', id: '1' } },
        errors: [{ message: 'Deprecated field used' }],
      });

      // Data is returned despite partial errors
      expect(result).toEqual({ hero: { name: 'Luke', id: '1' } });
    });

    it('returns null when data is null and no errors', () => {
      let result: TestData | null = 'unset' as unknown as TestData | null;

      service.query<TestData>(TEST_QUERY).subscribe((data) => {
        result = data;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: null,
      });

      expect(result).toBeNull();
    });

    it('propagates HTTP errors from the transport layer', () => {
      let caughtError: Error | undefined;

      service.query<TestData>(TEST_QUERY).subscribe({
        error: (err: Error) => {
          caughtError = err;
        },
      });

      httpMock.expectOne(graphqlUrl).error(new ProgressEvent('error'));

      expect(caughtError).toBeTruthy();
    });

    it('throws GraphQLClientError when data is undefined and errors present', () => {
      let caughtError: GraphQLClientError | undefined;

      service.query<TestData>(TEST_QUERY).subscribe({
        error: (err: GraphQLClientError) => {
          caughtError = err;
        },
      });

      // No `data` key at all → response.data is undefined (distinct from null)
      httpMock.expectOne(graphqlUrl).flush({
        errors: [{ message: 'Internal server error' }],
      });

      expect(caughtError).toBeInstanceOf(GraphQLClientError);
      expect(caughtError?.message).toBe('Internal server error');
      expect(caughtError?.errors).toHaveLength(1);
    });

    it('returns null when data is undefined and no errors', () => {
      let result: TestData | null = 'unset' as unknown as TestData | null;
      let completed = false;

      service.query<TestData>(TEST_QUERY).subscribe({
        next: (data) => {
          result = data;
        },
        complete: () => {
          completed = true;
        },
      });

      // Completely empty body → data undefined, no errors
      httpMock.expectOne(graphqlUrl).flush({});

      expect(result).toBeNull();
      expect(completed).toBe(true);
    });

    it('returns null when data is null and errors array is empty', () => {
      let result: TestData | null = 'unset' as unknown as TestData | null;

      // errors present as a key but length 0 → `?.length` is falsy → empty result
      service.query<TestData>(TEST_QUERY).subscribe((data) => {
        result = data;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [],
      });

      expect(result).toBeNull();
    });

    it('forwards variables in the request body when provided', () => {
      service
        .query<TestData>(TEST_QUERY, { id: '99', include: true })
        .subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.variables).toEqual({ id: '99', include: true });
      // operationName not supplied → undefined in body
      expect(req.request.body.operationName).toBeUndefined();
      req.flush({ data: { hero: { name: 'Rey', id: '99' } } });
    });

    it('returns data when the payload is present alongside an empty errors array', () => {
      let result: TestData | undefined;

      service.query<TestData>(TEST_QUERY).subscribe((data) => {
        result = data;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: { hero: { name: 'Finn', id: '7' } },
        errors: [],
      });

      expect(result).toEqual({ hero: { name: 'Finn', id: '7' } });
    });
  });

  // -------------------------------------------------------------------------
  // queryRaw()
  // -------------------------------------------------------------------------

  describe('queryRaw()', () => {
    it('returns full GraphQL response with data and errors', () => {
      let result: { data: TestData | null; errors?: { message: string }[] } | undefined;

      service.queryRaw<TestData>(TEST_QUERY, { id: '1' }).subscribe((res) => {
        result = res;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: { hero: { name: 'Luke', id: '1' } },
        errors: [{ message: 'Warning: slow query' }],
      });

      expect(result?.data).toEqual({ hero: { name: 'Luke', id: '1' } });
      expect(result?.errors).toHaveLength(1);
    });

    it('returns full response when data is null', () => {
      let result: { data: TestData | null; errors?: { message: string }[] } | undefined;

      service.queryRaw<TestData>(TEST_QUERY).subscribe((res) => {
        result = res;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [{ message: 'Not found' }],
      });

      expect(result?.data).toBeNull();
      expect(result?.errors?.[0].message).toBe('Not found');
    });

    it('sends operationName in request body', () => {
      service.queryRaw<TestData>(TEST_QUERY, undefined, 'GetHero').subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.operationName).toBe('GetHero');
      req.flush({ data: { hero: { name: 'Leia', id: '1' } } });
    });

    it('sends a POST to /api/v1/graphql with query in the body', () => {
      service.queryRaw<TestData>(TEST_QUERY, { id: '5' }).subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.query).toBe(TEST_QUERY);
      expect(req.request.body.variables).toEqual({ id: '5' });
      req.flush({ data: { hero: { name: 'Poe', id: '5' } } });
    });

    it('works without variables (variables undefined in body)', () => {
      service.queryRaw<TestData>(TEST_QUERY).subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.variables).toBeUndefined();
      expect(req.request.body.operationName).toBeUndefined();
      req.flush({ data: { hero: { name: 'BB-8', id: '8' } } });
    });

    it('returns full response with only data and no errors key', () => {
      let result: { data: TestData | null; errors?: { message: string }[] } | undefined;

      service.queryRaw<TestData>(TEST_QUERY).subscribe((res) => {
        result = res;
      });

      httpMock.expectOne(graphqlUrl).flush({
        data: { hero: { name: 'Maz', id: '11' } },
      });

      expect(result?.data).toEqual({ hero: { name: 'Maz', id: '11' } });
      expect(result?.errors).toBeUndefined();
    });

    it('propagates HTTP transport errors (does not swallow them)', () => {
      let caughtError: Error | undefined;

      service.queryRaw<TestData>(TEST_QUERY).subscribe({
        error: (err: Error) => {
          caughtError = err;
        },
      });

      httpMock.expectOne(graphqlUrl).error(new ProgressEvent('error'));

      expect(caughtError).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // GraphQLClientError
  // -------------------------------------------------------------------------

  describe('GraphQLClientError', () => {
    it('has correct name', () => {
      const err = new GraphQLClientError([{ message: 'test' }]);
      expect(err.name).toBe('GraphQLClientError');
    });

    it('uses first error message', () => {
      const err = new GraphQLClientError([
        { message: 'first' },
        { message: 'second' },
      ]);
      expect(err.message).toBe('first');
    });

    it('handles empty errors array with fallback message', () => {
      const err = new GraphQLClientError([]);
      expect(err.message).toBe('Unknown GraphQL error');
    });

    it('preserves all errors', () => {
      const errors = [
        { message: 'Error 1', path: ['hero', 'name'] as (string | number)[] },
        { message: 'Error 2', locations: [{ line: 3, column: 5 }] },
      ];
      const err = new GraphQLClientError(errors);
      expect(err.errors).toEqual(errors);
    });

    it('is an instance of Error', () => {
      const err = new GraphQLClientError([{ message: 'test' }]);
      expect(err instanceof Error).toBe(true);
    });

    it('falls back to default message when first error message is missing', () => {
      // First entry has no `message` → `errors[0]?.message` is undefined → fallback
      const err = new GraphQLClientError([
        { message: undefined as unknown as string },
        { message: 'second' },
      ]);
      expect(err.message).toBe('Unknown GraphQL error');
      expect(err.errors).toHaveLength(2);
    });

    it('is catchable as a generic Error via instanceof', () => {
      const err = new GraphQLClientError([{ message: 'boom' }]);
      let matched = false;
      try {
        throw err;
      } catch (e) {
        if (e instanceof Error) {
          matched = true;
        }
      }
      expect(matched).toBe(true);
    });
  });
});
