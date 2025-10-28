"use client";

import { useMemo, useState } from "react";

interface PreviewImageProps {
  src: string;
  alt?: string;
  variant?: "grid" | "detail";
  maxSize?: number;
  onDimensions?: (dimensions: { width: number; height: number }) => void;
}

const DEFAULT_MAX_SIZE = 720;

export function PreviewImage({
  src,
  alt,
  variant = "grid",
  maxSize = DEFAULT_MAX_SIZE,
  onDimensions,
}: PreviewImageProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();

  const containerClass =
    variant === "detail"
      ? "flex w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4"
      : "flex aspect-square items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50";

  const imageStyle = useMemo(() => {
    if (variant !== "detail") {
      return {
        maxWidth: "100%",
        maxHeight: "100%",
        width: "auto",
        height: "auto",
      } as const;
    }

    if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
      return {
        maxWidth: "100%",
        maxHeight: `${maxSize}px`,
        width: "auto",
        height: "auto",
      } as const;
    }

    const { width, height } = dimensions;
    const longestSide = Math.max(width, height);
    const scale = Math.min(1, maxSize / longestSide);
    const displayWidth = Math.round(width * scale);
    const displayHeight = Math.round(height * scale);

    return {
      width: `${displayWidth}px`,
      height: `${displayHeight}px`,
      maxWidth: "100%",
      maxHeight: `${maxSize}px`,
    } as const;
  }, [variant, dimensions, maxSize]);

  const imageClass =
    variant === "detail"
      ? "object-contain transition-transform duration-200"
      : "h-full w-full object-contain";

  return (
    <div className={containerClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? "Asset preview"}
        className={imageClass}
        style={imageStyle}
        loading="lazy"
      onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            if (variant === "detail") {
              setDimensions({ width: naturalWidth, height: naturalHeight });
            }
            onDimensions?.({ width: naturalWidth, height: naturalHeight });
          }
        }}
      />
    </div>
  );
}
