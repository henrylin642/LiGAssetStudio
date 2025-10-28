export type AssetType = "image" | "video" | "model" | "audio";

export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  url: string;
  size: number;
  previewUrl?: string;
  ext?: string;
  meta?: Record<string, unknown>;
}

export interface AssetPage {
  items: Asset[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Scene {
  id: number;
  name: string;
  description?: string;
}

export interface UploadedAsset {
  id: string;
  name: string;
  size: number;
  type: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export type JobKind = "downscale" | "ffmpeg";

export interface DownscaleOptions {
  target: "image";
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  keepAspectRatio: boolean;
  outputFormat?: "jpg" | "png" | "webp";
}

export type FFmpegMode = "targetCRF" | "targetBitrateKbps" | "targetResolution";

export interface FFmpegOptions {
  mode: FFmpegMode;
  targetFormat: "mp4" | "webm";
  crf?: number;
  bitrateKbps?: number;
  width?: number;
  height?: number;
  audioCopy?: boolean;
  fastStart?: boolean;
  audioBitrateKbps?: number;
  preset?: string;
}

export interface CreateJobInput {
  kind: JobKind;
  assetIds: string[];
  options: DownscaleOptions | FFmpegOptions;
}

export type JobState =
  | "queued"
  | "validating"
  | "processing"
  | "done"
  | "error"
  | "canceled";

export interface JobStatus {
  id: string;
  state: JobState;
  progress: number;
  message?: string;
  results?: ResultAsset[];
  kind: JobKind;
  createdAt: string;
  updatedAt: string;
  options: DownscaleOptions | FFmpegOptions;
  assetIds: string[];
}

export interface ResultAsset {
  id: string;
  jobId: string;
  kind: "media" | "zip" | "json";
  filename: string;
  size: number;
  url: string;
}

export interface AuthResponse {
  token: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
  };
}
