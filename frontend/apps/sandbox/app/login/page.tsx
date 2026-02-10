"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@workstation/api";
import { Button, Input } from "@workstation/ui";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { loginWithCredentials } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    setError("");
    setLoading(true);
    try {
      const success = await loginWithCredentials(identifier.trim(), password);
      if (success) {
        router.push("/projects");
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
      <h1 className="text-3xl font-bold">Sign In to Sandbox</h1>

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
          disabled={!identifier.trim() || !password.trim() || loading}
        >
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </div>
    </div>
  );
}
