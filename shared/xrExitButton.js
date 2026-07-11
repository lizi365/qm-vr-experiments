// 通用组件：场景内3D退出VR面板。
//
// 背景：VRButton默认生成的"EXIT VR"是页面上的DOM按钮，一旦进入沉浸模式，
// 用户根本看不到浏览器界面，这个按钮实际不可达。三个demo都反馈了同样的
// "进去之后不知道怎么退出"的问题，所以做成这一个共享模块，每个demo各自
// import调用，不在每个文件里各写一份。
//
// 用法：
//   import { createXRExitButton } from '../shared/xrExitButton.js';
//   const exitButton = createXRExitButton(renderer, camera, [controller0, controller1]);
//   // 在animate()里每帧调用一次：
//   exitButton.update();
//
// 交互方式：手柄射线指向面板 + 按抓握键(squeeze/grip)，调用
// renderer.xr.getSession().end() 优雅退出。2026-07-10改成squeeze——
// demo-dart的抓取手势从squeeze换成了trigger(select)，这里跟着换成squeeze
// 才不会互相打架。demo1的trigger(select)绑定的是"切换粒子档位"，逻辑是
// "不管指哪都会响应"，这里改用squeeze跟它完全不共享按键，也不冲突；
// demo0没有绑定任何自定义手柄事件，同样安全。

import * as THREE from 'three';

export function createXRExitButton(renderer, camera, controllers) {
  // 2026-07-11：真机反馈"手柄射线完全无法瞄准"这一批面板都离摄像机太近
  // (原来z=-0.55，不到0.6米)——面板是camera子物体，跟头一起动，但手柄
  // 位置是独立6DOF追踪的，离头有一段真实的物理距离；面板离头越近，手柄
  // 射线要精确对上它所需要的角度窗口就越窄，稍微一偏手就完全指不到。
  // 常见WebXR UI面板经验值是放在1-2米这个区间，这里选1.3米。WIDTH/HEIGHT
  // 和OFFSET的x/y都按跟原来相同的倍数(1.3/0.55≈2.364)放大，这样从摄像机
  // 看过去的视觉大小/屏幕位置基本不变，只是把面板本身挪远了，纯粹是为了
  // 换取手柄更宽松的瞄准角度容差。这一项没有真机条件验证，1.3米是否
  // 合适需要下一轮真机测试确认，见demo-dart的README。
  const WIDTH = 0.567;
  const HEIGHT = 0.236;

  // 面板挂在摄像机下面，作为camera的子物体——camera的世界矩阵在VR里由
  // renderer.xr每帧自动同步成头显姿态，子物体自然跟着头动，不用自己每帧
  // 手动copy位置/朝向。位置选在视野右下方外侧：平时正常看东西不会碰到，
  // 但只要稍微低头/瞟一眼右下就能看到，符合"不容易误触但能主动看到"的要求。
  const OFFSET = new THREE.Vector3(0.756, -0.662, -1.3);

  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);

  function draw(hovered) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = hovered ? 'rgba(120, 30, 30, 0.9)' : 'rgba(10, 14, 22, 0.75)';
    ctx.strokeStyle = hovered ? '#ff9f7f' : '#3a4a60';
    ctx.lineWidth = hovered ? 6 : 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = hovered ? '#ffe6df' : '#cfe8ff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('退出 VR', canvas.width / 2, 78);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = hovered ? '#ffcfc0' : '#7f96ac';
    ctx.fillText('手柄射线指向 + 抓握键', canvas.width / 2, 118);

    texture.needsUpdate = true;
  }
  draw(false);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, HEIGHT),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
  );
  panel.position.copy(OFFSET);
  panel.renderOrder = 999;
  camera.add(panel);

  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  let pendingSqueeze = [];
  let wasHovered = false;

  controllers.forEach((controller) => {
    controller.addEventListener('squeezestart', () => {
      pendingSqueeze.push(controller);
    });
  });

  function controllerHitsPanel(controller) {
    // controller.matrixWorld本身不会自动保持最新——它是在renderer.render()
    // 内部随场景遍历才会刷新，而这个检测发生在render()之前，所以这里显式
    // 强制刷新一次（跟Object3D.getWorldPosition内部做的事一样），否则用的
    // 是上一帧的手柄位置，头/手一转射线判定就会晚一帧、体感上很飘。
    controller.updateWorldMatrix(true, false);
    rayOrigin.setFromMatrixPosition(controller.matrixWorld);
    rayDir.set(0, 0, -1).transformDirection(controller.matrixWorld);
    raycaster.set(rayOrigin, rayDir);
    return raycaster.intersectObject(panel, false).length > 0;
  }

  function update() {
    // 面板是camera的子物体，先确保它这一帧的世界矩阵是最新的，
    // 否则射线检测会用上一帧的位置，头一转就会有一帧的判定偏差。
    camera.updateMatrixWorld(true);

    let hoveredNow = false;
    for (const controller of controllers) {
      if (controllerHitsPanel(controller)) {
        hoveredNow = true;
        break;
      }
    }
    if (hoveredNow !== wasHovered) {
      draw(hoveredNow);
      wasHovered = hoveredNow;
    }

    if (pendingSqueeze.length > 0) {
      for (const controller of pendingSqueeze) {
        if (controllerHitsPanel(controller)) {
          const session = renderer.xr.getSession();
          if (session) session.end();
          break;
        }
      }
      pendingSqueeze = [];
    }
  }

  return { update, panel };
}
