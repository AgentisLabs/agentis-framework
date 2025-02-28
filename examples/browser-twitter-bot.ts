import dotenv from 'dotenv';
import { Agent } from '../src/core/agent';
import { TwitterConnector } from '../src/platform-connectors/twitter-connector';

// Load environment variables
dotenv.config();

/**
 * Example of a Twitter bot using the browser interface
 */
async function main() {
  console.log('Starting browser-based Twitter bot example...');

  // Get Twitter credentials from environment variables
  const username = process.env.TWITTER_USERNAME;
  const password = process.env.TWITTER_PASSWORD;
  const email = process.env.TWITTER_EMAIL;

  if (!username || !password) {
    console.error('Twitter credentials not found in environment variables.');
    console.error('Please set TWITTER_USERNAME and TWITTER_PASSWORD in your .env file.');
    process.exit(1);
  }

  try {
    // Create a simple agent
    const agent = new Agent({
      name: 'TwitterBot',
      role: 'assistant',
      personality: {
        traits: ['helpful', 'concise', 'social'],
        background: 'A Twitter bot that posts using browser simulation',
      },
      goals: ['Post engaging tweets', 'Interact with users'],
      systemPrompt: `
        You are a helpful Twitter bot that posts interesting content.
        When asked about topics, provide thoughtful insights.
      `,
      model: process.env.DEFAULT_MODEL || 'claude-3-opus-20240229',
    });

    // Create Twitter connector with browser-based tweeting
    const twitterConnector = new TwitterConnector({
      username,
      password,
      email,
      headless: true, // Run in headless mode (no visible browser)
    });

    // Connect agent to Twitter
    console.log('Connecting to Twitter...');
    await twitterConnector.connect(agent);
    console.log('Connected to Twitter successfully');

    // Post a test tweet
    console.log('Posting a test tweet...');
    const tweetContent = `Testing browser-based Twitter posting 🤖 #AgentisTesting ${new Date().toISOString()}`;
    const tweetId = await twitterConnector.tweet(tweetContent);
    console.log(`Tweet posted successfully with ID: ${tweetId}`);

    // Disconnect from Twitter
    console.log('Disconnecting from Twitter...');
    await twitterConnector.disconnect();
    console.log('Disconnected from Twitter successfully');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

// Run the example
main();