import Link from "next/link";
import { Download, ExternalLink, Plus, Upload } from "lucide-react";
import { Asset } from "@/types/dto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { PreviewImage } from "@/components/preview/preview-image";
import { PreviewVideo } from "@/components/preview/preview-video";
import { Preview3D } from "@/components/preview/preview-3d";
import { PreviewAudio } from "@/components/preview/preview-audio";

interface AssetCardProps {
  asset: Asset;
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
  detailHref: string;
  onUploadToScene: () => void;
}

function renderPreview(asset: Asset) {
  const overlayClass =
    "absolute inset-0 pointer-events-none rounded-md border border-slate-900/20";

  if (asset.type === "image") {
    return (
      <div className="relative">
        <PreviewImage src={asset.previewUrl ?? asset.url} alt={asset.name} variant="grid" />
        <div className={`${overlayClass} bg-[radial-gradient(circle,_rgba(255,255,255,0.35)_0%,_rgba(15,23,42,0.25)_100%)] mix-blend-multiply`} />
      </div>
    );
  }

  if (asset.type === "video") {
    return (
      <div className="relative">
        <PreviewVideo src={asset.url} poster={asset.previewUrl} />
        <div className={`${overlayClass} bg-gradient-to-br from-white/25 via-transparent to-slate-900/20`} />
      </div>
    );
  }

  if (asset.type === "audio") {
    return (
      <div className="relative">
        <PreviewAudio src={asset.url} />
        <div className={`${overlayClass} bg-[radial-gradient(circle,_rgba(241,245,249,0.45)_0%,_rgba(15,23,42,0.2)_100%)]`} />
      </div>
    );
  }

  return (
    <div className="relative">
      <Preview3D src={asset.url} poster={asset.previewUrl} />
      <div className={`${overlayClass} bg-gradient-to-tr from-white/35 via-transparent to-slate-900/20`} />
    </div>
  );
}

export function AssetCard({ asset, selected, onSelectChange, detailHref, onUploadToScene }: AssetCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="relative">{renderPreview(asset)}</div>
      <CardHeader className="gap-2 pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base">{asset.name}</CardTitle>
          <Checkbox checked={selected} onCheckedChange={(checked) => onSelectChange(Boolean(checked))} />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{formatBytes(asset.size)}</span>
          {asset.ext ? <Badge variant="secondary">{asset.ext.toUpperCase()}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2">
        <Button variant="secondary" size="sm" className="inline-flex items-center gap-2" asChild>
          <Link href={detailHref}>
            <ExternalLink className="h-4 w-4" />
            Details
          </Link>
        </Button>
        <Button variant="ghost" size="sm" className="inline-flex items-center gap-2" asChild>
          <a href={asset.url} download target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSelectChange(!selected)} className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {selected ? "Remove from Batch" : "Add to Batch"}
        </Button>
        <Button size="sm" onClick={onUploadToScene} className="inline-flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload to Scene
        </Button>
      </CardContent>
    </Card>
  );
}
