import { 
  KnowledgeBase, 
  KnowledgeGraph, 
  EmbeddingService, 
  Agent, 
  AgentRole 
} from '../src';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Knowledge Base Demo - Demonstrates creating and using a knowledge base
 * with an agent to answer questions about specific topics.
 */
async function main() {
  console.log("Starting Knowledge Base Demo...");

  // Create embedding service for semantic search
  const embeddingService = new EmbeddingService({
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'text-embedding-ada-002'
  });

  // Create the knowledge base
  const kb = new KnowledgeBase({
    persistPath: './data/product-kb.json',
    graphPersistPath: './data/product-kb-graph.json',
    embeddingService,
    autoSaveInterval: 30000 // 30 seconds
  });

  // Initialize the knowledge base 
  await kb.initialize();

  // Check if we already have data
  const stats = kb.getStats();
  console.log("Knowledge Base Stats:", stats);

  // If the knowledge base is empty, populate it with product information
  if (stats.faqCount === 0 && stats.documentCount === 0) {
    console.log("Populating knowledge base with product information...");
    
    // Add some FAQ entries
    await kb.ingestFAQs([
      {
        question: "What is Productify?",
        answer: "Productify is a project management tool designed for product teams to collaborate on feature development, track progress, and manage product roadmaps. It integrates with popular development tools like GitHub, JIRA, and Figma.",
        category: "General",
        tags: ["overview", "basics"]
      },
      {
        question: "How much does Productify cost?",
        answer: "Productify offers three pricing tiers:\n\n- Basic: $10/user/month\n- Professional: $25/user/month\n- Enterprise: Custom pricing\n\nAll plans include a 14-day free trial. The Professional plan is our most popular option.",
        category: "Pricing",
        tags: ["pricing", "plans", "costs"]
      },
      {
        question: "How do I create a new project?",
        answer: "To create a new project in Productify:\n\n1. Log in to your account\n2. Click the '+ New Project' button in the top right corner\n3. Enter the project name, description, and select team members\n4. Choose a project template (optional)\n5. Click 'Create Project'",
        category: "Usage",
        tags: ["how-to", "projects", "getting-started"]
      },
      {
        question: "Can I import data from JIRA?",
        answer: "Yes, Productify supports importing data from JIRA. To import:\n\n1. Go to Project Settings\n2. Select 'Integrations'\n3. Connect to your JIRA account\n4. Select the JIRA project to import\n5. Map JIRA fields to Productify fields\n6. Click 'Start Import'",
        category: "Integrations",
        tags: ["jira", "import", "integrations"]
      },
      {
        question: "How do I invite team members?",
        answer: "To invite team members to Productify:\n\n1. Go to Workspace Settings > Team Members\n2. Click 'Invite Members'\n3. Enter email addresses (one per line or comma-separated)\n4. Select their role (Admin, Member, or Viewer)\n5. Add a personal message (optional)\n6. Click 'Send Invites'",
        category: "Account Management",
        tags: ["team", "invites", "users"]
      },
      {
        question: "What's the difference between projects and workspaces?",
        answer: "In Productify:\n\n- Workspaces are the top-level organizing structure that contain multiple projects and have their own team members and settings\n- Projects exist within a workspace and represent specific product initiatives with their own tasks, documents, and timelines\n\nA company typically has one workspace with multiple projects for different products or initiatives.",
        category: "Organization",
        tags: ["workspaces", "projects", "structure"]
      }
    ]);

    // Add product documentation
    await kb.addDocument(
      "Getting Started Guide",
      "# Productify: Getting Started Guide\n\n## Welcome to Productify!\n\nThis guide will help you set up your account and create your first project.\n\n## Step 1: Create Your Account\n\nIf you haven't already, sign up for a Productify account at app.productify.io/signup. You'll need to provide:\n\n- Your email address\n- A secure password\n- Your name and job title\n\n## Step 2: Create a Workspace\n\nAfter signing in, you'll be prompted to create your first workspace. A workspace is where your team collaborates on projects.\n\n1. Enter a name for your workspace (usually your company or team name)\n2. Upload a logo (optional)\n3. Invite key team members (you can add more later)\n\n## Step 3: Create Your First Project\n\nOnce your workspace is set up, create your first project:\n\n1. Click the '+ New Project' button\n2. Enter the project details\n3. Choose a template or start from scratch\n4. Set up your project phases and timeline\n\n## Step 4: Customize Your Workflow\n\nProductify adapts to your team's workflow:\n\n1. Go to Project Settings > Workflow\n2. Customize task statuses and categories\n3. Set up automation rules (Pro and Enterprise plans)\n4. Configure integrations with your existing tools\n\n## Need Help?\n\nContact our support team at support@productify.io or use the in-app chat for assistance.",
      "https://docs.productify.io/getting-started",
      "Product Documentation",
      "Guides",
      ["getting-started", "onboarding", "tutorial"]
    );

    await kb.addDocument(
      "Roadmap Planning Features",
      "# Roadmap Planning in Productify\n\n## Overview\n\nProductify's roadmap planning tools help product teams visualize, prioritize, and communicate their product strategy.\n\n## Key Features\n\n### Visual Roadmap Builder\n\nDrag-and-drop interface for creating beautiful, timeline-based roadmaps.\n\n- Multiple view options: timeline, kanban, or list\n- Color-coding for different feature categories\n- Milestone markers for important dates\n- Customizable swimlanes (by team, objective, etc.)\n\n### Strategic Planning Tools\n\n- Objective linking: connect roadmap items to business objectives\n- Capacity planning: visualize team capacity vs. planned work\n- Scenario planning: create multiple roadmap versions\n- Prioritization framework: score features based on custom criteria\n\n### Stakeholder Communication\n\n- Shareable roadmap links with customizable access levels\n- Presentation mode for meetings\n- Automated status reports\n- Feedback collection portal\n- Export to PDF, PNG, or slide formats\n\n## Best Practices\n\n1. Start with objectives before adding features\n2. Use consistent time horizons (quarters work well)\n3. Don't overcommit - account for unknowns\n4. Review and adjust regularly\n5. Include non-feature work like technical debt\n\n## Related Features\n\n- Feature request management\n- Customer feedback portal\n- Release planning tools\n- Analytics dashboard",
      "https://docs.productify.io/features/roadmap-planning",
      "Product Documentation",
      "Features",
      ["roadmap", "planning", "features"]
    );

    console.log("Knowledge base populated successfully!");
  }

  // Access the knowledge graph to add relationships
  const graph = kb.getGraph();
  
  // Check if we need to create relationships between entities
  if (graph.getStats().relationshipCount === 0) {
    console.log("Creating knowledge graph relationships...");
    
    // Find nodes to create relationships between
    const faqNodes = graph.findNodes('faq');
    const docNodes = graph.findNodes('document');
    
    // Find specific nodes
    const pricingFaq = faqNodes.find(node => 
      node.label.includes("How much does Productify cost")
    );
    
    const inviteFaq = faqNodes.find(node => 
      node.label.includes("How do I invite team members")
    );
    
    const projectFaq = faqNodes.find(node => 
      node.label.includes("How do I create a new project")
    );
    
    const gettingStartedDoc = docNodes.find(node => 
      node.label.includes("Getting Started Guide")
    );
    
    // Create relationships if nodes exist
    if (pricingFaq && inviteFaq) {
      graph.createRelationship(
        pricingFaq.id, 
        inviteFaq.id, 
        'related_to', 
        { reason: "Both related to account setup" },
        0.7
      );
    }
    
    if (projectFaq && gettingStartedDoc) {
      graph.createRelationship(
        projectFaq.id, 
        gettingStartedDoc.id, 
        'described_in', 
        { reason: "Documentation explains the process in more detail" },
        0.9
      );
    }
    
    console.log("Relationships created!");
  }

  // Create an agent that uses the knowledge base
  const productAgent = new Agent({
    name: "Product Support Agent",
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ["helpful", "knowledgeable", "professional"],
      background: "A product specialist with extensive knowledge about Productify software.",
      voice: "Clear, friendly, and direct, focusing on answering questions accurately."
    },
    goals: [
      "Provide accurate information about Productify",
      "Help users understand product features and workflows",
      "Answer questions comprehensively using knowledge base information"
    ],
    knowledgeBase: kb,
    knowledgeBaseMaxResults: 3,
    knowledgeBaseThreshold: 0.6
  });

  // Create CLI interface for asking questions
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("\n=== Productify Knowledge Base Demo ===");
  console.log("Ask questions about Productify (type 'exit' to quit)");
  console.log("Example questions:");
  console.log("- What is Productify?");
  console.log("- How much does it cost?");
  console.log("- How do I create a new project?");
  console.log("- What roadmap planning features are there?");
  console.log("- What's the difference between workspaces and projects?");

  // Interactive question loop
  const askQuestion = () => {
    rl.question("\nYour question: ", async (question) => {
      if (question.toLowerCase() === 'exit') {
        rl.close();
        return;
      }

      try {
        console.log("Searching knowledge base...");
        
        // First, directly query the knowledge base to see what information is found
        const kbResults = await kb.query(question, {
          maxResults: 3,
          relevanceThreshold: 0.6
        });

        console.log(`\nFound ${kbResults.entries.length} relevant knowledge base entries:`);
        
        for (const entry of kbResults.entries) {
          const score = kbResults.relevanceScores.get(entry.id) || 0;
          
          if ('question' in entry) {
            console.log(`- FAQ: "${entry.question}" (relevance: ${score.toFixed(2)})`);
          } else {
            console.log(`- Document: "${entry.title}" (relevance: ${score.toFixed(2)})`);
          }
        }

        // Now use the agent to get a complete answer using the knowledge base
        console.log("\nGenerating answer...");
        
        const result = await productAgent.run({
          task: question
        });

        console.log("\nAgent response:");
        console.log(result.response);
        
        // Continue asking questions
        askQuestion();
      } catch (error) {
        console.error("Error:", error);
        askQuestion();
      }
    });
  };

  askQuestion();
}

main().catch(console.error);