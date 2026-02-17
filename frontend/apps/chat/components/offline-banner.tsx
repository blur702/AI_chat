"use client";

import { useEffect, useState, useRef } from "react";
import { useOnlineStatus } from "@workstation/api/hooks/use-online-status";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const [showSuccess, setShowSuccess] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      // Just came back online
      wasOfflineRef.current = false;
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showSuccess) return null;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${
        isOnline
          ? "bg-green-600/90 text-white"
          : "bg-yellow-600/90 text-white"
      }`}
      role="alert"
    >
      {isOnline ? (
        <>
          <Wifi className="h-3.5 w-3.5" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>You are offline. Some features may not work.</span>
        </>
      )}
    </div>
  );
}
