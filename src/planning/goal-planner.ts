import { v4 as uuidv4 } from 'uuid';
import { LLMProviderInterface } from '../core/provider-interface';
import { Agent } from '../core/agent';
import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

/**
 * Different types of goals an agent might have
 */
export enum GoalType {
  INFORMATION = 'information',   // Goals about finding or learning information
  ACTION = 'action',             // Goals that require taking specific actions
  DECISION = 'decision',         // Goals that require making a decision
  MONITORING = 'monitoring',     // Goals about continuously checking for conditions
  CREATION = 'creation',         // Goals about creating content or artifacts
  COMMUNICATION = 'communication' // Goals about communicating with users or systems
}

/**
 * Status of a goal's execution
 */
export enum GoalStatus {
  PENDING = 'pending',           // Not yet started
  IN_PROGRESS = 'in_progress',   // Currently being worked on
  COMPLETED = 'completed',       // Successfully completed
  FAILED = 'failed',             // Failed to achieve
  BLOCKED = 'blocked',           // Waiting on dependencies
  CANCELLED = 'cancelled'        // Explicitly cancelled
}

/**
 * Structure representing a goal or sub-goal
 */
export interface Goal {
  id: string;                    // Unique identifier
  description: string;           // Human-readable description
  type: GoalType;                // Type of goal
  status: GoalStatus;            // Current status
  parentId?: string;             // Parent goal ID (if this is a sub-goal)
  successCriteria: string[];     // Criteria to determine if goal is achieved
  dependencies?: string[];       // IDs of goals that must be completed first
  priority: number;              // Priority (1-10, 10 being highest)
  deadline?: Date;               // Optional deadline
  recurrence?: string;           // Optional recurrence pattern (e.g., 'every 6 hours')
  metadata?: Record<string, any>; // Additional metadata
  createdAt: Date;               // When was this goal created
  updatedAt: Date;               // When was this goal last updated
}

/**
 * Task derived from a goal
 */
export interface GoalTask {
  id: string;                    // Unique identifier
  goalId: string;                // ID of the goal this task belongs to
  description: string;           // Description of what needs to be done
  status: GoalStatus;            // Current status
  toolsRequired?: string[];      // Names of tools needed for this task
  estimatedDuration?: number;    // Estimated time to complete (in minutes)
  result?: any;                  // Result of executing the task
  error?: string;                // Error message if task failed
  createdAt: Date;               // When was this task created
  updatedAt: Date;               // When was this task last updated
}

/**
 * Result of a goal execution
 */
export interface GoalResult {
  goalId: string;                // The goal that was executed
  success: boolean;              // Whether the goal was achieved
  subgoalResults?: GoalResult[]; // Results of sub-goals (if any)
  tasks: GoalTask[];             // Tasks that were executed
  insights: string[];            // Insights gained during execution
  nextSteps?: string[];          // Suggested next steps
}

/**
 * Configuration for the goal planner
 */
export interface GoalPlannerConfig {
  maxSubgoals?: number;          // Maximum number of sub-goals to create
  maxTasksPerGoal?: number;      // Maximum number of tasks per goal
  reflectionFrequency?: number;  // How often to reflect on progress (in minutes)
  adaptivePlanning?: boolean;    // Whether to adapt plans based on results
  defaultPriority?: number;      // Default priority for goals (1-10)
  defaultDeadlineDays?: number;  // Default deadline in days from creation
}

/**
 * A powerful system for breaking down high-level goals into manageable sub-goals
 * and tasks, with support for dependencies, priorities, and continuous monitoring.
 */
export class GoalPlanner {
  private goals: Map<string, Goal> = new Map();
  private tasks: Map<string, GoalTask> = new Map();
  private config: Required<GoalPlannerConfig>;
  private logger: Logger;
  private agent?: Agent;
  private provider?: LLMProviderInterface;

  /**
   * Creates a new goal planner
   * 
   * @param config - Configuration options
   */
  constructor(config: GoalPlannerConfig = {}) {
    this.config = {
      maxSubgoals: config.maxSubgoals ?? 10,
      maxTasksPerGoal: config.maxTasksPerGoal ?? 10,
      reflectionFrequency: config.reflectionFrequency ?? 60,
      adaptivePlanning: config.adaptivePlanning ?? true,
      defaultPriority: config.defaultPriority ?? 5,
      defaultDeadlineDays: config.defaultDeadlineDays ?? 7
    };
    
    this.logger = new Logger('GoalPlanner');
  }

  /**
   * Connects the goal planner to an agent
   * 
   * @param agent - The agent to connect
   * @returns The goal planner instance for chaining
   */
  connectAgent(agent: Agent): GoalPlanner {
    this.agent = agent;
    this.provider = agent.provider;
    return this;
  }

  /**
   * Creates a new main goal
   * 
   * @param description - Description of the goal
   * @param options - Additional goal options
   * @returns The created goal
   */
  async createMainGoal(
    description: string, 
    options: {
      type?: GoalType;
      successCriteria?: string[];
      priority?: number;
      deadline?: Date;
      recurrence?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<Goal> {
    const now = new Date();
    
    // Set default deadline if not provided
    const deadline = options.deadline || new Date(now.getTime() + this.config.defaultDeadlineDays * 24 * 60 * 60 * 1000);
    
    // Create the goal
    const goal: Goal = {
      id: uuidv4(),
      description,
      type: options.type || GoalType.INFORMATION,
      status: GoalStatus.PENDING,
      successCriteria: options.successCriteria || ['Goal completed successfully'],
      priority: options.priority || this.config.defaultPriority,
      deadline,
      recurrence: options.recurrence,
      metadata: options.metadata || {},
      createdAt: now,
      updatedAt: now
    };
    
    this.goals.set(goal.id, goal);
    this.logger.info(`Created main goal: ${description}`);
    
    return goal;
  }

  /**
   * Decomposes a goal into sub-goals using LLM
   * 
   * @param goalId - ID of the goal to decompose
   * @param availableTools - Tools available to the agent
   * @returns The updated goal with sub-goals
   */
  async decomposeGoal(goalId: string, availableTools: Tool[] = []): Promise<Goal[]> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    if (!this.provider) {
      throw new Error('Provider not available. Connect an agent first.');
    }
    
    this.logger.info(`Decomposing goal: ${goal.description}`);
    
    // Build a prompt to decompose the goal
    const toolDescriptions = availableTools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');
    
    const decompositionPrompt = `# Goal Decomposition

I need to break down the following high-level goal into specific, actionable sub-goals:

"${goal.description}"

## Available Tools
${toolDescriptions || "No specific tools available."}

## Context
${goal.metadata ? JSON.stringify(goal.metadata, null, 2) : "No additional context provided."}

${goal.deadline ? `Deadline: ${goal.deadline.toISOString()}` : ""}
${goal.recurrence ? `Recurrence: ${goal.recurrence}` : ""}

## Instructions
Please decompose this goal into 3-${this.config.maxSubgoals} sub-goals that:
1. Are specific and actionable
2. Collectively achieve the main goal
3. Can be sequenced with clear dependencies
4. Take advantage of available tools
5. Are appropriate for the goal type: ${goal.type}

For each sub-goal, provide:
- Clear description
- Goal type (information, action, decision, monitoring, creation, communication)
- 2-3 concrete success criteria
- Dependencies on other sub-goals (if any)
- Priority (1-10, 10 being highest)
- Estimated time to complete (optional)

Please format your response as a structured list of sub-goals.`;

    // Call the provider to generate sub-goals
    const result = await this.provider.generateResponse({
      messages: [
        { role: 'system', content: 'You are an expert goal planner that helps break down complex goals into actionable sub-goals.' },
        { role: 'user', content: decompositionPrompt }
      ]
    });
    
    // Parse the response and create sub-goals
    const subGoals = this.parseSubGoalsFromLLMResponse(result.message, goalId);
    
    // Add the sub-goals to our tracking
    for (const subGoal of subGoals) {
      this.goals.set(subGoal.id, subGoal);
    }
    
    this.logger.info(`Created ${subGoals.length} sub-goals for goal: ${goal.description}`);
    
    return subGoals;
  }

  /**
   * Parse sub-goals from LLM response
   * 
   * @param response - The LLM response text
   * @param parentGoalId - The parent goal ID
   * @returns Array of created sub-goals
   */
  private parseSubGoalsFromLLMResponse(response: string, parentGoalId: string): Goal[] {
    const subGoals: Goal[] = [];
    const now = new Date();
    
    // Look for patterns like:
    // 1. Sub-goal description
    // 2. Sub-goal: description
    // Sub-goal 1: description
    // - Sub-goal: description
    
    const lines = response.split('\n');
    let currentSubGoal: Partial<Goal> | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for new sub-goal indicators
      const subGoalMatch = line.match(/^(?:(?:\d+\.)|(?:Sub-goal \d+:)|(?:-)|(?:•))\s*(?:Sub-goal:)?\s*(.+)$/i);
      
      if (subGoalMatch || (line.toLowerCase().includes('sub-goal') && line.includes(':'))) {
        // If we were processing a previous sub-goal, save it
        if (currentSubGoal && currentSubGoal.description) {
          const goalId = uuidv4();
          
          // Create a complete goal object
          const completeGoal: Goal = {
            id: goalId,
            description: currentSubGoal.description,
            type: currentSubGoal.type || GoalType.ACTION,
            status: GoalStatus.PENDING,
            parentId: parentGoalId,
            successCriteria: currentSubGoal.successCriteria || ['Sub-goal completed successfully'],
            dependencies: currentSubGoal.dependencies || [],
            priority: currentSubGoal.priority || this.config.defaultPriority,
            createdAt: now,
            updatedAt: now
          };
          
          subGoals.push(completeGoal);
        }
        
        // Start a new sub-goal
        currentSubGoal = {
          description: subGoalMatch ? subGoalMatch[1] : line.split(':')[1].trim()
        };
      } 
      // Process attributes of the current sub-goal
      else if (currentSubGoal && line.length > 0) {
        // Look for type
        if (line.toLowerCase().includes('type:')) {
          const typeValue = line.split(':')[1].trim().toLowerCase();
          
          // Map to GoalType enum
          if (typeValue.includes('information')) {
            currentSubGoal.type = GoalType.INFORMATION;
          } else if (typeValue.includes('action')) {
            currentSubGoal.type = GoalType.ACTION;
          } else if (typeValue.includes('decision')) {
            currentSubGoal.type = GoalType.DECISION;
          } else if (typeValue.includes('monitoring')) {
            currentSubGoal.type = GoalType.MONITORING;
          } else if (typeValue.includes('creation')) {
            currentSubGoal.type = GoalType.CREATION;
          } else if (typeValue.includes('communication')) {
            currentSubGoal.type = GoalType.COMMUNICATION;
          }
        }
        
        // Look for success criteria
        else if (line.toLowerCase().includes('success criteria') || line.toLowerCase().includes('criteria:')) {
          currentSubGoal.successCriteria = [];
          
          // Look ahead for bullet points
          let j = i + 1;
          while (j < lines.length && (lines[j].trim().startsWith('-') || lines[j].trim().startsWith('*'))) {
            const criterion = lines[j].trim().substring(1).trim();
            if (criterion) {
              if (!currentSubGoal.successCriteria) {
                currentSubGoal.successCriteria = [];
              }
              currentSubGoal.successCriteria.push(criterion);
            }
            j++;
          }
          
          // If no bullet points were found, use the current line
          if (!currentSubGoal.successCriteria || currentSubGoal.successCriteria.length === 0) {
            const criteriaText = line.split(':')[1]?.trim();
            if (criteriaText) {
              currentSubGoal.successCriteria = [criteriaText];
            }
          }
        }
        
        // Look for dependencies
        else if (line.toLowerCase().includes('dependencies') || line.toLowerCase().includes('depends on')) {
          // We'll need to map these later since we don't have IDs yet
          const dependenciesText = line.split(':')[1]?.trim();
          if (dependenciesText) {
            // Use a type assertion to add the temporary property
            (currentSubGoal as any).dependenciesText = dependenciesText;
          }
        }
        
        // Look for priority
        else if (line.toLowerCase().includes('priority')) {
          const priorityText = line.split(':')[1]?.trim();
          if (priorityText) {
            // Try to extract a number 1-10
            const priorityMatch = priorityText.match(/(\d+)/);
            if (priorityMatch) {
              const priority = parseInt(priorityMatch[1]);
              currentSubGoal.priority = Math.min(Math.max(priority, 1), 10);
            }
          }
        }
      }
    }
    
    // Don't forget the last sub-goal
    if (currentSubGoal && currentSubGoal.description) {
      const goalId = uuidv4();
      
      // Create a complete goal object
      const completeGoal: Goal = {
        id: goalId,
        description: currentSubGoal.description,
        type: currentSubGoal.type || GoalType.ACTION,
        status: GoalStatus.PENDING,
        parentId: parentGoalId,
        successCriteria: currentSubGoal.successCriteria || ['Sub-goal completed successfully'],
        dependencies: currentSubGoal.dependencies || [],
        priority: currentSubGoal.priority || this.config.defaultPriority,
        createdAt: now,
        updatedAt: now
      };
      
      subGoals.push(completeGoal);
    }
    
    // Now resolve dependencies by description matching
    this.resolveDependenciesByDescription(subGoals);
    
    return subGoals;
  }

  /**
   * Resolve dependencies between sub-goals based on descriptions
   * 
   * @param subGoals - The array of sub-goals to process
   */
  private resolveDependenciesByDescription(subGoals: Goal[]): void {
    for (const subGoal of subGoals) {
      const partialGoal = subGoal as any;
      
      if (partialGoal.dependenciesText) {
        const dependencies: string[] = [];
        
        // Check if any other sub-goal matches the dependency description
        for (const otherGoal of subGoals) {
          if (otherGoal.id !== subGoal.id) {
            // Simple substring match for now
            if (partialGoal.dependenciesText.toLowerCase().includes(otherGoal.description.toLowerCase())) {
              dependencies.push(otherGoal.id);
            }
            // Also check for number/index references
            const match = partialGoal.dependenciesText.match(/sub-?goal\s*(\d+)/i);
            if (match) {
              const index = parseInt(match[1]) - 1;
              if (index >= 0 && index < subGoals.length) {
                dependencies.push(subGoals[index].id);
              }
            }
          }
        }
        
        subGoal.dependencies = dependencies;
        delete partialGoal.dependenciesText;
      }
    }
  }

  /**
   * Generates specific tasks for a goal using LLM
   * 
   * @param goalId - ID of the goal
   * @param availableTools - Tools available to the agent
   * @returns Array of tasks
   */
  async generateTasks(goalId: string, availableTools: Tool[] = []): Promise<GoalTask[]> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    if (!this.provider) {
      throw new Error('Provider not available. Connect an agent first.');
    }
    
    this.logger.info(`Generating tasks for goal: ${goal.description}`);
    
    // Build a prompt to generate tasks
    const toolDescriptions = availableTools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');
    
    const taskGenerationPrompt = `# Task Generation

I need to create specific, executable tasks for the following goal:

"${goal.description}"

## Goal Type
${goal.type}

## Success Criteria
${goal.successCriteria.map(c => `- ${c}`).join('\n')}

## Available Tools
${toolDescriptions || "No specific tools available."}

## Instructions
Please generate 2-${this.config.maxTasksPerGoal} concrete tasks that:
1. Are specific and directly executable
2. Collectively achieve the goal
3. Are sequenced in a logical order
4. Make effective use of available tools

For each task, provide:
- Clear description of what to do
- Which tool(s) would be helpful for this task
- Estimated time to complete (in minutes)

Please format your response as a structured list of tasks.`;

    // Call the provider to generate tasks
    const result = await this.provider.generateResponse({
      messages: [
        { role: 'system', content: 'You are an expert task planner that helps break down goals into concrete executable tasks.' },
        { role: 'user', content: taskGenerationPrompt }
      ]
    });
    
    // Parse the response and create tasks
    const tasks = this.parseTasksFromLLMResponse(result.message, goalId);
    
    // Add the tasks to our tracking
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
    
    this.logger.info(`Created ${tasks.length} tasks for goal: ${goal.description}`);
    
    return tasks;
  }

  /**
   * Parse tasks from LLM response
   * 
   * @param response - The LLM response text
   * @param goalId - The goal ID
   * @returns Array of created tasks
   */
  private parseTasksFromLLMResponse(response: string, goalId: string): GoalTask[] {
    const tasks: GoalTask[] = [];
    const now = new Date();
    
    // Parse tasks similar to sub-goals
    const lines = response.split('\n');
    let currentTask: Partial<GoalTask> | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for new task indicators
      const taskMatch = line.match(/^(?:(?:\d+\.)|(?:Task \d+:)|(?:-)|(?:•))\s*(?:Task:)?\s*(.+)$/i);
      
      if (taskMatch || (line.toLowerCase().includes('task') && line.includes(':'))) {
        // If we were processing a previous task, save it
        if (currentTask && currentTask.description) {
          const taskId = uuidv4();
          
          // Create a complete task object
          const completeTask: GoalTask = {
            id: taskId,
            goalId: goalId,
            description: currentTask.description,
            status: GoalStatus.PENDING,
            toolsRequired: currentTask.toolsRequired || [],
            estimatedDuration: currentTask.estimatedDuration,
            createdAt: now,
            updatedAt: now
          };
          
          tasks.push(completeTask);
        }
        
        // Start a new task
        currentTask = {
          description: taskMatch ? taskMatch[1] : line.split(':')[1].trim()
        };
      } 
      // Process attributes of the current task
      else if (currentTask && line.length > 0) {
        // Look for tools
        if (line.toLowerCase().includes('tool') || line.toLowerCase().includes('tools')) {
          const toolsText = line.split(':')[1]?.trim();
          if (toolsText) {
            // Extract tool names from text
            const toolNames = toolsText.split(/[,;]/)
              .map(t => t.trim())
              .filter(t => t.length > 0);
              
            currentTask.toolsRequired = toolNames;
          }
        }
        
        // Look for estimated duration
        else if (line.toLowerCase().includes('time') || line.toLowerCase().includes('duration') || line.toLowerCase().includes('estimate')) {
          const durationText = line.split(':')[1]?.trim();
          if (durationText) {
            // Try to extract minutes
            const durationMatch = durationText.match(/(\d+)/);
            if (durationMatch) {
              currentTask.estimatedDuration = parseInt(durationMatch[1]);
            }
          }
        }
      }
    }
    
    // Don't forget the last task
    if (currentTask && currentTask.description) {
      const taskId = uuidv4();
      
      // Create a complete task object
      const completeTask: GoalTask = {
        id: taskId,
        goalId: goalId,
        description: currentTask.description,
        status: GoalStatus.PENDING,
        toolsRequired: currentTask.toolsRequired || [],
        estimatedDuration: currentTask.estimatedDuration,
        createdAt: now,
        updatedAt: now
      };
      
      tasks.push(completeTask);
    }
    
    return tasks;
  }

  /**
   * Executes a task using the connected agent
   * 
   * @param taskId - ID of the task to execute
   * @param availableTools - Tools that can be used
   * @returns The updated task with results
   */
  async executeTask(taskId: string, availableTools: Tool[] = []): Promise<GoalTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }
    
    if (!this.agent) {
      throw new Error('Agent not available. Connect an agent first.');
    }
    
    this.logger.info(`Executing task: ${task.description}`);
    
    // Update task status
    task.status = GoalStatus.IN_PROGRESS;
    task.updatedAt = new Date();
    this.tasks.set(task.id, task);
    
    try {
      // Filter tools if task specifies required tools
      let toolsToUse = availableTools;
      if (task.toolsRequired && task.toolsRequired.length > 0) {
        toolsToUse = availableTools.filter(tool => 
          task.toolsRequired?.includes(tool.name)
        );
      }
      
      // Execute the task using the agent
      const result = await this.agent.run({
        task: task.description,
        tools: toolsToUse
      });
      
      // Update task with result
      task.result = {
        response: result.response,
        toolCalls: result.toolCalls
      };
      task.status = GoalStatus.COMPLETED;
      task.updatedAt = new Date();
      this.tasks.set(task.id, task);
      
      this.logger.info(`Successfully completed task: ${task.description}`);
    } catch (error) {
      // Update task with error
      task.status = GoalStatus.FAILED;
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date();
      this.tasks.set(task.id, task);
      
      this.logger.error(`Failed to execute task: ${task.description}`, error);
    }
    
    return task;
  }

  /**
   * Evaluates whether a goal has been achieved based on success criteria
   * 
   * @param goalId - ID of the goal to evaluate
   * @returns Evaluation result
   */
  async evaluateGoalSuccess(goalId: string): Promise<{ success: boolean; reasons: string[] }> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    if (!this.provider) {
      throw new Error('Provider not available. Connect an agent first.');
    }
    
    this.logger.info(`Evaluating goal success: ${goal.description}`);
    
    // Gather all tasks for this goal
    const goalTasks = Array.from(this.tasks.values())
      .filter(task => task.goalId === goalId);
    
    // Build a prompt for evaluation
    const tasksWithResults = goalTasks.map(task => {
      let result = '';
      if (task.result) {
        result = typeof task.result === 'string' 
          ? task.result 
          : JSON.stringify(task.result, null, 2);
      } else if (task.error) {
        result = `ERROR: ${task.error}`;
      }
      
      return `Task: ${task.description}
Status: ${task.status}
${result ? `Result: ${result}` : 'No result available'}`;
    }).join('\n\n');
    
    const evaluationPrompt = `# Goal Evaluation

I need to evaluate whether the following goal has been achieved:

"${goal.description}"

## Success Criteria
${goal.successCriteria.map(c => `- ${c}`).join('\n')}

## Tasks Completed
${tasksWithResults || "No tasks were completed for this goal."}

## Instructions
Based on the success criteria and the results of completed tasks, please evaluate whether the goal has been achieved.

Please provide:
1. A clear YES or NO determination of whether the goal was achieved
2. Specific reasons supporting your determination, referencing the success criteria
3. Any insights or observations about the goal achievement

Format your response in a structured way that clearly indicates your final determination.`;

    // Call the provider to evaluate success
    const result = await this.provider.generateResponse({
      messages: [
        { role: 'system', content: 'You are an expert evaluator that objectively assesses whether goals have been achieved.' },
        { role: 'user', content: evaluationPrompt }
      ]
    });
    
    // Parse the evaluation result
    const evaluation = this.parseEvaluationFromLLMResponse(result.message);
    
    // Update goal status based on evaluation
    if (evaluation.success) {
      goal.status = GoalStatus.COMPLETED;
    } else {
      // If all tasks completed but goal still not achieved, mark as failed
      const allTasksCompleted = goalTasks.every(task => 
        task.status === GoalStatus.COMPLETED
      );
      
      if (allTasksCompleted) {
        goal.status = GoalStatus.FAILED;
      }
    }
    
    goal.updatedAt = new Date();
    this.goals.set(goal.id, goal);
    
    this.logger.info(`Goal evaluation complete: ${goal.description}, Success: ${evaluation.success}`);
    
    return evaluation;
  }

  /**
   * Parse evaluation results from LLM response
   * 
   * @param response - The LLM response text
   * @returns Parsed evaluation result
   */
  private parseEvaluationFromLLMResponse(response: string): { success: boolean; reasons: string[] } {
    // Default result
    const result = {
      success: false,
      reasons: [] as string[]
    };
    
    // Look for yes/no determination
    if (response.toLowerCase().includes('yes, the goal was achieved') || 
        response.toLowerCase().includes('goal has been achieved') ||
        response.toLowerCase().includes('determination: yes') || 
        /\byes\b/i.test(response)) {
      result.success = true;
    }
    
    // Extract reasons
    const reasonMatches = [
      ...response.matchAll(/reason \d+:? (.*?)(?=\n|$)/gi),
      ...response.matchAll(/- (.*?)(?=\n|$)/g)
    ];
    
    if (reasonMatches) {
      for (const match of reasonMatches) {
        if (match[1] && match[1].trim()) {
          result.reasons.push(match[1].trim());
        }
      }
    }
    
    return result;
  }

  /**
   * Reflect on goal progress and adapt the plan if needed
   * 
   * @param goalId - ID of the goal to reflect on
   * @param availableTools - Tools available to the agent
   * @returns Updated plan information
   */
  async reflectAndAdapt(goalId: string, availableTools: Tool[] = []): Promise<{
    insights: string[];
    adaptations: string[];
    newTasks?: GoalTask[];
  }> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    if (!this.provider) {
      throw new Error('Provider not available. Connect an agent first.');
    }
    
    this.logger.info(`Reflecting on goal progress: ${goal.description}`);
    
    // Gather all tasks for this goal
    const goalTasks = Array.from(this.tasks.values())
      .filter(task => task.goalId === goalId);
    
    // Build a prompt for reflection
    const completedTasks = goalTasks
      .filter(task => task.status === GoalStatus.COMPLETED)
      .map(task => `Task: ${task.description}\nResult: ${JSON.stringify(task.result, null, 2)}`)
      .join('\n\n');
      
    const failedTasks = goalTasks
      .filter(task => task.status === GoalStatus.FAILED)
      .map(task => `Task: ${task.description}\nError: ${task.error}`)
      .join('\n\n');
      
    const pendingTasks = goalTasks
      .filter(task => task.status === GoalStatus.PENDING || task.status === GoalStatus.IN_PROGRESS)
      .map(task => `Task: ${task.description}\nStatus: ${task.status}`)
      .join('\n\n');
    
    const reflectionPrompt = `# Goal Reflection and Adaptation

I need to reflect on the progress toward the following goal and adapt the plan if needed:

"${goal.description}"

## Success Criteria
${goal.successCriteria.map(c => `- ${c}`).join('\n')}

## Progress Summary
Completed Tasks: ${goalTasks.filter(t => t.status === GoalStatus.COMPLETED).length}
Failed Tasks: ${goalTasks.filter(t => t.status === GoalStatus.FAILED).length}
Pending Tasks: ${goalTasks.filter(t => t.status === GoalStatus.PENDING || t.status === GoalStatus.IN_PROGRESS).length}

## Completed Tasks
${completedTasks || "No tasks have been completed yet."}

## Failed Tasks
${failedTasks || "No tasks have failed."}

## Pending Tasks
${pendingTasks || "No tasks are pending."}

## Available Tools
${availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n') || "No specific tools available."}

## Instructions
Please reflect on the progress so far and suggest adaptations to the plan:

1. What insights can we draw from the completed and failed tasks?
2. Is the current approach working, or do we need to change direction?
3. Should any failed tasks be retried or replaced with alternative approaches?
4. Are there new tasks that should be added based on what we've learned?
5. Are we on track to meet the success criteria?

Provide:
- 3-5 key insights from progress so far
- Specific adaptations to the plan
- 1-3 new tasks if needed, with clear descriptions`;

    // Call the provider for reflection
    const result = await this.provider.generateResponse({
      messages: [
        { role: 'system', content: 'You are an expert at adapting plans based on progress and feedback.' },
        { role: 'user', content: reflectionPrompt }
      ]
    });
    
    // Parse the reflection result
    const reflection = this.parseReflectionFromLLMResponse(result.message, goalId);
    
    // If there are new tasks, add them
    if (reflection.newTasks && reflection.newTasks.length > 0) {
      for (const task of reflection.newTasks) {
        this.tasks.set(task.id, task);
      }
    }
    
    this.logger.info(`Reflection complete for goal: ${goal.description}, ${reflection.adaptations.length} adaptations suggested`);
    
    return reflection;
  }

  /**
   * Parse reflection results from LLM response
   * 
   * @param response - The LLM response text
   * @param goalId - The goal ID for new tasks
   * @returns Parsed reflection result
   */
  private parseReflectionFromLLMResponse(
    response: string, 
    goalId: string
  ): { insights: string[]; adaptations: string[]; newTasks?: GoalTask[] } {
    const result = {
      insights: [] as string[],
      adaptations: [] as string[],
      newTasks: [] as GoalTask[]
    };
    
    const lines = response.split('\n');
    let section: 'insights' | 'adaptations' | 'tasks' | null = null;
    let currentTaskDescription = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Determine section
      if (line.toLowerCase().includes('insight') || line.toLowerCase().includes('insights')) {
        section = 'insights';
        continue;
      } else if (line.toLowerCase().includes('adaptation') || line.toLowerCase().includes('adapt')) {
        section = 'adaptations';
        continue;
      } else if (line.toLowerCase().includes('new task') || line.toLowerCase().includes('additional task')) {
        section = 'tasks';
        continue;
      }
      
      // Skip empty lines and headers
      if (!line || line.startsWith('#') || line.startsWith('==')) {
        continue;
      }
      
      // Process based on section
      if (section === 'insights' && (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))) {
        const insight = line.replace(/^[*-]\s*|\d+\.\s*/, '').trim();
        if (insight) {
          result.insights.push(insight);
        }
      } else if (section === 'adaptations' && (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))) {
        const adaptation = line.replace(/^[*-]\s*|\d+\.\s*/, '').trim();
        if (adaptation) {
          result.adaptations.push(adaptation);
        }
      } else if (section === 'tasks') {
        // Check for new task marker
        if ((line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./)) && line.length > 2) {
          // If we were accumulating a previous task, save it
          if (currentTaskDescription) {
            result.newTasks.push(this.createTaskFromDescription(currentTaskDescription, goalId));
          }
          
          // Start a new task
          currentTaskDescription = line.replace(/^[*-]\s*|\d+\.\s*/, '').trim();
        } 
        // Continue accumulating the current task description
        else if (currentTaskDescription && line) {
          currentTaskDescription += ' ' + line;
        }
      }
    }
    
    // Don't forget the last task
    if (currentTaskDescription) {
      result.newTasks.push(this.createTaskFromDescription(currentTaskDescription, goalId));
    }
    
    return result;
  }

  /**
   * Create a task object from a description
   * 
   * @param description - Task description
   * @param goalId - Goal ID
   * @returns Created task object
   */
  private createTaskFromDescription(description: string, goalId: string): GoalTask {
    const now = new Date();
    return {
      id: uuidv4(),
      goalId: goalId,
      description: description,
      status: GoalStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Execute a goal completely, including decomposition, task generation, execution, 
   * and evaluation, with optional adaptation
   * 
   * @param goalId - ID of the goal to execute
   * @param availableTools - Tools available to the agent
   * @param options - Execution options
   * @returns Complete goal execution result
   */
  async executeGoal(
    goalId: string, 
    availableTools: Tool[] = [], 
    options: {
      maxReflections?: number;
      reflectAfterTaskCount?: number;
      stopOnFailure?: boolean;
    } = {}
  ): Promise<GoalResult> {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    if (!this.agent) {
      throw new Error('Agent not available. Connect an agent first.');
    }
    
    this.logger.info(`Executing goal: ${goal.description}`);
    
    // Set default options
    const maxReflections = options.maxReflections ?? 2;
    const reflectAfterTaskCount = options.reflectAfterTaskCount ?? 3;
    const stopOnFailure = options.stopOnFailure ?? false;
    
    // Initialize the goal result
    const result: GoalResult = {
      goalId: goal.id,
      success: false,
      tasks: [],
      insights: []
    };
    
    try {
      // Update goal status
      goal.status = GoalStatus.IN_PROGRESS;
      goal.updatedAt = new Date();
      this.goals.set(goal.id, goal);
      
      // Step 1: Break goal into sub-goals if it doesn't have any yet
      let subGoals: Goal[] = Array.from(this.goals.values())
        .filter(g => g.parentId === goalId);
        
      if (subGoals.length === 0) {
        subGoals = await this.decomposeGoal(goalId, availableTools);
      }
      
      // For each sub-goal in order of dependencies and priority
      const sortedSubGoals = this.sortGoalsByDependenciesAndPriority(subGoals);
      const subGoalResults: GoalResult[] = [];
      
      for (const subGoal of sortedSubGoals) {
        // Check if dependencies are satisfied
        const dependencies = subGoal.dependencies || [];
        const unsatisfiedDependencies = dependencies.filter(depId => {
          const depGoal = this.goals.get(depId);
          return depGoal && depGoal.status !== GoalStatus.COMPLETED;
        });
        
        if (unsatisfiedDependencies.length > 0) {
          this.logger.info(`Skipping sub-goal "${subGoal.description}" because dependencies are not met`);
          subGoal.status = GoalStatus.BLOCKED;
          subGoal.updatedAt = new Date();
          this.goals.set(subGoal.id, subGoal);
          continue;
        }
        
        // Update sub-goal status
        subGoal.status = GoalStatus.IN_PROGRESS;
        subGoal.updatedAt = new Date();
        this.goals.set(subGoal.id, subGoal);
        
        // Step 2: Generate tasks for the sub-goal
        let tasks = await this.generateTasks(subGoal.id, availableTools);
        
        // Step 3: Execute tasks
        let completedTaskCount = 0;
        let reflectionCount = 0;
        let allTasksSuccessful = true;
        
        for (let i = 0; i < tasks.length; i++) {
          // Execute the task
          const task = await this.executeTask(tasks[i].id, availableTools);
          result.tasks.push(task);
          
          // Check for failure
          if (task.status === GoalStatus.FAILED) {
            allTasksSuccessful = false;
            
            if (stopOnFailure) {
              this.logger.info(`Stopping goal execution due to task failure: ${task.description}`);
              break;
            }
          }
          
          // Increment completed task count if task was attempted
          if (task.status !== GoalStatus.PENDING) {
            completedTaskCount++;
          }
          
          // Reflect and adapt if needed
          if (this.config.adaptivePlanning && 
              reflectionCount < maxReflections && 
              completedTaskCount % reflectAfterTaskCount === 0 && 
              i < tasks.length - 1) {
            
            const reflection = await this.reflectAndAdapt(subGoal.id, availableTools);
            result.insights.push(...reflection.insights);
            
            // If there are new tasks, add them to the queue
            if (reflection.newTasks && reflection.newTasks.length > 0) {
              tasks = [...tasks, ...reflection.newTasks];
            }
            
            reflectionCount++;
          }
        }
        
        // Step 4: Evaluate if the sub-goal was achieved
        const evaluation = await this.evaluateGoalSuccess(subGoal.id);
        
        // Record sub-goal result
        const subGoalResult: GoalResult = {
          goalId: subGoal.id,
          success: evaluation.success,
          tasks: tasks.filter(t => result.tasks.some(rt => rt.id === t.id)),
          insights: evaluation.reasons
        };
        
        subGoalResults.push(subGoalResult);
        
        // If this sub-goal failed and we're stopping on failure, break the loop
        if (!evaluation.success && stopOnFailure) {
          this.logger.info(`Stopping goal execution due to sub-goal failure: ${subGoal.description}`);
          break;
        }
      }
      
      // Step 5: Final evaluation of the main goal
      const finalEvaluation = await this.evaluateGoalSuccess(goalId);
      
      // Update result
      result.success = finalEvaluation.success;
      result.insights.push(...finalEvaluation.reasons);
      result.subgoalResults = subGoalResults;
      
      this.logger.info(`Goal execution complete: ${goal.description}, Success: ${result.success}`);
      
      return result;
    } catch (error) {
      this.logger.error(`Error executing goal: ${goal.description}`, error);
      
      // Update goal status
      goal.status = GoalStatus.FAILED;
      goal.updatedAt = new Date();
      this.goals.set(goal.id, goal);
      
      // Update result
      result.success = false;
      result.insights.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      return result;
    }
  }

  /**
   * Sort goals by dependencies and priority
   * 
   * @param goals - Array of goals to sort
   * @returns Sorted goals
   */
  private sortGoalsByDependenciesAndPriority(goals: Goal[]): Goal[] {
    // Create a copy to sort
    const sortableGoals = [...goals];
    
    // Sort by dependencies first (topological sort), then by priority (descending)
    return sortableGoals.sort((a, b) => {
      // If B depends on A, A comes first
      if (b.dependencies?.includes(a.id)) {
        return -1;
      }
      
      // If A depends on B, B comes first
      if (a.dependencies?.includes(b.id)) {
        return 1;
      }
      
      // Otherwise sort by priority (higher priority first)
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  /**
   * Gets all goals
   * 
   * @returns Array of all goals
   */
  getGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  /**
   * Gets all tasks
   * 
   * @returns Array of all tasks
   */
  getTasks(): GoalTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Gets a goal by ID
   * 
   * @param goalId - ID of the goal
   * @returns The goal or undefined if not found
   */
  getGoal(goalId: string): Goal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * Gets a task by ID
   * 
   * @param taskId - ID of the task
   * @returns The task or undefined if not found
   */
  getTask(taskId: string): GoalTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Gets tasks for a goal
   * 
   * @param goalId - ID of the goal
   * @returns Array of tasks for the goal
   */
  getTasksForGoal(goalId: string): GoalTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.goalId === goalId);
  }

  /**
   * Gets sub-goals for a goal
   * 
   * @param goalId - ID of the parent goal
   * @returns Array of sub-goals
   */
  getSubGoals(goalId: string): Goal[] {
    return Array.from(this.goals.values())
      .filter(goal => goal.parentId === goalId);
  }

  /**
   * Clears all goals and tasks
   */
  clear(): void {
    this.goals.clear();
    this.tasks.clear();
    this.logger.info('Cleared all goals and tasks');
  }
}