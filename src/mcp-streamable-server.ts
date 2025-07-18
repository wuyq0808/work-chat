import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SlackMCPClient, type SlackConfig } from './lib/slack-client.js';

export class SlackStreamableMCPServer {
  private slackClient: SlackMCPClient | null = null;

  constructor() {}

  // Initialize the Slack client with tokens
  initializeSlackClient(config: SlackConfig): void {
    this.slackClient = new SlackMCPClient(config);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    const server = new McpServer(
      {
        name: 'slack-mcp-streamable-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register conversations_history tool
    server.registerTool(
      'conversations_history',
      {
        title: 'Get Slack Conversation History',
        description: 'Get conversation history from a Slack channel',
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
        if (!this.slackClient) {
          throw new Error('Slack client not initialized');
        }

        await this.slackClient.getChannels();

        const historyResult = await this.slackClient.getConversationHistory({
          channel: channel_id,
          limit,
        });

        if (historyResult.success && historyResult.data) {
          let content = 'userName,text,time\n';
          historyResult.data.forEach((msg: any) => {
            content += `${msg.userName},${msg.text.replace(/\n/g, ' ')},${msg.time}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        } else {
          throw new Error(
            historyResult.error || 'Failed to fetch conversation history'
          );
        }
      }
    );

    // Register channels_list tool
    server.registerTool(
      'channels_list',
      {
        title: 'List Slack Channels',
        description:
          'List all accessible Slack channels with pagination support',
        inputSchema: {
          cursor: z.string().optional().describe('Pagination cursor'),
          limit: z
            .number()
            .optional()
            .describe('Number of channels (default: 10, max: 100)'),
        },
      },
      async ({ cursor, limit }) => {
        if (!this.slackClient) {
          throw new Error('Slack client not initialized');
        }

        const channelsResult = await this.slackClient.getChannels(
          cursor,
          limit
        );

        if (channelsResult.success && channelsResult.data) {
          let content = 'id,name,is_private,is_member\n';
          channelsResult.data.forEach((channel: any) => {
            content += `${channel.id},${channel.name || 'unnamed'},${channel.is_private || false},${channel.is_member || false}\n`;
          });

          const response: any = {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };

          // Include nextCursor if more results exist
          if (channelsResult.nextCursor) {
            response.nextCursor = channelsResult.nextCursor;
          }

          return response;
        } else {
          throw new Error(channelsResult.error || 'Failed to fetch channels');
        }
      }
    );

    // Register conversations_replies tool
    server.registerTool(
      'conversations_replies',
      {
        title: 'Get Slack Thread Replies',
        description: 'Get thread replies from a Slack conversation',
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
        if (!this.slackClient) {
          throw new Error('Slack client not initialized');
        }

        await this.slackClient.getChannels();

        const repliesResult = await this.slackClient.getConversationReplies({
          channel: channel_id,
          ts: thread_ts,
          limit,
        });

        if (repliesResult.success && repliesResult.data) {
          let content = 'userName,text,time,thread_ts\n';
          repliesResult.data.forEach((msg: any) => {
            content += `${msg.userName},${msg.text.replace(/\n/g, ' ')},${msg.time},${msg.thread_ts || ''}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        } else {
          throw new Error(
            repliesResult.error || 'Failed to fetch thread replies'
          );
        }
      }
    );

    // Register search_messages tool
    server.registerTool(
      'search_messages',
      {
        title: 'Search Slack Messages',
        description: 'Search for messages across Slack workspace',
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
      async ({ query, count = 20, sort = 'timestamp', sort_dir = 'desc' }) => {
        if (!this.slackClient) {
          throw new Error('Slack client not initialized');
        }

        await this.slackClient.getChannels();

        const searchResult = await this.slackClient.searchMessages({
          query,
          count,
          sort,
          sort_dir,
        });

        if (searchResult.success && searchResult.data) {
          let content = 'userName,text,time,channel\n';
          searchResult.data.forEach((msg: any) => {
            const channelInfo = this.slackClient?.getChannelInfo(msg.channel);
            const channelName = channelInfo?.name || msg.channel;
            content += `${msg.userName},"${msg.text.replace(/"/g, '""').replace(/\n/g, ' ')}",${msg.time},${channelName}\n`;
          });

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        } else {
          throw new Error(searchResult.error || 'Failed to search messages');
        }
      }
    );

    return server;
  }

  // Create Streamable HTTP transport
  createTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for OpenAI compatibility
      enableJsonResponse: true, // Enable JSON responses for OpenAI compatibility
      onsessioninitialized: (sessionId: string) => {
        // Session initialized
      },
      onsessionclosed: (sessionId: string) => {
        // Session closed
      },
    });
  }
}
