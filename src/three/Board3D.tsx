import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { COLOR_GRADIENTS } from '../constants/colors';
import { NUM_SLOTS, POSITIONS_3D } from '../constants/geometry';
import { checkPlacementRules, showEmptySlot } from '../game/rules';
import type { Board, Color, GameState } from '../types';

export type Board3DProps = {
  board: Board;
  selectedColor: Color | null;
  gameState: GameState;
  onSlotClick: (id: number) => void;
  lastPlaced: number | null;
};

type SceneRefs = {
  sphereMeshes: Record<number, THREE.Mesh>;
  ghostMeshes: Record<number, THREE.Mesh>;
  slotMaterials: Record<number, THREE.MeshStandardMaterial>;
  lastSeen: { lastPlaced: number | null };
};

const DRAG_THRESHOLD = 6;
const PLACEMENT_ANIM_SECONDS = 0.5;

function placementScale(elapsed: number): number {
  const t = elapsed / PLACEMENT_ANIM_SECONDS;
  if (t >= 1) return 1;
  if (t < 0.35) return 0.4 + (1.3 - 0.4) * (t / 0.35);
  if (t < 0.65) return 1.3 + (0.92 - 1.3) * ((t - 0.35) / 0.30);
  if (t < 0.85) return 0.92 + (1.05 - 0.92) * ((t - 0.65) / 0.20);
  return 1.05 + (1.0 - 1.05) * ((t - 0.85) / 0.15);
}

// Procedural walnut-grain texture. Horizontal wavy grain bands on a warm
// walnut base, plus fine per-pixel noise for the close-up texture. Generated
// in a hidden canvas and wrapped as a THREE.CanvasTexture — no asset files.
function createWoodTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#3a2817';
  ctx.fillRect(0, 0, W, H);

  // Wavy grain lines
  const numGrains = 34;
  for (let i = 0; i < numGrains; i++) {
    const cy = (i + 0.5) * (H / numGrains) + (Math.random() - 0.5) * 5;
    const thickness = 1 + Math.random() * 2.5;
    const darkness = 0.12 + Math.random() * 0.25;
    ctx.strokeStyle = `rgba(18, 11, 4, ${darkness})`;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    const freq = 0.003 + Math.random() * 0.005;
    const phase = Math.random() * Math.PI * 2;
    const amp = 2 + Math.random() * 5;
    ctx.moveTo(0, cy);
    for (let x = 0; x <= W; x += 4) {
      ctx.lineTo(x, cy + Math.sin(x * freq + phase) * amp);
    }
    ctx.stroke();
  }

  // Fine per-pixel noise — slight warm variation
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    data[i]     = Math.max(0, Math.min(255, data[i]     + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n * 0.8));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n * 0.55));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Board3D(props: Board3DProps) {
  const { board, selectedColor, lastPlaced } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);

  // propsRef lets the RAF loop + event handlers read latest props without
  // forcing scene teardown/setup. This is intentional — do not replace with
  // effect deps that rebuild the scene.
  const propsRef = useRef<Board3DProps>(props);
  propsRef.current = props;

  // Bridge imperative zoom + reset-view control out of the scene-creation
  // closure so the on-canvas buttons (rendered outside useEffect) can drive
  // them without rebuilding the scene.
  const applyZoomRef = useRef<(nextZoom: number) => void>(() => {});
  const resetViewRef = useRef<() => void>(() => {});
  const zoomRef = useRef(1);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 400;
    const h = mount.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const scene = new THREE.Scene();

    // Camera — locked elevation, draggable azimuth. camDist scales with aspect
    // so portrait/narrow canvases (mobile, tall sidebars) don't clip the board:
    // PerspectiveCamera's FOV is vertical, so horizontal extent = vertical * aspect.
    // When aspect < 1 we pull the camera back to keep the full pyramid visible.
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    // Start the board head-on (flat hex edge facing the camera) — cleaner
    // first impression than the rotated default. User can still drag to rotate.
    let azimuth = 0;
    const elevation = 28 * Math.PI / 180;
    const BASE_CAM_DIST = 6.8;
    const computeCamDist = (aspect: number) =>
      aspect < 1 ? BASE_CAM_DIST / aspect : BASE_CAM_DIST;
    // User-controlled zoom multiplier (applied on top of aspect-based distance).
    // 1.0 = default. <1.0 = zoomed in (camera closer). >1.0 = zoomed out.
    // Clamped so the pyramid is always visible and never crosses the camera.
    const ZOOM_MIN = 0.55;
    const ZOOM_MAX = 1.8;
    let zoom = 1;
    let camDist = computeCamDist(w / h) * zoom;
    const lookTarget = new THREE.Vector3(0, 0.55, 0);

    const updateCamera = () => {
      const r = camDist * Math.cos(elevation);
      camera.position.x = Math.sin(azimuth) * r;
      camera.position.y = camDist * Math.sin(elevation) + lookTarget.y;
      camera.position.z = Math.cos(azimuth) * r;
      camera.lookAt(lookTarget);
    };
    updateCamera();

    const applyZoom = (nextZoom: number) => {
      zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
      zoomRef.current = zoom;
      camDist = computeCamDist(camera.aspect) * zoom;
      updateCamera();
    };
    // Reset azimuth + zoom back to the defaults used when the scene was
    // first built. Camera snaps; not worth tweening for a single action.
    const INITIAL_AZIMUTH = 0;
    const resetView = () => {
      azimuth = INITIAL_AZIMUTH;
      zoom = 1;
      zoomRef.current = 1;
      camDist = computeCamDist(camera.aspect);
      updateCamera();
    };
    applyZoomRef.current = applyZoom;
    resetViewRef.current = resetView;
    zoomRef.current = zoom;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
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
    ground.position.y = -0.62; // below the play board so overflow shadows still land
    ground.receiveShadow = true;
    scene.add(ground);

    // Hex play board — dark walnut hex with ball slot markers for the 7 base
    // positions. Sits with its top flush at y=-0.5 so balls rest on it.
    const BOARD_RADIUS = 1.58;
    const BOARD_DEPTH = 0.12;
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * BOARD_RADIUS;
      const y = Math.sin(a) * BOARD_RADIUS;
      if (i === 0) hexShape.moveTo(x, y);
      else hexShape.lineTo(x, y);
    }
    hexShape.closePath();
    const boardGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: BOARD_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: 8,
    });
    const woodTex = createWoodTexture();
    const boardMat = new THREE.MeshStandardMaterial({
      map: woodTex,        // procedural walnut grain
      roughness: 0.72,
      metalness: 0.05,
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    // Rotate so the shape cap (normals -Z originally) faces +Y, then translate
    // so the board top (= shape cap) sits at y = -0.5.
    board.rotation.x = Math.PI / 2;
    board.position.y = -0.5;
    board.castShadow = true;
    board.receiveShadow = true;
    scene.add(board);

    // Slot insets — thin darker disks at each base position. Hidden under a
    // placed ball, visible (as sunken markers) when the slot is empty.
    const slotInsetGeo = new THREE.CircleGeometry(0.42, 32);
    const slotInsetMat = new THREE.MeshStandardMaterial({
      color: 0x1a0f06,
      roughness: 0.9,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const id of [0, 1, 2, 3, 4, 5, 6]) {
      const pos = POSITIONS_3D[id];
      const slot = new THREE.Mesh(slotInsetGeo, slotInsetMat);
      slot.rotation.x = -Math.PI / 2;
      slot.position.set(pos[0], -0.5 + 0.001, pos[2]);
      slot.receiveShadow = true;
      scene.add(slot);
    }

    // Per-slot meshes
    const sphereGeo = new THREE.SphereGeometry(0.5, 64, 48);
    const sphereMeshes: Record<number, THREE.Mesh> = {};
    const ghostMeshes: Record<number, THREE.Mesh> = {};
    const slotMaterials: Record<number, THREE.MeshStandardMaterial> = {};

    for (let id = 0; id < NUM_SLOTS; id++) {
      const pos = POSITIONS_3D[id];

      // Ceramic / porcelain: matte diffuse body with a thin glossy clearcoat —
      // reads as a premium game piece. Clearcoat is a second specular layer on
      // top of the diffuse, so the base stays chalky while the top catches a
      // soft highlight from the key light.
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.28,
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
        depthWrite: false,
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
    let activePointerId: number | null = null;
    let dragMoved = false;
    let downX = 0, downY = 0, lastX = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      dragMoved = false;
      downX = e.clientX; downY = e.clientY; lastX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!dragMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragMoved = true;
      if (dragMoved) {
        azimuth -= (e.clientX - lastX) * 0.008;
        updateCamera();
      }
      lastX = e.clientX;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (!dragMoved) {
        const rect = canvas.getBoundingClientRect();
        pointer.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);

        const targets: THREE.Object3D[] = [
          ...Object.values(sphereMeshes).filter(m => m.visible),
          ...Object.values(ghostMeshes).filter(m => m.visible),
        ];
        const hits = raycaster.intersectObjects(targets);
        if (hits.length > 0) {
          const slotId = hits[0].object.userData.slotId as number;
          propsRef.current.onSlotClick(slotId);
        }
      }
    };

    const stopTouch = (e: TouchEvent) => e.stopPropagation();

    // --- Zoom: mouse wheel (desktop) + two-finger pinch (mobile) -----------
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaY > 0 = scroll down / pinch out → zoom out
      // deltaY < 0 = scroll up / pinch in → zoom in
      const factor = Math.exp(e.deltaY * 0.0015); // smooth exponential zoom
      applyZoom(zoom * factor);
    };

    // Pinch: track two simultaneous touches and zoom by their distance ratio.
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    const activeTouches = new Map<number, { x: number; y: number }>();

    const touchDistance = () => {
      const [a, b] = Array.from(activeTouches.values());
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (activeTouches.size === 2) {
        pinchStartDist = touchDistance();
        pinchStartZoom = zoom;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (activeTouches.has(t.identifier)) {
          activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
      if (activeTouches.size === 2 && pinchStartDist > 0) {
        e.preventDefault();
        const ratio = touchDistance() / pinchStartDist;
        // Inverse: bringing fingers closer = zoom OUT (camera farther),
        // spreading apart = zoom IN (camera closer). That matches native
        // pinch-to-zoom expectations on maps/photos.
        applyZoom(pinchStartZoom / ratio);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        activeTouches.delete(t.identifier);
      }
      if (activeTouches.size < 2) pinchStartDist = 0;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('touchmove', stopTouch, { passive: true });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });

    const onResize = () => {
      const newW = mount.clientWidth;
      const newH = mount.clientHeight;
      if (newW > 0 && newH > 0) {
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
        camDist = computeCamDist(camera.aspect) * zoom;
        updateCamera();
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = Date.now();

      Object.values(sphereMeshes).forEach(m => {
        if (m.visible && m.userData.placedAt) {
          const elapsed = (now - m.userData.placedAt) / 1000;
          if (elapsed < PLACEMENT_ANIM_SECONDS) {
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
          (g.material as THREE.MeshBasicMaterial).opacity = pulseO;
          g.scale.setScalar(pulseS);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = {
      sphereMeshes, ghostMeshes, slotMaterials,
      lastSeen: { lastPlaced: null },
    };

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('touchmove', stopTouch);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      try { mount.removeChild(canvas); } catch { /* ignore */ }
      sphereGeo.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      boardGeo.dispose();
      boardMat.dispose();
      woodTex.dispose();
      slotInsetGeo.dispose();
      slotInsetMat.dispose();
      Object.values(slotMaterials).forEach(m => m.dispose());
      Object.values(ghostMeshes).forEach(g => (g.material as THREE.Material).dispose());
      renderer.dispose();
    };
  }, []);

  // Sync scene objects to props (visibility, colors, ghost previews).
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

    for (let id = 0; id < NUM_SLOTS; id++) {
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
          const ghostMat = ghostMesh.material as THREE.MeshBasicMaterial;
          const isValid = !!selectedColor && checkPlacementRules(id, board);
          ghostMesh.userData.isValidTarget = isValid;
          if (isValid && selectedColor) {
            ghostMat.color.setHex(COLOR_GRADIENTS[selectedColor].hex);
          } else {
            ghostMat.color.setHex(0x94a3b8);
            ghostMat.opacity = selectedColor ? 0.08 : 0.2;
            ghostMesh.scale.setScalar(0.92);
          }
        }
      }
    }
  }, [board, selectedColor, lastPlaced]);

  const zoomBy = (factor: number) => {
    applyZoomRef.current(zoomRef.current * factor);
  };

  return (
    <div className="relative w-full h-full" style={{ minHeight: '300px' }}>
      <div ref={mountRef}
           className="w-full h-full"
           style={{ touchAction: 'none' }} />
      {/* View controls — zoom (+ / −) and reset-view, stacked in the bottom-
          right corner. Zoom is also available via wheel / trackpad / pinch. */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(0.82)}
          style={{ touchAction: 'manipulation' }}
          className="w-8 h-8 rounded-full bg-white/85 backdrop-blur text-slate-700 text-lg font-bold leading-none flex items-center justify-center shadow-sm hover:bg-white active:scale-95 transition">
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1.22)}
          style={{ touchAction: 'manipulation' }}
          className="w-8 h-8 rounded-full bg-white/85 backdrop-blur text-slate-700 text-lg font-bold leading-none flex items-center justify-center shadow-sm hover:bg-white active:scale-95 transition">
          −
        </button>
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => resetViewRef.current()}
          style={{ touchAction: 'manipulation' }}
          className="w-8 h-8 rounded-full bg-white/85 backdrop-blur text-slate-700 flex items-center justify-center shadow-sm hover:bg-white active:scale-95 transition">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
