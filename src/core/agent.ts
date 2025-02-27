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
import { LLMProvider } from './llm-provider';
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
  memory?: MemoryInterface;
  provider: LLMProvider;
  planner?: PlannerInterface;
  logger: Logger;

  /**
   * Creates a new Agent instance
   * 
   * @param config - Configuration options for the agent
   * @param provider - Optional LLM provider (defaults to Anthropic)
   */
  constructor(config: AgentConfig, provider?: LLMProvider) {
    super();
    this.id = uuidv4();
    this.config = {
      ...config,
      systemPrompt: config.systemPrompt || this.generateDefaultSystemPrompt(config)
    };
    
    // We'll implement the actual provider later
    this.provider = provider || new LLMProvider({
      model: config.model || process.env.DEFAULT_MODEL || "claude-3-5-sonnet-20240620"
    });
    
    this.logger = new Logger(`Agent:${config.name}`);
  }

  /**
   * Sets the memory system for the agent
   * 
   * @param memory - The memory implementation to use
   * @returns The agent instance (for chaining)
   */
  setMemory(memory: MemoryInterface): Agent {
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
    if (this.shouldUsePlanner(options.task) && this.planner) {
      this.emit(AgentEvent.THINKING, { message: 'Planning approach...' });
      const plan = await this.planner.createPlan(options.task, this);
      this.emit(AgentEvent.PLAN_CREATED, { plan });
      
      // Execute the plan (this will be implemented in PlannerInterface implementations)
      return await this.planner.executePlan(plan, this, options);
    }

    // Retrieve relevant memories if memory is enabled
    let context = '';
    if (this.memory) {
      const memories = await this.memory.retrieve(options.task);
      if (memories.length > 0) {
        context = `Relevant information from your memory:\n${memories.join('\n')}`;
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
    const result = await this.provider.generateResponse({
      messages: conversation.messages,
      tools: options.tools || [],
      maxTokens: options.maxTokens,
      temperature: options.temperature
    });
    
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
      await this.memory.store({
        input: userMessage.content,
        output: assistantMessage.content,
        timestamp: Date.now()
      });
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
            const result = await tool.execute(tc.parameters);
            
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
        const followUpResult = await this.provider.generateResponse({
          messages: conversation.messages,
          tools: options.tools || [],
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