import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useState } from 'react';
import { Typography, Switch } from 'antd';

const { Text } = Typography;

/* ============ 颜色常量 ============ */
const COLOR_OUTER = '#8fb8d8';    // 外壁：冷钢蓝
const COLOR_INNER = '#d4915a';    // 内壁：暖橙棕
const COLOR_EDGE  = '#e74c3c';    // 标注线：红

/* ---------- 圆环截面 Shape ---------- */
function makeRingShape(od: number, thickness: number) {
  const outerR = od / 2;
  const innerR = Math.max(outerR - thickness, 0.01);

  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  return shape;
}

/* ---------- 管道网格（内外壁分色） ---------- */
function PipeMesh({
  od,
  thickness,
  length,
  clipEnabled,
}: {
  od: number;
  thickness: number;
  length: number;
  clipEnabled: boolean;
}) {
  const outerR = od / 2;
  const innerR = Math.max(outerR - thickness, 0.01);

  /* 外壁几何体：环截面沿 X 轴挤出 */
  const outerGeo = useMemo(() => {
    const shape = makeRingShape(od, thickness);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
      curveSegments: 96,
    });
    geo.center();
    geo.rotateY(Math.PI / 2);
    return geo;
  }, [od, thickness, length]);

  /* 内壁覆盖层：开口圆柱，用 BackSide 只显示内表面 */
  const innerGeo = useMemo(() => {
    const r = Math.max(innerR - 0.05, 0.01);
    const geo = new THREE.CylinderGeometry(r, r, length * 0.999, 96, 1, true);
    geo.rotateZ(Math.PI / 2);
    return geo;
  }, [innerR, length]);

  /* 剖切平面：沿 Y 轴水平切掉上半部分 */
  const clipPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    []
  );

  return (
    <>
      {/* 外层：管道主体（外壁 + 端面） */}
      <mesh geometry={outerGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={COLOR_OUTER}
          metalness={0.85}
          roughness={0.28}
          side={THREE.DoubleSide}
          clippingPlanes={clipEnabled ? [clipPlane] : []}
          clipShadows
        />
      </mesh>

      {/* 内壁：只渲染背面（内表面），暖色形成对比 */}
      <mesh geometry={innerGeo}>
        <meshStandardMaterial
          color={COLOR_INNER}
          metalness={0.6}
          roughness={0.55}
          side={THREE.BackSide}
          clippingPlanes={clipEnabled ? [clipPlane] : []}
        />
      </mesh>
    </>
  );
}

/* ---------- 管口尺寸标注 ---------- */
function PipeAnnotations({
  od,
  thickness,
  length,
}: {
  od: number;
  thickness: number;
  length: number;
}) {
  const outerR = od / 2;
  const innerR = Math.max(outerR - thickness, 0.01);
  const halfLen = length / 2;

  const points = [
    {
      start: [-halfLen, outerR, 0] as [number, number, number],
      end:   [ halfLen, outerR, 0] as [number, number, number],
      color: COLOR_EDGE,
      label: `OD ${od}`,
    },
    {
      start: [-halfLen, innerR, 0] as [number, number, number],
      end:   [ halfLen, innerR, 0] as [number, number, number],
      color: '#27ae60',
      label: `ID ${(od - 2 * thickness).toFixed(1)}`,
    },
    {
      start: [ halfLen, innerR, 0] as [number, number, number],
      end:   [ halfLen, outerR, 0] as [number, number, number],
      color: '#f39c12',
      label: `t ${thickness}`,
    },
  ];

  return (
    <>
      {points.map((p, i) => (
        <group key={i}>
          <Line points={[p.start, p.end]} color={p.color} lineWidth={1.5} />
          <Html
            position={[
              (p.start[0] + p.end[0]) / 2,
              (p.start[1] + p.end[1]) / 2 + 0.5,
              0,
            ]}
            center
            style={{
              color: p.color,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              background: 'rgba(255,255,255,0.85)',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {p.label}
          </Html>
        </group>
      ))}
    </>
  );
}

/* ---------- 主组件 ---------- */
export default function Pipe3DView({
  od,
  thickness,
  length,
  dn,
}: {
  od: number;
  thickness: number;
  length: number;
  dn?: string;
}) {
  const [clipEnabled, setClipEnabled] = useState(false);

  const valid = od > 0 && thickness > 0 && thickness < od / 2 && length > 0;

  if (!valid) {
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
        <Text type="secondary">输入外径、壁厚和管长后显示三维管段</Text>
      </div>
    );
  }

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
      {/* 左上角：DN 规格铭牌 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          color: '#1890ff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid rgba(24,144,255,0.25)',
          lineHeight: 1.5,
        }}
      >
        {dn ? (
          <>
            <div style={{ fontSize: 13 }}>DN{dn}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>
              OD {od} × t {thickness}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13 }}>自定义管段</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>
              OD {od} × t {thickness}
            </div>
          </>
        )}
      </div>

      {/* 右上角：剖切开关 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <Switch
          size="small"
          checked={clipEnabled}
          onChange={setClipEnabled}
          style={{ marginRight: 6 }}
        />
        剖切视图
      </div>

      {/* 左下角：内外壁图例 */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: COLOR_OUTER,
              borderRadius: 2,
            }}
          />
          <span>外壁</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: COLOR_INNER,
              borderRadius: 2,
            }}
          />
          <span>内壁</span>
        </div>
      </div>

      <Canvas
        dpr={[1, 2]}
        shadows
        gl={{ localClippingEnabled: true }}
        camera={{ position: [0, od * 2, od * 4], fov: 45 }}
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
          <PipeMesh
            od={od}
            thickness={thickness}
            length={length}
            clipEnabled={clipEnabled}
          />
          <PipeAnnotations od={od} thickness={thickness} length={length} />
        </Bounds>

        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}