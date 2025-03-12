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
import * as crypto from 'crypto';

/**
 * Import MCP types (forward declaration to avoid circular dependencies)
 */
type MCPServer = any;

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
  mcpServers: MCPServer[] = [];

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
   * Adds an MCP server to the agent
   * 
   * @param server - The MCP server to add
   * @returns The agent instance (for chaining)
   */
  addMCPServer(server: MCPServer): Agent {
    this.mcpServers.push(server);
    this.logger.debug(`Added MCP server: ${server.name}`);
    return this;
  }
  
  /**
   * Removes an MCP server from the agent
   * 
   * @param serverId - ID of the server to remove
   * @returns The agent instance (for chaining)
   */
  removeMCPServer(serverId: string): Agent {
    const index = this.mcpServers.findIndex(s => s.id === serverId);
    if (index !== -1) {
      const server = this.mcpServers[index];
      this.mcpServers.splice(index, 1);
      this.logger.debug(`Removed MCP server: ${server.name}`);
    }
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
    
    // Check if we should use MCP servers and if we have any connected
    const useMcpServers = options.useMcpServers && this.mcpServers.length > 0;
    if (options.useMcpServers && this.mcpServers.length === 0) {
      this.logger.warn('useMcpServers flag set, but no MCP servers are connected. Falling back to standard tools.');
    }
    
    // Create or use provided conversation
    const conversation = options.conversation || {
      id: crypto.randomUUID(),
      messages: [],
      created: Date.now(),
      updated: Date.now(),
      metadata: {}
    };
    
    // Store context in conversation metadata if provided
    if (options.context) {
      conversation.metadata = {
        ...conversation.metadata,
        context: options.context
      };
    }

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
    
    // Retrieve relevant information from knowledge base if available
    let knowledgeBaseContext = '';
    if (this.config.knowledgeBase && options.task) {
      try {
        this.logger.debug('Querying knowledge base for relevant information');
        this.emit(AgentEvent.THINKING, { message: 'Retrieving relevant information from knowledge base...' });
        
        knowledgeBaseContext = await this.config.knowledgeBase.generateContext(options.task, {
          maxResults: this.config.knowledgeBaseMaxResults || 3,
          relevanceThreshold: this.config.knowledgeBaseThreshold || 0.6,
          format: 'markdown'
        });
        
        if (knowledgeBaseContext) {
          this.logger.debug('Retrieved relevant information from knowledge base');
          if (context) {
            context += '\n\n';
          }
          context += knowledgeBaseContext;
        } else {
          this.logger.debug('No relevant information found in knowledge base');
        }
      } catch (error) {
        this.logger.error('Error retrieving knowledge base context', error);
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
    
    // Prepare tools and MCP tools based on options
    let allTools: any[] = options.tools || [];
    let mcpToolsById: Map<string, {server: MCPServer, tool: any}> = new Map();
    
    // If MCP is enabled, add MCP tools
    if (useMcpServers) {
      this.logger.debug(`Using tools from ${this.mcpServers.length} MCP servers`);
      
      // Collect MCP tools from all servers
      for (const server of this.mcpServers) {
        // Skip if server is not connected or has no tools
        if (!server.tools || server.tools.length === 0) {
          this.logger.debug(`MCP server ${server.name} has no tools or is not connected`);
          continue;
        }
        
        this.logger.debug(`Adding ${server.tools.length} tools from MCP server: ${server.name}`);
        
        // Map tools to their source server for later use
        for (const tool of server.tools) {
          mcpToolsById.set(tool.name, {server, tool});
        }
        
        // Add tools to the list of all tools
        allTools = allTools.concat(server.tools);
      }
    }
    
    // Log tools being passed to the model (for debugging)
    if (allTools.length > 0) {
      this.logger.debug('Passing tools to model:', allTools.map(t => t.name));
      this.emit(AgentEvent.THINKING, { 
        message: `Available tools: ${allTools.map(t => t.name).join(', ')}` 
      });
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
      tools: allTools,
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
      
      // Get the standard tools mapped by name for easy lookup
      const standardToolsMap = new Map();
      (options.tools || []).forEach(tool => {
        standardToolsMap.set(tool.name, tool);
      });
      
      // Execute each tool call
      const executedToolCalls = await Promise.all(
        result.toolCalls.map(async (tc) => {
          // Check if it's an MCP tool
          const mcpToolInfo = mcpToolsById.get(tc.name);
          
          if (mcpToolInfo) {
            // Handle MCP tool call
            try {
              const { server } = mcpToolInfo;
              
              this.emit(AgentEvent.TOOL_CALL, { 
                tool: tc.name, 
                params: tc.parameters,
                type: 'mcp'
              });
              
              this.logger.debug(`Executing MCP tool: ${tc.name} on server: ${server.name}`, tc.parameters);
              this.emit(AgentEvent.THINKING, { 
                message: `Executing MCP tool: ${tc.name} with parameters: ${JSON.stringify(tc.parameters)}` 
              });
              
              const result = await server.callTool({
                name: tc.name,
                arguments: tc.parameters
              });
              
              // Format MCP result - match working example approach
              let formattedResult = '';
              
              if (typeof result.content === 'string') {
                formattedResult = result.content;
              } else if (Array.isArray(result.content)) {
                // MCP often returns content as an array of objects with type and text
                formattedResult = result.content.map((item: any) => {
                  if (item.type === 'text') {
                    return item.text;
                  }
                  return '';
                }).join('\n');
              } else {
                formattedResult = JSON.stringify(result.content);
              }
              
              this.logger.debug(`MCP tool execution result:`, formattedResult);
              
              return {
                tool: tc.name,
                params: tc.parameters,
                result: formattedResult 
              };
            } catch (error) {
              this.logger.error(`Error executing MCP tool ${tc.name}`, error);
              return {
                tool: tc.name,
                params: tc.parameters,
                result: { error: error instanceof Error ? error.message : String(error) }
              };
            }
          } else {
            // Handle standard tool call
            const tool = standardToolsMap.get(tc.name);
            
            if (!tool) {
              this.logger.warn(`Tool not found: ${tc.name}`);
              return {
                tool: tc.name,
                params: tc.parameters,
                result: { error: `Tool not found: ${tc.name}` }
              };
            }
            
            try {
              // Execute the standard tool
              this.emit(AgentEvent.TOOL_CALL, { 
                tool: tc.name, 
                params: tc.parameters,
                type: 'standard'
              });
              
              this.logger.debug(`Executing standard tool: ${tc.name}`, tc.parameters);
              this.emit(AgentEvent.THINKING, { 
                message: `Executing tool: ${tc.name} with parameters: ${JSON.stringify(tc.parameters)}` 
              });
              
              const result = await tool.execute(tc.parameters);
              this.logger.debug(`Tool execution result:`, result);
              this.emit(AgentEvent.THINKING, { 
                message: `Tool returned results (first result): ${result.results ? result.results[0]?.title : 'No results'}` 
              });
              
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
          }
        })
      );
      
      toolCalls = executedToolCalls;
      
      // If we have tool calls, send their results back to the LLM
      if (toolCalls.length > 0) {
        // Add each tool result as a separate message - this better matches the working example
        for (const toolCall of toolCalls) {
          let content = '';
          
          if (typeof toolCall.result === 'string') {
            // If result is a string (like from MCP tools), use it directly
            content = toolCall.result;
          } else {
            // Otherwise format as JSON (like for standard tools)
            content = `Tool results:\n${JSON.stringify(toolCall.result, null, 2)}`;
          }
          
          const toolResultsMessage: Message = {
            role: 'user',
            content: content,
            timestamp: Date.now()
          };
          
          conversation.messages.push(toolResultsMessage);
        }
        
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