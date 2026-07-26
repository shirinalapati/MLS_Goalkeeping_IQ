"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { COMPONENT_LABELS, COMPONENT_ORDER, type ComponentKey, type SeasonPlayer } from "@/lib/types";

export function ComponentBars({ player }: { player: SeasonPlayer }) {
  const data = COMPONENT_ORDER.map((key) => {
    const value = player.components[key]?.adjusted_p96 ?? 0;
    return {
      component: COMPONENT_LABELS[key as ComponentKey],
      value,
    };
  });

  return (
    <div className="h-72 w-full" role="img" aria-label="Component contribution bar chart">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
          <CartesianGrid stroke="#262d38" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#8b95a8", fontSize: 11 }}
            axisLine={{ stroke: "#343d4c" }}
            tickLine={false}
            label={{
              value: "Adjusted G+ / 96",
              position: "insideBottom",
              offset: -2,
              fill: "#5c6678",
              fontSize: 11,
            }}
          />
          <YAxis
            type="category"
            dataKey="component"
            width={110}
            tick={{ fill: "#c5cddb", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [
              typeof value === "number" ? value.toFixed(3) : String(value),
              "Adjusted G+/96",
            ]}
            contentStyle={{
              background: "#12161c",
              border: "1px solid #262d38",
              borderRadius: 8,
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.component}
                fill={entry.value >= 0 ? "#3dd6c6" : "#f07178"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
