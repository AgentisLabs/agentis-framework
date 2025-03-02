import { EventEmitter } from 'events';
import { Agent } from '../core/agent';
import { AgentSwarm } from '../core/agent-swarm';
import { Logger } from '../utils/logger';
import puppeteer, { Browser, Page } from 'puppeteer';

/**
 * Configuration for the Twitter connector
 */
export interface BrowserTwitterConnectorConfig {
  // Authentication
  username?: string;
  password?: string;
  email?: string;
  
  // Monitoring options
  monitorKeywords?: string[];
  monitorUsers?: string[];
  autoReply?: boolean;
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval?: number;
  
  // Browser options
  headless?: boolean; // Whether to run browser in headless mode (default: true)
  debug?: boolean; // Enable additional debugging
}

/**
 * Internal Tweet interface
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
 * Enhanced interface for interaction events (mentions, replies, etc.)
 */
export interface TwitterInteraction {
  id: string;               // Tweet ID 
  text: string;             // Tweet content
  author: string;           // Author display name
  username: string;         // Author username
  type: 'mention' | 'reply' | 'keyword'; // Type of interaction
  originalTweetId?: string; // Original tweet ID (for replies)
  timestamp: string;        // When the interaction occurred
  keywords?: string[];      // Matching keywords (for keyword matches)
}

/**
 * Browser-based Twitter connector to integrate agents with Twitter
 * Uses direct browser automation without relying on Twitter API
 */
export class BrowserTwitterConnector extends EventEmitter {
  public config: BrowserTwitterConnectorConfig;
  private agent?: Agent;
  private swarm?: AgentSwarm;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private connected = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private logger: Logger;
  
  // Track tweets we've already processed to avoid duplicates
  private processedTweets: Set<string> = new Set();
  
  // Keywords to monitor
  private monitorKeywords: string[] = [];

  /**
   * Creates a new Browser Twitter connector
   * 
   * @param config - Configuration options
   */
  constructor(config: BrowserTwitterConnectorConfig) {
    super();
    this.config = {
      ...config,
      pollInterval: config.pollInterval || 60000, // Default: 1 minute
      headless: config.headless !== false, // Default to true unless explicitly set to false
    };
    this.logger = new Logger('BrowserTwitterConnector');
    
    // Initialize monitor keywords from config
    this.monitorKeywords = config.monitorKeywords || [
      'ai',
      'machine learning',
      'crypto',
      'agents',
      'claude',
      'anthropic'
    ];
  }

  /**
   * Connects to Twitter with browser automation
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
      // Extract credentials
      const { username, password, email } = this.config;
      
      if (!username || !password) {
        throw new Error('Twitter username and password are required');
      }
      
      // Initialize browser
      this.logger.info('Initializing browser for Twitter operations');
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        defaultViewport: null,
        args: ['--window-size=1280,800', '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
      });
      
      // Create page and set viewport
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
      
      // Set user-agent to look like a real browser
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      
      // Login to Twitter
      this.logger.info('Logging in to Twitter');
      await this.browserLogin(username, password, email || '');
      
      this.connected = true;
      this.logger.info('Connected to Twitter successfully');
      
      // Set up monitoring if configured
      if (this.config.monitorKeywords?.length || this.config.monitorUsers?.length) {
        this.setupMonitoring();
      }
    } catch (error) {
      this.logger.error('Failed to connect to Twitter', error);
      
      // Clean up browser if initialization failed
      if (this.browser) {
        await this.browser.close().catch((e: Error) => this.logger.error('Error closing browser', e));
        this.browser = null;
        this.page = null;
      }
      
      throw error;
    }
  }
  
  /**
   * Logs in to Twitter using browser automation
   * 
   * @param username - Twitter username
   * @param password - Twitter password
   * @param email - Optional email for verification
   */
  private async browserLogin(username: string, password: string, email: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Navigate to Twitter login page
      this.logger.debug('Navigating to Twitter login');
      await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
      
      // Wait for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot if debugging
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-login.png' });
      }
      
      // Enter username
      this.logger.debug('Entering username');
      await this.page.waitForSelector('input[autocomplete="username"]');
      await this.page.type('input[autocomplete="username"]', username);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Click Next button
      this.logger.debug('Clicking Next button');
      const nextButtons = await this.page.$$('[role="button"]');
      let nextClicked = false;
      
      for (const button of nextButtons) {
        try {
          const text = await this.page.evaluate(el => el.textContent, button);
          if (text && text.includes('Next')) {
            await button.click();
            this.logger.debug('Clicked Next button');
            nextClicked = true;
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      if (!nextClicked) {
        this.logger.warn('Could not find Next button, trying to press Enter');
        await this.page.keyboard.press('Enter');
      }
      
      // Wait for page to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if we need additional verification
      const verifyInput = await this.page.$('input[data-testid="ocfEnterTextTextInput"]');
      if (verifyInput) {
        this.logger.debug('Email verification needed');
        
        if (!email) {
          throw new Error('Email verification required but no email provided');
        }
        
        // Enter email
        await verifyInput.type(email);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Click Next for verification
        const verifyNextButtons = await this.page.$$('[role="button"]');
        let verifyNextClicked = false;
        
        for (const button of verifyNextButtons) {
          try {
            const text = await this.page.evaluate(el => el.textContent, button);
            if (text && text.includes('Next')) {
              await button.click();
              this.logger.debug('Clicked verification Next button');
              verifyNextClicked = true;
              break;
            }
          } catch (err) {
            continue;
          }
        }
        
        if (!verifyNextClicked) {
          this.logger.warn('Could not find verification Next button, trying to press Enter');
          await this.page.keyboard.press('Enter');
        }
        
        // Wait for page to process
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Enter password
      this.logger.debug('Entering password');
      await this.page.waitForSelector('input[name="password"]');
      await this.page.type('input[name="password"]', password);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Click Log in button
      this.logger.debug('Clicking Log in button');
      const loginButtons = await this.page.$$('[role="button"]');
      let loginClicked = false;
      
      for (const button of loginButtons) {
        try {
          const text = await this.page.evaluate(el => el.textContent, button);
          if (text && (text.includes('Log in') || text.includes('Sign in'))) {
            await button.click();
            this.logger.debug('Clicked Log in button');
            loginClicked = true;
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      if (!loginClicked) {
        this.logger.warn('Could not find Log in button, trying to press Enter');
        await this.page.keyboard.press('Enter');
      }
      
      // Wait for navigation to home page
      this.logger.debug('Waiting for login completion');
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      // Take screenshot after login
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-logged-in.png' });
      }
      
      // Verify login by checking for home timeline elements
      const successIndicators = [
        '[data-testid="primaryColumn"]',
        '[aria-label="Home timeline"]',
        '[aria-label="Timeline: Home"]',
        '[data-testid="SideNav_NewTweet_Button"]'
      ];
      
      let loginSuccessful = false;
      for (const selector of successIndicators) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            loginSuccessful = true;
            this.logger.debug(`Login successful, found element: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!loginSuccessful) {
        this.logger.warn('Could not verify successful login by finding timeline elements');
        // Check if we're still on a login-related page
        const currentUrl = this.page.url();
        if (currentUrl.includes('login') || currentUrl.includes('signin')) {
          throw new Error('Login failed - still on login page');
        } else {
          this.logger.info('Proceeding anyway as we navigated away from login page');
        }
      }
      
      // Navigate to home to ensure we're on the right page
      await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      this.logger.info('Successfully logged in to Twitter');
    } catch (error) {
      this.logger.error('Error during Twitter login', error);
      // Take screenshot of error state
      if (this.page && this.config.debug) {
        await this.page.screenshot({ path: 'twitter-login-error.png' });
      }
      throw new Error(`Twitter login failed: ${error instanceof Error ? error.message : String(error)}`);
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
      
      // Close browser if open
      if (this.browser) {
        this.logger.debug('Closing browser');
        await this.browser.close().catch((e: Error) => this.logger.error('Error closing browser', e));
        this.browser = null;
        this.page = null;
      }
      
      this.connected = false;
      this.logger.info('Disconnected from Twitter');
    } catch (error) {
      this.logger.error('Failed to disconnect from Twitter', error);
      throw error;
    }
  }
  
  /**
   * Posts a tweet to Twitter using browser automation
   * 
   * @param content - The content of the tweet
   * @param replyToId - Optional tweet ID to reply to
   * @returns Promise resolving to a tweet ID or confirmation string
   */
  async tweet(content: string, replyToId?: string): Promise<string> {
    if (!this.connected || !this.page || !this.browser) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Posting tweet', { 
      content: content.substring(0, 30) + (content.length > 30 ? '...' : ''),
      replyToId
    });
    
    try {
      // Default tweet ID response when we can't get the actual ID
      let tweetId = `tweet_posted_${Date.now()}`;
      
      // Handle reply differently
      if (replyToId) {
        await this.postReplyWithBrowser(content, replyToId);
        this.logger.info('Reply posted successfully');
        return `reply_to_${replyToId}_posted`;
      }
      
      // Post a new tweet
      await this.postTweetWithBrowser(content);
      this.logger.info('Tweet posted successfully');
      
      // Take success screenshot
      if (this.config.debug && this.page) {
        await this.page.screenshot({ path: 'twitter-tweet-success.png' });
      }
      
      return tweetId;
    } catch (error) {
      this.logger.error('Error posting tweet', error);
      if (this.page && this.config.debug) {
        await this.page.screenshot({ path: 'twitter-tweet-error.png' });
      }
      throw error;
    }
  }

  /**
   * Posts a tweet using browser automation
   * 
   * @param content - The content of the tweet
   */
  private async postTweetWithBrowser(content: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    this.logger.debug('Posting new tweet using browser automation');
    
    try {
      // Navigate to home page
      await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      
      // Wait for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take screenshot to see current page
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-home-before-tweet.png' });
      }
      
      // First try to find and click the compose button if needed
      const composeSelectors = [
        '[data-testid="SideNav_NewTweet_Button"]',
        '[aria-label="Tweet"]',
        '[aria-label="Post"]',
        'a[href="/compose/tweet"]'
      ];
      
      let composeClicked = false;
      for (const selector of composeSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            this.logger.debug(`Found compose button with selector: ${selector}`);
            await button.click();
            this.logger.debug('Clicked compose button');
            await new Promise(resolve => setTimeout(resolve, 1500));
            composeClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Selector ${selector} not found or could not be clicked`);
        }
      }
      
      // Try multiple selectors for the tweet textarea
      const textareaSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[aria-label="Tweet text"]',
        '[aria-label="Post text"]',
        '[role="textbox"]'
      ];
      
      let composerFound = false;
      let textareaElement = null;
      
      for (const selector of textareaSelectors) {
        try {
          this.logger.debug(`Looking for text area with selector: ${selector}`);
          textareaElement = await this.page.$(selector);
          if (textareaElement) {
            this.logger.debug(`Found text area with selector: ${selector}`);
            await textareaElement.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await textareaElement.type(content);
            // Add a delay after typing to ensure the tweet button becomes enabled
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.logger.debug('Entered tweet content');
            composerFound = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Could not use selector ${selector}`, e);
        }
      }
      
      // If we couldn't find the tweet textarea, try looking for "What's happening?"
      if (!composerFound) {
        this.logger.debug('Looking for "What\'s happening?" text');
        
        try {
          // Get all div elements
          const divs = await this.page.$$('div');
          
          // Look for one containing "What's happening?"
          for (const div of divs) {
            const text = await this.page.evaluate(el => el.textContent, div);
            
            if (text && (
                text.includes("What's happening?") || 
                text.includes("What is happening?") ||
                text.includes("What's on your mind?")
              )) {
              this.logger.debug('Found "What\'s happening?" text, clicking it');
              await div.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Type directly with keyboard
              await this.page.keyboard.type(content);
              // Add a delay after typing to ensure the tweet button becomes enabled
              await new Promise(resolve => setTimeout(resolve, 2000));
              this.logger.debug('Entered tweet content via keyboard');
              composerFound = true;
              break;
            }
          }
        } catch (e) {
          this.logger.debug('Error looking for "What\'s happening?" text', e);
        }
      }
      
      // If we still couldn't find the composer, try direct navigation
      if (!composerFound) {
        this.logger.debug('Trying direct navigation to compose page');
        await this.page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Take a screenshot of the compose page
        if (this.config.debug) {
          await this.page.screenshot({ path: 'twitter-compose-direct.png' });
        }
        
        // Try again with the text area selectors
        for (const selector of textareaSelectors) {
          try {
            textareaElement = await this.page.$(selector);
            if (textareaElement) {
              this.logger.debug(`Found text area with selector: ${selector}`);
              await textareaElement.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              await textareaElement.type(content);
              this.logger.debug('Entered tweet content after direct navigation');
              composerFound = true;
              break;
            }
          } catch (e) {
            this.logger.debug(`Could not use selector ${selector} after direct navigation`, e);
          }
        }
      }
      
      // If we still couldn't find the composer, give up
      if (!composerFound) {
        // Take screenshot to debug
        if (this.config.debug) {
          await this.page.screenshot({ path: 'twitter-composer-not-found.png' });
        }
        throw new Error('Could not find or use the tweet composer');
      }
      
      // Take screenshot of the composed tweet
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-composed-tweet.png' });
      }
      
      // Now find and click the tweet/post button
      const tweetButtonSelectors = [
        '[data-testid="tweetButtonInline"]',
        'div[data-testid="tweetButton"]',
        'button[data-testid="tweetButton"]',
        '[aria-label="Tweet"]',
        '[aria-label="Post"]',
        'div[role="button"]:has-text("Tweet")',
        'div[role="button"]:has-text("Post")',
        'button:enabled:has-text("Post")',
        'button:enabled:has-text("Tweet")'
      ];
      
      let tweetButtonClicked = false;
      
      // First try with specific selectors
      for (const selector of tweetButtonSelectors) {
        try {
          this.logger.debug(`Looking for tweet button with selector: ${selector}`);
          const button = await this.page.$(selector);
          
          if (button) {
            this.logger.debug(`Found tweet button with selector: ${selector}`);
            
            // Check if the button is disabled
            const isDisabled = await this.page.evaluate(el => {
              return el.getAttribute('aria-disabled') === 'true' || 
                    (el instanceof HTMLButtonElement && el.disabled === true) || 
                    el.classList.contains('disabled');
            }, button);
            
            if (isDisabled) {
              this.logger.debug('Tweet button is disabled, cannot click');
              continue;
            }
            
            // Click the button
            await button.click();
            this.logger.debug('Clicked tweet button');
            tweetButtonClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Error with tweet button selector ${selector}`, e);
        }
      }
      
      // If we couldn't find a specific tweet button, try looking for buttons with text
      if (!tweetButtonClicked) {
        this.logger.debug('Looking for any button with text "Tweet" or "Post"');
        
        try {
          // Get all buttons or elements that might be buttons
          const buttons = await this.page.$$('button, div[role="button"]');
          
          for (const button of buttons) {
            try {
              const text = await this.page.evaluate(el => el.textContent, button);
              
              if (text && (text.includes('Tweet') || text.includes('Post'))) {
                this.logger.debug(`Found button with text: ${text}`);
                
                // Check if the button is disabled
                const isDisabled = await this.page.evaluate(el => {
                  return el.getAttribute('aria-disabled') === 'true' || 
                        (el instanceof HTMLButtonElement && el.disabled === true) || 
                        el.classList.contains('disabled');
                }, button);
                
                if (isDisabled) {
                  this.logger.debug('Button is disabled, cannot click');
                  continue;
                }
                
                await button.click();
                this.logger.debug('Clicked button by text');
                tweetButtonClicked = true;
                break;
              }
            } catch (buttonError) {
              // Continue to next button
            }
          }
        } catch (e) {
          this.logger.debug('Error looking for buttons by text', e);
        }
      }
      
      // If we still couldn't click the tweet button, try one more approach - 
      // evaluate all buttons on the page and find one with "Tweet" or "Post" text
      if (!tweetButtonClicked) {
        this.logger.debug('Trying to find any button that looks like a tweet button');
        try {
          const tweetButtonFound = await this.page.evaluate(() => {
            // Look for any button-like element containing 'Tweet' or 'Post'
            const possibleButtons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
            
            for (const button of possibleButtons) {
              const text = button.textContent || '';
              const isDisabled = (button as HTMLElement).hasAttribute('disabled') || 
                               button.getAttribute('aria-disabled') === 'true' || 
                               button.classList.contains('disabled');
              
              if ((text.includes('Tweet') || text.includes('Post')) && !isDisabled) {
                // Click the button
                (button as HTMLElement).click();
                return true;
              }
            }
            return false;
          });
          
          if (tweetButtonFound) {
            this.logger.debug('Found and clicked tweet button via direct DOM evaluation');
            tweetButtonClicked = true;
          }
        } catch (e) {
          this.logger.debug('Error finding tweet button via direct DOM evaluation', e);
        }
      }
      
      // If we still couldn't click the tweet button, try pressing Enter key
      if (!tweetButtonClicked) {
        this.logger.debug('Could not find tweet button, trying Enter key');
        await this.page.keyboard.press('Enter');
        tweetButtonClicked = true;
      }
      
      // Wait for the tweet to be posted
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take a final screenshot
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-after-posting.png' });
      }
      
      this.logger.info('Tweet posting completed');
    } catch (error) {
      this.logger.error('Error posting tweet with browser', error);
      throw error;
    }
  }

  /**
   * Posts a reply to a tweet using browser automation
   * 
   * @param content - The content of the reply
   * @param tweetId - The ID of the tweet to reply to
   */
  private async postReplyWithBrowser(content: string, tweetId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    this.logger.debug(`Posting reply to tweet ${tweetId}`);
    
    try {
      // Navigate to the tweet page
      await this.page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take screenshot of tweet page
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-reply-page.png' });
      }
      
      // Find and click the reply button
      const replyButtonSelectors = [
        '[data-testid="reply"]',
        '[aria-label="Reply"]',
        'div[role="button"][data-testid="reply"]'
      ];
      
      let replyButtonClicked = false;
      
      for (const selector of replyButtonSelectors) {
        try {
          const replyButton = await this.page.$(selector);
          if (replyButton) {
            this.logger.debug(`Found reply button with selector: ${selector}`);
            await replyButton.click();
            this.logger.debug('Clicked reply button');
            await new Promise(resolve => setTimeout(resolve, 2000));
            replyButtonClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Reply button selector ${selector} not found or error`, e);
        }
      }
      
      if (!replyButtonClicked) {
        throw new Error('Could not find or click reply button');
      }
      
      // Find the reply text area and enter the content
      const textareaSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[aria-label="Tweet text"]',
        '[aria-label="Reply text"]',
        '[role="textbox"]'
      ];
      
      let textareaFound = false;
      
      for (const selector of textareaSelectors) {
        try {
          const textarea = await this.page.$(selector);
          if (textarea) {
            this.logger.debug(`Found reply textarea with selector: ${selector}`);
            await textarea.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await textarea.type(content);
            this.logger.debug('Entered reply content');
            textareaFound = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Reply textarea selector ${selector} not found or error`, e);
        }
      }
      
      if (!textareaFound) {
        // Try using keyboard directly
        this.logger.debug('Trying to enter reply text with keyboard');
        await this.page.keyboard.type(content);
        textareaFound = true;
      }
      
      if (!textareaFound) {
        throw new Error('Could not find or use reply textarea');
      }
      
      // Take screenshot of composed reply
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-reply-composed.png' });
      }
      
      // Find and click the reply/tweet button
      const replyTweetButtonSelectors = [
        '[data-testid="tweetButtonInline"]',
        '[data-testid="tweetButton"]',
        'div[role="button"]:has-text("Reply")',
        'div[role="button"]:has-text("Tweet")'
      ];
      
      let replyTweetButtonClicked = false;
      
      for (const selector of replyTweetButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            this.logger.debug(`Found reply tweet button with selector: ${selector}`);
            
            // Check if button is disabled
            const isDisabled = await this.page.evaluate(el => {
              return el.getAttribute('aria-disabled') === 'true' || 
                    (el instanceof HTMLButtonElement && el.disabled === true) || 
                    el.classList.contains('disabled');
            }, button);
            
            if (isDisabled) {
              this.logger.debug('Reply button is disabled, cannot click');
              continue;
            }
            
            await button.click();
            this.logger.debug('Clicked reply tweet button');
            replyTweetButtonClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Reply tweet button selector ${selector} not found or error`, e);
        }
      }
      
      // If no specific button found, look for any button with Reply/Tweet text
      if (!replyTweetButtonClicked) {
        this.logger.debug('Looking for any button with Reply/Tweet text');
        
        try {
          const buttons = await this.page.$$('button, div[role="button"]');
          
          for (const button of buttons) {
            try {
              const text = await this.page.evaluate(el => el.textContent, button);
              
              if (text && (text.includes('Reply') || text.includes('Tweet'))) {
                this.logger.debug(`Found button with text: ${text}`);
                await button.click();
                this.logger.debug('Clicked button by text');
                replyTweetButtonClicked = true;
                break;
              }
            } catch (buttonError) {
              // Continue to next button
            }
          }
        } catch (e) {
          this.logger.debug('Error looking for buttons by text', e);
        }
      }
      
      // If still couldn't click the button, try Enter key
      if (!replyTweetButtonClicked) {
        this.logger.debug('Could not find reply tweet button, trying Enter key');
        await this.page.keyboard.press('Enter');
        replyTweetButtonClicked = true;
      }
      
      // Wait for the reply to be posted
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take a final screenshot
      if (this.config.debug) {
        await this.page.screenshot({ path: 'twitter-after-reply.png' });
      }
      
      this.logger.info('Reply posting completed');
    } catch (error) {
      this.logger.error('Error posting reply with browser', error);
      throw error;
    }
  }

  /**
   * Sets up enhanced monitoring for tweets, mentions, and replies
   */
  private setupMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    const pollInterval = this.config.pollInterval || 60000;
    this.logger.info('Setting up tweet monitoring', { 
      keywords: this.monitorKeywords,
      users: this.config.monitorUsers,
      pollInterval
    });
    
    // Add username to monitored keywords if not already present
    if (this.config.username && !this.monitorKeywords.includes(this.config.username)) {
      this.monitorKeywords.push(this.config.username);
    }
    
    // Use monitorTimeline for the comprehensive monitoring approach
    this.monitorTimeline();
  }
  
  /**
   * Comprehensive monitoring of Twitter timeline, mentions, and replies
   */
  private monitorTimeline(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }

    this.monitorTimer = setInterval(async () => {
      try {
        if (!this.isLoggedIn || !this.page) {
          this.logger.warn('Cannot monitor Twitter - not logged in or browser closed');
          return;
        }

        // STEP 1: Check for mentions first
        await this.checkForMentions();
        
        // Short delay between checks
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // STEP 2: Check general timeline for keywords
        await this.checkGeneralTimeline();
        
        // STEP 3: Check for replies to our tweets (less frequently)
        // Only run this check every 3rd cycle to avoid too many navigation operations
        const now = Date.now();
        if (now % 3 === 0) {
          await this.safelyCheckForReplies();
        }
        
      } catch (error) {
        this.logger.error('Error monitoring Twitter interactions', error);
      }
    }, this.config.pollInterval || 60000);
  }
  
  /**
   * Safely check for replies with error handling and recovery
   */
  private async safelyCheckForReplies(): Promise<void> {
    try {
      await this.checkForReplies();
    } catch (error) {
      this.logger.error('Error checking replies, will retry next monitoring cycle', error);
      
      // Ensure we return to the home page to recover from any navigation issues
      try {
        await this.page!.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      } catch (navigationError) {
        this.logger.error('Failed to navigate back to home page after error', navigationError);
      }
    }
  }
  
  /**
   * Check for mentions of our account
   */
  private async checkForMentions(): Promise<void> {
    try {
      this.logger.debug('Checking for mentions...');
      
      // Navigate to mentions page
      await this.page!.goto('https://twitter.com/notifications/mentions', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get all mention tweet elements
      const mentions = await this.page!.$$('article[data-testid="tweet"]');
      this.logger.debug(`Found ${mentions.length} recent mentions`);
      
      // Process each mention
      for (let i = 0; i < Math.min(mentions.length, 5); i++) { // Process most recent 5 mentions
        const mention = mentions[i];
        
        // Extract tweet ID for checking if we've already processed this
        const tweetId = await mention.evaluate((el: HTMLElement) => {
          const articleLinks = Array.from(el.querySelectorAll('a[href*="/status/"]'));
          for (const link of articleLinks) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/\/status\/(\d+)/);
            if (match) return match[1];
          }
          return '';
        });
        
        // Skip if we've already processed this mention
        if (this.processedTweets.has(tweetId)) {
          continue;
        }
        
        // Extract tweet text and author
        const tweetText = await mention.$eval('[data-testid="tweetText"]', (el: Element) => el.textContent || '')
          .catch(() => '');
          
        const authorElement = await mention.$('div[data-testid="User-Name"]');
        const authorName = authorElement ? await authorElement.evaluate((el: Element) => el.textContent || '') : 'Unknown';
        
        // Get the username by extracting the handle from author text
        const usernameMatch = authorName.match(/@(\w+)/);
        const username = usernameMatch ? usernameMatch[1] : '';
        
        // Make sure it's not our own tweet
        if (username.toLowerCase() !== this.config.username?.toLowerCase()) {
          this.logger.info(`Found mention from @${username}: ${tweetText}`);
          
          // Add to processed list
          this.processedTweets.add(tweetId);
          
          // Emit mention event with detailed data
          this.emit('mention', {
            id: tweetId,
            text: tweetText,
            author: authorName,
            username: username,
            type: 'mention',
            timestamp: new Date().toISOString()
          });
          
          // Auto-reply if enabled
          if (this.config.autoReply && this.agent) {
            const replyText = await this.generateReply(tweetText, authorName, 'mention');
            if (replyText && tweetId) {
              await this.replyToTweet(tweetId, replyText);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking mentions', error);
    }
  }
  
  /**
   * Check for replies to our tweets (improved version)
   */
  private async checkForReplies(): Promise<void> {
    try {
      this.logger.debug('Checking for replies to our tweets...');
      
      // Navigate to our profile
      await this.page!.goto(`https://twitter.com/${this.config.username}`, { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Find our most recent tweets
      const myTweets = await this.page!.$$('article[data-testid="tweet"]');
      this.logger.debug(`Found ${myTweets.length} tweets on our profile`);
      
      // Process up to 3 most recent tweets
      for (let i = 0; i < Math.min(myTweets.length, 3); i++) {
        try {
          // Extract tweet ID directly without clicking
          const tweet = myTweets[i];
          if (!tweet) {
            this.logger.debug(`Tweet at index ${i} is undefined, skipping`);
            continue;
          }
          
          // Extract the tweet ID from its URL
          const tweetId = await tweet.evaluate((el: HTMLElement) => {
            const articleLinks = Array.from(el.querySelectorAll('a[href*="/status/"]'));
            for (const link of articleLinks) {
              const href = link.getAttribute('href') || '';
              const match = href.match(/\/status\/(\d+)/);
              if (match) return match[1];
            }
            return '';
          }).catch(e => {
            this.logger.error('Error extracting tweet ID', e);
            return '';
          });
          
          if (!tweetId) {
            this.logger.warn('Could not extract tweet ID from tweet element, skipping');
            continue;
          }
          
          this.logger.debug(`Processing tweet ID: ${tweetId}`);
          
          // Navigate directly to the tweet's page instead of clicking
          await this.page!.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Get all replies (these should be articles below the main tweet)
          const replies = await this.page!.$$('article[data-testid="tweet"]:not(:first-child)');
          this.logger.debug(`Found ${replies.length} possible replies to tweet ${tweetId}`);
          
          // Process up to 5 replies
          for (let j = 0; j < Math.min(replies.length, 5); j++) {
            try {
              const reply = replies[j];
              if (!reply) continue;
              
              // Extract reply ID
              const replyId = await reply.evaluate((el: HTMLElement) => {
                const articleLinks = Array.from(el.querySelectorAll('a[href*="/status/"]'));
                for (const link of articleLinks) {
                  const href = link.getAttribute('href') || '';
                  const match = href.match(/\/status\/(\d+)/);
                  if (match) return match[1];
                }
                return '';
              }).catch(() => '');
              
              // Skip if already processed or ID extraction failed
              if (!replyId || this.processedTweets.has(replyId)) {
                continue;
              }
              
              // Extract text
              let replyText = '';
              try {
                const textElement = await reply.$('[data-testid="tweetText"]');
                if (textElement) {
                  replyText = await textElement.evaluate(el => el.textContent || '');
                }
              } catch (textError) {
                this.logger.debug('Error extracting reply text', textError);
              }
              
              // Extract author
              let authorName = 'Unknown';
              let username = '';
              try {
                const authorElement = await reply.$('div[data-testid="User-Name"]');
                if (authorElement) {
                  authorName = await authorElement.evaluate(el => el.textContent || '');
                  const usernameMatch = authorName.match(/@(\w+)/);
                  username = usernameMatch ? usernameMatch[1] : '';
                }
              } catch (authorError) {
                this.logger.debug('Error extracting author', authorError);
              }
              
              // Skip if it's our own reply
              if (username.toLowerCase() === this.config.username?.toLowerCase()) {
                continue;
              }
              
              // Record and process the reply
              this.logger.info(`Found reply from @${username} to tweet ${tweetId}: ${replyText}`);
              
              // Add to processed list
              this.processedTweets.add(replyId);
              
              // Emit reply event
              this.emit('reply', {
                id: replyId,
                text: replyText,
                author: authorName,
                username: username,
                type: 'reply',
                originalTweetId: tweetId,
                timestamp: new Date().toISOString()
              });
              
              // Auto-reply if enabled
              if (this.config.autoReply && this.agent) {
                const responseText = await this.generateReply(replyText, authorName, 'reply', tweetId);
                if (responseText && replyId) {
                  await this.replyToTweet(replyId, responseText);
                }
              }
            } catch (replyError) {
              this.logger.error(`Error processing reply ${j} to tweet ${tweetId}`, replyError);
            }
          }
          
          // Return to profile before processing next tweet
          await this.page!.goto(`https://twitter.com/${this.config.username}`, { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (tweetError) {
          this.logger.error(`Error processing tweet at index ${i}`, tweetError);
          // Try to recover and continue with next tweet
          await this.page!.goto(`https://twitter.com/${this.config.username}`, { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      this.logger.error('Error checking replies', error);
      throw error; // Let the caller handle recovery
    }
  }
  
  /**
   * Check the general timeline for monitored keywords
   */
  private async checkGeneralTimeline(): Promise<void> {
    try {
      this.logger.debug('Checking general timeline for keywords...');
      
      // Navigate to home timeline
      await this.page!.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get all tweet elements
      const tweets = await this.page!.$$('article[data-testid="tweet"]');
      
      // Process each tweet to check for relevant content
      for (let i = 0; i < Math.min(tweets.length, 10); i++) { // Only check the first 10 to avoid processing too many
        const tweet = tweets[i];
        const tweetText = await tweet.$eval('[data-testid="tweetText"]', (el: Element) => el.textContent || '')
          .catch(() => ''); // Some tweets might not have text
        
        // Check if tweet contains any monitored keywords
        const hasKeyword = this.monitorKeywords.some(keyword => 
          tweetText.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (hasKeyword) {
          // Extract tweet ID, author and other metadata
          const tweetId = await tweet.evaluate((el: HTMLElement) => {
            const articleLinks = Array.from(el.querySelectorAll('a[href*="/status/"]'));
            for (const link of articleLinks) {
              const href = link.getAttribute('href') || '';
              const match = href.match(/\/status\/(\d+)/);
              if (match) return match[1];
            }
            return '';
          });
          
          // Skip if already processed
          if (this.processedTweets.has(tweetId)) {
            continue;
          }
          
          const authorName = await tweet.$eval('div[data-testid="User-Name"]', 
            (el: Element) => el.textContent || '').catch(() => 'Unknown');
            
          // Extract username
          const usernameMatch = authorName.match(/@(\w+)/);
          const username = usernameMatch ? usernameMatch[1] : '';
          
          // Skip if it's our own tweet
          if (username.toLowerCase() !== this.config.username?.toLowerCase()) {
            // Log the found tweet
            this.logger.info(`Found monitored keyword in tweet: ${tweetId} by ${authorName}`);
            
            // Add to processed tweets
            this.processedTweets.add(tweetId);
            
            // Emit event with tweet data
            this.emit('keyword', {
              id: tweetId,
              text: tweetText,
              author: authorName,
              username: username,
              type: 'keyword',
              timestamp: new Date().toISOString(),
              keywords: this.monitorKeywords.filter(keyword => 
                tweetText.toLowerCase().includes(keyword.toLowerCase())
              )
            });
            
            // Optionally, auto-reply if enabled
            if (this.config.autoReply && this.agent) {
              // Generate a reply using the agent
              const replyText = await this.generateReply(tweetText, authorName, 'keyword');
              
              // Reply to the tweet
              if (replyText && tweetId) {
                await this.replyToTweet(tweetId, replyText);
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking general timeline', error);
    }
  }
  
  /**
   * Generate a reply to a tweet using the agent
   * 
   * @param tweetText - The text of the tweet to reply to
   * @param authorName - The author of the tweet
   * @param interactionType - The type of interaction
   * @param originalTweetId - Optional original tweet ID for context
   * @returns Promise resolving to the reply text
   */
  private async generateReply(
    tweetText: string, 
    authorName: string, 
    interactionType: 'mention' | 'reply' | 'keyword' = 'keyword',
    originalTweetId?: string
  ): Promise<string> {
    try {
      if (!this.agent && !this.swarm) {
        this.logger.warn('No agent or swarm available to generate reply');
        return '';
      }
      
      // Determine context based on interaction type
      let contextPrefix = '';
      switch (interactionType) {
        case 'mention':
          contextPrefix = `This user has mentioned you in a tweet. `;
          break;
        case 'reply':
          contextPrefix = `This user has replied to your tweet. `;
          if (originalTweetId) {
            // Try to get the original tweet content for context
            try {
              const originalTweet = await this.getTweet(originalTweetId);
              contextPrefix += `Your original tweet was: "${originalTweet.text}" `;
            } catch (e) {
              // Continue without original tweet context
            }
          }
          break;
        case 'keyword':
          contextPrefix = `This tweet contains keywords you're monitoring. `;
          break;
      }
      
      // Create prompt for the agent
      const prompt = `
        ${contextPrefix}
        
        Tweet from ${authorName}: "${tweetText}"
        
        Please draft a helpful, engaging, and professional reply. 
        Keep your response under 240 characters as this is for Twitter.
        Be friendly but stay on-brand with your personality.
        Do not include hashtags in your reply.
        
        Only return the text of your reply, with no additional commentary.
      `;
      
      // Use the appropriate agent to generate the reply
      if (this.agent) {
        const response = await this.agent.run({ task: prompt });
        return response.response.trim();
      } else if (this.swarm) {
        // For swarm, just use the swarm itself
        const response = await this.swarm.run({ task: prompt });
        return response.response.trim();
      }
      
      return '';
    } catch (error) {
      this.logger.error('Error generating reply', error);
      return '';
    }
  }
  
  /**
   * Reply to a tweet (wrapper around postReplyWithBrowser)
   * 
   * @param tweetId - The ID of the tweet to reply to
   * @param replyText - The text of the reply
   */
  private async replyToTweet(tweetId: string, replyText: string): Promise<void> {
    try {
      await this.postReplyWithBrowser(replyText, tweetId);
      this.logger.info(`Posted reply to tweet ${tweetId}`);
    } catch (error) {
      this.logger.error(`Error posting reply to tweet ${tweetId}`, error);
    }
  }
  
  /**
   * Gets login status based on current browser state
   */
  private get isLoggedIn(): boolean {
    return this.connected && this.browser !== null && this.page !== null;
  }
  
  /**
   * Checks for tweets that match monitoring criteria (legacy method kept for compatibility)
   */
  private async checkForTweets(): Promise<void> {
    // This method is essentially replaced by monitorTimeline
    this.logger.debug('checkForTweets is deprecated, using enhanced monitoring instead');
    await this.checkGeneralTimeline();
  }
  
  /**
   * Likes a tweet (not fully implemented)
   * 
   * @param tweetId - The ID of the tweet to like
   */
  async like(tweetId: string): Promise<void> {
    this.logger.warn('Like functionality not fully implemented in browser-only version');
    // Would be implemented using browser automation to find and click the like button
  }
  
  /**
   * Retweets a tweet (not fully implemented)
   * 
   * @param tweetId - The ID of the tweet to retweet
   */
  async retweet(tweetId: string): Promise<void> {
    this.logger.warn('Retweet functionality not fully implemented in browser-only version');
    // Would be implemented using browser automation to find and click the retweet button
  }
  
  /**
   * Follows a user (not fully implemented)
   * 
   * @param username - The username of the user to follow
   */
  async follow(username: string): Promise<void> {
    this.logger.warn('Follow functionality not fully implemented in browser-only version');
    // Would be implemented using browser automation to navigate to the user's profile and click follow
  }
  
  /**
   * Gets a tweet by ID using browser automation
   * 
   * @param tweetId - The ID of the tweet to fetch
   * @returns Promise resolving to the tweet object
   */
  async getTweet(tweetId: string): Promise<Tweet> {
    if (!this.connected || !this.page || !this.browser) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug(`Fetching tweet with ID: ${tweetId}`);
    
    try {
      // For tweet IDs created by our own system
      if (tweetId.startsWith('tweet_posted_')) {
        // Extract timestamp from ID if possible
        const timestamp = parseInt(tweetId.split('_')[2] || '0');
        const createdAt = timestamp ? new Date(timestamp) : new Date();
        
        // Return a synthetic tweet object when we can't fetch the actual tweet
        return {
          id: tweetId,
          text: "This is a synthetic tweet object as the actual tweet couldn't be fetched",
          author: {
            username: this.config.username || 'unknown',
            name: this.config.username || 'Unknown User',
          },
          createdAt,
          isRetweet: false,
          isReply: false
        };
      }
      
      // For actual Twitter IDs, attempt to fetch the tweet
      // Note: This would require additional browser automation to visit the tweet page
      // and extract information from the page HTML
      
      // In a full implementation, we would navigate to the tweet URL and scrape the content
      const tweetUrl = `https://twitter.com/i/status/${tweetId}`;
      
      this.logger.debug(`Navigating to tweet URL: ${tweetUrl}`);
      
      // Navigate to the tweet page
      await this.page.goto(tweetUrl, { waitUntil: 'networkidle2' });
      // Use setTimeout instead of page.waitForTimeout which isn't available in all Puppeteer versions
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Extract tweet text - this selector might need adjustment based on Twitter's current DOM
      const tweetTextElement = await this.page.$('[data-testid="tweetText"]');
      let tweetText = '';
      
      if (tweetTextElement) {
        tweetText = await this.page.evaluate(el => el.textContent, tweetTextElement) || '';
      } else {
        this.logger.warn('Could not find tweet text element');
        // Try alternative selectors
        const articleElement = await this.page.$('article');
        if (articleElement) {
          tweetText = await this.page.evaluate(el => el.textContent, articleElement) || '';
          // Clean up the text to remove excess information
          tweetText = tweetText.replace(/\\s+/g, ' ').trim();
        }
      }
      
      // Extract author information
      const authorElement = await this.page.$('[data-testid="User-Name"]');
      let authorName = '';
      let authorUsername = '';
      
      if (authorElement) {
        const authorInfo = await this.page.evaluate(el => {
          // Try to find the author name and username elements
          const nameEl = el.querySelector('span');
          const usernameEl = el.querySelector('span:nth-child(2)');
          
          return {
            name: nameEl ? (nameEl.textContent || '') : '',
            username: usernameEl ? (usernameEl.textContent || '').replace('@', '') : ''
          };
        }, authorElement);
        
        authorName = authorInfo.name || '';
        authorUsername = authorInfo.username || '';
      } else {
        this.logger.warn('Could not find author element');
        // Default to configured username
        authorName = this.config.username || 'Unknown User';
        authorUsername = this.config.username || 'unknown';
      }
      
      // Extract timestamp (this is a simplified approach)
      const timestampElement = await this.page.$('time');
      let createdAt = new Date();
      
      if (timestampElement) {
        const datetimeAttr = await this.page.evaluate(el => el.getAttribute('datetime'), timestampElement);
        if (datetimeAttr) {
          createdAt = new Date(datetimeAttr);
        }
      }
      
      // Determine if it's a reply by checking for "Replying to" text
      const isReply = await this.page.evaluate(() => {
        return document.body.textContent?.includes('Replying to') || false;
      });
      
      return {
        id: tweetId,
        text: tweetText || 'Could not extract tweet text',
        author: {
          username: authorUsername,
          name: authorName,
        },
        createdAt,
        isReply,
        isRetweet: false, // Simplified - would need more logic to determine this accurately
      };
    } catch (error) {
      this.logger.error(`Error fetching tweet ${tweetId}`, error);
      
      // Return a fallback tweet object
      return {
        id: tweetId,
        text: "Could not fetch tweet content",
        author: {
          username: this.config.username || 'unknown',
          name: this.config.username || 'Unknown User',
        },
        createdAt: new Date(),
        isRetweet: false,
        isReply: false
      };
    }
  }
}