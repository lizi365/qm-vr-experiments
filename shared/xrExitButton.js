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
// 交互方式：手柄射线指向面板 + 按扳机键(select/trigger)，调用
// renderer.xr.getSession().end() 优雅退出。故意用trigger而不是squeeze，
// 是因为squeeze在demo-dart里已经被占用为"抓取飞镖"的手势，用trigger
// 才不会互相打架（demo1的trigger虽然也用来切换粒子档位，但那个逻辑是
// "不管指哪都会响应"，跟这里"必须真的指着面板才响应"不冲突，两边各自
// 独立触发，互不影响）。

import * as THREE from 'three';

export function createXRExitButton(renderer, camera, controllers) {
  const WIDTH = 0.24;
  const HEIGHT = 0.1;

  // 面板挂在摄像机下面，作为camera的子物体——camera的世界矩阵在VR里由
  // renderer.xr每帧自动同步成头显姿态，子物体自然跟着头动，不用自己每帧
  // 手动copy位置/朝向。位置选在视野右下方外侧：平时正常看东西不会碰到，
  // 但只要稍微低头/瞟一眼右下就能看到，符合"不容易误触但能主动看到"的要求。
  const OFFSET = new THREE.Vector3(0.32, -0.28, -0.55);

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
    ctx.fillText('手柄射线指向 + 扳机', canvas.width / 2, 118);

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
  let pendingSelect = [];
  let wasHovered = false;

  controllers.forEach((controller) => {
    controller.addEventListener('selectstart', () => {
      pendingSelect.push(controller);
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

    if (pendingSelect.length > 0) {
      for (const controller of pendingSelect) {
        if (controllerHitsPanel(controller)) {
          const session = renderer.xr.getSession();
          if (session) session.end();
          break;
        }
      }
      pendingSelect = [];
    }
  }

  return { update, panel };
}
