import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  AtlassianMCPClient,
  type AtlassianConfig,
} from './atlassian-client.js';
import { AtlassianToolHandlers } from './atlassian-tools.js';

export class AtlassianMCPStdioServer {
  private atlassianClient: AtlassianMCPClient;
  private server: Server;
  private toolHandlers: AtlassianToolHandlers;

  constructor(config: AtlassianConfig) {
    // Initialize Atlassian client
    this.atlassianClient = new AtlassianMCPClient(config);

    // Initialize tool handlers
    this.toolHandlers = new AtlassianToolHandlers(this.atlassianClient);

    // Create the MCP server
    this.server = new Server(
      {
        name: 'atlassian-mcp-stdio-server',
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
        tools: this.toolHandlers.getToolDefinitions(),
      };
    });

    // Register call_tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      return await this.toolHandlers.executeTool(name, args);
    });
  }

  // Get the server instance for transport connection
  getServer(): Server {
    return this.server;
  }
}
