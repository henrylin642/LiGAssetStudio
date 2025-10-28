import Link from "next/link";
import { ExternalLink, Plus, Upload } from "lucide-react";
import { Asset } from "@/types/dto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (asset.type === "image") {
    return <PreviewImage src={asset.previewUrl ?? asset.url} alt={asset.name} variant="grid" />;
  }

  if (asset.type === "video") {
    return <PreviewVideo src={asset.url} poster={asset.previewUrl} />;
  }

  if (asset.type === "audio") {
    return <PreviewAudio src={asset.url} />;
  }

  return <Preview3D src={asset.url} poster={asset.previewUrl} />;
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
        <CardDescription className="flex items-center justify-between text-xs text-slate-500">
          <span>{formatBytes(asset.size)}</span>
          {asset.ext ? <Badge variant="secondary">{asset.ext.toUpperCase()}</Badge> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2">
        <Button variant="secondary" size="sm" className="inline-flex items-center gap-2" asChild>
          <Link href={detailHref}>
            <ExternalLink className="h-4 w-4" />
            Details
          </Link>
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
