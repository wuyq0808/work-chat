import { DynamicStructuredTool } from '@langchain/core/tools';
import { AzureMCPClient } from './azure-client.js';

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
  private tools: DynamicStructuredTool[];

  constructor(azureClient: AzureMCPClient) {
    this.azureClient = azureClient;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'azure__get_profile',
        description:
          'Get the current user profile information from Microsoft Graph',
        schema: {
          type: 'object',
          properties: {},
          required: [],
        },
        func: async input =>
          this.formatToolResponse(await this.handleGetProfile()),
      }) as DynamicStructuredTool,

      new DynamicStructuredTool({
        name: 'azure__get_messages',
        description: 'Get messages from Outlook/Exchange',
        schema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of messages to retrieve (default: 10)',
              optional: true,
            },
            filter: {
              type: 'string',
              description: 'OData filter expression (e.g., "isRead eq false")',
              optional: true,
            },
            search: {
              type: 'string',
              description: 'Search query for messages',
              optional: true,
            },
          },
          required: [],
        },
        func: async input =>
          this.formatToolResponse(await this.handleGetMessages(input)),
      }) as DynamicStructuredTool,

      new DynamicStructuredTool({
        name: 'azure__get_calendar_events',
        description: 'Get calendar events from Outlook/Exchange',
        schema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of events to retrieve (default: 10)',
              optional: true,
            },
            start_time: {
              type: 'string',
              description: 'Start time filter (ISO 8601 format)',
              optional: true,
            },
            end_time: {
              type: 'string',
              description: 'End time filter (ISO 8601 format)',
              optional: true,
            },
          },
          required: [],
        },
        func: async input =>
          this.formatToolResponse(await this.handleGetCalendarEvents(input)),
      }) as DynamicStructuredTool,
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
  getTools(): DynamicStructuredTool[] {
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
      const result = await tool.func(args);

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
