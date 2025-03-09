import { Agent } from '../src/core/agent';
import { AgentRole } from '../src/core/types';
import { KnowledgeBase } from '../src/memory/knowledge-base';
import { EmbeddingService } from '../src/memory/embedding-service';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

// Sample documents will be loaded after setup

// Sample FAQs
const SAMPLE_FAQS = [
  {
    question: "What is the knowledge base chunking feature?",
    answer: "The knowledge base chunking feature splits large documents into smaller chunks for better retrieval. It allows for more precise information retrieval from large documents by matching relevant chunks rather than entire documents.",
    category: "Features",
    tags: ["Knowledge Base", "Chunking", "Retrieval"]
  },
  {
    question: "How does chunking improve information retrieval?",
    answer: "Chunking improves information retrieval by breaking large documents into semantically meaningful sections. This allows the system to find specific information buried deep within large texts, rather than having to retrieve the entire document. It also improves relevance scoring by focusing on the specific chunks that match a query.",
    category: "Features",
    tags: ["Knowledge Base", "Chunking", "Retrieval"]
  },
  {
    question: "What's the difference between FAQ and document retrieval?",
    answer: "FAQ retrieval is designed for direct question-answer pairs, while document retrieval is for longer-form content. FAQs are best for specific, commonly asked questions with concise answers. Document retrieval (with chunking) is better for detailed information extraction from longer texts like articles, reports, or books.",
    category: "Usage",
    tags: ["FAQ", "Documents", "Retrieval"]
  }
];

// Create the test files directory if it doesn't exist
async function setup() {
  const testDataDir = path.join(__dirname, '../test-data');
  
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }
  
  // Create sample text files if they don't exist
  if (!fs.existsSync(path.join(testDataDir, 'ai-history.txt'))) {
    fs.writeFileSync(path.join(testDataDir, 'ai-history.txt'), generateLongText('AI History', 50000));
  }
  
  if (!fs.existsSync(path.join(testDataDir, 'climate-change.txt'))) {
    fs.writeFileSync(path.join(testDataDir, 'climate-change.txt'), generateLongText('Climate Change', 40000));
  }
  
  if (!fs.existsSync(path.join(testDataDir, 'quantum-computing.txt'))) {
    fs.writeFileSync(path.join(testDataDir, 'quantum-computing.txt'), generateLongText('Quantum Computing', 30000));
  }
}

// Create a mock embedding service that generates random vectors
function createMockEmbeddingService(): EmbeddingService {
  // Create a mock class that extends EmbeddingService
  const mockService = {
    embedText: async (text: string): Promise<number[]> => {
      // Generate a random embedding vector of dimension 1536
      // Use a simple hash of the text as seed to ensure same text = same vector
      const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const random = (n: number) => (Math.sin(n) + 1) / 2; // Deterministic random between 0-1
      
      // Generate a 1536-dimensional vector
      const vector = Array(1536).fill(0).map((_, i) => random(seed + i) * 2 - 1);
      
      // Normalize to unit length
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      return vector.map(val => val / magnitude);
    },
    
    calculateSimilarity: (a: number[], b: number[]): number => {
      // Cosine similarity
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      
      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      return denominator === 0 ? 0 : (dotProduct / denominator);
    },
    
    // Add any other required methods here
    embedBatch: async (texts: string[]): Promise<number[][]> => {
      return Promise.all(texts.map(text => mockService.embedText(text)));
    }
  } as unknown as EmbeddingService;
  
  return mockService;
}

// Helper to generate long text
function generateLongText(topic: string, length: number): string {
  let content = `This is a long document about ${topic}. It contains detailed information about various aspects of ${topic}.\n\n`;
  
  // Create sections with paragraphs
  const sections = [
    `Introduction to ${topic}`,
    `History of ${topic}`,
    `Key Concepts in ${topic}`,
    `Modern Developments in ${topic}`,
    `Future of ${topic}`,
    `Applications of ${topic}`,
    `Challenges in ${topic}`,
    `Research Directions in ${topic}`
  ];
  
  // Add content to reach desired length
  while (content.length < length) {
    for (const section of sections) {
      if (content.length >= length) break;
      
      content += `## ${section}\n\n`;
      
      // Add 3-5 paragraphs per section
      const paragraphCount = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < paragraphCount; i++) {
        if (content.length >= length) break;
        
        // Generate a paragraph of text
        let paragraph = "";
        const sentenceCount = 5 + Math.floor(Math.random() * 10);
        
        for (let j = 0; j < sentenceCount; j++) {
          paragraph += `This is sentence ${j+1} about ${section.toLowerCase()} in the field of ${topic}. `;
          paragraph += `It contains specific information related to ${topic} and its ${['applications', 'concepts', 'theories', 'practice', 'history'][j % 5]}. `;
        }
        
        content += paragraph + "\n\n";
      }
    }
  }
  
  // Ensure we don't exceed length too much
  return content.substring(0, length);
}

// Initialize the knowledge base
async function initializeKnowledgeBase(): Promise<KnowledgeBase> {
  console.log("Initializing knowledge base with test data...");
  
  // Load sample documents after setup
  const SAMPLE_DOCS = [
    {
      title: "A Comprehensive History of Artificial Intelligence",
      content: fs.readFileSync(path.join(__dirname, '../test-data/ai-history.txt'), 'utf8'),
      category: "Technology",
      tags: ["AI", "History", "Computing"]
    },
    {
      title: "Understanding Climate Change: Causes and Effects",
      content: fs.readFileSync(path.join(__dirname, '../test-data/climate-change.txt'), 'utf8'),
      category: "Environment",
      tags: ["Climate", "Science", "Global Warming"]
    },
    {
      title: "Introduction to Quantum Computing",
      content: fs.readFileSync(path.join(__dirname, '../test-data/quantum-computing.txt'), 'utf8'),
      category: "Technology",
      tags: ["Quantum", "Computing", "Physics"]
    }
  ];
  
  // Create embedding service - either real or mock
  let embeddingService: EmbeddingService;
  
  try {
    // Try to create a real embedding service if API key is available
    if (process.env.OPENAI_API_KEY) {
      console.log("Using real OpenAI embedding service");
      embeddingService = new EmbeddingService({
        apiKey: process.env.OPENAI_API_KEY,
        model: 'text-embedding-3-small'
      });
    } else {
      // Create a mock embedding service that returns random vectors
      console.log("OPENAI_API_KEY not found. Using mock embedding service for testing");
      embeddingService = createMockEmbeddingService();
    }
  } catch (error) {
    console.log("Error creating embedding service. Using mock service instead:", error);
    embeddingService = createMockEmbeddingService();
  }
  
  // Create knowledge base with chunking enabled
  const kb = new KnowledgeBase({
    persistPath: path.join(__dirname, '../test-data/knowledge-base.json'),
    graphPersistPath: path.join(__dirname, '../test-data/knowledge-graph.json'),
    embeddingService,
    enableChunking: true,
    chunkSize: 2000,  // Smaller chunks for testing
    chunkOverlap: 200,
    maxDocumentLength: 100000,
    maxResults: 5,
    relevanceThreshold: 0.6
  });
  
  // Add FAQs
  await Promise.all(SAMPLE_FAQS.map(faq => 
    kb.addFAQ(faq.question, faq.answer, faq.category, faq.tags)
  ));
  
  // Add documents
  await Promise.all(SAMPLE_DOCS.map(doc => 
    kb.addDocument(doc.title, doc.content, undefined, undefined, doc.category, doc.tags)
  ));
  
  // Initialize the knowledge base
  await kb.initialize();
  
  // Print some stats
  const stats = kb.getStats();
  console.log("Knowledge Base Statistics:");
  console.log(`- FAQs: ${stats.faqCount}`);
  console.log(`- Documents: ${stats.documentCount}`);
  console.log(`- Chunks: ${stats.chunkCount}`);
  console.log(`- Avg. Chunks per Document: ${stats.averageChunksPerDocument.toFixed(1)}`);
  console.log(`- Avg. Chunk Size: ${stats.averageChunkSize.toFixed(0)} characters`);
  console.log(`- Total Content Size: ${Math.round(stats.totalContentSize / 1024)} KB`);
  
  return kb;
}

// Create an agent with the knowledge base
async function createAgent(knowledgeBase: KnowledgeBase): Promise<Agent> {
  // Check if we have an OpenAI API key
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  
  // Create agent
  let agent: Agent;
  
  if (hasApiKey) {
    // Create a real agent if we have an API key
    agent = new Agent({
      name: "KnowledgeAgent",
      role: AgentRole.ASSISTANT,
      personality: {
        traits: ["helpful", "knowledgeable", "detailed"],
        background: "An AI assistant with access to a knowledge base that demonstrates document chunking capabilities",
        voice: "informative yet conversational",
        examples: []
      },
      goals: [
        "Provide accurate information from the knowledge base",
        "Demonstrate the effectiveness of document chunking",
        "Explain complex topics in a clear manner"
      ],
      knowledgeBase: knowledgeBase
    });
  } else {
    // Create agent with mock provider
    console.log("No OpenAI API key found. Creating agent with mock provider for testing.");
    console.log("This will demonstrate chunking and retrieval but responses won't be meaningful.");
    
    // Create agent with a custom provider that just returns the retrieved context
    const mockProvider = {
      generateResponse: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        // Extract context from user message
        const userMessage = messages.find(m => m.role === 'user');
        const query = userMessage ? userMessage.content : '';
        
        // Find context information in the message
        const contextMatch = query.match(/Relevant Knowledge Base Information[\s\S]*$/);
        const response = contextMatch 
          ? `Here's what I found in the knowledge base:\n\n${contextMatch[0]}`
          : `I don't have any information about that in my knowledge base.`;
        
        return {
          message: response,
          toolCalls: [],
          tokens: { input: 0, output: 0, total: 0 }
        };
      }
    };
    
    agent = new Agent({
      name: "KnowledgeAgent",
      role: AgentRole.ASSISTANT,
      personality: {
        traits: ["helpful"],
        background: "A test agent that demonstrates document chunking",
        examples: []
      },
      goals: ["Test document chunking"],
      knowledgeBase: knowledgeBase
    }, mockProvider as any);
  }
  
  return agent;
}

// Start the interactive CLI
async function startInteractiveCLI(agent: Agent) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log("\n=== Knowledge Base Chunking Test ===");
  console.log("Ask questions about AI History, Climate Change, or Quantum Computing");
  console.log("Type 'exit' to quit\n");
  
  const askQuestion = () => {
    rl.question("> ", async (query) => {
      if (query.toLowerCase() === 'exit') {
        rl.close();
        return;
      }
      
      console.log("\nThinking...");
      
      try {
        // Variable to track accumulated response for streaming
        let currentResponse = "";
        process.stdout.write("\r\x1b[K"); // Clear the "Thinking..." line
        
        const result = await agent.run({
          task: query,
          stream: true,
          onStream: (text, done) => {
            // Calculate what's new
            const newText = text.substring(currentResponse.length);
            if (newText) {
              process.stdout.write(newText);
            }
            currentResponse = text;
            
            if (done) {
              console.log("\n");
              setTimeout(askQuestion, 500); // Small delay for readability
            }
          }
        });
        
        // In case streaming didn't work for some reason
        if (!currentResponse) {
          console.log(result.response);
        }
      } catch (error) {
        console.error("Error:", error);
        askQuestion();
      }
    });
  };
  
  askQuestion();
}

// Main function
async function main() {
  try {
    // Ensure test directories and files exist
    await setup();
    console.log("Test files created successfully. Initializing knowledge base...");
    
    // Initialize knowledge base
    const knowledgeBase = await initializeKnowledgeBase();
    console.log("Knowledge base initialized successfully. Creating agent...");
    
    // Create agent
    const agent = await createAgent(knowledgeBase);
    console.log("Agent created successfully. Starting interactive CLI...");
    
    // Start CLI
    await startInteractiveCLI(agent);
  } catch (error) {
    console.error("Error:", error);
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
  }
}

// Run the application
main().catch(console.error);