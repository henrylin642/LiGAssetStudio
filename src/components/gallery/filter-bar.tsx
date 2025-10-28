"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  initialSearch?: string;
  onSearchChange: (value: string) => void;
  perPage: number;
  onPerPageChange: (value: number) => void;
}

const PAGE_OPTIONS = [24, 48, 96];

export function FilterBar({ initialSearch = "", onSearchChange, perPage, onPerPageChange }: FilterBarProps) {
  const [value, setValue] = useState(initialSearch);

  useEffect(() => {
    setValue(initialSearch);
  }, [initialSearch]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchChange(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          value={value}
          placeholder="Search by name or metadata"
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <div className="w-full space-y-2 md:w-48">
        <Label htmlFor="per-page">Per page</Label>
        <Select value={String(perPage)} onValueChange={(next) => onPerPageChange(Number(next))}>
          <SelectTrigger id="per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full items-end gap-2 md:w-auto">
        <Button type="submit" className="w-full md:w-auto">
          Apply
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full md:w-auto"
          onClick={() => {
            setValue("");
            onSearchChange("");
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

