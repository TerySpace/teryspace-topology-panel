import { BendPoint } from 'types';

export interface Point {
  x: number;
  y: number;
}

export const snapToGrid = (v: number, gridSize: number): number => {
  return Math.round(v / gridSize) * gridSize;
};

export const polylinePoints = (from: Point, to: Point, bends: BendPoint[]): Point[] => {
  return [from, ...bends.map((b) => ({ x: b.x, y: b.y })), to];
};

export const pointsToPath = (points: Point[]): string => {
  if (!points.length) {
    return '';
  }
  return points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
};

export const pointsToBezierPath = (points: Point[]): string => {
  if (points.length <= 1) {
    return pointsToPath(points);
  }

  const start = points[0];
  let d = `M ${start.x} ${start.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };
    d += ` C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${p2.x} ${p2.y}`;
  }

  return d;
};

const distance = (a: Point, b: Point): number => {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

export const polylineMidpoint = (points: Point[]): Point => {
  if (points.length <= 1) {
    return points[0] ?? { x: 0, y: 0 };
  }

  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = distance(points[i], points[i + 1]);
    lengths.push(l);
    total += l;
  }

  const target = total / 2;
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i];
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    acc += seg;
  }

  return points[Math.floor(points.length / 2)];
};

export const polylinePointAtRatio = (points: Point[], ratio: number): Point => {
  if (points.length <= 1) {
    return points[0] ?? { x: 0, y: 0 };
  }
  const clamped = Math.max(0, Math.min(1, ratio));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const l = distance(points[i], points[i + 1]);
    lengths.push(l);
    total += l;
  }
  const target = total * clamped;
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i];
    if (seg <= 0) {
      continue;
    }
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
};
