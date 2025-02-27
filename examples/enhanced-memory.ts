// Enhanced memory example
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  TavilySearchTool,
} from '../src';
import { EnhancedMemory } from '../src/memory/enhanced-memory';
import { PineconeStore } from '../src/memory/pinecone-store';

// Load environment variables
dotenv.config();

console.log('Checking for API keys:');
console.log('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');
console.log('- OpenAI API key:', process.env.OPENAI_API_KEY ? 'Found' : 'Not found');
console.log('- Pinecone API key:', process.env.PINECONE_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates using the enhanced memory system with long-term, short-term memory and notes
 */
async function main() {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Anthropic API key is required');
    process.exit(1);
  }
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API key is required for embeddings');
    process.exit(1);
  }
  
  if (!process.env.PINECONE_API_KEY) {
    console.error('Pinecone API key is required for vector storage');
    process.exit(1);
  }
  
  console.log('\nCreating an agent with enhanced memory...');
  
  // Create Pinecone vector store
  const vectorStore = new PineconeStore({
    index: 'agentis-memory',
    dimension: 1536, // OpenAI embeddings dimension
    namespace: 'example-agent',
  });
  
  // Create enhanced memory system
  const enhancedMemory = new EnhancedMemory(vectorStore, {
    userId: 'example-user',
    namespace: 'example-agent',
    shortTermTTL: 24 * 60 * 60 * 1000, // 24 hours
    embeddingModel: 'text-embedding-3-small',
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
  
  // First, let's store some information in short-term memory
  console.log('\nStoring information in short-term memory...');
  
  await enhancedMemory.storeShortTerm({
    input: "What's your favorite color?",
    output: "I don't have personal preferences, but I find blue to be a calming color that many humans enjoy.",
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
  });
  
  await enhancedMemory.storeShortTerm({
    input: "Do you remember my name? I'm Thomas.",
    output: "Yes, I remember that your name is Thomas. Thank you for introducing yourself!",
    timestamp: Date.now() - 1000 * 60 * 20, // 20 minutes ago
  });
  
  // Now, let's add some long-term memories
  console.log('Storing information in long-term memory...');
  
  await enhancedMemory.storeLongTerm({
    input: "What's the capital of France?",
    output: "The capital of France is Paris. It's known as the 'City of Light' and is famous for landmarks like the Eiffel Tower and the Louvre Museum.",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    importance: 0.7,
  });
  
  await enhancedMemory.storeLongTerm({
    input: "Who was Albert Einstein?",
    output: "Albert Einstein was a theoretical physicist born in 1879 who developed the theory of relativity, one of the pillars of modern physics. His work is also known for its influence on the philosophy of science. Einstein is best known to the general public for his mass–energy equivalence formula E = mc².",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
    importance: 0.8,
  });
  
  // Let's also create some notes
  console.log('Creating agent notes...');
  
  await enhancedMemory.saveNote({
    title: "User Preferences",
    content: "Thomas seems to be interested in science and technology topics. He has asked several questions about physics and AI capabilities.",
    tags: ["user", "preferences", "science", "technology"],
    importance: 0.9,
  });
  
  await enhancedMemory.saveNote({
    title: "Meeting Follow-up",
    content: "Need to provide information about quantum computing advances when Thomas asks next time.",
    tags: ["reminder", "quantum computing", "follow-up"],
    importance: 0.8,
  });
  
  // Now, let's test the memory retrieval
  console.log('\nTesting memory retrieval...');
  
  // Query that should match short-term memory
  const shortTermQuery = "What's your name?";
  console.log(`\nQuery: "${shortTermQuery}"`);
  const shortTermResult = await enhancedMemory.retrieve(shortTermQuery);
  
  console.log('Short-term memories:', shortTermResult.shortTerm.length);
  shortTermResult.shortTerm.forEach(memory => {
    console.log(`- Q: ${memory.input}`);
    console.log(`  A: ${memory.output}`);
  });
  
  console.log('Long-term memories:', shortTermResult.longTerm.length);
  console.log('Notes:', shortTermResult.notes.length);
  
  // Query that should match long-term memory
  const longTermQuery = "Tell me about Einstein";
  console.log(`\nQuery: "${longTermQuery}"`);
  const longTermResult = await enhancedMemory.retrieve(longTermQuery);
  
  console.log('Short-term memories:', longTermResult.shortTerm.length);
  console.log('Long-term memories:', longTermResult.longTerm.length);
  longTermResult.longTerm.forEach(memory => {
    console.log(`- Q: ${memory.input}`);
    console.log(`  A: ${memory.output}`);
  });
  
  console.log('Notes:', longTermResult.notes.length);
  
  // Query that should match notes
  const notesQuery = "quantum computing reminder";
  console.log(`\nQuery: "${notesQuery}"`);
  const notesResult = await enhancedMemory.retrieve(notesQuery);
  
  console.log('Short-term memories:', notesResult.shortTerm.length);
  console.log('Long-term memories:', notesResult.longTerm.length);
  console.log('Notes:', notesResult.notes.length);
  notesResult.notes.forEach(note => {
    console.log(`- Title: ${note.title}`);
    console.log(`  Content: ${note.content}`);
    console.log(`  Tags: ${note.tags.join(', ')}`);
  });
  
  // Now, use the agent to answer a question that requires memory
  console.log('\nAsking agent a question that requires memory...');
  const result = await agent.run({
    task: "What's my name and what topic was I interested in learning more about?",
    tools: [tavilySearchTool],
  });
  
  console.log(`\nAgent's response:\n${result.response}`);
  
  // Let's transfer some short-term memories to long-term
  console.log('\nTransferring short-term memories to long-term...');
  const shortTermMemories = await enhancedMemory.retrieve("", { includeAll: true });
  const shortTermIds = shortTermMemories.shortTerm
    .map(memory => memory.id)
    .filter((id): id is string => id !== undefined);
  
  if (shortTermIds.length > 0) {
    const transferredIds = await enhancedMemory.transferToLongTerm(shortTermIds);
    console.log(`Transferred ${transferredIds.length} memories to long-term storage`);
  } else {
    console.log('No short-term memories to transfer');
  }
}

// Run the example
main().catch(console.error);