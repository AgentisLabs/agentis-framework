import { Agent } from '../core/agent';
import { RunOptions, RunResult } from '../core/types';

/**
 * A task in a plan
 */
export interface PlanTask {
  id: string;
  description: string;
  dependencies: string[]; // IDs of tasks that must be completed before this one
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

/**
 * A plan for executing a complex task
 */
export interface Plan {
  id: string;
  originalTask: string;
  tasks: PlanTask[];
  created: number;
  updated: number;
  status: 'created' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Interface for planners that can break down complex tasks
 */
export interface PlannerInterface {
  /**
   * Creates a plan to accomplish a complex task
   * 
   * @param task - The complex task to plan for
   * @param agent - The agent creating the plan
   * @returns Promise resolving to the created plan
   */
  createPlan(task: string, agent: Agent): Promise<Plan>;
  
  /**
   * Executes a plan using an agent
   * 
   * @param plan - The plan to execute
   * @param agent - The agent executing the plan
   * @param options - The original run options
   * @returns Promise resolving to the execution result
   */
  executePlan(plan: Plan, agent: Agent, options: RunOptions): Promise<RunResult>;
  
  /**
   * Updates a task's status and result
   * 
   * @param plan - The plan containing the task
   * @param taskId - ID of the task to update
   * @param status - New status
   * @param result - Optional result from the task
   * @returns The updated plan
   */
  updateTaskStatus(
    plan: Plan,
    taskId: string, 
    status: PlanTask['status'], 
    result?: string,
    error?: string
  ): Plan;
}