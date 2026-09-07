import { COLORS } from "../../theme";

export default function Initials({ name }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: COLORS.surfaceHover,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11.5,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
