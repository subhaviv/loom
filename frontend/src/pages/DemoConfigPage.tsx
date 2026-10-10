import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import type { AgentResponse } from "@/api/types";

const STORAGE_KEY = (username: string) => `calanthir:demo-visibility:${username}`;

export function loadDemoVisibility(username: string): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(username));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveDemoVisibility(username: string, enabled: Set<number>) {
  localStorage.setItem(STORAGE_KEY(username), JSON.stringify([...enabled]));
}

interface DemoConfigPageProps {
  agents: AgentResponse[];
  loading: boolean;
  onVisibilityChange?: (enabled: Set<number>) => void;
}

export function DemoConfigPage({ agents, loading, onVisibilityChange }: DemoConfigPageProps) {
  const { user } = useAuth();
  const username = user?.username ?? user?.sub ?? "anonymous";

  const [enabled, setEnabled] = useState<Set<number>>(() => loadDemoVisibility(username));

  // Re-load if user changes
  useEffect(() => {
    const ids = loadDemoVisibility(username);
    setEnabled(ids);
    onVisibilityChange?.(ids);
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDemoVisibility(username, next);
      onVisibilityChange?.(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Demo Visibility</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which agents appear in your view. Preferences are saved locally in this browser.
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No agents registered.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-card border-b">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[40%]">Agent</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[40%]">Description</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[12%]">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-[8%]">Show</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const on = enabled.has(agent.id);
                return (
                  <tr key={agent.id} className="border-b last:border-0 bg-input-bg hover:bg-input-bg/80">
                    <td className="px-4 py-3 font-medium truncate">{agent.name ?? agent.runtime_id ?? `Agent ${agent.id}`}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate">{agent.description ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{agent.deployment_status ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(agent.id)}
                        className={[
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          on ? "bg-primary" : "bg-muted-foreground/30",
                        ].join(" ")}
                        role="switch"
                        aria-checked={on}
                      >
                        <span className={[
                          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                          on ? "translate-x-4" : "translate-x-0",
                        ].join(" ")} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {enabled.size} of {agents.length} agent{agents.length !== 1 ? "s" : ""} shown.
      </p>
    </div>
  );
}
