# 采用的现成 UI

界面直接采用 GameArt2D / pzUH 公开发布的 Free Game GUI 素材与组合方式：

https://www.gameart2d.com/free-game-gui.html

使用原版黄色面板、红色标题条、蓝色与绿色按钮、方形数字底板、主页图标。图集裁切结果位于 `public/assets/gui/`，CSS 只承担布局、原图缩放、文本以及交互状态。

入口改为游戏菜单；比赛期间只展示实时排名；结束展示前三名角色和所有参赛者。删除此前的宣传型首页、英文标语和卡片拼贴界面。

场景与角色仍使用 Kenney 和 ClipSafari 的原始素材，来源见 ASSETS.md。
