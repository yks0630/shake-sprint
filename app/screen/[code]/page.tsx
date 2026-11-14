import GameClient from '@/app/game-client';
export default async function Page({ params }: { params: Promise<{ code: string }> }) { const { code } = await params; return <GameClient view="screen" code={code.toUpperCase()} />; }
