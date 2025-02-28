/**
 * Crypto Trends Twitter Agent
 * 
 * This agent showcases our Twitter integration alongside our agent framework's
 * reasoning, planning, and memory capabilities. It performs the following tasks:
 * 
 * 1. Fetches trending tokens from BirdEye API
 * 2. Identifies tokens that align with its interests
 * 3. Researches selected tokens using web search
 * 4. Formulates and posts tweets about interesting discoveries
 * 5. Repeats this process on a set interval
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Agent } from '../src/core/agent';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { BrowserTwitterConnector } from '../src/platform-connectors/browser-twitter-connector';
// Directly reference the TwitterContentManager constructor to work around type incompatibility
// This is a temporary fix until we properly update the TwitterContentManager to support both connector types
import { TwitterContentManager } from '../src/platform-connectors/twitter-content-manager';
// Force TypeScript to treat our BrowserTwitterConnector as compatible with what TwitterContentManager expects
type TwitterConnectorCompatible = any;
import { Logger } from '../src/utils/logger';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { BirdEyeTrendingTool } from '../src/tools/birdeye-trending-tool';
import { ToolRegistry } from '../src/tools/tool-registry';
import { 
  PersonalityUtils, 
  EnhancedAgentConfig,
  EnhancedPersonality
} from '../src/core/enhanced-personality-system';
import { AgentRole } from '../src/core/types';
import { createInterface } from 'readline';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('CryptoTrendsTwitterAgent');

// Default paths and settings
const DEFAULT_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent-state');
const TWITTER_DATA_DIR = path.join(DATA_DIR, 'twitter');
const RESEARCH_INTERVAL_MINUTES = 60; // Default to 1 hour between research cycles

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENT_STATE_DIR)) fs.mkdirSync(AGENT_STATE_DIR, { recursive: true });
if (!fs.existsSync(TWITTER_DATA_DIR)) fs.mkdirSync(TWITTER_DATA_DIR, { recursive: true });

// Command line interface
let rl: ReturnType<typeof createInterface> | null = null;

// Helper function to safely use readline
function safeQuestion(prompt: string, callback: (answer: string) => void): void {
  if (!rl) {
    console.error('Error: Readline interface not initialized');
    process.exit(1);
    return;
  }
  rl.question(prompt, callback);
}

// Global state
let baseAgent: Agent;
let autonomousAgent: AutonomousAgent;
let twitterConnector: BrowserTwitterConnector;
let contentManager: TwitterContentManager;
let running = false;
let researchInterval: NodeJS.Timeout | null = null;

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Check required environment variables
    checkRequiredEnvVars();
    
    // Parse command line arguments
    const personalityFile = parseCommandLineArgs();
    
    // Load personality file
    logger.info(`Loading personality from ${personalityFile}`);
    const personality = PersonalityUtils.loadPersonalityFromJson(personalityFile);
    
    // Create agent
    baseAgent = createBaseAgent(personality);
    
    // Register tools
    registerTools();
    
    // Create Twitter connector
    twitterConnector = createTwitterConnector();
    
    // Create autonomous agent
    autonomousAgent = createAutonomousAgent(baseAgent);
    
    // Create Twitter content manager
    contentManager = createContentManager(autonomousAgent, twitterConnector);
    
    // Connect to Twitter
    console.log('Connecting to Twitter...');
    await twitterConnector.connect(baseAgent);
    console.log('Connected to Twitter successfully!');
    
    // Create readline interface for CLI
    rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Display welcome message
    displayWelcomeMessage(personality);
    
    // Start interactive CLI
    startCLI();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error starting crypto trends Twitter agent', error);
    if (rl) rl.close();
    process.exit(1);
  }
}

/**
 * Register the tools that the agent will use
 */
function registerTools(): void {
  const registry = ToolRegistry.getInstance();
  
  // Register Tavily search tool
  if (!process.env.TAVILY_API_KEY) {
    logger.warn('TAVILY_API_KEY not set, web search functionality will be limited');
  }
  
  try {
    const tavilyTool = new TavilySearchTool();
    registry.registerTool(tavilyTool);
    logger.debug('Registered Tavily search tool');
  } catch (error) {
    logger.warn('Failed to register Tavily search tool', error);
  }
  
  // Register BirdEye trending tool
  try {
    const birdEyeTool = new BirdEyeTrendingTool();
    registry.registerTool(birdEyeTool);
    logger.debug('Registered BirdEye trending tool');
  } catch (error) {
    logger.warn('Failed to register BirdEye trending tool', error);
  }
}

/**
 * Check required environment variables
 */
function checkRequiredEnvVars(): void {
  const requiredEnvVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'ANTHROPIC_API_KEY'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs(): string {
  // Default to wexley.json
  let personalityFile = DEFAULT_PERSONA_PATH;
  
  // Process command line arguments
  if (process.argv.length >= 3) {
    // First check for --persona flag
    for (let i = 0; i < process.argv.length - 1; i++) {
      if (process.argv[i] === '--persona') {
        personalityFile = process.argv[i + 1];
        logger.info(`Using personality file from --persona flag: ${personalityFile}`);
        break;
      }
    }
    
    // Also check the last argument in case it's a direct path
    const lastArg = process.argv[process.argv.length - 1];
    if (lastArg.endsWith('.json') && lastArg !== path.basename(personalityFile)) {
      personalityFile = lastArg;
      logger.info(`Using personality file from last argument: ${personalityFile}`);
    }
  }
  
  // Make sure the file exists
  if (!fs.existsSync(personalityFile)) {
    logger.warn(`Persona file not found: ${personalityFile}, falling back to default`);
    personalityFile = DEFAULT_PERSONA_PATH;
    
    if (!fs.existsSync(personalityFile)) {
      logger.error(`Default persona file not found: ${personalityFile}`);
      process.exit(1);
    }
  }
  
  return personalityFile;
}

/**
 * Create base agent
 */
function createBaseAgent(personality: EnhancedPersonality): Agent {
  // Get name from personality or use a default
  const agentName = personality.persona?.name || path.basename(DEFAULT_PERSONA_PATH, '.json');
  
  // Create agent configuration
  const agentConfig: EnhancedAgentConfig = PersonalityUtils.createAgentConfig(
    agentName,
    personality,
    AgentRole.ASSISTANT,
    process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
  );
  
  // Generate system prompt
  const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);
  
  // Create the agent
  return new Agent({
    name: agentConfig.name,
    role: agentConfig.role,
    personality: PersonalityUtils.simplifyPersonality(personality),
    goals: personality.motivation.goals.shortTermGoals,
    systemPrompt,
    model: agentConfig.model
  });
}

/**
 * Create Twitter connector
 */
function createTwitterConnector(): BrowserTwitterConnector {
  // Extract Twitter-specific topics from environment variables or use defaults
  const monitorKeywords = process.env.MONITOR_KEYWORDS?.split(',') || [
    'crypto', 
    'bitcoin', 
    'ethereum', 
    'AI', 
    'artificial intelligence', 
    'solana',
    'tokenomics',
    'defi'
  ];
  
  const monitorUsers = process.env.MONITOR_USERS?.split(',') || [
    'SBF_FTX',
    'CZ_Binance',
    'solana',
    'VitalikButerin'
  ];
  
  // Create Twitter connector using browser automation
  return new BrowserTwitterConnector({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD,
    email: process.env.TWITTER_EMAIL,
    
    // Monitoring configuration
    monitorKeywords,
    monitorUsers,
    autoReply: process.env.AUTO_REPLY === 'true',
    pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
    
    // Browser settings
    headless: false, // Set to false to see the browser and debug the issue
    debug: true // Enable debugging to get screenshots
  });
}

/**
 * Create autonomous agent
 */
function createAutonomousAgent(baseAgent: Agent): AutonomousAgent {
  return new AutonomousAgent({
    baseAgent,
    healthCheckIntervalMinutes: 15,
    maxConsecutiveErrors: 5,
    stateStoragePath: AGENT_STATE_DIR,
    enableAutoRecovery: true,
    enableContinuousMode: true
  });
}

/**
 * Create Twitter content manager
 */
function createContentManager(agent: AutonomousAgent, twitter: BrowserTwitterConnector): TwitterContentManager {
  // Parse content preferences from environment
  const contentCategories = process.env.CONTENT_CATEGORIES?.split(',') || [
    'market_analysis',
    'technical',
    'news',
    'opinion',
    'prediction'
  ];
  
  const preferredTopics = process.env.PREFERRED_TOPICS?.split(',') || [
    'solana tokens',
    'crypto market trends',
    'defi tokens',
    'AI token developments',
    'blockchain infrastructure',
    'NFT market analysis',
    'DeFi innovations',
    'market cycle predictions',
    'institutional adoption',
    'regulatory impact on crypto',
    'AI and crypto convergence',
    'digital asset investing'
  ];
  
  // Parse posting schedule
  const preferredPostingTimes = process.env.PREFERRED_POSTING_TIMES
    ? process.env.PREFERRED_POSTING_TIMES.split(',').map(h => parseInt(h))
    : [8, 12, 16, 20]; // Default to 8am, 12pm, 4pm, 8pm
  
  const tweetsPerDay = process.env.TWEETS_PER_DAY 
    ? parseInt(process.env.TWEETS_PER_DAY)
    : 4;
  
  // Parse auto-response settings
  const enableAutoResponses = process.env.ENABLE_AUTO_RESPONSES === 'true';
  const autoResponseWhitelist = process.env.AUTO_RESPONSE_WHITELIST?.split(',') || [];
  
  // Parse research settings
  const researchInterval = process.env.RESEARCH_INTERVAL 
    ? parseInt(process.env.RESEARCH_INTERVAL)
    : 60; // Default to hourly
  
  const researchTopics = process.env.RESEARCH_TOPICS?.split(',') || preferredTopics;
  
  // Create and return the content manager
  // Use type assertion to work around type incompatibility
  return new TwitterContentManager({
    twitterConnector: twitter as TwitterConnectorCompatible,
    agent,
    contentCategories,
    preferredPostingTimes,
    tweetsPerDay,
    preferredTopics,
    contentRatio: {
      original: 70,
      reactive: 20,
      curated: 10
    },
    enableAutoResponses,
    autoResponseWhitelist,
    researchInterval,
    researchTopics,
    dataStoragePath: TWITTER_DATA_DIR
  });
}

/**
 * Display welcome message
 */
function displayWelcomeMessage(personality: EnhancedPersonality): void {
  const agentName = personality.persona?.name || 'Twitter Agent';
  const occupation = personality.persona.demographics?.occupation || 'AI Assistant';
  const model = process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620';
  
  console.log(`\n=== ${agentName} Crypto Trends Twitter Agent ===`);
  console.log(`Personality: ${occupation}`);
  console.log(`Connected as: ${process.env.TWITTER_USERNAME}`);
  console.log(`Using model: ${model}`);
  console.log(`Monitoring: ${twitterConnector.config.monitorKeywords?.length || 0} keywords, ${twitterConnector.config.monitorUsers?.length || 0} users\n`);
}

/**
 * Start the interactive CLI
 */
function startCLI(): void {
  showMainMenu();
}

/**
 * Show main menu
 */
function showMainMenu(): void {
  console.log('\nCrypto Trends Twitter Agent - Commands:');
  console.log('1: Start autonomous mode');
  console.log('2: Research trending token once');
  console.log('3: View trending tokens');
  console.log('4: Post a tweet');
  console.log('5: View tweet history');
  console.log('6: Settings');
  console.log('7: Exit');
  
  safeQuestion('\nEnter command number: ', handleMainMenuCommand);
}

/**
 * Handle main menu command
 */
async function handleMainMenuCommand(input: string): Promise<void> {
  try {
    switch (input.trim()) {
      case '1': // Start autonomous mode
        await startAutonomousMode();
        break;
      case '2': // Research trending token once
        await researchTrendingTokens();
        break;
      case '3': // View trending tokens
        await viewTrendingTokens();
        break;
      case '4': // Post a tweet
        await postTweetCommand();
        break;
      case '5': // View tweet history
        viewTweetHistory();
        break;
      case '6': // Settings
        showSettings();
        break;
      case '7': // Exit
        await shutdown();
        process.exit(0);
        break;
      default:
        console.log('Invalid command');
        showMainMenu();
        break;
    }
  } catch (error) {
    logger.error('Error handling command', error);
    showMainMenu();
  }
}

/**
 * Start autonomous mode
 */
async function startAutonomousMode(): Promise<void> {
  safeQuestion('Start autonomous mode with scheduled research and tweets? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      if (running) {
        console.log('Autonomous mode is already active');
        showMainMenu();
        return;
      }
      
      try {
        console.log('Starting autonomous mode...');
        
        // Start the autonomous agent
        autonomousAgent.start();
        
        // Start the content manager
        contentManager.start();
        
        // Set up the research interval
        const intervalMinutes = process.env.RESEARCH_INTERVAL_MINUTES 
          ? parseInt(process.env.RESEARCH_INTERVAL_MINUTES)
          : RESEARCH_INTERVAL_MINUTES;
        
        console.log(`Setting up research interval to run every ${intervalMinutes} minutes`);
        
        // Run once immediately
        await researchTrendingTokens();
        
        // Then set up interval
        researchInterval = setInterval(async () => {
          try {
            await researchTrendingTokens();
          } catch (error) {
            logger.error('Error during scheduled research', error);
          }
        }, intervalMinutes * 60 * 1000);
        
        running = true;
        
        console.log('Autonomous mode activated successfully!');
        
        // Add new commands for autonomous mode
        console.log('\nAutonomous Mode Commands:');
        console.log('1: View agent status');
        console.log('2: Run research cycle now');
        console.log('3: Create a tweet now');
        console.log('4: Stop autonomous mode');
        console.log('5: Back to main menu');
        
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
      } catch (error) {
        logger.error('Error starting autonomous mode', error);
        showMainMenu();
      }
    } else {
      console.log('Autonomous mode cancelled');
      showMainMenu();
    }
  });
}

/**
 * Handle autonomous mode command
 */
async function handleAutonomousCommand(input: string): Promise<void> {
  try {
    switch (input.trim()) {
      case '1': // View agent status
        displayAgentStatus();
        break;
      case '2': // Run research cycle now
        await researchTrendingTokens(true);
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
        break;
      case '3': // Create a tweet now
        createTweetNow();
        break;
      case '4': // Stop autonomous mode
        await stopAutonomousMode();
        break;
      case '5': // Back to main menu
        showMainMenu();
        break;
      default:
        console.log('Invalid command');
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
        break;
    }
  } catch (error) {
    logger.error('Error handling autonomous command', error);
    safeQuestion('\nEnter command number: ', handleAutonomousCommand);
  }
}

/**
 * Display agent status
 */
function displayAgentStatus(): void {
  if (!running) {
    console.log('Agent is not running');
    showMainMenu();
    return;
  }
  
  const status = autonomousAgent.getStatus();
  console.log('\n=== Agent Status ===');
  console.log(`Name: ${status.name}`);
  console.log(`Running: ${status.running}`);
  console.log(`Last Active: ${status.lastActive.toLocaleString()}`);
  console.log(`Uptime: ${status.uptime.toFixed(2)} hours`);
  console.log(`Queue Length: ${status.queueLength}`);
  
  console.log('\nOperation Statistics:');
  console.log(`Total: ${status.operations.total}`);
  console.log(`Successful: ${status.operations.successful}`);
  console.log(`Failed: ${status.operations.failed}`);
  console.log(`Success Rate: ${status.operations.successRate.toFixed(2)}%`);
  
  // Get next scheduled tweet
  const nextTweet = contentManager.getTweetIdeas({ status: 'approved' })[0];
  if (nextTweet && nextTweet.scheduledFor) {
    console.log(`\nNext scheduled tweet at: ${new Date(nextTweet.scheduledFor).toLocaleString()}`);
    console.log(`Topic: ${nextTweet.topic}`);
  } else {
    console.log('\nNo tweets currently scheduled');
  }
  
  safeQuestion('\nEnter command number: ', handleAutonomousCommand);
}

/**
 * Research trending tokens
 * 
 * @param verbose - Whether to show verbose output
 * @returns Promise resolving when research is complete
 */
async function researchTrendingTokens(verbose: boolean = false): Promise<void> {
  try {
    console.log('Fetching trending tokens on Solana...');
    
    // Get the BirdEye trending tool
    const registry = ToolRegistry.getInstance();
    const birdEyeTool = registry.getTool('birdeye_trending');
    
    if (!birdEyeTool) {
      throw new Error('BirdEye trending tool not registered');
    }
    
    let trendingResult;
    
    try {
      // Get trending tokens with proper sort parameters
      trendingResult = await birdEyeTool.execute({
        limit: 15
      });
      
      // Check if we got any tokens to analyze
      if (!trendingResult.tokens || trendingResult.tokens.length === 0) {
        throw new Error("No trending tokens returned from the API");
      }
      
      console.log(`\n=== Trending Tokens on Solana ===`);
      trendingResult.tokens.forEach((token: any, index: number) => {
        console.log(`${index + 1}. ${token.name} (${token.symbol})`);
        console.log(`   Price: $${(token.price || 0).toFixed(6)}`);
        console.log(`   24h Change: ${(token.priceChange24h || 0).toFixed(2)}%`);
        console.log(`   24h Volume: $${(token.volume24h || 0).toLocaleString()}`);
        console.log();
      });
      
    } catch (apiError) {
      logger.error('BirdEye API error', apiError);
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
      console.log(`\nError fetching trending tokens: ${errorMessage}`);
      console.log("Please check your API key and network connection.");
      
      if (!running) {
        showMainMenu();
      }
      return;
    }
    
    // Ask the user to select a token
    safeQuestion('\nEnter the number of the token you want to research (1-15): ', async (answer) => {
      const tokenIndex = parseInt(answer) - 1;
      
      if (isNaN(tokenIndex) || tokenIndex < 0 || tokenIndex >= trendingResult.tokens.length) {
        console.log('Invalid selection. Please try again.');
        if (!running) {
          showMainMenu();
        }
        return;
      }
      
      // Get the selected token
      const selectedToken = trendingResult.tokens[tokenIndex];
      console.log(`\nYou selected: ${selectedToken.name} (${selectedToken.symbol})`);
      console.log('Researching this token...');
      
      // Generate token data in the format our agent expects
      const selectedTokenData = {
        selectedToken: selectedToken.symbol,
        tokenName: selectedToken.name,
        rationale: `You selected ${selectedToken.name} (${selectedToken.symbol}) because it has interesting metrics with price $${selectedToken.price.toFixed(4)} and 24h change of ${selectedToken.priceChange24h.toFixed(2)}%.`,
        interestingAspects: `The token has a 24h volume of $${selectedToken.volume24h.toLocaleString()} and is currently ranked #${selectedToken.rank} among trending Solana tokens.`,
        researchQuestions: "What is the token's use case? What is its market potential? What recent news might be affecting its price?"
      };
      
      // Get the Tavily search tool for research
      const tavilyTool = registry.getTool('web_search');
      
      if (!tavilyTool) {
        throw new Error('Web search tool not registered');
      }
      
      // Research the selected token
      console.log(`Researching ${selectedToken.name} (${selectedToken.symbol})...`);
      
      const searchQuery = `${selectedToken.name} ${selectedToken.symbol} crypto token Solana blockchain price prediction news recent updates`;
      console.log(`Searching for: ${searchQuery}`);
      
      const searchResults = await tavilyTool.execute({
        query: searchQuery,
        maxResults: 5,
        includeAnswer: true
      });
      
      console.log(`\nSearch complete. Found ${searchResults.results?.length || 0} results.`);
      if (verbose) {
        console.log(`Search summary: ${searchResults.answer || 'No summary available'}`);
      }
      
      // Generate a tweet based on the research
      console.log('Generating tweet based on research...');
      
      // Create a simplified prompt to reduce the risk of timeout
      const tweetPrompt = `
      You are ${baseAgent.config.name}, a crypto market analyst.
      
      Token: ${selectedToken.name} (${selectedToken.symbol})
      Price: $${selectedToken.price.toFixed(4)} 
      24h Change: ${selectedToken.priceChange24h.toFixed(2)}%
      Volume: $${(selectedToken.volume24h/1000000).toFixed(1)}M
      
      Research: ${searchResults.answer ? searchResults.answer.substring(0, 400) : "Limited information available."}
      
      Create a concise tweet about this token that:
      1. Includes one insight or prediction
      2. Mentions the price or volume
      3. Uses the $${selectedToken.symbol} format
      4. NO hashtags at all
      5. MUST be under 240 characters total
      
      Return ONLY the tweet text.
      `;
      
      console.log('Waiting for tweet generation (this may take a moment)...');
      
      // Set a timeout for the API call
      let tweetResult: { response: string } = { response: '' };
      try {
        // Create a promise that times out after 60 seconds
        const timeoutPromise = new Promise<{ response: string }>((_, reject) => {
          setTimeout(() => reject(new Error('Tweet generation timed out')), 60000);
        });
        
        // Race the API call against the timeout
        const resultPromise = autonomousAgent.runOperation<{ response: string }>(tweetPrompt);
        tweetResult = await Promise.race([resultPromise, timeoutPromise]);
        console.log('Tweet successfully generated!');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.log(`Tweet generation encountered an issue: ${errorMessage}`);
        // Provide a fallback tweet if the API call fails
        tweetResult = { 
          response: `$${selectedToken.symbol} at $${selectedToken.price.toFixed(4)} shows interesting movement with ${selectedToken.priceChange24h.toFixed(2)}% change in 24h. Volume of $${(selectedToken.volume24h/1000000).toFixed(1)}M suggests growing market interest.`
        };
      }
      
      const tweetContent = tweetResult.response || '';
      
      // Check tweet length
      if (tweetContent.length > 240) {
        console.log('\n⚠️ The generated tweet is too long! Shortening it automatically...');
        
        // Simply truncate the tweet and add ellipsis if it's too long
        const shortenedTweet = tweetContent.substring(0, 236) + "...";
        
        console.log('\n=== Shortened Tweet ===');
        console.log(shortenedTweet);
        console.log(`\nCharacter count: ${shortenedTweet.length}/240`);
        
        safeQuestion('\nPost this tweet now? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            try {
              console.log('Posting tweet to Twitter...');
              await twitterConnector.tweet(shortenedTweet);
              console.log('🚀 Tweet posted successfully!');
              
              // Record the posted tweet
              contentManager.addTweetIdea({
                topic: `${selectedToken.symbol} analysis`,
                content: shortenedTweet,
                priority: 'high',
                status: 'posted',
                tags: ['research', 'trending', 'token_analysis']
              });
            } catch (error) {
              logger.error('Error posting tweet', error);
              console.error('Error posting tweet:', error);
            }
          } else {
            // Save as draft
            contentManager.addTweetIdea({
              topic: `${selectedToken.symbol} analysis`,
              content: shortenedTweet,
              priority: 'high',
              status: 'draft',
              tags: ['research', 'trending', 'token_analysis']
            });
            console.log('Tweet saved as draft.');
          }
          
          if (!running) {
            showMainMenu();
          } else {
            safeQuestion('\nEnter command number: ', handleAutonomousCommand);
          }
        });
      } else {
        // Tweet is within limits
        console.log('\n=== Generated Tweet ===');
        console.log(tweetContent);
        console.log(`\nCharacter count: ${tweetContent.length}/240`);
        
        safeQuestion('\nPost this tweet now? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            try {
              console.log('Posting tweet to Twitter...');
              await twitterConnector.tweet(tweetContent);
              console.log('🚀 Tweet posted successfully!');
              
              // Record the posted tweet
              contentManager.addTweetIdea({
                topic: `${selectedToken.symbol} analysis`,
                content: tweetContent,
                priority: 'high',
                status: 'posted',
                tags: ['research', 'trending', 'token_analysis']
              });
            } catch (error) {
              logger.error('Error posting tweet', error);
              console.error('Error posting tweet:', error);
            }
          } else {
            // Save as draft
            contentManager.addTweetIdea({
              topic: `${selectedToken.symbol} analysis`,
              content: tweetContent,
              priority: 'high',
              status: 'draft',
              tags: ['research', 'trending', 'token_analysis']
            });
            console.log('Tweet saved as draft.');
          }
          
          if (!running) {
            showMainMenu();
          } else {
            safeQuestion('\nEnter command number: ', handleAutonomousCommand);
          }
        });
      }
    });
  } catch (error) {
    logger.error('Error researching trending tokens', error);
    if (!running) {
      showMainMenu();
    }
    throw error;
  }
}

/**
 * View trending tokens
 */
async function viewTrendingTokens(): Promise<void> {
  try {
    console.log('Fetching trending tokens on Solana...');
    
    // Get the BirdEye trending tool
    const registry = ToolRegistry.getInstance();
    const birdEyeTool = registry.getTool('birdeye_trending');
    
    if (!birdEyeTool) {
      throw new Error('BirdEye trending tool not registered');
    }
    
    try {
      // Get trending tokens with proper sort parameters
      const trendingResult = await birdEyeTool.execute({
        limit: 20
      });
      
      console.log(`\n=== Trending Tokens on Solana ===`);
      
      if (!trendingResult.tokens || trendingResult.tokens.length === 0) {
        console.log("No trending tokens found. API may be unavailable.");
      } else {
        trendingResult.tokens.forEach((token: any, index: number) => {
          console.log(`${index + 1}. ${token.name} (${token.symbol})`);
          console.log(`   Price: $${(token.price || 0).toFixed(6)}`);
          console.log(`   24h Change: ${(token.priceChange24h || 0).toFixed(2)}%`);
          console.log(`   24h Volume: $${(token.volume24h || 0).toLocaleString()}`);
          console.log(`   Market Cap: $${(token.marketCap || 0).toLocaleString()}`);
          console.log(`   Rank: ${token.rank || 'N/A'}`);
          console.log();
        });
      }
    } catch (apiError) {
      logger.error('BirdEye API error', apiError);
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
      console.log(`\nError fetching trending tokens: ${errorMessage}`);
      console.log("Please check your API key and network connection.");
    }
    
    showMainMenu();
  } catch (error) {
    logger.error('Error viewing trending tokens', error);
    showMainMenu();
  }
}

/**
 * Post a tweet
 */
async function postTweetCommand(): Promise<void> {
  safeQuestion('Enter topic for tweet: ', async (topic) => {
    try {
      console.log(`Generating tweet about "${topic}"...`);
      
      const result = await baseAgent.run({
        task: `Create a thoughtful tweet about: "${topic}"
              The tweet should reflect your personality as a crypto/AI market researcher.
              It MUST be under 240 characters and demonstrate your expertise.
              Do NOT include any hashtags.
              Only return the tweet text, no quotation marks or other formatting.`
      });
      
      // Truncate if it's still too long
      const tweetText = result.response.length > 240 ? 
        result.response.substring(0, 236) + "..." : 
        result.response;
      
      console.log('\n=== Draft Tweet ===');
      console.log(tweetText);
      console.log(`\nCharacter count: ${tweetText.length}/240`);
      
      safeQuestion('Post this tweet? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          try {
            console.log('Posting tweet to Twitter...');
            await twitterConnector.tweet(tweetText);
            console.log('🚀 Tweet posted successfully!');
            
            // Record the tweet
            contentManager.addTweetIdea({
              topic,
              content: tweetText,
              priority: 'medium',
              status: 'posted',
              tags: ['manual']
            });
          } catch (error) {
            logger.error('Error posting tweet', error);
          }
        } else {
          console.log('Tweet cancelled');
          
          // Save as draft
          contentManager.addTweetIdea({
            topic,
            content: tweetText,
            priority: 'medium',
            status: 'draft',
            tags: ['manual']
          });
          console.log('Tweet saved as draft');
        }
        
        showMainMenu();
      });
    } catch (error) {
      logger.error('Error generating tweet', error);
      showMainMenu();
    }
  });
}

/**
 * Create a tweet now (in autonomous mode)
 */
function createTweetNow(): void {
  safeQuestion('Enter topic for tweet: ', async (topic) => {
    try {
      console.log(`Generating tweet about "${topic}"...`);
      
      const prompt = `
        Create a thoughtful tweet about: "${topic}"
        
        The tweet should:
        1. Reflect your personality, expertise, and Twitter style
        2. Be insightful and provide value to your audience
        3. Be under 240 characters (IMPORTANT - this is a hard limit)
        4. NO hashtags at all
        
        Only return the tweet text, no quotation marks or other formatting.
      `;
      
      const result = await autonomousAgent.runOperation<{ response: string }>(prompt);
      let tweetContent = result?.response || `Sharing my thoughts on ${topic}.`;
      
      // Truncate if too long
      if (tweetContent.length > 240) {
        tweetContent = tweetContent.substring(0, 236) + "...";
      }
      
      console.log('\n=== Draft Tweet ===');
      console.log(tweetContent);
      console.log(`\nCharacter count: ${tweetContent.length}/240`);
      
      safeQuestion('Post this tweet now? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          console.log('Posting tweet to Twitter...');
          const tweetId = await twitterConnector.tweet(tweetContent);
          console.log(`🚀 Tweet posted! ID: ${tweetId}`);
          
          // Record in content manager
          contentManager.addTweetIdea({
            topic,
            content: tweetContent,
            priority: 'medium',
            status: 'posted',
            tags: ['manual']
          });
        } else {
          // Save as draft
          contentManager.addTweetIdea({
            topic,
            content: tweetContent,
            priority: 'medium',
            status: 'draft',
            tags: ['manual']
          });
          console.log('Tweet saved as draft');
        }
        
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
      });
    } catch (error) {
      logger.error('Error creating tweet', error);
      safeQuestion('\nEnter command number: ', handleAutonomousCommand);
    }
  });
}

/**
 * View tweet history
 */
function viewTweetHistory(): void {
  console.log('\nView Tweet History:');
  console.log('1: View draft tweets');
  console.log('2: View scheduled tweets');
  console.log('3: View posted tweets');
  console.log('4: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleTweetHistoryCommand);
}

/**
 * Handle tweet history command
 */
function handleTweetHistoryCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View draft tweets
      viewTweetsByStatus('draft');
      break;
    case '2': // View scheduled tweets
      viewTweetsByStatus('approved');
      break;
    case '3': // View posted tweets
      viewTweetsByStatus('posted');
      break;
    case '4': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      viewTweetHistory();
      break;
  }
}

/**
 * View tweets by status
 */
function viewTweetsByStatus(status: string): void {
  const tweets = contentManager.getTweetIdeas({ status: status as any });
  
  if (tweets.length === 0) {
    console.log(`\nNo tweets with status "${status}"`);
  } else {
    console.log(`\n=== ${status.charAt(0).toUpperCase() + status.slice(1)} Tweets ===`);
    tweets.forEach((tweet, index) => {
      console.log(`\n${index + 1}. Topic: ${tweet.topic}`);
      console.log(`Content: ${tweet.content}`);
      if (tweet.scheduledFor) {
        console.log(`Scheduled for: ${new Date(tweet.scheduledFor).toLocaleString()}`);
      }
      console.log(`Tags: ${tweet.tags?.join(', ') || 'none'}`);
    });
  }
  
  viewTweetHistory();
}

/**
 * Get the next scheduled time for a tweet
 * Based on preferred posting times
 */
function getNextScheduledTime(): number {
  const now = new Date();
  let scheduledTime = new Date();
  
  // Use default posting times since config is private
  const preferredTimes = [9, 12, 15, 18]; // Default posting times
  
  // Find the next posting time
  let foundTime = false;
  for (const hour of preferredTimes) {
    scheduledTime.setHours(hour, 0, 0, 0);
    if (scheduledTime > now) {
      foundTime = true;
      break;
    }
  }
  
  // If no time found today, use first time tomorrow
  if (!foundTime) {
    scheduledTime = new Date();
    scheduledTime.setDate(scheduledTime.getDate() + 1);
    scheduledTime.setHours(preferredTimes[0], 0, 0, 0);
  }
  
  return scheduledTime.getTime();
}

/**
 * Stop autonomous mode
 */
async function stopAutonomousMode(): Promise<void> {
  safeQuestion('Stop autonomous mode? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      try {
        console.log('Stopping autonomous mode...');
        
        // Stop the autonomous agent
        autonomousAgent.stop();
        
        // Stop the content manager
        contentManager.stop();
        
        // Clear the research interval
        if (researchInterval) {
          clearInterval(researchInterval);
          researchInterval = null;
        }
        
        running = false;
        
        console.log('Autonomous mode stopped successfully');
        showMainMenu();
      } catch (error) {
        logger.error('Error stopping autonomous mode', error);
        showMainMenu();
      }
    } else {
      safeQuestion('\nEnter command number: ', handleAutonomousCommand);
    }
  });
}

/**
 * Show settings
 */
function showSettings(): void {
  console.log('\nSettings:');
  console.log('1: View current settings');
  console.log('2: Set research interval');
  console.log('3: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleSettingsCommand);
}

/**
 * Handle settings command
 */
function handleSettingsCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View current settings
      viewCurrentSettings();
      break;
    case '2': // Set research interval
      setResearchInterval();
      break;
    case '3': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      showSettings();
      break;
  }
}

/**
 * View current settings
 */
function viewCurrentSettings(): void {
  const intervalMinutes = process.env.RESEARCH_INTERVAL_MINUTES 
    ? parseInt(process.env.RESEARCH_INTERVAL_MINUTES)
    : RESEARCH_INTERVAL_MINUTES;
  
  console.log('\n=== Current Settings ===');
  console.log(`Research Interval: ${intervalMinutes} minutes`);
  console.log(`Twitter Username: ${process.env.TWITTER_USERNAME}`);
  console.log(`Auto-Reply: ${process.env.AUTO_REPLY === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`Model: ${process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'}`);
  console.log(`Tweets Per Day: ${process.env.TWEETS_PER_DAY || '4'}`);
  
  showSettings();
}

/**
 * Set research interval
 */
function setResearchInterval(): void {
  const currentInterval = process.env.RESEARCH_INTERVAL_MINUTES 
    ? parseInt(process.env.RESEARCH_INTERVAL_MINUTES)
    : RESEARCH_INTERVAL_MINUTES;
  
  safeQuestion(`Enter research interval in minutes (current: ${currentInterval}): `, (input) => {
    const minutes = parseInt(input);
    
    if (isNaN(minutes) || minutes < 1) {
      console.log('Invalid interval. Must be a positive number.');
      showSettings();
      return;
    }
    
    process.env.RESEARCH_INTERVAL_MINUTES = minutes.toString();
    console.log(`Research interval set to ${minutes} minutes`);
    
    // Update interval if running
    if (running && researchInterval) {
      clearInterval(researchInterval);
      
      researchInterval = setInterval(async () => {
        try {
          await researchTrendingTokens();
        } catch (error) {
          logger.error('Error during scheduled research', error);
        }
      }, minutes * 60 * 1000);
      
      console.log('Updated running research interval');
    }
    
    showSettings();
  });
}

/**
 * Shutdown
 */
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  
  if (running) {
    // Stop autonomous agent
    autonomousAgent.stop();
    
    // Stop content manager
    contentManager.stop();
    
    // Clear interval
    if (researchInterval) {
      clearInterval(researchInterval);
      researchInterval = null;
    }
  }
  
  // Disconnect from Twitter
  await twitterConnector.disconnect();
  
  // Close readline interface
  if (rl) rl.close();
  
  console.log('Shutdown complete');
}

// Run the main function
main();