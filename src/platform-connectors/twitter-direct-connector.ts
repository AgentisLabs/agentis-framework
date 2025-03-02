import { EventEmitter } from 'events';
import { Agent } from '../core/agent';
import { AgentSwarm } from '../core/agent-swarm';
import { Logger } from '../utils/logger';
import { Scraper, SearchMode } from 'agent-twitter-client';

/**
 * Configuration for the Twitter connector
 */
export interface TwitterDirectConnectorConfig {
  // Authentication (traditional method)
  username?: string;
  password?: string;
  email?: string;
  
  // Twitter API v2 credentials (optional, enables additional features)
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
  
  // Monitoring options
  monitorKeywords?: string[];
  monitorUsers?: string[];
  monitorMentions?: boolean;
  monitorReplies?: boolean;
  autoReply?: boolean;
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval?: number;
  
  // Session persistence
  persistCookies?: boolean;
  cookiesPath?: string;
  
  // Retry settings
  maxRetries?: number;
  retryDelay?: number;
  
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
  mediaUrls?: string[];
  poll?: {
    options: { label: string, votes?: number }[];
    endTime?: Date;
  };
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
    views?: number;
  };
  entities?: {
    hashtags?: string[];
    mentions?: string[];
    urls?: string[];
  };
}

/**
 * Media data for tweet attachments
 */
export interface TwitterMediaData {
  data: Buffer;
  mediaType: string;
}

/**
 * Poll data for creating Twitter polls
 */
export interface TwitterPollData {
  options: { label: string }[];
  durationMinutes: number;
}

/**
 * Tweet options for enhanced functionality
 */
export interface TweetOptions {
  media?: TwitterMediaData[];
  poll?: TwitterPollData;
  replyTo?: string;
  quoteId?: string;
}

/**
 * Twitter connector to integrate agents with Twitter
 * Uses agent-twitter-client to connect to Twitter without requiring API keys
 * Optionally supports Twitter API v2 for enhanced functionality
 */
export class TwitterDirectConnector extends EventEmitter {
  public config: TwitterDirectConnectorConfig;
  private agent?: Agent;
  private swarm?: AgentSwarm;
  private scraper: Scraper | null = null;
  private connected = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private retryCount: number = 0;
  private seenTweetIds: Set<string> = new Set();
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
      pollInterval: config.pollInterval || 60000, // Default: 1 minute
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 2000,
      persistCookies: config.persistCookies || false,
      cookiesPath: config.cookiesPath || './twitter-cookies.json',
      monitorMentions: config.monitorMentions || false,
      monitorReplies: config.monitorReplies || false
    };
    this.logger = new Logger('TwitterDirectConnector');
  }
  
  /**
   * Helper method to wait with exponential backoff
   * 
   * @param attempt - Current attempt number
   * @returns Promise that resolves after the delay
   */
  private async exponentialBackoff(attempt: number): Promise<void> {
    const delay = Math.min(
      this.config.retryDelay! * Math.pow(2, attempt),
      30000 // Max 30 seconds
    );
    this.logger.debug(`Retry backoff: waiting ${delay}ms before retry ${attempt + 1}/${this.config.maxRetries}`);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Attempts to load cookies from storage
   * 
   * @returns True if cookies were loaded successfully, false otherwise
   */
  private async loadCookies(): Promise<boolean> {
    if (!this.config.persistCookies || !this.scraper) {
      return false;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const cookiesPath = this.config.cookiesPath!;
      
      if (!fs.existsSync(cookiesPath)) {
        this.logger.debug('No stored cookies found');
        return false;
      }
      
      const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesData);
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        this.logger.debug('Invalid or empty cookies data');
        return false;
      }
      
      this.logger.debug(`Setting ${cookies.length} stored cookies`);
      await this.scraper.setCookies(cookies);
      
      // Verify if we're logged in with these cookies
      const isLoggedIn = await this.scraper.isLoggedIn();
      
      if (isLoggedIn) {
        this.logger.info('Successfully restored session from cookies');
        return true;
      } else {
        this.logger.debug('Stored cookies are expired or invalid');
        return false;
      }
    } catch (error) {
      this.logger.debug('Error loading cookies', error);
      return false;
    }
  }
  
  /**
   * Saves current cookies to storage
   */
  private async saveCookies(): Promise<void> {
    if (!this.config.persistCookies || !this.scraper) {
      return;
    }
    
    try {
      const fs = require('fs');
      const path = require('path');
      
      const cookies = await this.scraper.getCookies();
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        this.logger.debug('No cookies to save');
        return;
      }
      
      const cookiesPath = this.config.cookiesPath!;
      
      // Ensure directory exists
      const dir = path.dirname(cookiesPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Save cookies to file
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies), 'utf8');
      this.logger.debug(`Saved ${cookies.length} cookies to ${cookiesPath}`);
    } catch (error) {
      this.logger.debug('Error saving cookies', error);
    }
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
    this.retryCount = 0;
    
    try {
      // Initialize scraper
      this.scraper = new Scraper();
      
      // Try to restore session from cookies
      let loggedIn = false;
      if (this.config.persistCookies) {
        loggedIn = await this.loadCookies();
      }
      
      // If cookie login failed, use credentials
      if (!loggedIn) {
        // Get credentials
        const { 
          username, 
          password, 
          email, 
          apiKey, 
          apiSecret, 
          accessToken, 
          accessSecret 
        } = this.config;
        
        if (!username || !password) {
          throw new Error('Twitter username and password are required');
        }
        
        // Login with credentials
        this.logger.info('Logging in to Twitter with credentials');
        
        if (apiKey && apiSecret && accessToken && accessSecret) {
          // Use API credentials if available
          await this.scraper.login(
            username,
            password,
            email || '',
            apiKey,
            apiSecret,
            accessToken,
            accessSecret
          );
          this.logger.info('Logged in with API credentials for enhanced functionality');
        } else {
          // Basic login without API credentials
          await this.scraper.login(
            username, 
            password, 
            email || ''
          );
          this.logger.info('Logged in with basic credentials');
        }
        
        // Save cookies for future sessions
        if (this.config.persistCookies) {
          await this.saveCookies();
        }
      }
      
      this.connected = true;
      this.logger.info('Successfully connected to Twitter');
      
      // Set up monitoring if configured
      if (this.config.monitorKeywords?.length || 
          this.config.monitorUsers?.length || 
          this.config.monitorMentions || 
          this.config.monitorReplies) {
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
      
      // Save cookies before logout if configured
      if (this.config.persistCookies && this.scraper) {
        await this.saveCookies();
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
   * @param options - Optional tweet options (media, polls, etc)
   * @returns Promise resolving to the tweet ID
   */
  async tweet(content: string, options?: string | TweetOptions): Promise<string> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    // Handle legacy argument format (replyTo as string)
    if (typeof options === 'string') {
      options = { replyTo: options };
    }
    
    const { replyTo, quoteId, media, poll } = options || {};
    
    this.logger.debug('Posting tweet', { 
      content: content.substring(0, 30) + (content.length > 30 ? '...' : ''),
      replyTo,
      quoteId,
      hasMedia: !!media,
      hasPoll: !!poll
    });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        // Reset retry count on success
        this.retryCount = 0;
        
        // Handle different tweet types
        
        // Case 1: Tweet with poll (requires API keys)
        if (poll && this.config.apiKey) {
          this.logger.debug('Posting tweet with poll');
          // Handle tweet with poll
          const result = await this.scraper.sendTweetV2(content, undefined, {
            poll: {
              options: poll.options,
              duration_minutes: poll.durationMinutes // Use the correct property name
            }
          }) as any;
          
          this.logger.info('Tweet with poll posted successfully');
          return result && result.data && result.data.id ? 
            result.data.id : 'poll_tweet_posted_successfully';
        }
        
        // Case 2: Quote tweet
        else if (quoteId) {
          this.logger.debug('Posting quote tweet', { quoteId });
          // Use the correct media format for quotes
          await this.scraper.sendQuoteTweet(content, quoteId, media ? 
            media.map(m => m.data) as any : undefined);
          this.logger.info('Quote tweet posted successfully');
          return 'quote_tweet_posted_successfully';
        }
        
        // Case 3: Reply to a tweet
        else if (replyTo) {
          this.logger.debug('Posting reply to tweet', { replyTo });
          await this.scraper.sendTweet(content, replyTo, media);
          this.logger.info('Reply posted successfully');
          return 'reply_posted_successfully';
        }
        
        // Case 4: Regular tweet (with or without media)
        else {
          this.logger.debug('Posting regular tweet', { 
            hasMedia: !!media, 
            mediaCount: media?.length
          });
          
          if (media && media.length > 0) {
            // Use media parameter in the correct format
            await this.scraper.sendTweet(content, undefined, media);
          } else {
            await this.scraper.sendTweet(content);
          }
          
          this.logger.info('Tweet posted successfully');
          return 'tweet_posted_successfully';
        }
      } catch (error) {
        this.logger.error(`Error posting tweet (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        // If this is the last attempt, try the fallback method
        if (attempt === this.config.maxRetries) {
          try {
            this.logger.debug('Attempting fallback using direct page automation');
            // Need to access browser page for fallback
            let page: any;
            try {
              // Cast to any to allow method access
              page = await (this.scraper as any).getPage();
              
              if (!page) {
                throw new Error('No browser page available');
              }
            } catch (error) {
              throw new Error('Could not access browser page for fallback: ' + error);
            }
            
            // Navigate to Twitter home
            await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
            await page.waitForTimeout(3000);
            
            // Find compose field and enter content
            await this.typeIntoComposer(page, content);
            
            // Click tweet button
            await this.clickTweetButton(page);
            
            this.logger.info('Tweet posted successfully via page automation');
            return 'tweet_posted_via_fallback';
          } catch (pageError) {
            this.logger.error('Error with page automation fallback', pageError);
            throw new Error(`Failed to post tweet after ${this.config.maxRetries! + 1} attempts: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
          }
        }
        
        // Wait with exponential backoff before retry
        await this.exponentialBackoff(attempt);
      }
    }
    
    // This should never be reached due to the throws above
    throw new Error('Failed to post tweet');
  }
  
  /**
   * Helper method to type content into the tweet composer
   * 
   * @param page - The browser page
   * @param content - The content to type
   */
  private async typeIntoComposer(page: any, content: string): Promise<void> {
    try {
      // Try the new UI selector
      const textarea = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 3000 });
      if (textarea) {
        await textarea.type(content);
        this.logger.debug('Entered tweet content into new UI composer');
        return;
      }
    } catch (error) {
      this.logger.debug('Could not find new UI tweet composer, trying alternative');
    }
    
    try {
      // Try alternative selectors
      const alternativeSelectors = [
        '[role="textbox"][data-testid="tweetTextarea_0"]',
        '.DraftEditor-root [contenteditable="true"]',
        '[aria-label="Post text"]'
      ];
      
      for (const selector of alternativeSelectors) {
        try {
          const element = await page.waitForSelector(selector, { timeout: 2000 });
          if (element) {
            await element.type(content);
            this.logger.debug(`Entered tweet content using selector: ${selector}`);
            return;
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      throw new Error('Could not find any valid tweet composer element');
    } catch (error) {
      this.logger.error('Failed to type into tweet composer', error);
      throw error;
    }
  }
  
  /**
   * Helper method to click the tweet button
   * 
   * @param page - The browser page
   */
  private async clickTweetButton(page: any): Promise<void> {
    try {
      // Try the new UI selector
      const tweetButton = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 3000 });
      if (tweetButton) {
        await tweetButton.click();
        this.logger.debug('Clicked tweet button in new UI');
        return;
      }
    } catch (error) {
      this.logger.debug('Could not find new UI tweet button, trying alternative');
    }
    
    try {
      // Try alternative selectors
      const alternativeSelectors = [
        '[data-testid="tweetButton"]',
        '[aria-label="Post"]',
        'div[role="button"]:has-text("Tweet")'
      ];
      
      for (const selector of alternativeSelectors) {
        try {
          const element = await page.waitForSelector(selector, { timeout: 2000 });
          if (element) {
            await element.click();
            this.logger.debug(`Clicked tweet button using selector: ${selector}`);
            return;
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      throw new Error('Could not find any valid tweet button');
    } catch (error) {
      this.logger.error('Failed to click tweet button', error);
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
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        await this.scraper.likeTweet(tweetId);
        this.logger.info('Tweet liked successfully');
        return;
      } catch (error) {
        this.logger.error(`Error liking tweet (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to like tweet after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
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
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        await this.scraper.retweet(tweetId);
        this.logger.info('Tweet retweeted successfully');
        return;
      } catch (error) {
        this.logger.error(`Error retweeting tweet (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to retweet after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
  }
  
  /**
   * Quote retweets a tweet
   * 
   * @param tweetId - The ID of the tweet to quote
   * @param content - The content to add with the quote
   * @param media - Optional media to include with the quote
   * @returns Promise resolving when the quote tweet is posted
   */
  async quoteTweet(tweetId: string, content: string, media?: TwitterMediaData[]): Promise<string> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    return this.tweet(content, { quoteId: tweetId, media });
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
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        await this.scraper.followUser(username);
        this.logger.info('User followed successfully');
        return;
      } catch (error) {
        this.logger.error(`Error following user (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to follow user after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
  }
  
  /**
   * Gets a user's profile information
   * 
   * @param username - The username of the user
   * @returns Promise resolving to the user profile
   */
  async getProfile(username: string): Promise<any> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Getting user profile', { username });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const profile = await this.scraper.getProfile(username);
        this.logger.debug('Got user profile successfully');
        return profile;
      } catch (error) {
        this.logger.error(`Error getting profile (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to get profile after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
  }
  
  /**
   * Gets trends on Twitter
   * 
   * @returns Promise resolving to current Twitter trends
   */
  async getTrends(): Promise<any[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Getting Twitter trends');
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const trends = await this.scraper.getTrends();
        this.logger.debug(`Got ${trends.length} Twitter trends`);
        return trends;
      } catch (error) {
        this.logger.error(`Error getting trends (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to get trends after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
    
    return [];
  }
  
  /**
   * Gets a specific tweet by ID
   * 
   * @param tweetId - The ID of the tweet to get
   * @returns Promise resolving to the tweet
   */
  async getTweet(tweetId: string): Promise<Tweet> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Getting tweet', { tweetId });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        // Try to use V2 if API credentials exist for better detail
        if (this.config.apiKey && this.config.apiSecret) {
          try {
            const tweet = await this.scraper.getTweetV2(tweetId, {
              expansions: ['attachments.poll_ids', 'attachments.media_keys'],
              pollFields: ['options', 'end_datetime'],
              mediaFields: ['url', 'preview_image_url']
            });
            
            return this.formatTweetFromV2(tweet);
          } catch (error) {
            this.logger.debug('Error getting tweet with V2 API, falling back to V1', error);
            // Fall through to standard method
          }
        }
        
        // Standard method
        const tweet = await this.scraper.getTweet(tweetId);
        return this.formatTweet(tweet);
      } catch (error) {
        this.logger.error(`Error getting tweet (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to get tweet after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
    
    throw new Error('Failed to get tweet');
  }
  
  /**
   * Searches for tweets by keyword
   * 
   * @param query - The search query
   * @param count - Maximum number of tweets to return
   * @returns Promise resolving to the list of tweets
   */
  async searchTweets(query: string, count: number = 10): Promise<Tweet[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Searching tweets', { query, count });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const tweets = await this.scraper.searchTweets(query, count, SearchMode.Latest);
        
        // Handle async iterator
        const result: Tweet[] = [];
        for await (const tweet of tweets) {
          result.push(this.formatTweet(tweet));
        }
        return result;
      } catch (error) {
        this.logger.error(`Error searching tweets (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to search tweets after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
    
    return [];
  }
  
  /**
   * Gets tweets from a specific user
   * 
   * @param username - The username to get tweets from
   * @param count - Maximum number of tweets to return
   * @returns Promise resolving to the list of tweets
   */
  async getUserTweets(username: string, count: number = 10): Promise<Tweet[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Getting user tweets', { username, count });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const tweets = await this.scraper.getTweets(username, count);
        
        // Handle async iterator
        const result: Tweet[] = [];
        for await (const tweet of tweets) {
          result.push(this.formatTweet(tweet));
        }
        return result;
      } catch (error) {
        this.logger.error(`Error getting user tweets (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to get user tweets after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
    
    return [];
  }
  
  /**
   * Gets the home timeline
   * 
   * @param count - Maximum number of tweets to return
   * @returns Promise resolving to the timeline tweets
   */
  async getHomeTimeline(count: number = 20): Promise<Tweet[]> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Getting home timeline', { count });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        // Convert seen tweet IDs array from set
        const seenTweetIds = Array.from(this.seenTweetIds);
        
        const timeline = await this.scraper.fetchHomeTimeline(count, seenTweetIds);
        
        // Add new tweet IDs to seen set
        timeline.forEach(tweet => {
          if (tweet.id) {
            this.seenTweetIds.add(tweet.id);
          }
        });
        
        // Keep set size manageable
        if (this.seenTweetIds.size > 1000) {
          this.seenTweetIds = new Set(Array.from(this.seenTweetIds).slice(-1000));
        }
        
        return timeline.map(tweet => this.formatTweet(tweet));
      } catch (error) {
        this.logger.error(`Error getting home timeline (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to get home timeline after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
    
    return [];
  }
  
  /**
   * Utility function to format a tweet from the API response
   * 
   * @param tweet - The raw tweet object from the API
   * @returns The formatted Tweet object
   */
  private formatTweet(tweet: any): Tweet {
    // Extract media URLs if available
    const mediaUrls: string[] = [];
    if (tweet.media && Array.isArray(tweet.media)) {
      tweet.media.forEach((media: any) => {
        if (media.url) {
          mediaUrls.push(media.url);
        }
      });
    }
    
    // Extract hashtags and mentions
    const hashtags: string[] = [];
    const mentions: string[] = [];
    const urls: string[] = [];
    
    if (tweet.entities) {
      if (tweet.entities.hashtags && Array.isArray(tweet.entities.hashtags)) {
        tweet.entities.hashtags.forEach((hashtag: any) => {
          if (hashtag.text) {
            hashtags.push(`#${hashtag.text}`);
          }
        });
      }
      
      if (tweet.entities.user_mentions && Array.isArray(tweet.entities.user_mentions)) {
        tweet.entities.user_mentions.forEach((mention: any) => {
          if (mention.screen_name) {
            mentions.push(`@${mention.screen_name}`);
          }
        });
      }
      
      if (tweet.entities.urls && Array.isArray(tweet.entities.urls)) {
        tweet.entities.urls.forEach((url: any) => {
          if (url.expanded_url) {
            urls.push(url.expanded_url);
          }
        });
      }
    }
    
    // Format the tweet object
    return {
      id: tweet.id,
      text: tweet.text || tweet.full_text,
      author: {
        id: tweet.user_id_str,
        username: tweet.username || tweet.user?.screen_name,
        name: tweet.name || tweet.user?.name
      },
      createdAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      isRetweet: tweet.retweeted || false,
      isReply: tweet.is_reply || !!tweet.in_reply_to_status_id_str,
      inReplyToId: tweet.in_reply_to_status_id_str,
      inReplyToUser: tweet.in_reply_to_screen_name,
      mediaUrls,
      metrics: {
        likes: tweet.favorite_count,
        retweets: tweet.retweet_count,
        replies: tweet.reply_count,
        views: tweet.view_count
      },
      entities: {
        hashtags,
        mentions,
        urls
      }
    };
  }
  
  /**
   * Utility function to format a tweet from the V2 API response
   * 
   * @param tweetData - The raw tweet data from the V2 API
   * @returns The formatted Tweet object
   */
  private formatTweetFromV2(tweetData: any): Tweet {
    const tweet = tweetData?.data;
    if (!tweet) {
      throw new Error('Invalid tweet data from V2 API');
    }
    
    // Extract poll data if available
    let pollData = undefined;
    if (tweetData.includes?.polls?.length) {
      const poll = tweetData.includes.polls[0];
      pollData = {
        options: poll.options.map((option: any) => ({
          label: option.label,
          votes: option.votes
        })),
        endTime: poll.end_datetime ? new Date(poll.end_datetime) : undefined
      };
    }
    
    // Extract media URLs
    const mediaUrls: string[] = [];
    if (tweetData.includes?.media?.length) {
      tweetData.includes.media.forEach((media: any) => {
        if (media.url) {
          mediaUrls.push(media.url);
        } else if (media.preview_image_url) {
          mediaUrls.push(media.preview_image_url);
        }
      });
    }
    
    // Format and return the tweet
    return {
      id: tweet.id,
      text: tweet.text,
      author: {
        id: tweet.author_id,
        username: tweet.author?.username,
        name: tweet.author?.name
      },
      createdAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      isRetweet: false, // V2 API doesn't directly indicate retweets
      isReply: !!tweet.in_reply_to_user_id,
      inReplyToId: tweet.referenced_tweets?.find((ref: any) => ref.type === 'replied_to')?.id,
      mediaUrls,
      poll: pollData,
      metrics: {
        likes: tweet.public_metrics?.like_count,
        retweets: tweet.public_metrics?.retweet_count,
        replies: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count
      }
    };
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
      monitorMentions: this.config.monitorMentions,
      monitorReplies: this.config.monitorReplies,
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
      // Get my profile for mentions monitoring
      let myUsername = '';
      if (this.config.monitorMentions) {
        try {
          const myProfile = await this.scraper.me();
          if (myProfile) {
            // Safely access the screen_name property
            myUsername = (myProfile as any).screen_name || '';
          }
        } catch (error) {
          this.logger.debug('Error getting current user profile, mention monitoring may not work', error);
        }
      }
      
      // Search for keyword tweets if keywords are specified
      if (this.config.monitorKeywords?.length) {
        for (const keyword of this.config.monitorKeywords) {
          try {
            const tweets = await this.scraper.searchTweets(keyword, 5, SearchMode.Latest);
            
            // Process and emit events for new tweets
            for await (const tweet of tweets) {
              // Skip already seen tweets
              if (tweet.id && this.seenTweetIds.has(tweet.id)) {
                continue;
              }
              
              // Add to seen tweets
              if (tweet.id) {
                this.seenTweetIds.add(tweet.id);
              }
              
              const formattedTweet = this.formatTweet(tweet);
              
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
            
            // Process and emit events for new tweets
            for await (const tweet of tweets) {
              // Skip already seen tweets
              if (tweet.id && this.seenTweetIds.has(tweet.id)) {
                continue;
              }
              
              // Add to seen tweets
              if (tweet.id) {
                this.seenTweetIds.add(tweet.id);
              }
              
              const formattedTweet = this.formatTweet(tweet);
              
              // Emit a regular tweet event
              this.emit('tweet', formattedTweet);
              
              // Also emit a reply event if this is a reply to us
              if (formattedTweet.isReply && 
                  formattedTweet.inReplyToUser && 
                  formattedTweet.inReplyToUser.toLowerCase() === myUsername.toLowerCase()) {
                this.emit('reply', formattedTweet);
                
                if (this.config.autoReply && this.agent) {
                  await this.handleAutoReply(formattedTweet);
                }
              }
            }
          } catch (error) {
            this.logger.debug(`Error getting tweets for user: ${username}`, error);
          }
        }
      }
      
      // Monitor mentions if enabled
      if (this.config.monitorMentions && myUsername) {
        try {
          const mentions = await this.scraper.searchTweets(`@${myUsername}`, 5, SearchMode.Latest);
          
          for await (const mention of mentions) {
            // Skip already seen tweets
            if (mention.id && this.seenTweetIds.has(mention.id)) {
              continue;
            }
            
            // Add to seen tweets
            if (mention.id) {
              this.seenTweetIds.add(mention.id);
            }
            
            const formattedMention = this.formatTweet(mention);
            
            // Emit a mention event
            this.emit('mention', formattedMention);
            
            if (this.config.autoReply && this.agent) {
              await this.handleAutoReply(formattedMention);
            }
          }
        } catch (error) {
          this.logger.debug('Error getting mentions', error);
        }
      }
      
      // Keep seen tweets set manageable
      if (this.seenTweetIds.size > 1000) {
        this.seenTweetIds = new Set(Array.from(this.seenTweetIds).slice(-1000));
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
    if (!tweet.id) {
      this.logger.debug('Cannot auto-reply to tweet without ID');
      return;
    }
    
    try {
      let agent: Agent;
      
      // Determine which agent to use
      if (this.agent) {
        agent = this.agent;
      } else if (this.swarm) {
        // Use the first agent in the swarm as the responder
        const agents = this.swarm.getAllAgents();
        if (agents.length === 0) {
          this.logger.debug('No agents available in swarm for auto-reply');
          return;
        }
        agent = agents[0];
      } else {
        this.logger.debug('No agent available for auto-reply');
        return;
      }
      
      // Prepare context information for agent
      const tweetContext = {
        id: tweet.id,
        author: tweet.author,
        text: tweet.text,
        isReply: tweet.isReply,
        isRetweet: tweet.isRetweet,
        createdAt: tweet.createdAt,
        entities: tweet.entities
      };
      
      // Generate a response using the agent
      this.logger.debug('Generating auto-reply using agent');
      const result = await agent.run({ 
        task: `Generate a helpful, engaging reply to this tweet from @${tweet.author.username}:
Tweet: "${tweet.text}"

Consider the following context about the tweet:
${JSON.stringify(tweetContext, null, 2)}

Your reply should be thoughtful, concise (under 280 characters), and relevant to the content of the tweet.
Do not include hashtags unless they add significant value.`
      });
      
      // Check if the response is too long
      let response = result.response;
      if (response.length > 280) {
        this.logger.debug('Auto-reply too long, truncating', { length: response.length });
        response = response.substring(0, 277) + '...';
      }
      
      // Post the reply
      this.logger.debug('Sending auto-reply');
      await this.tweet(response, { replyTo: tweet.id });
      this.logger.info('Auto-reply sent successfully', { 
        tweetId: tweet.id,
        tweet: tweet.text.substring(0, 50) + (tweet.text.length > 50 ? '...' : ''), 
        reply: response 
      });
    } catch (error) {
      this.logger.error('Error generating or sending auto-reply', error);
    }
  }
  
  /**
   * Interacts with Grok through Twitter's interface
   * 
   * @param messages - Array of messages in the conversation
   * @param conversationId - Optional conversation ID for continuing a conversation
   * @returns Promise resolving to Grok's response
   */
  async grokChat(messages: { role: 'user' | 'assistant', content: string }[], 
                 conversationId?: string): Promise<any> {
    if (!this.connected || !this.scraper) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Sending request to Grok', { 
      messageCount: messages.length, 
      conversationId: conversationId || 'new'
    });
    
    for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const response = await (this.scraper as any).grokChat({
          messages,
          conversationId,
          returnSearchResults: true,
          returnCitations: true
        });
        
        // Check if we hit rate limits
        if (response.rateLimit?.isRateLimited) {
          this.logger.warn('Grok rate limit hit', { message: response.rateLimit.message });
        }
        
        this.logger.info('Received response from Grok');
        return response;
      } catch (error) {
        this.logger.error(`Error interacting with Grok (attempt ${attempt + 1}/${this.config.maxRetries! + 1})`, error);
        
        if (attempt === this.config.maxRetries) {
          throw new Error(`Failed to interact with Grok after ${this.config.maxRetries! + 1} attempts: ${error}`);
        }
        
        await this.exponentialBackoff(attempt);
      }
    }
  }
}