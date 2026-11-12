/** 青穗集 · WebGL 星云忆迹场：体积粒子、真实记忆星体、相机与点选生命周期。 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MemoryKind, MemoryNode, MemoryRelation } from "../../../agent/src/memory-contract";
import { MEMORY_COLORS, memoryCluster, memoryPosition, seededRandom, visibleMemoryRelations } from "./memory-nebula-layout";

import { nebulaVeil } from "./memory-nebula-form";
import { createNebulaAtmosphere } from "./memory-nebula-atmosphere";

export interface NebulaState {
  nodes: MemoryNode[];
  relations: MemoryRelation[];
  selectedId: string | null;
  highlighted: Set<string>;
  matching: Set<string>;
  labelIds: string[];
  kind: MemoryKind | null;
  active: boolean;
  motion: boolean;
  orbit: boolean;
}
export interface NebulaProjection { id: string; x: number; y: number; visible: boolean }
interface NebulaCallbacks {
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  interact: () => void;
  project: (labels: NebulaProjection[]) => void;
  ready: () => void;
  error: () => void;
}
export interface NebulaScene {
  update: (state: NebulaState) => void;
  reset: () => void;
  zoom: (direction: number) => void;
  dispose: () => void;
}
interface MemoryStar {
  node: MemoryNode;
  position: THREE.Vector3;
  body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  ring: THREE.Sprite;
  hit: THREE.Mesh;
}
interface MemoryPath {
  from: string;
  to: string | null;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  curve: THREE.QuadraticBezierCurve3;
  spark?: THREE.Sprite;
  conflict: boolean;
}

const VERTEX = `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * 125.0 / max(20.0, -mvPosition.z), 1.0, 260.0 * uPixelRatio);
    vColor = aColor;
    vAlpha = (.8 + .2 * sin(uTime * .35 + aPhase)) * (1.0 - smoothstep(85.0, 360.0, -mvPosition.z));
  }
`;
const FRAGMENT = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float alpha = texture2D(uMap, gl_PointCoord).a * uOpacity * vAlpha;
    if (alpha < .002) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 纹理由代码生成，避免网络图片及外部素材依赖。 */
function makeTexture(type: "glow" | "ring") {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  if (type === "ring") {
    const gradient = context.createRadialGradient(64, 64, 41, 64, 64, 61);
    gradient.addColorStop(0, "#ffffff00"); gradient.addColorStop(.46, "#ffffff00");
    gradient.addColorStop(.6, "#ffffffb0"); gradient.addColorStop(.68, "#ffffff30"); gradient.addColorStop(1, "#ffffff00");
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  } else {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, alpha] of [[0, 1], [.06, .95], [.16, .38], [.4, .09], [1, 0]]) {
      gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    }
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function starDust(count: number, texture: THREE.Texture, pixelRatio: number) {
  const random = seededRandom(85121), positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3), sizes = new Float32Array(count), phases = new Float32Array(count);
  const palette = ["#8a77d4", "#818bd5", "#65b6cb", "#8dc8cf"].map(color => new THREE.Color(color));
  for (let index = 0; index < count; index++) {
    const t = (random() - .5) * 2.62, branch = index % 3 === 0 ? 1 : 0;
    const strand = (random() - .5) * 3.1, depth = (random() - .5) * .40;
    const position = nebulaVeil(t, branch, strand, depth);
    positions.set(position, index * 3);
    const color = palette[Math.min(3, Math.max(0, Math.floor((t + 1.31) * 1.2 + branch)))].clone();
    if (random() > .985) color.set("#e4eafa");
    color.multiplyScalar(.35 + random() * .65).toArray(colors, index * 3);
    sizes[index] = .55 + Math.pow(random(), 4) * 2.5;
    phases[index] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uMap: { value: texture }, uOpacity: { value: .60 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false;
  return points;
}

/** 薄纤维沿云幕褶皱延展，单次绘制；仅作气氛，不代表用户记忆或关系。 */
function veilFilaments() {
  const random = seededRandom(32914), positions: number[] = [], colors: number[] = [];
  const violet = new THREE.Color("#8e89db"), cyan = new THREE.Color("#77bdcc");
  for (let strand = 0; strand < 72; strand++) {
    const branch = strand % 3 === 0 ? 1 : 0;
    const start = -1.30 + random() * 1.7, end = Math.min(1.33, start + .25 + random() * 1.25);
    const offset = (random() - .5) * 2.3, depth = (random() - .5) * .20, phase = random() * 6.28;
    for (let segment = 0; segment < 52; segment++) {
      for (const step of [segment, segment + 1]) {
        const t = start + (end - start) * step / 52;
        const fold = offset + .18 * Math.sin(t * 8 + phase) + .045 * Math.sin(t * 23 + phase);
        positions.push(...nebulaVeil(t, branch, fold, depth));
        const fade = Math.sin(Math.PI * step / 52) ** .7;
        violet.clone().lerp(cyan, Math.min(1, Math.max(0, (t + 1.1) / 2.3 + branch * .35)))
          .multiplyScalar(fade * (.45 + .25 * Math.sin(phase + t * 4))).toArray(colors, colors.length);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    opacity: .065, depthWrite: false, blending: THREE.AdditiveBlending }));
}

export function createMemoryNebula(host: HTMLElement, initial: NebulaState, callbacks: NebulaCallbacks): NebulaScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setClearColor("#050813"); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement; canvas.className = "memory-nebula__canvas";
  canvas.setAttribute("aria-label", "可旋转和缩放的三维忆迹场"); canvas.setAttribute("role", "img");
  host.prepend(canvas);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, .2, 1000);
  const overviewTarget = new THREE.Vector3(0, 8, 0);
  const initialCamera = new THREE.Vector3(0, 18, 202); camera.position.copy(initialCamera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .065;
  controls.minDistance = 20; controls.maxDistance = 360; controls.zoomSpeed = .7; controls.rotateSpeed = .45;
  controls.panSpeed = .55; controls.autoRotateSpeed = .10; controls.enablePan = true;
  controls.target.copy(overviewTarget); controls.update();
  const glow = makeTexture("glow"), ringTexture = makeTexture("ring");
  renderer.autoClear = false;
  const atmosphere = createNebulaAtmosphere(renderer, camera);
  const dust = starDust(10500, glow, renderer.getPixelRatio());
  scene.add(dust, veilFilaments());

  const random = seededRandom(7391), starPositions = new Float32Array(2200 * 3), starColors = new Float32Array(2200 * 3);
  for (let index = 0; index < 2200; index++) {
    const radius = 210 + random() * 280, phi = Math.acos(2 * random() - 1), theta = random() * Math.PI * 2;
    starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[index * 3 + 2] = radius * Math.cos(phi);
    new THREE.Color().setHSL(.56 + random() * .16, .12 + random() * .25, .3 + random() * .45).toArray(starColors, index * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3)); starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: .82, sizeAttenuation: false, transparent: true, depthWrite: false, vertexColors: true, opacity: .55, blending: THREE.AdditiveBlending })));
  const sphere = new THREE.SphereGeometry(.43, 12, 10), hitSphere = new THREE.SphereGeometry(2.8, 7, 6);
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  let state = initial, disposed = false, frame = 0, width = 1, height = 1, clock = 0, previousTime = 0, lastPaint = 0;
  let fittedScale = 1, inViewport = true, hovered: string | null = null;
  let targetFocus: { target: THREE.Vector3; camera: THREE.Vector3 } | null = null, focusAt = 0;
  const neighbors = new Map<string, Set<string>>();
  const stars = new Map<string, MemoryStar>(), paths: MemoryPath[] = [], pickables: THREE.Mesh[] = [];
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projected = new THREE.Vector3();
  let down: { x: number; y: number; pointerId: number } | null = null, gestures = 0;

  function sprite(color: string, map = glow) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  function removePaths() {
    for (const path of paths) {
      scene.remove(path.line); path.line.geometry.dispose(); path.line.material.dispose();
      if (path.spark) { scene.remove(path.spark); (path.spark.material as THREE.SpriteMaterial).dispose(); }
    }
    paths.length = 0;
  }
  function addPath(from: MemoryStar, to: MemoryStar | undefined, conflict: boolean) {
    const end = to?.position ?? new THREE.Vector3(), midpoint = from.position.clone().add(end).multiplyScalar(.5);
    midpoint.z += (to ? 13 : 18); midpoint.y += to ? -7 : 5;
    const curve = new THREE.QuadraticBezierCurve3(from.position, midpoint, end);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: conflict ? "#efb38e" : to ? "#aeb8ef" : MEMORY_COLORS[from.node.kind], transparent: true, opacity: .02, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(line);
    const spark = sprite(MEMORY_COLORS[from.node.kind]);
    if (spark) { spark.scale.setScalar(2.8); scene.add(spark); }
    paths.push({ from: from.node.id, to: to?.node.id ?? null, line, curve, spark, conflict });
  }
  function syncNodes() {
    const ids = new Set(state.nodes.map(node => node.id));
    for (const [id, star] of stars) if (!ids.has(id)) {
      scene.remove(star.body, star.halo, star.ring, star.hit);
      star.body.material.dispose(); (star.halo.material as THREE.SpriteMaterial).dispose(); (star.ring.material as THREE.SpriteMaterial).dispose(); stars.delete(id);
    }
    for (const node of state.nodes) {
      const existing = stars.get(node.id);
      if (existing) {
        existing.node = node; existing.position.set(...memoryPosition(node.id, node.kind));
        for (const object of [existing.body, existing.halo, existing.ring, existing.hit]) object.position.copy(existing.position);
        existing.body.material.color.set("#eff5ff"); (existing.halo.material as THREE.SpriteMaterial).color.set(MEMORY_COLORS[node.kind]);
        continue;
      }
      const position = new THREE.Vector3(...memoryPosition(node.id, node.kind)), color = MEMORY_COLORS[node.kind];
      const body = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: "#eff5ff", transparent: true, opacity: 1 }));
      const halo = sprite(color), ring = sprite(color, ringTexture), hit = new THREE.Mesh(hitSphere, hitMaterial);
      for (const object of [body, halo, ring, hit]) object.position.copy(position);
      hit.userData.memoryId = node.id; body.renderOrder = 2; halo.renderOrder = 1;
      scene.add(body, halo, ring, hit); stars.set(node.id, { node, position, body, halo, ring, hit });
    }
    pickables.length = 0; for (const star of stars.values()) pickables.push(star.hit);
    removePaths();
    neighbors.clear();
    for (const relation of state.relations) {
      if (!neighbors.has(relation.from)) neighbors.set(relation.from, new Set());
      if (!neighbors.has(relation.to)) neighbors.set(relation.to, new Set());
      neighbors.get(relation.from)!.add(relation.to); neighbors.get(relation.to)!.add(relation.from);
    }
    for (const relation of visibleMemoryRelations(state.nodes, state.relations, state.selectedId, state.highlighted)) {
      const from = stars.get(relation.from), to = stars.get(relation.to);
      if (from && to) addPath(from, to, relation.kind === "conflict");
    }
    canvas.dataset.relations = String(paths.length);
    canvas.dataset.nodes = String(stars.size);
  }
  function renderLabels() {
    const labels: NebulaProjection[] = [], occupied: { x: number; y: number }[] = [];
    for (const id of state.labelIds) {
      const star = stars.get(id); if (!star) continue;
      projected.copy(star.position).project(camera);
      const x = (projected.x * .5 + .5) * width, y = (-projected.y * .5 + .5) * height;
      const priority = id === state.selectedId || id === hovered;
      const visible = projected.z > -1 && projected.z < 1 && x > 20 && x < width - 26 && y > 45 && y < height - 75 && (priority || !occupied.some(point => Math.abs(point.x - x) < 172 && Math.abs(point.y - y) < 42));
      if (visible) occupied.push({ x, y });
      labels.push({ id, x, y, visible });
    }
    callbacks.project(labels);
  }
  function paint(time: number) {
    frame = 0;
    if (disposed || !state.active || !inViewport || document.hidden) return;
    frame = requestAnimationFrame(paint);
    const interval = state.motion ? 1000 / 40 : 1000 / 24;
    if (time - lastPaint < interval) return;
    const delta = Math.min((time - (previousTime || time)) / 1000, .06); previousTime = time; lastPaint = time;
    if (state.motion) clock += delta;
    dust.material.uniforms.uTime.value = clock;
    controls.autoRotate = state.orbit && state.motion && !targetFocus && !state.selectedId && !state.kind;
    if (targetFocus) {
      const ease = state.motion ? 1 - Math.exp(-delta * 5.2) : 1;
      controls.target.lerp(targetFocus.target, ease); camera.position.lerp(targetFocus.camera, ease);
      if ((targetFocus.target.distanceTo(controls.target) < .03 && targetFocus.camera.distanceTo(camera.position) < .08) || performance.now() - focusAt > 2400) targetFocus = null;
    }
    controls.update(delta);
    const focusId = state.selectedId ?? hovered, adjacent = focusId ? neighbors.get(focusId) : null;
    for (const [id, star] of stars) {
      const selected = id === state.selectedId, lit = state.highlighted.has(id), matches = state.matching.has(id), hover = id === hovered;
      const connected = !focusId || id === focusId || adjacent?.has(id);
      const clarity = matches || selected ? (connected ? 1 : .25) : .09;
      const pulse = state.motion ? 1 + Math.sin(clock * (lit ? 1.6 : .65) + star.position.x) * .055 : 1;
      star.halo.scale.setScalar((selected || hover ? 8 : lit ? 5.5 : star.node.anchor ? 4.8 : 3.8) * pulse);
      (star.halo.material as THREE.SpriteMaterial).opacity = clarity * (lit || selected ? .90 : .62) * (.35 + .65 * star.node.retention);
      star.body.scale.setScalar((star.node.anchor ? 1.12 : .8) * (selected || hover ? 1.4 : 1));
      star.body.material.opacity = clarity;
      star.ring.scale.setScalar(selected || hover ? 4.5 : 3);
      (star.ring.material as THREE.SpriteMaterial).opacity = selected || hover ? .6 : 0;
    }
    paths.forEach((path, index) => {
      const focused = focusId && (path.from === focusId || path.to === focusId);
      const recalled = state.highlighted.has(path.from) && Boolean(path.to && state.highlighted.has(path.to));
      const visible = state.matching.has(path.from) && (!path.to || state.matching.has(path.to));
      const opacity = !visible ? .007 : focusId ? focused ? .40 : .006 : path.conflict ? .15 : recalled ? .10 : .027;
      path.line.material.opacity = THREE.MathUtils.lerp(path.line.material.opacity, opacity, state.motion ? .16 : 1);
      if (path.spark) {
        path.spark.position.copy(path.curve.getPoint((clock * .13 + index * .21) % 1));
        (path.spark.material as THREE.SpriteMaterial).opacity = visible && (focused || recalled) && state.motion ? .85 : 0;
      }
    });
    atmosphere.render(clock); renderer.render(scene, camera); renderLabels();
    canvas.dataset.camera = camera.position.toArray().map(value => value.toFixed(2)).join(",");
  }
  function wake() { if (!frame && !disposed && state.active && inViewport && !document.hidden) { previousTime = 0; frame = requestAnimationFrame(paint); } }
  function resize() {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false); atmosphere.resize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    const nextScale = Math.max(1, Math.min(2.5, 1.25 / camera.aspect));
    if (Math.abs(nextScale - fittedScale) > .01) {
      camera.position.sub(controls.target).multiplyScalar(nextScale / fittedScale).add(controls.target);
      fittedScale = nextScale; initialCamera.set(0, 8 + 10 * fittedScale, 202 * fittedScale);
      controls.maxDistance = Math.max(360, initialCamera.length() * 1.8);
    }
    wake();
  }
  function focus(position: THREE.Vector3, distance: number) {
    const direction = camera.position.clone().sub(controls.target).normalize();
    targetFocus = { target: position.clone(), camera: position.clone().add(direction.multiplyScalar(distance * fittedScale)) };
    focusAt = performance.now(); wake();
  }
  function hitAt(event: PointerEvent): string | null {
    const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false).find(hit => state.matching.has(hit.object.userData.memoryId));
    if (hit) return hit.object.userData.memoryId;
    // 放大 CSS 像素命中区，触控和高 DPI 下也能点中细小星体。
    let closest: string | null = null, distance = 24;
    for (const [id, star] of stars) {
      if (!state.matching.has(id)) continue;
      projected.copy(star.position).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const gap = Math.hypot((projected.x - pointer.x) * rect.width / 2, (projected.y - pointer.y) * rect.height / 2);
      if (gap < distance) { distance = gap; closest = id; }
    }
    return closest;
  }
  function hover(id: string | null) { if (hovered === id) return; hovered = id; canvas.style.cursor = id ? "pointer" : "grab"; callbacks.hover(id); }
  function onDown(event: PointerEvent) { gestures++; down = gestures === 1 && event.button === 0 ? { x: event.clientX, y: event.clientY, pointerId: event.pointerId } : null; targetFocus = null; canvas.style.cursor = "grabbing"; callbacks.interact(); }
  function onMove(event: PointerEvent) { if (gestures) return; hover(hitAt(event)); }
  function onUp(event: PointerEvent) {
    gestures = Math.max(0, gestures - 1);
    if (down && down.pointerId === event.pointerId && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) callbacks.select(hitAt(event));
    down = null; canvas.style.cursor = "grab";
  }
  function onCancel() { down = null; gestures = 0; hover(null); }
  function onLeave() { if (!gestures) hover(null); }
  function onWheel() { targetFocus = null; callbacks.interact(); }
  function onLost(event: Event) { event.preventDefault(); callbacks.error(); }
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("pointercancel", onCancel);
  window.addEventListener("pointerup", onUp); canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("webglcontextlost", onLost);
  const observer = new ResizeObserver(resize); observer.observe(host);
  const visibility = new IntersectionObserver(entries => { inViewport = entries[0]?.isIntersecting ?? true; wake(); }); visibility.observe(host);
  document.addEventListener("visibilitychange", wake);
  syncNodes(); resize(); callbacks.ready(); wake();
  return {
    update(next) {
      const previous = state; state = next;
      if (previous.nodes !== state.nodes || previous.relations !== state.relations || previous.highlighted !== state.highlighted || previous.selectedId !== state.selectedId) syncNodes();
      if (state.selectedId !== previous.selectedId && state.selectedId) { const star = stars.get(state.selectedId); if (star) focus(star.position, 82); }
      else if (state.kind !== previous.kind) focus(state.kind ? new THREE.Vector3(...memoryCluster(state.kind)) : overviewTarget, state.kind ? 110 : 202);
      else if (previous.selectedId && !state.selectedId) focus(state.kind ? new THREE.Vector3(...memoryCluster(state.kind)) : overviewTarget, state.kind ? 110 : 202);
      if (!state.active && frame) { cancelAnimationFrame(frame); frame = 0; }
      wake();
    },
    reset() {
      targetFocus = null; callbacks.interact(); controls.autoRotate = false;
      controls.enableDamping = false; controls.update(); controls.reset();
      camera.position.copy(initialCamera); controls.target.copy(overviewTarget); controls.update(); controls.enableDamping = true; wake();
    },
    zoom(direction) {
      callbacks.interact(); targetFocus = null;
      const offset = camera.position.clone().sub(controls.target), distance = THREE.MathUtils.clamp(offset.length() * (direction > 0 ? .8 : 1.25), controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(distance)); controls.update(); wake();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); visibility.disconnect(); controls.dispose();
      document.removeEventListener("visibilitychange", wake);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("webglcontextlost", onLost);
      removePaths();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        const renderable = object as THREE.Mesh;
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
      });
      geometries.add(sphere); geometries.add(hitSphere); materials.add(hitMaterial);
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
      atmosphere.dispose(); glow.dispose(); ringTexture.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
