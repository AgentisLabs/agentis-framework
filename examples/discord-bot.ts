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

/**
 * This example demonstrates creating an agent and connecting it to Discord
 * Note: This is a demonstration and won't actually connect to Discord without
 * proper setup and API keys.
 */
async function main() {
  console.log('Creating a Discord bot agent...');
  
  // Ensure we have a Discord token
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('Error: DISCORD_BOT_TOKEN environment variable is not set');
    console.error('Please add it to your .env file');
    process.exit(1);
  }
  
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
  
  // Create Discord connector
  const discord = new DiscordConnector({
    token: process.env.DISCORD_BOT_TOKEN,
    prefix: '!',
    // Optional: restrict to specific channels or users
    // allowedChannels: ['channel-id-1', 'channel-id-2'],
    // allowedUsers: ['user-id-1', 'user-id-2']
  });
  
  // Connect the agent to Discord
  console.log('Connecting agent to Discord...');
  await discord.connect(agent);
  
  console.log(`
Discord bot is ready! In a real implementation, users could:
- Use !ask <question> to ask the agent questions
- The agent would use its tools (web search, weather) to answer
- The agent would remember conversation context through its memory

Note: This example doesn't actually connect to Discord without proper implementation.
`);
  
  // Keep the process running (in a real application)
  // This is just for demonstration
  console.log('Press Ctrl+C to exit');
}

// Run the example
main().catch(console.error);