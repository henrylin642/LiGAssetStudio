import { Asset } from "@/types/dto";
import { AssetCard } from "./asset-card";

interface AssetGridProps {
  assets: Asset[];
  selectedIds: string[];
  onToggleAsset: (asset: Asset, selected: boolean) => void;
  onUploadFromCard: (asset: Asset) => void;
}

export function AssetGrid({ assets, selectedIds, onToggleAsset, onUploadFromCard }: AssetGridProps) {
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedIds.includes(asset.id)}
          onSelectChange={(next) => onToggleAsset(asset, next)}
          detailHref={`/asset/${asset.id}`}
          onUploadToScene={() => onUploadFromCard(asset)}
        />
      ))}
    </div>
  );
}
