import { history, safely } from "@/lib/game-server";
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return safely(() => history(code, request));
}
