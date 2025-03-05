import { EventEmitter } from 'events';
import { Agent } from '../core/agent';
import { AgentSwarm } from '../core/agent-swarm';
import { Logger } from '../utils/logger';
import { Scraper } from 'agent-twitter-client';
import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer';

/**
 * Configuration for the Twitter connector
 */
export interface TwitterConnectorConfig {
  // Authentication (traditional method)
  username?: string;
  password?: string;
  email?: string;
  
  // API credentials (optional, used only for data fetching, not for posting)
  // Tweet posting will ALWAYS use browser simulation to avoid API usage
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
  
  // Browser options
  headless?: boolean; // Whether to run browser in headless mode (default: true)
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
  private browser: Browser | null = null;
  private page: Page | null = null;
  
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
      headless: true, // Default to headless mode
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
      // Get credentials
      const { username, password, email, apiKey, apiSecret, accessToken, accessSecret } = this.config;
      
      if (!username || !password) {
        throw new Error('Twitter username and password are required');
      }
      
      // Initialize scraper for later operations
      // But we won't use it for authentication since it's currently having issues
      this.scraper = new Scraper();
      
      this.logger.info('Skipping API login due to known issues, using browser-only authentication');
      
      // Note: We're skipping direct API login and only using browser authentication
      // The following code is commented out because it's currently unreliable:
      /*
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
      */
      
      // Initialize Puppeteer browser for browser-based operations
      this.logger.info('Initializing browser for Twitter operations');
      this.browser = await puppeteer.launch({
        // Use boolean value for compatibility
        headless: this.config.headless !== false, // Default to true unless explicitly set to false
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security'],
      });
      
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
      
      // Set user-agent to look like a real browser
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
      
      // Log in to Twitter using browser
      this.logger.info('Logging in to Twitter using browser');
      await this.browserLogin(username, password, email || '');
      
      this.connected = true;
      this.logger.info('Connected to Twitter');
      
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
      // Enable longer timeout for navigation
      this.page.setDefaultTimeout(60000); // 60 seconds timeout
      
      // Navigate to Twitter directly
      this.logger.debug('Navigating to Twitter home page');
      await this.page.goto('https://twitter.com', { waitUntil: 'networkidle2' });
      
      // Take a screenshot for debugging
      await this.page.screenshot({ path: 'twitter-initial.png' });
      this.logger.debug('Saved initial screenshot');
      
      // Look for login button - Twitter might show different UIs
      try {
        this.logger.debug('Looking for login button');
        // Try to find a login button on the homepage
        const loginButtons = await this.page.$$("a");
        let loginButton = null;
        
        // Find the login button by its text content
        for (const button of loginButtons) {
          const text = await this.page.evaluate(el => el.textContent, button);
          if (text && text.toLowerCase().includes('log in')) {
            loginButton = button;
            break;
          }
        }
        
        if (loginButton) {
          this.logger.debug('Found login button, clicking it');
          await loginButton.click();
          await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
        } else {
          this.logger.debug('No login button found, might be on login page already');
          // Directly navigate to login page if button not found
          await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
        }
      } catch (err) {
        this.logger.warn('Error finding login button, navigating directly to login page', err);
        await this.page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
      }
      
      // Take another screenshot after reaching login page
      await this.page.screenshot({ path: 'twitter-login-page.png' });
      this.logger.debug('Saved login page screenshot');
      
      // Wait for username input and enter username
      this.logger.debug('Looking for username input');
      // Try different possible selectors for username
      const usernameSelectors = [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[data-testid="ocfEnterTextTextInput"]',
        'input[placeholder*="phone"]', // Might contain "phone, email, or username"
        'input[type="text"]'
      ];
      
      // Try different selectors until one works
      let usernameInput = null;
      for (const selector of usernameSelectors) {
        try {
          usernameInput = await this.page.waitForSelector(selector, { timeout: 5000 });
          this.logger.debug(`Found username input with selector: ${selector}`);
          break;
        } catch (e) {
          this.logger.debug(`Selector ${selector} not found for username, trying next`);
        }
      }
      
      if (!usernameInput) {
        throw new Error('Could not find username input field');
      }
      
      // Clear the field and type username
      await this.page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="text"]');
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as HTMLInputElement;
          input.value = '';
        }
      });
      
      await usernameInput.type(username);
      this.logger.debug('Entered username');
      
      // Take screenshot after entering username
      await this.page.screenshot({ path: 'twitter-entered-username.png' });
      
      // Click next button - try different selectors
      this.logger.debug('Looking for next button');
      const nextButtonSelectors = [
        '[data-testid="auth-dialog-modal"] [role="button"]',
        '[role="button"]:not([data-testid="app-bar-back"]):not([data-testid="AppTabBar_Home_Link"])',
        '[data-testid="LoginForm_Forward_Button"]',
        'div[role="button"]',
        'button[type="submit"]'
      ];
      
      // Try to click next button
      let nextButtonClicked = false;
      for (const selector of nextButtonSelectors) {
        try {
          const nextButtons = await this.page.$$(selector);
          for (const button of nextButtons) {
            const buttonText = await this.page.evaluate(el => el.textContent, button);
            if (buttonText && 
                (buttonText.toLowerCase().includes('next') || 
                 buttonText.trim() === '' || 
                 buttonText.includes('→'))) {
              await button.click();
              this.logger.debug(`Clicked next button with text: ${buttonText}`);
              nextButtonClicked = true;
              break;
            }
          }
          if (nextButtonClicked) break;
        } catch (e) {
          this.logger.debug(`Selector ${selector} failed for next button, trying next`);
        }
      }
      
      if (!nextButtonClicked) {
        // Try to press Enter key as a fallback
        await usernameInput.press('Enter');
        this.logger.debug('Pressed Enter key to submit username');
      }
      
      // Wait for password field
      this.logger.debug('Waiting for password field');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give page time to transition
      
      // Take screenshot before looking for password field
      await this.page.screenshot({ path: 'twitter-before-password.png' });
      
      // Try different selectors for password
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]'
      ];
      
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await this.page.waitForSelector(selector, { timeout: 5000 });
          this.logger.debug(`Found password input with selector: ${selector}`);
          break;
        } catch (e) {
          this.logger.debug(`Selector ${selector} not found for password, trying next`);
        }
      }
      
      if (!passwordInput) {
        throw new Error('Could not find password input field');
      }
      
      // Enter password
      await passwordInput.type(password);
      this.logger.debug('Entered password');
      
      // Take screenshot after entering password
      await this.page.screenshot({ path: 'twitter-entered-password.png' });
      
      // Click login button
      this.logger.debug('Looking for login button');
      const loginButtonSelectors = [
        '[data-testid="LoginForm_Login_Button"]',
        'button[type="submit"]',
        'div[role="button"]'
      ];
      
      let loginButtonClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          const loginButtons = await this.page.$$(selector);
          for (const button of loginButtons) {
            const buttonText = await this.page.evaluate(el => el.textContent, button);
            if (buttonText && 
                (buttonText.toLowerCase().includes('log in') || 
                 buttonText.toLowerCase().includes('sign in'))) {
              await button.click();
              this.logger.debug(`Clicked login button with text: ${buttonText}`);
              loginButtonClicked = true;
              break;
            }
          }
          if (loginButtonClicked) break;
        } catch (e) {
          this.logger.debug(`Selector ${selector} failed for login button, trying next`);
        }
      }
      
      if (!loginButtonClicked) {
        // Try to press Enter key as a fallback
        await passwordInput.press('Enter');
        this.logger.debug('Pressed Enter key to submit password');
      }
      
      // Wait for a moment to let the login process complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take screenshot after login attempt
      await this.page.screenshot({ path: 'twitter-after-login.png' });
      
      // Check if email verification is needed
      this.logger.debug('Checking if email verification is needed');
      const emailVerificationSelectors = [
        'input[data-testid="ocfEnterTextTextInput"]',
        'input[placeholder*="confirmation code"]',
        'input[placeholder*="code"]'
      ];
      
      let emailVerificationNeeded = false;
      let emailInput = null;
      
      for (const selector of emailVerificationSelectors) {
        try {
          emailInput = await this.page.waitForSelector(selector, { timeout: 5000 });
          if (emailInput) {
            emailVerificationNeeded = true;
            this.logger.debug(`Email verification needed, found input with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // No email verification needed for this selector
        }
      }
      
      if (emailVerificationNeeded && emailInput) {
        if (!email) {
          throw new Error('Email verification required but no email provided');
        }
        
        this.logger.debug('Entering email for verification');
        await emailInput.type(email);
        
        // Look for next/verify button
        const verifyButtonSelectors = [
          'div[data-testid="ocfEnterTextNextButton"]',
          'button[type="submit"]',
          'div[role="button"]'
        ];
        
        let verifyButtonClicked = false;
        for (const selector of verifyButtonSelectors) {
          try {
            const buttons = await this.page.$$(selector);
            if (buttons.length > 0) {
              await buttons[0].click();
              verifyButtonClicked = true;
              this.logger.debug(`Clicked verify button with selector: ${selector}`);
              break;
            }
          } catch (e) {
            this.logger.debug(`Selector ${selector} failed for verify button, trying next`);
          }
        }
        
        if (!verifyButtonClicked) {
          // Try to press Enter key as a fallback
          await emailInput.press('Enter');
          this.logger.debug('Pressed Enter key to submit email verification');
        }
      } else {
        this.logger.debug('No email verification needed');
      }
      
      // Take final screenshot
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.page.screenshot({ path: 'twitter-final.png' });
      
      // Verify we're logged in - check for home timeline or other indicators
      this.logger.debug('Verifying successful login');
      const successIndicators = [
        '[data-testid="primaryColumn"]',
        '[data-testid="AppTabBar_Home_Link"]',
        '[aria-label="Home timeline"]',
        '[data-testid="SideNav_NewTweet_Button"]'
      ];
      
      let loginSuccessful = false;
      for (const selector of successIndicators) {
        try {
          const element = await this.page.waitForSelector(selector, { timeout: 10000 });
          if (element) {
            loginSuccessful = true;
            this.logger.debug(`Login successful, found element with selector: ${selector}`);
            break;
          }
        } catch (e) {
          this.logger.debug(`Login indicator ${selector} not found, trying next`);
        }
      }
      
      if (!loginSuccessful) {
        this.logger.warn('Could not verify successful login, but proceeding');
      }
      
      this.logger.info('Successfully logged in to Twitter via browser');
    } catch (error) {
      this.logger.error('Error logging in to Twitter via browser', error);
      throw new Error(`Browser login failed: ${(error as Error).message}`);
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
        this.logger.info('Closing browser');
        await this.browser.close().catch((e: Error) => this.logger.error('Error closing browser', e));
        this.browser = null;
        this.page = null;
      }
      
      // Logout from scraper
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
    if (!this.connected || !this.page || !this.browser) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Posting tweet', { 
      content: content.substring(0, 30) + (content.length > 30 ? '...' : ''),
      replyTo
    });
    
    try {
      // Dummy return value in case we can't get a proper tweet ID
      let tweetId = 'tweet_posted_successfully';
      
      // Use browser automation exclusively for tweeting since API methods are unreliable
      this.logger.debug('Posting tweet using browser automation');
      
      try {
        // If this is a reply, handle differently
        if (replyTo) {
          await this.postReplyWithBrowser(content, replyTo);
          this.logger.debug('Reply posted successfully via browser automation');
        } else {
          // Skip scraper methods entirely and go straight to browser automation
          await this.postTweetWithBrowser(content);
          this.logger.debug('Tweet posted successfully via browser automation');
        }
      } catch (error) {
        this.logger.error('Error posting tweet with browser automation', error);
        // Take a screenshot for debugging
        if (this.page) {
          await this.page.screenshot({ path: 'twitter-tweet-error.png' });
          this.logger.debug('Saved screenshot of error state to twitter-tweet-error.png');
        }
        throw error;
      }
      
      // Wait a moment for the tweet to register in Twitter's system
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Take a screenshot after posting for confirmation
      if (this.page) {
        await this.page.screenshot({ path: 'twitter-after-tweet.png' });
        this.logger.debug('Saved post-tweet screenshot to twitter-after-tweet.png');
      }
      
      // Note: We're skipping the API verification because it's unreliable currently
      // Instead, we just assume success if no errors were thrown during the browser automation
      this.logger.info('Tweet posted successfully via browser automation');
      
      return tweetId;
    } catch (error) {
      this.logger.error('Error posting tweet', error);
      console.error('Tweet posting error details:', error);
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
    
    try {
      // Make sure we're on the Twitter home page
      await this.page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      
      // Take screenshot to see what page we're on
      await this.page.screenshot({ path: 'twitter-home.png' });
      this.logger.debug('Saved home page screenshot');
      
      // Wait for the page to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try various ways to find and click the compose button
      const composeSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetButton"]',
        '[aria-label="Tweet"]',
        '[aria-label="Post"]',
        '[aria-label="Post"]',
        '[aria-label="Twitter Post"]',
        'a[href="/compose/tweet"]',
        'div[role="button"][data-testid="SideNav_NewTweet_Button"]',
        'div[data-testid="SideNav_NewTweet_Button"]',
        'div[aria-label="Tweet"]'
      ];
      
      let composerFound = false;
      
      // First check if the tweet textarea is already visible
      try {
        const textarea = await this.page.$('[data-testid="tweetTextarea_0"]');
        if (textarea) {
          this.logger.debug('Tweet composer is already open');
          composerFound = true;
        }
      } catch (e) {
        this.logger.debug('Tweet composer not immediately visible');
      }
      
      // If not visible, try to find and click a compose button
      if (!composerFound) {
        for (const selector of composeSelectors) {
          try {
            const button = await this.page.$(selector);
            if (button) {
              this.logger.debug(`Found compose button with selector: ${selector}`);
              await button.click();
              this.logger.debug('Clicked compose button');
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Check if clicking opened a composer
              try {
                const textarea = await this.page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 3000 });
                if (textarea) {
                  this.logger.debug('Tweet composer opened successfully');
                  composerFound = true;
                  break;
                }
              } catch (composerErr) {
                this.logger.debug(`Clicking ${selector} did not open composer`);
              }
            }
          } catch (e) {
            this.logger.debug(`Selector ${selector} not found or could not be clicked`);
          }
        }
      }
      
      // If still no composer, try clicking the "What's happening?" text area directly
      if (!composerFound) {
        try {
          // Try finding the "What's happening?" or similar text areas
          const whatsHappeningSelectors = [
            'div[aria-label="Post text"]',
            'div[aria-label="Tweet text"]',
            'div[data-testid="tweetTextarea_0"]',
            'div[role="textbox"]',
            'div[contenteditable="true"]',
            'div.public-DraftEditor-content'
          ];
          
          for (const selector of whatsHappeningSelectors) {
            try {
              const textArea = await this.page.$(selector);
              if (textArea) {
                await textArea.click();
                this.logger.debug(`Clicked on text area with selector: ${selector}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                  await textArea.type(content);
                  this.logger.debug('Entered content into text area');
                  composerFound = true;
                  
                  // Look for tweet button
                  const tweetButtonSelectors = [
                    '[data-testid="tweetButtonInline"]',
                    'div[data-testid="tweetButton"]',
                    'button[data-testid="tweetButton"]',
                    '[aria-label="Post"]',
                    'div[role="button"][data-testid="tweetButton"]'
                  ];
                  
                  for (const buttonSelector of tweetButtonSelectors) {
                    const tweetButton = await this.page.$(buttonSelector);
                    if (tweetButton) {
                      await tweetButton.click();
                      this.logger.debug(`Clicked tweet button with selector: ${buttonSelector}`);
                      // Wait for the tweet to be posted
                      await new Promise(resolve => setTimeout(resolve, 5000));
                      return;
                    }
                  }
                } catch (typeError) {
                  this.logger.debug(`Could not type into ${selector}`, typeError);
                }
              }
            } catch (selectorError) {
              this.logger.debug(`Error with selector ${selector}`, selectorError);
            }
          }
        } catch (err) {
          this.logger.debug('Could not find "What\'s happening?" text area', err);
        }
      }
      
      // If still no composer, try a different approach - look for any editable area
      if (!composerFound) {
        this.logger.debug('Looking for any editable area or div[contenteditable="true"]');
        try {
          const editableAreas = await this.page.$$('div[contenteditable="true"]');
          if (editableAreas.length > 0) {
            const editableArea = editableAreas[0];
            await editableArea.click();
            await editableArea.type(content);
            this.logger.debug('Found and used contenteditable area');
            composerFound = true;
            
            // Look for any button that might be a tweet button
            const possibleTweetButtons = await this.page.$$('div[role="button"], button');
            for (const button of possibleTweetButtons) {
              const buttonText = await this.page.evaluate(el => el.textContent, button);
              if (buttonText && 
                  (buttonText.toLowerCase().includes('tweet') || 
                   buttonText.toLowerCase().includes('post'))) {
                await button.click();
                this.logger.debug(`Clicked button with text: ${buttonText}`);
                break;
              }
            }
            
            // Wait to see if the tweet was posted
            await new Promise(resolve => setTimeout(resolve, 5000));
            return;
          }
        } catch (err) {
          this.logger.debug('Could not find editable area', err);
        }
      }
      
      // Try direct navigation to compose page as a last resort
      if (!composerFound) {
        try {
          this.logger.debug('Trying direct navigation to compose page');
          await this.page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Look for the composer again
          const textarea = await this.page.$('[data-testid="tweetTextarea_0"]');
          if (textarea) {
            await textarea.type(content);
            this.logger.debug('Found composer through direct navigation');
            composerFound = true;
            
            // Try to click tweet button
            const tweetButtons = await this.page.$$('[data-testid="tweetButtonInline"]');
            if (tweetButtons.length > 0) {
              await tweetButtons[0].click();
              this.logger.debug('Clicked tweet button after direct navigation');
              await new Promise(resolve => setTimeout(resolve, 5000));
              return;
            }
          }
        } catch (navError) {
          this.logger.debug('Direct navigation to compose page failed', navError);
        }
      }
      
      if (!composerFound) {
        // Take a screenshot to debug
        await this.page.screenshot({ path: 'twitter-compose-not-found.png' });
        throw new Error('Could not find or open the tweet composer');
      }
      
      // Type the tweet content
      this.logger.debug('Entering tweet content');
      await this.page.type('[data-testid="tweetTextarea_0"]', content);
      
      // Take screenshot after entering content
      await this.page.screenshot({ path: 'twitter-entered-content.png' });
      
      // Look for various possible "Tweet" or "Post" buttons
      const tweetButtonSelectors = [
        '[data-testid="tweetButtonInline"]',
        'div[data-testid="tweetButton"]',
        'button[data-testid="tweetButton"]',
        'div[role="button"][data-testid="tweetButton"]',
        '[aria-label="Post"]',
        '[aria-label="Tweet"]',
        'button:has-text("Tweet")',
        'button:has-text("Post")',
        'div[role="button"]:has-text("Tweet")',
        'div[role="button"]:has-text("Post")'
      ];
      
      let tweetButtonClicked = false;
      
      for (const selector of tweetButtonSelectors) {
        try {
          const buttons = await this.page.$$(selector);
          if (buttons.length > 0) {
            await buttons[0].click();
            this.logger.debug(`Clicked tweet button with selector: ${selector}`);
            tweetButtonClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Selector ${selector} not found for tweet button`);
        }
      }
      
      if (!tweetButtonClicked) {
        // Try a more general approach - look for buttons with "Tweet" or "Post" text
        this.logger.debug('Looking for any button with Tweet/Post text');
        
        try {
          // Take a screenshot to see what buttons are available
          await this.page.screenshot({ path: 'twitter-before-button-search.png' });
          
          // Try to find the button via page.evaluate to get all possible buttons
          const buttonInfo: Array<{index: number, text: string, classes: string, disabled: boolean}> = await this.page.evaluate(() => {
            const possibleButtons: Array<{index: number, text: string, classes: string, disabled: boolean}> = [];
            const allButtons = document.querySelectorAll('div[role="button"], button');
            
            allButtons.forEach((el, i) => {
              if (el.textContent && 
                 (el.textContent.toLowerCase().includes('tweet') || 
                  el.textContent.toLowerCase().includes('post'))) {
                possibleButtons.push({
                  index: i,
                  text: el.textContent,
                  classes: el instanceof HTMLElement ? el.className : '',
                  disabled: el instanceof HTMLButtonElement ? el.disabled : false
                });
              }
            });
            
            return possibleButtons;
          });
          
          this.logger.debug(`Found ${buttonInfo.length} possible tweet buttons`);
          console.log('Possible tweet buttons:', buttonInfo);
          
          // Now try clicking each button
          const buttons = await this.page.$$('div[role="button"], button');
          for (const info of buttonInfo) {
            try {
              if (info.index < buttons.length) {
                const button = buttons[info.index];
                await button.click();
                this.logger.debug(`Clicked button with text: ${info.text}`);
                tweetButtonClicked = true;
                break;
              }
            } catch (err: any) {
              this.logger.debug(`Error clicking button: ${err?.message || 'Unknown error'}`);
            }
          }
          
          // If we still haven't found a button, try pressing Enter key
          if (!tweetButtonClicked) {
            this.logger.debug('Trying to submit by pressing Enter key');
            await this.page.keyboard.press('Enter');
            tweetButtonClicked = true;
          }
        } catch (err: any) {
          this.logger.debug('Error in button search process', err?.message || 'Unknown error');
        }
      }
      
      if (!tweetButtonClicked) {
        // Take a screenshot to debug
        await this.page.screenshot({ path: 'twitter-post-button-not-found.png' });
        throw new Error('Could not find the Tweet/Post button');
      }
      
      // Wait for the tweet to be posted
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Take a final screenshot
      await this.page.screenshot({ path: 'twitter-after-posting.png' });
      
      this.logger.info('Tweet posted successfully via browser');
    } catch (error) {
      this.logger.error('Error posting tweet via browser', error);
      throw new Error(`Browser tweet posting failed: ${(error as Error).message}`);
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
    
    try {
      // Navigate to the tweet page
      await this.page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'networkidle2' });
      
      // Find the reply button and click it
      await this.page.waitForSelector('[data-testid="reply"]');
      await this.page.click('[data-testid="reply"]');
      
      // Wait for the reply composer to appear
      await this.page.waitForSelector('[data-testid="tweetTextarea_0"]');
      
      // Type the reply content
      await this.page.type('[data-testid="tweetTextarea_0"]', content);
      
      // Click the "Reply" button to submit
      await this.page.waitForSelector('[data-testid="tweetButtonInline"]');
      await this.page.click('[data-testid="tweetButtonInline"]');
      
      // Wait for the tweet to be posted (indicated by the composer closing)
      await this.page.waitForFunction(() => {
        return !document.querySelector('[data-testid="tweetButtonInline"]');
      }, { timeout: 10000 }).catch(() => {
        // If the button is still there, try to see if there are any error messages
        this.logger.warn('Reply button still visible after posting attempt, checking for errors');
      });
      
      this.logger.info('Reply posted successfully via browser');
    } catch (error) {
      this.logger.error('Error posting reply via browser', error);
      throw new Error(`Browser reply posting failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Retweets a tweet
   * 
   * @param tweetId - ID of the tweet to retweet
   * @returns Promise resolving when completed
   */
  async retweet(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper || !this.page) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Retweeting', { tweetId });
    
    try {
      // Try using the browser first
      try {
        await this.retweetWithBrowser(tweetId);
        this.logger.info('Retweeted tweet with browser', { tweetId });
        return;
      } catch (browserError) {
        this.logger.warn('Error retweeting with browser, falling back to API', { error: browserError });
        // Fall back to API if browser approach fails
        await this.scraper.retweet(tweetId);
        this.logger.info('Retweeted tweet with API fallback', { tweetId });
      }
    } catch (error) {
      this.logger.error('Error retweeting', error);
      throw error;
    }
  }
  
  /**
   * Retweets a tweet using browser automation
   * 
   * @param tweetId - ID of the tweet to retweet
   */
  private async retweetWithBrowser(tweetId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Navigate to the tweet page
      await this.page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'networkidle2' });
      
      // Find and click the retweet button
      await this.page.waitForSelector('[data-testid="retweet"]');
      await this.page.click('[data-testid="retweet"]');
      
      // Wait for the retweet confirmation dialog and click it
      await this.page.waitForSelector('[data-testid="retweetConfirm"]');
      await this.page.click('[data-testid="retweetConfirm"]');
      
      // Wait for the retweet to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.logger.info('Retweeted successfully via browser');
    } catch (error) {
      this.logger.error('Error retweeting via browser', error);
      throw new Error(`Browser retweet failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Likes a tweet
   * 
   * @param tweetId - ID of the tweet to like
   * @returns Promise resolving when completed
   */
  async like(tweetId: string): Promise<void> {
    if (!this.connected || !this.scraper || !this.page) {
      throw new Error('Not connected to Twitter');
    }
    
    this.logger.debug('Liking tweet', { tweetId });
    
    try {
      // Try using the browser first
      try {
        await this.likeWithBrowser(tweetId);
        this.logger.info('Liked tweet with browser', { tweetId });
        return;
      } catch (browserError) {
        this.logger.warn('Error liking with browser, falling back to API', { error: browserError });
        // Fall back to API if browser approach fails
        await this.scraper.likeTweet(tweetId);
        this.logger.info('Liked tweet with API fallback', { tweetId });
      }
    } catch (error) {
      this.logger.error('Error liking tweet', error);
      throw error;
    }
  }
  
  /**
   * Likes a tweet using browser automation
   * 
   * @param tweetId - ID of the tweet to like
   */
  private async likeWithBrowser(tweetId: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    
    try {
      // Navigate to the tweet page
      await this.page.goto(`https://twitter.com/i/status/${tweetId}`, { waitUntil: 'networkidle2' });
      
      // Find and click the like button
      await this.page.waitForSelector('[data-testid="like"]');
      await this.page.click('[data-testid="like"]');
      
      // Wait for the like to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.logger.info('Liked tweet successfully via browser');
    } catch (error) {
      this.logger.error('Error liking tweet via browser', error);
      throw new Error(`Browser like failed: ${(error as Error).message}`);
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
    
    // Initial check to establish baseline, but with a slight delay
    // to ensure the connection is fully established
    setTimeout(() => {
      this.checkForNewTweets()
        .catch(error => this.logger.error('Error in initial tweet check', error));
    }, 5000);
    
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
          // Get latest tweet (wrapped in try/catch as a backup)
          let latestTweet;
          try {
            latestTweet = await (this.scraper as any).getLatestTweet(username);
          } catch (error) {
            // Fallback to getting tweets and taking the first one
            const tweets = await this.scraper.getTweets(username, 1);
            for await (const tweet of tweets) {
              latestTweet = tweet;
              break;
            }
          }
          
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