# This file is for users who want to use an ai powered IDE to develop with the Agentis Framework, it acts as a guide to help Claude understand the codebase and assist with development tasks.

# Agentis Framework

This file contains helpful information about the Agentis framework codebase to assist Claude in development tasks.

## Common Commands

### Build and Run

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode with hot reloading
npm run dev

# Run the main entry point
npm start

# Run a specific example
npx ts-node -r tsconfig-paths/register examples/basic-agent.ts
npx ts-node -r tsconfig-paths/register examples/agent-swarm.ts
npx ts-node -r tsconfig-paths/register examples/discord-bot.ts
```

### Environment Setup

Make sure to set up your environment variables in the `.env` file:

```
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional
DEFAULT_MODEL=claude-3-5-sonnet-20240620
LOG_LEVEL=info # debug, info, warn, error
```

## Project Structure

- `src/` - Main source code
  - `core/` - Core framework components (Agent, AgentSwarm, LLMProvider)
  - `memory/` - Memory implementations for agent state
  - `planning/` - Task planning and decomposition
  - `tools/` - Tool implementations for agents
  - `platform-connectors/` - Connectors for platforms like Discord and Twitter
  - `utils/` - Utilities and helpers
  - `config/` - Configuration management
- `examples/` - Example use cases
- `dist/` - Compiled JavaScript (built output)

## Code Style Preferences

- Use TypeScript interfaces and types for all public APIs
- Prefer composition over inheritance
- Use asynchronous code with Promises and async/await
- Document all public methods and classes with JSDoc comments
- Use meaningful variable names
- Implement proper error handling