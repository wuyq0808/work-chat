import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SlackMCPClient } from './slack-client.js';

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
  private tools: StructuredTool[];

  constructor(slackClient: SlackMCPClient) {
    this.slackClient = slackClient;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async input =>
          this.formatToolResponse(await this.handleConversationsHistory(input)),
        {
          name: 'slack__conversations_history',
          description: 'Get conversation history from a Slack channel',
          schema: z.object({
            channel_id: z
              .string()
              .describe('Channel ID or name (e.g., #general)'),
            limit: z
              .number()
              .optional()
              .describe('Number of messages (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleChannelsList(input)),
        {
          name: 'slack__channels_list',
          description:
            'List all accessible Slack channels with pagination support',
          schema: z.object({
            cursor: z.string().optional().describe('Pagination cursor'),
            limit: z
              .number()
              .optional()
              .describe('Number of channels (default: 10, max: 100)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleConversationsReplies(input)),
        {
          name: 'slack__conversations_replies',
          description: 'Get thread replies from a Slack conversation',
          schema: z.object({
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
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleSearchMessages(input)),
        {
          name: 'slack__search_messages',
          description: 'Search for messages across Slack workspace',
          schema: z.object({
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
          }),
        }
      ),
    ];
  }

  // Helper to format ToolResponse as string for LangChain
  private formatToolResponse(response: ToolResponse): string {
    if (response.content && Array.isArray(response.content)) {
      return response.content
        .map((item: any) => item.text || JSON.stringify(item))
        .join('\n');
    }
    return JSON.stringify(response);
  }

  // Get LangChain-compatible tools
  getTools(): StructuredTool[] {
    return this.tools;
  }

  // Get tool definitions for MCP compatibility
  getToolDefinitions() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema,
    }));
  }

  // Execute a tool by name (for MCP compatibility)
  async executeTool(name: string, args: any): Promise<ToolResponse> {
    try {
      const tool = this.tools.find(t => t.name === name);
      if (!tool) {
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

      // Execute the tool and get the string result
      const result = await tool.invoke(args);

      // Convert string result back to ToolResponse format for MCP
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
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

    if (!channel_id || typeof channel_id !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: channel_id is required and must be a string',
          },
        ],
        isError: true,
      };
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
    const {
      channel_id,
      thread_ts,
      limit = 10,
    } = args as {
      channel_id: string;
      thread_ts: string;
      limit?: number;
    };

    if (!channel_id || typeof channel_id !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: channel_id is required and must be a string',
          },
        ],
        isError: true,
      };
    }

    if (!thread_ts || typeof thread_ts !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: thread_ts is required and must be a string',
          },
        ],
        isError: true,
      };
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
