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
}

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

  const safeWidth = Number.isFinite(width) && width > 0 ? Number(width) : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? Number(height) : 1;
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

export function SceneViewer({ objects, mediaMeasurements, onMediaDimensionsChange }: SceneViewerProps) {
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

  useEffect(() => {
    mediaMeasurementsRef.current = mediaMeasurements ?? {};
  }, [mediaMeasurements]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

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

    const grid = new THREE.GridHelper(40, 40, 0x475569, 0x1e293b);
    scene.add(grid);
    const axes = new THREE.AxesHelper(2);
    scene.add(axes);

    const group = new THREE.Group();
    scene.add(group);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_CDN);
    gltfLoader.setDRACOLoader(dracoLoader);

    const planeMeshes: THREE.Mesh[] = [];
    const gltfContainers: THREE.Object3D[] = [];
    const infoBallRotators: Array<{ group: THREE.Group; speed: number }> = [];
    const videoEntries: Array<{ texture: THREE.VideoTexture; video: HTMLVideoElement }> = [];
    const upVector = new THREE.Vector3(0, 1, 0);
    const degToRad = THREE.MathUtils.degToRad;
    const clock = new THREE.Clock();
    let needsFit = true;
    const reportMediaDimensions = (objectKey?: string, texture?: THREE.Texture | null) => {
      if (!onMediaDimensionsChange || !objectKey || !texture) return;
      const dims = getMediaDimensions(texture);
      if (dims.width <= 1 || dims.height <= 1) return;
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
            onReady?.(texture);
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
        videoEntries.push({ texture, video });
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
        },
      );
    };

    const fitCameraToObjects = () => {
      if (!needsFit) return;
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z, 1);
      const fitHeightDistance = maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));
      const fitWidthDistance = fitHeightDistance / camera.aspect;
      const distance = Math.max(fitHeightDistance, fitWidthDistance) + 2;
      camera.position.set(center.x + distance, center.y + distance * 0.3, center.z + distance);
      controls.target.copy(center);
      controls.update();
      needsFit = false;
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
      planeMeshes.push(mesh);
      group.add(mesh);

      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);
      applyTransform(mesh, location, degToRad);

      const updateScale = (texture?: THREE.Texture | null) => {
        const dims = computeNormalizedDimensions(texture, dimensionHint);
        mesh.scale.set(dims.width * zoom.x, dims.height * zoom.y, zoom.z);
        needsFit = true;
      };

      updateScale();

      if (objectKey) {
        mediaMeshRegistryRef.current[objectKey] = { mesh, zoom };
      }

      if (assetUrl) {
        applyMediaMaterial(
          mesh,
          assetUrl,
          object.transparency ?? 1,
          (texture) => {
            if (texture) {
              reportMediaDimensions(objectKey, texture);
              updateScale(texture);
            } else {
              updateScale();
            }
          },
        );
      } else if (dimensionHint?.width && dimensionHint?.height && objectKey) {
        onMediaDimensionsChange?.({
          objectKey,
          width: dimensionHint.width,
          height: dimensionHint.height,
        });
      }
    };

    const addGlbObject = (object: ArObject, assetUrl: string) => {
      const location = getSafeLocation(object);
      const zoom = getSafeZoom(object);
      gltfLoader.load(
        assetUrl,
        (gltf) => {
          const wrapper = new THREE.Group();
          const root = gltf.scene ?? new THREE.Group();
          wrapper.add(root);
          gltfContainers.push(wrapper);
          group.add(wrapper);

          const box = new THREE.Box3().setFromObject(root);
          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            root.position.sub(center);
          }

          applyTransform(wrapper, location, degToRad);
          wrapper.scale.multiply(new THREE.Vector3(zoom.x, zoom.y, zoom.z));
          needsFit = true;
        },
        undefined,
        () => {
          addPlaneObject(object);
        },
      );
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
      infoBallRotators.push({ group: infoBallGroup, speed: config.speed });

      const angleStep = (2 * Math.PI) / config.faceCount;
      const verticalSpacing = config.floorHeight + config.floorGap;
      const lowestCenterY = -((config.floorCount - 1) * verticalSpacing) / 2;

      for (let layer = 0; layer < config.floorCount; layer += 1) {
        const angleX = config.floorAngles[layer] ?? 0;
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
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          planeMeshes.push(mesh);
          infoBallGroup.add(mesh);

          const faceAngle = face * angleStep;
          const radialDir = new THREE.Vector3(Math.cos(faceAngle), 0, Math.sin(faceAngle));
          const tangentAxis = radialDir.clone().cross(upVector).normalize();
          const tiltAxis =
            Number.isFinite(angleX) && angleX !== 0 && tangentAxis.lengthSq() < 1e-6
              ? new THREE.Vector3(1, 0, 0)
              : tangentAxis;

          const rotatedRadial =
            tiltAxis.lengthSq() > 0 ? radialDir.clone().applyAxisAngle(tiltAxis, angleX) : radialDir.clone();
          const inwardNormal = rotatedRadial.clone().negate().normalize();
          const planeUp =
            tiltAxis.lengthSq() > 0 ? upVector.clone().applyAxisAngle(tiltAxis, angleX).normalize() : upVector.clone();
          const planeRight = new THREE.Vector3().crossVectors(planeUp, inwardNormal).normalize();

          const orientationMatrix = new THREE.Matrix4().makeBasis(planeRight, planeUp, inwardNormal);
          mesh.setRotationFromMatrix(orientationMatrix);
          mesh.position.set(radialDir.x * radius, layerCenterY, radialDir.z * radius);

          if (textureUrl) {
            applyMediaMaterial(
              mesh,
              textureUrl,
              object.transparency ?? 1,
              (texture) => {
                if (texture) {
                  reportMediaDimensions(objectKey, texture);
                }
              },
            );
          }
        }
      }

      needsFit = true;
    };

    objects.forEach((object, index) => {
      const objectKey = getSceneObjectKey(object, index);
      const measurement = objectKey ? mediaMeasurementsRef.current[objectKey] : undefined;
      const dimensionHint = getTextureDimensionHint(object, measurement);
      if (object.model?.type === 13) {
        addInfoBallObject(object, objectKey);
        return;
      }

      const assetUrl = getPrimaryAssetUrl(object);
      if (isGlbLike(assetUrl)) {
        addGlbObject(object, assetUrl as string);
      } else {
        addPlaneObject(object, objectKey, dimensionHint, assetUrl);
      }
    });

    let animationId = 0;
    const renderLoop = () => {
      const delta = clock.getDelta();
      infoBallRotators.forEach(({ group: ballGroup, speed }) => {
        if (speed !== 0) {
          ballGroup.rotation.y += THREE.MathUtils.degToRad(speed) * delta;
        }
      });
      controls.update();
      fitCameraToObjects();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || width;
      const newHeight = container.clientHeight || height;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      needsFit = true;
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      planeMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        disposeMaterialOrArray(mesh.material);
      });
      gltfContainers.forEach((wrapper) => disposeObjectTree(wrapper));
      videoEntries.forEach(({ texture, video }) => {
        texture.dispose();
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      mediaMeshRegistryRef.current = {};
      dracoLoader.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [objects, onMediaDimensionsChange]);

  return <div ref={containerRef} className="h-[480px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900" />;
}
