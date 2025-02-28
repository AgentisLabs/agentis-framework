const { BrowserTwitterConnector } = require('./dist/platform-connectors/browser-twitter-connector');
require('dotenv').config();

async function main() {
  try {
    console.log('Starting Twitter tweet test...');
    
    // Create Twitter connector with debug and non-headless mode
    const twitterConnector = new BrowserTwitterConnector({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
      email: process.env.TWITTER_EMAIL,
      
      // Browser settings
      headless: false, // Show browser for debugging
      debug: true // Enable debugging mode
    });
    
    // Create a simple mock agent for the connector
    const mockAgent = {
      name: 'TestAgent',
      run: async () => ({ response: 'Hello' })
    };
    
    // Connect to Twitter
    console.log('Connecting to Twitter...');
    await twitterConnector.connect(mockAgent);
    console.log('Connected to Twitter successfully!');
    
    // Post a tweet
    console.log('Posting tweet...');
    const tweetContent = `Testing our Twitter agent at ${new Date().toISOString()}`;
    
    const result = await twitterConnector.tweet(tweetContent);
    console.log('Tweet posted successfully:', result);
    
    // Wait for user to see the result
    console.log('Waiting 15 seconds before disconnecting...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Disconnect
    console.log('Disconnecting...');
    await twitterConnector.disconnect();
    console.log('Disconnected from Twitter');
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

main();