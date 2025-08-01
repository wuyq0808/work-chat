export interface GitHubConfig {
  accessToken: string;
}

export interface GitHubApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GitHubCodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubCodeItem[];
}

export interface GitHubCodeItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: GitHubRepository;
  score: number;
  text_matches?: GitHubTextMatch[];
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
}

export interface GitHubTextMatch {
  object_url: string;
  object_type: string;
  property: string;
  fragment: string;
  matches: Array<{
    text: string;
    indices: number[];
  }>;
}

export interface GitHubCodeSearchOptions {
  query: string;
  sort?: 'indexed' | 'best-match';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface GitHubIssueSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssueItem[];
}

export interface GitHubIssueItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: {
    login: string;
    avatar_url: string;
  };
  assignee?: {
    login: string;
    avatar_url: string;
  } | null;
  assignees: Array<{
    login: string;
    avatar_url: string;
  }>;
  labels: Array<{
    name: string;
    color: string;
    description: string | null;
  }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  repository_url: string;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    merged_at: string | null;
  };
  score: number;
}

export interface GitHubIssueSearchOptions {
  query: string;
  sort?: 'created' | 'updated' | 'comments' | 'best-match';
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file';
  content: string;
  encoding: string;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export class GitHubAPIClient {
  private accessToken: string;

  constructor(config: GitHubConfig) {
    this.accessToken = config.accessToken;
  }

  // Search issues and pull requests across repositories
  async searchIssues(
    options: GitHubIssueSearchOptions
  ): Promise<GitHubApiResponse<GitHubIssueSearchResult>> {
    const params = new URLSearchParams();
    params.append('q', options.query);

    if (options.sort) {
      params.append('sort', options.sort);
    }

    if (options.order) {
      params.append('order', options.order);
    }

    if (options.per_page) {
      params.append('per_page', options.per_page.toString());
    }

    if (options.page) {
      params.append('page', options.page.toString());
    }

    const response = await globalThis.fetch(
      `https://api.github.com/search/issues?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to search issues: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      data: result,
    };
  }

  // Search code across repositories
  async searchCode(
    options: GitHubCodeSearchOptions
  ): Promise<GitHubApiResponse<GitHubCodeSearchResult>> {
    const params = new URLSearchParams();
    params.append('q', options.query);

    if (options.sort) {
      params.append('sort', options.sort);
    }

    if (options.order) {
      params.append('order', options.order);
    }

    if (options.per_page) {
      params.append('per_page', options.per_page.toString());
    }

    if (options.page) {
      params.append('page', options.page.toString());
    }

    const response = await globalThis.fetch(
      `https://api.github.com/search/code?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to search code: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      data: result,
    };
  }

  // Get file content from a repository
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<GitHubApiResponse<GitHubFileContent>> {
    let url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    if (ref) {
      url += `?ref=${encodeURIComponent(ref)}`;
    }

    const response = await globalThis.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to get file content: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();

    // Decode base64 content if it's a file
    if (result.type === 'file' && result.content) {
      const decodedContent = Buffer.from(
        result.content.replace(/\n/g, ''),
        'base64'
      ).toString('utf-8');
      return {
        success: true,
        data: {
          ...result,
          content: decodedContent,
        },
      };
    }

    return {
      success: false,
      error: 'Path does not point to a file or content is not available',
    };
  }

  // Get repository tree structure
  async getRepositoryTree(
    owner: string,
    repo: string,
    treeSha?: string,
    recursive: boolean = false
  ): Promise<GitHubApiResponse<GitHubTree>> {
    const sha = treeSha || 'HEAD';
    let url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}`;

    if (recursive) {
      url += '?recursive=1';
    }

    const response = await globalThis.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Failed to get repository tree: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      data: result,
    };
  }
}
