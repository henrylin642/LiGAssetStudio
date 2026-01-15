
import React, { useMemo } from "react";

interface PlacementPreviewProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function PlacementPreview({ minX, maxX, minZ, maxZ }: PlacementPreviewProps) {
  // Determine viewbox based on bounds, adding some padding
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

  // Convert Z to SVG Y (SVG y increases downwards, but usually 3D Z increases "forward" or "backward")
  // Let's assume standard top-down map: X is horizontal, Z is vertical (up/down).
  // In screen coords, Y increases down.
  // Commonly in 2D editors: +Z is up (screen -Y) or down (screen +Y).
  // Let's align with typical chart: +Z is UP (so we invert Y in SVG or transform).
  // Transformation: scale(1, -1) to flip Y axis. But text will flip too.
  // Simpler: Map world Z to SVG Y manually.
  // World (x, z) -> SVG (x, -z) (plus offset)
  // Actually, standard math plot: +Y is Up.
  // The user said "Coordinate 3 (10, 20)".
  // If we assume (X, Z), usually Z is forward depth.
  // I will draw it such that +X is Right, +Z is Up (Screen Top).
  // So SVG Y = -Z.

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
          <rect
            x={minX}
            y={minZ}
            width={maxX - minX}
            height={maxZ - minZ}
            fill="rgba(59, 130, 246, 0.2)"
            stroke="#3b82f6"
            strokeWidth={0.2}
          />

          {/* Corner Points */}
          <circle cx={maxX} cy={minZ} r={0.3} fill="#ef4444" />
          <circle cx={minX} cy={minZ} r={0.3} fill="#ef4444" />
          <circle cx={maxX} cy={maxZ} r={0.3} fill="#ef4444" />
          <circle cx={minX} cy={maxZ} r={0.3} fill="#ef4444" />

          {/* Corner Labels (Optional, might be cluttered) - Scale back Y for text */}
          {/* We skip text inside SVG for now to avoid flipping issues, simpler to rely on external UI labels */}
        </g>
      </svg>
      <div className="text-center text-xs text-slate-400 mt-1">
        Grid: 1m | Red: Corners | Blue: Area
      </div>
    </div>
  );
}
