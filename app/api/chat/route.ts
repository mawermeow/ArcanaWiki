import { handleChatRequest } from "../../../lib/pwa/chat-api.ts";

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request);
}
