import dotenv from 'dotenv';
import { Agent } from '../src/core/agent';
import { TwitterDirectConnector } from '../src/platform-connectors/twitter-direct-connector';
import { Logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('TwitterDirectBot');

// Make sure required environment variables are set
const requiredEnvVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create an agent to handle Twitter interactions
const agent = new Agent({
  name: 'TwitterBot',
  role: 'assistant',
  personality: {
    traits: ['helpful', 'friendly', 'concise'],
    background: 'A bot that monitors Twitter and responds to mentions and keywords'
  },
  goals: ['Provide helpful responses to Twitter mentions', 'Monitor keywords'],
  model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
});

// Configure the Twitter connector
const twitterConnector = new TwitterDirectConnector({
  username: process.env.TWITTER_USERNAME,
  password: process.env.TWITTER_PASSWORD,
  email: process.env.TWITTER_EMAIL,
  
  // Monitor specific keywords and users
  monitorKeywords: process.env.MONITOR_KEYWORDS?.split(','),
  monitorUsers: process.env.MONITOR_USERS?.split(','),
  
  // Configure auto-reply
  autoReply: process.env.AUTO_REPLY === 'true',
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
  
  // Debug mode
  debug: process.env.DEBUG_TWITTER === 'true'
});

// Event handlers for tweets
twitterConnector.on('tweet', async (tweet) => {
  logger.info(`Received tweet from @${tweet.author.username}: ${tweet.text}`);
  
  // If auto-reply is disabled, we can handle tweets manually here
  if (process.env.AUTO_REPLY !== 'true') {
    try {
      const result = await agent.run({
        task: `Analyze this tweet from @${tweet.author.username}: "${tweet.text}"\n\nTweet context: ${JSON.stringify(tweet)}`
      });
      
      logger.info(`Analysis: ${result.response}`);
      
      // Decide whether to reply, like, or retweet based on the analysis
      if (result.response.toLowerCase().includes('reply:')) {
        const replyText = result.response.split('reply:')[1].trim();
        await twitterConnector.tweet(replyText, tweet.id);
      }
      
      if (result.response.toLowerCase().includes('like')) {
        if (tweet.id) {
          await twitterConnector.like(tweet.id);
        }
      }
      
      if (result.response.toLowerCase().includes('retweet')) {
        if (tweet.id) {
          await twitterConnector.retweet(tweet.id);
        }
      }
    } catch (error) {
      logger.error('Error handling tweet', error);
    }
  }
});

twitterConnector.on('keyword_match', async (tweet) => {
  logger.info(`Keyword match in tweet from @${tweet.author.username}: ${tweet.text}`);
  
  // Similar handling as above, but for keyword matches
  // This event is fired separately from 'tweet' for clarity and flexibility
});

// Main function
async function main() {
  try {
    // Connect the agent to Twitter
    logger.info('Connecting to Twitter...');
    await twitterConnector.connect(agent);
    logger.info('Twitter bot successfully connected and logged in');
    
    // Send a startup tweet if STARTUP_TWEET is set
    if (process.env.STARTUP_TWEET === 'true') {
      const startupMessage = await agent.run({
        task: 'Generate a friendly startup message announcing that you are now online and monitoring Twitter.'
      });
      
      try {
        logger.info('Attempting to send startup tweet...');
        const tweetId = await twitterConnector.tweet(startupMessage.response);
        logger.info('Startup tweet sent successfully', { tweetId });
      } catch (error) {
        logger.error('Failed to send startup tweet', error);
        logger.debug('Error details:', error);
      }
    }
    
    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down Twitter bot...');
      await twitterConnector.disconnect();
      process.exit(0);
    });
    
    logger.info('Twitter bot is running. Press Ctrl+C to exit.');
  } catch (error) {
    logger.error('Error starting Twitter bot', error);
    process.exit(1);
  }
}

// Run the bot
main();