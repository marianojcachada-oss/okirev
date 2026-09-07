import { COLORS } from "../../theme";

export function Th({ children, align = "left" }) {
  return (
    <th
      style={{
        textAlign: align,
        fontWeight: 500,
        fontSize: 12.5,
        color: COLORS.textTertiary,
        padding: "0 14px 10px",
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", mono = false, ...rest }) {
  return (
    <td
      className={mono ? "pulso-mono" : ""}
      style={{ textAlign: align, fontSize: 13, padding: "12px 14px", borderBottom: `1px solid ${COLORS.border}` }}
      {...rest}
    >
      {children}
    </td>
  );
}
