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
  animationLoop?: boolean;
  jumpCameraToGoal?: () => void;
  getCameraOrbit?: () => { theta: number; phi: number; radius: number };
  getFieldOfView?: () => { deg: number };
  availableAnimations?: string[];
  animationName?: string;
  play?: (options?: { repetitions?: number; pingpong?: boolean }) => void;
  appendAnimation?: (
    animationName?: string,
    options?: {
      repetitions?: number | null;
      pingpong?: boolean;
      weight?: number;
      timeScale?: number;
      fade?: boolean | number;
      warp?: boolean | number;
      relativeWarp?: boolean;
      time?: number | null;
    },
  ) => void;
  updateComplete?: Promise<unknown>;
};

interface Preview3DProps {
  src: string;
  poster?: string;
  variant?: "grid" | "detail";
}

const DETAIL_MIN_HEIGHT = 360;
const DETAIL_MAX_HEIGHT = 640;
const dracoDecoderCdn = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";
const animationCache = new Map<string, Promise<string[]>>();
type GltfMinimal = {
  animations: Array<{ name?: string }>;
};

async function loadAnimationNamesFromGlb(src: string): Promise<string[]> {
  if (!src) return [];
  if (!animationCache.has(src)) {
    animationCache.set(
      src,
      (async () => {
        try {
          const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
            import("three/examples/jsm/loaders/GLTFLoader.js"),
            import("three/examples/jsm/loaders/DRACOLoader.js"),
          ]);
          const loader = new GLTFLoader();
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath(dracoDecoderCdn);
          loader.setDRACOLoader(dracoLoader);
          return await new Promise<string[]>((resolve) => {
            loader.load(
              src,
              (gltf: GltfMinimal) => {
                dracoLoader.dispose();
                const names = gltf.animations.map((clip, index) => clip.name?.trim() || `Animation ${index + 1}`);
                resolve(names);
              },
              undefined,
              () => {
                dracoLoader.dispose();
                resolve([]);
              },
            );
          });
        } catch (error) {
          console.warn("Unable to load animation metadata via GLTFLoader", error);
          return [];
        }
      })(),
    );
  }
  return animationCache.get(src) ?? [];
}

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

    const refreshAnimationNames = () => {
      const viewer = viewerRef.current;
      if (!viewer) return false;
      const names = viewer.availableAnimations ?? [];
      if (!Array.isArray(names) || names.length === 0) return false;
      animationNames.current = names as string[];
      if (animationIndexRef.current >= names.length) {
        animationIndexRef.current = 0;
      }
      return true;
    };

    const playSequentialAnimation = () => {
      const viewer = viewerRef.current;
      const names = animationNames.current;
      if (!viewer) return;
      if (names.length === 0) {
        viewer.animationName = undefined;
        viewer.play?.();
        return;
      }
      const safeIndex = animationIndexRef.current % names.length;
      const animationName = names[safeIndex];
      viewer.animationName = animationName;
      viewer.setAttribute("animation-name", animationName);
      viewer.play?.({ repetitions: 1, pingpong: false });
    };

    const playAllAnimations = () => {
      const viewer = viewerRef.current;
      const names = animationNames.current;
      if (!viewer || names.length === 0) return;
      if (names.length === 1 || typeof viewer.appendAnimation !== "function") {
        playSequentialAnimation();
        return;
      }
      viewer.animationLoop = true;
      viewer.setAttribute("animation-loop", "true");
      const [first, ...rest] = names;
      viewer.animationName = first;
      viewer.setAttribute("animation-name", first);
      viewer.play?.({ repetitions: Infinity, pingpong: false });
      rest.forEach((name) => {
        viewer.appendAnimation?.(name, {
          repetitions: Infinity,
          pingpong: false,
          weight: 1,
          timeScale: 1,
          fade: false,
          warp: false,
          relativeWarp: true,
          time: null,
        });
      });
    };

    const ensureAnimationNames = async () => {
      if (refreshAnimationNames()) {
        return true;
      }
      const fallbackNames = await loadAnimationNamesFromGlb(src);
      if (fallbackNames.length > 0) {
        animationNames.current = fallbackNames;
        if (animationIndexRef.current >= fallbackNames.length) {
          animationIndexRef.current = 0;
        }
        return true;
      }
      const viewer = viewerRef.current;
      viewer?.play?.();
      console.warn("No animations detected within timeout for", src);
      return false;
    };

    const handleLoad = () => {
      try {
        const viewer = viewerRef.current;
        if (!viewer) return;
        viewer.animationLoop = false;
        viewer.setAttribute("animation-loop", "false");
        if (typeof viewer.getCameraOrbit === "function") {
          initialOrbit.current = viewer.getCameraOrbit();
        }
        if (typeof viewer.getFieldOfView === "function") {
          const fov = viewer.getFieldOfView();
          initialFov.current = typeof fov?.deg === "number" ? fov.deg : null;
        }
        Promise.resolve(viewer.updateComplete)
          .catch(() => undefined)
          .then(() => ensureAnimationNames())
          .then((hasAnimations) => {
            const currentViewer = viewerRef.current;
            if (!currentViewer || currentViewer !== viewer) return;
            if (!hasAnimations) {
              currentViewer.animationName = undefined;
              currentViewer.play?.();
              return;
            }
            animationIndexRef.current = 0;
            playAllAnimations();
          });
      } catch (error) {
        console.warn("Unable to read model-viewer camera properties", error);
      }
    };

    const node = viewerRef.current;
    node?.addEventListener("load", handleLoad);
    return () => {
      node?.removeEventListener("load", handleLoad);
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
    if (variant === "detail") {
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
    }
    if (variant === "grid") {
      return (
        <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col gap-1">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="pointer-events-auto h-7 w-7 rounded-full text-xs"
            onClick={() => handleZoom(0.8)}
            aria-label="Zoom in"
          >
            +
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="pointer-events-auto h-7 w-7 rounded-full text-xs"
            onClick={() => handleZoom(1.25)}
            aria-label="Zoom out"
          >
            -
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="pointer-events-auto h-6 w-6 rounded-full text-[10px]"
            onClick={handleReset}
            aria-label="Reset view"
          >
            R
          </Button>
        </div>
      );
    }
    return null;
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
