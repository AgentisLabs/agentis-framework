/**
 * Enhanced Agent Swarm for Multi-Provider Coordination
 * 
 * This extends the base AgentSwarm with improved capabilities for:
 * - Managing specialized agents with different LLM providers
 * - More sophisticated inter-agent communication
 * - Better task decomposition and workload distribution
 * - Dynamic provider selection based on task types
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Agent } from './agent';
import { AgentSwarm } from './agent-swarm';
import { RunOptions, RunResult, AgentEvent } from './types';
import { ProviderType } from './provider-interface';
import { Logger } from '../utils/logger';

/**
 * Configuration for agent specialization
 */
export interface AgentSpecialization {
  name: string;
  description: string;
  capabilities: string[];
  preferredTaskTypes: string[];
  provider: ProviderType;
}

/**
 * Enhanced task assignment with metadata
 */
export interface EnhancedAgentTask {
  id: string;
  agentId: string;
  description: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  taskType: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Detailed coordination plan with metadata
 */
export interface EnhancedSwarmPlan {
  id: string;
  originalTask: string;
  tasks: EnhancedAgentTask[];
  created: number;
  updated: number;
  status: 'created' | 'in_progress' | 'completed' | 'failed';
  metadata: {
    expectedCompletionTime?: number;
    requiresExternalData: boolean;
    collaborationLevel: 'low' | 'medium' | 'high';
    criticalPath?: string[];
  };
}

/**
 * Configuration for creating an enhanced agent swarm
 */
export interface EnhancedAgentSwarmConfig {
  agents: Agent[];
  coordinator?: Agent;
  planningStrategy?: 'sequential' | 'parallel' | 'hierarchical'; // Removed 'adaptive' to match base class
  maxConcurrentAgents?: number;
  agentSpecializations?: Record<string, AgentSpecialization>;
  enabledCommunicationChannels?: string[];
}

/**
 * Agent communication message
 */
export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string | 'broadcast';
  content: string;
  timestamp: number;
  type: 'question' | 'answer' | 'update' | 'request' | 'feedback';
  relatedTaskId?: string;
}

/**
 * EnhancedAgentSwarm extends the base AgentSwarm with more sophisticated
 * coordination capabilities, especially for multi-provider scenarios
 */
export class EnhancedAgentSwarm extends AgentSwarm {
  private agentSpecializations: Record<string, AgentSpecialization> = {};
  private communicationLog: AgentMessage[] = [];
  private enabledCommunicationChannels: string[] = ['direct', 'broadcast'];
  private originalTask: string = ''; // Store original task for context
  // Use protected logger to avoid conflict with base class
  protected swarmLogger: Logger;
  
  /**
   * Creates a new enhanced agent swarm
   * 
   * @param config - Configuration for the swarm
   */
  constructor(config: EnhancedAgentSwarmConfig) {
    super(config);
    
    // Store agent specializations
    if (config.agentSpecializations) {
      this.agentSpecializations = config.agentSpecializations;
    } else {
      // Create default specializations based on agent providers
      this.initializeDefaultSpecializations();
    }
    
    // Set up communication channels
    if (config.enabledCommunicationChannels) {
      this.enabledCommunicationChannels = config.enabledCommunicationChannels;
    }
    
    this.swarmLogger = new Logger(`EnhancedAgentSwarm:${this.id}`);
  }
  
  /**
   * Initialize default specializations based on agent providers
   */
  private initializeDefaultSpecializations(): void {
    const agents = this.getAllAgents();
    
    for (const agent of agents) {
      // Attempt to determine provider from agent
      let providerType = ProviderType.ANTHROPIC; // Default
      
      // Set up a default specialization
      this.agentSpecializations[agent.id] = {
        name: agent.config.name,
        description: agent.config.personality.background || 'Generic agent',
        capabilities: agent.config.personality.traits || [],
        preferredTaskTypes: [],
        provider: providerType
      };
    }
  }
  
  /**
   * Creates an enhanced coordination plan with better task allocation
   * based on agent specializations
   * 
   * @param task - The task to create a plan for
   * @returns Promise resolving to the created plan
   */
  async createEnhancedCoordinationPlan(task: string): Promise<EnhancedSwarmPlan> {
    this.swarmLogger.debug('Creating enhanced coordination plan');
    
    // Get all agents with their specializations for the prompt
    const agentDescriptions = this.getAllAgents().map(agent => {
      const specialization = this.agentSpecializations[agent.id];
      return `${agent.config.name} (${agent.config.role}):
- Background: ${agent.config.personality.background}
- Specialization: ${specialization?.description || 'General purpose'}
- Capabilities: ${specialization?.capabilities.join(', ') || agent.config.personality.traits.join(', ')}
- Provider: ${specialization?.provider || 'Unknown'}`;
    });
    
    // Create a detailed collaboration prompt for the coordinator
    const collaborationPrompt = `# Enhanced Multi-Provider Coordination Plan

I need to coordinate a group of specialized agents with different AI providers to complete this task:

"${task}"

Available agents and their specializations:
${agentDescriptions.join('\n\n')}

Please create a detailed coordination plan that:
1. Breaks down the task into subtasks appropriate for each agent's specialization
2. Assigns each subtask to the most appropriate agent based on their capabilities and provider strengths
3. Establishes dependencies between subtasks
4. Prioritizes tasks (high/medium/low)
5. Estimates the effort required for each task (high/medium/low)
6. Categorizes tasks by type (research, analysis, writing, etc.)

Format your response as a structured plan with clear task assignments for each agent.`;

    // Ask the coordinator to create the plan
    const planResult = await this.getCoordinator().run({
      task: collaborationPrompt,
    });
    
    // Parse the enhanced coordination plan from the response
    const enhancedTasks = this.parseEnhancedTasksFromResponse(planResult.response);
    
    // Create the enhanced plan object
    const plan: EnhancedSwarmPlan = {
      id: uuidv4(),
      originalTask: task,
      tasks: enhancedTasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created',
      metadata: {
        requiresExternalData: task.includes('latest') || task.includes('current') || task.includes('recent'),
        collaborationLevel: this.determineCollaborationLevel(enhancedTasks),
      }
    };
    
    // Calculate the critical path if possible
    plan.metadata.criticalPath = this.calculateCriticalPath(enhancedTasks);
    
    this.swarmLogger.info('Enhanced coordination plan created', { 
      planId: plan.id, 
      taskCount: plan.tasks.length,
      collaborationLevel: plan.metadata.collaborationLevel
    });
    
    return plan;
  }
  
  /**
   * Enhanced execution method that incorporates agent specializations
   * and improved communication between agents
   * 
   * @param task - The task to execute
   * @param options - Execution options
   * @returns Promise resolving to the execution result
   */
  async runEnhanced(options: RunOptions): Promise<RunResult> {
    this.swarmLogger.info('Running enhanced swarm', { task: options.task });
    
    // Store the original task for context
    this.originalTask = options.task;
    
    // Create an enhanced coordination plan
    const plan = await this.createEnhancedCoordinationPlan(options.task);
    
    // Execute the plan with specialized execution based on plan metadata
    let result: RunResult;
    
    // Choose execution strategy based on collaboration level and plan metadata
    if (plan.metadata.collaborationLevel === 'high') {
      result = await this.executeWithHighCollaboration(plan, options);
    } else if (plan.metadata.requiresExternalData) {
      result = await this.executeWithExternalDataFocus(plan, options);
    } else {
      // Even for low collaboration, let's force external data focus since that's usually needed
      this.swarmLogger.info('Low collaboration level detected but forcing external data focus for better results');
      result = await this.executeWithExternalDataFocus(plan, options);
    }
    
    return result;
  }
  
  /**
   * Execute a plan with high collaboration between agents, including
   * inter-agent communication
   * 
   * @param plan - The plan to execute
   * @param options - Execution options
   * @returns Promise resolving to the execution result
   */
  private async executeWithHighCollaboration(
    plan: EnhancedSwarmPlan, 
    options: RunOptions
  ): Promise<RunResult> {
    this.swarmLogger.debug('Executing plan with high collaboration', { planId: plan.id });
    
    // Execute high-priority tasks first
    const highPriorityTasks = plan.tasks.filter(t => t.priority === 'high');
    const results = [];
    
    // Execute high priority tasks
    for (const task of highPriorityTasks) {
      const agent = this.getAgent(task.agentId);
      if (!agent) continue;
      
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} executing high-priority task: ${task.description}` 
      });
      
      try {
        // Prepare context with relevant specialization info
        const specialization = this.agentSpecializations[agent.id];
        const specializationContext = specialization 
          ? `\nYou are specialized in: ${specialization.description}.\nYour capabilities: ${specialization.capabilities.join(', ')}.`
          : '';
        
        const enhancedTask = `${specializationContext}\n\nTask: ${task.description}`;
        
        const taskResult = await agent.run({
          ...options,
          task: enhancedTask,
        });
        
        // Store the result
        results.push({
          agent: agent.config.name,
          task: task.description,
          taskType: task.taskType,
          result: taskResult.response
        });
      } catch (error) {
        this.swarmLogger.error('Task execution failed', { taskId: task.id, error });
      }
    }
    
    // Execute remaining tasks, enabling inter-agent communication
    const remainingTasks = plan.tasks.filter(t => t.priority !== 'high');
    
    for (const task of remainingTasks) {
      const agent = this.getAgent(task.agentId);
      if (!agent) continue;
      
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} executing task: ${task.description}` 
      });
      
      try {
        // Check if there are relevant previous results to include
        const relevantResults = this.findRelevantResults(results, task);
        let contextWithPreviousResults = '';
        
        if (relevantResults.length > 0) {
          contextWithPreviousResults = `
Prior relevant work from other agents:
${relevantResults.map(r => `
AGENT: ${r.agent}
TASK TYPE: ${r.taskType}
RESULT: ${r.result}
`).join('\n')}`;
        }
        
        // Prepare task with collaboration context
        const enhancedTask = `${task.description}
        
${contextWithPreviousResults}

Please build upon the work of other agents where relevant. Your task is to ${task.taskType}.`;
        
        const taskResult = await agent.run({
          ...options,
          task: enhancedTask,
        });
        
        // Store the result
        results.push({
          agent: agent.config.name,
          task: task.description,
          taskType: task.taskType,
          result: taskResult.response
        });
      } catch (error) {
        this.swarmLogger.error('Task execution failed', { taskId: task.id, error });
      }
    }
    
    // Ask the coordinator to synthesize the results with awareness of
    // the different provider strengths that were utilized
    const synthesisPrompt = `
I've coordinated a group of specialized agents with different AI providers to complete this task:
"${plan.originalTask}"

Each agent has unique capabilities based on their provider:
${Object.values(this.agentSpecializations).map(s => 
  `- ${s.name} (${s.provider}): ${s.description}`
).join('\n')}

Here are the results from each agent:

${results.map(r => 
  `AGENT: ${r.agent}
   TASK TYPE: ${r.taskType}
   RESULT: ${r.result}`
).join('\n\n')}

Please synthesize these results into a cohesive response that leverages the strengths of each provider.
Highlight where different AI providers complemented each other's capabilities.
`;
    
    // Get the synthesis
    const synthesis = await this.getCoordinator().run({
      ...options,
      task: synthesisPrompt,
    });
    
    return {
      response: synthesis.response,
      conversation: synthesis.conversation,
    };
  }
  
  /**
   * Execute a plan with focus on external data gathering and processing
   * 
   * @param plan - The plan to execute
   * @param options - Execution options
   * @returns Promise resolving to the execution result
   */
  private async executeWithExternalDataFocus(
    plan: EnhancedSwarmPlan, 
    options: RunOptions
  ): Promise<RunResult> {
    this.swarmLogger.debug('Executing plan with external data focus', { planId: plan.id });
    
    // First, execute all research/data gathering tasks
    const researchTasks = plan.tasks.filter(t => 
      t.taskType.includes('research') || 
      t.taskType.includes('data') || 
      t.taskType.includes('search')
    );
    
    const dataResults: Array<{agent: string; task: string; result: string}> = [];
    
    // Execute research tasks
    for (const task of researchTasks) {
      const agent = this.getAgent(task.agentId);
      if (!agent) continue;
      
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} gathering data: ${task.description}` 
      });
      
      try {
        const taskResult = await agent.run({
          ...options,
          task: task.description,
        });
        
        // Store the result
        dataResults.push({
          agent: agent.config.name,
          task: task.description,
          result: taskResult.response
        });
      } catch (error) {
        this.swarmLogger.error('Data gathering failed', { taskId: task.id, error });
      }
    }
    
    // Then, execute analysis tasks with the gathered data
    const analysisTasks = plan.tasks.filter(t => 
      t.taskType.includes('analysis') || 
      t.taskType.includes('evaluate') || 
      t.taskType.includes('interpret')
    );
    
    const analysisResults: Array<{agent: string; task: string; result: string}> = [];
    
    // Execute analysis tasks
    for (const task of analysisTasks) {
      const agent = this.getAgent(task.agentId);
      if (!agent) continue;
      
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} analyzing data: ${task.description}` 
      });
      
      try {
        // Include all research data in the context
        const dataContext = `
Research data gathered:
${dataResults.map(r => `
AGENT: ${r.agent}
TASK: ${r.task}
FINDINGS: ${r.result}
`).join('\n')}

Please analyze this data to ${task.description}`;
        
        const taskResult = await agent.run({
          ...options,
          task: dataContext,
        });
        
        // Store the result
        analysisResults.push({
          agent: agent.config.name,
          task: task.description,
          result: taskResult.response
        });
      } catch (error) {
        this.swarmLogger.error('Analysis failed', { taskId: task.id, error });
      }
    }
    
    // Finally, execute remaining tasks with all context
    const remainingTasks = plan.tasks.filter(t => 
      !researchTasks.find(rt => rt.id === t.id) && 
      !analysisTasks.find(at => at.id === t.id)
    );
    
    const finalResults = [...dataResults, ...analysisResults];
    
    for (const task of remainingTasks) {
      const agent = this.getAgent(task.agentId);
      if (!agent) continue;
      
      this.emit(AgentEvent.THINKING, { 
        message: `Agent ${agent.config.name} executing task: ${task.description}` 
      });
      
      try {
        // Include all previous results in the context
        const fullContext = `
Task: ${task.description}

Previous work from other agents:
${finalResults.map(r => `
AGENT: ${r.agent}
TASK: ${r.task}
RESULT: ${r.result}
`).join('\n')}`;
        
        const taskResult = await agent.run({
          ...options,
          task: fullContext,
        });
        
        // Store the result
        finalResults.push({
          agent: agent.config.name,
          task: task.description,
          result: taskResult.response
        });
      } catch (error) {
        this.swarmLogger.error('Task execution failed', { taskId: task.id, error });
      }
    }
    
    // Ask the coordinator to synthesize all results
    const synthesisPrompt = `
I've coordinated a group of agents to complete this task involving gathering and analyzing external data:
"${plan.originalTask}"

Here are all the results, organized by stage:

DATA GATHERING:
${dataResults.map(r => `
AGENT: ${r.agent}
TASK: ${r.task}
FINDINGS: ${r.result}
`).join('\n')}

ANALYSIS:
${analysisResults.map(r => `
AGENT: ${r.agent}
TASK: ${r.task}
ANALYSIS: ${r.result}
`).join('\n')}

ADDITIONAL WORK:
${finalResults.filter(r => 
  !dataResults.find(dr => dr.agent === r.agent && dr.task === r.task) && 
  !analysisResults.find(ar => ar.agent === r.agent && ar.task === r.task)
).map(r => `
AGENT: ${r.agent}
TASK: ${r.task}
RESULT: ${r.result}
`).join('\n')}

Please synthesize these results into a comprehensive response that incorporates both the data gathered and the analysis performed.
Focus on providing a clear, accurate, and well-structured answer to the original task.
`;
    
    // Get the synthesis
    const synthesis = await this.getCoordinator().run({
      ...options,
      task: synthesisPrompt,
    });
    
    return {
      response: synthesis.response,
      conversation: synthesis.conversation,
    };
  }
  
  /**
   * Find relevant results from previous tasks that could help with a current task
   */
  private findRelevantResults(
    results: Array<{agent: string; task: string; taskType: string; result: string}>, 
    currentTask: EnhancedAgentTask
  ): Array<{agent: string; task: string; taskType: string; result: string}> {
    // Simple relevance algorithm - check for keyword overlap
    const taskWords = currentTask.description.toLowerCase().split(/\s+/);
    const relevantResults = [];
    
    for (const result of results) {
      // Check if task types are related
      const isRelatedTaskType = 
        (currentTask.taskType.includes('analysis') && result.taskType.includes('research')) ||
        (currentTask.taskType.includes('writing') && 
          (result.taskType.includes('research') || result.taskType.includes('analysis')));
      
      // Check for keyword overlap
      const resultWords = result.task.toLowerCase().split(/\s+/);
      const overlappingWords = taskWords.filter(word => 
        word.length > 4 && resultWords.includes(word)
      );
      
      if (isRelatedTaskType || overlappingWords.length >= 2) {
        relevantResults.push(result);
      }
    }
    
    return relevantResults;
  }
  
  /**
   * Parse enhanced tasks from the coordinator's response
   */
  private parseEnhancedTasksFromResponse(response: string): EnhancedAgentTask[] {
    // If we don't have any tasks, let's create default tasks for each agent
    const agents = this.getAllAgents();
    if (agents.length === 0) {
      this.swarmLogger.warn('No agents available to create tasks');
      return [];
    }
    
    this.swarmLogger.debug('Coordinator response for task parsing:', response);
    
    const tasks: EnhancedAgentTask[] = [];
    
    // Look for task sections with more detailed attributes
    const taskRegex = /(?:Task|TASK)[\s\d:]+([^\n]+)\s*(?:Agent|AGENT)[\s:]+([^\n]+)\s*(?:(?:Type|TYPE)[\s:]+([^\n]+))?\s*(?:(?:Priority|PRIORITY)[\s:]+([^\n]+))?\s*(?:(?:Effort|EFFORT)[\s:]+([^\n]+))?\s*(?:(?:Description|DESCRIPTION)[\s:]+([^\n]+))?/gi;
    
    let match;
    while ((match = taskRegex.exec(response)) !== null) {
      const taskName = match[1]?.trim();
      const agentName = match[2]?.trim();
      const taskType = match[3]?.trim().toLowerCase() || 'general';
      const priority = this.normalizePriority(match[4]?.trim().toLowerCase());
      const effort = this.normalizeEffort(match[5]?.trim().toLowerCase());
      const description = match[6]?.trim() || taskName;
      
      // Find the agent by name
      const agent = this.getAllAgents().find(a => 
        a.config.name.toLowerCase() === agentName.toLowerCase()
      );
      
      if (agent) {
        tasks.push({
          id: uuidv4(),
          agentId: agent.id,
          description: description,
          dependencies: [], // Will try to infer these later
          status: 'pending',
          priority: priority,
          taskType: taskType,
          estimatedEffort: effort
        });
      }
    }
    
    // If the structured parsing fails, try a more generic approach
    if (tasks.length === 0) {
      const fallbackTasks = this.fallbackTaskParsing(response);
      
      // If still no tasks, create default tasks for each agent
      if (fallbackTasks.length === 0) {
        this.swarmLogger.info('Creating default tasks for each agent');
        return this.createDefaultTasksForAgents();
      }
      
      return fallbackTasks;
    }
    
    // Try to infer dependencies
    this.inferDependencies(tasks, response);
    
    return tasks;
  }
  
  /**
   * Infer dependencies between tasks based on the response using the advanced dependency system
   */
  private inferDependencies(tasks: EnhancedAgentTask[], response: string): void {
    try {
      // Import the DependencyInference system
      // We need to require it here to avoid circular dependencies
      const { DependencyInference } = require('../planning/dependency-inference');
      
      // Create an instance of the dependency inference system
      const dependencyInference = new DependencyInference({
        enableContentSimilarity: true,
        enableTypeHierarchy: true,
        enableInformationFlow: true,
        minDependencyCertainty: 0.5,
        maxDependenciesPerTask: 4
      });
      
      // Convert enhanced tasks to regular plan tasks for the inference
      const planTasks = tasks.map(enhancedTask => {
        return {
          id: enhancedTask.id,
          description: enhancedTask.description,
          dependencies: enhancedTask.dependencies,
          status: enhancedTask.status as 'pending' | 'in_progress' | 'completed' | 'failed'
        };
      });
      
      // Run the advanced dependency inference
      const updatedPlanTasks = dependencyInference.inferDependencies(planTasks, response);
      
      // Copy dependencies back to enhanced tasks
      for (let i = 0; i < tasks.length; i++) {
        const updatedTask = updatedPlanTasks.find(t => t.id === tasks[i].id);
        if (updatedTask) {
          tasks[i].dependencies = updatedTask.dependencies;
        }
      }
      
      // Log success
      this.swarmLogger.info('Enhanced dependency inference completed', { 
        taskCount: tasks.length,
        dependencyCount: tasks.reduce((sum, task) => sum + task.dependencies.length, 0)
      });
      
    } catch (error) {
      // If there's any error with the new system, fall back to the basic implementation
      this.swarmLogger.warn('Error in enhanced dependency inference, falling back to basic implementation', { error });
      this.inferDependenciesBasic(tasks, response);
    }
  }
  
  /**
   * Basic dependency inference as a fallback if the advanced system fails
   */
  private inferDependenciesBasic(tasks: EnhancedAgentTask[], response: string): void {
    // Look for explicit dependency mentions
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskDesc = task.description.toLowerCase();
      
      // Check for phrases indicating dependencies
      const dependsOnRegex = new RegExp(
        `${task.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*?\\s+(?:depends on|after|following|based on)\\s+(.+?)(?:\\.|\\n)`,
        'i'
      );
      
      const dependencyMatch = response.match(dependsOnRegex);
      if (dependencyMatch && dependencyMatch[1]) {
        const dependencyDesc = dependencyMatch[1].trim().toLowerCase();
        
        // Try to find the task this depends on
        for (let j = 0; j < tasks.length; j++) {
          if (i !== j && tasks[j].description.toLowerCase().includes(dependencyDesc)) {
            task.dependencies.push(tasks[j].id);
          }
        }
      }
      
      // Also check for words indicating the task uses results from another task
      if (
        taskDesc.includes('using the') || 
        taskDesc.includes('based on') || 
        taskDesc.includes('with the results') ||
        taskDesc.includes('analyze the')
      ) {
        // This task likely depends on research or data gathering tasks
        for (let j = 0; j < tasks.length; j++) {
          if (i !== j && 
            (tasks[j].taskType.includes('research') || 
             tasks[j].taskType.includes('data') || 
             tasks[j].taskType.includes('gather'))
          ) {
            task.dependencies.push(tasks[j].id);
          }
        }
      }
    }
  }
  
  /**
   * Fallback parsing method when structured parsing fails
   */
  /**
   * Create default tasks for all agents based on their specializations
   */
  private createDefaultTasksForAgents(): EnhancedAgentTask[] {
    const tasks: EnhancedAgentTask[] = [];
    const agents = this.getAllAgents();
    
    // Create default tasks based on agent specializations
    agents.forEach(agent => {
      const specialization = this.agentSpecializations[agent.id];
      let taskType = 'general';
      let taskDescription = 'Help with this task using your specialized capabilities';
      
      // If we have specialization info, use it to create a more specific task
      if (specialization) {
        if (specialization.preferredTaskTypes.length > 0) {
          taskType = specialization.preferredTaskTypes[0];
        }
        
        if (specialization.capabilities.length > 0) {
          // Create a task description based on capabilities
          taskDescription = `Use your ${specialization.capabilities.join(', ')} capabilities to address this task`;
        }
      } else {
        // Try to infer from agent role
        const role = agent.config.role.toString().toLowerCase();
        if (role.includes('research')) {
          taskType = 'research';
          taskDescription = 'Research relevant information for this task';
        } else if (role.includes('analy')) {
          taskType = 'analysis';
          taskDescription = 'Analyze the information and provide insights';
        } else if (role.includes('writ')) {
          taskType = 'writing';
          taskDescription = 'Create well-structured content based on the information';
        }
      }
      
      // Create a default task for this agent, including the original task in the description
      tasks.push({
        id: uuidv4(),
        agentId: agent.id,
        description: `${taskDescription} for the task: "${this.originalTask}"`,
        dependencies: [],
        status: 'pending',
        priority: 'medium',
        taskType: taskType,
        estimatedEffort: 'medium'
      });
    });
    
    // Add dependencies - analysis depends on research, writing depends on both
    if (tasks.length > 1) {
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].taskType === 'analysis') {
          // Analysis depends on research
          const researchTasks = tasks.filter(t => t.taskType === 'research');
          tasks[i].dependencies = researchTasks.map(t => t.id);
        } else if (tasks[i].taskType === 'writing') {
          // Writing depends on both research and analysis
          const dependencies = tasks
            .filter(t => t.taskType === 'research' || t.taskType === 'analysis')
            .map(t => t.id);
          tasks[i].dependencies = dependencies;
        }
      }
    }
    
    return tasks;
  }
  
  private fallbackTaskParsing(response: string): EnhancedAgentTask[] {
    const tasks: EnhancedAgentTask[] = [];
    
    // Split by agent mentions
    const agentSections = response.split(/(?:Agent|AGENT)[:]/i).slice(1);
    
    for (const section of agentSections) {
      // Try to extract agent name and tasks
      const agentMatch = section.match(/^([^:\n]+)/);
      if (agentMatch) {
        const agentName = agentMatch[1].trim();
        
        // Find the agent by name
        const agent = this.getAllAgents().find(a => 
          a.config.name.toLowerCase() === agentName.toLowerCase() ||
          agentName.toLowerCase().includes(a.config.name.toLowerCase())
        );
        
        if (agent) {
          // Extract tasks for this agent
          const taskMatches = section.match(/(?:[-•*]\s*|(?:\d+\.\s+))([^\n]+)/g);
          
          if (taskMatches) {
            for (const taskMatch of taskMatches) {
              const taskDesc = taskMatch.replace(/^[-•*]\s*|^\d+\.\s+/, '').trim();
              
              // Try to infer task type
              let taskType = 'general';
              if (taskDesc.toLowerCase().includes('research') || taskDesc.toLowerCase().includes('find') || taskDesc.toLowerCase().includes('search')) {
                taskType = 'research';
              } else if (taskDesc.toLowerCase().includes('analyze') || taskDesc.toLowerCase().includes('evaluate')) {
                taskType = 'analysis';
              } else if (taskDesc.toLowerCase().includes('write') || taskDesc.toLowerCase().includes('create')) {
                taskType = 'writing';
              }
              
              tasks.push({
                id: uuidv4(),
                agentId: agent.id,
                description: taskDesc,
                dependencies: [],
                status: 'pending',
                priority: 'medium',
                taskType: taskType,
                estimatedEffort: 'medium'
              });
            }
          }
        }
      }
    }
    
    return tasks;
  }
  
  /**
   * Normalize priority string to 'low', 'medium', or 'high'
   */
  private normalizePriority(priority?: string): 'low' | 'medium' | 'high' {
    if (!priority) return 'medium';
    
    if (priority.includes('high') || priority.includes('critical') || priority === '1') {
      return 'high';
    } else if (priority.includes('low') || priority.includes('minor') || priority === '3') {
      return 'low';
    } else {
      return 'medium';
    }
  }
  
  /**
   * Normalize effort string to 'low', 'medium', or 'high'
   */
  private normalizeEffort(effort?: string): 'low' | 'medium' | 'high' {
    if (!effort) return 'medium';
    
    if (effort.includes('high') || effort.includes('large') || effort.includes('significant')) {
      return 'high';
    } else if (effort.includes('low') || effort.includes('small') || effort.includes('minimal')) {
      return 'low';
    } else {
      return 'medium';
    }
  }
  
  /**
   * Determine the collaboration level needed for a set of tasks
   */
  private determineCollaborationLevel(tasks: EnhancedAgentTask[]): 'low' | 'medium' | 'high' {
    // Count dependencies between different agents
    let crossAgentDependencies = 0;
    
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        const depTask = tasks.find(t => t.id === depId);
        if (depTask && depTask.agentId !== task.agentId) {
          crossAgentDependencies++;
        }
      }
    }
    
    // Count high priority tasks
    const highPriorityCount = tasks.filter(t => t.priority === 'high').length;
    
    // Determine collaboration level
    if (crossAgentDependencies > 2 || highPriorityCount > tasks.length / 2) {
      return 'high';
    } else if (crossAgentDependencies > 0 || highPriorityCount > 0) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  /**
   * Calculate the critical path of tasks (tasks that must be completed
   * in sequence and determine the minimum completion time)
   */
  private calculateCriticalPath(tasks: EnhancedAgentTask[]): string[] {
    // Simple critical path calculation
    const visited = new Set<string>();
    const criticalPath: string[] = [];
    
    // Define a recursive function to find the longest path
    const findLongestPath = (taskId: string, path: string[] = []): string[] => {
      if (visited.has(taskId)) return path;
      visited.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) return path;
      
      const newPath = [...path, taskId];
      
      // Find tasks that depend on this task
      const dependentTasks = tasks.filter(t => t.dependencies.includes(taskId));
      
      if (dependentTasks.length === 0) {
        return newPath;
      }
      
      // Recursively find the longest path
      let longestPath = newPath;
      for (const depTask of dependentTasks) {
        const pathThroughDepTask = findLongestPath(depTask.id, newPath);
        if (pathThroughDepTask.length > longestPath.length) {
          longestPath = pathThroughDepTask;
        }
      }
      
      return longestPath;
    };
    
    // Find starting tasks (no dependencies)
    const startingTasks = tasks.filter(t => t.dependencies.length === 0);
    
    // Find the longest path from any starting task
    let longestOverallPath: string[] = [];
    for (const startTask of startingTasks) {
      const path = findLongestPath(startTask.id);
      if (path.length > longestOverallPath.length) {
        longestOverallPath = path;
      }
    }
    
    return longestOverallPath;
  }
  
  /**
   * Enable direct communication between agents
   * 
   * @param fromAgentId - ID of the sending agent
   * @param toAgentId - ID of the receiving agent or 'broadcast' for all
   * @param content - Message content
   * @param type - Message type
   * @param relatedTaskId - Optional related task ID
   * @returns ID of the sent message
   */
  sendAgentMessage(
    fromAgentId: string,
    toAgentId: string | 'broadcast',
    content: string,
    type: AgentMessage['type'] = 'update',
    relatedTaskId?: string
  ): string {
    const message: AgentMessage = {
      id: uuidv4(),
      fromAgentId,
      toAgentId,
      content,
      timestamp: Date.now(),
      type,
      relatedTaskId
    };
    
    this.communicationLog.push(message);
    this.swarmLogger.debug('Agent message sent', { 
      from: fromAgentId, 
      to: toAgentId, 
      type 
    });
    
    // Emit event for the message
    this.emit('agent:message', message);
    
    return message.id;
  }
  
  /**
   * Get messages sent to a specific agent
   * 
   * @param agentId - ID of the agent
   * @returns Array of messages sent to the agent
   */
  getMessagesForAgent(agentId: string): AgentMessage[] {
    return this.communicationLog.filter(msg => 
      msg.toAgentId === agentId || msg.toAgentId === 'broadcast'
    );
  }
  
  /**
   * Get the coordinator agent
   * 
   * @returns The coordinator agent
   */
  getCoordinator(): Agent {
    // This assumes the parent class has a coordinator property
    // We'll need to access it through any potential method
    return (this as any).coordinator;
  }
}