import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../src/core/agent';
import { AgentSwarm } from '../src/core/agent-swarm';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { ProviderFactory } from '../src/core/provider-factory';
import { ProviderType } from '../src/core/provider-interface';
import { OpenAIProvider } from '../src/core/openai-provider';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { Tool, RunResult } from '../src/core/types';
import { Logger } from '../src/utils/logger';
import { TwitterDirectConnector } from '../src/platform-connectors/twitter-direct-connector';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';

// Set up logger
const logger = new Logger('EnhancedCryptoSwarm');

// Check for required environment variables
if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
  logger.error('Either ANTHROPIC_API_KEY or OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

// Define target cryptocurrencies
const TARGET_CRYPTOS = ['bitcoin', 'ethereum', 'ripple', 'solana', 'cardano', 'dogecoin'];

async function main() {
  try {
    logger.info('Creating Enhanced Crypto Research Swarm...');

    // Create LLM providers - mix of Anthropic and OpenAI for diversity and resilience
    const anthropicProvider = process.env.ANTHROPIC_API_KEY ? 
      ProviderFactory.createProvider({
        type: ProviderType.ANTHROPIC,
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
        apiKey: process.env.ANTHROPIC_API_KEY!,
      }) : null;
    
    const openaiProvider = process.env.OPENAI_API_KEY ? 
      new OpenAIProvider({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY!,
      }) : null;
    
    if (!anthropicProvider && !openaiProvider) {
      throw new Error('At least one LLM provider must be available');
    }

    // Create tools
    let searchTool: Tool;
    if (process.env.TAVILY_API_KEY) {
      logger.info('Using Tavily search tool');
      searchTool = new TavilySearchTool(process.env.TAVILY_API_KEY);
    } else {
      logger.warn('TAVILY_API_KEY not found, using mock web search tool');
      searchTool = new WebSearchTool();
    }
    
    const priceTool = new CoinGeckoPriceTool();
    const tools = [searchTool, priceTool];

    // Extract Wexley persona elements
    const personality = wexleyPersona.persona.personality;
    const traits = personality.traits.join(', ');
    const background = wexleyPersona.persona.background.backstory;
    const communication = personality.communication;

    // Set up Pinecone memory storage if available
    let sharedMemory: EnhancedMemory | null = null;
    let embedder: EmbeddingService | null = null;
    
    if (process.env.PINECONE_API_KEY && 
        process.env.PINECONE_INDEX && 
        process.env.OPENAI_API_KEY) {
      logger.info('Setting up Pinecone for persistent memory');
      
      // Create embedding service
      embedder = new EmbeddingService({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'text-embedding-3-large',
        dimensions: 1536,
        enableCache: true
      });
      
      // Set up Pinecone vector store
      const pineconeVectorStore = new PineconeStore({
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT || 'gcp-starter',
        index: process.env.PINECONE_INDEX,
        namespace: 'crypto-swarm',
        dimension: 1536,
        embeddingService: embedder,
        // Enhanced options
        maxBatchSize: 50,
        cacheSize: 200,
        maxRetries: 3,
        retryDelayMs: 1000,
        enableCompression: true
      });
      
      // Create enhanced memory system
      sharedMemory = new EnhancedMemory(pineconeVectorStore, {
        userId: 'crypto-swarm',
        namespace: 'shared',
        shortTermCapacity: 200,
        shortTermTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
        notesCapacity: 500
      });
      
      // Initialize memory system
      await sharedMemory.initialize();
      logger.info('Pinecone memory system initialized');
    } else {
      logger.warn('Pinecone or OpenAI API keys missing - persistent memory not available');
    }

    // Create Agents for the swarm - mix of Anthropic and OpenAI agents
    
    // 1. Technical Analysis Agent - Using GPT-4o for charting precision
    const technicalAnalysisAgent = new Agent({
      name: 'TechnicalAnalyst',
      role: 'Technical Analyst',
      personality: {
        traits: ['analytical', 'precise', 'data-driven', 'methodical'],
        background: 'Expert in cryptocurrency chart patterns, technical indicators, and market structure analysis',
        voice: 'Technical, precise, focused on data patterns and indicators'
      },
      goals: [
        "Analyze price action using technical indicators",
        "Identify key support and resistance levels",
        "Evaluate chart patterns and market structure",
        "Provide short-term price movement projections"
      ],
      systemPrompt: `
        You are a cryptocurrency Technical Analyst specializing in chart patterns, indicators, and price action.

        RESPONSIBILITIES:
        - Analyze cryptocurrency price charts and technical indicators
        - Identify key support/resistance levels and market structures
        - Evaluate trading volume, volatility metrics, and momentum indicators
        - Recognize chart patterns (head and shoulders, double tops, etc.)
        - Calculate and interpret technical indicators (RSI, MACD, Bollinger Bands, etc.)
        - Provide technical-based short-term price projections

        APPROACH:
        - Be systematic and precise in your analysis
        - Focus on data patterns rather than fundamental catalysts
        - Avoid emotional language and speculation without technical backing
        - Include specific price levels in your analysis
        - Always look at multiple timeframes (1D, 4H, 1H)
        - Mention which indicators you're basing your conclusions on

        OUTPUT FORMAT:
        For each cryptocurrency you analyze, provide:
        1. Current market structure analysis
        2. Key support/resistance levels
        3. Notable technical indicators and their readings
        4. Chart patterns in formation or recently completed
        5. Short-term price projection based on technical factors
        
        Note: You have access to up-to-date price data through the CoinGecko tool and can research recent market movements using the search tool. Use these actively to inform your analysis.
      `
    }, openaiProvider || anthropicProvider!); // Prefer OpenAI for this agent

    // 2. Fundamental Analysis Agent - Using Claude for deep context analysis
    const fundamentalAnalysisAgent = new Agent({
      name: 'FundamentalAnalyst',
      role: 'Fundamental Analyst',
      personality: {
        traits: ['research-oriented', 'thorough', 'contextual', 'investigative'],
        background: 'Specialist in cryptocurrency fundamentals, on-chain metrics, and ecosystem developments',
        voice: 'Informative, evidence-based, focused on fundamentals and development activity'
      },
      goals: [
        "Research project fundamentals and ecosystem developments",
        "Analyze on-chain metrics and network activity",
        "Evaluate developer activity and protocol updates",
        "Assess macroeconomic factors affecting crypto markets"
      ],
      systemPrompt: `
        You are a cryptocurrency Fundamental Analyst specializing in on-chain metrics, ecosystem developments, and macro factors.

        RESPONSIBILITIES:
        - Research recent news, developments, and announcements for cryptocurrencies
        - Analyze on-chain metrics (active addresses, transaction volume, etc.)
        - Track developer activity and upcoming protocol updates
        - Evaluate institutional/whale movements and accumulation patterns
        - Assess regulatory developments affecting specific cryptos
        - Consider macroeconomic factors impacting the broader crypto market

        APPROACH:
        - Focus on verifiable facts and concrete developments
        - Analyze how fundamental factors might impact future price
        - Consider supply/demand dynamics specific to each crypto
        - Look for narrative shifts that could affect market sentiment
        - Evaluate real-world adoption metrics and partnership developments
        - Track funding, venture capital activity, and institutional interest

        OUTPUT FORMAT:
        For each cryptocurrency you analyze, provide:
        1. Recent significant news and developments
        2. On-chain metrics and network health assessment
        3. Developer activity and upcoming protocol changes
        4. Institutional/whale activity assessment
        5. Fundamental-based medium-term outlook
        
        Note: You have access to up-to-date information through the search tool and price data via CoinGecko. Use these actively to inform your analysis.
      `
    }, anthropicProvider || openaiProvider!); // Prefer Claude for this agent

    // 3. On-Chain Metrics Specialist - Using GPT-4o for data analysis
    const onChainAnalysisAgent = new Agent({
      name: 'OnChainAnalyst',
      role: 'On-Chain Data Specialist',
      personality: {
        traits: ['data-focused', 'detail-oriented', 'analytical', 'objective'],
        background: 'Expert in blockchain data analysis, transaction patterns, and on-chain metrics',
        voice: 'Data-driven, precise, focused on blockchain metrics and network health'
      },
      goals: [
        "Analyze on-chain transaction volumes and patterns",
        "Track network growth and blockchain activity metrics",
        "Monitor whale addresses and exchange flows",
        "Assess network health and decentralization metrics"
      ],
      systemPrompt: `
        You are an On-Chain Data Specialist focusing on blockchain metrics and network activity.

        RESPONSIBILITIES:
        - Analyze blockchain transaction data and patterns
        - Monitor active addresses, new addresses, and network growth metrics
        - Track exchange inflows/outflows and whale address movements
        - Evaluate mining/staking activity and network security metrics
        - Assess network utilization, gas fees, and congestion patterns
        - Identify unusual on-chain activity that might signal market movements

        APPROACH:
        - Focus exclusively on verifiable on-chain data
        - Use specific metrics and numbers in your analysis
        - Compare current metrics to historical patterns for context
        - Look for divergences between on-chain activity and price action
        - Consider network-specific metrics relevant to each blockchain
        - Present data in a factual, unbiased manner

        OUTPUT FORMAT:
        For each cryptocurrency you analyze, provide:
        1. Transaction volume trends and patterns
        2. Active address data and network participation metrics
        3. Exchange flow analysis (inflows/outflows)
        4. Large holder (whale) activity assessment
        5. Network health metrics (hashrate, stake distribution, etc.)
        6. On-chain data-based outlook
        
        Note: You have access to up-to-date information through the search tool to find the latest on-chain data. Use it extensively to inform your analysis.
      `
    }, openaiProvider || anthropicProvider!); // Prefer OpenAI for data analysis

    // 4. Sentiment Analysis Agent - Using GPT-4o for social pattern recognition
    const sentimentAnalysisAgent = new Agent({
      name: 'SentimentAnalyst',
      role: 'Sentiment Analyst',
      personality: {
        traits: ['observant', 'intuitive', 'trend-aware', 'socially perceptive'],
        background: 'Expert in market sentiment, social media analysis, and trend identification for cryptocurrencies',
        voice: 'Perceptive, trend-focused, attentive to social signals and market psychology'
      },
      goals: [
        "Monitor social media sentiment toward cryptocurrencies",
        "Track sentiment indicators like Fear & Greed Index",
        "Identify trending narratives in the crypto space",
        "Assess overall market psychology and crowd behavior"
      ],
      systemPrompt: `
        You are a cryptocurrency Sentiment Analyst specializing in market psychology, social signals, and narrative trends.

        RESPONSIBILITIES:
        - Analyze social media sentiment around specific cryptocurrencies
        - Track sentiment indicators (Fear & Greed Index, etc.)
        - Identify emerging narratives and trends in crypto discussions
        - Assess retail investor sentiment vs. institutional positioning
        - Evaluate market psychology factors affecting price action
        - Monitor influencer opinions and their impact on sentiment

        APPROACH:
        - Look for signs of extreme sentiment (euphoria or fear)
        - Identify disconnects between sentiment and price action
        - Track changes in narrative focus around specific cryptos
        - Consider contrarian indicators when sentiment reaches extremes
        - Evaluate search trends and social engagement metrics
        - Assess how current sentiment might influence short-term price movements

        OUTPUT FORMAT:
        For each cryptocurrency you analyze, provide:
        1. Current social media sentiment assessment
        2. Relevant sentiment indicators and their readings
        3. Dominant narratives circulating about the cryptocurrency
        4. Influencer positioning and notable opinions
        5. Sentiment-based market psychology assessment
        
        Note: You have access to recent information through the search tool. Use it actively to gather sentiment data from sources like Twitter, Reddit, and crypto news sites.
      `
    }, openaiProvider || anthropicProvider!); // Prefer OpenAI for social analysis

    // 5. Coordinator/Twitter Agent (using Wexley's persona and Claude for consistency)
    const coordinatorAgent = new Agent({
      name: 'Wexley',
      role: 'Market Analyst',
      personality: {
        traits: personality.traits,
        background: background,
        voice: `Direct, authoritative tone. ${communication.vocabulary}. Uses data points and specific examples.`
      },
      goals: [
        "Synthesize analysis from specialist agents",
        "Formulate actionable market insights",
        "Deliver concise, high-impact market predictions",
        "Communicate in Wexley's distinctive voice"
      ],
      systemPrompt: `
        You are Wexley, a 42-year-old crypto/AI market researcher, serial entrepreneur, and angel investor.
        You're known for your direct, authoritative communication style and contrarian market insights.

        PERSONALITY:
        - Traits: ${traits}
        - Communication: Direct, authoritative, occasionally abrasive, and passionate
        - Style: Concise, jargon-heavy, prediction-oriented, with bold claims
        - Quirks: Start directly with key insights, casually drop large financial figures, reference past successful predictions, use market/trading metaphors

        RESPONSIBILITIES:
        - Synthesize technical, fundamental, on-chain, and sentiment analysis from specialist agents
        - Formulate a cohesive price prediction and market outlook
        - Craft concise, impactful tweets reflecting your analysis
        - Maintain your distinctive voice and analytical style
        - Ensure predictions are specific and actionable
        - Format crypto symbols with $ prefix ($BTC, $ETH, etc.)

        TWITTER STYLE RULES:
        - Start tweets directly with the analysis - avoid phrases like 'Look,' or 'I think'
        - Use a confident, direct tone that establishes authority
        - Include specific data points and insights rather than generalities
        - For token mentions, always use the $ prefix format ($BTC, $ETH, etc.)
        - Present predictions with clear, substantiated reasoning
        - Be precise and technical without sacrificing clarity
        - Don't hedge unnecessarily - be definitive in assessments
        - Avoid hashtags except for specific, strategic purposes
        - Keep tweets focused on a single key insight rather than covering multiple topics

        OUTPUT FORMAT:
        1. Synthesized analysis (for internal use)
        2. Final tweet to be posted (140-280 characters, in your distinctive style)
        
        You have access to enhanced memory capabilities that allow you to recall previous analyses.
        Use this to maintain consistency in your market views while still adapting to new information.
        
        Note: You are the final agent who will post to Twitter. Your tweet should capture the essence of all analyses while being concise and impactful.
      `
    }, anthropicProvider || openaiProvider!); // Prefer Claude for persona consistency

    // Set memory for all agents
    if (sharedMemory) {
      logger.info('Setting up persistent memory for all agents');
      technicalAnalysisAgent.setMemory(sharedMemory);
      fundamentalAnalysisAgent.setMemory(sharedMemory);
      onChainAnalysisAgent.setMemory(sharedMemory);
      sentimentAnalysisAgent.setMemory(sharedMemory);
      coordinatorAgent.setMemory(sharedMemory);
    }

    // Create agent swarm with all agents
    const swarm = new AgentSwarm({
      agents: [
        technicalAnalysisAgent, 
        fundamentalAnalysisAgent, 
        onChainAnalysisAgent,
        sentimentAnalysisAgent
      ],
      coordinator: coordinatorAgent,
      planningStrategy: 'parallel',
      maxConcurrentAgents: 4,
      enableFeedback: true
    });

    // Create autonomous wrapper for the swarm
    const autonomousSwarm = new AutonomousAgent({
      baseAgent: swarm as any, // Type casting as the swarm implements similar interface
      healthCheckIntervalMinutes: 60,
      maxConsecutiveErrors: 3,
      enableAutoRecovery: true,
      enableContinuousMode: true,
      stateStoragePath: path.join(process.cwd(), 'data', 'swarm-state')
    });

    // Set up Twitter connector if credentials are available
    let twitterConnector: TwitterDirectConnector | null = null;
    
    if (process.env.TWITTER_API_KEY && 
        process.env.TWITTER_API_SECRET && 
        process.env.TWITTER_ACCESS_TOKEN && 
        process.env.TWITTER_ACCESS_SECRET) {
      logger.info('Setting up Twitter connector');
      
      twitterConnector = new TwitterDirectConnector({
        apiKey: process.env.TWITTER_API_KEY,
        apiSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
        persistCookies: true,
        cookiesPath: path.join(process.cwd(), 'data', 'twitter-cookies.json'),
        maxRetries: 3
      });
    } else {
      logger.warn('Twitter credentials not found - will output tweets to console only');
    }

    // Start the autonomous swarm
    autonomousSwarm.start();
    logger.info('Enhanced Crypto Research Swarm started successfully');

    // Function to conduct research on a specific cryptocurrency
    async function researchCrypto(cryptoId: string) {
      logger.info(`Initiating research on ${cryptoId}...`);
      
      try {
        // Create the research task with emphasis on all four specialist areas
        const task = `
          Conduct a comprehensive analysis of ${cryptoId} cryptocurrency. 
          
          Each specialist agent should analyze different aspects:
          - Technical Analyst: Focus on price charts, patterns, indicators, and support/resistance levels
          - Fundamental Analyst: Examine ecosystem developments, adoption, news, and macro factors
          - On-Chain Analyst: Analyze blockchain metrics, transaction patterns, and network activity
          - Sentiment Analyst: Evaluate social media sentiment, narrative trends, and market psychology
          
          Coordinator will synthesize these analyses into a final prediction and tweet.
        `;
        
        // Run the swarm with tools
        const result = await autonomousSwarm.runOperation<RunResult>({
          task,
          tools
        });
        
        // Extract the tweet from the response
        const tweetMatch = result.response.match(/(?:Final Tweet:|Tweet:)\s*(.*?)(?:\n\n|$)/s);
        const tweet = tweetMatch ? tweetMatch[1].trim() : result.response;
        
        // Post to Twitter or output to console
        if (twitterConnector) {
          logger.info(`Posting ${cryptoId} analysis to Twitter`);
          await twitterConnector.tweet(tweet);
          logger.info('Tweet posted successfully');
        } else {
          console.log('\n------------------------');
          console.log('TWITTER POST (SIMULATION):');
          console.log(tweet);
          console.log('------------------------\n');
        }
        
        // Store analysis summary in memory if available
        if (sharedMemory && embedder) {
          await sharedMemory.saveNote({
            title: `${cryptoId} Analysis - ${new Date().toISOString().split('T')[0]}`,
            content: result.response,
            tags: [cryptoId, 'analysis', 'crypto'],
            importance: 0.8
          });
          logger.info(`Stored ${cryptoId} analysis in persistent memory`);
        }
        
        return result;
      } catch (error) {
        logger.error(`Error researching ${cryptoId}:`, error);
        throw error;
      }
    }

    // Function to run periodic analysis with staggered timing
    async function runPeriodicAnalysis() {
      logger.info('Starting periodic crypto analysis...');
      
      // Select the next 2 cryptocurrencies to analyze
      // Use a combination of random selection and time-since-last-analysis
      const cryptosToAnalyze = selectCryptosForAnalysis(2);
      
      logger.info(`Selected ${cryptosToAnalyze.join(', ')} for analysis`);
      
      // Run the research for each selected crypto
      for (const crypto of cryptosToAnalyze) {
        try {
          await researchCrypto(crypto);
          
          // Store last analysis time
          updateLastAnalysisTime(crypto);
          
          // Add a delay between analyses to avoid rate limits
          if (cryptosToAnalyze.indexOf(crypto) < cryptosToAnalyze.length - 1) {
            const delayMinutes = 2 + Math.floor(Math.random() * 3); // 2-5 minutes delay
            logger.info(`Waiting ${delayMinutes} minutes before next analysis`);
            await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));
          }
        } catch (error) {
          logger.error(`Error analyzing ${crypto}:`, error);
          // Continue to next crypto despite error
        }
      }
      
      // Schedule the next analysis - dynamic timing based on market activity
      // More frequent during market hours, less frequent during off-hours
      const nextRunHours = getNextRunTimeHours();
      logger.info(`Next analysis scheduled in ${nextRunHours.toFixed(1)} hours`);
      
      setTimeout(runPeriodicAnalysis, nextRunHours * 60 * 60 * 1000);
    }
    
    // Helper function to select which cryptos to analyze
    // Based on time since last analysis and random selection
    const lastAnalyzed: Record<string, number> = {};
    
    function selectCryptosForAnalysis(count: number): string[] {
      const now = Date.now();
      
      // Calculate a priority score for each crypto
      // Higher score = higher priority for analysis
      const prioritizedCryptos = TARGET_CRYPTOS.map(crypto => {
        const lastTime = lastAnalyzed[crypto] || 0;
        const hoursSinceLastAnalysis = (now - lastTime) / (1000 * 60 * 60);
        
        // Priority score: hours since last analysis + random factor
        const priorityScore = hoursSinceLastAnalysis + (Math.random() * 2);
        
        return { crypto, priorityScore };
      });
      
      // Sort by priority score (descending)
      prioritizedCryptos.sort((a, b) => b.priorityScore - a.priorityScore);
      
      // Return the top N cryptos
      return prioritizedCryptos.slice(0, count).map(item => item.crypto);
    }
    
    // Helper function to update the last analysis time
    function updateLastAnalysisTime(crypto: string): void {
      lastAnalyzed[crypto] = Date.now();
    }
    
    // Helper function to determine next run time based on market activity
    function getNextRunTimeHours(): number {
      const now = new Date();
      const hour = now.getUTCHours();
      const day = now.getUTCDay();
      
      // Weekend
      if (day === 0 || day === 6) {
        return 6 + Math.random() * 2; // 6-8 hours
      }
      
      // During active market hours (8 AM - 8 PM UTC)
      if (hour >= 8 && hour < 20) {
        return 2 + Math.random() * 2; // 2-4 hours
      }
      
      // During less active hours
      return 4 + Math.random() * 2; // 4-6 hours
    }

    // Start the first analysis after a short delay
    setTimeout(() => {
      runPeriodicAnalysis().catch(error => {
        logger.error('Error in periodic analysis:', error);
      });
    }, 5000);

    // For demonstration purposes, also run an immediate analysis on Bitcoin
    await researchCrypto('bitcoin');

    // Keep the process running
    console.log('\nEnhanced Crypto Research Swarm is running in periodic mode...');
    console.log('Press Ctrl+C to stop the swarm...');
    
    // Set up graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Stopping Enhanced Crypto Research Swarm...');
      autonomousSwarm.stop();
      
      // Properly close Pinecone connection if active
      if (embedder) {
        logger.info('Closing persistent memory connections...');
        // No explicit close method for embedder, but we could add cleanup logic here
      }
      
      logger.info('Swarm stopped successfully');
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