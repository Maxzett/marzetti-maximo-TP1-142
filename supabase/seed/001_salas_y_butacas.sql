-- Seed 001 — Salas y sus 532 ubicaciones (RF-12 a RF-15, D-01)
--
-- Cuatro salas. Tienen que ser varias porque la asignación es automática (RF-21) y
-- porque D-05 solo se puede demostrar si la grilla se llega a agotar.

insert into public.salas (nombre)
values ('Sala 1'), ('Sala 2'), ('Sala 3'), ('Sala 4')
on conflict (nombre) do nothing;

-- Las 532 ubicaciones salen generadas, no escritas a mano: 20 filas × 3 columnas
-- con dos distribuciones distintas son 2128 filas entre las cuatro salas.
--
--   A–I y L–Q  estándar      4 + 20 + 4 = 28   × 15 filas = 420
--   J y K      silla_ruedas  2 + 10 + 2 = 14   ×  2 filas =  28   (D-01)
--   R, S, T    vip           4 + 20 + 4 = 28   ×  3 filas =  84   (RF-15)
--                                                          ─────
--                                                            532
with filas as (
  select
    chr(64 + i) as fila,  -- 1 → 'A', 20 → 'T'
    case
      when i in (10, 11) then 'silla_ruedas'::public.tipo_ubicacion  -- J y K
      when i >= 18       then 'vip'::public.tipo_ubicacion           -- R, S, T
      else                    'estandar'::public.tipo_ubicacion
    end as tipo,
    case when i in (10, 11) then array[2, 10, 2] else array[4, 20, 4] end as bloques
  from generate_series(1, 20) as i
),
ubicaciones as (
  select
    f.fila,
    f.tipo,
    c.columna,
    c.cantidad,
    -- Cuántas butacas quedaron a la izquierda: la numeración es corrida dentro de
    -- la fila, así que la columna 2 no arranca en 1 sino después del primer bloque.
    sum(c.cantidad) over (
      partition by f.fila order by c.columna
      rows between unbounded preceding and 1 preceding
    ) as previas
  from filas f
  cross join lateral unnest(f.bloques) with ordinality as c(cantidad, columna)
)
insert into public.butacas (sala_id, fila, columna, numero, tipo)
select
  s.id,
  u.fila,
  u.columna::smallint,
  (coalesce(u.previas, 0) + n.i)::smallint,
  u.tipo
from public.salas s
cross join ubicaciones u
cross join lateral generate_series(1, u.cantidad) as n(i)
on conflict (sala_id, fila, numero) do nothing;

-- Aserción. Si la composición no da exactamente 532 = 420 + 28 + 84, el seed falla
-- acá y no en la demo, con el mapa de butacas ya dibujado y una fila de menos.
--
-- Cuenta las salas BIEN sembradas y las compara contra el total de salas. Recorrer
-- las butacas con un bucle no alcanzaba: si no se hubiera insertado ninguna, el
-- bucle no daría ni una vuelta y el seed diría que salió todo bien sobre una tabla
-- vacía. Una aserción que no detecta el caso de cero no es una aserción.
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
