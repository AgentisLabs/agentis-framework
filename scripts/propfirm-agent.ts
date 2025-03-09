import { KnowledgeBase, EmbeddingService, Agent, AgentRole, DiscordConnector } from '../src';
import * as fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Prop Trading Firm Discord Bot Support Agent
 * 
 * This script creates a Discord bot support agent for a proprietary trading firm
 * that can answer customer questions about evaluations, funded accounts, and payouts
 * directly in a Discord server using a knowledge base.
 */
async function main() {
  console.log("Starting Prop Trading Firm Discord Support Agent...");

  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required in your .env file');
    process.exit(1);
  }

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN is required in your .env file');
    process.exit(1);
  }

  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
  }

  // Create embedding service
  const embeddingService = new EmbeddingService({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small',
    dimensions: 1536
  });

  // Create knowledge base
  const kb = new KnowledgeBase({
    persistPath: path.join(dataDir, 'propfirm-kb.json'),
    graphPersistPath: path.join(dataDir, 'propfirm-kb-graph.json'),
    embeddingService
  });

  // Initialize knowledge base
  console.log('Initializing knowledge base...');
  await kb.initialize();

  // Load FAQ data from prop-firm-faq.json
  const faqFilePath = path.join(__dirname, '..', 'prop-firm-faq.json');
  
  // Import from JSON file if KB is empty
  if (kb.getStats().faqCount === 0) {
    try {
      console.log(`Loading FAQs from ${faqFilePath}...`);
      const faqData = JSON.parse(fs.readFileSync(faqFilePath, 'utf8'));
      
      if (Array.isArray(faqData)) {
        console.log(`Found ${faqData.length} FAQs to import.`);
        await kb.ingestFAQs(faqData);
        console.log('Import completed successfully!');
      } else {
        console.error('The JSON file should contain an array of FAQ objects');
      }
    } catch (error) {
      console.error('Error importing FAQ data:', error);
      process.exit(1);
    }
  }

  // Add some document about the prop firm to the knowledge base
  if (kb.getStats().documentCount === 0) {
    console.log("Adding additional prop firm documents...");
    
    // Add information about the company
    await kb.addDocument(
      "About Our Prop Trading Firm",
      "# About Traddoo\n\nTraddoo is a leading proprietary trading firm that provides capital to skilled traders across the globe. We believe in giving talented traders the opportunity to trade significant capital without risking their own money, specializing in futures evaluations and funding.\n\n## Our Mission\n\nOur mission is to identify and develop skilled futures traders by providing them with the capital, tools, and support they need to succeed in the financial markets. We aim to create a community of consistently profitable traders who can generate returns for both themselves and our firm.\n\n## Our Evaluation Process\n\nOur evaluation process is designed to identify traders who can demonstrate consistent profitability while maintaining proper risk management. Successful traders gain access to funded accounts where they can trade our capital and keep up to 80% of the profits they generate.\n\n## Our Advantages\n\n- No time limits on evaluations\n- Competitive profit splits (up to 80/20)\n- Scaling opportunities for successful traders\n- Professional trading platforms and tools\n- Dedicated support team\n- Focus on futures trading\n- Zero activation fees",
      "https://traddoo.com/about",
      "Company Information",
      "Company",
      ["about", "mission", "overview"]
    );
    
    // Add information about the evaluation process
    await kb.addDocument(
      "Evaluation Process Details",
      "# Evaluation Process\n\n## Overview\n\nOur evaluation process is designed to assess your trading skills and risk management before providing you with a funded account. We offer two paths:\n\n1. **1-Step Evaluation**: A single phase evaluation where you need to reach a 10% profit target while maintaining proper risk management.\n\n2. **2-Step Evaluation**: A two-phase evaluation with lower profit targets in each phase (8% in Phase 1, 5% in Phase 2).\n\n## Key Rules\n\n- **Profit Targets**: Vary by evaluation type (see above)\n- **Maximum Daily Loss**: 5% of account balance\n- **Maximum Total Drawdown**: 10% of account balance\n- **Consistency Rule**: No more than 40% of profits can come from a single trading day\n- **Trading Requirement**: Minimum of 5 trading days before receiving funding\n\n## Available Account Sizes\n\n- $25,000\n- $50,000\n- $100,000\n- $200,000\n\n## After Passing\n\nUpon successful completion of the evaluation, you'll receive a funded account with the same size as your evaluation account. You'll maintain the same rules from your evaluation, with the ability to request payouts after reaching 4% profit.",
      "https://traddoo.com/evaluation-process",
      "Evaluation Information",
      "Evaluation",
      ["process", "rules", "requirements"]
    );
    
    console.log("Documents added successfully!");
  }

  // Show current stats
  const stats = kb.getStats();
  console.log('\nKnowledge Base Stats:');
  console.log(`- FAQ entries: ${stats.faqCount}`);
  console.log(`- Document entries: ${stats.documentCount}`);
  console.log(`- Categories: ${stats.categories.join(', ')}`);
  console.log(`- Tags: ${stats.tags.join(', ')}`);

  // Create a customer support agent using the knowledge base
  const propFirmAgent = new Agent({
    name: "Traddoo Support",
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ["helpful", "knowledgeable", "professional", "patient"],
      background: "A customer support specialist for Traddoo, a proprietary trading firm specializing in futures evaluations and funding.",
      voice: "Professional, friendly, and informative. Provides clear explanations and accurate information about prop trading evaluations, funding, and policies."
    },
    goals: [
      "Provide accurate information about the prop trading firm's policies and procedures",
      "Help customers understand the evaluation process and requirements",
      "Answer questions about funded accounts and payouts",
      "Assist potential and existing traders with their inquiries",
      "Respond promptly and professionally to all Discord messages"
    ],
    knowledgeBase: kb,
    knowledgeBaseMaxResults: 5,
    knowledgeBaseThreshold: 0.65
  });

  // Define keywords to monitor for in Discord messages
  const monitorKeywords = [
    "evaluation", "challenge", "profit target", "drawdown", "payout",
    "funded account", "trading rules", "prop firm", "trading account",
    "reset", "refund", "scaling", "commission", "fee", "traddoo help"
  ];

  // Create Discord connector
  const discord = new DiscordConnector({
    token: process.env.DISCORD_BOT_TOKEN!,
    prefix: '!trader',
    autoReply: false, // We'll handle replies ourselves to avoid permission issues
    monitorKeywords: monitorKeywords,
    pollInterval: 60000, // Check every minute
    // Optional: Add allowed channels or users if you want to restrict usage
    allowedChannels: process.env.ALLOWED_CHANNELS?.split(',') || [],
  });

  // Add error event handler to catch connector-level errors
  discord.on('error', (error) => {
    console.error('Discord connector error:', error.message);
  });

  // Set up event handlers for Discord connector
  discord.on('mention', async (message) => {
    console.log(`Bot was mentioned by ${message.author.username} in message: "${message.content}"`);
    
    // Handle this message in addition to the automatic handling
  // This is a proactive approach to handle permission issues
  try {
    // Generate response regardless if auto-reply worked or not
    const result = await propFirmAgent.run({
      task: `Respond to this Discord message from @${message.author.username}: "${message.content}"`,
      conversation: {
        id: `discord-${message.id}`,
        messages: [],
        created: Date.now(),
        updated: Date.now(),
        metadata: {
          channelId: message.channelId,
          author: message.author
        }
      }
    });

    // Try to send a new message as a fallback (not a reply)
    try {
      await discord.sendMessage(
        message.channelId,
        `@${message.author.username} ${result.response}`
      );
      console.log('Successfully sent response as a new message');
    } catch (messageError) {
      console.error('Failed to send even a regular message:', messageError);
    }
  } catch (error) {
    console.error('Failed to process mention:', error);
  }
  });

  discord.on('keyword_match', async (message) => {
    console.log(`Keyword match detected in message from ${message.author.username}: "${message.content}"`);
    
    // Handle this message in addition to the automatic handling
    // This is a proactive approach to handle permission issues
    try {
      // Extract the keywords that matched
      const matchedKeywords = monitorKeywords.filter(keyword => 
        message.content.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Run the agent to get a response
      const result = await propFirmAgent.run({
        task: `Respond to this Discord message containing keywords [${matchedKeywords.join(', ')}] from @${message.author.username}: "${message.content}"`,
        conversation: {
          id: `discord-kw-${message.id}`,
          messages: [],
          created: Date.now(),
          updated: Date.now(),
          metadata: {
            channelId: message.channelId,
            author: message.author,
            keywords: matchedKeywords
          }
        }
      });

      // Try to send a new message (not a reply)
      try {
        // Wait a bit to avoid race conditions with auto-reply
        setTimeout(async () => {
          try {
            await discord.sendMessage(
              message.channelId,
              `@${message.author.username} I noticed you mentioned ${matchedKeywords.join(', ')}. ${result.response}`
            );
            console.log('Successfully sent keyword response as a new message');
          } catch (sendError) {
            console.error('Failed to send keyword response message:', sendError);
          }
        }, 1000); // 1 second delay
      } catch (messageError) {
        console.error('Failed to schedule keyword response:', messageError);
      }
    } catch (error) {
      console.error('Failed to process keyword match:', error);
    }
  });

  // Connect agent to Discord
  try {
    await discord.connect(propFirmAgent);
    console.log(`Successfully connected to Discord!`);
    
    // Set bot status
    await discord.setStatus('online', 'WATCHING', 'for trading questions');
    
    // Get connected guilds (for information)
    const guilds = await discord.getGuilds();
    console.log(`Connected to ${guilds.length} Discord servers:`);
    guilds.forEach(guild => {
      console.log(`- ${guild.name} (${guild.id}) with ${guild.memberCount || 'unknown'} members`);
    });

    console.log('\nBot is now running and ready to answer questions!');
    console.log('Available commands:');
    console.log('  !trader ask <question> - Ask a specific question to the bot');
    console.log('  !trader help - Show help information');
    console.log('The bot will also respond automatically to:');
    console.log('  - Direct mentions (@Traddoo Support)');
    console.log('  - Messages containing keywords about trading and prop firms');

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await discord.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error connecting to Discord:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});