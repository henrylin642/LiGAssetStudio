export type NanoGenerationMode = "text" | "image" | "remix";

export interface NanoGenerationSpec {
  mode: NanoGenerationMode;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  aspectRatio?: string;
  count: number;
  referenceImages: string[];
}
