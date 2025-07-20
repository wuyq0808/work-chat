import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SlackMCPClient, type SlackConfig } from './slack-client.js';
import { SlackToolHandlers } from './slack-tools.js';
import { getToolDefinitions, executeTool } from '../utils/mcpUtils.js';

export class SlackMCPStdioServer {
  private slackClient: SlackMCPClient;
  private server: Server;
  private toolHandlers: SlackToolHandlers;

  constructor(config: SlackConfig) {
    // Initialize Slack client
    this.slackClient = new SlackMCPClient(config);

    // Initialize tool handlers
    this.toolHandlers = new SlackToolHandlers(this.slackClient);

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
        tools: getToolDefinitions(this.toolHandlers.getTools()),
      };
    });

    // Register call_tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      return await executeTool(this.toolHandlers.getTools(), name, args);
    });
  }

  // Get the server instance for transport connection
  getServer(): Server {
    return this.server;
  }
}
