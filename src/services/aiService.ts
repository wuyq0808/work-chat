import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AzureMCPStdioServer } from '../mcp-servers/azure/azure-mcp-server-stdio.js';
import { SlackMCPStdioServer } from '../mcp-servers/slack/slack-mcp-server-stdio.js';
import { AtlassianMCPStdioServer } from '../mcp-servers/atlassian/atlassian-mcp-server-stdio.js';

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
    // Create a single combined MCP client that will aggregate all tools
    const combinedClient = new Client(
      {
        name: 'gemini-combined-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect to all available services and collect their tools
    const connectedClients: { client: any; service: string }[] = [];

    // Try Slack
    if (request.slackToken) {
      try {
        const slackServer = new SlackMCPStdioServer({
          userToken: request.slackToken,
        });
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await slackServer.getServer().connect(serverTransport);

        const slackClient = new Client(
          { name: 'gemini-slack-client', version: '1.0.0' },
          { capabilities: {} }
        );

        await slackClient.connect(clientTransport);

        const tools = await slackClient.listTools();

        if (tools.tools && tools.tools.length > 0) {
          connectedClients.push({ client: slackClient, service: 'Slack' });
        }
      } catch (error) {
        console.error('Failed to connect to Slack MCP server:', error);
      }
    }

    // Try Azure
    if (request.azureToken) {
      try {
        const azureServer = new AzureMCPStdioServer(request.azureToken);
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await azureServer.getServer().connect(serverTransport);

        const azureClient = new Client(
          { name: 'gemini-azure-client', version: '1.0.0' },
          { capabilities: {} }
        );

        await azureClient.connect(clientTransport);

        const tools = await azureClient.listTools();

        if (tools.tools && tools.tools.length > 0) {
          connectedClients.push({ client: azureClient, service: 'Azure' });
        }
      } catch (error) {
        console.error('Failed to connect to Azure MCP server:', error);
      }
    }

    // Try Atlassian
    if (request.atlassianToken) {
      try {
        const atlassianServer = new AtlassianMCPStdioServer({
          accessToken: request.atlassianToken,
        });
        const [clientTransport, serverTransport] =
          InMemoryTransport.createLinkedPair();
        await atlassianServer.getServer().connect(serverTransport);

        const atlassianClient = new Client(
          { name: 'gemini-atlassian-client', version: '1.0.0' },
          { capabilities: {} }
        );

        await atlassianClient.connect(clientTransport);

        const tools = await atlassianClient.listTools();

        if (tools.tools && tools.tools.length > 0) {
          connectedClients.push({
            client: atlassianClient,
            service: 'Atlassian',
          });
        }
      } catch (error) {
        console.error('Failed to connect to Atlassian MCP server:', error);
      }
    }

    // Create tools array by combining all connected clients
    const tools = [];
    if (connectedClients.length > 0) {
      try {
        // Collect all function declarations from all clients
        const allFunctionDeclarations = [];

        for (const { client, service } of connectedClients) {
          const mcpTools = await client.listTools();

          if (mcpTools.tools && mcpTools.tools.length > 0) {
            // Convert MCP tools to Gemini function declarations format
            const functionDeclarations = mcpTools.tools.map((tool: any) => ({
              name: tool.name,
              description: `[${service}] ${tool.description}`, // Add service prefix to description
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {},
              },
            }));

            allFunctionDeclarations.push(...functionDeclarations);
          }
        }

        if (allFunctionDeclarations.length > 0) {
          // Create a single tool object with all function declarations
          tools.push({
            functionDeclarations: allFunctionDeclarations,
          });
        }
      } catch (error) {
        console.error('Error converting MCP tools to Gemini format:', error);
      }
    }

    const config: any = {
      maxOutputTokens: 1024,
      temperature: 0.7,
    };

    // Add tools to config if available
    if (tools.length > 0) {
      config.tools = tools;
    }

    let response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: request.input,
      config,
    });

    // Handle function calls if present and execute them
    let toolResults = [];
    if (
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content
    ) {
      const parts = response.candidates[0].content.parts || [];
      const functionCalls = parts.filter(part => part.functionCall);

      if (functionCalls.length > 0) {
        for (const part of functionCalls) {
          if (part.functionCall && connectedClients.length > 0) {
            // Find which client has this tool
            let toolClient = null;
            let toolService = '';

            for (const { client, service } of connectedClients) {
              try {
                const mcpTools = await client.listTools();
                if (
                  mcpTools.tools?.some(
                    (tool: any) => tool.name === part.functionCall?.name
                  )
                ) {
                  toolClient = client;
                  toolService = service;
                  break;
                }
              } catch (error) {
                console.error(`Error checking tools for ${service}:`, error);
              }
            }

            if (toolClient) {
              try {
                // Execute the tool via the appropriate MCP client
                const result = await toolClient.callTool({
                  name: part.functionCall.name || '',
                  arguments: part.functionCall.args || {},
                });

                // Store the tool result for the follow-up request
                toolResults.push({
                  functionCall: part.functionCall,
                  functionResponse: {
                    name: part.functionCall.name,
                    response: result,
                  },
                });
              } catch (error) {
                toolResults.push({
                  functionCall: part.functionCall,
                  functionResponse: {
                    name: part.functionCall.name,
                    response: {
                      error:
                        error instanceof Error
                          ? error.message
                          : 'Unknown error',
                    },
                  },
                });
              }
            } else {
              toolResults.push({
                functionCall: part.functionCall,
                functionResponse: {
                  name: part.functionCall.name,
                  response: { error: 'No client found for this tool' },
                },
              });
            }
          }
        }

        // If we have tool results, make a follow-up request to Gemini with the results
        if (toolResults.length > 0) {
          // Create a conversation with the original message, function calls, and results
          const conversationHistory = [
            { role: 'user', parts: [{ text: request.input }] },
            {
              role: 'model',
              parts: response.candidates[0].content.parts,
            },
            {
              role: 'user',
              parts: toolResults.map(tr => ({
                functionResponse: tr.functionResponse,
              })),
            },
          ];

          response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: conversationHistory,
            config: {
              maxOutputTokens: 1024,
              temperature: 0.7,
            }, // Don't include tools in follow-up to avoid infinite loops
          });
        }
      }
    }

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
