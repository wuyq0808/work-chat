import { StructuredTool, type ToolSchemaBase } from '@langchain/core/tools';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

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
  inputSchema: Record<string, unknown>; // JSON Schema object
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
    inputSchema: convertToJsonSchema(tool.schema),
  }));
}

/**
 * Convert Zod schema to proper JSON Schema format for MCP compatibility
 */
function convertToJsonSchema(schema: ToolSchemaBase): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  // If it's already a JSON schema, return as-is
  if ('type' in schema || 'properties' in schema || '$ref' in schema) {
    return schema as Record<string, unknown>;
  }

  // Use the zod-to-json-schema library for proper conversion
  try {
    return zodToJsonSchema(schema as z.ZodType, { target: 'jsonSchema7' });
  } catch (error) {
    console.error('Error converting Zod schema to JSON Schema:', error);
    return {};
  }
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
