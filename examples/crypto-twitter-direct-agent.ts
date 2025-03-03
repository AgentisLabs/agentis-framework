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
  
  // Memory system
  private embeddingService!: EmbeddingService;
  private pineconeStore!: PineconeStore;
  private memory!: SimpleMemorySystem;
  
  // State
  private isRunning: boolean = false;
  private currentGoals: string[] = [];
  private currentTasks: Array<{description: string; type?: string}> = [];
  
  // Default settings
  private settings = {
    tweetFrequencyHours: 1, // Tweet every hour
    analysisFrequencyHours: 2,
    researchDepth: 'medium',
    focusAreas: ['crypto', 'defi', 'blockchain', 'web3', 'finance', 'technology'] // More general focus areas
  };
  
  /**
   * Creates a new autonomous crypto agent with Twitter integration
   * 
   * @param personalityPath - Path to the personality file
   * @param model - OpenAI model to use (default: gpt-4o)
   */
  constructor(personalityPath: string = DEFAULT_PERSONA_PATH, model: string = 'gpt-4o') {
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
      "Monitor trending topics in crypto to identify new opportunities"
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
      'gpt-4o' // Use GPT-4o instead of Claude
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
        
        // Reply to the tweet
        await this.twitterConnector.tweet(response, { replyTo: tweet.id });
        logger.info('Replied to mention about tokens');
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
        
        // Reply to the tweet
        await this.twitterConnector.tweet(response, { replyTo: tweet.id });
        logger.info('Replied to general mention');
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
      
      // Reply to the tweet
      await this.twitterConnector.tweet(response, { replyTo: tweet.id });
      logger.info('Replied to reply');
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
        await this.twitterConnector.tweet(replyText, { replyTo: tweet.id });
        logger.info('Replied to tweet about crypto');
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
      
      // First do quick research to generate insight for startup tweet
      logger.info('Conducting initial research for startup tweet...');
      try {
        // Research trending tokens first (not just AI)
        await this.executeResearchTask({
          description: "Research trending crypto tokens for initial tweet",
          type: "research"
        });
        
        // Get the most recent research - don't filter specifically for AI
        const recentResearch = await this.memory.searchNotes({
          query: "token research crypto",
          category: "research",
          limit: 1
        });
        
        if (recentResearch.length > 0) {
          // Extract token name if possible
          const tokenMatch = recentResearch[0].title.match(/Research: ([A-Z0-9]+)/);
          const tokenSymbol = tokenMatch ? tokenMatch[1] : "AI crypto";
          
          logger.info(`Found research on ${tokenSymbol} for startup tweet`);
          
          // Determine if this is an AI-related token
          const isAiToken = tokenSymbol.toLowerCase().includes('ai') || 
                            recentResearch[0].content.toLowerCase().includes(' ai ') ||
                            recentResearch[0].content.toLowerCase().includes('artificial intelligence');
          
          // Generate tweet with actual insight
          const initialTweetResult = await this.baseAgent.run({
            task: `Based on this research about ${tokenSymbol}:
            
${recentResearch[0].content.substring(0, 500)}...

Create an insightful first tweet that:
1. Mentions a specific insight about ${tokenSymbol}
2. Establishes your expertise in crypto analysis
3. ${isAiToken ? 'Mentions your knowledge of this token specifically' : 'Focuses on blockchain technology and trends'}
4. Is concise (under 240 chars)
5. Uses $${tokenSymbol} format
6. Is professional but conversational
7. Does NOT include hashtags

The tweet should read as a substantive insight, not as an introduction.`
          });
          
          // Post directly using the Twitter connector
          const tweetId = await this.twitterConnector.tweet(initialTweetResult.response);
          
          // Log success
          logger.info('Initial insight tweet posted successfully!', { tweetId });
        } else {
          // Fallback to generic tweet if no research found
          logger.info('No research found, posting generic startup tweet');
          await this.postGenericStartupTweet();
        }
      } catch (researchError) {
        logger.error('Error researching for startup tweet', researchError);
        
        // Fallback to generic tweet
        await this.postGenericStartupTweet();
      }
      
      // Now execute the full plan
      await this.createAndExecutePlan();
      
      // Mark as running
      this.isRunning = true;
      
      logger.info('Autonomous agent started successfully');
      
      // Set up periodic planning on hourly schedule (based on tweetFrequencyHours setting)
      const planningIntervalMs = this.settings.tweetFrequencyHours * 60 * 60 * 1000;
      setInterval(async () => {
        if (this.isRunning) {
          logger.info(`Running scheduled plan (every ${this.settings.tweetFrequencyHours} hour(s))`);
          await this.createAndExecutePlan();
        }
      }, planningIntervalMs);
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
      logger.info('Posting generic startup tweet...');
      
      // Generate initial tweet - more general focus
      const initialTweetResult = await this.baseAgent.run({
        task: `Generate an insightful tweet announcing that you are online and monitoring the crypto markets, with expertise across various blockchain technologies.
        
The tweet should:
1. Establish your expertise in crypto and blockchain analysis
2. Mention your focus on emerging projects and trends
3. Invite engagement from followers
4. Be concise (under 240 chars)
5. Be professional but conversational
6. NOT include hashtags`
      });
      
      // Post directly using the Twitter connector
      const tweetId = await this.twitterConnector.tweet(initialTweetResult.response);
      
      // Log success
      logger.info('Generic startup tweet posted successfully!', { tweetId });
    } catch (tweetError) {
      logger.error('Error posting generic startup tweet', tweetError);
      
      // Try one more alternative approach if the generic tweet fails
      try {
        logger.info('Trying alternative approach for startup tweet...');
        await this.executeTweetTask({
          description: "Initial startup tweet about blockchain and crypto analysis",
          type: "tweet"
        });
      } catch (altError) {
        logger.error('Alternative tweet approach also failed', altError);
      }
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
      
      // Simplified approach with predefined tasks - removed follow_up task
      const plan = {
        id: `plan_${Date.now()}`,
        originalTask: "Research AI-related crypto tokens and share insights via Twitter",
        tasks: [
          {
            id: `task_${Date.now()}_1`,
            description: "Research trending AI-related tokens",
            dependencies: [],
            status: "pending", 
            type: "research"
          },
          {
            id: `task_${Date.now()}_2`,
            description: "Analyze the most promising tokens",
            dependencies: [`task_${Date.now()}_1`],
            status: "pending",
            type: "analyze"
          },
          {
            id: `task_${Date.now()}_3`,
            description: "Generate and post tweets with insights",
            dependencies: [`task_${Date.now()}_2`],
            status: "pending",
            type: "tweet"
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
    } else if (lowerDesc.includes('analyze') || lowerDesc.includes('analysis')) {
      return 'analyze';
    } else if (lowerDesc.includes('tweet') || lowerDesc.includes('post')) {
      return 'tweet';
    } else if (lowerDesc.includes('follow up') || lowerDesc.includes('track') || lowerDesc.includes('monitor')) {
      return 'follow_up';
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
      
      // Create a set to track tokens we've recently researched to avoid repetition
      const recentResearch = await this.memory.searchNotes({
        query: "token research",
        category: "research",
        limit: 10
      });
      
      const recentTokens = new Set(
        recentResearch
          .map(note => {
            const match = note.title.match(/Research: ([A-Z0-9]+)/);
            return match ? match[1] : null;
          })
          .filter(Boolean)
      );
      
      logger.info(`Found ${recentTokens.size} recently researched tokens to avoid duplicating`);
      
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
          
          // Store the research in memory
          await this.memory.addNote({
            title: `Research: ${token.symbol}`,
            content: `
              Token: ${token.name} (${token.symbol})
              Price: $${token.price.toFixed(6)}
              24h Change: ${token.priceChange24h.toFixed(2)}%
              
              Research Summary:
              ${searchResults.answer || 'No summary available'}
              
              Sources:
              ${sourcesList}
            `,
            category: 'research',
            tags: ['crypto', 'token', token.symbol, 'research'],
            timestamp: Date.now()
          });
          
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
      
      // Store the analysis in memory with appropriate tags
      const isAiToken = symbol.toLowerCase().includes('ai') || 
                        analysisResult.response.toLowerCase().includes(' ai ') ||
                        analysisResult.response.toLowerCase().includes('artificial intelligence');
      
      const tags = ['crypto', 'token', symbol, 'analysis'];
      // Only add AI tag if it's actually an AI token
      if (isAiToken) {
        tags.push('AI');
      }
      
      await this.memory.addNote({
        title: `Analysis: ${symbol}`,
        content: analysisResult.response,
        category: 'analysis',
        tags,
        timestamp: Date.now()
      });
      
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
        
        Only return the tweet text.
      `;
      
      // Generate tweet using base agent for reliability
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Use a random delay between 1-5 minutes for more natural posting pattern
      const minDelay = immediate ? 30000 : 120000; // 30 seconds or 2 minutes
      const maxDelay = immediate ? 90000 : 300000; // 1.5 or 5 minutes
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      
      setTimeout(async () => {
        try {
          // Post directly using Twitter connector
          const tweetId = await this.twitterConnector.tweet(tweetResult.response);
          
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
        // Get recent analyses from memory - search for all tokens, not just AI
        const recentAnalyses = await this.memory.searchNotes({
          query: "token analysis crypto",
          category: "analysis",
          limit: isInitial ? 1 : 2  // For initial tweet, just get the most relevant one
        });
        
        if (recentAnalyses.length > 0) {
          // Generate tweets for recent analyses
          for (const analysis of recentAnalyses) {
            const tokenMatch = analysis.title.match(/Analysis: ([A-Z0-9]+)/);
            if (tokenMatch && tokenMatch[1]) {
              await this.generateTweetForToken(tokenMatch[1], isInitial);
              
              // For initial tweet, just post about the first token
              if (isInitial) break;
            }
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
        const recentTweets = await this.twitterConnector.getUserTweets(myUsername, 10);
        
        // Find tweets with predictions
        const predictionTweets = recentTweets.filter(tweet => 
          typeof tweet.text === 'string' && (
            tweet.text.includes('predict') || 
            tweet.text.includes('expect') ||
            tweet.text.includes('likely') ||
            tweet.text.includes('anticipate') ||
            tweet.text.includes('potential')
          )
        );
        
        // For each prediction tweet, check if it's time for a follow-up
        for (const tweet of predictionTweets) {
          // Skip if content is not a string (defensive programming)
          if (typeof tweet.text !== 'string') continue;
          
          // Extract token symbol if present
          const tokenSymbols = this.extractTokenSymbols(tweet.text);
          if (tokenSymbols.length === 0) continue;
          
          const symbol = tokenSymbols[0];
          
          // Check if posted at least 24 hours ago
          const tweetTime = tweet.createdAt ? tweet.createdAt.getTime() : Date.now() - 86400000;
          const currentTime = Date.now();
          const hoursSinceTweet = (currentTime - tweetTime) / (1000 * 60 * 60);
          
          if (hoursSinceTweet >= 24) {
            await this.generateFollowUpTweet(symbol, tweet.text);
          }
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
        - You are an autonomous crypto analysis agent focused on AI-related tokens
        - You have access to trending token data
        - You can store analyses in memory
        - You can post tweets
        
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