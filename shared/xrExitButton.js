// 通用组件：场景内3D退出VR面板。
//
// 背景：VRButton默认生成的"EXIT VR"是页面上的DOM按钮，一旦进入沉浸模式，
// 用户根本看不到浏览器界面，这个按钮实际不可达。三个demo都反馈了同样的
// "进去之后不知道怎么退出"的问题，所以做成这一个共享模块，每个demo各自
// import调用，不在每个文件里各写一份。
//
// 用法：
//   import { createXRExitButton } from '../shared/xrExitButton.js';
//   const exitButton = createXRExitButton(renderer, camera, scene, [controller0, controller1]);
//   // 可选：createXRExitButton(renderer, camera, scene, controllers, { position, size })
//   // 在animate()里每帧调用一次：
//   exitButton.update();
//
// 交互方式：手柄射线指向面板 + 按抓握键(squeeze/grip)，调用
// renderer.xr.getSession().end() 优雅退出。2026-07-10改成squeeze——
// demo-dart的抓取手势从squeeze换成了trigger(select)，这里跟着换成squeeze
// 才不会互相打架。demo1的trigger(select)绑定的是"切换粒子档位"，逻辑是
// "不管指哪都会响应"，这里改用squeeze跟它完全不共享按键，也不冲突；
// demo0没有绑定任何自定义手柄事件，同样安全。
//
// 2026-07-11第七轮：真机反馈面板离摄像机太近(原z=-0.55，camera子物体)导致
// 手柄射线瞄不准，当时的做法是"挪到z=-1.3，同时把尺寸和偏移按同样倍数
// 放大，维持屏幕视觉大小不变"。
// 2026-07-11第八轮：用户指出纯粹等距缩放不解决根本问题——面板在视野里
// 占的角度范围没变，射线覆盖不全的问题还在。这次换思路：面板不再是
// camera的子物体，而是挂在scene下的世界固定位置，放在跟各demo主要内容
// (demo0/1的立方体、demo-dart的靶/敌人)差不多的距离范围——这个距离玩家
// 全程都在用手柄射线/抛物线瞄准那些物体，直接复用同一套已经练熟的瞄准
// 手感，而不是另外发明一个"UI专属"的距离。默认位置/尺寸适配demo0/demo1
// 的内容深度(约3.5米)，demo-dart的靶/敌人更远(约4.5米)，通过options自己
// 传了一组更远、也相应更大的position/size。挂到scene下之后不再需要
// 每帧camera.updateMatrixWorld()——那是camera子物体时代的产物，面板现在
// 的世界矩阵由场景图的常规每帧更新维护，不依赖camera。

import * as THREE from 'three';

export function createXRExitButton(renderer, camera, scene, controllers, options = {}) {
  const WIDTH = options.size ? options.size.width : 0.75;
  const HEIGHT = options.size ? options.size.height : 0.31;

  // 默认位置对应demo0/demo1的主要内容深度(约z=-1.4，距摄像机约3.5米)，
  // 放在右侧、略高于视线的位置——不需要跟demo0/1现有内容的确切坐标对齐，
  // 只要在同一个"玩家已经习惯瞄准"的距离范围内、且不挡住主要内容即可。
  const WORLD_POS = options.position || new THREE.Vector3(1.1, 1.7, -1.4);

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
  panel.position.copy(WORLD_POS);
  panel.renderOrder = 999;
  scene.add(panel);

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
