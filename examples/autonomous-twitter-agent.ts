/**
 * Autonomous Twitter Agent
 * A fully autonomous agent that can run continuously, managing its own Twitter presence
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Agent } from '../src/core/agent';
import { TwitterConnector } from '../src/platform-connectors/twitter-connector';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { TwitterContentManager } from '../src/platform-connectors/twitter-content-manager';
import { Logger } from '../src/utils/logger';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { 
  PersonalityUtils, 
  EnhancedAgentConfig,
  EnhancedPersonality
} from '../src/core/enhanced-personality-system';
import { AgentRole } from '../src/core/types';
import { createInterface } from 'readline';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('AutonomousTwitterAgent');

// Default paths and settings
const DEFAULT_PERSONA_PATH = path.join(__dirname, '../personas/wexley.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const AGENT_STATE_DIR = path.join(DATA_DIR, 'agent-state');
const TWITTER_DATA_DIR = path.join(DATA_DIR, 'twitter');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AGENT_STATE_DIR)) fs.mkdirSync(AGENT_STATE_DIR, { recursive: true });
if (!fs.existsSync(TWITTER_DATA_DIR)) fs.mkdirSync(TWITTER_DATA_DIR, { recursive: true });

// Command line interface
let rl: ReturnType<typeof createInterface> | null = null;

// Helper function to safely use readline
function safeQuestion(prompt: string, callback: (answer: string) => void): void {
  if (!rl) {
    console.error('Error: Readline interface not initialized');
    process.exit(1);
    return;
  }
  rl.question(prompt, callback);
}

// Global state
let baseAgent: Agent;
let autonomousAgent: AutonomousAgent;
let twitterConnector: TwitterConnector;
let contentManager: TwitterContentManager;
let running = false;

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Check required environment variables
    checkRequiredEnvVars();
    
    // Parse command line arguments
    const personalityFile = parseCommandLineArgs();
    
    // Load personality file
    logger.info(`Loading personality from ${personalityFile}`);
    const personality = PersonalityUtils.loadPersonalityFromJson(personalityFile);
    
    // Create agent
    baseAgent = createBaseAgent(personality);
    
    // Create Twitter connector
    twitterConnector = createTwitterConnector();
    
    // Create autonomous agent
    autonomousAgent = createAutonomousAgent(baseAgent);
    
    // Create Twitter content manager
    contentManager = createContentManager(autonomousAgent, twitterConnector);
    
    // Connect to Twitter
    console.log('Connecting to Twitter...');
    await twitterConnector.connect(baseAgent);
    console.log('Connected to Twitter successfully!');
    
    // Create readline interface for CLI
    rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Display welcome message
    displayWelcomeMessage(personality);
    
    // Start interactive CLI
    startCLI();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error starting autonomous Twitter agent', error);
    if (rl) rl.close();
    process.exit(1);
  }
}

/**
 * Check required environment variables
 */
function checkRequiredEnvVars(): void {
  const requiredEnvVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'ANTHROPIC_API_KEY'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs(): string {
  // Default to wexley.json
  let personalityFile = DEFAULT_PERSONA_PATH;
  
  // Process command line arguments
  if (process.argv.length >= 3) {
    // First check for --persona flag
    for (let i = 0; i < process.argv.length - 1; i++) {
      if (process.argv[i] === '--persona') {
        personalityFile = process.argv[i + 1];
        logger.info(`Using personality file from --persona flag: ${personalityFile}`);
        break;
      }
    }
    
    // Also check the last argument in case it's a direct path
    const lastArg = process.argv[process.argv.length - 1];
    if (lastArg.endsWith('.json') && lastArg !== path.basename(personalityFile)) {
      personalityFile = lastArg;
      logger.info(`Using personality file from last argument: ${personalityFile}`);
    }
  }
  
  // Make sure the file exists
  if (!fs.existsSync(personalityFile)) {
    logger.warn(`Persona file not found: ${personalityFile}, falling back to default`);
    personalityFile = DEFAULT_PERSONA_PATH;
    
    if (!fs.existsSync(personalityFile)) {
      logger.error(`Default persona file not found: ${personalityFile}`);
      process.exit(1);
    }
  }
  
  return personalityFile;
}

/**
 * Create base agent
 */
function createBaseAgent(personality: EnhancedPersonality): Agent {
  // Get name from personality or use a default
  const agentName = personality.persona?.name || path.basename(DEFAULT_PERSONA_PATH, '.json');
  
  // Create agent configuration
  const agentConfig: EnhancedAgentConfig = PersonalityUtils.createAgentConfig(
    agentName,
    personality,
    AgentRole.ASSISTANT,
    process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
  );
  
  // Generate system prompt
  const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);
  
  // Create the agent
  return new Agent({
    name: agentConfig.name,
    role: agentConfig.role,
    personality: PersonalityUtils.simplifyPersonality(personality),
    goals: personality.motivation.goals.shortTermGoals,
    systemPrompt,
    model: agentConfig.model
  });
}

/**
 * Create Twitter connector
 */
function createTwitterConnector(): TwitterConnector {
  // Extract Twitter-specific topics from environment variables or use defaults
  const monitorKeywords = process.env.MONITOR_KEYWORDS?.split(',') || [
    'crypto', 
    'bitcoin', 
    'ethereum', 
    'AI', 
    'artificial intelligence', 
    'machine learning',
    'market analysis'
  ];
  
  const monitorUsers = process.env.MONITOR_USERS?.split(',') || [
    'sama',
    'AnthropicAI',
    'sama_shah'
  ];
  
  // Create Twitter connector
  return new TwitterConnector({
    username: process.env.TWITTER_USERNAME,
    password: process.env.TWITTER_PASSWORD,
    email: process.env.TWITTER_EMAIL,
    
    // Optional Twitter API credentials
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET_KEY,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    
    // Monitoring configuration
    monitorKeywords,
    monitorUsers,
    autoReply: process.env.AUTO_REPLY === 'true',
    pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000
  });
}

/**
 * Create autonomous agent
 */
function createAutonomousAgent(baseAgent: Agent): AutonomousAgent {
  return new AutonomousAgent({
    baseAgent,
    healthCheckIntervalMinutes: 15,
    maxConsecutiveErrors: 5,
    stateStoragePath: AGENT_STATE_DIR,
    enableAutoRecovery: true,
    enableContinuousMode: true
  });
}

/**
 * Create Twitter content manager
 */
function createContentManager(agent: AutonomousAgent, twitter: TwitterConnector): TwitterContentManager {
  // Parse content preferences from environment
  const contentCategories = process.env.CONTENT_CATEGORIES?.split(',') || [
    'market_analysis',
    'technical',
    'news',
    'opinion',
    'prediction'
  ];
  
  const preferredTopics = process.env.PREFERRED_TOPICS?.split(',') || [
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
  
  // Parse posting schedule
  const preferredPostingTimes = process.env.PREFERRED_POSTING_TIMES
    ? process.env.PREFERRED_POSTING_TIMES.split(',').map(h => parseInt(h))
    : [8, 12, 16, 20]; // Default to 8am, 12pm, 4pm, 8pm
  
  const tweetsPerDay = process.env.TWEETS_PER_DAY 
    ? parseInt(process.env.TWEETS_PER_DAY)
    : 4;
  
  // Parse auto-response settings
  const enableAutoResponses = process.env.ENABLE_AUTO_RESPONSES === 'true';
  const autoResponseWhitelist = process.env.AUTO_RESPONSE_WHITELIST?.split(',') || [];
  
  // Parse research settings
  const researchInterval = process.env.RESEARCH_INTERVAL 
    ? parseInt(process.env.RESEARCH_INTERVAL)
    : 60; // Default to hourly
  
  const researchTopics = process.env.RESEARCH_TOPICS?.split(',') || preferredTopics;
  
  // Create and return the content manager
  return new TwitterContentManager({
    twitterConnector: twitter,
    agent,
    contentCategories,
    preferredPostingTimes,
    tweetsPerDay,
    preferredTopics,
    contentRatio: {
      original: 60,
      reactive: 30,
      curated: 10
    },
    enableAutoResponses,
    autoResponseWhitelist,
    researchInterval,
    researchTopics,
    dataStoragePath: TWITTER_DATA_DIR
  });
}

/**
 * Display welcome message
 */
function displayWelcomeMessage(personality: EnhancedPersonality): void {
  const agentName = personality.persona?.name || 'Twitter Agent';
  const occupation = personality.persona.demographics?.occupation || 'AI Assistant';
  const model = process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620';
  
  console.log(`\n=== ${agentName} Autonomous Twitter Agent ===`);
  console.log(`Personality: ${occupation}`);
  console.log(`Connected as: ${process.env.TWITTER_USERNAME}`);
  console.log(`Using model: ${model}`);
  console.log(`Monitoring: ${twitterConnector.config.monitorKeywords?.length || 0} keywords, ${twitterConnector.config.monitorUsers?.length || 0} users\n`);
}

/**
 * Start the interactive CLI
 */
function startCLI(): void {
  showMainMenu();
}

/**
 * Show main menu
 */
function showMainMenu(): void {
  console.log('\nAutonomous Twitter Agent - Commands:');
  console.log('1: Start autonomous mode');
  console.log('2: Post a tweet');
  console.log('3: Manage content calendar');
  console.log('4: View tweets and ideas');
  console.log('5: View performance metrics');
  console.log('6: Agent settings');
  console.log('7: Manual Twitter actions');
  console.log('8: Exit');
  
  safeQuestion('\nEnter command number: ', handleMainMenuCommand);
}

/**
 * Handle main menu command
 */
async function handleMainMenuCommand(input: string): Promise<void> {
  try {
    switch (input.trim()) {
      case '1': // Start autonomous mode
        await startAutonomousMode();
        break;
      case '2': // Post a tweet
        await postTweetCommand();
        break;
      case '3': // Manage content calendar
        manageContentCalendar();
        break;
      case '4': // View tweets and ideas
        viewTweetsAndIdeas();
        break;
      case '5': // View performance metrics
        viewPerformanceMetrics();
        break;
      case '6': // Agent settings
        agentSettings();
        break;
      case '7': // Manual Twitter actions
        manualTwitterActions();
        break;
      case '8': // Exit
        await shutdown();
        process.exit(0);
        break;
      default:
        console.log('Invalid command');
        showMainMenu();
        break;
    }
  } catch (error) {
    logger.error('Error handling command', error);
    showMainMenu();
  }
}

/**
 * Start autonomous mode
 */
async function startAutonomousMode(): Promise<void> {
  safeQuestion('Start autonomous mode? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      if (running) {
        console.log('Autonomous mode is already active');
        showMainMenu();
        return;
      }
      
      try {
        console.log('Starting autonomous mode...');
        
        // Start the autonomous agent
        autonomousAgent.start();
        
        // Start the content manager
        contentManager.start();
        
        running = true;
        
        console.log('Autonomous mode activated successfully!');
        
        // Add new commands for autonomous mode
        console.log('\nAutonomous Mode Commands:');
        console.log('1: View agent status');
        console.log('2: Generate research on a topic');
        console.log('3: Create a tweet now');
        console.log('4: Stop autonomous mode');
        console.log('5: Back to main menu');
        
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
      } catch (error) {
        logger.error('Error starting autonomous mode', error);
        showMainMenu();
      }
    } else {
      console.log('Autonomous mode cancelled');
      showMainMenu();
    }
  });
}

/**
 * Handle autonomous mode command
 */
async function handleAutonomousCommand(input: string): Promise<void> {
  try {
    switch (input.trim()) {
      case '1': // View agent status
        displayAgentStatus();
        break;
      case '2': // Generate research on a topic
        generateResearch();
        break;
      case '3': // Create a tweet now
        createTweetNow();
        break;
      case '4': // Stop autonomous mode
        await stopAutonomousMode();
        break;
      case '5': // Back to main menu
        showMainMenu();
        break;
      default:
        console.log('Invalid command');
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
        break;
    }
  } catch (error) {
    logger.error('Error handling autonomous command', error);
    safeQuestion('\nEnter command number: ', handleAutonomousCommand);
  }
}

/**
 * Display agent status
 */
function displayAgentStatus(): void {
  if (!running) {
    console.log('Agent is not running');
    showMainMenu();
    return;
  }
  
  const status = autonomousAgent.getStatus();
  console.log('\n=== Agent Status ===');
  console.log(`Name: ${status.name}`);
  console.log(`Running: ${status.running}`);
  console.log(`Last Active: ${status.lastActive.toLocaleString()}`);
  console.log(`Uptime: ${status.uptime.toFixed(2)} hours`);
  console.log(`Queue Length: ${status.queueLength}`);
  
  console.log('\nOperation Statistics:');
  console.log(`Total: ${status.operations.total}`);
  console.log(`Successful: ${status.operations.successful}`);
  console.log(`Failed: ${status.operations.failed}`);
  console.log(`Success Rate: ${status.operations.successRate.toFixed(2)}%`);
  
  // Get next scheduled tweet
  const nextTweet = contentManager.getTweetIdeas({ status: 'approved' })[0];
  if (nextTweet && nextTweet.scheduledFor) {
    console.log(`\nNext scheduled tweet at: ${new Date(nextTweet.scheduledFor).toLocaleString()}`);
    console.log(`Topic: ${nextTweet.topic}`);
  } else {
    console.log('\nNo tweets currently scheduled');
  }
  
  safeQuestion('\nEnter command number: ', handleAutonomousCommand);
}

/**
 * Generate research on a topic
 */
function generateResearch(): void {
  safeQuestion('Enter topic to research: ', async (topic) => {
    try {
      console.log(`Generating research on "${topic}"...`);
      
      // Create a Tavily search tool
      const searchTool = new TavilySearchTool();
      
      // Search for the topic
      const searchResults = await searchTool.execute({
        query: topic,
        maxResults: 5,
        includeAnswer: true
      });
      
      // Extract insights using agent
      const prompt = `
        Analyze these search results about "${topic}" and extract 5 key insights:
        
        ${JSON.stringify(searchResults.results, null, 2)}
        
        For each insight:
        1. Focus on factual information, trends, or significant developments
        2. Highlight what makes this notable for someone in your field
        3. Be specific rather than general
        4. Format each insight as a separate point
        
        Return only the numbered insights, one per line.
      `;
      
      console.log('Analyzing research results...');
      const result = await autonomousAgent.runOperation<{ response: string }>(prompt);
      
      console.log('\n=== Research Insights ===');
      console.log(result?.response || 'No insights found');
      
      safeQuestion('\nGenerate a tweet from this research? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          console.log('Generating tweet...');
          
          const tweetPrompt = `
            Create a tweet based on this research about ${topic}:
            
            ${result?.response || 'Recent research on ' + topic}
            
            The tweet should:
            1. Present one key insight in your analytical, knowledgeable style
            2. Add your unique perspective or prediction
            3. Be under 280 characters
            4. Include 1-2 relevant hashtags
            
            Only return the tweet text, no quotation marks or other formatting.
          `;
          
          const tweetResult = await autonomousAgent.runOperation<{ response: string }>(tweetPrompt);
          const tweetContent = tweetResult?.response || `Interesting research on ${topic}. #AI #Crypto`;
          
          console.log('\nDraft tweet:');
          console.log(tweetContent);
          
          safeQuestion('Post this tweet now? (yes/no): ', async (postAnswer) => {
            if (postAnswer.toLowerCase() === 'yes' || postAnswer.toLowerCase() === 'y') {
              const tweetId = await twitterConnector.tweet(tweetContent);
              console.log(`Tweet posted! ID: ${tweetId}`);
            } else {
              // Save as draft
              contentManager.addTweetIdea({
                topic,
                content: tweetContent,
                priority: 'high',
                status: 'draft',
                tags: ['research']
              });
              console.log('Tweet saved as draft');
            }
            
            safeQuestion('\nEnter command number: ', handleAutonomousCommand);
          });
        } else {
          safeQuestion('\nEnter command number: ', handleAutonomousCommand);
        }
      });
    } catch (error) {
      logger.error('Error generating research', error);
      safeQuestion('\nEnter command number: ', handleAutonomousCommand);
    }
  });
}

/**
 * Create a tweet now
 */
function createTweetNow(): void {
  safeQuestion('Enter topic for tweet: ', async (topic) => {
    try {
      console.log(`Generating tweet about "${topic}"...`);
      
      const prompt = `
        Create a thoughtful tweet about: "${topic}"
        
        The tweet should:
        1. Reflect your personality, expertise, and Twitter style
        2. Be insightful and provide value to your audience
        3. Be under 280 characters
        4. Include relevant hashtags if appropriate
        
        Only return the tweet text, no quotation marks or other formatting.
      `;
      
      const result = await autonomousAgent.runOperation<{ response: string }>(prompt);
      const tweetContent = result?.response || `Sharing my thoughts on ${topic}. #Crypto #AI`;
      
      console.log('\nDraft tweet:');
      console.log(tweetContent);
      
      safeQuestion('Post this tweet now? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          const tweetId = await twitterConnector.tweet(tweetContent);
          console.log(`Tweet posted! ID: ${tweetId}`);
          
          // Record in content manager
          contentManager.addTweetIdea({
            topic,
            content: tweetContent,
            priority: 'medium',
            status: 'posted',
            tags: ['manual']
          });
        } else {
          // Save as draft
          contentManager.addTweetIdea({
            topic,
            content: tweetContent,
            priority: 'medium',
            status: 'draft',
            tags: ['manual']
          });
          console.log('Tweet saved as draft');
        }
        
        safeQuestion('\nEnter command number: ', handleAutonomousCommand);
      });
    } catch (error) {
      logger.error('Error creating tweet', error);
      safeQuestion('\nEnter command number: ', handleAutonomousCommand);
    }
  });
}

/**
 * Stop autonomous mode
 */
async function stopAutonomousMode(): Promise<void> {
  safeQuestion('Stop autonomous mode? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      try {
        console.log('Stopping autonomous mode...');
        
        // Stop the autonomous agent
        autonomousAgent.stop();
        
        // Stop the content manager
        contentManager.stop();
        
        running = false;
        
        console.log('Autonomous mode stopped successfully');
        showMainMenu();
      } catch (error) {
        logger.error('Error stopping autonomous mode', error);
        showMainMenu();
      }
    } else {
      safeQuestion('\nEnter command number: ', handleAutonomousCommand);
    }
  });
}

/**
 * Post a tweet
 */
async function postTweetCommand(): Promise<void> {
  safeQuestion('Enter topic or news to tweet about: ', async (topic) => {
    try {
      console.log(`Generating tweet about "${topic}"...`);
      
      const result = await baseAgent.run({
        task: `Create a thoughtful tweet about: "${topic}"
              The tweet should reflect your personality, expertise, and Twitter style.
              It should be under 280 characters and include relevant hashtags if appropriate.
              Only return the tweet text, no quotation marks or other formatting.`
      });
      
      console.log('\nDraft tweet:');
      console.log(result.response);
      
      safeQuestion('Post this tweet? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          try {
            const tweetId = await twitterConnector.tweet(result.response);
            console.log(`Tweet posted successfully! ID: ${tweetId}`);
          } catch (error) {
            logger.error('Error posting tweet', error);
          }
        } else {
          console.log('Tweet cancelled');
        }
        
        showMainMenu();
      });
    } catch (error) {
      logger.error('Error generating tweet', error);
      showMainMenu();
    }
  });
}

/**
 * Manage content calendar
 */
function manageContentCalendar(): void {
  console.log('\nContent Calendar Management:');
  console.log('1: View upcoming content');
  console.log('2: Add calendar entry');
  console.log('3: Plan content for a date');
  console.log('4: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleCalendarCommand);
}

/**
 * Handle calendar command
 */
function handleCalendarCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View upcoming content
      viewUpcomingContent();
      break;
    case '2': // Add calendar entry
      addCalendarEntry();
      break;
    case '3': // Plan content for a date
      planContentForDate();
      break;
    case '4': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      manageContentCalendar();
      break;
  }
}

/**
 * View upcoming content
 */
function viewUpcomingContent(): void {
  const calendar = contentManager.getCalendarEntries(14); // Next 2 weeks
  
  if (calendar.length === 0) {
    console.log('\nNo upcoming content planned in the next 14 days');
  } else {
    console.log('\n=== Upcoming Content ===');
    calendar.forEach((entry, index) => {
      console.log(`${index + 1}. ${new Date(entry.date).toLocaleString()}: ${entry.topic} (${entry.status})`);
    });
  }
  
  manageContentCalendar();
}

/**
 * Add calendar entry
 */
function addCalendarEntry(): void {
  safeQuestion('Enter topic: ', (topic) => {
    safeQuestion('Enter category: ', (category) => {
      safeQuestion('Enter date (YYYY-MM-DD): ', (dateStr) => {
        safeQuestion('Enter time (HH:MM): ', (timeStr) => {
          try {
            // Parse date
            const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
            const [hour, minute] = timeStr.split(':').map(num => parseInt(num));
            
            const date = new Date(year, month - 1, day, hour, minute);
            
            // Add calendar entry
            contentManager.addCalendarEntry({
              date: date.getTime(),
              topic,
              category,
              status: 'planned',
              notes: 'Added manually'
            });
            
            console.log(`\nCalendar entry added for ${date.toLocaleString()}`);
          } catch (error) {
            logger.error('Error adding calendar entry', error);
          }
          
          manageContentCalendar();
        });
      });
    });
  });
}

/**
 * Plan content for a date
 */
function planContentForDate(): void {
  safeQuestion('Enter date (YYYY-MM-DD): ', async (dateStr) => {
    try {
      // Parse date
      const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
      const date = new Date(year, month - 1, day);
      
      // Get the day of week
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
      
      // Generate a content plan
      console.log(`\nGenerating content plan for ${dayOfWeek}, ${date.toLocaleDateString()}...`);
      
      const prompt = `
        Create a content plan for Twitter posts for ${dayOfWeek}, ${date.toLocaleDateString()}.
        
        Suggest 4 tweet topics that would be relevant and valuable for your audience,
        considering recent or upcoming events in finance, crypto, and AI.
        
        For each topic:
        1. Provide a brief topic title (5-10 words)
        2. Suggest the best time of day to post (morning, afternoon, evening)
        3. Suggest a content category (analysis, news, opinion, prediction)
        
        Format each topic on a separate line as: "Topic: [title] | Time: [time] | Category: [category]"
      `;
      
      const result = await baseAgent.run({ task: prompt });
      console.log('\nSuggested Content Plan:');
      console.log(result.response);
      
      safeQuestion('\nAdd these topics to your calendar? (yes/no): ', (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          try {
            // Parse the topics
            const topics = result.response
              .split('\n')
              .filter(line => line.trim().length > 0 && line.includes('Topic:'))
              .map(line => {
                const topicMatch = line.match(/Topic: (.+?) \|/);
                const timeMatch = line.match(/Time: (.+?) \|/);
                const categoryMatch = line.match(/Category: (.+?)(\n|$)/);
                
                const topic = topicMatch ? topicMatch[1].trim() : 'Unnamed topic';
                const timeStr = timeMatch ? timeMatch[1].trim() : 'morning';
                const category = categoryMatch ? categoryMatch[1].trim() : 'general';
                
                // Set hours based on time of day
                let hours = 9; // Default to morning
                if (timeStr.includes('afternoon')) hours = 14;
                if (timeStr.includes('evening')) hours = 19;
                
                // Create a date object for this time
                const postDate = new Date(date);
                postDate.setHours(hours, 0, 0, 0);
                
                return {
                  date: postDate.getTime(),
                  topic,
                  category,
                  status: 'planned' as 'planned' | 'drafted' | 'posted' | 'skipped'
                };
              });
            
            // Add to calendar
            topics.forEach(topic => {
              contentManager.addCalendarEntry(topic);
            });
            
            console.log(`\nAdded ${topics.length} topics to your content calendar`);
          } catch (error) {
            logger.error('Error adding topics to calendar', error);
          }
        } else {
          console.log('Calendar update cancelled');
        }
        
        manageContentCalendar();
      });
    } catch (error) {
      logger.error('Error planning content', error);
      manageContentCalendar();
    }
  });
}

/**
 * View tweets and ideas
 */
function viewTweetsAndIdeas(): void {
  console.log('\nView Tweets and Ideas:');
  console.log('1: View draft tweets');
  console.log('2: View scheduled tweets');
  console.log('3: View posted tweets');
  console.log('4: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleTweetsCommand);
}

/**
 * Handle tweets and ideas command
 */
function handleTweetsCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View draft tweets
      viewTweetsByStatus('draft');
      break;
    case '2': // View scheduled tweets
      viewTweetsByStatus('approved');
      break;
    case '3': // View posted tweets
      viewTweetsByStatus('posted');
      break;
    case '4': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      viewTweetsAndIdeas();
      break;
  }
}

/**
 * View tweets by status
 */
function viewTweetsByStatus(status: string): void {
  const tweets = contentManager.getTweetIdeas({ status: status as any });
  
  if (tweets.length === 0) {
    console.log(`\nNo tweets with status "${status}"`);
  } else {
    console.log(`\n=== ${status.charAt(0).toUpperCase() + status.slice(1)} Tweets ===`);
    tweets.forEach((tweet, index) => {
      console.log(`\n${index + 1}. Topic: ${tweet.topic}`);
      console.log(`Content: ${tweet.content}`);
      if (tweet.scheduledFor) {
        console.log(`Scheduled for: ${new Date(tweet.scheduledFor).toLocaleString()}`);
      }
      console.log(`Tags: ${tweet.tags?.join(', ') || 'none'}`);
    });
  }
  
  viewTweetsAndIdeas();
}

/**
 * View performance metrics
 */
function viewPerformanceMetrics(): void {
  const stats = contentManager.getEngagementStats();
  
  console.log('\n=== Performance Metrics ===');
  console.log(`Total Tweets: ${stats.totalTweets}`);
  console.log(`Average Likes: ${stats.avgLikes.toFixed(2)}`);
  console.log(`Average Retweets: ${stats.avgRetweets.toFixed(2)}`);
  console.log(`Average Replies: ${stats.avgReplies.toFixed(2)}`);
  
  if (stats.topPerformingTweets.length > 0) {
    console.log('\nTop Performing Tweets:');
    stats.topPerformingTweets.forEach((tweet, index) => {
      console.log(`\n${index + 1}. ${tweet.content.substring(0, 50)}...`);
      if (tweet.engagement) {
        console.log(`   Likes: ${tweet.engagement.likes}, Retweets: ${tweet.engagement.retweets}, Replies: ${tweet.engagement.replies}`);
      }
    });
  }
  
  showMainMenu();
}

/**
 * Agent settings
 */
function agentSettings(): void {
  console.log('\nAgent Settings:');
  console.log('1: View current settings');
  console.log('2: Configure content preferences');
  console.log('3: Configure auto-responses');
  console.log('4: Configure research');
  console.log('5: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleSettingsCommand);
}

/**
 * Handle settings command
 */
function handleSettingsCommand(input: string): void {
  switch (input.trim()) {
    case '1': // View current settings
      viewCurrentSettings();
      break;
    case '2': // Configure content preferences
      configureContentPreferences();
      break;
    case '3': // Configure auto-responses
      configureAutoResponses();
      break;
    case '4': // Configure research
      configureResearch();
      break;
    case '5': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      agentSettings();
      break;
  }
}

/**
 * View current settings
 */
function viewCurrentSettings(): void {
  console.log('\n=== Current Settings ===');
  
  // Twitter settings
  console.log('\nTwitter Settings:');
  console.log(`Username: ${process.env.TWITTER_USERNAME}`);
  console.log(`Auto-Reply: ${process.env.AUTO_REPLY === 'true' ? 'Enabled' : 'Disabled'}`);
  console.log(`Poll Interval: ${process.env.POLL_INTERVAL || '60000'} ms`);
  
  // Content preferences
  console.log('\nContent Preferences:');
  console.log(`Tweets Per Day: ${process.env.TWEETS_PER_DAY || '4'}`);
  console.log(`Preferred Posting Times: ${process.env.PREFERRED_POSTING_TIMES || '8,12,16,20'}`);
  
  // Auto-response settings
  console.log('\nAuto-Response Settings:');
  console.log(`Enabled: ${process.env.ENABLE_AUTO_RESPONSES === 'true' ? 'Yes' : 'No'}`);
  console.log(`Whitelist: ${process.env.AUTO_RESPONSE_WHITELIST || 'None'}`);
  
  // Research settings
  console.log('\nResearch Settings:');
  console.log(`Interval: ${process.env.RESEARCH_INTERVAL || '60'} minutes`);
  console.log(`Topics: ${process.env.RESEARCH_TOPICS || 'Default topics'}`);
  
  agentSettings();
}

/**
 * Configure content preferences
 */
function configureContentPreferences(): void {
  // This is a placeholder - in a real implementation, you would provide settings UI
  console.log('\nTo configure content preferences, edit the .env file and set these variables:');
  console.log('- CONTENT_CATEGORIES: comma-separated list of content categories');
  console.log('- PREFERRED_TOPICS: comma-separated list of preferred topics');
  console.log('- PREFERRED_POSTING_TIMES: comma-separated list of hours (0-23)');
  console.log('- TWEETS_PER_DAY: number of tweets per day');
  console.log('\nAfter editing, restart the agent for changes to take effect.');
  
  agentSettings();
}

/**
 * Configure auto-responses
 */
function configureAutoResponses(): void {
  // This is a placeholder - in a real implementation, you would provide settings UI
  console.log('\nTo configure auto-responses, edit the .env file and set these variables:');
  console.log('- ENABLE_AUTO_RESPONSES: "true" or "false"');
  console.log('- AUTO_RESPONSE_WHITELIST: comma-separated list of usernames');
  console.log('\nAfter editing, restart the agent for changes to take effect.');
  
  agentSettings();
}

/**
 * Configure research
 */
function configureResearch(): void {
  // This is a placeholder - in a real implementation, you would provide settings UI
  console.log('\nTo configure research, edit the .env file and set these variables:');
  console.log('- RESEARCH_INTERVAL: minutes between research operations');
  console.log('- RESEARCH_TOPICS: comma-separated list of research topics');
  console.log('\nAfter editing, restart the agent for changes to take effect.');
  
  agentSettings();
}

/**
 * Manual Twitter actions
 */
function manualTwitterActions(): void {
  console.log('\nManual Twitter Actions:');
  console.log('1: Search tweets');
  console.log('2: Get trending topics');
  console.log('3: Get latest tweets from user');
  console.log('4: Like a tweet');
  console.log('5: Retweet a tweet');
  console.log('6: Follow a user');
  console.log('7: Back to main menu');
  
  safeQuestion('\nEnter command number: ', handleTwitterActionsCommand);
}

/**
 * Handle Twitter actions command
 */
function handleTwitterActionsCommand(input: string): void {
  switch (input.trim()) {
    case '1': // Search tweets
      searchTweets();
      break;
    case '2': // Get trending topics
      getTrends();
      break;
    case '3': // Get latest tweets from user
      getUserTweets();
      break;
    case '4': // Like a tweet
      likeTweet();
      break;
    case '5': // Retweet a tweet
      retweetTweet();
      break;
    case '6': // Follow a user
      followUser();
      break;
    case '7': // Back to main menu
      showMainMenu();
      break;
    default:
      console.log('Invalid command');
      manualTwitterActions();
      break;
  }
}

/**
 * Search tweets
 */
function searchTweets(): void {
  safeQuestion('Enter search query: ', async (query) => {
    try {
      const tweets = await twitterConnector.searchTweets(query, 5);
      
      console.log(`\nFound ${tweets.length} tweets matching "${query}":`);
      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. @${tweet.author.username}: ${tweet.text}`);
      });
    } catch (error) {
      logger.error('Error searching tweets', error);
    }
    
    manualTwitterActions();
  });
}

/**
 * Get trending topics
 */
async function getTrends(): Promise<void> {
  try {
    const trends = await twitterConnector.getTrends();
    
    console.log('\nCurrent Twitter trends:');
    trends.slice(0, 10).forEach((trend, index) => {
      console.log(`${index + 1}. ${trend.name}${trend.tweet_volume ? ` (${trend.tweet_volume} tweets)` : ''}`);
    });
  } catch (error) {
    logger.error('Error getting trends', error);
  }
  
  manualTwitterActions();
}

/**
 * Get latest tweets from user
 */
function getUserTweets(): void {
  safeQuestion('Enter Twitter username: ', async (username) => {
    try {
      const tweets = await twitterConnector.getUserTweets(username, 5);
      
      console.log(`\nLatest tweets from @${username}:`);
      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. ${tweet.text}`);
      });
    } catch (error) {
      logger.error(`Error getting tweets for user ${username}`, error);
    }
    
    manualTwitterActions();
  });
}

/**
 * Like a tweet
 */
function likeTweet(): void {
  safeQuestion('Enter tweet ID to like: ', async (tweetId) => {
    try {
      await twitterConnector.like(tweetId);
      console.log('Tweet liked successfully!');
    } catch (error) {
      logger.error('Error liking tweet', error);
    }
    
    manualTwitterActions();
  });
}

/**
 * Retweet a tweet
 */
function retweetTweet(): void {
  safeQuestion('Enter tweet ID to retweet: ', async (tweetId) => {
    try {
      await twitterConnector.retweet(tweetId);
      console.log('Tweet retweeted successfully!');
    } catch (error) {
      logger.error('Error retweeting tweet', error);
    }
    
    manualTwitterActions();
  });
}

/**
 * Follow a user
 */
function followUser(): void {
  safeQuestion('Enter username to follow: ', async (username) => {
    try {
      await twitterConnector.follow(username);
      console.log(`Now following @${username}`);
    } catch (error) {
      logger.error('Error following user', error);
    }
    
    manualTwitterActions();
  });
}

/**
 * Shutdown
 */
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  
  if (running) {
    // Stop autonomous agent
    autonomousAgent.stop();
    
    // Stop content manager
    contentManager.stop();
  }
  
  // Disconnect from Twitter
  await twitterConnector.disconnect();
  
  // Close readline interface
  if (rl) rl.close();
  
  console.log('Shutdown complete');
}

// Run the main function
main();