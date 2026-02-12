"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@workstation/api";
import { Button, Input } from "@workstation/ui";

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginWithCredentials } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async () => {
    if (!identifier.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const success = await loginWithCredentials(identifier.trim(), password);
      if (success) {
        const returnTo = searchParams.get("returnTo") || "/chat";
        router.push(returnTo);
      } else {
        setError("Invalid username/email or password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <h1 className="text-3xl font-bold">Sign In</h1>

      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Email or Username
          </label>
          <Input
            placeholder="admin@workstation.local or admin"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Password
          </label>
          <Input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleLogin}
          className="w-full"
          disabled={!identifier.trim() || !password || loading}
        >
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
