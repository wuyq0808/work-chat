import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AzureMCPClient, type AzureConfig } from './azure-client.js';
import { AzureToolHandlers } from './azure-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class AzureStreamableMCPServer {
  private azureClient: AzureMCPClient | null = null;
  private toolHandlers: AzureToolHandlers | null = null;

  constructor() {}

  // Initialize the Azure client with access token
  initializeAzureClient(config: AzureConfig): void {
    this.azureClient = new AzureMCPClient(config);
    this.toolHandlers = new AzureToolHandlers(this.azureClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.toolHandlers) {
      throw new Error(
        'Azure client not initialized. Call initializeAzureClient() first.'
      );
    }

    const server = new McpServer(
      {
        name: 'azure-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all Azure tools inline
    this.registerTools(server);

    return server;
  }

  // Register all Azure tools with a streamable MCP server
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
