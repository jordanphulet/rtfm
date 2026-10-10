import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Path, Shape } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Storey } from "./plan";

const WIDTH = 7;
const DEPTH = 6;
const WALL = 0.4;
const STOREY = 3.2;
const BASEMENT = 2.4;
const GABLE_RISE = 5;
const EAVE_OVERHANG = 0.45;
const GLASS_INSET = 0.26;

const windowSize = {
  floor: { width: 0.95, height: 1.75, sill: 0.75 },
  gable: { width: 0.8, height: 1.4, sill: 0.7 },
  basement: { width: 1.15, height: 0.75, sill: 0.85 },
};

const door = { width: 1.2, height: 2.45 };

export const SILL = { overhang: 0.26, height: 0.1, depth: 0.34, frontZ: 0.19 };

export interface Opening {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowSlot extends Opening {
  sectionId: string;
}

interface HouseModel {
  wall: BufferGeometry;
  trim: BufferGeometry;
  roof: BufferGeometry;
  windows: WindowSlot[];
  door: Opening;
  glassZ: number;
}

export function buildHouse(storeys: Storey[]): HouseModel {
  const floorCount = storeys.filter((storey) => storey.kind === "floor").length;
  const eaveY = floorCount * STOREY;
  const { windows, door: doorOpening } = placeOpenings(storeys, eaveY);
  const openings = [...windows, doorOpening];

  return {
    wall: merge([frontWall(eaveY, openings), ...sideWalls(eaveY)]),
    trim: merge([
      ...courses(floorCount),
      ...windows.flatMap(windowTrim),
      ...doorTrim(doorOpening),
      ...railing(),
      ...chimney(eaveY),
    ]),
    roof: merge(roofSlopes(eaveY)),
    windows,
    door: doorOpening,
    glassZ: -GLASS_INSET,
  };
}

function placeOpenings(storeys: Storey[], eaveY: number) {
  const windows: WindowSlot[] = [];
  let doorOpening: Opening = { x: 0, y: 0, width: door.width, height: door.height };
  let floorIndex = 0;

  for (const storey of storeys) {
    const size = windowSize[storey.kind];
    const baseY =
      storey.kind === "basement" ? -BASEMENT : storey.kind === "gable" ? eaveY : floorIndex++ * STOREY;
    const span = storey.kind === "gable" ? WIDTH / 2 : WIDTH;

    storey.sectionIds.forEach((group, groupIndex) => {
      const groupWidth = span / storey.sectionIds.length;
      const groupLeft = -span / 2 + groupIndex * groupWidth;
      const slots: (string | "door")[] = [...group];
      if (storey.hasDoor) slots.splice(Math.floor(group.length / 2), 0, "door");

      slots.forEach((slot, slotIndex) => {
        const x = groupLeft + (groupWidth * (slotIndex + 0.5)) / slots.length;
        if (slot === "door") {
          doorOpening = { x, y: baseY + 0.12, width: door.width, height: door.height };
          return;
        }
        windows.push({ sectionId: slot, x, y: baseY + size.sill, width: size.width, height: size.height });
      });
    });
  }
  return { windows, door: doorOpening };
}

function frontWall(eaveY: number, openings: Opening[]) {
  const outline = new Shape()
    .moveTo(-WIDTH / 2, -BASEMENT)
    .lineTo(WIDTH / 2, -BASEMENT)
    .lineTo(WIDTH / 2, eaveY)
    .lineTo(0, eaveY + GABLE_RISE)
    .lineTo(-WIDTH / 2, eaveY);
  for (const { x, y, width, height } of openings) {
    outline.holes.push(
      new Path()
        .moveTo(x - width / 2, y)
        .lineTo(x - width / 2, y + height)
        .lineTo(x + width / 2, y + height)
        .lineTo(x + width / 2, y),
    );
  }
  const wall = new ExtrudeGeometry(outline, { depth: WALL, bevelEnabled: false });
  wall.translate(0, 0, -WALL);
  return wall;
}

function sideWalls(eaveY: number) {
  const height = eaveY + BASEMENT;
  return [-1, 1].map((side) =>
    box(WALL, height, DEPTH, side * (WIDTH / 2 - WALL / 2), -BASEMENT + height / 2, -DEPTH / 2),
  );
}

function courses(floorCount: number) {
  const pieces: BufferGeometry[] = [];
  for (let index = 0; index <= floorCount; index++) {
    const y = index * STOREY;
    const height = index === 0 ? 0.24 : 0.16;
    pieces.push(box(WIDTH + 0.3, height, 0.3, 0, y, 0));
    for (const side of [-1, 1]) pieces.push(box(0.3, height, DEPTH, side * (WIDTH / 2), y, -DEPTH / 2));
  }
  return pieces;
}

function windowTrim({ x, y, width, height }: Opening) {
  const bar = 0.07;
  const frameZ = -GLASS_INSET + 0.04;
  const pieces = [
    box(width + SILL.overhang, SILL.height, SILL.depth, x, y - SILL.height / 2, SILL.frontZ - SILL.depth / 2),
    box(width + 0.2, 0.18, 0.08, x, y + height + 0.09, 0.04),
    box(width, bar, 0.06, x, y + bar / 2, frameZ),
    box(width, bar, 0.06, x, y + height - bar / 2, frameZ),
    box(bar, height, 0.06, x - width / 2 + bar / 2, y + height / 2, frameZ),
    box(bar, height, 0.06, x + width / 2 - bar / 2, y + height / 2, frameZ),
    box(bar * 0.7, height, 0.05, x, y + height / 2, frameZ),
  ];
  if (height > 1) pieces.push(box(width, bar * 1.2, 0.07, x, y + height / 2, frameZ + 0.01));
  return pieces;
}

function doorTrim({ x, y, width, height }: Opening) {
  return [
    box(width, height, 0.08, x, y + height / 2, -GLASS_INSET - 0.04),
    box(0.06, height - 0.3, 0.04, x, y + height / 2, -GLASS_INSET + 0.02),
    box(width + 0.6, 0.26, 0.4, x, y + height + 0.18, 0.08),
    box(width + 0.7, 0.12, 0.7, x, y - 0.06, 0.25),
  ];
}

function railing() {
  const front = 1.5;
  const top = 0.6;
  const width = WIDTH + 1;
  const pieces = [box(width, 0.06, 0.06, 0, top, front), box(width, 0.12, 0.45, 0, -0.06, front)];
  const count = 18;
  for (let index = 0; index <= count; index++) {
    const x = -width / 2 + (width * index) / count;
    const thickness = index === 0 || index === count ? 0.1 : 0.035;
    pieces.push(box(thickness, top, thickness, x, top / 2, front));
  }
  return pieces;
}

function chimney(eaveY: number) {
  const x = -WIDTH / 2 - 0.45;
  const z = -DEPTH * 0.55;
  const top = eaveY + GABLE_RISE * 0.7;
  const height = top + BASEMENT;
  return [
    box(0.8, height, 0.9, x, -BASEMENT + height / 2, z),
    box(1.05, 0.22, 1.15, x, top + 0.11, z),
    box(0.3, 0.5, 0.3, x, top + 0.47, z - 0.2),
    box(0.3, 0.4, 0.3, x, top + 0.42, z + 0.25),
  ];
}

function roofSlopes(eaveY: number) {
  const run = WIDTH / 2 + EAVE_OVERHANG;
  const rise = GABLE_RISE + EAVE_OVERHANG * (GABLE_RISE / (WIDTH / 2));
  const length = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const lowY = eaveY - EAVE_OVERHANG * (GABLE_RISE / (WIDTH / 2));
  const depth = DEPTH + 0.9;
  return [-1, 1].map((side) =>
    box(length, 0.3, depth, (side * run) / 2, lowY + rise / 2 + 0.15, -depth / 2 + 0.5, -side * angle),
  );
}

function box(width: number, height: number, depth: number, x: number, y: number, z: number, rotateZ = 0) {
  const geometry = new BoxGeometry(width, height, depth).toNonIndexed();
  if (rotateZ) geometry.rotateZ(rotateZ);
  geometry.translate(x, y, z);
  return geometry;
}

function merge(geometries: BufferGeometry[]) {
  geometries.forEach((geometry) => geometry.clearGroups());
  const merged = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return merged;
}
