import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  AtlassianAPIClient,
  type AtlassianConfig,
} from './atlassian-client.js';
import { AtlassianTools } from './atlassian-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class AtlassianMCPStdioServer {
  private atlassianClient: AtlassianAPIClient;
  private server: Server;
  private tools: AtlassianTools;

  constructor(config: AtlassianConfig) {
    // Initialize Atlassian client
    this.atlassianClient = new AtlassianAPIClient(config);

    // Initialize tool handlers
    this.tools = new AtlassianTools(this.atlassianClient);

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
