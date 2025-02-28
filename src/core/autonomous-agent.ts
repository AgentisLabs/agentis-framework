/**
 * Autonomous Agent - provides self-management capabilities for continuously running agents
 * Handles background processing, self-monitoring, and recovery mechanisms
 */

import { Agent } from './agent';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

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
    
    // Save final state
    this.saveState();
    
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
  } {
    const uptimeMs = Date.now() - this.state.sessionStartTime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    
    // Extract the agent name
    const agentName = (this.agent as any).name || 'autonomous-agent';
    
    return {
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
  }
}