import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';

export interface ChatModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain response types vary by model
  invoke(messages: BaseMessage[]): Promise<any>;
  bindTools(tools: StructuredTool[]): ChatModel;
}

export interface ChatRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  conversationId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
  onProgress?: (event: { type: string; data: any }) => void;
}

export interface ToolExecutionResult {
  tool: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool arguments can be any shape
  args?: any;
  result?: string;
  error?: string;
}

export class LangChainChatHandler {
  private conversationHistories = new Map<string, BaseMessage[]>();
  private chatModel: ChatModel;

  constructor(chatModel: ChatModel) {
    this.chatModel = chatModel;
  }

  private getConversationHistory(conversationId: string): BaseMessage[] {
    if (!this.conversationHistories.has(conversationId)) {
      this.conversationHistories.set(conversationId, []);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- We just set it above if not exists
    return this.conversationHistories.get(conversationId)!;
  }

  private addToConversationHistory(
    conversationId: string,
    message: BaseMessage
  ): void {
    const history = this.getConversationHistory(conversationId);
    history.push(message);
  }

  private createPromptEnhancementMessage(
    availableTools: StructuredTool[]
  ): SystemMessage {
    const toolsList = availableTools
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    return new SystemMessage(`You must automatically enhance vague requests and provide useful results without asking for clarification.

Available tools:
${toolsList}

## SEARCH STRATEGY
For vague requests like "find me something" or "show me something important":
- Use time-based searches WITHOUT specific keywords - focus on recent content from the last 2 weeks
- Retrieve at least 10 messages/items from each available tool to find truly important content
- Prioritize recency over keyword matching when requests are general or vague
- Cast a wide net first, then filter for the most important and relevant information

## CONTENT PRIORITIZATION
For Slack and Email specifically:
- Direct messages or mentions directed at you personally
- Questions or requests specifically addressed to you
- AVOID group broadcast emails, system notifications, automated messages
- Prioritize newer messages over older ones

## RESPONSE FORMAT
- Provide summary if the found items are repetitive, otherwise it's ok to display individual items
- Aim for more than 10 pieces of information
- Keep responses concise and focused on the most important information

## QUALITY ASSURANCE
- Be persistent in finding relevant results before responding
- If initial results are poor, try additional search strategies with different approaches
- Use multiple tools if available to get comprehensive results
- Never ask follow-up questions or suggest ways to make requests more specific
- Always provide results only`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
  private extractContentAsString(message: any): string {
    return typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);
  }

  private async setupTools(request: ChatRequest): Promise<StructuredTool[]> {
    const allTools: StructuredTool[] = [];

    // Setup Slack tools
    if (request.slackToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Slack tools...',
        });
        const slackClient = new SlackAPIClient({
          userToken: request.slackToken,
        });
        const slackTools = new SlackTools(slackClient);
        allTools.push(...slackTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Slack tools:', error);
      }
    }

    // Setup Azure tools
    if (request.azureToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Azure tools...',
        });
        const azureClient = new AzureAPIClient({
          accessToken: request.azureToken,
        });
        const azureTools = new AzureTools(azureClient);
        allTools.push(...azureTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Azure tools:', error);
      }
    }

    // Setup Atlassian tools
    if (request.atlassianToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Atlassian tools...',
        });
        const atlassianClient = new AtlassianAPIClient({
          accessToken: request.atlassianToken,
        });
        const atlassianTools = new AtlassianTools(atlassianClient);
        allTools.push(...atlassianTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Atlassian tools:', error);
      }
    }

    if (allTools.length === 0) {
      throw new Error(
        'No tools were successfully initialized. Please check your tokens.'
      );
    }

    return allTools;
  }

  private async processResponseWithTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain response type varies by model
    response: any,
    tools: StructuredTool[],
    conversationId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
    onProgress?: (event: { type: string; data: any }) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Returns LangChain message which varies by model
  ): Promise<any> {
    // Check if the response has tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolMessages: ToolMessage[] = [];

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        const tool = tools.find(t => t.name === toolCall.name);

        if (tool) {
          try {
            // Send progress update for tool execution
            onProgress?.({
              type: 'tool_start',
              data: {
                tool: toolCall.name,

                args: toolCall.args,
              },
            });

            const result = await tool.invoke(toolCall.args);

            // Send progress update for tool completion
            onProgress?.({
              type: 'tool_complete',
              data: {
                tool: toolCall.name,
                result:
                  typeof result === 'string'
                    ? result.substring(0, 200) +
                      (result.length > 200 ? '...' : '')
                    : 'Done',
              },
            });

            toolMessages.push(
              new ToolMessage({
                content: result,
                tool_call_id: toolCall.id,
              })
            );
          } catch (error) {
            // Send progress update for tool error
            onProgress?.({
              type: 'tool_error',
              data: {
                tool: toolCall.name,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
            });

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

      // Add tool messages to conversation history
      toolMessages.forEach(toolMessage => {
        this.addToConversationHistory(conversationId, toolMessage);
      });

      // Get updated conversation history and let the model process the tool results
      const updatedHistory = this.getConversationHistory(conversationId);

      onProgress?.({ type: 'status', data: 'Processing results...' });
      const finalResponse = await this.chatModel.invoke(updatedHistory);

      return finalResponse;
    }

    // No tool calls, return the original response
    return response;
  }

  async handleChat(request: ChatRequest): Promise<string> {
    try {
      const { conversationId } = request;

      // Send initial status
      request.onProgress?.({ type: 'status', data: 'Initializing chat...' });

      // Setup tools
      const allTools = await this.setupTools(request);

      // Get conversation history
      const history = this.getConversationHistory(conversationId);

      // Add user message to history
      const userMessage = new HumanMessage(request.input);
      this.addToConversationHistory(conversationId, userMessage);

      // Create the conversation context
      const conversationContext = [
        this.createPromptEnhancementMessage(allTools),
        ...history.slice(-10), // Keep last 10 messages for context
      ];

      request.onProgress?.({ type: 'status', data: 'Starting new query...' });

      // Bind tools to the model
      const modelWithTools = this.chatModel.bindTools(allTools);

      // Get the response (which might include tool calls)
      const response = await modelWithTools.invoke(conversationContext);

      // Add the AI response with tool_calls to conversation history
      this.addToConversationHistory(conversationId, response);

      // Handle the response which may contain tool calls
      const finalAIMessage = await this.processResponseWithTools(
        response,
        allTools,
        conversationId,
        request.onProgress
      );

      // Add final AI response to history
      this.addToConversationHistory(conversationId, finalAIMessage);

      return this.extractContentAsString(finalAIMessage);
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }
}
