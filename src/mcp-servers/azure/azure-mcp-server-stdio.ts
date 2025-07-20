import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AzureAPIClient } from './azure-client.js';
import { AzureTools } from './azure-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class AzureMCPStdioServer {
  private azureClient: AzureAPIClient;
  private server: Server;
  private tools: AzureTools;

  constructor(azureToken: string) {
    // Initialize Azure client
    this.azureClient = new AzureAPIClient({
      accessToken: azureToken,
    });

    // Initialize tool handlers
    this.tools = new AzureTools(this.azureClient);

    // Create the MCP server
    this.server = new Server(
      {
        name: 'azure-mcp-stdio-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Register list_tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: getToolDefinitions(this.tools.getTools()),
      };
    });

    // Register call_tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      return await executeTool(this.tools.getTools(), name, args || {});
    });
  }

  // Get the server instance for transport connection
  getServer(): Server {
    return this.server;
  }
}
