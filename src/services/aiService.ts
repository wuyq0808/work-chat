import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'openai' | 'claude';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  provider?: AIProvider;
}

export interface AIResponse {
  success: boolean;
  output: string;
  model: string;
  usage?: any;
  error?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'mcp-client-2025-04-04',
  },
});

export async function callOpenAI(request: AIRequest): Promise<AIResponse> {
  try {
    const tools = [];

    // Add Slack MCP if token provided
    if (request.slackToken) {
      if (!process.env.SLACK_MCP_SERVER_URL) {
        throw new Error(
          'SLACK_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'slack-mcp',
        server_url: process.env.SLACK_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.slackToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    // Add Azure MCP if token provided
    if (request.azureToken) {
      if (!process.env.AZURE_MCP_SERVER_URL) {
        throw new Error(
          'AZURE_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'azure-mcp',
        server_url: process.env.AZURE_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.azureToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    // Add Atlassian MCP if token provided
    if (request.atlassianToken) {
      if (!process.env.ATLASSIAN_MCP_SERVER_URL) {
        throw new Error(
          'ATLASSIAN_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'atlassian-mcp',
        server_url: process.env.ATLASSIAN_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.atlassianToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: request.input,
      tools,
    });

    return {
      success: true,
      output: response.output_text || 'No response generated',
      model: 'gpt-4o-mini',
      usage: response.usage,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      model: 'gpt-4o-mini',
      error:
        error instanceof Error ? error.message : 'Failed to generate response',
    };
  }
}

export async function callClaude(request: AIRequest): Promise<AIResponse> {
  try {
    const mcpServers = [];

    // Add Slack MCP if token provided
    if (request.slackToken) {
      if (!process.env.SLACK_MCP_SERVER_URL) {
        throw new Error(
          'SLACK_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.SLACK_MCP_SERVER_URL,
        name: 'slack-mcp',
        authorization_token: `${process.env.API_KEY} ${request.slackToken}`,
      });
    }

    // Add Azure MCP if token provided
    if (request.azureToken) {
      if (!process.env.AZURE_MCP_SERVER_URL) {
        throw new Error(
          'AZURE_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.AZURE_MCP_SERVER_URL,
        name: 'azure-mcp',
        authorization_token: `${process.env.API_KEY} ${request.azureToken}`,
      });
    }

    // Add Atlassian MCP if token provided
    if (request.atlassianToken) {
      if (!process.env.ATLASSIAN_MCP_SERVER_URL) {
        throw new Error(
          'ATLASSIAN_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.ATLASSIAN_MCP_SERVER_URL,
        name: 'atlassian-mcp',
        authorization_token: `${process.env.API_KEY} ${request.atlassianToken}`,
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: request.input }],
      mcp_servers: mcpServers,
    } as any);

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      success: true,
      output: output || 'No response generated',
      model: 'claude-3-5-sonnet-20241022',
      usage: response.usage,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      model: 'claude-3-5-sonnet-20241022',
      error:
        error instanceof Error ? error.message : 'Failed to generate response',
    };
  }
}

export async function callAI(request: AIRequest): Promise<AIResponse> {
  const provider = request.provider || 'openai';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    return {
      success: false,
      output: '',
      model: 'unknown',
      error: 'At least one token (Slack, Azure, or Atlassian) must be provided',
    };
  }

  switch (provider) {
    case 'openai':
      return callOpenAI(request);
    case 'claude':
      return callClaude(request);
    default:
      return {
        success: false,
        output: '',
        model: 'unknown',
        error: `Unsupported AI provider: ${provider}`,
      };
  }
}
