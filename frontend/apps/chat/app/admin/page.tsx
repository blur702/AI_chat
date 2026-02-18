"use client";

import { useRouter } from "next/navigation";
import { useAuth, useAdmin } from "@workstation/api/hooks";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@workstation/ui";
import { RefreshControl } from "@/components/admin/refresh-control";
import { QuickStats } from "@/components/admin/quick-stats";
import { SystemMetrics } from "@/components/admin/system-metrics";
import { ServiceHealth } from "@/components/admin/service-health";
import { UserManagement } from "@/components/admin/user-management";
import { AuditLogs } from "@/components/admin/audit-logs";
import { EventStats } from "@/components/admin/event-stats";
import { HelpTopicManagement } from "@/components/admin/help-topic-management";
import { ImageModelManagement } from "@/components/admin/image-model-management";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { role } = useAuth();

  const {
    metrics,
    debugInfo,
    loading,
    error,
    refreshMetrics,
    refreshDebugInfo,
    getServiceDebug,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshInterval,
    setAutoRefreshInterval,
    lastUpdated,
  } = useAdmin();

  // Block non-admin users
  if (role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="space-y-3 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-sm font-semibold">Access Denied</h2>
          <p className="max-w-sm text-xs text-muted-foreground">
            You do not have permission to view the admin dashboard. Contact an administrator for
            access.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const handleRefresh = () => {
    refreshMetrics();
    refreshDebugInfo();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">Admin Dashboard</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Kernel metrics, service health, user management, and system diagnostics.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <Tabs defaultValue="system">
            <TabsList>
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="audit-logs">Audit Logs</TabsTrigger>
              <TabsTrigger value="help-topics">Help Topics</TabsTrigger>
              <TabsTrigger value="image-models">Image Models</TabsTrigger>
            </TabsList>

            <TabsContent value="system" className="mt-4 space-y-6">
              <RefreshControl
                onRefresh={handleRefresh}
                loading={loading}
                lastUpdated={lastUpdated}
                autoRefreshEnabled={autoRefreshEnabled}
                onAutoRefreshChange={setAutoRefreshEnabled}
                autoRefreshInterval={autoRefreshInterval}
                onIntervalChange={setAutoRefreshInterval}
              />

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <QuickStats metrics={metrics} />
              <EventStats />
              <SystemMetrics metrics={metrics} />
              <ServiceHealth debugInfo={debugInfo} getServiceDebug={getServiceDebug} />
            </TabsContent>

            <TabsContent value="users" className="mt-4">
              <UserManagement />
            </TabsContent>

            <TabsContent value="audit-logs" className="mt-4">
              <AuditLogs />
            </TabsContent>

            <TabsContent value="help-topics" className="mt-4">
              <HelpTopicManagement />
            </TabsContent>

            <TabsContent value="image-models" className="mt-4">
              <ImageModelManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
