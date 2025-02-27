import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  AgentConfig, 
  AgentRole, 
  AgentEvent, 
  Message, 
  Conversation, 
  RunOptions, 
  RunResult,
  Tool
} from './types';
import { MemoryInterface } from '../memory/memory-interface';
import { EnhancedMemoryInterface } from '../memory/enhanced-memory-interface';
import { LLMProviderInterface } from './provider-interface';
import { ProviderFactory, ProviderConfig } from './provider-factory';
import { PlannerInterface } from '../planning/planner-interface';
import { DefaultPlanner } from '../planning/default-planner';
import { createSystemPrompt } from '../utils/prompt-utils';
import { Logger } from '../utils/logger';

/**
 * Core Agent class that serves as the foundation for AI agents in the framework
 */
export class Agent extends EventEmitter {
  id: string;
  config: AgentConfig;
  memory?: MemoryInterface | EnhancedMemoryInterface;
  provider: LLMProviderInterface;
  planner?: PlannerInterface;
  logger: Logger;

  /**
   * Creates a new Agent instance
   * 
   * @param config - Configuration options for the agent
   * @param provider - Optional LLM provider (uses ProviderFactory default if not provided)
   * @param providerConfig - Optional provider configuration (if provider not directly provided)
   */
  constructor(
    config: AgentConfig, 
    provider?: LLMProviderInterface,
    providerConfig?: ProviderConfig
  ) {
    super();
    this.id = uuidv4();
    this.config = {
      ...config,
      systemPrompt: config.systemPrompt || this.generateDefaultSystemPrompt(config)
    };
    
    // Use provided provider, or create one from config, or create default
    if (provider) {
      this.provider = provider;
    } else if (providerConfig) {
      this.provider = ProviderFactory.createProvider(providerConfig);
    } else {
      try {
        this.provider = ProviderFactory.createDefaultProvider();
      } catch (error) {
        throw new Error(`Failed to create default provider: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    this.logger = new Logger(`Agent:${config.name}`);
  }

  /**
   * Sets the memory system for the agent
   * 
   * @param memory - The memory implementation to use
   * @returns The agent instance (for chaining)
   */
  setMemory(memory: MemoryInterface | EnhancedMemoryInterface): Agent {
    this.memory = memory;
    return this;
  }

  /**
   * Sets the planner for breaking down complex tasks
   * 
   * @param planner - The planner implementation to use
   * @returns The agent instance (for chaining)
   */
  setPlanner(planner: PlannerInterface): Agent {
    this.planner = planner;
    return this;
  }

  /**
   * Runs the agent with a specific task
   * 
   * @param options - Execution options including the task to perform
   * @returns Promise resolving to the execution result
   */
  async run(options: RunOptions): Promise<RunResult> {
    this.logger.debug('Running agent', { task: options.task });
    
    // Create or use provided conversation
    const conversation = options.conversation || {
      id: uuidv4(),
      messages: [],
      created: Date.now(),
      updated: Date.now()
    };

    // Add system prompt if conversation is new
    if (conversation.messages.length === 0) {
      conversation.messages.push({
        role: 'system',
        content: this.config.systemPrompt || '',
        timestamp: Date.now()
      });
    }

    // Check if task needs planning
    // Skip planning when options._skipPlanning is true to prevent infinite recursion
    if (this.shouldUsePlanner(options.task) && this.planner && !(options as any)._skipPlanning) {
      this.emit(AgentEvent.THINKING, { message: 'Planning approach...' });
      
      try {
        // Add _skipPlanning flag to prevent recursion when planner calls agent.run()
        const plan = await this.planner.createPlan(options.task, this, {
          _skipPlanning: true
        } as any);
        
        this.emit(AgentEvent.PLAN_CREATED, { plan });
        
        // Execute the plan with _skipPlanning flag
        const planOptions = {
          ...options,
          _skipPlanning: true
        };
        return await this.planner.executePlan(plan, this, planOptions);
      } catch (error) {
        this.logger.error('Planning failed', error);
        // Fall back to direct execution
      }
    }

    // Retrieve relevant memories if memory is enabled
    let context = '';
    if (this.memory) {
      // Handle different memory interface types
      if ('retrieve' in this.memory) {
        // Basic memory interface
        const memories = await this.memory.retrieve(options.task);
        if (Array.isArray(memories) && memories.length > 0) {
          context = `Relevant information from your memory:\n${memories.join('\n')}`;
        }
      } else {
        // Enhanced memory interface
        const memoryResult = await (this.memory as EnhancedMemoryInterface).retrieve(options.task);
        
        // Format short-term memories
        if (memoryResult.shortTerm.length > 0) {
          context += `Recent memories:\n${memoryResult.shortTerm.map(m => 
            `- Q: ${m.input}\n  A: ${m.output}`
          ).join('\n')}\n\n`;
        }
        
        // Format long-term memories
        if (memoryResult.longTerm.length > 0) {
          context += `Long-term memories:\n${memoryResult.longTerm.map(m => 
            `- Q: ${m.input}\n  A: ${m.output}`
          ).join('\n')}\n\n`;
        }
        
        // Format notes
        if (memoryResult.notes.length > 0) {
          context += `Notes:\n${memoryResult.notes.map(n => 
            `- ${n.title}: ${n.content}`
          ).join('\n')}\n\n`;
        }
      }
    }

    // Add user message with context if available
    const userMessage: Message = {
      role: 'user',
      content: context ? `${context}\n\n${options.task}` : options.task,
      timestamp: Date.now()
    };
    
    conversation.messages.push(userMessage);
    
    // Call the LLM with available tools
    this.emit(AgentEvent.THINKING, { message: 'Processing...' });
    
    // Log tools being passed to the model (for debugging)
    if (options.tools && options.tools.length > 0) {
      this.logger.debug('Passing tools to model:', options.tools.map(t => t.name));
      this.emit(AgentEvent.THINKING, { message: `Available tools: ${options.tools.map(t => t.name).join(', ')}` });
    } else {
      this.logger.debug('No tools provided');
      this.emit(AgentEvent.THINKING, { message: 'No tools available' });
    }
    
    // Create a function to handle streaming responses
    const handleStream = (text: string, done: boolean) => {
      if (options.onStream) {
        options.onStream(text, done);
      }
      
      // Also emit a thinking event with partial response for any listeners
      if (!done) {
        this.emit(AgentEvent.THINKING, { message: `Generating: ${text.slice(-100)}...` });
      }
    };
    
    this.logger.debug('Calling provider.generateResponse with tools');
    
    const result = await this.provider.generateResponse({
      messages: conversation.messages,
      tools: options.tools || [],
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      stream: options.stream,
      onPartialResponse: options.stream ? handleStream : undefined
    });
    
    // Log if tool calls were returned
    if (result.toolCalls && result.toolCalls.length > 0) {
      this.logger.debug(`Received ${result.toolCalls.length} tool calls from model`);
      this.emit(AgentEvent.THINKING, { message: `Model requested ${result.toolCalls.length} tool calls` });
    } else {
      this.logger.debug('No tool calls received from model');
      this.emit(AgentEvent.THINKING, { message: 'Model did not request any tool calls' });
    }
    
    // Store the assistant's response
    const assistantMessage: Message = {
      role: 'assistant',
      content: result.message,
      timestamp: Date.now()
    };
    
    conversation.messages.push(assistantMessage);
    conversation.updated = Date.now();
    
    // Remember this interaction if memory is enabled
    if (this.memory) {
      if ('store' in this.memory) {
        // Basic memory interface
        await this.memory.store({
          input: userMessage.content,
          output: assistantMessage.content,
          timestamp: Date.now()
        });
      } else {
        // Enhanced memory interface
        await (this.memory as EnhancedMemoryInterface).storeShortTerm({
          input: userMessage.content,
          output: assistantMessage.content,
          timestamp: Date.now()
        });
      }
    }
    
    // Execute tool calls if any were made
    let toolCalls = undefined;
    
    if (result.toolCalls && result.toolCalls.length > 0) {
      this.logger.debug('Tool calls detected', { count: result.toolCalls.length });
      
      // Get the tools mapped by name for easy lookup
      const toolsMap = new Map();
      (options.tools || []).forEach(tool => {
        toolsMap.set(tool.name, tool);
      });
      
      // Execute each tool call
      const executedToolCalls = await Promise.all(
        result.toolCalls.map(async (tc) => {
          const tool = toolsMap.get(tc.name);
          
          if (!tool) {
            this.logger.warn(`Tool not found: ${tc.name}`);
            return {
              tool: tc.name,
              params: tc.parameters,
              result: { error: `Tool not found: ${tc.name}` }
            };
          }
          
          try {
            // Execute the tool
            this.emit(AgentEvent.TOOL_CALL, { 
              tool: tc.name, 
              params: tc.parameters 
            });
            
            this.logger.debug(`Executing tool: ${tc.name}`, tc.parameters);
            this.emit(AgentEvent.THINKING, { message: `Executing tool: ${tc.name} with parameters: ${JSON.stringify(tc.parameters)}` });
            
            const result = await tool.execute(tc.parameters);
            this.logger.debug(`Tool execution result:`, result);
            this.emit(AgentEvent.THINKING, { message: `Tool returned results (first result): ${result.results ? result.results[0]?.title : 'No results'}` });
            
            return {
              tool: tc.name,
              params: tc.parameters,
              result
            };
          } catch (error) {
            this.logger.error(`Error executing tool ${tc.name}`, error);
            return {
              tool: tc.name,
              params: tc.parameters,
              result: { error: error instanceof Error ? error.message : String(error) }
            };
          }
        })
      );
      
      toolCalls = executedToolCalls;
      
      // If we have tool calls, send their results back to the LLM
      if (toolCalls.length > 0) {
        const toolResultsMessage: Message = {
          role: 'user',
          content: `Tool results:\n${JSON.stringify(toolCalls, null, 2)}`,
          timestamp: Date.now()
        };
        
        conversation.messages.push(toolResultsMessage);
        
        // Call the LLM again with the tool results
        this.logger.debug('Sending tool results back to LLM for final response');
        this.emit(AgentEvent.THINKING, { message: 'Processing search results to generate response...' });
        
        const followUpResult = await this.provider.generateResponse({
          messages: conversation.messages,
          tools: [], // No tools needed for the follow-up response
          maxTokens: options.maxTokens,
          temperature: options.temperature
        });
        
        // Update the assistant's response
        const followUpMessage: Message = {
          role: 'assistant',
          content: followUpResult.message,
          timestamp: Date.now()
        };
        
        conversation.messages.push(followUpMessage);
        conversation.updated = Date.now();
        
        // Update the final result
        return {
          response: followUpMessage.content,
          conversation,
          toolCalls,
          tokens: result.tokens
        };
      }
    }
    
    this.emit(AgentEvent.TASK_COMPLETE, { 
      task: options.task, 
      response: result.message 
    });
    
    return {
      response: result.message,
      conversation,
      toolCalls,
      tokens: result.tokens
    };
  }
  
  /**
   * Heuristic to decide if a task is complex enough to require planning
   * 
   * @param task - The task to evaluate
   * @returns Boolean indicating if planning should be used
   */
  private shouldUsePlanner(task: string): boolean {
    // Simple heuristic - can be made more sophisticated
    return task.length > 100 || 
           task.includes('step by step') ||
           task.includes('complex') ||
           task.split('.').length > 3;
  }
  
  /**
   * Generates a default system prompt based on the agent's configuration
   * 
   * @param config - The agent configuration 
   * @returns A formatted system prompt
   */
  private generateDefaultSystemPrompt(config: AgentConfig): string {
    return createSystemPrompt(config);
  }
}