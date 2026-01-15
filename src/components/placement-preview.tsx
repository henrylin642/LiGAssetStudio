
import React, { useMemo } from "react";

interface Point {
  x: number;
  z: number;
}

interface PlacementPreviewProps {
  points: Point[];
}

export function PlacementPreview({ points }: PlacementPreviewProps) {
  // Determine viewbox based on points
  const xs = points.map(p => p.x);
  const zs = points.map(p => p.z);
  
  // Include origin in viewbox calculation
  xs.push(0);
  zs.push(0);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const padding = 2;
  const viewMinX = Math.min(minX, -5) - padding;
  const viewMaxX = Math.max(maxX, 5) + padding;
  const viewMinZ = Math.min(minZ, -2) - padding;
  const viewMaxZ = Math.max(maxZ, 10) + padding;

  const width = viewMaxX - viewMinX;
  const height = viewMaxZ - viewMinZ;

  // Grid generation
  const gridLines = useMemo(() => {
    const lines = [];
    // Vertical lines (X)
    for (let x = Math.ceil(viewMinX); x <= Math.floor(viewMaxX); x++) {
      lines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={viewMinZ}
          x2={x}
          y2={viewMaxZ}
          stroke="#e2e8f0"
          strokeWidth={x === 0 ? 0.3 : 0.1} // X=0 axis thicker
        />
      );
    }
    // Horizontal lines (Z)
    for (let z = Math.ceil(viewMinZ); z <= Math.floor(viewMaxZ); z++) {
      lines.push(
        <line
          key={`h-${z}`}
          x1={viewMinX}
          y1={z}
          x2={viewMaxX}
          y2={z}
          stroke="#e2e8f0"
          strokeWidth={z === 0 ? 0.3 : 0.1} // Z=0 axis thicker
        />
      );
    }
    return lines;
  }, [viewMinX, viewMaxX, viewMinZ, viewMaxZ]);

  const polygonPoints = points.map(p => `${p.x},${p.z}`).join(" ");

  return (
    <div className="w-full aspect-square bg-white rounded-md border overflow-hidden">
      <svg
        viewBox={`${viewMinX} ${-viewMaxZ} ${width} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Transform to flip Y axis so +Z is Up */}
        <g transform="scale(1, -1)">
          {gridLines}

          {/* Placement Area */}
          <polygon
            points={polygonPoints}
            fill="rgba(59, 130, 246, 0.2)"
            stroke="#3b82f6"
            strokeWidth={0.2}
          />

          {/* Corner Points */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.z} r={0.3} fill="#ef4444" />
          ))}

          {/* Origin Point (Black, Slightly Larger) */ }
          <circle cx={0} cy={0} r={0.5} fill="#000000" />

        </g>
      </svg>
      <div className="text-center text-xs text-slate-400 mt-1">
        Grid: 1m | Black: Origin (0,0)
      </div>
    </div>
  );
}
