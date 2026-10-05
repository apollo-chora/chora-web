/**
 * Agent-trace data model — front-end manifestation of IMDA D2 Transparency
 * (per ADR-141). Models the prompt-level QGen pipeline on `/a/atoms/new`.
 *
 * Scope marker: prompt-level / per-question QGen ONLY. Batch QGen
 * (file-upload Validator-Agent → MRC/OCR/Visual/Content Safety/RAG Ingestion)
 * lives in chora-creation's upload flow and is NOT modelled here.
 *
 * Mock data shape mirrors the chaos-session backend event envelope so the
 * service body can swap to a real BFF SSE/WebSocket subscription without
 * template or component changes.
 */

export type PipelineGroup =
  | 'classification-pipeline'
  | 'qa-generation'
  | 'quality-validation'
  | 'illustration';

export type TerminalSignalStatus =
  | 'PROCEED'
  | 'PROCEED_WITH_WARNINGS'
  | 'TERMINATE';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info';

export type ToolBadgeVariant = 'tool-call' | 'autonomous' | 'parallel-agentic';

export interface ToolBadge {
  readonly text: string;
  readonly variant: ToolBadgeVariant;
  readonly icon: string;
}

export interface ModelMeta {
  readonly abbr: string;
  readonly color: string;
  readonly description: string;
}

export interface TerminalSignal {
  readonly status: TerminalSignalStatus;
  readonly reasonCode: string;
  readonly message: string;
}

export interface AgentTraceEvent {
  readonly eventId: string;
  readonly workflowId: string;
  readonly agentName: string;
  readonly phase: string;
  readonly eventType: string;
  readonly summary: string;
  /** ISO8601 timestamp (display format derived in the template). */
  readonly timestamp: string;
  readonly icon: string;
  readonly accentColor: string;
  readonly badgeText?: string;
  readonly badgeVariant?: BadgeVariant;
  /** 1-based stage number within the pipeline group. */
  readonly stage: number;
  readonly pipelineGroup: PipelineGroup;
  readonly modelId?: string;
  /** Status of this individual event ('in_flight' renders the pulse). */
  readonly status: 'in_flight' | 'completed' | 'failed';
}

export interface AgentDecision {
  readonly decisionId: string;
  readonly agentName: string;
  readonly decisionType: string;
  readonly modelId: string;
  readonly confidenceScore: number;
  readonly promptVersion: string;
  readonly reasoningSteps: readonly { readonly step: number; readonly action: string }[];
  readonly groundingSources?: readonly { readonly uri: string; readonly chunkId: string }[];
}

export interface AgentTraceGroup {
  readonly pipelineGroup: PipelineGroup;
  readonly agentLabel: string;
  readonly pipelineLabel: string;
  readonly accentColor: string;
  readonly icon: string;
  readonly events: readonly AgentTraceEvent[];
  readonly terminalSignal?: TerminalSignal;
  /** Aggregated state: 'in_flight' if any event still running. */
  readonly status: 'in_flight' | 'completed' | 'failed';
}

export interface AgentTraceWorkflow {
  readonly workflowId: string;
  readonly groups: readonly AgentTraceGroup[];
  readonly status: 'idle' | 'in_flight' | 'completed' | 'failed';
  readonly startedAt?: string;
}
