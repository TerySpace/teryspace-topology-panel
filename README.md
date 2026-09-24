# Topology Map Panel

Interactive topology panel for Grafana 10+ with:
- node/link editor on canvas
- draggable bend points
- `polyline` and `bezier` links
- query mapping (`refId`, `fieldName`, `seriesName`, `label`)
- thresholds for `ok/warn/crit/unknown`
- link width scaling by values
- SVG link animations (`flow`, `dash`)
- zoom/pan with lock

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Quick run with Grafana (Docker + provisioning)

1. Build plugin assets:
```bash
npm install
npm run build
```

2. Start Grafana with mounted plugin and provisioning:
```bash
docker compose up
```

3. Open Grafana:
- URL: `http://localhost:3000`
- login/password: `admin` / `admin`

Provisioning includes:
- datasource: `TestData`
- dashboard: `Topology Map Sample`

## How to test

1. Start watcher:
```bash
npm run dev
```
2. In Grafana add panel: `Topology Map Panel`.
3. Enable `Edit mode`.
4. Create 2 nodes and 1 link (or use sample dashboard).
5. Configure node/link mapping:
- `matchBy`
- `matchValue`
- `valueField`
- `aggregate`
6. Verify acceptance behavior:
- link width changes (`widthMin..widthMax`) for `widthMode=byValue`
- status color changes by thresholds
- link animation (`flow` / `dash`) runs
- bend points are draggable in edit mode
- `curve=bezier` draws smooth path through bends
- zoom works; with zoom lock enabled wheel zoom is blocked

## Editor capabilities

Global panel controls:
- thresholds and direction
- grid enabled/snap/size
- zoom min/max/initial/lock
- toggle for showing `+/-/reset` buttons
- `valueUnit` for formatted value labels
- status colors
- URL icon pack management (`baseUrl` + `key:path` items)

Node controls:
- label, position, size, color override
- node decoration: enable/disable + shape (`circle`, `square`, `triangle`, `diamond`)
- builtin / URL / pack icon source
- mapping + aggregation
- value visibility
- icon animation (`pulse` / `spin`) and speed

Link controls:
- from/to
- curve (`polyline` / `bezier`)
- color mode + fixed color
- width mode + fixed/min/max
- mapping + aggregation
- directional labels for network links (`IN`/`OUT` fields)
- link animation style + speed
- bends add/remove and draggable handles

Canvas interactions:
- lock icon in corner controls zoom lock/unlock
- zoom lock blocks only zoom, not panning
- panning works with `Shift` + drag (or middle mouse drag) in edit/view mode

## Notes

- Builtin icon pack is included (`builtin-basic`) with 10+ SVG icons.
- Options are stored in panel options JSON and migrated via migration handler.
