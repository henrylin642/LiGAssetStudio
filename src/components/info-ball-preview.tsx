"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface InfoBallPreviewProps {
  config: {
    floorCount: number;
    faceCount: number;
    faceWidth: number;
    floorHeight: number;
    faceGap: number;
    floorGap: number;
    floorAngles: number[];
    faceGapList: number[];
    speed: number;
  };
  photos: string[];
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export function InfoBallPreview({ config, photos, zoom = 1, onZoomChange }: InfoBallPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 360;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);

    const group = new THREE.Group();
    scene.add(group);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");

    const totalFaces = config.floorCount * config.faceCount;
    const photosFallback = photos.slice(0, totalFaces);
    while (photosFallback.length < totalFaces) {
      photosFallback.push("");
    }

    const angleStep = (2 * Math.PI) / config.faceCount;
    const verticalSpacing = config.floorHeight + config.floorGap;
    const lowestCenterY = -((config.floorCount - 1) * verticalSpacing) / 2;

    const normalizedAngles = Array.from({ length: config.floorCount }, (_, index) => {
      const angle = config.floorAngles[index];
      return THREE.MathUtils.degToRad(Number.isFinite(angle) ? (angle as number) : 0);
    });
    const normalizedGaps = Array.from({ length: config.floorCount }, (_, index) => {
      const gap = config.faceGapList[index];
      return Number.isFinite(gap) ? (gap as number) : config.faceGap;
    });

    const planeMeshes: THREE.Mesh[] = [];
    const upVector = new THREE.Vector3(0, 1, 0);

    for (let layer = 0; layer < config.floorCount; layer += 1) {
      const angleX = normalizedAngles[layer] ?? 0;
      const layerCenterY = lowestCenterY + layer * verticalSpacing;

      const gapForLayer = normalizedGaps[layer];
      const circumference = (config.faceWidth + gapForLayer) * config.faceCount;
      const radius = circumference > 0 ? circumference / (2 * Math.PI) : 0;

      for (let face = 0; face < config.faceCount; face += 1) {
        const idx = layer * config.faceCount + face;
        const textureUrl = photosFallback[idx];
        const geometry = new THREE.PlaneGeometry(config.faceWidth, config.floorHeight);

        let material: THREE.MeshBasicMaterial;
        if (textureUrl) {
          const texture = textureLoader.load(textureUrl, undefined, undefined, () => undefined);
          material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        } else {
          material = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true, side: THREE.DoubleSide });
        }

        const mesh = new THREE.Mesh(geometry, material);
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

        group.add(mesh);
        planeMeshes.push(mesh);
      }
    }

    const clock = new THREE.Clock();
    const rotationSpeed = THREE.MathUtils.degToRad(config.speed) / 60; // roughly degrees per second

    let animationFrameId = 0;
    const animate = () => {
      const delta = clock.getDelta();
      group.rotation.y += rotationSpeed * delta * 60;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || 640;
      const newHeight = container.clientHeight || 360;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      planeMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      });
      renderer.dispose();
      container.removeChild(renderer.domElement);
      cameraRef.current = null;
    };
  }, [config.faceCount, config.faceGap, config.faceGapList, config.faceWidth, config.floorCount, config.floorGap, config.floorHeight, config.floorAngles, config.speed, photos]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 3;
    const BASE_DISTANCE = 6;
    const zoomValue = THREE.MathUtils.clamp(zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
    camera.position.set(0, 0, BASE_DISTANCE / zoomValue);
    camera.updateProjectionMatrix();
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onZoomChange) return undefined;
    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 3;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const currentZoom = zoom ?? 1;
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      const nextZoom = THREE.MathUtils.clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM);
      onZoomChange(nextZoom);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [onZoomChange, zoom]);

  return <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-lg border border-slate-200 bg-black" />;
}
