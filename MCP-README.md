# Model Context Protocol (MCP) Support in Agentis Framework

This document explains how to use the Model Context Protocol (MCP) with the Agentis Framework, which now supports direct integration with MCP servers alongside standard tools.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI models to use tools and access external data through a standardized interface. MCP servers provide tools, resources, and prompts to AI models in a standardized way. Learn more at [modelcontextprotocol.io](https://modelcontextprotocol.io/).

## Getting Started with MCP in Agentis

### 1. Create an MCPServer

First, create and connect to an MCP server:

```typescript
import { MCPServer } from 'agentis-framework';

// Create the MCP server
const server = new MCPServer({
  path: '/path/to/mcp-server.js', // Path to the MCP server script
  name: 'weather-server'          // Optional friendly name
});

// Connect to the server (this loads the available tools)
await server.connect();

console.log(`Connected to MCP server with ${server.tools.length} tools`);
```

### 2. Add the MCP Server to an Agent

The MCP server can be attached to any agent just like standard tools:

```typescript
import { Agent, AgentRole, MCPServer } from 'agentis-framework';

// Create a standard agent
const agent = new Agent({
  name: 'WeatherAssistant',
  role: AgentRole.ASSISTANT,
  personality: {
    traits: ['helpful', 'knowledgeable'],
    background: 'A weather assistant using MCP tools.'
  },
  goals: ['Provide accurate weather information']
});

// Create and connect to an MCP server
const weatherServer = new MCPServer({
  path: '/path/to/weather-server.js',
  name: 'weather-mcp'
});

await weatherServer.connect();

// Add the MCP server to the agent
agent.addMCPServer(weatherServer);
```

### 3. Run the Agent with MCP

When running your agent, enable MCP by setting the `useMcpServers` flag:

```typescript
const result = await agent.run({
  task: 'What is the weather forecast for New York?',
  useMcpServers: true,  // This enables MCP servers
  onStream: (text, done) => {
    if (done) {
      console.log(text);
    }
  }
});

console.log('Response:', result.response);
```

### 4. Clean Up

When you're done, disconnect from the server:

```typescript
// Remove from agent
agent.removeMCPServer(weatherServer.id);

// Disconnect the server
await weatherServer.disconnect();
```

## Using MCP Alongside Standard Tools

One of the key features of this implementation is the ability to use MCP servers alongside standard tools:

```typescript
import { Agent, WebSearchTool, MCPServer } from 'agentis-framework';

const agent = new Agent({/* config */});

// Add a standard tool
const webSearchTool = new WebSearchTool();

// Add an MCP server
const weatherServer = new MCPServer({
  path: '/path/to/weather-server.js',
  name: 'weather-mcp'
});
await weatherServer.connect();
agent.addMCPServer(weatherServer);

// Use both in the same run
const result = await agent.run({
  task: 'Search for weather in New York and give me a forecast',
  tools: [webSearchTool],        // Standard tools
  useMcpServers: true,           // Enable MCP servers too
});
```

## Running the Example

We've included an example that demonstrates using an agent with both standard tools and MCP servers:

1. Make sure you have the required environment variables:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

2. Run the example:
   ```bash
   npm run integrated-mcp
   ```

The example shows how to:
- Create a standard agent
- Add both standard tools and MCP servers
- Run queries using either or both types of tools

## Creating Your Own MCP Servers

You can create your own MCP servers to provide custom tools for your agents. See the `/mcp-example` directory for examples.

Basic MCP server implementation:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
});

// Register a tool
server.tool(
  "my-tool",
  "Description of my tool",
  {
    param1: z.string().describe("First parameter"),
    param2: z.number().describe("Second parameter"),
  },
  async ({ param1, param2 }) => {
    // Tool implementation
    return {
      content: [
        {
          type: "text",
          text: `Results for ${param1} and ${param2}`,
        },
      ],
    };
  },
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

## Advanced Usage

### Multiple MCP Servers

You can add multiple MCP servers to a single agent:

```typescript
// Add multiple MCP servers
const weatherServer = new MCPServer({
  path: '/path/to/weather-server.js',
  name: 'weather-mcp'
});
await weatherServer.connect();
agent.addMCPServer(weatherServer);

const calculatorServer = new MCPServer({
  path: '/path/to/calculator-server.js',
  name: 'calculator-mcp'
});
await calculatorServer.connect();
agent.addMCPServer(calculatorServer);

// The agent will have access to tools from both servers
```

### Selective Tool Usage

You can control which types of tools to use for each run:

```typescript
// Only use standard tools (no MCP)
const standardResult = await agent.run({
  task: "Search for news",
  tools: [webSearchTool],
  useMcpServers: false  // Disable MCP servers
});

// Only use MCP tools (no standard tools)
const mcpResult = await agent.run({
  task: "Get weather forecast",
  tools: [],             // No standard tools
  useMcpServers: true    // Enable MCP servers
});

// Use both standard and MCP tools
const hybridResult = await agent.run({
  task: "Search for weather and give me a forecast",
  tools: [webSearchTool],
  useMcpServers: true
});
```

## Troubleshooting

If you encounter issues with MCP:

1. **Connection errors**: Make sure the MCP server script path is correct and the script is executable
2. **Server not found**: Verify the path to the MCP server script
3. **Tool not found**: Check that the server has the tool you're trying to use
4. **Tool execution errors**: Check server logs for details
5. **Model doesn't use tools**: Make sure your prompt is clear about using the available tools

For more help, see the MCP documentation at [modelcontextprotocol.io/docs](https://modelcontextprotocol.io/docs).