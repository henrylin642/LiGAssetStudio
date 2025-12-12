"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { ArObject } from "@/types/dto";

export type SceneViewerObject = ArObject & {
  measuredMedia?: {
    width?: number;
    height?: number;
  };
};

export interface SceneViewerProps {
  objects: SceneViewerObject[];
  mediaMeasurements?: Record<string, { width?: number; height?: number }>;
  onMediaDimensionsChange?: (payload: { objectKey: string; width?: number; height?: number }) => void;
  groundHeight?: number;
  className?: string; // Allow overriding styles
}

type GltfLoadResult = {
  scene?: THREE.Object3D | THREE.Group;
  animations?: THREE.AnimationClip[];
};

const DEFAULT_COLOR = 0x94a3b8;
const DRACO_DECODER_CDN = "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

const isVideoLike = (url: string | undefined) => {
  if (!url) return false;
  const normalized = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getSafeLocation = (object: ArObject) => {
  const location = object.location ?? {};
  return {
    x: toNumber(location.x),
    y: toNumber(location.y),
    z: toNumber(location.z),
    rotate_x: toNumber(location.rotate_x),
    rotate_y: toNumber(location.rotate_y),
    rotate_z: toNumber(location.rotate_z),
  };
};

const getSafeZoom = (object: ArObject) => {
  const zoom = object.zoom ?? {};
  return {
    x: toNumber(zoom.x, 1),
    y: toNumber(zoom.y, 1),
    z: toNumber(zoom.z, 1),
  };
};

const getPrimaryAssetUrl = (object: ArObject) => {
  return (
    object.model?.texture?.url ?? object.model?.ios_texture?.url ?? object.model?.android_texture?.url ?? undefined
  );
};

const getTextureDimensionHint = (
  object: SceneViewerObject,
  measurement?: { width?: number; height?: number },
): DimensionHint => {
  const candidates: DimensionHint[] = [];
  const texture = object.model?.texture;
  if (texture) {
    candidates.push({ width: texture.width, height: texture.height });
    if (texture.meta && typeof texture.meta === "object") {
      const meta = texture.meta as {
        width?: number;
        height?: number;
        image?: { width?: number; height?: number };
        video?: { width?: number; height?: number };
      };
      candidates.push({ width: meta.width, height: meta.height });
      candidates.push(meta.image);
      candidates.push(meta.video);
    }
  }

  const measured = measurement ?? (object as { measuredMedia?: { width?: number; height?: number } }).measuredMedia;
  if (measured) {
    candidates.push({ width: measured.width, height: measured.height });
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return undefined;
};

const isGlbLike = (url: string | undefined) => {
  if (!url) return false;
  const normalized = url.split("?")[0].toLowerCase();
  return normalized.endsWith(".glb") || normalized.endsWith(".gltf");
};

const applyTransform = (
  node: THREE.Object3D,
  location: ReturnType<typeof getSafeLocation>,
  degToRad: (degrees: number) => number,
) => {
  node.position.set(location.x, location.y, location.z);
  const rx = degToRad(location.rotate_x);
  const ry = degToRad(location.rotate_y);
  const rz = degToRad(location.rotate_z);
  const matrix = new THREE.Matrix4()
    .makeRotationY(ry)
    .multiply(new THREE.Matrix4().makeRotationX(rx))
    .multiply(new THREE.Matrix4().makeRotationZ(rz));
  node.setRotationFromMatrix(matrix);
};

const disposeMaterial = (material: THREE.Material) => {
  const materialRecord = material as unknown as Record<string, unknown>;
  Object.values(materialRecord).forEach((value) => {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  });
  material.dispose();
};

const disposeMaterialOrArray = (material?: THREE.Material | THREE.Material[] | null) => {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((mat) => mat && disposeMaterial(mat));
    return;
  }
  disposeMaterial(material);
};

const disposeObjectTree = (root: THREE.Object3D) => {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh?.isMesh) {
      mesh.geometry?.dispose();
      disposeMaterialOrArray(mesh.material);
    }
  });
};

type DimensionHint = { width?: number; height?: number } | undefined;

function getMediaDimensions(texture?: THREE.Texture | null, hint?: DimensionHint) {
  const image = texture?.image as
    | {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      videoWidth?: number;
      videoHeight?: number;
    }
    | undefined;
  let width = image?.width ?? image?.naturalWidth ?? image?.videoWidth;
  let height = image?.height ?? image?.naturalHeight ?? image?.videoHeight;

  if ((!Number.isFinite(width) || Number(width) <= 0) && Number.isFinite(hint?.width) && Number(hint?.width) > 0) {
    width = Number(hint?.width);
  }
  if ((!Number.isFinite(height) || Number(height) <= 0) && Number.isFinite(hint?.height) && Number(hint?.height) > 0) {
    height = Number(hint?.height);
  }

  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const safeWidth = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : 1;
  const safeHeight = Number.isFinite(numericHeight) && numericHeight > 0 ? numericHeight : 1;
  return { width: safeWidth, height: safeHeight };
}

function computeNormalizedDimensions(texture?: THREE.Texture | null, hint?: DimensionHint) {
  const { width, height } = getMediaDimensions(texture, hint);
  const maxSide = Math.max(width, height, 1);
  return {
    width: width / maxSide,
    height: height / maxSide,
  };
}

const extractInfoBallPhotos = (object: ArObject, totalFaces: number) => {
  const texture = object.model?.texture as { photos?: string[] } | null | undefined;
  const photos = Array.isArray(texture?.photos) ? texture?.photos : [];
  return Array.from({ length: totalFaces }, (_, index) => photos[index] ?? "");
};

const buildInfoBallConfig = (object: ArObject) => {
  const fields = (object.model?.fields ?? {}) as Record<string, unknown>;
  const floorCount = Math.max(1, toNumber(fields.floor_count, 3));
  const faceCount = Math.max(1, toNumber(fields.face_count, 6));
  const faceWidth = Math.max(0.05, toNumber(fields.face_width, 0.5));
  const floorHeight = Math.max(0.05, toNumber(fields.floor_height, 0.5));
  const faceGap = Math.max(0, toNumber(fields.face_gap, 0.1));
  const floorGap = Math.max(0, toNumber(fields.floor_gap, 0.05));
  const speed = toNumber(fields.speed, 0);

  const rawAngles = Array.isArray(fields.floor_angles) ? fields.floor_angles : [];
  const floorAngles = Array.from({ length: floorCount }, (_, index) => THREE.MathUtils.degToRad(toNumber(rawAngles[index], 0)));

  const rawFaceGaps = Array.isArray(fields.face_gap_list) ? fields.face_gap_list : [];
  const faceGapList = Array.from({ length: floorCount }, (_, index) => toNumber(rawFaceGaps[index], faceGap));

  const totalFaces = floorCount * faceCount;
  const photos = extractInfoBallPhotos(object, totalFaces);

  return {
    floorCount,
    faceCount,
    faceWidth,
    floorHeight,
    faceGap,
    floorGap,
    floorAngles,
    faceGapList,
    speed,
    photos,
  };
};

export function SceneViewer({ objects, mediaMeasurements, onMediaDimensionsChange, groundHeight = 0, className }: SceneViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaMeasurementsRef = useRef<Record<string, { width?: number; height?: number }>>({});
  const mediaMeshRegistryRef = useRef<
    Record<
      string,
      {
        mesh: THREE.Mesh;
        zoom: ReturnType<typeof getSafeZoom>;
      }
    >
  >({});

  // Three.js instances refs
  const sceneContextRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    group: THREE.Group;
    clock: THREE.Clock;
    grid: THREE.GridHelper;
  } | null>(null);

  // Animation and resources refs
  const resourcesRef = useRef<{
    planeMeshes: THREE.Mesh[];
    gltfContainers: THREE.Object3D[];
    infoBallRotators: Array<{ group: THREE.Group; speed: number }>;
    videoEntries: Array<{ texture: THREE.VideoTexture; video: HTMLVideoElement }>;
    dracoLoader: DRACOLoader | null;
    mixers: THREE.AnimationMixer[];
    particleSystems: Array<(delta: number) => void>;
  }>({
    planeMeshes: [],
    gltfContainers: [],
    infoBallRotators: [],
    videoEntries: [],
    dracoLoader: null,
    mixers: [],
    // Particle Systems: Array of update functions
    particleSystems: [] as Array<(delta: number) => void>,
  });

  const requestRef = useRef<number>(0);
  const needsFitRef = useRef(true);
  const hasInitialFitRef = useRef(false);

  useEffect(() => {
    mediaMeasurementsRef.current = mediaMeasurements ?? {};
  }, [mediaMeasurements]);

  // Handle media measurements updates (scaling) without full rebuild if possible, 
  // currently we just let the object effect handle it or we can optimize.
  // The original code handled it via effect. 
  // We can keep the optimization:
  useEffect(() => {
    if (!mediaMeasurements) return;
    Object.entries(mediaMeasurements).forEach(([key, measurement]) => {
      if (!measurement || !measurement.width || !measurement.height) return;
      const entry = mediaMeshRegistryRef.current[key];
      if (!entry) return;
      const dims = computeNormalizedDimensions(undefined, measurement);
      entry.mesh.scale.set(dims.width * entry.zoom.x, dims.height * entry.zoom.y, entry.zoom.z);
    });
  }, [mediaMeasurements]);

  // 1. Init Effect: Setup Scene, Camera, Renderer, Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 540;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    camera.position.set(0, 4, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(5, 10, 5);
    scene.add(directional);

    const grid = new THREE.GridHelper(30, 30, 0x475569, 0x1e293b);
    scene.add(grid);
    const axes = new THREE.AxesHelper(2);
    scene.add(axes);

    const group = new THREE.Group();
    scene.add(group);

    const clock = new THREE.Clock();

    sceneContextRef.current = {
      scene,
      camera,
      renderer,
      controls,
      group,
      clock,
      grid,
    };

    const renderLoop = () => {
      const delta = clock.getDelta();

      // Rotate info balls
      resourcesRef.current.infoBallRotators.forEach(({ group: ballGroup, speed }) => {
        if (speed !== 0) {
          ballGroup.rotation.y += THREE.MathUtils.degToRad(speed) * delta;
        }
      });

      // Update animations
      resourcesRef.current.mixers.forEach((mixer) => mixer.update(delta));
      // Update particles
      resourcesRef.current.particleSystems.forEach((update) => update(delta));

      controls.update();

      // Camera fitting
      if (needsFitRef.current) {
        const box = new THREE.Box3().setFromObject(group);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxSize = Math.max(size.x, size.y, size.z, 1);
          const fitHeightDistance = maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));
          const fitWidthDistance = fitHeightDistance / camera.aspect;
          const distance = Math.max(fitHeightDistance, fitWidthDistance) + 2;

          // Only fit if it's the first load or if we explicitly want to force fit (could happen on scene change)
          // ideally we only fit once per scene load. 
          // For now, let's respect needsFitRef but logic inside Update Effect controls it.
          camera.position.set(center.x + distance, center.y + distance * 0.3, center.z + distance);
          controls.target.copy(center);
          controls.update();
          needsFitRef.current = false;
        }
      }

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(renderLoop);
    };
    requestRef.current = requestAnimationFrame(renderLoop);

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || width;
      const newHeight = container.clientHeight || height;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneContextRef.current = null;
    };
  }, []); // Run once on mount

  const generationRef = useRef(0);

  // Update ground grid position reactively
  useEffect(() => {
    const ctx = sceneContextRef.current;
    if (!ctx) return;
    const { grid } = ctx;
    if (grid) {
      grid.position.y = -(groundHeight ?? 0);
    }
  }, [groundHeight]);

  // 2. Update Effect: Rebuild scene graph when objects change
  useEffect(() => {
    const ctx = sceneContextRef.current;
    if (!ctx) return;
    const { group } = ctx;

    // Increment generation to invalidate previous async callbacks
    generationRef.current += 1;
    const currentGeneration = generationRef.current;

    // Cleanup previous resources
    const res = resourcesRef.current;
    res.planeMeshes.forEach((mesh) => {
      mesh.geometry?.dispose();
      disposeMaterialOrArray(mesh.material);
    });
    res.gltfContainers.forEach((wrapper) => disposeObjectTree(wrapper));
    res.videoEntries.forEach(({ texture, video }) => {
      texture.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    // Reset lists
    res.planeMeshes = [];
    res.gltfContainers = [];
    res.infoBallRotators = [];
    res.videoEntries = [];
    res.infoBallRotators = [];
    res.videoEntries = [];
    res.mixers = [];
    res.particleSystems = [];
    mediaMeshRegistryRef.current = {};

    // Clear group
    group.clear();

    // Re-init loaders if needed (or keep them persistent? keeping persistent is better but let's just new them or store in ref)
    // To be safe and simple, let's create them here or lazily in ref.
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const gltfLoader = new GLTFLoader();
    if (!res.dracoLoader) {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_CDN);
      res.dracoLoader = dracoLoader;
    }
    gltfLoader.setDRACOLoader(res.dracoLoader);

    // Helpers
    const degToRad = THREE.MathUtils.degToRad;
    const upVector = new THREE.Vector3(0, 1, 0);

    const reportMediaDimensions = (objectKey?: string, texture?: THREE.Texture | null) => {
      if (!onMediaDimensionsChange || !objectKey || !texture) return;
      const dims = getMediaDimensions(texture);
      if (dims.width <= 1 || dims.height <= 1) return;
      // We invoke callback, but this might cause re-render loop if not careful.
      // The parent seems to handle it by checking if it changed.
      // We should be careful. The original code did this.
      onMediaDimensionsChange({ objectKey, width: dims.width, height: dims.height });
    };

    const getSceneObjectKey = (object: ArObject, fallbackIndex: number) => {
      if (typeof (object as { sceneKey?: string }).sceneKey === "string") {
        return (object as { sceneKey?: string }).sceneKey as string;
      }
      if (object.id !== null && object.id !== undefined) {
        return String(object.id);
      }
      return `viewer-object-${fallbackIndex}`;
    };

    const createVideoTexture = (url: string, onReady?: (texture: THREE.VideoTexture) => void) => {
      try {
        const video = document.createElement("video");
        video.src = url;
        video.crossOrigin = "anonymous";
        video.loop = true;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = "auto";
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const notifyIfReady = () => {
          if (video.videoWidth > 1 && video.videoHeight > 1) {
            if (generationRef.current !== currentGeneration) return;
            onReady?.(texture);
            // cleanup listeners
            video.removeEventListener("loadedmetadata", notifyIfReady);
            video.removeEventListener("loadeddata", notifyIfReady);
            video.removeEventListener("canplay", notifyIfReady);
            video.removeEventListener("timeupdate", notifyIfReady);
          }
        };

        const playPromise = video.play();
        if (playPromise) {
          playPromise.catch(() => {
            video.muted = true;
            video.play().catch(() => undefined);
          });
        }
        res.videoEntries.push({ texture, video });

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          notifyIfReady();
        }
        video.addEventListener("loadedmetadata", notifyIfReady);
        video.addEventListener("loadeddata", notifyIfReady);
        video.addEventListener("canplay", notifyIfReady);
        video.addEventListener("timeupdate", notifyIfReady);
        video.load();
        return texture;
      } catch (error) {
        console.warn("Failed to create video texture", error);
        return null;
      }
    };

    const applyMediaMaterial = (
      mesh: THREE.Mesh,
      assetUrl: string,
      opacity: number,
      onTextureReady?: (texture?: THREE.Texture | null) => void,
    ) => {
      if (!assetUrl) {
        onTextureReady?.(null);
        return;
      }
      if (isVideoLike(assetUrl)) {
        const videoTexture = createVideoTexture(assetUrl, onTextureReady);
        if (videoTexture) {
          const videoMaterial = new THREE.MeshBasicMaterial({
            map: videoTexture,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
          });
          disposeMaterialOrArray(mesh.material);
          mesh.material = videoMaterial;
        } else {
          onTextureReady?.(null);
        }
        return;
      }

      textureLoader.load(
        assetUrl,
        (texture) => {
          if (generationRef.current !== currentGeneration) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const texturedMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
          });
          disposeMaterialOrArray(mesh.material);
          mesh.material = texturedMaterial;
          onTextureReady?.(texture);
        },
        undefined,
        () => {
          onTextureReady?.(null);
        }
      );
    };

    const addPlaneObject = (
      object: ArObject,
      objectKey: string | undefined,
      dimensionHint: DimensionHint,
      assetUrl?: string,
    ) => {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: DEFAULT_COLOR,
        transparent: true,
        opacity: object.transparency ?? 1,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      res.planeMeshes.push(mesh);
      group.add(mesh);

      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);
      applyTransform(mesh, location, degToRad);

      const updateScale = (texture?: THREE.Texture | null) => {
        const dims = computeNormalizedDimensions(texture, dimensionHint);
        mesh.scale.set(dims.width * zoom.x, dims.height * zoom.y, zoom.z);
        // We do NOT set needsFit=true here on generic updates to avoid camera jumping
        // only if this is the initial load of the scene could we consider it, 
        // but let's stick to "don't jump" for now.
      };

      updateScale();

      if (objectKey) {
        mediaMeshRegistryRef.current[objectKey] = { mesh, zoom };
      }

      if (assetUrl) {
        applyMediaMaterial(mesh, assetUrl, object.transparency ?? 1, (texture) => {
          if (texture) {
            reportMediaDimensions(objectKey, texture);
            updateScale(texture);
          } else {
            updateScale();
          }
        });
      } else if (dimensionHint?.width && dimensionHint?.height && objectKey) {
        // If we already have dimensions, report them to ensure consistency
        onMediaDimensionsChange?.({
          objectKey,
          width: dimensionHint.width,
          height: dimensionHint.height,
        });
      }
    };

    const addGlbObject = (object: ArObject, assetUrl: string, objectKey: string | undefined, dimensionHint: DimensionHint) => {
      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);

      gltfLoader.load(assetUrl, (gltf: GltfLoadResult) => {
        // Check if component still mounted AND if this request is from current generation
        if (!sceneContextRef.current || generationRef.current !== currentGeneration) return;

        const wrapper = new THREE.Group();
        const root = gltf.scene ?? new THREE.Group();
        wrapper.add(root);
        res.gltfContainers.push(wrapper);
        group.add(wrapper);

        // Respect authored origin - remove centering logic
        // const box = new THREE.Box3().setFromObject(root);
        // if (!box.isEmpty()) {
        //   const center = box.getCenter(new THREE.Vector3());
        //   root.position.sub(center);
        // }

        applyTransform(wrapper, location, degToRad);
        wrapper.scale.multiply(new THREE.Vector3(zoom.x, zoom.y, zoom.z));

        // Handle Animations
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          gltf.animations.forEach((clip) => {
            mixer.clipAction(clip).play();
          });
          res.mixers.push(mixer);
        }

        // Again, avoid auto-fitting on load to prevent jumps
      }, undefined, () => {
        // fallback to plane
        addPlaneObject(object, objectKey, dimensionHint, assetUrl);
      });
    };

    const addInfoBallObject = (object: ArObject, objectKey: string | undefined) => {
      const config = buildInfoBallConfig(object);
      const wrapper = new THREE.Group();
      const infoBallGroup = new THREE.Group();
      wrapper.add(infoBallGroup);
      group.add(wrapper);

      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);
      applyTransform(wrapper, location, degToRad);
      wrapper.scale.multiply(new THREE.Vector3(zoom.x, zoom.y, zoom.z));
      res.infoBallRotators.push({ group: infoBallGroup, speed: config.speed });

      // ... (rest of info ball logic same as before) ...
      // For brevity I'll assume the logic for building info ball points matches the original
      // I need to copy the loop logic carefully.
      const angleStep = (2 * Math.PI) / config.faceCount;
      const verticalSpacing = config.floorHeight + config.floorGap;
      const lowestCenterY = -((config.floorCount - 1) * verticalSpacing) / 2;

      for (let layer = 0; layer < config.floorCount; layer += 1) {
        const angleX = -(config.floorAngles[layer] ?? 0);
        const layerCenterY = lowestCenterY + layer * verticalSpacing;
        const gapForLayer = config.faceGapList[layer] ?? config.faceGap;
        const circumference = (config.faceWidth + gapForLayer) * config.faceCount;
        const radius = circumference > 0 ? circumference / (2 * Math.PI) : 0;

        for (let face = 0; face < config.faceCount; face += 1) {
          const idx = layer * config.faceCount + face;
          const textureUrl = config.photos[idx];
          const geometry = new THREE.PlaneGeometry(config.faceWidth, config.floorHeight);
          const material = new THREE.MeshBasicMaterial({
            color: DEFAULT_COLOR,
            transparent: true,
            opacity: object.transparency ?? 1,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(geometry, material);
          res.planeMeshes.push(mesh);
          infoBallGroup.add(mesh);

          const faceAngle = face * angleStep;
          const radialDir = new THREE.Vector3(Math.cos(faceAngle), 0, Math.sin(faceAngle));
          const tangentAxis = radialDir.clone().cross(upVector).normalize();
          const tiltAxis = Number.isFinite(angleX) && angleX !== 0 && tangentAxis.lengthSq() < 1e-6
            ? new THREE.Vector3(1, 0, 0)
            : tangentAxis;

          const rotatedRadial = tiltAxis.lengthSq() > 0 ? radialDir.clone().applyAxisAngle(tiltAxis, angleX) : radialDir.clone();
          const inwardNormal = rotatedRadial.clone().negate().normalize();
          const planeUp = tiltAxis.lengthSq() > 0 ? upVector.clone().applyAxisAngle(tiltAxis, angleX).normalize() : upVector.clone();
          const planeRight = new THREE.Vector3().crossVectors(planeUp, inwardNormal).normalize();

          const orientationMatrix = new THREE.Matrix4().makeBasis(planeRight, planeUp, inwardNormal);
          mesh.setRotationFromMatrix(orientationMatrix);
          mesh.position.set(radialDir.x * radius, layerCenterY, radialDir.z * radius);

          if (textureUrl) {
            applyMediaMaterial(mesh, textureUrl, object.transparency ?? 1, (texture) => {
              if (texture) reportMediaDimensions(objectKey, texture);
            });
          }
        }
      }
    };

    const addParticleObject = (object: ArObject, objectKey: string | undefined) => {
      const fields = (object.model?.fields ?? {}) as Record<string, unknown>;
      const birthRate = toNumber(fields.particle_birth_rate, 500);
      const birthRateVar = toNumber(fields.particle_birth_rate_variation, 50);
      const lifeSpan = toNumber(fields.particle_life_span, 10);
      const lifeSpanVar = toNumber(fields.particle_life_span_variation, 1);
      const velocity = toNumber(fields.particle_velocity, 0.5);
      const velocityVar = toNumber(fields.particle_velocity_variation, 0.1);

      // Particle System Constants
      const MAX_PARTICLES = 5000; // Reasonable cap

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_PARTICLES * 3);
      const opacities = new Float32Array(MAX_PARTICLES); // For fade out/in
      const sizes = new Float32Array(MAX_PARTICLES);

      // We need to track particle state: position, lifetime, velocity (per particle if varied)
      // For simplicity/performance, let's store state in a separate array
      const particleState = new Float32Array(MAX_PARTICLES * 4); // [x, y, z, age]
      const particleVelocities = new Float32Array(MAX_PARTICLES); // [speed]
      const particleLifeSpans = new Float32Array(MAX_PARTICLES); // [maxAge] (in case of variation)
      const particleActive = new Uint8Array(MAX_PARTICLES); // 0 or 1

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

      // Load texture
      const assetUrl = getPrimaryAssetUrl(object);
      let map: THREE.Texture | undefined;
      if (assetUrl) {
        map = textureLoader.load(assetUrl);
        map.colorSpace = THREE.SRGBColorSpace;
      }

      const material = new THREE.PointsMaterial({
        size: 0.5, // Base size
        map: map,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // Usually better for light particles
        color: 0xffffff,
      });
      // Shader modification or custom shader might be needed for per-particle opacity if PointsMaterial doesn't support it well with attribute
      // Standard PointsMaterial uses 'opacity' prop globally. To have per-particle opacity, we need a custom shader or modify the existing one.
      // Or simply, we use `size` to scale to 0 to simulate disappearance if opacity is hard.
      // Actually, let's use a simple trick: use `size` to shrink them out or implement a custom shader material for particles later.
      // For MVP, handling opacity via custom shader is best but complex. 
      // Let's use `size` scaling for "fade" effect or just hard reset.
      // Or: Use built-in support? PointsMaterial doesn't support vertex opacity attribute out of box unless vertexColors is used, but that's color.
      // Let's stick to standard PointsMaterial for now and assume global opacity OR 
      // better: use `vertexColors: true` and manipulate the alpha in color attribute? 
      // THREE.PointsMaterial uses `map` and vertex colors multiplied.
      // Let's use `vertexColors: true` and set colors to (1,1,1, alpha) if possible? 
      // No, THREE.js standard vertex colors are RGB.
      // Okay, let's just make them pop in/out or move them far away when dead.

      const points = new THREE.Points(geometry, material);

      const wrapper = new THREE.Group();
      wrapper.add(points);
      group.add(wrapper);

      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);
      applyTransform(wrapper, location, degToRad);
      wrapper.scale.multiply(new THREE.Vector3(zoom.x, zoom.y, zoom.z));

      // Compensate for scale in velocity (World Speed vs Local Speed)
      // If wrapper is scaled x10, movement of 0.5 becomes 5.0 world units.
      // We assume intended velocity is World Units.
      // We use the Y scale as the primary scale factor for "descent" normalization.
      const scaleFactor = Math.max(0.001, zoom.y);
      const normalizedVelocity = velocity / scaleFactor;
      const normalizedVelocityVar = velocityVar / scaleFactor;

      // Calculate Local Gravity Vector (World Down transformed to Local)
      const localGravity = new THREE.Vector3(0, -1, 0);
      localGravity.applyQuaternion(wrapper.quaternion.clone().invert());
      localGravity.normalize();

      // State for spawning
      let spawnAccumulator = 0;

      // Update function
      const update = (delta: number) => {
        // 1. Spawning
        // Calculate current birth rate with variation (could vary per frame or per second)
        // Let's vary it slightly per frame or just keep it simple.
        const currentBirthRate = birthRate + (Math.random() * 2 - 1) * birthRateVar;
        const rate = Math.max(0, currentBirthRate);
        const particlesToSpawn = rate * delta;

        spawnAccumulator += particlesToSpawn;

        let countToSpawn = Math.floor(spawnAccumulator);
        if (countToSpawn > 0) {
          spawnAccumulator -= countToSpawn;
          // Find inactive slots
          for (let i = 0; i < MAX_PARTICLES && countToSpawn > 0; i++) {
            if (particleActive[i] === 0) {
              particleActive[i] = 1;

              // Reset position (relative to emitter/wrapper origin 0,0,0)
              // Spread particles across the plane defined by zoom.
              // For rotated plane (e.g. 90X), this covers X/Y local which maps to horizontal world plane.
              particleState[i * 4 + 0] = Math.random() - 0.5; // x
              particleState[i * 4 + 1] = Math.random() - 0.5; // y
              particleState[i * 4 + 2] = 0; // z
              particleState[i * 4 + 3] = 0; // age

              // Velocity
              const vel = normalizedVelocity + (Math.random() * 2 - 1) * normalizedVelocityVar;
              particleVelocities[i] = vel;

              // Life
              const life = lifeSpan + (Math.random() * 2 - 1) * lifeSpanVar;
              particleLifeSpans[i] = Math.max(0.1, life);

              countToSpawn--;
            }
          }
        }

        let activeCount = 0;
        const positionsAttr = points.geometry.attributes.position;
        // 2. Update living particles
        for (let i = 0; i < MAX_PARTICLES; i++) {
          if (particleActive[i] === 1) {
            // Update age
            particleState[i * 4 + 3] += delta;

            // Check death
            if (particleState[i * 4 + 3] >= particleLifeSpans[i]) {
              particleActive[i] = 0;
              // Move out of view
              positionsAttr.setXYZ(i, 0, -99999, 0);
              continue;
            }

            // Update Position with World Down Gravity (Local Direction)
            // We use localGravity (unit vector) * speed * delta
            const maxStep = particleVelocities[i] * delta;
            particleState[i * 4 + 0] += localGravity.x * maxStep;
            particleState[i * 4 + 1] += localGravity.y * maxStep;
            particleState[i * 4 + 2] += localGravity.z * maxStep;

            positionsAttr.setXYZ(i, particleState[i * 4 + 0], particleState[i * 4 + 1], particleState[i * 4 + 2]);
            activeCount++;
          }
        }

        positionsAttr.needsUpdate = true;
      };

      res.particleSystems.push(update);
    };
    objects.forEach((object, index) => {
      const objectKey = getSceneObjectKey(object, index);
      const measurement = objectKey ? mediaMeasurementsRef.current[objectKey] : undefined;
      const dimensionHint = getTextureDimensionHint(object, measurement);

      if (object.model?.type === 13) {
        addInfoBallObject(object, objectKey);
        return;
      }

      if (object.model?.type === 16) {
        addParticleObject(object, objectKey);
        return;
      }

      const assetUrl = getPrimaryAssetUrl(object);
      if (isGlbLike(assetUrl)) {
        addGlbObject(object, assetUrl as string, objectKey, dimensionHint);
      } else {
        addPlaneObject(object, objectKey, dimensionHint, assetUrl);
      }
    });

    // Handle fitting logic
    // If this is the FIRST time we have objects, enable fit
    if (!hasInitialFitRef.current && objects.length > 0) {
      needsFitRef.current = true;
      hasInitialFitRef.current = true;
    }

  }, [objects, onMediaDimensionsChange]); // Re-run when object list or dimensions listener changes

  return <div ref={containerRef} className={className ?? "h-[480px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900"} />;
}
