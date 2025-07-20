import { AzureMCPClient } from './azure-client.js';

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

export class AzureToolHandlers {
  private azureClient: AzureMCPClient;

  constructor(azureClient: AzureMCPClient) {
    this.azureClient = azureClient;
  }

  // Get all tool definitions
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'get_profile',
        description:
          'Get the current user profile information from Microsoft Graph',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_messages',
        description: 'Get messages from Outlook/Exchange',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of messages to retrieve (default: 10)',
            },
            filter: {
              type: 'string',
              description: 'OData filter expression (e.g., "isRead eq false")',
            },
            search: {
              type: 'string',
              description: 'Search query for messages',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_calendar_events',
        description: 'Get calendar events from Outlook/Exchange',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of events to retrieve (default: 10)',
            },
            start_time: {
              type: 'string',
              description: 'Start time filter (ISO 8601 format)',
            },
            end_time: {
              type: 'string',
              description: 'End time filter (ISO 8601 format)',
            },
          },
          required: [],
        },
      },
    ];
  }

  // Execute a tool by name
  async executeTool(name: string, args: any): Promise<ToolResponse> {
    try {
      switch (name) {
        case 'get_profile':
          return await this.handleGetProfile();

        case 'get_messages':
          return await this.handleGetMessages(args);

        case 'get_calendar_events':
          return await this.handleGetCalendarEvents(args);

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

  private async handleGetProfile(): Promise<ToolResponse> {
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
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching profile: ${profileResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetMessages(args: any): Promise<ToolResponse> {
    const {
      limit = 10,
      filter,
      search,
    } = args as {
      limit?: number;
      filter?: string;
      search?: string;
    };

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
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching messages: ${messagesResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetCalendarEvents(args: any): Promise<ToolResponse> {
    const {
      limit = 10,
      start_time,
      end_time,
    } = args as {
      limit?: number;
      start_time?: string;
      end_time?: string;
    };

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
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching calendar events: ${eventsResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Helper method to format CSV content (used by both profile and message handlers)
  private formatCSVField(value: string): string {
    return `"${value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  }
}
