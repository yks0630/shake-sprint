# 现成素材与来源

所有游戏人物和场景素材均从网上获取并保存到 public/assets，在运行时从本站加载。

| 文件 | 原始素材 | 作者 | 许可 |
| --- | --- | --- | --- |
| female-*.png, player-*.png, adventurer-*.png | https://kenney.nl/assets/platformer-characters | Kenney | CC0 |
| sky.png, clouds1.png, hills1.png, fence.png, tree04.png | https://kenney.nl/assets/background-elements | Kenney | CC0 |
| finish-flag.png | https://kenney.nl/assets/sports-pack | Kenney | CC0 |
| running-track.svg | https://www.clipsafari.com/clips/o183460-running-track | mdlsoft | CC0 |

Kenney 原始许可位于 public/assets/LICENSE-*.txt。角色动画使用素材原本的动作帧。跑道为现成 SVG，未手绘角色、跑道或场景。

界面图标来自 lucide-react（ISC），二维码由 qrcode（MIT）在本地生成，不向第三方接口发送房间或选手信息。

## 直接采用的游戏界面套件

- **GameArt2D / pzUH — Free Game GUI**
  - 作者发布页：https://www.gameart2d.com/free-game-gui.html
  - 作者免费素材许可：https://www.gameart2d.com/license.html （CC0 / Public Domain）
  - 来源原包：freegui.zip；使用 Window.png、Button.png 的原版面板、红色标题条、蓝/绿/红按钮、方形按钮和 Home 图标。
  - `public/assets/gui/*.png` 为原始图集的独立裁切，不是重新绘制的 UI。
  - `stage-bg.png` 来自 Kenney Background Elements 的原始示例背景。
- `public/assets/gui/click.ogg` 来自 Kenney UI Pack 的 click-a.ogg，CC0。
