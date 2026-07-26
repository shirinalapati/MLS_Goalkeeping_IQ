"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { COMPONENT_LABELS, COMPONENT_ORDER, type ComponentKey, type SeasonPlayer } from "@/lib/types";

const COLORS = ["#3dd6c6", "#7aa2f7", "#e6b450", "#f07178"];

export function ComponentRadar({
  players,
  mode = "percentile",
}: {
  players: SeasonPlayer[];
  mode?: "percentile" | "adjusted";
}) {
  const data = COMPONENT_ORDER.map((key) => {
    const point: Record<string, string | number | null> = {
      component: COMPONENT_LABELS[key as ComponentKey],
    };
    for (const player of players) {
      const stats = player.components[key];
      point[player.slug] =
        mode === "percentile" ? stats?.percentile ?? null : stats?.adjusted_p96 ?? null;
    }
    return point;
  });

  return (
    <div className="h-72 w-full" role="img" aria-label="Component radar chart">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#343d4c" />
          <PolarAngleAxis dataKey="component" tick={{ fill: "#8b95a8", fontSize: 11 }} />
          <PolarRadiusAxis
            angle={30}
            domain={mode === "percentile" ? [0, 100] : ["auto", "auto"]}
            tick={{ fill: "#5c6678", fontSize: 10 }}
          />
          {players.map((player, index) => (
            <Radar
              key={player.slug}
              name={player.name}
              dataKey={player.slug}
              stroke={COLORS[index % COLORS.length]}
              fill={COLORS[index % COLORS.length]}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ))}
          <Tooltip
            contentStyle={{
              background: "#12161c",
              border: "1px solid #262d38",
              borderRadius: 8,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
