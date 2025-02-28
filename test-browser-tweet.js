/**
 * Simple standalone script to test posting a tweet using Puppeteer
 * This uses the same approach as in manual-test-twitter.js but in a more direct manner
 */

const puppeteer = require('puppeteer');
require('dotenv').config();

async function main() {
  try {
    console.log('Starting tweet test...');
    
    // Launch browser
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: null,
      args: ['--window-size=1280,800']
    });
    
    const page = await browser.newPage();
    
    // Navigate to Twitter login
    console.log('Navigating to Twitter login...');
    await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Enter username
    console.log('Entering username...');
    await page.waitForSelector('input[autocomplete="username"]');
    await page.type('input[autocomplete="username"]', process.env.TWITTER_USERNAME);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Click Next
    console.log('Clicking Next button...');
    const nextButtons = await page.$$('[role="button"]');
    for (const button of nextButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && text.includes('Next')) {
        await button.click();
        console.log('Clicked Next button');
        break;
      }
    }
    
    // Wait for password field or verification
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if we need additional verification
    const verifyInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (verifyInput) {
      console.log('Account verification needed...');
      await verifyInput.type(process.env.TWITTER_EMAIL || process.env.TWITTER_USERNAME);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Click Next for verification
      const verifyNext = await page.$$('[role="button"]');
      for (const button of verifyNext) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text && text.includes('Next')) {
          await button.click();
          console.log('Clicked verification Next button');
          break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Enter password
    console.log('Entering password...');
    await page.waitForSelector('input[name="password"]');
    await page.type('input[name="password"]', process.env.TWITTER_PASSWORD);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Click Log in
    console.log('Clicking Log in button...');
    const loginButtons = await page.$$('[role="button"]');
    for (const button of loginButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && text.includes('Log in')) {
        await button.click();
        console.log('Clicked Log in button');
        break;
      }
    }
    
    // Wait for navigation to home page
    console.log('Waiting for login completion...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('Login completed');
    
    // Take a screenshot
    await page.screenshot({ path: 'twitter-logged-in.png' });
    console.log('Saved screenshot to twitter-logged-in.png');
    
    // Post a tweet
    console.log('Attempting to post a tweet...');
    
    // Navigate to home page
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take a screenshot of home page
    await page.screenshot({ path: 'twitter-home.png' });
    
    // Find and click on compose tweet area
    console.log('Finding tweet compose area...');
    
    // Look for the compose area
    const tweetText = `Testing browser automation at ${new Date().toISOString()}`;
    
    // Try multiple selectors for the compose area
    const composeSelectors = [
      '[data-testid="tweetTextarea_0"]',
      '[aria-label="Tweet text"]',
      '[aria-label="Post text"]',
      '[role="textbox"]'
    ];
    
    let composerFound = false;
    
    for (const selector of composeSelectors) {
      try {
        console.log(`Trying selector: ${selector}`);
        const composeArea = await page.$(selector);
        if (composeArea) {
          console.log(`Found compose area with selector: ${selector}`);
          await composeArea.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          await composeArea.type(tweetText);
          // Add a delay after typing to ensure the tweet button becomes enabled
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('Entered tweet text');
          composerFound = true;
          break;
        }
      } catch (error) {
        console.log(`Selector ${selector} not found or error: ${error.message}`);
      }
    }
    
    if (!composerFound) {
      // Try clicking the "What's happening?" text as a fallback
      try {
        console.log('Looking for "What\'s happening?" text...');
        const elements = await page.$$('div');
        for (const el of elements) {
          const text = await page.evaluate(e => e.textContent, el);
          if (text && (text.includes("What's happening?") || text.includes("What's on your mind?"))) {
            await el.click();
            console.log('Clicked on "What\'s happening?" text');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.keyboard.type(tweetText);
            // Add a delay after typing to ensure the tweet button becomes enabled
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log('Entered tweet text via keyboard');
            composerFound = true;
            break;
          }
        }
      } catch (error) {
        console.log(`Error finding "What's happening?" text: ${error.message}`);
      }
    }
    
    if (!composerFound) {
      console.log('Could not find compose area, taking screenshot for debugging');
      await page.screenshot({ path: 'twitter-composer-not-found.png' });
      throw new Error('Could not find tweet compose area');
    }
    
    // Take a screenshot after entering text
    await page.screenshot({ path: 'twitter-text-entered.png' });
    
    // Find and click tweet/post button
    console.log('Looking for tweet/post button...');
    
    const buttonSelectors = [
      '[data-testid="tweetButtonInline"]',
      'div[data-testid="tweetButton"]',
      'button[data-testid="tweetButton"]',
      '[aria-label="Tweet"]',
      '[aria-label="Post"]'
    ];
    
    let buttonClicked = false;
    
    for (const selector of buttonSelectors) {
      try {
        console.log(`Trying button selector: ${selector}`);
        const button = await page.$(selector);
        if (button) {
          console.log(`Found button with selector: ${selector}`);
          
          // Check if the button is disabled
          const isDisabled = await page.evaluate(el => {
            return el.getAttribute('aria-disabled') === 'true' || 
                  el.disabled === true || 
                  el.classList.contains('disabled');
          }, button);
          
          if (isDisabled) {
            console.log('Button is disabled, cannot click');
            continue;
          }
          
          await button.click();
          console.log('Clicked tweet button');
          buttonClicked = true;
          break;
        }
      } catch (error) {
        console.log(`Button selector ${selector} not found or error: ${error.message}`);
      }
    }
    
    if (!buttonClicked) {
      // Try using direct DOM evaluation to find any button with Tweet or Post
      console.log('Trying to find and click tweet button via DOM evaluation...');
      
      const tweetButtonFound = await page.evaluate(() => {
        // Look for any button-like element containing 'Tweet' or 'Post'
        const possibleButtons = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
        
        for (const button of possibleButtons) {
          const text = button.textContent || '';
          const isDisabled = button.hasAttribute('disabled') || 
                          button.getAttribute('aria-disabled') === 'true' || 
                          button.classList.contains('disabled');
          
          if ((text.includes('Tweet') || text.includes('Post')) && !isDisabled) {
            // Click the button
            button.click();
            return true;
          }
        }
        return false;
      });
      
      if (tweetButtonFound) {
        console.log('Found and clicked tweet button via direct DOM evaluation');
        buttonClicked = true;
      }
    }
    
    if (!buttonClicked) {
      // Try to find any button with text 'Tweet' or 'Post'
      try {
        console.log('Looking for button with text "Tweet" or "Post"...');
        const buttons = await page.$$('button, div[role="button"]');
        console.log(`Found ${buttons.length} potential buttons`);
        
        for (const button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (text && (text.includes('Tweet') || text.includes('Post'))) {
            console.log(`Found button with text: ${text}`);
            await button.click();
            console.log('Clicked button by text');
            buttonClicked = true;
            break;
          }
        }
      } catch (error) {
        console.log(`Error finding button by text: ${error.message}`);
      }
    }
    
    if (!buttonClicked) {
      // Last resort - try pressing Enter key
      console.log('Trying to submit by pressing Enter key...');
      await page.keyboard.press('Enter');
      buttonClicked = true;
    }
    
    // Wait for tweet to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('Tweet should be posted now');
    
    // Take a final screenshot
    await page.screenshot({ path: 'twitter-after-tweet.png' });
    console.log('Saved final screenshot to twitter-after-tweet.png');
    
    // Wait a bit before closing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close browser
    console.log('Closing browser...');
    await browser.close();
    console.log('Test completed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();