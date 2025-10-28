"use client";

interface PreviewVideoProps {
  src: string;
  poster?: string;
}

export function PreviewVideo({ src, poster }: PreviewVideoProps) {
  return (
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <video
        controls
        muted
        poster={poster}
        className="h-full w-full object-cover"
        preload="metadata"
      >
        <source src={src} />
        <track kind="captions" />
      </video>
    </div>
  );
}

