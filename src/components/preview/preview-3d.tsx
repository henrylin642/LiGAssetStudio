"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ModelViewerElement = HTMLElement & {
  src?: string;
  poster?: string;
  cameraControls?: boolean;
  cameraOrbit?: string;
  fieldOfView?: string;
  environmentImage?: string;
  exposure?: number;
  "shadow-intensity"?: number;
  "touch-action"?: string;
  "interaction-prompt"?: string;
  "auto-rotate"?: boolean;
  "camera-controls"?: boolean;
  "ar"?: boolean;
  "camera-orbit"?: string;
  "field-of-view"?: string;
  "animation-loop"?: boolean;
  jumpCameraToGoal?: () => void;
  getCameraOrbit?: () => { theta: number; phi: number; radius: number };
  getFieldOfView?: () => { deg: number };
  availableAnimations?: string[];
  animationName?: string;
  play?: () => void;
};

interface Preview3DProps {
  src: string;
  poster?: string;
  variant?: "grid" | "detail";
}

const DETAIL_MIN_HEIGHT = 360;
const DETAIL_MAX_HEIGHT = 640;

export function Preview3D({ src, poster, variant = "grid" }: Preview3DProps) {
  const [ready, setReady] = useState(false);
  const viewerRef = useRef<ModelViewerElement | null>(null);
  const assignViewerRef = useCallback((node: ModelViewerElement | null) => {
    viewerRef.current = node;
  }, []);
  const initialOrbit = useRef<{ theta: number; phi: number; radius: number } | null>(null);
  const initialFov = useRef<number | null>(null);
  const animationNames = useRef<string[]>([]);
  const animationIndexRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    import("@google/model-viewer")
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((err) => {
        console.error("Failed to load model-viewer", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !viewerRef.current) return;

    animationNames.current = [];
    animationIndexRef.current = 0;

    const handleLoad = () => {
      try {
        const viewer = viewerRef.current;
        if (!viewer) return;
        if (typeof viewer.getCameraOrbit === "function") {
          initialOrbit.current = viewer.getCameraOrbit();
        }
        if (typeof viewer.getFieldOfView === "function") {
          const fov = viewer.getFieldOfView();
          initialFov.current = typeof fov?.deg === "number" ? fov.deg : null;
        }
        try {
          const names = (viewer.availableAnimations ?? []).filter(Boolean);
          animationNames.current = names;
          animationIndexRef.current = 0;
          if (names.length > 0) {
            const first = names[0];
            viewer.animationName = first;
            viewer.setAttribute("animation-name", first);
            viewer.play?.();
          } else {
            viewer.animationName = undefined;
            viewer.play?.();
          }
        } catch (error) {
          console.warn("Unable to inspect available animations", error);
        }
      } catch (error) {
        console.warn("Unable to read model-viewer camera properties", error);
      }
    };

    const node = viewerRef.current;
    node?.addEventListener("load", handleLoad);
    const handleAnimationFinished = () => {
      const viewer = viewerRef.current;
      const names = animationNames.current;
      if (!viewer || names.length <= 1) return;
      const nextIndex = (animationIndexRef.current + 1) % names.length;
      animationIndexRef.current = nextIndex;
      const nextName = names[nextIndex];
      viewer.animationName = nextName;
      viewer.setAttribute("animation-name", nextName);
      viewer.play?.();
    };
    node?.addEventListener("animation-finished", handleAnimationFinished as EventListener);
    return () => {
      node?.removeEventListener("load", handleLoad);
      node?.removeEventListener("animation-finished", handleAnimationFinished as EventListener);
    };
  }, [ready, src]);

  const handleZoom = useCallback((factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer || typeof viewer.getCameraOrbit !== "function") return;
    const orbit = viewer.getCameraOrbit();
    if (!orbit) return;
    const nextRadius = Math.min(Math.max(orbit.radius * factor, 0.15), 50);
    viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${nextRadius}m`;
    viewer.jumpCameraToGoal?.();
  }, []);

  const handleReset = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const orbit = initialOrbit.current;
    if (orbit) {
      viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`;
    }
    const fov = initialFov.current;
    if (typeof fov === "number" && Number.isFinite(fov)) {
      viewer.fieldOfView = `${fov}deg`;
    }
    viewer.jumpCameraToGoal?.();
  }, []);

  const controls = useMemo(() => {
    if (variant !== "detail") return null;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 shadow-md backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 px-3 text-xs"
            onClick={() => handleZoom(0.8)}
          >
            Zoom In
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 px-3 text-xs"
            onClick={() => handleZoom(1.25)}
          >
            Zoom Out
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-events-auto h-8 px-3 text-xs"
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      </div>
    );
  }, [handleReset, handleZoom, variant]);

  if (!ready) {
    const baseClass =
      variant === "detail"
        ? "flex w-full items-center justify-center rounded-xl border border-slate-200 bg-black text-sm text-slate-200"
        : "flex aspect-square items-center justify-center rounded-md border border-slate-200 bg-black text-xs text-slate-200";

    return <div className={baseClass}>Loading 3D preview...</div>;
  }

  const containerClass =
    variant === "detail"
      ? "relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-black"
      : "relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-black";

  const detailStyle =
    variant === "detail"
      ? { minHeight: `${DETAIL_MIN_HEIGHT}px`, height: `min(70vh, ${DETAIL_MAX_HEIGHT}px)` }
      : undefined;

  const viewerElement = React.createElement("model-viewer", {
    ref: assignViewerRef as unknown as React.RefCallback<Element>,
    style: {
      width: "100%",
      height: "100%",
    },
    src,
    poster,
    "camera-controls": true,
    "touch-action": "none",
    "interaction-prompt": "auto",
    "shadow-intensity": "1.2",
    "environment-image": "neutral",
    exposure: "1.1",
    autoplay: true,
    "animation-loop": true,
    "animation-crossfade-duration": "400",
    ar: true,
  } as Record<string, unknown>);

  return (
    <div className={containerClass} style={detailStyle}>
      {viewerElement}
      {controls}
    </div>
  );
}
