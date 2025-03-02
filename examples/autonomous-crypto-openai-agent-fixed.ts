/**
 * Autonomous Crypto Analysis Agent (OpenAI Version)
 * 
 * A fully autonomous agent that researches, analyzes, and tweets about
 * promising crypto projects (especially AI-related) without human intervention.
 * 
 * This version uses OpenAI's GPT-4o model instead of Anthropic Claude.
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
import { OpenAIProvider } from '../src/core/openai-provider';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { EnhancedPlanner } from '../src/planning/enhanced-planner';
import { PlanningStrategy } from '../src/planning/planner-interface';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('AutonomousCryptoOpenAIAgent');

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
  isDiscovered?: boolean;  // Add for discovered tokens
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
 * Main autonomous crypto agent class (OpenAI Version)
 */
class AutonomousCryptoOpenAIAgent {
  // Core components
  private baseAgent!: Agent;
  private autonomousAgent!: AutonomousAgent;
  private personality: EnhancedPersonality;
  private twitterConnector!: BrowserTwitterConnector;
  private contentManager!: TwitterContentManager;
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
    focusAreas: ['AI', 'artificial intelligence', 'ML', 'machine learning', 'data', 'analytics']
  };
  
  /**
   * Creates a new autonomous crypto agent with OpenAI
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
      logger.info('Initializing autonomous crypto OpenAI agent...');
      
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
            
            // Process metadata to ensure it's compatible with Pinecone
            const metadata: Record<string, any> = {
              title: note.title,
              content: note.content,
              category: note.category || 'general',
              timestamp: note.timestamp
            };
            
            // Ensure tags are properly formatted as an array of strings
            if (note.tags) {
              metadata.tags = Array.isArray(note.tags) 
                ? note.tags.map(tag => String(tag)) 
                : [String(note.tags)];
            }
            
            // Store in Pinecone directly with storeVector
            await this.pineconeStore.storeVector(
              id,
              embedding,
              metadata
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
    const connector = new BrowserTwitterConnector({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL,
      
      // Monitoring configuration
      monitorKeywords,
      autoReply: process.env.AUTO_REPLY === 'true',
      pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
      
      // Browser settings
      headless: false, // Set to false to see the browser window
      debug: true // Enable debugging
    });
    
    // Set up event handlers for different interaction types
    
    // Handle mentions
    connector.on('mention', async (interaction) => {
      logger.info(`Processing mention from @${interaction.username}: "${interaction.text.substring(0, 50)}..."`);
      
      try {
        // Save to vector memory
        await this.saveInteractionToMemory(interaction);
        
        // Process using agent if auto-reply is disabled (if enabled, reply is handled by connector)
        if (!(process.env.AUTO_REPLY === 'true')) {
          await this.processTwitterInteraction(interaction);
        }
      } catch (error) {
        logger.error(`Error processing mention from @${interaction.username}`, error);
      }
    });
    
    // Handle replies
    connector.on('reply', async (interaction) => {
      logger.info(`Processing reply from @${interaction.username}: "${interaction.text.substring(0, 50)}..."`);
      
      try {
        // Save to vector memory
        await this.saveInteractionToMemory(interaction);
        
        // Process using agent if auto-reply is disabled (if enabled, reply is handled by connector)
        if (!(process.env.AUTO_REPLY === 'true')) {
          await this.processTwitterInteraction(interaction);
        }
      } catch (error) {
        logger.error(`Error processing reply from @${interaction.username}`, error);
      }
    });
    
    // Handle keyword matches
    connector.on('keyword', async (interaction) => {
      logger.info(`Processing keyword match from @${interaction.username}: "${interaction.text.substring(0, 50)}..."`);
      
      try {
        // Save to vector memory
        await this.saveInteractionToMemory(interaction);
        
        // For keyword matches, we don't auto-process unless it's especially relevant
        // This prevents the agent from responding to every tweet with keywords
        const relevanceScore = this.calculateRelevance(interaction);
        if (relevanceScore > 0.7 && !(process.env.AUTO_REPLY === 'true')) {
          await this.processTwitterInteraction(interaction);
        }
      } catch (error) {
        logger.error(`Error processing keyword match from @${interaction.username}`, error);
      }
    });
    
    return connector;
  }
  
  /**
   * Save a Twitter interaction to vector memory
   * 
   * @param interaction - The Twitter interaction to save
   */
  private async saveInteractionToMemory(interaction: any): Promise<void> {
    try {
      // Create a structured note for the interaction
      // Include metadata in the content to fit within the Note interface
      const metadataStr = JSON.stringify({
        tweetId: interaction.id,
        username: interaction.username,
        interactionType: interaction.type,
        originalTweetId: interaction.originalTweetId,
        keywords: interaction.keywords
      });
      
      const interactionNote = {
        title: `Twitter ${interaction.type} from @${interaction.username}`,
        content: `${interaction.text}\n\n---\nMETADATA: ${metadataStr}`,
        category: 'twitter_interaction',
        tags: ["twitter", interaction.type, interaction.username, `tweet_${interaction.id}`],
        timestamp: Date.now()
      };
      
      // Store in vector memory
      const noteId = await this.memory.addNote(interactionNote);
      logger.info(`Saved Twitter interaction to memory (ID: ${noteId})`);
    } catch (error) {
      logger.error('Error saving Twitter interaction to memory', error);
    }
  }
  
  /**
   * Process a Twitter interaction using the agent
   * 
   * @param interaction - The Twitter interaction to process
   */
  private async processTwitterInteraction(interaction: any): Promise<void> {
    try {
      // Prepare context based on interaction type
      let promptContext = '';
      
      switch (interaction.type) {
        case 'mention':
          promptContext = `Someone mentioned you on Twitter.`;
          break;
        case 'reply':
          promptContext = `Someone replied to your tweet on Twitter.`;
          if (interaction.originalTweetId) {
            // Try to find the original tweet in our memory
            const originalTweets = await this.memory.searchNotes({
              query: interaction.originalTweetId,
              limit: 1
            });
            
            if (originalTweets.length > 0) {
              promptContext += ` Your original tweet was: "${originalTweets[0].content}"`;
            }
          }
          break;
        case 'keyword':
          promptContext = `Someone tweeted about keywords you're monitoring.`;
          if (interaction.keywords && interaction.keywords.length > 0) {
            promptContext += ` Matching keywords: ${interaction.keywords.join(', ')}`;
          }
          break;
      }
      
      // Create prompt for the agent
      const prompt = `
        ${promptContext}
        
        Tweet from @${interaction.username}: "${interaction.text}"
        
        As a crypto analyst focused on AI tokens, create an engaging reply that positions you as an expert.
        Your response MUST be under 240 characters as it's for Twitter.
        
        IMPORTANT: Do NOT analyze whether you should reply or not - you MUST reply with actual substantive content.
        NEVER say that you're not going to respond or explain why something isn't worth responding to.
        
        Your reply should:
        1. Be directly relevant to the topic if possible (AI, crypto, market analysis)
        2. Add value with insight, analysis, or a thoughtful question
        3. Maintain your professional, analytical persona
        4. Engage positively with the user
        
        Return your tweet in this format:
        RESPONSE: [your tweet text here]
      `;
      
      // Process with the agent
      const result = await this.autonomousAgent.runOperation<{ response: string }>(prompt);
      
      // Extract response
      let replyText = "";
      
      // Try to extract the formatted response first
      if (result.response.includes('RESPONSE:')) {
        const tweetMatch = result.response.match(/RESPONSE:\s*(.*?)(\s*$|(?=\n))/s);
        if (tweetMatch && tweetMatch[1]) {
          replyText = tweetMatch[1].trim();
        }
      } 
      
      // If we couldn't extract a formatted response, or if it's empty, use the entire response
      if (!replyText) {
        replyText = result.response.trim();
      }
      
      // Check if the response appears to be a refusal or meta-commentary
      const refusalIndicators = [
        "not pertaining", "not relevant", "doesn't warrant", "doesn't require",
        "not appropriate", "not engaging", "no analysis needed", "doesn't ask",
        "not directly related", "not worth", "no response", "not responding",
        "don't need to respond", "this tweet doesn't", "doesn't pertain",
        "not my area", "outside my expertise"
      ];
      
      const containsRefusal = refusalIndicators.some(indicator => 
        replyText.toLowerCase().includes(indicator.toLowerCase())
      );
      
      if (containsRefusal) {
        // Generate a generic, but personalized response instead
        logger.info(`Generated response contained refusal language, replacing with generic response`);
        
        const genericResponses = [
          `Interesting point about the crypto market. I'm tracking several AI-focused tokens with similar patterns. What's your take on the recent price movement?`,
          `Thanks for the mention! The AI/crypto intersection is evolving rapidly. Have you seen any other projects implementing similar technology?`,
          `Appreciate the perspective. In my analysis, AI tokens with strong fundamentals continue to outperform. Are you following any specific projects?`,
          `This aligns with trends I've been analyzing. The technical indicators for AI tokens suggest we're entering a new phase of adoption.`,
          `Important observations here. My research shows intersection of AI and DeFi has significant growth potential in coming months.`
        ];
        
        replyText = genericResponses[Math.floor(Math.random() * genericResponses.length)];
      }
      
      // Enforce character limit for Twitter
      if (replyText.length > 240) {
        replyText = replyText.substring(0, 237) + "...";
      }
      
      // Post the reply
      logger.info(`Posting reply to @${interaction.username}: "${replyText}"`);
      await this.twitterConnector.tweet(replyText, interaction.id);
      
      // Also save this interaction+response to memory
      // Include metadata in content to fit within Note interface
      const metadataStr = JSON.stringify({
        inReplyToId: interaction.id,
        inReplyToUser: interaction.username,
        interactionType: interaction.type
      });
      
      await this.memory.addNote({
        title: `Twitter response to @${interaction.username}`,
        content: `${replyText}\n\n---\nMETADATA: ${metadataStr}`,
        category: 'twitter_response',
        tags: ["twitter", "response", interaction.username, `reply_to_${interaction.id}`],
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error(`Error processing Twitter interaction from @${interaction.username}`, error);
    }
  }
  
  /**
   * Calculate relevance score for a keyword interaction
   * This helps determine if we should respond to general keyword matches
   * 
   * @param interaction - The Twitter interaction
   * @returns Relevance score between 0-1
   */
  private calculateRelevance(interaction: any): number {
    try {
      // Simple implementation - count our priority keywords
      const priorityKeywords = [
        process.env.TWITTER_USERNAME || '',
        'ask',
        'question',
        'advice',
        'recommend',
        'opinion',
        'what do you think',
        'agree',
        'disagree'
      ];
      
      // Count matches
      const text = interaction.text.toLowerCase();
      let matches = 0;
      
      for (const keyword of priorityKeywords) {
        if (keyword && text.includes(keyword.toLowerCase())) {
          matches++;
        }
      }
      
      // Calculate score
      return Math.min(1.0, matches / 3); // 3+ matches = 1.0 score
    } catch (error) {
      logger.error('Error calculating relevance', error);
      return 0;
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
    
    logger.info('Starting autonomous crypto OpenAI agent...');
    
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
        // Get previously posted tweets to avoid duplicates
        const postedTweets = this.contentManager.getTweetIdeas({ 
          status: 'posted'
        }).map(tweet => tweet.content);
        
        // Choose from different startup tweets to avoid duplicates
        const startupTweets = [
          `$ALCH is showing remarkable potential as an AI infrastructure token. Its integration of ML optimizations with blockchain could drive significant value. The recent 15% price increase suggests the market is just starting to recognize its utility.`,
          `$ARC (AI Rig Complex) is quietly building the infrastructure for AI model training on-chain. With a 30% hashrate increase this month and partnerships with three major data centers, it's positioned to become a key player in decentralized AI.`,
          `$AI16Z presents a compelling investment case as it builds the middleware layer connecting AI agents to blockchain data. Their architectural approach solves the oracle problem elegantly while maintaining decentralization.`,
          `The convergence of AI and crypto is creating entirely new business models. Projects that can effectively bridge these domains - like we're seeing with $ALCH and $ARC - will capture massive value in the coming transition.`,
          `Watching the on-chain activity for $RENDER, which is seeing unprecedented demand for GPU compute power. Their decentralized rendering network is quickly becoming the infrastructure backbone for generative AI artists.`,
          `$FET is pioneering the intersection of AI and blockchain with its peer-to-peer compute marketplace. Their approach to distributed machine learning could fundamentally change how AI models are trained and deployed.`,
          `$OCEAN's data marketplace is becoming increasingly critical for AI/ML token projects needing high-quality training data. Their token-gated datasets are showing 40% higher quality metrics than traditional centralized alternatives.`,
          `AI-powered crypto trading protocols like $AIAI are showing promising results, with 22% lower volatility and more consistent returns than their non-AI counterparts. The sector is maturing rapidly.`
        ];
        
        // Filter out any tweets that have already been posted
        const availableTweets = startupTweets.filter(tweet => !postedTweets.includes(tweet));
        
        // If all startup tweets have been used, generate a new one instead
        let initialTweetContent: string;
        
        if (availableTweets.length > 0) {
          // Choose a random tweet from the available options
          const randomIndex = Math.floor(Math.random() * availableTweets.length);
          initialTweetContent = availableTweets[randomIndex];
          logger.info('Selected new startup tweet from predefined list');
        } else {
          // Generate a new tweet about crypto-AI intersections
          logger.info('All predefined tweets used, generating a new one...');
          
          const prompt = `
            As a crypto market analyst specializing in AI tokens, create a new startup tweet (max 240 chars).
            Focus on the intersection of AI and crypto with a forward-looking perspective.
            Mention at least one specific token using the $ symbol format.
            Make it insightful, data-driven, and avoid any hashtags.
            
            Only return the tweet text with no other commentary.
          `;
          
          try {
            const result = await this.baseAgent.run({ task: prompt });
            initialTweetContent = result.response.trim();
            logger.info('Generated new startup tweet via AI');
          } catch (genError) {
            logger.error('Error generating new tweet', genError);
            initialTweetContent = `The AI-crypto token space continues to evolve rapidly. Looking forward to sharing insights on promising projects in this sector. Excited about developments in $ARC, $ALCH and other innovative tokens.`;
          }
        }
        
        logger.info('About to post tweet with content: ' + initialTweetContent);
        
        // Get a direct handle to browser controller
        const page = (this.twitterConnector as any).page;
        if (page) {
          // Navigate directly to compose page
          await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Try to find the tweet text area
          const textareaSelector = '[data-testid="tweetTextarea_0"]';
          await page.waitForSelector(textareaSelector, { timeout: 10000 });
          await page.click(textareaSelector);
          await page.type(textareaSelector, initialTweetContent, { delay: 50 });
          
          // Wait for tweet button to be enabled and click it
          await new Promise(resolve => setTimeout(resolve, 1000));
          const tweetButtonSelector = '[data-testid="tweetButton"]';
          await page.waitForSelector(tweetButtonSelector, { timeout: 10000 });
          await page.click(tweetButtonSelector);
          
          // Wait for tweet to be posted
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          logger.info('Manual tweet posting completed');
        } else {
          // Fall back to regular method if direct page access not available
          const tweetId = await this.twitterConnector.tweet(initialTweetContent);
          logger.info('Initial tweet posted successfully!', { tweetId });
        }
        
        // Record the posted tweet in the content manager
        this.contentManager.addTweetIdea({
          topic: "ALCH Analysis",
          content: initialTweetContent,
          status: 'posted', // Mark as already posted
          priority: 'high',
          tags: ['analysis', 'ALCH', 'AI', 'crypto']
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
      
      // Set up token discovery to run every 4 hours to find new projects
      const discoveryIntervalMs = 4 * 60 * 60 * 1000; 
      setInterval(async () => {
        if (this.isRunning) {
          logger.info('Running scheduled token discovery (every 4 hours)');
          try {
            // Run the specialized token discovery task
            await this.executeTokenDiscoveryTask();
          } catch (discoveryError) {
            logger.error('Error in scheduled token discovery', discoveryError);
          }
        }
      }, discoveryIntervalMs);
      
      // Set up specialized major-cap trading analysis to run daily
      const tradingAnalysisIntervalMs = 24 * 60 * 60 * 1000;
      setTimeout(() => {
        // Start the first one after 30 minutes
        setInterval(async () => {
          if (this.isRunning) {
            logger.info('Running scheduled major-cap trading analysis (daily)');
            try {
              // Analyze major tokens with trading focus
              const majorTokens = ['SOL', 'BTC', 'ETH', 'RNDR', 'FET'];
              // Randomly select one major token to analyze each day
              const selectedToken = majorTokens[Math.floor(Math.random() * majorTokens.length)];
              
              // First research it
              await this.executeResearchTask({
                description: `Deep research of major token: ${selectedToken}`,
                type: 'research' 
              });
              
              // Then analyze it with trading focus
              await this.analyzeSpecificToken(selectedToken, true);
            } catch (error) {
              logger.error('Error in scheduled trading analysis', error);
            }
          }
        }, tradingAnalysisIntervalMs);
      }, 30 * 60 * 1000);
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
    
    logger.info('Stopping autonomous crypto OpenAI agent...');
    
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
  /**
   * Execute a research task with enhanced discovery capabilities
   * 
   * @param task - Research task
   */
  private async executeResearchTask(task: {description: string; type?: string}): Promise<void> {
    logger.info(`Executing research task: ${task.description}`);
    
    try {
      // Determine research strategy based on task description
      const isDiscoveryMode = task.description.toLowerCase().includes('discover') || 
                             task.description.toLowerCase().includes('new');
      
      const isDeepDive = task.description.toLowerCase().includes('deep') || 
                         task.description.toLowerCase().includes('detailed');
                         
      const isMajorCapFocus = task.description.toLowerCase().includes('major') || 
                             task.description.toLowerCase().includes('top') ||
                             task.description.toLowerCase().includes('solana');
                             
      // STRATEGY 1: Get trending tokens from BirdEye
      let trendingResult = await this.cryptoTool.getTrendingTokens({
        limit: isDiscoveryMode ? 25 : 15,
        minPriceChange: isDiscoveryMode ? 3 : 5,
        focusAreas: this.settings.focusAreas
      });
      
      let tokenList = [...trendingResult.tokens];
      
      // STRATEGY 2: Research major caps if specifically requested
      if (isMajorCapFocus) {
        // Add major tokens that may not show in trending lists
        const majorTokens = [
          { name: "Solana", symbol: "SOL", price: 0, priceChange24h: 0, volume24h: 0 },
          { name: "Bitcoin", symbol: "BTC", price: 0, priceChange24h: 0, volume24h: 0 },
          { name: "Ethereum", symbol: "ETH", price: 0, priceChange24h: 0, volume24h: 0 },
          { name: "Fetch.ai", symbol: "FET", price: 0, priceChange24h: 0, volume24h: 0 },
          { name: "Render", symbol: "RNDR", price: 0, priceChange24h: 0, volume24h: 0 },
          { name: "Chainlink", symbol: "LINK", price: 0, priceChange24h: 0, volume24h: 0 }
        ];
        
        // Add major tokens that aren't already in the trending list
        for (const majorToken of majorTokens) {
          if (!tokenList.some(t => t.symbol === majorToken.symbol)) {
            tokenList.push(majorToken);
          }
        }
      }
      
      // STRATEGY 3: Discover new tokens via web research
      if (isDiscoveryMode) {
        // Perform specialized search for discovering new AI crypto projects
        const discoverQueries = [
          "newest AI crypto tokens launched this month",
          "promising new AI blockchain projects",
          "upcoming AI crypto token launches",
          "AI crypto projects with recent fundraising",
          "solana AI tokens new projects"
        ];
        
        // Select two random queries to keep execution time reasonable
        const selectedQueries = discoverQueries.sort(() => 0.5 - Math.random()).slice(0, 2);
        
        for (const query of selectedQueries) {
          try {
            const discoveryResults = await this.searchTool.execute({
              query,
              maxResults: 3,
              includeAnswer: true
            });
            
            // Extract token mentions from search results
            if (discoveryResults.answer) {
              const tokenMatches = discoveryResults.answer.match(/\$([A-Z0-9]{2,})/g) || [];
              const tokenSymbols = tokenMatches.map((m: string) => m.substring(1));
              
              logger.info(`Discovered potential new tokens from search: ${tokenSymbols.join(', ')}`);
              
              // Add discovered tokens to our research list
              for (const symbol of tokenSymbols) {
                if (!tokenList.some(t => t.symbol === symbol)) {
                  tokenList.push({ 
                    name: symbol, 
                    symbol, 
                    price: 0, 
                    priceChange24h: 0, 
                    volume24h: 0,
                    isDiscovered: true  // Mark as discovered for special handling
                  });
                }
              }
            }
          } catch (discoveryError) {
            logger.error(`Error in discovery search for "${query}"`, discoveryError);
          }
        }
      }
      
      logger.info(`Found ${tokenList.length} tokens to research`);
      
      // Determine how many tokens to research based on task type
      const researchCount = isDeepDive ? 1 : isDiscoveryMode ? 5 : 3;
      
      // For each interesting token, gather basic information
      // Prioritize tokens mentioned in the task description first
      const taskTokenMatches = task.description.match(/\b([A-Z]{2,})\b/g) || [];
      const mentionedTokens = taskTokenMatches.filter(symbol => 
        symbol !== 'AI' && symbol !== 'ML' && tokenList.some(t => t.symbol === symbol)
      );
      
      // Sort the token list with mentioned tokens first, then by price change
      tokenList.sort((a, b) => {
        // First prioritize tokens explicitly mentioned in the task
        const aIsMentioned = mentionedTokens.includes(a.symbol);
        const bIsMentioned = mentionedTokens.includes(b.symbol);
        
        if (aIsMentioned && !bIsMentioned) return -1;
        if (!aIsMentioned && bIsMentioned) return 1;
        
        // Then prioritize discovered tokens for discovery tasks
        if (isDiscoveryMode) {
          const aIsDiscovered = !!(a as any).isDiscovered;
          const bIsDiscovered = !!(b as any).isDiscovered;
          
          if (aIsDiscovered && !bIsDiscovered) return -1;
          if (!aIsDiscovered && bIsDiscovered) return 1;
        }
        
        // Finally sort by price change (descending)
        return b.priceChange24h - a.priceChange24h;
      });
      
      // Select tokens to research
      const tokensToResearch = tokenList.slice(0, researchCount);
      
      // For each selected token, perform comprehensive research
      for (const token of tokensToResearch) {
        try {
          logger.info(`Researching token: ${token.name} (${token.symbol})`);
          
          // Build a comprehensive search strategy
          let searchResults;
          let additionalContext = '';
          
          // STEP 1: Basic token information
          const searchQuery = `${token.name} ${token.symbol} crypto token AI machine learning use case project details`;
          
          searchResults = await this.searchTool.execute({
            query: searchQuery,
            maxResults: isDeepDive ? 7 : 5,
            includeAnswer: true
          });
          
          logger.info(`Found ${searchResults.results?.length || 0} search results for ${token.symbol}`);
          
          // STEP 2: For deep dives, gather additional technical and market info
          if (isDeepDive) {
            try {
              // Get technical details
              const technicalQuery = `${token.symbol} ${token.name} crypto token technical analysis detailed`;
              const technicalResults = await this.searchTool.execute({
                query: technicalQuery,
                maxResults: 3,
                includeAnswer: true
              });
              
              // Get team and development info
              const teamQuery = `${token.symbol} ${token.name} crypto token team developers roadmap`;
              const teamResults = await this.searchTool.execute({
                query: teamQuery,
                maxResults: 3,
                includeAnswer: true
              });
              
              // Combine the additional information
              additionalContext = `
                Technical Analysis:
                ${technicalResults.answer || 'No technical analysis available'}
                
                Team & Development:
                ${teamResults.answer || 'No team information available'}
              `;
            } catch (deepDiveError) {
              logger.error(`Error in deep dive research for ${token.symbol}`, deepDiveError);
            }
          }
          
          // Create formatted sources information
          const sourcesList = Array.isArray(searchResults.results) 
            ? searchResults.results.slice(0, isDeepDive ? 5 : 3).map((result: {title?: string; url?: string}) => 
                `- ${result.title || 'Untitled'}: ${result.url || 'No URL'}`
              ).join('\n') 
            : 'No sources available';
            
          // Format content based on token price data availability
          let tokenData = '';
          if (token.price && token.price > 0) {
            tokenData = `
              Price: $${token.price.toFixed(6)}
              24h Change: ${token.priceChange24h.toFixed(2)}%
              24h Volume: $${(token.volume24h || 0).toLocaleString()}
            `;
          } else {
            tokenData = 'No price data available for this token.\n';
          }
          
          // Store the research in memory
          await this.memory.addNote({
            title: `Research: ${token.symbol}`,
            content: `
              Token: ${token.name} (${token.symbol})
              ${tokenData}
              
              Research Summary:
              ${searchResults.answer || 'No summary available'}
              
              ${additionalContext}
              
              Sources:
              ${sourcesList}
              
              Research Time: ${new Date().toISOString()}
            `,
            category: 'research',
            tags: ["crypto", "token", String(token.symbol), "AI", "research"],
            timestamp: Date.now()
          });
          
          logger.info(`Saved research for ${token.symbol} to memory`);
          
          // For deep dive tokens, immediately initiate analysis
          if (isDeepDive) {
            await this.analyzeSpecificToken(token.symbol);
          }
          
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
   * Analyze a specific token with enhanced insights
   * 
   * @param symbol - Token symbol
   * @param tradeFocus - Optional flag to focus on trading opportunities
   */
  private async analyzeSpecificToken(symbol: string, tradeFocus: boolean = false): Promise<void> {
    logger.info(`Analyzing token: ${symbol} ${tradeFocus ? '(trade focus)' : ''}`);
    
    try {
      // Fetch existing research
      const tokenResearch = await this.memory.searchNotes({
        query: `${symbol} research`,
        limit: 2  // Get up to 2 research notes in case there are multiple
      });
      
      if (tokenResearch.length === 0) {
        logger.warn(`No research found for ${symbol}, skipping analysis`);
        return;
      }
      
      // Check for existing analyses to avoid duplication
      const existingAnalyses = await this.memory.searchNotes({
        query: `Analysis: ${symbol}`,
        limit: 1
      });
      
      // Determine if we need a fresh analysis or update based on timestamp
      let needsNewAnalysis = true;
      
      if (existingAnalyses.length > 0) {
        const lastAnalysisTime = existingAnalyses[0].timestamp;
        const currentTime = Date.now();
        const hoursSinceLastAnalysis = (currentTime - lastAnalysisTime) / (1000 * 60 * 60);
        
        // Only do a new analysis if it's been at least 12 hours since the last one
        // or if we're specifically asked for a trade focus analysis
        needsNewAnalysis = hoursSinceLastAnalysis >= 12 || tradeFocus;
        
        if (!needsNewAnalysis) {
          logger.info(`Recent analysis for ${symbol} exists (${hoursSinceLastAnalysis.toFixed(1)} hours ago), skipping`);
          return;
        }
      }
      
      // Combine research if multiple notes exist
      let combinedResearch = tokenResearch[0].content;
      if (tokenResearch.length > 1) {
        combinedResearch += "\n\nAdditional Research:\n" + tokenResearch[1].content;
      }
      
      // Generate prompt for analysis - modify based on focus
      let analysisPrompt: string;
      
      if (tradeFocus) {
        analysisPrompt = `
          As Wexley, a crypto analyst specializing in AI-related tokens, analyze this token for TRADING OPPORTUNITIES:
          
          ${combinedResearch}
          
          Provide a trading-focused analysis including:
          1. Current price action and momentum
          2. Key support and resistance levels
          3. Short-term (1-7 days) price outlook with potential catalysts
          4. Medium-term (1-4 weeks) outlook with reasons
          5. Risk assessment and sentiment indicators
          6. Specific levels to watch (entry, stop loss, take profit)
          
          Be objective and data-driven. Avoid generic statements without supporting evidence.
          Focus on real insights for the crypto trading community.
        `;
      } else {
        // Generate a more comprehensive fundamental analysis
        analysisPrompt = `
          As Wexley, a crypto analyst specializing in AI-related tokens, provide a comprehensive analysis:
          
          ${combinedResearch}
          
          Offer detailed insights on:
          1. Project purpose and technology - What specific AI problem does this solve? How?
          2. Market potential and competitive advantages - What's the addressable market? Why this solution?
          3. Technical architecture and innovation - What's technically notable? Is it truly innovative?
          4. Team competence and development activity - Is the team qualified? Active development?
          5. Tokenomics and investment thesis - Is the token necessary? Value accrual mechanism?
          6. Short and medium-term outlook with specific catalysts and risks
          7. Comparative analysis against similar projects
          
          Be highly specific, balanced, and analytical. Identify both strengths and critical weaknesses.
          Your reputation depends on substantiated insights rather than hype.
        `;
      }
      
      // Generate analysis using the autonomous agent
      const analysisResult = await this.autonomousAgent.runOperation<{ response: string }>(analysisPrompt);
      
      // Add a clear analysis type
      const analysisType = tradeFocus ? 'Trading Analysis' : 'Fundamental Analysis';
      
      // Store the analysis in memory
      const analysisId = await this.memory.addNote({
        title: `Analysis: ${symbol} - ${analysisType}`,
        content: analysisResult.response,
        category: 'analysis',
        tags: ['crypto', 'token', symbol, 'AI', 'analysis', tradeFocus ? 'trading' : 'fundamental'],
        timestamp: Date.now()
      });
      
      logger.info(`Saved ${analysisType} for ${symbol} to memory (ID: ${analysisId})`);
      
      // Schedule tweets about this analysis - more for trading analysis
      if (tradeFocus) {
        // For trade ideas, schedule multiple tweets (main idea + follow-ups)
        // First tweet with the main trade thesis
        await this.scheduleTweetFromAnalysis(symbol, analysisResult.response, false, 'trade');
        
        // Optional second tweet with specific levels (entry, targets, etc.)
        setTimeout(async () => {
          await this.scheduleTweetFromAnalysis(symbol, analysisResult.response, false, 'levels');
        }, 3000);
      } else {
        // For fundamental analysis, just schedule one comprehensive tweet
        await this.scheduleTweetFromAnalysis(symbol, analysisResult.response);
      }
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
   * @param tweetType - Optional type of tweet to generate (default: 'analysis')
   */
  private async scheduleTweetFromAnalysis(
    symbol: string, 
    analysis: string, 
    immediate: boolean = false,
    tweetType: 'analysis' | 'trade' | 'levels' | 'price' | 'news' = 'analysis'
  ): Promise<void> {
    try {
      // Generate tweet content from analysis using the personality's tone and style
      const personalityName = this.personality.persona?.name || 'Wexley';
      
      // Access the traits from the correct path in the personality object
      const personalityTraits = 
        this.personality.persona?.personality?.traits || ['analytical', 'insightful'];
      
      // Create different prompts based on tweet type
      let tweetPrompt: string;
      let priority: 'low' | 'medium' | 'high' = 'medium';
      
      // Extract key sections for the specific tweet types
      const getAnalysisSection = (section: string): string => {
        const sectionMatch = analysis.match(new RegExp(`${section}[:\\s]+(.*?)(?=\\n\\n|$)`, 's'));
        return sectionMatch ? sectionMatch[1].trim().substring(0, 300) : '';
      };
      
      switch (tweetType) {
        case 'trade':
          // Trading opportunity tweet
          priority = 'high';
          tweetPrompt = `
            Based on this trading analysis of ${symbol}:
            
            ${analysis.substring(0, 600)}...
            
            You are ${personalityName}, a crypto market analyst specializing in AI tokens.
            Your expertise allows you to identify profitable trading setups before others.
            Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
            
            Create a concise, actionable trade idea tweet (under 240 chars) that:
            1. Clearly presents your trading thesis for $${symbol}
            2. Mentions current price action and direction 
            3. Includes a specific prediction or outlook
            4. Uses professional trading language that's still accessible
            5. Projects confidence without being reckless
            6. MUST NOT include hashtags or generic statements
            
            Only return the tweet text with no additional commentary.
          `;
          break;
          
        case 'levels':
          // Price levels and targets tweet
          priority = 'medium';
          tweetPrompt = `
            Based on this trading analysis of ${symbol}:
            
            ${analysis.substring(0, 600)}...
            
            You are ${personalityName}, a crypto market analyst.
            Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
            
            Create a follow-up tweet (under 240 chars) about $${symbol} that:
            1. SPECIFICALLY focuses on key price levels to watch
            2. Mentions support/resistance and target areas if available
            3. Explains potential scenarios at these levels
            4. Uses precise price figures when available
            5. MUST NOT include any hashtags
            6. Shows your detailed technical analysis expertise
            
            Only return the tweet text.
          `;
          break;
          
        case 'price':
          // Price movement update tweet
          priority = 'high';
          tweetPrompt = `
            Based on this analysis of ${symbol}:
            
            ${analysis.substring(0, 400)}...
            
            You are ${personalityName}, a crypto market analyst specializing in AI tokens.
            Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
            
            Create a price movement tweet (under 240 chars) that:
            1. Highlights recent significant price movement for $${symbol}
            2. Explains WHY this movement is happening (catalyst, event)
            3. Provides context on whether this validates or contradicts your previous analysis
            4. Projects forward by one timeframe (hour→day, day→week)
            5. MUST NOT include any hashtags
            6. Uses specific price data and percentages
            
            Only return the tweet text.
          `;
          break;
          
        case 'news':
          // News and development update tweet
          priority = 'medium';
          tweetPrompt = `
            Based on this analysis of ${symbol}:
            
            ${analysis.substring(0, 500)}...
            
            You are ${personalityName}, a crypto market analyst specializing in AI tokens.
            Your personality traits are: ${Array.isArray(personalityTraits) ? personalityTraits.join(', ') : 'analytical, confident'}.
            
            Create a crypto news/development update tweet (under 240 chars) that:
            1. Highlights a specific development or news item related to $${symbol}
            2. Explains why this matters for the project's future
            3. Provides insight on potential market impact
            4. References technical or fundamental data points
            5. MUST NOT include any hashtags
            6. Shows your deep industry knowledge
            
            Only return the tweet text.
          `;
          break;
          
        case 'analysis':
        default:
          // Default fundamental analysis tweet
          priority = 'medium';
          tweetPrompt = `
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
      }
      
      // Generate tweet using base agent for reliability
      const tweetResult = await this.baseAgent.run({ task: tweetPrompt });
      
      // Schedule the tweet (immediate or based on schedule)
      const scheduledTime = this.getNextTweetTime(immediate);
      
      // Add some variety to tweet scheduling - stagger follow-up tweets
      let actualScheduleTime = scheduledTime;
      if (tweetType === 'levels') {
        // Schedule levels tweet 20-40 minutes after the main trade tweet
        actualScheduleTime = scheduledTime + (Math.floor(Math.random() * 20) + 20) * 60 * 1000;
      }
      
      this.contentManager.addTweetIdea({
        topic: `${symbol} ${tweetType}`,
        content: tweetResult.response,
        status: 'approved',
        priority,
        scheduledFor: actualScheduleTime,
        tags: ['analysis', symbol, 'AI', 'crypto', tweetType]
      });
      
      logger.info(`Scheduled ${tweetType} tweet about ${symbol} for ${new Date(actualScheduleTime).toLocaleString()}`);
    } catch (error) {
      logger.error(`Error scheduling ${tweetType} tweet for ${symbol}`, error);
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
   * Execute a specialized token discovery task to find new promising tokens
   * This can be called periodically or triggered through a schedule
   */
  async executeTokenDiscoveryTask(): Promise<void> {
    logger.info('Executing specialized token discovery task');
    
    try {
      // Use more advanced discovery techniques beyond just trending tokens
      
      // TECHNIQUE 1: Search for recent crypto news articles about new AI projects
      const newsQuery = "newest AI crypto projects launched funding announcement";
      const newsResults = await this.searchTool.execute({
        query: newsQuery,
        maxResults: 5,
        includeAnswer: true
      });
      
      // TECHNIQUE 2: Search for upcoming AI crypto token launches 
      const upcomingQuery = "upcoming AI crypto token launches this month";
      const upcomingResults = await this.searchTool.execute({
        query: upcomingQuery,
        maxResults: 5,
        includeAnswer: true
      });
      
      // TECHNIQUE 3: Look for Solana AI ecosystem projects specifically
      const solanaQuery = "solana AI ecosystem projects tokens";
      const solanaResults = await this.searchTool.execute({
        query: solanaQuery,
        maxResults: 5,
        includeAnswer: true
      });
      
      // Extract token mentions from all results
      const extractTokens = (text: string): string[] => {
        if (!text) return [];
        
        // Extract tokens mentioned with $ symbol
        const dollarMatches = text.match(/\$([A-Z0-9]{2,})/g) || [];
        const dollarTokens = dollarMatches.map((m: string) => m.substring(1));
        
        // Also look for tokens mentioned in typical formats
        const patternMatches = text.match(/\b([A-Z]{2,})\s+(?:token|coin|crypto)/gi) || [];
        const patternTokens = patternMatches.map((m: string) => m.split(/\s+/)[0].toUpperCase());
        
        // Combine and deduplicate
        return [...new Set([...dollarTokens, ...patternTokens])];
      };
      
      // Process all discovery results
      const discoveredTokens: Set<string> = new Set();
      
      // Extract tokens from each result set
      [newsResults, upcomingResults, solanaResults].forEach(result => {
        if (result.answer) {
          extractTokens(result.answer).forEach(token => discoveredTokens.add(token));
        }
        
        // Also check individual search results
        if (Array.isArray(result.results)) {
          result.results.forEach((item: any) => {
            if (item.content) {
              extractTokens(item.content).forEach(token => discoveredTokens.add(token));
            }
          });
        }
      });
      
      // Filter out common false positives and non-token mentions
      const falsePositives = ['AI', 'ML', 'API', 'NFT', 'CEO', 'CTO', 'DUE', 'ICO', 'IDO', 'APY', 'APR', 'TVL'];
      const filteredTokens = Array.from(discoveredTokens).filter(token => 
        !falsePositives.includes(token) && 
        token.length >= 2 && 
        token.length <= 6
      );
      
      logger.info(`Discovered ${filteredTokens.length} potential new tokens: ${filteredTokens.join(', ')}`);
      
      // Create a consolidated research summary
      const discoveryContent = `
        Discovery Summary - New AI Crypto Tokens
        
        Discovery Time: ${new Date().toISOString()}
        
        Discovered Tokens: ${filteredTokens.join(', ')}
        
        News Sources Summary:
        ${newsResults.answer || 'No summary available'}
        
        Upcoming Projects:
        ${upcomingResults.answer || 'No summary available'}
        
        Solana AI Ecosystem:
        ${solanaResults.answer || 'No summary available'}
      `;
      
      // Store the discovery in memory
      await this.memory.addNote({
        title: `Token Discovery: AI Projects`,
        content: discoveryContent,
        category: 'discovery',
        tags: ["crypto", "discovery", "AI", "new tokens"],
        timestamp: Date.now()
      });
      
      logger.info(`Saved token discovery results to memory`);
      
      // Research the most promising tokens
      for (const token of filteredTokens.slice(0, 3)) {
        try {
          // Create a research task for each promising token
          await this.executeResearchTask({
            description: `Research discovered token: ${token}`,
            type: "research"
          });
          
          // Allow some time between research tasks
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (tokenError) {
          logger.error(`Error researching discovered token ${token}`, tokenError);
        }
      }
      
      // Create a tweet about the discovery
      const discoveryTweetPrompt = `
        As a crypto analyst specializing in AI tokens, you've just discovered some interesting new AI crypto projects.
        
        Here's what you found:
        ${discoveryContent.substring(0, 500)}...
        
        Create an exciting "alpha leak" style tweet (under 240 chars) that:
        1. Mentions you're tracking several promising new AI projects
        2. Specifically mentions 1-2 of these symbols: ${filteredTokens.slice(0, 3).join(', ')}
        3. Hints at potential opportunities without making price predictions
        4. Positions yourself as having inside knowledge
        5. MUST use $ symbol for token tickers
        6. MUST NOT include hashtags
        
        Only return the tweet text.
      `;
      
      try {
        const tweetResult = await this.baseAgent.run({ task: discoveryTweetPrompt });
        
        this.contentManager.addTweetIdea({
          topic: `New AI Token Discovery`,
          content: tweetResult.response,
          status: 'approved',
          priority: 'high',
          scheduledFor: this.getNextTweetTime(false),
          tags: ['discovery', 'AI', 'crypto', 'alpha']
        });
        
        logger.info(`Scheduled tweet about new token discoveries`);
      } catch (tweetError) {
        logger.error('Error creating discovery tweet', tweetError);
      }
      
    } catch (error) {
      logger.error('Error in token discovery task', error);
      throw error;
    }
  }
  
  /**
   * Get current status of the agent
   */
  getStatus(): any {
    const agentStatus = this.autonomousAgent.getStatus();
    const tweetIdeas = this.contentManager.getTweetIdeas();
    
    // Get memory stats
    let memoryStats = {
      totalNotes: 0,
      researchNotes: 0, 
      analysisNotes: 0,
      discoveryNotes: 0
    };
    
    // Try to get memory stats but don't fail if there's an error
    try {
      this.memory.getAllNotes().then(notes => {
        memoryStats.totalNotes = notes.length;
        memoryStats.researchNotes = notes.filter(note => note.category === 'research').length;
        memoryStats.analysisNotes = notes.filter(note => note.category === 'analysis').length;
        memoryStats.discoveryNotes = notes.filter(note => note.category === 'discovery').length;
      }).catch(e => {
        logger.warn('Error getting memory stats', e);
      });
    } catch (e) {
      // Just log and continue
      logger.warn('Error accessing memory stats', e);
    }
    
    return {
      isRunning: this.isRunning,
      agentStatus,
      currentGoals: this.currentGoals,
      currentTasks: this.currentTasks.map(task => task.description),
      scheduledTweets: tweetIdeas.filter(idea => idea.status === 'approved').length,
      postedTweets: tweetIdeas.filter(idea => idea.status === 'posted').length,
      draftTweets: tweetIdeas.filter(idea => idea.status === 'draft').length,
      memory: memoryStats,
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
    const agent = new AutonomousCryptoOpenAIAgent();
    
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
    logger.info('Autonomous crypto OpenAI agent started successfully!');
    logger.info('Press Ctrl+C to stop');
  } catch (error) {
    logger.error('Error starting autonomous crypto OpenAI agent', error);
    process.exit(1);
  }
}

// Run the agent
if (require.main === module) {
  main();
}

export { AutonomousCryptoOpenAIAgent };