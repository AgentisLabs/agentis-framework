import { v4 as uuidv4 } from 'uuid';
import { Agent } from '../core/agent';
import { RunOptions, RunResult, AgentEvent } from '../core/types';
import { 
  Plan, 
  PlanTask, 
  PlannerInterface, 
  PlanOptions, 
  PlanningStrategy 
} from './planner-interface';
import { 
  createHierarchicalPlanningPrompt, 
  createPlanningPrompt, 
  createReplanningPrompt 
} from '../utils/prompt-utils';
import { Logger } from '../utils/logger';

/**
 * Enhanced planner implementation that supports hierarchical planning,
 * parallel execution, and adaptive replanning
 */
export class EnhancedPlanner implements PlannerInterface {
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger('EnhancedPlanner');
  }
  
  /**
   * Creates a plan based on the selected strategy
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param options - Planning options
   * @returns Promise resolving to the created plan
   */
  async createPlan(task: string, agent: Agent, options?: PlanOptions): Promise<Plan> {
    const planOptions = {
      strategy: PlanningStrategy.HIERARCHICAL,
      maxParallelTasks: 3,
      maxRetries: 2,
      timeout: 600000, // 10 minutes
      agents: [agent],
      resourceConstraints: {},
      _skipPlanning: false,
      ...options
    };
    
    this.logger.debug('Creating plan', { task, strategy: planOptions.strategy });
    
    // Select the appropriate planning method based on strategy
    switch (planOptions.strategy) {
      case PlanningStrategy.HIERARCHICAL:
        return this.createHierarchicalPlan(task, agent, planOptions);
      case PlanningStrategy.PARALLEL:
        return this.createParallelPlan(task, agent, planOptions);
      case PlanningStrategy.ADAPTIVE:
        return this.createAdaptivePlan(task, agent, planOptions);
      case PlanningStrategy.SEQUENTIAL:
      default:
        return this.createSequentialPlan(task, agent, planOptions);
    }
  }
  
  /**
   * Creates a sequential plan (tasks executed one after another)
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param planOptions - Planning options
   * @returns Promise resolving to the created plan
   */
  private async createSequentialPlan(
    task: string, 
    agent: Agent, 
    planOptions: PlanOptions & {
      strategy: PlanningStrategy;
      maxParallelTasks: number;
      maxRetries: number;
      timeout: number;
      agents: Agent[];
      resourceConstraints: Record<string, number>;
      _skipPlanning: boolean;
    }
  ): Promise<Plan> {
    // Generate a planning prompt
    const planningPrompt = createPlanningPrompt(task, 'sequential');
    
    // Ask the LLM to break down the task
    const planResult = await agent.run({
      task: planningPrompt,
    });
    
    // Parse the response into tasks
    const taskDescriptions = this.parseTasksFromResponse(planResult.response);
    
    // Create sequential tasks with simple next-item dependencies
    const tasks: PlanTask[] = [];
    let previousTaskId: string | null = null;
    
    for (const description of taskDescriptions) {
      const taskId = uuidv4();
      
      const task: PlanTask = {
        id: taskId,
        description,
        dependencies: previousTaskId ? [previousTaskId] : [],
        status: 'pending',
        priority: 1,
        estimatedDuration: 60000, // Default 1 minute
      };
      
      tasks.push(task);
      previousTaskId = taskId;
    }
    
    // Create the plan object
    const plan: Plan = {
      id: uuidv4(),
      originalTask: task,
      tasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created',
      progress: 0,
      estimatedCompletionTime: Date.now() + (tasks.length * 60000), // Rough estimate
      metadata: {
        strategy: PlanningStrategy.SEQUENTIAL,
        planOptions
      }
    };
    
    this.logger.info('Sequential plan created', { planId: plan.id, taskCount: plan.tasks.length });
    return plan;
  }
  
  /**
   * Creates a parallel plan (independent tasks can run concurrently)
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param planOptions - Planning options
   * @returns Promise resolving to the created plan
   */
  private async createParallelPlan(
    task: string, 
    agent: Agent, 
    planOptions: PlanOptions & {
      strategy: PlanningStrategy;
      maxParallelTasks: number;
      maxRetries: number;
      timeout: number;
      agents: Agent[];
      resourceConstraints: Record<string, number>;
      _skipPlanning: boolean;
    }
  ): Promise<Plan> {
    // Generate a planning prompt
    const planningPrompt = createPlanningPrompt(task, 'parallel');
    
    // Ask the LLM to break down the task
    const planResult = await agent.run({
      task: planningPrompt,
    });
    
    // Parse the response into tasks
    const taskDescriptions = this.parseTasksFromResponse(planResult.response);
    
    // Create tasks (we'll set dependencies in a second pass)
    const tasks: PlanTask[] = taskDescriptions.map(description => {
      return {
        id: uuidv4(),
        description,
        dependencies: [], // Will be populated later
        status: 'pending',
        priority: 1,
        estimatedDuration: 60000, // Default 1 minute
      };
    });
    
    // Now ask the LLM to analyze dependencies
    const dependencyPrompt = `
      I've broken down the complex task "${task}" into the following steps:
      
      ${tasks.map((t, i) => `${i+1}. ${t.description} (ID: ${t.id})`).join('\n')}
      
      For each task, please identify which other tasks (if any) it depends on to start.
      A task with dependencies can only start after ALL its dependencies are completed.
      
      Format your response as:
      
      Task 1 (${tasks[0].id}): [list of dependency IDs, or "none"]
      Task 2 (${tasks.length > 1 ? tasks[1].id : 'example-id'}): [list of dependency IDs, or "none"]
      ...and so on
    `;
    
    const dependencyResult = await agent.run({
      task: dependencyPrompt,
    });
    
    // Parse dependencies from the response
    this.parseDependencies(dependencyResult.response, tasks);
    
    // Create the plan object
    const plan: Plan = {
      id: uuidv4(),
      originalTask: task,
      tasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created',
      progress: 0,
      estimatedCompletionTime: this.estimateCompletionTime(tasks, planOptions.maxParallelTasks),
      metadata: {
        strategy: PlanningStrategy.PARALLEL,
        planOptions
      }
    };
    
    this.logger.info('Parallel plan created', { planId: plan.id, taskCount: tasks.length });
    return plan;
  }
  
  /**
   * Creates a hierarchical plan (tasks can have subtasks)
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param planOptions - Planning options
   * @returns Promise resolving to the created plan
   */
  private async createHierarchicalPlan(
    task: string, 
    agent: Agent, 
    planOptions: PlanOptions & {
      strategy: PlanningStrategy;
      maxParallelTasks: number;
      maxRetries: number;
      timeout: number;
      agents: Agent[];
      resourceConstraints: Record<string, number>;
      _skipPlanning: boolean;
    }
  ): Promise<Plan> {
    // Generate a hierarchical planning prompt
    const planningPrompt = createHierarchicalPlanningPrompt(task);
    
    // Ask the LLM to create a hierarchical plan
    const planResult = await agent.run({
      task: planningPrompt,
    });
    
    // Parse the response into hierarchical tasks
    const tasks = this.parseHierarchicalPlan(planResult.response);
    
    // Create the plan object
    const plan: Plan = {
      id: uuidv4(),
      originalTask: task,
      tasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created',
      progress: 0,
      estimatedCompletionTime: this.estimateCompletionTime(tasks, planOptions.maxParallelTasks),
      metadata: {
        strategy: PlanningStrategy.HIERARCHICAL,
        planOptions
      }
    };
    
    this.logger.info('Hierarchical plan created', { 
      planId: plan.id, 
      taskCount: this.countTotalTasks(tasks) 
    });
    
    return plan;
  }
  
  /**
   * Creates an adaptive plan (replan on failures)
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param planOptions - Planning options
   * @returns Promise resolving to the created plan
   */
  private async createAdaptivePlan(
    task: string, 
    agent: Agent, 
    planOptions: PlanOptions & {
      strategy: PlanningStrategy;
      maxParallelTasks: number;
      maxRetries: number;
      timeout: number;
      agents: Agent[];
      resourceConstraints: Record<string, number>;
      _skipPlanning: boolean;
    }
  ): Promise<Plan> {
    // Start with a hierarchical plan
    const plan = await this.createHierarchicalPlan(task, agent, planOptions);
    
    // Add adaptive metadata
    plan.metadata = {
      ...plan.metadata,
      strategy: PlanningStrategy.ADAPTIVE,
      adaptiveOptions: {
        replanningThreshold: 0.3, // Replan if 30% of tasks fail
        maxReplans: 3,
        currentReplanCount: 0
      }
    };
    
    this.logger.info('Adaptive plan created', { 
      planId: plan.id, 
      taskCount: this.countTotalTasks(plan.tasks) 
    });
    
    return plan;
  }
  
  /**
   * Executes a plan using an agent
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  async executePlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    this.logger.info('Executing plan', { planId: plan.id, strategy: plan.metadata?.strategy });
    
    // Update plan status
    let currentPlan: Plan = { 
      ...plan, 
      status: 'in_progress', 
      updated: Date.now() 
    };
    
    // Select execution strategy based on plan type
    const strategy = plan.metadata?.strategy as PlanningStrategy || PlanningStrategy.SEQUENTIAL;
    
    switch (strategy) {
      case PlanningStrategy.PARALLEL:
        return this.executeParallelPlan(currentPlan, agent, options);
      case PlanningStrategy.HIERARCHICAL:
        return this.executeHierarchicalPlan(currentPlan, agent, options);
      case PlanningStrategy.ADAPTIVE:
        return this.executeAdaptivePlan(currentPlan, agent, options);
      case PlanningStrategy.SEQUENTIAL:
      default:
        return this.executeSequentialPlan(currentPlan, agent, options);
    }
  }
  
  /**
   * Executes a sequential plan
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeSequentialPlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    let currentPlan = { ...plan };
    const results: string[] = [];
    
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
      
      // Update status to in_progress
      currentPlan = this.updateTaskStatus(currentPlan, task.id, 'in_progress');
      
      // Emit progress event
      agent.emit(AgentEvent.THINKING, { 
        message: `Executing task: ${task.description}` 
      });
      
      try {
        // Execute the task
        const taskResult = await agent.run({
          ...options,
          task: task.description,
        });
        
        // Store the result
        results.push(taskResult.response);
        
        // Update task status
        currentPlan = this.updateTaskStatus(
          currentPlan, 
          task.id, 
          'completed', 
          taskResult.response
        );
        
        // Update progress
        const completedCount = currentPlan.tasks.filter(t => t.status === 'completed').length;
        currentPlan = {
          ...currentPlan,
          progress: Math.round((completedCount / currentPlan.tasks.length) * 100)
        };
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
        updated: Date.now(),
        progress: 100
      };
    }
    
    return this.generateSummary(currentPlan, agent, options);
  }
  
  /**
   * Executes a parallel plan
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeParallelPlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    let currentPlan = { ...plan };
    
    // Get maximum parallel tasks
    const maxParallelTasks = (currentPlan.metadata?.planOptions as Required<PlanOptions>)?.maxParallelTasks || 3;
    
    // Keep track of all tasks
    const allTasks = [...currentPlan.tasks];
    const pendingTasks = currentPlan.tasks.filter(task => task.status === 'pending');
    const completedTasks: PlanTask[] = [];
    const failedTasks: PlanTask[] = [];
    let inProgressTasks: PlanTask[] = [];
    
    // Process tasks until all are done or the plan fails
    while (pendingTasks.length > 0 || inProgressTasks.length > 0) {
      // Find tasks that can be started (all dependencies completed)
      const tasksToStart = pendingTasks
        .filter(task => {
          if (task.dependencies.length === 0) return true;
          
          const dependencies = allTasks.filter(t => task.dependencies.includes(t.id));
          return dependencies.every(d => d.status === 'completed');
        })
        .slice(0, maxParallelTasks - inProgressTasks.length);
      
      // Start new tasks
      for (const task of tasksToStart) {
        // Update status to in_progress
        currentPlan = this.updateTaskStatus(currentPlan, task.id, 'in_progress');
        
        // Remove from pending tasks
        const index = pendingTasks.findIndex(t => t.id === task.id);
        if (index !== -1) {
          pendingTasks.splice(index, 1);
        }
        
        // Add to in-progress tasks
        const updatedTask = currentPlan.tasks.find(t => t.id === task.id)!;
        inProgressTasks.push(updatedTask);
        
        // Execute the task (start but don't await yet)
        this.executeTask(task, agent, options).then(
          (result) => {
            // Task completed
            currentPlan = this.updateTaskStatus(
              currentPlan, 
              task.id, 
              'completed', 
              result
            );
            
            // Remove from in-progress and add to completed
            inProgressTasks = inProgressTasks.filter(t => t.id !== task.id);
            const completedTask = currentPlan.tasks.find(t => t.id === task.id)!;
            completedTasks.push(completedTask);
            
            // Update progress
            const progressPercent = Math.round(
              ((completedTasks.length + failedTasks.length) / allTasks.length) * 100
            );
            currentPlan = {
              ...currentPlan,
              progress: progressPercent
            };
          },
          (error) => {
            // Task failed
            currentPlan = this.updateTaskStatus(
              currentPlan, 
              task.id, 
              'failed', 
              undefined, 
              error instanceof Error ? error.message : String(error)
            );
            
            // Remove from in-progress and add to failed
            inProgressTasks = inProgressTasks.filter(t => t.id !== task.id);
            const failedTask = currentPlan.tasks.find(t => t.id === task.id)!;
            failedTasks.push(failedTask);
            
            // Update progress
            const progressPercent = Math.round(
              ((completedTasks.length + failedTasks.length) / allTasks.length) * 100
            );
            currentPlan = {
              ...currentPlan,
              progress: progressPercent
            };
          }
        );
        
        // Emit progress event
        agent.emit(AgentEvent.THINKING, { 
          message: `Starting task in parallel: ${task.description}` 
        });
      }
      
      // If no tasks were started and none are in progress, we might be stuck
      if (tasksToStart.length === 0 && inProgressTasks.length === 0 && pendingTasks.length > 0) {
        this.logger.error('Execution stuck, deadlock in dependencies detected', { 
          pendingTasks: pendingTasks.map(t => t.id) 
        });
        
        // Mark the plan as failed
        currentPlan = {
          ...currentPlan,
          status: 'failed',
          updated: Date.now()
        };
        
        break;
      }
      
      // Wait a bit before checking again
      if (inProgressTasks.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Check if all tasks completed successfully
    const allCompleted = currentPlan.tasks.every(t => t.status === 'completed');
    if (allCompleted && currentPlan.status !== 'failed') {
      currentPlan = {
        ...currentPlan,
        status: 'completed',
        updated: Date.now(),
        progress: 100
      };
    }
    
    return this.generateSummary(currentPlan, agent, options);
  }
  
  /**
   * Executes a hierarchical plan
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeHierarchicalPlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    let currentPlan = { ...plan };
    const results: string[] = [];
    
    // Get the top-level tasks
    const topTasks = currentPlan.tasks;
    
    // Process each top-level task in sequence
    for (const task of topTasks) {
      // Update status to in_progress
      currentPlan = this.updateTaskStatus(currentPlan, task.id, 'in_progress');
      
      // Emit progress event
      agent.emit(AgentEvent.THINKING, { 
        message: `Executing phase: ${task.description}` 
      });
      
      try {
        // Check if the task has subtasks
        if (task.subtasks && task.subtasks.length > 0) {
          // Create a sub-plan for this task
          const subPlan: Plan = {
            id: uuidv4(),
            originalTask: task.description,
            tasks: task.subtasks,
            created: Date.now(),
            updated: Date.now(),
            status: 'created',
            metadata: {
              parentPlanId: currentPlan.id,
              parentTaskId: task.id
            }
          };
          
          // Execute the sub-plan
          const subResult = await this.executeHierarchicalPlan(subPlan, agent, options);
          
          // Store the result
          results.push(subResult.response);
          
          // If the sub-plan completed successfully, mark this task as completed
          if (subPlan.status === 'completed') {
            currentPlan = this.updateTaskStatus(
              currentPlan, 
              task.id, 
              'completed', 
              subResult.response
            );
          } else {
            // Otherwise, mark as failed
            currentPlan = this.updateTaskStatus(
              currentPlan, 
              task.id, 
              'failed', 
              undefined, 
              `Sub-plan failed: ${subPlan.status}`
            );
            
            // Mark the plan as failed
            currentPlan = {
              ...currentPlan,
              status: 'failed',
              updated: Date.now()
            };
            
            break;
          }
        } else {
          // This is a leaf task, execute it directly
          const taskResult = await agent.run({
            ...options,
            task: task.description,
          });
          
          // Store the result
          results.push(taskResult.response);
          
          // Update task status
          currentPlan = this.updateTaskStatus(
            currentPlan, 
            task.id, 
            'completed', 
            taskResult.response
          );
        }
        
        // Update progress
        const totalTasks = this.countTotalTasks(currentPlan.tasks);
        const completedTasks = this.countCompletedTasks(currentPlan.tasks);
        currentPlan = {
          ...currentPlan,
          progress: Math.round((completedTasks / totalTasks) * 100)
        };
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
        updated: Date.now(),
        progress: 100
      };
    }
    
    return this.generateSummary(currentPlan, agent, options);
  }
  
  /**
   * Executes an adaptive plan with replanning on failures
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  private async executeAdaptivePlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    let currentPlan = { ...plan };
    
    // Start with hierarchical execution
    const result = await this.executeHierarchicalPlan(currentPlan, agent, options);
    
    // Check if we need to replan
    const needsReplan = await this.shouldReplan(currentPlan, agent);
    
    if (needsReplan && currentPlan.status === 'failed') {
      // Get the adaptive options
      const adaptiveOptions = currentPlan.metadata?.adaptiveOptions as {
        replanningThreshold: number;
        maxReplans: number;
        currentReplanCount: number;
      } || {
        replanningThreshold: 0.3,
        maxReplans: 3,
        currentReplanCount: 0
      };
      
      // Check if we've reached the max replans
      if (adaptiveOptions.currentReplanCount >= adaptiveOptions.maxReplans) {
        this.logger.warn('Max replans reached, giving up', {
          planId: currentPlan.id,
          replans: adaptiveOptions.currentReplanCount
        });
        
        return result;
      }
      
      // Update the plan status
      currentPlan = {
        ...currentPlan,
        status: 'replanning',
        updated: Date.now()
      };
      
      // Emit progress event
      agent.emit(AgentEvent.THINKING, { 
        message: `Plan failed, replanning...`
      });
      
      // Create a revised plan
      const revisedPlan = await this.replan(currentPlan, agent);
      
      // Update the replan count
      revisedPlan.metadata = {
        ...revisedPlan.metadata,
        adaptiveOptions: {
          ...adaptiveOptions,
          currentReplanCount: adaptiveOptions.currentReplanCount + 1
        }
      };
      
      // Execute the revised plan
      return this.executeAdaptivePlan(revisedPlan, agent, options);
    }
    
    return result;
  }
  
  /**
   * Executes a single task and returns its result
   * 
   * @param task - The task to execute
   * @param agent - The agent executing the task
   * @param options - The run options
   * @returns Promise resolving to the task result
   */
  private async executeTask(task: PlanTask, agent: Agent, options: RunOptions): Promise<string> {
    try {
      // Execute the task
      const taskResult = await agent.run({
        ...options,
        task: task.description,
      });
      
      return taskResult.response;
    } catch (error) {
      throw error;
    }
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
  updateTaskStatus(
    plan: Plan,
    taskId: string, 
    status: PlanTask['status'], 
    result?: string,
    error?: string
  ): Plan {
    // Create a helper function to update a task in a hierarchy
    const updateTaskInHierarchy = (tasks: PlanTask[], id: string): PlanTask[] => {
      return tasks.map(task => {
        if (task.id === id) {
          // Update this task
          return { ...task, status, result, error };
        } else if (task.subtasks && task.subtasks.length > 0) {
          // Recursively update subtasks
          const updatedSubtasks = updateTaskInHierarchy(task.subtasks, id);
          return { ...task, subtasks: updatedSubtasks };
        } else {
          // No change
          return task;
        }
      });
    };
    
    // Create a new plan object (immutable update)
    const updatedPlan: Plan = {
      ...plan,
      updated: Date.now(),
      tasks: updateTaskInHierarchy(plan.tasks, taskId)
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
   * Checks if a plan needs to be revised based on execution results
   * 
   * @param plan - The current plan
   * @param agent - The agent executing the plan
   * @returns Promise resolving to a boolean indicating if replanning is needed
   */
  async shouldReplan(plan: Plan, agent: Agent): Promise<boolean> {
    // If the plan is already marked as failed, replan
    if (plan.status === 'failed') {
      return true;
    }
    
    // Get adaptive options
    const adaptiveOptions = plan.metadata?.adaptiveOptions as {
      replanningThreshold: number;
    } | undefined;
    
    if (!adaptiveOptions) {
      // Default threshold is 30%
      const threshold = 0.3;
      
      // Count failed tasks
      const failedTasks = this.countFailedTasks(plan.tasks);
      const totalTasks = this.countTotalTasks(plan.tasks);
      
      // Check if we've crossed the threshold
      return failedTasks / totalTasks > threshold;
    }
    
    // Use the threshold from options
    const failedTasks = this.countFailedTasks(plan.tasks);
    const totalTasks = this.countTotalTasks(plan.tasks);
    
    return failedTasks / totalTasks > adaptiveOptions.replanningThreshold;
  }
  
  /**
   * Creates a revised plan based on execution results so far
   * 
   * @param originalPlan - The original plan that needs revision
   * @param agent - The agent creating the revised plan
   * @returns Promise resolving to the revised plan
   */
  async replan(originalPlan: Plan, agent: Agent): Promise<Plan> {
    // Extract data needed for replanning
    const originalTask = originalPlan.originalTask;
    
    // Format the original plan for the prompt
    const planText = this.formatPlanForPrompt(originalPlan);
    
    // Format completed tasks
    const completedTasks = this.formatCompletedTasksForPrompt(originalPlan);
    
    // Format failed tasks
    const failedTasks = this.formatFailedTasksForPrompt(originalPlan);
    
    // Create the replanning prompt
    const replanningPrompt = createReplanningPrompt(
      originalTask,
      planText,
      completedTasks,
      failedTasks
    );
    
    // Ask the LLM to revise the plan
    const replanResult = await agent.run({
      task: replanningPrompt,
    });
    
    // Parse the response into a new plan
    const newTasks = this.parseHierarchicalPlan(replanResult.response);
    
    // Create the revised plan
    const revisedPlan: Plan = {
      id: uuidv4(),
      originalTask,
      tasks: newTasks,
      created: Date.now(),
      updated: Date.now(),
      status: 'created',
      progress: 0,
      metadata: {
        ...originalPlan.metadata,
        originalPlanId: originalPlan.id,
        revisedFrom: originalPlan.status
      }
    };
    
    this.logger.info('Created revised plan', { planId: revisedPlan.id });
    return revisedPlan;
  }
  
  /**
   * Generates a summary of the plan execution
   * 
   * @param plan - The executed plan
   * @param agent - The agent that executed the plan
   * @param options - The original run options
   * @returns Promise resolving to the summary result
   */
  private async generateSummary(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    // Generate a summary prompt
    const summaryPrompt = `
      I've ${plan.status === 'completed' ? 'completed' : 'worked on'} the following complex task:
      "${plan.originalTask}"
      
      Here's a summary of the execution:
      
      ${this.formatPlanResultsForSummary(plan)}
      
      Overall Status: ${plan.status}
      Progress: ${plan.progress || 0}%
      
      Please provide a concise summary of the overall result.
      ${plan.status !== 'completed' ? 'Include information about what failed and why.' : ''}
    `;
    
    // Get the summary
    const summary = await agent.run({
      ...options,
      task: summaryPrompt,
    });
    
    this.logger.info('Plan execution completed', { 
      planId: plan.id, 
      status: plan.status 
    });
    
    // Return the final result
    return {
      response: summary.response,
      conversation: summary.conversation,
    };
  }
  
  /**
   * Simple parser to extract tasks from the LLM's planning response
   * 
   * @param response - The LLM's response to the planning prompt
   * @returns Array of task descriptions
   */
  private parseTasksFromResponse(response: string): string[] {
    // Look for numbered lists like "1. Do something" or "Step 1: Do something"
    const taskPattern = /(?:^|\n)(?:Step\s*)?(\d+)[:.)\s]+(.+?)(?=\n(?:Step\s*)?(?:\d+)[:.)\s]+|$)/gis;
    
    const tasks: string[] = [];
    let match;
    
    while ((match = taskPattern.exec(response)) !== null) {
      const taskDescription = match[2].trim();
      if (taskDescription) {
        tasks.push(taskDescription);
      }
    }
    
    // If we couldn't find a numbered list, fall back to splitting by newlines
    if (tasks.length === 0) {
      return response.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10); // Arbitrary threshold to filter out short lines
    }
    
    return tasks;
  }
  
  /**
   * Parses dependencies from LLM response
   * 
   * @param response - The LLM's response about dependencies
   * @param tasks - The tasks to update with dependencies
   */
  private parseDependencies(response: string, tasks: PlanTask[]): void {
    // Look for lines like "Task X (task-id): [dep1, dep2, ...]"
    const lines = response.split('\n').map(line => line.trim());
    
    for (const line of lines) {
      // Try to extract the task ID
      const taskIdMatch = line.match(/Task \d+\s*\(([^)]+)\)/i);
      if (!taskIdMatch) continue;
      
      const taskId = taskIdMatch[1].trim();
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;
      
      // Try to extract dependencies
      const depsMatch = line.match(/:\s*\[([^\]]*)\]/);
      if (!depsMatch) continue;
      
      const depsText = depsMatch[1].trim();
      
      // Check if it's "none" or similar
      if (depsText.toLowerCase().includes('none') || depsText.length === 0) {
        task.dependencies = [];
        continue;
      }
      
      // Parse the dependencies
      const deps = depsText.split(',')
        .map(dep => dep.trim())
        .filter(dep => dep.length > 0 && tasks.some(t => t.id === dep));
      
      task.dependencies = deps;
    }
  }
  
  /**
   * Parses a hierarchical plan from LLM response
   * 
   * @param response - The LLM's response to the hierarchical planning prompt
   * @returns Array of top-level tasks with subtasks
   */
  private parseHierarchicalPlan(response: string): PlanTask[] {
    // First, try to extract the content between <phases> tags
    let planContent = response;
    const phasesMatch = response.match(/<phases>([\s\S]*?)<\/phases>/i);
    
    if (phasesMatch) {
      planContent = phasesMatch[1];
    }
    
    // Look for phase headers (PHASE X: Name)
    const phasePattern = /PHASE\s+(\d+):\s+([^\n]+)/gi;
    const phases: PlanTask[] = [];
    
    let phaseMatch;
    let lastPhaseIndex = 0;
    
    while ((phaseMatch = phasePattern.exec(planContent)) !== null) {
      const phaseNumber = phaseMatch[1];
      const phaseName = phaseMatch[2].trim();
      const phaseId = uuidv4();
      
      // Get the content for this phase (until the next phase or end)
      const phaseStartIndex = phaseMatch.index + phaseMatch[0].length;
      let phaseEndIndex = planContent.length;
      
      // Find the next phase
      phasePattern.lastIndex = phaseStartIndex;
      const nextPhaseMatch = phasePattern.exec(planContent);
      
      if (nextPhaseMatch) {
        phaseEndIndex = nextPhaseMatch.index;
        // Reset the regex index for the next iteration
        phasePattern.lastIndex = phaseStartIndex;
      }
      
      const phaseContent = planContent.substring(phaseStartIndex, phaseEndIndex);
      
      // Parse description and effort from phase content
      const descriptionMatch = phaseContent.match(/- Description:\s+([^\n]+)/i);
      const effortMatch = phaseContent.match(/- Estimated effort:\s+([^\n]+)/i);
      
      const phaseDescription = phaseName + (descriptionMatch ? `: ${descriptionMatch[1].trim()}` : '');
      const estimatedEffort = effortMatch ? this.parseEffortToMilliseconds(effortMatch[1].trim()) : 300000; // 5 minutes default
      
      // Create the phase task
      const phase: PlanTask = {
        id: phaseId,
        description: phaseDescription,
        dependencies: [], // Will be updated later
        status: 'pending',
        estimatedDuration: estimatedEffort,
        priority: 1,
        subtasks: []
      };
      
      // Parse tasks within this phase
      phase.subtasks = this.parseTasksFromPhase(phaseContent, phaseId, phaseNumber);
      
      // Add the phase to our list
      phases.push(phase);
      lastPhaseIndex = phaseEndIndex;
    }
    
    // Set up dependencies between phases (each phase depends on the previous one)
    for (let i = 1; i < phases.length; i++) {
      phases[i].dependencies = [phases[i-1].id];
    }
    
    return phases;
  }
  
  /**
   * Parses tasks from a phase's content
   * 
   * @param phaseContent - The content of a phase
   * @param phaseId - ID of the parent phase
   * @param phaseNumber - Number of the phase (for task numbering)
   * @returns Array of tasks
   */
  private parseTasksFromPhase(phaseContent: string, phaseId: string, phaseNumber: string): PlanTask[] {
    // Look for task headers (TASK X.Y: Name)
    const taskPattern = new RegExp(`TASK\\s+${phaseNumber}\\.\\d+:\\s+([^\\n]+)`, 'gi');
    const tasks: PlanTask[] = [];
    
    let taskMatch;
    let lastTaskIndex = 0;
    
    while ((taskMatch = taskPattern.exec(phaseContent)) !== null) {
      const taskName = taskMatch[1].trim();
      const taskId = uuidv4();
      
      // Get the content for this task (until the next task or end)
      const taskStartIndex = taskMatch.index + taskMatch[0].length;
      let taskEndIndex = phaseContent.length;
      
      // Find the next task
      taskPattern.lastIndex = taskStartIndex;
      const nextTaskMatch = taskPattern.exec(phaseContent);
      
      if (nextTaskMatch) {
        taskEndIndex = nextTaskMatch.index;
        // Reset the regex index for the next iteration
        taskPattern.lastIndex = taskStartIndex;
      }
      
      const taskContent = phaseContent.substring(taskStartIndex, taskEndIndex);
      
      // Parse task properties
      const descriptionMatch = taskContent.match(/- Description:\s+([^\n]+)/i);
      const depsMatch = taskContent.match(/- Dependencies:\s+([^\n]+)/i);
      const parallelMatch = taskContent.match(/- Can run in parallel:\s+([^\n]+)/i);
      const toolsMatch = taskContent.match(/- Tools needed:\s+([^\n]+)/i);
      const effortMatch = taskContent.match(/- Estimated effort:\s+([^\n]+)/i);
      
      const taskDescription = taskName + (descriptionMatch ? `: ${descriptionMatch[1].trim()}` : '');
      const rawDeps = depsMatch ? depsMatch[1].trim() : '';
      const canRunInParallel = parallelMatch ? parallelMatch[1].trim().toLowerCase() === 'yes' : false;
      const tools = toolsMatch ? toolsMatch[1].trim().split(/,\s*/) : [];
      const estimatedEffort = effortMatch ? this.parseEffortToMilliseconds(effortMatch[1].trim()) : 120000; // 2 minutes default
      
      // Create the task
      const task: PlanTask = {
        id: taskId,
        description: taskDescription,
        dependencies: [], // Will be updated later
        status: 'pending',
        estimatedDuration: estimatedEffort,
        priority: canRunInParallel ? 2 : 1, // Higher priority for parallel tasks
        resourceRequirements: tools.length > 0 ? tools : undefined,
        subtasks: []
      };
      
      // Parse subtasks
      task.subtasks = this.parseSubtasksFromTask(taskContent, taskId, taskMatch[0]);
      
      // Add the task to our list
      tasks.push(task);
      lastTaskIndex = taskEndIndex;
    }
    
    // Link tasks with dependencies (based on task IDs in the same phase)
    // For now, we'll handle this in a second pass after all tasks are parsed
    
    return tasks;
  }
  
  /**
   * Parses subtasks from a task's content
   * 
   * @param taskContent - The content of a task
   * @param taskId - ID of the parent task
   * @param taskHeader - Header of the task (for subtask pattern matching)
   * @returns Array of subtasks
   */
  private parseSubtasksFromTask(taskContent: string, taskId: string, taskHeader: string): PlanTask[] {
    // Extract the task number (e.g., "1.1" from "TASK 1.1: Name")
    const taskNumberMatch = taskHeader.match(/TASK\s+(\d+\.\d+):/i);
    if (!taskNumberMatch) return [];
    
    const taskNumber = taskNumberMatch[1];
    
    // Look for subtask headers (SUBTASK X.Y.Z: Name)
    const subtaskPattern = new RegExp(`SUBTASK\\s+${taskNumber.replace('.', '\\.')}\\.(\\d+):\\s+([^\\n]+)`, 'gi');
    const subtasks: PlanTask[] = [];
    
    let subtaskMatch;
    
    while ((subtaskMatch = subtaskPattern.exec(taskContent)) !== null) {
      const subtaskNumber = subtaskMatch[1];
      const subtaskName = subtaskMatch[2].trim();
      const subtaskId = uuidv4();
      
      // Get the content for this subtask (until the next subtask or end)
      const subtaskStartIndex = subtaskMatch.index + subtaskMatch[0].length;
      let subtaskEndIndex = taskContent.length;
      
      // Find the next subtask
      subtaskPattern.lastIndex = subtaskStartIndex;
      const nextSubtaskMatch = subtaskPattern.exec(taskContent);
      
      if (nextSubtaskMatch) {
        subtaskEndIndex = nextSubtaskMatch.index;
        // Reset the regex index for the next iteration
        subtaskPattern.lastIndex = subtaskStartIndex;
      }
      
      const subtaskContent = taskContent.substring(subtaskStartIndex, subtaskEndIndex);
      
      // Parse subtask properties
      const descriptionMatch = subtaskContent.match(/- Description:\s+([^\n]+)/i);
      const depsMatch = subtaskContent.match(/- Dependencies:\s+([^\n]+)/i);
      const effortMatch = subtaskContent.match(/- Estimated effort:\s+([^\n]+)/i);
      
      const subtaskDescription = subtaskName + (descriptionMatch ? `: ${descriptionMatch[1].trim()}` : '');
      const rawDeps = depsMatch ? depsMatch[1].trim() : '';
      const estimatedEffort = effortMatch ? this.parseEffortToMilliseconds(effortMatch[1].trim()) : 60000; // 1 minute default
      
      // Create the subtask
      const subtask: PlanTask = {
        id: subtaskId,
        description: subtaskDescription,
        dependencies: [], // Will be updated in second pass
        status: 'pending',
        estimatedDuration: estimatedEffort,
        priority: 1
      };
      
      // Add the subtask to our list
      subtasks.push(subtask);
    }
    
    // Set up sequential dependencies if nothing else is specified
    for (let i = 1; i < subtasks.length; i++) {
      subtasks[i].dependencies = [subtasks[i-1].id];
    }
    
    return subtasks;
  }
  
  /**
   * Counts the total number of tasks in a plan (including subtasks)
   * 
   * @param tasks - Array of tasks
   * @returns Total number of tasks
   */
  private countTotalTasks(tasks: PlanTask[]): number {
    let count = tasks.length;
    
    for (const task of tasks) {
      if (task.subtasks && task.subtasks.length > 0) {
        count += this.countTotalTasks(task.subtasks);
      }
    }
    
    return count;
  }
  
  /**
   * Counts the number of completed tasks in a plan (including subtasks)
   * 
   * @param tasks - Array of tasks
   * @returns Number of completed tasks
   */
  private countCompletedTasks(tasks: PlanTask[]): number {
    let count = 0;
    
    for (const task of tasks) {
      if (task.status === 'completed') {
        count++;
      }
      
      if (task.subtasks && task.subtasks.length > 0) {
        count += this.countCompletedTasks(task.subtasks);
      }
    }
    
    return count;
  }
  
  /**
   * Counts the number of failed tasks in a plan (including subtasks)
   * 
   * @param tasks - Array of tasks
   * @returns Number of failed tasks
   */
  private countFailedTasks(tasks: PlanTask[]): number {
    let count = 0;
    
    for (const task of tasks) {
      if (task.status === 'failed') {
        count++;
      }
      
      if (task.subtasks && task.subtasks.length > 0) {
        count += this.countFailedTasks(task.subtasks);
      }
    }
    
    return count;
  }
  
  /**
   * Estimates the completion time for a plan based on task durations
   * 
   * @param tasks - Array of tasks
   * @param maxParallel - Maximum number of tasks to run in parallel
   * @returns Estimated completion time in milliseconds from now
   */
  private estimateCompletionTime(tasks: PlanTask[], maxParallel: number): number {
    // For sequential execution, sum all durations
    if (maxParallel === 1) {
      const totalDuration = this.sumTaskDurations(tasks);
      return Date.now() + totalDuration;
    }
    
    // For parallel execution, it's more complex
    // This is a simplified estimation that doesn't account for all dependencies
    const totalWorkDuration = this.sumTaskDurations(tasks);
    const estimatedParallelDuration = totalWorkDuration / Math.min(maxParallel, tasks.length);
    
    // Add some overhead for coordination
    const overhead = 1.2; // 20% overhead
    return Date.now() + (estimatedParallelDuration * overhead);
  }
  
  /**
   * Sums the durations of all tasks (including subtasks)
   * 
   * @param tasks - Array of tasks
   * @returns Total duration in milliseconds
   */
  private sumTaskDurations(tasks: PlanTask[]): number {
    let total = 0;
    
    for (const task of tasks) {
      total += task.estimatedDuration || 60000; // Default 1 minute
      
      if (task.subtasks && task.subtasks.length > 0) {
        total += this.sumTaskDurations(task.subtasks);
      }
    }
    
    return total;
  }
  
  /**
   * Converts effort level to milliseconds
   * 
   * @param effort - Effort level (Low/Medium/High)
   * @returns Duration in milliseconds
   */
  private parseEffortToMilliseconds(effort: string): number {
    const normalized = effort.trim().toLowerCase();
    
    if (normalized.includes('low')) {
      return 60000; // 1 minute
    } else if (normalized.includes('medium')) {
      return 300000; // 5 minutes
    } else if (normalized.includes('high')) {
      return 900000; // 15 minutes
    }
    
    // Default
    return 180000; // 3 minutes
  }
  
  /**
   * Formats a plan for inclusion in a prompt
   * 
   * @param plan - The plan to format
   * @returns Formatted plan string
   */
  private formatPlanForPrompt(plan: Plan): string {
    const formatTask = (task: PlanTask, indent: string = ''): string => {
      let result = `${indent}- Task: ${task.description} (ID: ${task.id})\n`;
      result += `${indent}  Status: ${task.status}\n`;
      
      if (task.dependencies.length > 0) {
        result += `${indent}  Dependencies: ${task.dependencies.join(', ')}\n`;
      }
      
      if (task.subtasks && task.subtasks.length > 0) {
        result += `${indent}  Subtasks:\n`;
        for (const subtask of task.subtasks) {
          result += formatTask(subtask, `${indent}    `);
        }
      }
      
      return result;
    };
    
    let result = `Plan ID: ${plan.id}\n`;
    result += `Status: ${plan.status}\n`;
    result += `Progress: ${plan.progress || 0}%\n\n`;
    result += 'Tasks:\n';
    
    for (const task of plan.tasks) {
      result += formatTask(task);
    }
    
    return result;
  }
  
  /**
   * Formats completed tasks for inclusion in a prompt
   * 
   * @param plan - The plan containing completed tasks
   * @returns Formatted completed tasks string
   */
  private formatCompletedTasksForPrompt(plan: Plan): string {
    const findCompletedTasks = (tasks: PlanTask[]): PlanTask[] => {
      const completed: PlanTask[] = [];
      
      for (const task of tasks) {
        if (task.status === 'completed') {
          completed.push(task);
        }
        
        if (task.subtasks && task.subtasks.length > 0) {
          completed.push(...findCompletedTasks(task.subtasks));
        }
      }
      
      return completed;
    };
    
    const completedTasks = findCompletedTasks(plan.tasks);
    
    if (completedTasks.length === 0) {
      return 'No tasks completed yet.';
    }
    
    let result = '';
    
    for (const task of completedTasks) {
      result += `- ${task.description} (ID: ${task.id})\n`;
      if (task.result) {
        result += `  Result: ${task.result.slice(0, 100)}${task.result.length > 100 ? '...' : ''}\n`;
      }
    }
    
    return result;
  }
  
  /**
   * Formats failed tasks for inclusion in a prompt
   * 
   * @param plan - The plan containing failed tasks
   * @returns Formatted failed tasks string
   */
  private formatFailedTasksForPrompt(plan: Plan): string {
    const findFailedTasks = (tasks: PlanTask[]): PlanTask[] => {
      const failed: PlanTask[] = [];
      
      for (const task of tasks) {
        if (task.status === 'failed') {
          failed.push(task);
        }
        
        if (task.subtasks && task.subtasks.length > 0) {
          failed.push(...findFailedTasks(task.subtasks));
        }
      }
      
      return failed;
    };
    
    const failedTasks = findFailedTasks(plan.tasks);
    
    if (failedTasks.length === 0) {
      return 'No tasks have failed.';
    }
    
    let result = '';
    
    for (const task of failedTasks) {
      result += `- ${task.description} (ID: ${task.id})\n`;
      if (task.error) {
        result += `  Error: ${task.error}\n`;
      }
    }
    
    return result;
  }
  
  /**
   * Formats plan results for summary
   * 
   * @param plan - The executed plan
   * @returns Formatted plan results string
   */
  private formatPlanResultsForSummary(plan: Plan): string {
    const formatTask = (task: PlanTask, indent: string = ''): string => {
      let result = `${indent}- ${task.description}\n`;
      result += `${indent}  Status: ${task.status}\n`;
      
      if (task.result) {
        result += `${indent}  Result: ${task.result.slice(0, 200)}${task.result.length > 200 ? '...' : ''}\n`;
      }
      
      if (task.error) {
        result += `${indent}  Error: ${task.error}\n`;
      }
      
      if (task.subtasks && task.subtasks.length > 0) {
        result += `${indent}  Subtasks:\n`;
        for (const subtask of task.subtasks) {
          result += formatTask(subtask, `${indent}    `);
        }
      }
      
      return result;
    };
    
    let result = '';
    
    for (const task of plan.tasks) {
      result += formatTask(task);
    }
    
    return result;
  }
}