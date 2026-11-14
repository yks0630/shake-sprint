import { action, safely } from "@/lib/game-server";
export function POST(request: Request) { return safely(() => action(request, "", "create")); }
