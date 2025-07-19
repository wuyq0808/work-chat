export interface AtlassianConfig {
  accessToken: string;
  cloudId?: string;
}

export interface AtlassianApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
    reporter?: {
      displayName: string;
    };
    priority?: {
      name: string;
    };
    created: string;
    updated: string;
  };
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  space?: {
    key: string;
    name: string;
  };
  version?: {
    when: string;
  };
  _links?: {
    webui: string;
  };
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  size: number;
}

export interface AtlassianResource {
  id: string;
  name: string;
  scopes: string[];
}

export class AtlassianMCPClient {
  private accessToken: string;
  private cloudId: string | null = null;

  constructor(config: AtlassianConfig) {
    this.accessToken = config.accessToken;
    this.cloudId = config.cloudId || null;
  }

  // Get accessible resources to find cloud ID
  async getAccessibleResources(): Promise<
    AtlassianApiResponse<AtlassianResource[]>
  > {
    try {
      const response = await globalThis.fetch(
        'https://api.atlassian.com/oauth/token/accessible-resources',
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to get accessible resources: ${response.status} ${errorText}`,
        };
      }

      const resources = await response.json();

      // Set the first cloud ID if not already set
      if (!this.cloudId && resources.length > 0) {
        this.cloudId = resources[0].id;
      }

      return {
        success: true,
        data: resources,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error getting accessible resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Search Jira issues using JQL
  async searchJiraIssues(
    jql: string,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<JiraSearchResult>> {
    try {
      // Ensure we have a cloud ID
      if (!this.cloudId) {
        const resourcesResult = await this.getAccessibleResources();
        if (
          !resourcesResult.success ||
          !resourcesResult.data ||
          resourcesResult.data.length === 0
        ) {
          return {
            success: false,
            error: 'No accessible Atlassian resources found',
          };
        }
      }

      const response = await globalThis.fetch(
        `https://api.atlassian.com/ex/jira/${this.cloudId}/rest/api/3/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jql,
            maxResults,
            fields: [
              'summary',
              'status',
              'assignee',
              'reporter',
              'priority',
              'created',
              'updated',
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to search Jira issues: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error searching Jira issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Search Confluence pages
  async searchConfluencePages(
    query: string,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<ConfluenceSearchResult>> {
    try {
      // Ensure we have a cloud ID
      if (!this.cloudId) {
        const resourcesResult = await this.getAccessibleResources();
        if (
          !resourcesResult.success ||
          !resourcesResult.data ||
          resourcesResult.data.length === 0
        ) {
          return {
            success: false,
            error: 'No accessible Atlassian resources found',
          };
        }
      }

      const response = await globalThis.fetch(
        `https://api.atlassian.com/ex/confluence/${this.cloudId}/rest/api/search?cql=${encodeURIComponent(`title ~ "${query}" OR text ~ "${query}"`)}&limit=${maxResults}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to search Confluence pages: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error searching Confluence pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
