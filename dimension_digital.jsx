import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';

// ---------- CONSTANTS ----------
const COLORS = ['coral', 'amber', 'pine', 'iris', 'pearl'];

const COLOR_GRADIENTS = {
  coral: { light: '#FECDD3', base: '#F43F5E', dark: '#881337', hex: 0xF43F5E },
  amber: { light: '#FDE68A', base: '#F59E0B', dark: '#78350F', hex: 0xF59E0B },
  pine:  { light: '#6EE7B7', base: '#047857', dark: '#064E3B', hex: 0x047857 },
  iris:  { light: '#C4B5FD', base: '#7C3AED', dark: '#4C1D95', hex: 0x7C3AED },
  pearl: { light: '#FAFAF9', base: '#D6D3D1', dark: '#78716C', hex: 0xD6D3D1 }
};

const TASK_TYPES = ['TOUCH', 'NO_TOUCH', 'EXACT'];

// Default settings (overridable in menu, persisted via window.storage)
const DEFAULT_SETTINGS = {
  mode: 'classic',  // 'classic' = fixed cards, 'escalation' = cards grow each round
  numTasks: 6,      // cards per round in classic mode (3-8)
  roundTime: 60,    // seconds per round (15-180, step 15)
  totalRounds: 6    // rounds per game (1-10)
};

// Compute card count for a given round based on mode
const cardsForRound = (settings, round) => {
  if (settings.mode === 'escalation') return Math.min(15, 5 + round);
  return settings.numTasks;
};

// ---------- 3D GEOMETRY ----------
const HCP = Math.sqrt(2 / 3);

const SUPPORTS = { 7: [0, 1, 2], 8: [0, 3, 4], 9: [0, 5, 6], 10: [7, 8, 9] };

const POSITIONS_3D = (() => {
  const p = {};
  p[0] = [0, 0, 0];
  for (let i = 1; i <= 6; i++) {
    const a = ((i - 1) / 6) * Math.PI * 2;
    p[i] = [Math.cos(a), 0, Math.sin(a)];
  }
  for (const id of [7, 8, 9]) {
    const sup = SUPPORTS[id].map(s => p[s]);
    const cx = sup.reduce((a, q) => a + q[0], 0) / 3;
    const cz = sup.reduce((a, q) => a + q[2], 0) / 3;
    p[id] = [cx, HCP, cz];
  }
  const sup = SUPPORTS[10].map(s => p[s]);
  const cx = sup.reduce((a, q) => a + q[0], 0) / 3;
  const cz = sup.reduce((a, q) => a + q[2], 0) / 3;
  p[10] = [cx, 2 * HCP, cz];
  return p;
})();

const SLOT_LAYER = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0, 7:1,8:1,9:1, 10:2 };

const ADJACENCIES = {
  0: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  1: [0, 2, 6, 7],
  2: [0, 1, 3, 7],
  3: [0, 2, 4, 8],
  4: [0, 3, 5, 8],
  5: [0, 4, 6, 9],
  6: [0, 1, 5, 9],
  7: [0, 1, 2, 8, 9, 10],
  8: [0, 3, 4, 7, 9, 10],
  9: [0, 5, 6, 7, 8, 10],
  10: [7, 8, 9]
};

// ---------- GAME RULES (pure) ----------
function checkPlacementRules(id, b) {
  if (b[id] !== null) return false;
  if (id === 10) return b[7] !== null && b[8] !== null && b[9] !== null;
  if (id === 7)  return b[0] !== null && b[1] !== null && b[2] !== null;
  if (id === 8)  return b[0] !== null && b[3] !== null && b[4] !== null;
  if (id === 9)  return b[0] !== null && b[5] !== null && b[6] !== null;
  return true;
}

function checkRemovalRules(id, b) {
  if (b[id] === null) return false;
  if (id === 10) return true;
  if ([7, 8, 9].includes(id)) return b[10] === null;
  if (id === 0) return b[7] === null && b[8] === null && b[9] === null;
  if (id === 1 || id === 2) return b[7] === null;
  if (id === 3 || id === 4) return b[8] === null;
  if (id === 5 || id === 6) return b[9] === null;
  return true;
}

function showEmptySlot(id, b) {
  if (b[id] !== null) return false;
  if (SLOT_LAYER[id] === 0) return true;
  return checkPlacementRules(id, b);
}

// Evaluate a single task against current board state. Returns true if the task
// is currently satisfied. Used both for live indicators and end-of-round scoring.
function evaluateTask(task, board) {
  const placed = board.filter(s => s !== null);
  if (task.type === 'EXACT') {
    return placed.filter(c => c === task.c).length === task.n;
  }
  if (task.type === 'TOUCH') {
    const c1 = placed.filter(c => c === task.c1).length;
    const c2 = placed.filter(c => c === task.c2).length;
    if (c1 === 0 && c2 === 0) return true;
    if (c1 === 0 || c2 === 0) return false;
    for (let i = 0; i < 11; i++) {
      if (board[i] === task.c1) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (!adj.includes(task.c2)) return false;
      }
      if (board[i] === task.c2) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (!adj.includes(task.c1)) return false;
      }
    }
    return true;
  }
  if (task.type === 'NO_TOUCH') {
    const c1 = placed.filter(c => c === task.c1).length;
    const c2 = placed.filter(c => c === task.c2).length;
    if (c1 === 0 || c2 === 0) return true;
    for (let i = 0; i < 11; i++) {
      if (board[i] === task.c1) {
        const adj = ADJACENCIES[i].map(j => board[j]);
        if (adj.includes(task.c2)) return false;
      }
    }
    return true;
  }
  return false;
}

// Returns 'live-pass' | 'live-fail' | null. Null means the task hasn't been
// engaged yet (no relevant colors placed) — show neutral state.
function liveTaskStatus(task, board) {
  if (task.type === 'EXACT') {
    if (!board.some(c => c === task.c)) return null;
  } else {
    if (!board.some(c => c === task.c1 || c === task.c2)) return null;
  }
  return evaluateTask(task, board) ? 'live-pass' : 'live-fail';
}

// Generates a set of `count` task cards with no contradictions and no color overload.
// Contradiction rules enforced:
//   1. Same color cannot have multiple EXACT cards (e.g., EXACT(red,1) + EXACT(red,2))
//   2. Same color pair cannot have both TOUCH and NO_TOUCH (in any order)
//   3. Same color pair cannot have two TOUCH or two NO_TOUCH cards
//   4. No color may appear in more than COLOR_MENTION_CAP cards total —
//      prevents visually-conflicting card sets like "red touches blue, red doesn't
//      touch green, red exactly 2, red touches orange" piling up on one color.
// Generates `count` unique tasks. Builds the full pool, shuffles, then picks
// while respecting a per-color mention cap that scales with count so high
// counts (escalation mode) still fill. Always returns exactly min(count, 15).
const generateTasks = (count = 6) => {
  // Build full pool of unique tasks (5 EXACT + 10 TOUCH/NO_TOUCH = 15 max)
  const pool = [];
  for (const c of COLORS) {
    pool.push({ type: 'EXACT', c, n: 1 + Math.floor(Math.random() * 2) });
  }
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      const type = Math.random() < 0.5 ? 'TOUCH' : 'NO_TOUCH';
      pool.push({ type, c1: COLORS[i], c2: COLORS[j] });
    }
  }
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Per-color mention cap — grows with count to stay solvable
  const cap = Math.max(3, Math.ceil((count * 2) / COLORS.length));
  const mentions = Object.fromEntries(COLORS.map(c => [c, 0]));
  const picked = [];
  for (const task of pool) {
    if (picked.length >= count) break;
    const colors = task.type === 'EXACT' ? [task.c] : [task.c1, task.c2];
    if (colors.some(c => mentions[c] >= cap)) continue;
    picked.push(task);
    colors.forEach(c => mentions[c]++);
  }
  // Fallback: if cap was too tight, fill remaining slots without the cap
  if (picked.length < count) {
    for (const task of pool) {
      if (picked.length >= Math.min(count, pool.length)) break;
      if (!picked.includes(task)) picked.push(task);
    }
  }
  return picked;
};

const TaskCard = ({ task, status }) => {
  const sphere = (c, size = 'md') => {
    const sz = size === 'lg' ? 'w-6 h-6 lg:w-7 lg:h-7' : 'w-5 h-5 lg:w-6 lg:h-6';
    return (
      <div className={`${sz} rounded-full shadow-md shrink-0`}
           style={{ background: `radial-gradient(circle at 30% 30%, ${COLOR_GRADIENTS[c].light}, ${COLOR_GRADIENTS[c].base}, ${COLOR_GRADIENTS[c].dark})` }} />
    );
  };

  const renderIcon = () => {
    if (task.type === 'EXACT') {
      return (
        <div className="flex items-center justify-center h-full gap-1.5">
          {sphere(task.c, 'lg')}
          <span className="font-bold text-sm lg:text-base leading-none text-slate-800 tabular-nums">= {task.n}</span>
        </div>
      );
    }
    const op = task.type === 'TOUCH'
      ? <div className="w-2.5 h-1 bg-emerald-500 rounded-full shrink-0" />
      : (
        <div className="relative w-3 h-3 flex items-center justify-center shrink-0">
          <div className="absolute w-4 h-0.5 bg-rose-500 rotate-45" />
          <div className="absolute w-4 h-0.5 bg-rose-500 -rotate-45" />
        </div>
      );
    return (
      <div className="flex items-center justify-center h-full gap-1.5">
        {sphere(task.c1)}
        {op}
        {sphere(task.c2)}
      </div>
    );
  };

  let cls = "border-slate-300 bg-white";
  if (status === 'pass') cls = "border-emerald-500 bg-emerald-50";
  if (status === 'fail') cls = "border-rose-500 bg-rose-50";
  return (
    <div className={`relative px-1.5 py-1 rounded-lg border-2 shadow-sm h-14 lg:h-16 flex flex-col items-center justify-center transition-colors ${cls}`}>
      {renderIcon()}
      {status === 'fail' && <span className="text-rose-600 font-bold mt-0.5 text-xs">−2</span>}

      {/* Live status indicators (during active play) */}
      {status === 'live-pass' && (
        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow flex items-center justify-center text-white text-[8px] font-bold leading-none">
          ✓
        </div>
      )}
      {status === 'live-fail' && (
        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow flex items-center justify-center text-white text-[10px] font-bold leading-none">
          !
        </div>
      )}
    </div>
  );
};

const SettingRow = ({ label, value, suffix = '', min, max, step = 1, onChange }) => {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={dec}
          disabled={value <= min}
          style={{ touchAction: 'manipulation' }}
          className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-lg leading-none disabled:opacity-30 active:scale-95 transition-transform">
          −
        </button>
        <span className="font-bold text-slate-900 w-14 text-center tabular-nums">{value}{suffix}</span>
        <button
          onClick={inc}
          disabled={value >= max}
          style={{ touchAction: 'manipulation' }}
          className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-lg leading-none disabled:opacity-30 active:scale-95 transition-transform">
          +
        </button>
      </div>
    </div>
  );
};

const ModeToggle = ({ value, onChange, options }) => (
  <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
    <span className="text-sm font-semibold text-slate-700">Mode</span>
    <div className="flex gap-0.5 bg-slate-200 rounded-lg p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{ touchAction: 'manipulation' }}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            value === opt.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// ---------- 3D BOARD ----------
function Board3D({ board, selectedColor, gameState, onSlotClick, lastPlaced }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { board, selectedColor, gameState, onSlotClick, lastPlaced };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let w = mount.clientWidth || 400;
    let h = mount.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    mount.appendChild(renderer.domElement);

    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const scene = new THREE.Scene();

    // Camera — locked elevation, draggable azimuth
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    let azimuth = Math.PI / 5;
    const elevation = 28 * Math.PI / 180;
    const camDist = 5.6;
    const lookTarget = new THREE.Vector3(0, 0.55, 0);

    function updateCamera() {
      const r = camDist * Math.cos(elevation);
      camera.position.x = Math.sin(azimuth) * r;
      camera.position.y = camDist * Math.sin(elevation) + lookTarget.y;
      camera.position.z = Math.cos(azimuth) * r;
      camera.lookAt(lookTarget);
    }
    updateCamera();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(3, 6, 2.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.35);
    fillLight.position.set(-3, 2, -3);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffd4a3, 0.2);
    rimLight.position.set(0, 1, -4);
    scene.add(rimLight);

    // Ground (catches shadow)
    const groundGeo = new THREE.CircleGeometry(3.2, 48);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Hex outline showing footprint
    const hexPts = [];
    for (let i = 0; i <= 6; i++) {
      const a = ((i % 6) / 6) * Math.PI * 2;
      hexPts.push(new THREE.Vector3(Math.cos(a) * 1.35, -0.499, Math.sin(a) * 1.35));
    }
    const hexGeo = new THREE.BufferGeometry().setFromPoints(hexPts);
    const hexMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 });
    scene.add(new THREE.Line(hexGeo, hexMat));

    // Per-slot meshes
    const sphereGeo = new THREE.SphereGeometry(0.5, 32, 24);
    const sphereMeshes = {};
    const ghostMeshes = {};
    const slotMaterials = {};

    for (let id = 0; id <= 10; id++) {
      const pos = POSITIONS_3D[id];

      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.12
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.userData = { slotId: id, kind: 'sphere', placedAt: 0 };
      scene.add(mesh);
      sphereMeshes[id] = mesh;
      slotMaterials[id] = mat;

      const ghostMat = new THREE.MeshBasicMaterial({
        color: 0x94a3b8,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      });
      const ghost = new THREE.Mesh(sphereGeo, ghostMat);
      ghost.position.set(pos[0], pos[1], pos[2]);
      ghost.scale.setScalar(0.92);
      ghost.userData = { slotId: id, kind: 'ghost', isValidTarget: false };
      ghost.visible = false;
      ghost.renderOrder = 1;
      scene.add(ghost);
      ghostMeshes[id] = ghost;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    // Pointer state — tap vs drag
    let activePointerId = null;
    let dragMoved = false;
    let downX = 0, downY = 0, lastX = 0;
    const DRAG_THRESHOLD = 6;

    function onPointerDown(e) {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      dragMoved = false;
      downX = e.clientX; downY = e.clientY; lastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (e.pointerId !== activePointerId) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragMoved = true;
      if (dragMoved) {
        azimuth -= (e.clientX - lastX) * 0.008;
        updateCamera();
      }
      lastX = e.clientX;
    }

    function onPointerUp(e) {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

      if (!dragMoved) {
        const rect = canvas.getBoundingClientRect();
        pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(pointer, camera);

        const targets = [
          ...Object.values(sphereMeshes).filter(m => m.visible),
          ...Object.values(ghostMeshes).filter(m => m.visible)
        ];
        const hits = raycaster.intersectObjects(targets);
        if (hits.length > 0) {
          const slotId = hits[0].object.userData.slotId;
          if (propsRef.current.onSlotClick) propsRef.current.onSlotClick(slotId);
        }
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

    function onResize() {
      const newW = mount.clientWidth;
      const newH = mount.clientHeight;
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      }
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    function placementScale(elapsed) {
      const t = elapsed / 0.5;
      if (t >= 1) return 1;
      if (t < 0.35) return 0.4 + (1.3 - 0.4) * (t / 0.35);
      if (t < 0.65) return 1.3 + (0.92 - 1.3) * ((t - 0.35) / 0.30);
      if (t < 0.85) return 0.92 + (1.05 - 0.92) * ((t - 0.65) / 0.20);
      return 1.05 + (1.0 - 1.05) * ((t - 0.85) / 0.15);
    }

    let rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);
      const now = Date.now();

      Object.values(sphereMeshes).forEach(m => {
        if (m.visible && m.userData.placedAt) {
          const elapsed = (now - m.userData.placedAt) / 1000;
          if (elapsed < 0.5) {
            m.scale.setScalar(placementScale(elapsed));
          } else if (m.scale.x !== 1) {
            m.scale.setScalar(1);
          }
        }
      });

      const t = (now % 1400) / 1400;
      const pulseO = 0.4 + 0.25 * Math.sin(t * Math.PI * 2);
      const pulseS = 0.95 + 0.05 * Math.sin(t * Math.PI * 2);
      Object.values(ghostMeshes).forEach(g => {
        if (g.userData.isValidTarget) {
          g.material.opacity = pulseO;
          g.scale.setScalar(pulseS);
        }
      });

      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = {
      scene, camera, renderer, sphereMeshes, ghostMeshes, slotMaterials,
      lastSeen: { lastPlaced: null }
    };

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      try { mount.removeChild(canvas); } catch (_) {}
      sphereGeo.dispose();
      hexGeo.dispose();
      groundGeo.dispose();
      hexMat.dispose();
      groundMat.dispose();
      Object.values(slotMaterials).forEach(m => m.dispose());
      Object.values(ghostMeshes).forEach(g => g.material.dispose());
      renderer.dispose();
    };
  }, []);

  // Sync scene to props
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    if (lastPlaced !== null && lastPlaced !== s.lastSeen.lastPlaced) {
      const m = s.sphereMeshes[lastPlaced];
      if (m) {
        m.userData.placedAt = Date.now();
        m.scale.setScalar(0.4);
      }
    }
    s.lastSeen.lastPlaced = lastPlaced;

    for (let id = 0; id <= 10; id++) {
      const color = board[id];
      const sphereMesh = s.sphereMeshes[id];
      const ghostMesh = s.ghostMeshes[id];

      if (color) {
        sphereMesh.visible = true;
        s.slotMaterials[id].color.setHex(COLOR_GRADIENTS[color].hex);
        ghostMesh.visible = false;
      } else {
        sphereMesh.visible = false;
        const visible = showEmptySlot(id, board);
        ghostMesh.visible = visible;
        if (visible) {
          const isValid = selectedColor && checkPlacementRules(id, board);
          ghostMesh.userData.isValidTarget = isValid;
          if (isValid) {
            ghostMesh.material.color.setHex(COLOR_GRADIENTS[selectedColor].hex);
          } else {
            ghostMesh.material.color.setHex(0x94a3b8);
            ghostMesh.material.opacity = selectedColor ? 0.08 : 0.2;
            ghostMesh.scale.setScalar(0.92);
          }
        }
      }
    }
  }, [board, selectedColor, gameState, lastPlaced]);

  return (
    <div ref={mountRef}
         className="w-full h-full"
         style={{ minHeight: '300px', touchAction: 'none' }} />
  );
}

// ---------- MAIN APP ----------
export default function App() {
  const [gameState, setGameState] = useState('menu');
  const [round, setRound] = useState(1);
  const [totalScore, setTotalScore] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState(DEFAULT_SETTINGS.roundTime);
  const [tasks, setTasks] = useState([]);
  const [board, setBoard] = useState(Array(11).fill(null));
  const [inventory, setInventory] = useState({ coral: 3, amber: 3, pine: 3, iris: 3, pearl: 3 });
  const [selectedColor, setSelectedColor] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [lastPlaced, setLastPlaced] = useState(null);

  // Load settings from persistent storage on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try {
        const result = await window.storage.get('settings');
        if (result && result.value) {
          const stored = JSON.parse(result.value);
          // Validate / clamp loaded values to safe ranges
          const clamp = (v, lo, hi, fb) => (typeof v === 'number' && v >= lo && v <= hi) ? v : fb;
          const validMode = (v) => (v === 'classic' || v === 'escalation') ? v : DEFAULT_SETTINGS.mode;
          setSettings({
            mode:        validMode(stored.mode),
            numTasks:    clamp(stored.numTasks,    3, 8,   DEFAULT_SETTINGS.numTasks),
            roundTime:   clamp(stored.roundTime,   15, 180, DEFAULT_SETTINGS.roundTime),
            totalRounds: clamp(stored.totalRounds, 1, 10,  DEFAULT_SETTINGS.totalRounds)
          });
        }
      } catch (e) {
        // No saved settings — keep defaults
      }
    })();
  }, []);

  // Persist setting changes
  const updateSetting = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (typeof window !== 'undefined' && window.storage) {
      window.storage.set('settings', JSON.stringify(next)).catch(() => {});
    }
  };

  // Lock the page viewport — but skip canvas (Board3D handles its own touches)
  useEffect(() => {
    const block = (e) => {
      if (e.target.closest('[data-allow-scroll]')) return;
      if (e.target.tagName === 'CANVAS') return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.removeEventListener('touchmove', block);
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (timer === 0) { endRound(); return; }
    const t = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timer]);

  const startRound = (forRound = round) => {
    setTasks(generateTasks(cardsForRound(settings, forRound)));
    setBoard(Array(11).fill(null));
    setInventory({ coral: 3, amber: 3, pine: 3, iris: 3, pearl: 3 });
    setSelectedColor(null);
    setTimer(settings.roundTime);
    setRoundResult(null);
    setLastPlaced(null);
    setGameState('playing');
  };

  const triggerPlaceFx = (id) => {
    setLastPlaced(id);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    setTimeout(() => setLastPlaced(null), 600);
  };

  const handleSlotClick = useCallback((id) => {
    if (gameState !== 'playing') return;
    if (board[id] !== null) {
      if (checkRemovalRules(id, board)) {
        const color = board[id];
        const nb = [...board]; nb[id] = null;
        setBoard(nb);
        setInventory(p => ({ ...p, [color]: p[color] + 1 }));
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
      }
    } else if (selectedColor && inventory[selectedColor] > 0) {
      if (checkPlacementRules(id, board)) {
        const nb = [...board]; nb[id] = selectedColor;
        setBoard(nb);
        setInventory(p => ({ ...p, [selectedColor]: p[selectedColor] - 1 }));
        triggerPlaceFx(id);
      }
    }
  }, [gameState, board, selectedColor, inventory]);

  const endRound = () => {
    let score = 0;
    const placed = board.filter(s => s !== null);
    score += placed.length;
    const allColors = new Set(placed).size === 5;
    if (allColors) score += 3;

    const evaluated = tasks.map(task => {
      const passed = evaluateTask(task, board);
      if (!passed) score -= 2;
      return { ...task, passed };
    });

    setRoundResult({
      spheres: placed.length,
      colorBonus: allColors ? 3 : 0,
      tasks: evaluated,
      total: score
    });
    setTotalScore(p => p + score);
    setGameState(round >= settings.totalRounds ? 'game_over' : 'round_over');
  };

  const nextRound = () => { const next = round + 1; setRound(next); startRound(next); };
  const restartGame = () => { setTotalScore(0); setRound(1); startRound(1); };

  if (gameState === 'menu') {
    return (
      <div className="bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center p-4 fixed inset-0 overflow-hidden"
           style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
        <h1 className="text-4xl font-bold text-slate-800 mb-2 tracking-tight">Capstone</h1>
        <p className="text-slate-500 mb-6 text-sm">Stack. Score. Survive six rounds.</p>
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
          <p className="text-slate-600 mb-3 text-center leading-relaxed">
            Select a color, tap a slot to place a sphere. Build the pyramid to hit your task cards. Failed tasks cost you 2 points each.
          </p>
          <p className="text-slate-500 mb-4 text-center text-sm leading-relaxed">
            Drag the board to rotate the view in 3D.
          </p>

          <div className="border-t border-slate-200 pt-4 mb-5 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Game Settings</h3>
            <ModeToggle
              value={settings.mode}
              onChange={(v) => updateSetting('mode', v)}
              options={[
                { value: 'classic', label: 'Classic' },
                { value: 'escalation', label: 'Escalation' }
              ]} />
            {settings.mode === 'escalation' ? (
              <p className="text-xs text-slate-500 px-3 py-1 leading-relaxed">
                Cards grow each round: R1: 6, R2: 7, R3: 8… (max 15)
              </p>
            ) : (
              <SettingRow
                label="Cards per round"
                value={settings.numTasks}
                min={3} max={8}
                onChange={(v) => updateSetting('numTasks', v)} />
            )}
            <SettingRow
              label="Round time"
              value={settings.roundTime} suffix="s"
              min={15} max={180} step={15}
              onChange={(v) => updateSetting('roundTime', v)} />
            <SettingRow
              label="Total rounds"
              value={settings.totalRounds}
              min={1} max={10}
              onChange={(v) => updateSetting('totalRounds', v)} />
          </div>

          <button onClick={startRound}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col max-w-6xl mx-auto fixed inset-0 overflow-hidden"
         style={{ overscrollBehavior: 'none' }}>
      <header className="flex justify-between items-center bg-white px-3 py-2 lg:p-3 shadow-sm border-b lg:border lg:rounded-xl border-slate-200 lg:m-3 lg:mb-2">
        <div className="flex flex-col">
          <span className="text-[10px] lg:text-xs text-slate-500 font-semibold uppercase tracking-wider">Round {round} / {settings.totalRounds}</span>
          <span className="text-base lg:text-xl font-bold text-slate-800">Score: {totalScore}</span>
        </div>
        {gameState === 'playing' && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] lg:text-xs text-slate-500 font-semibold uppercase tracking-wider">Time</span>
            <span className={`text-xl lg:text-2xl font-mono font-bold tabular-nums ${timer <= 10 ? 'text-rose-500' : 'text-slate-800'}`}>
              0:{timer.toString().padStart(2, '0')}
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-4 p-2 lg:p-3 lg:pt-1 min-h-0">
        {/* Tasks */}
        <div className="lg:w-1/4 flex flex-col gap-1 lg:gap-2 order-1 min-h-0">
          <h2 className="hidden lg:block text-sm font-bold text-slate-600 uppercase tracking-wider">Tasks</h2>
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5 lg:gap-2 max-h-[34vh] lg:max-h-none overflow-y-auto" data-allow-scroll>
            {tasks.map((task, i) => {
              let cardStatus = null;
              if (roundResult) {
                cardStatus = roundResult.tasks[i].passed ? 'pass' : 'fail';
              } else if (gameState === 'playing') {
                cardStatus = liveTaskStatus(task, board);
              }
              return <TaskCard key={i} task={task} status={cardStatus} />;
            })}
          </div>
        </div>

        <div className="lg:w-2/4 bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden order-2 flex-1 min-h-0 relative">
          <Board3D
            board={board}
            selectedColor={selectedColor}
            gameState={gameState}
            onSlotClick={handleSlotClick}
            lastPlaced={lastPlaced}
          />
          {gameState === 'playing' && !selectedColor && board.every(s => s === null) && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/85 text-white text-xs font-semibold px-3 py-1.5 rounded-full pointer-events-none">
              Pick a color, then tap a slot
            </div>
          )}
          <div className="absolute top-2 right-2 bg-white/80 backdrop-blur text-[10px] text-slate-600 font-semibold px-2 py-1 rounded-full pointer-events-none">
            Drag to rotate
          </div>
        </div>

        <div className="lg:w-1/4 flex flex-col gap-2 lg:gap-4 order-3 min-h-0" data-allow-scroll style={{ overflowY: 'auto' }}>
          {gameState === 'playing' && (
            <div className="bg-white p-2 lg:p-4 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="hidden lg:block text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Inventory</h2>
              <div className="grid grid-cols-6 lg:grid-cols-3 gap-1.5 lg:gap-2">
                {COLORS.map(color => {
                  const sel = selectedColor === color;
                  const out = inventory[color] === 0;
                  return (
                    <button
                      key={color}
                      onClick={() => !out && setSelectedColor(color)}
                      disabled={out}
                      style={{ touchAction: 'manipulation' }}
                      className={`flex flex-col items-center justify-center p-1.5 lg:p-2 rounded-xl border-2 transition-all active:scale-95 ${
                        sel ? 'border-slate-900 bg-slate-50 shadow-md scale-105' :
                        out ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed' :
                              'border-slate-200 bg-white hover:border-slate-400'
                      }`}>
                      <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-full shadow-md mb-0.5 lg:mb-1"
                        style={{ background: `radial-gradient(circle at 30% 30%, ${COLOR_GRADIENTS[color].light}, ${COLOR_GRADIENTS[color].base}, ${COLOR_GRADIENTS[color].dark})` }} />
                      <span className="font-bold text-slate-700 text-xs lg:text-sm tabular-nums leading-none">{inventory[color]}</span>
                    </button>
                  );
                })}
                <button
                  onClick={endRound}
                  style={{ touchAction: 'manipulation' }}
                  className="flex flex-col items-center justify-center p-1.5 lg:p-2 rounded-xl border-2 border-slate-900 bg-slate-900 text-white active:scale-95 transition-all">
                  <span className="text-[10px] lg:text-xs font-bold uppercase tracking-wide leading-tight text-center">Finish<br/>Round</span>
                </button>
              </div>
              <p className="hidden lg:block text-xs text-slate-500 mt-3 leading-relaxed">
                Tap a color, then tap a slot. Tap a placed sphere to remove it (if nothing is on top). Drag the board to rotate.
              </p>
            </div>
          )}

          {(gameState === 'round_over' || gameState === 'game_over') && roundResult && (
            <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-md border border-slate-200 border-t-4 border-t-slate-900">
              <h2 className="text-lg lg:text-xl font-bold text-slate-800 mb-3">Round {round} Results</h2>
              <ul className="space-y-2 mb-4 text-slate-700 text-sm lg:text-base">
                <li className="flex justify-between">
                  <span>Spheres ({roundResult.spheres})</span>
                  <span className="font-bold tabular-nums">+{roundResult.spheres}</span>
                </li>
                {roundResult.colorBonus > 0 && (
                  <li className="flex justify-between text-emerald-600">
                    <span>All 5 colors bonus</span>
                    <span className="font-bold tabular-nums">+3</span>
                  </li>
                )}
                {roundResult.tasks.map((task, i) => !task.passed && (
                  <li key={i} className="flex justify-between text-rose-600 text-sm">
                    <span>Failed task {i + 1}</span>
                    <span className="font-bold tabular-nums">−2</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-2 text-base lg:text-lg font-bold">
                  <span>Round total</span>
                  <span className="tabular-nums">{roundResult.total}</span>
                </li>
              </ul>
              {gameState === 'round_over' ? (
                <button onClick={nextRound}
                  style={{ touchAction: 'manipulation' }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
                  Next Round
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-100 p-3 rounded-xl text-center">
                    <span className="block text-xs text-slate-500 font-bold uppercase tracking-wide">Final</span>
                    <span className="block text-4xl font-bold text-slate-900 tabular-nums">{totalScore}</span>
                  </div>
                  <button onClick={restartGame}
                    style={{ touchAction: 'manipulation' }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors active:scale-[0.98]">
                    Play Again
                  </button>
                  <button onClick={() => { setRound(1); setTotalScore(0); setGameState('menu'); }}
                    style={{ touchAction: 'manipulation' }}
                    className="w-full bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl border border-slate-300 transition-colors active:scale-[0.98]">
                    Back to Menu
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
