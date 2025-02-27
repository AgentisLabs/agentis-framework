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
 * @returns A formatted planning prompt
 */
export function createPlanningPrompt(task: string): string {
  return `# Task Planning
  
I need to break down the following complex task into manageable steps:

"${task}"

Please help me create a step-by-step plan by:

1. Analyzing what the task requires
2. Identifying the main components or stages
3. Breaking those down into specific, actionable steps
4. Determining any tools or resources needed for each step
5. Establishing dependencies between steps (what must happen before what)

Please format your response as a structured plan with clear steps that I can follow.`;
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