import { useMemo, useState } from "react";
import { useApi } from "../hooks/useApi";
import { StateMessage } from "../components/ui";
import LiveGrid, { LiveFilterChips } from "../components/LiveGrid";
import { realtimeGroupFor } from "../theme";

export default function TiempoReal() {
  const [filter, setFilter] = useState("todos");
  const { data: employees, loading, error, refetch } = useApi("/employees");

  const filtered = useMemo(() => {
    if (!employees) return [];
    if (filter === "todos") return employees;
    return employees.filter((e) => realtimeGroupFor(e.status).id === filter);
  }, [employees, filter]);

  if (loading || error) return <StateMessage loading={loading} error={error} onRetry={refetch} />;

  return (
    <div>
      <LiveFilterChips value={filter} onChange={setFilter} />
      <LiveGrid employees={filtered} />
    </div>
  );
}
