# car-x

Car using only physics constraints — 一辆完全靠物理约束(铰链/锁定/自由度)拼起来、靠铰链马达驱动的 3D 小车。

基于 [enable3d 官方示例](https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html) 改制的**单文件离线版**:双击 [`car-x.html`](car-x.html) 即可离线游玩,无需服务器、无任何网络请求。

## 操作

| 按键 | 动作 |
| --- | --- |
| W / S | 前进 / 后退(四轮铰链马达) |
| A / D | 转向(前轴 hinge motor target) |

## 单文件是怎么做到的

`tools/build.mjs` 用 esbuild 做了三件事:

1. 把 `src/entry.js`(场景代码 + enable3d 框架模块)打包成 IIFE,草地贴图内联为 data URL;
2. 读入 `src/ammo.js`(Bullet 物理的 asm.js 构建,免去 wasm 在 `file://` 下无法 fetch 的问题);
3. 全部内联进一个 `car-x.html`。`PhysicsLoader()` 被替换为直接调用全局 `Ammo()`。

```bash
npm install
npm run build   # 重新生成 car-x.html
```

调试:`car-x.html` 在控制台暴露 `window.carx`(Scene3D 实例),可以读 `carx.plate.position`、直接改 `carx.keys.w` 等。

## 目录

- `car-x.html` — 构建产物,双击即玩
- `src/entry.js` — 场景代码(改动版)
- `src/car-using-physics-constraints.html` — 上游原始示例(存档)
- `src/enable3d.framework.*.module.min.js` / `src/ammo.js` / `src/grass-small.jpg` — 打包输入

## 致谢

- [enable3d](https://enable3d.io/) by yandeu — MIT License
- [ammo.js](https://github.com/kripken/ammo.js)(Bullet Physics) — zlib License
- 原始示例来自 [enable3d.github.io](https://github.com/enable3d/enable3d.github.io)
