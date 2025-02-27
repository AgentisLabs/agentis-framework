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
  subtasks?: PlanTask[]; // Nested subtasks for hierarchical planning
  estimatedDuration?: number; // Estimated time in milliseconds
  priority?: number; // Priority level (higher = more important)
  assignedTo?: string; // Agent ID if in a multi-agent setting
  resourceRequirements?: string[]; // Tools or resources needed
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
  status: 'created' | 'in_progress' | 'completed' | 'failed' | 'replanning';
  estimatedCompletionTime?: number; // Estimated completion timestamp
  progress?: number; // Progress percentage (0-100)
  metadata?: Record<string, any>; // Additional metadata for the plan
}

/**
 * Planning strategy enum
 */
export enum PlanningStrategy {
  SEQUENTIAL = 'sequential', // Tasks are executed in sequence
  PARALLEL = 'parallel',     // Independent tasks can run in parallel
  HIERARCHICAL = 'hierarchical', // Tasks can have subtasks
  ADAPTIVE = 'adaptive'      // Plan adapts based on execution results
}

/**
 * Plan creation options
 */
export interface PlanOptions {
  strategy?: PlanningStrategy;
  maxParallelTasks?: number; // Maximum tasks to run in parallel
  maxRetries?: number; // Maximum retries for failed tasks
  timeout?: number; // Overall timeout in milliseconds
  agents?: Agent[]; // Multiple agents for distributed task execution
  resourceConstraints?: Record<string, number>; // Resource limits
  _skipPlanning?: boolean; // Internal flag to prevent recursion
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
   * @param options - Optional planning configuration
   * @returns Promise resolving to the created plan
   */
  createPlan(task: string, agent: Agent, options?: PlanOptions): Promise<Plan>;
  
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
   * @param error - Optional error message
   * @returns The updated plan
   */
  updateTaskStatus(
    plan: Plan,
    taskId: string, 
    status: PlanTask['status'], 
    result?: string,
    error?: string
  ): Plan;
  
  /**
   * Checks if a plan needs to be revised based on execution results
   * 
   * @param plan - The current plan
   * @param agent - The agent executing the plan
   * @returns Promise resolving to a boolean indicating if replanning is needed
   */
  shouldReplan(plan: Plan, agent: Agent): Promise<boolean>;
  
  /**
   * Creates a revised plan based on execution results so far
   * 
   * @param originalPlan - The original plan that needs revision
   * @param agent - The agent creating the revised plan
   * @returns Promise resolving to the revised plan
   */
  replan(originalPlan: Plan, agent: Agent): Promise<Plan>;
}