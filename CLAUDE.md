# Agentis Framework

This file contains helpful information about the Agentis framework codebase to assist Claude in development tasks.

## Common Commands

### Build and Run

```bash
# Build the project
npm run build

# Run in development mode with hot reloading
npm run dev

# Run the main entry point
npm start

# Run a specific example
npx ts-node -r tsconfig-paths/register examples/basic-agent.ts
```

### Testing and Linting

```bash
# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
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