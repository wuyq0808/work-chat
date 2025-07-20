import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';
import type { AIRequest } from '../services/llmService.js';

const chatGemini = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 10240,
  apiKey: process.env.GEMINI_API_KEY,
});

function createPromptEnhancementMessage(
  input: string,
  availableTools: StructuredTool[]
): SystemMessage {
  const toolsList = availableTools
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return new SystemMessage(`You must automatically enhance vague requests and provide useful results without asking for clarification.

Available tools:
${toolsList}

When you receive a vague request like "find me something" or "show me something important":
1. Automatically interpret it as finding recent, relevant, or important information
2. Use available tools to search for useful content (recent messages, documents, updates, etc.)
3. Always return something useful rather than asking for more details
4. ALWAYS indicate the source of each result (Slack, Email, Jira, Confluence, etc.) so users know where to find the original
5. Prioritize timeliness - focus on new messages and recent content first

For Slack and Email specifically, prioritize content that needs personal attention:
- Direct messages or mentions directed at you personally
- Questions or requests specifically addressed to you
- AVOID group broadcast emails, system notifications, automated messages
- Prioritize newer messages over older ones

For each result you present, clearly mention:
- WHERE it came from (e.g., "From Slack:", "From Jira:", "From Confluence:")
- Channel/location details when available (e.g., "#general channel", "PROJECT-123", "Space Name")

ADDITIONAL INSTRUCTION - Result Quality Assessment:
After using tools to search, evaluate if your results directly answer the user's question. If the results are poor, irrelevant, or don't match what was asked:
- Try additional search strategies with different keywords or approaches
- Use multiple tools if available to get comprehensive results
- Be persistent in finding relevant results before responding

Always be persistent in finding relevant results before responding.

Never ask follow-up questions. Never suggest ways to make requests more specific. Always provide results only.`);
}

async function processResponseWithTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any, // LangChain response type is complex and varies by model
  tools: StructuredTool[],
  originalInput: string
): Promise<string> {
  // Check if the response has tool calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolMessages: ToolMessage[] = [];

    // Execute each tool call
    for (const toolCall of response.tool_calls) {
      const tool = tools.find(t => t.name === toolCall.name);

      if (tool) {
        try {
          const result = await tool.invoke(toolCall.args);

          toolMessages.push(
            new ToolMessage({
              content: result,
              tool_call_id: toolCall.id,
            })
          );
        } catch (error) {
          toolMessages.push(
            new ToolMessage({
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              tool_call_id: toolCall.id,
            })
          );
        }
      } else {
        toolMessages.push(
          new ToolMessage({
            content: `Error: Tool ${toolCall.name} not found`,
            tool_call_id: toolCall.id,
          })
        );
      }
    }

    // Create a summary of tool results for the final response
    const toolResultsSummary = toolMessages
      .map(msg => `Tool result: ${msg.content}`)
      .join('\n\n');

    const finalPrompt = `${originalInput}\n\nI've executed the following tools for you:\n${toolResultsSummary}\n\nPlease provide a comprehensive response based on the tool results.`;
    const finalResponse = await chatGemini.invoke([
      new HumanMessage(finalPrompt),
    ]);

    return typeof finalResponse.content === 'string'
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);
  }

  // No tool calls, return regular response
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

export async function callGemini(request: AIRequest): Promise<string> {
  try {
    const allTools = [];

    // Try Slack
    if (request.slackToken) {
      try {
        const slackClient = new SlackAPIClient({
          userToken: request.slackToken,
        });
        const slackToolsInstance = new SlackTools(slackClient);
        const slackTools = slackToolsInstance.getTools();

        allTools.push(...slackTools);
      } catch (error) {
        console.error('Failed to create Slack tools:', error);
      }
    }

    // Try Azure
    if (request.azureToken) {
      try {
        const azureClient = new AzureAPIClient({
          accessToken: request.azureToken,
        });
        const azureToolsInstance = new AzureTools(azureClient);
        const azureTools = azureToolsInstance.getTools();

        allTools.push(...azureTools);
      } catch (error) {
        console.error('Failed to create Azure tools:', error);
      }
    }

    // Try Atlassian
    if (request.atlassianToken) {
      try {
        const atlassianClient = new AtlassianAPIClient({
          accessToken: request.atlassianToken,
        });
        const atlassianToolsInstance = new AtlassianTools(atlassianClient);
        const atlassianTools = atlassianToolsInstance.getTools();

        allTools.push(...atlassianTools);
      } catch (error) {
        console.error('Failed to create Atlassian tools:', error);
      }
    }

    // If no tools loaded, use without tools
    if (allTools.length === 0) {
      const response = await chatGemini.invoke([
        new HumanMessage(request.input),
      ]);
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    // Create message chain: enhancement system message + user input
    const messages = [
      createPromptEnhancementMessage(request.input, allTools),
      new HumanMessage(request.input),
    ];

    // Use LangChain ChatGoogleGenerativeAI with tools and message chain
    const response = await chatGemini.invoke(messages, {
      tools: allTools,
    });

    // Handle the response which may contain tool calls
    return await processResponseWithTools(response, allTools, request.input);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}
