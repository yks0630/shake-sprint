import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '一起摇 · 40秒运动会', description: '微信扫码，摇动手机，一起为快乐冲刺。现场摇一摇赛跑，大屏实时排名，40秒全力以赴。',
  icons: { icon: '/assets/finish-flag.png' }, robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
