import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SlackAPIClient } from './slack-client.js';

interface ConversationsHistoryArgs {
  channel_id: string;
  limit?: number;
}

interface ConversationsRepliesArgs {
  channel_id: string;
  thread_ts: string;
  limit?: number;
}

interface SearchMessagesArgs {
  query: string;
  count?: number;
  sort?: 'score' | 'timestamp';
  sort_dir?: 'asc' | 'desc';
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export class SlackTools {
  private slackClient: SlackAPIClient;
  private tools: StructuredTool[];

  constructor(slackClient: SlackAPIClient) {
    this.slackClient = slackClient;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async input =>
          this.formatToolResponse(await this.handleAuthTest(input)),
        {
          name: 'slack__auth_test',
          description:
            'Get current authenticated user information and team details',
          schema: z.object({}),
        }
      ),
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
        .map((item: { text?: string }) => item.text || JSON.stringify(item))
        .join('\n');
    }
    return JSON.stringify(response);
  }

  // Get LangChain-compatible tools
  getTools(): StructuredTool[] {
    return this.tools;
  }

  private async handleAuthTest(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    args: Record<string, never>
  ): Promise<ToolResponse> {
    const authResult = await this.slackClient.getAuthTest();

    if (authResult.success && authResult.data) {
      const data = authResult.data;
      const content = `ok,url,team,user,team_id,user_id,bot_id\n${data.ok},${data.url},${data.team},${data.user},${data.team_id},${data.user_id},${data.bot_id || ''}`;

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
            text: `Error getting auth test: ${authResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleConversationsHistory(
    args: ConversationsHistoryArgs
  ): Promise<ToolResponse> {
    const { channel_id, limit = 10 } = args;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      historyResult.data.forEach((msg: any) => {
        // Slack API message format is complex and dynamic
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

  private async handleConversationsReplies(
    args: ConversationsRepliesArgs
  ): Promise<ToolResponse> {
    const { channel_id, thread_ts, limit = 10 } = args;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repliesResult.data.forEach((msg: any) => {
        // Slack API message format is complex and dynamic
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

  private async handleSearchMessages(
    args: SearchMessagesArgs
  ): Promise<ToolResponse> {
    const { query, count = 20, sort = 'timestamp', sort_dir = 'desc' } = args;

    const searchResult = await this.slackClient.searchMessages({
      query,
      count,
      sort,
      sort_dir,
    });

    if (searchResult.success && searchResult.data) {
      let content = 'userName,text,time,channel\n';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchResult.data.forEach((msg: any) => {
        // Slack search API returns dynamic message formats with channel name included
        const channelName = msg.channel?.name || msg.channel;
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
