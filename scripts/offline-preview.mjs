import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const destination = resolve(process.argv[2] || '../shake-sprint-preview.html');
const assets = {};
for (const file of readdirSync('public/assets')) {
  if (!/\.(png|svg)$/.test(file)) continue;
  const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  assets[file] = 'data:' + mime + ';base64,' + readFileSync('public/assets/' + file).toString('base64');
}
const result = await build({ stdin: {
  contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Game from "./app/game-client.tsx"; createRoot(document.getElementById("app")).render(React.createElement(Game,{view:"demo"}));',
  resolveDir: process.cwd(), loader: 'tsx'
}, bundle: true, write: false, platform: 'browser', format: 'iife', minify: true, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-assets', setup(b) {
  b.onLoad({ filter: /game-client\.tsx$/ }, ({ path }) => {
    let s = readFileSync(path, 'utf8');
    s = s.replaceAll('src={"/assets/" + slug + "-" + (moving ? "walk1" : pose) + ".png"}', 'src={window.__previewAssets[slug + "-" + (moving ? "walk1" : pose) + ".png"]}');
    s = s.replaceAll('src={"/assets/" + slug + "-walk2.png"}', 'src={window.__previewAssets[slug + "-walk2.png"]}');
    s = s.replace(/src="\/assets\/([^"]+)"/g, (_, name) => 'src={window.__previewAssets[' + JSON.stringify(name) + ']}');
    s = s.replace('<a href="/">创建真实比赛<ArrowRight size={14} /></a>', '<span>本地效果预览</span>');
    s = s.replace('href="/"', 'href="#"');
    return { contents: s, loader: 'tsx', resolveDir: dirname(path) };
  });
} }] });
let css = readFileSync('app/globals.css', 'utf8').replace('@import "tailwindcss";', '');
css = css.replace(/url\(['"]?\/assets\/([^)'"\s]+)['"]?\)/g, (_, name) => 'url("' + assets[name] + '")');
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一起摇 · 本地效果预览</title><style>' + css + '</style></head><body><div id="app"></div><script>window.__previewAssets=' + JSON.stringify(assets) + ';</script><script>' + js + '</script></body></html>';
writeFileSync(destination, html);
console.log(JSON.stringify({ path: destination, bytes: Buffer.byteLength(html), mode: 'offline demo only, no network or real participants' }));
