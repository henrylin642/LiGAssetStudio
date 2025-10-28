import { Asset } from "@/types/dto";
import { AssetCard } from "./asset-card";

interface AssetGridProps {
  assets: Asset[];
  selectedIds: string[];
  onToggleAsset: (assetId: string, selected: boolean) => void;
  onUploadFromCard: (asset: Asset) => void;
}

export function AssetGrid({ assets, selectedIds, onToggleAsset, onUploadFromCard }: AssetGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedIds.includes(asset.id)}
          onSelectChange={(next) => onToggleAsset(asset.id, next)}
          detailHref={`/asset/${asset.id}`}
          onUploadToScene={() => onUploadFromCard(asset)}
        />
      ))}
    </div>
  );
}
