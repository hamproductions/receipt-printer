type JsonSchema = Record<string, unknown>;

type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

type ToolResult = { content: ToolContent[]; isError?: boolean };

export type Tool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
};

type ModelContext = {
  registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => unknown;
  unregisterTool?: (name: string) => void;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function modelContext() {
  return document.modelContext ?? navigator.modelContext ?? null;
}

export function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

export function failure(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function registerTools(tools: Tool[]) {
  const context = modelContext();
  if (!context) {
    return () => undefined;
  }
  const controller = new AbortController();
  for (const tool of tools) {
    const execute = async (input: Record<string, unknown>) => {
      try {
        return await tool.execute(input ?? {});
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    };
    try {
      context.registerTool({ ...tool, execute }, { signal: controller.signal });
    } catch {
      context.unregisterTool?.(tool.name);
      context.registerTool({ ...tool, execute });
    }
  }
  return () => {
    controller.abort();
    if (context.unregisterTool) {
      tools.forEach((tool) => {
        try {
          context.unregisterTool!(tool.name);
        } catch {
          return;
        }
      });
    }
  };
}
