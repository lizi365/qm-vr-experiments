// 通用组件：场景内3D退出VR提示牌 + 专属按键退出。
//
// 背景：VRButton默认生成的"EXIT VR"是页面上的DOM按钮，一旦进入沉浸模式，
// 用户根本看不到浏览器界面，这个按钮实际不可达。三个demo都反馈了同样的
// "进去之后不知道怎么退出"的问题，所以做成这一个共享模块，每个demo各自
// import调用，不在每个文件里各写一份。
//
// 用法：
//   import { createXRExitButton } from '../shared/xrExitButton.js';
//   const exitButton = createXRExitButton(renderer, camera, scene, [controller0, controller1]);
//   // 可选：createXRExitButton(renderer, camera, scene, controllers, { position, size, buttonIndex })
//   // 在animate()里每帧调用一次：
//   exitButton.update();
//
// 交互方式的演变：
//   最早是camera子物体+squeeze瞄准点击(v1)；
//   2026-07-11第七轮把面板挪远+等比放大，还是camera子物体(v2)；
//   2026-07-11第八轮放弃等比缩放思路，改成挂到scene下的世界固定位置，
//   目的是让瞄准角度容差更宽松(v3)；
//   2026-07-11第九轮(这一版)：真机反馈"瞄准点击"这套交互本身就不如"直接
//   按一个专属按键"来得简单可靠，改成手柄上一个未被占用的物理按键(默认
//   buttons[5]，即WebXR"xr-standard"映射里通常对应B/Y的那个按钮)直接
//   触发session.end()，不再需要任何瞄准/射线检测。既然不再需要瞄准，
//   第七/八轮"把面板挪远/挪去scene下"的前提也就不存在了——面板改回
//   camera子物体，回到最初"视野右下角，头转到哪跟到哪"的样式，这对一块
//   纯展示的说明牌来说反而更合适(不需要专门转头去看靶的方向才能看到它)。
//   场景内的面板现在只是一块纯展示用的说明牌("按XX键退出VR"的图示)，
//   不承担任何点击判定，所以也不再需要hover高亮/射线可视化这些逻辑，
//   代码比之前简单很多。
//   buttons[5]这个索引沿用的是跟GRAB_BUTTON_INDEX同样的态度——它是WebXR
//   标准手柄映射的约定值，没有在Pico实机上实测确认过，需要靠调用方
//   demo里已有的`logGamepadButtonChanges()`(在demo-dart里)按边沿触发
//   打印实际按下的buttons[i]来验证，如果实测发现B/Y不是索引5，直接改
//   这里的默认值或者传options.buttonIndex覆盖即可。

import * as THREE from 'three';

// scene参数目前保留只是为了不用改三个demo的调用签名，面板本身现在挂在
// camera下，不需要scene——纯展示牌不再需要独立于摄像机的世界坐标。
export function createXRExitButton(renderer, camera, scene, controllers, options = {}) {
  const EXIT_BUTTON_INDEX = options.buttonIndex !== undefined ? options.buttonIndex : 5;
  const WIDTH = options.size ? options.size.width : 0.24;
  const HEIGHT = options.size ? options.size.height : 0.1;
  const OFFSET = options.position || new THREE.Vector3(0.32, -0.28, -0.55);

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);

  // 纯展示用的说明牌：不再有hover状态，只画一次(distanceLabel变化时才重画)。
  // 图示化的按键图标(一个圆圈+字母)+文字说明，玩家看一眼就知道按哪个键，
  // 不需要瞄准。
  // 2026-07-11第十一轮：连续两轮反馈"血量/退出牌贴脸"，但代码/部署/渲染
  // 侧反复核实过都指向"距离摄像机1.3~1.7米，不是贴脸"（见demo-dart
  // README"真机反馈第十一轮"一节的排查记录），排除了部署/缓存问题
  // (用户确认每次都手动访问主域名，不是历史部署的哈希URL)。为了下一次
  // 真机测试能拿到一个明确的数字而不是主观印象，这里在牌子上加一行实时
  // 计算的"实测距离"文字——如果真机上看到的数字确实是1.6m左右但视觉上
  // 仍然觉得贴脸，说明问题不在距离数值本身(可能是头显FOV/镜片畸变/
  // 立体渲染这类应用代码管不到的层面)；如果真机上这个数字明显小于1.3米，
  // 说明WebXR会话里摄像机的姿态/矩阵更新有application没预料到的问题，
  // 两种情况需要的后续排查方向完全不同，这行数字能直接把两者区分开。
  function draw(distanceLabel) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
    ctx.strokeStyle = '#3a4a60';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fill();
    ctx.stroke();

    // 按键图标：一个圆圈，里面写字母，示意"这是一个物理按键"
    const iconCx = 62, iconCy = 72, iconR = 34;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4a60';
    ctx.fill();
    ctx.strokeStyle = '#cfe8ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', iconCx, iconCy + 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('退出 VR', 116, 60);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#7f96ac';
    ctx.fillText('按手柄 B/Y 键', 116, 98);

    if (distanceLabel) {
      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#6a8aa8';
      ctx.fillText('实测距离(调试用): ' + distanceLabel, 116, 130);
    }

    texture.needsUpdate = true;
  }
  draw();

  // 每隔一小段时间重新计算一次面板到摄像机的实际世界坐标距离，数值变化
  // 才重画canvas(避免每帧都redraw)——这个readout是给下一轮真机测试用的
  // 诊断工具，不是游戏功能的一部分。
  let lastDistanceLabel = null;
  let distanceCheckTimer = 0;
  const _camPos = new THREE.Vector3();
  const _panelPos = new THREE.Vector3();
  function updateDistanceReadout(dt) {
    distanceCheckTimer -= dt;
    if (distanceCheckTimer > 0) return;
    distanceCheckTimer = 0.5; // 每0.5秒检查一次，不需要逐帧更新
    camera.getWorldPosition(_camPos);
    panel.getWorldPosition(_panelPos);
    const label = _camPos.distanceTo(_panelPos).toFixed(2) + 'm';
    if (label !== lastDistanceLabel) {
      lastDistanceLabel = label;
      draw(label);
    }
  }

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, HEIGHT),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
  );
  panel.position.copy(OFFSET);
  panel.renderOrder = 999;
  camera.add(panel);

  // 独立维护自己的一份inputSource引用，不依赖宿主demo是否也在追踪同一个
  // controller的connected事件——Object3D支持同一事件多个监听者，互不干扰。
  const inputSources = [];
  const prevPressed = [];
  controllers.forEach((controller, idx) => {
    controller.addEventListener('connected', (e) => { inputSources[idx] = e.data; });
    controller.addEventListener('disconnected', () => { inputSources[idx] = null; });
  });

  let lastUpdateTime = performance.now();
  function update() {
    const now = performance.now();
    const dt = Math.min((now - lastUpdateTime) / 1000, 0.5);
    lastUpdateTime = now;
    updateDistanceReadout(dt);

    for (let i = 0; i < inputSources.length; i++) {
      const src = inputSources[i];
      const gp = src && src.gamepad;
      if (!gp) continue;
      const btn = gp.buttons[EXIT_BUTTON_INDEX];
      if (!btn) continue;
      const pressed = btn.pressed || btn.value > 0.5;
      if (pressed && !prevPressed[i]) {
        const session = renderer.xr.getSession();
        if (session) session.end();
      }
      prevPressed[i] = pressed;
    }
  }

  return { update, panel };
}
