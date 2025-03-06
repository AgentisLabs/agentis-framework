/**
 * Autonomous Crypto Analysis Agent with Direct Twitter Integration
 * 
 * A fully autonomous agent that researches, analyzes, and tweets about
 * promising crypto projects (especially AI-related) using the enhanced
 * TwitterDirectConnector for robust Twitter interaction.
 * 
 * The agent:
 * 1. Finds interesting tokens via BirdEye and other sources
 * 2. Researches tokens using web search tools
 * 3. Stores analysis in Pinecone vector memory
 * 4. Generates and posts tweets with market insights
 * 5. Follows up on previous predictions and analyses
 * 6. Monitors keywords and mentions in real-time
 * 7. Responds to questions and engages with other users
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Agent } from '../src/core/agent';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { TwitterDirectConnector } from '../src/platform-connectors/twitter-direct-connector';
import { Logger } from '../src/utils/logger';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { BirdEyeTrendingTool } from '../src/tools/birdeye-trending-tool';
import { BirdEyeTokenOverviewTool } from '../src/tools/birdeye-token-overview-tool';
import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { ToolRegistry } from '../src/tools/tool-registry';
import { 
  PersonalityUtils, 
  EnhancedAgentConfig,
  EnhancedPersonality
} from '../src/core/enhanced-personality-system';
import { AgentRole } from '../src/core/types';
import { OpenAIProvider } from '../src/core/openai-provider';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { EnhancedPlanner } from '../src/planning/enhanced-planner';
import { PlanningStrategy } from '../src/planning/planner-interface';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('CryptoTwitterDirectAgent');

// Default paths and settings
const DEFAULT_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent-state');
const TWITTER_DATA_DIR = path.join(DATA_DIR, 'twitter');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const COOKIES_DIR = path.join(DATA_DIR, 'twitter-cookies');

// Vector memory configuration
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'crypto-agent-memory';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'crypto-analysis';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENT_STATE_DIR)) fs.mkdirSync(AGENT_STATE_DIR, { recursive: true });
if (!fs.existsSync(TWITTER_DATA_DIR)) fs.mkdirSync(TWITTER_DATA_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
if (!fs.existsSync(COOKIES_DIR)) fs.mkdirSync(COOKIES_DIR, { recursive: true });

/**
 * Custom crypto analysis tool that wraps BirdEye and other data sources
 */
// Define token interface to avoid implicit any types
interface TokenData {
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap?: number;
  rank?: number;
}

class CryptoAnalysisTool {
  private birdEye: BirdEyeTrendingTool;
  private logger: Logger;
  
  constructor() {
    this.birdEye = new BirdEyeTrendingTool();
    this.logger = new Logger('CryptoAnalysisTool');
  }
  
  /**
   * Get trending tokens with interesting metrics
   * 
   * @param options - Filter options
   * @returns Promise with trending tokens
   */
  async getTrendingTokens(options: { 
    limit?: number; 
    minPriceChange?: number;
    focusAreas?: string[];
  } = {}): Promise<{
    tokens: TokenData[];
    timestamp: string;
    source: string;
  }> {
    try {
      const limit = options.limit || 20;
      const minPriceChange = options.minPriceChange || 0;
      
      // Get trending tokens from BirdEye
      const trendingResult = await this.birdEye.execute({
        limit
      });
      
      // Filter and process tokens
      let tokens = (trendingResult.tokens || []) as TokenData[];
      
      // Apply filters if needed
      if (minPriceChange > 0) {
        tokens = tokens.filter((token: TokenData) => 
          Math.abs(token.priceChange24h) >= minPriceChange
        );
      }
      
      // If focus areas provided, add a more flexible scoring system with randomness
      if (options.focusAreas && options.focusAreas.length > 0) {
        // Assign scores and add randomness to avoid always prioritizing the same tokens
        const scoredTokens = tokens.map((token: TokenData) => {
          let score = 0;
          
          // Basic score based on match with focus areas
          const matches = options.focusAreas!.filter(area => 
            token.name.toLowerCase().includes(area.toLowerCase()) || 
            token.symbol.toLowerCase().includes(area.toLowerCase())
          );
          
          // Assign score based on matches (up to 5 points)
          score += Math.min(matches.length * 2, 5);
          
          // Add points for price movement (up to 3 points)
          score += Math.min(Math.abs(token.priceChange24h) / 5, 3);
          
          // Add random factor (0-4 points) to diversify results
          score += Math.random() * 4;
          
          // Explicitly avoid overweighting "AI16z" or similar tokens
          if (token.symbol === 'AI16Z' || token.symbol === 'AI16z') {
            // Slightly reduce score for this token to ensure diversity
            score *= 0.7;
          }
          
          return { token, score };
        });
        
        // Sort by score (descending)
        scoredTokens.sort((a, b) => b.score - a.score);
        
        // Replace tokens array with scored tokens
        tokens = scoredTokens.map(item => item.token);
      }
      
      return {
        tokens,
        timestamp: new Date().toISOString(),
        source: 'BirdEye'
      };
    } catch (error) {
      this.logger.error('Error getting trending tokens', error);
      throw error;
    }
  }
  
  /**
   * Analyze a specific token
   * 
   * @param tokenSymbol - The token symbol to analyze
   * @returns Promise with analysis results
   */
  async analyzeToken(tokenSymbol: string) {
    // In a full implementation, this would gather in-depth metrics
    // from multiple sources beyond what BirdEye provides
    return {
      symbol: tokenSymbol,
      timestamp: new Date().toISOString(),
      source: 'CryptoAnalysisTool'
    };
  }
}

// Define structure for notes to match EnhancedMemory implementation
interface NoteSearchParams {
  query: string;
  category?: string;
  tags?: string[];
  limit?: number;
}

interface Note {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags: string[];
  timestamp: number;
}

// Define simplified interface for memory interactions
interface SimpleMemorySystem {
  addNote(note: Omit<Note, 'id'>): Promise<string>;
  searchNotes(params: NoteSearchParams): Promise<Note[]>;
  getAllNotes(): Promise<Note[]>;
  // Including required properties directly in the interface to resolve bindings
  embeddingService: EmbeddingService;
  pineconeStore: PineconeStore;
}

/**
 * Main autonomous crypto agent class with direct Twitter integration
 */
class CryptoTwitterDirectAgent {
  // Core components
  private baseAgent!: Agent;
  private autonomousAgent!: AutonomousAgent;
  private personality: EnhancedPersonality;
  private twitterConnector!: TwitterDirectConnector;
  private planner: EnhancedPlanner;
  private openaiProvider: OpenAIProvider;
  
  // Tools
  private cryptoTool: CryptoAnalysisTool;
  private searchTool: TavilySearchTool;
  private tokenOverviewTool: BirdEyeTokenOverviewTool;
  private coinGeckoTool: CoinGeckoPriceTool;
  
  // Memory system
  private embeddingService!: EmbeddingService;
  private pineconeStore!: PineconeStore;
  private memory!: SimpleMemorySystem;
  
  // State
  private isRunning: boolean = false;
  private currentGoals: string[] = [];
  private currentTasks: Array<{description: string; type?: string}> = [];
  
  // Interaction and tweet limiting
  private hourlyInteractionLimit: number = 15; // Max 15 interactions per hour
  private hourlyInteractions: number = 0; 
  private lastInteractionResetTime: number = Date.now();
  private interactionLimitingActive: boolean = false;
  
  // Quote retweet specific limiting
  private quoteRetweetLimit: number = 0; // Default to 0 quote tweets allowed at startup
  private quoteRetweetsToday: number = 0; // Track today's quote retweets
  private lastQuoteTweetDay: number = 0; // Day of month for last quote tweet
  
  // Tweet rate limiting
  private tweetRateLimitTimeframe: number = 30 * 60 * 1000; // 30 minutes in ms (increased from 15)
  private tweetRateLimit: number = 2; // Max 2 tweets per 30 min period (decreased from 3)
  private recentTweets: number[] = []; // Array of timestamps of recent tweets
  
  // Default settings
  private settings = {
    tweetFrequencyHours: 1, // Tweet every hour
    analysisFrequencyHours: 2,
    researchDepth: 'medium',
    focusAreas: ['crypto', 'defi', 'blockchain', 'web3', 'finance', 'technology'], // More general focus areas
    aiProjectResearchFrequencyHours: 12, // Research AI crypto projects every 12 hours
    specializedResearchFrequencyHours: 8 // Perform specialized tool-based research every 8 hours
  };
  
  // Track last specialized research timestamps
  private lastAIProjectResearch: number = 0; // Timestamp of last AI project research
  private lastSpecializedResearch: number = 0; // Timestamp of last specialized research
  
  /**
   * Creates a new autonomous crypto agent with Twitter integration
   * 
   * @param personalityPath - Path to the personality file
   * @param model - OpenAI model to use (default: gpt-4o-mini)
   */
  constructor(personalityPath: string = DEFAULT_PERSONA_PATH, model: string = 'gpt-4o-mini') {
    // Load the agent's personality
    this.personality = PersonalityUtils.loadPersonalityFromJson(personalityPath);
    
    // Create OpenAI provider
    this.openaiProvider = new OpenAIProvider({
      model: model,
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Initialize tools
    this.cryptoTool = new CryptoAnalysisTool();
    this.searchTool = new TavilySearchTool();
    this.tokenOverviewTool = new BirdEyeTokenOverviewTool();
    this.coinGeckoTool = new CoinGeckoPriceTool(process.env.COINGECKO_API_KEY);
    this.planner = new EnhancedPlanner();
    
    // Set up high-level goals for the agent
    this.setupGoals();
  }
  
  /**
   * Define the agent's high-level goals
   */
  private setupGoals(): void {
    this.currentGoals = [
      "Identify promising crypto tokens across various technologies and sectors",
      "Analyze their market potential, tokenomics, and technical fundamentals",
      "Generate insights about their use cases and potential value propositions",
      "Share analysis via Twitter with substantiated predictions",
      "Follow up on previous predictions to build credibility",
      "Engage with Twitter users by responding to mentions and questions",
      "Monitor trending topics in crypto to identify new opportunities",
      "Browse Twitter timeline to discover and engage with relevant content",
      "Participate in crypto conversations by liking and retweeting valuable content",
      "Search for specific crypto topics to join ongoing discussions"
    ];
  }
  
  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing autonomous crypto agent with direct Twitter integration...');
      
      // Check required environment variables
      this.checkRequiredEnvVars();
      
      // Create the base agent with OpenAI provider
      this.baseAgent = this.createBaseAgent();
      
      // Register tools
      this.registerTools();
      
      // Initialize memory system
      await this.initializeMemory();
      
      // Create Twitter connector
      this.twitterConnector = this.createTwitterConnector();
      
      // Create autonomous agent wrapper
      this.autonomousAgent = this.createAutonomousAgent();
      
      // Connect to Twitter
      logger.info('Connecting to Twitter...');
      await this.twitterConnector.connect(this.baseAgent);
      logger.info('Connected to Twitter successfully!');
      
      // Set up Twitter event handlers
      this.setupTwitterEventHandlers();
      
      logger.info('Agent initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize agent', error);
      throw error;
    }
  }
  
  /**
   * Check required environment variables
   */
  private checkRequiredEnvVars(): void {
    const requiredEnvVars = [
      'TWITTER_USERNAME', 
      'TWITTER_PASSWORD', 
      'OPENAI_API_KEY',
      'PINECONE_API_KEY',
      'TAVILY_API_KEY'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
  }
  
  /**
   * Create the base agent with OpenAI provider
   */
  private createBaseAgent(): Agent {
    // Get name from personality or use a default
    const agentName = this.personality.persona?.name || path.basename(DEFAULT_PERSONA_PATH, '.json');
    
    // Create agent configuration
    const agentConfig: EnhancedAgentConfig = PersonalityUtils.createAgentConfig(
      agentName,
      this.personality,
      AgentRole.ASSISTANT,
      'gpt-4o-mini' // Use GPT-4o-mini instead of Claude or GPT-4o
    );
    
    // Generate system prompt
    const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);
    
    // Create the agent with OpenAI provider
    return new Agent({
      name: agentConfig.name,
      role: agentConfig.role,
      personality: PersonalityUtils.simplifyPersonality(this.personality),
      goals: this.personality.motivation.goals.shortTermGoals,
      systemPrompt,
      model: agentConfig.model
    }, this.openaiProvider); // Pass OpenAI provider directly
  }
  
  /**
   * Register tools with the agent
   */
  private registerTools(): void {
    const registry = ToolRegistry.getInstance();
    
    // Register Tavily search tool
    try {
      registry.registerTool(this.searchTool);
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
    
    // Register BirdEye token overview tool
    try {
      registry.registerTool(this.tokenOverviewTool);
      logger.debug('Registered BirdEye token overview tool');
    } catch (error) {
      logger.warn('Failed to register BirdEye token overview tool', error);
    }
    
    // Register CoinGecko price tool
    try {
      registry.registerTool(this.coinGeckoTool);
      logger.debug('Registered CoinGecko price tool');
    } catch (error) {
      logger.warn('Failed to register CoinGecko price tool', error);
    }
  }
  
  /**
   * Initialize memory system
   */
  private async initializeMemory(): Promise<void> {
    logger.info('Initializing memory system...');
    
    try {
      // Create embedding service - use text-embedding-3-large model for better quality
      this.embeddingService = new EmbeddingService({
        model: 'text-embedding-3-large',
        dimensions: 1536
      });
      
      // Create Pinecone store with configuration
      const pineconeConfig = {
        index: PINECONE_INDEX,
        namespace: PINECONE_NAMESPACE,
        dimension: 1536
      };
      
      // Create the store
      this.pineconeStore = new PineconeStore(pineconeConfig);
      
      // Initialize the store (creates index if needed)
      await this.pineconeStore.initialize();
      
      // Create production-ready memory system that uses Pinecone vector store
      this.memory = {
        // Assign direct references to services
        embeddingService: this.embeddingService,
        pineconeStore: this.pineconeStore,
        
        async addNote(note): Promise<string> {
          try {
            const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            
            // Generate embeddings for the note content
            const embedding = await this.embeddingService.embedText(
              `${note.title}\n\n${note.content}`
            );
            
            // Store in Pinecone directly with storeVector
            await this.pineconeStore.storeVector(
              id,
              embedding,
              {
                title: note.title,
                content: note.content,
                category: note.category || 'general',
                tags: note.tags,
                timestamp: note.timestamp
              }
            );
            
            logger.info(`Added note to Pinecone: ${note.title} (ID: ${id})`);
            return id;
          } catch (error) {
            logger.error(`Error adding note to Pinecone: ${note.title}`, error);
            throw error;
          }
        },
        
        async searchNotes(params): Promise<Note[]> {
          try {
            // Generate embedding for the query
            const queryEmbedding = await this.embeddingService.embedText(params.query);
            
            // Search Pinecone directly using searchVectors - we don't use filters here for simplicity
            // In a production system, we'd need to implement filter logic
            const searchResults = await this.pineconeStore.searchVectors(
              queryEmbedding, 
              params.limit || 10
            );
            
            // Map to Note format
            const notes = searchResults.map((match) => ({
              id: match.id,
              title: match.data.title,
              content: match.data.content,
              category: match.data.category,
              tags: match.data.tags,
              timestamp: match.data.timestamp
            }));
            
            logger.info(`Found ${notes.length} notes matching query: ${params.query}`);
            return notes;
          } catch (error) {
            logger.error(`Error searching notes in Pinecone: ${params.query}`, error);
            // Return empty array instead of failing completely
            return [];
          }
        },
        
        async getAllNotes(): Promise<Note[]> {
          try {
            // Use a zero vector to retrieve all notes (limited to 1000)
            // This is a simplified approach - in a real production system,
            // we would implement proper pagination
            const zeroVector = new Array(1536).fill(0);
            const allResults = await this.pineconeStore.searchVectors(zeroVector, 1000);
            
            // Map to Note format
            const notes = allResults.map((match) => ({
              id: match.id,
              title: match.data.title,
              content: match.data.content,
              category: match.data.category,
              tags: match.data.tags,
              timestamp: match.data.timestamp
            }));
            
            logger.info(`Retrieved ${notes.length} notes from Pinecone`);
            return notes;
          } catch (error) {
            logger.error('Error retrieving all notes from Pinecone', error);
            return [];
          }
        }
      };
      
      logger.info('Memory system initialized');
    } catch (error) {
      logger.error('Failed to initialize memory system', error);
      throw error;
    }
  }
  
  /**
   * Create Twitter connector
   */
  private createTwitterConnector(): TwitterDirectConnector {
    // Extract Twitter-specific configuration from environment
    const monitorKeywords = process.env.MONITOR_KEYWORDS?.split(',') || [
      'crypto', 
      'bitcoin', 
      'ethereum', 
      'AI', 
      'solana',
      'machine learning'
    ];
    
    const monitorUsers = process.env.MONITOR_USERS?.split(',') || [];
    
    // Create Twitter connector with direct integration
    return new TwitterDirectConnector({
      // Authentication
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL,
      
      // Twitter API credentials (optional, enables additional features)
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET_KEY,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      
      // Monitoring configuration
      monitorKeywords,
      monitorUsers,
      monitorMentions: process.env.MONITOR_MENTIONS === 'true',
      monitorReplies: process.env.MONITOR_REPLIES === 'true',
      autoReply: process.env.AUTO_REPLY === 'true',
      
      // Session persistence
      persistCookies: process.env.PERSIST_COOKIES === 'true',
      cookiesPath: path.join(COOKIES_DIR, 'twitter-cookies.json'),
      
      // Polling and retry settings
      pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
      maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : 3,
      retryDelay: process.env.RETRY_DELAY ? parseInt(process.env.RETRY_DELAY) : 2000,
      
      // Debug mode
      debug: process.env.DEBUG_TWITTER === 'true'
    });
  }
  
  /**
   * Set up Twitter event handlers
   */
  private setupTwitterEventHandlers(): void {
    logger.info('Setting up Twitter event handlers');
    
    // Handle tweets matching monitored keywords
    this.twitterConnector.on('keyword_match', async (tweet) => {
      logger.info(`Keyword match in tweet from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
      
      // Skip if this is our own tweet (prevent reacting to our own posts)
      const myUsername = process.env.TWITTER_USERNAME;
      if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) {
        logger.info('Skipping keyword match from ourselves');
        return;
      }
      
      try {
        // Process the keyword match
        await this.processCryptoKeywordMatch(tweet);
      } catch (error) {
        logger.error('Error processing keyword match', error);
      }
    });
    
    // Handle mentions
    this.twitterConnector.on('mention', async (tweet) => {
      logger.info(`Mentioned in tweet from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
      
      // Skip if this is our own tweet (additional protection against self-replies)
      const myUsername = process.env.TWITTER_USERNAME;
      if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) {
        logger.info('Skipping mention event from ourselves to avoid self-reply loop');
        return;
      }
      
      if (!this.twitterConnector.config.autoReply && tweet.id) {
        try {
          await this.handleMention(tweet);
        } catch (error) {
          logger.error('Error handling mention', error);
        }
      }
    });
    
    // Handle replies to our tweets
    this.twitterConnector.on('reply', async (tweet) => {
      logger.info(`Received reply from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
      
      // Skip if this is our own tweet (additional protection against self-replies)
      const myUsername = process.env.TWITTER_USERNAME;
      if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) {
        logger.info('Skipping reply event from ourselves to avoid self-reply loop');
        return;
      }
      
      if (!this.twitterConnector.config.autoReply && tweet.id) {
        try {
          await this.handleReply(tweet);
        } catch (error) {
          logger.error('Error handling reply', error);
        }
      }
    });
  }
  
  /**
   * Process a tweet that matches crypto keywords
   */
  private async processCryptoKeywordMatch(tweet: any): Promise<void> {
    try {
      // Check if this tweet mentions specific crypto tokens
      const tokenSymbols = this.extractTokenSymbols(tweet.text);
      
      if (tokenSymbols.length > 0) {
        logger.info(`Found token symbols in tweet: ${tokenSymbols.join(', ')}`);
        
        // Store this mention for context
        await this.memory.addNote({
          title: `Tweet about ${tokenSymbols.join(', ')}`,
          content: `@${tweet.author.username}: ${tweet.text}`,
          category: 'twitter_mention',
          tags: ['twitter', 'mention', ...tokenSymbols],
          timestamp: Date.now()
        });
        
        // Decide if we should engage with this tweet
        const analysisResult = await this.baseAgent.run({
          task: `A tweet mentioned these tokens: ${tokenSymbols.join(', ')}
          
Tweet from @${tweet.author.username}: "${tweet.text}"

Should we engage with this tweet? Consider:
1. Is this relevant to our focus on AI-related crypto tokens?
2. Does this contain quality information?
3. Would responding provide value?
4. Is this a good opportunity to showcase our expertise?

If we should engage, include one of these in your response:
- "Reply: [your suggested reply]" to reply to the tweet
- "Like" to like the tweet
- "Retweet" to retweet the tweet
- "Quote: [your quote tweet text]" to quote tweet

If we should not engage, explain why briefly.`
        });
        
        // Process the response to take action
        await this.processEngagementDecision(analysisResult.response, tweet);
      }
    } catch (error) {
      logger.error('Error processing crypto keyword match', error);
    }
  }
  
  /**
   * Handle a mention of our account
   */
  private async handleMention(tweet: any): Promise<void> {
    try {
      // Check if we've hit our hourly interaction limit
      if (!this.canInteract()) {
        logger.info('Skipping mention due to hourly interaction limit');
        return;
      }
      
      // Skip if this is from ourselves - prevent self-reply loops
      const myUsername = process.env.TWITTER_USERNAME;
      if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) {
        logger.info('Skipping mention from ourselves to avoid self-reply loop');
        return;
      }
      
      // Extract any token symbols from the mention
      const tokenSymbols = this.extractTokenSymbols(tweet.text);
      const tags = ['twitter', 'mention'];
      if (tokenSymbols.length > 0) {
        tags.push(...tokenSymbols);
      }
      
      // Store the mention for context
      await this.memory.addNote({
        title: `Mention from @${tweet.author.username}`,
        content: tweet.text,
        category: 'twitter_mention',
        tags,
        timestamp: Date.now()
      });
      
      // Check if this is a question about a specific token
      const isQuestion = tweet.text.includes('?');
      
      // Customize the response based on the content
      if (isQuestion && tokenSymbols.length > 0) {
        // Get our analysis of the token if we have it
        const relevantNotes = await this.memory.searchNotes({
          query: `${tokenSymbols[0]} analysis`,
          category: 'analysis',
          limit: 1
        });
        
        let contextInfo = '';
        if (relevantNotes.length > 0) {
          contextInfo = `\n\nHere's our recent analysis of ${tokenSymbols[0]}:\n${relevantNotes[0].content.substring(0, 500)}...`;
        }
        
        const result = await this.baseAgent.run({
          task: `You were mentioned in this tweet from @${tweet.author.username}: "${tweet.text}"
          
It appears to be a question about ${tokenSymbols.join(', ')}.${contextInfo}

Craft a helpful, expert response. Keep it under 280 characters. Focus on providing specific, valuable insights rather than generic advice.`
        });
        
        // Trim if needed
        let response = result.response;
        if (response.length > 280) {
          response = response.substring(0, 277) + '...';
        }
        
        // Like the tweet as a courtesy before replying
        await this.twitterConnector.like(tweet.id);
        
        // Reply to the tweet
        await this.twitterConnector.tweet(response, { replyTo: tweet.id });
        logger.info('Liked and replied to mention about tokens');
      } else {
        // Generic mention
        const result = await this.baseAgent.run({
          task: `You were mentioned in this tweet from @${tweet.author.username}: "${tweet.text}"
          
Craft a friendly, professional response that reflects your expertise in crypto markets and AI tokens. Keep it under 280 characters.`
        });
        
        // Trim if needed
        let response = result.response;
        if (response.length > 280) {
          response = response.substring(0, 277) + '...';
        }
        
        // Like the tweet as a courtesy before replying
        await this.twitterConnector.like(tweet.id);
        
        // Reply to the tweet
        await this.twitterConnector.tweet(response, { replyTo: tweet.id });
        logger.info('Liked and replied to general mention');
        
        // Track this interaction against our hourly limit (with await to ensure delay)
        await this.trackInteraction();
      }
    } catch (error) {
      logger.error('Error handling mention', error);
    }
  }
  
  /**
   * Handle a reply to one of our tweets
   */
  private async handleReply(tweet: any): Promise<void> {
    try {
      // Check if we've hit our hourly interaction limit
      if (!this.canInteract()) {
        logger.info('Skipping reply due to hourly interaction limit');
        return;
      }
      
      // Skip if this is from ourselves - prevent self-reply loops
      const myUsername = process.env.TWITTER_USERNAME;
      if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) {
        logger.info('Skipping reply from ourselves to avoid self-reply loop');
        return;
      }
      
      // Store the reply for context
      await this.memory.addNote({
        title: `Reply from @${tweet.author.username}`,
        content: tweet.text,
        category: 'twitter_reply',
        tags: ['twitter', 'reply'],
        timestamp: Date.now()
      });
      
      // Try to get the original tweet this is replying to
      let originalTweetText = '';
      if (tweet.inReplyToId) {
        try {
          const originalTweet = await this.twitterConnector.getTweet(tweet.inReplyToId);
          originalTweetText = originalTweet.text || '';
          
          // Also verify the original tweet is ours to prevent 
          // responding to conversations we're not directly part of
          if (originalTweet.author?.username?.toLowerCase() !== myUsername?.toLowerCase()) {
            logger.info('Skipping reply to a tweet that is not ours');
            return;
          }
        } catch (error) {
          logger.debug('Could not retrieve original tweet', error);
        }
      }
      
      // Generate a response
      const result = await this.baseAgent.run({
        task: `@${tweet.author.username} replied to your tweet: "${tweet.text}"
        
${originalTweetText ? `Your original tweet was: "${originalTweetText}"` : ''}

Create a thoughtful response that continues the conversation and demonstrates your expertise in crypto markets and AI tokens. Keep it under 280 characters.`
      });
      
      // Trim if needed
      let response = result.response;
      if (response.length > 280) {
        response = response.substring(0, 277) + '...';
      }
      
      // Like the tweet as a courtesy before replying
      await this.twitterConnector.like(tweet.id);
      
      // Reply to the tweet
      await this.twitterConnector.tweet(response, { replyTo: tweet.id });
      logger.info('Liked and replied to reply');
      
      // Track this interaction against our hourly limit
      this.trackInteraction();
    } catch (error) {
      logger.error('Error handling reply', error);
    }
  }
  
  /**
   * Process the agent's decision on how to engage with a tweet
   */
  private async processEngagementDecision(decision: string, tweet: any): Promise<void> {
    if (decision.toLowerCase().includes('reply:')) {
      const replyParts = decision.split('reply:');
      if (replyParts.length > 1 && replyParts[1]) {
        const replyText = replyParts[1].trim();
        
        // Like the tweet as a courtesy before replying
        await this.twitterConnector.like(tweet.id);
        
        // Reply to the tweet
        await this.twitterConnector.tweet(replyText, { replyTo: tweet.id });
        logger.info('Liked and replied to tweet about crypto');
        
        // Track this interaction against our hourly limit
        this.trackInteraction();
      }
    }
    
    if (decision.toLowerCase().includes('like')) {
      if (tweet.id) {
        await this.twitterConnector.like(tweet.id);
        logger.info('Liked tweet about crypto');
      }
    }
    
    if (decision.toLowerCase().includes('retweet')) {
      if (tweet.id) {
        await this.twitterConnector.retweet(tweet.id);
        logger.info('Retweeted tweet about crypto');
      }
    }
    
    if (decision.toLowerCase().includes('quote:')) {
      const quoteParts = decision.split('quote:');
      if (quoteParts.length > 1 && quoteParts[1] && tweet.id) {
        const quoteText = quoteParts[1].trim();
        await this.twitterConnector.quoteTweet(tweet.id, quoteText);
        logger.info('Quote tweeted crypto content');
        
        // Track this interaction against our hourly limit (with await to ensure delay)
        await this.trackInteraction();
      }
    }
  }
  
  /**
   * Create autonomous agent
   */
  private createAutonomousAgent(): AutonomousAgent {
    logger.info(`Creating autonomous agent with Wexley persona using OpenAI...`);
    
    // Create standard configuration
    return new AutonomousAgent({
      baseAgent: this.baseAgent,
      healthCheckIntervalMinutes: 15,
      maxConsecutiveErrors: 5,
      stateStoragePath: AGENT_STATE_DIR,
      enableAutoRecovery: true,
      enableContinuousMode: true
    });
  }
  
  /**
   * Start the autonomous agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('Agent is already running');
      return;
    }
    
    logger.info('Starting autonomous crypto agent with Twitter integration...');
    
    try {
      // Start the autonomous agent
      this.autonomousAgent.start();
      
      // First complete research and post a startup tweet BEFORE handling any replies
      logger.info('Initializing comprehensive startup routine...');
      try {
        // Execute research tasks in parallel for efficiency and a more complete market view
        const startupResearchTasks = [];
        
        // 1. Start trend research to populate our knowledge base
        startupResearchTasks.push(
          this.executeResearchTask({
            description: "Research trending crypto tokens for insights",
            type: "research"
          })
          .then(() => logger.info('Completed trending token research'))
          .catch(err => logger.error('Error researching trending tokens:', err))
        );
        
        // 2. Analyze the current state of major cryptocurrencies
        startupResearchTasks.push(
          this.executeMajorCryptoAnalysisTask({
            description: "Analyze major cryptocurrencies using CoinGecko data",
            type: "major_crypto_analysis"
          })
          .then(() => logger.info('Completed major crypto analysis'))
          .catch(err => logger.error('Error analyzing major cryptos:', err))
        );
        
        // 3. Explore topics and gather market sentiment
        startupResearchTasks.push(
          this.executeExploreTopicsTask({
            description: "Explore trending crypto topics for market sentiment",
            type: "explore_topics"
          })
          .then(() => logger.info('Completed topic exploration'))
          .catch(err => logger.error('Error exploring topics:', err))
        );
        
        // Wait for all background data tasks to complete
        await Promise.all(startupResearchTasks);
        logger.info('Background market data collection completed');
        
        // First set up rate limiting to prevent posting too rapidly
        logger.info('Setting up rate limiting and interaction control...');
        this.setupInteractionLimiting();
        
        // Initialize with some "tweets" to prevent rapid posting at startup
        // This forces the agent to respect rate limits from the start
        logger.info('Pre-filling rate limit slots to prevent rapid tweeting at startup');
        this.trackTweet(); // Add a "fake" tweet to start
        this.trackTweet(); // Add a second "fake" tweet to enforce stricter limits
        
        // Add initial 5-second delay to ensure rate limiting is active
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Add a startup delay to ensure we don't post too quickly
        const initialStartupDelay = 300000 + (Math.random() * 120000); // 5-7 minutes
        logger.info(`Adding initial research cooldown of ${Math.round(initialStartupDelay/1000)} seconds`);
        await new Promise(resolve => setTimeout(resolve, initialStartupDelay));
        
        // First check if we're allowed to tweet before trying to generate forecast
        if (this.canTweet()) {
          // Now generate our main forecast with the comprehensive market data
          logger.info('Generating comprehensive market forecast based on collected data...');
          await this.generateMajorCryptoForecast(true); // true = startup mode with special handling
          
          // Add a mandatory cool-down period to prevent rapid-fire tweets
          const forecastCooldown = 300000 + (Math.random() * 120000); // 5-7 minutes
          logger.info(`Adding post-forecast cooldown period of ${Math.round(forecastCooldown/1000)} seconds`);
          await new Promise(resolve => setTimeout(resolve, forecastCooldown));
        } else {
          logger.info('Rate limit would be exceeded - skipping initial forecast and entering research mode');
        }
        
        // Wait until we're confident rate limiting has fully initialized
        const timelineDelay = 30000 + (Math.random() * 30000); // 30-60 seconds
        logger.info(`Short delay before browsing timeline: ${Math.round(timelineDelay/1000)} seconds`);
        await new Promise(resolve => setTimeout(resolve, timelineDelay));
        
        // Check rate limits one last time
        if (!this.canTweet()) {
          logger.info(`Rate limit slots filled as expected - proceeding in research-only mode`);
        }
        
        // Now we browse the timeline WITHOUT posting
        logger.info('Starting silent timeline browsing to research community trends...');
        await this.executeBrowseTimelineTask({
          description: "Browse Twitter timeline for relevant content - research only", 
          type: "browse_timeline_research_only"
        });
        
      } catch (startupError) {
        logger.error('Error during enhanced startup routine', startupError);
        
        // Fallback to generic tweet
        await this.postGenericStartupTweet();
        
        // Still set up interaction limiting even if startup failed
        this.setupInteractionLimiting();
      }
      
      // Now execute the full plan
      await this.createAndExecutePlan();
      
      // Mark as running
      this.isRunning = true;
      
      logger.info('Autonomous agent started successfully');
      
      // Set up periodic planning with randomization to prevent exact timing patterns
      const planningIntervalBaseMs = this.settings.tweetFrequencyHours * 60 * 60 * 1000;
      
      // Schedule next run with random jitter
      const scheduleNextPlan = () => {
        // Add random jitter of ±15% to avoid exact timing patterns
        const jitterFactor = 0.85 + (Math.random() * 0.3); // 0.85 to 1.15
        const nextRunTimeMs = planningIntervalBaseMs * jitterFactor;
        
        logger.info(`Scheduling next plan execution in ${(nextRunTimeMs/3600000).toFixed(2)} hours`);
        
        setTimeout(async () => {
          if (this.isRunning) {
            logger.info(`Running scheduled plan`);
            
            // Check if we can tweet before executing the plan
            if (this.canTweet()) {
              await this.createAndExecutePlan();
            } else {
              logger.info(`Delaying plan execution due to tweet rate limiting`);
              // Try again in 15 minutes
              setTimeout(async () => {
                if (this.isRunning && this.canTweet()) {
                  await this.createAndExecutePlan();
                }
              }, 15 * 60 * 1000);
            }
            
            // Schedule the next run after this one completes
            scheduleNextPlan();
          }
        }, nextRunTimeMs);
      };
      
      // Start the scheduling cycle
      scheduleNextPlan();
      
      // Set up daily follow-up on forecasts
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      setInterval(async () => {
        if (this.isRunning) {
          try {
            logger.info('Running scheduled forecast follow-up...');
            await this.followUpOnMajorCryptoForecasts();
          } catch (error) {
            logger.error('Error in scheduled forecast follow-up', error);
          }
        }
      }, twelveHoursMs);
      
      // Check for opportunities to generate new forecasts every 6 hours
      const sixHoursMs = 6 * 60 * 60 * 1000;
      setInterval(async () => {
        if (this.isRunning) {
          try {
            logger.info('Checking if new forecast is needed...');
            // Check if we've made a forecast in the last 24 hours
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recentForecasts = await this.memory.searchNotes({
              query: "forecast major crypto",
              category: "forecast",
              limit: 1
            });
            
            // If no recent forecasts, generate a new one
            if (recentForecasts.length === 0 || recentForecasts[0].timestamp < oneDayAgo) {
              logger.info('No recent forecasts found, generating a new one...');
              await this.generateMajorCryptoForecast(false);
            } else {
              logger.info('Recent forecast found, skipping new generation');
            }
          } catch (error) {
            logger.error('Error in forecast check', error);
          }
        }
      }, sixHoursMs);
      
      // Research AI crypto projects periodically
      const aiProjectResearchMs = this.settings.aiProjectResearchFrequencyHours * 60 * 60 * 1000;
      setInterval(async () => {
        if (this.isRunning) {
          try {
            logger.info('Scheduled AI crypto project research starting...');
            await this.researchAICryptoProjects();
          } catch (error) {
            logger.error('Error in AI crypto project research', error);
          }
        }
      }, aiProjectResearchMs);
      
      // Perform specialized tool-based research periodically
      const specializedResearchMs = this.settings.specializedResearchFrequencyHours * 60 * 60 * 1000;
      setInterval(async () => {
        if (this.isRunning) {
          try {
            logger.info('Scheduled specialized tool-based research starting...');
            await this.performSpecializedToolResearch();
          } catch (error) {
            logger.error('Error in specialized tool research', error);
          }
        }
      }, specializedResearchMs);
      
    } catch (error) {
      logger.error('Error in agent startup', error);
      throw error;
    }
  }
  
  /**
   * Post a generic startup tweet as fallback
   */
  private async postGenericStartupTweet(): Promise<void> {
    try {
      logger.info('Preparing for startup - NOT posting generic startup tweet');
      
      // Instead of posting, just log that we're going into research mode
      logger.info('Agent is starting in silent research mode - gathering data before making any posts');
      
      // Pre-fill rate limit slots to prevent rapid posting
      logger.info('Pre-filling rate limit slots to prevent rapid tweeting in fallback path');
      this.trackTweet(); // First "tweet"
      this.trackTweet(); // Second "tweet" 
      this.trackTweet(); // Third "tweet" to max out the rate limit
      
      // Set up interaction limiting to be safe
      this.setupInteractionLimiting();
      
      // Add an extra delay at startup to ensure proper pacing
      const startupDelay = 300000 + (Math.random() * 120000); // 5-7 minutes
      logger.info(`Adding initial startup delay of ${Math.round(startupDelay/1000)} seconds`);
      await new Promise(resolve => setTimeout(resolve, startupDelay));
      
    } catch (error) {
      logger.error('Error during startup sequence', error);
    }
  }
  
  /**
   * Research AI crypto projects and upcoming launches
   * Uses search tool and CoinGecko to find promising AI crypto projects
   */
  private async researchAICryptoProjects(): Promise<void> {
    logger.info('Researching AI crypto projects and upcoming launches...');
    
    try {
      // Update timestamp to track last research
      this.lastAIProjectResearch = Date.now();
      
      // Use Tavily search for trending AI crypto topics
      const searchQueries = [
        "new AI crypto projects launching soon",
        "upcoming AI blockchain projects 2025",
        "artificial intelligence crypto tokens latest",
        "AI + blockchain integration new projects",
        "crypto AI infrastructure tokens"
      ];
      
      // Pick 2 random queries for diversity
      const selectedQueries = searchQueries
        .sort(() => 0.5 - Math.random())
        .slice(0, 2);
      
      // Create a set for discovered AI projects
      const discoveredProjects: {name: string; symbol: string; description: string; source: string}[] = [];
      
      // Search for each query to gather diverse results
      for (const query of selectedQueries) {
        logger.info(`Searching for AI crypto projects with query: ${query}`);
        
        // Use the search tool to find information
        const searchResults = await this.searchTool.execute({
          query,
          maxResults: 7,
          includeAnswer: true
        });
        
        logger.info(`Found ${searchResults.results?.length || 0} search results for AI crypto search`);
        
        // Extract project information using our agent
        if (searchResults.results && searchResults.results.length > 0) {
          const projectAnalysis = await this.baseAgent.run({
            task: `Analyze the following search results about AI crypto projects:
            
${JSON.stringify(searchResults, null, 2)}

Extract information about specific AI crypto projects mentioned. For each project, provide:
1. Project Name
2. Token Symbol (if available)
3. Brief description of what it does
4. URL source of this information

Format as a JSON array of objects with keys: name, symbol, description, source.
Only include projects that are genuinely AI + blockchain related. Skip any projects that are obviously not legitimate or are just mentioned in passing.
`
          });
          
          try {
            // Extract JSON from the response
            const projectsMatch = projectAnalysis.response.match(/```json\n([\s\S]*?)\n```/) || 
                                 projectAnalysis.response.match(/\[([\s\S]*?)\]/);
            
            if (projectsMatch) {
              const projectsJson = projectsMatch[0];
              const projects = JSON.parse(projectsJson);
              
              if (Array.isArray(projects)) {
                // Add discovered projects to our list, avoiding duplicates
                for (const project of projects) {
                  if (project.name && !discoveredProjects.some(p => 
                    p.name.toLowerCase() === project.name.toLowerCase() || 
                    (p.symbol && project.symbol && p.symbol.toUpperCase() === project.symbol.toUpperCase())
                  )) {
                    discoveredProjects.push(project);
                  }
                }
              }
            }
          } catch (parseError) {
            logger.error(`Error parsing AI projects from analysis`, parseError);
          }
        }
        
        // Add a delay between searches
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
      }
      
      logger.info(`Discovered ${discoveredProjects.length} potential AI crypto projects`);
      
      // Store projects in memory
      if (discoveredProjects.length > 0) {
        // Get existing AI projects from memory
        const existingProjectsNote = await this.memory.searchNotes({
          query: "AI crypto projects master list",
          category: "ai_crypto_projects",
          limit: 1
        });
        
        // Parse existing projects or create new list
        let aiProjects: {name: string; symbol: string; description: string; source: string; discovered: number}[] = [];
        if (existingProjectsNote.length > 0) {
          try {
            aiProjects = JSON.parse(existingProjectsNote[0].content);
            if (!Array.isArray(aiProjects)) {
              aiProjects = [];
            }
          } catch (parseError) {
            logger.error(`Error parsing AI projects list`, parseError);
            aiProjects = [];
          }
        }
        
        // Add new projects to the list, avoiding duplicates
        for (const project of discoveredProjects) {
          if (!aiProjects.some(p => 
            p.name.toLowerCase() === project.name.toLowerCase() || 
            (p.symbol && project.symbol && p.symbol.toUpperCase() === project.symbol.toUpperCase())
          )) {
            aiProjects.push({
              ...project,
              discovered: Date.now()
            });
          }
        }
        
        // Save updated list
        await this.memory.addNote({
          title: `AI Crypto Projects Master List`,
          content: JSON.stringify(aiProjects, null, 2),
          category: 'ai_crypto_projects',
          tags: ['ai', 'crypto', 'projects', 'master_list', 'research'],
          timestamp: Date.now()
        });
        
        logger.info(`Updated AI crypto projects master list with ${discoveredProjects.length} new projects`);
        
        // If we can tweet and have discovered new interesting projects, share insights
        if (this.canTweet() && discoveredProjects.length >= 2) {
          // Generate a tweet about the AI crypto landscape
          const tweetText = await this.baseAgent.run({
            task: `You've discovered these AI crypto projects:
            
${JSON.stringify(discoveredProjects, null, 2)}

Create an insightful tweet (under 240 chars) about the AI crypto landscape based on these discoveries.
Focus on trends, patterns, or interesting insights about how AI is being integrated with blockchain.
Do NOT mention specific project names or symbols.
Use a knowledgeable, analytical tone that positions you as following the cutting edge of crypto/AI integration.
Highlight what's novel or promising about this intersection.

The tweet should NOT start with phrases like "I've discovered" or "I've been researching." 
Instead, dive directly into the insights with professional, punchy analysis.
`
          });
          
          try {
            // Post the tweet
            await this.twitterConnector.tweet(tweetText.response.trim());
            this.trackTweet();
            logger.info(`Posted tweet about AI crypto landscape discoveries`);
          } catch (tweetError) {
            logger.error(`Error posting AI crypto landscape tweet`, tweetError);
          }
        }
      }
    } catch (error) {
      logger.error('Error researching AI crypto projects', error);
    }
  }
  
  /**
   * Perform specialized tool-based research using CoinGecko and other tools
   * Gathers deep insights on market trends using multiple data sources
   */
  private async performSpecializedToolResearch(): Promise<void> {
    logger.info('Performing specialized tool-based research...');
    
    try {
      // Update timestamp to track last specialized research
      this.lastSpecializedResearch = Date.now();
      
      // Get major crypto data using CoinGecko
      const majorCryptos = ["bitcoin", "ethereum", "ripple", "solana", "cardano"];
      const cryptoData = [];
      
      // Fetch data for major cryptocurrencies
      for (const crypto of majorCryptos) {
        try {
          const cryptoResult = await this.coinGeckoTool.execute({
            tokenId: crypto
          });
          
          cryptoData.push(JSON.parse(cryptoResult));
          logger.info(`Retrieved data for ${crypto} from CoinGecko`);
          
          // Add a small delay between API calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error(`Error fetching data for ${crypto}`, error);
        }
      }
      
      logger.info(`Retrieved data for ${cryptoData.length} major cryptocurrencies from CoinGecko`);
      
      // Use Tavily search for specialized market analysis
      const marketAnalysisSearch = await this.searchTool.execute({
        query: "crypto market institutional adoption latest trends analysis",
        maxResults: 5,
        includeAnswer: true
      });
      
      logger.info(`Retrieved specialized market analysis from search`);
      
      // Combine all data for agent analysis
      const combinedData = {
        cryptoData,
        marketAnalysis: marketAnalysisSearch
      };
      
      // Have our agent analyze the combined data
      const analysisResult = await this.baseAgent.run({
        task: `Analyze this combined crypto market data:
        
${JSON.stringify(combinedData, null, 2)}

Extract the most significant insights and patterns. Focus on:
1. Major market shifts or trends
2. Institutional adoption patterns
3. Correlations between different data points
4. Emerging opportunities or risks
5. Projections based on the data

Provide your analysis in a structured format highlighting the most important findings.`
      });
      
      // Store the comprehensive analysis in memory
      await this.memory.addNote({
        title: `Comprehensive Market Analysis - ${new Date().toISOString().split('T')[0]}`,
        content: analysisResult.response,
        category: 'market_analysis',
        tags: ['comprehensive', 'research', 'tools', 'market', 'analysis', 'specialized'],
        timestamp: Date.now()
      });
      
      logger.info(`Stored comprehensive market analysis in memory`);
      
      // If we can tweet and have good insights, share a high-quality analysis
      if (this.canTweet()) {
        // Generate a tweet based on the analysis
        const tweetResult = await this.baseAgent.run({
          task: `Based on this comprehensive market analysis:
          
${analysisResult.response}

Create an insightful tweet (under 240 chars) that shares ONE specific, valuable insight about the current crypto market.
Focus on data-driven observations that would be valuable to traders and investors.
Use a professional, analytical tone that demonstrates deep market understanding.
DO NOT use phrases like "Analysis shows" or "Research indicates" - dive straight into the key insight.
Make it concise, specific, and actionable.`
        });
        
        try {
          // Post the tweet
          await this.twitterConnector.tweet(tweetResult.response.trim());
          this.trackTweet();
          logger.info(`Posted specialized market analysis tweet`);
        } catch (tweetError) {
          logger.error(`Error posting specialized market analysis tweet`, tweetError);
        }
      }
    } catch (error) {
      logger.error('Error performing specialized tool-based research', error);
    }
  }
  
  /**
   * Stop the autonomous agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Agent is not running');
      return;
    }
    
    logger.info('Stopping autonomous crypto agent...');
    
    try {
      // Stop the autonomous agent
      this.autonomousAgent.stop();
      
      // Disconnect from Twitter
      await this.twitterConnector.disconnect();
      
      // Mark as not running
      this.isRunning = false;
      
      logger.info('Autonomous agent stopped successfully');
    } catch (error) {
      logger.error('Failed to stop agent', error);
      throw error;
    }
  }
  
  /**
   * Create and execute a plan based on goals
   */
  private async createAndExecutePlan(): Promise<void> {
    try {
      logger.info('Creating execution plan...');
      
      // Create a more diverse plan with broader topic coverage
      const plan = {
        id: `plan_${Date.now()}`,
        originalTask: "Research crypto and blockchain technologies and share insights via Twitter",
        tasks: [
          {
            id: `task_${Date.now()}_1`,
            description: "Research trending crypto tokens and blockchain technologies",
            dependencies: [],
            status: "pending", 
            type: "research"
          },
          {
            id: `task_${Date.now()}_2`,
            description: "Analyze large-cap tokens for significant price moves and key metrics",
            dependencies: [],
            status: "pending",
            type: "largecap_analysis"
          },
          {
            id: `task_${Date.now()}_3`,
            description: "Analyze the most promising tokens and industry trends",
            dependencies: [`task_${Date.now()}_1`],
            status: "pending",
            type: "analyze"
          },
          {
            id: `task_${Date.now()}_4`,
            description: "Generate and post tweets with token insights",
            dependencies: [`task_${Date.now()}_3`],
            status: "pending",
            type: "tweet"
          },
          {
            id: `task_${Date.now()}_5`,
            description: "Share large-cap token predictions and analysis",
            dependencies: [`task_${Date.now()}_2`],
            status: "pending",
            type: "largecap_tweet"
          },
          {
            id: `task_${Date.now()}_6`,
            description: "Share broader thoughts on blockchain technology trends",
            dependencies: [`task_${Date.now()}_3`],
            status: "pending",
            type: "industry_tweet"
          },
          {
            id: `task_${Date.now()}_7`,
            description: "Monitor and engage with community by following up on previous tweets",
            dependencies: [],
            status: "pending",
            type: "follow_up" 
          },
          {
            id: `task_${Date.now()}_8`,
            description: "Browse Twitter timeline and discover relevant content to engage with",
            dependencies: [],
            status: "pending",
            type: "browse_timeline"
          },
          {
            id: `task_${Date.now()}_9`,
            description: "Search and explore trending crypto topics to join conversations",
            dependencies: [],
            status: "pending",
            type: "explore_topics"
          },
          {
            id: `task_${Date.now()}_10`,
            description: "Analyze major cryptocurrencies using CoinGecko data and provide market outlook",
            dependencies: [],
            status: "pending",
            type: "major_crypto_analysis"
          },
          {
            id: `task_${Date.now()}_11`,
            description: "Post insights and predictions about major cryptocurrencies from CoinGecko analysis",
            dependencies: [`task_${Date.now()}_10`],
            status: "pending",
            type: "major_crypto_tweet"
          },
          {
            id: `task_${Date.now()}_12`,
            description: "Generate weekly price prediction for Ethereum or Solana",
            dependencies: [],
            status: "pending",
            type: "major_crypto_tweet"
          }
        ],
        created: Date.now(),
        updated: Date.now(),
        status: "in_progress",
        progress: 0
      };
      
      logger.info(`Created plan with ${plan.tasks.length} tasks`);
      
      // Save the current tasks
      this.currentTasks = plan.tasks;
      
      // Execute the plan
      await this.executePlan(plan);
      
      logger.info('Plan execution completed');
    } catch (error) {
      logger.error('Error in plan creation or execution', error);
      throw error;
    }
  }
  
  /**
   * Execute a plan
   * 
   * @param plan - The plan to execute
   */
  private async executePlan(plan: any): Promise<void> {
    logger.info(`Executing plan with ${plan.tasks.length} tasks`);
    
    for (const task of plan.tasks) {
      try {
        logger.info(`Executing task: ${task.description}`);
        
        // Handle different task types
        await this.executeTask(task);
        
        logger.info(`Completed task: ${task.description}`);
      } catch (taskError) {
        logger.error(`Error executing task: ${task.description}`, taskError);
        // Continue with next task despite error
      }
    }
  }
  
  /**
   * Execute a specific task
   * 
   * @param task - The task to execute
   */
  private async executeTask(task: any): Promise<void> {
    // Extract task type and parameters
    const taskType = task.type || this.inferTaskType(task.description);
    
    switch (taskType) {
      case 'research':
        await this.executeResearchTask(task);
        break;
        
      case 'analyze':
        await this.executeAnalysisTask(task);
        break;
        
      case 'tweet':
        await this.executeTweetTask(task);
        break;
        
      case 'industry_tweet':
        await this.executeIndustryTweetTask(task);
        break;
        
      case 'largecap_analysis':
        await this.executeLargeCapAnalysisTask(task);
        break;
        
      case 'largecap_tweet':
        await this.executeLargeCapTweetTask(task);
        break;
        
      case 'major_crypto_analysis':
        await this.executeMajorCryptoAnalysisTask(task);
        break;
        
      case 'major_crypto_tweet':
        await this.executeMajorCryptoTweetTask(task);
        break;
        
      case 'follow_up':
        await this.executeFollowUpTask(task);
        break;
        
      case 'browse_timeline':
        await this.executeBrowseTimelineTask(task);
        break;
        
      case 'explore_topics':
        await this.executeExploreTopicsTask(task);
        break;
        
      default:
        // For unspecified tasks, use the agent to interpret and execute
        await this.executeGenericTask(task);
    }
  }
  
  /**
   * Infer the task type from its description
   * 
   * @param description - Task description
   * @returns Inferred task type
   */
  private inferTaskType(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('research') || lowerDesc.includes('find') || lowerDesc.includes('search')) {
      return 'research';
    } else if (lowerDesc.includes('large-cap') || lowerDesc.includes('largecap') || lowerDesc.includes('major tokens')) {
      if (lowerDesc.includes('tweet') || lowerDesc.includes('post') || lowerDesc.includes('share')) {
        return 'largecap_tweet';
      } else {
        return 'largecap_analysis';
      }
    } else if (lowerDesc.includes('coingecko') && lowerDesc.includes('analysis')) {
      return 'major_crypto_analysis';
    } else if (lowerDesc.includes('coingecko') && (lowerDesc.includes('tweet') || lowerDesc.includes('post') || lowerDesc.includes('share'))) {
      return 'major_crypto_tweet';
    } else if (lowerDesc.includes('major cryptocurrencies') && lowerDesc.includes('analysis')) {
      return 'major_crypto_analysis';
    } else if (lowerDesc.includes('major cryptocurrencies') && (lowerDesc.includes('tweet') || lowerDesc.includes('post') || lowerDesc.includes('insight'))) {
      return 'major_crypto_tweet';
    } else if (lowerDesc.includes('analyze') || lowerDesc.includes('analysis')) {
      return 'analyze';
    } else if (lowerDesc.includes('industry') || lowerDesc.includes('trends') || lowerDesc.includes('thoughts') || lowerDesc.includes('broader')) {
      return 'industry_tweet';
    } else if (lowerDesc.includes('tweet') || lowerDesc.includes('post') || lowerDesc.includes('share')) {
      return 'tweet';
    } else if (lowerDesc.includes('follow up') || lowerDesc.includes('track') || lowerDesc.includes('monitor') || lowerDesc.includes('engage')) {
      return 'follow_up';
    } else if (lowerDesc.includes('browse') && lowerDesc.includes('timeline')) {
      return 'browse_timeline';
    } else if (lowerDesc.includes('explore') || lowerDesc.includes('trending topics') || lowerDesc.includes('join conversations')) {
      return 'explore_topics';
    }
    
    return 'generic';
  }
  
  /**
   * Execute a research task
   * 
   * @param task - Research task
   */
  private async executeResearchTask(task: {description: string; type?: string}): Promise<void> {
    logger.info(`Executing research task: ${task.description}`);
    
    try {
      // Find promising tokens - reduce minPriceChange to get more options
      const trendingResult = await this.cryptoTool.getTrendingTokens({
        limit: 20, // Increase limit to get more options
        minPriceChange: 3, // Reduced from 5 for more variety
        focusAreas: this.settings.focusAreas // Using our updated more general focus areas
      });
      
      logger.info(`Found ${trendingResult.tokens.length} trending tokens`);
      
      // Create a set to track ALL tokens we've researched to avoid repetition
      // Significantly increased limit to prevent repeating tokens over time
      const recentResearch = await this.memory.searchNotes({
        query: "token research",
        category: "research",
        limit: 100 // Increased from 10 to 100 for better long-term memory
      });
      
      // Create a set from all researched tokens to avoid duplicates
      const recentTokens = new Set(
        recentResearch
          .map(note => {
            // Extract from title
            const titleMatch = note.title.match(/Research: ([A-Z0-9]+)/);
            const titleToken = titleMatch ? titleMatch[1] : null;
            
            // Also check tags for token symbols - provides redundancy
            const tagToken = note.tags.find(tag => 
              /^[A-Z0-9]{2,}$/.test(tag) && 
              !['crypto', 'token', 'research'].includes(tag)
            );
            
            return titleToken || tagToken || null;
          })
          .filter(Boolean)
      );
      
      // Explicitly add problematic tokens we want to avoid repeating 
      // (like ALCH that was frequently tweeted about)
      const blacklistTokens = ['ALCH', 'AI16Z'];
      blacklistTokens.forEach(token => recentTokens.add(token));
      
      logger.info(`Found ${recentTokens.size} previously researched tokens to avoid duplicating`);
      
      // Filter out recently researched tokens
      let eligibleTokens = trendingResult.tokens.filter(token => 
        !recentTokens.has(token.symbol)
      );
      
      // If we filtered out too many, keep some of the originals
      if (eligibleTokens.length < 3) {
        logger.info(`Not enough new tokens, selecting from all trending tokens`);
        eligibleTokens = trendingResult.tokens;
      }
      
      // Select a diverse set - take at most 1 AI-related token plus 2 others
      const aiTokens = eligibleTokens.filter(token => 
        token.name.toLowerCase().includes('ai') || 
        token.symbol.toLowerCase().includes('ai')
      ).slice(0, 1);
      
      const nonAiTokens = eligibleTokens.filter(token => 
        !(token.name.toLowerCase().includes('ai') || 
          token.symbol.toLowerCase().includes('ai'))
      );
      
      // Randomly select from non-AI tokens
      const randomNonAiTokens = nonAiTokens
        .sort(() => 0.5 - Math.random()) // Simple random shuffle
        .slice(0, 3 - aiTokens.length);
      
      // Combine and process tokens
      const tokensToResearch = [...aiTokens, ...randomNonAiTokens];
      logger.info(`Selected ${tokensToResearch.length} diverse tokens for research`);
      
      // For each selected token, gather basic information
      for (const token of tokensToResearch) {
        try {
          logger.info(`Researching token: ${token.name} (${token.symbol})`);
          
          // Use the Tavily search tool to gather information - generalize search query
          const searchQuery = `${token.name} ${token.symbol} crypto token project details use case`;
          
          const searchResults = await this.searchTool.execute({
            query: searchQuery,
            maxResults: 5,
            includeAnswer: true
          });
          
          logger.info(`Found ${searchResults.results?.length || 0} search results for ${token.symbol}`);
          
          // Create formatted sources information
          const sourcesList = Array.isArray(searchResults.results) 
            ? searchResults.results.slice(0, 3).map((result: {title?: string; url?: string}) => 
                `- ${result.title || 'Untitled'}: ${result.url || 'No URL'}`
              ).join('\n') 
            : 'No sources available';
          
          // Store the research in memory with improved metadata and tagging
          await this.memory.addNote({
            title: `Research: ${token.symbol}`,
            content: `
              Token: ${token.name} (${token.symbol})
              Price: $${token.price.toFixed(6)}
              24h Change: ${token.priceChange24h.toFixed(2)}%
              Researched on: ${new Date().toISOString()}
              
              Research Summary:
              ${searchResults.answer || 'No summary available'}
              
              Sources:
              ${sourcesList}
            `,
            category: 'research',
            // Enhanced tagging for better token tracking and memory recall
            tags: [
              'crypto', 
              'token', 
              token.symbol, // Primary token identifier 
              token.symbol.toLowerCase(), // Lowercase version for case-insensitive search
              'research',
              'trending', // Tag to identify tokens from trending research
              `price_${token.price < 1 ? 'micro' : token.price < 10 ? 'low' : token.price < 100 ? 'mid' : 'high'}`, // Price range tag
              `change_${token.priceChange24h > 10 ? 'bullish' : token.priceChange24h < -10 ? 'bearish' : 'neutral'}`, // Price action tag
              `researched_${new Date().toISOString().split('T')[0]}` // Date tag for timeline tracking
            ],
            timestamp: Date.now()
          });
          
          // Also save this to our trending tokens list for future reference
          try {
            // Get existing trending tokens list
            const trendingTokensNote = await this.memory.searchNotes({
              query: "trending tokens list",
              category: "trending_tokens",
              limit: 1
            });
            
            // Extract existing token list or create new one
            let trendingTokensList: string[] = [];
            if (trendingTokensNote.length > 0) {
              try {
                // Parse existing list 
                trendingTokensList = JSON.parse(trendingTokensNote[0].content);
                if (!Array.isArray(trendingTokensList)) {
                  trendingTokensList = []; // Reset if invalid format
                }
              } catch (parseError) {
                logger.error(`Error parsing trending tokens list`, parseError);
                trendingTokensList = [];
              }
            }
            
            // Add new token if not already in list
            if (!trendingTokensList.includes(token.symbol)) {
              trendingTokensList.push(token.symbol);
              
              // Save updated list
              await this.memory.addNote({
                title: `Trending Tokens Master List`,
                content: JSON.stringify(trendingTokensList),
                category: 'trending_tokens',
                tags: ['trending', 'tokens', 'master_list', 'system'],
                timestamp: Date.now()
              });
              
              logger.info(`Added ${token.symbol} to trending tokens master list`);
            }
          } catch (trendingListError) {
            logger.error(`Error updating trending tokens list for ${token.symbol}`, trendingListError);
          }
          
          logger.info(`Saved research for ${token.symbol} to memory`);
        } catch (tokenError) {
          logger.error(`Error researching token ${token.symbol}`, tokenError);
        }
      }
    } catch (error) {
      logger.error('Error executing research task', error);
      throw error;
    }
  }
  
  /**
   * Execute an analysis task
   * 
   * @param task - Analysis task
   */
  private async executeAnalysisTask(task: any): Promise<void> {
    logger.info(`Executing analysis task: ${task.description}`);
    
    try {
      // Find tokens to analyze
      const targetSymbol = this.extractTokenSymbol(task.description);
      
      if (targetSymbol) {
        // Analyze specific token
        await this.analyzeSpecificToken(targetSymbol);
      } else {
        // Get recent research from memory
        const recentResearch = await this.memory.searchNotes({
          query: "token research AI crypto",
          category: "research",
          limit: 3
        });
        
        // Analyze each token with recent research
        for (const research of recentResearch) {
          // Make sure to extract only valid token symbols from research titles
          const tokenMatch = research.title.match(/Research: ([A-Z0-9]+)/);
          if (tokenMatch && tokenMatch[1] && tokenMatch[1].length >= 2 && tokenMatch[1] !== 'for' && tokenMatch[1] !== 'top') {
            logger.info(`Found token symbol in research: ${tokenMatch[1]}`);
            await this.analyzeSpecificToken(tokenMatch[1]);
          }
        }
      }
    } catch (error) {
      logger.error('Error executing analysis task', error);
      throw error;
    }
  }
  
  /**
   * Analyze a specific token
   * 
   * @param symbol - Token symbol
   */
  private async analyzeSpecificToken(symbol: string): Promise<void> {
    logger.info(`Analyzing token: ${symbol}`);
    
    try {
      // Fetch existing research
      const tokenResearch = await this.memory.searchNotes({
        query: `${symbol} research`,
        limit: 1
      });
      
      if (tokenResearch.length === 0) {
        logger.warn(`No research found for ${symbol}, skipping analysis`);
        return;
      }
      
      // Generate prompt for analysis - make it more general and not just focused on AI
      const analysisPrompt = `
        As a crypto analyst with broad expertise in blockchain technologies, analyze this token:
        
        ${tokenResearch[0].content}
        
        Provide a comprehensive analysis focusing on:
        1. Use case and technology overview
        2. Market potential and adoption
        3. Technical fundamentals and tokenomics
        4. Development activity and team
        5. Short and medium-term outlook
        6. Unique selling proposition and competitive advantages
        
        Be objective and balanced in your assessment. Identify both strengths and weaknesses.
      `;
      
      // Generate analysis using the autonomous agent
      const analysisResult = await this.autonomousAgent.runOperation<{ response: string }>(analysisPrompt);
      
      // Store the analysis in memory with enhanced metadata and tracking
      // Determine token categories based on analysis content
      const isAiToken = symbol.toLowerCase().includes('ai') || 
                        analysisResult.response.toLowerCase().includes(' ai ') ||
                        analysisResult.response.toLowerCase().includes('artificial intelligence');
      
      const isDefiToken = analysisResult.response.toLowerCase().includes('defi') ||
                         analysisResult.response.toLowerCase().includes('decentralized finance') ||
                         analysisResult.response.toLowerCase().includes('yield') ||
                         analysisResult.response.toLowerCase().includes('liquidity pool');
      
      const isNftToken = analysisResult.response.toLowerCase().includes('nft') ||
                        analysisResult.response.toLowerCase().includes('non-fungible') ||
                        analysisResult.response.toLowerCase().includes('collectible');
      
      const isGameToken = analysisResult.response.toLowerCase().includes('game') ||
                         analysisResult.response.toLowerCase().includes('gaming') ||
                         analysisResult.response.toLowerCase().includes('metaverse') ||
                         analysisResult.response.toLowerCase().includes('play-to-earn');
      
      // Create enhanced tag list with semantic categories
      const tags = [
        'crypto', 
        'token', 
        symbol, // Primary token identifier
        symbol.toLowerCase(), // Lowercase for better search
        'analysis',
        `analyzed_${new Date().toISOString().split('T')[0]}` // Date tag for timeline
      ];
      
      // Add category tags based on content analysis
      if (isAiToken) tags.push('AI', 'ai_token', 'artificial_intelligence');
      if (isDefiToken) tags.push('defi', 'decentralized_finance');
      if (isNftToken) tags.push('nft', 'collectibles');
      if (isGameToken) tags.push('gaming', 'gamefi', 'metaverse');
      
      // Add sentiment tags based on language analysis
      if (analysisResult.response.toLowerCase().includes('bullish') || 
          analysisResult.response.toLowerCase().includes('promising') ||
          analysisResult.response.toLowerCase().includes('potential')) {
        tags.push('positive_outlook', 'bullish');
      } else if (analysisResult.response.toLowerCase().includes('bearish') || 
                analysisResult.response.toLowerCase().includes('concerns') ||
                analysisResult.response.toLowerCase().includes('caution')) {
        tags.push('negative_outlook', 'bearish');
      } else {
        tags.push('neutral_outlook');
      }
      
      // Record this analysis in our memory system with rich metadata
      await this.memory.addNote({
        title: `Analysis: ${symbol}`,
        content: `
          Token Analysis: ${symbol}
          Date: ${new Date().toISOString()}
          
          ${analysisResult.response}
          
          Categories: ${[
            isAiToken ? 'AI/ML' : '',
            isDefiToken ? 'DeFi' : '',
            isNftToken ? 'NFT' : '',
            isGameToken ? 'Gaming' : ''
          ].filter(Boolean).join(', ') || 'General Crypto'}
        `,
        category: 'analysis',
        tags,
        timestamp: Date.now()
      });
      
      // Also update our analyzed tokens master list for long-term tracking
      try {
        // Get existing analyzed tokens list
        const analyzedTokensNote = await this.memory.searchNotes({
          query: "analyzed tokens master list",
          category: "token_tracking",
          limit: 1
        });
        
        // Create or update the master token tracking data
        let tokenTrackingData: Record<string, any> = {};
        
        if (analyzedTokensNote.length > 0) {
          try {
            // Parse existing tracking data
            tokenTrackingData = JSON.parse(analyzedTokensNote[0].content);
          } catch (parseError) {
            logger.error(`Error parsing token tracking data`, parseError);
            tokenTrackingData = {};
          }
        }
        
        // Update or add entry for this token
        tokenTrackingData[symbol] = {
          lastAnalyzed: Date.now(),
          analysisDates: [...(tokenTrackingData[symbol]?.analysisDates || []), Date.now()],
          categories: {
            isAiToken,
            isDefiToken,
            isNftToken,
            isGameToken
          },
          analysisCount: (tokenTrackingData[symbol]?.analysisCount || 0) + 1
        };
        
        // Save the updated tracking data
        await this.memory.addNote({
          title: `Analyzed Tokens Master List`,
          content: JSON.stringify(tokenTrackingData),
          category: 'token_tracking',
          tags: ['analysis', 'tokens', 'master_list', 'system', 'tracking'],
          timestamp: Date.now()
        });
        
        logger.info(`Updated token tracking data for ${symbol}`);
      } catch (trackingError) {
        logger.error(`Error updating token tracking for ${symbol}`, trackingError);
      }
      
      logger.info(`Saved analysis for ${symbol} to memory`);
      
      // Schedule a tweet about this analysis
      this.scheduleTweetFromAnalysis(symbol, analysisResult.response);
    } catch (error) {
      logger.error(`Error analyzing token ${symbol}`, error);
      throw error;
    }
  }
  
  /**
   * Schedule a tweet based on token analysis
   * 
   * @param symbol - Token symbol
   * @param analysis - Token analysis
   * @param immediate - Optional flag to request immediate posting (default: false)
   */
  private async scheduleTweetFromAnalysis(symbol: string, analysis: string, immediate: boolean = false): Promise<void> {
    try {
      // Generate tweet content from analysis using the personality's tone and style
      const personalityName = this.personality.persona?.name || 'Wexley';
      
      // Access the traits from the correct path in the personality object
      const personalityTraits = 
        this.personality.persona?.personality?.traits || ['analytical', 'insightful'];
      
      // Determine if this is an AI-related token
      const isAiToken = symbol.toLowerCase().includes('ai') || 
                        analysis.toLowerCase().includes(' ai ') ||
                        analysis.toLowerCase().includes('artificial intelligence');
      
      // Create a personalized expertise description
      let expertiseDesc = "a crypto market analyst specializing in blockchain technologies";
      if (isAiToken) {
        expertiseDesc += " with expertise in AI and ML applications";
      }
      
      const tweetPrompt = `
        Based on this analysis of ${symbol}:
        
        ${analysis.substring(0, 500)}...
        
        You are ${personalityName}, ${expertiseDesc}.
        Your expertise allows you to identify market patterns and token potential.
        Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
        
        Create a concise, informative tweet (under 240 chars) that:
        1. Mentions a specific insight about ${symbol} token
        2. Includes a substantiated opinion or prediction 
        3. Uses $${symbol} format
        4. MUST NOT include any hashtags
        5. Matches your sophisticated, confident but measured tone
        6. Shows your technical expertise while remaining accessible
        7. Focuses on the token's unique value proposition
        8. NEVER starts with phrases like "Look," or "I think" or similar - start directly with your analysis
        9. Uses a direct, professional tone that gets straight to the point
        
        Here are examples of the tweet style to emulate:
        
        "$ADA fundamentally overvalued at current levels. TVL to market cap ratio remains absurd, and promised developer activity isn't materializing. Token metrics suggesting 30-40% correction likely before finding equilibrium. Positioning accordingly."
        
        "$SOL accumulation patterns mirror ETH in 2016 - smart money positioning before significant developer migration. Three leading ETH projects already quietly building Solana implementations. Technical advantages becoming impossible to ignore."
        
        "The AI token market bifurcation has begun. Projects with legitimate ML infrastructure solving actual compute problems up 40%. Vaporware "AI chains" with no working product down 60%. This filtering process will accelerate through Q4."
        
        Model your tweet after these examples - direct, insightful, and starting with the key point without introductory phrases.
        
        Only return the tweet text.
      `;
      
      // Generate tweet using base agent for reliability
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Process the tweet text to remove common prefixes if they still appear
      let tweetText = tweetResult.response.trim();
      
      // Remove common prefixes like "Look," if they still appear
      const prefixesToRemove = [
        "Look, ", "Look: ", "I think ", "I believe ", "In my opinion, ", 
        "In my analysis, ", "My take: ", "Analysis: "
      ];
      
      for (const prefix of prefixesToRemove) {
        if (tweetText.startsWith(prefix)) {
          tweetText = tweetText.substring(prefix.length);
          // Capitalize first letter of new start if needed
          tweetText = tweetText.charAt(0).toUpperCase() + tweetText.slice(1);
          break;
        }
      }
      
      // Use a random delay between 1-5 minutes for more natural posting pattern
      const minDelay = immediate ? 30000 : 120000; // 30 seconds or 2 minutes
      const maxDelay = immediate ? 90000 : 300000; // 1.5 or 5 minutes
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      
      setTimeout(async () => {
        try {
          // Post directly using Twitter connector
          const tweetId = await this.twitterConnector.tweet(tweetText);
          
          logger.info(`Posted tweet about ${symbol} analysis`, { tweetId });
        } catch (error) {
          logger.error(`Error posting tweet for ${symbol}`, error);
        }
      }, delay);
      
      logger.info(`Scheduled tweet about ${symbol} to post in ${(delay/60000).toFixed(1)} minutes`);
    } catch (error) {
      logger.error(`Error scheduling tweet for ${symbol}`, error);
    }
  }
  
  /**
   * Execute a tweet task
   * 
   * @param task - Tweet task
   */
  private async executeTweetTask(task: any): Promise<void> {
    logger.info(`Executing tweet task: ${task.description}`);
    
    try {
      // Check if this is an initial tweet request (from startup)
      const isInitial = task.description.toLowerCase().includes('initial') || 
                       task.description.toLowerCase().includes('startup');
      
      // Extract the target symbol if specified
      const targetSymbol = this.extractTokenSymbol(task.description);
      
      if (targetSymbol) {
        // Generate tweet for specific token
        await this.generateTweetForToken(targetSymbol, isInitial);
      } else {
        // Get recent analyses from memory with improved search and deduplication
        // First check what we've tweeted about recently to avoid repetition 
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentTweets = await this.memory.searchNotes({
          query: "tweet token analysis",
          limit: 20
        });
        
        // Extract tokens we've tweeted about recently
        const recentlyTweetedTokens = new Set();
        recentTweets.forEach(tweet => {
          if (tweet.timestamp > oneDayAgo) {
            // Check tweet content for $TOKEN mentions
            const tokenMatches = tweet.content?.match(/\$([A-Z0-9]{2,})/g);
            if (tokenMatches) {
              tokenMatches.forEach(match => {
                recentlyTweetedTokens.add(match.substring(1));
              });
            }
            
            // Also check tags for token symbols
            tweet.tags?.forEach(tag => {
              if (/^[A-Z0-9]{2,}$/.test(tag) && 
                  !['crypto', 'token', 'analysis', 'tweet'].includes(tag.toLowerCase())) {
                recentlyTweetedTokens.add(tag);
              }
            });
          }
        });
        
        // Always add problem tokens to avoid repeating them
        ['ALCH', 'AI16Z'].forEach(token => recentlyTweetedTokens.add(token));
        logger.info(`Found ${recentlyTweetedTokens.size} recently tweeted tokens to avoid repetition`);
        
        // Get recent analyses, but filter out ones we've recently tweeted about
        const recentAnalyses = await this.memory.searchNotes({
          query: "token analysis crypto",
          category: "analysis",
          limit: 15  // Get more so we have options after filtering
        });
        
        if (recentAnalyses.length > 0) {
          // Filter analyses to avoid recently tweeted tokens
          const eligibleAnalyses = recentAnalyses.filter(analysis => {
            const tokenMatch = analysis.title.match(/Analysis: ([A-Z0-9]+)/);
            if (!tokenMatch) return false;
            
            const tokenSymbol = tokenMatch[1];
            if (recentlyTweetedTokens.has(tokenSymbol)) {
              logger.info(`Skipping analysis for ${tokenSymbol} - recently tweeted about`);
              return false;
            }
            
            return true;
          });
          
          logger.info(`Found ${eligibleAnalyses.length} eligible analyses after filtering out recently tweeted tokens`);
          
          // If we have eligible analyses, use them
          if (eligibleAnalyses.length > 0) {
            // Use appropriate number of analyses based on initial parameter
            const analysesToUse = eligibleAnalyses.slice(0, isInitial ? 1 : 2);
            
            // Generate tweets for eligible analyses
            for (const analysis of analysesToUse) {
              const tokenMatch = analysis.title.match(/Analysis: ([A-Z0-9]+)/);
              if (tokenMatch && tokenMatch[1]) {
                await this.generateTweetForToken(tokenMatch[1], isInitial);
                
                // For initial tweet, just post about the first token
                if (isInitial) break;
              }
            }
          } else {
            logger.info('No eligible analyses found after filtering (all recently tweeted about)');
          }
        } else {
          // If no analyses found, generate one on the spot
          logger.info('No existing analyses found, generating new analysis for tweet');
          
          // Get trending tokens
          const trendingResult = await this.cryptoTool.getTrendingTokens({
            limit: 5,
            minPriceChange: 3,
            focusAreas: this.settings.focusAreas
          });
          
          if (trendingResult.tokens && trendingResult.tokens.length > 0) {
            // Take the top token
            const topToken = trendingResult.tokens[0];
            
            // Generate quick analysis and tweet
            await this.analyzeSpecificToken(topToken.symbol);
          }
        }
      }
    } catch (error) {
      logger.error('Error executing tweet task', error);
      throw error;
    }
  }
  
  /**
   * Generate a tweet for a specific token
   * 
   * @param symbol - Token symbol
   * @param immediate - Optional flag to request immediate posting (default: false)
   */
  private async generateTweetForToken(symbol: string, immediate: boolean = false): Promise<void> {
    logger.info(`Generating tweet for token: ${symbol} (immediate: ${immediate})`);
    
    try {
      // Fetch existing analysis
      const tokenAnalyses = await this.memory.searchNotes({
        query: `${symbol} analysis`,
        limit: 1
      });
      
      if (tokenAnalyses.length === 0) {
        logger.warn(`No analysis found for ${symbol}, skipping tweet generation`);
        return;
      }
      
      // Get personality details for more personalized tweets
      const personalityName = this.personality.persona?.name || 'Wexley';
      
      // Access the traits from the correct path in the personality object
      const personalityTraits = 
        this.personality.persona?.personality?.traits || ['analytical', 'insightful'];
      
      // Access the style from the correct path in the personality object
      const personalityStyle = 
        this.personality.persona?.personality?.communication?.style || 'professional';
      
      // Generate tweet content from analysis using the personality's tone and style
      const tweetPrompt = `
        Based on this analysis of ${symbol}:
        
        ${tokenAnalyses[0].content.substring(0, 500)}...
        
        You are ${personalityName}, a crypto market analyst specializing in AI tokens.
        Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
        Your communication style is: ${personalityStyle}.
        
        Create a concise, informative tweet (under 240 chars) that:
        1. Mentions a specific insight about the token
        2. Includes a substantiated opinion or prediction
        3. Uses $${symbol} format
        4. MUST NOT include any hashtags
        5. Matches your sophisticated, confident but measured tone
        6. Shows your technical expertise while remaining accessible
        
        Only return the tweet text.
      `;
      
      // Generate tweet using base agent for reliability
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Post tweet
      try {
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted tweet about ${symbol}`, { tweetId });
      } catch (error) {
        logger.error(`Error posting tweet for ${symbol}`, error);
      }
    } catch (error) {
      logger.error(`Error generating tweet for ${symbol}`, error);
    }
  }
  
  /**
   * Execute a follow-up task
   * 
   * @param task - Follow-up task
   */
  private async executeFollowUpTask(task: {description: string; type?: string}): Promise<void> {
    logger.info(`Executing follow-up task: ${task.description}`);
    
    try {
      // Get our recent tweets from Twitter
      const myUsername = process.env.TWITTER_USERNAME;
      if (!myUsername) {
        logger.warn('Cannot execute follow-up task: Twitter username not set');
        return;
      }
      
      try {
        // Check for major crypto predictions to follow up on
        await this.followUpOnMajorCryptoPredictions();
        
        // Get recent tweets and mentions
        const recentTweets = await this.twitterConnector.getUserTweets(myUsername, 15);
        logger.info(`Found ${recentTweets.length} recent tweets to check for follow-ups`);
        
        // Look for tweets with engagement (replies/likes)
        const tweetsWithEngagement = recentTweets.filter(tweet => 
          (tweet.metrics?.replies && tweet.metrics.replies > 0) || 
          (tweet.metrics?.likes && tweet.metrics.likes > 5)
        );
        
        // Find tweets with predictions or specific claims
        const predictionTweets = recentTweets.filter(tweet => 
          typeof tweet.text === 'string' && (
            tweet.text.includes('predict') || 
            tweet.text.includes('expect') ||
            tweet.text.includes('likely') ||
            tweet.text.includes('anticipate') ||
            tweet.text.includes('potential') ||
            tweet.text.includes('should') ||
            tweet.text.includes('will')
          )
        );
        
        logger.info(`Found ${predictionTweets.length} tweets with predictions and ${tweetsWithEngagement.length} tweets with engagement`);
        
        // Process prediction tweets for follow-ups
        for (const tweet of predictionTweets) {
          // Skip if content is not a string (defensive programming)
          if (typeof tweet.text !== 'string') continue;
          
          // Check if posted at least 24 hours ago
          const tweetTime = tweet.createdAt ? tweet.createdAt.getTime() : Date.now() - 86400000;
          const currentTime = Date.now();
          const hoursSinceTweet = (currentTime - tweetTime) / (1000 * 60 * 60);
          
          // Extract token symbol if present
          const tokenSymbols = this.extractTokenSymbols(tweet.text);
          
          if (tokenSymbols.length > 0 && hoursSinceTweet >= 24) {
            const symbol = tokenSymbols[0];
            await this.generateFollowUpTweet(symbol, tweet.text);
          } else if (hoursSinceTweet >= 36) {
            // For non-token tweets, still consider follow-ups after 36 hours
            await this.generateGenericFollowUpTweet(tweet.text);
          }
        }
        
        // Process tweets with engagement for replies
        for (const tweet of tweetsWithEngagement) {
          if (!tweet.id) continue;
          
          try {
            // Check for replies to our tweet
            logger.info(`Checking for replies to tweet with ID: ${tweet.id}`);
            const replies = await this.twitterConnector.searchTweets(`to:${myUsername}`, 5);
            
            // Filter replies that are actually to this specific tweet
            const directReplies = replies.filter(reply => 
              reply.inReplyToId === tweet.id && !reply.author.username?.includes(myUsername)
            );
            
            logger.info(`Found ${directReplies.length} replies to engage with`);
            
            // Engage with replies that haven't been responded to
            for (const reply of directReplies) {
              if (!reply.id) continue;
              
              // Check if we've already responded to this reply
              const myReplies = await this.twitterConnector.searchTweets(`from:${myUsername} to:${reply.author.username}`, 3);
              const alreadyReplied = myReplies.some(myReply => myReply.inReplyToId === reply.id);
              
              if (!alreadyReplied) {
                await this.handleReply(reply);
              }
            }
          } catch (error) {
            logger.error(`Error checking replies for tweet ${tweet.id}`, error);
          }
        }
        
        // Browse timeline for relevant content to engage with
        await this.browseAndEngageWithTimeline();
        
        // Browse crypto topics and trending discussions
        await this.exploreTrendingTopics();
        
        // Like and respond to mentions
        try {
          const mentions = await this.twitterConnector.searchTweets(`@${myUsername}`, 5);
          logger.info(`Found ${mentions.length} mentions to possibly engage with`);
          
          for (const mention of mentions) {
            if (!mention.id) continue;
            
            // Like mentions
            try {
              await this.twitterConnector.like(mention.id);
              logger.info(`Liked mention from @${mention.author.username}`);
            } catch (likeError) {
              logger.debug(`Error liking mention`, likeError);
            }
            
            // Check if we've already responded to this mention
            const myReplies = await this.twitterConnector.searchTweets(`from:${myUsername} to:${mention.author.username}`, 3);
            const alreadyReplied = myReplies.some(myReply => myReply.inReplyToId === mention.id);
            
            if (!alreadyReplied) {
              await this.handleMention(mention);
            }
          }
        } catch (mentionsError) {
          logger.error('Error processing mentions', mentionsError);
        }
        
      } catch (error) {
        logger.error('Error retrieving tweets for follow-up', error);
      }
    } catch (error) {
      logger.error('Error executing follow-up task', error);
      throw error;
    }
  }
  
  /**
   * Generate a follow-up tweet for a token
   * 
   * @param symbol - Token symbol
   * @param originalTweet - Original tweet content
   */
  private async generateFollowUpTweet(symbol: string, originalTweet: string): Promise<void> {
    logger.info(`Generating follow-up tweet for ${symbol}`);
    
    try {
      // Get latest token data
      const trendingResult = await this.cryptoTool.getTrendingTokens({
        limit: 20
      });
      
      const tokenData = trendingResult.tokens.find(t => t.symbol === symbol);
      
      if (!tokenData) {
        logger.warn(`No current data found for ${symbol}, skipping follow-up`);
        return;
      }
      
      // Generate follow-up tweet
      const followUpPrompt = `
        You previously tweeted about $${symbol}:
        "${originalTweet}"
        
        Current data for ${symbol}:
        Price: $${tokenData.price.toFixed(6)}
        24h Change: ${tokenData.priceChange24h.toFixed(2)}%
        
        Create a follow-up tweet (under 240 chars) that:
        1. References your previous analysis/prediction
        2. Compares it to current performance
        3. Offers updated insight
        4. Uses $${symbol} format
        5. Maintains a professional but approachable tone
        
        Only return the tweet text.
      `;
      
      // Generate tweet
      const tweetResult = await this.baseAgent.run({ task: followUpPrompt });
      
      // Post the tweet
      try {
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted follow-up tweet about ${symbol}`, { tweetId });
      } catch (error) {
        logger.error(`Error posting follow-up tweet for ${symbol}`, error);
      }
    } catch (error) {
      logger.error(`Error generating follow-up tweet for ${symbol}`, error);
    }
  }
  
  /**
   * Generate a follow-up tweet for non-token specific content
   * 
   * @param originalTweet - Original tweet content
   */
  private async generateGenericFollowUpTweet(originalTweet: string): Promise<void> {
    logger.info(`Generating generic follow-up tweet for broader crypto/tech topics`);
    
    try {
      // Get the current date for context
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Generate follow-up tweet
      const followUpPrompt = `
        You previously tweeted this insight about crypto/blockchain technology:
        "${originalTweet}"
        
        Today's date: ${currentDate}
        
        Create a follow-up tweet (under 240 chars) that:
        1. Expands on your previous thought about blockchain/crypto trends
        2. Offers a new insight or observation about the industry
        3. Shows your expertise in broader technology trends
        4. Does NOT need to focus on specific tokens
        5. Maintains a professional but approachable tone
        
        Only return the tweet text.
      `;
      
      // Generate tweet
      const tweetResult = await this.baseAgent.run({ task: followUpPrompt });
      
      // Post the tweet
      try {
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted follow-up tweet about industry trends`, { tweetId });
      } catch (error) {
        logger.error(`Error posting generic follow-up tweet`, error);
      }
    } catch (error) {
      logger.error(`Error generating generic follow-up tweet`, error);
    }
  }
  
  /**
   * Execute a large-cap token analysis task
   * 
   * @param task - Large-cap analysis task
   */
  private async executeLargeCapAnalysisTask(task: any): Promise<void> {
    logger.info(`Executing large-cap token analysis task: ${task.description}`);
    
    try {
      // List of large-cap tokens to analyze
      const largeCapTokens = [
        'SOL', 'BTC', 'ETH', 'BONK', 'JUP', 'PYTH', 'RNDR'
      ];
      
      logger.info(`Analyzing ${largeCapTokens.length} large-cap tokens`);
      
      // Create a set to track tokens we've recently analyzed to avoid repetition
      const recentAnalyses = await this.memory.searchNotes({
        query: "large-cap analysis",
        category: "largecap_analysis",
        limit: 5
      });
      
      const recentTokens = new Set(
        recentAnalyses
          .map(note => {
            const match = note.title.match(/Analysis: ([A-Z0-9]+)/);
            return match ? match[1] : null;
          })
          .filter(Boolean)
      );
      
      // Analyze each token
      for (const token of largeCapTokens) {
        try {
          // Skip if we've analyzed this token recently (within last 4-8 hours)
          if (recentTokens.has(token)) {
            logger.info(`Skipping recently analyzed large-cap token: ${token}`);
            continue;
          }
          
          logger.info(`Analyzing large-cap token: ${token}`);
          
          let tokenData;
          try {
            // Use the token overview tool to get detailed data
            tokenData = await this.tokenOverviewTool.execute({
              token: token
            });
            
            if (!tokenData || !tokenData.token) {
              logger.warn(`Failed to get data for token: ${token}`);
              continue;
            }
          } catch (tokenError) {
            logger.error(`Error getting token data for ${token}`, tokenError);
            continue;
          }
          
          // Prepare context data for analysis
          const data = tokenData.token;
          
          // Check if this token has significant price movement
          const priceChange24h = data.priceChange24h || 0;
          const priceChange1h = data.metrics?.last1Hour?.priceChange || 0;
          const volume24hUSD = data.volume24hUSD || 0;
          const volumeChangePercent = data.volume24hChangePercent || 0;
          
          // Calculate buy/sell ratio if available
          let buySellRatio = 1;
          if (data.metrics?.last24Hours?.buys && data.metrics?.last24Hours?.sells && 
              data.metrics.last24Hours.sells > 0) {
            buySellRatio = data.metrics.last24Hours.buys / data.metrics.last24Hours.sells;
          }
          
          const hasSignificantMovement = Math.abs(priceChange24h) > 5 || Math.abs(priceChange1h) > 2 || 
                                         Math.abs(volumeChangePercent) > 20 || 
                                         buySellRatio > 1.2 || buySellRatio < 0.8;
          
          // Only create deeper analysis for tokens with significant movement
          if (!hasSignificantMovement) {
            logger.info(`Skipping ${token} - no significant movement detected`);
            continue;
          }
          
          // Construct summary of key metrics and indicators
          const marketSummary = `
            Token: ${data.name} (${data.symbol})
            Current Price: $${data.price?.toFixed(6) || 'N/A'}
            
            Key Price Movements:
            - 24h Change: ${priceChange24h?.toFixed(2) || 'N/A'}%
            - 1h Change: ${priceChange1h?.toFixed(2) || 'N/A'}%
            
            Trading Activity:
            - 24h Volume: $${(volume24hUSD / 1000000).toFixed(2) || 'N/A'} million
            - Volume Change: ${volumeChangePercent?.toFixed(2) || 'N/A'}%
            - Buy/Sell Ratio: ${buySellRatio.toFixed(2) || 'N/A'}
            
            Market Metrics:
            - Market Cap: $${(data.marketCap / 1000000000).toFixed(2) || 'N/A'} billion
            - Liquidity: $${(data.liquidity / 1000000).toFixed(2) || 'N/A'} million
            - Holders: ${data.holders?.toLocaleString() || 'N/A'}
            
            Project Information:
            - Website: ${data.links?.website || 'N/A'}
            - Twitter: ${data.links?.twitter || 'N/A'}
            - Description: ${data.description || 'N/A'}
          `;
          
          // Generate deeper analysis using the agent
          const analysisPrompt = `
            As a crypto analyst focused on large-cap tokens, analyze this token data:
            
            ${marketSummary}
            
            Provide an in-depth analysis with:
            1. Key observations about price action and volume patterns
            2. Market sentiment interpretation (based on price, volume, and buy/sell activity)
            3. Potential causes for current price movement
            4. Short-term price outlook (next 24-48 hours)
            5. Macro-context and relation to the broader market
            
            Focus on data-driven insights rather than speculation.
          `;
          
          // Generate analysis
          const analysisResult = await this.autonomousAgent.runOperation<{ response: string }>(analysisPrompt);
          
          // Store the analysis in memory
          await this.memory.addNote({
            title: `Large-Cap Analysis: ${token}`,
            content: `
              ${marketSummary}
              
              Analysis Summary:
              ${analysisResult.response}
            `,
            category: 'largecap_analysis',
            tags: ['crypto', 'largecap', token, 'analysis'],
            timestamp: Date.now()
          });
          
          logger.info(`Saved large-cap analysis for ${token} to memory`);
        } catch (tokenError) {
          logger.error(`Error analyzing large-cap token ${token}`, tokenError);
        }
      }
    } catch (error) {
      logger.error('Error executing large-cap analysis task', error);
      throw error;
    }
  }
  
  /**
   * Execute a large-cap token tweet task
   * 
   * @param task - Large-cap tweet task
   */
  private async executeLargeCapTweetTask(task: any): Promise<void> {
    logger.info(`Executing large-cap token tweet task: ${task.description}`);
    
    try {
      // Get recent large-cap analyses from memory
      const recentAnalyses = await this.memory.searchNotes({
        query: "large-cap analysis",
        category: "largecap_analysis",
        limit: 3
      });
      
      if (recentAnalyses.length === 0) {
        logger.warn('No large-cap analyses found, skipping tweet');
        return;
      }
      
      // Select one analysis to tweet about
      const analysis = recentAnalyses[0];
      
      // Extract token symbol from the title
      const tokenMatch = analysis.title.match(/Analysis: ([A-Z0-9]+)/);
      if (!tokenMatch || !tokenMatch[1]) {
        logger.warn('Could not extract token symbol from analysis title');
        return;
      }
      
      const tokenSymbol = tokenMatch[1];
      
      // Generate tweet
      const tweetPrompt = `
        As a respected crypto analyst, create an insightful tweet about ${tokenSymbol} based on this analysis:
        
        ${analysis.content.substring(0, 800)}...
        
        Your tweet should:
        1. Present a clear, specific prediction or insight about ${tokenSymbol}
        2. Reference key data metrics (price movement, volume, etc.)
        3. Include your reasoning/justification
        4. Use a confident but measured tone
        5. Be concise (under 240 chars)
        6. Use $${tokenSymbol} format
        7. NOT include hashtags
        
        Only return the tweet text.
      `;
      
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Post the tweet
      try {
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted large-cap token tweet about ${tokenSymbol}`, { tweetId });
      } catch (error) {
        logger.error(`Error posting large-cap token tweet for ${tokenSymbol}`, error);
      }
    } catch (error) {
      logger.error(`Error executing large-cap tweet task: ${task.description}`, error);
      throw error;
    }
  }
  
  /**
   * Execute an industry tweet task that shares broader thoughts
   * 
   * @param task - Industry tweet task
   */
  private async executeIndustryTweetTask(task: any): Promise<void> {
    logger.info(`Executing industry trend tweet task: ${task.description}`);
    
    try {
      // Get current date for context
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Generate a tweet about broader crypto/blockchain trends
      const tweetPrompt = `
        Create an insightful tweet about current trends in blockchain technology and crypto markets.
        
        Today's date: ${currentDate}
        
        The tweet should:
        1. Discuss a significant trend, development, or observation in the crypto/blockchain industry
        2. Offer a unique perspective or insight that demonstrates your expertise
        3. Be forward-looking and thoughtful
        4. Be concise (under 240 chars)
        5. NOT focus exclusively on specific tokens
        6. Maintain a professional but approachable tone
        7. NOT include hashtags
        
        Only return the tweet text.
      `;
      
      // Generate tweet
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Post the tweet
      try {
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted industry trend tweet`, { tweetId });
      } catch (error) {
        logger.error(`Error posting industry trend tweet`, error);
      }
    } catch (error) {
      logger.error(`Error executing industry tweet task: ${task.description}`, error);
      throw error;
    }
  }
  
  /**
   * Execute a major crypto analysis task using CoinGecko
   * 
   * @param task - Major crypto analysis task
   */
  private async executeMajorCryptoAnalysisTask(task: any): Promise<void> {
    logger.info(`Executing major crypto analysis task: ${task.description}`);
    
    try {
      // Define list of major cryptocurrencies to analyze
      const majorCryptos = [
        { name: 'Bitcoin', id: 'bitcoin' },
        { name: 'Ethereum', id: 'ethereum' },
        { name: 'Solana', id: 'solana' },
        { name: 'Binance Coin', id: 'binancecoin' },
        { name: 'XRP', id: 'ripple' },
        { name: 'Cardano', id: 'cardano' },
        { name: 'Avalanche', id: 'avalanche-2' },
        { name: 'Polkadot', id: 'polkadot' }
      ];
      
      logger.info(`Analyzing ${majorCryptos.length} major cryptocurrencies using CoinGecko`);
      
      // Get data for each crypto
      for (const crypto of majorCryptos) {
        try {
          // Get current price data from CoinGecko
          const priceDataResult = await this.coinGeckoTool.execute({
            tokenId: crypto.id
          });
          
          // Parse the result (it's a JSON string)
          let priceData;
          try {
            priceData = JSON.parse(priceDataResult);
          } catch (parseError) {
            logger.error(`Error parsing price data for ${crypto.name}:`, parseError);
            continue;
          }
          
          // Check if there was an error
          if (typeof priceData === 'string' && priceData.startsWith('Error:')) {
            logger.error(`Error fetching price data for ${crypto.name}: ${priceData}`);
            continue;
          }
          
          logger.info(`Retrieved price data for ${crypto.name}: $${priceData.price_usd} (${priceData.price_change_24h_percent.toFixed(2)}% 24h change)`);
          
          // Get additional market context using Tavily search
          const searchQuery = `${crypto.name} crypto price analysis latest news predictions`;
          const searchResults = await this.searchTool.execute({
            query: searchQuery,
            maxResults: 3,
            includeAnswer: true
          });
          
          logger.info(`Retrieved search data for ${crypto.name}`);
          
          // Generate market analysis
          const analysisPrompt = `
            As a crypto analyst, analyze ${crypto.name} based on this data:
            
            Current market data (from CoinGecko):
            - Current price: $${priceData.price_usd}
            - 24h price change: ${priceData.price_change_24h_percent.toFixed(2)}%
            - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
            - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
            - Last updated: ${priceData.last_updated_at}
            
            Recent news and market context:
            ${searchResults.answer || 'No summary available'}
            
            Provide a detailed analysis including:
            1. Current market situation (key support/resistance levels, momentum indicators)
            2. Recent developments affecting price
            3. Short-term outlook (1-7 days)
            4. Medium-term outlook (1-4 weeks)
            5. Key factors to monitor
            6. Potential risks and opportunities
            
            Be specific with price predictions and potential scenarios. Support your analysis with data and reasoning.
          `;
          
          const analysisResult = await this.baseAgent.run({ task: analysisPrompt });
          
          // Store the analysis in memory
          await this.memory.addNote({
            title: `Major Crypto Analysis: ${crypto.name}`,
            content: `
              Market Data (${new Date().toISOString()}):
              - Current price: $${priceData.price_usd}
              - 24h price change: ${priceData.price_change_24h_percent.toFixed(2)}%
              - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
              - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
              
              Analysis:
              ${analysisResult.response}
            `,
            category: 'major_crypto_analysis',
            tags: ['crypto', 'analysis', crypto.id, 'major', 'coingecko'],
            timestamp: Date.now()
          });
          
          logger.info(`Saved major crypto analysis for ${crypto.name} to memory`);
          
          // Add a delay between analyses to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (cryptoError) {
          logger.error(`Error analyzing ${crypto.name}:`, cryptoError);
        }
      }
    } catch (error) {
      logger.error('Error executing major crypto analysis task:', error);
      throw error;
    }
  }
  
  /**
   * Execute a major crypto tweet task
   * 
   * @param task - Major crypto tweet task
   */
  private async executeMajorCryptoTweetTask(task: any): Promise<void> {
    logger.info(`Executing major crypto tweet task: ${task.description}`);
    
    try {
      // First, check for recent tweets to prevent excessive tweeting
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recentTweets = await this.memory.searchNotes({
        query: "prediction forecast tweet",
        limit: 10
      });
      
      // Filter for very recent tweets (within last hour)
      const veryRecentTweets = recentTweets.filter(t => t.timestamp > oneHourAgo);
      
      // If we've posted multiple tweets very recently, skip to avoid spam
      if (veryRecentTweets.length >= 3) {
        logger.info('Too many recent tweets detected (3+ in the last hour), skipping to avoid spam');
        return;
      }
      
      // Check if task description mentions a weekly or price prediction
      const isPriceForecast = task.description.toLowerCase().includes('price') || 
                             task.description.toLowerCase().includes('ethereum') ||
                             task.description.toLowerCase().includes('solana') ||
                             task.description.toLowerCase().includes('forecast') ||
                             task.description.toLowerCase().includes('prediction');
      
      if (isPriceForecast) {
        // Generate a major crypto forecast with our new function
        await this.generateMajorCryptoForecast();
        return;
      }
      
      // Regular major crypto tweet based on analysis
      // Get recent analyses from memory
      const recentAnalyses = await this.memory.searchNotes({
        query: "major crypto analysis",
        category: "major_crypto_analysis",
        limit: 5
      });
      
      if (recentAnalyses.length === 0) {
        logger.warn('No major crypto analyses found, switching to price forecast');
        await this.generateMajorCryptoForecast();
        return;
      }
      
      // Get tweets from last 4 hours to avoid duplication
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      const recentCryptoTweets = recentTweets.filter(t => t.timestamp > fourHoursAgo);
      const recentlyTweetedCryptos = new Set();
      
      // Extract crypto names from recent tweets to avoid repetition
      for (const tweet of recentCryptoTweets) {
        const cryptoNames = ['bitcoin', 'ethereum', 'solana', 'cardano', 'avalanche', 'ripple', 'xrp'];
        for (const crypto of cryptoNames) {
          if (tweet.content.toLowerCase().includes(crypto) || 
              tweet.title.toLowerCase().includes(crypto)) {
            recentlyTweetedCryptos.add(crypto);
          }
        }
      }
      
      logger.info(`Found ${recentlyTweetedCryptos.size} recently tweeted cryptos to avoid`);
      
      // Filter analyses to avoid repeating the same crypto
      const eligibleAnalyses = recentAnalyses.filter(analysis => {
        const match = analysis.title.match(/Analysis: (.+)/);
        if (!match) return false;
        
        const cryptoName = match[1].toLowerCase();
        return !recentlyTweetedCryptos.has(cryptoName);
      });
      
      logger.info(`Found ${eligibleAnalyses.length} eligible analyses after filtering out recently tweeted cryptos`);
      
      // If no eligible analyses, generate a price forecast instead
      if (eligibleAnalyses.length === 0) {
        logger.warn('No eligible analyses found (all recently tweeted about), switching to price forecast');
        await this.generateMajorCryptoForecast();
        return;
      }
      
      // Choose one analysis to tweet about (randomly)
      const analysis = eligibleAnalyses[Math.floor(Math.random() * eligibleAnalyses.length)];
      
      // Extract crypto name from the title
      const cryptoNameMatch = analysis.title.match(/Analysis: (.+)/);
      if (!cryptoNameMatch) {
        logger.warn('Could not extract crypto name from analysis title, switching to price forecast');
        await this.generateMajorCryptoForecast();
        return;
      }
      
      const cryptoName = cryptoNameMatch[1];
      
      // Extract current price, if available
      const priceMatch = analysis.content.match(/Current price: \$([\d,.]+)/);
      const price = priceMatch ? priceMatch[1] : 'N/A';
      
      // Generate tweet
      const tweetPrompt = `
        As a respected crypto analyst, create an insightful tweet about ${cryptoName} based on this analysis:
        
        ${analysis.content.substring(0, 800)}...
        
        Your tweet should:
        1. Present a clear, specific prediction or insight about ${cryptoName}
        2. Include the current price ($${price})
        3. Reference key support/resistance levels or technical indicators
        4. Include your reasoning/justification
        5. Use a confident but measured tone
        6. Be concise (under 240 chars)
        7. Use $${cryptoName.toUpperCase()} format if appropriate
        8. NOT include hashtags
        9. IMPORTANT: Do not include @mentions of any Twitter users including yourself
        
        Only return the tweet text.
      `;
      
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Post the tweet
      try {
        // Check for any self-mentions that might trigger our event handlers
        const myUsername = process.env.TWITTER_USERNAME;
        let tweetText = tweetResult.response;
        
        // Check if tweet contains mentions of ourselves to avoid self-replies
        if (myUsername && tweetText.toLowerCase().includes(`@${myUsername.toLowerCase()}`)) {
          logger.warn(`Tweet contains mention to ourselves, removing @${myUsername} to avoid self-reply loop`);
          // Remove the self mention
          tweetText = tweetText.replace(new RegExp(`@${myUsername}`, 'gi'), cryptoName);
        }
        
        const tweetId = await this.twitterConnector.tweet(tweetText);
        logger.info(`Posted major crypto analysis tweet about ${cryptoName}`, { tweetId });
        
        // Store this prediction for later follow-up with proper tagging
        await this.memory.addNote({
          title: `Prediction: ${cryptoName}`,
          content: `
            Tweet: ${tweetText}
            
            Based on analysis:
            ${analysis.content.substring(0, 500)}...
          `,
          category: 'prediction',
          tags: ['crypto', 'prediction', cryptoName.toLowerCase(), 'major', 'coingecko', 'tweet', Date.now().toString()],
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error(`Error posting major crypto tweet for ${cryptoName}`, error);
      }
    } catch (error) {
      logger.error('Error executing major crypto tweet task:', error);
      throw error;
    }
  }
  
  /**
   * Generate a weekly price prediction for a major cryptocurrency
   * This method is part of our enhanced learning system - we track
   * predictions and outcomes to improve our analysis over time
   */
  private async generateWeeklyMajorCryptoPrediction(): Promise<void> {
    logger.info('Generating weekly price prediction for a major cryptocurrency');
    
    try {
      // List of major cryptocurrencies to consider
      const majorCryptos = [
        { name: 'Ethereum', id: 'ethereum' },
        { name: 'Solana', id: 'solana' },
        { name: 'Bitcoin', id: 'bitcoin' },
        { name: 'Avalanche', id: 'avalanche-2' }
      ];
      
      // Choose one randomly with higher preference for ETH and SOL
      // (mentioned specifically in the user request)
      const weights = [0.4, 0.4, 0.1, 0.1]; // Higher weights for ETH and SOL
      
      // Weighted random selection
      let randomValue = Math.random();
      let selectedCrypto: {name: string; id: string} = majorCryptos[0]; // Default value
      let cumulativeWeight = 0;
      
      for (let i = 0; i < majorCryptos.length; i++) {
        cumulativeWeight += weights[i];
        if (randomValue <= cumulativeWeight) {
          selectedCrypto = majorCryptos[i];
          break;
        }
      }
      
      // Fallback if somehow the weighted selection fails
      if (!selectedCrypto) {
        selectedCrypto = majorCryptos[0]; // Default to Ethereum
      }
      
      logger.info(`Selected ${selectedCrypto.name} for weekly price prediction`);
      
      // Get current price data
      const priceDataResult = await this.coinGeckoTool.execute({
        tokenId: selectedCrypto.id
      });
      
      // Parse the result
      let priceData;
      try {
        priceData = JSON.parse(priceDataResult);
      } catch (parseError) {
        logger.error(`Error parsing price data for ${selectedCrypto.name}:`, parseError);
        return;
      }
      
      // Check if there was an error
      if (typeof priceData === 'string' && priceData.startsWith('Error:')) {
        logger.error(`Error fetching price data for ${selectedCrypto.name}: ${priceData}`);
        return;
      }
      
      // Get additional market context using Tavily search
      const searchQuery = `${selectedCrypto.name} crypto price analysis forecast next week predictions`;
      const searchResults = await this.searchTool.execute({
        query: searchQuery,
        maxResults: 3,
        includeAnswer: true
      });
      
      // Get today's date and calculate end of week date (7 days from now)
      const today = new Date();
      const endOfWeek = new Date();
      endOfWeek.setDate(today.getDate() + 7);
      
      const todayFormatted = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endOfWeekFormatted = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Generate the weekly prediction
      const predictionPrompt = `
        As a crypto analyst, create a WEEKLY PRICE PREDICTION for ${selectedCrypto.name} ($${selectedCrypto.id.toUpperCase()}) 
        based on this current data:
        
        Current market data (from CoinGecko):
        - Current price: $${priceData.price_usd}
        - 24h price change: ${priceData.price_change_24h_percent.toFixed(2)}%
        - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
        - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
        
        Recent market context:
        ${searchResults.answer || 'No market context available'}
        
        Create a tweet with your weekly price prediction (${todayFormatted} - ${endOfWeekFormatted}) that:
        1. Clearly states this is your weekly price prediction for ${selectedCrypto.name}
        2. Includes the current price
        3. Gives a specific price target or range for the end of the week
        4. Mentions 1-2 key factors influencing your prediction
        5. Uses $${selectedCrypto.id.toUpperCase()} format
        6. Is EXACTLY 240 characters or less - this is a strict limit
        7. Does NOT include hashtags
        8. Sounds natural and conversational, like a human expert would write
        
        Write in a confident but casual expert tone. Avoid overly formal language or generic statements.
        Use natural speech patterns that a real trader would use.
        
        Examples of good style:
        - "Weekly $SOL forecast: Currently at $103.45, expecting test of $120 by Friday. Rising dev activity + stablecoin inflows pointing to strength. Resistance at $112 will be key - watching for high volume breakout pattern."
        - "My $ETH weekly outlook: Now trading at $3,240, target range $3,500-3,600 by next Tuesday. Layer 2 TVL expansion + ETF anticipation driving momentum. Potential volatility around Fed minutes, but bullish structure intact."
        
        Only return the tweet text.
      `;
      
      const tweetResult = await this.baseAgent.run({ task: predictionPrompt });
      
      // Post the weekly prediction tweet if we're within rate limits
      try {
        // Check if we can tweet based on rate limiting
        if (!this.canTweet()) {
          logger.info(`Weekly prediction tweet for ${selectedCrypto.name} delayed due to rate limiting - will try later`);
          
          // Schedule retry after a random delay (5-15 min)
          const delayMins = Math.floor(Math.random() * 10) + 5;
          const delayMs = delayMins * 60 * 1000;
          
          setTimeout(async () => {
            try {
              if (this.canTweet()) {
                const tweetId = await this.twitterConnector.tweet(tweetResult.response);
                logger.info(`Posted delayed weekly prediction for ${selectedCrypto.name}`, { tweetId });
                this.trackTweet();
              } else {
                logger.info(`Still rate-limited, abandoning weekly prediction for ${selectedCrypto.name}`);
              }
            } catch (retryError) {
              logger.error(`Error posting delayed weekly prediction for ${selectedCrypto.name}`, retryError);
            }
          }, delayMs);
          
          return;
        }
        
        // Post the tweet and track it
        const tweetId = await this.twitterConnector.tweet(tweetResult.response);
        logger.info(`Posted weekly prediction tweet for ${selectedCrypto.name}`, { tweetId });
        await this.trackTweet(); // Use await to ensure the delay happens
        
        // Store this prediction for later follow-up
        await this.memory.addNote({
          title: `Weekly Prediction: ${selectedCrypto.name}`,
          content: `
            Weekly prediction (${todayFormatted} - ${endOfWeekFormatted}):
            
            Tweet: ${tweetResult.response}
            
            Starting data:
            - Price: $${priceData.price_usd}
            - 24h change: ${priceData.price_change_24h_percent.toFixed(2)}%
            - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
          `,
          category: 'prediction',
          tags: ['crypto', 'prediction', selectedCrypto.id, 'major', 'weekly', 'coingecko'],
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error(`Error posting weekly prediction tweet for ${selectedCrypto.name}`, error);
      }
    } catch (error) {
      logger.error('Error generating weekly major crypto prediction:', error);
    }
  }
  
  /**
   * Execute a generic task
   * 
   * @param task - Generic task
   */
  private async executeGenericTask(task: any): Promise<void> {
    logger.info(`Executing generic task: ${task.description}`);
    
    try {
      // Create a prompt for the agent to interpret and execute the task
      const taskPrompt = `
        Execute this task: ${task.description}
        
        Current context:
        - You are an autonomous crypto analysis agent with expertise in blockchain technologies
        - You analyze trending tokens and market patterns
        - You can store analyses in memory
        - You can post tweets about tokens and industry trends
        - You can engage with users and respond to mentions
        - You have access to CoinGecko price data for major cryptocurrencies
        
        Provide a detailed plan for executing this task, then carry it out step by step.
        For each step, explain what you're doing and why.
      `;
      
      // Execute generic task
      await this.autonomousAgent.runOperation<{ response: string }>(taskPrompt);
      
      logger.info(`Completed generic task: ${task.description}`);
    } catch (error) {
      logger.error(`Error executing generic task: ${task.description}`, error);
      throw error;
    }
  }
  
  /**
   * Extract token symbol from text
   * 
   * @param text - Text to extract from
   * @returns Token symbol if found, or null
   */
  private extractTokenSymbol(text: string): string | null {
    // Look for $ symbol format
    const dollarMatch = text.match(/\$([A-Z0-9]{2,})/);
    if (dollarMatch) return dollarMatch[1];
    
    // Look for explicit mention
    const explicitMatch = text.match(/token[:\s]+([A-Z0-9]{2,})/i);
    if (explicitMatch && explicitMatch[1] !== 'for' && explicitMatch[1] !== 'top') 
      return explicitMatch[1];
    
    // Look for symbol in parentheses
    const parenthesesMatch = text.match(/\(([A-Z0-9]{2,})\)/);
    if (parenthesesMatch) return parenthesesMatch[1];
    
    // Look for capitalized ticker-like symbols
    const tickerMatch = text.match(/\b([A-Z]{2,})\b/);
    if (tickerMatch && tickerMatch[1] !== 'AI' && tickerMatch[1] !== 'ML' && 
        tickerMatch[1] !== 'ID' && tickerMatch[1] !== 'OK' && tickerMatch[1] !== 'TOP') 
      return tickerMatch[1];
    
    return null;
  }
  
  /**
   * Extract all token symbols from text
   * 
   * @param text - Text to extract from
   * @returns Array of token symbols
   */
  private extractTokenSymbols(text: string): string[] {
    const symbols: string[] = [];
    
    // Look for $ symbol format
    const dollarMatches = text.match(/\$([A-Z0-9]{2,})/g);
    if (dollarMatches) {
      dollarMatches.forEach(match => {
        symbols.push(match.substring(1));
      });
    }
    
    // If no $ symbols found, try other formats
    if (symbols.length === 0) {
      // Single symbol extraction as fallback
      const singleSymbol = this.extractTokenSymbol(text);
      if (singleSymbol) {
        symbols.push(singleSymbol);
      }
    }
    
    return symbols;
  }
  
  /**
   * Browse and engage with the Twitter timeline
   * 
   * @param task - The browse timeline task
   */
  private async executeBrowseTimelineTask(task: any): Promise<void> {
    logger.info(`Executing browse timeline task: ${task.description}`);
    
    try {
      // Check if this is research-only mode
      const isResearchOnly = task.type === "browse_timeline_research_only";
      
          // Force research-only mode to be extra safe
      if (task.type !== "browse_timeline_research_only") {
        logger.warn('FORCING RESEARCH-ONLY MODE FOR ALL TIMELINE BROWSING FOR SAFETY');
        isResearchOnly = true;
      }
      
      // IMPORTANT: Never allow quote retweets at startup
      this.quoteRetweetLimit = 0;
      logger.warn('QUOTE RETWEETS COMPLETELY DISABLED - agent must prove basic reliability first');
      
      if (isResearchOnly) {
        logger.info("Running in research-only mode - will not engage with tweets");
      }
      
      // First, ensure we're following some crypto accounts if this is our first run
      await this.ensureFollowingCryptoAccounts();
      
      // Get tweets from the home timeline
      let timelineTweets = await this.twitterConnector.getHomeTimeline(20);
      logger.info(`Retrieved ${timelineTweets.length} tweets from home timeline`);
      
      // If timeline is empty, fall back to search for crypto content
      if (timelineTweets.length === 0) {
        logger.warn('No tweets found in timeline, falling back to search for crypto content');
        
        // List of crypto search terms to use when timeline is empty
        const fallbackSearchTerms = ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'web3', 'defi'];
        
        // Use 2 random terms for variety
        const searchTerms = fallbackSearchTerms
          .sort(() => 0.5 - Math.random())
          .slice(0, 2);
        
        // Search for each term and combine results
        timelineTweets = [];
        for (const term of searchTerms) {
          try {
            const results = await this.twitterConnector.searchTweets(term, 10);
            logger.info(`Found ${results.length} tweets for search term: ${term}`);
            timelineTweets = [...timelineTweets, ...results];
          } catch (searchError) {
            logger.error(`Error searching for ${term}`, searchError);
          }
        }
        
        logger.info(`Retrieved ${timelineTweets.length} tweets from search fallback`);
      }
      
      // If we still have no tweets, we can't continue
      if (timelineTweets.length === 0) {
        logger.warn('No tweets found in timeline or search fallback');
        return;
      }
      
      // Filter tweets related to crypto and blockchain
      const cryptoRelatedTweets = timelineTweets.filter(tweet => {
        // Skip tweets without text content
        if (!tweet || !tweet.text) return false;
        
        const text = tweet.text.toLowerCase();
        const isRelevant = this.settings.focusAreas.some(area => 
          text.includes(area.toLowerCase())
        );
        
        // Check for token symbols using $ prefix
        const hasCryptoSymbol = text.match(/\$[A-Z0-9]{2,}/);
        
        // Common crypto terms
        const hasCryptoTerms = [
          'blockchain', 'token', 'crypto', 'defi', 'nft', 'web3', 'bitcoin', 'ethereum',
          'altcoin', 'btc', 'eth', 'sol', 'trading', 'market', 'chain'
        ].some(term => text.includes(term));
        
        return isRelevant || !!hasCryptoSymbol || hasCryptoTerms;
      });
      
      logger.info(`Found ${cryptoRelatedTweets.length} crypto-related tweets in collection`);
      
      // If no crypto tweets found after filtering, use all tweets but limit interactions
      const tweetsToProcess = cryptoRelatedTweets.length > 0 ? 
                              cryptoRelatedTweets : 
                              timelineTweets.slice(0, 5); // Only use first 5 if not crypto-specific
      
      // Track seen tweets to avoid duplicate interactions
      const interactedTweetIds = new Set<string>();
      
      // Set a limit on interactions per session to avoid appearing spammy
      const maxInteractions = 5;
      let interactionCount = 0;
      
      // Process the filtered tweets
      for (const tweet of tweetsToProcess) {
        // Skip processing if we've reached our interaction limit
        if (interactionCount >= maxInteractions) break;
        
        // Skip if no tweet ID
        if (!tweet.id) continue;
        
        // Skip our own tweets
        const myUsername = process.env.TWITTER_USERNAME;
        if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) continue;
        
        // Skip if we've already interacted with this tweet
        if (interactedTweetIds.has(tweet.id)) continue;
        
        try {
          // Skip tweets with no text
          if (!tweet.text) {
            logger.debug(`Skipping tweet without text content from @${tweet.author.username || 'unknown'}`);
            continue;
          }
          
          // Analyze the tweet content with our agent
          const analysis = await this.baseAgent.run({
            task: `Analyze this tweet:
            
Tweet from @${tweet.author.username || 'unknown'}: "${tweet.text}"

Key points to consider:
1. Is this valuable content about crypto/blockchain?
2. Is the information accurate and thoughtful?
3. Is this something our followers would benefit from seeing?
4. How should we engage with this content?

Respond with ONE of these options only:
- "LIKE" - If the content is good but doesn't need more engagement
- "RETWEET" - If the content is excellent and worth sharing with followers
- "QUOTE: [your text]" - If you want to retweet with a comment (keep under 240 chars)
- "REPLY: [your text]" - If you want to reply to the tweet (keep under 240 chars)
- "IGNORE" - If the content is not relevant, low quality, or potentially harmful

Your analysis should be based on the tweet's quality, accuracy, and relevance to our focus on crypto markets.

IMPORTANT NOTE: For this session, you should NOT suggest QUOTE as an action. The agent is in training mode and quote tweets are disabled. Stick to LIKE, RETWEET, or IGNORE responses.`
          });
          
          // Extract the decision from the response
          const response = analysis.response.trim();
          
          // Only engage with tweets if not in research-only mode
          if (!isResearchOnly) {
            if (response.startsWith('LIKE')) {
              // Check if we can tweet before interacting
              if (this.canTweet()) {
                await this.twitterConnector.like(tweet.id);
                this.trackTweet(); // Track this interaction for rate limiting
                logger.info(`Liked tweet from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
                
                // If we like the tweet, also follow the user occasionally (20% chance)
                if (Math.random() < 0.2 && tweet.author.username) {
                  try {
                    await this.twitterConnector.follow(tweet.author.username);
                    logger.info(`Followed user @${tweet.author.username} after liking their tweet`);
                  } catch (followError) {
                    logger.debug(`Error following user @${tweet.author.username}`, followError);
                  }
                }
              } else {
                logger.info(`Rate limit reached - skipping like for tweet from @${tweet.author.username}`);
              }
            } 
            else if (response.startsWith('RETWEET')) {
              if (this.canTweet()) {
                await this.twitterConnector.retweet(tweet.id);
                this.trackTweet(); // Track this interaction for rate limiting
                logger.info(`Retweeted tweet from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } else {
                logger.info(`Rate limit reached - skipping retweet for tweet from @${tweet.author.username}`);
              }
            } 
            else if (response.startsWith('QUOTE:')) {
              // Check both general and quote-specific rate limits
              if (this.canTweet() && this.canQuoteRetweet()) {
                const quoteText = response.substring(6).trim();
                await this.twitterConnector.quoteTweet(tweet.id, quoteText);
                this.trackTweet(); // Track this interaction for rate limiting
                this.trackQuoteRetweet(); // Track specific quote retweet
                logger.info(`Quote tweeted @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } else if (!this.canQuoteRetweet()) {
                logger.warn(`QUOTE TWEET LIMIT REACHED - skipping quote tweet for @${tweet.author.username}`);
              } else {
                logger.info(`Tweet rate limit reached - skipping quote tweet for @${tweet.author.username}`);
              }
            } 
            else if (response.startsWith('REPLY:')) {
              if (this.canTweet()) {
                const replyText = response.substring(6).trim();
                await this.twitterConnector.tweet(replyText, { replyTo: tweet.id });
                this.trackTweet(); // Track this interaction for rate limiting
                logger.info(`Replied to tweet from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } else {
                logger.info(`Rate limit reached - skipping reply to @${tweet.author.username}`);
              }
            }
            else {
              logger.debug(`Ignoring tweet from @${tweet.author.username}`);
            }
          } else {
            // In research-only mode, just log what we would have done
            logger.info(`[RESEARCH MODE] Would have responded "${response.substring(0, 20)}..." to @${tweet.author.username} but skipping in research-only mode`);
          }
          
          // Add a larger delay to avoid Twitter rate limits (3-8 seconds)
          const interactionDelay = 3000 + (Math.random() * 5000);
          logger.debug(`Adding delay of ${Math.round(interactionDelay/1000)} seconds between interactions`);
          await new Promise(resolve => setTimeout(resolve, interactionDelay));
          
        } catch (error) {
          logger.error(`Error processing tweet from @${tweet.author.username}`, error);
        }
      }
      
      logger.info(`Completed timeline browsing with ${interactionCount} interactions`);
    } catch (error) {
      logger.error('Error executing browse timeline task', error);
      throw error;
    }
  }
  
  /**
   * Ensure the bot is following some key crypto accounts
   * This helps populate the timeline and engage with the community
   */
  private async ensureFollowingCryptoAccounts(): Promise<void> {
    try {
      // List of important crypto accounts that provide good content
      const cryptoAccounts = [
        'cz_binance',       // Binance CEO
        'SBF_FTX',          // FTX founder
        'VitalikButerin',   // Ethereum co-founder
        'CoinDesk',         // Crypto news
        'binance',          // Binance exchange
        'coinbase',         // Coinbase exchange
        'krakenfx',         // Kraken exchange
        'solana',           // Solana
        'ethereum',         // Ethereum
        'BitcoinMagazine',  // Bitcoin Magazine
        'Cointelegraph',    // Crypto news
        'CoinMarketCap',    // Market data
        'defipulse',        // DeFi ecosystem
        'MessariCrypto',    // Crypto research
        'DefiDegen'         // DeFi commentator
      ];
      
      // Check if we've already stored followed accounts in memory
      const followedAccountsNote = await this.memory.searchNotes({
        query: "followed crypto accounts",
        category: "twitter_activity",
        limit: 1
      });
      
      if (followedAccountsNote.length > 0) {
        logger.info('Already following crypto accounts from previous runs');
        return;
      }
      
      // Randomly select 3-5 accounts to follow (avoid following too many at once)
      const shuffledAccounts = cryptoAccounts.sort(() => 0.5 - Math.random());
      const accountsToFollow = shuffledAccounts.slice(0, Math.floor(Math.random() * 3) + 3);
      
      logger.info(`Following ${accountsToFollow.length} crypto accounts to populate timeline`);
      
      // Follow each account
      const followedAccounts = [];
      for (const account of accountsToFollow) {
        if (!account) continue; // Skip any undefined accounts
        
        try {
          await this.twitterConnector.follow(account);
          logger.info(`Followed crypto account: @${account}`);
          followedAccounts.push(account);
          
          // Add a delay between follows to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error(`Error following account @${account}`, error);
        }
      }
      
      // Store the followed accounts in memory
      if (followedAccounts.length > 0) {
        await this.memory.addNote({
          title: `Followed ${followedAccounts.length} crypto accounts`,
          content: `Followed these crypto accounts to populate timeline:\n${followedAccounts.join(', ')}`,
          category: 'twitter_activity',
          tags: ['twitter', 'follow', 'accounts'],
          timestamp: Date.now()
        });
        
        logger.info(`Stored followed accounts in memory`);
      }
    } catch (error) {
      logger.error('Error ensuring crypto accounts are followed', error);
    }
  }
  
  /**
   * Explore trending crypto topics on Twitter
   * 
   * @param task - The explore topics task
   */
  private async executeExploreTopicsTask(task: any): Promise<void> {
    logger.info(`Executing explore topics task: ${task.description}`);
    
    try {
      // Get trending topics
      const trends = await this.twitterConnector.getTrends();
      logger.info(`Retrieved ${trends.length} trending topics`);
      
      // Crypto-specific search terms
      const cryptoSearchTerms = [
        'bitcoin', 'ethereum', 'crypto', 'blockchain', 'web3', 
        'defi', 'nft', 'altcoin', 'token', 'solana', 'btc', 'eth'
      ];
      
      // Random selection of terms to search for variety
      const selectedTerms = cryptoSearchTerms
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);
      
      // Filter for crypto-related trends
      const cryptoTrends = trends.filter(trend => {
        const trendName = (trend.name || trend.query || '').toLowerCase();
        return cryptoSearchTerms.some(term => trendName.includes(term));
      }).slice(0, 3);
      
      // Combine trending topics with our search terms
      const topicsToExplore = [
        ...cryptoTrends.map(trend => trend.name || trend.query || ''),
        ...selectedTerms
      ];
      
      logger.info(`Selected ${topicsToExplore.length} topics to explore: ${topicsToExplore.join(', ')}`);
      
      // Max number of tweets to engage with per topic
      const maxTweetsPerTopic = 2;
      
      // Track interacted tweets to avoid duplicates
      const interactedTweetIds = new Set<string>();
      
      // Explore each topic
      for (const topic of topicsToExplore) {
        try {
          logger.info(`Searching for tweets about: ${topic}`);
          
          // Search for recent tweets on this topic
          const tweets = await this.twitterConnector.searchTweets(topic, 5);
          
          logger.info(`Found ${tweets.length} tweets about ${topic}`);
          
          // Filter out tweets from ourselves
          const myUsername = process.env.TWITTER_USERNAME;
          const validTweets = tweets.filter(t => 
            t.author.username?.toLowerCase() !== myUsername?.toLowerCase()
          );
          
          let interactionCount = 0;
          
          // Analyze and engage with each tweet
          for (const tweet of validTweets) {
            // Skip if we've reached interaction limit for this topic
            if (interactionCount >= maxTweetsPerTopic) break;
            
            // Skip if no ID or we've already interacted
            if (!tweet.id || interactedTweetIds.has(tweet.id)) continue;
            
            try {
              // Skip tweets with no text
              if (!tweet.text) {
                logger.debug(`Skipping tweet without text content from @${tweet.author.username || 'unknown'}`);
                continue;
              }
              
              // Analyze the tweet
              const analysis = await this.baseAgent.run({
                task: `Analyze this tweet about ${topic}:
                
Tweet from @${tweet.author.username || 'unknown'}: "${tweet.text}"

Key points to consider:
1. Is this high-quality content about ${topic}?
2. Is the information accurate and thoughtful?
3. Is this something our followers would benefit from seeing?
4. How should we engage to add value to the conversation?

Respond with ONE of these options only:
- "LIKE" - If the content is good but doesn't need more engagement
- "RETWEET" - If the content is excellent and worth sharing with followers
- "QUOTE: [your text]" - If you want to retweet with a comment (keep under 240 chars)
- "REPLY: [your text]" - If you want to reply to the tweet (keep under 240 chars)
- "IGNORE" - If the content is not relevant, low quality, or potentially harmful

Your analysis should be based on the tweet's quality, accuracy, and relevance to our crypto analysis focus.`
              });
              
              // Extract the decision from the response
              const response = analysis.response.trim();
              
              if (response.startsWith('LIKE')) {
                await this.twitterConnector.like(tweet.id);
                logger.info(`Liked tweet about ${topic} from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } 
              else if (response.startsWith('RETWEET')) {
                await this.twitterConnector.retweet(tweet.id);
                logger.info(`Retweeted tweet about ${topic} from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } 
              else if (response.startsWith('QUOTE:')) {
                const quoteText = response.substring(6).trim();
                await this.twitterConnector.quoteTweet(tweet.id, quoteText);
                logger.info(`Quote tweeted about ${topic} from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              } 
              else if (response.startsWith('REPLY:')) {
                const replyText = response.substring(6).trim();
                await this.twitterConnector.tweet(replyText, { replyTo: tweet.id });
                logger.info(`Replied to tweet about ${topic} from @${tweet.author.username}`);
                interactedTweetIds.add(tweet.id);
                interactionCount++;
              }
              else {
                logger.debug(`Ignoring tweet about ${topic} from @${tweet.author.username}`);
              }
              
              // Add a small delay to avoid Twitter rate limits
              await new Promise(resolve => setTimeout(resolve, 2000));
              
            } catch (error) {
              logger.error(`Error processing tweet about ${topic} from @${tweet.author.username}`, error);
            }
          }
          
          logger.info(`Completed exploration of topic ${topic} with ${interactionCount} interactions`);
          
        } catch (error) {
          logger.error(`Error exploring topic: ${topic}`, error);
        }
      }
      
      logger.info('Successfully completed topic exploration task');
      
    } catch (error) {
      logger.error('Error executing explore topics task', error);
      throw error;
    }
  }
  
  /**
   * Browse and engage with Twitter timeline
   * Helper method for follow-up tasks
   */
  /**
   * Setup interaction limiting system to prevent excessive replies
   * This method configures an hourly limit on interactions to make the agent more human-like
   */
  private setupInteractionLimiting(): void {
    try {
      if (this.interactionLimitingActive) {
        logger.info('Interaction limiting already active, skipping setup');
        return;
      }
      
      logger.info(`Setting up interaction limiting system (max ${this.hourlyInteractionLimit} replies per hour)`);
      
      // Initialize quote retweet tracking
      const now = new Date();
      this.lastQuoteTweetDay = now.getDate();
      this.quoteRetweetsToday = 0;
      this.quoteRetweetLimit = 0; // Start with zero allowed
      
      logger.warn('QUOTE RETWEETS DISABLED - Agent must demonstrate reliability first');
      
      // Reset interaction counter every hour
      setInterval(() => {
        const now = Date.now();
        const currentDate = new Date(now);
        const hoursSinceReset = (now - this.lastInteractionResetTime) / (1000 * 60 * 60);
        
        // Check if it's a new day to reset daily counters
        if (currentDate.getDate() !== this.lastQuoteTweetDay) {
          // Reset daily quote retweet counter
          const oldCount = this.quoteRetweetsToday;
          this.quoteRetweetsToday = 0;
          this.lastQuoteTweetDay = currentDate.getDate();
          
          // After first day, allow 1 quote retweet per day, but ONLY if rate limiting is working
          if (this.quoteRetweetLimit === 0 && this.recentTweets.length <= this.tweetRateLimit) {
            this.quoteRetweetLimit = 1;
            logger.info(`Enabling limited quote retweet (1 per day) after first day of successful operation`);
          }
          
          logger.info(`Daily quote retweet counter reset. Previous: ${oldCount}, New: 0/${this.quoteRetweetLimit}`);
        }
        
        if (hoursSinceReset >= 1) {
          const oldCount = this.hourlyInteractions;
          this.hourlyInteractions = 0;
          this.lastInteractionResetTime = now;
          logger.info(`Hourly interaction counter reset. Previous: ${oldCount}, New: 0`);
        }
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      this.interactionLimitingActive = true;
      logger.info('Interaction limiting system active');
    } catch (error) {
      logger.error('Error setting up interaction limiting', error);
    }
  }
  
  /**
   * Check if we're within interaction limits
   * @returns boolean True if we can interact, false if we've hit our limit
   */
  private canInteract(): boolean {
    // If limiting isn't active yet, allow interactions
    if (!this.interactionLimitingActive) return true;
    
    // Check if we're under the limit
    if (this.hourlyInteractions < this.hourlyInteractionLimit) {
      return true;
    }
    
    // We've hit the limit
    logger.info(`Hourly interaction limit reached (${this.hourlyInteractions}/${this.hourlyInteractionLimit}). Waiting until next hour.`);
    return false;
  }
  
  /**
   * Check if we can post a new tweet based on rate limiting
   * @returns boolean True if we can tweet, false if we've hit the rate limit
   */
  private canTweet(): boolean {
    // Clean up old tweet timestamps that are outside our timeframe window
    const now = Date.now();
    const timeframeStart = now - this.tweetRateLimitTimeframe;
    
    // Remove tweets older than our timeframe
    this.recentTweets = this.recentTweets.filter(timestamp => timestamp > timeframeStart);
    
    // Check if we're under the tweet rate limit
    if (this.recentTweets.length < this.tweetRateLimit) {
      return true;
    }
    
    // Calculate time until next available tweet slot
    const oldestTweet = this.recentTweets[0];
    const timeUntilAvailable = (oldestTweet + this.tweetRateLimitTimeframe) - now;
    const minutesUntilAvailable = Math.ceil(timeUntilAvailable / 60000);
    
    logger.info(`Tweet rate limit reached (${this.recentTweets.length}/${this.tweetRateLimit} in ${this.tweetRateLimitTimeframe/60000} minutes). Next slot available in ~${minutesUntilAvailable} minutes.`);
    return false;
  }
  
  /**
   * Check if we can quote retweet based on daily limit
   * @returns boolean True if we can quote retweet, false if at the limit
   */
  private canQuoteRetweet(): boolean {
    // First, ensure the day counter is current
    const now = new Date();
    if (now.getDate() !== this.lastQuoteTweetDay) {
      this.quoteRetweetsToday = 0;
      this.lastQuoteTweetDay = now.getDate();
    }
    
    // Check if we're under the limit
    const canQuote = this.quoteRetweetsToday < this.quoteRetweetLimit;
    if (!canQuote) {
      logger.warn(`Quote retweet limit reached: ${this.quoteRetweetsToday}/${this.quoteRetweetLimit} for today.`);
    }
    
    return canQuote;
  }
  
  /**
   * Track a new quote retweet against daily limit
   */
  private trackQuoteRetweet(): void {
    // Update the counter
    this.quoteRetweetsToday++;
    
    logger.info(`Quote retweet tracked. Current count: ${this.quoteRetweetsToday}/${this.quoteRetweetLimit} for today.`);
  }
  
  /**
   * Track a new tweet for rate limiting
   */
  private async trackTweet(): Promise<void> {
    const now = Date.now();
    this.recentTweets.push(now);
    
    // Keep the array sorted by time for easier management
    this.recentTweets.sort((a, b) => a - b);
    
    // Clean up old tweets outside the time window
    this.recentTweets = this.recentTweets.filter(timestamp => {
      return now - timestamp < this.tweetRateLimitTimeframe;
    });
    
    logger.info(`Tweet tracked. Current count: ${this.recentTweets.length}/${this.tweetRateLimit} in the last ${this.tweetRateLimitTimeframe/60000} minutes.`);
    
    // Calculate when next tweet slot will be available
    if (this.recentTweets.length >= this.tweetRateLimit) {
      const oldestTweetTime = this.recentTweets[0];
      const nextSlotTime = oldestTweetTime + this.tweetRateLimitTimeframe;
      const timeToNextSlotSec = Math.ceil((nextSlotTime - now) / 1000);
      
      if (timeToNextSlotSec > 0) {
        logger.info(`Rate limit reached. Next tweet slot will be available in ${timeToNextSlotSec} seconds.`);
      }
    }
    
    // Add a substantial forced delay after tweeting to prevent rapid successive tweets
    // This is an extra safety measure beyond rate limiting
    const postDelay = 15000 + (Math.random() * 15000); // 15-30 seconds
    logger.info(`Adding mandatory post-tweet delay of ${Math.round(postDelay/1000)} seconds`);
    await new Promise(resolve => setTimeout(resolve, postDelay));
  }
  
  /**
   * Increment the interaction counter when we reply/engage
   */
  private async trackInteraction(): Promise<void> {
    if (!this.interactionLimitingActive) return;
    
    this.hourlyInteractions++;
    logger.info(`Interaction tracked. Current count: ${this.hourlyInteractions}/${this.hourlyInteractionLimit} this hour`);
    
    // Also track interactions as tweets for overall rate limiting
    await this.trackTweet(); // Use await to ensure the delay happens
  }
  
  /**
   * Browse and engage with the Twitter timeline
   */
  private async browseAndEngageWithTimeline(): Promise<void> {
    try {
      logger.info('Browsing Twitter timeline for relevant content');
      
      // Check if we can interact or if we've hit our hourly limit
      if (!this.canInteract()) {
        logger.info('Skipping timeline browsing due to hourly interaction limit');
        return;
      }
      
      // Get tweets from the home timeline
      let timelineTweets = await this.twitterConnector.getHomeTimeline(10);
      logger.info(`Retrieved ${timelineTweets.length} tweets from home timeline`);
      
      // If timeline is empty, fall back to search
      if (timelineTweets.length === 0) {
        logger.warn('No tweets found in timeline, using search fallback for follow-up task');
        
        // Use a random crypto term for search
        const searchTerm = ['crypto', 'bitcoin', 'ethereum', 'defi'][Math.floor(Math.random() * 4)];
        try {
          timelineTweets = await this.twitterConnector.searchTweets(searchTerm, 10);
          logger.info(`Found ${timelineTweets.length} tweets for search term: ${searchTerm}`);
        } catch (searchError) {
          logger.error(`Error searching for ${searchTerm}`, searchError);
        }
      }
      
      if (timelineTweets.length === 0) {
        logger.warn('No tweets found in timeline or search fallback');
        return;
      }
      
      // Filter tweets related to crypto and blockchain
      const cryptoRelatedTweets = timelineTweets.filter(tweet => {
        // Skip tweets without text content
        if (!tweet || !tweet.text) return false;
        
        const text = tweet.text.toLowerCase();
        const isRelevant = this.settings.focusAreas.some(area => 
          text.includes(area.toLowerCase())
        );
        
        // Check for token symbols using $ prefix
        const hasCryptoSymbol = text.match(/\$[A-Z0-9]{2,}/);
        
        // Common crypto terms
        const hasCryptoTerms = [
          'blockchain', 'token', 'crypto', 'defi', 'nft', 'web3', 'bitcoin', 'ethereum',
          'altcoin', 'btc', 'eth', 'sol', 'trading', 'market', 'chain'
        ].some(term => text.includes(term));
        
        return isRelevant || !!hasCryptoSymbol || hasCryptoTerms;
      });
      
      logger.info(`Found ${cryptoRelatedTweets.length} crypto-related tweets in collection`);
      
      // Use all tweets but limit interactions if no crypto tweets found
      const tweetsToProcess = cryptoRelatedTweets.length > 0 ? 
                             cryptoRelatedTweets : 
                             timelineTweets.slice(0, 3);
      
      // Calculate how many interactions we can do this time (max 3, but respecting hourly limit)
      const maxInteractions = Math.min(3, this.hourlyInteractionLimit - this.hourlyInteractions);
      let interactionCount = 0;
      
      // Process the filtered tweets
      for (const tweet of tweetsToProcess) {
        // Skip processing if we've reached our interaction limit
        if (interactionCount >= maxInteractions) break;
        
        // Skip if no tweet ID
        if (!tweet.id) continue;
        
        // Skip our own tweets
        const myUsername = process.env.TWITTER_USERNAME;
        if (tweet.author.username?.toLowerCase() === myUsername?.toLowerCase()) continue;
        
        try {
          // Skip tweets with no text
          if (!tweet.text) {
            logger.debug(`Skipping tweet without text content from @${tweet.author.username || 'unknown'}`);
            continue;
          }
          
          // For follow-up tasks, we'll mostly just like relevant content
          // Check if content is worth liking
          const analysis = await this.baseAgent.run({
            task: `Analyze this tweet:
            
Tweet from @${tweet.author.username || 'unknown'}: "${tweet.text}"

Is this tweet worth liking based on relevance to crypto markets and quality of information?
Answer with either "LIKE" or "IGNORE".`
          });
          
          // Extract the decision
          const response = analysis.response.trim();
          
          if (response.includes('LIKE')) {
            await this.twitterConnector.like(tweet.id);
            logger.info(`Liked timeline tweet from @${tweet.author.username}`);
            interactionCount++;
            
            // Track this as an interaction (with await to ensure delay)
            await this.trackInteraction();
            
            // Occasionally follow user (10% chance during follow-up task)
            if (Math.random() < 0.1 && tweet.author.username) {
              try {
                await this.twitterConnector.follow(tweet.author.username);
                logger.info(`Followed user @${tweet.author.username} during follow-up task`);
              } catch (followError) {
                logger.debug(`Error following user @${tweet.author.username}`, followError);
              }
            }
          } else {
            logger.debug(`Ignoring timeline tweet from @${tweet.author.username}`);
          }
          
          // Add a small delay between processing tweets
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Error processing timeline tweet from @${tweet.author.username}`, error);
        }
      }
      
      logger.info(`Completed timeline browsing with ${interactionCount} interactions`);
    } catch (error) {
      logger.error('Error browsing timeline', error);
    }
  }
  
  /**
   * Follow up on major cryptocurrency predictions
   */
  /**
   * Generate a price forecast for a major cryptocurrency
   * This is a key learning function that enables our agent to make predictions
   * and later evaluate their accuracy, building a track record and memory of
   * successful forecast patterns
   * 
   * @param isStartup Whether this is being called during agent startup
   */
  private async generateMajorCryptoForecast(isStartup: boolean = false): Promise<void> {
    logger.info(`Generating price forecast for a major cryptocurrency (startup mode: ${isStartup})`);
    
    try {
      // Check for recent forecasts to avoid duplicates - but only if not in startup mode
      if (!isStartup) {
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        const recentForecasts = await this.memory.searchNotes({
          query: "forecast major crypto",
          category: "forecast",
          limit: 3
        });
        
        // If we've made a forecast recently, don't make another one
        if (recentForecasts.length > 0 && recentForecasts[0].timestamp > sixHoursAgo) {
          logger.info('Found recent forecast, skipping new generation');
          return;
        }
      } else {
        // The startup deduplication logic was moved to the crypto selection block
        // to fix TypeScript errors and improve code organization
        logger.info('In startup mode - will check for recently forecast cryptos during selection');
      }
      
      // List of major cryptocurrencies to prioritize
      const majorCryptos = [
        { name: 'Ethereum', id: 'ethereum' },
        { name: 'Solana', id: 'solana' },
        { name: 'Bitcoin', id: 'bitcoin' },
        { name: 'Avalanche', id: 'avalanche-2' }
      ];
      
      // Determine eligible cryptos based on startup mode and recent forecasts
      let eligibleCryptos = [...majorCryptos]; // Start with all
      let selectedCrypto: {name: string; id: string} = majorCryptos[0]; // Default to first crypto
      
      // Get recently forecast cryptos if in startup mode
      const recentlyForecastCryptos = new Set<string>();
      if (isStartup) {
        try {
          // This operation was moved here from the earlier block
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recentForecasts = await this.memory.searchNotes({
            query: "forecast major crypto",
            category: "forecast",
            limit: 10 // Look at more forecasts to avoid repetition
          });
          
          // Extract recently forecast cryptos to avoid
          recentForecasts.forEach(forecast => {
            if (forecast.timestamp > oneDayAgo) {
              // Extract crypto from title
              const cryptoMatch = forecast.title.match(/Forecast: (.+)/);
              if (cryptoMatch && cryptoMatch[1]) {
                recentlyForecastCryptos.add(cryptoMatch[1].toLowerCase());
              }
              
              // Also check tags
              forecast.tags.forEach(tag => {
                if (tag === 'bitcoin' || tag === 'ethereum' || tag === 'solana' || 
                    tag === 'avalanche-2' || tag === 'cardano' || tag === 'binancecoin') {
                  recentlyForecastCryptos.add(tag);
                }
              });
            }
          });
          
          logger.info(`Found ${recentlyForecastCryptos.size} recently forecast cryptos to avoid: ${Array.from(recentlyForecastCryptos).join(', ')}`);
          
          // Filter out cryptos we've recently forecast
          if (recentlyForecastCryptos.size > 0) {
            eligibleCryptos = majorCryptos.filter(crypto => 
              !recentlyForecastCryptos.has(crypto.id) && 
              !recentlyForecastCryptos.has(crypto.name.toLowerCase())
            );
          }
        } catch (error) {
          logger.error('Error getting recently forecast cryptos:', error);
          // Continue with all cryptos if there's an error
        }
        
        logger.info(`After filtering out recent cryptos, ${eligibleCryptos.length} are eligible for forecast`);
        
        // If we have eligible options, use them; otherwise don't filter
        if (eligibleCryptos.length > 0) {
          // Choose randomly from eligible cryptos with equal weights
          const randomIndex = Math.floor(Math.random() * eligibleCryptos.length);
          selectedCrypto = eligibleCryptos[randomIndex];
          logger.info(`Selected ${selectedCrypto.name} for forecast from eligible options`);
        }
      }
      
      // If we haven't selected a crypto yet (either not startup mode or no eligible options)
      if (!selectedCrypto) {
        // Choose one randomly with higher preference for ETH and SOL
        const weights = [0.4, 0.4, 0.1, 0.1]; // Higher weights for ETH and SOL
        
        // Weighted random selection
        let randomValue = Math.random();
        let cumulativeWeight = 0;
        
        for (let i = 0; i < majorCryptos.length; i++) {
          cumulativeWeight += weights[i];
          if (randomValue <= cumulativeWeight) {
            selectedCrypto = majorCryptos[i];
            break;
          }
        }
        
        // Fallback
        if (!selectedCrypto) {
          selectedCrypto = majorCryptos[0]; // Default to Ethereum
        }
      }
      
      // Check memory to avoid forecasting the same crypto repeatedly
      const lastDay = Date.now() - 24 * 60 * 60 * 1000;
      const recentForecasts = await this.memory.searchNotes({
        query: `forecast ${selectedCrypto.name}`,
        category: "forecast",
        limit: 1
      });
      
      // If we've recently forecasted this crypto, try another one
      if (recentForecasts.length > 0 && recentForecasts[0].timestamp > lastDay) {
        logger.info(`Recently forecasted ${selectedCrypto.name}, trying a different crypto`);
        // Choose a different crypto
        for (const crypto of majorCryptos) {
          if (crypto.id !== selectedCrypto.id) {
            const otherCryptoForecasts = await this.memory.searchNotes({
              query: `forecast ${crypto.name}`,
              category: "forecast",
              limit: 1
            });
            
            if (otherCryptoForecasts.length === 0 || otherCryptoForecasts[0].timestamp < lastDay) {
              selectedCrypto = crypto;
              break;
            }
          }
        }
      }
      
      logger.info(`Selected ${selectedCrypto.name} for price forecast`);
      
      // Get current price data - retry up to 3 times if there are issues
      let priceData;
      let fetchSuccess = false;
      let attempts = 0;
      
      while (!fetchSuccess && attempts < 3) {
        attempts++;
        try {
          logger.info(`Fetching ${selectedCrypto.name} price data from CoinGecko (attempt ${attempts})`);
          
          // Fetch the price data
          const priceDataResult = await this.coinGeckoTool.execute({
            tokenId: selectedCrypto.id
          });
          
          // Parse the result
          try {
            priceData = JSON.parse(priceDataResult);
            
            // Check if response is valid
            if (typeof priceData === 'object' && priceData.price_usd && !isNaN(priceData.price_usd)) {
              fetchSuccess = true;
              logger.info(`Successfully fetched ${selectedCrypto.name} price: $${priceData.price_usd}`);
            } else if (typeof priceData === 'string' && priceData.startsWith('Error:')) {
              logger.warn(`Error in CoinGecko response for ${selectedCrypto.name}: ${priceData}`);
              // Will retry
            } else {
              logger.warn(`Invalid CoinGecko data format for ${selectedCrypto.name}`);
              // Will retry
            }
          } catch (parseError) {
            logger.warn(`Error parsing price data for ${selectedCrypto.name}:`, parseError);
            // Will retry
          }
          
          // Add slight delay between retries
          if (!fetchSuccess && attempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (fetchError) {
          logger.warn(`Error fetching data for ${selectedCrypto.name} (attempt ${attempts}):`, fetchError);
        }
      }
      
      // If still no success after retries, try a different crypto
      if (!fetchSuccess) {
        logger.error(`Failed to fetch price data for ${selectedCrypto.name} after ${attempts} attempts`);
        
        // Try a different cryptocurrency instead
        const backupOptions = majorCryptos.filter(crypto => crypto.id !== selectedCrypto.id);
        if (backupOptions.length > 0) {
          // Randomly select an alternative
          const backupCrypto = backupOptions[Math.floor(Math.random() * backupOptions.length)];
          logger.info(`Trying backup cryptocurrency: ${backupCrypto.name}`);
          
          try {
            // Get price data for backup crypto
            const backupPriceResult = await this.coinGeckoTool.execute({
              tokenId: backupCrypto.id
            });
            
            // Parse the result
            try {
              priceData = JSON.parse(backupPriceResult);
              if (typeof priceData === 'object' && priceData.price_usd) {
                fetchSuccess = true;
                selectedCrypto = backupCrypto; // Use the backup crypto
                logger.info(`Successfully fell back to ${selectedCrypto.name} price: $${priceData.price_usd}`);
              } else {
                logger.error(`Still couldn't get valid price data for backup crypto ${backupCrypto.name}`);
                return; // Give up
              }
            } catch (backupParseError) {
              logger.error(`Error parsing backup price data`, backupParseError);
              return; // Give up
            }
          } catch (backupFetchError) {
            logger.error(`Error fetching backup price data`, backupFetchError);
            return; // Give up
          }
        } else {
          logger.error(`No backup cryptocurrency options available`);
          return; // Give up
        }
      }
      
      // Double-check we have valid price data
      if (!priceData || !priceData.price_usd) {
        logger.error(`No valid price data for ${selectedCrypto.name}, aborting forecast`);
        return;
      }
      
      // Get additional market context using Tavily search
      const searchQuery = `${selectedCrypto.name} crypto price analysis forecast predictions next 24 hours`;
      const searchResults = await this.searchTool.execute({
        query: searchQuery,
        maxResults: 3,
        includeAnswer: true
      });
      
      // Calculate target timeframe
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      
      const todayFormatted = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const tomorrowFormatted = tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Generate the forecast
      const forecastPrompt = `
        As a crypto analyst, create a PRICE FORECAST for ${selectedCrypto.name} ($${selectedCrypto.id.toUpperCase()}) 
        based on this current data:
        
        Current market data (from CoinGecko):
        - Current price: $${priceData.price_usd}
        - 24h price change: ${priceData.price_change_24h_percent.toFixed(2)}%
        - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
        - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
        
        Recent market context:
        ${searchResults.answer || 'No market context available'}
        
        Create a tweet with your price forecast (${todayFormatted} - ${tomorrowFormatted}) that:
        1. Clearly states this is your 24-hour price forecast for ${selectedCrypto.name}
        2. Includes the current price
        3. Gives a specific price target or range for tomorrow
        4. Mentions 1-2 key factors influencing your forecast
        5. Uses $${selectedCrypto.id.toUpperCase()} format
        6. Is concise (under 240 chars)
        7. Does NOT include hashtags
        8. IMPORTANT: Do not include @mentions of any Twitter users including yourself
        
        Make sure your forecast is SPECIFIC with a clear price target that can be verified tomorrow.
        Only return the tweet text.
      `;
      
      const tweetResult = await this.baseAgent.run({ task: forecastPrompt });
      
      // Post the forecast tweet
      try {
        // Check for any self-mentions that might trigger our event handlers
        const myUsername = process.env.TWITTER_USERNAME;
        let tweetText = tweetResult.response;
        
        // Check if tweet contains mentions of ourselves to avoid self-replies
        if (myUsername && tweetText.toLowerCase().includes(`@${myUsername.toLowerCase()}`)) {
          logger.warn(`Tweet contains mention to ourselves, removing @${myUsername} to avoid self-reply loop`);
          // Remove the self mention
          tweetText = tweetText.replace(new RegExp(`@${myUsername}`, 'gi'), selectedCrypto.name);
        }
        
        const tweetId = await this.twitterConnector.tweet(tweetText);
        logger.info(`Posted 24-hour forecast tweet for ${selectedCrypto.name}`, { tweetId });
        
        // Store this forecast in our enhanced memory system with better tagging and tracking
        const forecastId = `forecast_${Date.now()}_${selectedCrypto.id}`;
        await this.memory.addNote({
          title: `Forecast: ${selectedCrypto.name}`,
          content: `
            24-hour forecast (${todayFormatted} - ${tomorrowFormatted}):
            
            Tweet: ${tweetText}
            
            Starting data:
            - Price: $${priceData.price_usd}
            - 24h change: ${priceData.price_change_24h_percent.toFixed(2)}%
            - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
            - Volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
            
            Forecast ID: ${forecastId}
            Created: ${new Date().toISOString()}
            Target date: ${tomorrow.toISOString()}
            Verified: false
          `,
          category: 'forecast',
          tags: [
            'crypto', 
            'forecast', 
            selectedCrypto.id, 
            selectedCrypto.name.toLowerCase(),
            'major', 
            'daily', 
            'coingecko', 
            'tweet', 
            forecastId,
            `price_${priceData.price_usd < 1 ? 'micro' : priceData.price_usd < 10 ? 'low' : priceData.price_usd < 1000 ? 'mid' : 'high'}`,
            `trend_${priceData.price_change_24h_percent > 5 ? 'bullish' : priceData.price_change_24h_percent < -5 ? 'bearish' : 'neutral'}`,
            `forecast_${todayFormatted.replace(/\s/g, '_')}`,
            Date.now().toString()
          ],
          timestamp: Date.now()
        });
        
        // Also update our forecast tracking database for learning purposes
        try {
          // Get existing forecast tracking data
          const forecastTrackingNote = await this.memory.searchNotes({
            query: "forecast tracking master list",
            category: "prediction_tracking",
            limit: 1
          });
          
          // Create or update tracking data
          let forecastTrackingData: Record<string, any> = {};
          
          if (forecastTrackingNote.length > 0) {
            try {
              forecastTrackingData = JSON.parse(forecastTrackingNote[0].content);
              if (typeof forecastTrackingData !== 'object') {
                forecastTrackingData = {};
              }
            } catch (parseError) {
              logger.error(`Error parsing forecast tracking data`, parseError);
              forecastTrackingData = {};
            }
          }
          
          // Add new forecast to tracking
          forecastTrackingData[forecastId] = {
            crypto: {
              id: selectedCrypto.id,
              name: selectedCrypto.name
            },
            createdAt: Date.now(),
            targetDate: tomorrow.getTime(),
            startingPrice: priceData.price_usd,
            startingVolume: priceData.volume_24h_usd,
            startingMarketCap: priceData.market_cap_usd,
            priceChange24h: priceData.price_change_24h_percent,
            tweet: tweetText,
            verified: false,
            outcome: null
          };
          
          // Save updated tracking data
          await this.memory.addNote({
            title: `Forecast Tracking Master List`,
            content: JSON.stringify(forecastTrackingData),
            category: 'prediction_tracking',
            tags: ['forecast', 'tracking', 'master_list', 'system', 'learning'],
            timestamp: Date.now()
          });
          
          logger.info(`Updated forecast tracking system with new prediction for ${selectedCrypto.name}`);
        } catch (trackingError) {
          logger.error(`Error updating forecast tracking`, trackingError);
        }
      } catch (error) {
        logger.error(`Error posting forecast tweet for ${selectedCrypto.name}`, error);
      }
    } catch (error) {
      logger.error('Error generating major crypto forecast:', error);
    }
  }
  
  /**
   * Follow up on previous major crypto forecasts
   */
  private async followUpOnMajorCryptoForecasts(): Promise<void> {
    try {
      logger.info('Checking for crypto forecasts to follow up on');
      
      // Get forecasts from memory
      const forecasts = await this.memory.searchNotes({
        query: "forecast major crypto",
        category: "forecast",
        limit: 5
      });
      
      // Filter for forecasts that are between 12-36 hours old (should be followed up on)
      const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000; 
      const thirtySixHoursAgo = Date.now() - 36 * 60 * 60 * 1000;
      
      const eligibleForecasts = forecasts.filter(forecast => 
        forecast.timestamp < twelveHoursAgo && 
        forecast.timestamp > thirtySixHoursAgo
      );
      
      logger.info(`Found ${eligibleForecasts.length} eligible forecasts to follow up on`);
      
      // Process each eligible forecast
      for (const forecast of eligibleForecasts) {
        try {
          // Check if we've already followed up on this forecast
          const forecastId = forecast.id;
          const existingFollowUps = await this.memory.searchNotes({
            query: `follow-up ${forecastId}`,
            category: "follow_up",
            limit: 1
          });
          
          if (existingFollowUps.length > 0) {
            logger.info(`Already followed up on forecast ${forecastId}, skipping`);
            continue;
          }
          
          // Extract crypto name from the title
          const cryptoNameMatch = forecast.title.match(/Forecast: (.+)/);
          if (!cryptoNameMatch) continue;
          
          const cryptoName = cryptoNameMatch[1];
          logger.info(`Following up on forecast for ${cryptoName}`);
          
          // Try to map the name to CoinGecko ID
          let coinGeckoId;
          if (cryptoName.toLowerCase() === 'bitcoin') coinGeckoId = 'bitcoin';
          else if (cryptoName.toLowerCase() === 'ethereum') coinGeckoId = 'ethereum';
          else if (cryptoName.toLowerCase() === 'solana') coinGeckoId = 'solana';
          else if (cryptoName.toLowerCase() === 'binance coin') coinGeckoId = 'binancecoin';
          else if (cryptoName.toLowerCase() === 'xrp') coinGeckoId = 'ripple';
          else if (cryptoName.toLowerCase() === 'cardano') coinGeckoId = 'cardano';
          else if (cryptoName.toLowerCase() === 'avalanche') coinGeckoId = 'avalanche-2';
          else if (cryptoName.toLowerCase() === 'polkadot') coinGeckoId = 'polkadot';
          else {
            // If not a known major crypto, check the tags
            const coinGeckoIdTag = forecast.tags.find(tag => 
              !['crypto', 'forecast', 'major', 'daily', 'coingecko'].includes(tag)
            );
            coinGeckoId = coinGeckoIdTag || cryptoName.toLowerCase();
          }
          
          // Get current price data
          const priceDataResult = await this.coinGeckoTool.execute({
            tokenId: coinGeckoId
          });
          
          // Parse the result
          let priceData;
          try {
            priceData = JSON.parse(priceDataResult);
          } catch (parseError) {
            logger.error(`Error parsing price data for ${cryptoName}:`, parseError);
            continue;
          }
          
          // Check if there was an error
          if (typeof priceData === 'string' && priceData.startsWith('Error:')) {
            logger.error(`Error fetching price data for ${cryptoName}: ${priceData}`);
            continue;
          }
          
          // Extract the original tweet and forecast data
          const tweetMatch = forecast.content.match(/Tweet: (.+?)(?:\n|$)/s);
          const startingPriceMatch = forecast.content.match(/Price: \$([0-9.,]+)/);
          
          if (!tweetMatch || !startingPriceMatch) {
            logger.error(`Couldn't extract necessary data from forecast for ${cryptoName}`);
            continue;
          }
          
          const originalTweet = tweetMatch[1].trim();
          const startingPrice = parseFloat(startingPriceMatch[1].replace(/,/g, ''));
          const currentPrice = parseFloat(priceData.price_usd);
          
          // Calculate price change
          const priceChange = currentPrice - startingPrice;
          const priceChangePercent = (priceChange / startingPrice) * 100;
          
          // Generate follow-up tweet
          const followUpPrompt = `
            You made this 24-hour forecast for ${cryptoName} yesterday:
            "${originalTweet}"
            
            RESULTS:
            - Starting price: $${startingPrice.toFixed(2)}
            - Current price: $${currentPrice.toFixed(2)}
            - Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)
            
            Current market data:
            - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
            - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
            
            Create a follow-up tweet (under 240 chars) that:
            1. References your previous forecast
            2. Clearly states whether your prediction was CORRECT or INCORRECT
            3. Mentions the EXACT price movement that occurred
            4. Briefly explains the factors that influenced the outcome
            5. Maintains a professional tone even if your forecast was wrong
            6. Uses $${cryptoName.toUpperCase()} format
            7. IMPORTANT: Do not include @mentions of any Twitter users including yourself
            
            Only return the tweet text.
          `;
          
          const tweetResult = await this.baseAgent.run({ task: followUpPrompt });
          
          // Post the follow-up tweet
          try {
            // Check for any self-mentions that might trigger our event handlers
            const myUsername = process.env.TWITTER_USERNAME;
            let tweetText = tweetResult.response;
            
            // Check if tweet contains mentions of ourselves to avoid self-replies
            if (myUsername && tweetText.toLowerCase().includes(`@${myUsername.toLowerCase()}`)) {
              logger.warn(`Follow-up tweet contains mention to ourselves, removing @${myUsername} to avoid self-reply loop`);
              // Remove the self mention
              tweetText = tweetText.replace(new RegExp(`@${myUsername}`, 'gi'), cryptoName);
            }
            
            const tweetId = await this.twitterConnector.tweet(tweetText);
            logger.info(`Posted follow-up tweet for ${cryptoName} forecast`, { tweetId });
            
            // Store the follow-up in memory
            await this.memory.addNote({
              title: `Followed-up: ${cryptoName} Forecast`,
              content: `
                Original forecast: ${originalTweet}
                
                Follow-up: ${tweetText}
                
                Results:
                - Starting price: $${startingPrice.toFixed(2)}
                - Final price: $${currentPrice.toFixed(2)}
                - Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)
              `,
              category: 'follow_up',
              tags: ['crypto', 'follow-up', coinGeckoId, 'forecast', 'coingecko', forecastId],
              timestamp: Date.now()
            });
            
            // Generate a new forecast after following up
            await this.generateMajorCryptoForecast();
            
          } catch (error) {
            logger.error(`Error posting follow-up tweet for ${cryptoName}`, error);
          }
          
          // Add a delay between follow-ups
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (forecastError) {
          logger.error('Error following up on forecast:', forecastError);
        }
      }
    } catch (error) {
      logger.error('Error in followUpOnMajorCryptoForecasts:', error);
    }
  }
  
  /**
   * Follow up on previous major crypto predictions (weekly predictions)
   * Kept for backward compatibility
   */
  private async followUpOnMajorCryptoPredictions(): Promise<void> {
    try {
      logger.info('Checking for major crypto predictions to follow up on');
      
      // Get predictions from memory
      const predictions = await this.memory.searchNotes({
        query: "prediction major coingecko",
        category: "prediction",
        limit: 5
      });
      
      // Filter for predictions that are at least 24 hours old
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const eligiblePredictions = predictions.filter(pred => pred.timestamp < oneDayAgo);
      
      logger.info(`Found ${eligiblePredictions.length} eligible major crypto predictions to follow up on`);
      
      // Process each eligible prediction
      for (const prediction of eligiblePredictions) {
        try {
          // Extract crypto name from the title
          const cryptoNameMatch = prediction.title.match(/Prediction: (.+)/);
          if (!cryptoNameMatch) continue;
          
          const cryptoName = cryptoNameMatch[1];
          logger.info(`Following up on prediction for ${cryptoName}`);
          
          // Try to map the name to CoinGecko ID
          let coinGeckoId;
          if (cryptoName.toLowerCase() === 'bitcoin') coinGeckoId = 'bitcoin';
          else if (cryptoName.toLowerCase() === 'ethereum') coinGeckoId = 'ethereum';
          else if (cryptoName.toLowerCase() === 'solana') coinGeckoId = 'solana';
          else if (cryptoName.toLowerCase() === 'binance coin') coinGeckoId = 'binancecoin';
          else if (cryptoName.toLowerCase() === 'xrp') coinGeckoId = 'ripple';
          else if (cryptoName.toLowerCase() === 'cardano') coinGeckoId = 'cardano';
          else if (cryptoName.toLowerCase() === 'avalanche') coinGeckoId = 'avalanche-2';
          else if (cryptoName.toLowerCase() === 'polkadot') coinGeckoId = 'polkadot';
          else {
            // If not a known major crypto, check the tags
            const coinGeckoIdTag = prediction.tags.find(tag => 
              !['crypto', 'prediction', 'major', 'coingecko'].includes(tag)
            );
            coinGeckoId = coinGeckoIdTag || cryptoName.toLowerCase();
          }
          
          // Get current price data
          const priceDataResult = await this.coinGeckoTool.execute({
            tokenId: coinGeckoId
          });
          
          // Parse the result
          let priceData;
          try {
            priceData = JSON.parse(priceDataResult);
          } catch (parseError) {
            logger.error(`Error parsing price data for ${cryptoName}:`, parseError);
            continue;
          }
          
          // Check if there was an error
          if (typeof priceData === 'string' && priceData.startsWith('Error:')) {
            logger.error(`Error fetching price data for ${cryptoName}: ${priceData}`);
            continue;
          }
          
          // Extract the original tweet and prediction
          const tweetMatch = prediction.content.match(/Tweet: (.+?)\n/s);
          if (!tweetMatch) continue;
          
          const originalTweet = tweetMatch[1].trim();
          
          // Generate follow-up tweet
          const followUpPrompt = `
            You previously made this prediction about ${cryptoName}:
            "${originalTweet}"
            
            Current market data (from CoinGecko):
            - Current price: $${priceData.price_usd}
            - 24h price change: ${priceData.price_change_24h_percent.toFixed(2)}%
            - 24h volume: $${Math.round(priceData.volume_24h_usd).toLocaleString()}
            - Market cap: $${Math.round(priceData.market_cap_usd).toLocaleString()}
            
            Create a follow-up tweet (under 240 chars) that:
            1. References your previous prediction
            2. Compares it to current performance
            3. Updates your analysis based on new data
            4. Provides a revised outlook if needed
            5. Maintains a professional tone
            6. Includes the current price
            7. Uses $${cryptoName.toUpperCase()} format if appropriate
            8. IMPORTANT: Do not include @mentions of any Twitter users including yourself
            
            Only return the tweet text.
          `;
          
          const tweetResult = await this.baseAgent.run({ task: followUpPrompt });
          
          // Post the follow-up tweet
          try {
            // Check for any self-mentions that might trigger our event handlers
            const myUsername = process.env.TWITTER_USERNAME;
            let tweetText = tweetResult.response;
            
            // Check if tweet contains mentions of ourselves to avoid self-replies
            if (myUsername && tweetText.toLowerCase().includes(`@${myUsername.toLowerCase()}`)) {
              logger.warn(`Follow-up tweet contains mention to ourselves, removing @${myUsername} to avoid self-reply loop`);
              // Remove the self mention
              tweetText = tweetText.replace(new RegExp(`@${myUsername}`, 'gi'), cryptoName);
            }
            
            const tweetId = await this.twitterConnector.tweet(tweetText);
            logger.info(`Posted follow-up tweet about ${cryptoName} prediction`, { tweetId });
            
            // Update the prediction in memory to mark it as followed up
            await this.memory.addNote({
              title: `Followed-up: ${cryptoName}`,
              content: `
                Original prediction: ${originalTweet}
                
                Follow-up: ${tweetText}
                
                Current data:
                - Price: $${priceData.price_usd}
                - 24h change: ${priceData.price_change_24h_percent.toFixed(2)}%
              `,
              category: 'follow_up',
              tags: ['crypto', 'follow-up', coinGeckoId, 'prediction', 'coingecko'],
              timestamp: Date.now()
            });
          } catch (error) {
            logger.error(`Error posting follow-up tweet for ${cryptoName}`, error);
          }
          
          // Add a delay between follow-ups
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (predError) {
          logger.error('Error following up on prediction:', predError);
        }
      }
    } catch (error) {
      logger.error('Error in followUpOnMajorCryptoPredictions:', error);
    }
  }
  
  /**
   * Browse trending crypto topics
   * Helper method for follow-up tasks
   */
  private async exploreTrendingTopics(): Promise<void> {
    try {
      logger.info('Exploring trending crypto topics');
      
      // Try to get trending topics
      const trends = await this.twitterConnector.getTrends();
      logger.info(`Retrieved ${trends.length} trending topics`);
      
      // Look for crypto-related trends
      const cryptoTrends = trends.filter(trend => {
        const trendName = (trend.name || trend.query || '').toLowerCase();
        return ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'web3', 'defi', 'nft', 'token']
          .some(term => trendName.includes(term));
      });
      
      logger.info(`Found ${cryptoTrends.length} crypto-related trends`);
      
      // Select search term - either crypto trend or fallback
      let searchTerm: string;
      
      if (cryptoTrends.length > 0) {
        // Use a trending crypto topic
        const selectedTrend = cryptoTrends[Math.floor(Math.random() * cryptoTrends.length)];
        searchTerm = selectedTrend.name || selectedTrend.query || 'crypto';
        logger.info(`Selected trending crypto topic: ${searchTerm}`);
      } else {
        // Fallback to standard crypto terms
        searchTerm = ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'web3', 'defi']
          .sort(() => 0.5 - Math.random())[0]; // Randomly select one term
        logger.info(`No crypto trends found, using fallback term: ${searchTerm}`);
      }
      
      logger.info(`Searching for tweets about: ${searchTerm}`);
      
      // Search for recent tweets on this topic
      const tweets = await this.twitterConnector.searchTweets(searchTerm, 5);
      
      logger.info(`Found ${tweets.length} tweets about ${searchTerm}`);
      
      // Filter out tweets from ourselves
      const myUsername = process.env.TWITTER_USERNAME;
      const validTweets = tweets.filter(t => 
        t.author.username?.toLowerCase() !== myUsername?.toLowerCase()
      );
      
      // Limit interactions during follow-up
      const maxInteractions = 2;
      let interactionCount = 0;
      
      // Process tweets
      for (const tweet of validTweets) {
        // Skip if we've reached interaction limit
        if (interactionCount >= maxInteractions) break;
        
        // Skip if no ID
        if (!tweet.id) continue;
        
        try {
          // Skip tweets without text
          if (!tweet.text) {
            logger.debug(`Skipping tweet without text content from @${tweet.author.username || 'unknown'}`);
            continue;
          }
          
          // More detailed analysis for trending topics
          const analysis = await this.baseAgent.run({
            task: `Analyze this tweet about ${searchTerm}:
            
Tweet from @${tweet.author.username || 'unknown'}: "${tweet.text}"

How should we engage with this content?
Choose ONE option: "LIKE", "RETWEET", or "IGNORE".`
          });
          
          // Extract decision
          const response = analysis.response.trim().toUpperCase();
          
          if (response.includes('LIKE')) {
            await this.twitterConnector.like(tweet.id);
            logger.info(`Liked tweet about ${searchTerm} from @${tweet.author.username}`);
            interactionCount++;
            
            // Occasionally follow users who post about trending topics (15% chance)
            if (Math.random() < 0.15 && tweet.author.username) {
              try {
                await this.twitterConnector.follow(tweet.author.username);
                logger.info(`Followed user @${tweet.author.username} who posts about trending topics`);
              } catch (followError) {
                logger.debug(`Error following user @${tweet.author.username}`, followError);
              }
            }
          } else if (response.includes('RETWEET')) {
            await this.twitterConnector.retweet(tweet.id);
            logger.info(`Retweeted content about ${searchTerm} from @${tweet.author.username}`);
            interactionCount++;
          } else {
            logger.debug(`Ignoring tweet about ${searchTerm} from @${tweet.author.username}`);
          }
          
          // Add a small delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Error processing tweet about ${searchTerm} from @${tweet.author.username}`, error);
        }
      }
      
      logger.info(`Completed trending topic exploration with ${interactionCount} interactions`);
      
    } catch (error) {
      logger.error('Error exploring trending topics', error);
    }
  }
  
  /**
   * Get current status of the agent
   */
  getStatus(): any {
    const agentStatus = this.autonomousAgent.getStatus();
    
    return {
      isRunning: this.isRunning,
      agentStatus,
      currentGoals: this.currentGoals,
      currentTasks: this.currentTasks.map(task => task.description),
      settings: this.settings,
      twitterConnected: this.twitterConnector ? !!this.twitterConnector.config.username : false
    };
  }
  
  /**
   * Update agent settings
   * 
   * @param newSettings - New settings
   */
  updateSettings(newSettings: Partial<typeof this.settings>): void {
    this.settings = { ...this.settings, ...newSettings };
    logger.info('Updated agent settings', this.settings);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Create the autonomous agent
    const agent = new CryptoTwitterDirectAgent();
    
    // Initialize all components
    await agent.initialize();
    
    // Start the agent
    await agent.start();
    
    // Log status periodically
    setInterval(() => {
      const status = agent.getStatus();
      logger.info('Agent status', {
        running: status.isRunning,
        tasks: status.currentTasks.length
      });
    }, 30 * 60 * 1000); // Log every 30 minutes
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await agent.stop();
      process.exit(0);
    });
    
    // Log startup completion
    logger.info('Autonomous crypto agent started successfully!');
    logger.info('Press Ctrl+C to stop');
  } catch (error) {
    logger.error('Error starting autonomous crypto agent', error);
    process.exit(1);
  }
}

// Run the agent
if (require.main === module) {
  main();
}

export { CryptoTwitterDirectAgent };