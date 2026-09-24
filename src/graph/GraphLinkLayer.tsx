import React from 'react';
import { css, cx, keyframes } from '@emotion/css';
import { MappingResult, TopologyCustomConfig, TopologyLink, TopologyNode, TopologyPanelOptions } from 'types';
import { statusColor } from 'utils/colors';
import { pointsToBezierPath, pointsToPath } from './math';
import { computeLinkLayout } from './linkLayout';

interface Point {
  x: number;
  y: number;
}

interface LinkHoverState {
  id: string;
  x: number;
  y: number;
}

interface ThemeLike {
  isDark: boolean;
  colors: {
    primary: { main: string };
    background: { primary: string };
  };
}

interface Props {
  links: TopologyLink[];
  nodesById: Map<string, TopologyNode>;
  siblingLinksByPair: Map<string, string[]>;
  mapping: MappingResult;
  selectedLinkId: string;
  globalLinkValues: TopologyCustomConfig['global']['linkValueVisibility'];
  topology: TopologyCustomConfig;
  options: TopologyPanelOptions;
  theme: ThemeLike;
  getNodePoint: (id: string) => Point | undefined;
  getBendPoint: (linkId: string, bendId: string, x: number, y: number) => Point;
  onSelectLink: (linkId: string) => void;
  setLinkHover: React.Dispatch<React.SetStateAction<LinkHoverState | null>>;
  renderValueBadge: (
    x: number,
    y: number,
    text: string,
    textColor: string,
    options?: { fontSize?: number; badgeStyle?: 'pill' | 'text' },
    onClick?: (e: React.MouseEvent) => void
  ) => React.ReactNode;
  badgeText: (value?: string) => string;
  handleBendMouseDown: (event: React.MouseEvent, linkId: string, bendId: string, x: number, y: number) => void;
}

const flow = keyframes`
  from { stroke-dashoffset: 26; }
  to { stroke-dashoffset: 0; }
`;

const flowReverse = keyframes`
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: 26; }
`;

const linkSelectPulse = keyframes`
  0% { opacity: 0.25; }
  50% { opacity: 1; }
  100% { opacity: 0.25; }
`;

const arrowHeadPath = (tip: Point, from: Point, width: number, height: number): string => {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.max(Math.hypot(dx, dy), 1);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const baseX = tip.x - ux * height;
  const baseY = tip.y - uy * height;
  const wing = Math.max(1, width / 2);
  const p1 = `${tip.x},${tip.y}`;
  const p2 = `${baseX + nx * wing},${baseY + ny * wing}`;
  const p3 = `${baseX - nx * wing},${baseY - ny * wing}`;
  return `M ${p1} L ${p2} L ${p3} Z`;
};

export const GraphLinkLayer: React.FC<Props> = ({
  links,
  nodesById,
  siblingLinksByPair,
  mapping,
  selectedLinkId,
  globalLinkValues,
  topology,
  options,
  theme,
  getNodePoint,
  getBendPoint,
  onSelectLink,
  setLinkHover,
  renderValueBadge,
  badgeText,
  handleBendMouseDown,
}) => {
  return (
    <>
      {links
        .filter((l) => l.from && l.to && nodesById.has(l.from) && nodesById.has(l.to))
        .map((link) => {
          const from = getNodePoint(link.from)!;
          const to = getNodePoint(link.to)!;
          const fromNode = nodesById.get(link.from)!;
          const toNode = nodesById.get(link.to)!;
          const key = [link.from, link.to].sort().join('::');
          const siblings = siblingLinksByPair.get(key) ?? [link.id];
          const { points, shift, nx, ny, badgeX, badgeY } = computeLinkLayout({
            link,
            from,
            to,
            fromNode,
            toNode,
            siblingIds: siblings,
            getBendPoint,
            parallelSpacing: topology.global.linkParallelSpacing ?? 8,
          });

          const path = link.curve === 'bezier' ? pointsToBezierPath(points) : pointsToPath(points);
          const metric = mapping.linkMetrics[link.id];
          const status = metric?.status ?? 'unknown';
          const color = link.colorMode === 'fixed' ? link.colorFixed || '#9ca3af' : metric?.color ?? statusColor(status, options);

          const widthRaw =
            link.widthMode === 'fixed'
              ? link.widthFixed || 2
              : (() => {
                  const value = metric?.numeric;
                  if (value === undefined) {
                    return link.widthMin || 1;
                  }
                  const min = link.widthMin || 1;
                  const max = link.widthMax || 8;
                  const ratio = Math.max(0, Math.min(1, value / (topology.thresholds.crit || 100)));
                  return min + (max - min) * ratio;
                })();
          const widthValue = Math.max(1, Math.min(24, widthRaw));

          const isSelected = selectedLinkId === link.id;
          const linkShowValue =
            globalLinkValues === 'show' ? true : globalLinkValues === 'hide' ? false : link.showValue;
          const useDirectionalFlow = link.animate.mode === 'byDirectional' && link.animate.enabled;
          const inN = metric?.directional?.inNumeric ?? 0;
          const outN = metric?.directional?.outNumeric ?? 0;
          const flowDir: 'forward' | 'backward' = outN >= inN ? 'forward' : 'backward';
          const dashBase =
            link.animate.enabled
              ? (link.animate.style === 'dash' ? '8 6' : '12 14')
              : undefined;
          const lineDash = !link.animate.enabled && link.lineStyle === 'dashed' ? '7 5' : undefined;
          const strokeDash = dashBase || lineDash;
          const arrowW = Math.max(2, topology.global.arrowWidth ?? 5) * Math.max(0.65, Math.min(1.6, widthValue / 2));
          const arrowH = Math.max(2, topology.global.arrowHeight ?? 6) * Math.max(0.65, Math.min(1.5, widthValue / 2));
          const arrowOffset = Math.max(0, topology.global.arrowOffset ?? 0.5);
          const startForDir = points[0];
          const nextForStart = points[1] ?? points[0];
          const endForDir = points[points.length - 1];
          const prevForEnd = points[points.length - 2] ?? points[points.length - 1];
          const directionalBadgeOffset = Math.max(16, widthValue * 3.5);
          const shiftTip = (tip: Point, fromDir: Point, offset: number): Point => {
            const dx = tip.x - fromDir.x;
            const dy = tip.y - fromDir.y;
            const len = Math.max(Math.hypot(dx, dy), 1);
            return { x: tip.x + (dx / len) * offset, y: tip.y + (dy / len) * offset };
          };

          return (
            <g key={link.id}>
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(14, widthValue + 10)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink(link.id);
                }}
                onMouseEnter={(e) => setLinkHover({ id: link.id, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setLinkHover({ id: link.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setLinkHover((cur) => (cur?.id === link.id ? null : cur))}
                style={{ cursor: 'pointer' }}
              >
                <title>{link.label || link.id}</title>
              </path>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={widthValue}
                strokeDasharray={strokeDash}
                className={cx(
                  link.animate.enabled &&
                    css`
                      animation: ${(useDirectionalFlow && flowDir === 'backward') ? flowReverse : flow} ${Math.max(0.2, 2 / (link.animate.speed || 1))}s linear infinite;
                    `
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink(link.id);
                }}
                onMouseEnter={(e) => setLinkHover({ id: link.id, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setLinkHover({ id: link.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setLinkHover((cur) => (cur?.id === link.id ? null : cur))}
                style={{ cursor: 'pointer' }}
              >
                <title>{link.label || link.id}</title>
              </path>
              {!link.animate.enabled && (link.arrow === 'forward' || link.arrow === 'both') && (
                <path d={arrowHeadPath(shiftTip(endForDir, prevForEnd, arrowOffset), prevForEnd, arrowW, arrowH)} fill={color} stroke={color} strokeWidth={0.7} pointerEvents="none" />
              )}
              {!link.animate.enabled && (link.arrow === 'backward' || link.arrow === 'both') && (
                <path d={arrowHeadPath(shiftTip(startForDir, nextForStart, arrowOffset), nextForStart, arrowW, arrowH)} fill={color} stroke={color} strokeWidth={0.7} pointerEvents="none" />
              )}
              {isSelected && (
                <path
                  d={path}
                  fill="none"
                  stroke={theme.colors.primary.main}
                  strokeWidth={Math.max(widthValue + 2.5, 4)}
                  opacity={0.4}
                  className={css`
                    animation: ${linkSelectPulse} 1.4s ease-in-out infinite;
                    pointer-events: none;
                  `}
                />
              )}

              {linkShowValue && !link.directional.enabled && (
                renderValueBadge(badgeX, badgeY - 8, badgeText(metric?.valueText), '#e2e8f0', { fontSize: link.valueFontSize, badgeStyle: link.valueBadgeStyle }, (e) => {
                  e.stopPropagation();
                  onSelectLink(link.id);
                })
              )}

              {linkShowValue && link.directional.enabled && (
                <>
                  {renderValueBadge(badgeX - nx * directionalBadgeOffset, badgeY - ny * directionalBadgeOffset, badgeText(metric?.directional?.inText), '#93c5fd', { fontSize: link.valueFontSize, badgeStyle: link.valueBadgeStyle }, (e) => {
                    e.stopPropagation();
                    onSelectLink(link.id);
                  })}
                  {renderValueBadge(badgeX + nx * directionalBadgeOffset, badgeY + ny * directionalBadgeOffset, badgeText(metric?.directional?.outText), '#facc15', { fontSize: link.valueFontSize, badgeStyle: link.valueBadgeStyle }, (e) => {
                    e.stopPropagation();
                    onSelectLink(link.id);
                  })}
                </>
              )}

              {isSelected && options.editMode &&
                link.bends.map((bend) => {
                  const bp = getBendPoint(link.id, bend.id, bend.x, bend.y);
                  return (
                    <circle
                      key={bend.id}
                      cx={bp.x + nx * shift}
                      cy={bp.y + ny * shift}
                      r={6}
                      fill={theme.colors.background.primary}
                      stroke={theme.colors.primary.main}
                      strokeWidth={2}
                      onMouseDown={(e) => handleBendMouseDown(e, link.id, bend.id, bp.x, bp.y)}
                      style={{ cursor: options.zoom.lock ? 'not-allowed' : 'grab' }}
                    />
                  );
                })}
            </g>
          );
        })}
    </>
  );
};
