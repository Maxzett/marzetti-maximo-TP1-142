-- Seed 001 — Salas y sus 532 ubicaciones (RF-12 a RF-15, D-01)
--
-- Requiere la migración 0019: la distribución de butacas vive en
-- public.generar_butacas_sala(), la misma función que usa crear_sala() cuando el
-- administrador da de alta una sala desde la app. Así el seed y la app no pueden
-- generar mapas distintos (RF-12: todas las salas comparten la misma distribución).
--
-- Cuatro salas. Tienen que ser varias porque la asignación es automática (RF-21) y
-- porque D-05 solo se puede demostrar si la grilla se llega a agotar.

insert into public.salas (nombre)
values ('Sala 1'), ('Sala 2'), ('Sala 3'), ('Sala 4')
on conflict (nombre) do nothing;

-- 20 filas × 3 columnas con dos distribuciones distintas: 532 ubicaciones por sala,
-- 2128 filas entre las cuatro. La función es idempotente y verifica su propio
-- resultado (420 estándar + 28 silla de ruedas + 84 VIP).
select public.generar_butacas_sala(s.id)
from public.salas s;

-- Aserción del seed, independiente de la de la función. Cuenta las salas BIEN
-- sembradas y las compara contra el total de salas. Recorrer las butacas con un bucle
-- no alcanzaba: si no se hubiera insertado ninguna, el bucle no daría ni una vuelta y
-- el seed diría que salió todo bien sobre una tabla vacía. Una aserción que no
-- detecta el caso de cero no es una aserción.
do $$
declare
  v_salas integer;
  v_correctas integer;
begin
  select count(*) into v_salas from public.salas;

  if v_salas = 0 then
    raise exception 'No hay salas cargadas: el seed no insertó nada.';
  end if;

  select count(*) into v_correctas
  from (
    select sala_id
    from public.butacas
    group by sala_id
    having count(*) = 532
       and count(*) filter (where tipo = 'estandar') = 420
       and count(*) filter (where tipo = 'silla_ruedas') = 28
       and count(*) filter (where tipo = 'vip') = 84
  ) as bien;

  if v_correctas <> v_salas then
    raise exception 'Solo % de % salas quedaron bien sembradas', v_correctas, v_salas;
  end if;

  raise notice 'Butacas sembradas: % salas x 532 ubicaciones (420 estandar, 28 silla de ruedas, 84 VIP).', v_salas;
end;
$$;
