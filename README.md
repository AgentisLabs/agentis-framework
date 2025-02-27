# Agentis

Agentis is a powerful framework for building autonomous AI agents with advanced capabilities like memory, planning, and multi-agent coordination.

## Features

- **Advanced Memory System**: Agents maintain short-term and long-term memory with semantic search capabilities
- **Planning & Task Decomposition**: Break down complex tasks with planning and subtask creation
- **Multi-Agent Swarms**: Create agent networks that can share information and collaborate
- **Platform Connectors**: Easily connect agents to platforms like Discord and Twitter
- **Personality & Role Management**: Control each agent's personality, role, lore, and goals
- **Anthropic API Integration**: Built-in support for Anthropic's Claude models

## Installation

```bash
npm install agentis
```

## Quick Start

```typescript
import { Agent, Memory, AgentRole } from 'agentis';

// Create a simple agent
const agent = new Agent({
  name: 'Jarvis',
  role: AgentRole.ASSISTANT,
  personality: {
    traits: ['helpful', 'knowledgeable', 'friendly'],
    background: 'A sophisticated AI assistant created to help with various tasks.'
  },
  goals: ['Provide accurate information', 'Assist with problem-solving'],
});

// Set up memory
agent.setMemory(new Memory());

// Run the agent with a task
await agent.run({
  task: "What's the weather in New York today?",
  tools: [WeatherTool],
});
```

## Advanced Usage

```typescript
import { 
  Agent, 
  AgentSwarm, 
  Memory, 
  PlanningStrategy, 
  DiscordConnector 
} from 'agentis';

// Create specialized agents
const researchAgent = new Agent({
  name: 'Researcher',
  role: AgentRole.RESEARCHER,
  goals: ['Find accurate information'],
});

const summarizeAgent = new Agent({
  name: 'Summarizer',
  role: AgentRole.WRITER,
  goals: ['Create concise summaries'],
});

// Create a swarm
const swarm = new AgentSwarm({
  agents: [researchAgent, summarizeAgent],
  coordinator: new Agent({ name: 'Coordinator' }),
  planningStrategy: PlanningStrategy.HIERARCHICAL,
});

// Connect to Discord
const discord = new DiscordConnector({
  token: process.env.DISCORD_BOT_TOKEN,
});

discord.connect(swarm);

// The swarm is now available in your Discord server!
```

## Documentation

### Enhanced Memory System

Agentis provides a sophisticated memory system with both short-term and long-term retention:

```typescript
import { 
  EnhancedMemory, 
  PineconeStore, 
  Agent
} from 'agentis';

// Set up vector storage with Pinecone
const vectorStore = new PineconeStore({
  index: 'agentis-memory',
  dimension: 1536, // OpenAI embeddings dimension
  namespace: 'agent-namespace'
});

// Create enhanced memory with both short-term and long-term capabilities
const memory = new EnhancedMemory(vectorStore, {
  userId: 'user-123',
  namespace: 'agent-namespace',
  shortTermTTL: 24 * 60 * 60 * 1000, // 24 hours
  embeddingModel: 'text-embedding-3-small'
});

// Initialize memory
await memory.initialize();

// Create agent with enhanced memory
const agent = new Agent({
  name: 'Memory Agent',
  memory: memory
});

// Store memories
await memory.storeShortTerm({
  input: "What's your favorite color?",
  output: "I like blue!",
  timestamp: Date.now()
});

await memory.storeLongTerm({
  input: "Tell me about quantum physics",
  output: "Quantum physics studies the behavior of matter at subatomic scales...",
  timestamp: Date.now(),
  importance: 0.8
});

// Create agent notes
await memory.saveNote({
  title: "User Preferences",
  content: "User seems interested in science topics",
  tags: ["preferences", "science"],
  importance: 0.9
});

// Search memory
const results = await memory.retrieve("quantum physics");
console.log(results.longTerm); // Most relevant memories
console.log(results.notes);    // Relevant notes
```

For more detailed documentation, visit [our documentation site](#).

## Contributing

Contributions are welcome! Please read our [contributing guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.