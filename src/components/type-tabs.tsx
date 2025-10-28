"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssetType } from "@/types/dto";

const TAB_OPTIONS: Array<{ value: AssetType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Music" },
  { value: "model", label: "Models" },
];

interface TypeTabsProps {
  value: AssetType | "all";
  onValueChange: (value: AssetType | "all") => void;
}

export function TypeTabs({ value, onValueChange }: TypeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as TypeTabsProps["value"])}>
      <TabsList>
        {TAB_OPTIONS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
