"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Scene } from "@/types/dto";

interface ScenePickerProps {
  scenes: Scene[];
  value?: number;
  onChange: (sceneId: number | undefined) => void;
  placeholder?: string;
}

export function ScenePicker({ scenes, value, onChange, placeholder = "Select Scene" }: ScenePickerProps) {
  const options = useMemo(() => {
    return [...scenes].sort((a, b) => {
      if (a.id === b.id) return a.name.localeCompare(b.name, "zh-Hant");
      return b.id - a.id;
    });
  }, [scenes]);

  return (
    <Select
      value={value ? String(value) : undefined}
      onValueChange={(next) => onChange(next ? Number(next) : undefined)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72 overflow-auto">
        {options.map((scene) => (
          <SelectItem key={scene.id} value={String(scene.id)}>
            {`${scene.id}-${scene.name}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
