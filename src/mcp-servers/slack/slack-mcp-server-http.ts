import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SlackMCPClient, type SlackConfig } from './slack-client.js';
import { SlackToolHandlers } from './slack-tools.js';

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

    const toolDefinitions = this.toolHandlers.getToolDefinitions();

    for (const toolDef of toolDefinitions) {
      switch (toolDef.name) {
        case 'conversations_history':
          server.registerTool(
            'conversations_history',
            {
              title: 'Get Slack Conversation History',
              description: toolDef.description,
              inputSchema: {
                channel_id: z
                  .string()
                  .describe('Channel ID or name (e.g., #general)'),
                limit: z
                  .number()
                  .optional()
                  .describe('Number of messages (default: 10)'),
              },
            },
            async ({ channel_id, limit = 10 }) => {
              const result = await this.toolHandlers!.executeTool(
                'conversations_history',
                {
                  channel_id,
                  limit,
                }
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'channels_list':
          server.registerTool(
            'channels_list',
            {
              title: 'List Slack Channels',
              description: toolDef.description,
              inputSchema: {
                cursor: z.string().optional().describe('Pagination cursor'),
                limit: z
                  .number()
                  .optional()
                  .describe('Number of channels (default: 10, max: 100)'),
              },
            },
            async ({ cursor, limit }) => {
              const result = await this.toolHandlers!.executeTool(
                'channels_list',
                {
                  cursor,
                  limit,
                }
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'conversations_replies':
          server.registerTool(
            'conversations_replies',
            {
              title: 'Get Slack Thread Replies',
              description: toolDef.description,
              inputSchema: {
                channel_id: z
                  .string()
                  .describe('Channel ID or name (e.g., #general)'),
                thread_ts: z
                  .string()
                  .describe('Thread timestamp (e.g., 1234567890.123456)'),
                limit: z
                  .number()
                  .optional()
                  .describe('Number of replies (default: 10)'),
              },
            },
            async ({ channel_id, thread_ts, limit = 10 }) => {
              const result = await this.toolHandlers!.executeTool(
                'conversations_replies',
                {
                  channel_id,
                  thread_ts,
                  limit,
                }
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'search_messages':
          server.registerTool(
            'search_messages',
            {
              title: 'Search Slack Messages',
              description: toolDef.description,
              inputSchema: {
                query: z.string().describe('Search query text'),
                count: z
                  .number()
                  .optional()
                  .describe('Number of results (default: 20)'),
                sort: z
                  .enum(['score', 'timestamp'])
                  .optional()
                  .describe('Sort by relevance or time'),
                sort_dir: z
                  .enum(['asc', 'desc'])
                  .optional()
                  .describe('Sort direction'),
              },
            },
            async ({
              query,
              count = 20,
              sort = 'timestamp',
              sort_dir = 'desc',
            }) => {
              const result = await this.toolHandlers!.executeTool(
                'search_messages',
                {
                  query,
                  count,
                  sort,
                  sort_dir,
                }
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;
      }
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
