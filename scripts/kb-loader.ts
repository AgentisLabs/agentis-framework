import { KnowledgeBase, EmbeddingService, Agent, AgentRole } from '../src';
import * as fs from 'fs';
import * as readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Define FAQ format for import
interface FAQImport {
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
}

async function main() {
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

  // Create embedding service - using text-embedding-3-small which supports dimensions parameter
  const embeddingService = new EmbeddingService({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'text-embedding-3-small',
    dimensions: 1536
  });

  // Create knowledge base
  const kb = new KnowledgeBase({
    persistPath: path.join(dataDir, 'faq-kb.json'),
    graphPersistPath: path.join(dataDir, 'faq-kb-graph.json'),
    embeddingService
  });

  // Initialize knowledge base
  console.log('Initializing knowledge base...');
  await kb.initialize();

  // Check for command line argument (path to FAQ JSON file)
  const faqFilePath = process.argv[2];
  
  if (faqFilePath) {
    // Import from JSON file
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
    }
  } else {
    // Interactive mode - just demonstrate querying
    console.log('No FAQ file provided. Running in query mode.');
  }

  // Show current stats
  const stats = kb.getStats();
  console.log('\nKnowledge Base Stats:');
  console.log(`- FAQ entries: ${stats.faqCount}`);
  console.log(`- Document entries: ${stats.documentCount}`);
  console.log(`- Categories: ${stats.categories.join(', ')}`);
  console.log(`- Tags: ${stats.tags.join(', ')}`);

  // Interactive query mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n===== Knowledge Base Query Demo =====');
  console.log('Type a question to search the knowledge base (or "exit" to quit)');

  const askQuestion = () => {
    rl.question('\nQuery: ', async (query) => {
      if (query.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        // Query the knowledge base
        const results = await kb.query(query, {
          maxResults: 3,
          relevanceThreshold: 0.6
        });

        console.log(`\nFound ${results.entries.length} relevant items:`);
        
        // Display results
        for (const entry of results.entries) {
          const score = results.relevanceScores.get(entry.id) || 0;
          
          if ('question' in entry) {
            // FAQ entry
            console.log(`\n--- FAQ (relevance: ${score.toFixed(2)}) ---`);
            console.log(`Q: ${entry.question}`);
            console.log(`A: ${entry.answer}`);
          } else {
            // Document entry
            console.log(`\n--- Document (relevance: ${score.toFixed(2)}) ---`);
            console.log(`Title: ${entry.title}`);
            console.log(`Content: ${entry.content.substring(0, 200)}...`);
          }
          
          console.log('-----------------------------------');
        }

        // Create an agent that uses the knowledge base
        console.log("\nGenerating agent response...");
        const agent = new Agent({
          name: "Support Agent",
          role: AgentRole.ASSISTANT,
          personality: {
            traits: ["helpful", "knowledgeable"],
            background: "An agent with extensive knowledge about Agentis Framework"
          },
          goals: ["Provide accurate information"],
          knowledgeBase: kb,
          knowledgeBaseMaxResults: 3
        });

        const result = await agent.run({
          task: query
        });

        console.log("\nAgent response:");
        console.log(result.response);

        askQuestion();
      } catch (error) {
        console.error('Error querying knowledge base:', error);
        askQuestion();
      }
    });
  };

  askQuestion();
}

main().catch(console.error);