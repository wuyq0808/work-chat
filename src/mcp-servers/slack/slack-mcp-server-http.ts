import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SlackMCPClient, type SlackConfig } from './slack-client.js';
import { SlackToolHandlers } from './slack-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class SlackStreamableMCPServer {
  private slackClient: SlackMCPClient | null = null;
  private toolHandlers: SlackToolHandlers | null = null;

  constructor() {}

  // Initialize the Slack client with tokens
  initializeSlackClient(config: SlackConfig): void {
    this.slackClient = new SlackMCPClient(config);
    this.toolHandlers = new SlackToolHandlers(this.slackClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.toolHandlers) {
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
    if (!this.toolHandlers) {
      throw new Error('Tool handlers not initialized');
    }

    const toolDefinitions = getToolDefinitions(this.toolHandlers.getTools());

    for (const toolDef of toolDefinitions) {
      // Remove prefix for MCP registration (slack__conversations_history -> conversations_history)
      const mcpToolName = toolDef.name.replace('slack__', '');

      server.registerTool(
        mcpToolName,
        {
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
        },
        async (args: any) => {
          const result = await executeTool(
            this.toolHandlers.getTools(),
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
