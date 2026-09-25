import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { StandardEditorProps } from '@grafana/data';
import { Alert, ConfirmModal, useTheme2 } from '@grafana/ui';
import { createDefaultLink, createDefaultNode, defaultOptions } from 'options';
import { AggregateMode, AnchorSide, IconPack, MatchBy, TopologyCustomConfig, TopologyPanelOptions } from 'types';
import { resolveIconUrl } from 'utils/icons';
import { polylinePointAtRatio, polylinePoints } from 'graph/math';
import { collectTargetOptions } from 'mapping/queryTargets';

interface Props extends StandardEditorProps<TopologyCustomConfig, unknown, TopologyPanelOptions> {}

interface PendingConfirmation {
  title: string;
  body: string;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
}

const section = css`
  border: 1px solid var(--tm-border);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background: var(--tm-bg-elev);
`;

const globalLast = css`
  order: 99;
`;

const row = css`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;

  input,
  select,
  textarea,
  button {
    width: 100%;
    min-height: 28px;
    background: var(--tm-bg-input);
    color: var(--tm-text);
    border: 1px solid var(--tm-border);
    border-radius: 7px;
    padding: 4px 8px;
  }

  input[type='checkbox'] {
    width: 12px;
    height: 12px;
    min-height: 12px;
    padding: 0;
  }

  button {
    background: linear-gradient(180deg, var(--tm-btn-top), var(--tm-btn-bot));
    cursor: pointer;
  }

  select {
    appearance: auto;
    padding-right: 8px;
  }

`;

const chips = css`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  button {
    width: auto;
    min-height: 28px;
    background: linear-gradient(180deg, var(--tm-btn-top), var(--tm-btn-bot));
    color: var(--tm-text);
    border: 1px solid var(--tm-border);
    border-radius: 7px;
    padding: 4px 10px;
    cursor: pointer;
  }
`;

const list = css`
  max-height: 140px;
  overflow: auto;
  border: 1px solid var(--tm-border);
  border-radius: 7px;
  margin: 6px 0 10px;
`;

const dangerBtn = css`
  width: auto !important;
  min-height: 24px !important;
  padding: 2px 9px !important;
  background: linear-gradient(180deg, var(--tm-danger-top), var(--tm-danger-bot)) !important;
  border-color: var(--tm-danger-border) !important;
  color: var(--tm-danger-text) !important;
  border-radius: 7px !important;
`;

const ghostBtn = css`
  width: auto !important;
  min-height: 24px !important;
  padding: 2px 8px !important;
  background: transparent !important;
  border: 1px solid var(--tm-border-soft) !important;
  color: var(--tm-text-soft) !important;
  border-radius: 6px !important;
`;

const miniPreview = css`
  width: 40px;
  height: 40px;
  border: 1px solid var(--tm-border-soft);
  border-radius: 6px;
  object-fit: contain;
  background: var(--tm-bg-input);
`;

const sectionToggle = css`
  width: 100%;
  min-height: 26px;
  border: 0;
  border-bottom: 1px solid var(--tm-border-soft);
  background: transparent;
  color: var(--tm-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 8px 2px;
  margin-bottom: 10px;
  cursor: pointer;
`;

const compactControl = css`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const compactSelect = css`
  width: 220px !important;
`;

const groupBlock = css`
  margin: 10px 0 12px;
  padding-top: 10px;
  border-top: 1px solid var(--tm-border-soft);
`;

const groupTitle = css`
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tm-text-soft);
`;

const selectedRow = css`
  background: var(--tm-bg-input);
  border-bottom: 1px solid var(--tm-border-soft);
`;

const normalRow = css`
  border-bottom: 1px solid var(--tm-border-soft);
`;

const aggregateModes: AggregateMode[] = ['first', 'last', 'max', 'min', 'avg', 'join'];
const commonUnits = ['none', 'Bps', 'bps', 'KBs', 'MBs', 'GBs', 'Mbps', 'MB/s', 'percent', '%', 'watt', 'kwatt', 'kW', 'volt', 'amp', 'kWh'];

const nextId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.round(Math.random() * 1000).toString(36)}`;
const encodeIconValue = (type: 'url' | 'builtin' | 'pack' | 'none', value: string) => `${type}|${encodeURIComponent(value)}`;
const encodeMatchTarget = (matchBy: MatchBy, matchValue: string) => `${matchBy}|${encodeURIComponent(matchValue)}`;
const decodeMatchTarget = (input: string): { matchBy: MatchBy; matchValue: string } => {
  const [matchBy, encoded] = input.split('|', 2);
  const safeMatchBy: MatchBy = matchBy === 'refId' || matchBy === 'fieldName' || matchBy === 'label' ? matchBy : 'seriesName';
  return { matchBy: safeMatchBy, matchValue: decodeURIComponent(encoded ?? '') };
};
const decodeIconValue = (input: string): { type: 'url' | 'builtin' | 'pack' | 'none'; value: string } => {
  const [type, encoded] = input.split('|', 2);
  const safeType = type === 'url' || type === 'pack' || type === 'none' ? type : 'builtin';
  return { type: safeType, value: decodeURIComponent(encoded ?? '') };
};

const defaultPackLabel = 'New pack';

const nextPackDefaultName = (packs: IconPack[]): string => {
  const used = new Set(packs.map((p) => p.name.toLowerCase()));
  if (!used.has(defaultPackLabel.toLowerCase())) {
    return defaultPackLabel;
  }
  let i = 1;
  while (used.has(`${defaultPackLabel}${i}`.toLowerCase())) {
    i++;
  }
  return `${defaultPackLabel}${i}`;
};

const distanceBetween = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

const trimSvgWhitespace = (raw: string): string => {
  const text = raw.trim();
  if (!/<svg[\s>]/i.test(text) || typeof document === 'undefined') {
    return text;
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    const sourceSvg = doc.documentElement;
    if (!sourceSvg || sourceSvg.tagName.toLowerCase() !== 'svg') {
      return text;
    }
    const ns = 'http://www.w3.org/2000/svg';
    const temp = document.createElementNS(ns, 'svg');
    temp.setAttribute('xmlns', ns);
    temp.style.position = 'absolute';
    temp.style.left = '-99999px';
    temp.style.top = '-99999px';
    temp.style.visibility = 'hidden';
    const group = document.createElementNS(ns, 'g');
    Array.from(sourceSvg.childNodes).forEach((child) => {
      group.appendChild(child.cloneNode(true));
    });
    temp.appendChild(group);
    document.body.appendChild(temp);
    let box: DOMRect | null = null;
    try {
      const b = group.getBBox();
      if (b.width > 0 && b.height > 0) {
        box = b as DOMRect;
      }
    } finally {
      document.body.removeChild(temp);
    }
    if (!box) {
      return text;
    }
    sourceSvg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
    sourceSvg.removeAttribute('width');
    sourceSvg.removeAttribute('height');
    return new XMLSerializer().serializeToString(sourceSvg);
  } catch {
    return text;
  }
};

interface NumberInputProps {
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}

const NumberInput: React.FC<NumberInputProps> = ({ value, min, max, step, onCommit }) => {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? ''));
      return;
    }
    const normalized = Math.max(min ?? parsed, Math.min(max ?? parsed, parsed));
    onCommit(normalized);
    setDraft(String(normalized));
  };
  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
};

const SearchSuggestInput: React.FC<{
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}> = ({ value, options, placeholder, onChange }) => {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const base = q ? options.filter((option) => option.toLowerCase().includes(q)) : options;
    return base.slice(0, 120);
  }, [options, value]);

  return (
    <div className={css`position:relative;`}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        className={css`
          padding-right: ${value ? '28px !important' : '8px !important'};
        `}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear"
          className={css`
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            width: 20px !important;
            min-width: 20px;
            min-height: 20px !important;
            padding: 0 !important;
            border-radius: 999px !important;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
          `}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {open && filtered.length > 0 && (
        <div
          className={css`
            position:absolute;
            left:0;
            right:0;
            top:calc(100% + 4px);
            z-index:30;
            max-height:220px;
            overflow:auto;
            background: var(--tm-bg-elev);
            border: 1px solid var(--tm-border);
            border-radius: 7px;
            box-shadow: 0 10px 24px rgba(0,0,0,0.22);
          `}
        >
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className={css`
                display:block;
                width:100%;
                border:0;
                border-radius:0;
                background:transparent;
                color:inherit;
                text-align:left;
                padding:6px 8px;
                cursor:pointer;
                &:hover {
                  background: var(--tm-bg-input);
                }
              `}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const buildQueryChoice = (frame: any): Array<{ value: string; label: string }> => {
  const out: Array<{ value: string; label: string }> = [];
  const refId = String(frame.refId ?? '').trim();
  if (refId) {
    out.push({
      value: encodeMatchTarget('refId', refId),
      label: refId,
    });
  }
  return out;
};

export const TopologyConfigEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const theme = useTheme2();
  const topology = value ?? defaultOptions.topology;
  const [selectedNodeId, setSelectedNodeId] = useState<string>(topology.selectedNodeId ?? '');
  const [selectedLinkId, setSelectedLinkId] = useState<string>(topology.selectedLinkId ?? '');
  const [linkSearch, setLinkSearch] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [packName, setPackName] = useState(defaultPackLabel);
  const [activePackId, setActivePackId] = useState('');
  const [iconName, setIconName] = useState('custom-icon');
  const [iconData, setIconData] = useState('');
  const [iconSearch, setIconSearch] = useState('');
  const [packIconSearch, setPackIconSearch] = useState('');
  const [packNotice, setPackNotice] = useState('');
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [selectedPackIcons, setSelectedPackIcons] = useState<Record<string, string[]>>({});
  const [activeIconKey, setActiveIconKey] = useState('');
  const [editingIconKey, setEditingIconKey] = useState('');
  const [editingIconName, setEditingIconName] = useState('');
  const [editingPack, setEditingPack] = useState(false);
  const [editingPackName, setEditingPackName] = useState('');
  const [openPackIds, setOpenPackIds] = useState<Record<string, boolean>>({});
  const [openGlobal, setOpenGlobal] = useState(true);
  const [openPacks, setOpenPacks] = useState(false);
  const [openNodes, setOpenNodes] = useState(true);
  const [openLinks, setOpenLinks] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const selectedNode = topology.nodes.find((n) => n.id === selectedNodeId);
  const selectedLink = topology.links.find((l) => l.id === selectedLinkId);
  const selectedLinkValuesVisible =
    !!selectedLink &&
    (topology.global.linkValueVisibility === 'show' ||
      (topology.global.linkValueVisibility === 'inherit' && selectedLink.showValue));
  const selectedLinkDirectionalControlsVisible =
    !!selectedLink && (selectedLink.directional.enabled || selectedLink.animate.mode === 'byDirectional');

  const nodesByLabel = useMemo(() => new Map(topology.nodes.map((n) => [n.label.toLowerCase(), n.id])), [topology.nodes]);

  const iconChoices = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    for (const pack of topology.iconPacks) {
      for (const item of pack.items) {
        out.push({
          value: encodeIconValue(pack.type === 'builtin' ? 'builtin' : 'pack', pack.type === 'builtin' ? item.path : `${pack.id}:${item.key}`),
          label: `${pack.name} / ${item.key}`,
        });
      }
    }
    const q = iconSearch.trim().toLowerCase();
    return q ? out.filter((x) => x.label.toLowerCase().includes(q)) : out;
  }, [topology.iconPacks, iconSearch]);

  const queryChoices = useMemo(
    () =>
      Array.from(
        new Map(
          (context.data ?? [])
            .flatMap((frame) => buildQueryChoice(frame))
            .map((choice) => [choice.value, choice])
        ).values()
      ),
    [context.data]
  );

  const nodeLegendChoices = useMemo(
    () => collectTargetOptions((context.data ?? []) as any, selectedNode?.sourceBy, selectedNode?.sourceValue),
    [context.data, selectedNode?.sourceBy, selectedNode?.sourceValue]
  );

  const statusLegendChoices = useMemo(
    () => collectTargetOptions((context.data ?? []) as any, selectedNode?.statusDecoration.sourceBy, selectedNode?.statusDecoration.sourceValue),
    [context.data, selectedNode?.statusDecoration.sourceBy, selectedNode?.statusDecoration.sourceValue]
  );

  const linkLegendChoices = useMemo(
    () => collectTargetOptions((context.data ?? []) as any, selectedLink?.sourceBy, selectedLink?.sourceValue),
    [context.data, selectedLink?.sourceBy, selectedLink?.sourceValue]
  );
  const inboundLegendChoices = useMemo(
    () => collectTargetOptions((context.data ?? []) as any, selectedLink?.sourceBy, selectedLink?.sourceValue),
    [context.data, selectedLink?.sourceBy, selectedLink?.sourceValue]
  );
  const outboundLegendChoices = useMemo(
    () => collectTargetOptions((context.data ?? []) as any, selectedLink?.sourceBy, selectedLink?.sourceValue),
    [context.data, selectedLink?.sourceBy, selectedLink?.sourceValue]
  );

  useEffect(() => {
    if (!value) {
      onChange(defaultOptions.topology);
    }
  }, [onChange, value]);

  useEffect(() => {
    setSelectedNodeId(topology.selectedNodeId ?? '');
    setSelectedLinkId(topology.selectedLinkId ?? '');
  }, [topology.selectedLinkId, topology.selectedNodeId]);

  useEffect(() => {
    if (!selectedLink) {
      setFromInput('');
      setToInput('');
      return;
    }
    setFromInput(topology.nodes.find((n) => n.id === selectedLink.from)?.label ?? selectedLink.from);
    setToInput(topology.nodes.find((n) => n.id === selectedLink.to)?.label ?? selectedLink.to);
  }, [selectedLink, topology.nodes]);

  useEffect(() => {
    if (!activePackId) {
      const firstUserPack = topology.iconPacks.find((p) => p.type === 'url')?.id;
      if (firstUserPack) {
        setActivePackId(firstUserPack);
      }
    }
  }, [activePackId, topology.iconPacks]);

  useEffect(() => {
    setOpenPackIds((prev) => {
      const next = { ...prev };
      for (const p of topology.iconPacks.filter((x) => x.type === 'url')) {
        if (next[p.id] === undefined) {
          next[p.id] = p.id === activePackId;
        }
      }
      for (const id of Object.keys(next)) {
        if (!topology.iconPacks.some((p) => p.id === id)) {
          delete next[id];
        }
      }
      return next;
    });
  }, [activePackId, topology.iconPacks]);

  useEffect(() => {
    setActiveIconKey('');
    setEditingIconKey('');
    const active = topology.iconPacks.find((p) => p.id === activePackId);
    setEditingPackName(active?.name ?? '');
    setEditingPack(false);
  }, [activePackId, topology.iconPacks]);

  const patchTopology = (patch: Partial<TopologyCustomConfig>) => onChange({ ...topology, ...patch });
  const setSelection = (nodeId: string, linkId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedLinkId(linkId);
  };
  const requestConfirmation = (title: string, body: string, confirmText: string, onConfirm: PendingConfirmation['onConfirm']) => {
    setPendingConfirmation({ title, body, confirmText, onConfirm });
  };
  const togglePackIcon = (packId: string, key: string, checked: boolean) => {
    const prev = selectedPackIcons[packId] ?? [];
    const next = checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key);
    setSelectedPackIcons((s) => ({ ...s, [packId]: next }));
  };

  const patchNode = (patch: Partial<NonNullable<typeof selectedNode>>) => {
    if (!selectedNode) {
      return;
    }
    patchTopology({ nodes: topology.nodes.map((n) => (n.id === selectedNode.id ? { ...n, ...patch } : n)) });
  };

  const patchLink = (patch: Partial<NonNullable<typeof selectedLink>>) => {
    if (!selectedLink) {
      return;
    }
    patchTopology({ links: topology.links.map((l) => (l.id === selectedLink.id ? { ...l, ...patch } : l)) });
  };

  const resolveNodeId = (input: string): string => {
    const direct = topology.nodes.find((n) => n.id === input)?.id;
    if (direct) {
      return direct;
    }
    return nodesByLabel.get(input.toLowerCase()) ?? input;
  };

  const filteredLinks = topology.links.filter((l) => {
    if (!linkSearch.trim()) {
      return true;
    }
    const s = linkSearch.toLowerCase();
    return l.label.toLowerCase().includes(s) || l.id.toLowerCase().includes(s);
  });

  const createPack = () => {
    const typed = packName.trim();
    const resolvedName =
      !typed || typed.toLowerCase() === defaultPackLabel.toLowerCase()
        ? nextPackDefaultName(topology.iconPacks.filter((p) => p.type === 'url'))
        : typed;
    const normalizedName = resolvedName.toLowerCase();
    if (topology.iconPacks.some((p) => p.name.toLowerCase() === normalizedName)) {
      setPackNotice('Pack with this name already exists');
      return;
    }
    const id = `pack-${Date.now().toString(36)}`;
    const next: IconPack = {
      id,
      name: resolvedName,
      type: 'url',
      baseUrl: '',
      items: [],
    };
    patchTopology({ iconPacks: [...topology.iconPacks, next] });
    setActivePackId(id);
    setPackName(defaultPackLabel);
    setPackNotice('');
  };

  const addIconToPack = () => {
    const text = iconData.trim();
    if (!activePackId) {
      setPackNotice('Create and select icon pack first');
      return;
    }
    if (!text) {
      setPackNotice('Icon data is empty');
      return;
    }
    const processedSvg = trimWhitespace ? trimSvgWhitespace(text) : text;
    const payload =
      processedSvg.includes('<svg') || processedSvg.includes('<?xml')
        ? `data:image/svg+xml;utf8,${encodeURIComponent(processedSvg)}`
        : processedSvg;
    const keyName = iconName.trim() || `icon-${Date.now().toString(36)}`;
    const active = topology.iconPacks.find((p) => p.id === activePackId);
    const exists = active?.items.some((i) => i.key === keyName);
    const saveIcon = () => {
      patchTopology({
        iconPacks: topology.iconPacks.map((p) =>
          p.id !== activePackId
            ? p
            : {
                ...p,
                items: [
                  ...p.items.filter((i) => i.key !== keyName),
                  { key: keyName, path: payload },
                ],
              }
        ),
      });
      setPackNotice('');
      setIconData('');
      setFileName('');
      setIconName('custom-icon');
    };
    if (exists) {
      requestConfirmation('Overwrite icon?', `Icon "${keyName}" already exists in this pack.`, 'Overwrite', saveIcon);
      return;
    }
    saveIcon();
  };

  const addFilesToActivePack = async (files: FileList | null) => {
    if (!activePackId || !files?.length) {
      return;
    }
    const picked = Array.from(files).filter((f) => /\.(svg|png)$/i.test(f.name));
    if (!picked.length) {
      setPackNotice('Only .svg/.png files are supported');
      return;
    }
    const active = topology.iconPacks.find((p) => p.id === activePackId);
    if (!active) {
      return;
    }
    const overwrite = new Set<string>();
    for (const f of picked) {
      const key = f.name.replace(/\.[^.]+$/, '');
      if (active.items.some((i) => i.key === key)) {
        overwrite.add(key);
      }
    }
    const addPickedFiles = async () => {
      const additions: IconPack['items'] = [];
      for (const file of picked) {
        const key = file.name.replace(/\.[^.]+$/, '');
        if (file.name.toLowerCase().endsWith('.svg')) {
          const txt = await file.text();
          const trimmed = trimWhitespace ? trimSvgWhitespace(txt) : txt;
          additions.push({ key, path: `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}` });
        } else {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.readAsDataURL(file);
          });
          additions.push({ key, path: dataUrl });
        }
      }

      patchTopology({
        iconPacks: topology.iconPacks.map((p) =>
          p.id !== activePackId
            ? p
            : {
                ...p,
                items: [...p.items.filter((i) => !additions.some((a) => a.key === i.key)), ...additions],
              }
        ),
      });
      setPackNotice('');
    };
    if (overwrite.size) {
      requestConfirmation('Overwrite icons?', `Overwrite ${overwrite.size} existing icon(s) in this pack?`, 'Overwrite', addPickedFiles);
      return;
    }
    await addPickedFiles();
  };

  const importFolderAsPack = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const all = Array.from(files).filter((f) => /\.(svg|png)$/i.test(f.name));
    if (!all.length) {
      setPackNotice('No .svg/.png files in selected folder');
      return;
    }
    const folderName = (all[0] as any).webkitRelativePath?.split('/')?.[0] || 'Imported pack';
    let resolvedName = packName.trim() && packName.trim().toLowerCase() !== defaultPackLabel.toLowerCase() ? packName.trim() : folderName;
    if (topology.iconPacks.some((p) => p.name.toLowerCase() === resolvedName.toLowerCase())) {
      setPackNotice('Pack with this name already exists');
      return;
    }
    const id = `pack-${Date.now().toString(36)}`;
    const items: IconPack['items'] = [];
    for (const file of all) {
      if (file.name.toLowerCase().endsWith('.svg')) {
        const txt = await file.text();
        const trimmed = trimWhitespace ? trimSvgWhitespace(txt) : txt;
        items.push({ key: file.name.replace(/\.[^.]+$/, ''), path: `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}` });
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.readAsDataURL(file);
        });
        items.push({ key: file.name.replace(/\.[^.]+$/, ''), path: dataUrl });
      }
    }
    patchTopology({
      iconPacks: [...topology.iconPacks, { id, name: resolvedName, type: 'url', baseUrl: '', items }],
    });
    setActivePackId(id);
    setPackName(defaultPackLabel);
    setPackNotice('');
  };

  return (
    <div
      style={
        {
          ['--tm-bg-elev' as any]: theme.colors.background.secondary,
          ['--tm-bg-input' as any]: theme.colors.background.primary,
          ['--tm-border' as any]: theme.colors.border.weak,
          ['--tm-border-soft' as any]: theme.colors.border.medium,
          ['--tm-text' as any]: theme.colors.text.primary,
          ['--tm-text-soft' as any]: theme.colors.text.secondary,
          ['--tm-btn-top' as any]: theme.isDark ? '#1f2937' : '#f8fafc',
          ['--tm-btn-bot' as any]: theme.isDark ? '#111827' : '#e5e7eb',
          ['--tm-danger-top' as any]: theme.isDark ? '#8b1f1f' : '#ef4444',
          ['--tm-danger-bot' as any]: theme.isDark ? '#6d1717' : '#dc2626',
          ['--tm-danger-border' as any]: theme.isDark ? '#a83131' : '#b91c1c',
          ['--tm-danger-text' as any]: theme.isDark ? '#fee2e2' : '#fff1f2',
        } as React.CSSProperties
      }
      className={css`
        display: flex;
        flex-direction: column;
      `}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
          (e.target as HTMLElement).blur();
        }
      }}
    >
      <div className={`${section} ${globalLast}`}>
        <button className={sectionToggle} type="button" onClick={() => setOpenGlobal((v) => !v)}>
          <span>Global</span>
          <span>{openGlobal ? '▾' : '▸'}</span>
        </button>
        {openGlobal && (
          <>
        <div className={row}>
          <label>Node values</label>
          <select value={topology.global.nodeValueVisibility} onChange={(e) => patchTopology({ global: { ...topology.global, nodeValueVisibility: e.target.value as any } })}>
            <option value="inherit">inherit</option>
            <option value="show">force show</option>
            <option value="hide">force hide</option>
          </select>
        </div>
        <div className={row}>
          <label>Link values</label>
          <select value={topology.global.linkValueVisibility} onChange={(e) => patchTopology({ global: { ...topology.global, linkValueVisibility: e.target.value as any } })}>
            <option value="inherit">inherit</option>
            <option value="show">force show</option>
            <option value="hide">force hide</option>
          </select>
        </div>
        <div className={row}>
          <label>Fixed width</label>
          <NumberInput value={topology.global.linkFixedWidth} min={1} step={0.5} onCommit={(n) => patchTopology({ global: { ...topology.global, linkFixedWidth: n } })} />
        </div>
        <div className={row}>
          <label>Width mode</label>
          <select value={topology.global.linkWidthMode} onChange={(e) => patchTopology({ global: { ...topology.global, linkWidthMode: e.target.value as 'fixed' | 'byValue' } })}>
            <option value="fixed">fixed</option>
            <option value="byValue">byValue</option>
          </select>
        </div>
        <div className={row}>
          <label>Width min/max</label>
          <div>
            <NumberInput value={topology.global.linkWidthMin} min={1} onCommit={(n) => patchTopology({ global: { ...topology.global, linkWidthMin: n } })} />
            <NumberInput value={topology.global.linkWidthMax} min={1} onCommit={(n) => patchTopology({ global: { ...topology.global, linkWidthMax: n } })} />
          </div>
        </div>
        <div className={row}>
          <label>Apply width</label>
          <button
            onClick={() =>
              patchTopology({
                links: topology.links.map((l) => ({
                  ...l,
                  widthMode: topology.global.linkWidthMode,
                  widthFixed: topology.global.linkFixedWidth,
                  widthMin: topology.global.linkWidthMin,
                  widthMax: topology.global.linkWidthMax,
                })),
              })
            }
          >
            Apply to all links
          </button>
        </div>
        <div className={row}>
          <label>Curve default</label>
          <select value={topology.global.linkCurve} onChange={(e) => patchTopology({ global: { ...topology.global, linkCurve: e.target.value as 'polyline' | 'bezier' } })}>
            <option value="polyline">polyline</option>
            <option value="bezier">bezier</option>
          </select>
        </div>
        <div className={row}>
          <label>Link spacing</label>
          <NumberInput value={topology.global.linkParallelSpacing} min={0} max={40} step={1} onCommit={(n) => patchTopology({ global: { ...topology.global, linkParallelSpacing: n } })} />
        </div>
        <div className={row}>
          <label>Arrow W/H</label>
          <div>
            <NumberInput value={topology.global.arrowWidth} min={2} max={20} step={0.5} onCommit={(n) => patchTopology({ global: { ...topology.global, arrowWidth: n } })} />
            <NumberInput value={topology.global.arrowHeight} min={2} max={24} step={0.5} onCommit={(n) => patchTopology({ global: { ...topology.global, arrowHeight: n } })} />
          </div>
        </div>
        <div className={row}>
          <label>Arrow offset</label>
          <NumberInput value={topology.global.arrowOffset} min={0} max={12} step={0.2} onCommit={(n) => patchTopology({ global: { ...topology.global, arrowOffset: n } })} />
        </div>
        <div className={row}>
          <label>Apply curve</label>
          <button onClick={() => patchTopology({ links: topology.links.map((l) => ({ ...l, curve: topology.global.linkCurve })) })}>Apply to all links</button>
        </div>
        <div className={row}>
          <label>Status scale</label>
          <input type="checkbox" checked={topology.global.showStatusScale} onChange={(e) => patchTopology({ global: { ...topology.global, showStatusScale: e.target.checked } })} />
        </div>
        <div className={row}>
          <label>Link hover chart</label>
          <input
            type="checkbox"
            checked={topology.global.showLinkHoverGraph}
            onChange={(e) => patchTopology({ global: { ...topology.global, showLinkHoverGraph: e.target.checked } })}
          />
        </div>
        <div className={row}>
          <label>Scale direction</label>
          <select
            value={topology.global.statusScaleOrientation}
            onChange={(e) => patchTopology({ global: { ...topology.global, statusScaleOrientation: e.target.value as 'vertical' | 'horizontal' } })}
          >
            <option value="vertical">vertical</option>
            <option value="horizontal">horizontal</option>
          </select>
        </div>
        <div className={row}>
          <label>Scale length</label>
          <NumberInput
            value={topology.global.statusScaleLength}
            min={80}
            max={800}
            step={10}
            onCommit={(n) => patchTopology({ global: { ...topology.global, statusScaleLength: n } })}
          />
        </div>
        <div className={row}>
          <label>Scale unit</label>
          <input
            value={topology.global.statusScaleUnit ?? ''}
            onChange={(e) => patchTopology({ global: { ...topology.global, statusScaleUnit: e.target.value } })}
            placeholder="% / kW / Mb/s"
          />
        </div>
        <div className={row}>
          <label>Show unit</label>
          <input
            type="checkbox"
            checked={topology.global.statusScaleShowUnit}
            onChange={(e) => patchTopology({ global: { ...topology.global, statusScaleShowUnit: e.target.checked } })}
          />
        </div>
          </>
        )}
      </div>

      <div className={section}>
        <button className={sectionToggle} type="button" onClick={() => setOpenPacks((v) => !v)}>
          <span>Icon packs</span>
          <span>{openPacks ? '▾' : '▸'}</span>
        </button>
        {openPacks && (
          <>
        <div className={row}><label>New pack</label><input value={packName} onChange={(e) => setPackName(e.target.value)} /></div>
        <div className={row}><label>Create pack</label><button onClick={createPack}>Create</button></div>
        <div className={row}>
          <label>Active pack</label>
          <div className={compactControl}>
            {editingPack ? (
              <input
                value={editingPackName}
                onChange={(e) => setEditingPackName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') {
                    return;
                  }
                  const nextName = editingPackName.trim();
                  if (!nextName) {
                    return;
                  }
                  if (topology.iconPacks.some((p) => p.id !== activePackId && p.name.toLowerCase() === nextName.toLowerCase())) {
                    setPackNotice('Pack with this name already exists');
                    return;
                  }
                  patchTopology({
                    iconPacks: topology.iconPacks.map((p) => (p.id === activePackId ? { ...p, name: nextName } : p)),
                  });
                  setEditingPack(false);
                  setPackNotice('');
                }}
              />
            ) : (
              <select className={compactSelect} value={activePackId} onChange={(e) => setActivePackId(e.target.value)}>
                <option value="">(select pack)</option>
                {topology.iconPacks.filter((p) => p.type === 'url').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {activePackId && (
              <button
                className={ghostBtn}
                onClick={() => {
                  if (!editingPack) {
                    const active = topology.iconPacks.find((p) => p.id === activePackId);
                    setEditingPackName(active?.name ?? '');
                    setEditingPack(true);
                    return;
                  }
                  const nextName = editingPackName.trim();
                  if (!nextName) {
                    return;
                  }
                  if (topology.iconPacks.some((p) => p.id !== activePackId && p.name.toLowerCase() === nextName.toLowerCase())) {
                    setPackNotice('Pack with this name already exists');
                    return;
                  }
                  patchTopology({
                    iconPacks: topology.iconPacks.map((p) => (p.id === activePackId ? { ...p, name: nextName } : p)),
                  });
                  setEditingPack(false);
                  setPackNotice('');
                }}
                title={editingPack ? 'Save pack name' : 'Rename pack'}
              >
                {editingPack ? 'OK' : '✎'}
              </button>
            )}
            <span className={css`font-size:11px;opacity:.75;`}>{topology.iconPacks.find((p) => p.id === activePackId)?.name ?? ''}</span>
          </div>
        </div>
        <div className={row}><label>Icon name</label><input value={iconName} onChange={(e) => setIconName(e.target.value)} /></div>
        <div className={row}><label>Search icons</label><input value={packIconSearch} onChange={(e) => setPackIconSearch(e.target.value)} placeholder="find icon in pack" /></div>
        <div className={row}><label>Icon data</label><textarea rows={2} value={iconData} onChange={(e) => setIconData(e.target.value)} placeholder="Paste SVG vector code (.svg) or image URL/data-uri" /></div>
        <div className={row}>
          <label>Trim SVG</label>
          <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
        </div>
        <div className={row}>
          <label>Upload file</label>
          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()}>Choose .svg/.png</button>
            <div className={css`font-size:11px;opacity:.75;margin-top:4px;`}>{fileName || 'No file selected'}</div>
            <input
              ref={fileInputRef}
              style={{ display: 'none' }}
              type="file"
              accept=".svg,.png,image/svg+xml,image/png"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  return;
                }
                setFileName(file.name);
                setIconName(file.name.replace(/\.[^.]+$/, ''));
                if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
                  const text = await file.text();
                  setIconData(text);
                } else {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setIconData(String(reader.result ?? ''));
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
        </div>
        <div className={row}>
          <label>Add many files</label>
          <div>
            <button
              type="button"
              onClick={() => {
                if (!activePackId) {
                  setPackNotice('Create and select icon pack first');
                  return;
                }
                filesInputRef.current?.click();
              }}
            >
              Choose multiple
            </button>
            <input
              ref={filesInputRef}
              style={{ display: 'none' }}
              type="file"
              multiple
              accept=".svg,.png,image/svg+xml,image/png"
              onChange={(e) => void addFilesToActivePack(e.target.files)}
            />
          </div>
        </div>
        <div className={row}>
          <label>Import folder</label>
          <div>
            <button type="button" onClick={() => folderInputRef.current?.click()}>Folder as pack</button>
            <input
              ref={folderInputRef}
              style={{ display: 'none' }}
              type="file"
              multiple
              webkitdirectory=""
              onChange={(e) => void importFolderAsPack(e.target.files)}
            />
          </div>
        </div>
        <div className={row}><label>Add icon</label><button onClick={addIconToPack}>Add to pack</button></div>
        {packNotice && <Alert title={packNotice} severity="error" onRemove={() => setPackNotice('')} bottomSpacing={8} />}

        <div className={css`height:340px;min-height:220px;max-height:640px;resize:vertical;overflow:auto;border:1px solid var(--tm-border);border-radius:7px;margin:6px 0 10px;`}>
          {topology.iconPacks.filter((p) => p.type === 'url').map((pack) => (
            <div key={pack.id} className={css`padding:8px;border-bottom:1px solid var(--tm-border-soft);`}>
              <div className={css`display:flex;justify-content:space-between;gap:8px;align-items:center;`}>
                <div className={css`display:flex;align-items:center;gap:8px;`}>
                  <button
                    className={ghostBtn}
                    onClick={() => setOpenPackIds((s) => ({ ...s, [pack.id]: !s[pack.id] }))}
                    title={openPackIds[pack.id] ? 'Collapse' : 'Expand'}
                  >
                    {openPackIds[pack.id] ? '▾' : '▸'}
                  </button>
                  <button
                    onClick={() => setActivePackId(pack.id)}
                    className={css`text-align:left;background:transparent;border:0;padding:0;color:var(--tm-text);cursor:pointer;`}
                  >
                    <strong>{pack.name}</strong> <span className={css`opacity:.7;font-size:11px;`}>({pack.items.length})</span>
                  </button>
                </div>
                <button
                  className={dangerBtn}
                  onClick={() => {
                    requestConfirmation('Delete icon pack?', `Delete pack "${pack.name}" and all of its icons?`, 'Delete', () => {
                      patchTopology({ iconPacks: topology.iconPacks.filter((x) => x.id !== pack.id) });
                      setSelectedPackIcons((s) => {
                        const next = { ...s };
                        delete next[pack.id];
                        return next;
                      });
                      if (activePackId === pack.id) {
                        setActivePackId('');
                      }
                    });
                  }}
                >
                  Delete pack
                </button>
              </div>
              {openPackIds[pack.id] && (
                <div className={css`height:280px;min-height:160px;max-height:560px;resize:vertical;overflow:auto;margin-top:6px;`}>
                <div className={css`display:flex;gap:6px;margin-bottom:6px;`}>
                  {(selectedPackIcons[pack.id] ?? []).length > 1 && (
                    <button
                      className={dangerBtn}
                      onClick={() => {
                        const keys = selectedPackIcons[pack.id] ?? [];
                        requestConfirmation('Delete selected icons?', `Delete ${keys.length} selected icon(s)?`, 'Delete', () => {
                          patchTopology({
                            iconPacks: topology.iconPacks.map((x) =>
                              x.id !== pack.id ? x : { ...x, items: x.items.filter((i) => !keys.includes(i.key)) }
                            ),
                          });
                          setSelectedPackIcons((s) => ({ ...s, [pack.id]: [] }));
                          if (keys.includes(activeIconKey)) {
                            setActiveIconKey('');
                          }
                        });
                      }}
                    >
                      Delete selected
                    </button>
                  )}
                </div>
                {pack.items
                  .filter((it) => !packIconSearch.trim() || it.key.toLowerCase().includes(packIconSearch.toLowerCase()))
                  .map((it) => (
                <div
                  key={it.key}
                  onClick={() => setActiveIconKey(it.key)}
                  className={css`display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;padding:4px;border-radius:6px;cursor:pointer;background:${activeIconKey === it.key ? 'var(--tm-bg-input)' : 'transparent'};`}
                >
                  <div className={css`display:flex;align-items:center;gap:8px;`}>
                    <input
                      type="checkbox"
                      checked={(selectedPackIcons[pack.id] ?? []).includes(it.key)}
                      onChange={(e) => togglePackIcon(pack.id, it.key, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <img className={miniPreview} src={resolveIconUrl({ type: 'pack', value: `${pack.id}:${it.key}` }, topology.iconPacks)} alt={it.key} />
                    {editingIconKey === it.key ? (
                      <input
                        value={editingIconName}
                        onChange={(e) => setEditingIconName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') {
                            return;
                          }
                          e.preventDefault();
                          const nextName = editingIconName.trim();
                          if (!nextName || nextName === it.key) {
                            setEditingIconKey('');
                            return;
                          }
                          if (pack.items.some((x) => x.key === nextName)) {
                            setPackNotice('Icon with this name already exists in this pack');
                            return;
                          }
                          patchTopology({
                            iconPacks: topology.iconPacks.map((x) =>
                              x.id !== pack.id
                                ? x
                                : { ...x, items: x.items.map((z) => (z.key === it.key ? { ...z, key: nextName } : z)) }
                            ),
                            nodes: topology.nodes.map((n) =>
                              n.icon.type === 'pack' && n.icon.value === `${pack.id}:${it.key}`
                                ? { ...n, icon: { ...n.icon, value: `${pack.id}:${nextName}` } }
                                : n
                            ),
                          });
                          setSelectedPackIcons((s) => ({
                            ...s,
                            [pack.id]: (s[pack.id] ?? []).map((k) => (k === it.key ? nextName : k)),
                          }));
                          setActiveIconKey(nextName);
                          setEditingIconKey('');
                        }}
                      />
                    ) : (
                      <span>{it.key}</span>
                    )}
                  </div>
                  <div className={css`display:flex;gap:6px;`}>
                    {activeIconKey === it.key && (
                      <button
                        className={ghostBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editingIconKey !== it.key) {
                            setEditingIconKey(it.key);
                            setEditingIconName(it.key);
                            return;
                          }
                          const nextName = editingIconName.trim();
                          if (!nextName || nextName === it.key) {
                            setEditingIconKey('');
                            return;
                          }
                          if (pack.items.some((x) => x.key === nextName)) {
                            setPackNotice('Icon with this name already exists in this pack');
                            return;
                          }
                          patchTopology({
                            iconPacks: topology.iconPacks.map((x) =>
                              x.id !== pack.id
                                ? x
                                : { ...x, items: x.items.map((z) => (z.key === it.key ? { ...z, key: nextName } : z)) }
                            ),
                            nodes: topology.nodes.map((n) =>
                              n.icon.type === 'pack' && n.icon.value === `${pack.id}:${it.key}`
                                ? { ...n, icon: { ...n.icon, value: `${pack.id}:${nextName}` } }
                                : n
                            ),
                          });
                          setSelectedPackIcons((s) => ({
                            ...s,
                            [pack.id]: (s[pack.id] ?? []).map((k) => (k === it.key ? nextName : k)),
                          }));
                          setActiveIconKey(nextName);
                          setEditingIconKey('');
                        }}
                        title="Rename icon"
                      >
                        {editingIconKey === it.key ? 'OK' : '✎'}
                      </button>
                    )}
                    {activeIconKey === it.key && (
                      <button
                        className={dangerBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          requestConfirmation('Delete icon?', `Delete icon "${it.key}"?`, 'Delete', () => {
                            patchTopology({ iconPacks: topology.iconPacks.map((x) => x.id !== pack.id ? x : { ...x, items: x.items.filter((z) => z.key !== it.key) }) });
                            setSelectedPackIcons((s) => ({ ...s, [pack.id]: (s[pack.id] ?? []).filter((k) => k !== it.key) }));
                            if (activeIconKey === it.key) {
                              setActiveIconKey('');
                            }
                          });
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                ))}
                </div>
              )}
            </div>
          ))}
        </div>
          </>
        )}
      </div>

      <div className={section}>
        <button className={sectionToggle} type="button" onClick={() => setOpenNodes((v) => !v)}>
          <span>Nodes</span>
          <span>{openNodes ? '▾' : '▸'}</span>
        </button>
        {openNodes && (
          <>
        <div className={chips}>
          <button onClick={() => {
            const nextNum = Math.max(0, ...topology.nodes.map((n) => Number((n.id.match(/^n(\d+)$/i) ?? [])[1] ?? 0))) + 1;
            const id = `n${nextNum}`;
            const node = createDefaultNode(id);
            const last = topology.nodes[topology.nodes.length - 1];
            const offsetX = last ? last.x + 24 : node.x;
            const offsetY = last ? last.y + 20 : node.y;
            patchTopology({ nodes: [...topology.nodes, { ...node, x: offsetX, y: offsetY, label: `Node${nextNum}` }], selectedNodeId: id, selectedLinkId: '' });
            setSelection(id, '');
          }}>Add node</button>
          {selectedNode && <button className={dangerBtn} onClick={() => {
            if (!selectedNode) {
              return;
            }
            const attached = topology.links.filter((l) => l.from === selectedNode.id || l.to === selectedNode.id).length;
            const deleteNode = () => {
              patchTopology({
                nodes: topology.nodes.filter((n) => n.id !== selectedNode.id),
                links: topology.links.filter((l) => l.from !== selectedNode.id && l.to !== selectedNode.id),
                selectedNodeId: '',
                selectedLinkId: '',
              });
              setSelection('', '');
            };
            if (attached > 1) {
              requestConfirmation('Delete node?', `Node has ${attached} links. Delete the node and all attached links?`, 'Delete', deleteNode);
              return;
            }
            deleteNode();
          }}>Delete node</button>}
        </div>
        <div className={list}>{topology.nodes.map((n) => <div key={n.id} onClick={() => { setSelection(n.id, ''); patchTopology({ selectedNodeId: n.id, selectedLinkId: '' }); }} className={css`padding:6px;cursor:pointer;${selectedNodeId === n.id ? selectedRow : normalRow}`}>{n.label}</div>)}</div>

        {selectedNode && (
          <>
            <div className={row}><label>Label</label><input value={selectedNode.label} onChange={(e) => patchNode({ label: e.target.value })} /></div>
            <div className={row}>
              <label>Label pos</label>
              <select
                value={selectedNode.labelPosition ?? 'outside-bottom'}
                onChange={(e) =>
                  patchNode({
                    labelPosition:
                      (e.target.value === 'inside-top' || e.target.value === 'inside-bottom') &&
                      selectedNode.decoration.shape !== 'square'
                        ? 'inside-center'
                        : (e.target.value as any),
                  })
                }
              >
                <option value="outside-bottom">Outside Bottom</option>
                <option value="outside-top">Outside Top</option>
                <option value="outside-left">Outside Left</option>
                <option value="outside-right">Outside Right</option>
                <option value="inside-center">Inside Center</option>
                {selectedNode.decoration.shape === 'square' && <option value="inside-top">Inside Top</option>}
                {selectedNode.decoration.shape === 'square' && <option value="inside-bottom">Inside Bottom</option>}
              </select>
            </div>
            <div className={row}>
              <label>Icon search</label>
              <input
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder="search icon"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') {
                    return;
                  }
                  const q = iconSearch.trim().toLowerCase();
                  const found = iconChoices.find((x) => x.label.toLowerCase().includes(q));
                  if (found) {
                    patchNode({ icon: decodeIconValue(found.value) });
                  }
                }}
              />
            </div>
            <div className={row}>
              <label>Icon</label>
              <select value={encodeIconValue(selectedNode.icon.type, selectedNode.icon.value)} onChange={(e) => patchNode({ icon: decodeIconValue(e.target.value) })}>
                <option value={encodeIconValue('none', '')}>No icon</option>
                {iconChoices.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                <option value={encodeIconValue('url', selectedNode.icon.type === 'url' ? selectedNode.icon.value : '')}>Custom URL</option>
              </select>
            </div>
            {selectedNode.icon.type === 'url' && <div className={row}><label>Icon URL</label><input value={selectedNode.icon.value} onChange={(e) => patchNode({ icon: { type: 'url', value: e.target.value } })} /></div>}
            <div className={row}><label>Shape</label><select value={selectedNode.decoration.shape} onChange={(e) => {
              const nextShape = e.target.value as any;
              const nextLabel =
                nextShape !== 'square' && (selectedNode.labelPosition === 'inside-top' || selectedNode.labelPosition === 'inside-bottom')
                  ? 'inside-center'
                  : selectedNode.labelPosition;
              patchNode({ decoration: { ...selectedNode.decoration, shape: nextShape }, labelPosition: nextLabel });
            }}><option value="circle">circle</option><option value="square">square</option><option value="triangle">triangle</option><option value="diamond">diamond</option></select></div>
            <div className={row}><label>Halo</label><input type="checkbox" checked={selectedNode.decoration.enabled} onChange={(e) => {
              const nextEnabled = e.target.checked;
              const nextHalo = selectedNode.statusDecoration?.enabled && !nextEnabled ? true : nextEnabled;
              patchNode({ decoration: { ...selectedNode.decoration, enabled: nextHalo } });
            }} /></div>
            <div className={row}>
              <label>Halo width</label>
              <div className={css`display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center;`}>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={Math.max(1, Math.min(10, selectedNode.decoration.haloWidth ?? 2))}
                  onChange={(e) => patchNode({ decoration: { ...selectedNode.decoration, haloWidth: Number(e.target.value) } })}
                />
                <NumberInput
                  value={Math.max(1, Math.min(10, selectedNode.decoration.haloWidth ?? 2))}
                  min={1}
                  max={10}
                  step={1}
                  onCommit={(n) => patchNode({ decoration: { ...selectedNode.decoration, haloWidth: Math.max(1, Math.min(10, Math.round(n))) } })}
                />
              </div>
            </div>
            <div className={row}>
              <label>Node background</label>
              <div className={css`display:flex;align-items:center;gap:8px;`}>
                <input type="color" value={selectedNode.backgroundColor || '#1f2937'} onChange={(e) => patchNode({ backgroundColor: e.target.value })} />
                <button type="button" onClick={() => patchNode({ backgroundColor: '' })}>Reset</button>
              </div>
            </div>
            <div className={row}><label>Status</label><input type="checkbox" checked={selectedNode.statusDecoration?.enabled ?? false} onChange={(e) => {
              const enabled = e.target.checked;
              patchNode({
                statusDecoration: { ...(selectedNode.statusDecoration ?? { enabled: false, matchBy: 'seriesName', matchValue: '', valueField: '', aggregate: 'last', mode: 'binary', thresholds: { warn: 1, crit: 0 }, thresholdDirection: 'higherIsWorse', colors: { ok: '#22c55e', warn: '#f59e0b', crit: '#ef4444' } }), enabled },
                decoration: enabled && !selectedNode.decoration.enabled
                  ? { ...selectedNode.decoration, enabled: true }
                  : selectedNode.decoration,
              });
            }} /></div>
            {selectedNode.statusDecoration?.enabled && (
              <>
                <div className={row}>
                  <label>Status source</label>
                  <select
                    value={selectedNode.statusDecoration.sourceValue ? encodeMatchTarget(selectedNode.statusDecoration.sourceBy ?? 'seriesName', selectedNode.statusDecoration.sourceValue) : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        patchNode({ statusDecoration: { ...selectedNode.statusDecoration, sourceValue: '', matchValue: '' } });
                        return;
                      }
                      const next = decodeMatchTarget(e.target.value);
                      patchNode({ statusDecoration: { ...selectedNode.statusDecoration, sourceBy: 'refId', sourceValue: next.matchValue, matchBy: 'seriesName', matchValue: '' } });
                    }}
                  >
                    <option value="">(auto)</option>
                    {queryChoices.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                  </select>
                </div>
                <div className={row}>
                  <label>Status target</label>
                  <SearchSuggestInput
                    value={selectedNode.statusDecoration.matchValue}
                    options={statusLegendChoices}
                    onChange={(value) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, matchBy: 'seriesName', matchValue: value, aggregate: 'last' } })}
                    placeholder="Type legend text"
                  />
                </div>
                <div className={row}><label>Status mode</label><select value={selectedNode.statusDecoration.mode ?? 'binary'} onChange={(e) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, mode: e.target.value as 'binary' | 'thresholds' } })}><option value="binary">binary (0/1)</option><option value="thresholds">thresholds</option></select></div>
                {selectedNode.statusDecoration.mode === 'thresholds' && (
                  <>
                    <div className={row}><label>Status direction</label><select value={selectedNode.statusDecoration.thresholdDirection} onChange={(e) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, thresholdDirection: e.target.value as 'higherIsWorse' | 'lowerIsWorse' } })}><option value="higherIsWorse">higherIsWorse</option><option value="lowerIsWorse">lowerIsWorse</option></select></div>
                    <div className={row}><label>Status warn/crit</label><div><NumberInput value={selectedNode.statusDecoration.thresholds?.warn ?? 1} onCommit={(n) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, thresholds: { ...(selectedNode.statusDecoration.thresholds ?? { warn: 1, crit: 0 }), warn: n } } })} /><NumberInput value={selectedNode.statusDecoration.thresholds?.crit ?? 0} onCommit={(n) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, thresholds: { ...(selectedNode.statusDecoration.thresholds ?? { warn: 1, crit: 0 }), crit: n } } })} /></div></div>
                  </>
                )}
                <div className={row}><label>Status ON</label><input type="color" value={selectedNode.statusDecoration.colors.ok} onChange={(e) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, colors: { ...selectedNode.statusDecoration.colors, ok: e.target.value } } })} /></div>
                {selectedNode.statusDecoration.mode === 'thresholds' && <div className={row}><label>Status WARN</label><input type="color" value={selectedNode.statusDecoration.colors.warn} onChange={(e) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, colors: { ...selectedNode.statusDecoration.colors, warn: e.target.value } } })} /></div>}
                <div className={row}><label>Status DOWN</label><input type="color" value={selectedNode.statusDecoration.colors.crit} onChange={(e) => patchNode({ statusDecoration: { ...selectedNode.statusDecoration, colors: { ...selectedNode.statusDecoration.colors, crit: e.target.value } } })} /></div>
              </>
            )}
            <div className={row}><label>Size</label><NumberInput value={selectedNode.size} min={14} max={120} onCommit={(n) => patchNode({ size: n })} /></div>
            <div className={row}><label>Show value</label><input type="checkbox" checked={selectedNode.showValue} onChange={(e) => patchNode({ showValue: e.target.checked })} /></div>
            <div className={row}><label>Value font size</label><NumberInput value={selectedNode.valueFontSize ?? 11} min={8} max={28} step={1} onCommit={(n) => patchNode({ valueFontSize: Math.max(8, Math.min(28, Math.round(n))) })} /></div>
            <div className={row}><label>Icon animate</label><input type="checkbox" checked={selectedNode.animatedIcon?.enabled ?? false} onChange={(e) => patchNode({ animatedIcon: { ...(selectedNode.animatedIcon ?? { enabled: false, type: 'pulse', speed: 1 }), enabled: e.target.checked } })} /></div>
            {selectedNode.animatedIcon?.enabled && (
              <>
                <div className={row}><label>Anim type</label><select value={selectedNode.animatedIcon?.type ?? 'pulse'} onChange={(e) => patchNode({ animatedIcon: { ...(selectedNode.animatedIcon ?? { enabled: false, type: 'pulse', speed: 1 }), type: e.target.value as 'pulse' | 'spin' | 'heartbeat' } })}><option value="pulse">pulse</option><option value="heartbeat">heartbeat</option><option value="spin">spin</option></select></div>
                <div className={row}><label>Anim speed</label><NumberInput value={selectedNode.animatedIcon?.speed ?? 1} min={0.1} step={0.1} onCommit={(n) => patchNode({ animatedIcon: { ...(selectedNode.animatedIcon ?? { enabled: false, type: 'pulse', speed: 1 }), speed: n } })} /></div>
                {selectedNode.animatedIcon?.type === 'spin' && (
                  <div className={row}><label>Spin dir</label><select value={selectedNode.animatedIcon?.direction ?? 'cw'} onChange={(e) => patchNode({ animatedIcon: { ...(selectedNode.animatedIcon ?? { enabled: false, type: 'spin', speed: 1 }), direction: e.target.value as 'cw' | 'ccw' } })}><option value="cw">clockwise</option><option value="ccw">counterclockwise</option></select></div>
                )}
              </>
            )}
            <div className={row}>
              <label>Value source</label>
              <select
                value={selectedNode.sourceValue ? encodeMatchTarget(selectedNode.sourceBy ?? 'seriesName', selectedNode.sourceValue) : ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    patchNode({ sourceValue: '', matchValue: '' });
                    return;
                  }
                  const next = decodeMatchTarget(e.target.value);
                  patchNode({ sourceBy: 'refId', sourceValue: next.matchValue, matchBy: 'seriesName', matchValue: '' });
                }}
              >
                <option value="">(auto)</option>
                {queryChoices.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
            <div className={row}>
              <label>Value target</label>
              <SearchSuggestInput
                value={selectedNode.matchValue}
                options={nodeLegendChoices}
                onChange={(value) => patchNode({ matchBy: 'seriesName', matchValue: value })}
                placeholder="Type legend text"
              />
            </div>
          </>
        )}
        {selectedNode && <div className={row}>
          <label>Custom node unit</label>
          <input
            type="checkbox"
            checked={topology.global.useCustomNodeUnit}
            onChange={(e) => patchTopology({ global: { ...topology.global, useCustomNodeUnit: e.target.checked } })}
          />
        </div>}
        {selectedNode && topology.global.useCustomNodeUnit && <div className={row}>
          <label>Node value</label>
          <div className={css`display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;align-items:center;`}>
            <input
              list="node-unit-list"
              value={selectedNode.valueUnit ?? ''}
              onChange={(e) => patchNode({ valueUnit: e.target.value })}
              placeholder="custom unit"
            />
            <NumberInput
              value={selectedNode.valueDivisor ?? 1}
              min={0.000001}
              step={0.1}
              onCommit={(n) => patchNode({ valueDivisor: Number.isFinite(n) && n > 0 ? n : 1 })}
            />
          </div>
        </div>}
          </>
        )}
      </div>

      <div className={section}>
        <button className={sectionToggle} type="button" onClick={() => setOpenLinks((v) => !v)}>
          <span>Links</span>
          <span>{openLinks ? '▾' : '▸'}</span>
        </button>
        {openLinks && (
          <>
        <div className={chips}>
          <button onClick={() => {
            if (topology.nodes.length < 2) {
              return;
            }
            const nextNum = Math.max(0, ...topology.links.map((l) => Number((l.id.match(/^l(\d+)$/i) ?? [])[1] ?? 0))) + 1;
            const id = `l${nextNum}`;
            const link = createDefaultLink(id, topology.nodes[0].id, topology.nodes[1].id);
            patchTopology({
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
              selectedLinkId: id,
              selectedNodeId: '',
            });
            setSelection('', id);
          }}>Add link</button>
          {selectedLink && <button className={dangerBtn} onClick={() => {
            if (!selectedLink) {
              return;
            }
            patchTopology({ links: topology.links.filter((l) => l.id !== selectedLink.id), selectedLinkId: '', selectedNodeId: '' });
            setSelection('', '');
          }}>Delete link</button>}
        </div>

        <div className={row}><label>Search</label><input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="label or id" /></div>
        <div className={list}>{filteredLinks.map((l) => <div key={l.id} onClick={() => { setSelection('', l.id); patchTopology({ selectedNodeId: '', selectedLinkId: l.id }); }} className={css`padding:6px;cursor:pointer;${selectedLinkId === l.id ? selectedRow : normalRow}`}>{l.label}</div>)}</div>

        {selectedLink && (
          <>
            <div className={row}><label>Label</label><input value={selectedLink.label} onChange={(e) => patchLink({ label: e.target.value })} /></div>
            <div className={row}><label>From</label><input list="node-from-list" value={fromInput} onChange={(e) => { setFromInput(e.target.value); patchLink({ from: resolveNodeId(e.target.value) }); }} /><datalist id="node-from-list">{topology.nodes.map((n) => <option key={n.id} value={n.label}>{n.id}</option>)}</datalist></div>
            <div className={row}><label>To</label><input list="node-to-list" value={toInput} onChange={(e) => { setToInput(e.target.value); patchLink({ to: resolveNodeId(e.target.value) }); }} /><datalist id="node-to-list">{topology.nodes.map((n) => <option key={n.id} value={n.label}>{n.id}</option>)}</datalist></div>
            <div className={row}>
              <label>Show/Directional</label>
              <div className={css`display:flex;align-items:center;gap:12px;`}>
                <label className={css`display:flex;align-items:center;gap:6px;`}><input type="checkbox" checked={selectedLink.showValue} onChange={(e) => patchLink({ showValue: e.target.checked })} /> value</label>
                {selectedLinkValuesVisible && (
                  <label className={css`display:flex;align-items:center;gap:6px;`}><input type="checkbox" checked={selectedLink.directional.enabled} onChange={(e) => patchLink({ directional: { ...selectedLink.directional, enabled: e.target.checked } })} /> directional</label>
                )}
              </div>
            </div>
            {selectedLink.showValue && (
              <>
                <div className={groupBlock}>
                  <div className={groupTitle}>Value</div>
                  <div className={row}>
                    <label>Query source</label>
                    <select
                      value={selectedLink.sourceValue ? encodeMatchTarget(selectedLink.sourceBy ?? 'seriesName', selectedLink.sourceValue) : ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          patchLink({ sourceValue: '', matchValue: '' });
                          return;
                        }
                        const next = decodeMatchTarget(e.target.value);
                        patchLink({ sourceBy: 'refId', sourceValue: next.matchValue, matchBy: 'seriesName', matchValue: '' });
                      }}
                    >
                      <option value="">Select query</option>
                      {queryChoices.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
                    </select>
                  </div>
                  <div className={row}>
                    <label>Query target</label>
                    <SearchSuggestInput
                      value={selectedLink.matchValue}
                      options={linkLegendChoices}
                      onChange={(value) => patchLink({ matchBy: 'seriesName', matchValue: value })}
                      placeholder="Type legend text"
                    />
                  </div>
                  <div className={row}><label>Aggregate</label><select value={selectedLink.aggregate} onChange={(e) => patchLink({ aggregate: e.target.value as AggregateMode })}>{aggregateModes.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
                  <div className={row}><label>Value font size</label><NumberInput value={selectedLink.valueFontSize ?? 11} min={8} max={28} step={1} onCommit={(n) => patchLink({ valueFontSize: Math.max(8, Math.min(28, Math.round(n))) })} /></div>
                  <div className={row}><label>Value badge</label><select value={selectedLink.valueBadgeStyle ?? 'pill'} onChange={(e) => patchLink({ valueBadgeStyle: e.target.value as 'pill' | 'text' })}><option value="pill">pill</option><option value="text">text only</option></select></div>
                  <div className={row}>
                    <label>Label offset %</label>
                    <div className={css`display:grid;grid-template-columns:1fr 70px;gap:8px;align-items:center;`}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={selectedLink.labelOffsetPct ?? 50}
                        onChange={(e) => patchLink({ labelOffsetPct: Number(e.target.value) })}
                      />
                      <NumberInput value={selectedLink.labelOffsetPct ?? 50} min={0} max={100} step={1} onCommit={(n) => patchLink({ labelOffsetPct: n })} />
                    </div>
                  </div>
                  <div className={row}>
                    <label>Label shift X/Y</label>
                    <div className={css`display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center;`}>
                      <NumberInput value={selectedLink.labelOffsetX ?? 0} min={-200} max={200} step={1} onCommit={(n) => patchLink({ labelOffsetX: n })} />
                      <NumberInput value={selectedLink.labelOffsetY ?? 0} min={-200} max={200} step={1} onCommit={(n) => patchLink({ labelOffsetY: n })} />
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className={row}><label>Direction</label><select value={selectedLink.thresholdDirection} onChange={(e) => patchLink({ thresholdDirection: e.target.value as 'higherIsWorse' | 'lowerIsWorse' })}><option value="higherIsWorse">higherIsWorse</option><option value="lowerIsWorse">lowerIsWorse</option></select></div>
            {selectedLinkDirectionalControlsVisible && (
              <div className={groupBlock}>
                <div className={groupTitle}>Directional</div>
                <div className={row}>
                  <label>Inbound target</label>
                  <SearchSuggestInput
                    value={selectedLink.directional.inTargetValue ?? ''}
                    options={inboundLegendChoices}
                    onChange={(value) => patchLink({ directional: { ...selectedLink.directional, inTargetValue: value } })}
                    placeholder="Type legend text"
                  />
                </div>
                <div className={row}>
                  <label>Outbound target</label>
                  <SearchSuggestInput
                    value={selectedLink.directional.outTargetValue ?? ''}
                    options={outboundLegendChoices}
                    onChange={(value) => patchLink({ directional: { ...selectedLink.directional, outTargetValue: value } })}
                    placeholder="Type legend text"
                  />
                </div>
                <div className={row}><label>Directional agg</label><select value={selectedLink.directional.aggregate} onChange={(e) => patchLink({ directional: { ...selectedLink.directional, aggregate: e.target.value as AggregateMode } })}>{aggregateModes.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
              </div>
            )}
            <div className={row}><label>Color mode</label><select value={selectedLink.colorMode} onChange={(e) => patchLink({ colorMode: e.target.value as 'fixed' | 'threshold' })}><option value="fixed">fixed</option><option value="threshold">threshold</option></select></div>
            <div className={row}><label>Fixed color</label><input type="color" value={selectedLink.colorFixed || '#8E8E8E'} onChange={(e) => patchLink({ colorFixed: e.target.value })} /></div>
            <div className={row}><label>Width mode</label><select value={selectedLink.widthMode} onChange={(e) => patchLink({ widthMode: e.target.value as 'fixed' | 'byValue' })}><option value="fixed">fixed</option><option value="byValue">byValue</option></select></div>
            <div className={row}><label>width fixed</label><NumberInput value={selectedLink.widthFixed ?? 2} min={1} onCommit={(n) => patchLink({ widthFixed: n })} /></div>
            <div className={row}><label>width min/max</label><div><NumberInput value={selectedLink.widthMin ?? 1} min={1} onCommit={(n) => patchLink({ widthMin: n })} /><NumberInput value={selectedLink.widthMax ?? 8} min={1} onCommit={(n) => patchLink({ widthMax: n })} /></div></div>
            <div className={row}><label>animate</label><input type="checkbox" checked={selectedLink.animate.enabled} onChange={(e) => patchLink({ animate: { ...selectedLink.animate, enabled: e.target.checked } })} /></div>
            {!selectedLink.animate.enabled && (
              <div className={row}>
                <label>Arrow</label>
                <select value={selectedLink.arrow} onChange={(e) => patchLink({ arrow: e.target.value as 'none' | 'forward' | 'backward' | 'both' })}>
                  <option value="none">none</option>
                  <option value="forward">from -&gt; to</option>
                  <option value="backward">to -&gt; from</option>
                  <option value="both">both</option>
                </select>
              </div>
            )}
            {selectedLink.animate.enabled && (
              <>
                <div className={row}><label>style</label><select value={selectedLink.animate.style} onChange={(e) => patchLink({ animate: { ...selectedLink.animate, style: e.target.value as 'flow' | 'dash' } })}><option value="flow">flow</option><option value="dash">dash</option></select></div>
                <div className={row}><label>speed</label><NumberInput value={selectedLink.animate.speed} min={0.1} step={0.1} onCommit={(n) => patchLink({ animate: { ...selectedLink.animate, speed: n } })} /></div>
              </>
            )}
            {!selectedLink.animate.enabled && (
              <div className={row}>
                <label>Line</label>
                <select value={selectedLink.lineStyle ?? 'solid'} onChange={(e) => patchLink({ lineStyle: e.target.value as 'solid' | 'dashed' })}>
                  <option value="solid">solid</option>
                  <option value="dashed">dashed</option>
                </select>
              </div>
            )}
            <div className={row}>
              <label>Anchor From/To</label>
              <div className={css`display:flex;gap:8px;`}>
                <select value={selectedLink.anchorFrom ?? 'center'} onChange={(e) => patchLink({ anchorFrom: e.target.value as AnchorSide })}>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                </select>
                <select value={selectedLink.anchorTo ?? 'center'} onChange={(e) => patchLink({ anchorTo: e.target.value as AnchorSide })}>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                </select>
              </div>
            </div>
            <div className={row}><label>Add bend</label><button onClick={() => {
              const fromNode = topology.nodes.find((n) => n.id === selectedLink.from);
              const toNode = topology.nodes.find((n) => n.id === selectedLink.to);
              const start = { x: fromNode?.x ?? 100, y: fromNode?.y ?? 100 };
              const end = { x: toNode?.x ?? 200, y: toNode?.y ?? 200 };
              const points = polylinePoints(start, end, selectedLink.bends);
              const labelRatio = Math.max(0, Math.min(1, (selectedLink.labelOffsetPct ?? 50) / 100));
              const badgePoint = polylinePointAtRatio(points, labelRatio);
              const badgeX = badgePoint.x + (selectedLink.labelOffsetX ?? 0);
              const badgeY = badgePoint.y + (selectedLink.labelOffsetY ?? 0);

              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const len = Math.max(Math.hypot(dx, dy), 1);
              const nx = -dy / len;
              const ny = dx / len;
              const lastBend = selectedLink.bends.at(-1);
              const offsetStep = 42 + selectedLink.bends.length * 10;
              let nextX = lastBend ? lastBend.x + nx * offsetStep : (start.x + end.x) / 2 + nx * 32;
              let nextY = lastBend ? lastBend.y + ny * offsetStep : (start.y + end.y) / 2 + ny * 32;

              if (distanceBetween(nextX, nextY, badgeX, badgeY) < 44) {
                nextX += nx * 42;
                nextY += ny * 42;
              }

              patchLink({ bends: [...selectedLink.bends, { id: nextId('b'), x: nextX, y: nextY }] });
            }}>Add bend</button></div>
            {selectedLink.bends.length > 0 && (
              <>
                <div className={row}><label>Curve</label><select value={selectedLink.curve} onChange={(e) => patchLink({ curve: e.target.value as 'polyline' | 'bezier' })}><option value="polyline">polyline</option><option value="bezier">bezier</option></select></div>
                <div className={row}><label>Remove bend</label><button onClick={() => patchLink({ bends: selectedLink.bends.slice(0, -1) })}>Remove bend</button></div>
              </>
            )}
          </>
        )}
        {selectedLink && <div className={row}>
          <label>Custom link unit</label>
          <input
            type="checkbox"
            checked={topology.global.useCustomLinkUnit}
            onChange={(e) => patchTopology({ global: { ...topology.global, useCustomLinkUnit: e.target.checked } })}
          />
        </div>}
        {selectedLink && topology.global.useCustomLinkUnit && (
          <div className={row}>
            <label>Link value</label>
            <div className={css`display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:8px;align-items:center;`}>
              <input
                list="node-unit-list"
                value={selectedLink.valueUnit ?? ''}
                onChange={(e) => patchLink({ valueUnit: e.target.value })}
                placeholder="custom unit"
              />
              <NumberInput
                value={selectedLink.valueDivisor ?? 1}
                min={0.000001}
                step={0.1}
                onCommit={(n) => patchLink({ valueDivisor: Number.isFinite(n) && n > 0 ? n : 1 })}
              />
            </div>
          </div>
        )}
        {selectedLink && selectedLink.animate.enabled && (
          <>
            <div className={row}><label>Flow mode</label><select value={selectedLink.animate.mode ?? 'fixed'} onChange={(e) => patchLink({ animate: { ...selectedLink.animate, mode: e.target.value as 'fixed' | 'byDirectional' } })}><option value="fixed">fixed</option><option value="byDirectional">byDirectional</option></select></div>
            {selectedLink.animate.mode === 'byDirectional' && !selectedLinkDirectionalControlsVisible && (
              <>
                <div className={row}><label>Directional</label><button onClick={() => patchLink({ directional: { ...selectedLink.directional, enabled: true } })}>Enable directional config</button></div>
              </>
            )}
          </>
        )}
          </>
        )}
      </div>

      <datalist id="node-unit-list">{commonUnits.map((u) => <option key={u} value={u} />)}</datalist>
      {pendingConfirmation && (
        <ConfirmModal
          isOpen
          title={pendingConfirmation.title}
          body={pendingConfirmation.body}
          confirmText={pendingConfirmation.confirmText}
          confirmVariant="destructive"
          onConfirm={() => {
            const action = pendingConfirmation.onConfirm;
            setPendingConfirmation(null);
            return action();
          }}
          onDismiss={() => setPendingConfirmation(null)}
        />
      )}
    </div>
  );
};
