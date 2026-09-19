-- Seed 002 — Configuración mínima que las fases siguientes necesitan encontrar cargada.

-- RF-02 / RF-06: géneros para el filtro del buscador.
insert into public.generos (nombre, slug) values
  ('Acción', 'accion'),
  ('Comedia', 'comedia'),
  ('Drama', 'drama'),
  ('Terror', 'terror'),
  ('Ciencia ficción', 'ciencia-ficcion'),
  ('Animación', 'animacion'),
  ('Documental', 'documental'),
  ('Romance', 'romance')
on conflict (nombre) do nothing;

-- RF-33: categorías del candy bar.
insert into public.categorias_productos (nombre, orden) values
  ('Pochoclos', 1),
  ('Bebidas', 2),
  ('Golosinas', 3),
  ('Helados', 4)
on conflict (nombre) do nothing;

-- RF-39 / RF-43 / RN-08: cupón de bienvenida, 20 % como valor inicial y
-- configurable por el administrador.
insert into public.cupones (codigo, tipo, tipo_descuento, valor)
values ('BIENVENIDA', 'bienvenida', 'porcentaje', 20)
on conflict (codigo) do nothing;

-- RF-44 / RN-09: el cupón segmentado por edad que pide el pliego.
insert into public.cupones (codigo, tipo, tipo_descuento, valor, edad_minima)
values ('PLATINO50', 'por_edad', 'porcentaje', 25, 50)
on conflict (codigo) do nothing;

-- RF-46 / RF-47: una recompensa inicial para que el canje por puntos tenga contra
-- qué probarse en F7. El costo lo ajusta el administrador.
insert into public.recompensas (nombre, tipo, costo_puntos)
select 'Entrada gratis', 'entrada', 5000
where not exists (select 1 from public.recompensas where nombre = 'Entrada gratis');
