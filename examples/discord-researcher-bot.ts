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
const logger = new Logger('DiscordResearcherBot');

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

// Memory for the agent to remember conversations and research
class ResearchMemory extends InMemoryMemory {
  private researchCache: Map<string, {
    query: string;
    results: any;
    timestamp: number;
  }> = new Map();

  // Store research results
  async storeResearch(query: string, results: any): Promise<void> {
    const cacheKey = query.toLowerCase().trim();
    this.researchCache.set(cacheKey, {
      query,
      results,
      timestamp: Date.now()
    });
    logger.info(`Stored research for query: ${query}`);
  }

  // Get research results if they exist and aren't too old
  async getResearch(query: string, maxAgeMs: number = 3600000): Promise<any | null> {
    const cacheKey = query.toLowerCase().trim();
    const cached = this.researchCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < maxAgeMs) {
      logger.info(`Using cached research for query: ${query}`);
      return cached.results;
    }
    
    return null;
  }

  // Get all research topics
  async getAllResearchTopics(): Promise<string[]> {
    return Array.from(this.researchCache.values()).map(entry => entry.query);
  }
}

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
    logger.info('Starting Discord Researcher bot with Wexley persona...');

    // Create Tavily search tool if API key is available
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

    // Set up memory with research capabilities
    const memory = new ResearchMemory();

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
      role: 'Market Analyst & Researcher',
      personality: {
        traits: personality.traits,
        background: wexleyPersona.persona.background.backstory,
        voice: `Direct, authoritative tone. ${communication.vocabulary}. Uses data points and specific examples.`
      },
      goals: [
        "Provide insightful market analysis",
        "Research projects and topics thoroughly using web search",
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

        RESEARCH CAPABILITIES:
        - You can search the web to find information on any topic
        - You excel at researching crypto projects, blockchain technologies, and AI trends
        - You can provide detailed analysis and summaries of your research
        - You store research in memory to reference in future conversations
        - You can provide substantiated opinions based on your research

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

        DISCORD COMMANDS:
        - !ask [question] - Answer a question using your knowledge
        - !research [topic] - Conduct in-depth research on a topic and provide analysis
        - !topics - List recent research topics you've investigated
        - !help - Show available commands

        When users ask about topics outside your expertise, still respond in character but acknowledge when something is outside your primary focus areas.
        If users ask for harmful content, refuse while staying in character as Wexley who values rationality.
      `
    }, openaiProvider);

    // Add tools to the agent
    (agent as any).tools = [searchTool];
    
    // Set memory for the agent
    agent.memory = memory;

    // Create a Discord client with necessary intents
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
      logger.info(`Bot application ID: ${readyClient.user.id}`);
      
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
          // Find the first text channel where the bot can send messages
          const textChannel = guild.channels.cache.find(
            channel => channel.isTextBased() && 
            channel.permissionsFor(guild.members.me!)?.has('SendMessages')
          );
          
          if (!textChannel) {
            logger.warn(`No suitable text channel found in guild: ${guild.name}`);
          }
          
          if (textChannel && textChannel.isTextBased()) {
            textChannel.send(`Hello! I'm Wexley, a market analyst and researcher. I can help answer questions and conduct research for you.
            
Use these commands:
- **!ask** [question] - Answer a question using my knowledge
- **!research** [topic] - Conduct in-depth research on a topic
- **!topics** - List topics I've researched
- **!help** - Show available commands

You can also just mention me with your question!`);
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
        // Extract command and arguments or question
        let command = '';
        let args: string[] = [];
        
        if (isCommand) {
          const commandBody = message.content.slice(PREFIX.length).trim();
          args = commandBody.split(' ');
          command = args.shift()?.toLowerCase() || '';
        } else if (isMentioned) {
          // Remove the mention from the message
          const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();
          command = 'ask'; // Default to ask when mentioned
          args = content.split(' ');
        }
        
        // Send typing indicator - this shows "Wexley is typing..." in Discord
        await message.channel.sendTyping();
        
        // Handle commands
        switch (command) {
          case 'ask':
          case 'a':
            await handleAskCommand(message, args.join(' '), agent);
            break;
            
          case 'research':
          case 'r':
            await handleResearchCommand(message, args.join(' '), agent, searchTool, memory as ResearchMemory);
            break;
            
          case 'topics':
          case 't':
            await handleTopicsCommand(message, memory as ResearchMemory);
            break;
            
          case 'help':
          case 'h':
            await message.reply({
              content: `**Commands:**
!ask [question] - Ask me a question using my knowledge
!research [topic] - Conduct in-depth research on a topic and provide analysis
!topics - List topics I've recently researched
!help - Show this help message

You can also mention me to ask a question without using the prefix.`
            });
            break;
            
          default:
            // If mentioned but command not recognized, treat as ask
            if (isMentioned) {
              await handleAskCommand(message, message.content.replace(/<@!?[0-9]+>/g, '').trim(), agent);
            }
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

/**
 * Handle the ask command
 */
async function handleAskCommand(message: any, question: string, agent: Agent): Promise<void> {
  if (!question) {
    await message.reply("What can I help you with?");
    return;
  }
  
  // Send thinking message
  const thinkingMsg = await message.reply("Thinking...");
  
  // Run the agent to answer the question
  const result = await agent.run({
    task: question,
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
}

/**
 * Handle the research command
 */
async function handleResearchCommand(
  message: any, 
  topic: string, 
  agent: Agent, 
  searchTool: any,
  memory: ResearchMemory
): Promise<void> {
  if (!topic) {
    await message.reply("Please provide a topic to research!");
    return;
  }
  
  // Send thinking message
  const thinkingMsg = await message.reply(`Researching "${topic}"... This may take a moment.`);
  
  try {
    // Check if we have cached research
    const cachedResearch = await memory.getResearch(topic);
    
    if (cachedResearch) {
      // Use cached research
      const responses = splitMessage(cachedResearch);
      
      // Edit the "thinking" message with the first part
      await thinkingMsg.edit(`**Research on "${topic}"** (from cache):\n\n${responses[0]}`);
      
      // Send additional messages for remaining parts
      for (let i = 1; i < responses.length; i++) {
        await message.channel.send(responses[i]);
      }
      
      return;
    }
    
    // Perform new research using the search tool
    const searchResults = await searchTool.execute({
      query: topic,
      maxResults: 7,
      includeAnswer: true
    });
    
    // Generate detailed analysis using the agent
    const researchPrompt = `
      I need you to create a comprehensive analysis about the topic: "${topic}"
      
      Here are search results to help with your analysis:
      
      ${searchResults.answer ? `Summary: ${searchResults.answer}\n\n` : ''}
      
      Sources:
      ${(searchResults.results || []).map((result: any, index: number) => 
        `[${index + 1}] ${result.title} - ${result.url}\n${result.content?.substring(0, 300)}...\n`
      ).join('\n')}
      
      Create a detailed and insightful analysis that:
      1. Provides a comprehensive overview of the topic
      2. Highlights key information, trends, and insights
      3. Offers your expert perspective and analysis
      4. Includes specific data points and examples where available
      5. Addresses potential challenges, debates, or controversies
      6. Concludes with implications and your assessment
      
      Format your analysis in a well-structured way with clear sections and bullet points where appropriate.
    `;
    
    const analysisResult = await agent.run({ task: researchPrompt });
    
    // Store the research in memory
    await memory.storeResearch(topic, analysisResult.response);
    
    // Split long responses if needed
    const responses = splitMessage(analysisResult.response);
    
    // Edit the "thinking" message with the first part
    await thinkingMsg.edit(`**Research on "${topic}"**:\n\n${responses[0]}`);
    
    // Send additional messages for remaining parts
    for (let i = 1; i < responses.length; i++) {
      await message.channel.send(responses[i]);
    }
    
  } catch (error) {
    logger.error(`Error researching topic "${topic}":`, error);
    await thinkingMsg.edit(`I encountered an error while researching "${topic}". Please try again later.`);
  }
}

/**
 * Handle the topics command
 */
async function handleTopicsCommand(message: any, memory: ResearchMemory): Promise<void> {
  try {
    // Get all research topics
    const topics = await memory.getAllResearchTopics();
    
    if (topics.length === 0) {
      await message.reply("I haven't researched any topics yet. Ask me to research something using the `!research` command!");
      return;
    }
    
    // Format the list of topics
    const formattedTopics = topics.map((topic, index) => `${index + 1}. ${topic}`).join('\n');
    
    // Send the response
    await message.reply(`**Topics I've Researched:**\n\n${formattedTopics}\n\nTo view research on any of these topics, use the \`!research [topic]\` command.`);
    
  } catch (error) {
    logger.error('Error retrieving research topics:', error);
    await message.reply("I encountered an error while retrieving research topics. Please try again later.");
  }
}

// Start the Discord bot
startDiscordBot();