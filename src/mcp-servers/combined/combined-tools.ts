import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SlackTools } from '../slack/slack-tools.js';
import { AzureTools } from '../azure/azure-tools.js';
import { AtlassianTools } from '../atlassian/atlassian-tools.js';

interface GetLatestActivityArgs {
  days?: number;
}

export class CombinedTools {
  private slackTools?: SlackTools;
  private azureTools?: AzureTools;
  private atlassianTools?: AtlassianTools;
  private tools: StructuredTool[];

  constructor(
    slackTools?: SlackTools,
    azureTools?: AzureTools,
    atlassianTools?: AtlassianTools
  ) {
    this.slackTools = slackTools;
    this.azureTools = azureTools;
    this.atlassianTools = atlassianTools;
    this.tools = this.createTools();
  }

  private createTools(): StructuredTool[] {
    return [
      tool(async input => this.handleGetLatestActivity(input), {
        name: 'all_platforms__get_latest_activity',
        description:
          'Get latest activity from all connected platforms (Slack messages, Azure emails/calendar, Atlassian activity) for the current user',
        schema: z.object({
          days: z
            .number()
            .optional()
            .describe('Number of days to look back for activity (default: 7)'),
        }),
      }),
    ];
  }

  getTools(): StructuredTool[] {
    return this.tools;
  }

  private async handleGetLatestActivity(
    args: GetLatestActivityArgs
  ): Promise<string> {
    const { days = 7 } = args;

    // Prepare tool calls
    const toolCalls = [];

    // Add Slack tool call if available
    if (this.slackTools) {
      const slackToolsArray = this.slackTools.getTools();
      const slackGetLatestTool = slackToolsArray.find(
        tool => tool.name === 'slack__get_latest_messages'
      );
      if (slackGetLatestTool) {
        toolCalls.push({
          name: 'Slack',
          promise: slackGetLatestTool.invoke({ limit: 50 }),
        });
      }
    }

    // Add Azure tool call if available
    if (this.azureTools) {
      const azureToolsArray = this.azureTools.getTools();
      const azureGetEmailsCalendarTool = azureToolsArray.find(
        tool => tool.name === 'azure__get_emails_and_calendar'
      );
      if (azureGetEmailsCalendarTool) {
        toolCalls.push({
          name: 'Azure',
          promise: azureGetEmailsCalendarTool.invoke({ days }),
        });
      }
    }

    // Add Atlassian tool call if available
    if (this.atlassianTools) {
      const atlassianToolsArray = this.atlassianTools.getTools();
      const atlassianGetLatestTool = atlassianToolsArray.find(
        tool => tool.name === 'atlassian__get_latest_activity'
      );
      if (atlassianGetLatestTool) {
        toolCalls.push({
          name: 'Atlassian',
          promise: atlassianGetLatestTool.invoke({ days }),
        });
      }
    }

    if (toolCalls.length === 0) {
      return 'No platforms are available. Please ensure at least one platform (Slack, Azure, or Atlassian) is connected.';
    }

    try {
      // Execute all tool calls in parallel
      const results = await Promise.allSettled(
        toolCalls.map(call => call.promise)
      );

      // Combine results with clear section headers
      let combinedOutput = `=== LATEST ACTIVITY FROM ALL PLATFORMS (Last ${days} days) ===\n\n`;

      results.forEach((result, index) => {
        const platformName = toolCalls[index].name;

        if (result.status === 'fulfilled') {
          combinedOutput += `=== ${platformName.toUpperCase()} ===\n`;
          combinedOutput += `${result.value}\n\n`;
        } else {
          combinedOutput += `=== ${platformName.toUpperCase()} ===\n`;
          combinedOutput += `Error: ${result.reason}\n\n`;
        }
      });

      return combinedOutput.trim();
    } catch (error) {
      return `Error getting latest activity from platforms: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}
