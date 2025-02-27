// Discord bot example
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  InMemoryMemory, 
  DiscordConnector,
  WebSearchTool,
  WeatherTool
} from '../src';

// Load environment variables
dotenv.config();

console.log('Checking for API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates creating an agent and connecting it to Discord
 * Note: This is a demonstration and won't actually connect to Discord without
 * proper setup and API keys.
 */
async function main() {
  console.log('Creating a Discord bot agent...');
  
  // We'll skip the Discord token check for this demo
  console.log('Note: In a real implementation, a Discord token would be required');
  
  // Create the agent
  const agent = new Agent({
    name: 'DiscordAssistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'friendly', 'concise'],
      background: 'A Discord bot that helps users with information and tasks.'
    },
    goals: ['Assist Discord users', 'Provide accurate information', 'Be responsive'],
  });
  
  // Add memory
  agent.setMemory(new InMemoryMemory());
  
  // Create tools
  const webSearchTool = new WebSearchTool();
  const weatherTool = new WeatherTool();
  
  // For demo purposes, we'll just run a direct query to show how it works
  console.log('\nAsking the agent a question directly...\n');
  
  const result = await agent.run({
    task: "What's the weather in San Francisco today?",
    tools: [webSearchTool, weatherTool],
  });
  
  console.log(`Agent's response:\n${result.response}`);
  
  console.log(`\nIn a full implementation, this agent would be connected to Discord using the DiscordConnector.`);
  console.log(`Users could interact with it using commands like !ask or !weather.`);
}

// Run the example
main().catch(console.error);