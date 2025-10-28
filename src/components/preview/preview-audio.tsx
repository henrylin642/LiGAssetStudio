"use client";

interface PreviewAudioProps {
  src: string;
}

export function PreviewAudio({ src }: PreviewAudioProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-slate-200 bg-black p-4">
      <p className="text-xs uppercase tracking-wide text-slate-200">Audio Preview</p>
      <audio controls preload="metadata" className="w-full">
        <source src={src} />
      </audio>
    </div>
  );
}
