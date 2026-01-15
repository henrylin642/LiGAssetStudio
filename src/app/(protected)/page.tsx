"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenePicker } from "@/components/scene-picker";
import { BatchDrawer, BatchSceneUploadInput } from "@/components/batch-drawer";
import { FilterBar } from "@/components/gallery/filter-bar";
import { AssetGrid } from "@/components/gallery/asset-grid";
import { TypeTabs } from "@/components/type-tabs";
import { ErrorBanner } from "@/components/error-banner";
import { useAssetsQuery } from "@/hooks/use-assets";
import { useScenesQuery } from "@/hooks/use-scenes";
import { useCreateJobMutation } from "@/hooks/use-jobs";
import { useApi } from "@/hooks/use-api";
import type { Asset, AssetPage, AssetType, ArObject } from "@/types/dto";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBytes } from "@/lib/utils";

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",").pop() ?? "" : result;
      if (!base64) {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [type, setType] = useState<AssetType | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Record<string, Asset>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadAsset, setUploadAsset] = useState<Asset | null>(null);
  const [sceneId, setSceneId] = useState<number>();
  const [sceneName, setSceneName] = useState("");
  
  // Mass Upload States
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [isRandomPlace, setIsRandomPlace] = useState(false);
  const [lightTagHeight, setLightTagHeight] = useState(1.6);
  const [placementRange, setPlacementRange] = useState(20);

  const [logs, setLogs] = useState<string[]>([]);

  function addLog(message: string) {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }

  async function handleUploadToScene(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadAsset || !sceneId || !sceneName) return;
    setUploading(true);
    setLogs([]); // Clear logs on start
    addLog(`Starting upload process. Count: ${duplicateCount}, Random: ${isRandomPlace}`);

    try {
      const count = Math.max(1, duplicateCount);
      const isRandom = isRandomPlace;
      
      for (let i = 0; i < count; i++) {
        addLog(`--- Processing Object ${i + 1}/${count} ---`);
        // Step 1: Create AR Object in Scene
        let createdObjectId: string | null = null;
        
        addLog(`Creating object via API...`);
        const uploadRes = await api("/scenes/upload-from-asset", {
          method: "POST",
          body: JSON.stringify({ assetId: uploadAsset.id, sceneId, name: sceneName }),
        });

        if (uploadRes.ok) {
             try {
                const uploadData = await uploadRes.json();
                const objectData = uploadData.result || uploadData;
                if (objectData && typeof objectData.id === 'number') createdObjectId = String(objectData.id);
                else if (objectData && typeof objectData.id === 'string') createdObjectId = objectData.id;
                
                if (createdObjectId) {
                    addLog(`Object created. ID from response: ${createdObjectId}`);
                } else {
                    addLog(`Object created but ID not in response.`);
                }
             } catch (e) { 
                 addLog(`Error parsing upload response: ${e}`);
             }
        } else {
            addLog(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
            continue;
        }

        // Retry logic
        if (!createdObjectId) {
             addLog(`Attempting to retrieve ID from scene objects list...`);
             let retries = 3;
             while (retries > 0 && !createdObjectId) {
                 try {
                     const objectsRes = await api(`/scenes/${sceneId}/objects`);
                     if (objectsRes.ok) {
                         const objects = (await objectsRes.json()) as ArObject[];
                         if (Array.isArray(objects)) {
                             const candidates = objects.filter(o => o.name === sceneName);
                             const targetList = candidates.length > 0 ? candidates : objects;
                             targetList.sort((a, b) => b.id - a.id);
                             
                             if (targetList.length > 0) {
                                 createdObjectId = String(targetList[0].id);
                                 addLog(`Fallback: Found latest object ID ${createdObjectId}`);
                             }
                         }
                     }
                 } catch (e) {
                     addLog(`Error fetching objects: ${e}`);
                 }
                 
                 if (!createdObjectId) {
                     retries--;
                     if (retries > 0) {
                         addLog(`ID not found. Retrying in 500ms... (${retries} retries left)`);
                         await new Promise(res => setTimeout(res, 500)); 
                     }
                 }
             }
        }

        if (!createdObjectId) {
             addLog(`❌ Failed to determine Object ID. Skipping update.`);
             continue;
        }

        // Fetch current object
        let currentObject: any = null;
        try {
            const getRes = await api(`/ar_objects/${createdObjectId}`);
            if (getRes.ok) {
                const getData = await getRes.json();
                currentObject = getData.result || getData;
            }
        } catch (e) {
            console.error("Failed to fetch new AR Object:", e);
        }

        if (isRandom) {
            // Calculate Random Position
            const x = (Math.random() - 0.5) * placementRange;
            const y = -lightTagHeight;
            const z = Math.random() * placementRange;
            
            const rotateX = Math.random() * 360;
            const rotateZ = Math.random() * 360;
            const rotateY = 0;

            const newLocation = {
                x, y, z,
                rotate_x: rotateX,
                rotate_y: rotateY,
                rotate_z: rotateZ,
            };

            addLog(`Updating location to: X=${x.toFixed(2)}, Y=${y}, Z=${z.toFixed(2)}`);

            // Construct update body
            let updateBody: any = {};
            if (currentObject) {
                 updateBody = { ...currentObject };
                 updateBody.location = newLocation;
            } else {
                 updateBody = { location: newLocation };
            }

            try {
                const updateRes = await api(`/ar_objects/${createdObjectId}`, {
                    method: "POST",
                    body: JSON.stringify(updateBody)
                });
                if (!updateRes.ok) {
                     addLog(`❌ Update failed: ${await updateRes.text()}`);
                } else {
                     addLog(`✅ Location updated successfully.`);
                }
            } catch (e) {
                addLog(`❌ Exception during update: ${e}`);
            }
        } else {
            addLog(`Random placement disabled. Skipping update.`);
        }
      }

      // Don't close immediately if there are logs (let user read them)
      // Or maybe clear after success? User asked to show logs.
      // We will keep the sheet open or keep logs visible? 
      // User request: "把你的操作log先顯示在Upload asset的視窗下"
      // We will keep the upload asset state active? 
      // To properly show logs, we shouldn't reset `uploadAsset` immediately if we want user to see.
      // But usually user wants to close after done. 
      // Let's add a "Close" button or keep it open. 
      // For now, I'll NOT clear `uploadAsset` automatically if successfully finished, 
      // OR I clear it but the Sheet closes?
      // If I set `uploadAsset` to null, the sheet closes.
      // So I should NOT set `uploadAsset` to null automatically if I want them to see logs.
      // I will only clear fields like sceneId etc.
      
      // setUploadAsset(null); // Keep open to show logs
      // setSceneId(undefined); // Keep scene selected for repeated usage? or reset?
      
      addLog(`✨ All operations completed.`);

    } catch (e) {
      addLog(`❌ Critical Error: ${e}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ... existing code ... */}
      
      <Sheet open={Boolean(uploadAsset)} onOpenChange={(open) => !open && setUploadAsset(null)}>
        <SheetContent className="overflow-y-auto max-h-screen">
          <SheetHeader>
            <SheetTitle>Upload asset to Scene</SheetTitle>
            <SheetDescription>
              Trigger LIG AR object creation for “{uploadAsset?.name ?? ""}”.
            </SheetDescription>
          </SheetHeader>
          <form className="flex flex-1 flex-col gap-4 py-4" onSubmit={handleUploadToScene}>
            {/* ... inputs ... */}
            <div className="space-y-2">
              <Label>Scene</Label>
              <ScenePicker
                scenes={scenesQuery.data ?? []}
                value={sceneId}
                onChange={setSceneId}
                placeholder={scenesQuery.isLoading ? "Loading scenes…" : "Select scene"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sceneName">AR object name</Label>
              <Input
                id="sceneName"
                value={sceneName}
                onChange={(event) => setSceneName(event.target.value)}
                placeholder="Enter AR object name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="duplicateCount">Duplicate Number</Label>
                    <Input
                        id="duplicateCount"
                        type="number"
                        min={1}
                        value={duplicateCount}
                        onChange={(e) => setDuplicateCount(Number(e.target.value))}
                    />
                </div>
            </div>

            <div className="flex items-center space-x-2 border p-2 rounded-md">
                <Checkbox 
                    id="randomPlace" 
                    checked={isRandomPlace}
                    onCheckedChange={(checked) => setIsRandomPlace(checked === true)}
                />
                <Label htmlFor="randomPlace">Random Place</Label>
            </div>

            {isRandomPlace && (
                <div className="grid grid-cols-2 gap-4 border p-2 rounded-md bg-slate-50">
                    <div className="space-y-2">
                        <Label htmlFor="lightTagHeight">LightTag Height (m)</Label>
                        <Input
                            id="lightTagHeight"
                            type="number"
                            step={0.1}
                            value={lightTagHeight}
                            onChange={(e) => setLightTagHeight(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                         <Label htmlFor="placementRange">Placement Range (m)</Label>
                        <Input
                            id="placementRange"
                            type="number"
                            step={1}
                            value={placementRange}
                            onChange={(e) => setPlacementRange(Number(e.target.value))}
                        />
                    </div>
                </div>
            )}

            {/* Logs Window */}
            <div className="mt-4 rounded-md border bg-slate-900 p-4 text-xs font-mono text-slate-50 max-h-[200px] overflow-y-auto">
                {logs.length === 0 ? (
                    <span className="text-slate-500">Operation logs will appear here...</span>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className="break-all border-b border-slate-800 pb-1 mb-1 last:border-0">
                            {log}
                        </div>
                    ))
                )}
            </div>

            <SheetFooter>
              <Button type="submit" disabled={!sceneId || !sceneName || uploading}>
                {uploading ? "Submitting…" : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
