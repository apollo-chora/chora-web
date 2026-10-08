/**
 * Familiar chat models — chat messages, persona snapshots, memory entries.
 *
 * @see PLAN.md §3.43 (Familiar & Choraverse)
 * @see chora-contracts/openapi/consumption-companion-chat.yaml
 */

import type { Citation, FamiliarSpecies } from './familiar.model';

export interface ChatMessage {
  id: string;
  role: 'familiar' | 'learner';
  content: string;
  timestamp: string;
  citations: Citation[];
  is_streaming: boolean;
}

export interface ChatSession {
  id: string;
  familiar_id: string;
  started_at: string;
  message_count: number;
}

export interface PersonaSnapshot {
  archetype: FamiliarSpecies;
  level: number;
  stats: {
    curiosity: number;
    encouragement: number;
    humor: number;
    detail: number;
    formality: number;
  };
  current_skin_name: string | null;
}

export interface MemoryEntry {
  id: string;
  content: string;
  source: 'conversation' | 'learning_activity' | 'assessment';
  relevance_score: number;
  created_at: string;
}

export type ChatState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'streaming' }
  | { status: 'success' }
  | { status: 'error'; error: { code: string; message: string } };

export type PersonaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; persona: PersonaSnapshot }
  | { status: 'error'; error: { code: string; message: string } };

export type MemoryListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; entries: MemoryEntry[] }
  | { status: 'error'; error: { code: string; message: string } };
