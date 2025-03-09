import { KnowledgeBase, EmbeddingService, Agent, AgentRole } from '../src';
import * as fs from 'fs';
import * as readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Prop Trading Firm Agent Demo using Knowledge Base
 * 
 * This script creates a virtual prop trading firm support agent that can answer
 * customer questions about evaluations, funded accounts, and payouts.
 */
async function main() {
  console.log("Starting Prop Trading Firm Support Agent...");

  // Ensure OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required in your .env file');
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
    name: "PropFirm Support Agent",
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ["helpful", "knowledgeable", "professional"],
      background: "A customer support specialist for Traddoo, a proprietary trading firm specializing in futures evaluations and funding.",
      voice: "Professional, friendly, and informative. Provides clear explanations and accurate information about prop trading evaluations, funding, and policies."
    },
    goals: [
      "Provide accurate information about the prop trading firm's policies and procedures",
      "Help customers understand the evaluation process and requirements",
      "Answer questions about funded accounts and payouts",
      "Assist potential and existing traders with their inquiries"
    ],
    knowledgeBase: kb,
    knowledgeBaseMaxResults: 3,
    knowledgeBaseThreshold: 0.65
  });

  // Add terminal colors
  const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    // Foreground colors
    fg: {
      black: "\x1b[30m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m",
    },
    // Background colors
    bg: {
      black: "\x1b[40m",
      red: "\x1b[41m",
      green: "\x1b[42m",
      yellow: "\x1b[43m",
      blue: "\x1b[44m",
      magenta: "\x1b[45m",
      cyan: "\x1b[46m",
      white: "\x1b[47m",
    }
  };

  // Interactive query mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${colors.bright}${colors.fg.cyan}===== Traddoo Support Agent =====${colors.reset}`);
  console.log(`${colors.fg.yellow}Ask me anything about our prop trading firm (type "exit" to quit)${colors.reset}`);
  console.log(`${colors.fg.yellow}Example questions:${colors.reset}`);
  console.log(`${colors.fg.yellow}- What instruments can I trade?${colors.reset}`);
  console.log(`${colors.fg.yellow}- Is there a time limit for evaluations?${colors.reset}`);
  console.log(`${colors.fg.yellow}- How is drawdown calculated?${colors.reset}`);
  console.log(`${colors.fg.yellow}- What is your profit split?${colors.reset}`);

  const askQuestion = () => {
    rl.question(`\n${colors.bright}${colors.fg.green}Question: ${colors.reset}`, async (query) => {
      if (query.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        // First show raw knowledge base results for demonstration
        console.log(`\n${colors.fg.cyan}Searching knowledge base...${colors.reset}`);
        const results = await kb.query(query, {
          maxResults: 3,
          relevanceThreshold: 0.65
        });

        console.log(`\n${colors.fg.cyan}Found ${results.entries.length} relevant items:${colors.reset}`);
        
        for (let i = 0; i < results.entries.length; i++) {
          const entry = results.entries[i];
          const score = results.relevanceScores.get(entry.id) || 0;
          
          if ('question' in entry) {
            console.log(`\n${colors.fg.white}${i+1}. FAQ: "${colors.bright}${entry.question}${colors.reset}${colors.fg.white}" (relevance: ${score.toFixed(2)})${colors.reset}`);
            console.log(`${colors.fg.white}   Category: ${entry.category}${colors.reset}`);
          } else {
            console.log(`\n${colors.fg.white}${i+1}. Document: "${colors.bright}${entry.title}${colors.reset}${colors.fg.white}" (relevance: ${score.toFixed(2)})${colors.reset}`);
            console.log(`${colors.fg.white}   Category: ${entry.category}${colors.reset}`);
          }
        }

        // Generate agent response
        console.log(`\n${colors.fg.cyan}Generating response...${colors.reset}`);
        const result = await propFirmAgent.run({
          task: query
        });

        console.log(`\n${colors.bright}${colors.fg.blue}PropFirm Support Agent:${colors.reset}`);
        console.log(`${colors.fg.cyan}${result.response}${colors.reset}`);

        askQuestion();
      } catch (error) {
        console.error(`${colors.fg.red}Error:${colors.reset}`, error);
        askQuestion();
      }
    });
  };

  askQuestion();
}

main().catch(console.error);