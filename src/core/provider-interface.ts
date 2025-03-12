/**
 * LLM Provider interface for the Agentis framework
 */

import { Message } from './types';

/**
 * Tool call definition for the provider
 */
export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
  result?: any;
}

/**
 * Input for generating a response
 */
export interface GenerateOptions {
  messages: Message[];
  tools?: any[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  topP?: number;
  stream?: boolean;
  onPartialResponse?: (text: string, done: boolean) => void;
}

/**
 * Result from generating a response
 */
export interface GenerateResult {
  message: string;
  toolCalls?: ToolCall[];
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * LLM Provider type (currently supported)
 */
export enum ProviderType {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  MCP = 'mcp'
}

/**
 * Base interface for all LLM providers
 */
export interface LLMProviderInterface {
  /**
   * Generates a response from the LLM
   * 
   * @param options - Generation options
   * @returns Promise resolving to the generation result
   */
  generateResponse(options: GenerateOptions): Promise<GenerateResult>;
  
  /**
   * Updates the provider configuration
   * 
   * @param config - New configuration options
   */
  updateConfig(config: Record<string, any>): void;
}