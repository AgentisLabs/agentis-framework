import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Agent } from './agent';
import { RunOptions, RunResult, AgentEvent } from './types';
import { FeedbackSystem } from './feedback-system';
import { PlannerInterface, PlanningStrategy } from '../planning/planner-interface';
import { DefaultPlanner } from '../planning/default-planner';
import { Logger } from '../utils/logger';
import { createCollaborationPrompt } from '../utils/prompt-utils';

/**
 * Configuration for creating an agent swarm
 */
export interface AgentSwarmConfig {
  agents: Agent[];
  coordinator?: Agent;
  planningStrategy?: 'sequential' | 'parallel' | 'hierarchical'; // Use string literals instead of enum
  maxConcurrentAgents?: number;
  enableFeedback?: boolean;
}

/**
 * Task assignment for an agent in the swarm
 */
interface AgentTask {
  id: string;
  agentId: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

/**
 * Coordination plan for a swarm
 */
interface SwarmPlan {
  id: string;
  originalTask: string;
  tasks: AgentTask[];
  created: number;
  updated: number;
  status: 'created' | 'in_progress' | 'completed' | 'failed';
}

/**
 * AgentSwarm manages a group of agents that work together to accomplish tasks
 */
export class AgentSwarm extends EventEmitter {
  id: string;
  private agents: Map<string, Agent> = new Map();
  private coordinator: Agent;
  private planningStrategy: 'sequential' | 'parallel' | 'hierarchical';
  private maxConcurrentAgents: number;
  private logger: Logger;
  private feedbackSystem?: FeedbackSystem; // Optional, only initialized if feedback is enabled
  
  /**
   * Creates a new agent swarm
   * 
   * @param config - Configuration for the swarm
   */
  constructor(config: AgentSwarmConfig) {
    super();
    this.id = uuidv4();
    
    // Add all agents to the map
    config.agents.forEach(agent => {
      this.agents.set(agent.id, agent);
    });
    
    // Set up the feedback system if enabled
    if (config.enableFeedback) {
      this.feedbackSystem = new FeedbackSystem();
    }
    
    // Set up the coordinator (create a default one if not provided)
    if (config.coordinator) {
      this.coordinator = config.coordinator;
    } else {
      this.coordinator = new Agent({
        name: 'Coordinator',
        role: 'coordinator',
        personality: {
          traits: ['organized', 'efficient', 'strategic'],
          background: 'An AI designed to coordinate tasks between multiple specialized agents.'
        },
        goals: ['Efficiently distribute tasks', 'Ensure successful completion of the overall goal']
      });
    }
    
    this.planningStrategy = config.planningStrategy || 'sequential';
    this.maxConcurrentAgents = config.maxConcurrentAgents || 3;
    this.logger = new Logger(`AgentSwarm:${this.id}`);
  }
  
  /**
   * Adds an agent to the swarm
   * 
   * @param agent - The agent to add
   * @returns The swarm instance (for chaining)
   */
  addAgent(agent: Agent): AgentSwarm {
    this.agents.set(agent.id, agent);
    return this;
  }
  
  /**
   * Removes an agent from the swarm
   * 
   * @param agentId - The ID of the agent to remove
   * @returns Boolean indicating if an agent was removed
   */
  removeAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }
  
  /**
   * Gets an agent by ID
   * 
   * @param agentId - The ID of the agent to get
   * @returns The agent, or undefined if not found
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }
  
  /**
   * Gets all agents in the swarm
   * 
   * @returns Array of all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Sets the coordinator agent
   * 
   * @param agent - The agent to use as coordinator
   * @returns The swarm instance (for chaining)
   */
  setCoordinator(agent: Agent): AgentSwarm {
    this.coordinator = agent;
    return this;
  }
  
  /**
   * Runs the swarm with a specific task
   * 
   * @param options - Execution options including the task to perform
   * @returns Promise resolving to the execution result
   */
  async run(options: RunOptions): Promise<RunResult> {
    this.logger.info('Running swarm', { task: options.task });
    
    // Create a coordination plan
    const plan = await this.createCoordinationPlan(options.task);
    
    // Execute the plan based on the planning strategy
    let result: RunResult;
    
    switch (this.planningStrategy) {
      case 'parallel':
        result = await this.executeParallel(plan, options);
        break;
      case 'hierarchical':
        result = await this.executeHierarchical(plan, options);
        break;
      case 'sequential':
      default:
        result = await this.executeSequential(plan, options);
        break;
    }
    
    this.logger.info('Swarm execution completed');
    return result;
  }
  
  /**
   * Creates a coordination plan for the swarm
   * 
   * @param task - The task to create a plan for
   * @returns Promise resolving to the created plan
   */
  private async createCoordinationPlan(task: string): Promise<SwarmPlan> {
    this.logger.debug('Creating coordination plan');
    
    // Get all agent names for the prompt
    const agentNames = Array.from(this.agents.values()).map(agent => 
      `${agent.config.name} (${agent.config.role}): ${agent.config.personality.background}`
    );
    
    // Create a collaboration prompt
    const collaborationPrompt = createCollaborationPrompt(task, agentNames);
    
    // Ask the coordinator to create a plan
    const planResult = await this.coordinator.run({
      task: collaborationPrompt,
    });
    
    // Parse the coordination plan from the response
    // This is a simple implementation; in a real system you'd want more robust parsing
    const agentTasks = this.parseTasksFromResponse(planResult.response);
    
    // Create the plan object
    const plan: SwarmPlan = {
      id: uuidv4(),
      originalTask: task,
      tasks: agentTasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created'
    };
    
    this.logger.info('Coordination plan created', { 
      planId: plan.id, 
      taskCount: plan.tasks.length 
    });
    
    return plan;
  }
  
  /**
   * Executes a plan sequentially
   * 
   * @param plan - The plan to execute
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeSequential(plan: SwarmPlan, options: RunOptions): Promise<RunResult> {
    this.logger.debug('Executing plan sequentially', { planId: plan.id });
    
    // Update plan status
    let currentPlan: SwarmPlan = { 
      ...plan, 
      status: 'in_progress', 
      updated: Date.now() 
    };
    
    // Track all results to combine later
    const results: { agent: string; task: string; result: string }[] = [];
    
    // Execute tasks in sequence, respecting dependencies
    for (const task of currentPlan.tasks) {
      // Check if all dependencies are completed
      const dependencies = currentPlan.tasks.filter(t => task.dependencies.includes(t.id));
      const canExecute = dependencies.every(d => d.status === 'completed');
      
      if (!canExecute) {
        this.logger.warn('Cannot execute task, dependencies not met', { taskId: task.id });
        currentPlan = this.updateTaskStatus(currentPlan, task.id, 'failed', 
          undefined, 'Dependencies not satisfied');
        continue;
      }
      
      // Get the agent
      const agent = this.agents.get(task.agentId);
      if (!agent) {
        this.logger.error('Agent not found', { agentId: task.agentId });
        currentPlan = this.updateTaskStatus(currentPlan, task.id, 'failed', 
          undefined, 'Agent not found');
        continue;
      }
      
      // Update status to in_progress
      currentPlan = this.updateTaskStatus(currentPlan, task.id, 'in_progress');
      
      // Emit progress event
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} executing: ${task.description}` 
      });
      
      try {
        // Execute the task
        const taskResult = await agent.run({
          ...options,
          task: task.description,
        });
        
        // Store the result
        results.push({
          agent: agent.config.name,
          task: task.description,
          result: taskResult.response
        });
        
        // Update task status
        currentPlan = this.updateTaskStatus(
          currentPlan, 
          task.id, 
          'completed', 
          taskResult.response
        );
      } catch (error) {
        this.logger.error('Task execution failed', { taskId: task.id, error });
        
        // Update task status
        currentPlan = this.updateTaskStatus(
          currentPlan, 
          task.id, 
          'failed', 
          undefined, 
          error instanceof Error ? error.message : String(error)
        );
        
        // Mark the plan as failed
        currentPlan = {
          ...currentPlan,
          status: 'failed',
          updated: Date.now()
        };
        
        break;
      }
    }
    
    // Check if all tasks completed successfully
    const allCompleted = currentPlan.tasks.every(t => t.status === 'completed');
    if (allCompleted && currentPlan.status !== 'failed') {
      currentPlan = {
        ...currentPlan,
        status: 'completed',
        updated: Date.now()
      };
    }
    
    // Ask the coordinator to synthesize the results
    const synthesisPrompt = `
      I've coordinated a group of agents to complete this task:
      "${plan.originalTask}"
      
      Here are the results from each agent:
      
      ${results.map(r => 
        `AGENT: ${r.agent}
         TASK: ${r.task}
         RESULT: ${r.result}`
      ).join('\n\n')}
      
      Please synthesize these results into a cohesive response.
    `;
    
    // Get the synthesis
    const synthesis = await this.coordinator.run({
      ...options,
      task: synthesisPrompt,
    });
    
    return {
      response: synthesis.response,
      conversation: synthesis.conversation,
    };
  }
  
  /**
   * Executes a plan with parallel execution where possible
   * 
   * @param plan - The plan to execute
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeParallel(plan: SwarmPlan, options: RunOptions): Promise<RunResult> {
    this.logger.debug('Executing plan in parallel', { planId: plan.id });
    
    // Update plan status
    let currentPlan: SwarmPlan = { 
      ...plan, 
      status: 'in_progress', 
      updated: Date.now() 
    };
    
    // Track all results to combine later
    const results: { agent: string; task: string; result: string }[] = [];
    
    // While we have pending tasks
    while (currentPlan.tasks.some(t => t.status === 'pending' || t.status === 'in_progress')) {
      // Find tasks that can be executed in parallel
      const executableTasks = currentPlan.tasks.filter(task => {
        // Task must be pending
        if (task.status !== 'pending') return false;
        
        // All dependencies must be completed
        const dependencies = currentPlan.tasks.filter(t => task.dependencies.includes(t.id));
        return dependencies.every(d => d.status === 'completed');
      });
      
      // If no executable tasks, but some are in progress, wait
      if (executableTasks.length === 0) {
        if (currentPlan.tasks.some(t => t.status === 'in_progress')) {
          // Sleep a bit to avoid busy waiting
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        } else {
          // No pending tasks and none in progress - we're done or stuck
          break;
        }
      }
      
      // Limit concurrency
      const tasksToExecute = executableTasks.slice(0, this.maxConcurrentAgents);
      
      // Update status to in_progress
      for (const task of tasksToExecute) {
        currentPlan = this.updateTaskStatus(currentPlan, task.id, 'in_progress');
      }
      
      // Execute tasks in parallel
      const taskPromises = tasksToExecute.map(async task => {
        // Get the agent
        const agent = this.agents.get(task.agentId);
        if (!agent) {
          this.logger.error('Agent not found', { agentId: task.agentId });
          return {
            task,
            status: 'failed' as const,
            error: 'Agent not found'
          };
        }
        
        // Emit progress event
        this.emit(AgentEvent.THINKING, { 
          message: `Agent ${agent.config.name} executing: ${task.description}` 
        });
        
        try {
          // Execute the task
          const taskResult = await agent.run({
            ...options,
            task: task.description,
          });
          
          // Return the result
          return {
            task,
            status: 'completed' as const,
            result: taskResult.response,
            agentName: agent.config.name
          };
        } catch (error) {
          this.logger.error('Task execution failed', { taskId: task.id, error });
          
          // Return the error
          return {
            task,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      });
      
      // Wait for all tasks to complete
      const taskResults = await Promise.all(taskPromises);
      
      // Update the plan with results
      for (const taskResult of taskResults) {
        if (taskResult.status === 'completed') {
          // Store the result
          results.push({
            agent: taskResult.agentName!,
            task: taskResult.task.description,
            result: taskResult.result!
          });
          
          // Update task status
          currentPlan = this.updateTaskStatus(
            currentPlan, 
            taskResult.task.id, 
            'completed', 
            taskResult.result
          );
          
          // Request feedback if enabled
          if (this.feedbackSystem && this.feedbackSystem.shouldRequestFeedback()) {
            // Choose a different agent as evaluator (not the same agent that did the task)
            const availableEvaluators = this.getAllAgents().filter(agent => 
              agent.id !== taskResult.task.agentId && agent.id !== this.coordinator.id
            );
            
            if (availableEvaluators.length > 0) {
              // Choose a random evaluator
              const evaluator = availableEvaluators[Math.floor(Math.random() * availableEvaluators.length)];
              const producer = this.getAgent(taskResult.task.agentId)!;
              
              this.logger.info('Requesting feedback', { 
                taskId: taskResult.task.id, 
                producerId: producer.id,
                evaluatorId: evaluator.id
              });
              
              // Request feedback asynchronously (don't await)
              this.feedbackSystem.requestFeedback(
                taskResult.task.id,
                taskResult.task.description,
                taskResult.result || '',
                producer,
                evaluator
              ).then(feedback => {
                this.emit(AgentEvent.THINKING, { 
                  message: `Received feedback from ${evaluator.config.name} on ${producer.config.name}'s work` 
                });
              }).catch(error => {
                this.logger.error('Error requesting feedback', { taskId: taskResult.task.id, error });
              });
            }
          }
        } else {
          // Update task status
          currentPlan = this.updateTaskStatus(
            currentPlan, 
            taskResult.task.id, 
            'failed', 
            undefined, 
            taskResult.error
          );
        }
      }
    }
    
    // Check if all tasks completed successfully
    const allCompleted = currentPlan.tasks.every(t => t.status === 'completed');
    if (allCompleted) {
      currentPlan = {
        ...currentPlan,
        status: 'completed',
        updated: Date.now()
      };
    } else {
      currentPlan = {
        ...currentPlan,
        status: 'failed',
        updated: Date.now()
      };
    }
    
    // Ask the coordinator to synthesize the results
    const synthesisPrompt = `
      I've coordinated a group of agents to complete this task:
      "${plan.originalTask}"
      
      Here are the results from each agent:
      
      ${results.map(r => 
        `AGENT: ${r.agent}
         TASK: ${r.task}
         RESULT: ${r.result}`
      ).join('\n\n')}
      
      Please synthesize these results into a cohesive response.
    `;
    
    // Get the synthesis
    const synthesis = await this.coordinator.run({
      ...options,
      task: synthesisPrompt,
    });
    
    return {
      response: synthesis.response,
      conversation: synthesis.conversation,
    };
  }
  
  /**
   * Executes a plan with hierarchical execution (coordinator delegates to teams)
   * 
   * @param plan - The plan to execute
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeHierarchical(plan: SwarmPlan, options: RunOptions): Promise<RunResult> {
    // Group tasks by agent
    const agentTaskMap = new Map<string, AgentTask[]>();
    
    for (const task of plan.tasks) {
      if (!agentTaskMap.has(task.agentId)) {
        agentTaskMap.set(task.agentId, []);
      }
      agentTaskMap.get(task.agentId)!.push(task);
    }
    
    // For each agent, combine their tasks into one larger task
    const agentResults = [];
    
    for (const [agentId, tasks] of agentTaskMap.entries()) {
      const agent = this.agents.get(agentId);
      if (!agent) {
        this.logger.error('Agent not found', { agentId });
        continue;
      }
      
      // Combine the tasks
      const combinedTask = `
        I need you to complete the following related tasks:
        
        ${tasks.map((task, index) => `TASK ${index + 1}: ${task.description}`).join('\n\n')}
        
        Please complete each task in order and provide your results for each one.
      `;
      
      // Execute the combined task
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} executing ${tasks.length} tasks` 
      });
      
      try {
        const result = await agent.run({
          ...options,
          task: combinedTask,
        });
        
        agentResults.push({
          agent: agent.config.name,
          tasks: tasks.map(t => t.description),
          result: result.response
        });
      } catch (error) {
        this.logger.error('Agent execution failed', { agentId, error });
      }
    }
    
    // Ask the coordinator to synthesize the results
    const synthesisPrompt = `
      I've coordinated a group of agents to complete this task:
      "${plan.originalTask}"
      
      Here are the results from each agent:
      
      ${agentResults.map(r => 
        `AGENT: ${r.agent}
         TASKS: ${r.tasks.join(', ')}
         RESULT: ${r.result}`
      ).join('\n\n')}
      
      Please synthesize these results into a cohesive response.
    `;
    
    // Get the synthesis
    const synthesis = await this.coordinator.run({
      ...options,
      task: synthesisPrompt,
    });
    
    return {
      response: synthesis.response,
      conversation: synthesis.conversation,
    };
  }
  
  /**
   * Updates a task's status and result
   * 
   * @param plan - The plan containing the task
   * @param taskId - ID of the task to update
   * @param status - New status
   * @param result - Optional result from the task
   * @param error - Optional error message
   * @returns The updated plan
   */
  private updateTaskStatus(
    plan: SwarmPlan,
    taskId: string, 
    status: AgentTask['status'], 
    result?: string,
    error?: string
  ): SwarmPlan {
    // Create a new plan object (immutable update)
    const updatedPlan: SwarmPlan = {
      ...plan,
      updated: Date.now(),
      tasks: plan.tasks.map(task => 
        task.id === taskId
          ? { ...task, status, result, error }
          : task
      )
    };
    
    this.logger.debug('Updated task status', { 
      planId: plan.id, 
      taskId, 
      status, 
      error: error ? true : false 
    });
    
    return updatedPlan;
  }
  
  /**
   * Simple parser to extract agent tasks from the coordinator's response
   * 
   * @param response - The coordinator's response 
   * @returns Array of agent tasks
   */
  private parseTasksFromResponse(response: string): AgentTask[] {
    const tasks: AgentTask[] = [];
    
    // This is a very simplistic parser
    // In a real system, you'd want to use a more structured approach
    // or ask the LLM to format its response in a specific way (like JSON)
    
    // Look for sections that might define tasks
    const sections = response.split(/Agent:|AGENT:|Task:|TASK:/gi).slice(1);
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      // Try to extract agent name and task description
      const agentMatch = section.match(/^(.*?)(?:should|will|can|:)(.*)$/s);
      if (agentMatch) {
        const agentName = agentMatch[1].trim();
        const taskDescription = agentMatch[2].trim();
        
        // Find the agent by name
        const agent = Array.from(this.agents.values()).find(a => 
          a.config.name.toLowerCase() === agentName.toLowerCase()
        );
        
        if (agent) {
          tasks.push({
            id: uuidv4(),
            agentId: agent.id,
            description: taskDescription,
            dependencies: [], // Simple case - no dependencies
            status: 'pending'
          });
        }
      }
    }
    
    // If we couldn't parse any tasks, create one task per agent
    if (tasks.length === 0) {
      // Split the task evenly among all agents
      const agents = Array.from(this.agents.values());
      agents.forEach(agent => {
        tasks.push({
          id: uuidv4(),
          agentId: agent.id,
          description: `Help with this task: ${response}`,
          dependencies: [],
          status: 'pending'
        });
      });
    }
    
    return tasks;
  }
}