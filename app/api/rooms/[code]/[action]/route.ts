import { action, safely } from "@/lib/game-server";
export async function POST(request: Request, context: { params: Promise<{ code: string; action: string }> }) {
  const p = await context.params;
  return safely(() => action(request, p.code, p.action));
}
