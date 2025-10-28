import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

const MERMAID_CHART = `flowchart LR
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
end`;

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold text-slate-900">LiG Assets Studio Usage</h1>
        <p className="text-sm text-slate-600">
          LiG Assets Studio bridges internal operators with the LIG asset APIs. Call the adapter routes under
          <code className="mx-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">{API_BASE}</code>
          for authenticated requests; tokens are injected automatically.
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Authentication</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Navigate to <code className="rounded bg-slate-100 px-1 text-xs">/login</code>.</li>
          <li>Submit LIG credentials; the JWT token persists in <code className="rounded bg-slate-100 px-1 text-xs">localStorage</code>.</li>
          <li>Any 401 clears the token and redirects back to the login page.</li>
        </ol>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Gallery Flow</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Switch tabs (Images, Videos, Models) or filter via search + pagination.</li>
          <li>Select assets with the checkbox or “Add to Batch” toggle.</li>
          <li>Open the Batch Drawer to configure Downscale or FFmpeg jobs before enqueueing.</li>
          <li>Use “Upload to Scene” to create an AR object via <code className="rounded bg-slate-100 px-1 text-xs">/api/scenes/upload-from-asset</code>.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Asset Detail</h2>
        <p>
          Endpoint <code className="rounded bg-slate-100 px-1 text-xs">/asset/[id]</code> includes dedicated previewers, metadata, single-asset job forms, and Scene upload utilities.
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Jobs</h2>
        <p>
          Monitor <code className="rounded bg-slate-100 px-1 text-xs">/api/jobs</code> states (queued → validating → processing → done). Completed jobs surface mocked ZIP downloads through a 302 redirect to
          <code className="mx-1 rounded bg-slate-100 px-1 text-xs">/mock/jobs/job-sample.zip</code>.
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Scenes</h2>
        <p>
          The scenes list mirrors <code className="rounded bg-slate-100 px-1 text-xs">{API_BASE}/scenes</code> for ScenePicker usage.
        </p>
      </section>

      <section className="space-y-2 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Mermaid Flow Reference</h2>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
{MERMAID_CHART}
        </pre>
      </section>

      <section className="space-y-1 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Shortcuts</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link className="text-slate-900 underline" href="/gen">
              /gen
            </Link>
            – reserved workspace for phase two generators.
          </li>
          <li>
            <Link className="text-slate-900 underline" href="/docs">
              /docs
            </Link>
            – this quick reference.
          </li>
        </ul>
      </section>
    </div>
  );
}
