export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: {
    name?: string;
    arguments?: unknown;
  };
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export interface RegisteredTool<Input = unknown, Output = unknown> {
  name: string;
  description?: string;
  schema: {
    parse(input: unknown): Input;
  };
  execute(input: Input): Output | Promise<Output>;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export class Server {
  constructor(info: ServerInfo);

  readonly info: ServerInfo;

  registerTool<Input = unknown, Output = unknown>(tool: RegisteredTool<Input, Output>): this;
  listTools(): RegisteredTool[];
  getTool(name: string): RegisteredTool | undefined;
  handleRequest<T = unknown>(request: JsonRpcRequest): Promise<JsonRpcResponse<T>> | JsonRpcResponse<T>;
}
