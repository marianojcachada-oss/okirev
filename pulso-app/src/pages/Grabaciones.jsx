import { COLORS } from "../theme";
import { Card } from "../components/ui";

export default function Grabaciones() {
  return (
    <Card>
      <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>
        El visor de grabaciones todavía se está construyendo — esta pantalla va a mostrar las grabaciones de pantalla
        por empleado y turno en la próxima entrega.
      </p>
    </Card>
  );
}
