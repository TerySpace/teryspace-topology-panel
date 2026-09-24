import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css, cx, keyframes } from '@emotion/css';
import { ThresholdsConfig } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { MappingResult, TopologyCustomConfig, TopologyPanelOptions } from 'types';
import { createDefaultLink, getTopologyConfig } from 'options';
import { statusColor } from 'utils/colors';
import { resolveIconUrl } from 'utils/icons';
import { snapToGrid } from './math';
import { GraphLinkLayer } from './GraphLinkLayer';

interface Props {
  width: number;
  height: number;
  options: TopologyPanelOptions;
  mapping: MappingResult;
  statusThresholds?: ThresholdsConfig;
  panelBackground: string;
  canvasBackground: string;
  onOptionsChange: (options: TopologyPanelOptions) => void;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface DragState {
  type: 'node' | 'bend' | 'pan' | 'scale';
  id: string;
  bendId?: string;
  offsetX: number;
  offsetY: number;
}

interface Point {
  x: number;
  y: number;
}

interface NodeContextMenu {
  x: number;
  y: number;
  nodeId: string;
}

interface LinkHover {
  id: string;
  x: number;
  y: number;
}

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.12); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
`;

const heartbeat = keyframes`
  0% { transform: scale(1); }
  14% { transform: scale(1.16); }
  28% { transform: scale(1); }
  42% { transform: scale(1.14); }
  70% { transform: scale(1); }
  100% { transform: scale(1); }
`;

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const worldFromEvent = (event: React.MouseEvent<SVGSVGElement>, svg: SVGSVGElement, transform: Transform): Point => {
  const rect = svg.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  return {
    x: (sx - transform.x) / transform.k,
    y: (sy - transform.y) / transform.k,
  };
};

const shapePoints = (shape: 'triangle' | 'diamond', x: number, y: number, r: number): string => {
  if (shape === 'triangle') {
    return `${x},${y - r} ${x - r},${y + r} ${x + r},${y + r}`;
  }
  return `${x},${y - r} ${x - r},${y} ${x},${y + r} ${x + r},${y}`;
};

const modernBtn = css`
  border: 1px solid var(--tmc-border);
  background: linear-gradient(180deg, var(--tmc-btn-top), var(--tmc-btn-bot));
  color: var(--tmc-text);
  border-radius: 8px;
  height: 28px;
  min-width: 28px;
  padding: 0 8px;
  cursor: pointer;
  font-size: 12px;

  &:hover {
    border-color: var(--tmc-accent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const lockBtn = css`
  position: absolute;
  top: 10px;
  left: 10px;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 10px;
  background: var(--tmc-overlay-bg);
  border: 1px solid var(--tmc-overlay-border);
  color: var(--tmc-text);
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.75;

  &:hover {
    opacity: 1;
  }
`;

export const GraphCanvas: React.FC<Props> = ({ width, height, options, mapping, statusThresholds, panelBackground, canvasBackground, onOptionsChange }) => {
  const theme = useTheme2();
  const topology = getTopologyConfig(options);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scalePreviewRef = useRef<Point | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [connectFrom, setConnectFrom] = useState<string>('');
  const [nodePreview, setNodePreview] = useState<Record<string, Point>>({});
  const [bendPreview, setBendPreview] = useState<Record<string, Point>>({});
  const [scalePreview, setScalePreview] = useState<Point | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenu | null>(null);
  const [linkHover, setLinkHover] = useState<LinkHover | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: width * 0.05, y: height * 0.05, k: options.zoom.initial });
  const undoRef = useRef<TopologyCustomConfig[]>([]);
  const topoRef = useRef(topology);

  const nodesById = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n])), [topology.nodes]);
  const selectedNodeId = options.selectedNodeId || topology.selectedNodeId || '';
  const selectedLinkId = options.selectedLinkId || topology.selectedLinkId || '';
  const siblingLinksByPair = useMemo(() => {
    const byPair = new Map<string, string[]>();
    for (const l of topology.links) {
      if (!l.from || !l.to) {
        continue;
      }
      const key = [l.from, l.to].sort().join('::');
      byPair.set(key, [...(byPair.get(key) ?? []), l.id]);
    }
    return byPair;
  }, [topology.links]);
  const globalNodeValues = topology.global?.nodeValueVisibility ?? 'inherit';
  const globalLinkValues = topology.global?.linkValueVisibility ?? 'inherit';
  const contentBounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of topology.nodes) {
      xs.push(n.x - n.size, n.x + n.size);
      ys.push(n.y - n.size, n.y + n.size);
    }
    for (const l of topology.links) {
      for (const b of l.bends) {
        xs.push(b.x);
        ys.push(b.y);
      }
    }
    const maxX = xs.length ? Math.max(...xs) : width;
    const maxY = ys.length ? Math.max(...ys) : height;
    return { maxX, maxY };
  }, [height, topology.links, topology.nodes, width]);
  const canvasWidth = topology.global.autoScaleOnResize ? width : Math.max(width, contentBounds.maxX + 220);
  const canvasHeight = topology.global.autoScaleOnResize ? height : Math.max(height, contentBounds.maxY + 220);
  const statusScalePos = scalePreview ?? topology.global.statusScale;
  scalePreviewRef.current = statusScalePos;
  topoRef.current = topology;

  const pushHistory = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-24), JSON.parse(JSON.stringify(topoRef.current)) as TopologyCustomConfig];
  }, []);

  const applyOptions = useCallback((next: TopologyPanelOptions, trackHistory = false) => {
    if (trackHistory) {
      pushHistory();
    }
    onOptionsChange(next);
  }, [onOptionsChange, pushHistory]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
      if (isUndo) {
        const prev = undoRef.current.pop();
        if (!prev) {
          return;
        }
        e.preventDefault();
        onOptionsChange({
          ...options,
          topology: prev,
          selectedNodeId: prev.selectedNodeId ?? '',
          selectedLinkId: prev.selectedLinkId ?? '',
        });
        return;
      }

      if (e.key !== 'Delete') {
        return;
      }
      if (!options.editMode) {
        return;
      }

      if (selectedNodeId) {
        const nodeId = selectedNodeId;
        const attached = topology.links.filter((l) => l.from === nodeId || l.to === nodeId).length;
        if (attached > 1 && !window.confirm(`Node has ${attached} links. Delete node and all attached links?`)) {
          return;
        }
        applyOptions({
          ...options,
          topology: {
            ...topology,
            nodes: topology.nodes.filter((n) => n.id !== nodeId),
            links: topology.links.filter((l) => l.from !== nodeId && l.to !== nodeId),
          },
          selectedNodeId: '',
        }, true);
        return;
      }

      if (selectedLinkId) {
        applyOptions({
          ...options,
          topology: {
            ...topology,
            links: topology.links.filter((l) => l.id !== selectedLinkId),
          },
          selectedLinkId: '',
        }, true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyOptions, onOptionsChange, options, selectedLinkId, selectedNodeId, topology]);

  useEffect(() => {
    const prev = prevSizeRef.current;
    if (!prev) {
      prevSizeRef.current = { w: width, h: height };
      return;
    }
    if (prev.w === width && prev.h === height) {
      return;
    }
    if (!topology.global.autoScaleOnResize) {
      prevSizeRef.current = { w: width, h: height };
      return;
    }
    const sx = width / Math.max(prev.w, 1);
    const sy = height / Math.max(prev.h, 1);
    const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
    setTransform((t) => ({
      x: t.x * sx,
      y: t.y * sy,
      k: Math.max(options.zoom.min, Math.min(options.zoom.max, t.k * s)),
    }));
    prevSizeRef.current = { w: width, h: height };
  }, [height, options.zoom.max, options.zoom.min, topology.global.autoScaleOnResize, width]);

  const bendKey = (linkId: string, bendId: string) => `${linkId}:${bendId}`;

  const getNodePoint = (id: string): Point | undefined => {
    if (nodePreview[id]) {
      return nodePreview[id];
    }
    const node = nodesById.get(id);
    return node ? { x: node.x, y: node.y } : undefined;
  };

  const getBendPoint = (linkId: string, bendId: string, x: number, y: number): Point => bendPreview[bendKey(linkId, bendId)] ?? { x, y };

  const commitNodePosition = (id: string, x: number, y: number) => {
    const nx = options.grid.snap ? snapToGrid(x, options.grid.size) : x;
    const ny = options.grid.snap ? snapToGrid(y, options.grid.size) : y;
    applyOptions({
      ...options,
      topology: { ...topology, nodes: topology.nodes.map((n) => (n.id === id ? { ...n, x: nx, y: ny } : n)) },
    }, true);
  };

  const commitBendPosition = (linkId: string, bendId: string, x: number, y: number) => {
    const bx = options.grid.snap ? snapToGrid(x, options.grid.size) : x;
    const by = options.grid.snap ? snapToGrid(y, options.grid.size) : y;
    applyOptions({
      ...options,
      topology: {
        ...topology,
        links: topology.links.map((link) =>
        link.id !== linkId
          ? link
          : {
              ...link,
              bends: link.bends.map((b) => (b.id === bendId ? { ...b, x: bx, y: by } : b)),
            }
      ),
      },
    }, true);
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    if (!options.zoom.enabled || options.zoom.lock || !svgRef.current) {
      return;
    }
    event.preventDefault();

    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    const nextK = Math.max(options.zoom.min, Math.min(options.zoom.max, transform.k * factor));
    const rect = svgRef.current.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const wx = (sx - transform.x) / transform.k;
    const wy = (sy - transform.y) / transform.k;

    setTransform({ k: nextK, x: sx - wx * nextK, y: sy - wy * nextK });
  };

  const handleMouseDownBackground = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) {
      return;
    }

    const wantsPan = event.button === 1 || event.shiftKey || event.altKey || event.metaKey;
    if (wantsPan) {
      setDragState({ type: 'pan', id: '', offsetX: event.clientX - transform.x, offsetY: event.clientY - transform.y });
      return;
    }

    if (event.button !== 0) {
      return;
    }
    setNodeContextMenu(null);
    applyOptions({
      ...options,
      selectedNodeId: '',
      selectedLinkId: '',
      topology: { ...topology, selectedNodeId: '', selectedLinkId: '' },
    });

    // no add-node on background click (only via Add node button)
  };

  const handleNodeMouseDown = (event: React.MouseEvent, nodeId: string) => {
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
      const host = containerRef.current?.getBoundingClientRect();
      const x = host ? event.clientX - host.left : event.clientX;
      const y = host ? event.clientY - host.top : event.clientY;
      setNodeContextMenu({ x, y, nodeId });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu(null);

    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }

    if (options.editMode && options.connectMode && !options.zoom.lock) {
      if (!connectFrom) {
        setConnectFrom(nodeId);
      } else if (connectFrom !== nodeId) {
        const nextNum = Math.max(0, ...topology.links.map((l) => Number((l.id.match(/^l(\d+)$/i) ?? [])[1] ?? 0))) + 1;
        const linkId = `l${nextNum}`;
        const link = createDefaultLink(linkId, connectFrom, nodeId);
        applyOptions({
          ...options,
          selectedNodeId: '',
          selectedLinkId: linkId,
          topology: {
            ...topology,
            links: [
              ...topology.links,
              {
                ...link,
                label: `Link${nextNum}`,
                curve: topology.global.linkCurve,
                widthMode: topology.global.linkWidthMode,
                widthFixed: topology.global.linkFixedWidth,
                widthMin: topology.global.linkWidthMin,
                widthMax: topology.global.linkWidthMax,
              },
            ],
            selectedNodeId: '',
            selectedLinkId: linkId,
          },
        }, true);
        setConnectFrom('');
      }
      return;
    }

    applyOptions({
      ...options,
      selectedNodeId: nodeId,
      selectedLinkId: '',
      topology: { ...topology, selectedNodeId: nodeId, selectedLinkId: '' },
    });
    if (!options.editMode || options.zoom.lock || !svgRef.current) {
      return;
    }

    const pos = worldFromEvent(event as React.MouseEvent<SVGSVGElement>, svgRef.current, transform);
    setDragState({ type: 'node', id: nodeId, offsetX: pos.x - node.x, offsetY: pos.y - node.y });
  };

  useEffect(() => {
    if (dragState?.type !== 'scale') {
      return;
    }
    const onMove = (event: MouseEvent) => {
      const x = Math.max(6, Math.min(width - 30, event.clientX - dragState.offsetX));
      const y = Math.max(6, Math.min(height - 30, event.clientY - dragState.offsetY));
      setScalePreview({ x, y });
    };
    const onUp = () => {
      setDragState((current) => {
        if (current?.type !== 'scale') {
          return current;
        }
        const next = scalePreviewRef.current;
        if (next) {
          applyOptions({
            ...options,
            topology: {
              ...topology,
              global: {
                ...topology.global,
                statusScale: next,
              },
            },
          }, true);
        }
        setScalePreview(null);
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [applyOptions, dragState, height, onOptionsChange, options, topology, width]);

  const handleBendMouseDown = (event: React.MouseEvent, linkId: string, bendId: string, x: number, y: number) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu(null);
    applyOptions({
      ...options,
      selectedLinkId: linkId,
      selectedNodeId: '',
      topology: { ...topology, selectedLinkId: linkId, selectedNodeId: '' },
    });

    if (!options.editMode || options.zoom.lock || !svgRef.current) {
      return;
    }

    const pos = worldFromEvent(event as React.MouseEvent<SVGSVGElement>, svgRef.current, transform);
    setDragState({ type: 'bend', id: linkId, bendId, offsetX: pos.x - x, offsetY: pos.y - y });
  };

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!dragState || !svgRef.current) {
      return;
    }

    if (dragState.type === 'pan') {
      setTransform((prev) => ({ ...prev, x: event.clientX - dragState.offsetX, y: event.clientY - dragState.offsetY }));
      return;
    }

    if (dragState.type === 'scale') {
      const x = Math.max(6, Math.min(width - 30, event.clientX - dragState.offsetX));
      const y = Math.max(6, Math.min(height - 30, event.clientY - dragState.offsetY));
      setScalePreview({ x, y });
      return;
    }

    if (options.zoom.lock) {
      return;
    }

    const pos = worldFromEvent(event, svgRef.current, transform);

    if (dragState.type === 'node') {
      const x = options.grid.snap ? snapToGrid(pos.x - dragState.offsetX, options.grid.size) : pos.x - dragState.offsetX;
      const y = options.grid.snap ? snapToGrid(pos.y - dragState.offsetY, options.grid.size) : pos.y - dragState.offsetY;
      setNodePreview((prev) => ({ ...prev, [dragState.id]: { x, y } }));
    }

    if (dragState.type === 'bend' && dragState.bendId) {
      const x = options.grid.snap ? snapToGrid(pos.x - dragState.offsetX, options.grid.size) : pos.x - dragState.offsetX;
      const y = options.grid.snap ? snapToGrid(pos.y - dragState.offsetY, options.grid.size) : pos.y - dragState.offsetY;
      const bid = dragState.bendId;
      setBendPreview((prev) => ({ ...prev, [bendKey(dragState.id, bid)]: { x, y } }));
    }
  };

  const handleMouseUp = () => {
    if (dragState?.type === 'scale' && scalePreview) {
      applyOptions({
        ...options,
        topology: {
          ...topology,
          global: {
            ...topology.global,
            statusScale: scalePreview,
          },
        },
      }, true);
    }
    if (dragState?.type === 'node' && !options.zoom.lock) {
      const preview = nodePreview[dragState.id];
      if (preview) {
        commitNodePosition(dragState.id, preview.x, preview.y);
      }
    }

    if (dragState?.type === 'bend' && dragState.bendId && !options.zoom.lock) {
      const key = bendKey(dragState.id, dragState.bendId);
      const preview = bendPreview[key];
      if (preview) {
        commitBendPosition(dragState.id, dragState.bendId, preview.x, preview.y);
      }
    }

    setNodePreview({});
    setBendPreview({});
    setScalePreview(null);
    setDragState(null);
  };

  const renderNodeShell = (
    shape: TopologyCustomConfig['nodes'][number]['decoration']['shape'],
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke: string,
    strokeWidth: number
  ) => {
    if (shape === 'square') {
      return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }
    if (shape === 'triangle' || shape === 'diamond') {
      return <polygon points={shapePoints(shape, x, y, r)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    }
    return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  };

  const resetView = () => setTransform({ x: width * 0.05, y: height * 0.05, k: options.zoom.initial });
  const badgeText = (value?: string): string => {
    const trimmed = (value ?? '').trim();
    return trimmed && trimmed !== '-' ? trimmed : 'n/a';
  };

  const renderValueBadge = (
    x: number,
    y: number,
    text: string,
    textColor: string,
    options?: { fontSize?: number; badgeStyle?: 'pill' | 'text' },
    onClick?: (e: React.MouseEvent) => void
  ) => {
    const fontSize = Math.max(8, Math.min(28, Math.round(options?.fontSize ?? 11)));
    const badgeStyle = options?.badgeStyle ?? 'pill';
    const height = Math.max(18, fontSize + 8);
    const width = Math.max(32, text.length * (fontSize * 0.62) + 12);
    return (
      <g onClick={onClick} style={onClick ? { cursor: 'pointer', pointerEvents: 'auto' } : { pointerEvents: 'none' }}>
        {badgeStyle === 'pill' && (
          <rect
            x={x - width / 2}
            y={y - height + 3}
            width={width}
            height={height}
            rx={height / 2}
            fill={theme.isDark ? 'rgba(15,23,42,0.62)' : 'rgba(248,250,252,0.9)'}
            stroke={theme.isDark ? 'rgba(148,163,184,0.45)' : 'rgba(51,65,85,0.35)'}
            strokeWidth={1}
          />
        )}
        <text x={x} y={y} fill={textColor} fontSize={fontSize} textAnchor="middle">
          {text}
        </text>
      </g>
    );
  };
  const contextX = nodeContextMenu ? Math.max(6, Math.min(width - 90, nodeContextMenu.x)) : 0;
  const contextY = nodeContextMenu ? Math.max(6, Math.min(height - 44, nodeContextMenu.y)) : 0;
  const hoverMetric = linkHover ? mapping.linkMetrics[linkHover.id] : undefined;
  const hoverSeries = hoverMetric?.sparkline ?? [];
  const hoverRect = { w: 184, h: 90, p: 8 };
  const hoverX = linkHover ? Math.max(8, Math.min(width - hoverRect.w - 8, linkHover.x - (containerRef.current?.getBoundingClientRect().left ?? 0) + 12)) : 0;
  const hoverY = linkHover ? Math.max(8, Math.min(height - hoverRect.h - 8, linkHover.y - (containerRef.current?.getBoundingClientRect().top ?? 0) + 12)) : 0;
  const hoverPath = (() => {
    if (hoverSeries.length < 2) {
      return '';
    }
    const min = Math.min(...hoverSeries);
    const max = Math.max(...hoverSeries);
    const span = max - min || 1;
    const chartW = hoverRect.w - hoverRect.p * 2;
    const chartH = hoverRect.h - 28;
    return hoverSeries
      .map((v, i) => {
        const x = hoverRect.p + (i / (hoverSeries.length - 1)) * chartW;
        const y = hoverRect.p + chartH - ((v - min) / span) * chartH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  })();
  const selectLink = useCallback((linkId: string) => {
    applyOptions({
      ...options,
      selectedLinkId: linkId,
      selectedNodeId: '',
      topology: { ...topology, selectedLinkId: linkId, selectedNodeId: '' },
    });
  }, [applyOptions, options, topology]);

  return (
    <div
      ref={containerRef}
      style={
        {
          ['--tmc-border' as any]: theme.colors.border.medium,
          ['--tmc-btn-top' as any]: theme.isDark ? '#1f2937' : '#f8fafc',
          ['--tmc-btn-bot' as any]: theme.isDark ? '#111827' : '#e5e7eb',
          ['--tmc-text' as any]: theme.colors.text.primary,
          ['--tmc-accent' as any]: theme.colors.primary.main,
          ['--tmc-overlay-bg' as any]: theme.isDark ? 'rgba(20,20,20,.75)' : 'rgba(248,250,252,.92)',
          ['--tmc-overlay-border' as any]: theme.isDark ? 'rgba(255,255,255,.15)' : 'rgba(15,23,42,.15)',
        } as React.CSSProperties
      }
      className={css`
        width: ${width}px;
        height: ${height}px;
        position: relative;
        overflow: ${topology.global.autoScaleOnResize ? 'hidden' : 'auto'};
      `}
    >
      <svg
        ref={svgRef}
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDownBackground}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setLinkHover(null);
        }}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className={css`
          background: ${canvasBackground};
          cursor: ${dragState?.type === 'pan' ? 'grabbing' : 'default'};
          user-select: none;
        `}
      >
        <defs>
          <pattern id="topology-grid" width={options.grid.size} height={options.grid.size} patternUnits="userSpaceOnUse">
            <path d={`M ${options.grid.size} 0 L 0 0 0 ${options.grid.size}`} fill="none" stroke={theme.colors.border.weak} strokeWidth="0.6" />
          </pattern>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {options.grid.enabled && <rect width={canvasWidth * 2} height={canvasHeight * 2} x={-canvasWidth} y={-canvasHeight} fill="url(#topology-grid)" />}
          <GraphLinkLayer
            links={topology.links}
            nodesById={nodesById}
            siblingLinksByPair={siblingLinksByPair}
            mapping={mapping}
            selectedLinkId={selectedLinkId}
            globalLinkValues={globalLinkValues}
            topology={topology}
            options={options}
            theme={theme}
            getNodePoint={getNodePoint}
            getBendPoint={getBendPoint}
            onSelectLink={selectLink}
            setLinkHover={setLinkHover}
            renderValueBadge={renderValueBadge}
            badgeText={badgeText}
            handleBendMouseDown={handleBendMouseDown}
          />

          {topology.nodes.map((node) => {
            const display = getNodePoint(node.id) ?? { x: node.x, y: node.y };
            const metric = mapping.nodeMetrics[node.id];
            const status = metric?.status ?? node.status;
            const color = metric?.color || node.color || statusColor(status, options);
            const iconUrl = resolveIconUrl(node.icon, topology.iconPacks);
            const hasIcon = node.icon.type !== 'none' && Boolean(iconUrl);
            const isSelected = selectedNodeId === node.id;
            const labelPosRaw = node.labelPosition ?? 'outside-bottom';
            const iconSize = node.decoration.shape === 'triangle' ? node.size * 0.78 : node.size * 0.92;
            const iconYOffset = node.decoration.shape === 'triangle' ? node.size * 0.06 : 0;
            const nodeHaloEnabled = Boolean(node.decoration?.enabled);
            const decoStatus = mapping.nodeDecorationStatus[node.id];
            const decoEnabled = Boolean(node.statusDecoration?.enabled && decoStatus);
            const haloColor = decoEnabled
              ? node.statusDecoration.colors[decoStatus === 'unknown' ? 'ok' : decoStatus]
              : color;
            const haloWidth = Math.max(1, Math.min(10, node.decoration?.haloWidth ?? 2));
            const outlineColor = isSelected ? theme.colors.primary.main : theme.colors.border.medium;
            const outlineWidth = isSelected ? 2.8 : 1.5;
            const shellRadius = node.size * 0.82;
            const nodeShowValue =
              globalNodeValues === 'show' ? true : globalNodeValues === 'hide' ? false : node.showValue;
            const labelPos =
              (labelPosRaw === 'inside-top' || labelPosRaw === 'inside-bottom') && node.decoration.shape !== 'square'
                ? 'inside-center'
                : labelPosRaw;
            const shapeIsPointed = node.decoration.shape === 'triangle' || node.decoration.shape === 'diamond';
            const shapeInsetTop = shapeIsPointed ? 12 : 7;
            const shapeInsetBottom = shapeIsPointed ? 14 : 8;
            const insideTopBound = display.y - shellRadius + shapeInsetTop + (nodeHaloEnabled ? haloWidth : 0) + outlineWidth * 0.5;
            const insideBottomBound = display.y + shellRadius - shapeInsetBottom - (nodeHaloEnabled ? haloWidth : 0) - outlineWidth * 0.5;
            const squareInsideOffset = Math.max(10, shellRadius * 0.56);
            const insideTopY =
              node.decoration.shape === 'square'
                ? display.y - squareInsideOffset
                : Math.min(insideBottomBound - 12, Math.max(insideTopBound + 10, display.y - 6));
            const insideBottomY =
              node.decoration.shape === 'square'
                ? display.y + squareInsideOffset + 2
                : Math.max(insideTopBound + 12, Math.min(insideBottomBound - 4, display.y + 10));
            const labelX =
              labelPos === 'outside-left'
                ? display.x - node.size - 12
                : labelPos === 'outside-right'
                  ? display.x + node.size + 12
                  : display.x;
            const labelY =
              labelPos === 'outside-top'
                ? display.y - node.size - 8
                : labelPos === 'outside-bottom'
                  ? display.y + node.size + 14
                  : labelPos === 'inside-top'
                    ? insideTopY
                    : labelPos === 'inside-bottom'
                    ? insideBottomY
                      : display.y + 4;
            const labelYFinal =
              hasIcon && labelPos.startsWith('inside')
                ? node.decoration.shape === 'square'
                  ? labelY
                  : labelPos === 'inside-top'
                    ? display.y - iconSize * 0.16 + iconYOffset
                    : labelPos === 'inside-bottom'
                      ? display.y + iconSize * 0.2 + iconYOffset
                      : display.y + iconYOffset + 4
                : labelY;

            return (
              <g
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{ cursor: options.editMode && !options.zoom.lock ? 'grab' : 'pointer' }}
                className={cx(
                  node.animatedIcon?.enabled &&
                    node.animatedIcon.type === 'pulse' &&
                    css`
                      transform-origin: ${display.x}px ${display.y}px;
                      animation: ${pulse} ${Math.max(0.4, 2 / (node.animatedIcon?.speed || 1))}s ease-in-out infinite;
                    `,
                  node.animatedIcon?.enabled &&
                    node.animatedIcon.type === 'spin' &&
                    css`
                      transform-origin: ${display.x}px ${display.y}px;
                      animation: ${spin} ${Math.max(0.5, 4 / (node.animatedIcon?.speed || 1))}s linear infinite ${node.animatedIcon?.direction === 'ccw' ? 'reverse' : 'normal'};
                    `,
                  node.animatedIcon?.enabled &&
                    node.animatedIcon.type === 'heartbeat' &&
                    css`
                      transform-origin: ${display.x}px ${display.y}px;
                      animation: ${heartbeat} ${Math.max(0.55, 2.8 / (node.animatedIcon?.speed || 1))}s ease-in-out infinite;
                    `
                )}
              >
                {nodeHaloEnabled && renderNodeShell(node.decoration.shape, display.x, display.y, node.size * 0.9, 'transparent', haloColor, haloWidth)}
                {renderNodeShell(
                  node.decoration?.shape ?? 'circle',
                  display.x,
                  display.y,
                  shellRadius,
                  node.backgroundColor || theme.colors.background.primary,
                  outlineColor,
                  outlineWidth
                )}
                {hasIcon && <image href={iconUrl} x={display.x - iconSize / 2} y={display.y - iconSize / 2 + iconYOffset} width={iconSize} height={iconSize} />}
                <text
                  x={labelX}
                  y={labelYFinal}
                  textAnchor={labelPos === 'outside-left' ? 'end' : labelPos === 'outside-right' ? 'start' : 'middle'}
                  fontSize={12}
                  fill={isSelected ? theme.colors.primary.main : theme.colors.text.primary}
                  className={cx(
                    isSelected &&
                      css`
                        font-weight: 600;
                      `
                  )}
                >
                  {node.label}
                </text>
                {nodeShowValue && Boolean(metric?.valueText) && (
                  <text
                    x={display.x}
                    y={labelPos.startsWith('inside') ? display.y + node.size + 14 : display.y + node.size + 28}
                    textAnchor="middle"
                    fontSize={Math.max(8, Math.min(28, Math.round(node.valueFontSize ?? 11)))}
                    fill={theme.colors.text.secondary}
                  >
                    {metric?.valueText}
                  </text>
                )}
                {options.connectMode && options.editMode && connectFrom === node.id && (
                  <circle cx={display.x + node.size + 8} cy={display.y - node.size - 8} r={5} fill="#22c55e" />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <button
        className={lockBtn}
        onClick={() => {
          const nextLock = !options.zoom.lock;
          applyOptions({
            ...options,
            zoom: { ...options.zoom, lock: nextLock },
            connectMode: nextLock ? false : options.connectMode,
          });
        }}
        title={options.zoom.lock ? 'Unlock interactions' : 'Lock interactions'}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {options.zoom.lock ? (
            <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M7 10V8a5 5 0 0 1 7 -4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
          <rect
            x="5"
            y="10"
            width="14"
            height="11"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity={options.zoom.lock ? 1 : 0.75}
          />
        </svg>
      </button>

      {options.editMode && topology.showZoomControls && (
        <div
          className={css`
            position: absolute;
            right: 8px;
            bottom: 8px;
            display: flex;
            gap: 6px;
          `}
        >
          <button className={modernBtn} onClick={() => setTransform((prev) => ({ ...prev, k: Math.min(options.zoom.max, prev.k * 1.15) }))} disabled={options.zoom.lock}>+</button>
          <button className={modernBtn} onClick={() => setTransform((prev) => ({ ...prev, k: Math.max(options.zoom.min, prev.k / 1.15) }))} disabled={options.zoom.lock}>-</button>
          <button className={modernBtn} onClick={resetView}>reset</button>
        </div>
      )}

      {topology.global.showStatusScale && statusThresholds?.steps?.length ? (
        <div
          onMouseDown={(event) => {
            if (event.button !== 0 || !options.editMode || options.zoom.lock) {
              return;
            }
            setDragState({
              type: 'scale',
              id: 'status-scale',
              offsetX: event.clientX - statusScalePos.x,
              offsetY: event.clientY - statusScalePos.y,
            });
          }}
          className={css`
            position: absolute;
            left: ${statusScalePos.x}px;
            top: ${statusScalePos.y}px;
            background: ${theme.isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(248,250,252,0.9)'};
            border: 1px solid ${theme.colors.border.medium};
            border-radius: 8px;
            padding: 8px;
            font-size: 11px;
            color: ${theme.colors.text.primary};
            z-index: 11;
            cursor: ${options.editMode && !options.zoom.lock ? 'grab' : 'default'};
          `}
        >
          {(() => {
            const steps = statusThresholds.steps
              .slice()
              .sort((a, b) => (a.value ?? Number.NEGATIVE_INFINITY) - (b.value ?? Number.NEGATIVE_INFINITY));
            const gradient = steps.map((s, idx) => `${s.color} ${(idx / Math.max(steps.length - 1, 1)) * 100}%`).join(', ');
            const labels = steps.filter((s) => typeof s.value === 'number' && Number.isFinite(s.value));
            const len = Math.max(80, Math.min(800, topology.global.statusScaleLength || 180));
            const horizontal = topology.global.statusScaleOrientation === 'horizontal';
            const unit = (topology.global.statusScaleUnit ?? '').trim();
            const valueLabel = (v: number) => (topology.global.statusScaleShowUnit && unit ? `${v}${unit}` : String(v));
            const maxLabelLen = labels.length ? Math.max(...labels.map((s) => valueLabel(Number(s.value)).length)) : 4;
            const sidePad = horizontal ? Math.max(6, Math.ceil(maxLabelLen * 3.1)) : 0;
            const verticalTextWidth = Math.ceil(maxLabelLen * 7.6);
            const verticalWidth = Math.max(96, 24 + verticalTextWidth + 14);
            return (
              <>
                <div
                  className={css`
                    position: relative;
                    width: ${horizontal ? `${len + sidePad * 2}px` : `${verticalWidth}px`};
                    height: ${horizontal ? '46px' : `${len + 8}px`};
                  `}
                >
                  <div
                    className={css`
                      position: absolute;
                      left: ${horizontal ? `${sidePad}px` : '0'};
                      top: 4px;
                      width: ${horizontal ? `${len}px` : '16px'};
                      height: ${horizontal ? '16px' : `${len}px`};
                      border-radius: 8px;
                      border: 1px solid ${theme.colors.border.medium};
                      background: linear-gradient(${horizontal ? 'to right' : 'to top'}, ${gradient});
                    `}
                  />
                  {labels.map((s, idx) => {
                    const ratio = labels.length <= 1 ? 0 : idx / (labels.length - 1);
                    const verticalTop = 4 + (1 - ratio) * len;
                    const clampedVerticalTop = Math.max(4, Math.min(len + 4, verticalTop));
                    return (
                      <div
                        key={`${s.value}-${idx}`}
                        className={css`
                          position: absolute;
                          color: ${theme.colors.text.primary};
                          line-height: 1;
                          white-space: nowrap;
                          transform: ${horizontal ? 'translateX(-50%)' : 'translateY(-50%)'};
                          left: ${horizontal ? `${sidePad + 8 + ratio * Math.max(1, len - 16)}px` : '24px'};
                          top: ${horizontal ? '29px' : `${clampedVerticalTop}px`};
                        `}
                      >
                        {valueLabel(Number(s.value))}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      ) : null}
      {linkHover && hoverMetric ? (
        <div
          className={css`
            position: absolute;
            left: ${hoverX}px;
            top: ${hoverY}px;
            width: ${hoverRect.w}px;
            height: ${hoverRect.h}px;
            background: ${theme.isDark ? 'rgba(15,23,42,0.93)' : 'rgba(255,255,255,0.95)'};
            border: 1px solid ${theme.colors.border.medium};
            border-radius: 8px;
            padding: 6px 8px;
            z-index: 28;
            pointer-events: none;
          `}
        >
          <div className={css`font-size:11px;color:${theme.colors.text.primary};margin-bottom:4px;`}>
            {(topology.links.find((l) => l.id === linkHover.id)?.label || linkHover.id)} ({linkHover.id}): {hoverMetric.valueText || 'n/a'}
          </div>
          {hoverSeries.length > 1 ? (
            <svg width={hoverRect.w - 16} height={hoverRect.h - 26} viewBox={`0 0 ${hoverRect.w - 16} ${hoverRect.h - 26}`}>
              {Array.from({ length: 5 }).map((_, i) => {
                const y = ((hoverRect.h - 26) / 4) * i;
                return (
                  <line
                    key={`hy-${i}`}
                    x1={0}
                    x2={hoverRect.w - 16}
                    y1={y}
                    y2={y}
                    stroke={theme.colors.border.weak}
                    strokeWidth={0.8}
                    opacity={0.5}
                  />
                );
              })}
              {Array.from({ length: 7 }).map((_, i) => {
                const x = ((hoverRect.w - 16) / 6) * i;
                return (
                  <line
                    key={`hx-${i}`}
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={hoverRect.h - 26}
                    stroke={theme.colors.border.weak}
                    strokeWidth={0.8}
                    opacity={0.35}
                  />
                );
              })}
              <path d={hoverPath} fill="none" stroke={theme.colors.primary.main} strokeWidth={1.8} />
            </svg>
          ) : (
            <div className={css`font-size:11px;color:${theme.colors.text.secondary};`}>No time-series points</div>
          )}
        </div>
      ) : null}
      {nodeContextMenu && (
        <div
          className={css`
            position: absolute;
            left: ${contextX}px;
            top: ${contextY}px;
            z-index: 30;
            background: ${panelBackground};
            border: 1px solid ${theme.colors.border.medium};
            border-radius: 8px;
            padding: 4px;
            min-width: 76px;
          `}
        >
          <button
            className={modernBtn}
            style={{ width: '100%' }}
            onClick={() => {
              const source = topology.nodes.find((n) => n.id === nodeContextMenu.nodeId);
              if (!source) {
                setNodeContextMenu(null);
                return;
              }
              const nextNum = Math.max(0, ...topology.nodes.map((n) => Number((n.id.match(/^n(\d+)$/i) ?? [])[1] ?? 0))) + 1;
              const newId = `n${nextNum}`;
              const dup = { ...source, id: newId, label: `Node${nextNum}`, x: source.x + 26, y: source.y + 26 };
              applyOptions({
                ...options,
                selectedNodeId: newId,
                selectedLinkId: '',
                topology: {
                  ...topology,
                  selectedNodeId: newId,
                  selectedLinkId: '',
                  nodes: [...topology.nodes, dup],
                },
              }, true);
              setNodeContextMenu(null);
            }}
          >
            Duplicate
          </button>
        </div>
      )}
    </div>
  );
};
