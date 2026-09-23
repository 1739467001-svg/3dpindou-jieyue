// ============================================================
// viewer.js — Three.js 拼豆舞台
// 观察 / 逐层建造 / 逐颗拼装 三种模式
// 关键技巧：实例矩阵按「建造顺序」（先按层 y 排序）写入，
// 于是显示前 K 个豆子 = mesh.count = K，进度控制零成本
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BEAD_R = 0.44;      // 豆子半径（网格单位为 1）
const BEAD_H = 0.46;      // 豆子高度
const HOLE_R = 0.15;      // 中心孔半径

export class BeadViewer {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;
    this.mode = 'orbit';
    this.beads = [];        // 建造顺序的豆子 [{x,y,z,p}]
    this.total = 0;
    this.placed = 0;
    this.gridN = 1;
    this.animating = [];    // 落豆动画队列
    this.autoBuildTimer = null;
    this.soundOn = true;
    this.audioCtx = null;
    this.onProgress = null; // (placed, total) => void
    this.onComplete = null;

    this._initThree();
    this._initLoop();
  }

  _initThree() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(3.2, 2.6, 4.2);

    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 1.8;
    controls.maxPolarAngle = Math.PI * 0.96;
    controls.minDistance = 1.2;
    controls.maxDistance = 40;
    this.controls = controls;

    // 灯光：暖色主光 + 冷色补光 + 环境
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x2a2118, 0.95);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
    key.position.set(4, 7, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.55);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);

    // 工作台
    this.tableGroup = new THREE.Group();
    this.scene.add(this.tableGroup);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    // 落豆提示幽灵
    const ghostGeo = new THREE.CylinderGeometry(BEAD_R * 1.35, BEAD_R * 1.2, BEAD_H * 1.5, 14);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.95, depthWrite: false,
    });
    this.ghost = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    // 幽灵下方的光环，远看也醒目
    const ringGeo = new THREE.RingGeometry(BEAD_R * 1.5, BEAD_R * 1.85, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    this.ghostRing = new THREE.Mesh(ringGeo, ringMat);
    this.ghostRing.rotation.x = -Math.PI / 2;
    this.ghostRing.visible = false;
    this.scene.add(this.ghostRing);

    this._resize();
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.container);
    } else {
      window.addEventListener('resize', () => this._resize());
    }
  }

  _resize() {
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _initLoop() {
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      if (document.hidden) return; // 页面不可见时跳过渲染
      const now = t || performance.now();
      // 落豆弹性动画
      for (let i = this.animating.length - 1; i >= 0; i--) {
        const a = this.animating[i];
        const k = (now - a.t0) / 160;
        if (k >= 1) {
          this._writeMatrix(a.index, 1);
          this.animating.splice(i, 1);
        } else {
          // 0 → 1.25 → 1 的弹跳
          const s = k < 0.6 ? (k / 0.6) * 1.25 : 1.25 - ((k - 0.6) / 0.4) * 0.25;
          this._writeMatrix(a.index, s);
        }
      }
      // 幽灵脉动
      if (this.ghost.visible) {
        const p = 1 + Math.sin(now / 180) * 0.14;
        this.ghost.scale.set(p, 1 + Math.sin(now / 180) * 0.2, p);
        this.ghost.rotation.y = now / 900;
        const rp = 1 + Math.sin(now / 180 + 1) * 0.18;
        this.ghostRing.scale.set(rp, rp, 1);
        this.ghostRing.material.opacity = 0.4 + Math.sin(now / 180) * 0.2;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // 写入第 index 个实例的矩阵（缩放 s）
  _writeMatrix(index, s = 1) {
    if (!this.beadMesh || index >= this.beads.length) return;
    const b = this.beads[index];
    const m = new THREE.Matrix4();
    const half = this.gridN / 2;
    m.compose(
      new THREE.Vector3(b.x - half + 0.5, b.y + 0.5, b.z - half + 0.5),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s, s)
    );
    this.beadMesh.setMatrixAt(index, m);
    this.beadMesh.instanceMatrix.needsUpdate = true;
    if (this.holeMesh) {
      const m2 = new THREE.Matrix4();
      m2.compose(
        new THREE.Vector3(b.x - half + 0.5, b.y + 0.52, b.z - half + 0.5),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s, s)
      );
      this.holeMesh.setMatrixAt(index, m2);
      this.holeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- 模型装载 ----------
  setModel(beads, gridN, paletteHexes) {
    this.clearModel();
    this.beads = beads;      // 必须已按建造顺序排好
    this.total = beads.length;
    this.gridN = gridN;
    this.placed = this.mode === 'orbit' ? this.total : 0;

    const geo = new THREE.CylinderGeometry(BEAD_R, BEAD_R * 0.92, BEAD_H, 10);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.total));
    mesh.frustumCulled = false;
    mesh.count = this.placed;

    const holeGeo = new THREE.CylinderGeometry(HOLE_R, HOLE_R, BEAD_H * 1.06, 8);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x14100c });
    const holes = new THREE.InstancedMesh(holeGeo, holeMat, Math.max(1, this.total));
    holes.frustumCulled = false;
    holes.count = this.placed;

    const color = new THREE.Color();
    const m = new THREE.Matrix4();
    const half = gridN / 2;
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.total; i++) {
      const b = beads[i];
      const hex = paletteHexes[b.p] || '#888888';
      color.setStyle(hex);
      mesh.setColorAt(i, color);
      m.compose(new THREE.Vector3(b.x - half + 0.5, b.y + 0.5, b.z - half + 0.5), q, one);
      mesh.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(b.x - half + 0.5, b.y + 0.52, b.z - half + 0.5), q, one);
      holes.setMatrixAt(i, m);
    }
    mesh.instanceColor.needsUpdate = true;
    this.beadMesh = mesh;
    this.holeMesh = holes;
    this.modelGroup.add(mesh, holes);

    // 模型实际包围盒（供 resetView 智能取景）
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of beads) {
      if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
      if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
    }
    const h2 = gridN / 2;
    this.bbox = {
      cx: (minX + maxX) / 2 - h2 + 0.5,
      cy: (minY + maxY) / 2 + 0.5,
      cz: (minZ + maxZ) / 2 - h2 + 0.5,
      size: Math.max(maxX - minX, maxY - minY, maxZ - minZ) + 2.5,
    };

    // 工作台：地面网格 + 底座圆盘
    this.tableGroup.clear();
    const grid = new THREE.GridHelper(gridN * 4, gridN * 2, 0x6b5c48, 0x3a3025);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.position.y = -0.02;
    this.tableGroup.add(grid);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(gridN * 1.15, gridN * 1.2, 0.06, 48),
      new THREE.MeshLambertMaterial({ color: 0x2e2519 })
    );
    disc.position.y = -0.05;
    this.tableGroup.add(disc);

    this.resetView();
    this._updateGhost();
    this.onProgress?.(this.placed, this.total);
  }

  clearModel() {
    this.stopAutoBuild();
    if (this.beadMesh) {
      this.modelGroup.remove(this.beadMesh);
      this.beadMesh.geometry.dispose();
      this.beadMesh.material.dispose();
      this.beadMesh.dispose();
      this.beadMesh = null;
    }
    if (this.holeMesh) {
      this.modelGroup.remove(this.holeMesh);
      this.holeMesh.geometry.dispose();
      this.holeMesh.material.dispose();
      this.holeMesh.dispose();
      this.holeMesh = null;
    }
    this.beads = [];
    this.total = 0;
    this.placed = 0;
    this.animating = [];
    this.ghost.visible = false;
  }

  // ---------- 模式与进度 ----------
  setMode(mode) {
    this.mode = mode;
    this.stopAutoBuild();
    // 观察模式展示全部；逐层/逐颗从零开始拼
    this.placed = mode === 'orbit' ? this.total : 0;
    this._applyCount();
    this._updateGhost();
    this.onProgress?.(this.placed, this.total);
  }

  _applyCount() {
    if (!this.beadMesh) return;
    this.beadMesh.count = this.placed;
    this.holeMesh.count = this.placed;
  }

  setProgress(p) { // p: 0..1
    if (!this.total) return;
    this.placed = Math.round(Math.max(0, Math.min(1, p)) * this.total);
    this._applyCount();
    this._updateGhost();
    this.onProgress?.(this.placed, this.total);
  }

  // 逐层自动建造动画
  startAutoBuild() {
    this.stopAutoBuild();
    if (!this.total) return;
    if (this.placed >= this.total) this.placed = 0;
    const perFrame = Math.max(1, Math.ceil(this.total / 110));
    const step = () => {
      const before = this.placed;
      this.placed = Math.min(this.total, this.placed + perFrame);
      this._applyCount();
      this._updateGhost();
      this.onProgress?.(this.placed, this.total);
      // 新落地的豆子弹一下
      const from = Math.max(0, before - 1);
      for (let i = from; i < this.placed; i += Math.max(1, Math.floor(perFrame / 3))) {
        this.animating.push({ index: i, t0: performance.now() });
      }
      if (this.placed >= this.total) {
        this.stopAutoBuild();
        this._popSound(this.gridN);
        this.onComplete?.();
      }
    };
    this.autoBuildTimer = setInterval(step, 16);
  }

  stopAutoBuild() {
    if (this.autoBuildTimer) {
      clearInterval(this.autoBuildTimer);
      this.autoBuildTimer = null;
    }
  }

  // 逐颗模式：放置下一颗
  placeNext() {
    if (this.mode !== 'bead' || this.placed >= this.total) return false;
    const idx = this.placed;
    this.placed++;
    this._applyCount();
    this.animating.push({ index: idx, t0: performance.now() });
    this._updateGhost();
    this._popSound(this.beads[idx]?.y ?? 0);
    this.onProgress?.(this.placed, this.total);
    if (this.placed >= this.total) this.onComplete?.();
    return true;
  }

  _updateGhost() {
    if (this.mode !== 'bead' || this.placed >= this.total || !this.total) {
      this.ghost.visible = false;
      this.ghostRing.visible = false;
      return;
    }
    const b = this.beads[this.placed];
    const half = this.gridN / 2;
    this.ghost.position.set(b.x - half + 0.5, b.y + 0.5, b.z - half + 0.5);
    this.ghostRing.position.set(b.x - half + 0.5, b.y + 0.08, b.z - half + 0.5);
    this.ghost.visible = true;
    this.ghostRing.visible = true;
  }

  // ---------- 视角 ----------
  resetView() {
    // 按模型实际包围盒取景（而非整个网格），小模型也能充满画面
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;   // 立即生效，避免阻尼导致截图时还在旧位置
    if (this.total && this.bbox) {
      const { cx, cy, cz, size } = this.bbox;
      this.camera.position.set(cx + size * 0.78, cy + size * 0.66, cz + size * 1.02);
      this.controls.target.set(cx, cy, cz);
    } else {
      const n = this.gridN || 8;
      this.camera.position.set(n * 0.82, n * 0.72, n * 1.05);
      this.controls.target.set(0, n * 0.3, 0);
    }
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  setAutoSpin(on) { this.controls.autoRotate = on; }

  // 截取当前 3D 画面（同一任务内 render + toDataURL，无需 preserveDrawingBuffer）
  captureImage() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  // ---------- 音效：落豆「啪」 ----------
  _popSound(layer) {
    if (!this.soundOn) return;
    try {
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const base = 240 + Math.min(40, layer * 2.2);
      osc.frequency.setValueAtTime(base * 1.6, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.09);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } catch (e) { /* 忽略音频错误 */ }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.stopAutoBuild();
    this.clearModel();
    this._ro?.disconnect();
    this.renderer.dispose();
  }
}

// ---------- Hero 拼豆球 ----------
export function initHeroSphere(canvas, paletteHexes) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);

  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a64, 1.15));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  const N = 1500;
  const geo = new THREE.CylinderGeometry(0.075, 0.07, 0.085, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  const golden = Math.PI * (3 - Math.sqrt(5));
  const outward = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * rad, z = Math.sin(theta) * rad;
    outward.set(x, y, z);
    pos.copy(outward).multiplyScalar(1.72);
    // 豆子朝向球心外侧
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    m.compose(pos, q, one);
    mesh.setMatrixAt(i, m);
    // 颜色按纬度从色板取样
    const ci = Math.floor(((y + 1) / 2) * (paletteHexes.length - 1));
    color.setStyle(paletteHexes[ci]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // 环绕的几颗"飞豆"
  const flyers = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    f.material.color.setStyle(paletteHexes[(i * 7 + 3) % paletteHexes.length]);
    const a = (i / 14) * Math.PI * 2;
    f.position.set(Math.cos(a) * 2.5, Math.sin(a * 2) * 1.1, Math.sin(a) * 2.5);
    f.scale.setScalar(1.5);
    flyers.add(f);
  }
  scene.add(flyers);

  let mx = 0, my = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    my = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight || w;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let active = true;
  const setActive = (on) => { active = on; };

  const loop = (t) => {
    requestAnimationFrame(loop);
    if (!active || document.hidden) return; // 不可见时暂停，省电
    const time = (t || 0) / 1000;
    mesh.rotation.y = time * 0.18 + mx * 0.35;
    mesh.rotation.x = -my * 0.22 + Math.sin(time * 0.5) * 0.05;
    flyers.rotation.y = -time * 0.1;
    flyers.children.forEach((f, i) => {
      f.position.y = Math.sin(time * 0.8 + i) * 1.2;
    });
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);

  return { setActive, dispose: () => {
    window.removeEventListener('pointermove', onMove);
    ro.disconnect();
    renderer.dispose();
  } };
}
