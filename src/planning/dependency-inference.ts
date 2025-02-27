/**
 * Advanced Task Dependency Inference System
 * 
 * This system uses a combination of techniques to automatically infer dependencies
 * between tasks in a plan, including:
 * 
 * 1. Natural language processing to detect dependency phrases
 * 2. Knowledge flow analysis to understand input/output relationships
 * 3. Task type hierarchy analysis to understand logical task ordering
 * 4. Content similarity analysis to detect related tasks
 */

import { PlanTask } from './planner-interface';
import { Logger } from '../utils/logger';

/**
 * Graph representation of task dependencies
 */
export interface DependencyGraph {
  tasks: PlanTask[];
  edges: Array<{from: string; to: string; weight: number}>;
  criticalPath: string[];
}

/**
 * Information flow between tasks
 */
export interface TaskInfoFlow {
  taskId: string;
  inputs: string[]; // Types of information this task needs
  outputs: string[]; // Types of information this task produces
}

/**
 * Configuration for dependency inference
 */
export interface DependencyInferenceConfig {
  enableContentSimilarity?: boolean;
  enableTypeHierarchy?: boolean;
  enableInformationFlow?: boolean;
  minDependencyCertainty?: number; // 0.0 - 1.0
  maxDependenciesPerTask?: number;
}

/**
 * A class that provides advanced dependency inference capabilities
 */
export class DependencyInference {
  private logger: Logger;
  private config: Required<DependencyInferenceConfig>;
  
  // Task type hierarchy - determines logical ordering of tasks
  private taskTypeHierarchy: Record<string, number> = {
    'research': 1,
    'data-gathering': 1,
    'search': 1,
    'analysis': 2,
    'evaluation': 2, 
    'interpretation': 2,
    'planning': 3,
    'design': 3,
    'writing': 4,
    'implementation': 4,
    'creation': 4,
    'review': 5,
    'testing': 5,
    'validation': 5,
    'refinement': 6,
    'finalization': 7
  };
  
  // Dependency phrases that indicate one task depends on another
  private dependencyPhrases: string[] = [
    'depends on',
    'after',
    'following',
    'based on',
    'using',
    'utilizing',
    'with input from',
    'building on',
    'extending',
    'requires',
    'needs',
    'once',
    'when',
    'subsequent to'
  ];
  
  /**
   * Creates a new dependency inference system
   * 
   * @param config - Configuration options
   */
  constructor(config?: DependencyInferenceConfig) {
    this.logger = new Logger('DependencyInference');
    
    // Default configuration
    this.config = {
      enableContentSimilarity: true,
      enableTypeHierarchy: true,
      enableInformationFlow: true,
      minDependencyCertainty: 0.6,  // Only add dependencies with 60% or higher certainty
      maxDependenciesPerTask: 3,    // Avoid too many dependencies per task
      ...config
    };
  }
  
  /**
   * Infer dependencies between tasks in a plan
   * 
   * @param tasks - The tasks to analyze
   * @param contextText - Optional natural language context that describes the plan
   * @returns The tasks with inferred dependencies
   */
  inferDependencies(tasks: PlanTask[], contextText?: string): PlanTask[] {
    this.logger.debug('Inferring dependencies between tasks', { taskCount: tasks.length });
    
    // Create a copy of the tasks to work with
    const updatedTasks = JSON.parse(JSON.stringify(tasks)) as PlanTask[];
    
    // 1. First, analyze explicit dependencies from text
    if (contextText) {
      this.inferDependenciesFromText(updatedTasks, contextText);
    }
    
    // 2. Then, analyze dependencies based on task type hierarchy
    if (this.config.enableTypeHierarchy) {
      this.inferDependenciesFromTaskTypes(updatedTasks);
    }
    
    // 3. Analyze information flow between tasks
    if (this.config.enableInformationFlow) {
      this.inferDependenciesFromInformationFlow(updatedTasks);
    }
    
    // 4. Look for content similarity to detect related tasks
    if (this.config.enableContentSimilarity) {
      this.inferDependenciesFromContentSimilarity(updatedTasks);
    }
    
    // 5. Build a dependency graph and detect cycles
    const graph = this.buildDependencyGraph(updatedTasks);
    
    // 6. Remove dependency cycles to ensure the plan can execute
    this.removeDependencyCycles(updatedTasks, graph);
    
    // 7. Limit dependencies per task
    this.limitDependenciesPerTask(updatedTasks);
    
    return updatedTasks;
  }
  
  /**
   * Infer dependencies from natural language text
   * 
   * @param tasks - The tasks to update with dependencies
   * @param contextText - The text to analyze
   */
  private inferDependenciesFromText(tasks: PlanTask[], contextText: string): void {
    this.logger.debug('Inferring dependencies from text context');
    
    // Normalize text for analysis
    const normalizedText = contextText.toLowerCase();
    
    // For each task, look for phrases indicating dependencies
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskDesc = task.description.toLowerCase();
      
      // Check for phrases indicating dependencies
      for (const phrase of this.dependencyPhrases) {
        // Look for patterns like "Task X depends on Task Y"
        const pattern = new RegExp(`(?:${taskDesc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*(?:\\w+\\s+){0,5}${phrase}\\s+([^\\.,;]+)`, 'i');
        const match = normalizedText.match(pattern);
        
        if (match && match[1]) {
          const potentialDependency = match[1].trim();
          
          // Find tasks that match the potential dependency
          for (let j = 0; j < tasks.length; j++) {
            if (i !== j && tasks[j].description.toLowerCase().includes(potentialDependency)) {
              // Add the dependency if it doesn't already exist
              if (!task.dependencies.includes(tasks[j].id)) {
                task.dependencies.push(tasks[j].id);
                this.logger.debug(`Added text dependency from "${task.description}" to "${tasks[j].description}"`);
              }
            }
          }
        }
      }
      
      // Check for output/input patterns
      if (
        taskDesc.includes('using the') || 
        taskDesc.includes('based on') || 
        taskDesc.includes('with the results') ||
        taskDesc.includes('analyze the')
      ) {
        // This task likely depends on research or data gathering tasks
        for (let j = 0; j < tasks.length; j++) {
          const otherTask = tasks[j].description.toLowerCase();
          if (i !== j && 
            (otherTask.includes('research') || 
             otherTask.includes('collect') ||
             otherTask.includes('gather') ||
             otherTask.includes('find') ||
             otherTask.includes('identify') ||
             otherTask.includes('search'))
          ) {
            // Add the dependency if it doesn't already exist
            if (!task.dependencies.includes(tasks[j].id)) {
              task.dependencies.push(tasks[j].id);
              this.logger.debug(`Added input/output dependency from "${task.description}" to "${tasks[j].description}"`);
            }
          }
        }
      }
    }
  }
  
  /**
   * Infer dependencies based on task type hierarchy
   * 
   * @param tasks - The tasks to update with dependencies
   */
  private inferDependenciesFromTaskTypes(tasks: PlanTask[]): void {
    this.logger.debug('Inferring dependencies from task types');
    
    // Extract task types from descriptions
    const taskTypes: Record<string, number> = {};
    
    for (const task of tasks) {
      // Try to determine task type from description
      let lowestLevel = 999;
      const description = task.description.toLowerCase();
      
      // Find all matching task types and take the lowest level
      for (const [type, level] of Object.entries(this.taskTypeHierarchy)) {
        if (description.includes(type)) {
          lowestLevel = Math.min(lowestLevel, level);
        }
      }
      
      // If we found a matching type, assign it
      if (lowestLevel < 999) {
        taskTypes[task.id] = lowestLevel;
      } else {
        // Look for other common keywords to determine task type
        if (description.includes('find') || description.includes('search') || description.includes('gather')) {
          taskTypes[task.id] = this.taskTypeHierarchy['research'];
        } else if (description.includes('analyze') || description.includes('examine')) {
          taskTypes[task.id] = this.taskTypeHierarchy['analysis'];
        } else if (description.includes('write') || description.includes('create') || description.includes('develop')) {
          taskTypes[task.id] = this.taskTypeHierarchy['writing'];
        } else if (description.includes('review') || description.includes('test') || description.includes('check')) {
          taskTypes[task.id] = this.taskTypeHierarchy['review'];
        } else {
          // Default to middle of hierarchy
          taskTypes[task.id] = 3;
        }
      }
    }
    
    // Create dependencies based on task type hierarchy
    for (let i = 0; i < tasks.length; i++) {
      const taskA = tasks[i];
      const levelA = taskTypes[taskA.id] || 3;
      
      for (let j = 0; j < tasks.length; j++) {
        if (i === j) continue;
        
        const taskB = tasks[j];
        const levelB = taskTypes[taskB.id] || 3;
        
        // If task B is at a lower level (earlier in the hierarchy) than task A
        // and they share content keywords, create a dependency
        if (levelB < levelA) {
          // Check for content similarity
          const keywordsA = this.extractKeywords(taskA.description);
          const keywordsB = this.extractKeywords(taskB.description);
          
          // Find common keywords (excluding stop words)
          const commonKeywords = keywordsA.filter(word => 
            keywordsB.includes(word) && word.length > 4
          );
          
          if (commonKeywords.length >= 1) {
            // Add the dependency if it doesn't already exist
            if (!taskA.dependencies.includes(taskB.id)) {
              taskA.dependencies.push(taskB.id);
              this.logger.debug(`Added type hierarchy dependency from "${taskA.description}" (level ${levelA}) to "${taskB.description}" (level ${levelB})`);
            }
          }
        }
      }
    }
  }
  
  /**
   * Infer dependencies from information flow between tasks
   * 
   * @param tasks - The tasks to update with dependencies
   */
  private inferDependenciesFromInformationFlow(tasks: PlanTask[]): void {
    this.logger.debug('Inferring dependencies from information flow');
    
    // Define common information types that flow between tasks
    const infoTypes = [
      'data', 'research', 'analysis', 'results', 'findings', 
      'report', 'documentation', 'design', 'requirements',
      'feedback', 'metrics', 'recommendations', 'insights'
    ];
    
    // Analyze each task for information inputs and outputs
    const infoFlows: TaskInfoFlow[] = [];
    
    for (const task of tasks) {
      const desc = task.description.toLowerCase();
      const inputs: string[] = [];
      const outputs: string[] = [];
      
      // Detect outputs (what this task produces)
      for (const type of infoTypes) {
        if (
          desc.includes(`generate ${type}`) ||
          desc.includes(`create ${type}`) ||
          desc.includes(`produce ${type}`) ||
          desc.includes(`develop ${type}`) ||
          desc.includes(`write ${type}`) ||
          desc.includes(`prepare ${type}`) ||
          desc.includes(`compile ${type}`)
        ) {
          outputs.push(type);
        }
      }
      
      // Detect inputs (what this task needs)
      for (const type of infoTypes) {
        if (
          desc.includes(`using ${type}`) ||
          desc.includes(`based on ${type}`) ||
          desc.includes(`from ${type}`) ||
          desc.includes(`analyze ${type}`) ||
          desc.includes(`review ${type}`) ||
          desc.includes(`with ${type}`)
        ) {
          inputs.push(type);
        }
      }
      
      infoFlows.push({
        taskId: task.id,
        inputs,
        outputs
      });
    }
    
    // Create dependencies based on information flow
    for (let i = 0; i < infoFlows.length; i++) {
      const flowA = infoFlows[i];
      
      // If this task needs inputs
      if (flowA.inputs.length > 0) {
        for (let j = 0; j < infoFlows.length; j++) {
          if (i === j) continue;
          
          const flowB = infoFlows[j];
          
          // Check if task B produces any inputs that task A needs
          const matchingInfoTypes = flowA.inputs.filter(input => 
            flowB.outputs.includes(input)
          );
          
          if (matchingInfoTypes.length > 0) {
            const taskA = tasks.find(t => t.id === flowA.taskId);
            if (taskA && !taskA.dependencies.includes(flowB.taskId)) {
              taskA.dependencies.push(flowB.taskId);
              const taskB = tasks.find(t => t.id === flowB.taskId);
              this.logger.debug(`Added information flow dependency from "${taskA.description}" to "${taskB?.description}" (info types: ${matchingInfoTypes.join(', ')})`);
            }
          }
        }
      }
    }
  }
  
  /**
   * Infer dependencies based on content similarity between tasks
   * 
   * @param tasks - The tasks to update with dependencies
   */
  private inferDependenciesFromContentSimilarity(tasks: PlanTask[]): void {
    this.logger.debug('Inferring dependencies from content similarity');
    
    // For each pair of tasks, calculate content similarity
    for (let i = 0; i < tasks.length; i++) {
      const taskA = tasks[i];
      const keywordsA = this.extractKeywords(taskA.description);
      
      for (let j = 0; j < tasks.length; j++) {
        if (i === j) continue;
        
        const taskB = tasks[j];
        const keywordsB = this.extractKeywords(taskB.description);
        
        // Calculate Jaccard similarity coefficient
        const commonKeywords = keywordsA.filter(word => keywordsB.includes(word));
        const unionKeywords = new Set([...keywordsA, ...keywordsB]);
        
        const similarity = commonKeywords.length / unionKeywords.size;
        
        // If tasks are very similar, add dependency from the later task to the earlier one
        // (assuming similar tasks are likely part of a sequence)
        if (similarity > 0.3) {
          this.logger.debug(`High similarity (${similarity.toFixed(2)}) between "${taskA.description}" and "${taskB.description}"`);
          
          // Create dependency based on assumed sequence
          if (!taskA.dependencies.includes(taskB.id) && !taskB.dependencies.includes(taskA.id)) {
            // Check if we can determine a natural sequence
            const seqA = this.estimateSequencePosition(taskA.description);
            const seqB = this.estimateSequencePosition(taskB.description);
            
            if (seqA > seqB) {
              taskA.dependencies.push(taskB.id);
              this.logger.debug(`Added similarity dependency from "${taskA.description}" to "${taskB.description}"`);
            } else if (seqB > seqA) {
              taskB.dependencies.push(taskA.id);
              this.logger.debug(`Added similarity dependency from "${taskB.description}" to "${taskA.description}"`);
            }
          }
        }
      }
    }
  }
  
  /**
   * Builds a dependency graph from tasks
   * 
   * @param tasks - The tasks to build a graph from
   * @returns The dependency graph
   */
  private buildDependencyGraph(tasks: PlanTask[]): DependencyGraph {
    const edges: Array<{from: string; to: string; weight: number}> = [];
    
    // Build edges from dependencies
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        edges.push({
          from: depId,
          to: task.id,
          weight: 1
        });
      }
    }
    
    // Calculate critical path (simplified)
    const criticalPath = this.calculateCriticalPath(tasks, edges);
    
    return {
      tasks,
      edges,
      criticalPath
    };
  }
  
  /**
   * Calculates the critical path through the dependency graph
   * 
   * @param tasks - The tasks in the graph
   * @param edges - The edges in the graph
   * @returns The critical path (sequence of task IDs)
   */
  private calculateCriticalPath(
    tasks: PlanTask[], 
    edges: Array<{from: string; to: string; weight: number}>
  ): string[] {
    // Find start nodes (no incoming edges)
    const incomingEdges: Record<string, number> = {};
    
    for (const edge of edges) {
      incomingEdges[edge.to] = (incomingEdges[edge.to] || 0) + 1;
    }
    
    const startNodes = tasks
      .filter(task => !incomingEdges[task.id])
      .map(task => task.id);
    
    // Find end nodes (no outgoing edges)
    const outgoingEdges: Record<string, number> = {};
    
    for (const edge of edges) {
      outgoingEdges[edge.from] = (outgoingEdges[edge.from] || 0) + 1;
    }
    
    const endNodes = tasks
      .filter(task => !outgoingEdges[task.id])
      .map(task => task.id);
    
    // For each start node, find the longest path to any end node
    let criticalPath: string[] = [];
    
    for (const startNode of startNodes) {
      // Simple BFS to find all paths
      const queue: Array<{path: string[]; node: string}> = [{
        path: [startNode],
        node: startNode
      }];
      
      while (queue.length > 0) {
        const { path, node } = queue.shift()!;
        
        // If this is an end node, check if it's the longest path so far
        if (endNodes.includes(node) && path.length > criticalPath.length) {
          criticalPath = path;
        }
        
        // Add outgoing edges to the queue
        const outgoing = edges.filter(edge => edge.from === node);
        for (const edge of outgoing) {
          queue.push({
            path: [...path, edge.to],
            node: edge.to
          });
        }
      }
    }
    
    return criticalPath;
  }
  
  /**
   * Removes cycles in the dependency graph to ensure the plan can execute
   * 
   * @param tasks - The tasks to update
   * @param graph - The dependency graph
   */
  private removeDependencyCycles(tasks: PlanTask[], graph: DependencyGraph): void {
    this.logger.debug('Checking for dependency cycles');
    
    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycleEdges: Array<{from: string; to: string}> = [];
    
    const detectCycles = (nodeId: string, path: string[] = []): boolean => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart).concat(nodeId);
        
        // Record all edges in this cycle
        for (let i = 0; i < cycle.length - 1; i++) {
          cycleEdges.push({from: cycle[i], to: cycle[i+1]});
        }
        
        return true;
      }
      
      if (visited.has(nodeId)) {
        return false;
      }
      
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      // Find all tasks that depend on this one
      const dependents = graph.edges.filter(edge => edge.from === nodeId);
      
      for (const dependent of dependents) {
        if (detectCycles(dependent.to, [...path, nodeId])) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    // Run cycle detection for each task
    for (const task of tasks) {
      detectCycles(task.id);
    }
    
    // If we found cycles, break them
    if (cycleEdges.length > 0) {
      this.logger.debug(`Found ${cycleEdges.length} edges in cycles, breaking cycles`);
      
      // For each cycle edge, remove the corresponding dependency
      for (const cycle of cycleEdges) {
        const task = tasks.find(t => t.id === cycle.to);
        if (task) {
          const depIndex = task.dependencies.indexOf(cycle.from);
          if (depIndex !== -1) {
            task.dependencies.splice(depIndex, 1);
            
            // Log the edge we're removing
            const fromTask = tasks.find(t => t.id === cycle.from);
            const toTask = task;
            this.logger.debug(`Removed dependency from "${toTask.description}" to "${fromTask?.description}" to break cycle`);
          }
        }
      }
    }
  }
  
  /**
   * Limit the number of dependencies per task to avoid over-constraining
   * 
   * @param tasks - The tasks to update
   */
  private limitDependenciesPerTask(tasks: PlanTask[]): void {
    const maxDeps = this.config.maxDependenciesPerTask;
    
    for (const task of tasks) {
      if (task.dependencies.length > maxDeps) {
        this.logger.debug(`Task "${task.description}" has ${task.dependencies.length} dependencies, limiting to ${maxDeps}`);
        
        // Prioritize keeping the most important dependencies
        // (simple approach: just keep the first few)
        task.dependencies = task.dependencies.slice(0, maxDeps);
      }
    }
  }
  
  /**
   * Extract keywords from a task description
   * 
   * @param text - The text to extract keywords from
   * @returns Array of keywords
   */
  private extractKeywords(text: string): string[] {
    // Simple implementation - split by non-word chars and filter out short words
    return text.toLowerCase()
      .split(/[^\w]/)
      .map(word => word.trim())
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
  }
  
  /**
   * Check if a word is a common stop word
   * 
   * @param word - The word to check
   * @returns True if the word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'then', 'than',
      'each', 'have', 'what', 'will', 'about', 'when', 'where', 'which',
      'their', 'there', 'would', 'could', 'should', 'these', 'those', 'other'
    ];
    
    return stopWords.includes(word);
  }
  
  /**
   * Estimate a task's natural position in a sequence based on keywords
   * 
   * @param description - The task description
   * @returns A numeric sequence position
   */
  private estimateSequencePosition(description: string): number {
    const desc = description.toLowerCase();
    
    // Words that indicate early, middle, and late tasks
    const earlyWords = ['initial', 'first', 'begin', 'start', 'research', 'gather', 'plan'];
    const middleWords = ['develop', 'analyze', 'create', 'build', 'implement', 'draft'];
    const lateWords = ['review', 'finalize', 'test', 'evaluate', 'polish', 'refine', 'final'];
    
    // Check presence of sequence indicator words
    let position = 5; // Default to middle
    
    for (const word of earlyWords) {
      if (desc.includes(word)) {
        position -= 2;
      }
    }
    
    for (const word of middleWords) {
      if (desc.includes(word)) {
        position += 0; // Keep in middle
      }
    }
    
    for (const word of lateWords) {
      if (desc.includes(word)) {
        position += 2;
      }
    }
    
    // Normalize to reasonable range
    return Math.max(1, Math.min(10, position));
  }
  
  /**
   * Visualize the dependency graph (returns a simple text representation)
   * 
   * @param tasks - The tasks in the graph
   * @returns Text visualization of the graph
   */
  visualizeDependencyGraph(tasks: PlanTask[]): string {
    const graph = this.buildDependencyGraph(tasks);
    let result = 'Dependency Graph:\n\n';
    
    // List all tasks with their IDs
    result += 'Tasks:\n';
    for (const task of tasks) {
      result += `- ${task.id}: ${task.description}\n`;
    }
    
    result += '\nDependencies:\n';
    for (const task of tasks) {
      if (task.dependencies.length > 0) {
        const dependsOn = task.dependencies.map(depId => {
          const depTask = tasks.find(t => t.id === depId);
          return depTask ? depTask.description : depId;
        });
        
        result += `- "${task.description}" depends on:\n`;
        for (const dep of dependsOn) {
          result += `  - "${dep}"\n`;
        }
      }
    }
    
    result += '\nCritical Path:\n';
    for (const taskId of graph.criticalPath) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        result += `- "${task.description}"\n`;
      }
    }
    
    return result;
  }
}