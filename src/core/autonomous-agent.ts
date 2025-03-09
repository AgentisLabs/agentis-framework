/**
 * Autonomous Agent - provides self-management capabilities for continuously running agents
 * Handles background processing, self-monitoring, and recovery mechanisms
 * Enhanced with goal planning and execution capabilities
 */

import { Agent } from './agent';
import { Tool } from './types';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { GoalPlanner, GoalType, Goal, GoalResult, GoalTask, GoalStatus } from '../planning/goal-planner';

/**
 * Configuration for the autonomous agent
 */
export interface AutonomousAgentConfig {
  // Base agent to enhance with autonomous capabilities
  baseAgent: Agent;
  
  // Monitoring configuration
  healthCheckIntervalMinutes?: number;
  maxConsecutiveErrors?: number;
  
  // Storage paths for state persistence
  stateStoragePath?: string;
  
  // Auto-recovery options
  enableAutoRecovery?: boolean;
  
  // Continuous operation
  enableContinuousMode?: boolean;
  
  // Goal planning configuration
  goalPlanning?: {
    enabled: boolean;
    maxSubgoals?: number;
    maxTasksPerGoal?: number;
    reflectionFrequency?: number;
    adaptivePlanning?: boolean;
    defaultPriority?: number;
    defaultDeadlineDays?: number;
    maxConcurrentGoals?: number;
    persistGoals?: boolean;
    goalsStoragePath?: string;
  };
}

/**
 * Agent state that persists between executions
 */
interface AgentState {
  lastActive: number;
  sessionStartTime: number;
  consecutiveErrors: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  customState: Record<string, any>;
}

/**
 * Options for running a goal
 */
export interface RunGoalOptions {
  tools?: Tool[];
  maxReflections?: number;
  reflectAfterTaskCount?: number;
  stopOnFailure?: boolean;
  onProgress?: (progress: {
    goalId: string;
    subGoalId?: string;
    taskId?: string;
    message: string;
    progress: number;
  }) => void;
}

/**
 * Autonomous Agent that enhances a standard agent with self-management capabilities
 */
export class AutonomousAgent extends EventEmitter {
  private agent: Agent;
  private logger: Logger;
  private config: AutonomousAgentConfig;
  private state: AgentState;
  private stateFilePath: string;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private operationQueue: Array<() => Promise<void>> = [];
  private processingQueue: boolean = false;
  private running: boolean = false;
  
  // Goal planning
  private goalPlanner: GoalPlanner | null = null;
  private goalsFilePath: string = '';
  private activeGoals: Set<string> = new Set();
  private recurringGoalTimers: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Creates a new autonomous agent
   * 
   * @param config - Configuration for the autonomous agent
   */
  constructor(config: AutonomousAgentConfig) {
    super();
    this.agent = config.baseAgent;
    
    // Extract the agent name
    const agentName = (this.agent as any).name || 'autonomous-agent';
    this.logger = new Logger(`AutonomousAgent:${agentName}`);
    
    // Apply defaults
    this.config = {
      healthCheckIntervalMinutes: 5,
      maxConsecutiveErrors: 5,
      enableAutoRecovery: true,
      enableContinuousMode: true,
      ...config
    };
    
    // Set up state storage
    const storageDir = this.config.stateStoragePath || path.join(process.cwd(), 'data', 'agent-state');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    
    this.stateFilePath = path.join(storageDir, `${agentName.toLowerCase()}-state.json`);
    
    // Initialize or load state
    this.state = this.loadState();
    
    // Initialize goal planning if enabled
    if (this.config.goalPlanning?.enabled) {
      this.setupGoalPlanning(agentName);
    }
  }
  
  /**
   * Sets up goal planning capabilities
   * 
   * @param agentName - The name of the agent for file naming
   */
  private setupGoalPlanning(agentName: string): void {
    const goalConfig = this.config.goalPlanning!;
    
    this.logger.info('Initializing goal planning capabilities');
    
    // Create the goal planner
    this.goalPlanner = new GoalPlanner({
      maxSubgoals: goalConfig.maxSubgoals,
      maxTasksPerGoal: goalConfig.maxTasksPerGoal,
      reflectionFrequency: goalConfig.reflectionFrequency,
      adaptivePlanning: goalConfig.adaptivePlanning,
      defaultPriority: goalConfig.defaultPriority,
      defaultDeadlineDays: goalConfig.defaultDeadlineDays
    });
    
    // Connect the agent to the goal planner
    this.goalPlanner.connectAgent(this.agent);
    
    // Set up goals storage if persistence is enabled
    if (goalConfig.persistGoals) {
      const goalsDir = goalConfig.goalsStoragePath || 
                      this.config.stateStoragePath || 
                      path.join(process.cwd(), 'data', 'agent-goals');
                      
      if (!fs.existsSync(goalsDir)) {
        fs.mkdirSync(goalsDir, { recursive: true });
      }
      
      this.goalsFilePath = path.join(goalsDir, `${agentName.toLowerCase()}-goals.json`);
      
      // Load saved goals
      this.loadGoals();
    }
  }
  
  /**
   * Starts the autonomous agent
   */
  public start(): void {
    if (this.running) {
      this.logger.warn('Agent already running');
      return;
    }
    
    this.running = true;
    this.logger.info('Starting autonomous agent');
    
    // Start the health check interval
    if (this.config.healthCheckIntervalMinutes) {
      const intervalMs = this.config.healthCheckIntervalMinutes * 60 * 1000;
      this.healthCheckInterval = setInterval(() => this.performHealthCheck(), intervalMs);
    }
    
    // Start processing the operation queue
    this.processQueueLoop();
    
    // Update state
    this.state.sessionStartTime = Date.now();
    this.state.lastActive = Date.now();
    this.saveState();
    
    this.emit('started');
  }
  
  /**
   * Stops the autonomous agent
   */
  public stop(): void {
    if (!this.running) return;
    
    this.running = false;
    this.logger.info('Stopping autonomous agent');
    
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Clear recurring goal timers
    for (const [goalId, timer] of this.recurringGoalTimers.entries()) {
      clearInterval(timer);
    }
    this.recurringGoalTimers.clear();
    
    // Save final state
    this.saveState();
    
    // Save goals if enabled
    if (this.config.goalPlanning?.enabled && this.config.goalPlanning.persistGoals) {
      this.saveGoals();
    }
    
    this.emit('stopped');
  }
  
  /**
   * Adds an operation to the queue
   * 
   * @param operation - The operation function to queue
   */
  public queueOperation(operation: () => Promise<void>): void {
    this.operationQueue.push(operation);
    this.logger.debug(`Operation added to queue. Queue length: ${this.operationQueue.length}`);
    
    // If not already processing, kick off processing
    if (!this.processingQueue && this.running) {
      setImmediate(() => this.processQueueLoop());
    }
  }
  
  /**
   * Processes the operation queue in a loop
   */
  private async processQueueLoop(): Promise<void> {
    if (this.processingQueue || !this.running) return;
    
    this.processingQueue = true;
    
    try {
      while (this.operationQueue.length > 0 && this.running) {
        const operation = this.operationQueue.shift();
        if (!operation) continue;
        
        try {
          await operation();
          
          // Update state
          this.state.lastActive = Date.now();
          this.state.totalOperations++;
          this.state.successfulOperations++;
          this.state.consecutiveErrors = 0;
          this.saveState();
          
        } catch (error) {
          this.state.failedOperations++;
          this.state.consecutiveErrors++;
          this.logger.error('Operation failed', error);
          
          // Check if we need to enter recovery mode
          if (this.state.consecutiveErrors >= (this.config.maxConsecutiveErrors || 5)) {
            this.enterRecoveryMode();
          }
          
          this.saveState();
        }
        
        // Pause briefly to avoid CPU hogging
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.processingQueue = false;
    }
  }
  
  /**
   * Recovery mode for handling consecutive errors
   */
  private enterRecoveryMode(): void {
    if (!this.config.enableAutoRecovery) {
      this.logger.error(`Agent experiencing ${this.state.consecutiveErrors} consecutive errors. Auto-recovery disabled.`);
      return;
    }
    
    this.logger.warn(`Entering recovery mode after ${this.state.consecutiveErrors} consecutive errors`);
    this.emit('recovery_mode_entered');
    
    // Implement recovery logic
    // 1. Pause operations briefly
    // 2. Run diagnostics
    // 3. Attempt to reconnect to services
    
    // Clear the queue if it's too large (might indicate a problem)
    if (this.operationQueue.length > 20) {
      this.logger.warn(`Clearing ${this.operationQueue.length} queued operations during recovery`);
      this.operationQueue = [];
    }
    
    // Add a self-check operation
    this.queueOperation(async () => {
      this.logger.info('Performing self-check during recovery');
      
      // Run a simple test operation to check agent functionality
      try {
        await this.agent.run({
          task: 'Perform a system check. Respond with "SYSTEM OPERATIONAL" if you can process this message.'
        });
        
        this.logger.info('Recovery self-check passed, resuming normal operation');
        this.emit('recovery_completed');
      } catch (error) {
        this.logger.error('Recovery self-check failed', error);
        this.emit('recovery_failed');
        
        // If recovery failed, we might need to stop or restart
        if (this.state.consecutiveErrors > (this.config.maxConsecutiveErrors || 5) * 2) {
          this.logger.error('Too many consecutive errors, stopping autonomous agent');
          this.stop();
        }
      }
    });
  }
  
  /**
   * Perform health check of the agent
   */
  private performHealthCheck(): void {
    this.logger.debug('Performing agent health check');
    
    // Check if the agent has been active recently
    const inactiveTimeMs = Date.now() - this.state.lastActive;
    const inactiveTimeMinutes = inactiveTimeMs / (60 * 1000);
    
    if (inactiveTimeMinutes > this.config.healthCheckIntervalMinutes! * 2) {
      this.logger.warn(`Agent inactive for ${inactiveTimeMinutes.toFixed(1)} minutes`);
      
      // Queue a health check operation
      this.queueOperation(async () => {
        this.logger.info('Performing health check operation');
        
        await this.agent.run({
          task: 'Perform a system health check. Check for any issues with your functionality.'
        });
        
        this.logger.info('Health check completed successfully');
      });
    }
    
    // Save state
    this.saveState();
  }
  
  /**
   * Load agent state from disk
   */
  private loadState(): AgentState {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = fs.readFileSync(this.stateFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.error('Error loading agent state', error);
    }
    
    // Return default state if loading fails
    return {
      lastActive: Date.now(),
      sessionStartTime: Date.now(),
      consecutiveErrors: 0,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      customState: {}
    };
  }
  
  /**
   * Save agent state to disk
   */
  private saveState(): void {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (error) {
      this.logger.error('Error saving agent state', error);
    }
  }
  
  /**
   * Run an operation with the underlying agent
   * 
   * @param taskOrOptions - Task string or options for the agent
   * @returns Promise resolving to the agent's response
   */
  public async runOperation<T>(taskOrOptions: string | any): Promise<T> {
    const options = typeof taskOrOptions === 'string' ? { task: taskOrOptions } : taskOrOptions;
    
    return new Promise<T>((resolve, reject) => {
      this.queueOperation(async () => {
        try {
          const result = await this.agent.run(options);
          resolve(result as T);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  /**
   * Get or update the agent's custom state
   * 
   * @param key - State key
   * @param value - Optional value to set
   * @returns The current value for the key
   */
  public customState<T>(key: string, value?: T): T | undefined {
    if (value !== undefined) {
      this.state.customState[key] = value;
      this.saveState();
    }
    
    return this.state.customState[key] as T;
  }
  
  /**
   * Get agent status information
   */
  public getStatus(): {
    name: string;
    running: boolean;
    lastActive: Date;
    uptime: number;
    queueLength: number;
    operations: {
      total: number;
      successful: number;
      failed: number;
      successRate: number;
    };
    goals?: {
      total: number;
      active: number;
      completed: number;
      failed: number;
      pending: number;
      recurring: number;
    };
  } {
    const uptimeMs = Date.now() - this.state.sessionStartTime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    
    // Extract the agent name
    const agentName = (this.agent as any).name || 'autonomous-agent';
    
    const status: {
      name: string;
      running: boolean;
      lastActive: Date;
      uptime: number;
      queueLength: number;
      operations: {
        total: number;
        successful: number;
        failed: number;
        successRate: number;
      };
      goals?: {
        total: number;
        active: number;
        completed: number;
        failed: number;
        pending: number;
        recurring: number;
      };
    } = {
      name: agentName,
      running: this.running,
      lastActive: new Date(this.state.lastActive),
      uptime: uptimeHours,
      queueLength: this.operationQueue.length,
      operations: {
        total: this.state.totalOperations,
        successful: this.state.successfulOperations,
        failed: this.state.failedOperations,
        successRate: this.state.totalOperations > 0 
          ? (this.state.successfulOperations / this.state.totalOperations) * 100 
          : 0
      }
    };
    
    // Add goal statistics if goal planning is enabled
    if (this.goalPlanner) {
      const goals = this.goalPlanner.getGoals();
      
      status.goals = {
        total: goals.length,
        active: this.activeGoals.size,
        completed: goals.filter(g => g.status === GoalStatus.COMPLETED).length,
        failed: goals.filter(g => g.status === GoalStatus.FAILED).length,
        pending: goals.filter(g => g.status === GoalStatus.PENDING).length,
        recurring: this.recurringGoalTimers.size
      };
    }
    
    return status;
  }
  
  /**
   * Creates a new goal for the agent to work towards
   * 
   * @param description - Description of the goal
   * @param options - Additional goal options
   * @returns The created goal
   */
  public async createGoal(
    description: string,
    options: {
      type?: GoalType;
      successCriteria?: string[];
      priority?: number;
      deadline?: Date;
      recurrence?: string;
      metadata?: Record<string, any>;
      executeImmediately?: boolean;
      tools?: Tool[];
    } = {}
  ): Promise<Goal> {
    if (!this.goalPlanner) {
      throw new Error('Goal planning is not enabled for this agent');
    }
    
    this.logger.info(`Creating new goal: ${description}`);
    
    const goal = await this.goalPlanner.createMainGoal(description, {
      type: options.type,
      successCriteria: options.successCriteria,
      priority: options.priority,
      deadline: options.deadline,
      recurrence: options.recurrence,
      metadata: options.metadata
    });
    
    // Persist goals if enabled
    if (this.config.goalPlanning?.persistGoals && this.goalsFilePath) {
      this.saveGoals();
    }
    
    // If recurrence is specified, set up a timer
    if (options.recurrence) {
      this.setupRecurringGoal(goal.id, options.recurrence, options.tools || []);
    }
    
    // Execute immediately if requested
    if (options.executeImmediately) {
      this.queueOperation(async () => {
        await this.executeGoal(goal.id, {
          tools: options.tools
        });
      });
    }
    
    return goal;
  }
  
  /**
   * Execute a goal
   * 
   * @param goalId - ID of the goal to execute
   * @param options - Execution options
   * @returns Promise resolving to the execution result
   */
  public async executeGoal(
    goalId: string,
    options: RunGoalOptions = {}
  ): Promise<GoalResult> {
    if (!this.goalPlanner) {
      throw new Error('Goal planning is not enabled for this agent');
    }
    
    const goal = this.goalPlanner.getGoal(goalId);
    if (!goal) {
      throw new Error(`Goal with ID ${goalId} not found`);
    }
    
    // Check if the goal is already being executed
    if (this.activeGoals.has(goalId)) {
      throw new Error(`Goal with ID ${goalId} is already being executed`);
    }
    
    // Check if we're at the concurrent goal limit
    const maxConcurrentGoals = this.config.goalPlanning?.maxConcurrentGoals || 5;
    if (this.activeGoals.size >= maxConcurrentGoals) {
      throw new Error(`Maximum number of concurrent goals (${maxConcurrentGoals}) reached`);
    }
    
    this.logger.info(`Executing goal: ${goal.description}`);
    this.activeGoals.add(goalId);
    
    try {
      // Set up progress tracking if callback provided
      let progressCallback = options.onProgress;
      if (progressCallback) {
        const originalProgressCallback = progressCallback;
        
        // Wrap the original callback to include a progress percentage
        progressCallback = (progress) => {
          originalProgressCallback({
            ...progress,
            progress: this.calculateProgressPercentage(goalId, progress)
          });
        };
        
        // Report initial progress
        progressCallback({
          goalId,
          message: `Starting goal execution: ${goal.description}`,
          progress: 0
        });
      }
      
      // Execute the goal
      const result = await this.goalPlanner.executeGoal(
        goalId,
        options.tools || [],
        {
          maxReflections: options.maxReflections,
          reflectAfterTaskCount: options.reflectAfterTaskCount,
          stopOnFailure: options.stopOnFailure
        }
      );
      
      // If the goal is recurring and succeeded, reset its status for next execution
      const goalAfterExecution = this.goalPlanner.getGoal(goalId);
      if (goalAfterExecution?.recurrence && result.success) {
        // Reset the goal for next execution
        await this.resetRecurringGoal(goalId);
      }
      
      // Persist updated goals if enabled
      if (this.config.goalPlanning?.persistGoals && this.goalsFilePath) {
        this.saveGoals();
      }
      
      // Final progress report
      if (options.onProgress) {
        options.onProgress({
          goalId,
          message: `Goal execution complete: ${goal.description}, Success: ${result.success}`,
          progress: result.success ? 100 : 0
        });
      }
      
      this.logger.info(`Goal execution complete: ${goal.description}, Success: ${result.success}`);
      return result;
    } catch (error) {
      this.logger.error(`Error executing goal: ${goal.description}`, error);
      throw error;
    } finally {
      this.activeGoals.delete(goalId);
    }
  }
  
  /**
   * Calculate an approximate progress percentage for a goal
   * 
   * @param goalId - ID of the goal
   * @param progress - Current progress info
   * @returns Progress percentage (0-100)
   */
  private calculateProgressPercentage(
    goalId: string,
    progress: {
      goalId: string;
      subGoalId?: string;
      taskId?: string;
      message: string;
      progress?: number;
    }
  ): number {
    if (!this.goalPlanner) return 0;
    
    // Get all sub-goals and tasks
    const subGoals = this.goalPlanner.getSubGoals(goalId);
    let tasks: GoalTask[] = [];
    
    for (const subGoal of subGoals) {
      const subGoalTasks = this.goalPlanner.getTasksForGoal(subGoal.id);
      tasks = [...tasks, ...subGoalTasks];
    }
    
    // If no tasks yet, use a simpler estimation
    if (tasks.length === 0) {
      // If we have sub-goals but no tasks, estimate based on sub-goal status
      if (subGoals.length > 0) {
        const completedSubGoals = subGoals.filter(sg => 
          sg.status === GoalStatus.COMPLETED || sg.status === GoalStatus.FAILED
        ).length;
        return Math.floor((completedSubGoals / subGoals.length) * 100);
      }
      return 5; // Default to 5% at the start
    }
    
    // Calculate based on task completion
    const completedTasks = tasks.filter(t => 
      t.status === GoalStatus.COMPLETED || t.status === GoalStatus.FAILED
    ).length;
    
    return Math.floor((completedTasks / tasks.length) * 100);
  }
  
  /**
   * Sets up a recurring goal with a timer
   * 
   * @param goalId - ID of the goal
   * @param recurrencePattern - Recurrence pattern string (e.g., 'every 6 hours')
   * @param tools - Tools available for this goal
   */
  private setupRecurringGoal(
    goalId: string,
    recurrencePattern: string,
    tools: Tool[] = []
  ): void {
    // Clear any existing timer for this goal
    this.clearRecurringGoalTimer(goalId);
    
    // Parse the recurrence pattern to get the interval in milliseconds
    const intervalMs = this.parseRecurrenceInterval(recurrencePattern);
    if (!intervalMs) {
      this.logger.warn(`Unrecognized recurrence pattern: ${recurrencePattern}`);
      return;
    }
    
    this.logger.info(`Setting up recurring goal ${goalId} to run ${recurrencePattern} (${intervalMs}ms)`);
    
    // Set up the timer
    const timer = setInterval(async () => {
      try {
        // Check if the goal is already running
        if (this.activeGoals.has(goalId)) {
          this.logger.info(`Skipping scheduled run of goal ${goalId} as it's already running`);
          return;
        }
        
        const goal = this.goalPlanner?.getGoal(goalId);
        if (!goal) {
          this.logger.warn(`Recurring goal ${goalId} not found, removing timer`);
          this.clearRecurringGoalTimer(goalId);
          return;
        }
        
        this.logger.info(`Executing recurring goal: ${goal.description}`);
        
        // Queue the goal execution
        this.queueOperation(async () => {
          try {
            // Reset the goal state if needed
            await this.resetRecurringGoal(goalId);
            
            // Execute the goal
            await this.executeGoal(goalId, {
              tools: tools
            });
          } catch (error) {
            this.logger.error(`Error executing recurring goal ${goalId}`, error);
          }
        });
      } catch (error) {
        this.logger.error(`Error scheduling recurring goal ${goalId}`, error);
      }
    }, intervalMs);
    
    // Store the timer
    this.recurringGoalTimers.set(goalId, timer);
  }
  
  /**
   * Clear a recurring goal timer
   * 
   * @param goalId - ID of the goal
   */
  private clearRecurringGoalTimer(goalId: string): void {
    const timer = this.recurringGoalTimers.get(goalId);
    if (timer) {
      clearInterval(timer);
      this.recurringGoalTimers.delete(goalId);
    }
  }
  
  /**
   * Parse a recurrence pattern into milliseconds
   * 
   * @param pattern - Recurrence pattern string
   * @returns Milliseconds interval or null if invalid
   */
  private parseRecurrenceInterval(pattern: string): number | null {
    // Pattern examples: "every 6 hours", "daily", "every 30 minutes", "hourly"
    const timeUnitMs = {
      minute: 60 * 1000,
      minutes: 60 * 1000,
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000
    };
    
    // Check for hourly/daily/weekly patterns
    if (pattern.toLowerCase() === 'hourly') {
      return timeUnitMs.hour;
    } else if (pattern.toLowerCase() === 'daily') {
      return timeUnitMs.day;
    } else if (pattern.toLowerCase() === 'weekly') {
      return timeUnitMs.week;
    }
    
    // Check for "every X units" pattern
    const match = pattern.match(/every\s+(\d+)\s+([a-z]+)/i);
    if (match) {
      const quantity = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      if (timeUnitMs[unit as keyof typeof timeUnitMs]) {
        return quantity * timeUnitMs[unit as keyof typeof timeUnitMs];
      }
    }
    
    return null;
  }
  
  /**
   * Reset a recurring goal for its next execution
   * 
   * @param goalId - ID of the goal to reset
   */
  private async resetRecurringGoal(goalId: string): Promise<void> {
    if (!this.goalPlanner) return;
    
    const goal = this.goalPlanner.getGoal(goalId);
    if (!goal) return;
    
    this.logger.info(`Resetting recurring goal: ${goal.description}`);
    
    // Get all sub-goals and tasks
    const subGoals = this.goalPlanner.getSubGoals(goalId);
    
    // Reset the status of the goal and its sub-goals
    goal.status = GoalStatus.PENDING;
    goal.updatedAt = new Date();
    
    // Reset all sub-goals
    for (const subGoal of subGoals) {
      subGoal.status = GoalStatus.PENDING;
      subGoal.updatedAt = new Date();
    }
    
    // Save if persistence is enabled
    if (this.config.goalPlanning?.persistGoals && this.goalsFilePath) {
      this.saveGoals();
    }
  }
  
  /**
   * Save goals to disk
   */
  private saveGoals(): void {
    if (!this.goalPlanner || !this.goalsFilePath) return;
    
    try {
      // Get all goals and tasks
      const goals = this.goalPlanner.getGoals();
      const tasks = this.goalPlanner.getTasks();
      
      // Prepare data to save
      const data = {
        goals,
        tasks,
        recurringGoals: Array.from(this.recurringGoalTimers.keys())
      };
      
      // Write to file
      fs.writeFileSync(this.goalsFilePath, JSON.stringify(data, null, 2));
      this.logger.debug(`Saved ${goals.length} goals and ${tasks.length} tasks to ${this.goalsFilePath}`);
    } catch (error) {
      this.logger.error('Failed to save goals', error);
    }
  }
  
  /**
   * Load goals from disk
   */
  private loadGoals(): void {
    if (!this.goalPlanner || !this.goalsFilePath) return;
    
    try {
      // Check if file exists
      if (!fs.existsSync(this.goalsFilePath)) {
        this.logger.debug(`No goals file found at ${this.goalsFilePath}`);
        return;
      }
      
      // Read and parse file
      const data = JSON.parse(fs.readFileSync(this.goalsFilePath, 'utf-8'));
      
      // For now, just log that we found saved goals
      // Full implementation would require directly manipulating goal planner's internal maps
      this.logger.debug(`Found ${data.goals?.length || 0} saved goals in ${this.goalsFilePath}`);
      
      // Restore recurring goal timers
      if (data.recurringGoals && Array.isArray(data.recurringGoals)) {
        for (const goalId of data.recurringGoals) {
          const goal = data.goals.find((g: any) => g.id === goalId);
          if (goal && goal.recurrence) {
            // Re-setup the timer (without tools for now as we can't serialize them)
            this.setupRecurringGoal(goalId, goal.recurrence, []);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load goals', error);
    }
  }
  
  /**
   * Gets all goals
   * 
   * @returns Array of all goals
   */
  public getGoals(): Goal[] {
    if (!this.goalPlanner) {
      return [];
    }
    return this.goalPlanner.getGoals();
  }
  
  /**
   * Gets a specific goal
   * 
   * @param goalId - ID of the goal
   * @returns The goal or undefined if not found
   */
  public getGoal(goalId: string): Goal | undefined {
    if (!this.goalPlanner) {
      return undefined;
    }
    return this.goalPlanner.getGoal(goalId);
  }
  
  /**
   * Cancels a goal
   * 
   * @param goalId - ID of the goal to cancel
   * @returns Whether the goal was successfully cancelled
   */
  public cancelGoal(goalId: string): boolean {
    if (!this.goalPlanner) {
      return false;
    }
    
    const goal = this.goalPlanner.getGoal(goalId);
    if (!goal) return false;
    
    this.logger.info(`Cancelling goal: ${goal.description}`);
    
    // Clear recurring timer if any
    this.clearRecurringGoalTimer(goalId);
    
    // Update the status
    goal.status = GoalStatus.CANCELLED;
    goal.updatedAt = new Date();
    
    // Persist if enabled
    if (this.config.goalPlanning?.persistGoals && this.goalsFilePath) {
      this.saveGoals();
    }
    
    return true;
  }
}