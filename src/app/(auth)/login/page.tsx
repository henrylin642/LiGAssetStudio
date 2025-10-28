import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">LiG Assets Studio</h1>
          <p className="text-sm text-slate-500">Sign in with your LIG account to continue.</p>
        </div>
        <AuthForm />
        <p className="text-center text-xs text-slate-400">JWT tokens are stored in localStorage.</p>
      </div>
    </div>
  );
}
