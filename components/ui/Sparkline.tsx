export function Sparkline({
  data,
  width = 240,
  height = 56,
  stroke = "#1f3d2e",
  fill = "rgba(31,61,46,0.10)",
}: { data: number[]; width?: number; height?: number; stroke?: string; fill?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={stroke} />
    </svg>
  );
}

export function BarRow({ value, max, color = "var(--color-moss-500)" }: { value: number; max: number; color?: string }) {
  const w = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-moss-100/50">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}
