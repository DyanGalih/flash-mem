'use strict';

class Server {
  constructor(info) {
    this.info = info;
    this.tools = new Map();
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
    return this;
  }

  listTools() {
    return Array.from(this.tools.values());
  }

  getTool(name) {
    return this.tools.get(name);
  }

  async handleRequest(request) {
    if (!request || request.jsonrpc !== '2.0') {
      return this.errorResponse(request?.id ?? null, -32600, 'Invalid Request');
    }

    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: this.listTools().map((tool) => ({
            name: tool.name,
            schema: tool.schema
          }))
        }
      };
    }

    if (request.method === 'tools/call') {
      const toolName = request.params && request.params.name;
      const tool = typeof toolName === 'string' ? this.tools.get(toolName) : undefined;
      if (!tool) {
        return this.errorResponse(request.id, -32601, `Unknown tool: ${toolName ?? '<missing>'}`);
      }

      try {
        const args = request.params && Object.prototype.hasOwnProperty.call(request.params, 'arguments')
          ? request.params.arguments
          : undefined;
        const parsed = tool.schema.parse(args);
        const result = await tool.execute(parsed);
        return {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } catch (error) {
        return this.errorResponse(request.id, -32602, error instanceof Error ? error.message : 'Invalid params');
      }
    }

    return this.errorResponse(request.id, -32601, `Unknown method: ${request.method}`);
  }

  errorResponse(id, code, message) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
  }
}

module.exports = { Server };
