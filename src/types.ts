import { FieldType } from '@grafana/data';

export type Status = 'ok' | 'warn' | 'crit' | 'unknown';
export type MatchBy = 'refId' | 'fieldName' | 'seriesName' | 'label';
export type AggregateMode = 'first' | 'last' | 'max' | 'min' | 'avg' | 'join';
export type AnchorSide = 'center' | 'top' | 'right' | 'bottom' | 'left';

export interface IconRef {
  type: 'url' | 'builtin' | 'pack' | 'none';
  value: string;
}

export interface AnimatedIcon {
  enabled: boolean;
  type: 'pulse' | 'spin' | 'heartbeat' | 'frames';
  speed: number;
  direction?: 'cw' | 'ccw';
  frames?: string[];
}

export interface BendPoint {
  id: string;
  x: number;
  y: number;
}

export interface IconPackItem {
  key: string;
  path: string;
}

export interface IconPack {
  id: string;
  name: string;
  type: 'builtin' | 'url';
  baseUrl?: string;
  items: IconPackItem[];
}

export interface Thresholds {
  warn: number;
  crit: number;
}

export interface MatchConfig {
  sourceBy?: 'refId' | 'seriesName';
  sourceValue?: string;
  matchBy: MatchBy;
  matchValue: string;
  valueField?: string | string[];
  aggregate: AggregateMode;
}

export interface TopologyNode extends MatchConfig {
  id: string;
  label: string;
  labelPosition: 'outside-bottom' | 'outside-top' | 'outside-left' | 'outside-right' | 'inside-top' | 'inside-bottom' | 'inside-center';
  x: number;
  y: number;
  size: number;
  icon: IconRef;
  status: Status;
  color?: string;
  backgroundColor?: string;
  showValue: boolean;
  valueFontSize?: number;
  valueFormat?: string;
  valueUnit?: string;
  valueDivisor?: number;
  animatedIcon?: AnimatedIcon;
  decoration: {
    enabled: boolean;
    outline: boolean;
    haloWidth: number;
    shape: "circle" | "square" | "triangle" | "diamond";
  };
  statusDecoration: MatchConfig & {
    enabled: boolean;
    mode: 'binary' | 'thresholds';
    thresholds: {
      warn: number;
      crit: number;
    };
    thresholdDirection: 'higherIsWorse' | 'lowerIsWorse';
    colors: {
      ok: string;
      warn: string;
      crit: string;
    };
  };
}

export interface TopologyLink extends MatchConfig {
  id: string;
  label: string;
  from: string;
  to: string;
  status: Status;
  colorMode: 'fixed' | 'threshold';
  colorFixed?: string;
  widthMode: 'fixed' | 'byValue';
  widthFixed?: number;
  widthMin?: number;
  widthMax?: number;
  showValue: boolean;
  valueFontSize?: number;
  valueBadgeStyle?: 'pill' | 'text';
  valueUnit?: string;
  valueDivisor?: number;
  bends: BendPoint[];
  curve: 'polyline' | 'bezier';
  lineStyle: 'solid' | 'dashed';
  animate: {
    enabled: boolean;
    style: 'flow' | 'dash';
    speed: number;
    mode: 'fixed' | 'byDirectional';
    forwardColor?: string;
    backwardColor?: string;
  };
  directional: {
    enabled: boolean;
    inMatchBy?: MatchBy;
    inMatchValue?: string;
    outMatchBy?: MatchBy;
    outMatchValue?: string;
    inTargetValue?: string;
    outTargetValue?: string;
    inField?: string;
    outField?: string;
    aggregate: AggregateMode;
  };
  thresholdDirection: "higherIsWorse" | "lowerIsWorse";
  arrow: 'none' | 'forward' | 'backward' | 'both';
  anchorFrom: AnchorSide;
  anchorTo: AnchorSide;
  labelOffsetPct: number;
  labelOffsetX: number;
  labelOffsetY: number;
}

export interface GridOptions {
  enabled: boolean;
  size: number;
  snap: boolean;
}

export interface ZoomOptions {
  enabled: boolean;
  min: number;
  max: number;
  lock: boolean;
  initial: number;
}

export interface ThemeOptions {
  statusColors: Record<Status, string>;
}

export interface TopologyPanelOptions {
  schemaVersion: number;
  editMode: boolean;
  connectMode: boolean;
  selectedNodeId?: string;
  selectedLinkId?: string;
  grid: GridOptions;
  zoom: ZoomOptions;
  topology: TopologyCustomConfig;
}

export interface TopologyCustomConfig {
  theme: ThemeOptions;
  thresholds: Thresholds;
  selectedNodeId?: string;
  selectedLinkId?: string;
  nodes: TopologyNode[];
  links: TopologyLink[];
  iconPacks: IconPack[];
  valueUnit: string;
  showZoomControls: boolean;
  global: {
    autoScaleOnResize: boolean;
    useCustomNodeUnit: boolean;
    useCustomLinkUnit: boolean;
    nodeHalo: 'inherit' | 'on' | 'off';
    nodeValueVisibility: 'inherit' | 'show' | 'hide';
    linkValueVisibility: 'inherit' | 'show' | 'hide';
    linkFixedWidth: number;
    linkWidthMode: 'fixed' | 'byValue';
    linkWidthMin: number;
    linkWidthMax: number;
    linkCurve: 'polyline' | 'bezier';
    linkParallelSpacing: number;
    arrowWidth: number;
    arrowHeight: number;
    arrowOffset: number;
    showStatusScale: boolean;
    showLinkHoverGraph: boolean;
    statusScaleOrientation: 'vertical' | 'horizontal';
    statusScaleLength: number;
    statusScaleShowUnit: boolean;
    statusScaleUnit: string;
    statusScale: {
      x: number;
      y: number;
    };
  };
}

export interface ResolvedMetric {
  values: Array<number | string>;
  sparkline?: number[];
  valueText: string;
  numeric?: number;
  status: Status;
  color?: string;
  directional?: {
    inText: string;
    outText: string;
    inNumeric?: number;
    outNumeric?: number;
  };
}

export interface MappingResult {
  nodeMetrics: Record<string, ResolvedMetric>;
  linkMetrics: Record<string, ResolvedMetric>;
  nodeDecorationStatus: Record<string, Status>;
}

export interface ExtractedValue {
  value: number | string;
  fieldType: FieldType;
}
