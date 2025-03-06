import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../src/core/agent';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { OpenAIProvider } from '../src/core/openai-provider';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { EnhancedPlanner } from '../src/planning/enhanced-planner';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { Tool } from '../src/core/types';
import { Logger } from '../src/utils/logger';
import fs from 'fs';
import path from 'path';

// Set up logger
const logger = new Logger('WexleyAutonomousAgent');

// Check for required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY is required in .env file');
  process.exit(1);
}

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

async function main() {
  try {
    logger.info('Creating Wexley Autonomous Agent...');

    // Create search tools
    const tools: Tool[] = [];
    
    // Add Tavily search if API key is available
    if (process.env.TAVILY_API_KEY) {
      logger.info('Adding Tavily search tool');
      tools.push(new TavilySearchTool(process.env.TAVILY_API_KEY));
    } else {
      logger.warn('TAVILY_API_KEY not found, search functionality will be limited');
    }
    
    // Add CoinGecko price tool
    logger.info('Adding CoinGecko price tool');
    tools.push(new CoinGeckoPriceTool());

    // Extract Wexley personality traits
    const personality = wexleyPersona.persona.personality;
    const traits = personality.traits.join(', ');
    const background = wexleyPersona.persona.background.backstory;
    const communication = personality.communication;
    const expertise = wexleyPersona.knowledge.expertise.join(', ');

    // Create enhanced memory system
    const memory = new EnhancedMemory({
      maxShortTermMemories: 50,
      maxLongTermMemories: 1000,
      maxNotes: 100
    });

    // Create enhanced planner
    const planner = new EnhancedPlanner();

    // Create the base agent with Wexley's persona
    const baseAgent = new Agent({
      name: 'Wexley',
      role: 'Market Analyst',
      personality: {
        traits: personality.traits,
        background: background,
        voice: `Direct, authoritative tone. ${communication.vocabulary}. Uses data points and specific examples.`
      },
      goals: [
        "Provide insightful market analysis",
        "Identify emerging trends in AI and crypto",
        "Deliver authoritative information on tokenomics and market cycles",
        "Express contrarian views that challenge conventional wisdom"
      ],
      systemPrompt: `
        You are Wexley, a 42-year-old crypto/AI market researcher, serial entrepreneur, and angel investor.
        You're known for your direct, authoritative communication style and contrarian market insights.

        PERSONALITY:
        - Traits: ${traits}
        - Communication: Direct, authoritative, occasionally abrasive, and passionate
        - Style: Concise, jargon-heavy, prediction-oriented, with bold claims
        - Quirks: Start directly with key insights, casually drop large financial figures, reference past successful predictions, use market/trading metaphors

        EXPERTISE:
        ${expertise}

        IMPORTANT GUIDELINES:
        1. Stay in character as Wexley at all times
        2. Be direct, confident, and occasionally abrasive in your communication
        3. Speak authoritatively about markets, technology, and investing
        4. Use data points and specific examples to back up your claims
        5. Don't hedge unnecessarily - be definitive in your assessments
        6. Use technical terminology appropriate for the audience
        7. Express contrarian views that challenge conventional wisdom
        8. For crypto mentions, use the $ prefix format ($BTC, $ETH, etc.)
        9. When discussing market trends or technology developments, use your search tool to get current information

        You have memory capabilities that allow you to recall previous conversations and store important notes.
        Use them to maintain context and provide more personalized responses.

        When users ask about topics outside your expertise, still respond in character but acknowledge when 
        something is outside your primary focus areas.

        If users ask for harmful content, refuse while staying in character as Wexley who values rationality and data-driven decisions.
      `
    }, new OpenAIProvider({
      model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620',
      apiKey: process.env.ANTHROPIC_API_KEY!,
    }));

    // Set memory and planner for the base agent
    baseAgent.setMemory(memory);
    baseAgent.setPlanner(planner);

    // Create the autonomous agent wrapper
    const autonomousAgent = new AutonomousAgent({
      baseAgent: baseAgent,
      healthCheckIntervalMinutes: 10,
      maxConsecutiveErrors: 3,
      enableAutoRecovery: true,
      enableContinuousMode: true
    });

    // Start the autonomous agent
    autonomousAgent.start();
    logger.info('Wexley Autonomous Agent started successfully');

    // Example function to interact with the agent
    async function askWexley(question: string) {
      logger.info(`Asking Wexley: ${question}`);
      try {
        const result = await autonomousAgent.runOperation({
          task: question,
          tools: tools
        });
        
        console.log('\nWexley says:');
        console.log(result.response);
        console.log('------------------------');
        
        return result;
      } catch (error) {
        logger.error('Error when asking Wexley:', error);
        throw error;
      }
    }

    // Example interactions
    await askWexley("What's your take on the current state of AI and crypto convergence?");
    await askWexley("Can you give me your analysis of Bitcoin's current market position?");
    await askWexley("What are the most promising areas for investment in the AI infrastructure space?");

    // Display agent status after interactions
    const status = autonomousAgent.getStatus();
    console.log('\nAgent Status:');
    console.log(`Name: ${status.name}`);
    console.log(`Running: ${status.running}`);
    console.log(`Last Active: ${status.lastActive}`);
    console.log(`Uptime (hours): ${status.uptime.toFixed(2)}`);
    console.log(`Queue Length: ${status.queueLength}`);
    console.log(`Operations - Total: ${status.operations.total}, Success Rate: ${status.operations.successRate.toFixed(2)}%`);

    // Keep the process running for a while
    console.log('\nPress Ctrl+C to stop the agent...');
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Stopping Wexley Autonomous Agent...');
      autonomousAgent.stop();
      logger.info('Agent stopped successfully');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unexpected application error:', error);
  process.exit(1);
});