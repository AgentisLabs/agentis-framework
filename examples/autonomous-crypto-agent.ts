/**
 * Autonomous Crypto Analysis Agent
 * 
 * A fully autonomous agent that researches, analyzes, and tweets about
 * promising crypto projects (especially AI-related) without human intervention.
 * 
 * The agent:
 * 1. Finds interesting tokens via BirdEye and other sources
 * 2. Researches tokens using web search and other tools
 * 3. Stores analysis in vector memory for context and continuity
 * 4. Generates and posts tweets with market insights
 * 5. Follows up on previous predictions and analyses
 * 6. Operates on its own schedule with self-monitoring
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { Agent } from '../src/core/agent';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { BrowserTwitterConnector } from '../src/platform-connectors/browser-twitter-connector';
import { TwitterContentManager } from '../src/platform-connectors/twitter-content-manager';
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
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { EnhancedPlanner } from '../src/planning/enhanced-planner';
import { PlanningStrategy } from '../src/planning/planner-interface';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('AutonomousCryptoAgent');

// Default paths and settings
const DEFAULT_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent-state');
const TWITTER_DATA_DIR = path.join(DATA_DIR, 'twitter');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

// Vector memory configuration
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'crypto-agent-memory';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'crypto-analysis';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENT_STATE_DIR)) fs.mkdirSync(AGENT_STATE_DIR, { recursive: true });
if (!fs.existsSync(TWITTER_DATA_DIR)) fs.mkdirSync(TWITTER_DATA_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

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
      
      // If focus areas provided, prioritize tokens that match
      if (options.focusAreas && options.focusAreas.length > 0) {
        // This is a naive approach - in a real scenario, you'd need better
        // semantic matching or additional data sources
        tokens.sort((a: TokenData, b: TokenData) => {
          const aMatches = options.focusAreas!.some(area => 
            a.name.toLowerCase().includes(area.toLowerCase()) || 
            a.symbol.toLowerCase().includes(area.toLowerCase())
          );
          
          const bMatches = options.focusAreas!.some(area => 
            b.name.toLowerCase().includes(area.toLowerCase()) || 
            b.symbol.toLowerCase().includes(area.toLowerCase())
          );
          
          if (aMatches && !bMatches) return -1;
          if (!aMatches && bMatches) return 1;
          return 0;
        });
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
 * Main autonomous crypto agent class
 */
class AutonomousCryptoAgent {
  // Core components
  private baseAgent!: Agent;
  private autonomousAgent!: AutonomousAgent;
  private personality: EnhancedPersonality;
  private twitterConnector!: BrowserTwitterConnector;
  private contentManager!: TwitterContentManager;
  private planner: EnhancedPlanner;
  
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
    tweetFrequencyHours: 1, // Changed from 6 to 1 hour
    analysisFrequencyHours: 2,
    researchDepth: 'medium',
    focusAreas: ['AI', 'artificial intelligence', 'ML', 'machine learning', 'data', 'analytics']
  };
  
  /**
   * Creates a new autonomous crypto agent
   * 
   * @param personalityPath - Path to the personality file
   */
  constructor(personalityPath: string = DEFAULT_PERSONA_PATH) {
    // Load the agent's personality
    this.personality = PersonalityUtils.loadPersonalityFromJson(personalityPath);
    
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
      "Identify promising crypto tokens related to AI and ML technologies",
      "Analyze their market potential and technical fundamentals",
      "Generate insights about their use cases and potential value",
      "Share analysis via Twitter with substantiated predictions",
      "Follow up on previous predictions to build credibility",
      "Maintain a balanced perspective on both bullish and bearish trends"
    ];
  }
  
  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing autonomous crypto agent...');
      
      // Check required environment variables
      this.checkRequiredEnvVars();
      
      // Create the base agent
      this.baseAgent = this.createBaseAgent();
      
      // Register tools
      this.registerTools();
      
      // Initialize memory system
      await this.initializeMemory();
      
      // Create Twitter connector
      this.twitterConnector = this.createTwitterConnector();
      
      // Create autonomous agent wrapper
      this.autonomousAgent = this.createAutonomousAgent();
      
      // Create Twitter content manager
      this.contentManager = this.createContentManager();
      
      // Connect to Twitter
      logger.info('Connecting to Twitter...');
      await this.twitterConnector.connect(this.baseAgent);
      logger.info('Connected to Twitter successfully!');
      
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
      'ANTHROPIC_API_KEY',
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
   * Create the base agent
   */
  private createBaseAgent(): Agent {
    // Get name from personality or use a default
    const agentName = this.personality.persona?.name || path.basename(DEFAULT_PERSONA_PATH, '.json');
    
    // Create agent configuration
    const agentConfig: EnhancedAgentConfig = PersonalityUtils.createAgentConfig(
      agentName,
      this.personality,
      AgentRole.ASSISTANT,
      process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
    );
    
    // Generate system prompt
    const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);
    
    // Create the agent
    return new Agent({
      name: agentConfig.name,
      role: agentConfig.role,
      personality: PersonalityUtils.simplifyPersonality(this.personality),
      goals: this.personality.motivation.goals.shortTermGoals,
      systemPrompt,
      model: agentConfig.model
    });
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
      // Create embedding service
      this.embeddingService = new EmbeddingService({
        model: 'text-embedding-3-small',
        dimensions: 1536
      });
      
      // Add a createEmbedding method to use the existing API
      this.embeddingService.createEmbedding = async (text: string) => {
        try {
          // Use the existing createEmbeddings method if available
          if (typeof this.embeddingService.createEmbeddings === 'function') {
            const embeddings = await this.embeddingService.createEmbeddings([text]);
            return embeddings[0];
          } else {
            // Use OpenAI directly with newer API (without Configuration)
            const OpenAI = require("openai");
            const openai = new OpenAI({
              apiKey: process.env.OPENAI_API_KEY,
            });
            
            const response = await openai.embeddings.create({
              model: "text-embedding-3-small",
              input: text,
            });
            
            return response.data[0].embedding;
          }
        } catch (error) {
          logger.error(`Error creating embedding: ${error}`);
          // Return a fallback embedding in case of error
          return new Array(1536).fill(0).map(() => Math.random());
        }
      };
      
      // Create Pinecone store with configuration
      const pineconeConfig = {
        index: PINECONE_INDEX,
        namespace: PINECONE_NAMESPACE,
        dimension: 1536
      };
      
      // Store the config for direct access
      this.pineconeStore = new PineconeStore(pineconeConfig);
      
      // Add config property to pineconeStore for reference in methods
      this.pineconeStore.config = pineconeConfig;
      
      // Initialize the store (creates index if needed)
      await this.pineconeStore.initialize();
      
      // Match the PineconeStore API with what our code is using
      this.pineconeStore.upsert = async (vectors: any[]) => {
        try {
          const namespace = this.pineconeStore.config.namespace || 'default';
          // Call storeVector for each vector
          for (const vector of vectors) {
            await this.pineconeStore.storeVector(
              vector.id, 
              vector.values, 
              vector.metadata,
              namespace
            );
          }
          return { upsertedCount: vectors.length };
        } catch (error) {
          logger.error('Error upserting to Pinecone', error);
          throw error;
        }
      };
      
      this.pineconeStore.query = async (params: any) => {
        try {
          const namespace = this.pineconeStore.config.namespace || 'default';
          const results = await this.pineconeStore.searchVectors(
            params.vector,
            params.topK || 10,
            namespace
          );
          
          return { 
            matches: results.map(result => ({
              id: result.id,
              score: result.score,
              metadata: result.data
            })),
            namespace: namespace
          };
        } catch (error) {
          logger.error('Error querying Pinecone', error);
          return { matches: [], namespace: this.pineconeStore.config.namespace || 'default' };
        }
      };
      
      // Create production-ready memory system that uses Pinecone vector store
      this.memory = {
        // Assign direct references to services
        embeddingService: this.embeddingService,
        pineconeStore: this.pineconeStore,
        
        async addNote(note): Promise<string> {
          try {
            const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            
            // Generate embeddings for the note content
            const embedding = await this.embeddingService.createEmbedding(
              `${note.title}\n\n${note.content}`
            );
            
            // Store in Pinecone with metadata
            await this.pineconeStore.upsert([{
              id: id,
              values: embedding,
              metadata: {
                title: note.title,
                content: note.content,
                category: note.category || 'general',
                tags: note.tags,
                timestamp: note.timestamp
              }
            }]);
            
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
            const queryEmbedding = await this.embeddingService.createEmbedding(params.query);
            
            // Search Pinecone with filter if category or tags provided
            const filter: Record<string, any> = {};
            if (params.category) {
              filter.category = params.category;
            }
            if (params.tags && params.tags.length > 0) {
              filter.tags = { $in: params.tags };
            }
            
            // Perform the search
            const searchResults = await this.pineconeStore.query({
              vector: queryEmbedding,
              topK: params.limit || 10,
              filter: Object.keys(filter).length > 0 ? filter : undefined,
              namespace: this.pineconeStore.config.namespace
            });
            
            // Map to Note format
            const notes = searchResults.matches ? searchResults.matches.map((match: any) => ({
              id: match.id,
              title: match.metadata.title,
              content: match.metadata.content,
              category: match.metadata.category,
              tags: match.metadata.tags,
              timestamp: match.metadata.timestamp
            })) : [];
            
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
            // Use a broad query to get all notes (limited to 1000)
            const allResults = await this.pineconeStore.query({
              vector: new Array(1536).fill(0), // Zero vector to match everything
              topK: 1000,
              includeMetadata: true,
              namespace: this.pineconeStore.config.namespace
            });
            
            // Map to Note format
            const notes = allResults.matches ? allResults.matches.map((match: any) => ({
              id: match.id,
              title: match.metadata.title,
              content: match.metadata.content,
              category: match.metadata.category,
              tags: match.metadata.tags,
              timestamp: match.metadata.timestamp
            })) : [];
            
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
  private createTwitterConnector(): BrowserTwitterConnector {
    // Extract Twitter-specific configuration from environment
    const monitorKeywords = process.env.MONITOR_KEYWORDS?.split(',') || [
      'crypto', 
      'bitcoin', 
      'ethereum', 
      'AI', 
      'solana',
      'machine learning'
    ];
    
    // Create Twitter connector using browser automation
    return new BrowserTwitterConnector({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL,
      
      // Monitoring configuration
      monitorKeywords,
      autoReply: process.env.AUTO_REPLY === 'true',
      pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
      
      // Browser settings
      headless: process.env.HEADLESS !== 'false', // Default to headless mode
      debug: process.env.DEBUG === 'true'
    });
  }
  
  /**
   * Create autonomous agent
   */
  private createAutonomousAgent(): AutonomousAgent {
    logger.info(`Creating autonomous agent with Wexley persona...`);
    
    // Create standard configuration without the custom enhancedConfig
    return new AutonomousAgent({
      baseAgent: this.baseAgent,
      healthCheckIntervalMinutes: 15,
      maxConsecutiveErrors: 5,
      stateStoragePath: AGENT_STATE_DIR,
      enableAutoRecovery: true,
      enableContinuousMode: true
      // Remove enhancedConfig as it's not supported in the AutonomousAgent type
    });
  }
  
  /**
   * Create Twitter content manager
   */
  private createContentManager(): TwitterContentManager {
    // Parse content preferences from environment
    const contentCategories = process.env.CONTENT_CATEGORIES?.split(',') || [
      'market_analysis',
      'technical',
      'news',
      'prediction'
    ];
    
    const preferredTopics = process.env.PREFERRED_TOPICS?.split(',') || [
      'AI tokens',
      'crypto market trends',
      'solana AI projects',
      'AI token developments',
      'machine learning blockchain',
      'AI and crypto convergence'
    ];
    
    // Parse posting schedule
    const preferredPostingTimes = process.env.PREFERRED_POSTING_TIMES
      ? process.env.PREFERRED_POSTING_TIMES.split(',').map(h => parseInt(h))
      : [9, 13, 17, 21]; // Default posting times
    
    const tweetsPerDay = process.env.TWEETS_PER_DAY 
      ? parseInt(process.env.TWEETS_PER_DAY)
      : 4;
    
    // Create and return the content manager
    return new TwitterContentManager({
      twitterConnector: this.twitterConnector as any,
      agent: this.autonomousAgent,
      contentCategories,
      preferredPostingTimes,
      tweetsPerDay,
      preferredTopics,
      contentRatio: {
        original: 70,
        reactive: 20,
        curated: 10
      },
      enableAutoResponses: process.env.ENABLE_AUTO_RESPONSES === 'true',
      autoResponseWhitelist: process.env.AUTO_RESPONSE_WHITELIST?.split(',') || [],
      researchInterval: 60,
      researchTopics: preferredTopics,
      dataStoragePath: TWITTER_DATA_DIR
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
    
    logger.info('Starting autonomous crypto agent...');
    
    try {
      // Start the autonomous agent
      this.autonomousAgent.start();
      
      // Start the content manager
      this.contentManager.start();
      
      // Create and execute initial plan
      await this.createAndExecutePlan();
      
      // Post an initial tweet immediately after startup, directly using the Twitter connector
      logger.info('Posting immediate startup tweet...');
      try {
        // Use an existing tweet from our JSON files (AI Agents tweet without hashtags)
        const initialTweetContent = `Look, AI agents aren't just hype - they're the next massive market disruption. We're seeing early signs of agent-to-agent economies emerging. Think DAOs but with AI decision-makers. The projects building secure on-chain environments for these interactions will capture insane value. Most aren't ready.`;
        
        // Post directly using the Twitter connector
        const tweetId = await this.twitterConnector.tweet(initialTweetContent);
        
        // Log success
        logger.info('Initial tweet posted successfully!', { tweetId });
        
        // Record the posted tweet in the content manager
        this.contentManager.addTweetIdea({
          topic: "AI Agents",
          content: initialTweetContent,
          status: 'posted', // Mark as already posted
          priority: 'high',
          tags: ['announcement', 'AI', 'crypto']
        });
        
        // Also kick off the research process in the background
        setTimeout(async () => {
          try {
            // Research trending tokens
            await this.executeResearchTask({
              description: "Research trending AI tokens for initial tweet",
              type: "research"
            });
            
            // Analyze the most promising token
            await this.executeAnalysisTask({
              description: "Analyze top AI token for initial tweet",
              type: "analyze"
            });
          } catch (error) {
            logger.error('Error in background research task', error);
          }
        }, 5000);
      } catch (tweetError) {
        logger.error('Error posting initial tweet', tweetError);
        // Continue agent startup despite tweet error
      }
      
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
      logger.error('Failed to start agent', error);
      throw error;
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
      
      // Stop the content manager
      this.contentManager.stop();
      
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
      
      // Instead of context-based planning which is memory intensive,
      // let's use a simpler approach with predefined tasks
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
          },
          {
            id: `task_${Date.now()}_4`,
            description: "Follow up on previous predictions",
            dependencies: [],
            status: "pending",
            type: "follow_up"
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
   * Gather context for planning
   */
  private async gatherPlanningContext(): Promise<string> {
    try {
      // Get trending tokens
      const trendingResult = await this.cryptoTool.getTrendingTokens({
        limit: 10,
        minPriceChange: 5,
        focusAreas: this.settings.focusAreas
      });
      
      // Get previous analyses from memory (simplified)
      const recentAnalyses = await this.memory.searchNotes({
        query: "AI crypto token analysis"
      });
      
      // Get planned tweets from content manager
      const plannedTweets = this.contentManager.getTweetIdeas({ 
        status: 'approved'
      });
      
      // Format context
      const topTokens = trendingResult.tokens.slice(0, 5).map((token: TokenData) => 
        `${token.name} (${token.symbol}): $${token.price.toFixed(6)}, ${token.priceChange24h.toFixed(2)}% 24h change`
      ).join('\n');
      
      const recentTweets = this.contentManager.getTweetIdeas({ 
        status: 'posted'
      }).slice(0, 3).map(tweet => 
        `${new Date(tweet.scheduledFor || Date.now()).toISOString()}: ${tweet.content}`
      ).join('\n');
      
      return `
        === Current Context ===
        
        TOP TRENDING TOKENS (FOCUSED ON AI/ML):
        ${topTokens}
        
        RECENT TWEETS:
        ${recentTweets}
        
        TIME:
        Current time: ${new Date().toISOString()}
        
        SETTINGS:
        Tweet frequency: ${this.settings.tweetFrequencyHours} hours
        Analysis depth: ${this.settings.researchDepth}
        Focus areas: ${this.settings.focusAreas.join(', ')}
      `;
    } catch (error) {
      logger.error('Error gathering planning context', error);
      return "Error gathering context. Proceed with basic plan.";
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
        
      case 'follow_up':
        await this.executeFollowUpTask(task);
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
      // Find promising tokens
      const trendingResult = await this.cryptoTool.getTrendingTokens({
        limit: 15,
        minPriceChange: 5,
        focusAreas: this.settings.focusAreas
      });
      
      logger.info(`Found ${trendingResult.tokens.length} trending tokens`);
      
      // For each interesting token, gather basic information
      for (const token of trendingResult.tokens.slice(0, 3)) {
        try {
          logger.info(`Researching token: ${token.name} (${token.symbol})`);
          
          // Use the Tavily search tool to gather information
          const searchQuery = `${token.name} ${token.symbol} crypto token AI machine learning use case project details`;
          
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
            tags: ['crypto', 'token', token.symbol, 'AI', 'research'],
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
          const tokenMatch = research.title.match(/Research: ([A-Z0-9]+)/);
          if (tokenMatch && tokenMatch[1]) {
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
      
      // Generate prompt for analysis
      const analysisPrompt = `
        As a crypto analyst specializing in AI-related tokens, analyze this token:
        
        ${tokenResearch[0].content}
        
        Provide a comprehensive analysis focusing on:
        1. Use case and technology overview
        2. Market potential and adoption
        3. Technical fundamentals
        4. Development activity and team
        5. Short and medium-term outlook
        
        Be objective and balanced in your assessment. Identify both strengths and weaknesses.
      `;
      
      // Generate analysis using the autonomous agent
      const analysisResult = await this.autonomousAgent.runOperation<{ response: string }>(analysisPrompt);
      
      // Store the analysis in memory
      await this.memory.addNote({
        title: `Analysis: ${symbol}`,
        content: analysisResult.response,
        category: 'analysis',
        tags: ['crypto', 'token', symbol, 'AI', 'analysis'],
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
   */
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
      
      const tweetPrompt = `
        Based on this analysis of ${symbol}:
        
        ${analysis.substring(0, 500)}...
        
        You are ${personalityName}, a crypto market analyst specializing in AI tokens.
        Your expertise allows you to identify market patterns before others see them.
        Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
        
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
      
      // Schedule the tweet (immediate or based on schedule)
      const scheduledTime = this.getNextTweetTime(immediate);
      
      this.contentManager.addTweetIdea({
        topic: `${symbol} analysis`,
        content: tweetResult.response,
        status: 'approved',
        priority: 'high', // Only use valid priority values
        scheduledFor: scheduledTime,
        tags: ['analysis', symbol, 'AI', 'crypto']
        // Remove metadata as it's not supported in the TweetIdea interface
      });
      
      logger.info(`Scheduled tweet about ${symbol} for ${new Date(scheduledTime).toLocaleString()}`);
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
        // Generate tweet for specific token (use default parameter values)
        await this.generateTweetForToken(targetSymbol);
      } else {
        // Get recent analyses from memory
        const recentAnalyses = await this.memory.searchNotes({
          query: "token analysis AI crypto",
          category: "analysis",
          limit: isInitial ? 1 : 2  // For initial tweet, just get the most relevant one
        });
        
        if (recentAnalyses.length > 0) {
          // Generate tweets for recent analyses
          for (const analysis of recentAnalyses) {
            const tokenMatch = analysis.title.match(/Analysis: ([A-Z0-9]+)/);
            if (tokenMatch && tokenMatch[1]) {
              await this.generateTweetForToken(tokenMatch[1]);
              
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
            
            // Find the analysis we just created
            const newAnalyses = await this.memory.searchNotes({
              query: `${topToken.symbol} analysis`,
              limit: 1
            });
            
            if (newAnalyses.length > 0) {
              const tokenMatch = newAnalyses[0].title.match(/Analysis: ([A-Z0-9]+)/);
              if (tokenMatch && tokenMatch[1]) {
                // Use default parameter values to avoid type errors
                await this.generateTweetForToken(tokenMatch[1]);
              }
            }
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
      
      // Schedule the tweet (immediate or based on schedule)
      const scheduledTime = this.getNextTweetTime(immediate);
      
      this.contentManager.addTweetIdea({
        topic: `${symbol} analysis`,
        content: tweetResult.response,
        status: 'approved',
        priority: 'high', // Use only valid priority values
        scheduledFor: scheduledTime,
        tags: ['analysis', symbol, 'AI', 'crypto']
        // Remove metadata as it's not supported in TweetIdea
      });
      
      logger.info(`Scheduled tweet about ${symbol} for ${new Date(scheduledTime).toLocaleString()}`);
    } catch (error) {
      logger.error(`Error generating tweet for ${symbol}`, error);
      throw error;
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
      // Get posted tweets from content manager
      const postedTweets = this.contentManager.getTweetIdeas({ 
        status: 'posted'
      }).slice(0, 10);
      
      // Find tweets with predictions
      const predictionTweets = postedTweets.filter(tweet => 
        typeof tweet.content === 'string' && (
          tweet.content.includes('predict') || 
          tweet.content.includes('expect') ||
          tweet.content.includes('likely') ||
          tweet.content.includes('anticipate') ||
          tweet.content.includes('potential')
        )
      );
      
      // For each prediction tweet, check if it's time for a follow-up
      for (const tweet of predictionTweets) {
        // Skip if content is not a string (defensive programming)
        if (typeof tweet.content !== 'string') continue;
        
        // Extract token symbol if present
        const tokenSymbolMatch = tweet.content.match(/\$([A-Z0-9]+)/);
        if (!tokenSymbolMatch) continue;
        
        const symbol = tokenSymbolMatch[1];
        
        // Check if posted at least 24 hours ago
        const tweetTime = new Date(tweet.scheduledFor || Date.now()).getTime();
        const currentTime = Date.now();
        const hoursSinceTweet = (currentTime - tweetTime) / (1000 * 60 * 60);
        
        if (hoursSinceTweet >= 24) {
          await this.generateFollowUpTweet(symbol, tweet.content);
        }
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
      
      // Schedule the tweet
      const scheduledTime = this.getNextTweetTime();
      
      this.contentManager.addTweetIdea({
        topic: `${symbol} follow-up`,
        content: tweetResult.response,
        status: 'approved',
        priority: 'medium', // Medium priority for follow-ups
        scheduledFor: scheduledTime,
        tags: ['follow-up', symbol, 'AI', 'crypto']
      });
      
      logger.info(`Scheduled follow-up tweet about ${symbol} for ${new Date(scheduledTime).toLocaleString()}`);
    } catch (error) {
      logger.error(`Error generating follow-up tweet for ${symbol}`, error);
      throw error;
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
        - You can schedule tweets
        
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
    const dollarMatch = text.match(/\$([A-Z0-9]+)/);
    if (dollarMatch) return dollarMatch[1];
    
    // Look for explicit mention
    const explicitMatch = text.match(/token[:\s]+([A-Z0-9]+)/i);
    if (explicitMatch) return explicitMatch[1];
    
    // Look for symbol in parentheses
    const parenthesesMatch = text.match(/\(([A-Z0-9]+)\)/);
    if (parenthesesMatch) return parenthesesMatch[1];
    
    return null;
  }
  
  /**
   * Get the next tweet time based on schedule or immediate posting
   * 
   * @param immediate Optional parameter to request immediate posting
   */
  private getNextTweetTime(immediate: boolean = false): number {
    // If immediate posting is requested, schedule for 1 minute from now
    if (immediate) {
      const immediateTime = new Date();
      immediateTime.setMinutes(immediateTime.getMinutes() + 1);
      return immediateTime.getTime();
    }
    
    const now = new Date();
    let scheduledTime = new Date();
    
    // Use default preferred posting times
    const preferredTimes = [9, 13, 17, 21]; // Default posting times
    
    // Set a minimum interval between tweets (in hours)
    const minIntervalHours = this.settings.tweetFrequencyHours;
    
    // Find the next posting time that satisfies the minimum interval
    let foundTime = false;
    
    // Sort preferred times to handle out-of-order configs
    const sortedTimes = [...preferredTimes].sort((a, b) => a - b);
    
    for (const hour of sortedTimes) {
      scheduledTime.setHours(hour, 0, 0, 0);
      
      // If this time is in the future and satisfies our interval, use it
      if (scheduledTime > now && 
          (scheduledTime.getTime() - now.getTime()) >= (minIntervalHours * 60 * 60 * 1000)) {
        foundTime = true;
        break;
      }
    }
    
    // If no suitable time found today, find one for tomorrow
    if (!foundTime) {
      // For very short intervals, just use the interval from now
      if (minIntervalHours <= 3) {
        scheduledTime = new Date(now.getTime() + (minIntervalHours * 60 * 60 * 1000));
        // Round to the nearest hour
        scheduledTime.setMinutes(0, 0, 0);
        return scheduledTime.getTime();
      } else {
        // Otherwise use tomorrow's first preferred time
        scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + 1);
        scheduledTime.setHours(sortedTimes[0], 0, 0, 0);
      }
    }
    
    logger.info(`Next tweet scheduled for: ${scheduledTime.toLocaleString()}`);
    return scheduledTime.getTime();
  }
  
  /**
   * Get current status of the agent
   */
  getStatus(): any {
    const agentStatus = this.autonomousAgent.getStatus();
    const tweetIdeas = this.contentManager.getTweetIdeas();
    
    return {
      isRunning: this.isRunning,
      agentStatus,
      currentGoals: this.currentGoals,
      currentTasks: this.currentTasks.map(task => task.description),
      scheduledTweets: tweetIdeas.filter(idea => idea.status === 'approved').length,
      postedTweets: tweetIdeas.filter(idea => idea.status === 'posted').length,
      draftTweets: tweetIdeas.filter(idea => idea.status === 'draft').length,
      settings: this.settings
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
    const agent = new AutonomousCryptoAgent();
    
    // Initialize all components
    await agent.initialize();
    
    // Start the agent
    await agent.start();
    
    // Log status periodically
    setInterval(() => {
      const status = agent.getStatus();
      logger.info('Agent status', {
        running: status.isRunning,
        tasks: status.currentTasks.length,
        scheduledTweets: status.scheduledTweets,
        postedTweets: status.postedTweets
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

export { AutonomousCryptoAgent };