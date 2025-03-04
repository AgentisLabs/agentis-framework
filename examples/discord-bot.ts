import dotenv from 'dotenv';
import { DiscordConnector } from '../src/platform-connectors/discord-connector';
import { Agent } from '../src/core/agent';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { ProviderFactory } from '../src/core/provider-factory';
import { Logger } from '../src/utils/logger';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { OpenAIProvider } from '../src/core/openai-provider';
import { InMemoryMemory } from '../src/memory/in-memory';
import { MemoryInterface, MemoryEntry } from '../src/memory/memory-interface';
import { Pinecone } from '@pinecone-database/pinecone';
import { Tool } from '../src/core/types';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Set up logger
const logger = new Logger('DiscordBot');

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

if (!process.env.BOT_TOKEN) {
  logger.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

// Set up Pinecone constants
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'wexley-discord';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'discord-memory';

// Create necessary directories
const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

async function startDiscordBot() {
  try {
    logger.info('Starting Discord bot with Wexley persona...');

    // Create OpenAI provider for GPT-4o
    const openaiProvider = new OpenAIProvider({
      model: 'gpt-4o', // Use GPT-4o model
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // Create embedding service for memory
    const embeddingService = new EmbeddingService({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'text-embedding-3-large',
      dimensions: 1536,
    });

    // Set up memory system (Vector-based or In-memory)
    let memory;
    
    if (process.env.PINECONE_API_KEY) {
      logger.info('Setting up Pinecone for memory');
      
      // Simple direct memory implementation with Pinecone
      // This approach bypasses the EnhancedMemory class but still provides vector storage
      
      const store = {
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT || 'gcp-starter',
        index: PINECONE_INDEX,
        namespace: PINECONE_NAMESPACE,
      };
      
      // Create a custom memory implementation that works with our Pinecone store directly
      const pineconeMemory: MemoryInterface = {
        // Basic implementation of MemoryInterface methods
        async store(entry: MemoryEntry): Promise<void> {
          try {
            // Generate ID if not provided
            const memoryId = entry.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            
            // Generate embedding for the memory
            const content = `${entry.input}\n${entry.output}`;
            const embedding = await embeddingService.embedText(content);
            
            // Store in Pinecone
            const pineconeClient = new Pinecone({
              apiKey: store.apiKey,
            });
            
            const index = pineconeClient.Index(store.index);
            
            // Upsert the vector
            await index.upsert([{
              id: memoryId,
              values: embedding,
              metadata: {
                input: entry.input,
                output: entry.output,
                timestamp: entry.timestamp || Date.now(),
                importance: entry.importance || 1.0,
                category: 'memory'
              }
            }]);
            
            logger.debug(`Stored memory in Pinecone: ${memoryId}`);
          } catch (error) {
            logger.error('Error storing memory in Pinecone', error);
          }
        },
        
        async retrieve(query: string, limit: number = 5): Promise<string[]> {
          try {
            // Generate embedding for the query
            const embedding = await embeddingService.embedText(query);
            
            // Query Pinecone
            const pineconeClient = new Pinecone({
              apiKey: store.apiKey,
            });
            
            const index = pineconeClient.Index(store.index);
            
            // Query for similar vectors
            const results = await index.query({
              vector: embedding,
              topK: limit,
              includeMetadata: true,
              filter: { category: { $eq: 'memory' } }
            });
            
            // Format results
            return results.matches.map(match => {
              const metadata = match.metadata as any;
              return `${metadata.input}\n${metadata.output}`;
            });
          } catch (error) {
            logger.error('Error retrieving memories from Pinecone', error);
            return [];
          }
        },
        
        async getAll(): Promise<MemoryEntry[]> {
          return []; // This is a simplified implementation
        },
        
        async delete(id: string): Promise<boolean> {
          return true; // Simplified implementation
        },
        
        async clear(): Promise<void> {
          // No implementation needed for this example
        }
      };
      
      memory = pineconeMemory;
      
      logger.info('Using Pinecone for vector memory storage');
    } else {
      // Fall back to in-memory
      logger.warn('PINECONE_API_KEY not found, using in-memory storage instead');
      memory = new InMemoryMemory();
    }

    // Create search tool
    let searchTool;
    if (process.env.TAVILY_API_KEY) {
      logger.info('Using Tavily search tool');
      searchTool = new TavilySearchTool(process.env.TAVILY_API_KEY);
    } else {
      logger.warn('TAVILY_API_KEY not found, using mock web search tool');
      searchTool = new WebSearchTool();
    }

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
      role: 'Market Analyst',
      personality: {
        traits: personality.traits,
        background: wexleyPersona.persona.background.backstory,
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

        IMPORTANT GUIDELINES:
        1. Stay in character as Wexley at all times
        2. Be direct, confident, and occasionally abrasive in your communication
        3. Speak authoritatively about markets, technology, and investing
        4. Use data points and specific examples to back up your claims
        5. Don't hedge unnecessarily - be definitive in your assessments
        6. Use technical terminology appropriate for the audience
        7. Express contrarian views that challenge conventional wisdom
        8. For crypto mentions, use the $ prefix format ($BTC, $ETH, etc.)
        9. You have access to real-time information via web search - use it to provide accurate market data
        10. When discussing market trends or technology developments, use your search tool to get current information

        You have memory capabilities that allow you to recall previous conversations. Use them to maintain context and
        provide more personalized responses when appropriate.

        When users ask about topics outside your expertise, still respond in character but acknowledge when something is outside your primary focus areas.
        If users ask for harmful content, refuse while staying in character as Wexley who values rationality.
      `
    }, openaiProvider);

    // Create Discord connector
    const discord = new DiscordConnector({
      token: process.env.BOT_TOKEN!,
      prefix: '!',
      autoReply: true,
      monitorKeywords: [
        'crypto', 'bitcoin', 'ethereum', 'AI', 'market', 'blockchain', 
        'investment', 'token', 'NFT', 'DeFi', 'Web3', 'analysis'
      ],
      pollInterval: 30000, // Check every 30 seconds
    });

    // Add search tool to the agent
    const tools: Tool[] = [searchTool];
    
    // Using type assertion to add tools
    (agent as any).tools = tools;
    
    // Set memory for the agent
    agent.memory = memory;

    // Connect the agent to Discord
    await discord.connect(agent);

    // Set bot status to reflect Wexley's persona
    await discord.setStatus('online', 'WATCHING', 'market opportunities');

    logger.info('Wexley Discord bot is now online and ready to respond to messages');

    // Set up event listeners
    discord.on('keyword_match', async (message) => {
      logger.info(`Keyword match detected in message from ${message.author.username}: "${message.content.substring(0, 50)}..."`);
    });

    discord.on('mention', async (message) => {
      logger.info(`Wexley was mentioned by ${message.author.username}: "${message.content.substring(0, 50)}..."`);
    });

    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down Wexley Discord bot...');
      await discord.disconnect();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error starting Wexley Discord bot:', error);
    process.exit(1);
  }
}

// Start the Discord bot
startDiscordBot();