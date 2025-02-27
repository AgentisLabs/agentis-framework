// Basic agent example
import { Agent, AgentRole, InMemoryMemory, WebSearchTool } from '../src';

/**
 * This example demonstrates creating a basic agent with in-memory storage
 * and using it to answer a question.
 */
async function main() {
  console.log('Creating a basic agent...');
  
  // Create the agent
  const agent = new Agent({
    name: 'Jarvis',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'friendly'],
      background: 'A sophisticated AI assistant created to help with various tasks.'
    },
    goals: ['Provide accurate information', 'Assist with problem-solving'],
  });
  
  // Add memory
  agent.setMemory(new InMemoryMemory());
  
  // Create a web search tool
  const webSearchTool = new WebSearchTool();
  
  // Run the agent with a task
  console.log('\nAsking the agent a question...\n');
  
  const result = await agent.run({
    task: "What's the weather in New York today?",
    tools: [webSearchTool],
  });
  
  // Display the result
  console.log(`Agent's response:\n${result.response}`);
}

// Run the example
main().catch(console.error);