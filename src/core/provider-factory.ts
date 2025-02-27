/**
 * Factory for creating LLM providers
 */

import { ProviderType, LLMProviderInterface } from './provider-interface';
import { AnthropicProvider, AnthropicProviderConfig } from './llm-provider';
import { OpenAIProvider, OpenAIProviderConfig } from './openai-provider';

/**
 * Combined provider configuration type
 */
export type ProviderConfig = 
  | ({ type: ProviderType.ANTHROPIC } & AnthropicProviderConfig)
  | ({ type: ProviderType.OPENAI } & OpenAIProviderConfig);

/**
 * Default models for each provider
 */
const DEFAULT_MODELS = {
  [ProviderType.ANTHROPIC]: 'claude-3-5-sonnet-20240620',
  [ProviderType.OPENAI]: 'gpt-4o-mini'
};

/**
 * Factory for creating LLM providers
 */
export class ProviderFactory {
  /**
   * Creates an LLM provider based on configuration
   * 
   * @param config - Provider configuration
   * @returns The created provider
   */
  static createProvider(config: ProviderConfig): LLMProviderInterface {
    switch (config.type) {
      case ProviderType.ANTHROPIC:
        return new AnthropicProvider({
          model: config.model || DEFAULT_MODELS[ProviderType.ANTHROPIC],
          apiKey: config.apiKey,
          maxRetries: config.maxRetries
        });
        
      case ProviderType.OPENAI:
        return new OpenAIProvider({
          model: config.model || DEFAULT_MODELS[ProviderType.OPENAI],
          apiKey: config.apiKey,
          maxRetries: config.maxRetries,
          organization: config.organization
        });
        
      default:
        throw new Error(`Unsupported provider type: ${(config as any).type}`);
    }
  }
  
  /**
   * Creates a provider based on available API keys
   * 
   * @returns The created provider
   */
  static createDefaultProvider(): LLMProviderInterface {
    // Check for Anthropic API key
    if (process.env.ANTHROPIC_API_KEY) {
      return this.createProvider({
        type: ProviderType.ANTHROPIC,
        model: process.env.DEFAULT_ANTHROPIC_MODEL || DEFAULT_MODELS[ProviderType.ANTHROPIC]
      });
    }
    
    // Check for OpenAI API key
    if (process.env.OPENAI_API_KEY) {
      return this.createProvider({
        type: ProviderType.OPENAI,
        model: process.env.DEFAULT_OPENAI_MODEL || DEFAULT_MODELS[ProviderType.OPENAI]
      });
    }
    
    // No API keys available
    throw new Error('No API keys found. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variables.');
  }
}