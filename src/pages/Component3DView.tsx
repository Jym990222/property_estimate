import { Canvas } from '@react-three/fiber';
import { OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useRef, useLayoutEffect, useState } from 'react';
import { Button, Typography, InputNumber, Divider, Tag, Radio } from 'antd';
import { create } from 'zustand';

const { Text } = Typography;

/* ==================================================
   类型
================================================== */
type AnchorId = string;                      // 'a' | 'b' | 'top' | 'front' | ...
type AnchorType = 'end' | 'face';
type SteelKind = 'round' | 'square' | 'angle' | 'channel' | 'hbeam';
type TransformMode = 'translate' | 'rotate' | 'connect';

type Anchor = {
  id: AnchorId;
  localPos: THREE.Vector3;
  localNormal: THREE.Vector3;
  type: AnchorType;
};

type Dims = {
  D: number;
  B?: number;
  t?: number;
  tf?: number;
  tw?: number;
};

type SteelInstance = {
  id: string;
  kind: SteelKind;
  length: number;
  dims: Dims;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  defaultPosition: [number, number, number];
  defaultQuaternion: [number, number, number, number];
};

type Connection = {
  a: { id: string; anchor: AnchorId };
  b: { id: string; anchor: AnchorId };
};

type PendingAnchor = { instanceId: string; anchorId: AnchorId };

const SNAP_DIST = 40;
const STEEL_DENSITY = 7.85e-6;   // kg/mm³

/* ==================================================
   钢型定义
================================================== */
type FieldDef = {
  key: keyof Dims;
  label: string;
  default: number;
  min: number;
  step: number;
};

const KIND_DEFS: Record<SteelKind, {
  name: string;
  color: string;
  fields: FieldDef[];
}> = {
  round: {
    name: '圆钢',
    color: '#8fb8d8',
    fields: [{ key: 'D', label: '直径 D (mm)', default: 30, min: 1, step: 1 }],
  },
  square: {
    name: '方钢',
    color: '#d4915a',
    fields: [{ key: 'D', label: '边长 D (mm)', default: 40, min: 1, step: 1 }],
  },
  angle: {
    name: '等边角钢',
    color: '#a78bfa',
    fields: [
      { key: 'D', label: '边宽 D (mm)', default: 50, min: 1, step: 1 },
      { key: 't', label: '厚度 t (mm)', default: 5, min: 0.1, step: 0.5 },
    ],
  },
  channel: {
    name: '槽钢',
    color: '#10b981',
    fields: [
      { key: 'D', label: '高度 D (mm)', default: 80, min: 1, step: 1 },
      { key: 'B', label: '腿宽 B (mm)', default: 40, min: 1, step: 1 },
      { key: 't', label: '腰厚 t (mm)', default: 4.5, min: 0.1, step: 0.5 },
    ],
  },
  hbeam: {
    name: 'H型钢',
    color: '#f59e0b',
    fields: [
      { key: 'D', label: '高度 D (mm)', default: 100, min: 1, step: 1 },
      { key: 'B', label: '翼缘宽 B (mm)', default: 100, min: 1, step: 1 },
      { key: 'tw', label: '腹板厚 tw (mm)', default: 6, min: 0.1, step: 0.5 },
      { key: 'tf', label: '翼缘厚 tf (mm)', default: 8, min: 0.1, step: 0.5 },
    ],
  },
};

const KIND_ORDER: SteelKind[] = ['round', 'square', 'angle', 'channel', 'hbeam'];

const PRESETS: { label: string; kind: SteelKind; dims: Dims }[] = [
  { label: 'Φ30',            kind: 'round',   dims: { D: 30 } },
  { label: 'Φ50',            kind: 'round',   dims: { D: 50 } },
  { label: '□40',            kind: 'square',  dims: { D: 40 } },
  { label: '□60',            kind: 'square',  dims: { D: 60 } },
  { label: 'L50×5',          kind: 'angle',   dims: { D: 50, t: 5 } },
  { label: 'L63×6',          kind: 'angle',   dims: { D: 63, t: 6 } },
  { label: '[80×40×4.5',     kind: 'channel', dims: { D: 80, B: 40, t: 4.5 } },
  { label: '[100×48×5.3',    kind: 'channel', dims: { D: 100, B: 48, t: 5.3 } },
  { label: 'HW100×100×6×8',  kind: 'hbeam',   dims: { D: 100, B: 100, tw: 6, tf: 8 } },
  { label: 'HW200×200×8×12', kind: 'hbeam',   dims: { D: 200, B: 200, tw: 8, tf: 12 } },
];

function makeDefaultDims(kind: SteelKind): Dims {
  const d: Dims = { D: 0 };
  for (const f of KIND_DEFS[kind].fields) {
    (d as any)[f.key] = f.default;
  }
  return d;
}

function makeLabel(kind: SteelKind, dims: Dims): string {
  switch (kind) {
    case 'round':   return `圆钢 Φ${dims.D}`;
    case 'square':  return `方钢 ${dims.D}×${dims.D}`;
    case 'angle':   return `角钢 L${dims.D}×${dims.D}×${dims.t}`;
    case 'channel': return `槽钢 [${dims.D}×${dims.B}×${dims.t}`;
    case 'hbeam':   return `H型钢 ${dims.D}×${dims.B}×${dims.tw}×${dims.tf}`;
  }
}

/* ==================================================
   重量
================================================== */
function calcWeight(inst: SteelInstance): number {
  const L = inst.length;
  const { D, B = D, t = 0, tf = 0, tw = 0 } = inst.dims;
  let area = 0;
  switch (inst.kind) {
    case 'round':   area = Math.PI * (D / 2) ** 2;         break;
    case 'square':  area = D * D;                          break;
    case 'angle':   area = 2 * D * t - t * t;              break;
    case 'channel': area = 2 * B * t + (D - 2 * t) * t;    break;
    case 'hbeam':   area = 2 * B * tf + (D - 2 * tf) * tw; break;
  }
  return area * L * STEEL_DENSITY;
}

function fmtWeight(kg: number) {
  if (kg < 1) return `${(kg * 1000).toFixed(0)} g`;
  if (kg < 1000) return `${kg.toFixed(2)} kg`;
  return `${(kg / 1000).toFixed(3)} t`;
}

/* ==================================================
   锚点（端面 + 侧面）
================================================== */
function getAnchors(inst: SteelInstance): Anchor[] {
  const anchors: Anchor[] = [];
  const L = inst.length;
  const { D, B = D, tf = 0 } = inst.dims;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // 端面（所有钢型都有）
  anchors.push({ id: 'a', localPos: v(-L / 2, 0, 0), localNormal: v(-1, 0, 0), type: 'end' });
  anchors.push({ id: 'b', localPos: v( L / 2, 0, 0), localNormal: v( 1, 0, 0), type: 'end' });

  // 侧面（按钢型）
  switch (inst.kind) {
    case 'round':
      // 圆钢无平面侧表面，暂不提供
      break;

    case 'square': {
      const h = D / 2;
      anchors.push({ id: 'top',    localPos: v(0,  h, 0), localNormal: v(0,  1, 0), type: 'face' });
      anchors.push({ id: 'bottom', localPos: v(0, -h, 0), localNormal: v(0, -1, 0), type: 'face' });
      anchors.push({ id: 'front',  localPos: v(0, 0,  h), localNormal: v(0, 0,  1), type: 'face' });
      anchors.push({ id: 'back',   localPos: v(0, 0, -h), localNormal: v(0, 0, -1), type: 'face' });
      break;
    }

    case 'angle': {
      // L 形：外底面、外左面
      const h = D / 2;
      anchors.push({ id: 'leg-bottom', localPos: v(0, -h, 0), localNormal: v(0, -1, 0), type: 'face' });
      anchors.push({ id: 'leg-left',   localPos: v(-h, 0, 0), localNormal: v(-1, 0, 0), type: 'face' });
      break;
    }

    case 'channel': {
      const hh = D / 2;
      const hb = B / 2;
      anchors.push({ id: 'top',    localPos: v(0,  hh, 0), localNormal: v(0,  1, 0), type: 'face' });
      anchors.push({ id: 'bottom', localPos: v(0, -hh, 0), localNormal: v(0, -1, 0), type: 'face' });
      anchors.push({ id: 'back',   localPos: v(0, 0, -hb), localNormal: v(0, 0, -1), type: 'face' });
      break;
    }

    case 'hbeam': {
      const hh = D / 2;
      const hb = B / 2;
      anchors.push({ id: 'flange-top',       localPos: v(0,  hh, 0),          localNormal: v(0,  1, 0), type: 'face' });
      anchors.push({ id: 'flange-bottom',    localPos: v(0, -hh, 0),          localNormal: v(0, -1, 0), type: 'face' });
      anchors.push({ id: 'flange-top-z+',    localPos: v(0,  hh - tf / 2,  hb), localNormal: v(0, 0,  1), type: 'face' });
      anchors.push({ id: 'flange-top-z-',    localPos: v(0,  hh - tf / 2, -hb), localNormal: v(0, 0, -1), type: 'face' });
      anchors.push({ id: 'flange-bottom-z+', localPos: v(0, -hh + tf / 2,  hb), localNormal: v(0, 0,  1), type: 'face' });
      anchors.push({ id: 'flange-bottom-z-', localPos: v(0, -hh + tf / 2, -hb), localNormal: v(0, 0, -1), type: 'face' });
      break;
    }
  }

  return anchors;
}

/* 单个锚点的世界位姿 */
function anchorWorld(inst: SteelInstance, anchor: Anchor) {
  const q = new THREE.Quaternion(...inst.quaternion);
  const pos = anchor.localPos.clone().applyQuaternion(q).add(new THREE.Vector3(...inst.position));
  const normal = anchor.localNormal.clone().applyQuaternion(q).normalize();
  return { pos, normal };
}

/* ==================================================
   Store
================================================== */
let seq = 1;

const useStore = create<{
  instances: SteelInstance[];
  connections: Connection[];
  selected: string | null;
  hovered: string | null;
  mode: TransformMode;
  pendingAnchor: PendingAnchor | null;
  setMode: (m: TransformMode) => void;
  setPendingAnchor: (a: PendingAnchor | null) => void;
  addInstance: (kind: SteelKind, dims: Dims, length: number) => void;
  removeInstance: (id: string) => void;
  updateInstance: (id: string, patch: Partial<SteelInstance>) => void;
  setPosition: (id: string, p: [number, number, number]) => void;
  setQuaternion: (id: string, q: [number, number, number, number]) => void;
  addConnection: (a: Connection['a'], b: Connection['b']) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
}>((set, get) => ({
  instances: [],
  connections: [],
  selected: null,
  hovered: null,
  mode: 'translate',
  pendingAnchor: null,
  setMode: (mode) => set({ mode, pendingAnchor: null }),
  setPendingAnchor: (pendingAnchor) => set({ pendingAnchor }),

  addInstance: (kind, dims, length) => {
    const id = `s${seq++}`;
    const n = get().instances.length;
    const col = n % 3;
    const row = Math.floor(n / 3);
    const defaultPos: [number, number, number] = [
      (col - 1) * 400,
      -80,
      (row - 1) * 350,
    ];
    const defaultQ: [number, number, number, number] = [0, 0, 0, 1];
    const inst: SteelInstance = {
      id,
      kind,
      length,
      dims: { ...dims },
      position: defaultPos,
      quaternion: defaultQ,
      defaultPosition: defaultPos,
      defaultQuaternion: defaultQ,
    };
    set((s) => ({ instances: [...s.instances, inst], selected: id, pendingAnchor: null }));
  },

  removeInstance: (id) => {
    const { connections } = get();
    const group = findGroup(connections, id);
    if (group.size > 1) {
      set((s) => ({
        instances: s.instances
          .filter((inst) => inst.id !== id)
          .map((inst) =>
            group.has(inst.id)
              ? { ...inst, position: inst.defaultPosition, quaternion: inst.defaultQuaternion }
              : inst
          ),
        connections: s.connections.filter(
          (c) => !group.has(c.a.id) && !group.has(c.b.id)
        ),
        selected: null,
        pendingAnchor: null,
      }));
    } else {
      set((s) => ({
        instances: s.instances.filter((inst) => inst.id !== id),
        connections: s.connections.filter((c) => c.a.id !== id && c.b.id !== id),
        selected: s.selected === id ? null : s.selected,
        pendingAnchor:
          s.pendingAnchor?.instanceId === id ? null : s.pendingAnchor,
      }));
    }
  },

  updateInstance: (id, patch) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),

  setPosition: (id, position) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, position } : i)),
    })),

  setQuaternion: (id, quaternion) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, quaternion } : i)),
    })),

  addConnection: (a, b) =>
    set((s) => ({ connections: [...s.connections, { a, b }] })),

  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),
}));

/* ==================================================
   图工具
================================================== */
function findGroup(connections: Connection[], id: string): Set<string> {
  const result = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const c of connections) {
    if (!adj.has(c.a.id)) adj.set(c.a.id, []);
    if (!adj.has(c.b.id)) adj.set(c.b.id, []);
    adj.get(c.a.id)!.push(c.b.id);
    adj.get(c.b.id)!.push(c.a.id);
  }
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (result.has(cur)) continue;
    result.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return result;
}

function usedAnchors(connections: Connection[], instanceId: string): Set<AnchorId> {
  const s = new Set<AnchorId>();
  for (const c of connections) {
    if (c.a.id === instanceId) s.add(c.a.anchor);
    if (c.b.id === instanceId) s.add(c.b.anchor);
  }
  return s;
}

/* ==================================================
   截面构建
================================================== */
function buildCrossSection(kind: SteelKind, dims: Dims): THREE.Shape {
  const shape = new THREE.Shape();
  const D = dims.D;
  const B = dims.B ?? D;
  const t = dims.t ?? 0;
  const tf = dims.tf ?? 0;
  const tw = dims.tw ?? 0;

  switch (kind) {
    case 'round':
      shape.absarc(0, 0, D / 2, 0, Math.PI * 2, false);
      break;
    case 'square': {
      const s = D / 2;
      const r = Math.min(D * 0.06, 3);
      shape.moveTo(-s + r, -s);
      shape.lineTo(s - r, -s);
      shape.quadraticCurveTo(s, -s, s, -s + r);
      shape.lineTo(s, s - r);
      shape.quadraticCurveTo(s, s, s - r, s);
      shape.lineTo(-s + r, s);
      shape.quadraticCurveTo(-s, s, -s, s - r);
      shape.lineTo(-s, -s + r);
      shape.quadraticCurveTo(-s, -s, -s + r, -s);
      shape.closePath();
      break;
    }
    case 'angle': {
      const h = D / 2;
      shape.moveTo(-h, -h);
      shape.lineTo( h, -h);
      shape.lineTo( h, -h + t);
      shape.lineTo(-h + t, -h + t);
      shape.lineTo(-h + t,  h);
      shape.lineTo(-h,  h);
      shape.closePath();
      break;
    }
    case 'channel': {
      const hh = D / 2;
      const hb = B / 2;
      shape.moveTo(-hb, -hh);
      shape.lineTo( hb, -hh);
      shape.lineTo( hb, -hh + t);
      shape.lineTo(-hb + t, -hh + t);
      shape.lineTo(-hb + t,  hh - t);
      shape.lineTo( hb,  hh - t);
      shape.lineTo( hb,  hh);
      shape.lineTo(-hb,  hh);
      shape.closePath();
      break;
    }
    case 'hbeam': {
      const hh = D / 2;
      const hb = B / 2;
      const wt = Math.max(tw / 2, 0.5);
      shape.moveTo(-hb, -hh);
      shape.lineTo( hb, -hh);
      shape.lineTo( hb, -hh + tf);
      shape.lineTo( wt, -hh + tf);
      shape.lineTo( wt,  hh - tf);
      shape.lineTo( hb,  hh - tf);
      shape.lineTo( hb,  hh);
      shape.lineTo(-hb,  hh);
      shape.lineTo(-hb,  hh - tf);
      shape.lineTo(-wt,  hh - tf);
      shape.lineTo(-wt, -hh + tf);
      shape.lineTo(-hb, -hh + tf);
      shape.closePath();
      break;
    }
  }
  return shape;
}

/* ==================================================
   几何缓存
================================================== */
const geoCache = new Map<string, THREE.BufferGeometry>();

function dimsKey(kind: SteelKind, dims: Dims) {
  return [kind, dims.D, dims.B ?? '', dims.t ?? '', dims.tf ?? '', dims.tw ?? ''].join('|');
}

function getGeometry(inst: SteelInstance) {
  const key = `${dimsKey(inst.kind, inst.dims)}|L${inst.length}`;
  const cached = geoCache.get(key);
  if (cached) return cached;

  const shape = buildCrossSection(inst.kind, inst.dims);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: inst.length,
    bevelEnabled: false,
    curveSegments: 32,
    steps: 1,
  });

  g.center();
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/* ==================================================
   拖动吸附（仅端面 a / b）
================================================== */
function trySnapForGroup(draggedIds: string[]): boolean {
  const { instances, connections } = useStore.getState();
  const draggedSet = new Set(draggedIds);
  const draggedInstances = instances.filter((i) => draggedSet.has(i.id));
  const others = instances.filter((i) => !draggedSet.has(i.id));
  if (others.length === 0) return false;

  type Candidate = {
    gInst: SteelInstance; gAnchor: AnchorId;
    tInst: SteelInstance; tAnchor: AnchorId;
    distance: number;
  };
  let best: Candidate | null = null;

  for (const gInst of draggedInstances) {
    const usedG = usedAnchors(connections, gInst.id);
    for (const gAnchorId of ['a', 'b'] as AnchorId[]) {
      if (usedG.has(gAnchorId)) continue;
      const gAnchor = getAnchors(gInst).find((a) => a.id === gAnchorId)!;
      const gW = anchorWorld(gInst, gAnchor);

      for (const tInst of others) {
        const usedT = usedAnchors(connections, tInst.id);
        for (const tAnchorId of ['a', 'b'] as AnchorId[]) {
          if (usedT.has(tAnchorId)) continue;
          const tAnchor = getAnchors(tInst).find((a) => a.id === tAnchorId)!;
          const tW = anchorWorld(tInst, tAnchor);

          const d = gW.pos.distanceTo(tW.pos);
          if (d > SNAP_DIST) continue;
          const dot = gW.normal.dot(tW.normal);
          if (dot > -0.7) continue;
          if (!best || d < best.distance) {
            best = { gInst, gAnchor: gAnchorId, tInst, tAnchor: tAnchorId, distance: d };
          }
        }
      }
    }
  }

  if (!best) return false;
  applyConnectionAlign(draggedIds, best.gInst.id, best.gAnchor, best.tInst.id, best.tAnchor);
  return true;
}

/* ==================================================
   连接对齐核心
================================================== */
/**
 * 把 sourceId 所在的整组移动/旋转，使 sourceAnchorId 对齐到 targetAnchorId。
 * 两个锚点法线相反、位置重合。
 */
function applyConnectionAlign(
  movingIds: string[],
  sourceId: string,
  sourceAnchorId: AnchorId,
  targetId: string,
  targetAnchorId: AnchorId,
) {
  const { instances, addConnection } = useStore.getState();
  const sourceInst = instances.find((i) => i.id === sourceId);
  const targetInst = instances.find((i) => i.id === targetId);
  if (!sourceInst || !targetInst) return;

  const sAnchor = getAnchors(sourceInst).find((a) => a.id === sourceAnchorId);
  const tAnchor = getAnchors(targetInst).find((a) => a.id === targetAnchorId);
  if (!sAnchor || !tAnchor) return;

  const sW = anchorWorld(sourceInst, sAnchor);
  const tW = anchorWorld(targetInst, tAnchor);

  // source.normal → -target.normal
  const deltaQ = new THREE.Quaternion().setFromUnitVectors(
    sW.normal.clone(),
    tW.normal.clone().negate()
  );

  const sOldPos = new THREE.Vector3(...sourceInst.position);
  const sOldQ = new THREE.Quaternion(...sourceInst.quaternion);
  const newSourceQ = deltaQ.clone().multiply(sOldQ);

  const offsetAfterRot = sAnchor.localPos.clone().applyQuaternion(newSourceQ);
  const newSourcePos = tW.pos.clone().sub(offsetAfterRot);

  const movingSet = new Set(movingIds);

  for (const inst of instances) {
    if (!movingSet.has(inst.id)) continue;

    const oldPos = new THREE.Vector3(...inst.position);
    const oldQ = new THREE.Quaternion(...inst.quaternion);

    const rel = oldPos.clone().sub(sOldPos);
    const newRel = rel.clone().applyQuaternion(deltaQ);
    const newPos = newSourcePos.clone().add(newRel);
    const newQ = deltaQ.clone().multiply(oldQ);

    useStore.getState().setPosition(inst.id, newPos.toArray() as [number, number, number]);
    useStore.getState().setQuaternion(inst.id, newQ.toArray() as [number, number, number, number]);
  }

  addConnection(
    { id: sourceId, anchor: sourceAnchorId },
    { id: targetId, anchor: targetAnchorId }
  );
}

/* ==================================================
   钢材 Mesh
================================================== */
function SteelMesh({
  inst, selected, hovered, onClick, onHover,
}: {
  inst: SteelInstance;
  selected: boolean;
  hovered: boolean;
  onClick: () => void;
  onHover: (v: boolean) => void;
}) {
  const geo = useMemo(
    () => getGeometry(inst),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dimsKey(inst.kind, inst.dims), inst.length]
  );
  const q = useMemo(() => new THREE.Quaternion(...inst.quaternion), [inst.quaternion]);

  const baseColor = KIND_DEFS[inst.kind].color;
  const color = selected ? '#f59e0b' : hovered ? '#93c5fd' : baseColor;

  return (
    <mesh
      geometry={geo}
      position={inst.position}
      quaternion={q}
      castShadow
      receiveShadow
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(false); }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.75}
        roughness={0.32}
        emissive={selected ? '#7c3d00' : '#000'}
        emissiveIntensity={selected ? 0.35 : 0}
      />
    </mesh>
  );
}

/* ==================================================
   拖拽 gizmo（平移 / 旋转）
================================================== */
function DragHelper() {
  const instances = useStore((s) => s.instances);
  const connections = useStore((s) => s.connections);
  const selected = useStore((s) => s.selected);
  const mode = useStore((s) => s.mode);

  const pivotRef = useRef<THREE.Object3D | null>(null);
  if (!pivotRef.current) pivotRef.current = new THREE.Object3D();
  const pivot = pivotRef.current;

  const dragStartRef = useRef<{
    pivotPos: THREE.Vector3;
    pivotQ: THREE.Quaternion;
    memberStates: Map<string, { pos: THREE.Vector3; q: THREE.Quaternion }>;
  } | null>(null);

  useLayoutEffect(() => {
    if (!selected) return;
    const inst = useStore.getState().instances.find((i) => i.id === selected);
    if (!inst) return;
    pivot.position.set(...inst.position);
    pivot.quaternion.set(...inst.quaternion);
  }, [selected, pivot]);

  if (!selected) return null;
  if (mode === 'connect') return null;

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        object={pivot}
        mode={mode}
        onMouseDown={() => {
          const group = findGroup(connections, selected);
          const memberStates = new Map<string, { pos: THREE.Vector3; q: THREE.Quaternion }>();
          for (const id of group) {
            const inst = instances.find((i) => i.id === id);
            if (!inst) continue;
            memberStates.set(id, {
              pos: new THREE.Vector3(...inst.position),
              q: new THREE.Quaternion(...inst.quaternion),
            });
          }
          dragStartRef.current = {
            pivotPos: pivot.position.clone(),
            pivotQ: pivot.quaternion.clone(),
            memberStates,
          };
        }}
        onObjectChange={() => {
          if (!dragStartRef.current) return;
          const start = dragStartRef.current;

          if (mode === 'translate') {
            const delta = pivot.position.clone().sub(start.pivotPos);
            for (const [id, st] of start.memberStates) {
              const newPos = st.pos.clone().add(delta);
              useStore.getState().setPosition(id, newPos.toArray() as [number, number, number]);
            }
          } else {
            const deltaQ = pivot.quaternion.clone()
              .multiply(start.pivotQ.clone().invert());
            for (const [id, st] of start.memberStates) {
              const rel = st.pos.clone().sub(start.pivotPos);
              const rotated = rel.applyQuaternion(deltaQ);
              const newPos = start.pivotPos.clone().add(rotated);
              const newQ = deltaQ.clone().multiply(st.q);
              useStore.getState().setPosition(id, newPos.toArray() as [number, number, number]);
              useStore.getState().setQuaternion(id, newQ.toArray() as [number, number, number, number]);
            }
          }
        }}
        onMouseUp={() => {
          if (!dragStartRef.current) return;
          const draggedIds = [...dragStartRef.current.memberStates.keys()];
          dragStartRef.current = null;

          const snapped = trySnapForGroup(draggedIds);
          if (snapped) {
            const inst = useStore.getState().instances.find((i) => i.id === selected);
            if (inst) {
              pivot.position.set(...inst.position);
              pivot.quaternion.set(...inst.quaternion);
            }
          }
        }}
      />
    </>
  );
}

/* ==================================================
   连接模式：显示所有空闲锚点
================================================== */
function ConnectMarkers() {
  const instances = useStore((s) => s.instances);
  const connections = useStore((s) => s.connections);
  const mode = useStore((s) => s.mode);
  const pendingAnchor = useStore((s) => s.pendingAnchor);
  //const setPendingAnchor = useStore((s) => s.setPendingAnchor);

  const [hoveredAnchor, setHoveredAnchor] = useState<PendingAnchor | null>(null);

  if (mode !== 'connect') return null;

  const markers: JSX.Element[] = [];

  for (const inst of instances) {
    const used = usedAnchors(connections, inst.id);
    const anchors = getAnchors(inst);
    const q = new THREE.Quaternion(...inst.quaternion);
    const basePos = new THREE.Vector3(...inst.position);

    for (const anchor of anchors) {
      if (used.has(anchor.id)) continue;

      const wPos = anchor.localPos.clone().applyQuaternion(q).add(basePos);

      const isPending =
        pendingAnchor?.instanceId === inst.id && pendingAnchor?.anchorId === anchor.id;
      const isHovered =
        hoveredAnchor?.instanceId === inst.id && hoveredAnchor?.anchorId === anchor.id;

      let color = anchor.type === 'end' ? '#22c55e' : '#3b82f6';
      let radius = anchor.type === 'end' ? 7 : 5;

      if (isPending) {
        color = '#f59e0b';
        radius = 10;
      } else if (isHovered) {
        color = '#fbbf24';
        radius = 9;
      }

      markers.push(
        <mesh
          key={`${inst.id}-${anchor.id}`}
          position={wPos}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredAnchor({ instanceId: inst.id, anchorId: anchor.id });
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredAnchor(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleAnchorClick(inst.id, anchor.id);
          }}
        >
          <sphereGeometry args={[radius, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      );
    }
  }

  return <>{markers}</>;

  function handleAnchorClick(instanceId: string, anchorId: AnchorId) {
    const state = useStore.getState();
    const current = state.pendingAnchor;

    if (!current) {
      state.setPendingAnchor({ instanceId, anchorId });
      return;
    }

    // 点同一个：取消
    if (current.instanceId === instanceId && current.anchorId === anchorId) {
      state.setPendingAnchor(null);
      return;
    }

    // 同一个实例：忽略（不允许自连）
    if (current.instanceId === instanceId) {
      state.setPendingAnchor(null);
      return;
    }

    // 执行连接：先选的移动 → 对齐到后选的
    const movingIds = [...findGroup(state.connections, current.instanceId)];
    applyConnectionAlign(
      movingIds,
      current.instanceId,
      current.anchorId,
      instanceId,
      anchorId,
    );
    state.setPendingAnchor(null);
  }
}

/* ==================================================
   场景
================================================== */
function Scene() {
  const instances = useStore((s) => s.instances);
  const selected = useStore((s) => s.selected);
  const hovered = useStore((s) => s.hovered);

  return (
    <>
      <color attach="background" args={['#eef2f6']} />
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[400, 600, 400]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-400, -300, -400]} intensity={0.35} />

      <gridHelper args={[2400, 60, '#cbd5e1', '#e2e8f0']} position={[0, -150, 0]} />

      {instances.map((inst) => (
        <SteelMesh
          key={inst.id}
          inst={inst}
          selected={inst.id === selected}
          hovered={inst.id === hovered}
          onClick={() => useStore.getState().select(inst.id)}
          onHover={(v) => useStore.getState().hover(v ? inst.id : null)}
        />
      ))}

      <DragHelper />
      <ConnectMarkers />
    </>
  );
}

/* ==================================================
   尺寸字段表单
================================================== */
function DimsForm({
  kind,
  dims,
  onChange,
}: {
  kind: SteelKind;
  dims: Dims;
  onChange: (d: Dims) => void;
}) {
  const fields = KIND_DEFS[kind].fields;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {fields.map((f) => (
        <div
          key={f.key}
          style={{
            flex: fields.length >= 2 ? '1 1 40%' : '1 1 100%',
            minWidth: 90,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>{f.label}</Text>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            value={(dims as never)[f.key]}
            min={f.min}
            step={f.step}
            onChange={(v) => v !== null && onChange({ ...dims, [f.key]: v })}
          />
        </div>
      ))}
    </div>
  );
}

/* ==================================================
   浮动参数面板
================================================== */
function ParameterPanel() {
  const instances = useStore((s) => s.instances);
  const connections = useStore((s) => s.connections);
  const selected = useStore((s) => s.selected);
  const addInstance = useStore((s) => s.addInstance);
  const removeInstance = useStore((s) => s.removeInstance);
  const updateInstance = useStore((s) => s.updateInstance);
  const select = useStore((s) => s.select);

  const [draftKind, setDraftKind] = useState<SteelKind>('round');
  const [draftDims, setDraftDims] = useState<Dims>(makeDefaultDims('round'));
  const [draftLength, setDraftLength] = useState(150);

  const selectedInst = instances.find((i) => i.id === selected);
  const selectedGroup = selected ? findGroup(connections, selected) : null;

  const onDraftKindChange = (k: SteelKind) => {
    setDraftKind(k);
    setDraftDims(makeDefaultDims(k));
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 320,
        maxHeight: 'calc(100% - 16px)',
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        overflowY: 'auto',
        zIndex: 10,
        padding: 16,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {selectedInst ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text strong style={{ fontSize: 13 }}>
              编辑 · <span style={{ color: '#1890ff' }}>{selectedInst.id}</span>
            </Text>
            <Button size="small" type="text" onClick={() => select(null)}>
              新建
            </Button>
          </div>

          <div style={{ fontSize: 12, color: '#64748b' }}>
            {makeLabel(selectedInst.kind, selectedInst.dims)}
          </div>

          {selectedGroup && selectedGroup.size > 1 && (
            <Tag color="green" style={{ margin: 0 }}>
              属于 {selectedGroup.size} 件组合
            </Tag>
          )}

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>钢型</Text>
            <Radio.Group
              size="small"
              value={selectedInst.kind}
              onChange={(e) => {
                const k: SteelKind = e.target.value;
                updateInstance(selectedInst.id, { kind: k, dims: makeDefaultDims(k) });
              }}
              buttonStyle="solid"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}
            >
              {KIND_ORDER.map((k) => (
                <Radio.Button key={k} value={k} style={{ fontSize: 11 }}>
                  {KIND_DEFS[k].name}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          <DimsForm
            kind={selectedInst.kind}
            dims={selectedInst.dims}
            onChange={(d) => updateInstance(selectedInst.id, { dims: d })}
          />

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>长度 L (mm)</Text>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              value={selectedInst.length}
              min={20}
              step={20}
              onChange={(v) => v && updateInstance(selectedInst.id, { length: v })}
            />
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <Text type="secondary">单件重量</Text>
            <Text strong style={{ color: '#0f172a' }}>
              {fmtWeight(calcWeight(selectedInst))}
            </Text>
          </div>

          <Button danger block onClick={() => removeInstance(selectedInst.id)}>
            {selectedGroup && selectedGroup.size > 1
              ? `移除并解散组合（${selectedGroup.size} 件）`
              : '删除此件'}
          </Button>

          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>
            左上角切换模式：<b>平移/旋转</b> 用 gizmo 拖；<b>连接</b> 时点两个锚点自动拼装。
          </Text>
        </>
      ) : (
        <>
          <Text strong style={{ fontSize: 13 }}>添加新钢材</Text>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>快捷预设</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="small"
                  onClick={() => {
                    setDraftKind(p.kind);
                    setDraftDims({ ...p.dims });
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>钢型</Text>
            <Radio.Group
              size="small"
              value={draftKind}
              onChange={(e) => onDraftKindChange(e.target.value)}
              buttonStyle="solid"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}
            >
              {KIND_ORDER.map((k) => (
                <Radio.Button key={k} value={k} style={{ fontSize: 11 }}>
                  {KIND_DEFS[k].name}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          <DimsForm kind={draftKind} dims={draftDims} onChange={setDraftDims} />

          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>长度 L (mm)</Text>
            <InputNumber
              size="small"
              style={{ width: '100%' }}
              value={draftLength}
              min={20}
              step={20}
              onChange={(v) => v && setDraftLength(v)}
            />
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <Text type="secondary">单件重量</Text>
            <Text strong style={{ color: '#0f172a' }}>
              {fmtWeight(
                calcWeight({
                  id: '_draft',
                  kind: draftKind,
                  length: draftLength,
                  dims: draftDims,
                  position: [0, 0, 0],
                  quaternion: [0, 0, 0, 1],
                  defaultPosition: [0, 0, 0],
                  defaultQuaternion: [0, 0, 0, 1],
                })
              )}
            </Text>
          </div>

          <Button
            type="primary"
            block
            onClick={() => addInstance(draftKind, draftDims, draftLength)}
          >
            + 生成到场景
          </Button>
        </>
      )}
    </div>
  );
}

/* ==================================================
   主组件
================================================== */
export default function Component3DView() {
  const instances = useStore((s) => s.instances);
  const connections = useStore((s) => s.connections);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const pendingAnchor = useStore((s) => s.pendingAnchor);

  const groupCount = useMemo(() => {
    const visited = new Set<string>();
    let count = 0;
    for (const inst of instances) {
      if (visited.has(inst.id)) continue;
      const g = findGroup(connections, inst.id);
      for (const id of g) visited.add(id);
      if (g.size > 1) count++;
    }
    return count;
  }, [instances, connections]);

  const totalWeight = useMemo(
    () => instances.reduce((sum, inst) => sum + calcWeight(inst), 0),
    [instances]
  );

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        minHeight: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#eef2f6',
      }}
    >
      {/* 左上：工具条 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 6,
          padding: '6px 12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
        }}
      >
        <Radio.Group
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="translate">平移</Radio.Button>
          <Radio.Button value="rotate">旋转</Radio.Button>
          <Radio.Button value="connect">连接</Radio.Button>
        </Radio.Group>

        <span style={{ width: 1, height: 18, background: '#e2e8f0' }} />

        {mode === 'connect' ? (
          <span style={{ color: pendingAnchor ? '#f59e0b' : '#16a34a', fontWeight: 600 }}>
            {pendingAnchor ? '已选起点，点第二个锚点' : '点锚点选起点'}
          </span>
        ) : (
          <>
            <span style={{ color: '#64748b' }}>
              件数 <b style={{ color: '#0f172a' }}>{instances.length}</b>
            </span>
            <span style={{ color: '#64748b' }}>
              组合 <b style={{ color: '#16a34a' }}>{groupCount}</b>
            </span>
          </>
        )}

        <span
          style={{
            paddingLeft: 10,
            borderLeft: '1px solid #e2e8f0',
            color: '#64748b',
          }}
        >
          总重 <b style={{ color: '#dc2626', fontSize: 13 }}>{fmtWeight(totalWeight)}</b>
        </span>
      </div>

      {/* 左下：提示 */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 11,
          color: '#64748b',
          lineHeight: 1.6,
          pointerEvents: 'none',
          maxWidth: 360,
        }}
      >
        {mode === 'connect' ? (
          <>
            <div>· <b style={{ color: '#22c55e' }}>绿球</b> = 端面锚点（沿长度方向）</div>
            <div>· <b style={{ color: '#3b82f6' }}>蓝球</b> = 侧面锚点（贴面连接）</div>
            <div>· 依次点两个锚点 → 先点的件自动对齐到后点的</div>
            <div>· 再点已选中的锚点 / 空白处 → 取消</div>
          </>
        ) : (
          <>
            <div>· 右侧面板设置钢型 + 尺寸 → 生成</div>
            <div>· 点场景里的钢材 → 面板切到编辑模式</div>
            <div>· <b>平移/旋转</b>：拖 gizmo 调位置姿态，松手近端面自动吸附</div>
            <div>· <b>连接</b>：显式连接，端面 + 侧面都能连，任意位置自动对齐</div>
            <div>· 删除组合任一成员 → 整组解散，回到默认位置</div>
          </>
        )}
      </div>

      <ParameterPanel />

      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{
          position: [400, 1500, 700],
          fov: 45,
          near: 1,
          far: 20000,
        }}
        onPointerMissed={() => {
          useStore.getState().select(null);
          useStore.getState().setPendingAnchor(null);
        }}
      >
        <Scene />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}