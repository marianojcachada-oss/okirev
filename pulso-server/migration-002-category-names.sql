-- Opcional. Si ya tenías actividad guardada de antes de esta entrega, esos registros usan los
-- nombres de categoría viejos ("No productiva", "Pausa"). Esto los renombra para que coincidan
-- con el catálogo nuevo (Productiva / Neutral / Improductiva / Inactivo). Si tu base es nueva o
-- no tenías datos de actividad todavía, no hace falta correr esto.

update activities set category = 'Improductiva' where category = 'No productiva';
update activities set category = 'Neutral' where category = 'Pausa';
