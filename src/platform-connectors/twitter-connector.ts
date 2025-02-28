import { EventEmitter } from 'events';
import { Agent } from '../core/agent';
import { AgentSwarm } from '../core/agent-swarm';
import { Logger } from '../utils/logger';
import { Scraper } from 'agent-twitter-client';

/**
 * Configuration for the Twitter connector
 */
export interface TwitterConnectorConfig {
  // Authentication (traditional method)
  username?: string;
  password?: string;
  email?: string;
  
  // API credentials (optional, enables additional features)
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  
  // Monitoring options
  monitorKeywords?: string[];
  monitorUsers?: string[];
  autoReply?: boolean;
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval?: number;
}

/**
 * Internal Tweet interface to abstract away the library-specific implementation
 */
export interface Tweet {
  id: string;
  text: string;
  author: {
    id: string;
    username: string;
    name: string;
  };
  createdAt: Date;
  isRetweet: boolean;
  isReply: boolean;
  inReplyToId?: string;
  inReplyToUser?: string;
}

type GrokResponse = {
  message: string;
  conversationId: string;
  rateLimit?: {
    isRateLimited: boolean;
    message: string;
  };
};

/**
 * Twitter connector to integrate agents with Twitter
 * Uses agent-twitter-client to connect to Twitter without requiring API keys
 */
export class TwitterConnector extends EventEmitter {
  public config: TwitterConnectorConfig;
  private agent?: Agent;
  private swarm?: AgentSwarm;
  private logger: Logger;
  private connected: boolean = false;
  private scraper: Scraper | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private lastCheckedTweets: Record<string, string> = {}; // username -> last tweet ID
  
  /**
   * Creates a new Twitter connector
   * 
   * @param config - Configuration for the connector
   */
  constructor(config: TwitterConnectorConfig) {
    super();
    this.config = {
      autoReply: false,
      pollInterval: 60000, // Default poll interval: 1 minute
      ...config
    };
    
    this.logger = new Logger('TwitterConnector');
  }
  
  /**
   * Connects an agent to Twitter
   * 
   * @param agent - The agent to connect
   * @returns Promise resolving when connected
   */
  async connect(agent: Agent | AgentSwarm): Promise<void> {
    if (agent instanceof Agent) {
      this.agent = agent;
      this.swarm = undefined;
    } else {
      this.swarm = agent;
      this.agent = undefined;
    }
    
    this.logger.info('Connecting to Twitter');
    
    try {
      // Initialize scraper
      this.scraper = new Scraper();
      
      // Login with credentials
      const { username, password, email, apiKey, apiSecret, accessToken, accessSecret } = this.config;
      
      if (!username || !password) {
        throw new Error('Twitter username and password are required');
      }
      
      // Login with basic credentials
      if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        await this.scraper.login(username, password, email || '');
      } else {
        // Login with full API credentials if available
        await this.scraper.login(
          username,
          password,
          email || '',
          apiKey,
          apiSecret,
          accessToken,
          accessSecret
        );
      }
      
      // Verify login was successful
      const isLoggedIn = await this.scraper.isLoggedIn();
      if (!isLoggedIn) {
        throw new Error('Failed to log in to Twitter');
      }
      
      this.connected = true;
      this.logger.info('Connected to Twitter');
      
      // Set up monitoring if configured
      if (this.config.monitorKeywords?.length || this.config.monitorUsers?.length) {
        this.setupMonitoring();
      }
    } catch (error) {
      this.logger.error('Failed to connect to Twitter', error);
      throw error;
    }
  }
  
  /**
   * Disconnects from Twitter
   * 
   * @returns Promise resolving when disconnected
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.scraper) {
      return;
    }
    
    this.logger.info('Disconnecting from Twitter');
    
    try {
      // Stop monitoring
      if (this.monitorInterval) {
        clearInterval(this.monitorInterval);
        this.monitorInterval = null;
      }
      
      // Logout
      await this.scraper.logout();
      
      this.connected = false;
      this.scraper = null;
      this.logger.info('Disconnected from Twitter');
    } catch (error) {
      this.logger.error('Failed to disconnect from Twitter', error);
      throw error;
    }
  }
  
  /**
   * Posts a tweet
   * 
   * @param content - The content of the tweet
   * @param replyTo - Optional tweet ID to reply to
   * @returns Promise resolving to the tweet ID
   */
  async tweet(content: string, replyTo?: string): Promise<string> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Posting tweet', { 
      content: content.substring(0, 30) + (content.length > 30 ? '...' : ''),
      replyTo
    });
    
    try {
      let result;
      
      if (replyTo) {
        // Send as a reply
        result = await this.scraper.sendTweet(content, replyTo);
      } else {
        // Send as a regular tweet
        result = await this.scraper.sendTweet(content);
      }
      
      if (!result) {
        throw new Error('Failed to post tweet');
      }
      
      const tweetId = typeof result === 'object' && 'id' in result ? String(result.id) : 
                     typeof result === 'string' ? result : 'unknown_tweet_id';
      
      this.logger.info('Posted tweet', { tweetId });
      return tweetId;
    } catch (error) {
      this.logger.error('Error posting tweet', error);
      throw error;
    }
  }
  
  /**
   * Retweets a tweet
   * 
   * @param tweetId - ID of the tweet to retweet
   * @returns Promise resolving when completed
   */
  async retweet(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Retweeting', { tweetId });
    
    try {
      await this.scraper.retweet(tweetId);
      this.logger.info('Retweeted tweet', { tweetId });
    } catch (error) {
      this.logger.error('Error retweeting', error);
      throw error;
    }
  }
  
  /**
   * Likes a tweet
   * 
   * @param tweetId - ID of the tweet to like
   * @returns Promise resolving when completed
   */
  async like(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Liking tweet', { tweetId });
    
    try {
      await this.scraper.likeTweet(tweetId);
      this.logger.info('Liked tweet', { tweetId });
    } catch (error) {
      this.logger.error('Error liking tweet', error);
      throw error;
    }
  }
  
  /**
   * Gets a specific tweet by ID
   * 
   * @param tweetId - ID of the tweet to get
   * @returns Promise resolving to the tweet
   */
  async getTweet(tweetId: string): Promise<Tweet> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      const scTweet = await this.scraper.getTweet(tweetId);
      
      if (!scTweet) {
        throw new Error(`Tweet not found with ID: ${tweetId}`);
      }
      
      // Convert to our internal Tweet interface
      return this.convertToTweet(scTweet);
    } catch (error) {
      this.logger.error('Error getting tweet', error);
      throw error;
    }
  }
  
  /**
   * Gets tweets from a user
   * 
   * @param username - Twitter username to get tweets from
   * @param count - Maximum number of tweets to get
   * @returns Promise resolving to an array of tweets
   */
  async getUserTweets(username: string, count: number = 10): Promise<Tweet[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      const tweetsIter = this.scraper.getTweets(username, count);
      const tweets: Tweet[] = [];
      
      // Collect tweets from the async iterator
      for await (const tweet of tweetsIter) {
        tweets.push(this.convertToTweet(tweet));
        
        if (tweets.length >= count) {
          break;
        }
      }
      
      return tweets;
    } catch (error) {
      this.logger.error('Error getting user tweets', error);
      throw error;
    }
  }
  
  /**
   * Searches for tweets
   * 
   * @param query - Search query
   * @param count - Maximum number of tweets to return
   * @returns Promise resolving to an array of tweets
   */
  async searchTweets(query: string, count: number = 20): Promise<Tweet[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      // Use the searchTweets method
      const tweets: Tweet[] = [];
      
      // Use for-await-of to get tweets from the async iterator
      for await (const tweet of this.scraper.searchTweets(query, count)) {
        tweets.push(this.convertToTweet(tweet));
        
        if (tweets.length >= count) {
          break;
        }
      }
      
      return tweets;
    } catch (error) {
      this.logger.error('Error searching tweets', error);
      throw error;
    }
  }
  
  /**
   * Gets current Twitter trends
   * 
   * @returns Promise resolving to an array of trend items
   */
  async getTrends(): Promise<Array<{ name: string; url: string; tweet_volume: number | null }>> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      const trends = await this.scraper.getTrends();
      
      // Ensure the correct format (the API might return different formats)
      return trends.map((trend: any) => {
        if (typeof trend === 'string') {
          return { name: trend, url: '', tweet_volume: null };
        }
        return trend;
      });
    } catch (error) {
      this.logger.error('Error getting trends', error);
      throw error;
    }
  }
  
  /**
   * Follow a Twitter user
   * 
   * @param username - Username of the account to follow
   * @returns Promise resolving when completed
   */
  async follow(username: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      await this.scraper.followUser(username);
      this.logger.info('Followed user', { username });
    } catch (error) {
      this.logger.error('Error following user', error);
      throw error;
    }
  }
  
  /**
   * Send a question to Twitter's Grok AI if available in the library
   * 
   * @param question - The question to ask Grok
   * @param conversationId - Optional existing conversation ID
   * @returns Promise resolving to Grok's response
   */
  async askGrok(question: string, conversationId?: string): Promise<string> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    try {
      // Check if grokChat method exists on the scraper
      if (typeof (this.scraper as any).grokChat !== 'function') {
        throw new Error('Grok integration is not available in this version of agent-twitter-client');
      }
      
      // Call the grokChat method
      const response = await (this.scraper as any).grokChat({
        messages: [{ role: 'user', content: question }],
        conversationId
      }) as GrokResponse;
      
      if (response.rateLimit?.isRateLimited) {
        this.logger.warn('Grok rate limited', { message: response.rateLimit.message });
      }
      
      return response.message;
    } catch (error) {
      this.logger.error('Error asking Grok', error);
      throw error;
    }
  }
  
  /**
   * Sets up monitoring for tweets
   * Polls periodically for new tweets from monitored users and keywords
   */
  private setupMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    this.logger.debug('Setting up Twitter monitoring', {
      keywords: this.config.monitorKeywords,
      users: this.config.monitorUsers,
      pollInterval: this.config.pollInterval
    });
    
    // Initial check to establish baseline
    this.checkForNewTweets()
      .catch(error => this.logger.error('Error in initial tweet check', error));
    
    // Set up polling interval
    this.monitorInterval = setInterval(() => {
      this.checkForNewTweets()
        .catch(error => this.logger.error('Error checking for new tweets', error));
    }, this.config.pollInterval || 60000);
  }
  
  /**
   * Checks for new tweets from monitored users and keywords
   */
  private async checkForNewTweets(): Promise<void> {
    if (!this.connected || !this.scraper) {
      return;
    }
    
    try {
      // Check monitored users
      if (this.config.monitorUsers?.length) {
        for (const username of this.config.monitorUsers) {
          // Get latest tweet
          const latestTweet = await this.scraper.getLatestTweet(username);
          
          if (!latestTweet) {
            continue;
          }
          
          // If we have seen this tweet before, skip
          const lastCheckedId = this.lastCheckedTweets[username];
          if (lastCheckedId && lastCheckedId === latestTweet.id) {
            continue;
          }
          
          // Update last checked tweet
          this.lastCheckedTweets[username] = latestTweet.id || 'unknown_id';
          
          // If this is the first check, don't trigger events
          if (!lastCheckedId) {
            continue;
          }
          
          const tweet = this.convertToTweet(latestTweet);
          
          // Emit tweet event
          this.emit('tweet', tweet);
          
          // Auto-reply if enabled
          if (this.config.autoReply) {
            await this.handleAutoReply(tweet);
          }
        }
      }
      
      // Check monitored keywords
      if (this.config.monitorKeywords?.length) {
        // Combine keywords for search
        const query = this.config.monitorKeywords.join(' OR ');
        
        // Get latest tweets for the search
        const tweets: any[] = [];
        const searchIterator = this.scraper.searchTweets(query, 10);
        
        // Limit to 10 tweets
        for await (const tweet of searchIterator) {
          tweets.push(tweet);
          if (tweets.length >= 10) {
            break;
          }
        }
        
        // Process tweets (newest first)
        for (const rawTweet of tweets) {
          // Skip tweets older than 5 minutes to avoid processing historical tweets
          const tweetDate = new Date(rawTweet.timeParsed || rawTweet.timestamp || Date.now());
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          
          if (tweetDate < fiveMinutesAgo) {
            continue;
          }
          
          const tweet = this.convertToTweet(rawTweet);
          
          // Emit keyword match event
          this.emit('keyword_match', tweet);
          
          // Auto-reply if enabled
          if (this.config.autoReply) {
            await this.handleAutoReply(tweet);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking for new tweets', error);
    }
  }
  
  /**
   * Handles auto-reply to a tweet
   * 
   * @param tweet - The tweet to reply to
   */
  private async handleAutoReply(tweet: Tweet): Promise<void> {
    const agentOrSwarm = this.agent || this.swarm;
    
    if (agentOrSwarm) {
      try {
        // Run agent or swarm with the tweet as input
        const result = await agentOrSwarm.run({
          task: `Respond to this tweet from @${tweet.author.username}: "${tweet.text}"`,
          // Add tweet as metadata in the conversation
          conversation: {
            id: `twitter-reply-${tweet.id}`,
            messages: [],
            created: Date.now(),
            updated: Date.now(),
            metadata: { tweet }
          }
        });
        
        // Reply to the tweet
        await this.tweet(result.response, tweet.id);
      } catch (error) {
        this.logger.error('Error auto-replying to tweet', error);
      }
    }
  }
  
  /**
   * Converts a library-specific tweet to our internal format
   * 
   * @param tweet - The tweet from the library
   * @returns Converted tweet in our internal format
   */
  private convertToTweet(tweet: any): Tweet {
    return {
      id: tweet.id || 'unknown_id',
      text: tweet.text || '',
      author: {
        id: tweet.userId || tweet.author?.id || 'unknown_author_id',
        username: tweet.username || tweet.author?.username || 'unknown_username',
        name: tweet.name || tweet.author?.name || 'Unknown User'
      },
      createdAt: new Date(tweet.timeParsed || tweet.timestamp || Date.now()),
      isRetweet: !!tweet.isRetweet,
      isReply: !!tweet.isReply,
      inReplyToId: tweet.inReplyToStatusId || tweet.inReplyToId,
      inReplyToUser: tweet.inReplyToUser || tweet.inReplyToUsername
    };
  }
}