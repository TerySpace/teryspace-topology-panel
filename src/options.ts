import { PanelModel } from '@grafana/data';
import { TopologyCustomConfig, TopologyLink, TopologyNode, TopologyPanelOptions } from './types';
import { builtinIconKeys, builtinIconPacks } from 'utils/icons';

const defaultNode = (id: string, x = 160, y = 120): TopologyNode => ({
  id,
  label: `Node ${id}`,
  labelPosition: 'outside-bottom',
  x,
  y,
  size: 30,
  icon: { type: 'builtin', value: builtinIconKeys[0] },
  status: 'unknown',
  color: '',
  showValue: false,
  valueFontSize: 11,
  valueFormat: '',
  animatedIcon: { enabled: false, type: 'pulse', speed: 1, direction: 'cw' },
  sourceBy: 'seriesName',
  sourceValue: '',
  matchBy: 'fieldName',
  matchValue: '',
  valueField: '',
  valueUnit: '',
  valueDivisor: 1,
  aggregate: 'last',
  decoration: {
    enabled: true,
    outline: true,
    haloWidth: 2,
    shape: "circle",
  },
  statusDecoration: {
    enabled: false,
    sourceBy: 'seriesName',
    sourceValue: '',
    matchBy: 'seriesName',
    matchValue: '',
    valueField: '',
    aggregate: 'last',
    mode: 'binary',
    thresholds: {
      warn: 1,
      crit: 0,
    },
    thresholdDirection: 'higherIsWorse',
    colors: {
      ok: '#22c55e',
      warn: '#f59e0b',
      crit: '#ef4444',
    },
  },
});

export const createDefaultNode = defaultNode;

export const createDefaultLink = (id: string, from: string, to: string): TopologyLink => ({
  id,
  label: `Link ${id}`,
  from,
  to,
  status: 'unknown',
  colorMode: 'threshold',
  colorFixed: '#8E8E8E',
  widthMode: 'fixed',
  widthFixed: 2,
  widthMin: 1,
  widthMax: 8,
  sourceBy: 'seriesName',
  sourceValue: '',
  matchBy: 'fieldName',
  matchValue: '',
  valueField: '',
  valueUnit: '',
  aggregate: 'last',
  showValue: false,
  valueFontSize: 11,
  valueBadgeStyle: 'pill',
  bends: [],
  curve: 'polyline',
  lineStyle: 'solid',
  animate: { enabled: true, style: 'flow', speed: 1, mode: 'fixed', forwardColor: '', backwardColor: '' },
  directional: {
    enabled: false,
    inMatchBy: 'fieldName',
    inMatchValue: '',
    outMatchBy: 'fieldName',
    outMatchValue: '',
    inTargetValue: '',
    outTargetValue: '',
    inField: "",
    outField: "",
    aggregate: "last",
  },
  thresholdDirection: "higherIsWorse",
  arrow: 'none',
  anchorFrom: 'center',
  anchorTo: 'center',
  labelOffsetPct: 50,
  labelOffsetX: 0,
  labelOffsetY: 0,
});

export const defaultOptions: TopologyPanelOptions = {
  schemaVersion: 5,
  editMode: true,
  connectMode: false,
  selectedNodeId: '',
  selectedLinkId: '',
  grid: {
    enabled: true,
    size: 24,
    snap: true,
  },
  zoom: {
    enabled: true,
    min: 0.3,
    max: 3,
    lock: false,
    initial: 1,
  },
  topology: {
    theme: {
      statusColors: {
        ok: '#22c55e',
        warn: '#f59e0b',
        crit: '#ef4444',
        unknown: '#6b7280',
      },
    },
    thresholds: {
      warn: 70,
      crit: 90,
    },
    selectedNodeId: '',
    selectedLinkId: '',
    nodes: [defaultNode('n1', 140, 120), defaultNode('n2', 360, 220)],
    links: [createDefaultLink('l1', 'n1', 'n2')],
    iconPacks: builtinIconPacks,
    valueUnit: "none",
    showZoomControls: true,
    global: {
      autoScaleOnResize: true,
      useCustomNodeUnit: false,
      useCustomLinkUnit: false,
      nodeHalo: 'inherit',
      nodeValueVisibility: 'inherit',
      linkValueVisibility: 'inherit',
      linkFixedWidth: 2,
      linkWidthMode: 'fixed',
      linkWidthMin: 1,
      linkWidthMax: 8,
      linkCurve: 'polyline',
      linkParallelSpacing: 8,
      arrowWidth: 6,
      arrowHeight: 7,
      arrowOffset: 2,
      showStatusScale: false,
      showLinkHoverGraph: true,
      statusScaleOrientation: 'vertical',
      statusScaleLength: 180,
      statusScaleShowUnit: true,
      statusScaleUnit: '',
      statusScale: {
        x: 10,
        y: 48,
      },
    },
  },
};

export const getTopologyConfig = (options: TopologyPanelOptions): TopologyCustomConfig => {
  return options.topology ?? defaultOptions.topology;
};

const normalizeLegacyValueField = (valueField: unknown, matchBy: unknown): string => {
  const normalized = typeof valueField === 'string' ? valueField.trim() : '';
  if (normalized === 'Value' && matchBy === 'seriesName') {
    return '';
  }
  return normalized;
};

export const migrationHandler = (panel: PanelModel<any>): TopologyPanelOptions => {
  const incoming = (panel.options ?? {}) as Partial<TopologyPanelOptions>;
  const incomingTopology = (incoming.topology ?? {}) as Partial<TopologyCustomConfig>;
  const legacyIncoming = incoming as any;
  const incomingNodes = (incomingTopology.nodes ?? legacyIncoming.nodes ?? defaultOptions.topology.nodes) as TopologyNode[];
  const incomingLinks = (incomingTopology.links ?? legacyIncoming.links ?? defaultOptions.topology.links) as TopologyLink[];
  const usedNodeIds = new Set<string>();
  const nodeIdRemap = new Map<string, string>();
  let nodeSeq = 1;

  const normalizedNodes = incomingNodes.map((n: TopologyNode, idx: number) => {
    const desired = n.id || `n${idx + 1}`;
    let id = desired;
    if (!/^n\d+$/i.test(id) || usedNodeIds.has(id)) {
      while (usedNodeIds.has(`n${nodeSeq}`)) {
        nodeSeq++;
      }
      id = `n${nodeSeq}`;
      nodeSeq++;
    } else {
      const parsed = Number((id.match(/^n(\d+)$/i) ?? [])[1] ?? 0);
      if (parsed >= nodeSeq) {
        nodeSeq = parsed + 1;
      }
    }
    usedNodeIds.add(id);
    if (desired !== id && !nodeIdRemap.has(desired)) {
      nodeIdRemap.set(desired, id);
    }
    return { ...n, id };
  });

  const usedLinkIds = new Set<string>();
  let linkSeq = 1;
  const normalizedLinks = incomingLinks.map((l: TopologyLink, idx: number) => {
    const desired = l.id || `l${idx + 1}`;
    let id = desired;
    if (!/^l\d+$/i.test(id) || usedLinkIds.has(id)) {
      while (usedLinkIds.has(`l${linkSeq}`)) {
        linkSeq++;
      }
      id = `l${linkSeq}`;
      linkSeq++;
    } else {
      const parsed = Number((id.match(/^l(\d+)$/i) ?? [])[1] ?? 0);
      if (parsed >= linkSeq) {
        linkSeq = parsed + 1;
      }
    }
    usedLinkIds.add(id);
    const from = nodeIdRemap.get(l.from) ?? l.from;
    const to = nodeIdRemap.get(l.to) ?? l.to;
    return { ...l, id, from, to };
  });
  const migrated: TopologyPanelOptions = {
    ...defaultOptions,
    ...incoming,
    grid: { ...defaultOptions.grid, ...(incoming.grid ?? {}) },
    zoom: { ...defaultOptions.zoom, ...(incoming.zoom ?? {}) },
    topology: {
      ...defaultOptions.topology,
      ...incomingTopology,
      theme: {
        ...defaultOptions.topology.theme,
        ...(legacyIncoming.theme ?? {}),
        ...(incomingTopology.theme ?? {}),
        statusColors: {
          ...defaultOptions.topology.theme.statusColors,
          ...(legacyIncoming.theme?.statusColors ?? {}),
          ...(incomingTopology.theme?.statusColors ?? {}),
        },
      },
      thresholds: { ...defaultOptions.topology.thresholds, ...(incomingTopology.thresholds ?? legacyIncoming.thresholds ?? {}) },
      nodes: normalizedNodes.map((n: TopologyNode, idx: number) => ({
        ...defaultNode(n.id ?? `n${idx + 1}`),
        ...n,
        valueField: normalizeLegacyValueField((n as any).valueField, n.matchBy),
        labelPosition:
          (n as any).labelPosition === 'below'
            ? 'outside-bottom'
            : (n as any).labelPosition === 'inside'
              ? 'inside-center'
              : (n.labelPosition ?? 'outside-bottom'),
        animatedIcon: {
          enabled: n.animatedIcon?.enabled ?? false,
          type: n.animatedIcon?.type ?? "pulse",
          speed: n.animatedIcon?.speed ?? 1,
          direction: n.animatedIcon?.direction ?? 'cw',
          frames: n.animatedIcon?.frames ?? [],
        },
        decoration: {
          ...defaultNode('tmp').decoration,
          ...(n.decoration ?? {}),
          haloWidth: n.decoration?.haloWidth ?? defaultNode('tmp').decoration.haloWidth,
        },
        statusDecoration: {
          ...defaultNode('tmp').statusDecoration,
          ...(n.statusDecoration ?? {}),
          valueField: normalizeLegacyValueField((n.statusDecoration as any)?.valueField, n.statusDecoration?.matchBy),
          thresholds: {
            ...defaultNode('tmp').statusDecoration.thresholds,
            ...(n.statusDecoration?.thresholds ?? {}),
          },
          colors: {
            ...defaultNode('tmp').statusDecoration.colors,
            ...(n.statusDecoration?.colors ?? {}),
          },
        },
      })),
      links: normalizedLinks
        .filter((l: TopologyLink) => l.from && l.to)
        .map((l: TopologyLink, idx: number) => ({
          ...createDefaultLink(l.id ?? `l${idx + 1}`, l.from, l.to),
          ...l,
          valueField: normalizeLegacyValueField((l as any).valueField, l.matchBy),
          colorMode: (l as any).colorMode === 'byStatus' ? 'threshold' : (l.colorMode ?? 'threshold'),
          bends: l.bends ?? [],
          animate: { ...createDefaultLink('tmp', 'n1', 'n2').animate, ...(l.animate ?? {}) },
          directional: {
            ...createDefaultLink('tmp', 'n1', 'n2').directional,
            ...(l.directional ?? {}),
            inField: normalizeLegacyValueField((l.directional as any)?.inField, l.directional?.inMatchBy),
            outField: normalizeLegacyValueField((l.directional as any)?.outField, l.directional?.outMatchBy),
          },
          thresholdDirection: l.thresholdDirection ?? "higherIsWorse",
        })),
      iconPacks:
        incomingTopology.iconPacks?.length
          ? incomingTopology.iconPacks
          : legacyIncoming.iconPacks?.length
            ? legacyIncoming.iconPacks
            : defaultOptions.topology.iconPacks,
      valueUnit: incomingTopology.valueUnit ?? legacyIncoming.valueUnit ?? defaultOptions.topology.valueUnit,
      showZoomControls: incomingTopology.showZoomControls ?? legacyIncoming.showZoomControls ?? defaultOptions.topology.showZoomControls,
      global: {
        ...defaultOptions.topology.global,
        ...(legacyIncoming.global ?? {}),
        ...(incomingTopology.global ?? {}),
        statusScale: {
          ...defaultOptions.topology.global.statusScale,
          ...(legacyIncoming.global?.statusScale ?? {}),
          ...(incomingTopology.global?.statusScale ?? {}),
        },
      },
    },
    schemaVersion: 5,
  };

  return migrated;
};
