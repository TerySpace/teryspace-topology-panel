import { DataFrame, Field, FieldType, getFieldDisplayName } from '@grafana/data';
import { MatchConfig } from 'types';

export interface ValueCandidate {
  value: number | string;
  fieldType: FieldType;
  fieldName: string;
  sourceRefId: string;
  sourceSeriesName: string;
  targetTokens: string[];
}

const uniqueStrings = (values: Array<string | undefined>): string[] => Array.from(new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean)));

const firstValue = (field: Field, rowIndex: number): string => {
  const values = field.values?.toArray ? field.values.toArray() : Array.from(field.values ?? []);
  return String(values[rowIndex] ?? '').trim();
};

const getPreferredValueField = (frame: DataFrame): Field | undefined =>
  frame.fields.find((f) => f.type === FieldType.number) ??
  frame.fields.find((f) => f.type === FieldType.string) ??
  frame.fields[1] ??
  frame.fields[0];

export const getFrameSeriesName = (frame: DataFrame): string =>
  String(getPreferredValueField(frame) ? getFieldDisplayName(getPreferredValueField(frame)!, frame) : frame.name ?? frame.refId ?? '').trim();

export const matchesSourceFrame = (frame: DataFrame, sourceBy?: 'refId' | 'seriesName', sourceValue?: string): boolean => {
  if (!sourceValue) {
    return true;
  }
  if (sourceBy === 'refId') {
    return String(frame.refId ?? '').trim() === sourceValue;
  }
  return getFrameSeriesName(frame) === sourceValue;
};

export const collectTargetOptions = (frames: DataFrame[], sourceBy?: 'refId' | 'seriesName', sourceValue?: string): string[] =>
  Array.from(
    new Set(
      frames
        .filter((frame) => matchesSourceFrame(frame, sourceBy, sourceValue))
        .flatMap((frame) => {
          const numericFields = frame.fields.filter((f) => f.type === FieldType.number);
          const stringFields = frame.fields.filter((f) => f.type === FieldType.string);
          const candidates: string[] = [];

          for (const field of numericFields) {
            candidates.push(String(getFieldDisplayName(field, frame)).trim());
            const values = field.values?.toArray ? field.values.toArray() : Array.from(field.values ?? []);
            for (let i = 0; i < values.length; i++) {
              for (const sf of stringFields) {
                const rowText = firstValue(sf, i);
                if (rowText) {
                  candidates.push(rowText);
                }
              }
            }
          }

          return candidates;
        })
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

export const collectNumericFieldNames = (frames: DataFrame[], sourceBy?: 'refId' | 'seriesName', sourceValue?: string): string[] =>
  Array.from(
    new Set(
      frames
        .filter((frame) => matchesSourceFrame(frame, sourceBy, sourceValue))
        .flatMap((frame) => frame.fields.filter((f) => f.type === FieldType.number).map((f) => String(f.name ?? '').trim()))
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

export const collectValueCandidates = (frames: DataFrame[]): ValueCandidate[] => {
  const candidates: ValueCandidate[] = [];

  for (const frame of frames) {
    const numericFields = frame.fields.filter((f) => f.type === FieldType.number);
    const stringFields = frame.fields.filter((f) => f.type === FieldType.string);
    const sourceRefId = String(frame.refId ?? '').trim();
    const sourceSeriesName = getFrameSeriesName(frame);

    for (const field of numericFields) {
      const displayName = String(getFieldDisplayName(field, frame)).trim();
      const values = field.values?.toArray ? field.values.toArray() : Array.from(field.values ?? []);

      for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
        const value = values[rowIndex];
        if (value === null || value === undefined || value === '') {
          continue;
        }

        const targetTokens = uniqueStrings([
          displayName,
          sourceSeriesName,
          ...Object.values(field.labels ?? {}).map((lv) => String(lv ?? '')),
          ...stringFields.map((sf) => firstValue(sf, rowIndex)),
        ]);

        candidates.push({
          value,
          fieldType: field.type,
          fieldName: String(field.name ?? '').trim(),
          sourceRefId,
          sourceSeriesName,
          targetTokens,
        });
      }
    }
  }

  return candidates;
};

export const candidateMatchesConfig = (candidate: ValueCandidate, cfg: MatchConfig): boolean => {
  if (cfg.sourceValue) {
    const sourceMatch =
      cfg.sourceBy === 'refId' ? candidate.sourceRefId === cfg.sourceValue : candidate.sourceSeriesName === cfg.sourceValue;
    if (!sourceMatch && !(cfg.sourceBy === 'refId' && !candidate.sourceRefId)) {
      return false;
    }
  }

  const valueField = Array.isArray(cfg.valueField)
    ? cfg.valueField
    : typeof cfg.valueField === 'string'
      ? cfg.valueField.split(',').map((v) => v.trim()).filter(Boolean)
      : [];

  if (valueField.length > 0 && !valueField.includes(candidate.fieldName)) {
    return false;
  }

  if (!cfg.matchValue) {
    return true;
  }

  if (cfg.matchBy === 'refId') {
    return candidate.sourceRefId === cfg.matchValue;
  }

  if (cfg.matchBy === 'seriesName') {
    return candidate.targetTokens.includes(cfg.matchValue);
  }

  if (cfg.matchBy === 'fieldName') {
    return candidate.fieldName === cfg.matchValue;
  }

  return candidate.targetTokens.includes(cfg.matchValue);
};
