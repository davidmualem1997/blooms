// עיגול עם תמונת פרופיל או האות הראשונה של השם
export function Avatar({ src, name, size = 36, color }: { src?: string | null; name: string; size?: number; color?: string }) {
  const initial = name.replace(/[^א-תA-Za-z0-9]/g, "")[0] ?? "?";
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: src ? undefined : color ?? "var(--ink)", backgroundImage: src ? `url(${src})` : undefined }}
      aria-hidden="true">
      {src ? "" : initial}
    </span>
  );
}
