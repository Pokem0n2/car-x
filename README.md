# car-x

Car using only physics constraints — 一辆完全靠物理约束(铰链/锁定/自由度)拼起来、靠铰链马达驱动的 3D 小车,配俯视锁定视角、定速巡航、车轮轨迹与触屏驾驶。

基于 [enable3d 官方示例](https://github.com/enable3d/enable3d.github.io/blob/master/src/examples/car-using-physics-constraints.html) 改制的**单文件离线版**:双击 [`car-x.html`](car-x.html) 即可离线游玩,无需服务器、无任何网络请求。

## 车辆参数(真实比例)

| 参数 | 数值 |
| --- | --- |
| 长 × 宽 × 高 | 4125 × 1770 × 1570 mm |
| 轴距 | 2700 mm |
| 前/后轮距 | 1530 mm |
| 最小转弯半径 | 5250 mm(最大转向角 ≈ 27.1°) |
| 轮胎 | 195/60 R16(外径 640 mm) |

## 操作

| 按键 / 手势 | 动作 |
| --- | --- |
| W / S(油门未锁定) | 按住前进 / 后退 |
| W / S(油门已锁定) | 按一下开始定速巡航;再按同键停止;按另一键反向(同时清空轨迹) |
| A / D | 转向(上限即最小转弯半径) |
| 鼠标滚轮 / 双指捏合 | 两种视角下均可缩放画面 |
| 鼠标左键拖拽 / 单指拖拽 | 自由视角下环绕观察(不会重置回默认角度) |
| 触屏单击 | 油门(右上角控件除外) |
| 触屏双指轻触 | 倒车油门 |
| 倾斜设备 | 转向(横屏取 gamma、竖屏取 beta,3° 死区,30° 打满舵) |
| 右上角「视角」 | 俯视锁定(默认,正交俯视、车头朝上、镜头不随车身旋转)/ 自由视角 |
| 右上角「油门」+ 速度滑杆 | 定速巡航 0~1.00 m/s |

## 场地(默认比例尺 1:200,屏幕 1 mm = 实际 200 mm)

- 纯黑场地:边长为车长 10 倍(41.25 m)的正方形,外部为草地
- 原停车位(纵向)5300 × 2400 mm,车辆出生于此
- 倒 T 字三岔路(仅画线,无碰撞):竖向路宽 3000 mm、长 5300 mm,横向两臂各 6000 mm
- 新增横向停车位 5300 × 2400 mm,南侧 15000 mm 道路边线
- 轮迹:前轮绿色、后轮红色;行进方向切换(前进↔后退)时立即清空全部轨迹

## 单文件是怎么做到的

`tools/build.mjs` 用 esbuild 做了三件事:

1. 把 `src/entry.js`(场景代码 + enable3d 框架模块 + 草地贴图 data URL)打包成 IIFE;
2. 读入 `src/ammo.js`(Bullet 物理的 asm.js 构建,免去 wasm 在 `file://` 下无法 fetch 的问题);
3. 全部内联进一个 `car-x.html`。`PhysicsLoader()` 被替换为直接调用全局 `Ammo()`。

```bash
npm install
npm run build   # 重新生成 car-x.html
```

调试:控制台暴露 `window.carx`(Scene3D 实例),可读 `carx.plate.position`、`carx.trails`、直接设 `carx.cruiseSpeed` 等。

## 致谢

- [enable3d](https://enable3d.io/) by yandeu — MIT License
- [ammo.js](https://github.com/kripken/ammo.js)(Bullet Physics) — zlib License
- 原始示例来自 [enable3d.github.io](https://github.com/enable3d/enable3d.github.io)
