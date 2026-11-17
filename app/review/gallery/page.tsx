const pages = [
  ['玩家首页', '/', 'phone'],
  ['手机 · 昵称与角色选择', '/review?frame=1&view=phone-ready&entry=1', 'phone'],
  ['手机 · 准备', '/review?frame=1&view=phone-ready', 'phone'],
  ['手机 · 开赛倒计时', '/review?frame=1&view=phone-race&countdown=1', 'phone'],
  ['手机 · 比赛中', '/review?frame=1&view=phone-race', 'phone'],
  ['手机 · 结算', '/review?frame=1&view=phone-result', 'phone'],
  ['大屏 · 准备', '/review?frame=1&view=screen-ready', 'screen'],
  ['大屏 · 开赛倒计时', '/review?frame=1&view=screen-race&countdown=1', 'screen'],
  ['大屏 · 比赛中', '/review?frame=1&view=screen-race', 'screen'],
  ['大屏 · 结算', '/review?frame=1&view=screen-result', 'screen'],
  ['管理后台 · 主持台', '/review-admin-dashboard.html', 'admin'],
];
export default function Gallery() {
  return <main style={{ background: '#eceef0', minHeight: '100vh', padding: 24, color: '#20272b', fontFamily: 'system-ui, sans-serif' }}>
    <header style={{ marginBottom: 24 }}><h1 style={{ fontSize: 26, fontWeight: 700 }}>游戏全部页面总览</h1><p>当前实现 · 示例数据 · 共 11 个页面与状态。每张预览可滚动，点击标题可打开原尺寸页面。</p><p>手机按 390 × 844，大屏按 1280 × 720 展示。管理页为实际后台模板的只读副本，不会创建或操作真实比赛。</p><nav style={{ display: "flex", gap: 20 }}><a href="#phone" style={{ textDecoration: "underline" }}>手机端 ↓</a><a href="#screen" style={{ textDecoration: "underline" }}>大屏端 ↓</a><a href="#admin" style={{ textDecoration: "underline" }}>管理后台 ↓</a></nav></header>
    {['phone', 'screen', 'admin'].map(group => <section id={group} key={group} style={{ marginBottom: 32 }}><h2 style={{ fontSize: 22, marginBottom: 16 }}>{group === 'phone' ? '手机端' : group === 'screen' ? '大屏与辅助页面' : '独立管理后台'}</h2><div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
      {pages.filter(p => p[2] === group).map(([title, src, kind]) => {
        const phone = kind === 'phone', width = phone ? 390 : 1280, height = phone ? 844 : 720, scale = phone ? .65 : .45;
        return <article key={title} style={{ background: '#fff', padding: 12, maxWidth: '100%', overflow: 'auto' }}><h3 style={{ fontSize: 16, marginBottom: 10 }}><a href={src} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{title} ↗</a></h3><div style={{ width: width * scale, height: height * scale, overflow: 'hidden' }}><iframe loading="lazy" title={title} src={src} style={{ width, height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left' }} /></div></article>;
      })}
    </div></section>)}
  </main>;
}
