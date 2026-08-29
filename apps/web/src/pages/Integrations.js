import React from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plug, Terminal, Copy } from "lucide-react";
import { toast } from "sonner";

export default function Integrations() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => { api.integrations().then(setData); }, []);
  const base = api ? "" : "";

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ClearanceGuard is a pluggable engine — connect any software over REST or MCP. The logistics
          vertical you see here is the proof, not the whole product.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-heading font-medium">
            <Terminal className="h-4 w-4 text-primary" /> REST API
          </div>
          <div className="space-y-2">
            {data?.rest_endpoints?.map((e) => (
              <div key={e.path} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{e.method}</span>{" "}
                    {e.path}
                  </div>
                  <button onClick={() => copy(`${e.method} ${e.path}`)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{e.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-heading font-medium">
            <Plug className="h-4 w-4 text-primary" /> MCP Server tools
          </div>
          <div className="space-y-2">
            {data?.mcp_tools?.map((t) => (
              <div key={t.name} className="rounded-lg border bg-muted/30 p-3">
                <div className="font-mono text-xs text-foreground">{t.name}()</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{data?.note}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-2 font-heading font-medium">Example: check a shipment's risk</div>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`curl -X POST $BASE/api/simulate \\
  -H "Content-Type: application/json" \\
  -d '{"shipment_id": "shp-0042"}'`}
        </pre>
      </Card>
    </div>
  );
}
