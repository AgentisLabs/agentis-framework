import dotenv from 'dotenv';
dotenv.config();

import { Agent } from '../src/core/agent';
import { AgentSwarm } from '../src/core/agent-swarm';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { ProviderFactory } from '../src/core/provider-factory';
import { ProviderType } from '../src/core/provider-interface';
import { InMemoryMemory } from '../src/memory/in-memory';
import { VectorMemory } from '../src/memory/vector-memory';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { Tool, RunResult } from '../src/core/types';
import { Logger } from '../src/utils/logger';
import { TwitterDirectConnector } from '../src/platform-connectors/twitter-direct-connector';
import fs from 'fs';
import path from 'path';

// Set up logger
const logger = new Logger('CryptoResearchSwarm');

// Check for required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY is required in .env file');
  process.exit(1);
}

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

// Define target cryptocurrencies
const TARGET_CRYPTOS = ['bitcoin', 'ethereum', 'ripple', 'solana'];

async function main() {
  try {
    logger.info('Creating Crypto Research Swarm...');

    // Create LLM provider from provider factory
    const mainProvider = ProviderFactory.createProvider({
      type: ProviderType.ANTHROPIC,
      model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620',
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

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

    // Create Agents for the swarm
    
    // 1. Technical Analysis Agent
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
    }, mainProvider);

    // 2. Fundamental Analysis Agent
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
    }, mainProvider);

    // 3. Sentiment Analysis Agent
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
    }, mainProvider);

    // 4. Coordinator/Twitter Agent (using Wexley's persona)
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
        - Synthesize technical, fundamental, and sentiment analysis from specialist agents
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
        
        Note: You are the final agent who will post to Twitter. Your tweet should capture the essence of all three analyses while being concise and impactful.
      `
    }, mainProvider);

    // Create advanced vector memory storage for agents
    // Using VectorMemory which provides better semantic search capabilities
    const memory = new VectorMemory();
    
    // You could alternatively use EnhancedMemory with a properly configured vector store
    // if you want short-term, long-term memory and notes functionality
    // This would require Pinecone API keys and additional configuration

    technicalAnalysisAgent.setMemory(memory);
    fundamentalAnalysisAgent.setMemory(memory);
    sentimentAnalysisAgent.setMemory(memory);
    coordinatorAgent.setMemory(memory);

    // Create agent swarm
    const swarm = new AgentSwarm({
      agents: [technicalAnalysisAgent, fundamentalAnalysisAgent, sentimentAnalysisAgent],
      coordinator: coordinatorAgent,
      planningStrategy: 'parallel',
      maxConcurrentAgents: 3,
      enableFeedback: true
    });

    // Create autonomous wrapper for the swarm
    const autonomousSwarm = new AutonomousAgent({
      baseAgent: swarm as any, // Type casting as the swarm implements similar interface
      healthCheckIntervalMinutes: 60,
      maxConsecutiveErrors: 3,
      enableAutoRecovery: true,
      enableContinuousMode: true
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
        accessSecret: process.env.TWITTER_ACCESS_SECRET
      });
    } else {
      logger.warn('Twitter credentials not found - will output tweets to console only');
    }

    // Start the autonomous swarm
    autonomousSwarm.start();
    logger.info('Crypto Research Swarm started successfully');

    // Function to conduct research on a specific cryptocurrency
    async function researchCrypto(cryptoId: string) {
      logger.info(`Initiating research on ${cryptoId}...`);
      
      try {
        // Create the research task
        const task = `
          Conduct a comprehensive analysis of ${cryptoId} cryptocurrency. 
          
          Each specialist agent should analyze different aspects:
          - Technical Analyst: Focus on price charts, patterns, indicators, and support/resistance levels
          - Fundamental Analyst: Examine on-chain metrics, development activity, adoption, and news
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
        
        return result;
      } catch (error) {
        logger.error(`Error researching ${cryptoId}:`, error);
        throw error;
      }
    }

    // Function to run periodic analysis
    async function runPeriodicAnalysis() {
      logger.info('Starting periodic crypto analysis...');
      
      // Randomly select one cryptocurrency to analyze deeply and tweet about
      const randomIndex = Math.floor(Math.random() * TARGET_CRYPTOS.length);
      const selectedCrypto = TARGET_CRYPTOS[randomIndex];
      
      logger.info(`Selected ${selectedCrypto} for in-depth analysis and Twitter post`);
      
      // Run the research
      await researchCrypto(selectedCrypto);
      
      // Schedule the next analysis
      const nextRunMinutes = 120 + Math.floor(Math.random() * 60); // 2-3 hours
      logger.info(`Next analysis scheduled in ${nextRunMinutes} minutes`);
      
      setTimeout(runPeriodicAnalysis, nextRunMinutes * 60 * 1000);
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
    console.log('\nCrypto Research Swarm is running in periodic mode...');
    console.log('Press Ctrl+C to stop the swarm...');
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Stopping Crypto Research Swarm...');
      autonomousSwarm.stop();
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