import { StructuredTool } from '@langchain/core/tools';

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export interface ToolDefinition {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any; // Zod schema shapes vary and are complex to type precisely
}

/**
 * Extract tool definitions from LangChain tools for MCP compatibility
 * @param tools Array of StructuredTool instances
 * @returns Array of tool definitions suitable for MCP registration
 */
export function getToolDefinitions(tools: StructuredTool[]): ToolDefinition[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema:
      'shape' in tool.schema
        ? tool.schema.shape
        : tool.schema._def.schema.shape,
  }));
}

/**
 * Execute a tool by name from an array of LangChain tools
 * @param tools Array of StructuredTool instances
 * @param name Full tool name (e.g., 'slack__conversations_history')
 * @param args Arguments to pass to the tool
 * @returns Promise<ToolResponse> - Formatted response for MCP
 */
export async function executeTool(
  tools: StructuredTool[],
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any // Tool arguments vary by tool and are validated by Zod schemas
): Promise<ToolResponse> {
  try {
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    // Execute the tool and get the string result
    const result = await tool.invoke(args);

    // Convert string result back to ToolResponse format for MCP
    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
}
