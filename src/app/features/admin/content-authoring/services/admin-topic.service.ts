/**
 * Admin topic service — REST CRUD for TopicNode management.
 * Source of truth: chora-creation `topic_handler.go` (CHO-2275).
 *
 * All HTTP calls go through BffClientService (chora-gateway). The read endpoint
 * returns a FLAT `{ data: TopicNodeDTO[] }` payload; the nested tree the admin UI
 * renders is assembled here from `parent_id`.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  TopicNode,
  TopicNodeDTO,
  CreateTopicRequest,
  UpdateTopicRequest,
  MoveTopicRequest,
} from '../models/admin-topic.model';

const TOPICS_PATH = '/api/v1/topics';

/**
 * Assemble a nested tree from the flat wire list. A node whose `parent_id` is
 * null — or points at a parent absent from the list — becomes a root (fail-safe
 * against orphans rather than dropping the node).
 */
export function buildTopicTree(flat: TopicNodeDTO[]): TopicNode[] {
  const byId = new Map<string, TopicNode>();
  const roots: TopicNode[] = [];

  for (const dto of flat) {
    byId.set(dto.id, { ...dto, children: [] });
  }
  for (const dto of flat) {
    const node = byId.get(dto.id)!;
    const parent = dto.parent_id ? byId.get(dto.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

@Injectable({ providedIn: 'root' })
export class AdminTopicService {
  private readonly bff = inject(BffClientService);

  /**
   * Get the tenant's topic tree.
   * GET /api/v1/topics -> { data: TopicNodeDTO[] } (flat) -> nested tree.
   */
  getTopicTree(): Observable<TopicNode[]> {
    return this.bff.get<{ data: TopicNodeDTO[] }>(TOPICS_PATH).pipe(
      map((res) => buildTopicTree(res.data ?? [])),
    );
  }

  /**
   * Create a new topic node.
   * POST /api/v1/topics -> 201 TopicNodeDTO
   */
  createTopic(request: CreateTopicRequest): Observable<TopicNodeDTO> {
    return this.bff.post<TopicNodeDTO>(TOPICS_PATH, request);
  }

  /**
   * Update a topic node (rename / reorder).
   * PUT /api/v1/topics/{id} -> 200 TopicNodeDTO
   */
  updateTopic(id: string, request: UpdateTopicRequest): Observable<TopicNodeDTO> {
    return this.bff.put<TopicNodeDTO>(`${TOPICS_PATH}/${encodeURIComponent(id)}`, request);
  }

  /**
   * Soft-delete a topic node (refused server-side if it still has children).
   * DELETE /api/v1/topics/{id} -> 204
   */
  deleteTopic(id: string): Observable<void> {
    return this.bff.delete<void>(`${TOPICS_PATH}/${encodeURIComponent(id)}`);
  }

  /**
   * Reparent a topic node (cycle-guarded server-side).
   * POST /api/v1/topics/{id}/move with body { parent_id } -> 200 TopicNodeDTO
   */
  moveTopic(id: string, request: MoveTopicRequest): Observable<TopicNodeDTO> {
    return this.bff.post<TopicNodeDTO>(
      `${TOPICS_PATH}/${encodeURIComponent(id)}/move`,
      request,
    );
  }

  /**
   * Attach an atom to a topic node (atom-centric — the atom is referenced by
   * UUID, never owned).
   * POST /api/v1/topics/{topicId}/atoms with body { atom_id }.
   */
  assignAtomToTopic(topicId: string, atomId: string): Observable<void> {
    return this.bff.post<void>(
      `${TOPICS_PATH}/${encodeURIComponent(topicId)}/atoms`,
      { atom_id: atomId },
    );
  }
}
