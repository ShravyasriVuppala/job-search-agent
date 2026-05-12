import { ResumeMetadata } from '../types';

export interface AgentContext {
  resume?: {
    redactedText: string;
    hash: string;
    metadata: ResumeMetadata;
  };
}

export const agentContext: AgentContext = {};