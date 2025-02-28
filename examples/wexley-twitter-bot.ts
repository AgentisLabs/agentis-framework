import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Agent } from '../src/core/agent';
import { BrowserTwitterConnector } from '../src/platform-connectors/browser-twitter-connector';
import { Logger } from '../src/utils/logger';
import { PersonalityUtils } from '../src/core/enhanced-personality-system';
import { AgentRole } from '../src/core/types';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('WexleyTwitterBot');

// Path to Wexley personality
const WEXLEY_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');

// Main function
async function main() {
  try {
    // Check required environment variables
    const requiredEnvVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'ANTHROPIC_API_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
      }
    }

    // Load Wexley's personality profile
    logger.info('Loading Wexley personality profile');
    if (!fs.existsSync(WEXLEY_PERSONA_PATH)) {
      logger.error(`Wexley personality file not found at: ${WEXLEY_PERSONA_PATH}`);
      process.exit(1);
    }
    
    const personality = PersonalityUtils.loadPersonalityFromJson(WEXLEY_PERSONA_PATH);
    
    // Create agent with Wexley's personality
    logger.info('Creating Wexley agent');
    const agent = createWexleyAgent(personality);
    
    // Create Twitter connector
    logger.info('Creating Twitter connector');
    const twitterConnector = new BrowserTwitterConnector({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL,
      
      // Monitoring options - topics related to Wexley's interests
      monitorKeywords: [
        'AI crypto',
        'tokenomics',
        'crypto market',
        'GPT',
        'Bitcoin',
        'Ethereum',
        'market predictions'
      ],
      
      // Monitor some key accounts in the space
      monitorUsers: [
        'VitalikButerin',
        'SBF_FTX',
        'naval',
        'balajis',
        'cdixon'
      ],
      
      // Configuration
      autoReply: false, // Set to true to enable auto-replies
      pollInterval: 300000, // Check every 5 minutes
      headless: false, // Show the browser for debugging
      debug: true // Enable debugging features
    });

    // Connect to Twitter
    logger.info('Connecting to Twitter...');
    await twitterConnector.connect(agent);
    logger.info('Successfully connected to Twitter!');
    
    // Generate and post a tweet
    logger.info('Generating tweet as Wexley...');
    
    // Topics that Wexley might tweet about
    const topics = [
      'AI and crypto market convergence',
      'Tokenomics trends to watch',
      'Market cycle predictions',
      'Institutional capital in crypto',
      'AI infrastructure investments',
      'The state of Bitcoin and Ethereum',
      'Decentralized AI infrastructure',
      'Emerging use cases for tokenized AI'
    ];
    
    // Select a random topic
    const topic = topics[Math.floor(Math.random() * topics.length)];
    
    // Generate a tweet on the selected topic
    const result = await agent.run({
      task: `Create an insightful tweet on the topic of "${topic}". 
            The tweet should reflect your expertise in both crypto and AI markets.
            It should be provocative, analytical, and include a prediction or analysis.
            Make it sound authentically like you - confident, analytical and with your distinctive style.
            
            CRITICAL: Your tweet MUST be strictly UNDER 240 characters total.
            This is a hard requirement - tweets over 240 characters will fail to post.
            
            IMPORTANT: DO NOT use any hashtags (like #AI or #Crypto) in your tweet. 
            Wexley considers hashtags to be beneath him and never uses them.
            
            Only return the tweet text itself, no additional comments or formatting.`
    });
    
    // Log the generated tweet
    logger.info(`Generated tweet: ${result.response}`);
    
    // Check tweet length and ensure no hashtags
    const tweetLength = result.response.length;
    logger.info(`Tweet length: ${tweetLength} characters`);
    
    if (tweetLength > 280) {
      logger.error(`Tweet is too long (${tweetLength} characters). Maximum allowed is 280 characters.`);
      process.exit(1);
    }
    
    // Check for hashtags
    if (result.response.includes('#')) {
      logger.error('Tweet contains hashtags, which are not allowed for Wexley. Aborting.');
      logger.error(`Problematic tweet: ${result.response}`);
      process.exit(1);
    }
    
    // Post the tweet
    logger.info('Posting tweet to Twitter...');
    
    try {
      const tweetId = await twitterConnector.tweet(result.response);
      logger.info('Tweet successfully posted!', { tweetId });
    } catch (error) {
      logger.error('Failed to post tweet', error);
    }
    
    // Disconnect from Twitter
    logger.info('Disconnecting from Twitter');
    await twitterConnector.disconnect();
    logger.info('Disconnected from Twitter');
    
    logger.info('Process completed successfully');
  } catch (error) {
    logger.error('Error in Wexley Twitter Bot', error);
    process.exit(1);
  }
}

/**
 * Creates an agent with Wexley's personality
 */
function createWexleyAgent(personality: any) {
  const agentConfig = PersonalityUtils.createAgentConfig(
    'Wexley',
    personality,
    AgentRole.ASSISTANT,
    process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
  );
  
  const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);
  
  return new Agent({
    name: agentConfig.name,
    role: agentConfig.role,
    personality: PersonalityUtils.simplifyPersonality(personality),
    goals: personality.motivation.goals.shortTermGoals,
    systemPrompt,
    model: agentConfig.model
  });
}

// Run the main function
main();