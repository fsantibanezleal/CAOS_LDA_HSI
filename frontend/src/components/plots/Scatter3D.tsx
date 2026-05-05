import { useMemo, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";

import type { EmbeddingPoint3D } from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

type ColorBy = "topic" | "label";

type Props = {
  points: EmbeddingPoint3D[];
  colorBy: ColorBy;
  selectedTopic: number | null;
  onPick?: (info: { docId: number; index: number } | null) => void;
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  return [
    parseInt(m[1]!, 16) / 255,
    parseInt(m[2]!, 16) / 255,
    parseInt(m[3]!, 16) / 255,
  ];
}

const LABEL_PALETTE = [
  "#0072B2", "#D55E00", "#009E73", "#CC79A7", "#F0E442",
  "#56B4E9", "#E69F00", "#999999", "#332288", "#117733",
  "#88CCEE", "#882255", "#44AA99", "#DDCC77", "#AA4499",
  "#661100", "#88BB88", "#7755AA", "#22AAEE", "#EE7755",
];

function colorForLabel(labelId: number | undefined): [number, number, number] {
  if (labelId === undefined || labelId <= 0) return [0.4, 0.4, 0.4];
  return hexToRgb(LABEL_PALETTE[(labelId - 1) % LABEL_PALETTE.length]!);
}

function colorForTopic(k: number | undefined): [number, number, number] {
  if (k === undefined) return [0.4, 0.4, 0.4];
  return hexToRgb(TOPIC_COLORS[k % TOPIC_COLORS.length]!);
}

function PointCloud({
  points,
  colorBy,
  selectedTopic,
  onPick,
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Compute bounds for centring + autoscaling
  const { center, scale } = useMemo(() => {
    if (points.length === 0)
      return { center: [0, 0, 0] as [number, number, number], scale: 1 };
    let xMin = Infinity,
      xMax = -Infinity;
    let yMin = Infinity,
      yMax = -Infinity;
    let zMin = Infinity,
      zMax = -Infinity;
    for (const p of points) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const cz = (zMin + zMax) / 2;
    const span = Math.max(xMax - xMin, yMax - yMin, zMax - zMin) || 1;
    return {
      center: [cx, cy, cz] as [number, number, number],
      scale: 4 / span,
    };
  }, [points]);

  const colors = useMemo(() => {
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      const baseColor =
        colorBy === "topic"
          ? colorForTopic(p.dominant_topic_k)
          : colorForLabel(p.label_id);
      const dim =
        selectedTopic !== null &&
        p.dominant_topic_k !== undefined &&
        p.dominant_topic_k !== selectedTopic;
      const factor = dim ? 0.18 : 1.0;
      arr[i * 3] = baseColor[0] * factor;
      arr[i * 3 + 1] = baseColor[1] * factor;
      arr[i * 3 + 2] = baseColor[2] * factor;
    });
    return arr;
  }, [points, colorBy, selectedTopic]);

  // Apply per-instance matrix + color
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useMemo(() => {
    if (!meshRef.current) return;
    points.forEach((p, i) => {
      dummy.position.set(
        (p.x - center[0]) * scale,
        (p.y - center[1]) * scale,
        (p.z - center[2]) * scale,
      );
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(
        i,
        new THREE.Color(colors[i * 3]!, colors[i * 3 + 1]!, colors[i * 3 + 2]!),
      );
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
  }, [points, center, scale, colors, dummy]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const p = points[e.instanceId];
    if (!p) return;
    onPick?.({ docId: p.doc_id, index: e.instanceId });
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, points.length]}
      onClick={handleClick}
    >
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshBasicMaterial vertexColors transparent opacity={0.9} />
    </instancedMesh>
  );
}

export function Scatter3D(props: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: 480,
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
      }}
    >
      <Canvas
        camera={{ position: [4, 4, 4], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <PointCloud {...props} />
        <OrbitControls makeDefault enablePan zoomSpeed={0.7} />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport
            axisColors={["#0ea5e9", "#22c55e", "#f97316"]}
            labelColor="#fff"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
