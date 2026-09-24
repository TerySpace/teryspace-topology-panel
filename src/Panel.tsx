import React from 'react';
import { PanelProps } from '@grafana/data';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { TopologyPanelOptions } from 'types';
import { mapPanelData } from 'mapping/mapData';
import { GraphCanvas } from 'graph/GraphCanvas';

interface Props extends PanelProps<TopologyPanelOptions> {}

export const Panel: React.FC<Props> = ({ width, height, options, data, fieldConfig, onOptionsChange }) => {
  const theme = useTheme2();
  const thresholds = fieldConfig.defaults.thresholds;
  const min = fieldConfig.defaults.min ?? undefined;
  const max = fieldConfig.defaults.max ?? undefined;
  const unit = fieldConfig.defaults.unit;
  const mapping = mapPanelData(data, options, thresholds, min, max, unit);
  const canvasWidth = width;

  return (
    <div
      className={css`
        width: ${width}px;
        height: ${height}px;
        position: relative;
        display: flex;
        background: ${theme.colors.background.primary};
      `}
    >
      <div
        className={css`
          flex: 1;
          min-width: 0;
        `}
      >
        <GraphCanvas
          width={canvasWidth}
          height={height}
          options={options}
          mapping={mapping}
          statusThresholds={thresholds}
          panelBackground={theme.colors.background.primary}
          canvasBackground={theme.colors.background.secondary}
          onOptionsChange={onOptionsChange}
        />
      </div>
    </div>
  );
};
