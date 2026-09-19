-- Corré esto UNA VEZ en el SQL Editor de Supabase para limpiar el Catálogo de apps de las
-- entradas viejas (de antes de que se simplificara cómo se arman los nombres de app — esas
-- que se ven como "opera — Central de despacho - TaxiCaller - Opera").
--
-- Solo borra las filas del CATÁLOGO (la lista para clasificar Productiva/Neutral/Improductiva).
-- NO toca la tabla de actividad — el historial real de horas trabajadas en esos días queda
-- intacto, solo dejan de aparecer como algo "sin clasificar" en esta pantalla.
--
-- El patrón que las distingue: las entradas viejas usan una raya larga "—" como separador
-- (ej. "opera — algo"), mientras que el formato actual usa un guion normal "-"
-- (ej. "Opera - Microsoft Teams - https://..."). Como el tracker ya no genera nunca más
-- entradas con "—", este filtro no puede llevarse nada del formato nuevo por accidente.

-- Antes de borrar, mirá cuántas y cuáles se van a ir (opcional, para confirmar):
select app_label, category from app_catalog where app_label like '%—%';

-- El borrado en sí:
delete from app_catalog where app_label like '%—%';
