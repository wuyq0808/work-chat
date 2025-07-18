import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AzureMCPClient, type AzureConfig } from './lib/azure-client.js';

export class AzureStreamableMCPServer {
  private azureClient: AzureMCPClient | null = null;

  constructor() {}

  // Initialize the Azure client with access token
  initializeAzureClient(config: AzureConfig): void {
    this.azureClient = new AzureMCPClient(config);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    const server = new McpServer(
      {
        name: 'azure-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register get_profile tool
    server.registerTool(
      'get_profile',
      {
        title: 'Get Azure User Profile',
        description:
          'Get the current user profile information from Microsoft Graph',
        inputSchema: {},
      },
      async () => {
        if (!this.azureClient) {
          throw new Error('Azure client not initialized');
        }

        const profileResult = await this.azureClient.getProfile();

        if (profileResult.success && profileResult.data) {
          const profile = profileResult.data;
          let content =
            'id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation\n';
          content += `${profile.id},${profile.displayName},${profile.userPrincipalName},${profile.mail || ''},${profile.jobTitle || ''},${profile.department || ''},${profile.officeLocation || ''}\n`;

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          };
        } else {
          throw new Error(profileResult.error || 'Failed to fetch profile');
        }
      }
    );

    // Register get_messages tool
    server.registerTool(
      'get_messages',
      {
        title: 'Get Outlook Messages',
        description: 'Get messages from Outlook/Exchange',
        inputSchema: {
          limit: z
            .number()
            .optional()
            .describe('Number of messages to retrieve (default: 10)'),
          filter: z
            .string()
            .optional()
            .describe('OData filter expression (e.g., "isRead eq false")'),
          search: z.string().optional().describe('Search query for messages'),
        },
      },
      async ({ limit = 10, filter, search }) => {
        if (!this.azureClient) {
          throw new Error('Azure client not initialized');
        }

        const messagesResult = await this.azureClient.getMessages({
          limit,
          filter,
          search,
        });

        if (messagesResult.success && messagesResult.data) {
          let content =
            'id,subject,from,toRecipients,receivedDateTime,importance,isRead,body\n';
          messagesResult.data.forEach(msg => {
            content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead},"${msg.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
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
          throw new Error(messagesResult.error || 'Failed to fetch messages');
        }
      }
    );

    // Register get_calendar_events tool
    server.registerTool(
      'get_calendar_events',
      {
        title: 'Get Calendar Events',
        description: 'Get calendar events from Outlook/Exchange',
        inputSchema: {
          limit: z
            .number()
            .optional()
            .describe('Number of events to retrieve (default: 10)'),
          start_time: z
            .string()
            .optional()
            .describe('Start time filter (ISO 8601 format)'),
          end_time: z
            .string()
            .optional()
            .describe('End time filter (ISO 8601 format)'),
        },
      },
      async ({ limit = 10, start_time, end_time }) => {
        if (!this.azureClient) {
          throw new Error('Azure client not initialized');
        }

        const eventsResult = await this.azureClient.getCalendarEvents({
          limit,
          startTime: start_time,
          endTime: end_time,
        });

        if (eventsResult.success && eventsResult.data) {
          let content =
            'id,subject,start,end,location,attendees,organizer,importance,body\n';
          eventsResult.data.forEach(event => {
            content += `${event.id},"${event.subject.replace(/"/g, '""')}",${event.start},${event.end},"${event.location.replace(/"/g, '""')}","${event.attendees.join(';')}",${event.organizer},${event.importance},"${event.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
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
            eventsResult.error || 'Failed to fetch calendar events'
          );
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
