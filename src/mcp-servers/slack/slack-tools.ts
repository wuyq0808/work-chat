import { SlackMCPClient } from './slack-client.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export class SlackToolHandlers {
  private slackClient: SlackMCPClient;

  constructor(slackClient: SlackMCPClient) {
    this.slackClient = slackClient;
  }

  // Get all tool definitions
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'conversations_history',
        description: 'Get conversation history from a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel_id: {
              type: 'string',
              description: 'Channel ID or name (e.g., #general)',
            },
            limit: {
              type: 'number',
              description: 'Number of messages (default: 10)',
            },
          },
          required: ['channel_id'],
        },
      },
      {
        name: 'channels_list',
        description: 'List all accessible Slack channels with pagination support',
        inputSchema: {
          type: 'object',
          properties: {
            cursor: {
              type: 'string',
              description: 'Pagination cursor',
            },
            limit: {
              type: 'number',
              description: 'Number of channels (default: 10, max: 100)',
            },
          },
          required: [],
        },
      },
      {
        name: 'conversations_replies',
        description: 'Get thread replies from a Slack conversation',
        inputSchema: {
          type: 'object',
          properties: {
            channel_id: {
              type: 'string',
              description: 'Channel ID or name (e.g., #general)',
            },
            thread_ts: {
              type: 'string',
              description: 'Thread timestamp (e.g., 1234567890.123456)',
            },
            limit: {
              type: 'number',
              description: 'Number of replies (default: 10)',
            },
          },
          required: ['channel_id', 'thread_ts'],
        },
      },
      {
        name: 'search_messages',
        description: 'Search for messages across Slack workspace',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text',
            },
            count: {
              type: 'number',
              description: 'Number of results (default: 20)',
            },
            sort: {
              type: 'string',
              enum: ['score', 'timestamp'],
              description: 'Sort by relevance or time',
            },
            sort_dir: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort direction',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  // Execute a tool by name
  async executeTool(name: string, args: any): Promise<ToolResponse> {
    try {
      switch (name) {
        case 'conversations_history':
          return await this.handleConversationsHistory(args);

        case 'channels_list':
          return await this.handleChannelsList(args);

        case 'conversations_replies':
          return await this.handleConversationsReplies(args);

        case 'search_messages':
          return await this.handleSearchMessages(args);

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleConversationsHistory(args: any): Promise<ToolResponse> {
    const { channel_id, limit = 10 } = args as {
      channel_id: string;
      limit?: number;
    };

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
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching conversation history: ${historyResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleChannelsList(args: any): Promise<ToolResponse> {
    const { cursor, limit } = args as {
      cursor?: string;
      limit?: number;
    };

    const channelsResult = await this.slackClient.getChannels(cursor, limit);

    if (channelsResult.success && channelsResult.data) {
      let content = 'id,name,is_private,is_member\n';
      channelsResult.data.forEach((channel: any) => {
        content += `${channel.id},${channel.name || 'unnamed'},${channel.is_private || false},${channel.is_member || false}\n`;
      });

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
        nextCursor: channelsResult.nextCursor,
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching channels: ${channelsResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleConversationsReplies(args: any): Promise<ToolResponse> {
    const { channel_id, thread_ts, limit = 10 } = args as {
      channel_id: string;
      thread_ts: string;
      limit?: number;
    };

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
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching thread replies: ${repliesResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchMessages(args: any): Promise<ToolResponse> {
    const {
      query,
      count = 20,
      sort = 'timestamp',
      sort_dir = 'desc',
    } = args as {
      query: string;
      count?: number;
      sort?: 'score' | 'timestamp';
      sort_dir?: 'asc' | 'desc';
    };

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
      return {
        content: [
          {
            type: 'text',
            text: `Error searching messages: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }
}