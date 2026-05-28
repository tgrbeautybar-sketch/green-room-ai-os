export function Avatar({ initials, hueDeg, size = 32 }: { initials: string; hueDeg: number; size?: number }) {
  const bg = `linear-gradient(135deg, hsl(${hueDeg} 35% 78%) 0%, hsl(${(hueDeg + 30) % 360} 30% 62%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-moss-800 ring-1 ring-white/60"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
