-- Corré esto en el SQL Editor de Supabase. Extiende cuánto dura una sesión nueva antes de
-- vencer (de 30 a 180 días) — necesario porque ahora la sesión de cada operador también
-- autentica el check-in/check-out/actividad del tracker (antes era un token de dispositivo
-- aparte que no vencía nunca), y el tracker se queda logueado por meses sin volver a pedir
-- contraseña.

alter table sessions alter column expires_at set default (now() + interval '180 days');
