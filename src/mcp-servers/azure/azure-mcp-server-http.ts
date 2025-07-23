import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AzureAPIClient, type AzureConfig } from './azure-client.js';
import { AzureTools } from './azure-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcp-utils.js';

export class AzureStreamableMCPServer {
  private azureClient: AzureAPIClient | null = null;
  private tools: AzureTools | null = null;

  constructor() {}

  // Initialize the Azure client with access token
  initializeAzureClient(config: AzureConfig): void {
    this.azureClient = new AzureAPIClient(config);
    this.tools = new AzureTools(this.azureClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.tools) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
          // MCP server handler args are dynamically typed
          const result = await executeTool(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.tools!.getTools(), // tools is guaranteed to be initialized by registerTools check
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
