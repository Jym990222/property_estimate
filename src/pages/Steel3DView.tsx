import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

type SteelType = '圆钢' | '方钢' | '等边角钢' | '槽钢' | '工字钢/H型钢';

interface Props {
  type: SteelType;
  params: Record<string, number>;
  length?: number;
}

/* ==================== 截面 Shape ==================== */
function makeSectionShape(type: SteelType, p: Record<string, number>): THREE.Shape | null {
  const shape = new THREE.Shape();

  if (type === '圆钢') {
    const r = (p.d || 0) / 2;
    if (r <= 0) return null;
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    return shape;
  }

  if (type === '方钢') {
    const a = (p.a || 0) / 2;
    if (a <= 0) return null;
    shape.moveTo(-a, -a);
    shape.lineTo(a, -a);
    shape.lineTo(a, a);
    shape.lineTo(-a, a);
    shape.lineTo(-a, -a);
    return shape;
  }

  if (type === '等边角钢') {
    const b = p.b || 0;
    const d = p.d || 0;
    if (b <= 0 || d <= 0 || d >= b) return null;
    const h = b / 2;
    shape.moveTo(-h, -h);
    shape.lineTo(h, -h);
    shape.lineTo(h, -h + d);
    shape.lineTo(-h + d, -h + d);
    shape.lineTo(-h + d, h);
    shape.lineTo(-h, h);
    shape.lineTo(-h, -h);
    return shape;
  }

  if (type === '槽钢') {
    const h = p.h || 0;
    const b = p.b || 0;
    const d = p.d || 0;
    if (h <= 0 || b <= 0 || d <= 0 || d >= b || 2 * d >= h) return null;
    const cx = b / 2;
    const cy = h / 2;
    shape.moveTo(-cx, -cy);
    shape.lineTo(cx, -cy);
    shape.lineTo(cx, -cy + d);
    shape.lineTo(-cx + d, -cy + d);
    shape.lineTo(-cx + d, cy - d);
    shape.lineTo(cx, cy - d);
    shape.lineTo(cx, cy);
    shape.lineTo(-cx, cy);
    shape.lineTo(-cx, -cy);
    return shape;
  }

  if (type === '工字钢/H型钢') {
    const h = p.h || 0;
    const b = p.b || 0;
    const d = p.d || 0;
    const t = p.t || 0;
    if (h <= 0 || b <= 0 || d <= 0 || t <= 0 || 2 * t >= h || d >= b) return null;
    const cx = b / 2;
    const cy = h / 2;
    const dh = d / 2;
    shape.moveTo(-cx, -cy);
    shape.lineTo(cx, -cy);
    shape.lineTo(cx, -cy + t);
    shape.lineTo(dh, -cy + t);
    shape.lineTo(dh, cy - t);
    shape.lineTo(cx, cy - t);
    shape.lineTo(cx, cy);
    shape.lineTo(-cx, cy);
    shape.lineTo(-cx, cy - t);
    shape.lineTo(-dh, cy - t);
    shape.lineTo(-dh, -cy + t);
    shape.lineTo(-cx, -cy + t);
    shape.lineTo(-cx, -cy);
    return shape;
  }

  return null;
}

/* ==================== 型钢网格 ==================== */
function SteelMesh({ type, params, length = 500 }: Props) {
  const geometry = useMemo(() => {
    const shape = makeSectionShape(type, params);
    if (!shape) return null;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
      curveSegments: 64,
    });
    geo.center();
    return geo;
  }, [type, params, length]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      rotation={[0, Math.PI / 2, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color="#7fb6e0"
        metalness={0.85}
        roughness={0.28}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ==================== 尺寸标注 ==================== */
function SteelAnnotations({ type, params, length = 500 }: Props) {
  const halfLen = length / 2;
  const items: {
    start: [number, number, number];
    end: [number, number, number];
    color: string;
    label: string;
  }[] = [];

  if (type === '圆钢' && params.d) {
    const r = params.d / 2;
    items.push({
      start: [-halfLen, -r, 0], end: [halfLen, -r, 0],
      color: '#e74c3c', label: `d = ${params.d} mm`,
    });
  } else if (type === '方钢' && params.a) {
    const a = params.a / 2;
    items.push({
      start: [-halfLen, -a, 0], end: [halfLen, -a, 0],
      color: '#e74c3c', label: `a = ${params.a} mm`,
    });
  } else if (type === '等边角钢' && params.b) {
    const b = params.b / 2;
    items.push({
      start: [-halfLen, -b, 0], end: [halfLen, -b, 0],
      color: '#e74c3c', label: `b = ${params.b} / d = ${params.d}`,
    });
  } else if (type === '槽钢' && params.h) {
    const cy = params.h / 2;
    items.push({
      start: [-halfLen, -cy, 0], end: [halfLen, -cy, 0],
      color: '#e74c3c', label: `h = ${params.h} / b = ${params.b}`,
    });
  } else if (type === '工字钢/H型钢' && params.h) {
    const cy = params.h / 2;
    items.push({
      start: [-halfLen, -cy, 0], end: [halfLen, -cy, 0],
      color: '#e74c3c', label: `h = ${params.h} / b = ${params.b}`,
    });
  }

  return (
    <>
      {items.map((it, i) => (
        <group key={i}>
          <Line points={[it.start, it.end]} color={it.color} lineWidth={1.5} />
          <Html
            position={[
              (it.start[0] + it.end[0]) / 2,
              (it.start[1] + it.end[1]) / 2 - 15,
              0,
            ]}
            center
            style={{
              color: it.color,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.85)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {it.label}
          </Html>
        </group>
      ))}
    </>
  );
}

/* ==================== 主组件 ==================== */
export default function Steel3DView({ type, params, length = 500 }: Props) {
  const validShape = useMemo(
    () => makeSectionShape(type, params),
    [type, params]
  );

  if (!validShape) {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 360,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed #d9d9d9',
          borderRadius: 8,
          background: '#fafafa',
        }}
      >
        <Text type="secondary">输入有效尺寸参数后显示三维型钢</Text>
      </div>
    );
  }

  const maxDim = Math.max(
    params.d || 0, params.a || 0, params.b || 0, params.h || 0, 60
  );
  const camDist = Math.max(maxDim * 3.2, 400);

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 360,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#eef2f6',
      }}
    >
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: [camDist * 0.7, camDist * 0.5, camDist], fov: 45 }}
      >
        <color attach="background" args={['#eef2f6']} />
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[5, 10, 7]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-5, -8, -7]} intensity={0.4} />

        <Bounds fit clip observe margin={1.2}>
          <SteelMesh type={type} params={params} length={length} />
          <SteelAnnotations type={type} params={params} length={length} />
        </Bounds>

        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}