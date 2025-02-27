import Anthropic from '@anthropic-ai/sdk';
import { Message } from './types';
import { 
  GenerateOptions, 
  GenerateResult, 
  ToolCall, 
  LLMProviderInterface 
} from './provider-interface';

/**
 * Configuration for the Anthropic provider
 */
export interface AnthropicProviderConfig {
  model: string;
  apiKey?: string;
  maxRetries?: number;
}

/**
 * Provider for interacting with Anthropic's Claude LLMs
 */
export class AnthropicProvider implements LLMProviderInterface {
  private client: Anthropic;
  private config: AnthropicProviderConfig;
  
  /**
   * Creates a new Anthropic provider instance
   * 
   * @param config - Configuration for the provider
   */
  constructor(config: AnthropicProviderConfig) {
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
      
      // Add type property to match Anthropic's expected format
      tools = tools.map(tool => ({
        ...tool,
        input_schema: {
          ...tool.input_schema,
          type: tool.input_schema.type || 'object'
        }
      }));
    }
    
    try {
      // Prepare common message parameters
      const messageParams: any = {
        model: this.config.model,
        messages,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature || 0.7,
        system: systemMessage,
        tools: tools,
        stop_sequences: options.stopSequences,
        top_p: options.topP || 0.9,
      };
      
      // If streaming is requested and a callback is provided
      if (options.stream && options.onPartialResponse) {
        return await this.streamResponse(messageParams, options.onPartialResponse);
      } else {
        // Non-streaming mode
        const response = await this.client.messages.create(messageParams);
        return this.processResponse(response);
      }
    } catch (error) {
      console.error('Error generating response from LLM:', error);
      throw error;
    }
  }
  
  /**
   * Streams a response from the LLM
   * 
   * @param messageParams - Parameters for the Anthropic API call
   * @param onPartialResponse - Callback function for partial responses
   * @returns Promise resolving to the complete generation result
   */
  private async streamResponse(
    messageParams: any, 
    onPartialResponse: (text: string, done: boolean) => void
  ): Promise<GenerateResult> {
    // Initialize containers for aggregating results
    let fullContent: any[] = [];
    let accumulatedText = '';
    let toolCalls: ToolCall[] = [];
    let tokens = {
      input: 0,
      output: 0,
      total: 0
    };
    
    // Create a streaming request
    const stream = await this.client.messages.create({
      ...messageParams,
      stream: true
    });
    
    // Process each chunk
    // @ts-ignore - The stream is iterable but TS doesn't recognize it
    for await (const chunk of stream) {
      // Update token counts
      if (chunk.usage) {
        tokens = {
          input: chunk.usage.input_tokens,
          output: chunk.usage.output_tokens,
          total: chunk.usage.input_tokens + chunk.usage.output_tokens
        };
      }
      
      // Only process content if it exists in this chunk
      if (chunk.delta?.content) {
        for (const contentPart of chunk.delta.content) {
          fullContent.push(contentPart);
          
          // Handle different content types
          if (contentPart.type === 'text') {
            accumulatedText += contentPart.text;
            onPartialResponse(accumulatedText, false);
          } else if (contentPart.type === 'tool_use') {
            // Record tool use but don't stream it
            toolCalls.push({
              name: contentPart.name,
              parameters: contentPart.input,
              // Result will be filled in later when tools are executed
            });
          }
        }
      }
    }
    
    // Signal completion
    onPartialResponse(accumulatedText, true);
    
    // Return the complete response in the same format as non-streaming
    return {
      message: accumulatedText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokens
    };
  }
  
  /**
   * Processes a complete response from the LLM
   * 
   * @param response - The response from Anthropic
   * @returns The processed generation result
   */
  private processResponse(response: any): GenerateResult {
    // Process tool calls if any
    const toolCalls = [];
    
    // Check for tool_use type blocks
    for (const item of response.content) {
      if (item.type === 'tool_use') {
        try {
          const toolUse = item as any;
          toolCalls.push({
            name: toolUse.name,
            parameters: toolUse.input,
            // We'll fill in results later when tools are executed
          });
        } catch (error) {
          console.error('Error parsing tool call:', error);
        }
      }
    }
    
    // Extract the text content
    const textBlocks = response.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text);
    
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
  }
  
  /**
   * Updates the provider configuration
   * 
   * @param config - New configuration options
   */
  updateConfig(config: Partial<AnthropicProviderConfig>): void {
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