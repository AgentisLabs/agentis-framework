import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Agent } from '../src/core/agent';
import { TwitterConnector } from '../src/platform-connectors/twitter-connector';
import { Logger } from '../src/utils/logger';
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
const logger = new Logger('TwitterPersonalityAgent');

// Check environment variables
const requiredEnvVars = ['TWITTER_USERNAME', 'TWITTER_PASSWORD', 'ANTHROPIC_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Set default personality to wexley.json for testing purposes
let personalityFile = path.join(__dirname, '../personas/wexley.json');

// Log all arguments to debug the issue
logger.debug('Command line arguments:', process.argv);

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
  
  // Also check the last argument in case it's a direct path (useful for debugging)
  const lastArg = process.argv[process.argv.length - 1];
  if (lastArg.endsWith('.json') && lastArg !== path.basename(personalityFile)) {
    personalityFile = lastArg;
    logger.info(`Using personality file from last argument: ${personalityFile}`);
  }
}

// Make sure the file exists before trying to load it
if (!fs.existsSync(personalityFile)) {
  logger.warn(`Persona file not found: ${personalityFile}, falling back to default`);
  personalityFile = path.join(__dirname, '../personas/wexley.json');
  
  // If even the default doesn't exist, try astra as a last resort
  if (!fs.existsSync(personalityFile)) {
    logger.warn(`Default persona also not found, trying astra.json`);
    personalityFile = path.join(__dirname, '../personas/astra.json');
  }
}

logger.info(`Loading personality from ${personalityFile}`);
const personality = PersonalityUtils.loadPersonalityFromJson(personalityFile);

// Create an enhanced agent configuration
// Use the persona name from the personality file instead of hardcoding "Astra"
const personaName = personality.persona?.name || path.basename(personalityFile, '.json');
const agentConfig: EnhancedAgentConfig = PersonalityUtils.createAgentConfig(
  personaName, 
  personality, 
  AgentRole.ASSISTANT,
  process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
);

// Generate system prompt from the enhanced personality
const systemPrompt = PersonalityUtils.generateSystemPrompt(agentConfig);

// Create the agent with our enhanced personality
const agent = new Agent({
  name: agentConfig.name,
  role: agentConfig.role,
  personality: PersonalityUtils.simplifyPersonality(personality),
  goals: personality.motivation.goals.shortTermGoals,
  systemPrompt,
  model: agentConfig.model
});

// Configure the Twitter connector
const twitterConnector = new TwitterConnector({
  username: process.env.TWITTER_USERNAME,
  password: process.env.TWITTER_PASSWORD,
  email: process.env.TWITTER_EMAIL,
  
  // Optional Twitter API credentials for additional features
  apiKey: process.env.TWITTER_API_KEY,
  apiSecret: process.env.TWITTER_API_SECRET_KEY,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  
  // Monitor relevant keywords based on agent's personality
  monitorKeywords: personality.content.preferences.topics.expertise || [
    'AI ethics', 
    'algorithmic bias', 
    'responsible AI', 
    'AI regulation'
  ],
  
  // Monitor influential accounts in the AI ethics space
  monitorUsers: process.env.MONITOR_USERS?.split(',') || [
    'timnitGebru',
    'mmitchell_ai',
    'EthicalAI',     // placeholder, replace with real accounts
    'ResponsibleTech' // placeholder, replace with real accounts
  ],
  
  // Configure auto-reply
  autoReply: process.env.AUTO_REPLY === 'true',
  
  // Poll interval in milliseconds (default: 60000 = 1 minute)
  pollInterval: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : 60000
});

// Event handlers for tweets
twitterConnector.on('tweet', async (tweet) => {
  logger.info(`Received tweet from @${tweet.author.username}: ${tweet.text}`);
  
  // If auto-reply is disabled, we can handle tweets manually here
  if (process.env.AUTO_REPLY !== 'true') {
    try {
      // Generate a response based on agent's personality
      const result = await agent.run({
        task: `As ${agentConfig.name}, analyze this tweet from @${tweet.author.username} about AI/tech ethics: "${tweet.text}"
               Determine if and how you should engage with it based on your personality and expertise.
               If you should respond, draft a thoughtful reply in your characteristic style.
               If you should not respond, explain why.`,
        conversation: {
          id: `twitter-analysis-${tweet.id}`,
          messages: [],
          created: Date.now(),
          updated: Date.now(),
          metadata: { tweet }
        }
      });
      
      logger.info(`Analysis: ${result.response}`);
      
      // Check if the response contains a reply
      if (result.response.includes('REPLY:')) {
        const replyText = result.response.split('REPLY:')[1].trim();
        await twitterConnector.tweet(replyText, tweet.id);
        logger.info(`Replied to tweet: ${replyText}`);
      } 
      // Check if we should like the tweet
      else if (result.response.toLowerCase().includes('like this tweet') || 
               result.response.toLowerCase().includes('should like')) {
        await twitterConnector.like(tweet.id);
        logger.info(`Liked tweet from @${tweet.author.username}`);
      }
    } catch (error) {
      logger.error('Error handling tweet', error);
    }
  }
});

twitterConnector.on('keyword_match', async (tweet) => {
  logger.info(`Keyword match in tweet from @${tweet.author.username}: ${tweet.text}`);
  
  // Handle keyword matches that weren't captured by user monitoring
  try {
    // Generate a response based on agent's personality
    const result = await agent.run({
      task: `As ${agentConfig.name}, review this tweet containing keywords related to AI ethics: "${tweet.text}" by @${tweet.author.username}
             Determine if this discussion is relevant to your expertise and if you should engage.
             If relevant, draft a thoughtful, nuanced response that adds value to the conversation.
             Consider: Is this a mainstream conversation where your perspective would be valuable? 
             Is there a misconception you can clarify? Is there additional context you can provide?
             If you should not engage, briefly explain why.`,
      conversation: {
        id: `keyword-match-${tweet.id}`,
        messages: [],
        created: Date.now(),
        updated: Date.now(),
        metadata: { tweet }
      }
    });
    
    // Check if we should engage with this tweet
    if (result.response.includes('ENGAGE:')) {
      const replyText = result.response.split('ENGAGE:')[1].trim();
      await twitterConnector.tweet(replyText, tweet.id);
      logger.info(`Engaged with keyword match: ${replyText}`);
    } 
    else {
      logger.info(`Decided not to engage with keyword match: ${result.response.substring(0, 100)}...`);
    }
  } catch (error) {
    logger.error('Error handling keyword match', error);
  }
});

// We'll create the readline interface later, inside the main function
let rl: ReturnType<typeof createInterface> | null;

// Prompt options
function showPrompt() {
  console.log('\nTwitter Agent - Commands:');
  console.log('1: Post a tweet');
  console.log('2: Search tweets');
  console.log('3: Get trending topics');
  console.log('4: Get latest tweets from user');
  console.log('5: Generate content ideas');
  console.log('6: Ask Grok');
  console.log('7: Show agent personality summary');
  console.log('8: Save personality to a new JSON file');
  console.log('9: Exit');
  
  if (rl) {
    safeQuestion('\nEnter command number: ', handleCommand);
  } else {
    console.error('Error: Readline interface not initialized.');
    process.exit(1);
  }
}

// Command handler
async function handleCommand(input: string) {
  try {
    switch (input.trim()) {
      case '1': // Post a tweet
        await postTweet();
        break;
      case '2': // Search tweets
        await searchTweets();
        break;
      case '3': // Get trending topics
        await getTrends();
        break;
      case '4': // Get latest tweets from user
        await getUserTweets();
        break;
      case '5': // Generate content ideas
        await generateContentIdeas();
        break;
      case '6': // Ask Grok
        await askGrok();
        break;
      case '7': // Show agent personality
        showAgentPersonality();
        break;
      case '8': // Save personality to a new JSON file
        await savePersonalityToJsonFile();
        break;
      case '9': // Exit
        await exitProgram();
        return;
      default:
        console.log('Invalid command');
        showPrompt();
        break;
    }
  } catch (error) {
    logger.error('Error handling command', error);
    showPrompt();
  }
}

// Helper function to safely use readline
function safeQuestion(prompt: string, callback: (answer: string) => void): void {
  if (!rl) {
    console.error('Error: Readline interface not initialized');
    process.exit(1);
    return;
  }
  rl.question(prompt, callback);
}

// Command implementations
async function postTweet() {
  safeQuestion('Enter topic or news to tweet about: ', async (topic) => {
    try {
      try {
        const result = await agent.run({
          task: `As ${agentConfig.name}, craft a thoughtful tweet about: "${topic}"
                 Make sure it reflects your personality, expertise in AI ethics, and Twitter style.
                 The tweet should be under 280 characters and include relevant hashtags if appropriate.
                 If this topic doesn't align with your interests or expertise, suggest an alternative angle that would be more appropriate.`
        });
        
        console.log('\nDraft tweet:');
        console.log(result.response);
        
        safeQuestion('Post this tweet? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            const tweetId = await twitterConnector.tweet(result.response);
            console.log(`Tweet posted successfully! ID: ${tweetId}`);
          } else {
            console.log('Tweet cancelled');
          }
          showPrompt();
        });
      } catch (aiError: any) {
        console.error('\nError generating tweet with AI:', aiError?.message || 'Unknown error');
        console.log('This could be due to an issue with the API key or service availability.');
        
        // Fallback to manual tweet creation
        console.log('\nYou can still create a tweet manually:');
        safeQuestion('Enter your tweet (max 280 characters): ', async (manualTweet) => {
          if (manualTweet.trim()) {
            safeQuestion('Post this tweet? (yes/no): ', async (answer) => {
              if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
                const tweetId = await twitterConnector.tweet(manualTweet);
                console.log(`Tweet posted successfully! ID: ${tweetId}`);
              } else {
                console.log('Tweet cancelled');
              }
              showPrompt();
            });
          } else {
            console.log('Tweet cancelled - empty content');
            showPrompt();
          }
        });
      }
    } catch (error) {
      logger.error('Error in tweet posting process', error);
      showPrompt();
    }
  });
}

async function searchTweets() {
  safeQuestion('Enter search query: ', async (query) => {
    try {
      const tweets = await twitterConnector.searchTweets(query, 5);
      
      console.log(`\nFound ${tweets.length} tweets matching "${query}":`);
      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. @${tweet.author.username}: ${tweet.text}`);
      });
      
      if (tweets.length > 0) {
        safeQuestion('\nEnter tweet number to engage with (or 0 to skip): ', async (answer) => {
          const tweetIndex = parseInt(answer) - 1;
          if (tweetIndex >= 0 && tweetIndex < tweets.length) {
            const selectedTweet = tweets[tweetIndex];
            
            safeQuestion('Like this tweet? (yes/no): ', async (likeAnswer) => {
              if (likeAnswer.toLowerCase() === 'yes' || likeAnswer.toLowerCase() === 'y') {
                await twitterConnector.like(selectedTweet.id);
                console.log('Tweet liked!');
              }
              
              safeQuestion('Reply to this tweet? (yes/no): ', async (replyAnswer) => {
                if (replyAnswer.toLowerCase() === 'yes' || replyAnswer.toLowerCase() === 'y') {
                  try {
                    const result = await agent.run({
                      task: `As ${agentConfig.name}, craft a thoughtful reply to this tweet: "${selectedTweet.text}" by @${selectedTweet.author.username}
                             Your reply should add value to the conversation, reflect your personality and expertise in AI ethics.
                             Keep your response under 280 characters.`
                    });
                    
                    console.log(`\nDraft reply: ${result.response}`);
                    
                    safeQuestion('Send this reply? (yes/no): ', async (sendAnswer) => {
                      if (sendAnswer.toLowerCase() === 'yes' || sendAnswer.toLowerCase() === 'y') {
                        await twitterConnector.tweet(result.response, selectedTweet.id);
                        console.log('Reply sent!');
                      } else {
                        console.log('Reply cancelled');
                      }
                      showPrompt();
                    });
                  } catch (aiError: any) {
                    console.error('\nError generating reply with AI:', aiError.message || 'Unknown error');
                    console.log('This could be due to an issue with the API key or service availability.');
                    
                    // Fallback to manual reply
                    console.log('\nYou can still create a reply manually:');
                    safeQuestion('Enter your reply (max 280 characters): ', async (manualReply) => {
                      if (manualReply.trim()) {
                        safeQuestion('Send this reply? (yes/no): ', async (sendAnswer) => {
                          if (sendAnswer.toLowerCase() === 'yes' || sendAnswer.toLowerCase() === 'y') {
                            await twitterConnector.tweet(manualReply, selectedTweet.id);
                            console.log('Reply sent!');
                          } else {
                            console.log('Reply cancelled');
                          }
                          showPrompt();
                        });
                      } else {
                        console.log('Reply cancelled - empty content');
                        showPrompt();
                      }
                    });
                  }
                } else {
                  showPrompt();
                }
              });
            });
          } else {
            showPrompt();
          }
        });
      } else {
        showPrompt();
      }
    } catch (error) {
      logger.error('Error searching tweets', error);
      showPrompt();
    }
  });
}

async function getTrends() {
  try {
    const trends = await twitterConnector.getTrends();
    
    console.log('\nCurrent Twitter trends:');
    trends.slice(0, 10).forEach((trend, index) => {
      console.log(`${index + 1}. ${trend.name}${trend.tweet_volume ? ` (${trend.tweet_volume} tweets)` : ''}`);
    });
    
    safeQuestion('\nAnalyze a trend? Enter trend number (or 0 to skip): ', async (answer) => {
      const trendIndex = parseInt(answer) - 1;
      if (trendIndex >= 0 && trendIndex < trends.length) {
        const selectedTrend = trends[trendIndex];
        
        try {
          const result = await agent.run({
            task: `As ${agentConfig.name}, analyze this trending topic on Twitter: "${selectedTrend.name}"
                   Consider:
                   1. Is this related to your areas of expertise (AI ethics, tech policy, etc.)?
                   2. What might be driving this trend?
                   3. Are there ethical dimensions worth exploring?
                   4. Would you engage with this trend? If so, how?
                   
                   Provide a thoughtful analysis reflecting your personality and perspective.`
          });
          
          console.log('\nTrend Analysis:');
          console.log(result.response);
          
          safeQuestion('\nTweet about this trend? (yes/no): ', async (tweetAnswer) => {
            if (tweetAnswer.toLowerCase() === 'yes' || tweetAnswer.toLowerCase() === 'y') {
              try {
                const tweetResult = await agent.run({
                  task: `As ${agentConfig.name}, craft a thoughtful tweet about the trending topic "${selectedTrend.name}"
                         Make sure it reflects your personality, expertise, and Twitter style.
                         The tweet should be under 280 characters and include the trend in a natural way.
                         If this trend doesn't align with your interests or expertise, craft a tweet that relates it to a relevant AI ethics aspect.`
                });
                
                console.log(`\nDraft tweet: ${tweetResult.response}`);
                
                safeQuestion('Send this tweet? (yes/no): ', async (sendAnswer) => {
                  if (sendAnswer.toLowerCase() === 'yes' || sendAnswer.toLowerCase() === 'y') {
                    await twitterConnector.tweet(tweetResult.response);
                    console.log('Tweet sent!');
                  } else {
                    console.log('Tweet cancelled');
                  }
                  showPrompt();
                });
              } catch (aiError: any) {
                console.error('\nError generating tweet with AI:', aiError.message || 'Unknown error');
                console.log('This could be due to an issue with the API key or service availability.');
                
                // Fallback to manual tweet
                console.log('\nYou can still create a tweet about this trend manually:');
                safeQuestion('Enter your tweet about this trend (max 280 characters): ', async (manualTweet) => {
                  if (manualTweet.trim()) {
                    safeQuestion('Send this tweet? (yes/no): ', async (sendAnswer) => {
                      if (sendAnswer.toLowerCase() === 'yes' || sendAnswer.toLowerCase() === 'y') {
                        await twitterConnector.tweet(manualTweet);
                        console.log('Tweet sent!');
                      } else {
                        console.log('Tweet cancelled');
                      }
                      showPrompt();
                    });
                  } else {
                    console.log('Tweet cancelled - empty content');
                    showPrompt();
                  }
                });
              }
            } else {
              showPrompt();
            }
          });
        } catch (aiError: any) {
          console.error('\nError analyzing trend with AI:', aiError.message || 'Unknown error');
          console.log('This could be due to an issue with the API key or service availability.');
          
          // Still allow tweeting about the trend
          safeQuestion('\nTweet about this trend anyway? (yes/no): ', async (tweetAnswer) => {
            if (tweetAnswer.toLowerCase() === 'yes' || tweetAnswer.toLowerCase() === 'y') {
              safeQuestion('Enter your tweet about this trend (max 280 characters): ', async (manualTweet) => {
                if (manualTweet.trim()) {
                  safeQuestion('Send this tweet? (yes/no): ', async (sendAnswer) => {
                    if (sendAnswer.toLowerCase() === 'yes' || sendAnswer.toLowerCase() === 'y') {
                      await twitterConnector.tweet(manualTweet);
                      console.log('Tweet sent!');
                    } else {
                      console.log('Tweet cancelled');
                    }
                    showPrompt();
                  });
                } else {
                  console.log('Tweet cancelled - empty content');
                  showPrompt();
                }
              });
            } else {
              showPrompt();
            }
          });
        }
      } else {
        showPrompt();
      }
    });
  } catch (error) {
    logger.error('Error getting trends', error);
    showPrompt();
  }
}

async function getUserTweets() {
  safeQuestion('Enter Twitter username to analyze: ', async (username) => {
    try {
      const tweets = await twitterConnector.getUserTweets(username, 5);
      
      console.log(`\nLatest tweets from @${username}:`);
      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. ${tweet.text}`);
      });
      
      if (tweets.length > 0) {
        // Ask if user wants to analyze tweets (in case of API issues)
        safeQuestion('\nAnalyze these tweets with AI? (yes/no): ', async (answer) => {
          if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
            try {
              const result = await agent.run({
                task: `As ${agentConfig.name}, analyze these recent tweets from @${username}:
                       ${tweets.map((t, i) => `${i+1}. "${t.text}"`).join('\n')}
                       
                       Consider:
                       1. Are they discussing topics related to your interests (AI ethics, tech policy, etc.)?
                       2. What themes or perspectives are evident in their content?
                       3. How might you engage with this person constructively?
                       
                       Provide a thoughtful analysis reflecting your personality and perspective.`
              });
              
              console.log('\nAccount Analysis:');
              console.log(result.response);
              showPrompt();
            } catch (error: any) {
              console.error('\nError analyzing tweets with AI:', error.message || 'Unknown error');
              console.log('This could be due to an issue with the API key or service availability.');
              console.log('You can still use other Twitter functions that don\'t require AI analysis.');
              showPrompt();
            }
          } else {
            showPrompt();
          }
        });
      } else {
        showPrompt();
      }
    } catch (error) {
      logger.error(`Error getting tweets for user ${username}`, error);
      showPrompt();
    }
  });
}

async function generateContentIdeas() {
  try {
    const result = await agent.run({
      task: `As ${agentConfig.name}, generate 5 content ideas for tweets that align with your personality, expertise, and interests.
             Focus on current topics in AI ethics, emerging technology, or digital rights.
             
             For each idea:
             1. Provide the tweet topic
             2. Explain why it would be valuable to your audience
             3. Draft a sample tweet (under 280 characters)
             
             Be creative but stay true to your thoughtful, balanced voice and areas of expertise.`
    });
    
    console.log('\nContent Ideas:');
    console.log(result.response);
    showPrompt();
  } catch (error: any) {
    console.error('\nError generating content ideas with AI:', error.message || 'Unknown error');
    console.log('This could be due to an issue with the API key or service availability.');
    
    // Provide fallback content ideas
    console.log('\nSuggested content categories to consider:');
    console.log('1. Current AI policy developments');
    console.log('2. New research papers on algorithmic fairness');
    console.log('3. Questions about human-AI collaboration');
    console.log('4. Examples of responsible AI implementation');
    console.log('5. Commentary on tech industry ethics initiatives');
    
    showPrompt();
  }
}

async function askGrok() {
  safeQuestion('Enter question for Twitter\'s Grok AI: ', async (question) => {
    try {
      console.log('\nAsking Grok...');
      const response = await twitterConnector.askGrok(question);
      
      console.log('\nGrok\'s response:');
      console.log(response);
      
      safeQuestion('\nHave agent analyze this response? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          try {
            const analysis = await agent.run({
              task: `As ${agentConfig.name}, analyze this response from Twitter's Grok AI to the question: "${question}"
                     
                     Grok's response: "${response}"
                     
                     Provide your thoughts on:
                     1. The accuracy and completeness of Grok's response
                     2. Any ethical considerations or missing nuance
                     3. How you might address the same question differently
                     
                     Be thoughtful and fair in your assessment, consistent with your personality and expertise.`
            });
            
            console.log('\nAnalysis of Grok\'s Response:');
            console.log(analysis.response);
          } catch (aiError: any) {
            console.error('\nError analyzing Grok response with AI:', aiError.message || 'Unknown error');
            console.log('This could be due to an issue with the API key or service availability.');
            console.log('\nYou can still read the Grok response above and form your own analysis.');
          }
        }
        
        showPrompt();
      });
    } catch (error) {
      logger.error('Error asking Grok', error);
      showPrompt();
    }
  });
}

function showAgentPersonality() {
  console.log(`\n==== ${agentConfig.name.toUpperCase()} - ${personality.persona.demographics?.occupation?.toUpperCase()} ====`);
  console.log('\nCore Demographics:');
  console.log(`- Age: ${personality.persona.demographics?.age}`);
  console.log(`- Occupation: ${personality.persona.demographics?.occupation}`);
  console.log(`- Location: ${personality.persona.demographics?.location}`);
  
  console.log('\nPersonality Traits:');
  console.log(personality.persona.personality.traits.join(', '));
  
  console.log('\nCommunication Style:');
  console.log(`Tone: ${personality.persona.personality.communication.tone.join(', ')}`);
  console.log(`Style: ${personality.persona.personality.communication.style.join(', ')}`);
  
  console.log('\nKey Expertise Areas:');
  console.log(personality.knowledge?.expertise.join(', '));
  
  console.log('\nShort Bio:');
  const shortBio = personality.persona.background?.backstory.split('.').slice(0, 2).join('.') + '.';
  console.log(shortBio);
  
  console.log('\nTop Achievements:');
  personality.persona.background?.achievements?.slice(0, 3).forEach(achievement => {
    console.log(`- ${achievement}`);
  });
  
  console.log('\nTwitter Style:');
  console.log(personality.content.preferences.platformStyle?.twitter?.tone);
  
  console.log('\nSample Tweet:');
  console.log(personality.content.preferences.platformStyle?.twitter?.typicalPosts?.[0] || "No sample tweets available");
  
  showPrompt();
}

async function savePersonalityToJsonFile() {
  safeQuestion('Enter filename to save personality (without path): ', async (filename) => {
    try {
      if (!filename.endsWith('.json')) {
        filename += '.json';
      }
      
      // Save to the personas directory
      const savePath = path.join(__dirname, '../personas', filename);
      PersonalityUtils.savePersonalityToJson(personality, savePath);
      
      console.log(`\nPersonality saved to ${savePath}`);
      showPrompt();
    } catch (error) {
      logger.error('Error saving personality', error);
      showPrompt();
    }
  });
}

async function exitProgram() {
  console.log('Disconnecting from Twitter...');
  await twitterConnector.disconnect();
  console.log('Disconnected. Goodbye!');
  if (rl) rl.close();
  process.exit(0);
}

// Main function
async function main() {
  // Initialize rl as null to avoid errors
  rl = null;
  
  try {
    // Connect the agent to Twitter
    console.log('Connecting to Twitter...');
    await twitterConnector.connect(agent);
    console.log('Connected to Twitter successfully!');
    
    // Create readline interface for interactive CLI - do this AFTER connection to avoid timing issues
    rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log(`\n=== ${agentConfig.name} AI Twitter Agent ===`);
    console.log(`Personality: ${personality.persona.demographics?.occupation}`);
    console.log(`Connected as: ${process.env.TWITTER_USERNAME}`);
    console.log(`Using ${process.env.DEFAULT_MODEL}`);
    console.log(`Monitoring: ${twitterConnector.config.monitorKeywords?.length || 0} keywords, ${twitterConnector.config.monitorUsers?.length || 0} users`);
    console.log(`Personality file: ${personalityFile}`);
    
    // Show interactive prompt
    showPrompt();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await twitterConnector.disconnect();
      if (rl) rl.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error starting Twitter personality agent', error);
    if (rl) rl.close();
    process.exit(1);
  }
}

// Run the agent
main();