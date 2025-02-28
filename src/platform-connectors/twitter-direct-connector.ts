import { EventEmitter } from 'events';
import { Agent } from '../core/agent';
import { AgentSwarm } from '../core/agent-swarm';
import { Logger } from '../utils/logger';
import { Scraper } from 'agent-twitter-client';

/**
 * Configuration for the Twitter connector
 */
export interface TwitterDirectConnectorConfig {
  // Authentication (traditional method)
  username?: string;
  password?: string;
  email?: string;
  
  // Monitoring options
  monitorKeywords?: string[];
  monitorUsers?: string[];
  autoReply?: boolean;
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval?: number;
  
  // Debug options
  debug?: boolean;
}

/**
 * Internal Tweet interface to abstract away the library-specific implementation
 */
export interface Tweet {
  id?: string;
  text: string;
  author: {
    id?: string;
    username?: string;
    name?: string;
  };
  createdAt?: Date;
  isRetweet?: boolean;
  isReply?: boolean;
  inReplyToId?: string;
  inReplyToUser?: string;
}

/**
 * Twitter connector to integrate agents with Twitter
 * Uses agent-twitter-client to connect to Twitter without requiring API keys
 */
export class TwitterDirectConnector extends EventEmitter {
  public config: TwitterDirectConnectorConfig;
  private agent?: Agent;
  private swarm?: AgentSwarm;
  private scraper: Scraper | null = null;
  private connected = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private logger: Logger;

  /**
   * Creates a new Twitter connector
   * 
   * @param config - Configuration options
   */
  constructor(config: TwitterDirectConnectorConfig) {
    super();
    this.config = {
      ...config,
      pollInterval: config.pollInterval || 60000 // Default: 1 minute
    };
    this.logger = new Logger('TwitterDirectConnector');
  }

  /**
   * Connects to Twitter
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
      
      // Get credentials
      const { username, password, email } = this.config;
      
      if (!username || !password) {
        throw new Error('Twitter username and password are required');
      }
      
      // Login with credentials
      this.logger.info('Logging in to Twitter');
      await this.scraper.login({
        username,
        password,
        email: email || ''
      });
      
      this.connected = true;
      this.logger.info('Successfully connected to Twitter');
      
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
    if (!this.connected) {
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
      if (this.scraper) {
        await this.scraper.logout();
        this.scraper = null;
      }
      
      this.connected = false;
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
      let tweetId = 'tweet_posted_successfully';
      
      // Try direct tweet methods
      try {
        if (replyTo) {
          // This is a reply
          this.logger.debug('Posting reply to tweet', { replyTo });
          await this.scraper.replyToTweet(replyTo, content);
          this.logger.info('Reply posted successfully');
        } else {
          // This is a normal tweet
          this.logger.debug('Posting tweet using sendTweet command');
          await this.scraper.sendTweet(content);
          this.logger.info('Tweet posted successfully');
        }
      } catch (error) {
        this.logger.error('Error posting tweet via command', error);
        
        // Try direct page access as fallback
        try {
          this.logger.debug('Attempting fallback using direct page automation');
          const page = await this.scraper.getPage();
          
          if (!page) {
            throw new Error('No browser page available');
          }
          
          // Navigate to Twitter home
          await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
          await page.waitForTimeout(3000);
          
          // Find compose field
          const textarea = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
          if (!textarea) {
            throw new Error('Could not find tweet compose area');
          }
          
          // Type content
          await textarea.type(content);
          this.logger.debug('Entered tweet content');
          
          // Click tweet button
          const tweetButton = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 });
          if (!tweetButton) {
            throw new Error('Could not find tweet button');
          }
          
          await tweetButton.click();
          this.logger.debug('Clicked tweet button');
          
          // Wait for tweet to process
          await page.waitForTimeout(3000);
          this.logger.info('Tweet posted successfully via page automation');
        } catch (pageError) {
          this.logger.error('Error with page automation fallback', pageError);
          throw pageError;
        }
      }
      
      return tweetId;
    } catch (error) {
      this.logger.error('All tweet posting methods failed', error);
      throw error;
    }
  }
  
  /**
   * Likes a tweet
   * 
   * @param tweetId - The ID of the tweet to like
   * @returns Promise resolving when the tweet is liked
   */
  async like(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Liking tweet', { tweetId });
    
    try {
      await this.scraper.likeTweet(tweetId);
      this.logger.info('Tweet liked successfully');
    } catch (error) {
      this.logger.error('Error liking tweet', error);
      throw error;
    }
  }
  
  /**
   * Retweets a tweet
   * 
   * @param tweetId - The ID of the tweet to retweet
   * @returns Promise resolving when the tweet is retweeted
   */
  async retweet(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Retweeting tweet', { tweetId });
    
    try {
      await this.scraper.retweet(tweetId);
      this.logger.info('Tweet retweeted successfully');
    } catch (error) {
      this.logger.error('Error retweeting tweet', error);
      throw error;
    }
  }
  
  /**
   * Follows a user
   * 
   * @param username - The username of the user to follow
   * @returns Promise resolving when the user is followed
   */
  async follow(username: string): Promise<void> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Following user', { username });
    
    try {
      await this.scraper.followUser(username);
      this.logger.info('User followed successfully');
    } catch (error) {
      this.logger.error('Error following user', error);
      throw error;
    }
  }
  
  /**
   * Sets up monitoring for tweets
   */
  private setupMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    const pollInterval = this.config.pollInterval || 60000;
    this.logger.info('Setting up tweet monitoring', { 
      keywords: this.config.monitorKeywords,
      users: this.config.monitorUsers,
      pollInterval
    });
    
    // Initial check
    this.checkForNewTweets();
    
    // Set up interval for regular checking
    this.monitorInterval = setInterval(() => {
      this.checkForNewTweets();
    }, pollInterval);
  }
  
  /**
   * Checks for new tweets that match monitoring criteria
   */
  private async checkForNewTweets(): Promise<void> {
    if (!this.connected || !this.scraper) {
      return;
    }
    
    try {
      // Search for keyword tweets if keywords are specified
      if (this.config.monitorKeywords?.length) {
        for (const keyword of this.config.monitorKeywords) {
          try {
            const tweets = await this.scraper.searchTweets(keyword, 5);
            
            // Convert to our internal format and emit events
            for (const tweet of tweets) {
              const formattedTweet: Tweet = {
                id: tweet.id,
                text: tweet.text,
                author: {
                  id: tweet.user_id_str,
                  username: tweet.username,
                  name: tweet.name
                },
                createdAt: new Date(tweet.created_at),
                isRetweet: tweet.retweeted,
                isReply: tweet.is_reply,
                inReplyToId: tweet.in_reply_to_status_id_str,
                inReplyToUser: tweet.in_reply_to_screen_name
              };
              
              // Emit a keyword match event
              this.emit('keyword_match', formattedTweet);
              
              // If auto-reply is enabled, generate a response
              if (this.config.autoReply && this.agent) {
                await this.handleAutoReply(formattedTweet);
              }
            }
          } catch (error) {
            this.logger.debug(`Error searching for keyword: ${keyword}`, error);
          }
        }
      }
      
      // Monitor specific users if specified
      if (this.config.monitorUsers?.length) {
        for (const username of this.config.monitorUsers) {
          try {
            const tweets = await this.scraper.getTweets(username, 5);
            
            // Convert to our internal format and emit events
            for (const tweet of tweets) {
              const formattedTweet: Tweet = {
                id: tweet.id,
                text: tweet.text,
                author: {
                  id: tweet.user_id_str,
                  username: tweet.username,
                  name: tweet.name
                },
                createdAt: new Date(tweet.created_at),
                isRetweet: tweet.retweeted,
                isReply: tweet.is_reply,
                inReplyToId: tweet.in_reply_to_status_id_str,
                inReplyToUser: tweet.in_reply_to_screen_name
              };
              
              // Emit a regular tweet event
              this.emit('tweet', formattedTweet);
            }
          } catch (error) {
            this.logger.debug(`Error getting tweets for user: ${username}`, error);
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
    if (!this.agent || !tweet.id) {
      return;
    }
    
    try {
      // Generate a response using the agent
      const result = await this.agent.run({ 
        task: `Generate a helpful reply to this tweet from @${tweet.author.username}: "${tweet.text}"`
      });
      
      // Post the reply
      await this.tweet(result.response, tweet.id);
      this.logger.info('Auto-reply sent', { 
        tweet: tweet.text, 
        reply: result.response 
      });
    } catch (error) {
      this.logger.error('Error generating or sending auto-reply', error);
    }
  }
}