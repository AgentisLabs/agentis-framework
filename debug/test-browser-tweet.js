const puppeteer = require('puppeteer');
require('dotenv').config();

async function main() {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: false, // Use false to see the browser, helpful for debugging
      defaultViewport: null,
      args: ['--window-size=1280,800']
    });
    
    const page = await browser.newPage();
    
    // Twitter login
    console.log('Navigating to Twitter login...');
    await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
    
    // Enter username
    console.log('Entering username...');
    await page.waitForSelector('input[autocomplete="username"]');
    await page.type('input[autocomplete="username"]', process.env.TWITTER_USERNAME);
    
    // Click Next
    const nextButtons = await page.$$('div[role="button"]');
    for (const button of nextButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && text.includes('Next')) {
        await button.click();
        break;
      }
    }
    
    // Wait for password field 
    await page.waitForTimeout(2000);
    
    // Check if we need to enter additional verification
    const usernameVerifyInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (usernameVerifyInput) {
      console.log('Username verification needed...');
      await usernameVerifyInput.type(process.env.TWITTER_EMAIL || process.env.TWITTER_USERNAME);
      
      // Click Next for verification
      const verifyButtons = await page.$$('div[role="button"]');
      for (const button of verifyButtons) {
        const text = await page.evaluate(el => el.textContent, button);
        if (text && text.includes('Next')) {
          await button.click();
          break;
        }
      }
      
      await page.waitForTimeout(2000);
    }
    
    // Enter password
    console.log('Entering password...');
    await page.waitForSelector('input[name="password"]');
    await page.type('input[name="password"]', process.env.TWITTER_PASSWORD);
    
    // Click Login
    const loginButtons = await page.$$('div[role="button"]');
    for (const button of loginButtons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text && text.includes('Log in')) {
        await button.click();
        break;
      }
    }
    
    // Wait for home page to load
    console.log('Waiting for login completion...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);
    
    // Take a screenshot to see where we are
    await page.screenshot({ path: 'login-result.png' });
    console.log('Login process complete, screenshot saved');
    
    // Posting a tweet
    console.log('Attempting to post a tweet...');
    
    // Go to home page
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);
    
    // Try to find the composer
    console.log('Looking for tweet composer...');
    let composerFound = false;
    
    // Approach 1: Look for direct textarea
    try {
      const textarea = await page.$('[data-testid="tweetTextarea_0"]');
      if (textarea) {
        console.log('Found tweet textarea directly');
        composerFound = true;
        
        // Click the textarea to focus it
        await textarea.click();
        await page.waitForTimeout(1000);
        
        // Type the tweet text
        const tweetText = `Test tweet from browser automation at ${new Date().toISOString()}`;
        await textarea.type(tweetText);
        console.log('Entered tweet text');
        
        // Find the tweet button
        const tweetButtonSelectors = [
          '[data-testid="tweetButtonInline"]',
          'div[data-testid="tweetButton"]',
          'button[data-testid="tweetButton"]',
          '[aria-label="Post"]',
          'div[role="button"][data-testid="tweetButton"]'
        ];
        
        for (const selector of tweetButtonSelectors) {
          try {
            const button = await page.$(selector);
            if (button) {
              await button.click();
              console.log(`Clicked tweet button with selector: ${selector}`);
              
              // Wait for tweet to be posted
              await page.waitForTimeout(5000);
              console.log('Tweet posted successfully using direct textarea approach');
              break;
            }
          } catch (e) {
            console.log(`Button selector ${selector} not found or couldn't be clicked`);
          }
        }
      }
    } catch (e) {
      console.log('Error finding or using tweet textarea:', e);
    }
    
    // Approach 2: If composer not found, try clicking compose button first
    if (!composerFound) {
      console.log('Using approach 2: Finding and clicking compose button first');
      
      const composeSelectors = [
        '[data-testid="SideNav_NewTweet_Button"]',
        '[aria-label="Tweet"]',
        '[aria-label="Post"]',
        'a[href="/compose/tweet"]'
      ];
      
      for (const selector of composeSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            console.log(`Clicked compose button with selector: ${selector}`);
            await page.waitForTimeout(2000);
            
            // Check if clicking opened a composer
            const textarea = await page.$('[data-testid="tweetTextarea_0"]');
            if (textarea) {
              console.log('Compose button successfully opened tweet textarea');
              
              // Type the tweet text
              const tweetText = `Test tweet via approach 2 at ${new Date().toISOString()}`;
              await textarea.type(tweetText);
              console.log('Entered tweet text');
              
              // Find the tweet button
              const tweetButtonSelectors = [
                '[data-testid="tweetButtonInline"]',
                'div[data-testid="tweetButton"]',
                'button[data-testid="tweetButton"]'
              ];
              
              for (const btnSelector of tweetButtonSelectors) {
                try {
                  const tweetBtn = await page.$(btnSelector);
                  if (tweetBtn) {
                    await tweetBtn.click();
                    console.log(`Clicked tweet button with selector: ${btnSelector}`);
                    
                    // Wait for tweet to be posted
                    await page.waitForTimeout(5000);
                    console.log('Tweet posted successfully using compose button approach');
                    composerFound = true;
                    break;
                  }
                } catch (e) {
                  console.log(`Button ${btnSelector} not found or couldn't be clicked`);
                }
              }
              
              if (composerFound) break;
            }
          }
        } catch (e) {
          console.log(`Compose selector ${selector} not found or couldn't be clicked`);
        }
      }
    }
    
    // Approach 3: Direct navigation to compose page
    if (!composerFound) {
      console.log('Using approach 3: Direct navigation to compose page');
      
      try {
        await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });
        await page.waitForTimeout(3000);
        
        // Check for composer
        const textarea = await page.$('[data-testid="tweetTextarea_0"]');
        if (textarea) {
          console.log('Found textarea through direct navigation');
          
          // Type the tweet text
          const tweetText = `Test tweet via approach 3 at ${new Date().toISOString()}`;
          await textarea.type(tweetText);
          console.log('Entered tweet text');
          
          // Find tweet button
          const tweetButton = await page.$('[data-testid="tweetButtonInline"]');
          if (tweetButton) {
            await tweetButton.click();
            console.log('Clicked tweet button');
            
            // Wait for tweet to be posted
            await page.waitForTimeout(5000);
            console.log('Tweet posted successfully using direct navigation approach');
            composerFound = true;
          }
        }
      } catch (e) {
        console.log('Error with direct navigation approach:', e);
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'tweet-result.png' });
    console.log('Tweet process complete, screenshot saved');
    
    if (!composerFound) {
      console.log('Failed to find or use tweet composer with any approach');
    }
    
    // Close browser
    console.log('Closing browser...');
    await browser.close();
    console.log('Test complete');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();