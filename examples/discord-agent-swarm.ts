import dotenv from 'dotenv';
import { DiscordConnector } from '../src/platform-connectors/discord-connector';
import { Agent } from '../src/core/agent';
import { EnhancedAgentSwarm } from '../src/core/enhanced-agent-swarm';
import { InMemory } from '../src/memory/in-memory';
import { ProviderFactory } from '../src/core/provider-factory';
import { EnhancedPlanner } from '../src/planning/enhanced-planner';
import { Logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Set up logger
const logger = new Logger('DiscordSwarmBot');

// Check for required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY is required in .env file');
  process.exit(1);
}

if (!process.env.BOT_TOKEN) {
  logger.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

async function startDiscordSwarmBot() {
  try {
    logger.info('Starting Discord swarm bot...');

    // Create an LLM provider
    const llmProvider = ProviderFactory.createProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.DEFAULT_MODEL || 'claude-3-opus-20240229',
    });

    // Create memory system
    const memory = new InMemory();

    // Create specialist agents
    const researchAgent = new Agent({
      provider: llmProvider,
      memory: memory,
      name: 'ResearchAgent',
      description: 'An agent specialized in researching information and providing factual data',
      instructions: `
        You are a research specialist in the agent swarm, focused on providing accurate information.
        Your role is to analyze questions, identify key information needs, and provide well-researched answers.
        Focus on giving factual, precise information with sources where possible.
        Keep responses concise but comprehensive.
      `,
    });

    const creativeAgent = new Agent({
      provider: llmProvider,
      memory: memory,
      name: 'CreativeAgent',
      description: 'An agent specialized in creative writing and brainstorming',
      instructions: `
        You are a creative specialist in the agent swarm, focused on generating ideas, storytelling, and creative solutions.
        Your role is to think outside the box, brainstorm unique approaches, and provide imaginative content.
        When asked for creative input, provide diverse options and novel perspectives.
        Be playful and engaging while remaining helpful.
      `,
    });

    const programmingAgent = new Agent({
      provider: llmProvider,
      memory: memory,
      name: 'ProgrammingAgent',
      description: 'An agent specialized in programming and technical problem-solving',
      instructions: `
        You are a programming specialist in the agent swarm, focused on providing code solutions and technical explanations.
        Your role is to understand programming problems, write efficient code, and explain technical concepts clearly.
        Provide working code examples with explanations, and identify potential issues or improvements.
        Be precise and focus on best practices in your chosen programming languages.
      `,
    });

    // Create the enhanced planner
    const planner = new EnhancedPlanner({
      provider: llmProvider,
      memory: memory,
    });

    // Create the agent swarm
    const swarm = new EnhancedAgentSwarm({
      agents: [researchAgent, creativeAgent, programmingAgent],
      planner: planner,
      memory: memory,
      defaultAgent: researchAgent,
      name: 'DiscordSwarm',
      description: 'A swarm of specialized agents working together to help users on Discord',
    });

    // Create Discord connector
    const discord = new DiscordConnector({
      token: process.env.BOT_TOKEN!,
      prefix: '!',
      autoReply: true,
      monitorKeywords: ['help me', 'question', 'I need advice', 'code', 'programming', 'creative', 'research'],
      pollInterval: 30000, // Check every 30 seconds
    });

    // Connect the swarm to Discord
    await discord.connect(swarm);

    // Set bot status
    await discord.setStatus('online', 'WATCHING', 'for your questions');

    logger.info('Discord swarm bot is now online and ready to respond to messages');

    // Set up event listeners
    discord.on('keyword_match', async (message) => {
      logger.info(`Keyword match detected in message from ${message.author.username}: "${message.content.substring(0, 50)}..."`);
    });

    discord.on('mention', async (message) => {
      logger.info(`Bot was mentioned by ${message.author.username}: "${message.content.substring(0, 50)}..."`);
    });

    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down Discord swarm bot...');
      await discord.disconnect();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error starting Discord swarm bot:', error);
    process.exit(1);
  }
}

// Start the Discord swarm bot
startDiscordSwarmBot();