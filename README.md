# car-x

Car using only physics constraints — 一辆完全靠物理约束(铰链/锁定/自由度)拼起来、靠铰链马达驱动的 3D 小车,配俯视锁定视角、定速巡航与车轮轨迹记录。

基于 [enable3d 官方示例](https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html) 改制的**单文件离线版**:双击 [`car-x.html`](car-x.html) 即可离线游玩,无需服务器、无任何网络请求。

## 操作

| 按键 / 控件 | 动作 |
| --- | --- |
| W / S(油门未锁定) | 按住前进 / 后退(四轮铰链马达) |
| W / S(油门已锁定) | 按一下开始定速巡航;再按同键停止;按另一键反向(同时清空轨迹) |
| A / D | 前轮转向(两种模式都可用) |
| 右上角「视角」 | 俯视锁定(默认,正交俯视、车头朝上、镜头不随车身旋转)/ 自由视角(原版追逐相机) |
| 右上角「油门」 | 锁定后进入定速巡航模式 |
| 速度滑杆 / 输入框 | 巡航速度 0~1.00 m/s,两个控件实时联动 |

## 功能说明

- **俯视锁定视角**:正交相机(OrthographicCamera)从正上方跟随车辆,世界方向恒定(车头始终朝屏幕上方),运动时镜头不随车身旋转;自由视角则恢复原示例的跟随相机。
- **停车位**:出生点地面上的白色矩形,正好框住整车 footprint(3.35 × 5.0,由轮距参数推导)。
- **轮迹**:前轮蓝色、后轮红色,实时绘制在地面;行进方向切换(前进↔后退)时立即清空全部轨迹,只记录当前方向的轨迹。
- **纯黑场景**:无贴图草地、无天空雾效,场景背景与地面均为纯黑。

## 单文件是怎么做到的

`tools/build.mjs` 用 esbuild 做了三件事:

1. 把 `src/entry.js`(场景代码 + enable3d 框架模块)打包成 IIFE;
2. 读入 `src/ammo.js`(Bullet 物理的 asm.js 构建,免去 wasm 在 `file://` 下无法 fetch 的问题);
3. 全部内联进一个 `car-x.html`。`PhysicsLoader()` 被替换为直接调用全局 `Ammo()`。

```bash
npm install
npm run build   # 重新生成 car-x.html
```

调试:`car-x.html` 在控制台暴露 `window.carx`(Scene3D 实例),可以读 `carx.plate.position`、`carx.trails`、直接设 `carx.cruiseSpeed` 等。

## 目录

- `car-x.html` — 构建产物,双击即玩
- `src/entry.js` — 场景代码(改动版)
- `src/car-using-physics-constraints.html` — 上游原始示例(存档)
- `src/enable3d.framework.*.module.min.js` / `src/ammo.js` — 打包输入

## 致谢

- [enable3d](https://enable3d.io/) by yandeu — MIT License
- [ammo.js](https://github.com/kripken/ammo.js)(Bullet Physics) — zlib License
- 原始示例来自 [enable3d.github.io](https://github.com/enable3d/enable3d.github.io)
