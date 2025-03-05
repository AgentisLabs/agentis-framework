import dotenv from 'dotenv';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Agent } from '../src/core/agent';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { BirdEyeTrendingTool } from '../src/tools/birdeye-trending-tool';
import { BirdEyeTokenOverviewTool } from '../src/tools/birdeye-token-overview-tool';
import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
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
  private coinGeckoPriceTool: CoinGeckoPriceTool;
  public tavilySearchTool: TavilySearchTool | null = null;
  private memory: VectorResearchMemory;
  private logger: Logger;
  
  // Common token symbol to CoinGecko ID mapping
  private tokenSymbolMap: Record<string, string> = {
    'btc': 'bitcoin',
    'eth': 'ethereum',
    'sol': 'solana',
    'doge': 'dogecoin',
    'usdt': 'tether',
    'usdc': 'usd-coin',
    'xrp': 'ripple',
    'ada': 'cardano',
    'avax': 'avalanche-2',
    'dot': 'polkadot',
    'matic': 'polygon',
    'shib': 'shiba-inu',
    'link': 'chainlink',
    'ltc': 'litecoin',
    'uni': 'uniswap',
    'atom': 'cosmos',
    'bnb': 'binancecoin',
    'trx': 'tron',
    'dai': 'dai',
    'aave': 'aave'
  };
  
  constructor(memory: VectorResearchMemory, tavilySearchTool: TavilySearchTool | null = null) {
    this.birdEyeTrendingTool = new BirdEyeTrendingTool();
    this.birdEyeTokenOverviewTool = new BirdEyeTokenOverviewTool();
    this.coinGeckoPriceTool = new CoinGeckoPriceTool();
    this.memory = memory;
    this.logger = new Logger('CryptoAnalyzer');
    
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
    
    // Register CoinGecko price tool with registry
    try {
      const registry = ToolRegistry.getInstance();
      registry.registerTool(this.coinGeckoPriceTool);
      this.logger.info('Registered CoinGecko price tool with registry');
    } catch (error) {
      this.logger.warn('Error registering CoinGecko price tool', error);
    }
  }
  
  /**
   * Maps a token symbol to its CoinGecko ID
   * Falls back to using the symbol itself if no mapping exists
   */
  mapSymbolToCoingeckoId(symbol: string): string {
    const normalizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
    return this.tokenSymbolMap[normalizedSymbol] || normalizedSymbol;
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
  
  async getTokenPrice(tokenId: string): Promise<any> {
    try {
      this.logger.info(`Getting CoinGecko price data for token ID: ${tokenId}`);
      
      const priceResult = await this.coinGeckoPriceTool.execute({
        tokenId: tokenId
      });
      
      // Parse the JSON string result
      let parsedResult;
      try {
        parsedResult = JSON.parse(priceResult);
        this.logger.info(`Successfully got price data for ${tokenId}`);
      } catch (parseError) {
        // If it's an error message, it may not be valid JSON
        this.logger.error(`Error parsing price data for ${tokenId}: ${priceResult}`);
        return { error: priceResult };
      }
      
      return parsedResult;
    } catch (error) {
      this.logger.error(`Error getting price data for ${tokenId}`, error);
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
        
        // Try once more to get the search tool from the registry as a fallback
        const registry = ToolRegistry.getInstance();
        const registryTool = registry.getTool('web_search');
        
        if (registryTool) {
          this.logger.info(`Retrieved search tool from registry for ${symbol} analysis`);
          this.tavilySearchTool = registryTool as TavilySearchTool;
        } else {
          throw new Error('Search tool not available for token analysis');
        }
      }
      
      this.logger.info(`Search tool is available for token ${symbol} analysis`);
      
      // Try to get token data from multiple sources
      // 1. First try BirdEye for detailed token data
      let tokenData;
      try {
        tokenData = await this.getTokenOverview(symbol);
        this.logger.info(`Got token data from BirdEye: ${!!tokenData}`);
      } catch (error: any) {
        this.logger.warn(`Error getting token data from BirdEye: ${error?.message || 'Unknown error'}`);
        tokenData = null;
      }
      
      // 2. Also get CoinGecko price data when available
      let coingeckoData = null;
      try {
        // Try to get CoinGecko data regardless of BirdEye result
        // Use lowercase and handle token symbol conversions for better match rate
        const coingeckoId = this.mapSymbolToCoingeckoId(symbol.toLowerCase());
        this.logger.info(`Attempting to get CoinGecko price data for ${coingeckoId}`);
        coingeckoData = await this.getTokenPrice(coingeckoId);
        this.logger.info(`Got CoinGecko price data: ${JSON.stringify(coingeckoData).substring(0, 100)}...`);
      } catch (error) {
        this.logger.warn(`Could not get CoinGecko price data for ${symbol}: ${error}`);
        coingeckoData = null;
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
      
      // Combine BirdEye and CoinGecko data for more comprehensive analysis
      // If we have CoinGecko data, use it to supplement BirdEye data
      const cgPrice = coingeckoData && !coingeckoData.error ? coingeckoData : null;
      
      // Get additional search context - always helpful for thorough analysis
      const searchContext = searchResults.answer ? 
        `\nSearch Context:\n${searchResults.answer.substring(0, 500)}${searchResults.answer.length > 500 ? '...' : ''}` : '';
      
      // Format market metrics with both data sources when available - more compact to reduce token usage
      let marketSummary = `
        Token: ${data.name} (${data.symbol})
        `;
        
      // If we have BirdEye data, include it first
      if (data) {
        marketSummary += `
        BirdEye Data:
        Current Price: $${data.price?.toFixed(6) || 'N/A'}
        24h Change: ${data.priceChange24h?.toFixed(2) || 'N/A'}%
        24h Volume: $${data.volume24hUSD ? (data.volume24hUSD / 1000000).toFixed(2) : 'N/A'} million
        Market Cap: $${data.marketCap ? (data.marketCap / 1000000).toFixed(2) : 'N/A'} million
        Liquidity: $${data.liquidity ? (data.liquidity / 1000000).toFixed(2) : 'N/A'} million
        Holders: ${data.holders?.toLocaleString() || 'N/A'}
        Website: ${data.links?.website || 'N/A'}
        Twitter: ${data.links?.twitter || 'N/A'}
        `;
      }
      
      // If we have CoinGecko data, include it
      if (cgPrice) {
        // Format date for readability
        const lastUpdatedDate = new Date(cgPrice.last_updated_at);
        const formattedDate = lastUpdatedDate.toLocaleString();
        
        // Format large numbers with appropriate suffixes
        const formatLargeNumber = (num: number) => {
          if (num >= 1_000_000_000) {
            return `$${(num / 1_000_000_000).toFixed(2)}B`;
          } else if (num >= 1_000_000) {
            return `$${(num / 1_000_000).toFixed(2)}M`;
          } else {
            return `$${num.toLocaleString()}`;
          }
        };
        
        marketSummary += `
        CoinGecko Data:
        Price (USD): $${cgPrice.price_usd?.toLocaleString() || 'N/A'}
        Market Cap: ${formatLargeNumber(cgPrice.market_cap_usd)}
        24h Volume: ${formatLargeNumber(cgPrice.volume_24h_usd)}
        24h Change: ${cgPrice.price_change_24h_percent >= 0 ? '▲' : '▼'} ${Math.abs(cgPrice.price_change_24h_percent).toFixed(2)}%
        Last Updated: ${formattedDate}
        `;
      }
      
      // Add project description if available
      if (data && data.description) {
        marketSummary += `
        Project Description: 
        ${data.description}
        `;
      }
      
      // Add search context
      marketSummary += searchContext;
      
      // Add sources if available
      if (sourcesList) {
        marketSummary += `
        
        Sources:
        ${sourcesList}
        `;
      }
      
      this.logger.info(`Created market summary with BirdEye data: ${!!data}, CoinGecko data: ${!!cgPrice}, Search data: ${!!searchResults.answer}`);
      
      // Get current date
      const currentDate = new Date();
      const formattedDate = currentDate.toDateString();
      
      // Generate analysis with the agent
      this.logger.info(`Sending token analysis prompt with market data to agent`);
      const analysisPrompt = `
        Current date: ${formattedDate}
        
        As a crypto analyst in 2025, analyze this token data:
        
        ${marketSummary}
        
        Provide an in-depth analysis with:
        1. Key observations about the token's use case and value proposition
        2. Current market conditions in 2025 for this token
        3. Market potential and adoption outlook as of March 2025
        4. Technical strengths and concerns based on current data
        5. Competition and market positioning in the 2025 crypto landscape
        6. Risks and opportunities relevant to the current market
        7. Short-term (Q2 2025) and medium-term (EOY 2025) outlook
        
        Focus on data-driven insights rather than speculation.
        IMPORTANT: Your analysis MUST reflect current market conditions as of ${formattedDate}, 2025.
        When referencing prices or trends, clearly state they are from current 2025 data.
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
function splitMessage(text: string, maxLength = 1900) { // Use 1900 instead of 2000 to leave room for headers
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by lines
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Calculate the length if we add this line (plus newline)
    const newLength = currentChunk.length + (currentChunk ? 1 : 0) + line.length;
    
    // If adding this line would exceed the max length
    if (newLength > maxLength) {
      // If the current chunk is not empty, push it
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // If the line itself is too long, split it
      if (line.length > maxLength) {
        let remainingLine = line;
        
        while (remainingLine.length > 0) {
          // Make sure we don't exceed max length
          const chunkSize = Math.min(remainingLine.length, maxLength);
          const chunk = remainingLine.substring(0, chunkSize);
          chunks.push(chunk);
          remainingLine = remainingLine.substring(chunkSize);
        }
      } else {
        // Start new chunk with this line
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
  
  // Verify none of the chunks exceed the limit
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length > maxLength) {
      // This shouldn't happen with the logic above, but just in case
      logger.warn(`Chunk ${i} exceeds max length: ${chunks[i].length} > ${maxLength}`);
      
      // Force split at max length
      const originalChunk: string = chunks[i];
      chunks[i] = originalChunk.substring(0, maxLength);
      chunks.splice(i + 1, 0, originalChunk.substring(maxLength));
    }
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
        - You can get precise token price data from CoinGecko via the !price command
        - You can provide technical and fundamental analysis of crypto projects
        - You store token analyses in memory for future reference

        CURRENT DATE AND TIME INFORMATION:
        Today's date: March 5, 2025
        
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
        11. CRITICAL: You MUST USE MULTIPLE TOOLS TOGETHER for crypto analysis - NEVER rely on a single source
        12. ALWAYS use the CoinGecko price tool when asked about token prices, even if not explicitly requested with !price
        13. ALWAYS use search tools to get current information before providing analysis on crypto tokens or markets
        14. When users ask for your perspective on a token, integrate both historical knowledge and current price data
        15. CRITICAL: You MUST acknowledge the current date is 2025, and explicitly state that your analysis is for 2025, not past years
        16. ALWAYS check and report the "Last Updated" timestamp when presenting price data to ensure you're using current information
        17. NEVER reference outdated news, prices, or trends without explicitly stating they are historical references
        18. When analyzing tokens, ALWAYS use MULTIPLE TOOLS together:
           - CoinGecko price tool for current price, market cap, and price change data
           - BirdEye token overview for detailed on-chain metrics
           - Web search for latest news and developments
           - Trending tools for market context
        19. ALWAYS include specific price data and metrics in your analysis, not just general statements

        DISCORD COMMANDS:
        - !ask [question] - Answer a question using your knowledge
        - !research [topic] - Conduct in-depth research on a topic and provide analysis
        - !token [symbol] - Analyze a specific crypto token with latest data
        - !price [tokenId] - Get current price data for a token via CoinGecko
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
    
    // Register CoinGecko price tool
    const coinGeckoPriceTool = new CoinGeckoPriceTool();
    try {
      registry.registerTool(coinGeckoPriceTool);
      logger.info('Registered CoinGecko price tool with registry');
    } catch (error) {
      logger.warn('Error registering CoinGecko price tool', error);
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
      
      // Startup message is disabled for now
      // Uncomment this code to enable the startup message
      /* 
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
- **!price** [tokenId] - Get current price data for a token via CoinGecko (e.g., bitcoin, ethereum)
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
      */
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
          
          // Check if the mention contains actual content beyond just a greeting
          const isJustGreeting = content.length < 10 || 
                                ['hey', 'hello', 'hi', 'sup', 'yo', 'hiya', 'hey there', 'hello there', 'hi there'].includes(content.toLowerCase());
          
          if (isJustGreeting) {
            // For simple greetings, use a special greeting command
            command = 'greeting';
            args = [content];
          } else {
            // Default to ask when mentioned with actual content
            command = 'ask';
            args = content.split(' ');
          }
        }
        
        // Send typing indicator - this shows "Wexley is typing..." in Discord
        await message.channel.sendTyping();
        
        // Handle commands
        switch (command) {
          case 'greeting':
            // Handle simple greetings with a casual response
            const greetingResponses = [
              "Hey there. What crypto or market insights do you need today?",
              "Hello. Looking for some market analysis?",
              "What's up? Need some crypto insights or market data?",
              "Hey. What token or market trend should I analyze for you?",
              "Alright, I'm here. What crypto project are you looking into?",
              "What crypto or AI trend are you interested in discussing?",
              "Hey. Point me at a token or market trend you want broken down."
            ];
            const randomGreeting = greetingResponses[Math.floor(Math.random() * greetingResponses.length)];
            await message.reply(randomGreeting);
            break;
            
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
            
          case 'price':
          case 'p':
            await handlePriceCommand(message, args.join(' '), cryptoAnalyzer);
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
!price [tokenId] - Get current price data for a token via CoinGecko (e.g., bitcoin, ethereum, solana)
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
 * Handle the ask command with smart tool selection
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
    
    // Get available tools from the registry
    const registry = ToolRegistry.getInstance();
    const availableTools = [];
    
    // Get search tool for general knowledge queries
    const searchTool = registry.getTool('web_search');
    if (searchTool) {
      availableTools.push(searchTool);
      logger.info('Added search tool to available tools for question');
    }
    
    // Check if the question might be about crypto prices or token analysis
    const lowercaseQuestion = question.toLowerCase();
    const cryptoKeywords = ['bitcoin', 'btc', 'eth', 'ethereum', 'sol', 'solana', 'price', 'token', 
                           'crypto', 'cryptocurrency', 'market cap', 'trading', 'blockchain', 
                           'coin', 'market', 'volume', 'exchange', 'bull', 'bear', 'rally', 'dump',
                           'trend', 'wallet', 'defi', 'nft', 'altcoin', 'stablecoin'];
    
    // Check if question contains crypto keywords
    const containsCryptoKeywords = cryptoKeywords.some(keyword => 
      lowercaseQuestion.includes(keyword) || 
      // Also check for token symbols with $ prefix (like $BTC)
      lowercaseQuestion.includes(`$${keyword}`)
    );
    
    // Check for price-specific queries
    const isPriceQuery = lowercaseQuestion.includes('price') || 
                         lowercaseQuestion.includes('cost') ||
                         lowercaseQuestion.includes('worth') ||
                         lowercaseQuestion.includes('value') ||
                         lowercaseQuestion.includes('trading at') ||
                         lowercaseQuestion.includes('how much is') ||
                         lowercaseQuestion.includes('market') ||
                         lowercaseQuestion.includes('trading') ||
                         lowercaseQuestion.includes('performance');
    
    // Check for token analysis or outlook queries
    const isAnalysisOrOutlookQuery = lowercaseQuestion.includes('analysis') || 
                          lowercaseQuestion.includes('analyze') ||
                          lowercaseQuestion.includes('outlook') || 
                          lowercaseQuestion.includes('sentiment') ||
                          lowercaseQuestion.includes('bullish') ||
                          lowercaseQuestion.includes('bearish') ||
                          lowercaseQuestion.includes('fundamental') ||
                          lowercaseQuestion.includes('technical') ||
                          lowercaseQuestion.includes('perspective') ||
                          lowercaseQuestion.includes('thoughts on') ||
                          lowercaseQuestion.includes('opinion') ||
                          lowercaseQuestion.includes('prediction') ||
                          lowercaseQuestion.includes('forecast') ||
                          lowercaseQuestion.includes('future') ||
                          lowercaseQuestion.includes('potential') ||
                          lowercaseQuestion.includes('opportunity') ||
                          lowercaseQuestion.includes('risk') ||
                          lowercaseQuestion.includes('assessment');
    
    // Detect specific tokens mentioned (especially in outlook questions)
    const tokenMentions = {
      'btc': lowercaseQuestion.includes('btc') || 
             lowercaseQuestion.includes('bitcoin') ||
             lowercaseQuestion.includes('$btc'),
      'eth': lowercaseQuestion.includes('eth') || 
             lowercaseQuestion.includes('ethereum') ||
             lowercaseQuestion.includes('$eth'),
      'sol': lowercaseQuestion.includes('sol') || 
             lowercaseQuestion.includes('solana') ||
             lowercaseQuestion.includes('$sol'),
    };
    
    // Count number of token mentions for logging
    const mentionedTokensCount = Object.values(tokenMentions).filter(Boolean).length;
    if (mentionedTokensCount > 0) {
      logger.info(`Detected ${mentionedTokensCount} specific token mentions in question`);
    }
    
    // Add crypto-specific tools based on the question
    if (containsCryptoKeywords) {
      logger.info('Question contains crypto keywords, adding relevant tools');
      
      // Get all available crypto tools
      const priceTool = registry.getTool('coingecko-price-tool');
      const tokenOverviewTool = registry.getTool('birdeye-token-overview');
      const trendingTool = registry.getTool('birdeye-trending');
      
      // First, double-check that we have search capability for ALL crypto questions
      if (!availableTools.some(tool => tool.name.includes('search'))) {
        logger.warn('No search tool in availableTools yet - ensuring it is added');
        const searchTool = registry.getTool('web_search');
        if (searchTool && !availableTools.includes(searchTool)) {
          availableTools.push(searchTool);
          logger.info('Added search tool for crypto analysis - essential for all crypto queries');
        }
      }
      
      // For outlook and analysis queries, OR when specific tokens are mentioned,
      // ALWAYS add ALL tools for comprehensive analysis
      if (isAnalysisOrOutlookQuery || mentionedTokensCount > 0) {
        logger.info('Question is about crypto outlook/analysis or specific tokens - using ALL relevant tools');
        
        // Always use price tool for outlook questions and token mentions
        if (priceTool) {
          availableTools.push(priceTool);
          logger.info('Added CoinGecko price tool for comprehensive analysis');
        }
        
        // Always use token overview for detailed metrics
        if (tokenOverviewTool) {
          availableTools.push(tokenOverviewTool);
          logger.info('Added BirdEye token overview tool for on-chain metrics');
        }
        
        // Add trending tool for market context
        if (trendingTool) {
          availableTools.push(trendingTool);
          logger.info('Added BirdEye trending tool for market context');
        }
        
        logger.info(`Using ${availableTools.length} tools for comprehensive crypto analysis`);
      } else {
        // For more general or price-only queries, still use multiple tools when appropriate
        
        // For price-specific queries, add CoinGecko price tool
        if (priceTool && isPriceQuery) {
          availableTools.push(priceTool);
          logger.info('Added CoinGecko price tool for price-related query');
        }
        
        // For token-analysis queries, add token overview tool
        if (tokenOverviewTool && (isAnalysisOrOutlookQuery || isPriceQuery)) {
          availableTools.push(tokenOverviewTool);
          logger.info('Added BirdEye token overview tool for analysis-related query');
        }
        
        // For trending queries, add trending tool
        if (lowercaseQuestion.includes('trending') || 
            lowercaseQuestion.includes('popular') || 
            lowercaseQuestion.includes('hot')) {
          if (trendingTool) {
            availableTools.push(trendingTool);
            logger.info('Added BirdEye trending tool for trending-related query');
          }
        }
      }
    }
    
    logger.info(`Using ${availableTools.length} tools to answer the question`);
    
    // Get current date and format it
    const currentDate = new Date();
    const formattedDate = currentDate.toDateString();
    const formattedTime = currentDate.toTimeString().split(' ')[0];
    
    // Create a more detailed prompt for crypto outlook/analysis questions
    let enhancedQuestion;
    
    if (containsCryptoKeywords && (isAnalysisOrOutlookQuery || isPriceQuery) && mentionedTokensCount > 0) {
      // Enhanced prompt for crypto analysis with specific instruction to use multiple tools
      enhancedQuestion = `
Current date: ${formattedDate}
Current time: ${formattedTime}

IMPORTANT: Your analysis must reflect current market conditions as of ${formattedDate}, 2025.

INSTRUCTIONS FOR CRYPTO ANALYSIS:
1. First, use the CoinGecko price tool to get CURRENT price data, market cap, and 24h change
2. Then, use the BirdEye token overview tool to get detailed on-chain metrics
3. IMPORTANT: ALWAYS use web search to find latest news and developments from 2025
4. Use trending data to provide market context
5. You MUST use MULTIPLE TOOLS TOGETHER for every crypto analysis
6. Integrate ALL information from different tools for a comprehensive analysis
7. Include SPECIFIC NUMBERS from the tools in your response (prices, percentages, etc.)
8. Make it clear your analysis is for 2025 market conditions
9. NEVER analyze a token without using the search tool

User question: ${question}
`;
    } else {
      // Standard enhanced question for other types of queries
      enhancedQuestion = `
Current date: ${formattedDate}
Current time: ${formattedTime}

IMPORTANT: Your analysis must reflect current market conditions as of ${formattedDate}, 2025.

User question: ${question}
`;
    }
    
    logger.info(`Enhanced question with current date context: ${formattedDate}`);
    
    // Run the agent to answer the question with the selected tools
    const result = await agent.run({
      task: enhancedQuestion,
      tools: availableTools.length > 0 ? availableTools : undefined,
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
    logger.info(`The agent made ${result.toolCalls?.length || 0} tool calls`);
    
    // Log which tools were used
    if (result.toolCalls && result.toolCalls.length > 0) {
      const toolsUsed = result.toolCalls.map(tc => tc.tool).join(', ');
      logger.info(`Tools used by agent: ${toolsUsed}`);
    }
    
    // Split long responses if needed
    const responses = splitMessage(result.response);
    
    logger.info(`Split into ${responses.length} parts`);
    
    try {
      // Edit the "thinking" message with the first part
      await thinkingMsg.edit(responses[0]);
      
      // Send additional messages for remaining parts
      for (let i = 1; i < responses.length; i++) {
        await message.channel.send(responses[i]);
      }
    } catch (editError) {
      logger.error(`Error editing ask response message: ${editError}`);
      
      // If edit fails, try sending a new message instead
      try {
        await thinkingMsg.edit(`Here's my response:`);
        
        // Send all parts as new messages
        for (const response of responses) {
          await message.channel.send(response);
        }
      } catch (sendError) {
        logger.error(`Error sending ask response messages: ${sendError}`);
        throw sendError;
      }
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
      
      try {
        // Edit the "thinking" message with the first part
        // Add header only if there's enough space
        const header = `**Research on "${topic}"** (from memory):\n\n`;
        
        if (responses[0].length + header.length <= 1950) {  // Very conservative limit
          await thinkingMsg.edit(header + responses[0]);
        } else {
          // If header + first part is too long, just use the first part
          await thinkingMsg.edit(responses[0]);
        }
        
        // Send additional messages for remaining parts
        for (let i = 1; i < responses.length; i++) {
          await message.channel.send(responses[i]);
        }
      } catch (editError) {
        logger.error(`Error editing cached research message: ${editError}`);
        
        // If edit fails, try sending a new message instead
        try {
          await thinkingMsg.edit(`I've found previous research on "${topic}". Here are my findings:`);
          
          // Send all parts as new messages
          for (const response of responses) {
            await message.channel.send(response);
          }
        } catch (sendError) {
          logger.error(`Error sending cached research messages: ${sendError}`);
          throw sendError;
        }
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
    
    // Get current date
    const currentDate = new Date();
    const formattedDate = currentDate.toDateString();
    
    // Generate detailed analysis using the agent with a more compact prompt
    const researchPrompt = `
      Current date: ${formattedDate}
      
      Create a comprehensive analysis about: "${topic}"
      
      Search summary: ${searchResults.answer || 'No summary available'}
      
      Sources:
      ${sourcesList}
      
      Analysis should include:
      1. Topic overview
      2. Current status as of ${formattedDate}, 2025
      3. Key trends and insights based on CURRENT data
      4. Your expert perspective for 2025 and beyond
      5. Data points and examples from recent timeframes
      6. Challenges or controversies in the current market
      7. Implications and assessment
      
      IMPORTANT: Your analysis must reflect current conditions as of ${formattedDate}, 2025.
      
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
    
    try {
      // Edit the "thinking" message with the first part
      // Add header only if there's enough space
      const header = `**Research on "${topic}"**:\n\n`;
      
      if (responses[0].length + header.length <= 1950) {  // Even more conservative limit
        await thinkingMsg.edit(header + responses[0]);
      } else {
        // If header + first part is too long, just use the first part
        await thinkingMsg.edit(responses[0]);
      }
      
      // Send additional messages for remaining parts
      for (let i = 1; i < responses.length; i++) {
        await message.channel.send(responses[i]);
      }
    } catch (editError) {
      logger.error(`Error editing message: ${editError}`);
      
      // If edit fails, try sending a new message instead
      try {
        await thinkingMsg.edit(`I've completed research on "${topic}". Here are my findings:`);
        
        // Send all parts as new messages
        for (const response of responses) {
          await message.channel.send(response);
        }
      } catch (sendError) {
        logger.error(`Error sending messages: ${sendError}`);
        throw sendError;
      }
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
    
    try {
      // Edit the "thinking" message with the first part
      // Add header only if there's enough space
      const header = `**Analysis of $${tokenSymbol}**:\n\n`;
      
      if (responses[0].length + header.length <= 1950) {  // Very conservative limit
        await thinkingMsg.edit(header + responses[0]);
      } else {
        // If header + first part is too long, just use the first part
        await thinkingMsg.edit(responses[0]);
      }
      
      // Send additional messages for remaining parts
      for (let i = 1; i < responses.length; i++) {
        await message.channel.send(responses[i]);
      }
    } catch (editError) {
      logger.error(`Error editing token analysis message: ${editError}`);
      
      // If edit fails, try sending a new message instead
      try {
        await thinkingMsg.edit(`I've completed analysis of $${tokenSymbol}. Here are my findings:`);
        
        // Send all parts as new messages
        for (const response of responses) {
          await message.channel.send(response);
        }
      } catch (sendError) {
        logger.error(`Error sending token analysis messages: ${sendError}`);
        throw sendError;
      }
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

/**
 * Handle the price command using CoinGecko
 */
async function handlePriceCommand(
  message: any,
  tokenId: string,
  cryptoAnalyzer: CryptoAnalyzer
): Promise<void> {
  if (!tokenId) {
    await message.reply("Please provide a token ID to check (e.g., bitcoin, ethereum, solana)");
    return;
  }
  
  // Clean up the token ID (remove $ prefix if present, convert to lowercase)
  let cleanTokenId = tokenId.toLowerCase().trim();
  if (cleanTokenId.startsWith('$')) {
    cleanTokenId = cleanTokenId.substring(1);
  }
  
  // Remove any non-alphanumeric characters except for hyphens
  cleanTokenId = cleanTokenId.replace(/[^a-z0-9-]/g, '');
  
  // Send thinking message
  const thinkingMsg = await message.reply(`Fetching price data for ${cleanTokenId}...`);
  
  try {
    // Get price data from CoinGecko
    const priceData = await cryptoAnalyzer.getTokenPrice(cleanTokenId);
    
    // Check if we got an error response
    if (priceData.error) {
      await thinkingMsg.edit(`Error: ${priceData.error}`);
      return;
    }
    
    // Format the price data in a more readable way
    const formatNumber = (num: number) => {
      if (num >= 1_000_000_000) {
        return `$${(num / 1_000_000_000).toFixed(2)}B`;
      } else if (num >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(2)}M`;
      } else if (num >= 1_000) {
        return `$${(num / 1_000).toFixed(2)}K`;
      } else {
        return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
      }
    };
    
    // Format the date from ISO string to readable format
    const formatDate = (isoString: string) => {
      const date = new Date(isoString);
      return date.toLocaleString();
    };
    
    // Create an embed-like message with the price data
    const formattedMessage = `
**${priceData.token.toUpperCase()} Price Information** ${priceData.price_change_24h_percent >= 0 ? '📈' : '📉'}

**Price:** $${priceData.price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
**24h Change:** ${priceData.price_change_24h_percent >= 0 ? '▲' : '▼'} ${Math.abs(priceData.price_change_24h_percent).toFixed(2)}%
**Market Cap:** ${formatNumber(priceData.market_cap_usd)}
**24h Volume:** ${formatNumber(priceData.volume_24h_usd)}
**Last Updated:** ${formatDate(priceData.last_updated_at)}

For a detailed analysis, use \`!token ${priceData.token}\`
`;
    
    // Edit the thinking message with the formatted price data
    await thinkingMsg.edit(formattedMessage);
    
  } catch (error) {
    logger.error(`Error fetching price data for ${cleanTokenId}:`, error);
    await thinkingMsg.edit(`I encountered an error while fetching price data for ${cleanTokenId}. Please check the token ID and try again.`);
  }
}

// Start the Discord bot
startDiscordBot();