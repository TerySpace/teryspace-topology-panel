import { PanelPlugin } from '@grafana/data';
import { Panel } from './Panel';
import { defaultOptions, migrationHandler } from './options';
import { TopologyPanelOptions } from './types';
import { TopologyConfigEditor } from './editor/TopologyConfigEditor';

export const plugin = new PanelPlugin<TopologyPanelOptions>(Panel)
  .setDefaults(defaultOptions)
  .setMigrationHandler(migrationHandler)
  .useFieldConfig()
  .setPanelOptions((builder) => {
    return builder
      .addBooleanSwitch({
        path: 'editMode',
        name: 'Edit mode',
        defaultValue: defaultOptions.editMode,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'connectMode',
        name: 'Connect mode',
        defaultValue: defaultOptions.connectMode,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'grid.enabled',
        name: 'Grid enabled',
        defaultValue: defaultOptions.grid.enabled,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'grid.snap',
        name: 'Grid snap',
        defaultValue: defaultOptions.grid.snap,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addNumberInput({
        path: 'grid.size',
        name: 'Grid size',
        defaultValue: defaultOptions.grid.size,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'zoom.lock',
        name: 'Zoom lock',
        defaultValue: defaultOptions.zoom.lock,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'topology.showZoomControls',
        name: 'Zoom controls',
        defaultValue: defaultOptions.topology.showZoomControls,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addBooleanSwitch({
        path: 'topology.global.autoScaleOnResize',
        name: 'Auto-scale resize',
        defaultValue: defaultOptions.topology.global.autoScaleOnResize,
        category: ['Topology Map Panel', 'Canvas'],
      })
      .addCustomEditor({
        id: 'topology-model-editor',
        path: 'topology',
        name: 'Editor',
        description: 'Nodes, links, icon packs, and global topology settings',
        category: ['Topology Map Panel', 'Editor'],
        editor: TopologyConfigEditor,
      });
  });
