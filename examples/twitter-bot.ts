import dotenv from 'dotenv';
import { Agent } from '../src/core/agent';
import { TwitterConnector } from '../src/platform-connectors/twitter-connector';
import { Logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('TwitterBot');

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
  description: 'A bot that monitors Twitter and responds to mentions and keywords',
  model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Configure the Twitter connector
const twitterConnector = new TwitterConnector({
  username: process.env.TWITTER_USERNAME,
  password: process.env.TWITTER_PASSWORD,
  email: process.env.TWITTER_EMAIL,
  
  // Optional Twitter API credentials for additional features
  apiKey: process.env.TWITTER_API_KEY,
  apiSecret: process.env.TWITTER_API_SECRET_KEY,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  
  // Monitor specific keywords and users
  monitorKeywords: process.env.MONITOR_KEYWORDS?.split(','),
  monitorUsers: process.env.MONITOR_USERS?.split(','),
  
  // Configure auto-reply
  autoReply: process.env.AUTO_REPLY === 'true',
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000
});

// Event handlers for tweets
twitterConnector.on('tweet', async (tweet) => {
  logger.info(`Received tweet from @${tweet.author.username}: ${tweet.text}`);
  
  // If auto-reply is disabled, we can handle tweets manually here
  if (process.env.AUTO_REPLY !== 'true') {
    try {
      const result = await agent.run({
        task: `Analyze this tweet from @${tweet.author.username}: "${tweet.text}"`,
        context: { tweet }
      });
      
      logger.info(`Analysis: ${result.response}`);
      
      // Decide whether to reply, like, or retweet based on the analysis
      if (result.response.toLowerCase().includes('reply:')) {
        const replyText = result.response.split('reply:')[1].trim();
        await twitterConnector.tweet(replyText, tweet.id);
      }
      
      if (result.response.toLowerCase().includes('like')) {
        await twitterConnector.like(tweet.id);
      }
      
      if (result.response.toLowerCase().includes('retweet')) {
        await twitterConnector.retweet(tweet.id);
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
    await twitterConnector.connect(agent);
    logger.info('Twitter bot started');
    
    // Send a startup tweet if STARTUP_TWEET is set
    if (process.env.STARTUP_TWEET === 'true') {
      const startupMessage = await agent.run({
        task: 'Generate a friendly startup message announcing that you are now online and monitoring Twitter.'
      });
      
      await twitterConnector.tweet(startupMessage.response);
    }
    
    // If SEARCH_ON_STARTUP is set, perform an initial search
    if (process.env.SEARCH_ON_STARTUP === 'true' && process.env.SEARCH_QUERY) {
      logger.info(`Performing initial search for: ${process.env.SEARCH_QUERY}`);
      
      const tweets = await twitterConnector.searchTweets(process.env.SEARCH_QUERY, 5);
      
      if (tweets.length > 0) {
        logger.info(`Found ${tweets.length} tweets matching search query`);
        
        for (const tweet of tweets) {
          logger.info(`Tweet from @${tweet.author.username}: ${tweet.text}`);
        }
      } else {
        logger.info('No tweets found matching search query');
      }
    }
    
    // If GET_TRENDS is set, fetch and display current trends
    if (process.env.GET_TRENDS === 'true') {
      logger.info('Fetching current Twitter trends');
      
      const trends = await twitterConnector.getTrends();
      
      if (trends.length > 0) {
        logger.info(`Top trends on Twitter:`);
        
        trends.slice(0, 10).forEach((trend, index) => {
          logger.info(`${index + 1}. ${trend.name} (${trend.tweet_volume || 'N/A'} tweets)`);
        });
      } else {
        logger.info('No trends available');
      }
    }
    
    // If ASK_GROK is set, send a question to Grok
    if (process.env.ASK_GROK === 'true' && process.env.GROK_QUESTION) {
      logger.info(`Asking Grok: ${process.env.GROK_QUESTION}`);
      
      try {
        const response = await twitterConnector.askGrok(process.env.GROK_QUESTION);
        logger.info(`Grok's response: ${response}`);
      } catch (error) {
        logger.error('Error asking Grok', error);
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