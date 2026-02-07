"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@workstation/api";
import { Button, Input } from "@workstation/ui";

const isDev = process.env.NODE_ENV === "development";

function base64UrlEncode(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const router = useRouter();

  const handleDevLogin = () => {
    if (!isDev) return;
    const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
    const payload = base64UrlEncode({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    });
    const devToken = `${header}.${payload}.dev-signature`;
    login(devToken);
    router.push("/chat");
  };

  const handleTokenLogin = () => {
    if (token.trim()) {
      const success = login(token.trim());
      if (success) {
        router.push("/chat");
      } else {
        setError("Invalid or expired token.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="text-3xl font-bold">Sign In</h1>

      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            JWT Token
          </label>
          <Input
            placeholder="Paste your JWT token..."
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleTokenLogin()}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button onClick={handleTokenLogin} className="w-full" disabled={!token.trim()}>
            Sign In with Token
          </Button>
        </div>

        {isDev && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or
                </span>
              </div>
            </div>

            <Button onClick={handleDevLogin} variant="outline" className="w-full">
              Dev Login (Mock User)
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
