import dotenv from 'dotenv';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { Agent } from '../src/core/agent';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { WebSearchTool } from '../src/tools/web-search-tool';
import { OpenAIProvider } from '../src/core/openai-provider';
import { InMemoryMemory } from '../src/memory/in-memory';
import { Logger } from '../src/utils/logger';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Set up logger
const logger = new Logger('DiscordBotSimple');

// Check for required environment variables
if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY is required in .env file');
  process.exit(1);
}

if (!process.env.BOT_TOKEN) {
  logger.error('BOT_TOKEN is required in .env file');
  process.exit(1);
}

// Load Wexley persona
const wexleyPersonaPath = path.join(__dirname, '../personas/wexley.json');
const wexleyPersona = JSON.parse(fs.readFileSync(wexleyPersonaPath, 'utf8'));

// Function to split message content if it exceeds Discord's limit
function splitMessage(text: string, maxLength = 2000) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by lines
  const lines = text.split('\n');
  
  for (const line of lines) {
    // If adding this line would exceed the max length, push current chunk and start a new one
    if (currentChunk.length + line.length + 1 > maxLength) {
      // If the current line itself is too long
      if (line.length > maxLength) {
        // Add current chunk if not empty
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // Split the long line
        let remainingLine = line;
        while (remainingLine.length > 0) {
          const chunkSize = Math.min(remainingLine.length, maxLength);
          chunks.push(remainingLine.substring(0, chunkSize));
          remainingLine = remainingLine.substring(chunkSize);
        }
      } else {
        // Push current chunk and start new one with this line
        chunks.push(currentChunk);
        currentChunk = line;
      }
    } else {
      // Add line to current chunk
      if (currentChunk) {
        currentChunk += '\n' + line;
      } else {
        currentChunk = line;
      }
    }
  }
  
  // Add last chunk if there is one
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

async function startDiscordBot() {
  try {
    logger.info('Starting Discord bot with Wexley persona...');

    // Create search tool
    let searchTool;
    if (process.env.TAVILY_API_KEY) {
      logger.info('Using Tavily search tool');
      searchTool = new TavilySearchTool(process.env.TAVILY_API_KEY);
    } else {
      logger.warn('TAVILY_API_KEY not found, using mock web search tool');
      searchTool = new WebSearchTool();
    }

    // Create OpenAI provider for GPT-4o
    const openaiProvider = new OpenAIProvider({
      model: 'gpt-4o', // Use GPT-4o model
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // Set up memory
    const memory = new InMemoryMemory();

    // Extract Wexley personality traits
    const personality = wexleyPersona.persona.personality;
    const traits = personality.traits.join(', ');
    const communication = personality.communication;
    const tone = communication.tone.join(', ');
    const style = communication.style.join(', ');
    const quirks = communication.quirks.join('; ');
    const platformStyle = wexleyPersona.content.preferences.platformStyle.chat;

    // Create an agent with Wexley persona using GPT-4o
    const agent = new Agent({
      name: 'Wexley',
      role: 'Market Analyst',
      personality: {
        traits: personality.traits,
        background: wexleyPersona.persona.background.backstory,
        voice: `Direct, authoritative tone. ${communication.vocabulary}. Uses data points and specific examples.`
      },
      goals: [
        "Provide insightful market analysis",
        "Identify emerging trends in AI and crypto",
        "Deliver authoritative information on tokenomics and market cycles",
        "Express contrarian views that challenge conventional wisdom"
      ],
      systemPrompt: `
        You are Wexley, a 42-year-old crypto/AI market researcher, serial entrepreneur, and angel investor.
        You're known for your direct, authoritative communication style and contrarian market insights.

        PERSONALITY:
        - Traits: ${traits}
        - Communication tone: ${tone}
        - Communication style: ${style}
        - Communication quirks: ${quirks}
        - Vocabulary: ${communication.vocabulary}

        RESPONSE STYLE FOR DISCORD:
        - Response length: ${platformStyle.responseLength}
        - Emoji usage: ${platformStyle.emoji}
        - Casualness: ${platformStyle.casualness}

        CORE EXPERTISE:
        - AI/crypto market convergence patterns
        - Tokenomics design and incentive mechanisms
        - Blockchain infrastructure analysis
        - Market cycle identification
        - Decentralized governance structures
        - AI computing resource markets
        - Venture capital in digital assets

        IMPORTANT GUIDELINES:
        1. Stay in character as Wexley at all times
        2. Be direct, confident, and occasionally abrasive in your communication
        3. Speak authoritatively about markets, technology, and investing
        4. Use data points and specific examples to back up your claims
        5. Don't hedge unnecessarily - be definitive in your assessments
        6. Use technical terminology appropriate for the audience
        7. Express contrarian views that challenge conventional wisdom
        8. For crypto mentions, use the $ prefix format ($BTC, $ETH, etc.)
        9. You have access to real-time information via web search - use it to provide accurate market data
        10. When discussing market trends or technology developments, use your search tool to get current information

        When users ask about topics outside your expertise, still respond in character but acknowledge when something is outside your primary focus areas.
        If users ask for harmful content, refuse while staying in character as Wexley who values rationality.
      `
    }, openaiProvider);

    // Add tools to the agent
    (agent as any).tools = [searchTool];
    
    // Set memory for the agent
    agent.memory = memory;

    // Create a simple Discord client with only required intents
    // Note: MessageContent is a privileged intent that must be enabled in Discord Developer Portal
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    // Listen for the client to be ready
    client.once(Events.ClientReady, readyClient => {
      logger.info(`Ready! Logged in as ${readyClient.user.tag}`);
      logger.info(`Bot application ID: ${readyClient.user.id}`); // Should match 1346582443037298838
      
      // List all guilds the bot is in
      const guildsInfo = client.guilds.cache.map(guild => ({
        name: guild.name,
        id: guild.id,
        memberCount: guild.memberCount
      }));
      
      logger.info(`Bot is in ${guildsInfo.length} servers: ${JSON.stringify(guildsInfo)}`);
      
      // If the bot is in no servers, provide the invite link
      if (guildsInfo.length === 0) {
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user.id}&permissions=67584&scope=bot%20applications.commands`;
        logger.info(`To invite the bot to a server, use this URL: ${inviteUrl}`);
      }
      
      // Send a message to the first text channel found when bot joins
      try {
        // Get first available guild (server)
        const guilds = client.guilds.cache.values();
        for (const guild of guilds) {
          logger.info(`Checking channels in guild: ${guild.name}`);
          
          // List all channels in this guild
          const allChannels = guild.channels.cache.map(channel => ({
            id: channel.id,
            name: channel.name,
            type: channel.type
          }));
          
          logger.info(`All channels in ${guild.name}: ${JSON.stringify(allChannels)}`);
          
          // Find the first text channel where the bot can send messages
          const textChannel = guild.channels.cache.find(
            channel => channel.isTextBased() && 
            channel.permissionsFor(guild.members.me!)?.has('SendMessages')
          );
          
          if (!textChannel) {
            logger.warn(`No suitable text channel found in guild: ${guild.name}`);
          }
          
          if (textChannel && textChannel.isTextBased()) {
            textChannel.send(`Hello! I'm Wexley, your market analyst bot. I'm now online and ready to help! You can mention me or use !ask to ask me questions.`);
            logger.info(`Sent startup message to channel ${textChannel.name} in ${guild.name}`);
            break; // Stop after sending to the first available channel
          }
        }
      } catch (error) {
        logger.error('Error sending startup message:', error);
      }
    });

    // Log important events
    client.on(Events.Error, error => {
      logger.error('Discord client error:', error);
    });
    
    client.on(Events.Warn, warning => {
      logger.warn('Discord client warning:', warning);
    });
    
    client.on(Events.Debug, info => {
      // Uncomment to see detailed debug logs
      // logger.debug('Discord client debug:', info);
    });
    
    // Log when a guild becomes available or unavailable
    client.on(Events.GuildCreate, guild => {
      logger.info(`Bot added to new guild: ${guild.name} (${guild.id})`);
    });
    
    client.on(Events.GuildDelete, guild => {
      logger.info(`Bot removed from guild: ${guild.name || 'Unknown'} (${guild.id})`);
    });
    
    // Handle messages
    client.on(Events.MessageCreate, async message => {
      // Log all incoming messages for debugging
      logger.info(`Received message: "${message.content}" from ${message.author.tag} in ${message.guild?.name || 'DM'}`);
      
      // Ignore messages from bots (including self)
      if (message.author.bot) return;
      
      // Check if the message is a command or mentions the bot
      const PREFIX = '!'; // Command prefix
      const isMentioned = message.mentions.users.has(client.user!.id);
      const isCommand = message.content.startsWith(PREFIX);
      
      if (!isCommand && !isMentioned) return;
      
      try {
        // Extract the query/command
        let query = '';
        
        if (isCommand) {
          const commandBody = message.content.slice(PREFIX.length).trim();
          const args = commandBody.split(' ');
          const command = args.shift()?.toLowerCase();
          
          // Only handle "ask" or "a" commands
          if (command === 'ask' || command === 'a') {
            query = args.join(' ');
          } else if (command === 'help' || command === 'h') {
            await message.reply({
              content: `**Commands:**
${PREFIX}ask [question] - Ask me a question
${PREFIX}help - Show this help message

You can also mention me to ask a question without using the prefix.`
            });
            return;
          } else {
            // Ignore other commands
            return;
          }
        } else if (isMentioned) {
          // Remove the mention from the message
          query = message.content.replace(/<@!?[0-9]+>/g, '').trim();
        }
        
        if (!query) {
          await message.reply("What can I help you with?");
          return;
        }
        
        // Send typing indicator and "thinking" message
        await message.channel.sendTyping();
        const thinkingMsg = await message.reply("Thinking...");
        
        // Run the agent
        const result = await agent.run({
          task: query,
          conversation: {
            id: `discord-${message.id}`,
            messages: [],
            created: Date.now(),
            updated: Date.now(),
            metadata: {
              channelId: message.channelId,
              guildId: message.guildId,
              authorId: message.author.id
            }
          }
        });
        
        // Split long responses if needed
        const responses = splitMessage(result.response);
        
        // Edit the "thinking" message with the first part
        await thinkingMsg.edit(responses[0]);
        
        // Send additional messages for remaining parts
        for (let i = 1; i < responses.length; i++) {
          await message.channel.send(responses[i]);
        }
        
      } catch (error) {
        logger.error('Error processing message:', error);
        await message.reply("I encountered an error while processing your request. Please try again later.");
      }
    });

    // Log in to Discord and log the token (partially masked for security)
    const tokenForLogging = process.env.BOT_TOKEN ? 
      `${process.env.BOT_TOKEN.substring(0, 10)}...${process.env.BOT_TOKEN.substring(process.env.BOT_TOKEN.length - 5)}` : 
      'undefined';
    logger.info(`Attempting to log in with token: ${tokenForLogging}`);
    
    client.login(process.env.BOT_TOKEN).catch(error => {
      logger.error(`Failed to log in to Discord: ${error.message}`);
    });
    
    logger.info('Discord bot started successfully');
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Discord bot...');
      client.destroy();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error starting Discord bot:', error);
    process.exit(1);
  }
}

// Start the Discord bot
startDiscordBot();