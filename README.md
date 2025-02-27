# Agentis

Agentis is a powerful framework for building autonomous AI agents with advanced capabilities like memory, planning, and multi-agent coordination.

## Features

- **Strong State & Memory**: Agents maintain persistent memory and can update their knowledge base
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

For detailed documentation, visit [our documentation site](#).

## Contributing

Contributions are welcome! Please read our [contributing guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.