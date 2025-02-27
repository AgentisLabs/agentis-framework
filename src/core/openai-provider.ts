/**
 * OpenAI LLM provider for the Agentis framework
 */

import OpenAI from 'openai';
import { Message } from './types';
import { GenerateOptions, GenerateResult, ToolCall, LLMProviderInterface } from './provider-interface';
import { Logger } from '../utils/logger';

/**
 * Configuration for the OpenAI provider
 */
export interface OpenAIProviderConfig {
  model: string;
  apiKey?: string;
  maxRetries?: number;
  organization?: string;
}

/**
 * Provider for interacting with OpenAI models
 */
export class OpenAIProvider implements LLMProviderInterface {
  private client: OpenAI;
  private config: OpenAIProviderConfig;
  private logger: Logger;
  
  /**
   * Creates a new OpenAI provider instance
   * 
   * @param config - Configuration for the provider
   */
  constructor(config: OpenAIProviderConfig) {
    this.config = {
      maxRetries: 3,
      ...config
    };
    
    // Make sure we have the API key from environment if not provided in config
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set it in the OPENAI_API_KEY environment variable or pass it to the constructor.');
    }
    
    this.client = new OpenAI({
      apiKey: apiKey,
      organization: config.organization
    });
    
    this.logger = new Logger('OpenAIProvider');
  }
  
  /**
   * Generates a response from the OpenAI LLM
   * 
   * @param options - Generation options
   * @returns Promise resolving to the generation result
   */
  async generateResponse(options: GenerateOptions): Promise<GenerateResult> {
    // Convert our message format to OpenAI's format
    const messages = options.messages.map((msg: Message) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    }));
    
    // Map our tools to OpenAI's tool format
    let tools;
    if (options.tools && options.tools.length > 0) {
      tools = options.tools.map((tool: any) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.schema
        }
      }));
    }
    
    try {
      // Prepare common message parameters
      const messageParams: any = {
        model: this.config.model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stop: options.stopSequences,
        top_p: options.topP,
        tools: tools
      };
      
      // If tools are provided, set appropriate tool_choice
      if (tools && tools.length > 0) {
        // Force the model to use a tool to encourage tool usage
        if (tools.length === 1) {
          // If there's only one tool, force it to use that specific tool
          messageParams.tool_choice = {
            type: "function",
            function: { name: tools[0].function.name }
          };
          this.logger.debug(`Forcing tool_choice to use: ${tools[0].function.name}`);
        } else {
          // If multiple tools, set to auto
          messageParams.tool_choice = "auto";
          this.logger.debug('Enabling tool_choice: auto with tools:', tools.map((t: any) => t.function.name));
        }
      }
      
      // If streaming is requested and a callback is provided
      if (options.stream && options.onPartialResponse) {
        return await this.streamResponse(messageParams, options.onPartialResponse);
      } else {
        // Non-streaming mode
        const response = await this.client.chat.completions.create(messageParams);
        return this.processResponse(response);
      }
    } catch (error) {
      this.logger.error('Error generating response from OpenAI:', error);
      throw error;
    }
  }
  
  /**
   * Streams a response from the OpenAI LLM
   * 
   * @param messageParams - Parameters for the OpenAI API call
   * @param onPartialResponse - Callback function for partial responses
   * @returns Promise resolving to the complete generation result
   */
  private async streamResponse(
    messageParams: any, 
    onPartialResponse: (text: string, done: boolean) => void
  ): Promise<GenerateResult> {
    // Initialize containers for aggregating results
    let accumulatedText = '';
    let toolCalls: ToolCall[] = [];
    let tokens = {
      input: 0,
      output: 0,
      total: 0
    };
    
    let toolCallJson = '';
    let isCollectingToolCall = false;
    let currentToolCall: any = null;
    
    // Create a streaming request
    const stream = await this.client.chat.completions.create({
      ...messageParams,
      stream: true
    });
    
    // Process each chunk
    // @ts-ignore - The stream is iterable but TS doesn't recognize it
    for await (const chunk of stream) {
      // Update token count if available
      if (chunk.usage) {
        tokens = {
          input: chunk.usage.prompt_tokens,
          output: chunk.usage.completion_tokens,
          total: chunk.usage.total_tokens
        };
      }
      
      // Process delta content if available
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        accumulatedText += delta.content;
        onPartialResponse(accumulatedText, false);
      }
      
      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          // If this is the start of a new tool call
          if (toolCallDelta.index !== undefined && !currentToolCall) {
            currentToolCall = {
              index: toolCallDelta.index,
              id: toolCallDelta.id || '',
              type: toolCallDelta.type || 'function',
              function: {
                name: '',
                arguments: ''
              }
            };
            isCollectingToolCall = true;
          }
          
          // Update the function name if available
          if (toolCallDelta.function?.name) {
            currentToolCall.function.name += toolCallDelta.function.name;
          }
          
          // Update the function arguments if available
          if (toolCallDelta.function?.arguments) {
            currentToolCall.function.arguments += toolCallDelta.function.arguments;
          }
          
          // If we have a complete tool call, process it
          if (isCollectingToolCall && chunk.choices[0]?.finish_reason === 'tool_calls') {
            try {
              const args = JSON.parse(currentToolCall.function.arguments);
              toolCalls.push({
                name: currentToolCall.function.name,
                parameters: args
              });
            } catch (error) {
              this.logger.error('Error parsing tool call arguments:', error);
            }
            
            isCollectingToolCall = false;
            currentToolCall = null;
          }
        }
      }
    }
    
    // Signal completion
    onPartialResponse(accumulatedText, true);
    
    // Return the complete response
    return {
      message: accumulatedText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokens
    };
  }
  
  /**
   * Processes a complete response from the OpenAI LLM
   * 
   * @param response - The response from OpenAI
   * @returns The processed generation result
   */
  private processResponse(response: any): GenerateResult {
    // Extract the text content
    const message = response.choices[0]?.message?.content || '';
    
    // Log full response for debugging
    this.logger.debug('OpenAI response:', JSON.stringify({
      model: response.model,
      finish_reason: response.choices[0]?.finish_reason,
      has_tool_calls: !!response.choices[0]?.message?.tool_calls,
      tool_calls_count: response.choices[0]?.message?.tool_calls?.length || 0
    }));
    
    // Process tool calls if any
    const toolCalls: ToolCall[] = [];
    
    if (response.choices[0]?.message?.tool_calls) {
      this.logger.debug('Tool calls found in response:', response.choices[0].message.tool_calls.length);
      
      for (const toolCall of response.choices[0].message.tool_calls) {
        if (toolCall.type === 'function') {
          try {
            this.logger.debug(`Processing tool call: ${toolCall.function.name}`);
            const args = JSON.parse(toolCall.function.arguments);
            toolCalls.push({
              name: toolCall.function.name,
              parameters: args
            });
          } catch (error) {
            this.logger.error('Error parsing tool call arguments:', error);
          }
        }
      }
    } else {
      this.logger.debug('No tool calls in response');
    }
    
    // Extract token usage
    const tokens = response.usage ? {
      input: response.usage.prompt_tokens,
      output: response.usage.completion_tokens,
      total: response.usage.total_tokens
    } : {
      input: 0,
      output: 0,
      total: 0
    };
    
    return {
      message,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokens
    };
  }
  
  /**
   * Updates the provider configuration
   * 
   * @param config - New configuration options
   */
  updateConfig(config: Partial<OpenAIProviderConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    
    // If API key changed, recreate the client
    if (config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        organization: config.organization || this.config.organization
      });
    }
  }
}