import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SlackAPIClient } from './slack-client.js';
import { SlackTools } from './slack-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcp-utils.js';

export class SlackMCPStdioServer {
  private slackClient: SlackAPIClient;
  private server: Server;
  private tools: SlackTools;

  constructor(userToken: string) {
    // Initialize Slack client
    if (!userToken) {
      throw new Error('userToken must be provided');
    }
    this.slackClient = new SlackAPIClient(userToken);

    // Initialize tool handlers
    this.tools = new SlackTools(this.slackClient);

    // Create the MCP server
    this.server = new Server(
      {
        name: 'slack-mcp-stdio-server',
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
