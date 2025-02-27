// Tavily search example
import { 
  Agent, 
  AgentRole, 
  InMemoryMemory, 
  TavilySearchTool
} from '../src';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Checking for Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');
console.log('Checking for Tavily API key:', process.env.TAVILY_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates using the Tavily search tool to perform real web searches
 */
async function main() {
  console.log('Creating an agent with Tavily search...');
  
  // Create the agent
  const agent = new Agent({
    name: 'ResearchAssistant',
    role: AgentRole.RESEARCHER,
    personality: {
      traits: ['analytical', 'thorough', 'accurate'],
      background: 'A research assistant specialized in finding and summarizing information from the web.'
    },
    goals: ['Find accurate information', 'Provide comprehensive answers'],
  });
  
  // Add memory
  agent.setMemory(new InMemoryMemory());
  
  // Create a Tavily search tool
  const tavilySearchTool = new TavilySearchTool();
  
  // Run the agent with a task
  console.log('\nAsking the agent a research question...\n');
  
  const query = process.argv[2] || "What are the latest developments in quantum computing?";
  console.log(`Query: ${query}`);
  
  const result = await agent.run({
    task: query,
    tools: [tavilySearchTool],
  });
  
  // Display the result
  console.log(`\nAgent's response:\n${result.response}`);
}

// Run the example
main().catch(console.error);