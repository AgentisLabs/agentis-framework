import Anthropic from '@anthropic-ai/sdk';
import { Message } from './types';

/**
 * Configuration for the LLM provider
 */
export interface LLMProviderConfig {
  model: string;
  apiKey?: string;
  maxRetries?: number;
}

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
 * Provider for interacting with LLMs (primarily Anthropic's Claude)
 */
export class LLMProvider {
  private client: Anthropic;
  private config: LLMProviderConfig;
  
  /**
   * Creates a new LLM provider instance
   * 
   * @param config - Configuration for the provider
   */
  constructor(config: LLMProviderConfig) {
    this.config = {
      maxRetries: 3,
      ...config
    };
    
    // Make sure we have the API key from environment if not provided in config
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('Anthropic API key is required. Set it in the ANTHROPIC_API_KEY environment variable or pass it to the constructor.');
    }
    
    this.client = new Anthropic({
      apiKey: apiKey
    });
  }
  
  /**
   * Generates a response from the LLM
   * 
   * @param options - Generation options
   * @returns Promise resolving to the generation result
   */
  async generateResponse(options: GenerateOptions): Promise<GenerateResult> {
    // Map our message format to Anthropic's format
    // Note: Anthropic doesn't support system messages in messages array
    // We need to extract system messages and add them as system parameter
    const systemMessages = options.messages.filter(msg => msg.role === 'system');
    const nonSystemMessages = options.messages.filter(msg => msg.role !== 'system');
    
    // Get system message (use the last one if multiple exist)
    const systemMessage = systemMessages.length > 0 
      ? systemMessages[systemMessages.length - 1].content 
      : "You are a helpful AI assistant.";
    
    // Convert to Anthropic's message format
    const messages = nonSystemMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    
    // Map our tools to Anthropic's tool format
    let tools;
    if (options.tools && options.tools.length > 0) {
      tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.schema
      }));
    }
    
    try {
      // Make the API call to Anthropic
      const response = await this.client.messages.create({
        model: this.config.model,
        messages,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
        system: systemMessage,
        tools: tools,
        stop_sequences: options.stopSequences,
        top_p: options.topP || 0.9,
      });
      
      // Process tool calls if any
      const toolCalls = response.content
        .filter(item => item.type === 'tool_use')
        .map(item => ({
          name: (item as any).name,
          parameters: (item as any).input,
          // We'll fill in results later when tools are executed
        }));
      
      // Extract the text content
      const textBlocks = response.content
        .filter(item => item.type === 'text')
        .map(item => (item as any).text);
      
      const message = textBlocks.join('\n');
      
      return {
        message,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokens: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    } catch (error) {
      console.error('Error generating response from LLM:', error);
      throw error;
    }
  }
  
  /**
   * Updates the provider configuration
   * 
   * @param config - New configuration options
   */
  updateConfig(config: Partial<LLMProviderConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    
    // If API key changed, recreate the client
    if (config.apiKey) {
      this.client = new Anthropic({
        apiKey: config.apiKey
      });
    }
  }
}