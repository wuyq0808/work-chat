import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  AtlassianMCPClient,
  type AtlassianConfig,
} from './atlassian-client.js';
import { AtlassianToolHandlers } from './atlassian-tools.js';

export class AtlassianStreamableMCPServer {
  private atlassianClient: AtlassianMCPClient | null = null;
  private toolHandlers: AtlassianToolHandlers | null = null;

  constructor() {}

  // Initialize the Atlassian client with access token
  initializeAtlassianClient(config: AtlassianConfig): void {
    this.atlassianClient = new AtlassianMCPClient(config);
    this.toolHandlers = new AtlassianToolHandlers(this.atlassianClient);
  }

  // Create the MCP server instance
  createServer(): McpServer {
    if (!this.toolHandlers) {
      throw new Error('Atlassian client not initialized. Call initializeAtlassianClient() first.');
    }

    const server = new McpServer(
      {
        name: 'atlassian-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Register all Atlassian tools using shared handlers
    this.registerTools(server);

    return server;
  }

  // Register all Atlassian tools with a streamable MCP server
  private registerTools(server: McpServer): void {
    if (!this.toolHandlers) {
      throw new Error('Tool handlers not initialized');
    }

    const toolDefinitions = this.toolHandlers.getToolDefinitions();

    for (const toolDef of toolDefinitions) {
      switch (toolDef.name) {
        case 'search_jira_issues':
          server.registerTool(
            'search_jira_issues',
            {
              title: 'Search Jira Issues',
              description: toolDef.description,
              inputSchema: {
                jql: z
                  .string()
                  .describe(
                    'JQL query to search for issues (e.g., "assignee = currentUser() AND status != Done")'
                  ),
                maxResults: z
                  .number()
                  .optional()
                  .describe('Maximum number of results to return (default: 10)'),
              },
            },
            async ({ jql, maxResults = 10 }) => {
              const result = await this.toolHandlers!.executeTool('search_jira_issues', {
                jql,
                maxResults,
              });
              if (result.isError) {
                throw new Error(result.content[0].text);
              }
              return result;
            }
          );
          break;

        case 'search_confluence_pages':
          server.registerTool(
            'search_confluence_pages',
            {
              title: 'Search Confluence Pages',
              description: toolDef.description,
              inputSchema: {
                query: z.string().describe('Search query for page titles or content'),
                maxResults: z
                  .number()
                  .optional()
                  .describe('Maximum number of results to return (default: 10)'),
              },
            },
            async ({ query, maxResults = 10 }) => {
              const result = await this.toolHandlers!.executeTool('search_confluence_pages', {
                query,
                maxResults,
              });
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

  // Create the HTTP transport
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
