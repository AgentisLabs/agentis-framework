// Enhanced memory example with improved embedding service and vector store
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  TavilySearchTool,
} from '../src';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { PineconeStore } from '../src/memory/pinecone-store';
import { EmbeddingService } from '../src/memory/embedding-service';
import { Logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('EnhancedMemoryExample');
logger.setLogLevel('info');

logger.info('Checking for API keys:');
logger.info('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');
logger.info('- OpenAI API key:', process.env.OPENAI_API_KEY ? 'Found' : 'Not found');
logger.info('- Pinecone API key:', process.env.PINECONE_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates using the enhanced memory system with improved embedding service,
 * batch operations, and caching for better performance.
 */
async function main() {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.error('Anthropic API key is required');
    process.exit(1);
  }
  
  if (!process.env.OPENAI_API_KEY) {
    logger.error('OpenAI API key is required for embeddings');
    process.exit(1);
  }
  
  if (!process.env.PINECONE_API_KEY) {
    logger.error('Pinecone API key is required for vector storage');
    process.exit(1);
  }
  
  logger.info('\nCreating an agent with enhanced memory...');
  
  // Create an optimized embedding service with caching and chunking
  const embeddingService = new EmbeddingService({
    model: 'text-embedding-3-large',
    fallbackModel: 'text-embedding-3-small',
    dimensions: 1536,
    enableCache: true,
    chunkSize: 8000,
    chunkOverlap: 200,
    maxRetries: 3
  });
  
  // Create Pinecone vector store with the embedding service
  const vectorStore = new PineconeStore({
    index: 'agentis-memory',
    dimension: 1536,
    namespace: 'example-agent',
    embeddingService: embeddingService,
    maxBatchSize: 20,
    cacheSize: 100,
    enableCompression: true
  });
  
  // Create enhanced memory system
  const enhancedMemory = new EnhancedMemory(vectorStore, {
    userId: 'example-user',
    namespace: 'example-agent',
    shortTermTTL: 24 * 60 * 60 * 1000, // 24 hours
  });
  
  // Initialize memory
  await enhancedMemory.initialize();
  
  // Create the agent
  const agent = new Agent({
    name: 'Memory Agent',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['intelligent', 'thoughtful', 'organized'],
      background: 'An AI assistant with advanced memory capabilities.'
    },
    goals: ['Remember important information', 'Use my memory to provide better responses'],
  });
  
  // Add the enhanced memory to the agent
  agent.setMemory(enhancedMemory);
  
  // Create tools
  const tavilySearchTool = new TavilySearchTool();
  
  // First, let's store some information in short-term memory using batch operations
  logger.info('\nStoring information in short-term memory (batch operation)...');
  
  const shortTermMemories = [
    {
      input: "What's your favorite color?",
      output: "I don't have personal preferences, but I find blue to be a calming color that many humans enjoy.",
      timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    },
    {
      input: "Do you remember my name? I'm Thomas.",
      output: "Yes, I remember that your name is Thomas. Thank you for introducing yourself!",
      timestamp: Date.now() - 1000 * 60 * 20, // 20 minutes ago
    },
    {
      input: "Tell me about your memory capabilities.",
      output: "I have both short-term and long-term memory systems. My short-term memory helps me recall recent conversations, while my long-term memory stores important information for future reference. I can also create and retrieve notes about topics that matter to you.",
      timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
    }
  ];
  
  // Store all short-term memories in parallel
  await Promise.all(shortTermMemories.map(memory => enhancedMemory.storeShortTerm(memory)));
  logger.info(`✓ Stored ${shortTermMemories.length} short-term memories`);
  
  // Now, let's add some long-term memories using batch operations
  logger.info('Storing information in long-term memory (batch operation)...');
  
  const longTermMemories = [
    {
      input: "What's the capital of France?",
      output: "The capital of France is Paris. It's known as the 'City of Light' and is famous for landmarks like the Eiffel Tower and the Louvre Museum.",
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
      importance: 0.7,
    },
    {
      input: "Who was Albert Einstein?",
      output: "Albert Einstein was a theoretical physicist born in 1879 who developed the theory of relativity, one of the pillars of modern physics. His work is also known for its influence on the philosophy of science. Einstein is best known to the general public for his mass–energy equivalence formula E = mc².",
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
      importance: 0.8,
    },
    {
      input: "Can you explain what quantum computing is?",
      output: "Quantum computing is a type of computing that uses quantum bits or 'qubits' instead of classical bits. Unlike classical bits which can be either 0 or 1, qubits can exist in multiple states simultaneously thanks to superposition. This allows quantum computers to solve certain complex problems much faster than classical computers, particularly in areas like cryptography, optimization, and simulating quantum systems.",
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
      importance: 0.9,
    }
  ];
  
  // Store all long-term memories in parallel
  await Promise.all(longTermMemories.map(memory => enhancedMemory.storeLongTerm(memory)));
  logger.info(`✓ Stored ${longTermMemories.length} long-term memories`);
  
  // Let's also create some notes using batch operations
  logger.info('Creating agent notes (batch operation)...');
  
  const notes = [
    {
      title: "User Preferences",
      content: "Thomas seems to be interested in science and technology topics. He has asked several questions about physics and AI capabilities.",
      tags: ["user", "preferences", "science", "technology"],
      importance: 0.9,
    },
    {
      title: "Meeting Follow-up",
      content: "Need to provide information about quantum computing advances when Thomas asks next time.",
      tags: ["reminder", "quantum computing", "follow-up"],
      importance: 0.8,
    },
    {
      title: "Project Discussion",
      content: "Thomas mentioned working on a project related to AI-powered data analytics. He's using machine learning to analyze climate patterns and predict weather anomalies.",
      tags: ["project", "AI", "climate", "data analytics"],
      importance: 0.85,
    }
  ];
  
  // Store all notes in parallel
  await Promise.all(notes.map(note => enhancedMemory.saveNote(note)));
  logger.info(`✓ Stored ${notes.length} agent notes`);
  
  // Make sure all batched operations are flushed to the database
  await (vectorStore as PineconeStore).flush();
  logger.info('✓ All memory operations flushed to database');
  
  // Now, let's test the memory retrieval with semantic search
  logger.info('\nTesting enhanced memory retrieval with semantic search...');
  
  // Query that should match short-term memory
  const shortTermQuery = "What's your name?";
  logger.info(`\nQuery: "${shortTermQuery}"`);
  
  console.time('Short-term memory retrieval');
  const shortTermResult = await enhancedMemory.retrieve(shortTermQuery);
  console.timeEnd('Short-term memory retrieval');
  
  logger.info(`📋 Results: ${shortTermResult.shortTerm.length} short-term memories, ${shortTermResult.longTerm.length} long-term memories, ${shortTermResult.notes.length} notes`);
  
  if (shortTermResult.shortTerm.length > 0) {
    logger.info('\nMatched short-term memories:');
    shortTermResult.shortTerm.forEach((memory, index) => {
      logger.info(`${index + 1}. Q: ${memory.input}`);
      logger.info(`   A: ${memory.output}`);
      if (memory.score !== undefined) {
        logger.info(`   Relevance: ${(memory.score * 100).toFixed(1)}%`);
      }
    });
  }
  
  // Query that should match long-term memory
  const longTermQuery = "Tell me about Einstein and relativity";
  logger.info(`\nQuery: "${longTermQuery}"`);
  
  console.time('Long-term memory retrieval');
  const longTermResult = await enhancedMemory.retrieve(longTermQuery);
  console.timeEnd('Long-term memory retrieval');
  
  logger.info(`📋 Results: ${longTermResult.shortTerm.length} short-term memories, ${longTermResult.longTerm.length} long-term memories, ${longTermResult.notes.length} notes`);
  
  if (longTermResult.longTerm.length > 0) {
    logger.info('\nMatched long-term memories:');
    longTermResult.longTerm.forEach((memory, index) => {
      logger.info(`${index + 1}. Q: ${memory.input}`);
      logger.info(`   A: ${memory.output.substring(0, 150)}${memory.output.length > 150 ? '...' : ''}`);
      if (memory.score !== undefined) {
        logger.info(`   Relevance: ${(memory.score * 100).toFixed(1)}%`);
      }
    });
  }
  
  // Query that should match both quantum computing note and long-term memory
  const quantumQuery = "quantum computing information";
  logger.info(`\nQuery: "${quantumQuery}"`);
  
  console.time('Quantum computing retrieval');
  const quantumResult = await enhancedMemory.retrieve(quantumQuery);
  console.timeEnd('Quantum computing retrieval');
  
  logger.info(`📋 Results: ${quantumResult.shortTerm.length} short-term memories, ${quantumResult.longTerm.length} long-term memories, ${quantumResult.notes.length} notes`);
  
  if (quantumResult.notes.length > 0) {
    logger.info('\nMatched notes:');
    quantumResult.notes.forEach((note, index) => {
      logger.info(`${index + 1}. Title: ${note.title}`);
      logger.info(`   Content: ${note.content}`);
      logger.info(`   Tags: ${note.tags.join(', ')}`);
      if (note.score !== undefined) {
        logger.info(`   Relevance: ${(note.score * 100).toFixed(1)}%`);
      }
    });
  }
  
  if (quantumResult.longTerm.length > 0) {
    logger.info('\nMatched long-term memories about quantum computing:');
    quantumResult.longTerm.forEach((memory, index) => {
      logger.info(`${index + 1}. Q: ${memory.input}`);
      logger.info(`   A: ${memory.output.substring(0, 150)}${memory.output.length > 150 ? '...' : ''}`);
      if (memory.score !== undefined) {
        logger.info(`   Relevance: ${(memory.score * 100).toFixed(1)}%`);
      }
    });
  }
  
  // Test memory combination in an agent task
  logger.info('\nAsking agent a question that requires combining memories...');
  console.time('Agent response');
  const result = await agent.run({
    task: "What's my name, what project am I working on, and what topic did I ask about most recently?",
    tools: [tavilySearchTool],
  });
  console.timeEnd('Agent response');
  
  logger.info(`\nAgent's response:\n${result.response}`);
  
  // Let's demonstrate memory management by transferring short-term to long-term
  logger.info('\nDemonstrating memory management: transferring short-term to long-term...');
  
  console.time('Memory transfer');
  const allMemories = await enhancedMemory.retrieve("", { includeAll: true });
  const shortTermIds = allMemories.shortTerm
    .map(memory => memory.id)
    .filter((id): id is string => id !== undefined);
  
  if (shortTermIds.length > 0) {
    const transferredIds = await enhancedMemory.transferToLongTerm(shortTermIds);
    logger.info(`✓ Transferred ${transferredIds.length} memories to long-term storage`);
  } else {
    logger.info('No short-term memories to transfer');
  }
  console.timeEnd('Memory transfer');
  
  // Get statistics about the memory store
  const stats = await (vectorStore as PineconeStore).getStats();
  logger.info('\nMemory store statistics:');
  logger.info(`Total vectors: ${stats.totalVectorCount}`);
  logger.info(`Namespaces: ${Object.keys(stats.namespaces).join(', ')}`);
  
  logger.info('\nEnhanced memory system demo completed successfully!');
}

// Run the example
main().catch(console.error);