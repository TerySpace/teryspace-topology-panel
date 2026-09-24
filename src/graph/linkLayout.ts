import { AnchorSide, BendPoint, TopologyLink, TopologyNode } from 'types';
import { Point, polylinePointAtRatio, polylinePoints } from './math';

export interface LinkLayoutInput {
  link: TopologyLink;
  from: Point;
  to: Point;
  fromNode: TopologyNode;
  toNode: TopologyNode;
  siblingIds: string[];
  getBendPoint: (linkId: string, bendId: string, x: number, y: number) => Point;
  parallelSpacing: number;
}

export interface LinkLayoutResult {
  points: Point[];
  shift: number;
  nx: number;
  ny: number;
  midpoint: Point;
  badgeX: number;
  badgeY: number;
}

export const nodeVisualRadius = (size: number, hasHalo: boolean, hasOutline: boolean, haloWidth = 2): number => {
  const shell = size * 0.82;
  if (hasHalo) {
    return size * 0.9 + Math.max(1, Math.min(10, haloWidth)) / 2 + 0.5;
  }
  return shell + (hasOutline ? 1.1 : 0.2);
};

export const sideAnchorPoint = (center: Point, radius: number, side: AnchorSide): Point => {
  switch (side) {
    case 'top':
      return { x: center.x, y: center.y - radius };
    case 'right':
      return { x: center.x + radius, y: center.y };
    case 'bottom':
      return { x: center.x, y: center.y + radius };
    case 'left':
      return { x: center.x - radius, y: center.y };
    default:
      return center;
  }
};

export const computeLinkLayout = ({
  link,
  from,
  to,
  fromNode,
  toNode,
  siblingIds,
  getBendPoint,
  parallelSpacing,
}: LinkLayoutInput): LinkLayoutResult => {
  const siblingIdx = siblingIds.indexOf(link.id);
  const centerShift = (siblingIds.length - 1) / 2;
  const shift = (siblingIdx - centerShift) * parallelSpacing;
  const [idA, idB] = [link.from, link.to].sort();
  const anchorA = idA === link.from ? from : to;
  const anchorB = idB === link.to ? to : from;
  const pdx = anchorB.x - anchorA.x;
  const pdy = anchorB.y - anchorA.y;
  const pdlen = Math.max(Math.hypot(pdx, pdy), 1);
  const nx = -pdy / pdlen;
  const ny = pdx / pdlen;
  const fromR = nodeVisualRadius(fromNode.size, Boolean(fromNode.decoration?.enabled), true, fromNode.decoration?.haloWidth ?? 2);
  const toR = nodeVisualRadius(toNode.size, Boolean(toNode.decoration?.enabled), true, toNode.decoration?.haloWidth ?? 2);
  const baseFrom = sideAnchorPoint(from, fromR, link.anchorFrom ?? 'center');
  const baseTo = sideAnchorPoint(to, toR, link.anchorTo ?? 'center');
  const ndx = baseTo.x - baseFrom.x;
  const ndy = baseTo.y - baseFrom.y;
  const nlen = Math.max(Math.hypot(ndx, ndy), 1);
  const ux = ndx / nlen;
  const uy = ndy / nlen;
  const trimmedFrom = link.anchorFrom === 'center' ? { x: baseFrom.x + ux * fromR, y: baseFrom.y + uy * fromR } : baseFrom;
  const trimmedTo = link.anchorTo === 'center' ? { x: baseTo.x - ux * toR, y: baseTo.y - uy * toR } : baseTo;
  const shiftedBends: BendPoint[] = link.bends.map((b) => {
    const bp = getBendPoint(link.id, b.id, b.x, b.y);
    return { ...b, x: bp.x + nx * shift, y: bp.y + ny * shift };
  });
  const routingBends =
    shiftedBends.length > 0
      ? shiftedBends
      : Math.abs(shift) > 0.01
        ? [{ id: `${link.id}-auto-mid`, x: (trimmedFrom.x + trimmedTo.x) / 2 + nx * shift, y: (trimmedFrom.y + trimmedTo.y) / 2 + ny * shift }]
        : [];
  const points = polylinePoints(trimmedFrom, trimmedTo, routingBends);
  const midpoint = polylinePointAtRatio(points, Math.max(0, Math.min(1, (link.labelOffsetPct ?? 50) / 100)));

  return {
    points,
    shift,
    nx,
    ny,
    midpoint,
    badgeX: midpoint.x + (link.labelOffsetX ?? 0),
    badgeY: midpoint.y + (link.labelOffsetY ?? 0),
  };
};
