import { AgentConfig } from '../core/types';

/**
 * Creates a system prompt from an agent's configuration
 * 
 * @param config - The agent's configuration
 * @returns A formatted system prompt string
 */
export function createSystemPrompt(config: AgentConfig): string {
  // If a custom system prompt is provided, use that
  if (config.systemPrompt) {
    return config.systemPrompt;
  }
  
  // Build personality traits string
  const traitsString = config.personality.traits.join(', ');
  
  // Build goals string
  const goalsString = config.goals.map(goal => `- ${goal}`).join('\n');
  
  // Create the full system prompt
  const prompt = `# Role: ${config.role}

You are ${config.name}, ${config.personality.background}

## Your Personality
You are ${traitsString}.
${config.personality.voice ? `You speak in a ${config.personality.voice} tone.` : ''}

## Your Goals
${goalsString}

## How You Should Respond
- Respond in character as ${config.name}
- Be helpful, accurate, and provide thoughtful responses
- When you don't know something, admit it rather than making up information
- If asked to perform a task using tools, use the appropriate tools to complete the task
`;

  // If there are examples, add them
  if (config.personality.examples && config.personality.examples.length > 0) {
    const examplesString = config.personality.examples.map((example, i) => 
      `Example ${i+1}:\n${example}`
    ).join('\n\n');
    
    return `${prompt}\n## Examples of How You Respond\n${examplesString}`;
  }
  
  return prompt;
}

/**
 * Creates a task planning prompt for breaking down complex tasks
 * 
 * @param task - The complex task to break down
 * @param strategy - The planning strategy to use
 * @returns A formatted planning prompt
 */
export function createPlanningPrompt(task: string, strategy = 'sequential'): string {
  return `# Task Planning
  
I need to break down the following complex task into manageable steps:

"${task}"

Please help me create a ${strategy} plan by:

1. Analyzing what the task requires
2. Identifying the main components or stages
3. Breaking those down into specific, actionable steps
4. Determining any tools or resources needed for each step
5. Establishing dependencies between steps (what must happen before what)

Please format your response as a structured plan with clear steps that I can follow.`;
}

/**
 * Creates an enhanced hierarchical planning prompt
 * 
 * @param task - The complex task to break down
 * @returns A formatted hierarchical planning prompt
 */
export function createHierarchicalPlanningPrompt(task: string): string {
  return `# Hierarchical Task Planning

I need to create a detailed hierarchical plan for the following complex task:

"${task}"

Please help me by creating a comprehensive plan with:

1. Major phases of work (high-level tasks)
2. For each phase, break it down into specific subtasks
3. For complex subtasks, further decompose them into atomic actions
4. Identify dependencies between tasks (what must be completed before other tasks)
5. Indicate which tasks could be executed in parallel
6. Estimate relative effort for each task (low/medium/high)
7. Identify any specialized tools or resources needed for specific tasks

Format your response with clear hierarchical structure using the following format:

<phases>
PHASE 1: [Name]
- Description: [Brief description]
- Estimated effort: [Low/Medium/High]

  TASK 1.1: [Name]
  - Description: [Detailed description]
  - Dependencies: [List of task IDs that must be completed first, if any]
  - Can run in parallel: [Yes/No]
  - Tools needed: [List of tools or resources needed]
  - Estimated effort: [Low/Medium/High]

    SUBTASK 1.1.1: [Name]
    - Description: [Atomic action description]
    - Dependencies: [List of subtask IDs that must be completed first]
    - Estimated effort: [Low/Medium/High]
</phases>

Ensure the plan is comprehensive enough to fully accomplish the task but broken down into manageable pieces.`;
}

/**
 * Creates a planning prompt for adaptive replanning
 * 
 * @param originalTask - The original task
 * @param plan - The current plan
 * @param completedTasks - The tasks completed so far
 * @param failedTasks - The tasks that failed
 * @returns A formatted replanning prompt
 */
export function createReplanningPrompt(
  originalTask: string, 
  plan: string,
  completedTasks: string, 
  failedTasks: string
): string {
  return `# Adaptive Replanning

I was working on the following task:

"${originalTask}"

My original plan was:
${plan}

So far, I've completed the following tasks:
${completedTasks}

However, the following tasks failed or encountered problems:
${failedTasks}

Given the current state and what we've learned so far, please help me revise my plan by:

1. Analyzing what went wrong with the failed tasks
2. Determining if we need to take a different approach
3. Creating replacement tasks or alternative paths to achieve the goal
4. Adjusting any dependencies in the remaining tasks
5. Preserving what worked well in the original plan

Provide a revised plan that builds on our progress while addressing the issues we encountered.`;
}

/**
 * Creates a memory retrieval prompt
 * 
 * @param query - The query to search memories for
 * @returns A formatted memory retrieval prompt
 */
export function createMemoryRetrievalPrompt(query: string): string {
  return `Please search your memory for information relevant to: "${query}"

Return only the most relevant memories that would help address this query, ranked by relevance.`;
}

/**
 * Creates a prompt for agents to collaborate on a task
 * 
 * @param task - The task to collaborate on
 * @param agents - Names of the agents in the collaboration
 * @returns A formatted collaboration prompt
 */
export function createCollaborationPrompt(task: string, agents: string[]): string {
  const agentsList = agents.map(agent => `- ${agent}`).join('\n');
  
  return `# Collaborative Task

We need to work together to complete the following task:

"${task}"

The following agents are participating in this collaboration:
${agentsList}

As the coordinator, please:
1. Analyze the task requirements
2. Determine which agent is best suited for each part of the task
3. Create a coordination plan showing how the agents should work together
4. Identify any dependencies between the agents' work`;
}