/**
 * GraphQL client service — lightweight typed wrapper over Angular HttpClient.
 *
 * Posts to /api/v1/graphql via the BFF gateway. Uses the existing auth
 * interceptor (JWT token automatically attached). No Apollo or urql dependency.
 *
 * ADR-025: Learner-facing reads use GraphQL; admin CRUD uses REST.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from './bff-client.service';
import type { GraphQLRequest, GraphQLResponse, GraphQLError } from '../graphql/types';

// ---------------------------------------------------------------------------
// Error class for GraphQL-specific errors
// ---------------------------------------------------------------------------

export class GraphQLClientError extends Error {
  readonly errors: GraphQLError[];

  constructor(errors: GraphQLError[]) {
    const firstMessage = errors[0]?.message ?? 'Unknown GraphQL error';
    super(firstMessage);
    this.name = 'GraphQLClientError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class GraphQLService {
  private readonly bff = inject(BffClientService);
  private readonly graphqlPath = '/api/v1/graphql';

  /**
   * Execute a GraphQL query and return the typed data payload.
   *
   * @param query - GraphQL query string
   * @param variables - Optional query variables
   * @param operationName - Optional operation name (for multi-query documents)
   * @returns Observable of the typed response data
   * @throws GraphQLClientError when the response contains errors and no data
   *
   * Behavior on partial responses (data + errors):
   * - If data is present, it is returned even if errors exist.
   *   The caller can handle partial data as needed.
   * - If data is null/undefined AND errors are present, throws GraphQLClientError.
   * - If data is null/undefined AND no errors, returns null cast to T (empty result).
   */
  query<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Observable<T> {
    const body: GraphQLRequest = { query, variables, operationName };

    return this.bff.post<GraphQLResponse<T>>(this.graphqlPath, body).pipe(
      map((response) => {
        // Case 1: No data and errors present — throw
        if (response.data === null || response.data === undefined) {
          if (response.errors?.length) {
            throw new GraphQLClientError(response.errors);
          }
          // Case 2: No data, no errors — empty result
          return null as T;
        }

        // Case 3: Data present (may have partial errors — caller decides)
        return response.data;
      }),
    );
  }

  /**
   * Execute a GraphQL query and return the full response (data + errors).
   * Useful when the caller needs to inspect partial errors alongside data.
   */
  queryRaw<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string,
  ): Observable<GraphQLResponse<T>> {
    const body: GraphQLRequest = { query, variables, operationName };
    return this.bff.post<GraphQLResponse<T>>(this.graphqlPath, body);
  }
}
