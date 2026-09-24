import { Status, TopologyPanelOptions } from 'types';
import { getTopologyConfig } from 'options';

export const statusColor = (status: Status, options: TopologyPanelOptions): string => {
  const topology = getTopologyConfig(options);
  return topology.theme.statusColors[status] ?? topology.theme.statusColors.unknown;
};
