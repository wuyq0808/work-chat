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
- Find out who I am
- First Use the Search tools to find 100 messages from Slack To/From me, and 100 Email for me, then use other tools to find details
- Do not use keyword search, just search with time, focus on recent content from the last 2 weeks

## CONTENT PRIORITIZATION
For Slack and Email specifically:
- Questions or requests specifically addressed to you
- Prioritize newer messages over older ones

## RESPONSE GUIDE
- Provide summary if the found items are repetitive
- Aim for more than 100 pieces of information if request is vague
- Keep responses concise
- Do not list messages that I sent

## QUALITY ASSURANCE
- Be persistent in finding relevant results before responding
- If initial results are poor, try additional search strategies with different approaches
- Use multiple tools if available to get comprehensive results
- Never ask follow-up questions or suggest ways to make requests more specific`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
  private extractContentAsString(message: any): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    // Handle ChatBedrockConverse content format: array of content objects
    if (Array.isArray(message.content)) {
      return message.content
        .map((item: any) => {
          if (item.type === 'text' && item.text) {
            return item.text;
          }
          return '';
        })
        .join('');
    }

    return JSON.stringify(message.content);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
  private hasContentText(message: any): boolean {
    const contentText = this.extractContentAsString(message);
    return contentText.trim() !== '';
  }

  private async setupTools(request: ChatRequest): Promise<StructuredTool[]> {
    const allTools: StructuredTool[] = [];

    // Setup Slack tools
    if (request.slackToken) {
      const slackClient = new SlackAPIClient({
        userToken: request.slackToken,
      });
      const slackTools = new SlackTools(slackClient);
      allTools.push(...slackTools.getTools());
    }

    // Setup Azure tools
    if (request.azureToken) {
      const azureClient = new AzureAPIClient({
        accessToken: request.azureToken,
      });
      const azureTools = new AzureTools(azureClient);
      allTools.push(...azureTools.getTools());
    }

    // Setup Atlassian tools
    if (request.atlassianToken) {
      const atlassianClient = new AtlassianAPIClient({
        accessToken: request.atlassianToken,
      });
      const atlassianTools = new AtlassianTools(atlassianClient);
      allTools.push(...atlassianTools.getTools());
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
    const hasToolCalls = response.tool_calls && response.tool_calls.length > 0;

    if (!hasToolCalls) {
      // No tool calls, return the original response immediately
      return response;
    }

    response.tool_calls.forEach((_call: any, _index: number) => {});

    const toolMessages: ToolMessage[] = [];

    // Execute each tool call
    for (const toolCall of response.tool_calls) {
      const tool = tools.find(t => t.name === toolCall.name);

      if (!tool) {
        throw new Error(`Tool ${toolCall.name} not found`);
      }

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
        },
      });

      // Truncate large tool results to prevent context length errors
      const resultString = String(result);
      const truncatedResult =
        resultString.length > 50000
          ? resultString.substring(0, 50000) +
            '\n\n[Content truncated due to length...]'
          : resultString;

      toolMessages.push(
        new ToolMessage({
          content: truncatedResult,
          tool_call_id: toolCall.id,
        })
      );
    }

    // Add tool messages to conversation history
    toolMessages.forEach((toolMessage, _index) => {
      this.addToConversationHistory(conversationId, toolMessage);
    });

    // Get current conversation history for the final response
    const currentHistory = this.getConversationHistory(conversationId);

    // Must bind tools when processing tool results
    const modelWithTools = this.chatModel.bindTools(tools);

    onProgress?.({
      type: 'ai_processing',
      data: 'Processing with AI...',
    });
    const finalResponse = await modelWithTools.invoke(currentHistory);

    this.addToConversationHistory(conversationId, finalResponse);

    // Process the final response recursively to handle potential additional tool calls
    return this.processResponseWithTools(
      finalResponse,
      tools,
      conversationId,
      onProgress
    );
  }

  async handleChat(request: ChatRequest): Promise<string> {
    const { conversationId } = request;

    // Setup tools
    const allTools = await this.setupTools(request);

    // Get conversation history
    const history = this.getConversationHistory(conversationId);

    // Add system message at the beginning if this is a new conversation
    if (history.length === 0) {
      this.addToConversationHistory(
        conversationId,
        this.createPromptEnhancementMessage(allTools)
      );
    }

    // Add user message to history
    const userMessage = new HumanMessage(request.input);
    this.addToConversationHistory(conversationId, userMessage);

    request.onProgress?.({ type: 'status', data: 'Starting new query...' });

    // Bind tools to the model
    const modelWithTools = this.chatModel.bindTools(allTools);

    // Get the response (which might include tool calls)
    const currentHistory = this.getConversationHistory(conversationId);

    request.onProgress?.({
      type: 'ai_processing',
      data: 'Processing with AI...',
    });
    const response = await modelWithTools.invoke(currentHistory);

    this.addToConversationHistory(conversationId, response);

    // Skip responses with no content and no tool calls

    // Handle the response which may contain tool calls
    const finalAIMessage = await this.processResponseWithTools(
      response,
      allTools,
      conversationId,
      request.onProgress
    );

    // Add final AI response to history only if it has meaningful content
    if (this.hasContentText(finalAIMessage)) {
      this.addToConversationHistory(conversationId, finalAIMessage);
    }

    return this.extractContentAsString(finalAIMessage);
  }
}
