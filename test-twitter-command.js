const { Scraper } = require('agent-twitter-client');
require('dotenv').config();

async function main() {
  try {
    // Create a new instance of the scraper
    console.log('Creating Scraper instance...');
    const scraper = new Scraper();
    
    // Login
    console.log('Logging in...');
    await scraper.login({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL
    });
    
    console.log('Login successful!');
    
    // Test sending a tweet
    const tweetText = `Testing tweet command at ${new Date().toISOString()}`;
    console.log(`Sending tweet: "${tweetText}"`);
    
    // Use the package's tweetText function
    try {
      console.log('Attempting to use tweetText...');
      if (typeof scraper.tweetText === 'function') {
        await scraper.tweetText(tweetText);
        console.log('Tweet sent successfully using tweetText!');
      } else {
        console.log('tweetText method not available, trying sendTweet...');
        
        // Try the package's sendTweet function
        await scraper.sendTweet(tweetText);
        console.log('Tweet sent successfully using sendTweet!');
      }
    } catch (error) {
      console.error('Error sending tweet:', error);
      
      // Try using page automation methods directly
      try {
        console.log('Attempting to use page automation...');
        
        // Use scraper's browser directly
        const page = await scraper.getPage();
        if (!page) {
          console.error('No page available');
          process.exit(1);
        }
        
        // Navigate to Twitter home
        console.log('Navigating to Twitter home...');
        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
        
        // Find compose field
        console.log('Looking for compose field...');
        await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
        await page.type('[data-testid="tweetTextarea_0"]', tweetText);
        console.log('Entered tweet text');
        
        // Click tweet button
        console.log('Looking for tweet button...');
        const buttonSelector = '[data-testid="tweetButtonInline"]';
        await page.waitForSelector(buttonSelector, { timeout: 5000 });
        await page.click(buttonSelector);
        console.log('Clicked tweet button');
        
        // Wait for tweet to process
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('Tweet sent successfully using page automation!');
      } catch (pageError) {
        console.error('Error with page automation:', pageError);
      }
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Logout
    console.log('Logging out...');
    await scraper.logout();
    console.log('Logged out successfully');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();