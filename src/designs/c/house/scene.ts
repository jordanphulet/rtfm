import {
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Section } from "../../../shared";
import { colors, timing } from "../tokens";
import { buildHouse, type Opening } from "./model";
import type { Storey } from "./plan";

const YAW = MathUtils.degToRad(-15);
const PARALLAX_YAW = MathUtils.degToRad(2);
const PARALLAX_PITCH = 0.04;
const CAMERA_LIFT = -0.12;
const FIELD_OF_VIEW = 30;
const FRAME_MS = 1000 / 30;
const STILL_LAMP = 0.8;
const HOVER_LIFT = 0.08;

const GLASS = new Color(colors.glass);
const LIT = new Color(colors.lit);
const LAMP = new Color(colors.lamp);
const INK = new Color(colors.ink);

interface HouseOptions {
  storeys: Storey[];
  doorSectionId: string;
  reducedMotion: boolean;
  onHover: (sectionId: string | undefined) => void;
  onPick: (sectionId: string) => void;
}

export interface HouseScene {
  setStatuses: (statuses: Map<string, Section["status"]>) => void;
  setHovered: (sectionId: string | undefined) => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  dispose: () => void;
}

export function createHouseScene(canvas: HTMLCanvasElement, options: HouseOptions): HouseScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(colors.bg);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 400);

  const model = buildHouse(options.storeys);
  const materials = {
    wall: new MeshLambertMaterial({ color: colors.wall }),
    trim: new MeshLambertMaterial({ color: colors.trim }),
    roof: new MeshLambertMaterial({ color: colors.roof }),
    glass: new MeshBasicMaterial(),
    highlight: new MeshBasicMaterial({ color: colors.ink2 }),
    pickOnly: new MeshBasicMaterial({ visible: false }),
  };
  const structure = [
    new Mesh(model.wall, materials.wall),
    new Mesh(model.trim, materials.trim),
    new Mesh(model.roof, materials.roof),
  ];
  const glass = createGlass(model.windows, model.glassZ, materials.glass);
  const doorTarget = createDoorTarget(model.door, model.glassZ, materials.pickOnly);
  const highlight = new Mesh(new BoxGeometry(), materials.highlight);
  highlight.visible = false;
  scene.add(...structure, glass, doorTarget, highlight);
  addLights(scene);

  const bounds = new Box3().setFromObject(structure[0]).union(new Box3().setFromObject(structure[1]));
  const focus = bounds.getCenter(new Vector3());
  const glassColors = model.windows.map(() => GLASS.clone());
  const target = new Color();
  const shown = new Color();
  const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let distance = 40;
  let reducedMotion = options.reducedMotion;
  let statuses = new Map<string, Section["status"]>();
  let hoveredId: string | undefined;

  const loop = createLoop(tick);
  const watchers = [watchSize(canvas, resize, loop.setVisible), watchPointer()];
  resize();

  function tick(elapsedMs: number, now: number) {
    let moving = updateColors(elapsedMs, now);
    parallax.x += (parallax.targetX - parallax.x) * 0.12;
    parallax.y += (parallax.targetY - parallax.y) * 0.12;
    moving ||= Math.abs(parallax.targetX - parallax.x) + Math.abs(parallax.targetY - parallax.y) > 1e-4;
    placeCamera();
    renderer.render(scene, camera);
    return moving && !reducedMotion;
  }

  function updateColors(elapsedMs: number, now: number) {
    let moving = false;
    model.windows.forEach((slot, index) => {
      const status = statuses.get(slot.sectionId) ?? "unwritten";
      setTargetColor(target, status, now, reducedMotion);
      const current = glassColors[index];
      if (reducedMotion) current.copy(target);
      else current.lerp(target, 1 - Math.exp(-elapsedMs / timing.fast));
      if (status === "writing" || colorDistance(current, target) > 0.002) moving = true;
      shown.copy(current);
      if (slot.sectionId === hoveredId) shown.lerp(INK, HOVER_LIFT);
      glass.setColorAt(index, shown);
    });
    if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
    return moving;
  }

  function placeCamera() {
    const yaw = YAW + parallax.x * PARALLAX_YAW;
    const lift = CAMERA_LIFT + parallax.y * PARALLAX_PITCH;
    camera.position.set(
      focus.x + Math.sin(yaw) * distance,
      focus.y + lift * distance,
      focus.z + Math.cos(yaw) * distance,
    );
    camera.lookAt(focus);
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 600 ? 2 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    distance = fitDistance(bounds, camera);
    scene.fog = new Fog(colors.bg, distance * 0.9, distance * 2.2);
    loop.request();
  }

  function watchPointer() {
    const raycaster = new Raycaster();
    const point = new Vector2();
    let pointerSection: string | undefined;

    function sectionAt(rect: DOMRect, clientX: number, clientY: number) {
      point.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(point, camera);
      const [hit] = raycaster.intersectObjects([glass, doorTarget], false);
      if (!hit) return undefined;
      return hit.object === doorTarget ? options.doorSectionId : model.windows[hit.instanceId ?? -1]?.sectionId;
    }

    function onMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      if (event.pointerType === "mouse" && !reducedMotion) {
        parallax.targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        parallax.targetY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        loop.request();
      }
      const next = sectionAt(rect, event.clientX, event.clientY);
      canvas.style.cursor = next ? "pointer" : "";
      if (next === pointerSection) return;
      pointerSection = next;
      options.onHover(next);
    }

    function onLeave() {
      parallax.targetX = 0;
      parallax.targetY = 0;
      loop.request();
      canvas.style.cursor = "";
      if (!pointerSection) return;
      pointerSection = undefined;
      options.onHover(undefined);
    }

    function onClick(event: MouseEvent) {
      const sectionId = sectionAt(canvas.getBoundingClientRect(), event.clientX, event.clientY);
      if (sectionId) options.onPick(sectionId);
    }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    return {
      disconnect() {
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("click", onClick);
      },
    };
  }

  return {
    setStatuses(next) {
      statuses = next;
      loop.request();
    },
    setHovered(sectionId) {
      hoveredId = sectionId;
      showHighlight(highlight, model.windows.find((slot) => slot.sectionId === sectionId), model.glassZ);
      loop.request();
    },
    setReducedMotion(next) {
      reducedMotion = next;
      if (reducedMotion) Object.assign(parallax, { x: 0, y: 0, targetX: 0, targetY: 0 });
      loop.request();
    },
    dispose() {
      loop.stop();
      watchers.forEach((watcher) => watcher.disconnect());
      [model.wall, model.trim, model.roof, doorTarget.geometry, highlight.geometry].forEach((geometry) =>
        geometry.dispose(),
      );
      glass.dispose();
      glass.geometry.dispose();
      Object.values(materials).forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function setTargetColor(out: Color, status: Section["status"], now: number, reducedMotion: boolean) {
  if (status === "written") out.copy(LIT);
  else if (status === "unwritten") out.copy(GLASS);
  else out.copy(GLASS).lerp(LAMP, reducedMotion ? STILL_LAMP : 0.75 + 0.25 * flicker(now / 1000));
}

function flicker(seconds: number) {
  return 0.5 + 0.3 * Math.sin(seconds * 7.3) + 0.2 * Math.sin(seconds * 13.1 + 1.7);
}

function colorDistance(a: Color, b: Color) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function createGlass(windows: Opening[], z: number, material: MeshBasicMaterial) {
  const glass = new InstancedMesh(new PlaneGeometry(1, 1), material, windows.length);
  const matrix = new Matrix4();
  windows.forEach(({ x, y, width, height }, index) => {
    matrix.makeScale(width, height, 1).setPosition(x, y + height / 2, z);
    glass.setMatrixAt(index, matrix);
    glass.setColorAt(index, GLASS);
  });
  return glass;
}

function createDoorTarget({ x, y, width, height }: Opening, z: number, material: MeshBasicMaterial) {
  const target = new Mesh(new PlaneGeometry(width, height), material);
  target.position.set(x, y + height / 2, z);
  return target;
}

function showHighlight(highlight: Mesh, slot: Opening | undefined, z: number) {
  highlight.visible = slot !== undefined;
  if (!slot) return;
  const thickness = 0.06;
  const { x, y, width, height } = slot;
  const pieces = [
    [width + thickness * 2, thickness, x, y - thickness / 2],
    [width + thickness * 2, thickness, x, y + height + thickness / 2],
    [thickness, height, x - width / 2 - thickness / 2, y + height / 2],
    [thickness, height, x + width / 2 + thickness / 2, y + height / 2],
  ].map(([pieceWidth, pieceHeight, pieceX, pieceY]) =>
    new BoxGeometry(pieceWidth, pieceHeight, 0.05).translate(pieceX, pieceY, z + 0.08),
  );
  highlight.geometry.dispose();
  highlight.geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
}

function addLights(scene: Scene) {
  scene.add(new HemisphereLight(colors.sky, colors.bg, 1.1));
  const moon = new DirectionalLight(colors.moon, 2.4);
  moon.position.set(-14, 18, 9);
  scene.add(moon);
}

function fitDistance(bounds: Box3, camera: PerspectiveCamera) {
  const size = bounds.getSize(new Vector3());
  const halfHeight = (size.y / 2) * 1.08;
  const halfWidth = (Math.max(size.x, size.z) / 2) * 1.15;
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
  return Math.max(halfHeight / tanHalf, halfWidth / (tanHalf * camera.aspect)) + size.z / 2;
}

function createLoop(tick: (elapsedMs: number, now: number) => boolean) {
  let frame = 0;
  let last = 0;
  let visible = true;
  let renderQueued = false;
  let stopped = false;

  function step(now: number) {
    const elapsed = last === 0 ? FRAME_MS : now - last;
    last = now;
    const keepGoing = tick(elapsed, now);
    if (keepGoing && visible) frame = requestAnimationFrame(run);
    else last = 0;
  }

  function run(now: number) {
    frame = 0;
    if (now - last < FRAME_MS) frame = requestAnimationFrame(run);
    else step(now);
  }

  function request() {
    if (stopped || frame !== 0 || renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      if (!stopped && frame === 0) step(performance.now());
    });
  }

  function setVisible(isVisible: boolean) {
    visible = isVisible;
    if (visible) request();
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  return { request, setVisible, stop };
}

function watchSize(canvas: HTMLCanvasElement, onResize: () => void, setVisible: (visible: boolean) => void) {
  let onScreen = true;
  const update = () => setVisible(onScreen && document.visibilityState === "visible");
  const resizeObserver = new ResizeObserver(onResize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    update();
  });
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  document.addEventListener("visibilitychange", update);
  return {
    disconnect() {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", update);
    },
  };
}
