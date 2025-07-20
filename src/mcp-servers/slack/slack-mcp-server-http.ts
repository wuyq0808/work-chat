import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SlackAPIClient, type SlackConfig } from './slack-client.js';
import { SlackTools } from './slack-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class SlackStreamableMCPServer {
  private slackClient: SlackAPIClient | null = null;
  private tools: SlackTools | null = null;

  constructor() {}

  // Initialize the Slack client with tokens
  initializeSlackClient(config: SlackConfig): void {
    this.slackClient = new SlackAPIClient(config);
    this.tools = new SlackTools(this.slackClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.tools) {
      throw new Error(
        'Slack client not initialized. Call initializeSlackClient() first.'
      );
    }

    const server = new McpServer(
      {
        name: 'slack-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all Slack tools using shared handlers
    this.registerTools(server);

    return server;
  }

  // Register all Slack tools with a streamable MCP server
  private registerTools(server: McpServer): void {
    if (!this.tools) {
      throw new Error('Tools not initialized');
    }

    const toolDefinitions = getToolDefinitions(this.tools.getTools());

    for (const toolDef of toolDefinitions) {
      server.registerTool(
        toolDef.name,
        {
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
        },
        async (args: any) => {
          const result = await executeTool(
            this.tools!.getTools(),
            toolDef.name,
            args
          );
          if (result.isError) {
            throw new Error(result.content[0].text);
          }
          return result;
        }
      );
    }
  }

  // Create Streamable HTTP transport
  createTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for OpenAI compatibility
      enableJsonResponse: true, // Enable JSON responses for OpenAI compatibility
      onsessioninitialized: (_sessionId: string) => {
        // Session initialized
      },
      onsessionclosed: (_sessionId: string) => {
        // Session closed
      },
    });
  }
}
