import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '../types';
import { logger } from '../utils/logger';

const CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Claude API call timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

export class ClaudeService {
  private client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  // Returns the text of Claude's response. No tools — used for strategy/reasoning steps.
  async call(prompt: string): Promise<string> {
    logger.info('Calling Claude API', { model: this.model, maxTokens: this.maxTokens });
    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
        CALL_TIMEOUT_MS,
      );
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      logger.info('Claude API call completed', { stopReason: response.stop_reason });
      return text;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  // Calls Claude with tools (function calling). Returns full message response.
  async callWithTools(
    prompt: string,
    tools: Tool[],
  ): Promise<Anthropic.Message> {
    logger.info('Calling Claude API with tools', {
      model: this.model,
      maxTokens: this.maxTokens,
      toolCount: tools.length,
    });
    try {
      const response = await withTimeout(
        this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          tools: tools as Anthropic.Tool[],
          messages: [{ role: 'user', content: prompt }],
        }),
        CALL_TIMEOUT_MS,
      );
      logger.info('Claude API call completed', {
        stopReason: response.stop_reason,
        contentBlocks: response.content.length,
      });
      return response;
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  private handleError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('rate_limit') || message.includes('529')) {
      logger.error('Claude API rate limited — back off before retrying', { error: message });
    } else if (message.includes('timed out')) {
      logger.error('Claude API call timed out after 60s');
    } else if (message.includes('401') || message.includes('authentication')) {
      logger.error('Claude API authentication failed — check CLAUDE_API_KEY');
    } else {
      logger.error('Claude API error', { error: message });
    }
  }
}