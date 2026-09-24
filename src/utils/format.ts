export const formatMetricValue = (values: Array<number | string>): string => {
  if (!values.length) {
    return '-';
  }

  if (values.length === 1) {
    const v = values[0];
    return typeof v === 'number' ? Number(v.toFixed(2)).toString() : String(v);
  }

  return values
    .slice(0, 5)
    .map((v) => (typeof v === 'number' ? Number(v.toFixed(2)).toString() : String(v)))
    .join(' / ');
};
