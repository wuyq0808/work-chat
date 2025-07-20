import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AzureMCPClient, type AzureConfig } from './azure-client.js';
import { AzureToolHandlers } from './azure-tools.js';

export class AzureStreamableMCPServer {
  private azureClient: AzureMCPClient | null = null;
  private toolHandlers: AzureToolHandlers | null = null;

  constructor() {}

  // Initialize the Azure client with access token
  initializeAzureClient(config: AzureConfig): void {
    this.azureClient = new AzureMCPClient(config);
    this.toolHandlers = new AzureToolHandlers(this.azureClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.toolHandlers) {
      throw new Error(
        'Azure client not initialized. Call initializeAzureClient() first.'
      );
    }

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

    // Register all Azure tools inline
    this.registerTools(server);

    return server;
  }

  // Register all Azure tools with a streamable MCP server (inlined from adapter)
  private registerTools(server: McpServer): void {
    if (!this.toolHandlers) {
      throw new Error('Tool handlers not initialized');
    }

    const toolDefinitions = this.toolHandlers.getToolDefinitions();

    for (const toolDef of toolDefinitions) {
      switch (toolDef.name) {
        case 'get_profile':
          server.registerTool(
            'get_profile',
            {
              title: 'Get Azure User Profile',
              description: toolDef.description,
              inputSchema: {},
            },
            async () => {
              const result = await this.toolHandlers!.executeTool(
                'get_profile',
                {}
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'get_messages':
          server.registerTool(
            'get_messages',
            {
              title: 'Get Outlook Messages',
              description: toolDef.description,
              inputSchema: {
                limit: z
                  .number()
                  .optional()
                  .describe('Number of messages to retrieve (default: 10)'),
                filter: z
                  .string()
                  .optional()
                  .describe(
                    'OData filter expression (e.g., "isRead eq false")'
                  ),
                search: z
                  .string()
                  .optional()
                  .describe('Search query for messages'),
              },
            },
            async ({ limit = 10, filter, search }) => {
              const result = await this.toolHandlers!.executeTool(
                'get_messages',
                {
                  limit,
                  filter,
                  search,
                }
              );
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'get_calendar_events':
          server.registerTool(
            'get_calendar_events',
            {
              title: 'Get Calendar Events',
              description: toolDef.description,
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
              const result = await this.toolHandlers!.executeTool(
                'get_calendar_events',
                {
                  limit,
                  start_time,
                  end_time,
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
