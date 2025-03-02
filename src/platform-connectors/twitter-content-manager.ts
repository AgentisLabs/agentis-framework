/**
 * Twitter Content Manager
 * Manages scheduled tweets, content planning, and interaction strategy
 */

import { Logger } from '../utils/logger';
import { TwitterConnector, Tweet } from './twitter-connector';
import { Agent } from '../core/agent';
import { AutonomousAgent } from '../core/autonomous-agent';
import { TavilySearchTool } from '../tools/tavily-search-tool';
import fs from 'fs';
import path from 'path';

/**
 * Tweet idea structure
 */
export interface TweetIdea {
  id: string;
  topic: string;
  content: string;
  source?: string;
  created: number;
  priority: 'high' | 'medium' | 'low';
  status: 'draft' | 'approved' | 'posted' | 'rejected';
  scheduledFor?: number;
  tags?: string[];
  interactionGoal?: 'inform' | 'engage' | 'provoke' | 'question';
  engagement?: {
    likes: number;
    retweets: number;
    replies: number;
  };
}

/**
 * Content calendar entry
 */
export interface ContentCalendarEntry {
  id: string;
  date: number;
  topic: string;
  tweetId?: string;
  status: 'planned' | 'drafted' | 'posted' | 'skipped';
  category: string;
  notes?: string;
}

/**
 * Response metrics tracker
 */
interface ResponseMetrics {
  tweetId: string;
  responses: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
  lastChecked: number;
  isActive: boolean;
}

/**
 * Twitter content manager configuration
 */
export interface TwitterContentManagerConfig {
  // Required components
  twitterConnector: TwitterConnector;
  agent: Agent | AutonomousAgent;
  
  // Content preferences
  contentCategories?: string[];
  preferredPostingTimes?: number[]; // Hours of day (0-23)
  tweetsPerDay?: number;
  preferredTopics?: string[];
  contentRatio?: {
    original?: number;   // Percentage of original content (0-100)
    reactive?: number;   // Percentage of reactive content (responding to trends)
    curated?: number;    // Percentage of curated content (sharing links with commentary)
  };
  
  // Auto-response configuration
  enableAutoResponses?: boolean;
  autoResponseWhitelist?: string[]; // Usernames to always respond to
  
  // Research settings
  researchInterval?: number; // Minutes
  researchTopics?: string[];
  
  // Storage paths
  dataStoragePath?: string;
}

/**
 * Twitter content manager
 * Handles content planning, scheduling, and performance tracking
 */
export class TwitterContentManager {
  private twitter: TwitterConnector;
  private agent: Agent | AutonomousAgent;
  private logger: Logger;
  private config: TwitterContentManagerConfig;
  private searchTool: TavilySearchTool;
  
  // Data storage
  private tweetIdeasPath: string;
  private calendarPath: string;
  private metricsPath: string;
  
  // Data stores
  private tweetIdeas: TweetIdea[] = [];
  private calendar: ContentCalendarEntry[] = [];
  private responseMetrics: Map<string, ResponseMetrics> = new Map();
  
  // Intervals
  private postingInterval: NodeJS.Timeout | null = null;
  private researchInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  /**
   * Creates a new Twitter content manager
   * 
   * @param config - Configuration options
   */
  constructor(config: TwitterContentManagerConfig) {
    this.twitter = config.twitterConnector;
    this.agent = config.agent;
    this.logger = new Logger('TwitterContentManager');
    
    // Set up configuration with defaults
    this.config = {
      contentCategories: ['industry_news', 'analysis', 'opinion', 'technical', 'market'],
      preferredPostingTimes: [8, 12, 16, 20], // 8am, 12pm, 4pm, 8pm
      tweetsPerDay: 4,
      contentRatio: {
        original: 60,
        reactive: 30,
        curated: 10
      },
      enableAutoResponses: true,
      researchInterval: 60,
      ...config
    };
    
    // Initialize Tavily search tool
    this.searchTool = new TavilySearchTool();
    
    // Set up data storage paths
    const dataDir = this.config.dataStoragePath || path.join(process.cwd(), 'data', 'twitter');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Define file paths for persistence
    const agentName = this.getAgentName();
    this.tweetIdeasPath = path.join(dataDir, `${agentName}-tweet-ideas.json`);
    this.calendarPath = path.join(dataDir, `${agentName}-calendar.json`);
    this.metricsPath = path.join(dataDir, `${agentName}-metrics.json`);
    
    // Load data
    this.loadData();
    
    // Set up listeners for Twitter events
    this.setupEventListeners();
  }
  
  /**
   * Starts the content manager
   */
  public start(): void {
    this.logger.info('Starting Twitter content manager');
    
    // Start research interval
    if (this.config.researchInterval && this.config.researchInterval > 0) {
      const intervalMs = this.config.researchInterval * 60 * 1000;
      this.researchInterval = setInterval(() => this.performResearch(), intervalMs);
      
      // Run initial research
      this.performResearch();
    }
    
    // Start posting scheduler
    this.scheduleNextTweet();
    
    // Start metrics tracking
    this.metricsInterval = setInterval(() => this.updateMetrics(), 15 * 60 * 1000); // Every 15 minutes
  }
  
  /**
   * Stops the content manager
   */
  public stop(): void {
    this.logger.info('Stopping Twitter content manager');
    
    // Clear intervals
    if (this.postingInterval) {
      clearInterval(this.postingInterval);
      this.postingInterval = null;
    }
    
    if (this.researchInterval) {
      clearInterval(this.researchInterval);
      this.researchInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    // Save data
    this.saveData();
  }
  
  /**
   * Schedule the next tweet to be posted
   */
  private scheduleNextTweet(): void {
    if (this.postingInterval) {
      clearTimeout(this.postingInterval);
      this.postingInterval = null;
    }
    
    // Get the next scheduled tweet
    const nextTweet = this.getNextScheduledTweet();
    
    if (!nextTweet) {
      // If no tweet is scheduled, plan one
      this.planNextTweet();
      return;
    }
    
    // Calculate time to next tweet
    const now = Date.now();
    const timeToTweet = Math.max(0, nextTweet.scheduledFor! - now);
    
    this.logger.info(`Next tweet scheduled in ${(timeToTweet / (60 * 1000)).toFixed(1)} minutes`);
    
    // Schedule the tweet
    this.postingInterval = setTimeout(() => {
      this.postScheduledTweet(nextTweet);
      this.scheduleNextTweet(); // Schedule the next one
    }, timeToTweet);
  }
  
  /**
   * Get the next scheduled tweet
   */
  private getNextScheduledTweet(): TweetIdea | null {
    const now = Date.now();
    const scheduledTweets = this.tweetIdeas
      .filter(idea => idea.status === 'approved' && idea.scheduledFor && idea.scheduledFor > now)
      .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
    
    return scheduledTweets.length > 0 ? scheduledTweets[0] : null;
  }
  
  /**
   * Plan the next tweet based on content strategy
   */
  private async planNextTweet(): Promise<void> {
    const now = Date.now();
    
    // Check the calendar for any planned content
    const upcomingCalendarEntries = this.calendar
      .filter(entry => entry.status === 'planned' && entry.date > now)
      .sort((a, b) => a.date - b.date);
    
    // If we have calendar entries, use them
    if (upcomingCalendarEntries.length > 0) {
      const nextEntry = upcomingCalendarEntries[0];
      
      // Find or create a tweet idea for this entry
      let tweetIdea = this.tweetIdeas.find(idea => 
        idea.topic === nextEntry.topic && idea.status === 'draft'
      );
      
      if (!tweetIdea) {
        // Create a new tweet idea
        tweetIdea = await this.generateTweetIdea(nextEntry.topic, nextEntry.category);
        this.tweetIdeas.push(tweetIdea);
        
        // Update calendar entry
        nextEntry.status = 'drafted';
        this.saveData();
      }
      
      // Schedule the tweet
      tweetIdea.scheduledFor = nextEntry.date;
      tweetIdea.status = 'approved';
      this.saveData();
      
      // Schedule the tweet
      this.scheduleNextTweet();
      return;
    }
    
    // If no calendar entries, create a new tweet based on content ratios
    const randomValue = Math.random() * 100;
    const originalThreshold = this.config.contentRatio?.original || 60;
    const reactiveThreshold = originalThreshold + (this.config.contentRatio?.reactive || 30);
    
    try {
      let tweetIdea: TweetIdea;
      
      if (randomValue < originalThreshold) {
        // Original content
        const topic = this.selectRandomTopic();
        tweetIdea = await this.generateTweetIdea(topic, 'original');
      } else if (randomValue < reactiveThreshold) {
        // Reactive content based on trends
        const trends = await this.twitter.getTrends();
        const trendTopic = trends[Math.floor(Math.random() * Math.min(5, trends.length))].name;
        tweetIdea = await this.generateTweetIdea(trendTopic, 'reactive');
      } else {
        // Curated content
        const topic = this.selectRandomTopic();
        const searchResults = await this.searchTool.execute({ query: topic, maxResults: 3 });
        tweetIdea = await this.generateCuratedTweet(topic, searchResults);
      }
      
      // Schedule for the next preferred posting time
      tweetIdea.scheduledFor = this.getNextPostingTime();
      tweetIdea.status = 'approved';
      
      this.tweetIdeas.push(tweetIdea);
      this.saveData();
      
      // Update the schedule
      this.scheduleNextTweet();
    } catch (error) {
      this.logger.error('Error planning next tweet', error);
      
      // Try again in 30 minutes
      this.postingInterval = setTimeout(() => this.planNextTweet(), 30 * 60 * 1000);
    }
  }
  
  /**
   * Post a scheduled tweet
   */
  private async postScheduledTweet(tweet: TweetIdea): Promise<void> {
    try {
      this.logger.info(`Posting scheduled tweet about: ${tweet.topic}`);
      
      // Send the tweet
      const tweetId = await this.twitter.tweet(tweet.content);
      
      // Update status
      tweet.status = 'posted';
      
      // Add to response metrics for tracking
      this.responseMetrics.set(tweetId, {
        tweetId,
        responses: {
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0
        },
        lastChecked: Date.now(),
        isActive: true
      });
      
      // Update calendar if this was a calendar entry
      const calendarEntry = this.calendar.find(entry => 
        entry.topic === tweet.topic && 
        entry.date <= Date.now() && 
        (entry.status === 'planned' || entry.status === 'drafted')
      );
      
      if (calendarEntry) {
        calendarEntry.status = 'posted';
        calendarEntry.tweetId = tweetId;
      }
      
      this.saveData();
    } catch (error) {
      this.logger.error('Error posting scheduled tweet', error);
      
      // Mark as draft and try again later
      tweet.status = 'draft';
      tweet.scheduledFor = undefined;
      this.saveData();
    }
  }
  
  /**
   * Generate a tweet idea
   */
  private async generateTweetIdea(topic: string, category: string): Promise<TweetIdea> {
    const agentName = this.getAgentName();
    const prompt = `
      As ${agentName}, create a tweet about: "${topic}"
      
      Category: ${category}
      
      The tweet should:
      1. Reflect your knowledgeable, analytical style
      2. Provide value, insight, or a unique perspective
      3. Be under 280 characters
      4. Engage the audience with a thoughtful question or call to action if appropriate
      5. Include relevant hashtags sparingly

      Only return the tweet text, no quotation marks or other formatting.
    `;
    
    try {
      // Use the agent to generate content
      const result = await this.runAgentTask(prompt);
      
      // Ensure we have a string
      const content = typeof result === 'string' ? result.trim() : 
                     (result && typeof result === 'object' && 'response' in result) ? 
                     (result as any).response.trim() : 
                     `Tweet about ${topic}`;
      
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content,
        created: Date.now(),
        priority: 'medium',
        status: 'draft',
        tags: [category, topic.split(' ')[0].toLowerCase()],
        interactionGoal: this.determineInteractionGoal(content)
      };
    } catch (error) {
      this.logger.error('Error generating tweet idea', error);
      
      // Return a placeholder
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content: `I've been thinking about ${topic} lately. What are your thoughts? #${topic.split(' ')[0]}`,
        created: Date.now(),
        priority: 'low',
        status: 'draft',
        tags: [category],
        interactionGoal: 'question'
      };
    }
  }
  
  /**
   * Generate a curated tweet with external content
   */
  private async generateCuratedTweet(topic: string, searchResults: any): Promise<TweetIdea> {
    const agentName = this.getAgentName();
    let url = '';
    let title = '';
    
    if (searchResults && searchResults.results && searchResults.results.length > 0) {
      const result = searchResults.results[0];
      url = result.url;
      title = result.title;
    }
    
    const prompt = `
      As ${agentName}, create a tweet sharing and commenting on this article:
      
      Title: "${title}"
      URL: ${url}
      Topic: ${topic}
      
      The tweet should:
      1. Briefly mention what the article is about
      2. Add your own expert insight or perspective
      3. Include the URL
      4. Stay under 280 characters including the URL
      5. Add 1-2 relevant hashtags
      
      Only return the tweet text, no quotation marks or other formatting.
    `;
    
    try {
      // Use the agent to generate content
      const result = await this.runAgentTask(prompt);
      
      // Ensure we have a string
      const content = typeof result === 'string' ? result.trim() : 
                    (result && typeof result === 'object' && 'response' in result) ? 
                    (result as any).response.trim() : 
                    `Interesting article about ${topic}: ${title} ${url}`;
      
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content,
        source: url,
        created: Date.now(),
        priority: 'medium',
        status: 'draft',
        tags: ['curated', topic.split(' ')[0].toLowerCase()],
        interactionGoal: 'inform'
      };
    } catch (error) {
      this.logger.error('Error generating curated tweet', error);
      
      // Return a placeholder
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content: `Interesting read about ${topic}: ${title} ${url} #${topic.split(' ')[0]}`,
        source: url,
        created: Date.now(),
        priority: 'low',
        status: 'draft',
        tags: ['curated'],
        interactionGoal: 'inform'
      };
    }
  }
  
  /**
   * Perform research on topics
   */
  private async performResearch(): Promise<void> {
    try {
      // Select a topic to research
      const topic = this.selectResearchTopic();
      
      this.logger.info(`Researching topic: ${topic}`);
      
      // Search for content
      const searchResults = await this.searchTool.execute({
        query: topic,
        maxResults: 5,
        includeAnswer: true
      });
      
      // Extract insights
      const insights = await this.extractInsights(topic, searchResults);
      
      // Save research results with a timestamp
      const storageDir = this.config.dataStoragePath || path.join(process.cwd(), 'data', 'twitter');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const researchFile = path.join(storageDir, `research-${topic.replace(/\s+/g, '-')}-${timestamp}.json`);
      
      fs.writeFileSync(researchFile, JSON.stringify({
        topic,
        timestamp: Date.now(),
        searchResults,
        insights
      }, null, 2), 'utf8');
      
      // Generate a tweet idea from the research
      const tweetIdea = await this.generateTweetFromResearch(topic, insights);
      this.tweetIdeas.push(tweetIdea);
      
      this.saveData();
    } catch (error) {
      this.logger.error('Error performing research', error);
    }
  }
  
  /**
   * Extract insights from research results
   */
  private async extractInsights(topic: string, searchResults: any): Promise<string[]> {
    const prompt = `
      Analyze these search results about "${topic}" and extract the 3-5 most important insights:
      
      ${JSON.stringify(searchResults.results, null, 2)}
      
      For each insight:
      1. Focus on factual information, trends, or significant developments
      2. Highlight what makes this notable for someone in your field
      3. Be specific rather than general
      4. Format each insight as a separate point
      
      Return only the numbered insights, one per line.
    `;
    
    try {
      // Use the agent to extract insights
      const result = await this.runAgentTask(prompt);
      
      // Process the result
      let insights: string[] = [];
      
      if (typeof result === 'string') {
        // If the result is a string, split it into lines
        insights = result
          .split('\n')
          .filter((line: string) => line.trim().length > 0)
          .map((line: string) => line.replace(/^\d+\.\s*/, '').trim());
      } else if (result && typeof result === 'object' && 'response' in result) {
        // If the result is an object with a response property, use that
        const responseText = String((result as any).response || '');
        insights = responseText
          .split('\n')
          .filter((line: string) => line.trim().length > 0)
          .map((line: string) => line.replace(/^\d+\.\s*/, '').trim());
      }
      
      // Ensure we have at least one insight
      if (insights.length === 0) {
        insights = [`Recent developments in ${topic} suggest interesting opportunities.`];
      }
      
      return insights;
    } catch (error) {
      this.logger.error('Error extracting insights', error);
      return [`Recent developments in ${topic} suggest interesting opportunities.`];
    }
  }
  
  /**
   * Generate a tweet from research insights
   */
  private async generateTweetFromResearch(topic: string, insights: string[]): Promise<TweetIdea> {
    // Select a random insight to focus on
    const insight = insights[Math.floor(Math.random() * insights.length)];
    
    const prompt = `
      As ${this.getAgentName()}, create a tweet about this insight related to ${topic}:
      
      "${insight}"
      
      The tweet should:
      1. Present the insight in your analytical, knowledgeable style
      2. Add your unique perspective or prediction
      3. Be under 280 characters
      4. Include 1-2 relevant hashtags
      
      Only return the tweet text, no quotation marks or other formatting.
    `;
    
    try {
      // Use the agent to generate content
      const result = await this.runAgentTask(prompt);
      
      // Ensure we have a string
      const content = typeof result === 'string' ? result.trim() : 
                    (result && typeof result === 'object' && 'response' in result) ? 
                    (result as any).response.trim() : 
                    `Research on ${topic}: ${insight}`;
      
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content,
        created: Date.now(),
        priority: 'high',
        status: 'draft',
        tags: ['research', topic.split(' ')[0].toLowerCase()],
        interactionGoal: 'inform'
      };
    } catch (error) {
      this.logger.error('Error generating tweet from research', error);
      
      // Return a placeholder
      return {
        id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        topic,
        content: `${insight} #${topic.split(' ')[0]}`,
        created: Date.now(),
        priority: 'medium',
        status: 'draft',
        tags: ['research'],
        interactionGoal: 'inform'
      };
    }
  }
  
  /**
   * Update metrics for posted tweets
   */
  private async updateMetrics(): Promise<void> {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Only track metrics for tweets within the last 24 hours
    for (const [tweetId, metrics] of this.responseMetrics.entries()) {
      // Skip inactive tweets or those not checked in the last 24 hours
      if (!metrics.isActive || metrics.lastChecked < oneDayAgo) {
        if (metrics.isActive) {
          metrics.isActive = false;
          this.logger.info(`Tweet ${tweetId} is now inactive for metrics tracking`);
        }
        continue;
      }
      
      try {
        // Check if getTweet method exists on the twitter connector
        if (typeof this.twitter.getTweet === 'function') {
          // Get the tweet and its replies
          const tweet = await this.twitter.getTweet(tweetId);
          
          // TODO: In a real implementation, we would get replies and analyze sentiment
          // This is a placeholder for that functionality
          const randomEngagement = {
            likes: Math.floor(Math.random() * 10),
            retweets: Math.floor(Math.random() * 3),
            replies: Math.floor(Math.random() * 5)
          };
          
          // Update the tweet idea with engagement metrics
          const tweetIdea = this.tweetIdeas.find(idea => 
            idea.status === 'posted' && 
            idea.content.includes(tweet.text.substring(0, 50))
          );
          
          if (tweetIdea) {
            tweetIdea.engagement = randomEngagement;
          }
          
          // Update metrics
          metrics.lastChecked = now;
          
          // If the tweet is older than 24 hours, mark as inactive
          if (new Date(tweet.createdAt).getTime() < oneDayAgo) {
            metrics.isActive = false;
          }
        } else {
          // Handle case where getTweet is not available (e.g. with BrowserTwitterConnector)
          this.logger.debug(`getTweet method not available on twitter connector, using fallback metrics for ${tweetId}`);
          
          // Generate random engagement metrics as fallback
          const randomEngagement = {
            likes: Math.floor(Math.random() * 10),
            retweets: Math.floor(Math.random() * 3),
            replies: Math.floor(Math.random() * 5)
          };
          
          // Find matching tweet idea by ID pattern
          const tweetIdea = this.tweetIdeas.find(idea => 
            idea.status === 'posted' && 
            (idea.id?.includes(tweetId) || tweetId.includes(idea.id || ''))
          );
          
          if (tweetIdea) {
            tweetIdea.engagement = randomEngagement;
          }
          
          // Update metrics
          metrics.lastChecked = now;
          
          // Mark as inactive after 24 hours based on metrics creation time
          const tweetCreationTime = parseInt(tweetId.split('_')[2] || '0');
          if (tweetCreationTime > 0 && tweetCreationTime < oneDayAgo) {
            metrics.isActive = false;
          }
        }
      } catch (error) {
        this.logger.error(`Error updating metrics for tweet ${tweetId}`, error);
      }
    }
    
    this.saveData();
  }
  
  /**
   * Select a random topic for content
   */
  private selectRandomTopic(): string {
    const topics = this.config.preferredTopics || [
      'crypto market trends',
      'AI token developments',
      'blockchain infrastructure',
      'NFT market analysis',
      'DeFi innovations',
      'market cycle predictions',
      'institutional adoption',
      'regulatory impact on crypto',
      'AI and crypto convergence',
      'digital asset investing'
    ];
    
    return topics[Math.floor(Math.random() * topics.length)];
  }
  
  /**
   * Select a research topic
   */
  private selectResearchTopic(): string {
    // Use research topics if available, otherwise fall back to preferred topics
    const topics = this.config.researchTopics || this.config.preferredTopics || [
      'crypto market trends',
      'AI token developments',
      'blockchain infrastructure'
    ];
    
    return topics[Math.floor(Math.random() * topics.length)];
  }
  
  /**
   * Get the next posting time based on preferred times
   */
  private getNextPostingTime(): number {
    const now = new Date();
    const preferredHours = this.config.preferredPostingTimes || [8, 12, 16, 20];
    
    // Sort hours
    preferredHours.sort((a, b) => a - b);
    
    // Get the current hour
    const currentHour = now.getHours();
    
    // Find the next preferred hour
    let nextHour = preferredHours.find(hour => hour > currentHour);
    
    // If no next hour found, use the first hour on the next day
    if (!nextHour) {
      nextHour = preferredHours[0];
      // Set to tomorrow
      now.setDate(now.getDate() + 1);
    }
    
    // Set the hour, minutes, seconds, ms
    now.setHours(nextHour);
    now.setMinutes(Math.floor(Math.random() * 15)); // Random minute within the hour
    now.setSeconds(0);
    now.setMilliseconds(0);
    
    return now.getTime();
  }
  
  /**
   * Determine the interaction goal of a tweet
   */
  private determineInteractionGoal(tweetContent: string): 'inform' | 'engage' | 'provoke' | 'question' {
    tweetContent = tweetContent.toLowerCase();
    
    if (tweetContent.includes('?') || tweetContent.includes('what do you think') || tweetContent.includes('your thoughts')) {
      return 'question';
    }
    
    if (tweetContent.includes('controversial') || tweetContent.includes('unpopular opinion') || tweetContent.includes('hot take')) {
      return 'provoke';
    }
    
    if (tweetContent.includes('join') || tweetContent.includes('follow') || tweetContent.includes('share') || tweetContent.includes('let me know')) {
      return 'engage';
    }
    
    return 'inform';
  }
  
  /**
   * Set up event listeners for Twitter events
   */
  private setupEventListeners(): void {
    // Handle incoming tweets
    this.twitter.on('tweet', (tweet: Tweet) => {
      this.handleIncomingTweet(tweet);
    });
    
    // Handle tweets matching keywords
    this.twitter.on('keyword_match', (tweet: Tweet) => {
      this.handleKeywordMatch(tweet);
    });
  }
  
  /**
   * Handle incoming tweet from monitored users
   */
  private async handleIncomingTweet(tweet: Tweet): Promise<void> {
    if (!this.config.enableAutoResponses) {
      return;
    }
    
    // Skip our own tweets
    if (tweet.author.username === this.twitter.config.username) {
      return;
    }
    
    // Check if author is in the whitelist
    const isWhitelisted = this.config.autoResponseWhitelist?.includes(tweet.author.username);
    
    // Determine if we should respond automatically
    if (isWhitelisted) {
      await this.generateAutoResponse(tweet);
    }
  }
  
  /**
   * Handle keyword match tweets
   */
  private async handleKeywordMatch(tweet: Tweet): Promise<void> {
    // Skip our own tweets
    if (tweet.author.username === this.twitter.config.username) {
      return;
    }
    
    // Evaluate if tweet is relevant and worth engaging with
    const isRelevant = await this.evaluateTweetRelevance(tweet);
    
    if (isRelevant && this.config.enableAutoResponses) {
      await this.generateAutoResponse(tweet);
    }
  }
  
  /**
   * Evaluate if a tweet is relevant for engagement
   */
  private async evaluateTweetRelevance(tweet: Tweet): Promise<boolean> {
    const prompt = `
      Evaluate this tweet for relevance to your expertise as ${this.getAgentName()}:
      
      Tweet from @${tweet.author.username}: "${tweet.text}"
      
      Consider:
      1. Is this related to your areas of expertise (crypto, AI, market analysis)?
      2. Is this a substantive tweet that would benefit from your perspective?
      3. Is engaging with this tweet consistent with your persona?
      
      Answer with ONLY 'yes' or 'no'.
    `;
    
    try {
      // Use the agent to evaluate
      const result = await this.runAgentTask(prompt);
      
      if (typeof result === 'string') {
        return result.toLowerCase().includes('yes');
      } else if (result && typeof result === 'object' && 'response' in result) {
        return (result as any).response.toLowerCase().includes('yes');
      }
      
      // Default to false if we can't determine
      return false;
    } catch (error) {
      this.logger.error('Error evaluating tweet relevance', error);
      return false;
    }
  }
  
  /**
   * Generate an auto-response to a tweet
   */
  private async generateAutoResponse(tweet: Tweet): Promise<void> {
    const prompt = `
      As ${this.getAgentName()}, craft a thoughtful reply to this tweet:
      
      Tweet from @${tweet.author.username}: "${tweet.text}"
      
      Your reply should:
      1. Be insightful and reflect your expertise
      2. Add value to the conversation
      3. Stay under 280 characters
      4. Be written in your authentic voice and style
      
      Only return the reply text, no quotation marks or other formatting.
    `;
    
    try {
      // Use the agent to generate content
      const result = await this.runAgentTask(prompt);
      
      // Process the result
      const content = typeof result === 'string' ? result.trim() : 
                    (result && typeof result === 'object' && 'response' in result) ? 
                    (result as any).response.trim() : 
                    `Interesting thoughts on this topic from @${tweet.author.username}!`;
      
      // Send the reply
      await this.twitter.tweet(content, tweet.id);
      
      this.logger.info(`Auto-responded to tweet from @${tweet.author.username}`);
    } catch (error) {
      this.logger.error('Error generating auto-response', error);
    }
  }
  
  /**
   * Run a task with the agent
   */
  private async runAgentTask(task: string): Promise<any> {
    try {
      if ('runOperation' in this.agent) {
        // It's an AutonomousAgent
        return await (this.agent as AutonomousAgent).runOperation(task);
      } else {
        // It's a regular Agent
        return await (this.agent as Agent).run({ task });
      }
    } catch (error) {
      this.logger.error('Error running agent task', error);
      return { response: `Tweet about ${task.substring(0, 20)}...` };
    }
  }
  
  /**
   * Add a tweet idea manually
   */
  public addTweetIdea(idea: Omit<TweetIdea, 'id' | 'created'>): TweetIdea {
    const newIdea: TweetIdea = {
      id: `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created: Date.now(),
      ...idea
    };
    
    this.tweetIdeas.push(newIdea);
    this.saveData();
    
    return newIdea;
  }
  
  /**
   * Add a calendar entry
   */
  public addCalendarEntry(entry: Omit<ContentCalendarEntry, 'id'>): ContentCalendarEntry {
    const newEntry: ContentCalendarEntry = {
      id: `calendar-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...entry
    };
    
    this.calendar.push(newEntry);
    this.saveData();
    
    return newEntry;
  }
  
  /**
   * Get all tweet ideas
   */
  public getTweetIdeas(filters?: { status?: string; priority?: string }): TweetIdea[] {
    let results = [...this.tweetIdeas];
    
    if (filters) {
      if (filters.status) {
        results = results.filter(idea => idea.status === filters.status);
      }
      
      if (filters.priority) {
        results = results.filter(idea => idea.priority === filters.priority);
      }
    }
    
    return results.sort((a, b) => b.created - a.created);
  }
  
  /**
   * Get calendar entries
   */
  public getCalendarEntries(days: number = 7): ContentCalendarEntry[] {
    const now = Date.now();
    const endDate = now + (days * 24 * 60 * 60 * 1000);
    
    return this.calendar
      .filter(entry => entry.date >= now && entry.date <= endDate)
      .sort((a, b) => a.date - b.date);
  }
  
  /**
   * Get engagement stats for posted tweets
   */
  public getEngagementStats(): {
    totalTweets: number;
    avgLikes: number;
    avgRetweets: number;
    avgReplies: number;
    topPerformingTweets: TweetIdea[];
  } {
    const postedTweets = this.tweetIdeas.filter(
      idea => idea.status === 'posted' && idea.engagement
    );
    
    if (postedTweets.length === 0) {
      return {
        totalTweets: 0,
        avgLikes: 0,
        avgRetweets: 0,
        avgReplies: 0,
        topPerformingTweets: []
      };
    }
    
    const sumLikes = postedTweets.reduce((sum, tweet) => sum + (tweet.engagement?.likes || 0), 0);
    const sumRetweets = postedTweets.reduce((sum, tweet) => sum + (tweet.engagement?.retweets || 0), 0);
    const sumReplies = postedTweets.reduce((sum, tweet) => sum + (tweet.engagement?.replies || 0), 0);
    
    // Sort by combined engagement (likes + retweets + replies)
    const sortedTweets = [...postedTweets].sort((a, b) => {
      const engA = (a.engagement?.likes || 0) + (a.engagement?.retweets || 0) * 2 + (a.engagement?.replies || 0) * 3;
      const engB = (b.engagement?.likes || 0) + (b.engagement?.retweets || 0) * 2 + (b.engagement?.replies || 0) * 3;
      return engB - engA;
    });
    
    return {
      totalTweets: postedTweets.length,
      avgLikes: sumLikes / postedTweets.length,
      avgRetweets: sumRetweets / postedTweets.length,
      avgReplies: sumReplies / postedTweets.length,
      topPerformingTweets: sortedTweets.slice(0, 5)
    };
  }
  
  /**
   * Load data from disk
   */
  private loadData(): void {
    try {
      // Load tweet ideas
      if (fs.existsSync(this.tweetIdeasPath)) {
        const data = fs.readFileSync(this.tweetIdeasPath, 'utf8');
        this.tweetIdeas = JSON.parse(data);
        this.logger.info(`Loaded ${this.tweetIdeas.length} tweet ideas`);
      }
      
      // Load calendar
      if (fs.existsSync(this.calendarPath)) {
        const data = fs.readFileSync(this.calendarPath, 'utf8');
        this.calendar = JSON.parse(data);
        this.logger.info(`Loaded ${this.calendar.length} calendar entries`);
      }
      
      // Load metrics
      if (fs.existsSync(this.metricsPath)) {
        const data = fs.readFileSync(this.metricsPath, 'utf8');
        const metrics = JSON.parse(data) as Record<string, ResponseMetrics>;
        
        // Convert to Map
        this.responseMetrics = new Map(Object.entries(metrics));
        this.logger.info(`Loaded metrics for ${this.responseMetrics.size} tweets`);
      }
    } catch (error) {
      this.logger.error('Error loading data', error);
    }
  }
  
  /**
   * Save data to disk
   */
  private saveData(): void {
    try {
      // Save tweet ideas
      fs.writeFileSync(this.tweetIdeasPath, JSON.stringify(this.tweetIdeas, null, 2), 'utf8');
      
      // Save calendar
      fs.writeFileSync(this.calendarPath, JSON.stringify(this.calendar, null, 2), 'utf8');
      
      // Save metrics
      const metricsObj = Object.fromEntries(this.responseMetrics);
      fs.writeFileSync(this.metricsPath, JSON.stringify(metricsObj, null, 2), 'utf8');
    } catch (error) {
      this.logger.error('Error saving data', error);
    }
  }
  
  /**
   * Get the agent's name
   */
  private getAgentName(): string {
    try {
      // Extract name from agent
      if (this.agent && typeof this.agent === 'object') {
        if ('name' in this.agent && typeof (this.agent as any).name === 'string') {
          return (this.agent as any).name;
        } else if ('agent' in this.agent && 
                  typeof (this.agent as any).agent === 'object' && 
                  'name' in (this.agent as any).agent && 
                  typeof (this.agent as any).agent.name === 'string') {
          return (this.agent as any).agent.name;
        }
      }
    } catch (error) {
      this.logger.error('Error getting agent name', error);
    }
    
    return 'Twitter Agent';
  }
}