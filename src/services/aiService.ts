import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, mcpToTool } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AzureMCPStdioServer } from '../mcp-servers/azure/azure-mcp-server-stdio.js';

export type AIProvider = 'openai' | 'claude' | 'gemini';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  provider?: AIProvider;
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

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function callOpenAI(request: AIRequest): Promise<string> {
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

    return response.output_text || 'No response generated';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}

export async function callClaude(request: AIRequest): Promise<string> {
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

    return output || 'No response generated';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}

export async function callGemini(request: AIRequest): Promise<string> {
  try {
    const tools = [];

    // Set up Azure MCP client if token provided
    if (request.azureToken) {
      try {
        // Create Azure MCP server instance in-memory
        const azureServer = new AzureMCPStdioServer(request.azureToken);

        // Create linked in-memory transports
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();

        // Connect server to its transport
        await azureServer.getServer().connect(serverTransport);

        // Create and connect client
        const azureClient = new Client(
          {
            name: 'gemini-azure-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await azureClient.connect(clientTransport);
        tools.push(mcpToTool(azureClient));
      } catch (error) {
        console.error('Failed to connect to Azure MCP server:', error);
        // Continue without Azure tools
      }
    }

    // TODO: Add Slack and Atlassian MCP clients when implemented
    if (request.slackToken) {
      // Slack stdio MCP server not yet implemented
      console.warn('Slack stdio MCP server not yet implemented');
    }

    if (request.atlassianToken) {
      // Atlassian stdio MCP server not yet implemented
      console.warn('Atlassian stdio MCP server not yet implemented');
    }

    const config: any = {
      maxOutputTokens: 1024,
      temperature: 0.7,
    };

    // Add tools to config if available
    if (tools.length > 0) {
      config.tools = tools;
    }

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: request.input,
      config,
    });

    // Handle multipart responses from Gemini (text + tool calls)
    let output = '';
    if (
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content
    ) {
      const parts = response.candidates[0].content.parts || [];
      for (const part of parts) {
        if (part.text) {
          output += part.text;
        } else if (part.functionCall) {
          // Tool calls are handled automatically by the MCP integration
          // Just acknowledge that tools were used
          output += `[Used tool: ${part.functionCall.name}] `;
        }
      }
    }

    // Fallback to response.text if candidates structure is not available
    if (!output) {
      output = response.text || '';
    }

    return output || 'No response generated';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}

export async function callAI(request: AIRequest): Promise<string> {
  const provider = request.provider || 'openai';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    return 'Error: At least one token (Slack, Azure, or Atlassian) must be provided';
  }

  switch (provider) {
    case 'openai':
      return callOpenAI(request);
    case 'claude':
      return callClaude(request);
    case 'gemini':
      return callGemini(request);
    default:
      return `Error: Unsupported AI provider: ${provider}`;
  }
}
