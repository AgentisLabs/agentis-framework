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
// Import vector memory components
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { VectorMemory } from '../src/memory/vector-memory';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('CryptoTrendsTwitterAgent');

// Default paths and settings
const DEFAULT_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent-state');
const TWITTER_DATA_DIR = path.join(DATA_DIR, 'twitter');
const TWEETS_DB_PATH = path.join(TWITTER_DATA_DIR, 'tweet-history.json');
const RESEARCH_INTERVAL_MINUTES = 60; // Default to 1 hour between research cycles

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENT_STATE_DIR)) fs.mkdirSync(AGENT_STATE_DIR, { recursive: true });
if (!fs.existsSync(TWITTER_DATA_DIR)) fs.mkdirSync(TWITTER_DATA_DIR, { recursive: true });

// Setup database structure if it doesn't exist
if (!fs.existsSync(TWEETS_DB_PATH)) {
  fs.writeFileSync(TWEETS_DB_PATH, JSON.stringify({
    tweets: [],
    meta: {
      lastUpdated: new Date().toISOString(),
      version: "1.0"
    }
  }, null, 2));
}

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

// Define Tweet Database structure
interface TweetRecord {
  id: string;
  content: string;
  topic: string;
  timestamp: string;
  token?: {
    symbol: string;
    name: string;
    price: number;
    priceChange24h: number;
  };
  tags: string[];
  // Fields for vector storage
  vectorId?: string;     // ID in the vector database
  embedding?: number[];  // Optional cached embedding
}

interface TweetDatabase {
  tweets: TweetRecord[];
  meta: {
    lastUpdated: string;
    version: string;
  };
}

// Functions to manage tweet database
function loadTweetHistory(): TweetDatabase {
  try {
    const data = fs.readFileSync(TWEETS_DB_PATH, 'utf8');
    return JSON.parse(data) as TweetDatabase;
  } catch (error) {
    logger.error('Error loading tweet history', error);
    return { tweets: [], meta: { lastUpdated: new Date().toISOString(), version: "1.0" } };
  }
}

function saveTweetHistory(database: TweetDatabase): void {
  try {
    database.meta.lastUpdated = new Date().toISOString();
    fs.writeFileSync(TWEETS_DB_PATH, JSON.stringify(database, null, 2));
  } catch (error) {
    logger.error('Error saving tweet history', error);
  }
}

/**
 * Adds a tweet to the vector database
 * 
 * @param tweet - The tweet to store in vector memory
 * @returns Promise resolving to the vector ID
 */
async function addTweetToVectorMemory(tweet: TweetRecord): Promise<string> {
  try {
    // Generate a unique vector ID
    const vectorId = `tweet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create the text to embed (combine content with metadata)
    const textToEmbed = `
      Topic: ${tweet.topic}
      Content: ${tweet.content}
      ${tweet.token ? `Token: ${tweet.token.symbol} (${tweet.token.name})` : ''}
      ${tweet.token ? `Price: $${tweet.token.price.toFixed(6)}` : ''}
      ${tweet.token ? `24h Change: ${tweet.token.priceChange24h.toFixed(2)}%` : ''}
      Tags: ${tweet.tags.join(', ')}
      Date: ${new Date(tweet.timestamp).toISOString()}
    `.trim();
    
    // Pinecone only allows primitive values in metadata
    // Create a flattened version of the tweet with primitive values
    const flatMetadata = {
      id: tweet.id,
      tweetId: tweet.id,
      content: tweet.content.substring(0, 500), // Limit content length
      topic: tweet.topic,
      timestamp: tweet.timestamp,
      tweetDate: new Date(tweet.timestamp).toISOString(),
      tags: tweet.tags.join(','), // Convert array to string
      // Add token data as flat fields
      tokenSymbol: tweet.token?.symbol || '',
      tokenName: tweet.token?.name || '',
      tokenPrice: tweet.token?.price ? tweet.token.price.toString() : '',
      tokenPriceChange: tweet.token?.priceChange24h ? tweet.token.priceChange24h.toString() : '',
    };
    
    // Add directly to vector memory system
    await vectorMemory.store({
      id: vectorId,
      input: `Tweet about ${tweet.topic}`,
      output: textToEmbed,
      timestamp: Date.now(), // Number of milliseconds since epoch
      metadata: flatMetadata // Use flattened metadata with primitive values
    });
    
    // Save the vector ID with the tweet
    tweet.vectorId = vectorId;
    
    logger.info(`Added tweet to vector memory`, { vectorId, topic: tweet.topic });
    
    return vectorId;
  } catch (error) {
    logger.error('Error adding tweet to vector memory', error);
    throw error;
  }
}

/**
 * Find similar tweets in vector memory
 * 
 * @param query - Text to search for
 * @param limit - Maximum number of results to return
 * @returns Promise resolving to array of similar tweets
 */
async function findSimilarTweets(query: string, limit: number = 5): Promise<TweetRecord[]> {
  try {
    // Use vector memory's retrieve method
    const results = await vectorMemory.retrieve(query, limit);
    
    // The results are strings, but the metadata is in the vector store
    // Let's get the most recent tweets from our database and filter for the ones that match
    const database = loadTweetHistory();
    const foundTweets: TweetRecord[] = [];
    
    // For each result string, try to find matching tweets
    for (const result of results) {
      // Look through our database for tweets that match parts of this content
      // This is a simple approach - in a production system, we might store IDs directly
      for (const tweet of database.tweets) {
        if (tweet.vectorId && (
            result.includes(tweet.content) || 
            result.includes(tweet.topic) ||
            (tweet.token && result.includes(tweet.token.symbol))
          )) {
          foundTweets.push(tweet);
          break; // Found a match for this result, move to next
        }
      }
    }
    
    // If we didn't find enough matches in the simple way, get the most recent vectorized tweets
    if (foundTweets.length < Math.min(limit, results.length)) {
      const vectorizedTweets = database.tweets
        .filter(tweet => tweet.vectorId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
      
      // Add any that aren't already in our results
      for (const tweet of vectorizedTweets) {
        if (!foundTweets.some(t => t.id === tweet.id)) {
          foundTweets.push(tweet);
          if (foundTweets.length >= limit) break;
        }
      }
    }
    
    return foundTweets;
  } catch (error) {
    logger.error('Error finding similar tweets', error);
    return [];
  }
}

/**
 * Adds a tweet to history and vector memory
 * 
 * @param tweet - The tweet to add
 */
async function addTweetToHistory(tweet: TweetRecord): Promise<void> {
  try {
    // Add to file-based database
    const database = loadTweetHistory();
    
    // If we have a vector system initialized, add to vector memory
    if (vectorMemory && embeddingService && pineconeStore) {
      try {
        const vectorId = await addTweetToVectorMemory(tweet);
        tweet.vectorId = vectorId;
      } catch (vectorError) {
        logger.error('Error adding tweet to vector memory', vectorError);
        // Continue with file storage even if vector storage fails
      }
    }
    
    // Add to regular database
    database.tweets.push(tweet);
    saveTweetHistory(database);
    
    logger.info(`Added tweet to history database. Total tweets: ${database.tweets.length}`);
  } catch (error) {
    logger.error('Error adding tweet to history', error);
  }
}

function getRecentTweets(count: number = 10, filter?: { topic?: string, token?: string }): TweetRecord[] {
  const database = loadTweetHistory();
  let filteredTweets = database.tweets;
  
  if (filter) {
    if (filter.topic) {
      filteredTweets = filteredTweets.filter(tweet => 
        tweet.topic.toLowerCase().includes(filter.topic!.toLowerCase()));
    }
    if (filter.token) {
      filteredTweets = filteredTweets.filter(tweet => 
        tweet.token?.symbol.toLowerCase() === filter.token!.toLowerCase() ||
        (tweet.content.toLowerCase().includes('$' + filter.token!.toLowerCase())));
    }
  }
  
  // Return most recent tweets first
  return filteredTweets
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, count);
}

// Vector memory configuration
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'twitter-agent-memory';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'twitter-memory';

// Global state
let baseAgent: Agent;
let autonomousAgent: AutonomousAgent;
let twitterConnector: BrowserTwitterConnector;
let contentManager: TwitterContentManager;
let vectorMemory: VectorMemory;
let embeddingService: EmbeddingService;
let pineconeStore: PineconeStore;
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
    
    // Initialize vector memory system
    await initializeVectorMemory();
    
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
  const requiredEnvVars = [
    'TWITTER_USERNAME', 
    'TWITTER_PASSWORD', 
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY', // Required for embeddings
    'PINECONE_API_KEY' // Required for vector database
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }
}

/**
 * Initialize the vector memory system
 */
async function initializeVectorMemory(): Promise<void> {
  logger.info('Initializing vector memory system...');
  
  try {
    // Create embedding service
    embeddingService = new EmbeddingService({
      model: 'text-embedding-3-small',
      dimensions: 1536
    });
    
    // Create Pinecone store
    pineconeStore = new PineconeStore({
      index: PINECONE_INDEX,
      namespace: PINECONE_NAMESPACE,
      dimension: 1536
    });
    
    // Initialize the store (creates index if needed)
    await pineconeStore.initialize();
    
    // Create a wrapper for PineconeStore that adapts it to VectorDBService interface
    const pineconeAdapter = {
      storeVector: pineconeStore.storeVector.bind(pineconeStore),
      searchVectors: pineconeStore.searchVectors.bind(pineconeStore),
      deleteVector: pineconeStore.deleteVector.bind(pineconeStore),
      // Add the missing clearVectors method
      clearVectors: async (): Promise<void> => {
        await pineconeStore.deleteNamespace(PINECONE_NAMESPACE);
        logger.info('Cleared all vectors from namespace');
      }
    };
    
    // Create a wrapper for EmbeddingService that adapts it to MockEmbeddingService interface
    const embeddingAdapter = {
      // Map the embedText method to textToVector for compatibility
      textToVector: embeddingService.embedText.bind(embeddingService)
    };
    
    // Create vector memory with our adapter services
    vectorMemory = new VectorMemory({
      vectorService: pineconeAdapter,
      embeddingService: embeddingAdapter
    });
    
    logger.info('Vector memory system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize vector memory system', error);
    throw error;
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
  
  // Show tweet database stats
  const database = loadTweetHistory();
  console.log(`Tweet database: ${database.tweets.length} tweets stored`);
  if (database.tweets.length > 0) {
    const lastTweet = database.tweets.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    console.log(`Last tweet: ${new Date(lastTweet.timestamp).toLocaleString()} about ${lastTweet.topic}`);
  }
  
  // Show vector memory status
  const vectorTweets = database.tweets.filter(tweet => tweet.vectorId);
  console.log(`\nVector memory: ${vectorTweets.length} tweets vectorized`);
  console.log(`Vector database: ${process.env.PINECONE_INDEX || PINECONE_INDEX}`);
  console.log(`Namespace: ${process.env.PINECONE_NAMESPACE || PINECONE_NAMESPACE}`);
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
  
  // Show tweet database stats
  const database = loadTweetHistory();
  console.log(`\nTweet database: ${database.tweets.length} tweets stored`);
  
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
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error occurred';
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
      
      // Check tweet history for this token
      const previousTweets = getRecentTweets(3, { token: selectedToken.symbol });
      if (previousTweets.length > 0) {
        console.log(`\nFound ${previousTweets.length} previous tweets about $${selectedToken.symbol}:`);
        previousTweets.forEach((tweet, idx) => {
          console.log(`${idx + 1}. [${new Date(tweet.timestamp).toLocaleDateString()}]: ${tweet.content.substring(0, 70)}...`);
        });
      }
      
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
      
      // Use a more targeted search query to get specific information about the token
      const detailSearchQuery = `${selectedToken.name} ${selectedToken.symbol} crypto token project details use case utility Solana`;
      console.log(`Searching for project details: ${detailSearchQuery}`);
      
      const detailResults = await tavilyTool.execute({
        query: detailSearchQuery,
        maxResults: 3,
        includeAnswer: true
      });
      
      // Now search for recent news and catalysts
      const newsSearchQuery = `${selectedToken.name} ${selectedToken.symbol} crypto news recent developments upcoming catalyst roadmap 2025`;
      console.log(`Searching for news and catalysts: ${newsSearchQuery}`);
      
      const newsResults = await tavilyTool.execute({
        query: newsSearchQuery,
        maxResults: 3,
        includeAnswer: true
      });
      
      // Combine the search results
      const searchResults = {
        answer: `PROJECT DETAILS: ${detailResults.answer || 'No clear information found.'} \n\nRECENT NEWS & CATALYSTS: ${newsResults.answer || 'No recent news found.'}`,
        results: [
          ...(detailResults.results || []),
          ...(newsResults.results || [])
        ]
      };
      
      console.log(`\nSearch complete. Found ${searchResults.results?.length || 0} results.`);
      
      // Always show a condensed version of the research
      console.log('\n=== Research Summary ===');
      const shortSummary = searchResults.answer ? 
        searchResults.answer.split('\n\n').map(part => part.substring(0, 150) + (part.length > 150 ? '...' : '')).join('\n') :
        'No research summary available';
      console.log(shortSummary);
      
      // Show full research details in verbose mode
      if (verbose) {
        console.log('\n=== Full Research Details ===');
        console.log(searchResults.answer || 'No detailed information available');
        
        if (searchResults.results && searchResults.results.length > 0) {
          console.log('\n=== Top Sources ===');
          searchResults.results.slice(0, 3).forEach((result, idx) => {
            console.log(`\n[${idx + 1}] ${result.title || 'No title'}`);
            console.log(`URL: ${result.url || 'No URL'}`);
            console.log(`Snippet: ${(result.content || result.snippet || 'No content').substring(0, 200)}...`);
          });
        }
      }
      
      // Find semantically similar tweets from vector memory
      let vectorSimilarTweets: TweetRecord[] = [];
      if (vectorMemory && embeddingService && pineconeStore) {
        try {
          console.log(`Searching vector memory for related tweets...`);
          // Search for semantically similar tweets based on the token and research
          const vectorQuery = `${selectedToken.name} ${selectedToken.symbol} price trends market analysis prediction`;
          vectorSimilarTweets = await findSimilarTweets(vectorQuery, 3);
          
          if (vectorSimilarTweets.length > 0) {
            console.log(`Found ${vectorSimilarTweets.length} semantically similar tweets in vector memory`);
          }
        } catch (vectorError) {
          logger.error('Error searching vector memory', vectorError);
          // Continue without vector results if it fails
        }
      }
      
      // Generate a tweet based on the research
      console.log('Generating tweet based on research...');
      
      // Extract key information from search results
      let researchInsights = "Limited information available.";
      let projectDetails = "";
      let catalysts = "";
      let useCase = "";
      let marketPotential = "";
      
      if (searchResults.answer) {
        researchInsights = searchResults.answer.substring(0, 800);
        
        // Try to extract specific details from the research
        if (searchResults.results && searchResults.results.length > 0) {
          // Combine snippets from top 3 results for more context
          const detailedResearch = searchResults.results
            .slice(0, 3)
            .map(result => result.content || result.snippet || "")
            .join(" ");
          
          // Extract project details if mentioned
          const projectMatch = detailedResearch.match(/(?:project|platform|protocol) (is|aims|seeks|provides|offers|enables|allows|helps|supports|facilitates)([^.!?]+)/i);
          if (projectMatch) {
            projectDetails = projectMatch[0].trim();
          }
          
          // Extract potential catalysts
          const catalystMatch = detailedResearch.match(/(upcoming|planned|soon|future|potential|expected|anticipated|roadmap|launch|release|partnership|integration|listing|upgrade|update)([^.!?]+)/i);
          if (catalystMatch) {
            catalysts = catalystMatch[0].trim();
          }
          
          // Extract use case
          const useCaseMatch = detailedResearch.match(/(use case|utility|used for|enables|allows|purpose)([^.!?]+)/i);
          if (useCaseMatch) {
            useCase = useCaseMatch[0].trim();
          }
          
          // Extract market potential
          const marketMatch = detailedResearch.match(/(market potential|growth potential|target market|total addressable market|opportunity|could grow|market size)([^.!?]+)/i);
          if (marketMatch) {
            marketPotential = marketMatch[0].trim();
          }
        }
      }
      
      // Create a simplified but still informative prompt
      let tweetPrompt = `
      You are ${baseAgent.config.name}, a crypto market analyst focusing on Solana tokens.
      
      Token: ${selectedToken.name} (${selectedToken.symbol})
      Price: $${selectedToken.price.toFixed(4)} 
      24h Change: ${selectedToken.priceChange24h.toFixed(2)}%
      Volume: $${(selectedToken.volume24h/1000000).toFixed(1)}M
      
      Key Research Points:
      ${projectDetails ? `- ${projectDetails}` : ''}
      ${useCase ? `- ${useCase}` : ''}
      ${catalysts ? `- ${catalysts}` : ''}
      ${marketPotential ? `- ${marketPotential}` : ''}
      `;
      
      // Limit the number of previous tweets to prevent prompt size issues
      const allPreviousTweets = [...previousTweets].slice(0, 2);
      
      // Add at most 1 vector memory tweet if it's not already in the list
      if (vectorSimilarTweets.length > 0 && !allPreviousTweets.some(tweet => tweet.id === vectorSimilarTweets[0].id)) {
        allPreviousTweets.push(vectorSimilarTweets[0]);
      }
      
      // Add previous tweets for context if available (limit to 2 max)
      if (allPreviousTweets.length > 0) {
        tweetPrompt += `\nPrevious related tweets:`;
        allPreviousTweets.forEach((tweet, idx) => {
          tweetPrompt += `\n- ${tweet.content.substring(0, 100)}${tweet.content.length > 100 ? '...' : ''}`;
        });
      }
      
      tweetPrompt += `
      Create a brief, informative tweet (under 240 chars) about this token that:
      1. Mentions a specific aspect of the project
      2. Includes the price and/or price change
      3. Uses the $${selectedToken.symbol} format
      4. No hashtags
      
      Return ONLY the tweet text.
      `;
      
      console.log('Waiting for tweet generation (this may take a moment)...');
      
      // Use baseAgent directly instead of autonomousAgent to avoid timeouts
      console.log('Generating tweet based on research...');
      
      let tweetResult: { response: string } = { response: '' };
      
      try {
        // Simplify the prompt to ensure it's processed quickly
        const simplifiedPrompt = `
        You are a crypto analyst creating a tweet about ${selectedToken.name} ($${selectedToken.symbol}).
        
        Token Data:
        - Price: $${selectedToken.price.toFixed(4)}
        - 24h change: ${selectedToken.priceChange24h.toFixed(2)}%
        - Volume: $${(selectedToken.volume24h/1000000).toFixed(1)}M
        
        ${projectDetails ? `Project Details: ${projectDetails.substring(0, 150)}` : ''}
        ${useCase ? `Use Case: ${useCase.substring(0, 100)}` : ''}
        ${catalysts ? `Potential Catalyst: ${catalysts.substring(0, 100)}` : ''}
        
        Create a single concise tweet that:
        1. Mentions something specific about the project
        2. Includes current price
        3. Uses $${selectedToken.symbol} format 
        4. Is under 240 characters
        5. No hashtags
        
        ONLY output the tweet text.
        `;
        
        // Use the base agent directly which is more reliable
        tweetResult = await baseAgent.run({ task: simplifiedPrompt });
        console.log('Tweet successfully generated!');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.log(`Tweet generation failed: ${errorMessage}`);
        
        // Create an extremely minimal prompt as a last resort
        console.log('\nTrying with minimal prompt...');
        
        try {
          const minimalPrompt = `
          Write one tweet about $${selectedToken.symbol} at $${selectedToken.price.toFixed(4)} with ${selectedToken.priceChange24h.toFixed(2)}% change.
          Make it less than 240 characters. Only return the tweet text.
          `;
          
          tweetResult = await baseAgent.run({ task: minimalPrompt });
          console.log('Successfully generated a minimal tweet!');
        } catch (retryError) {
          console.log(`All tweet generation attempts failed. Please try again with a different token.`);
          showMainMenu();
          return;
        }
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
              const tweetId = await twitterConnector.tweet(shortenedTweet);
              console.log('🚀 Tweet posted successfully!');
              
              // Add to the tweet database
              addTweetToHistory({
                id: tweetId || `tweet_${Date.now()}`,
                content: shortenedTweet,
                topic: `${selectedToken.symbol} analysis`,
                timestamp: new Date().toISOString(),
                token: {
                  symbol: selectedToken.symbol,
                  name: selectedToken.name,
                  price: selectedToken.price,
                  priceChange24h: selectedToken.priceChange24h
                },
                tags: ['research', 'trending', 'token_analysis']
              });
              
              // Record the posted tweet in content manager too
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
              const tweetId = await twitterConnector.tweet(tweetContent);
              console.log('🚀 Tweet posted successfully!');
              
              // Add to the tweet database
              addTweetToHistory({
                id: tweetId || `tweet_${Date.now()}`,
                content: tweetContent,
                topic: `${selectedToken.symbol} analysis`,
                timestamp: new Date().toISOString(),
                token: {
                  symbol: selectedToken.symbol,
                  name: selectedToken.name,
                  price: selectedToken.price,
                  priceChange24h: selectedToken.priceChange24h
                },
                tags: ['research', 'trending', 'token_analysis']
              });
              
              // Record the posted tweet in content manager too
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
          
          // Check if we have tweets about this token
          const tweets = getRecentTweets(1, { token: token.symbol });
          if (tweets.length > 0) {
            console.log(`   Last tweet: ${new Date(tweets[0].timestamp).toLocaleDateString()}`);
          }
          console.log();
        });
      }
    } catch (apiError) {
      logger.error('BirdEye API error', apiError);
      const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error occurred';
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
      
      // Check for previous tweets on this topic
      const previousTweets = getRecentTweets(2, { topic });
      if (previousTweets.length > 0) {
        console.log(`\nFound ${previousTweets.length} previous tweets about this topic:`);
        previousTweets.forEach((tweet, idx) => {
          console.log(`${idx + 1}. [${new Date(tweet.timestamp).toLocaleDateString()}]: ${tweet.content}`);
        });
      }
      
      // Create prompt with context from previous tweets
      let prompt = `Create a thoughtful tweet about: "${topic}"\n`;
      
      if (previousTweets.length > 0) {
        prompt += `\nYour previous tweets on this topic:\n`;
        previousTweets.forEach((tweet, idx) => {
          prompt += `${idx + 1}. [${new Date(tweet.timestamp).toLocaleDateString()}]: ${tweet.content}\n`;
        });
        prompt += `\nCreate a new tweet with different information than your previous tweets.\n`;
      }
      
      prompt += `
      The tweet should reflect your personality as a crypto/AI market researcher.
      It MUST be under 240 characters and demonstrate your expertise.
      Do NOT include any hashtags.
      Only return the tweet text, no quotation marks or other formatting.`;
      
      const result = await baseAgent.run({ task: prompt });
      
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
            const tweetId = await twitterConnector.tweet(tweetText);
            console.log('🚀 Tweet posted successfully!');
            
            // Add to tweet database
            addTweetToHistory({
              id: tweetId || `tweet_${Date.now()}`,
              content: tweetText,
              topic,
              timestamp: new Date().toISOString(),
              tags: ['manual']
            });
            
            // Record the tweet in content manager
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
      
      // Check for previous tweets on this topic
      const previousTweets = getRecentTweets(2, { topic });
      if (previousTweets.length > 0) {
        console.log(`\nFound ${previousTweets.length} previous tweets about this topic:`);
        previousTweets.forEach((tweet, idx) => {
          console.log(`${idx + 1}. [${new Date(tweet.timestamp).toLocaleDateString()}]: ${tweet.content}`);
        });
      }
      
      // Add context from previous tweets
      let prompt = `Create a thoughtful tweet about: "${topic}"\n`;
      
      if (previousTweets.length > 0) {
        prompt += `\nYour previous tweets on this topic:\n`;
        previousTweets.forEach((tweet, idx) => {
          prompt += `${idx + 1}. [${new Date(tweet.timestamp).toLocaleDateString()}]: ${tweet.content}\n`;
        });
        prompt += `\nCreate a new tweet with different information than your previous tweets.\n`;
      }
      
      prompt += `
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
          
          // Add to tweet database
          addTweetToHistory({
            id: tweetId || `tweet_${Date.now()}`,
            content: tweetContent,
            topic,
            timestamp: new Date().toISOString(),
            tags: ['manual']
          });
          
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
  console.log('\nTweet History Options:');
  console.log('1: View recent tweets from database');
  console.log('2: View tweets by token/topic');
  console.log('3: View draft tweets');
  console.log('4: View scheduled tweets');
  console.log('5: View posted tweets');
  console.log('6: Search for similar tweets (semantic search)');
  console.log('7: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleTweetHistoryCommand);
}

/**
 * Handle tweet history command
 */
function handleTweetHistoryCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View recent tweets from database
      viewDatabaseTweets();
      break;
    case '2': // View tweets by token/topic
      viewTweetsByFilter();
      break;
    case '3': // View draft tweets
      viewTweetsByStatus('draft');
      break;
    case '4': // View scheduled tweets
      viewTweetsByStatus('approved');
      break;
    case '5': // View posted tweets
      viewTweetsByStatus('posted');
      break;
    case '6': // Search for similar tweets using vector db
      searchSimilarTweets();
      break;
    case '7': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      viewTweetHistory();
      break;
  }
}

/**
 * View tweets from database
 */
function viewDatabaseTweets(): void {
  const tweets = getRecentTweets(20);
  
  if (tweets.length === 0) {
    console.log('\nNo tweets found in the database.');
  } else {
    console.log(`\n=== Recent Tweets (${tweets.length}) ===`);
    tweets.forEach((tweet, index) => {
      console.log(`\n${index + 1}. [${new Date(tweet.timestamp).toLocaleString()}]`);
      console.log(`Topic: ${tweet.topic}`);
      console.log(`Content: ${tweet.content}`);
      if (tweet.token) {
        console.log(`Token: $${tweet.token.symbol} at $${tweet.token.price.toFixed(4)}`);
      }
      console.log(`Tags: ${tweet.tags?.join(', ') || 'none'}`);
    });
  }
  
  viewTweetHistory();
}

/**
 * View tweets with a filter
 */
function viewTweetsByFilter(): void {
  safeQuestion('Enter token symbol or topic to filter by: ', (filter) => {
    if (!filter.trim()) {
      console.log('No filter provided.');
      viewTweetHistory();
      return;
    }
    
    const tweets = getRecentTweets(20, { 
      token: filter.trim(),
      topic: filter.trim() 
    });
    
    if (tweets.length === 0) {
      console.log(`\nNo tweets found matching '${filter.trim()}'.`);
    } else {
      console.log(`\n=== Tweets matching '${filter.trim()}' (${tweets.length}) ===`);
      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. [${new Date(tweet.timestamp).toLocaleString()}]`);
        console.log(`Topic: ${tweet.topic}`);
        console.log(`Content: ${tweet.content}`);
        if (tweet.token) {
          console.log(`Token: $${tweet.token.symbol} at $${tweet.token.price.toFixed(4)}`);
        }
        console.log(`Tags: ${tweet.tags?.join(', ') || 'none'}`);
      });
    }
    
    viewTweetHistory();
  });
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
  console.log('3: View database statistics');
  console.log('4: Back to main menu');
  
  safeQuestion('\nEnter command number: ', async (input) => {
    await handleSettingsCommand(input);
  });
}

/**
 * Handle settings command
 */
async function handleSettingsCommand(input: string): Promise<void> {
  switch (input.trim()) {
    case '1': // View current settings
      viewCurrentSettings();
      break;
    case '2': // Set research interval
      setResearchInterval();
      break;
    case '3': // View database statistics
      await viewDatabaseStats();
      break;
    case '4': // Back to main menu
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
 * View database statistics
 */
async function viewDatabaseStats(): Promise<void> {
  const database = loadTweetHistory();
  console.log('\n=== Tweet Database Statistics ===');
  console.log(`Total tweets: ${database.tweets.length}`);
  console.log(`Last updated: ${new Date(database.meta.lastUpdated).toLocaleString()}`);
  console.log(`Database version: ${database.meta.version}`);
  
  // Count tokens
  const tokenCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  let vectorizedCount = 0;
  
  database.tweets.forEach(tweet => {
    if (tweet.token?.symbol) {
      const symbol = tweet.token.symbol;
      tokenCounts.set(symbol, (tokenCounts.get(symbol) || 0) + 1);
    }
    
    if (tweet.topic) {
      const topic = tweet.topic;
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    
    // Count tweets with vector IDs
    if (tweet.vectorId) {
      vectorizedCount++;
    }
  });
  
  // Show top tokens
  if (tokenCounts.size > 0) {
    console.log('\nTop tokens mentioned:');
    [...tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([token, count]) => {
        console.log(`$${token}: ${count} tweet${count !== 1 ? 's' : ''}`);
      });
  }
  
  // Show top topics
  if (topicCounts.size > 0) {
    console.log('\nTop topics:');
    [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([topic, count]) => {
        console.log(`${topic}: ${count} tweet${count !== 1 ? 's' : ''}`);
      });
  }
  
  // Show vector database stats if available
  if (vectorMemory && pineconeStore) {
    console.log('\n=== Vector Memory Statistics ===');
    console.log(`Tweets in vector memory: ${vectorizedCount}/${database.tweets.length}`);
    
    try {
      // Get info about the Pinecone index
      if (vectorizedCount > 0) {
        // Try to find most representative tweet (central to all others)
        const centralTweet = await findCentralTweet();
        if (centralTweet) {
          console.log('\nMost representative tweet in your vector database:');
          console.log(`Topic: ${centralTweet.topic}`);
          console.log(`Date: ${new Date(centralTweet.timestamp).toLocaleDateString()}`);
          console.log(`Content: ${centralTweet.content}`);
        }
      }
    } catch (error) {
      logger.error('Error retrieving vector stats', error);
    }
  }
  
  showSettings();
}

/**
 * Find the most central/representative tweet in the vector database
 * This helps identify the main themes in the tweet collection
 */
async function findCentralTweet(): Promise<TweetRecord | null> {
  try {
    // For a simple approach, we'll use the most recent tweet as a query vector
    // and find the tweet that's most connected to all others
    const database = loadTweetHistory();
    
    if (database.tweets.length === 0) return null;
    
    // Get the latest tweet with a vector ID
    const latestVectorizedTweets = database.tweets
      .filter(tweet => tweet.vectorId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (latestVectorizedTweets.length === 0) return null;
    
    // Use a generic query that should find central tweets
    const centralQuery = "cryptocurrency market trends analysis insights predictions";
    const similarTweets = await findSimilarTweets(centralQuery, 1);
    
    return similarTweets.length > 0 ? similarTweets[0] : null;
  } catch (error) {
    logger.error('Error finding central tweet', error);
    return null;
  }
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
 * Search for semantically similar tweets
 */
function searchSimilarTweets(): void {
  // Check if vector memory is initialized
  if (!vectorMemory || !embeddingService || !pineconeStore) {
    console.log('\nVector memory system is not initialized');
    viewTweetHistory();
    return;
  }
  
  safeQuestion('Enter search query (e.g., "market prediction for SOL", "token analysis"): ', async (query) => {
    if (!query.trim()) {
      console.log('No query provided.');
      viewTweetHistory();
      return;
    }
    
    console.log(`\nSearching for tweets similar to: "${query.trim()}"`);
    console.log('This search uses semantic similarity rather than exact keyword matching.');
    
    try {
      // Search for similar tweets
      const similarTweets = await findSimilarTweets(query.trim(), 7);
      
      if (similarTweets.length === 0) {
        console.log('\nNo semantically similar tweets found.');
      } else {
        console.log(`\n=== Found ${similarTweets.length} semantically similar tweets ===`);
        
        similarTweets.forEach((tweet, index) => {
          console.log(`\n${index + 1}. [${new Date(tweet.timestamp).toLocaleString()}]`);
          console.log(`Topic: ${tweet.topic}`);
          console.log(`Content: ${tweet.content}`);
          if (tweet.token) {
            console.log(`Token: $${tweet.token.symbol} at $${tweet.token.price.toFixed(4)}`);
          }
          console.log(`Tags: ${tweet.tags?.join(', ') || 'none'}`);
        });
      }
    } catch (error) {
      logger.error('Error searching similar tweets', error);
      console.log('\nError occurred while searching. Please try again.');
    }
    
    viewTweetHistory();
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