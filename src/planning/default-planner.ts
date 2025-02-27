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
import { createPlanningPrompt, createReplanningPrompt } from '../utils/prompt-utils';
import { Logger } from '../utils/logger';

/**
 * Default planner implementation that uses the LLM to break down tasks
 */
export class DefaultPlanner implements PlannerInterface {
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger('DefaultPlanner');
  }
  
  /**
   * Creates a plan by asking the LLM to break down a complex task
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @param options - Optional planning configuration
   * @returns Promise resolving to the created plan
   */
  async createPlan(task: string, agent: Agent, options?: PlanOptions): Promise<Plan> {
    this.logger.debug('Creating plan', { task });
    
    // Generate a planning prompt
    const planningPrompt = createPlanningPrompt(task);
    
    // Ask the LLM to break down the task
    const planResult = await agent.run({
      task: planningPrompt,
    });
    
    // Parse the response into tasks
    // This is a simplistic implementation; in a real system you'd want more robust parsing
    const taskDescriptions = this.parseTasksFromResponse(planResult.response);
    
    // Create the plan object
    const plan: Plan = {
      id: uuidv4(),
      originalTask: task,
      tasks: taskDescriptions.map((description, index) => ({
        id: uuidv4(),
        description,
        dependencies: index > 0 ? [taskDescriptions[index - 1]] : [], // Simple sequential dependencies
        status: 'pending'
      })),
      created: Date.now(),
      updated: Date.now(),
      status: 'created'
    };
    
    this.logger.info('Plan created', { planId: plan.id, taskCount: plan.tasks.length });
    return plan;
  }
  
  /**
   * Executes a plan sequentially
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  async executePlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult> {
    this.logger.info('Executing plan', { planId: plan.id });
    
    // Update plan status
    let currentPlan: Plan = { 
      ...plan, 
      status: 'in_progress', 
      updated: Date.now() 
    };
    
    // Track all results to combine later
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
        message: `Executing sub-task: ${task.description}` 
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
    
    // Generate a summary of the results
    const summaryPrompt = `
      I've completed the following complex task by breaking it down:
      "${plan.originalTask}"
      
      Here are the results from each step:
      
      ${currentPlan.tasks.map(task => 
        `STEP: ${task.description}
         STATUS: ${task.status}
         ${task.result ? `RESULT: ${task.result}` : ''}
         ${task.error ? `ERROR: ${task.error}` : ''}`
      ).join('\n\n')}
      
      Please provide a concise summary of the overall result.
    `;
    
    // Get the summary
    const summary = await agent.run({
      ...options,
      task: summaryPrompt,
    });
    
    this.logger.info('Plan execution completed', { 
      planId: plan.id, 
      status: currentPlan.status 
    });
    
    // Return the final result
    return {
      response: summary.response,
      conversation: summary.conversation,
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
  updateTaskStatus(
    plan: Plan,
    taskId: string, 
    status: PlanTask['status'], 
    result?: string,
    error?: string
  ): Plan {
    // Create a new plan object (immutable update)
    const updatedPlan: Plan = {
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
   * Checks if a plan needs to be revised based on execution results
   * 
   * @param plan - The current plan
   * @param agent - The agent executing the plan
   * @returns Promise resolving to a boolean indicating if replanning is needed
   */
  async shouldReplan(plan: Plan, agent: Agent): Promise<boolean> {
    // In the default planner, we only replan if the plan has failed
    return plan.status === 'failed';
  }
  
  /**
   * Creates a revised plan based on execution results so far
   * 
   * @param originalPlan - The original plan that needs revision
   * @param agent - The agent creating the revised plan
   * @returns Promise resolving to the revised plan
   */
  async replan(originalPlan: Plan, agent: Agent): Promise<Plan> {
    // Extract completed and failed tasks
    const completedTasks = originalPlan.tasks.filter(t => t.status === 'completed');
    const failedTasks = originalPlan.tasks.filter(t => t.status === 'failed');
    
    // Format tasks for the prompt
    const completedTasksText = completedTasks.map(t => 
      `- ${t.description} (Completed)`
    ).join('\n');
    
    const failedTasksText = failedTasks.map(t => 
      `- ${t.description} (Failed: ${t.error || 'Unknown error'})`
    ).join('\n');
    
    // Create the original plan text
    const planText = originalPlan.tasks.map(t => 
      `- ${t.description}`
    ).join('\n');
    
    // Create the replanning prompt
    const replanPrompt = createReplanningPrompt(
      originalPlan.originalTask,
      planText,
      completedTasksText,
      failedTasksText
    );
    
    // Ask the LLM to create a revised plan
    const replanResult = await agent.run({
      task: replanPrompt,
    });
    
    // Parse the response into tasks
    const taskDescriptions = this.parseTasksFromResponse(replanResult.response);
    
    // Create the revised plan
    const revisedPlan: Plan = {
      id: uuidv4(),
      originalTask: originalPlan.originalTask,
      tasks: taskDescriptions.map((description, index) => ({
        id: uuidv4(),
        description,
        dependencies: index > 0 ? [taskDescriptions[index - 1]] : [], // Simple sequential dependencies
        status: 'pending'
      })),
      created: Date.now(),
      updated: Date.now(),
      status: 'created'
    };
    
    this.logger.info('Created revised plan', { 
      originalPlanId: originalPlan.id,
      newPlanId: revisedPlan.id
    });
    
    return revisedPlan;
  }
  
  /**
   * Simple parser to extract tasks from the LLM's planning response
   * In a real system, you'd want a more robust implementation
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
}