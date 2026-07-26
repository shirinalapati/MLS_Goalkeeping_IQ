"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MatchPoint } from "@/lib/types";

export function TimelineChart({ timeline }: { timeline: MatchPoint[] }) {
  if (!timeline.length) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Match-level timeline is unavailable for this goalkeeper.
      </p>
    );
  }

  const data = timeline.map((point, index) => ({
    index: index + 1,
    date: point.date ?? `Match ${index + 1}`,
    rolling: point.rolling_total_ga_p96,
    match: point.total_ga_p96,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Season timeline chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="#262d38" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b95a8", fontSize: 10 }}
            minTickGap={28}
            axisLine={{ stroke: "#343d4c" }}
          />
          <YAxis
            tick={{ fill: "#8b95a8", fontSize: 11 }}
            axisLine={{ stroke: "#343d4c" }}
            tickLine={false}
            label={{
              value: "G+ / 96",
              angle: -90,
              position: "insideLeft",
              fill: "#5c6678",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "#12161c",
              border: "1px solid #262d38",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="rolling"
            name="Season-to-date G+/96"
            stroke="#3dd6c6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="match"
            name="Match G+/96"
            stroke="#7aa2f7"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
