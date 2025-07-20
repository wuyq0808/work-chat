import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AzureMCPStdioServer } from '../mcp-servers/azure/azure-mcp-server-stdio.js';
import { SlackMCPStdioServer } from '../mcp-servers/slack/slack-mcp-server-stdio.js';
import { AtlassianMCPStdioServer } from '../mcp-servers/atlassian/atlassian-mcp-server-stdio.js';
import type { AIRequest } from '../services/llmService.js';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function callGemini(request: AIRequest): Promise<string> {
  try {
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

            for (const { client, service } of connectedClients) {
              try {
                const mcpTools = await client.listTools();
                if (
                  mcpTools.tools?.some(
                    (tool: any) => tool.name === part.functionCall?.name
                  )
                ) {
                  toolClient = client;
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
