import { randomUUID } from 'node:crypto';
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
    const server = new McpServer({
      name: "slack-mcp-streamable-server",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Register conversations_history tool
    server.registerTool('conversations_history', {
      title: 'Get Slack Conversation History',
      description: 'Get conversation history from a Slack channel',
      inputSchema: {
        channel_id: z.string().describe('Channel ID or name (e.g., #general)'),
        limit: z.number().optional().describe('Number of messages (default: 10)')
      }
    }, async ({ channel_id, limit = 10 }) => {
      if (!this.slackClient) {
        throw new Error('Slack client not initialized');
      }

      await this.slackClient.refreshUsers();
      await this.slackClient.refreshChannels();
      
      const historyResult = await this.slackClient.getConversationHistory({
        channel: channel_id,
        limit
      });
      
      if (historyResult.success && historyResult.data) {
        let content = 'userName,text,time\n';
        historyResult.data.forEach((msg: any) => {
          content += `${msg.userName},${msg.text.replace(/\n/g, ' ')},${msg.time}\n`;
        });
        
        return {
          content: [
            {
              type: "text",
              text: content
            }
          ]
        };
      } else {
        throw new Error(historyResult.error || 'Failed to fetch conversation history');
      }
    });

    // Register channels_list tool
    server.registerTool('channels_list', {
      title: 'List Slack Channels',
      description: 'List all accessible Slack channels',
      inputSchema: {}
    }, async () => {
      if (!this.slackClient) {
        throw new Error('Slack client not initialized');
      }

      await this.slackClient.refreshChannels();
      const channelsResult = await this.slackClient.getChannels();
      
      if (channelsResult.success && channelsResult.data) {
        let content = 'id,name,is_private,is_member\n';
        channelsResult.data.forEach((channel: any) => {
          content += `${channel.id},${channel.name || 'unnamed'},${channel.is_private || false},${channel.is_member || false}\n`;
        });
        
        return {
          content: [
            {
              type: "text", 
              text: content
            }
          ]
        };
      } else {
        throw new Error(channelsResult.error || 'Failed to fetch channels');
      }
    });

    return server;
  }

  // Create Streamable HTTP transport
  createTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode for OpenAI compatibility
      enableJsonResponse: true, // Enable JSON responses for OpenAI compatibility
      onsessioninitialized: (sessionId: string) => {
        console.log(`MCP Streamable session initialized: ${sessionId}`);
      },
      onsessionclosed: (sessionId: string) => {
        console.log(`MCP Streamable session closed: ${sessionId}`);
      }
    });
  }
}