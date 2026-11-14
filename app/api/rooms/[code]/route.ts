import { snapshot, safely } from "@/lib/game-server";
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return safely(() => snapshot(code, request));
}
