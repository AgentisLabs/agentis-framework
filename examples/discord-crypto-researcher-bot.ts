import dotenv from 'dotenv';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Agent } from '../src/core/agent';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { BirdEyeTrendingTool } from '../src/tools/birdeye-trending-tool';
import { BirdEyeTokenOverviewTool } from '../src/tools/birdeye-token-overview-tool';
import { OpenAIProvider } from '../src/core/openai-provider';
import { Logger } from '../src/utils/logger';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { ToolRegistry } from '../src/tools/tool-registry';
import { MemoryInterface, MemoryEntry } from '../src/memory/memory-interface';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Set up logger
const logger = new Logger('DiscordCryptoResearcherBot');

// Configure paths
const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

if (!process.env.BOT_TOKEN) {
  logger.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

if (!process.env.PINECONE_API_KEY) {
  logger.error('PINECONE_API_KEY is required in .env file');
  process.exit(1);
}

// Vector memory configuration
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'discord-researcher-memory';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'discord-research';

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

// Interface for research memory system
interface ResearchMemorySystem {
  storeResearch(query: string, results: any): Promise<void>;
  getResearch(query: string, maxAgeMs?: number): Promise<any | null>;
  getAllResearchTopics(): Promise<string[]>;
}

// Enhanced memory system using Pinecone vector store
class VectorResearchMemory implements ResearchMemorySystem, MemoryInterface {
  private embeddingService: EmbeddingService;
  private pineconeStore: PineconeStore;
  private initialized: boolean = false;
  
  constructor(pineconeIndex: string, namespace: string) {
    this.embeddingService = new EmbeddingService({
      model: 'text-embedding-3-large',
      dimensions: 1536
    });
    
    this.pineconeStore = new PineconeStore({
      index: pineconeIndex,
      namespace: namespace,
      dimension: 1536
    });
    
    logger.info('Initialized vector research memory system');
  }
  
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.pineconeStore.initialize();
      this.initialized = true;
      logger.info('Vector memory system initialized');
    }
  }
  
  // Implement MemoryInterface methods
  async store(memory: MemoryEntry): Promise<void> {
    await this.initialize();
    try {
      const id = memory.id || `memory_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const embedding = await this.embeddingService.embedText(`${memory.input}\n\n${memory.output}`);
      
      await this.pineconeStore.storeVector(
        id,
        embedding,
        {
          input: memory.input,
          output: memory.output,
          importance: memory.importance || 0.5,
          category: 'agent_memory',
          ...(memory.metadata ? Object.fromEntries(Object.entries(memory.metadata).map(([k, v]) => 
            [k, typeof v === 'object' ? JSON.stringify(v) : v]
          )) : {}),
          timestamp: memory.timestamp || Date.now()
        }
      );
      
      logger.debug(`Stored agent memory: ${memory.input.substring(0, 50)}...`);
    } catch (error) {
      logger.error(`Error storing agent memory`, error);
    }
  }
  
  async retrieve(query: string, limit: number = 3): Promise<string[]> {
    await this.initialize();
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedText(query);
      
      // Search for relevant memory entries
      const searchResults = await this.pineconeStore.searchVectors(
        queryEmbedding, 
        limit
      );
      
      // Map search results to strings
      return searchResults
        .filter(result => result.score > 0.7)
        .map(result => `${result.data.input}\n${result.data.output}`)
        .filter(Boolean);
    } catch (error) {
      logger.error(`Error retrieving memories for query: ${query}`, error);
      return [];
    }
  }
  
  async getAll(): Promise<MemoryEntry[]> {
    await this.initialize();
    
    try {
      // Use a zero vector to retrieve all memories (with a limit)
      const zeroVector = new Array(1536).fill(0);
      const allResults = await this.pineconeStore.searchVectors(zeroVector, 100);
      
      return allResults.map(result => ({
        id: result.id,
        input: result.data.input || '',
        output: result.data.output || '',
        importance: result.data.importance || 0.5,
        metadata: result.data.metadata || {},
        timestamp: result.data.timestamp || 0
      }));
    } catch (error) {
      logger.error('Error retrieving all memories', error);
      return [];
    }
  }
  
  async delete(id: string): Promise<boolean> {
    // Not fully implemented, would require a delete method in PineconeStore
    logger.debug(`Delete method called for memory ID: ${id}`);
    return false;
  }
  
  async clear(): Promise<void> {
    // This method is required by the MemoryInterface
    // In practice, we don't actually clear the vector database here
    logger.debug('Clear method called (no-op for vector memory)');
  }
  
  async storeResearch(query: string, results: any): Promise<void> {
    await this.initialize();
    
    try {
      // Generate a unique ID for this research
      const id = `research_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // Generate embeddings for the query and results
      const embedding = await this.embeddingService.embedText(
        `${query}\n\n${results}`
      );
      
      // Store in Pinecone
      await this.pineconeStore.storeVector(
        id,
        embedding,
        {
          title: `Research: ${query}`,
          content: results,
          query: query,
          category: 'research',
          tags: ['discord', 'research', ...query.split(' ')],
          timestamp: Date.now()
        }
      );
      
      logger.info(`Stored research for query: ${query} in vector database`);
    } catch (error) {
      logger.error(`Error storing research for query: ${query}`, error);
      throw error;
    }
  }
  
  async getResearch(query: string, maxAgeMs: number = 86400000): Promise<any | null> {
    await this.initialize();
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedText(query);
      
      // Search for similar research
      const searchResults = await this.pineconeStore.searchVectors(
        queryEmbedding, 
        3
      );
      
      // Find most relevant result above similarity threshold
      const relevantResult = searchResults.find(result => {
        // Check if it's a research entry
        if (result.data.category !== 'research') return false;
        
        // Check age if maxAgeMs is specified
        if (maxAgeMs > 0) {
          const age = Date.now() - (result.data.timestamp || 0);
          if (age > maxAgeMs) return false;
        }
        
        // Check similarity score (0.75 is a good threshold)
        return result.score > 0.75;
      });
      
      if (relevantResult) {
        logger.info(`Found relevant research for query: ${query}`);
        return relevantResult.data.content;
      }
      
      logger.info(`No relevant research found for query: ${query}`);
      return null;
    } catch (error) {
      logger.error(`Error retrieving research for query: ${query}`, error);
      return null;
    }
  }
  
  async getAllResearchTopics(): Promise<string[]> {
    await this.initialize();
    
    try {
      // Use a zero vector to retrieve all research (with a limit)
      const zeroVector = new Array(1536).fill(0);
      const allResults = await this.pineconeStore.searchVectors(zeroVector, 100);
      
      // Filter for research entries and extract queries
      const researchTopics = allResults
        .filter(result => result.data.category === 'research')
        .map(result => result.data.query)
        .filter(Boolean);
      
      // Remove duplicates
      return Array.from(new Set(researchTopics));
    } catch (error) {
      logger.error('Error retrieving all research topics', error);
      return [];
    }
  }
  
  // Add a crypto-specific research method
  async storeTokenAnalysis(symbol: string, analysis: string): Promise<void> {
    await this.initialize();
    
    try {
      // Generate a unique ID for this analysis
      const id = `token_${symbol.toLowerCase()}_${Date.now()}`;
      
      // Generate embeddings for the token analysis
      const embedding = await this.embeddingService.embedText(
        `${symbol} analysis\n\n${analysis}`
      );
      
      // Store in Pinecone
      await this.pineconeStore.storeVector(
        id,
        embedding,
        {
          title: `Analysis: ${symbol}`,
          content: analysis,
          category: 'token_analysis',
          tags: ['crypto', 'token', symbol, 'analysis'],
          timestamp: Date.now()
        }
      );
      
      logger.info(`Stored token analysis for ${symbol} in vector database`);
    } catch (error) {
      logger.error(`Error storing token analysis for ${symbol}`, error);
      throw error;
    }
  }
  
  // Get token analysis
  async getTokenAnalysis(symbol: string): Promise<any | null> {
    await this.initialize();
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedText(`${symbol} analysis`);
      
      // Search for token analysis
      const searchResults = await this.pineconeStore.searchVectors(
        queryEmbedding, 
        3
      );
      
      // Find most relevant token analysis
      const relevantResult = searchResults.find(result => 
        result.data.category === 'token_analysis' && 
        result.data.tags.includes(symbol.toLowerCase())
      );
      
      if (relevantResult) {
        logger.info(`Found analysis for token: ${symbol}`);
        return relevantResult.data.content;
      }
      
      logger.info(`No analysis found for token: ${symbol}`);
      return null;
    } catch (error) {
      logger.error(`Error retrieving token analysis for ${symbol}`, error);
      return null;
    }
  }
}

// Class for crypto analysis functionalities
class CryptoAnalyzer {
  private birdEyeTrendingTool: BirdEyeTrendingTool;
  private birdEyeTokenOverviewTool: BirdEyeTokenOverviewTool;
  public tavilySearchTool: TavilySearchTool | null;
  private memory: VectorResearchMemory;
  private logger: Logger;
  
  constructor(memory: VectorResearchMemory, tavilySearchTool: TavilySearchTool | null = null) {
    this.birdEyeTrendingTool = new BirdEyeTrendingTool();
    this.birdEyeTokenOverviewTool = new BirdEyeTokenOverviewTool();
    this.memory = memory;
    this.logger = new Logger('CryptoAnalyzer');
    this.tavilySearchTool = null; // Initialize with null
    
    // Ensure we have a valid search tool
    if (!tavilySearchTool) {
      this.logger.warn('No search tool provided to CryptoAnalyzer constructor, will try to get from registry');
      
      // Try to get from registry
      const registry = ToolRegistry.getInstance();
      const registryTool = registry.getTool('web_search');
      
      if (registryTool) {
        this.logger.info('Retrieved search tool from registry');
        this.tavilySearchTool = registryTool as TavilySearchTool;
      } else {
        this.logger.error('No search tool available in registry');
      }
    } else {
      this.logger.info(`Setting search tool: ${tavilySearchTool.name}`);
      this.tavilySearchTool = tavilySearchTool;
    }
    
    // Log availability 
    if (this.tavilySearchTool) {
      this.logger.info('CryptoAnalyzer initialized with search tool');
    } else {
      this.logger.error('CryptoAnalyzer initialized WITHOUT search tool - research will fail');
    }
  }
  
  async getTrendingTokens(limit: number = 10): Promise<any> {
    try {
      const trendingResult = await this.birdEyeTrendingTool.execute({
        limit: limit
      });
      
      return trendingResult;
    } catch (error) {
      this.logger.error('Error getting trending tokens', error);
      throw error;
    }
  }
  
  async getTokenOverview(token: string): Promise<any> {
    try {
      const tokenResult = await this.birdEyeTokenOverviewTool.execute({
        token: token
      });
      
      return tokenResult;
    } catch (error) {
      this.logger.error(`Error getting token overview for ${token}`, error);
      throw error;
    }
  }
  
  async analyzeToken(symbol: string, agent: Agent): Promise<string> {
    try {
      // First check if we already have analysis for this token
      const existingAnalysis = await this.memory.getTokenAnalysis(symbol);
      if (existingAnalysis) {
        this.logger.info(`Using cached analysis for ${symbol}`);
        return existingAnalysis;
      }
      
      // Double check that we have access to the search tool BEFORE trying to get token data
      if (!this.tavilySearchTool) {
        this.logger.error(`No search tool available for token ${symbol} analysis`);
        throw new Error('Search tool not available for token analysis');
      }
      
      this.logger.info(`Search tool is available for token ${symbol} analysis`);
      
      // Try to get token data from BirdEye
      let tokenData;
      try {
        tokenData = await this.getTokenOverview(symbol);
        this.logger.info(`Got token data from BirdEye: ${!!tokenData}`);
      } catch (error: any) {
        this.logger.warn(`Error getting token data from BirdEye: ${error?.message || 'Unknown error'}`);
        tokenData = null;
      }
      
      // If we couldn't get token data, do a general search
      if (!tokenData || !tokenData.token) {
        this.logger.info(`No direct data for ${symbol}, using search tool`);
        
        // Use Tavily to search for token information
        const searchQuery = `${symbol} crypto token details project`;
        this.logger.info(`Executing search for: "${searchQuery}"`);
        
        // Double-check we have the search tool
        if (!this.tavilySearchTool) {
          throw new Error('Search tool not available for token search');
        }
        
        const searchResults = await this.tavilySearchTool.execute({
          query: searchQuery,
          maxResults: 5,
          includeAnswer: true
        });
        
        this.logger.info(`Got search results with ${searchResults.results?.length || 0} items`);
        
        // Debug the structure of the search results
        this.logger.info(`Search results keys: ${Object.keys(searchResults).join(', ')}`);
        if (searchResults.results && searchResults.results.length > 0) {
          const sample = searchResults.results[0];
          this.logger.info(`First result keys: ${Object.keys(sample).join(', ')}`);
        }
        
        // Format search results - use both snippet and content fields for flexibility
        const sourcesList = Array.isArray(searchResults.results) 
          ? searchResults.results.slice(0, 3).map((result: any, index: number) => 
              `[${index + 1}] ${result.title || 'Untitled'}: ${result.url || 'No URL'}\n${result.snippet?.substring(0, 300) || (result.content?.substring(0, 300) || '')}...\n`
            ).join('\n') 
          : 'No sources available';
        
        // Create a more compact context to reduce token usage
        const context = `
          Token: ${symbol}
          
          Research Summary:
          ${searchResults.answer || 'No summary available'}
          
          Sources:
          ${sourcesList}
        `;
        
        // Generate analysis using the agent
        this.logger.info(`Sending token analysis prompt to agent`);
        const analysisPrompt = `
          As a crypto analyst, please analyze this token:
          
          ${context}
          
          Provide a comprehensive analysis focusing on:
          1. Use case and technology overview
          2. Market potential and adoption
          3. Technical fundamentals and tokenomics
          4. Development activity and team
          5. Short and medium-term outlook
          
          Be objective and balanced in your assessment. Identify both strengths and weaknesses.
        `;
        
        const analysisResult = await agent.run({ task: analysisPrompt });
        this.logger.info(`Received analysis response with ${analysisResult.response.length} characters`);
        
        // Store the analysis AFTER successfully generating it
        await this.memory.storeTokenAnalysis(symbol, analysisResult.response);
        this.logger.info(`Stored token analysis for ${symbol} in memory`);
        
        return analysisResult.response;
      }
      
      // If we have good token data, create a detailed analysis context
      // First get additional context with the search tool to supplement BirdEye data
      this.logger.info(`Getting supplementary search data for ${symbol}`);
      
      // Double-check we have the search tool
      if (!this.tavilySearchTool) {
        throw new Error('Search tool not available for supplementary token search');
      }
      
      const searchQuery = `${symbol} crypto token project information`;
      const searchResults = await this.tavilySearchTool.execute({
        query: searchQuery,
        maxResults: 3,
        includeAnswer: true
      });
      
      this.logger.info(`Got supplementary search results with ${searchResults.results?.length || 0} items`);
      
      // Format search results as additional context
      const sourcesList = Array.isArray(searchResults.results) 
        ? searchResults.results.slice(0, 2).map((result: any, index: number) => 
            `[${index + 1}] ${result.title || 'Untitled'}: ${result.url || 'No URL'}\n${result.snippet?.substring(0, 200) || (result.content?.substring(0, 200) || '')}...\n`
          ).join('\n') 
        : '';
      
      const data = tokenData.token;
      
      // Format market metrics - more compact to reduce token usage
      const marketSummary = `
        Token: ${data.name} (${data.symbol})
        Current Price: $${data.price?.toFixed(6) || 'N/A'}
        24h Change: ${data.priceChange24h?.toFixed(2) || 'N/A'}%
        24h Volume: $${data.volume24hUSD ? (data.volume24hUSD / 1000000).toFixed(2) : 'N/A'} million
        Market Cap: $${data.marketCap ? (data.marketCap / 1000000).toFixed(2) : 'N/A'} million
        Liquidity: $${data.liquidity ? (data.liquidity / 1000000).toFixed(2) : 'N/A'} million
        Holders: ${data.holders?.toLocaleString() || 'N/A'}
        Website: ${data.links?.website || 'N/A'}
        Twitter: ${data.links?.twitter || 'N/A'}
        
        Project Description: 
        ${data.description || 'No description available'}
        
        Additional Context:
        ${searchResults.answer || ''}
        
        ${sourcesList ? `Sources:\n${sourcesList}` : ''}
      `;
      
      // Generate analysis with the agent
      this.logger.info(`Sending token analysis prompt with market data to agent`);
      const analysisPrompt = `
        As a crypto analyst, analyze this token data:
        
        ${marketSummary}
        
        Provide an in-depth analysis with:
        1. Key observations about the token's use case and value proposition
        2. Market potential and adoption outlook
        3. Technical strengths and concerns
        4. Competition and market positioning
        5. Risks and opportunities
        6. Short-term and medium-term outlook
        
        Focus on data-driven insights rather than speculation.
      `;
      
      // Generate the analysis
      this.logger.info(`Sending analysis prompt to agent with ${analysisPrompt.length} characters`);
      const analysisResult = await agent.run({ task: analysisPrompt });
      this.logger.info(`Received analysis response with ${analysisResult.response.length} characters`);
      
      // Store the analysis AFTER successfully generating it
      await this.memory.storeTokenAnalysis(symbol, analysisResult.response);
      this.logger.info(`Stored token analysis for ${symbol} in memory`);
      
      return analysisResult.response;
    } catch (error) {
      this.logger.error(`Error analyzing token ${symbol}`, error);
      throw error;
    }
  }
}

// Function to split message content if it exceeds Discord's limit
function splitMessage(text: string, maxLength = 2000) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by lines
  const lines = text.split('\n');
  
  for (const line of lines) {
    // If adding this line would exceed the max length, push current chunk and start a new one
    if (currentChunk.length + line.length + 1 > maxLength) {
      // If the current line itself is too long
      if (line.length > maxLength) {
        // Add current chunk if not empty
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // Split the long line
        let remainingLine = line;
        while (remainingLine.length > 0) {
          const chunkSize = Math.min(remainingLine.length, maxLength);
          chunks.push(remainingLine.substring(0, chunkSize));
          remainingLine = remainingLine.substring(chunkSize);
        }
      } else {
        // Push current chunk and start new one with this line
        chunks.push(currentChunk);
        currentChunk = line;
      }
    } else {
      // Add line to current chunk
      if (currentChunk) {
        currentChunk += '\n' + line;
      } else {
        currentChunk = line;
      }
    }
  }
  
  // Add last chunk if there is one
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

async function startDiscordBot() {
  try {
    logger.info('Starting Enhanced Discord Crypto Researcher bot with Wexley persona...');

    // Create Tavily search tool if API key is available
    let searchTool;
    if (process.env.TAVILY_API_KEY) {
      logger.info('Using Tavily search tool');
      searchTool = new TavilySearchTool(process.env.TAVILY_API_KEY);
    } else {
      logger.warn('TAVILY_API_KEY not found, using mock web search tool');
      searchTool = new WebSearchTool();
    }

    // Create OpenAI provider for GPT-4o
    const openaiProvider = new OpenAIProvider({
      model: 'gpt-4o', // Use GPT-4o model
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // Set up memory with Pinecone vector store
    const memory = new VectorResearchMemory(PINECONE_INDEX, PINECONE_NAMESPACE);
    await memory.initialize();
    
    // Create crypto analyzer
    const cryptoAnalyzer = new CryptoAnalyzer(memory, searchTool as TavilySearchTool | null);

    // Extract Wexley personality traits
    const personality = wexleyPersona.persona.personality;
    const traits = personality.traits.join(', ');
    const communication = personality.communication;
    const tone = communication.tone.join(', ');
    const style = communication.style.join(', ');
    const quirks = communication.quirks.join('; ');
    const platformStyle = wexleyPersona.content.preferences.platformStyle.chat;

    // Create an agent with Wexley persona using GPT-4o
    const agent = new Agent({
      name: 'Wexley',
      role: 'Market Analyst & Researcher',
      personality: {
        traits: personality.traits,
        background: wexleyPersona.persona.background.backstory,
        voice: `Direct, authoritative tone. ${communication.vocabulary}. Uses data points and specific examples.`
      },
      goals: [
        "Provide insightful market analysis",
        "Research projects and topics thoroughly using web search",
        "Identify emerging trends in AI and crypto",
        "Deliver authoritative information on tokenomics and market cycles",
        "Express contrarian views that challenge conventional wisdom",
        "Store and retrieve knowledge efficiently using vector memory"
      ],
      systemPrompt: `
        You are Wexley, a 42-year-old crypto/AI market researcher, serial entrepreneur, and angel investor.
        You're known for your direct, authoritative communication style and contrarian market insights.

        PERSONALITY:
        - Traits: ${traits}
        - Communication tone: ${tone}
        - Communication style: ${style}
        - Communication quirks: ${quirks}
        - Vocabulary: ${communication.vocabulary}

        RESPONSE STYLE FOR DISCORD:
        - Response length: ${platformStyle.responseLength}
        - Emoji usage: ${platformStyle.emoji}
        - Casualness: ${platformStyle.casualness}

        CORE EXPERTISE:
        - AI/crypto market convergence patterns
        - Tokenomics design and incentive mechanisms
        - Blockchain infrastructure analysis
        - Market cycle identification
        - Decentralized governance structures
        - AI computing resource markets
        - Venture capital in digital assets

        RESEARCH CAPABILITIES:
        - You can search the web to find information on any topic
        - You excel at researching crypto projects, blockchain technologies, and AI trends
        - You can get real-time crypto market data using specialized tools
        - You can provide detailed analysis and summaries of your research
        - You store research in persistent vector memory to reference in future conversations
        - You can provide substantiated opinions based on your research

        CRYPTO ANALYSIS CAPABILITIES:
        - You can fetch trending tokens using BirdEye
        - You can analyze specific tokens and get detailed metrics
        - You can provide technical and fundamental analysis of crypto projects
        - You store token analyses in memory for future reference

        IMPORTANT GUIDELINES:
        1. Stay in character as Wexley at all times
        2. Be direct, confident, and occasionally abrasive in your communication
        3. Speak authoritatively about markets, technology, and investing
        4. Use data points and specific examples to back up your claims
        5. Don't hedge unnecessarily - be definitive in your assessments
        6. Use technical terminology appropriate for the audience
        7. Express contrarian views that challenge conventional wisdom
        8. For crypto mentions, use the $ prefix format ($BTC, $ETH, etc.)
        9. You have access to real-time information via specialized tools - use it to provide accurate market data
        10. When discussing market trends or technology developments, use your tools to get current information

        DISCORD COMMANDS:
        - !ask [question] - Answer a question using your knowledge
        - !research [topic] - Conduct in-depth research on a topic and provide analysis
        - !token [symbol] - Analyze a specific crypto token with latest data
        - !trending - List trending crypto tokens on Solana
        - !topics - List recent research topics you've investigated
        - !help - Show available commands

        When users ask about topics outside your expertise, still respond in character but acknowledge when something is outside your primary focus areas.
        If users ask for harmful content, refuse while staying in character as Wexley who values rationality.
      `
    }, openaiProvider);

    // Register tools with ToolRegistry
    const registry = ToolRegistry.getInstance();
    
    // Register search tool - critical for all research functions
    try {
      if (!searchTool) {
        throw new Error('Search tool not initialized properly');
      }
      
      // Check if already registered
      const existingTool = registry.getTool('web_search');
      if (existingTool) {
        logger.info('Search tool already registered in registry');
      } else {
        registry.registerTool(searchTool);
        logger.info(`Registered search tool with registry: ${searchTool.name}`);
      }
      
      // Double-check registration was successful
      const registeredTool = registry.getTool('web_search');
      if (!registeredTool) {
        throw new Error('Failed to register search tool');
      }
    } catch (error) {
      logger.error('Error registering search tool', error);
      // This is critical, so we'll exit if it fails
      process.exit(1);
    }
    
    // Register BirdEye trending tool
    const birdEyeTrendingTool = new BirdEyeTrendingTool();
    try {
      registry.registerTool(birdEyeTrendingTool);
      logger.info('Registered BirdEye trending tool with registry');
    } catch (error) {
      logger.warn('Error registering BirdEye trending tool', error);
    }
    
    // Register BirdEye token overview tool
    const birdEyeTokenOverviewTool = new BirdEyeTokenOverviewTool();
    try {
      registry.registerTool(birdEyeTokenOverviewTool);
      logger.info('Registered BirdEye token overview tool with registry');
    } catch (error) {
      logger.warn('Error registering BirdEye token overview tool', error);
    }
    
    // Set memory for the agent
    (agent as any).memory = memory;

    // Create a Discord client with necessary intents
    // Note: MessageContent is a privileged intent that must be enabled in Discord Developer Portal
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    // Listen for the client to be ready
    client.once(Events.ClientReady, readyClient => {
      logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
      logger.info(`Bot application ID: ${readyClient.user.id}`);
      
      // List all guilds the bot is in
      const guildsInfo = client.guilds.cache.map(guild => ({
        name: guild.name,
        id: guild.id,
        memberCount: guild.memberCount
      }));
      
      logger.info(`Bot is in ${guildsInfo.length} servers: ${JSON.stringify(guildsInfo)}`);
      
      // If the bot is in no servers, provide the invite link
      if (guildsInfo.length === 0) {
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=67584&scope=bot%20applications.commands`;
        logger.info(`To invite the bot to a server, use this URL: ${inviteUrl}`);
      }
      
      // Send a message to the first text channel found when bot joins
      try {
        // Get first available guild (server)
        const guilds = client.guilds.cache.values();
        for (const guild of guilds) {
          logger.info(`Checking channels in guild: ${guild.name}`);
          // Find the first text channel where the bot can send messages
          const textChannel = guild.channels.cache.find(
            channel => channel.isTextBased() && 
            channel.permissionsFor(guild.members.me!)?.has('SendMessages')
          );
          
          if (!textChannel) {
            logger.warn(`No suitable text channel found in guild: ${guild.name}`);
          }
          
          if (textChannel && textChannel.isTextBased()) {
            textChannel.send(`Hello! I'm Wexley, a market analyst and researcher. I can help answer questions and conduct research for you.
            
Use these commands:
- **!ask** [question] - Answer a question using my knowledge
- **!research** [topic] - Conduct in-depth research on a topic
- **!token** [symbol] - Analyze a specific crypto token with latest data
- **!trending** - List trending crypto tokens on Solana
- **!topics** - List topics I've researched
- **!help** - Show available commands

You can also just mention me with your question!`);
            logger.info(`Sent startup message to channel ${textChannel.name} in ${guild.name}`);
            break; // Stop after sending to the first available channel
          }
        }
      } catch (error) {
        logger.error('Error sending startup message:', error);
      }
    });

    // Log important events
    client.on(Events.Error, error => {
      logger.error('Discord client error:', error);
    });
    
    client.on(Events.Warn, warning => {
      logger.warn('Discord client warning:', warning);
    });
    
    // Log when a guild becomes available or unavailable
    client.on(Events.GuildCreate, guild => {
      logger.info(`Bot added to new guild: ${guild.name} (${guild.id})`);
    });
    
    client.on(Events.GuildDelete, guild => {
      logger.info(`Bot removed from guild: ${guild.name || 'Unknown'} (${guild.id})`);
    });
    
    // Handle messages
    client.on(Events.MessageCreate, async message => {
      // Log all incoming messages for debugging
      logger.info(`Received message: "${message.content}" from ${message.author.tag} in ${message.guild?.name || 'DM'}`);
      
      // Ignore messages from bots (including self)
      if (message.author.bot) return;
      
      // Check if the message is a command or mentions the bot
      const PREFIX = '!'; // Command prefix
      const isMentioned = message.mentions.users.has(client.user!.id);
      const isCommand = message.content.startsWith(PREFIX);
      
      if (!isCommand && !isMentioned) return;
      
      try {
        // Extract command and arguments or question
        let command = '';
        let args: string[] = [];
        
        if (isCommand) {
          const commandBody = message.content.slice(PREFIX.length).trim();
          args = commandBody.split(' ');
          command = args.shift()?.toLowerCase() || '';
        } else if (isMentioned) {
          // Remove the mention from the message
          const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();
          command = 'ask'; // Default to ask when mentioned
          args = content.split(' ');
        }
        
        // Send typing indicator - this shows "Wexley is typing..." in Discord
        await message.channel.sendTyping();
        
        // Handle commands
        switch (command) {
          case 'ask':
          case 'a':
            await handleAskCommand(message, args.join(' '), agent);
            break;
            
          case 'research':
          case 'r':
            await handleResearchCommand(message, args.join(' '), agent, searchTool, memory);
            break;
            
          case 'token':
          case 'analyze':
            await handleTokenCommand(message, args.join(' '), agent, cryptoAnalyzer);
            break;
            
          case 'trending':
          case 'tr':
            await handleTrendingCommand(message, cryptoAnalyzer);
            break;
            
          case 'topics':
          case 't':
            await handleTopicsCommand(message, memory);
            break;
            
          case 'help':
          case 'h':
            await message.reply({
              content: `**Commands:**
!ask [question] - Ask me a question using my knowledge
!research [topic] - Conduct in-depth research on a topic and provide analysis
!token [symbol] - Analyze a specific crypto token with latest data
!trending - List trending crypto tokens on Solana
!topics - List topics I've recently researched
!help - Show this help message

You can also mention me to ask a question without using the prefix.`
            });
            break;
            
          default:
            // If mentioned but command not recognized, treat as ask
            if (isMentioned) {
              await handleAskCommand(message, message.content.replace(/<@!?[0-9]+>/g, '').trim(), agent);
            }
        }
      } catch (error) {
        logger.error('Error processing message:', error);
        await message.reply("I encountered an error while processing your request. Please try again later.");
      }
    });

    // Log in to Discord
    logger.info('Attempting to log in to Discord...');
    
    client.login(process.env.BOT_TOKEN).catch(error => {
      logger.error(`Failed to log in to Discord: ${error.message}`);
    });
    
    logger.info('Discord bot started successfully');
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Discord bot...');
      client.destroy();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error starting Discord bot:', error);
    process.exit(1);
  }
}

/**
 * Handle the ask command
 */
async function handleAskCommand(message: any, question: string, agent: Agent): Promise<void> {
  if (!question) {
    await message.reply("What can I help you with?");
    return;
  }
  
  // Send thinking message
  const thinkingMsg = await message.reply("Thinking...");
  
  try {
    logger.info(`Running agent for question: "${question.substring(0, 100)}..."`);
    
    // Run the agent to answer the question
    const result = await agent.run({
      task: question,
      conversation: {
        id: `discord-${message.id}`,
        messages: [],
        created: Date.now(),
        updated: Date.now(),
        metadata: {
          channelId: message.channelId,
          guildId: message.guildId,
          authorId: message.author.id
        }
      }
    });
    
    logger.info(`Got agent response with length: ${result.response.length}`);
    
    // Split long responses if needed
    const responses = splitMessage(result.response);
    
    logger.info(`Split into ${responses.length} parts`);
    
    // Edit the "thinking" message with the first part
    await thinkingMsg.edit(responses[0]);
    
    // Send additional messages for remaining parts
    for (let i = 1; i < responses.length; i++) {
      await message.channel.send(responses[i]);
    }
  } catch (error) {
    logger.error(`Error running agent for question: ${question}`, error);
    await thinkingMsg.edit("I encountered an error while processing your question. Please try again later.");
  }
}

/**
 * Handle the research command
 */
async function handleResearchCommand(
  message: any, 
  topic: string, 
  agent: Agent,
  searchTool: any, // Keep this parameter for compatibility
  memory: ResearchMemorySystem
): Promise<void> {
  logger.info(`Research command received for topic: "${topic}"`);
  if (!topic) {
    await message.reply("Please provide a topic to research!");
    return;
  }
  
  // Send thinking message
  const thinkingMsg = await message.reply(`Researching "${topic}"... This may take a moment.`);
  
  try {
    // Get the tool registry FIRST - we need to make sure the search tool is available
    // before doing anything else - this is the key fix
    const registry = ToolRegistry.getInstance();
    logger.info('Checking tool registry for search tool');
    let tavilyTool = registry.getTool('web_search');
    
    if (!tavilyTool) {
      // If not found in registry, use the provided searchTool as fallback
      logger.warn('web_search tool not found in registry, using provided searchTool');
      tavilyTool = searchTool;
    }
    
    if (!tavilyTool) {
      throw new Error('No search tool available');
    }
    
    logger.info(`Found search tool: ${tavilyTool.name} for researching "${topic}"`);
    
    // NOW check if we have cached research
    logger.info(`Checking for cached research on "${topic}"`);
    const cachedResearch = await memory.getResearch(topic);
    
    if (cachedResearch) {
      logger.info(`Found cached research for "${topic}"`);
      
      // Use cached research
      const responses = splitMessage(cachedResearch);
      
      // Edit the "thinking" message with the first part
      await thinkingMsg.edit(`**Research on "${topic}"** (from memory):\n\n${responses[0]}`);
      
      // Send additional messages for remaining parts
      for (let i = 1; i < responses.length; i++) {
        await message.channel.send(responses[i]);
      }
      
      return;
    }
    
    logger.info(`No cached research found for "${topic}", performing search`);
    
    // Perform new research using the search tool - after we've confirmed it exists
    const searchResults = await tavilyTool.execute({
      query: topic,
      maxResults: 5, // Reduced from 7 to lower token usage
      includeAnswer: true
    });
    
    logger.info(`Successfully retrieved search results for "${topic}" with ${searchResults.results?.length || 0} items`);
    
    // Create a more compact source list to reduce token usage
    const sourcesList = Array.isArray(searchResults.results) 
      ? searchResults.results.map((result: any, index: number) => 
          `[${index + 1}] ${result.title || 'Untitled'}: ${result.url || 'No URL'}\n${result.snippet?.substring(0, 200) || (result.content?.substring(0, 200) || '')}...\n`
        ).join('\n')
      : 'No sources available';
    
    // Generate detailed analysis using the agent with a more compact prompt
    const researchPrompt = `
      Create a comprehensive analysis about: "${topic}"
      
      Search summary: ${searchResults.answer || 'No summary available'}
      
      Sources:
      ${sourcesList}
      
      Analysis should include:
      1. Topic overview
      2. Key trends and insights
      3. Your expert perspective
      4. Data points and examples
      5. Challenges or controversies
      6. Implications and assessment
      
      Use clear sections and bullet points where appropriate.
    `;
    
    logger.info(`Sending research prompt to agent with ${researchPrompt.length} characters`);
    const analysisResult = await agent.run({ task: researchPrompt });
    logger.info(`Received analysis with ${analysisResult.response.length} characters`);
    
    // Store the research in memory AFTER successful analysis
    await memory.storeResearch(topic, analysisResult.response);
    logger.info(`Stored research for "${topic}" in memory`);
    
    // Split long responses if needed
    const responses = splitMessage(analysisResult.response);
    logger.info(`Split analysis into ${responses.length} parts for Discord message limits`);
    
    // Edit the "thinking" message with the first part
    await thinkingMsg.edit(`**Research on "${topic}"**:\n\n${responses[0]}`);
    
    // Send additional messages for remaining parts
    for (let i = 1; i < responses.length; i++) {
      await message.channel.send(responses[i]);
    }
    
    logger.info(`Successfully completed research on "${topic}"`);
    
  } catch (error) {
    logger.error(`Error researching topic "${topic}":`, error);
    await thinkingMsg.edit(`I encountered an error while researching "${topic}". Please try again later.`);
  }
}

/**
 * Handle the token command
 */
async function handleTokenCommand(
  message: any,
  symbol: string,
  agent: Agent,
  cryptoAnalyzer: CryptoAnalyzer
): Promise<void> {
  if (!symbol) {
    await message.reply("Please provide a token symbol to analyze (e.g., BTC, ETH, SOL)");
    return;
  }
  
  // Extract token symbol from text
  const tokenRegex = /^[A-Za-z0-9]{2,10}$/;
  let tokenSymbol = symbol.toUpperCase().trim();
  
  // Remove $ prefix if present
  if (tokenSymbol.startsWith('$')) {
    tokenSymbol = tokenSymbol.substring(1);
  }
  
  if (!tokenRegex.test(tokenSymbol)) {
    tokenSymbol = tokenSymbol.replace(/[^A-Za-z0-9]/g, '');
    if (!tokenRegex.test(tokenSymbol)) {
      await message.reply("Please provide a valid token symbol (e.g., BTC, ETH, SOL)");
      return;
    }
  }
  
  // Send thinking message
  const thinkingMsg = await message.reply(`Analyzing token $${tokenSymbol}... This may take a moment.`);
  
  try {
    logger.info(`Preparing to analyze token: ${tokenSymbol}`);
    
    // First check if TavilySearchTool is properly available in the CryptoAnalyzer
    const analyzeTool = cryptoAnalyzer.tavilySearchTool;
    
    if (!analyzeTool) {
      logger.warn('tavilySearchTool not found in cryptoAnalyzer, will check registry');
      
      // Try to get the tool from registry and update the analyzer
      const registry = ToolRegistry.getInstance();
      const tavilyTool = registry.getTool('web_search');
      
      if (!tavilyTool) {
        logger.error('Search tool not found in registry, cannot proceed with token analysis');
        throw new Error('Search tool not available. Please try again later.');
      }
      
      // Dynamically update the cryptoAnalyzer with the search tool
      cryptoAnalyzer.tavilySearchTool = tavilyTool as TavilySearchTool;
      logger.info('Updated cryptoAnalyzer with search tool from registry');
    } else {
      logger.info('CryptoAnalyzer already has search tool available');
    }
    
    // Now perform the token analysis
    logger.info(`Analyzing token: ${tokenSymbol}`);
    const analysis = await cryptoAnalyzer.analyzeToken(tokenSymbol, agent);
    
    logger.info(`Got analysis for ${tokenSymbol} with length: ${analysis.length}`);
    
    // Split long responses if needed
    const responses = splitMessage(analysis);
    
    logger.info(`Split into ${responses.length} parts`);
    
    // Edit the "thinking" message with the first part
    await thinkingMsg.edit(`**Analysis of $${tokenSymbol}**:\n\n${responses[0]}`);
    
    // Send additional messages for remaining parts
    for (let i = 1; i < responses.length; i++) {
      await message.channel.send(responses[i]);
    }
  } catch (error) {
    logger.error(`Error analyzing token ${tokenSymbol}:`, error);
    await thinkingMsg.edit(`I encountered an error while analyzing token $${tokenSymbol}. Please try again later.`);
  }
}

/**
 * Handle the trending command
 */
async function handleTrendingCommand(
  message: any,
  cryptoAnalyzer: CryptoAnalyzer
): Promise<void> {
  // Send thinking message
  const thinkingMsg = await message.reply("Fetching trending crypto tokens...");
  
  try {
    // Get trending tokens
    const trendingData = await cryptoAnalyzer.getTrendingTokens(10);
    
    if (!trendingData || !trendingData.tokens || trendingData.tokens.length === 0) {
      await thinkingMsg.edit("I couldn't find any trending tokens at the moment. Please try again later.");
      return;
    }
    
    // Format the trending tokens data
    const tokens = trendingData.tokens.slice(0, 10);
    
    let response = `**Top Trending Crypto Tokens**\n\n`;
    response += `| Token | Price | 24h Change | Volume |\n`;
    response += `| --- | --- | --- | --- |\n`;
    
    for (const token of tokens) {
      const price = `$${token.price.toFixed(6)}`;
      const change = `${token.priceChange24h >= 0 ? '▲' : '▼'} ${Math.abs(token.priceChange24h).toFixed(2)}%`;
      const volume = `$${(token.volume24h / 1000000).toFixed(2)}M`;
      
      response += `| $${token.symbol} | ${price} | ${change} | ${volume} |\n`;
    }
    
    response += `\nUse \`!token [symbol]\` to get detailed analysis on any of these tokens.`;
    
    // Edit the "thinking" message with the response
    await thinkingMsg.edit(response);
  } catch (error) {
    logger.error('Error fetching trending tokens:', error);
    await thinkingMsg.edit("I encountered an error while fetching trending tokens. Please try again later.");
  }
}

/**
 * Handle the topics command
 */
async function handleTopicsCommand(message: any, memory: ResearchMemorySystem): Promise<void> {
  try {
    logger.info('Retrieving all research topics');
      
    // Get all research topics
    const topics = await memory.getAllResearchTopics();
    
    logger.info(`Found ${topics.length} research topics`);
    
    if (topics.length === 0) {
      await message.reply("I haven't researched any topics yet. Ask me to research something using the `!research` command!");
      return;
    }
    
    // Format the list of topics
    const formattedTopics = topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n');
    
    // Send the response
    await message.reply(`**Topics I've Researched:**\n\n${formattedTopics}\n\nTo view research on any of these topics, use the \`!research [topic]\` command.`);
    
  } catch (error) {
    logger.error('Error retrieving research topics:', error);
    await message.reply("I encountered an error while retrieving research topics. Please try again later.");
  }
}

// Start the Discord bot
startDiscordBot();