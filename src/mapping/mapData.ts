import { PanelData, ThresholdsConfig, getValueFormat } from '@grafana/data';
import { ExtractedValue, MatchConfig, MappingResult, ResolvedMetric, Status, TopologyCustomConfig, TopologyLink, TopologyPanelOptions } from 'types';
import { getTopologyConfig } from 'options';
import { candidateMatchesConfig, collectValueCandidates } from './queryTargets';

const toNumeric = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
};

const extractValues = (data: PanelData, cfg: MatchConfig): ExtractedValue[] => {
  return collectValueCandidates(data.series)
    .filter((candidate) => candidateMatchesConfig(candidate, cfg))
    .map((candidate) => ({ value: candidate.value, fieldType: candidate.fieldType }));
};

const aggregate = (values: ExtractedValue[], mode: MatchConfig['aggregate']): Array<number | string> => {
  if (!values.length) {
    return [];
  }

  const raw = values.map((v) => v.value);
  const numeric = raw.map(toNumeric).filter((v): v is number => v !== undefined);

  switch (mode) {
    case 'first':
      return [raw[0] as number | string];
    case 'last':
      return [raw[raw.length - 1] as number | string];
    case 'max':
      return numeric.length ? [Math.max(...numeric)] : [raw[raw.length - 1] as number | string];
    case 'min':
      return numeric.length ? [Math.min(...numeric)] : [raw[0] as number | string];
    case 'avg':
      return numeric.length ? [numeric.reduce((a, b) => a + b, 0) / numeric.length] : [raw[raw.length - 1] as number | string];
    case 'join':
      return raw.slice(0, 5).map((v) => String(v));
    default:
      return [raw[raw.length - 1] as number | string];
  }
};

const applyDisplayDivisor = (values: Array<number | string>, divisor?: number): Array<number | string> => {
  const safeDivisor = typeof divisor === 'number' && Number.isFinite(divisor) && divisor > 0 ? divisor : 1;
  if (safeDivisor === 1) {
    return values;
  }
  return values.map((value) => {
    const numeric = toNumeric(value);
    return numeric === undefined ? value : numeric / safeDivisor;
  });
};

export const statusByThresholds = (
  value: number | undefined,
  thresholds: TopologyCustomConfig['thresholds'],
  direction: 'higherIsWorse' | 'lowerIsWorse'
): Status => {
  if (value === undefined || !Number.isFinite(value)) {
    return 'unknown';
  }

  if (direction === 'higherIsWorse') {
    if (value >= thresholds.crit) {
      return 'crit';
    }
    if (value >= thresholds.warn) {
      return 'warn';
    }
    return 'ok';
  }

  if (value <= thresholds.crit) {
    return 'crit';
  }
  if (value <= thresholds.warn) {
    return 'warn';
  }
  return 'ok';
};

const formatValues = (values: Array<number | string>, unit: string): string => {
  if (!values.length) {
    return '-';
  }

  const fmt = getValueFormat(unit || 'none');
  const formatOne = (v: number | string): string => {
    if (typeof v !== 'number') {
      return String(v);
    }

    try {
      const out = fmt(v, 2, undefined, undefined, true);
      const suffix = out.suffix ?? '';
      return `${out.text}${suffix}`;
    } catch {
      return String(Number(v.toFixed(2)));
    }
  };

  if (values.length === 1) {
    return formatOne(values[0]);
  }

  return values.slice(0, 5).map(formatOne).join(' / ');
};

const toMetric = (
  data: PanelData,
  cfg: MatchConfig,
  thresholds: TopologyCustomConfig['thresholds'],
  unit: string,
  divisor: number | undefined,
  direction: 'higherIsWorse' | 'lowerIsWorse',
  thresholdsConfig?: ThresholdsConfig,
  min?: number,
  max?: number
): ResolvedMetric => {
  const extracted = extractValues(data, cfg);
  const sparkline = extracted.map((v) => toNumeric(v.value)).filter((v): v is number => v !== undefined).slice(-80);
  const agg = aggregate(extracted, cfg.aggregate);
  const numeric = agg.map(toNumeric).find((v): v is number => v !== undefined);
  const fieldThresholdStatus = resolveFieldThresholdStatus(numeric, thresholdsConfig, min, max, direction);
  const displayAgg = applyDisplayDivisor(agg, divisor);

  return {
    values: agg,
    sparkline,
    valueText: formatValues(displayAgg, unit),
    numeric,
    status: fieldThresholdStatus?.status ?? statusByThresholds(numeric, thresholds, direction),
    color: fieldThresholdStatus?.color,
  };
};

const directionalMatchConfig = (
  link: TopologyLink,
  direction: 'in' | 'out'
): MatchConfig => {
  const fieldKey = direction === 'in' ? 'inField' : 'outField';
  const directional = link.directional ?? {};

  return {
    ...link,
    sourceBy: link.sourceBy ?? 'seriesName',
    sourceValue: link.sourceValue,
    matchBy: 'seriesName',
    matchValue: direction === 'in' ? directional.inTargetValue || link.matchValue : directional.outTargetValue || link.matchValue,
    valueField: directional[fieldKey] || link.valueField,
    aggregate: directional.aggregate,
  } as MatchConfig;
};

const resolveFieldThresholdStatus = (
  value: number | undefined,
  thresholds: ThresholdsConfig | undefined,
  min: number | undefined,
  max: number | undefined,
  direction: 'higherIsWorse' | 'lowerIsWorse'
): { status: Status; color?: string } | undefined => {
  if (value === undefined || !thresholds?.steps?.length || direction === 'lowerIsWorse') {
    return undefined;
  }

  const steps = [...thresholds.steps].sort((a, b) => (a.value ?? Number.NEGATIVE_INFINITY) - (b.value ?? Number.NEGATIVE_INFINITY));
  const target =
    thresholds.mode === 'percentage' && min !== undefined && max !== undefined && max > min
      ? ((value - min) / (max - min)) * 100
      : value;

  let idx = 0;
  for (let i = 0; i < steps.length; i++) {
    const v = steps[i].value ?? Number.NEGATIVE_INFINITY;
    if (target >= v) {
      idx = i;
    }
  }

  const status: Status = idx <= 0 ? 'ok' : idx === 1 ? 'warn' : 'crit';
  return { status, color: steps[idx].color };
};

export const mapPanelData = (
  data: PanelData,
  options: TopologyPanelOptions,
  thresholdsConfig?: ThresholdsConfig,
  min?: number,
  max?: number,
  fieldUnit?: string
): MappingResult => {
  const topology = getTopologyConfig(options);
  const globalUnit = topology.valueUnit && topology.valueUnit !== 'none' ? topology.valueUnit : fieldUnit || topology.valueUnit;
  const nodeMetrics: MappingResult['nodeMetrics'] = {};
  const linkMetrics: MappingResult['linkMetrics'] = {};
  const nodeDecorationStatus: MappingResult['nodeDecorationStatus'] = {};

  for (const node of topology.nodes) {
    const useCustom = topology.global.useCustomNodeUnit;
    const nodeUnit = useCustom ? node.valueUnit ?? '' : globalUnit;
    const metric = toMetric(data, node, topology.thresholds, nodeUnit || globalUnit, node.valueDivisor, 'higherIsWorse', thresholdsConfig, min, max);
    nodeMetrics[node.id] = metric;
    if (node.statusDecoration?.enabled) {
      const decoMetric = toMetric(
        data,
        node.statusDecoration,
        node.statusDecoration.thresholds ?? topology.thresholds,
        'none',
        1,
        node.statusDecoration.thresholdDirection,
        thresholdsConfig,
        min,
        max
      );
      if (node.statusDecoration.mode === 'binary') {
        const numeric = decoMetric.numeric;
        nodeDecorationStatus[node.id] = numeric === undefined ? 'crit' : numeric <= 0 ? 'crit' : 'ok';
      } else {
        nodeDecorationStatus[node.id] = decoMetric.status;
      }
    }
  }

  for (const link of topology.links) {
    const linkUnit = topology.global.useCustomLinkUnit ? link.valueUnit || globalUnit : globalUnit;
    const baseMetric = toMetric(data, link, topology.thresholds, linkUnit, link.valueDivisor, link.thresholdDirection, thresholdsConfig, min, max);

    if (link.directional.enabled || link.animate.mode === 'byDirectional') {
      const inMetric = toMetric(
        data,
        directionalMatchConfig(link, 'in'),
        topology.thresholds,
        linkUnit,
        link.valueDivisor,
        link.thresholdDirection,
        thresholdsConfig,
        min,
        max
      );

      const outMetric = toMetric(
        data,
        directionalMatchConfig(link, 'out'),
        topology.thresholds,
        linkUnit,
        link.valueDivisor,
        link.thresholdDirection,
        thresholdsConfig,
        min,
        max
      );

      baseMetric.directional = {
        inText: inMetric.valueText,
        outText: outMetric.valueText,
        inNumeric: inMetric.numeric,
        outNumeric: outMetric.numeric,
      };
    }

    linkMetrics[link.id] = baseMetric;
  }

  return { nodeMetrics, linkMetrics, nodeDecorationStatus };
};
