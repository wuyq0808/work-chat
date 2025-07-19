import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  AtlassianMCPClient,
  type AtlassianConfig,
} from './lib/atlassian-client.js';

export class AtlassianStreamableMCPServer {
  private atlassianClient: AtlassianMCPClient | null = null;

  constructor() {}

  // Initialize the Atlassian client with access token
  initializeAtlassianClient(config: AtlassianConfig): void {
    this.atlassianClient = new AtlassianMCPClient(config);
  }

  // Create the MCP server instance
  createServer(): McpServer {
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

    // Register search_jira_issues tool
    server.registerTool(
      'search_jira_issues',
      {
        title: 'Search Jira Issues',
        description: 'Search for Jira issues using JQL (Jira Query Language)',
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
        if (!this.atlassianClient) {
          throw new Error('Atlassian client not initialized');
        }

        const searchResult = await this.atlassianClient.searchJiraIssues(
          jql,
          maxResults
        );

        if (searchResult.success && searchResult.data) {
          const issues = searchResult.data.issues;
          let content =
            'key,summary,status,assignee,reporter,priority,created,updated\n';

          for (const issue of issues) {
            const assignee = issue.fields.assignee?.displayName || 'Unassigned';
            const reporter = issue.fields.reporter?.displayName || 'Unknown';
            const priority = issue.fields.priority?.name || 'Unknown';
            const created = new Date(issue.fields.created)
              .toISOString()
              .split('T')[0];
            const updated = new Date(issue.fields.updated)
              .toISOString()
              .split('T')[0];

            content += `${issue.key},"${issue.fields.summary}","${issue.fields.status.name}","${assignee}","${reporter}","${priority}",${created},${updated}\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error searching Jira issues: ${searchResult.error}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Register search_confluence_pages tool
    server.registerTool(
      'search_confluence_pages',
      {
        title: 'Search Confluence Pages',
        description: 'Search for Confluence pages by title or content',
        inputSchema: {
          query: z.string().describe('Search query for page titles or content'),
          maxResults: z
            .number()
            .optional()
            .describe('Maximum number of results to return (default: 10)'),
        },
      },
      async ({ query, maxResults = 10 }) => {
        if (!this.atlassianClient) {
          throw new Error('Atlassian client not initialized');
        }

        const searchResult = await this.atlassianClient.searchConfluencePages(
          query,
          maxResults
        );

        if (searchResult.success && searchResult.data) {
          const pages = searchResult.data.results;
          let content = 'id,title,type,space,url,lastModified\n';

          for (const page of pages) {
            const spaceKey = page.space?.key || 'Unknown';
            const url = page._links?.webui
              ? `https://your-domain.atlassian.net${page._links.webui}`
              : 'No URL';
            const lastModified = page.version?.when
              ? new Date(page.version.when).toISOString().split('T')[0]
              : 'Unknown';

            content += `${page.id},"${page.title}","${page.type}","${spaceKey}","${url}",${lastModified}\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
            isError: false,
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error searching Confluence pages: ${searchResult.error}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    return server;
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
