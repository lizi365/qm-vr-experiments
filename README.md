# QM VR Experiments — 量子力学VR科普项目 · 技术验证demo集

面向12-18岁用户的付费VR科普娱乐项目，用 Horrible History 式荒诞喜剧叙事讲量子力学发展史。这个仓库是技术验证阶段的demo集合，不是最终产品代码。

**技术方向**：WebXR + Three.js（从 unpkg CDN 走 importmap，零构建、纯静态HTML）+ Cloudflare Pages 部署，不走原生App/Unity路线。测试设备：Pico企业版头显。

## Demo 链接（部署后从手机/头显直接打开）

根导航页：https://qm-vr-experiments.pages.dev/ （列出下面所有demo，方便在头显浏览器里点点点跳转，不用记路径）

- **Demo 0 · 链路验证**：https://qm-vr-experiments.pages.dev/demo0/
  验证 WebXR + Three.js + Cloudflare Pages 这条技术链路能不能跑通，一个旋转立方体，没有性能压测内容。

- **Demo 1 · 粒子渲染压测**：https://qm-vr-experiments.pages.dev/demo1/
  InstancedMesh 电子云，手柄扳机切换 500 → 100,000 粒子档位，测试Pico企业版的渲染性能上限（GPU负载边界）。

- **Demo Dart · 抓取投掷交互测试**：https://qm-vr-experiments.pages.dev/demo-dart/
  简化版掷飞镖，测手柄抓取/投掷手感、投掷轨迹是否符合直觉、碰撞判定是否准确（交互延迟边界，跟Demo 1测的是完全不同的维度）。**注意命名**：这个demo刻意不叫"Demo 2"——Demo 2这个编号留给之后根据Demo 1的实测FPS数据决定方向的shader效果版本，避免命名混淆。

## 目录结构

```
qm-vr-experiments/
├── index.html          ← 根导航页，列出所有demo链接
├── README.md            ← 本文件
├── demo0/
│   ├── index.html      ← 链路验证：WebXR旋转立方体
│   └── README.md
├── demo1/
│   ├── index.html      ← 粒子渲染压测：InstancedMesh电子云
│   └── README.md
└── demo-dart/
    ├── index.html      ← 抓取投掷交互测试：简化版掷飞镖
    └── README.md
```

每个demo都是完全独立的单文件 `index.html`，互不依赖，可以单独打开、单独部署。

## 部署到 Cloudflare Pages（步骤）

1. 登录 Cloudflare Dashboard → **Workers & Pages** → **创建应用程序** → **Pages** → **连接到 Git**。
2. 选择这个 GitHub 仓库（`lizi365/qm-vr-experiments`），授权 Cloudflare 访问。
3. 构建配置：
   - **框架预设**：None / 无
   - **构建命令**：留空（纯静态文件，不需要构建）
   - **构建输出目录**：`/`（仓库根目录，因为 demo0/demo1 都是子路径，不是需要单独打包的产物）
4. 点击部署。部署完成后会分配一个 `https://<project-name>.pages.dev` 域名。
5. 用 Pico 企业版头显浏览器打开根导航页，先点进 Demo 0 做链路验证，确认能进VR、画面稳定后，再依次测 Demo 1（粒子压测）和 Demo Dart（交互测试）。
6. 之后每次 `git push` 到 `main` 分支，Cloudflare Pages 会自动重新部署——不需要手动操作。

## 测试与Demo 2的关系

Demo 1 的README里有一张FPS实测记录表，等实机测试数据（500/2,000/8,000/20,000/50,000/100,000粒子档位对应帧率）填好发过来后，会根据"从哪一档开始跌破90fps/60fps"来决定Demo 2的方向：

- **性能余量充足**（很晚才掉帧甚至100,000档都稳）→ Demo 2 给粒子加shader效果（呼吸感、颜色随时间变化、相位色彩映射），模拟波函数视觉效果。
- **性能余量紧张**（较早掉帧，比如8,000档就跌破90fps）→ Demo 2 转为"更少粒子+更强shader"思路，控制同屏渲染对象数量。

在拿到实测数据之前，不会开始写Demo 2。

## 技术约束（后续demo也遵循）

- Three.js 通过 importmap 从 `unpkg.com` CDN 加载，不引入本地 npm 构建流程，保持纯静态HTML零构建部署。
- 代码注释中英混合可以，面向用户的README统一用中文。
- 每个demo保留FPS实时显示：桌面模式DOM显示（右上角） + VR模式头显内悬浮面板（canvas贴图billboard），双通道，方便每一版做性能对比。
