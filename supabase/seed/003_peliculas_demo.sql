-- Seed 003 — Películas de demostración para la F4
--
-- Son inventadas a propósito: los títulos y sinopsis son originales, así que no hay
-- derechos de imagen ni de nombre que cuidar, y el póster lo dibuja la aplicación
-- cuando `poster_url` es nulo. Cuando la F9 tenga su alta de películas, estas se
-- pueden borrar o reemplazar por las reales sin tocar código.
--
-- Cubre lo que las pantallas necesitan poder mostrar:
--   · las tres restricciones de edad (0, 13, 18)
--   · películas con uno y con varios géneros (RF-02, RF-06)
--   · seis destacadas, para que la portada tenga algo más que el top (RF-07)
--   · dos con estreno futuro, que la cartelera tiene que excluir (una con preventa)
--
-- Las fechas son relativas a la fecha de carga: un estreno "dentro de 20 días" sigue
-- siendo futuro sea cuando se aplique el seed, cosa que una fecha fija no garantiza.
--
-- Idempotente: si el título ya existe no se vuelve a insertar. Se hace en UN solo
-- statement (CTE con INSERT ... RETURNING) para que la película y sus géneros nazcan
-- juntos, sin un instante en que exista una película sin género.

with datos (titulo, sinopsis, duracion, edad, dias_estreno, destacada, preventa, generos) as (
  values
    ('Noche de marquesina',
     'Una boletera de un cine de barrio esconde durante años una carta de amor entre los rollos de una película que nadie volvió a pedir. La noche que el cine cierra, la carta llega a destino.',
     112, 0, -90, true, null, array['drama', 'romance']),

    ('El faro de los que no vuelven',
     'Un guardafaros nuevo descubre que las luces del faro se encienden solas cada vez que un barco desaparece. Nadie en el pueblo quiere hablar de lo que hay abajo de la escalera.',
     104, 18, -40, true, null, array['terror']),

    ('Mar de cenizas',
     'Tras el colapso de la última estación orbital, una piloto de rescate tiene seis horas para cruzar un océano en llamas y traer de vuelta a lo único que queda de su tripulación.',
     131, 13, -25, true, null, array['accion', 'ciencia-ficcion']),

    ('Un domingo cualquiera en Boedo',
     'Tres generaciones de una misma familia se juntan a almorzar y descubren, entre el asado y la sobremesa, que cada una guardó un secreto distinto sobre la casa que están por vender.',
     96, 0, -120, false, null, array['comedia']),

    ('Tres pasos atrás',
     'Dos ex que se prometieron no volver a verse quedan atrapados en el mismo viaje de egresados de sus hijos. Cuatro días, una sola habitación disponible y demasiadas cosas por decir.',
     101, 13, -30, true, null, array['comedia', 'romance']),

    ('Pequeño Lucero',
     'Una luciérnaga que nació sin luz sale a recorrer el bosque para averiguar quién le robó el brillo, y en el camino encuentra a todos los que tampoco lo tenían.',
     88, 0, -70, true, null, array['animacion']),

    ('Sombras en el altiplano',
     'Un equipo de documentalistas sigue durante un año a los últimos arrieros de una ruta de sal a cuatro mil metros de altura, mientras el camino que recorrieron sus abuelos se vuelve ruta asfaltada.',
     92, 0, -200, false, null, array['documental']),

    ('Protocolo Ícaro',
     'Una ingeniera descubre que el sistema que ella misma diseñó para evitar accidentes aéreos lleva meses provocándolos a propósito. Tiene un vuelo para demostrarlo.',
     142, 13, -15, true, null, array['ciencia-ficcion', 'accion']),

    ('La casa del lago seco',
     'Cuando el lago se retira por la sequía aparece, intacta, la casa donde una familia desapareció hace cuarenta años. La única sobreviviente vuelve para entrar.',
     109, 18, -55, false, null, array['terror', 'drama']),

    ('Fuego cruzado en Barracas',
     'Un ex policía que juró no volver a usar el arma acepta un último trabajo: escoltar a un testigo durante una noche en la que todo el barrio parece estar de su lado, o del otro.',
     124, 18, -10, false, null, array['accion', 'drama']),

    ('Cielo de papel',
     'Una nena que dibuja en las paredes de su cuarto descubre que todo lo que traza con lápiz se vuelve real por una noche, y que lo borrado no siempre desaparece del todo.',
     94, 0, 20, false, 3500.00, array['animacion', 'comedia']),

    ('Ecos de medianoche',
     'Un radioaficionado capta una transmisión que repite, con horas de anticipación, los sucesos del pueblo. Cuando el locutor misterioso empieza a nombrarlo, la señal ya no se puede apagar.',
     116, 13, 45, false, null, array['ciencia-ficcion', 'terror'])
),
nuevas as (
  insert into public.peliculas (
    titulo, sinopsis, duracion_minutos, restriccion_edad,
    fecha_estreno, destacada, precio_preventa
  )
  select
    d.titulo,
    d.sinopsis,
    d.duracion::smallint,
    d.edad::smallint,
    current_date + d.dias_estreno,
    d.destacada,
    d.preventa::numeric
  from datos d
  where not exists (select 1 from public.peliculas p where p.titulo = d.titulo)
  returning id, titulo
)
insert into public.peliculas_generos (pelicula_id, genero_id)
select n.id, g.id
from nuevas n
join datos d on d.titulo = n.titulo
cross join lateral unnest(d.generos) as s (slug)
join public.generos g on g.slug = s.slug
on conflict do nothing;

-- Comprobación. Cada condición mira el caso que rompería una pantalla; la primera
-- exige un mínimo (no `= 0` ni un bucle que no da ni una vuelta), porque una
-- aserción que acepta la tabla vacía declara éxito sobre nada.
do $$
declare
  v_total int;
  v_sin_genero int;
  v_en_cartelera int;
  v_futuras int;
  v_edades int;
begin
  select count(*) into v_total from public.peliculas;
  if v_total < 12 then
    raise exception 'Se esperaban al menos 12 peliculas y hay %', v_total;
  end if;

  select count(*) into v_sin_genero
  from public.peliculas p
  where not exists (select 1 from public.peliculas_generos pg where pg.pelicula_id = p.id);
  if v_sin_genero > 0 then
    raise exception '% peliculas quedaron sin genero (revisar los slugs contra el seed 002)', v_sin_genero;
  end if;

  -- El top 3 de la portada necesita al menos tres películas en cartelera
  select count(*) into v_en_cartelera
  from public.peliculas
  where fecha_estreno is null or fecha_estreno <= current_date;
  if v_en_cartelera < 3 then
    raise exception 'Hacen falta 3 peliculas en cartelera para el top y hay %', v_en_cartelera;
  end if;

  select count(*) into v_futuras from public.peliculas where fecha_estreno > current_date;
  if v_futuras < 1 then
    raise exception 'Falta una pelicula con estreno futuro para probar la exclusion de la cartelera';
  end if;

  select count(distinct restriccion_edad) into v_edades from public.peliculas;
  if v_edades < 3 then
    raise exception 'Faltan restricciones de edad: hay % de las 3 (0, 13, 18)', v_edades;
  end if;

  raise notice 'Peliculas: % en total, % en cartelera, % proximas.', v_total, v_en_cartelera, v_futuras;
end;
$$;
