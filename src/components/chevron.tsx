// חץ כ-SVG: תווים כמו ‹ › מתהפכים אוטומטית בטקסט מימין לשמאל, ולכן מציירים אותו במפורש.
// "forward" = קדימה בעברית (מצביע שמאלה), "back" = אחורה (מצביע ימינה)
export function Chevron({ dir, size = 16 }: { dir: "forward" | "back"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "forward" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
