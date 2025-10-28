# LiG Assets Studio

LiG Assets Studio is a Next.js + TypeScript adapter that fronts the LIG media APIs. It authenticates against `LIG_BASE_URL`, proxies asset/scenes endpoints, and exposes a mock batch-job system for image downscale and video FFmpeg flows.

## Stack

- Next.js App Router (TypeScript)
- Tailwind CSS + shadcn/ui primitives
- React Query for data fetching/state
- Next API Routes as the adapter layer (auth, assets, scenes, jobs)
- Playwright for end-to-end verification

## Environment

Copy `.env.example` and adjust values as needed:

```bash
cp .env.example .env.local
```

| Variable | Default | Notes |
| --- | --- | --- |
| `LIG_BASE_URL` | `https://api.lig.com.tw` | 直接使用正式 API，如需測試可改成 `https://lab.lig.com.tw`。 |
| `NEXT_PUBLIC_API_BASE` | `/api` | Front-end fetch base. Keep in sync with deployment path. |
| `TOKEN_STORAGE` | `localStorage` | Simplified storage provider for browser tokens. |
| `REMBG_CLI` | `rembg` | 選填，指定圖片去背 CLI（預設假設系統已安裝 rembg）。 |
| `NANO_BANANA_BASE_URL` | – | 選填，Nano Banana 生成服務 API 根網址。 |
| `NANO_BANANA_API_KEY` | – | 選填，Nano Banana API 金鑰，用於授權生成請求。 |
| `HAIR_SERVICE_URL` | – | 選填，人物髮絲去背服務的 HTTP API（例如 `http://localhost:8000/remove`）。 |

The adapter forwards requests to `{LIG_BASE_URL}` and appends `Authorization: Bearer <token>` automatically after login.

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in via `/login`.

### Switching to Production

Set `LIG_BASE_URL=https://api.lig.com.tw` in your deployment environment. No code changes are required; the adapter routes proxy the upstream domain.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js in development mode with the adapter routes. |
| `npm run build` | Create a production build. |
| `npm run start` | Start the production build. |
| `npm run lint` | Run ESLint. |
| `npm run test:e2e` | Execute Playwright end-to-end scenarios (auto-launches the dev server). |

## Adapter Routes

```
POST   /api/auth/login               -> {LIG}/api/v1/login
POST   /api/auth/logout              -> local token cleanup
GET    /api/assets                   -> {LIG}/api/v1/assets
GET    /api/assets/:id               -> {LIG}/api/v1/get_asset/:id
GET    /api/scenes                   -> {LIG}/api/v1/scenes
POST   /api/scenes/upload-from-asset -> {LIG}/api/v1/ar_objects/from_asset/:assetId
POST   /api/jobs                     -> mock batch job creation
GET    /api/jobs                     -> mock job listing
GET    /api/jobs/:id                 -> mock job status
GET    /api/jobs/:id/download        -> 302 redirect to sample ZIP
```

- Auth responses are normalised to `{ token, user? }` regardless of upstream payload shape (token is pulled from body or headers).
- Downscale/FFmpeg jobs are persisted in-memory with staged state transitions (`queued → validating → processing → done`).
- Completed jobs expose a ZIP download link that redirects to `/mock/jobs/job-sample.zip`.

## UI Map

| Route | Purpose |
| --- | --- |
| `/login` | Email/password sign-in, token stored in `localStorage`. |
| `/` | Gallery with type tabs, search, pagination, batch drawer, and scene uploads. |
| `/asset/[id]` | Asset preview, metadata, single-job actions, scene upload form. |
| `/jobs` | Polling job dashboard showing progress and mock ZIP downloads. |
| `/scenes` | Scene catalogue used by ScenePicker. |
| `/gen` | Phase-two AIGC placeholder. |
| `/docs` | Inline documentation & flow reference. |

### Components (selected)

- `AuthForm`, `UserMenu`
- `AssetCard`, `AssetGrid`, `TypeTabs`, `FilterBar`, `BatchDrawer`
- `ScenePicker`, `PreviewImage`, `PreviewVideo`, `Preview3D`
- `ProgressBar`, `ResultList`, `ErrorBanner`

### State Machines

- `auth`: `unauthenticated → loggingIn → authenticated | loginError`
- `job`: `idle → validating → processing → done | error | canceled`

## Playwright E2E

Scenarios live in `tests/e2e/app.spec.ts` and mock adapter responses:

1. `e2e-auth-1` – `/login` success stores token and redirects to `/`.
2. `e2e-auth-2` – unauthenticated access to `/` redirects to `/login`.
3. `e2e-gallery-1` – gallery fetches `/api/assets` and renders pagination/search.
4. `e2e-job-1` – select three assets, create a downscale job, verify `/jobs` with ZIP link.
5. `e2e-upload-1` – upload asset to a scene via `/api/scenes/upload-from-asset`.

Run with:

```bash
npm run test:e2e
```

> The test runner starts the dev server automatically via `playwright.config.ts`. Network calls are intercepted per scenario to keep the suite deterministic.

## Mermaid Flow

```mermaid
flowchart LR
  subgraph Auth
    L[/login 輸入帳密/] --> A1[POST /api/auth/login -> {LIG}/api/v1/login]
    A1 -->|token| A2[保存 token]
    A2 -->|OK| G[前往 /]
  end
  subgraph Gallery→Jobs
    G --> S{選取素材}
    S -->|Downscale| J1[POST /api/jobs kind=downscale]
    S -->|FFmpeg| J2[POST /api/jobs kind=ffmpeg]
    J1 --> P[輪詢 GET /api/jobs/:id]
    J2 --> P
    P -->|processing| P
    P -->|done| R[顯示結果/ZIP下載]
  end
  subgraph 詳情→上傳 Scene
    D[/asset/:id 詳情/] --> C1[選 Scene]
    C1 --> U[POST /api/scenes/upload-from-asset -> {LIG}/api/v1/ar_objects/from_asset/:assetId]
    U --> C2[提示成功 & /scenes 可見]
  end
```

## Notes

- `TOKEN_STORAGE=localStorage` keeps implementation lightweight for phase one; integrate secure storage when hardening for production.
- Mock jobs live in-memory. Restarting the server clears the queue.
- Replace mocked ZIP with a real bundle service once available.
# LiGAssetStudio
