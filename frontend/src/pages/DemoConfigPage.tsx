import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { patchAgent } from "@/api/agents";
import type { AgentResponse } from "@/api/types";

interface DemoConfigPageProps {
  agents: AgentResponse[];
  loading: boolean;
  onRefreshAgent: (id: number) => void;
}

export function DemoConfigPage({ agents, loading, onRefreshAgent }: DemoConfigPageProps) {
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  const isDemoEnabled = (agent: AgentResponse) => agent.tags?.["loom:demo"] === "true";

  const handleToggle = async (agent: AgentResponse, enabled: boolean) => {
    setToggling((prev) => new Set(prev).add(agent.id));
    try {
      await patchAgent(agent.id, { tags: { ...agent.tags, "loom:demo": enabled ? "true" : "false" } });
      onRefreshAgent(agent.id);
      toast.success(`"${agent.name ?? agent.runtime_id}" ${enabled ? "enabled" : "disabled"} for demo`);
    } catch {
      toast.error("Failed to update demo visibility");
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(agent.id); return s; });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Demo Visibility</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Toggle which agents are visible to demo users. Only enabled agents appear when a demo user logs in.
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[55%]">Agent</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-[25%]">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-[20%]">Demo Visible</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const enabled = isDemoEnabled(agent);
                const busy = toggling.has(agent.id);
                return (
                  <tr key={agent.id} className="border-b last:border-0 bg-input-bg hover:bg-input-bg/80">
                    <td className="px-4 py-3">
                      <div className="font-medium truncate">{agent.name ?? agent.runtime_id ?? `Agent ${agent.id}`}</div>
                      {agent.description && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{agent.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{agent.deployment_status ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggle(agent, !enabled)}
                        className={[
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          enabled ? "bg-primary" : "bg-input",
                        ].join(" ")}
                        role="switch"
                        aria-checked={enabled}
                      >
                        <span
                          className={[
                            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                            enabled ? "translate-x-4" : "translate-x-0",
                          ].join(" ")}
                        />
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
        {agents.filter(isDemoEnabled).length} of {agents.length} agent{agents.length !== 1 ? "s" : ""} enabled for demo.
      </p>
    </div>
  );
}
