import { createMcpHttpHandler } from "../src/mcp-server.js";

export const config = {
  maxDuration: 30
};

export default createMcpHttpHandler();
