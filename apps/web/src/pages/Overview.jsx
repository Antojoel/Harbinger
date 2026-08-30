import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Boxes, AlertTriangle, ShieldCheck, Network } from "lucide-react";
import { api, fmtINR } from "@/lib/api";
import { stagger } from "@/lib/motion";
import { Panel } from "@/components/overview/Panel";
import { StatCard, StatCardSkeleton } from "@/components/overview/StatCard";
import { RiskDonut, RiskDonutSkeleton } from "@/components/overview/RiskDonut";
import { ActivityChart, ActivityChartSkeleton } from "@/components/overview/ActivityChart";
import { RecentShipments, RecentShipmentsSkeleton } from "@/components/overview/RecentShipments";
import { RejectionReasons, RejectionReasonsSkeleton } from "@/components/overview/RejectionReasons";

const RECENT_LIMIT = 5;

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [shipments, setShipments] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .stats()
      .then((d) => alive && setStats(d || {}))
      .catch(() => alive && setStats({}));
    api
      .activity(7)
      .then((d) => alive && setActivity(d?.series || []))
      .catch(() => alive && setActivity([]));
    api
      .shipments()
      .then((d) => alive && setShipments(Array.isArray(d) ? d : []))
      .catch(() => alive && setShipments([]));
    return () => {
      alive = false;
    };
  }, []);

  // Newest first — the API returns the book in creation order.
  const recent = shipments ? [...shipments].reverse().slice(0, RECENT_LIMIT) : null;

  const cards = stats
    ? [
        {
          icon: Boxes,
          tone: "blue",
          label: "Shipments Checked",
          value: stats.total_shipments ?? 0,
          sub: "across the current book",
          testid: "stat-shipments-checked",
        },
        {
          icon: AlertTriangle,
          tone: "red",
          label: "High Risk Detected",
          value: stats.at_risk ?? 0,
          sub: "hold risk ≥ 25",
          testid: "stat-high-risk",
        },
        {
          icon: ShieldCheck,
          tone: "green",
          label: "Issues Prevented",
          value: fmtINR(stats.cost_avoided_inr),
          sub: `${stats.outcomes_recorded ?? 0} outcomes recorded`,
          testid: "stat-issues-prevented",
        },
        {
          icon: Network,
          tone: "purple",
          label: "Patterns Learned",
          value: stats.patterns_learned ?? 0,
          sub: "in the immune-memory graph",
          testid: "stat-patterns-learned",
        },
      ]
    : null;

  return (
    <div className="space-y-5" data-testid="overview-page">
      <header className="cg-rise">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight">
          Overview
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Predict. Prevent. Protect.</p>
      </header>

      {/* stat row */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards
          ? cards.map((c, i) => <StatCard key={c.label} index={i} {...c} />)
          : [0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} index={i} />)}
      </section>

      {/* risk mix + recent book */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="cg-rise h-full" style={stagger(4)}>
          <Panel title="Risk Overview" hint="Current hold-risk mix">
            {stats ? <RiskDonut bands={stats.risk_bands} /> : <RiskDonutSkeleton />}
          </Panel>
        </div>

        <div className="cg-rise h-full" style={stagger(5)}>
          <Panel
            title="Recent Shipments"
            hint="Latest entries in the book"
            action={
              <Link
                to="/shipments"
                data-testid="overview-view-all-shipments"
                className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-primary transition-opacity duration-fast hover:opacity-80"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {recent ? <RecentShipments shipments={recent} /> : <RecentShipmentsSkeleton />}
          </Panel>
        </div>
      </section>

      {/* activity + reasons */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="cg-rise h-full" style={stagger(6)}>
          <Panel title="Engine Activity" hint="Last 7 days">
            {activity ? <ActivityChart series={activity} /> : <ActivityChartSkeleton />}
          </Panel>
        </div>

        <div className="cg-rise h-full" style={stagger(7)}>
          <Panel title="Top Rejection Reasons" hint="Across the current book">
            {stats ? <RejectionReasons reasons={stats.top_reasons} /> : <RejectionReasonsSkeleton />}
          </Panel>
        </div>
      </section>
    </div>
  );
}
