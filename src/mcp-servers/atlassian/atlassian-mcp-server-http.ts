import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  AtlassianMCPClient,
  type AtlassianConfig,
} from './atlassian-client.js';
import { AtlassianToolHandlers } from './atlassian-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class AtlassianStreamableMCPServer {
  private atlassianClient: AtlassianMCPClient | null = null;
  private toolHandlers: AtlassianToolHandlers | null = null;

  constructor() {}

  // Initialize the Atlassian client with access token
  initializeAtlassianClient(config: AtlassianConfig): void {
    this.atlassianClient = new AtlassianMCPClient(config);
    this.toolHandlers = new AtlassianToolHandlers(this.atlassianClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.toolHandlers) {
      throw new Error(
        'Atlassian client not initialized. Call initializeAtlassianClient() first.'
      );
    }

    const server = new McpServer(
      {
        name: 'atlassian-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all Atlassian tools using shared handlers
    this.registerTools(server);

    return server;
  }

  // Register all Atlassian tools with a streamable MCP server
  private registerTools(server: McpServer): void {
    if (!this.toolHandlers) {
      throw new Error('Tool handlers not initialized');
    }

    const toolDefinitions = getToolDefinitions(this.toolHandlers.getTools());

    for (const toolDef of toolDefinitions) {
      server.registerTool(
        toolDef.name,
        {
          description: toolDef.description,
          inputSchema: toolDef.inputSchema,
        },
        async (args: any) => {
          const result = await executeTool(
            this.toolHandlers!.getTools(),
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

  // Create the HTTP transport
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
