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
  // Authentication
  username: process.env.TWITTER_USERNAME,
  password: process.env.TWITTER_PASSWORD,
  email: process.env.TWITTER_EMAIL,
  
  // Twitter API v2 credentials (optional, enables additional features)
  apiKey: process.env.TWITTER_API_KEY,
  apiSecret: process.env.TWITTER_API_SECRET_KEY,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  
  // Monitoring options
  monitorKeywords: process.env.MONITOR_KEYWORDS?.split(',').filter(k => k.trim()),
  monitorUsers: process.env.MONITOR_USERS?.split(',').filter(u => u.trim()),
  monitorMentions: process.env.MONITOR_MENTIONS === 'true',
  monitorReplies: process.env.MONITOR_REPLIES === 'true',
  autoReply: process.env.AUTO_REPLY === 'true',
  
  // Session persistence
  persistCookies: process.env.PERSIST_COOKIES === 'true',
  cookiesPath: process.env.COOKIES_PATH || './data/twitter-cookies.json',
  
  // Polling and retry settings
  pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000,
  maxRetries: process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES) : 3,
  retryDelay: process.env.RETRY_DELAY ? parseInt(process.env.RETRY_DELAY) : 2000,
  
  // Debug mode
  debug: process.env.DEBUG_TWITTER === 'true'
});

// Event handlers for tweets
twitterConnector.on('tweet', async (tweet) => {
  logger.info(`Received tweet from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
  
  // Process metrics if available
  if (tweet.metrics) {
    logger.debug('Tweet metrics', {
      likes: tweet.metrics.likes || 0,
      retweets: tweet.metrics.retweets || 0,
      replies: tweet.metrics.replies || 0,
      views: tweet.metrics.views || 0
    });
  }
  
  // If auto-reply is disabled, we can handle tweets manually here
  if (process.env.AUTO_REPLY !== 'true') {
    try {
      const result = await agent.run({
        task: `Analyze this tweet from @${tweet.author.username}: "${tweet.text}"\n\nTweet context: ${JSON.stringify(tweet, null, 2)}`
      });
      
      logger.info(`Analysis: ${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}`);
      
      // Decide whether to reply, like, or retweet based on the analysis
      if (result.response.toLowerCase().includes('reply:')) {
        const replyParts = result.response.split('reply:');
        if (replyParts.length > 1 && replyParts[1]) {
          const replyText = replyParts[1].trim();
          await twitterConnector.tweet(replyText, { replyTo: tweet.id });
          logger.info('Replied to tweet');
        }
      }
      
      if (result.response.toLowerCase().includes('like')) {
        if (tweet.id) {
          await twitterConnector.like(tweet.id);
          logger.info('Liked tweet');
        }
      }
      
      if (result.response.toLowerCase().includes('retweet')) {
        if (tweet.id) {
          await twitterConnector.retweet(tweet.id);
          logger.info('Retweeted tweet');
        }
      }
      
      if (result.response.toLowerCase().includes('quote:')) {
        const quoteParts = result.response.split('quote:');
        if (quoteParts.length > 1 && quoteParts[1] && tweet.id) {
          const quoteText = quoteParts[1].trim();
          await twitterConnector.quoteTweet(tweet.id, quoteText);
          logger.info('Quote tweeted');
        }
      }
    } catch (error) {
      logger.error('Error handling tweet', error);
    }
  }
});

twitterConnector.on('keyword_match', async (tweet) => {
  logger.info(`Keyword match in tweet from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
  
  // If auto-reply is disabled, we can handle keyword matches manually here
  if (process.env.AUTO_REPLY !== 'true') {
    try {
      const result = await agent.run({
        task: `A tweet matched one of our monitored keywords. Analyze this tweet from @${tweet.author.username}: "${tweet.text}"
        
Should we engage with this tweet? If so, how? Consider:
1. Is this relevant to our goals?
2. Would responding provide value to the conversation?
3. Is this a good opportunity to showcase our expertise?

If we should engage, include one of these in your response:
- "Reply: [your suggested reply]" to reply to the tweet
- "Like" to like the tweet
- "Retweet" to retweet the tweet
- "Quote: [your quote tweet text]" to quote tweet

If we should not engage, explain why briefly.`
      });
      
      logger.info(`Keyword match analysis: ${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}`);
      
      // Process the response (similar to tweet handler)
      if (result.response.toLowerCase().includes('reply:')) {
        const replyParts = result.response.split('reply:');
        if (replyParts.length > 1 && replyParts[1]) {
          const replyText = replyParts[1].trim();
          await twitterConnector.tweet(replyText, { replyTo: tweet.id });
          logger.info('Replied to keyword match');
        }
      }
      
      if (result.response.toLowerCase().includes('like')) {
        if (tweet.id) {
          await twitterConnector.like(tweet.id);
          logger.info('Liked keyword match');
        }
      }
      
      if (result.response.toLowerCase().includes('retweet')) {
        if (tweet.id) {
          await twitterConnector.retweet(tweet.id);
          logger.info('Retweeted keyword match');
        }
      }
      
      if (result.response.toLowerCase().includes('quote:')) {
        const quoteParts = result.response.split('quote:');
        if (quoteParts.length > 1 && quoteParts[1] && tweet.id) {
          const quoteText = quoteParts[1].trim();
          await twitterConnector.quoteTweet(tweet.id, quoteText);
          logger.info('Quote tweeted keyword match');
        }
      }
    } catch (error) {
      logger.error('Error handling keyword match', error);
    }
  }
});

// Handle mentions if we're monitoring them
twitterConnector.on('mention', async (tweet) => {
  logger.info(`Mentioned in tweet from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
  
  // If not using auto-reply, handle mentions manually
  if (process.env.AUTO_REPLY !== 'true' && tweet.id) {
    try {
      const result = await agent.run({
        task: `You were mentioned in this tweet from @${tweet.author.username}: "${tweet.text}"
        
Craft a helpful, friendly response. Keep it under 280 characters.`
      });
      
      // Trim if needed
      let response = result.response;
      if (response.length > 280) {
        response = response.substring(0, 277) + '...';
      }
      
      await twitterConnector.tweet(response, { replyTo: tweet.id });
      logger.info('Replied to mention');
    } catch (error) {
      logger.error('Error handling mention', error);
    }
  }
});

// Handle direct replies to our tweets
twitterConnector.on('reply', async (tweet) => {
  logger.info(`Received reply from @${tweet.author.username}: ${tweet.text.substring(0, 50)}${tweet.text.length > 50 ? '...' : ''}`);
  
  // Auto-reply will handle this if enabled, otherwise we can process manually
  if (process.env.AUTO_REPLY !== 'true' && tweet.id) {
    try {
      const result = await agent.run({
        task: `@${tweet.author.username} replied to your tweet: "${tweet.text}"
        
Create a thoughtful response that continues the conversation. Keep it under 280 characters.`
      });
      
      // Trim if needed
      let response = result.response;
      if (response.length > 280) {
        response = response.substring(0, 277) + '...';
      }
      
      await twitterConnector.tweet(response, { replyTo: tweet.id });
      logger.info('Replied to reply');
    } catch (error) {
      logger.error('Error handling reply', error);
    }
  }
});

// Sample Grok conversation
async function askGrok(question: string): Promise<any> {
  if (process.env.USE_GROK !== 'true') {
    logger.info('Grok integration disabled');
    return;
  }
  
  try {
    logger.info('Asking Grok: ' + question);
    
    const response = await twitterConnector.grokChat([{
      role: 'user',
      content: question
    }]);
    
    logger.info('Grok response: ' + response.message);
    
    if (response.rateLimit?.isRateLimited) {
      logger.warn('Grok rate limit: ' + response.rateLimit.message);
    }
    
    return response;
  } catch (error) {
    logger.error('Error using Grok', error);
  }
}

// Export for direct script use
export async function getTrends(): Promise<void> {
  try {
    logger.info('Getting current Twitter trends');
    
    // Create a temporary connector for this operation
    const tempConnector = new TwitterDirectConnector({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL
    });
    
    // Connect first
    await tempConnector.connect(agent);
    
    // Now get trends
    const trends = await tempConnector.getTrends();
    
    logger.info(`Top 5 Twitter trends:`);
    trends.slice(0, 5).forEach((trend: any, index: number) => {
      logger.info(`${index + 1}. ${trend.name || trend.title || trend.query} - ${trend.tweet_volume ? trend.tweet_volume + ' tweets' : 'volume unknown'}`);
    });
    
    // Disconnect when done
    await tempConnector.disconnect();
  } catch (error) {
    logger.error('Error getting trends', error);
  }
}

// Main function
async function main() {
  try {
    // Connect the agent to Twitter
    logger.info('Connecting to Twitter...');
    await twitterConnector.connect(agent);
    logger.info('Twitter bot successfully connected and logged in');
    
    // Get current trends
    await getTrends();
    
    // Test Grok if enabled
    if (process.env.USE_GROK === 'true') {
      await askGrok("What are the most interesting developments in AI in the past week?");
    }
    
    // Send a startup tweet if STARTUP_TWEET is set
    if (process.env.STARTUP_TWEET === 'true') {
      const startupMessage = await agent.run({
        task: 'Generate a friendly startup message announcing that you are now online and monitoring Twitter. Keep it under 280 characters and make it engaging.'
      });
      
      // Trim if needed
      let response = startupMessage.response;
      if (response.length > 280) {
        response = response.substring(0, 277) + '...';
      }
      
      try {
        logger.info('Attempting to send startup tweet...');
        
        // Option to add poll if API keys are configured
        if (process.env.TWITTER_API_KEY && process.env.ADD_POLL === 'true') {
          const tweetId = await twitterConnector.tweet(response, {
            poll: {
              options: [
                { label: 'AI & Technology 🤖' },
                { label: 'Finance & Crypto 💰' },
                { label: 'General Questions ❓' },
                { label: 'Other Topics 🌈' }
              ],
              durationMinutes: 1440 // 24 hours
            }
          });
          logger.info('Startup tweet with poll sent successfully', { tweetId });
        } else {
          const tweetId = await twitterConnector.tweet(response);
          logger.info('Startup tweet sent successfully', { tweetId });
        }
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
    
    logger.info('Twitter bot is running with enhanced functionality. Press Ctrl+C to exit.');
    logger.info(`Monitoring: ${twitterConnector.config.monitorKeywords?.length || 0} keywords, ${twitterConnector.config.monitorUsers?.length || 0} users`);
    if (twitterConnector.config.monitorMentions) logger.info('Monitoring mentions');
    if (twitterConnector.config.monitorReplies) logger.info('Monitoring replies');
    if (twitterConnector.config.autoReply) logger.info('Auto-reply enabled');
  } catch (error) {
    logger.error('Error starting Twitter bot', error);
    process.exit(1);
  }
}

// Run the bot
main();