-- Seed 005 — Candy bar, combos, cupones y recompensas de demostración
-- (RF-33, RF-36, RF-39, RF-43, RF-44, RF-47)
--
-- Idempotente: se puede volver a correr sin duplicar nada. Requiere 0022.
-- Hasta que la F9 construya el panel, esto es lo que "configura el administrador":
-- los precios, el porcentaje de bienvenida y el costo en puntos se editan con UPDATE
-- sobre estas tablas desde el editor SQL.

insert into public.categorias_productos (nombre, orden) values
  ('Pochoclos', 1),
  ('Bebidas', 2),
  ('Golosinas', 3),
  ('Salados', 4)
on conflict (nombre) do nothing;

insert into public.productos (categoria_id, nombre, descripcion, precio)
select c.id, v.nombre, v.descripcion, v.precio
from (values
  ('Pochoclos', 'Pochoclo chico',   'Salado o dulce, balde chico',     3500),
  ('Pochoclos', 'Pochoclo mediano', 'Salado o dulce, balde mediano',   5000),
  ('Pochoclos', 'Pochoclo grande',  'Salado o dulce, balde grande',    6500),
  ('Bebidas',   'Gaseosa 500 ml',   'Cola, lima-limón o naranja',      2800),
  ('Bebidas',   'Gaseosa 1 litro',  'Cola, lima-limón o naranja',      4200),
  ('Bebidas',   'Agua mineral',     'Sin gas, 500 ml',                 2000),
  ('Golosinas', 'Alfajor triple',   'Chocolate negro',                 1800),
  ('Golosinas', 'Chocolate',        'Tableta de leche, 90 g',          2500),
  ('Salados',   'Nachos con cheddar','Porción para compartir',         5200),
  ('Salados',   'Hot dog',          'Con salchicha alemana',           4500)
) as v(categoria, nombre, descripcion, precio)
join public.categorias_productos c on c.nombre = v.categoria
where not exists (
  select 1 from public.productos p where p.nombre = v.nombre and p.categoria_id = c.id
);

-- RF-36: precio fijo, que no es la suma de las partes.
insert into public.combos (nombre, descripcion, precio, destacado)
select v.nombre, v.descripcion, v.precio, true
from (values
  ('Combo Entrada + Pochoclo + Gaseosa', 'Tu entrada, un pochoclo mediano y una gaseosa de 500 ml', 9800),
  ('Combo Pareja',                       'Dos entradas, un pochoclo grande y dos gaseosas de 500 ml', 17500),
  ('Combo Candy',                        'Un pochoclo mediano y una gaseosa de 500 ml, sin entrada',  6900)
) as v(nombre, descripcion, precio)
where not exists (select 1 from public.combos c where c.nombre = v.nombre);

insert into public.combo_items (combo_id, producto_id, incluye_entrada, cantidad)
select c.id, null, true, v.cantidad
from (values
  ('Combo Entrada + Pochoclo + Gaseosa', 1),
  ('Combo Pareja', 2)
) as v(combo, cantidad)
join public.combos c on c.nombre = v.combo
where not exists (
  select 1 from public.combo_items ci where ci.combo_id = c.id and ci.incluye_entrada
);

insert into public.combo_items (combo_id, producto_id, incluye_entrada, cantidad)
select c.id, p.id, false, v.cantidad
from (values
  ('Combo Entrada + Pochoclo + Gaseosa', 'Pochoclo mediano', 1),
  ('Combo Entrada + Pochoclo + Gaseosa', 'Gaseosa 500 ml',   1),
  ('Combo Pareja',                       'Pochoclo grande',  1),
  ('Combo Pareja',                       'Gaseosa 500 ml',   2),
  ('Combo Candy',                        'Pochoclo mediano', 1),
  ('Combo Candy',                        'Gaseosa 500 ml',   1)
) as v(combo, producto, cantidad)
join public.combos c on c.nombre = v.combo
join public.productos p on p.nombre = v.producto
where not exists (
  select 1 from public.combo_items ci where ci.combo_id = c.id and ci.producto_id = p.id
);

-- Los cupones BIENVENIDA (RF-39, RF-43, 20 % inicial) y PLATINO50 (RF-44, mayores de 50)
-- ya los siembra el seed 002. Se editan con UPDATE cupones SET valor = ... WHERE codigo = ...

-- RF-46, RF-47: cuántos puntos cuesta cada recompensa. Con 1 punto por peso (RF-45), el costo
-- fija cuánto le devuelve el cine al cliente: se dimensiona para devolver cerca del 10 % de lo
-- gastado (entrada de $6.500 → 65.000 puntos). El 500 del ejemplo del pliego devolvería más de
-- 1000 %, y el cine perdería plata en cada canje. Es configuración (RF-47), no una regla fija.
--
-- Las tres corrigen los valores de versiones anteriores de este seed (y el 5000 del seed 002)
-- sin pisar un costo que el administrador ya hubiera cambiado a mano.
update public.recompensas set costo_puntos = 65000
 where nombre = 'Entrada gratis' and costo_puntos in (500, 5000);
update public.recompensas set costo_puntos = 65000
 where nombre = 'Pochoclo grande gratis' and costo_puntos = 150;
update public.recompensas set costo_puntos = 28000
 where nombre = 'Gaseosa 500 ml gratis' and costo_puntos = 80;

insert into public.recompensas (nombre, tipo, producto_id, costo_puntos)
select v.nombre, v.tipo::public.tipo_recompensa, p.id, v.costo
from (values
  ('Entrada gratis',          'entrada',  null,              65000),
  ('Pochoclo grande gratis',  'producto', 'Pochoclo grande', 65000),
  ('Gaseosa 500 ml gratis',   'producto', 'Gaseosa 500 ml',  28000)
) as v(nombre, tipo, producto, costo)
left join public.productos p on p.nombre = v.producto
where not exists (select 1 from public.recompensas r where r.nombre = v.nombre);

do $$
begin
  if (select count(*) from public.productos) < 10 or (select count(*) from public.combos) < 3
     or (select count(*) from public.recompensas) < 3 or (select count(*) from public.cupones) < 2 then
    raise exception 'Seed 005: faltan filas del candy o de las promociones';
  end if;
end;
$$;
