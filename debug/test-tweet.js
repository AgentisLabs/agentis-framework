const { Scraper } = require('agent-twitter-client');
require('dotenv').config();

async function main() {
  try {
    console.log('Creating scraper instance...');
    const scraper = new Scraper();
    
    console.log('Logging in...');
    await scraper.login({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL
    });
    
    console.log('Successfully logged in');
    
    // Get current user profile
    console.log('Getting user profile...');
    const profile = await scraper.me();
    console.log('Profile:', profile);
    
    // Send a test tweet
    const tweetText = `Test tweet from agent-twitter-client at ${new Date().toISOString()}`;
    console.log('Attempting to send tweet:', tweetText);
    
    try {
      const result = await scraper.sendTweet(tweetText);
      console.log('Tweet sent successfully:', result);
    } catch (error) {
      console.error('Error sending tweet via sendTweet:', error);
      
      // Try alternative methods
      try {
        console.log('Trying sendTweetV2...');
        const result2 = await scraper.sendTweetV2(tweetText);
        console.log('Tweet sent successfully via sendTweetV2:', result2);
      } catch (error2) {
        console.error('Error sending tweet via sendTweetV2:', error2);
      }
    }
    
    // Logout when done
    await scraper.logout();
    console.log('Logged out');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();