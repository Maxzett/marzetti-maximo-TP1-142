# Documento de Requerimientos — Sistema de Gestión y Venta de Entradas

**Trabajo Práctico N.º 1 — Programación IV — UTN — 2026 C2**

| | |
|---|---|
| **Cliente** | Establecimiento de cine (edificio único, múltiples salas) |
| **Fuente** | Intercambio de 10 emails con el cliente (01/01/2020 – 10/03/2020) |
| **Fecha de entrega** | 1 de octubre de 2026 |
| **Versión del documento** | 1.1 — 07/09/2026 |

---

## 1. Propósito y alcance

Este documento consolida la totalidad de los requerimientos surgidos del intercambio de emails con el cliente y los convierte en especificaciones verificables. Cubre:

- Los **requerimientos funcionales** (RF), agrupados por módulo y trazados al email que los originó.
- Las **reglas de negocio** (RN): las invariantes duras del dominio, que son lo que el sistema debe garantizar aunque el usuario intente lo contrario.
- Los **requerimientos no funcionales** (RNF) impuestos por la consigna de la cátedra.
- Las **decisiones de interpretación y desvíos** (D): puntos donde el pliego es ambiguo, contradictorio o simplemente omite información, con la resolución adoptada y su fundamento.
- Lo que queda **fuera de alcance** (FA) y por qué.

El sistema es una aplicación web única que sirve a tres audiencias: clientes que compran entradas, empleados que las validan en el acceso, y administración que gobierna la programación y el negocio.

### 1.1 Fuera del alcance de este documento

El diseño de la interfaz, el esquema físico de base de datos y las decisiones de implementación se documentan en el `README.md` del repositorio. Acá se especifica **qué** debe hacer el sistema, no **cómo**.

---

## 2. Actores

| Actor | Descripción | Autenticación |
|---|---|---|
| **Visitante anónimo** | Navega la cartelera y compra entradas sin registrarse. | No |
| **Cliente registrado** | Compra con beneficios: cupones, puntos, crédito, reseñas, historial. | Sí |
| **Empleado** | Valida entradas y entregas de candy escaneando QR o ingresando el código a mano. | Sí |
| **Administrador** | Gobierna películas, funciones, salas, precios, productos, promociones y reportes. | Sí |

> El pliego habilita explícitamente la compra anónima: *"pueden comprar siendo anónimos, siempre que paguen no hay problema"* (email 01/01). Esto condiciona el diseño de todo el flujo de compra, que no puede asumir sesión iniciada.

---

## 3. Fuentes — trazabilidad de emails

| ID | Fecha | Contenido aportado |
|---|---|---|
| **E1** | 01/01/2020 | Alcance inicial: salas, funciones, entradas con PDF y QR, datos de película, regla de 30 minutos, registro de usuarios, cupón de bienvenida, compra anónima |
| **E2** | 16/01/2020 | Reseñas con estrellas y comentario, promedio por película, top 3 más vendidas en home, buscador |
| **E3** | 16/01/2020 | El buscador debe filtrar por género; una película puede tener varios géneros |
| **E4** | 30/01/2020 | Cupón de bienvenida configurable, cupones segmentados por edad (+50), candy bar con categorías, retiro con el mismo QR, mapa del cine (sin aprobar) |
| **E5** | 06/02/2020 | Rol administrador, rol empleado, validación por QR y por código manual, invalidación tras el uso, asignación automática de sala, no solapamiento |
| **E6** | 12/02/2020 | Restricción de edad (13/18), aviso de adulto acompañante, rediseño de salas con filas J y K, mapa de butacas en tiempo real |
| **E7** | 28/02/2020 | Usabilidad para clientes y empleados, selector de fecha y hora sin scroll excesivo, reporte de facturación diaria |
| **E8** | 03/03/2020 | Programa de fidelización por puntos, canjes configurables, historial, combos a precio fijo |
| **E9** | 08/03/2020 | Sección Próximamente, alertas de disponibilidad, preventa con precio especial, sección Mis Películas |
| **E10** | 10/03/2020 | Cancelación con crédito en cuenta, butacas VIP, exportación de reportes, gráficos, log de actividad |

---

## 4. Requerimientos funcionales

### 4.1 Catálogo de películas

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-01** | Cada película registra nombre, sinopsis, imagen (póster) y duración en minutos. | E1 |
| **RF-02** | Una película puede tener **varios géneros** asociados. | E3 |
| **RF-03** | Cada película tiene una restricción de edad: **sin restricción**, **13 años** o **18 años**. | E6 |
| **RF-04** | La página principal muestra **primero las 3 películas más vendidas**. | E2 |
| **RF-05** | El listado de películas incluye un buscador por texto sobre el nombre. | E2 |
| **RF-06** | El buscador permite **filtrar por género**, de forma combinable con la búsqueda por texto. | E3 |
| **RF-07** | El administrador decide **qué películas aparecen** en la página principal. | E1 |
| **RF-08** | Existe una sección **Próximamente** con las películas que se estrenan en las próximas semanas. | E9 |

### 4.2 Reseñas y calificaciones

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-09** | Un usuario puede calificar una película con **estrellas** y dejar un **comentario corto**. | E2 |
| **RF-10** | Las reseñas son visibles **antes** de iniciar la compra de entradas. | E2 |
| **RF-11** | Cada película muestra su **puntuación promedio**. | E2 |

### 4.3 Salas y butacas

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-12** | Todas las salas comparten la misma distribución: **20 filas (A–T)** y **3 columnas**. | E1, E6 |
| **RF-13** | Las filas estándar tienen **4 + 20 + 4 = 28 butacas**. | E1 |
| **RF-14** | Las filas **J y K** son espacios para **personas con movilidad reducida (silla de ruedas)**, con **2 + 10 + 2 = 14 espacios** cada una. | E6, D-01 |
| **RF-15** | Las filas **R, S y T** son **butacas VIP**, con precio superior. | E10 |
| **RF-16** | Los tres tipos de ubicación se **diferencian visualmente** en el mapa de butacas, y no solo por color. | E6, E10 |
| **RF-17** | El usuario debe saber **de forma inequívoca que está comprando una butaca VIP antes de pagar**. | E10 |
| **RF-18** | El administrador gestiona las salas y la distribución de butacas. | E5 |

**Composición resultante de cada sala:**

| Tipo | Filas | Cantidad | Por fila | Total |
|---|---|---|---|---|
| Estándar | A–I, L–Q | 15 | 28 | 420 |
| Silla de ruedas | J, K | 2 | 14 | 28 |
| VIP | R, S, T | 3 | 28 | 84 |
| | | **20** | | **532** |

### 4.4 Funciones y programación

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-19** | Cada función tiene película, sala, fecha, hora, **formato (2D, 3D, 4D, 5D)** e **idioma (castellano o subtitulada)**. | E1 |
| **RF-20** | El administrador programa una función indicando **días y horario** (por ejemplo, lunes, martes y viernes a las 18:00). | E5 |
| **RF-21** | El sistema **asigna la sala automáticamente**, eligiendo una que esté libre en ese horario. El administrador no elige la sala. | E5 |
| **RF-22** | Si no hay ninguna sala disponible para el horario pedido, el sistema lo informa y no crea la función. | E5, D-05 |
| **RF-23** | El administrador gestiona el alta, modificación y baja de funciones. | E5 |

### 4.5 Compra de entradas

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-24** | El usuario selecciona butacas sobre un **mapa visual** de la sala. | E1, E6 |
| **RF-25** | El mapa refleja **en tiempo real** las butacas que otro usuario está ocupando en ese mismo momento. | E6 |
| **RF-26** | La compra puede completarse **de forma anónima**, sin registro. | E1 |
| **RF-27** | Al confirmar la compra se genera un **PDF con los datos de la entrada y un código QR**. | E1 |
| **RF-28** | Un usuario menor de 18 o de 13 años **no puede comprar** entradas para películas con esa restricción. | E6 |
| **RF-29** | Toda entrada de una película con restricción de edad **debe indicar que el espectador debe ir acompañado por un adulto**. | E6 |
| **RF-30** | El usuario puede **cancelar** una compra hasta **2 horas antes** de la función. | E10 |
| **RF-31** | La cancelación **no devuelve dinero**: acredita **crédito en la cuenta** del usuario. | E10 |
| **RF-32** | El crédito es visible en el perfil y puede usarse **combinado con otros medios de pago**. | E10 |

### 4.6 Candy bar

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-33** | El administrador crea productos del candy bar y los organiza en **categorías**. | E4 |
| **RF-34** | Los productos se compran **junto con la entrada**, en la misma operación. | E4 |
| **RF-35** | El retiro de los productos se realiza con **el mismo QR** de la entrada. | E4 |
| **RF-36** | El administrador crea **combos** (entrada + pochoclos + bebida) a un **precio fijo configurable**. | E8 |
| **RF-37** | Los combos aparecen **destacados** en la página de compra. | E8 |

### 4.7 Usuarios y cuenta

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-38** | El registro solicita **email, nombre, apellido, fecha de nacimiento, tipo de sangre, color de ojos y cantidad de días de vacaciones por año**. | E1, D-04 |
| **RF-38.1** | Los datos personales sensibles del perfil son **visibles únicamente para su propio titular**. Ningún otro rol, incluido el administrador, accede a ellos. | D-04 |
| **RF-39** | El usuario registrado recibe un **cupón de descuento para su primera compra**. | E1 |
| **RF-40** | El perfil muestra el saldo de **puntos**, el **historial de canjes** y el **crédito** disponible. | E8, E10 |
| **RF-41** | Existe una sección **Mis Películas** con el historial visual de lo que el usuario vio: póster, fecha y su propia calificación. | E9 |
| **RF-42** | El usuario puede activar una **alerta** para ser notificado cuando las entradas de una película de Próximamente salgan a la venta. | E9 |

**Detalle de los campos de registro (RF-38):**

| Campo | Tipo | Validación | Uso funcional |
|---|---|---|---|
| Email | Texto | Formato válido, único | Identificación y notificaciones |
| Nombre | Texto | Requerido | Identificación |
| Apellido | Texto | Requerido | Identificación |
| Fecha de nacimiento | Fecha | Requerida, no futura | **Restricción de edad (RN-04) y cupones por edad (RN-09)** |
| Tipo de sangre | Enumerado | A+, A−, B+, B−, AB+, AB−, O+, O− | Ninguno — solicitado por el cliente |
| Color de ojos | Enumerado | Marrones, verdes, azules,  | Ninguno — solicitado por el cliente |
| Días de vacaciones por año | Entero | 0 a 365 | Ninguno — solicitado por el cliente |

Los tres últimos campos se almacenan pero no participan de ninguna regla de negocio. Se los trata como datos sensibles a efectos de acceso (RF-38.1).

### 4.8 Promociones, puntos y precios

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-43** | El **porcentaje** del cupón de bienvenida es configurable por el administrador (valor inicial: 20%). | E1, E4 |
| **RF-44** | El administrador puede crear cupones dirigidos **solo a usuarios mayores de 50 años**. | E4 |
| **RF-45** | Cada compra de un usuario registrado acumula **1 punto por peso gastado**. | E8 |
| **RF-46** | Los puntos se canjean por **entradas gratis** o por **productos del candy bar**. | E8 |
| **RF-47** | El administrador configura **cuántos puntos cuesta cada recompensa** (por ejemplo, entrada 500, pochoclo grande 150). | E8 |
| **RF-48** | Los puntos **no son transferibles** entre usuarios. | E8 |
| **RF-49** | Cada película puede tener **preventa**: las entradas se abren **7 días antes del estreno** a un **precio especial**, configurable película por película. | E9 |
| **RF-50** | Terminada la preventa, el precio vuelve automáticamente al normal. | E9 |

### 4.9 Panel de empleado

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-51** | El empleado **escanea el QR** para validar el ingreso a la sala. | E5 |
| **RF-52** | El empleado escanea el QR para registrar la **entrega de productos** del candy bar. | E5 |
| **RF-53** | El empleado puede **ingresar el código a mano** si el lector no funciona. | E5 |
| **RF-54** | Una vez validada la entrada, ese QR **deja de servir** para ingresar. | E5 |
| **RF-55** | Una vez entregada la comida, ese QR **deja de servir** para retirar productos. | E5 |

### 4.10 Panel de administración

| ID | Requerimiento | Origen |
|---|---|---|
| **RF-56** | El administrador gestiona salas, funciones, distribución de butacas, películas, productos y precios. | E5 |
| **RF-57** | Reporte de **facturación por día** y **cantidad de entradas vendidas**. | E7 |
| **RF-58** | El reporte de facturación se **exporta a PDF y a Excel**. | E10 |
| **RF-59** | Gráfico de **películas más vistas por semana y por mes**. | E10 |
| **RF-60** | Indicador del **producto del candy bar más vendido**. | E10 |
| **RF-61** | **Log de actividad**: quién creó una función, quién modificó un precio, quién validó un QR, con **fecha y hora**. | E10 |

---

## 5. Reglas de negocio

Estas son las invariantes del dominio. A diferencia de los requerimientos funcionales, **no pueden violarse bajo ninguna circunstancia**, ni por error del usuario, ni por concurrencia, ni por manipulación directa de la API.

### RN-01 — Separación mínima entre funciones

> *"La duración es importante, no puede haber funciones antes de que pase media hora de que terminó la función anterior en esa sala."* (E1)

Una sala está ocupada por una función durante el intervalo:

```
[ inicio , inicio + duración_película + 30 minutos )
```

Dos funciones en la misma sala **nunca** pueden tener intervalos de ocupación superpuestos.

### RN-02 — Asignación automática y exclusiva de sala

> *"Queremos que la asignación de salas sea automática y que bajo ningún término dos funciones sean en la misma sala al mismo tiempo."* (E5)

Al crear una función, el sistema selecciona una sala cuyo intervalo de ocupación no se superponga con ninguna función existente (RN-01). La selección es determinística y la operación es atómica: dos altas simultáneas no pueden obtener la misma sala.

### RN-03 — Una butaca, una venta

Una butaca de una función determinada no puede pertenecer a más de una orden pagada. La verificación y la reserva ocurren en la misma transacción; no alcanza con comprobar disponibilidad antes de confirmar.

### RN-04 — Restricción de edad

Para una función cuya película tiene restricción de 13 o 18 años, la compra se rechaza si la edad del comprador a la fecha de la función es menor que la restricción. Toda entrada emitida para esas películas lleva impresa la leyenda de adulto acompañante (RF-29).

### RN-05 — El QR se consume una sola vez, por tramo

Cada orden tiene **un único código QR** con **dos validaciones independientes**:

| Tramo | Se consume cuando | Efecto |
|---|---|---|
| Entrada | El empleado valida el ingreso a la sala | Ese tramo deja de ser válido |
| Candy | El empleado registra la entrega de productos | Ese tramo deja de ser válido |

Consumir un tramo no afecta al otro. Un intento de validar un tramo ya consumido debe rechazarse mostrando cuándo y por quién fue usado.

### RN-06 — Ventana de cancelación

Una orden puede cancelarse mientras falten **2 horas o más** para el inicio de la función. La cancelación libera las butacas, acredita el monto como crédito en la cuenta del usuario y anula el QR. No se devuelve dinero. Una orden con cualquier tramo del QR ya consumido no puede cancelarse.

### RN-07 — Acumulación de puntos

Solo los usuarios registrados acumulan puntos, a razón de **1 punto por peso efectivamente pagado**. El importe cubierto con puntos no genera puntos nuevos. Los puntos no se transfieren entre cuentas (RF-48).

### RN-08 — Cupón de bienvenida

Aplicable una única vez por cuenta, sobre la primera compra. El porcentaje lo define el administrador y rige el valor vigente al momento de la compra.

### RN-09 — Cupón por edad

Un cupón segmentado por edad solo es aplicable si el usuario está registrado y su edad cumple la condición configurada (por ejemplo, mayor de 50 años) a la fecha de la compra.

### RN-10 — Preventa

Si una película tiene preventa configurada, las entradas se habilitan **7 días antes del estreno** al precio de preventa. Pasada la fecha de estreno, el precio aplicado es el normal. El precio se determina **en el momento de la compra** y queda congelado en la orden.

### RN-11 — Precio de la ubicación

El precio de una entrada se compone del precio base de la función y el recargo del tipo de ubicación. Las butacas VIP tienen precio superior (RF-15). Ver D-06 para el modelo de precios adoptado.

### RN-12 — Auditoría obligatoria

Toda operación de administración (alta, modificación o baja de funciones, precios, productos y promociones) y toda validación de QR quedan registradas con actor, acción, entidad afectada y marca temporal. El log es de solo lectura: no se edita ni se borra.

---

## 6. Requerimientos no funcionales

Provienen de la consigna de la cátedra y de los pedidos explícitos de usabilidad del cliente.

| ID | Requerimiento | Origen |
|---|---|---|
| **RNF-01** | Aplicación desarrollada en **Angular**, aplicando las técnicas vistas en clase y buenas prácticas. | Consigna |
| **RNF-02** | Integración con **Supabase** como plataforma de datos, autenticación y almacenamiento. | Consigna |
| **RNF-03** | La aplicación es una **PWA** instalable y funcional. | Consigna |
| **RNF-04** | **Estilo visual único y producido**: identidad propia, no una plantilla reconocible. | Consigna |
| **RNF-05** | Aplicación **desplegada y accesible por una URL pública funcional**. | Consigna |
| **RNF-06** | Código publicado en **GitHub**, con **README** que documente arquitectura y decisiones técnicas. | Consigna |
| **RNF-07** | Las interfaces deben ser **fáciles de navegar y entender**, tanto para clientes como para empleados. | E7 |
| **RNF-08** | El ingreso de **fechas y horas** debe resolverse con un selector propio que **no requiera scroll extenso** ni búsqueda tediosa. El cliente rechazó explícitamente los selectores nativos de tipo rueda. | E7 |
| **RNF-09** | La seguridad de acceso a datos se aplica **del lado del servidor**. Los controles del cliente son ayudas de interfaz, no mecanismos de seguridad. | Buenas prácticas |
| **RNF-10** | La diferenciación visual de tipos de butaca no puede depender **exclusivamente del color** (accesibilidad). | E6, buenas prácticas |
| **RNF-11** | Los datos personales sensibles del perfil (tipo de sangre, color de ojos, días de vacaciones) se protegen con políticas de acceso del lado del servidor que los restringen a su titular, y quedan excluidos de reportes, exportaciones y logs. | D-04 |

---

## 7. Decisiones de interpretación y desvíos

El pliego presenta ambigüedades, contradicciones y omisiones. Cada una se resuelve acá de forma explícita y fundamentada.

### D-01 — Las filas J y K son **ambas** para movilidad reducida

**Ambigüedad.** El email E6 dice: *"Las dos filas de butacas del medio se quitaron (filas J y K) para dar espacio a **una** fila de butacas para personas con discapacidad. En cada columna quedaron 2, 10 y 2 butacas de ese estilo."* Habla de una sola fila. Sin embargo, más adelante el mismo email se refiere a *"las butacas accesibles (**filas J y K** adaptadas para discapacidad)"*, en plural.

**Resolución.** **J y K son ambas filas de espacios para personas con movilidad reducida (silla de ruedas)**, con 2 + 10 + 2 = 14 espacios cada una.

**Fundamento.** La segunda mención es posterior dentro del mismo email y es la que describe el estado final de la sala. Además, la lectura alternativa dejaría un hueco físico sin uso en el medio de la sala, lo que no tiene sentido en un plano real. La distribución 2/10/2 se aplica a cada una de las dos filas, respetando el ancho de las tres columnas.

**Implicancia.** Los espacios para silla de ruedas se representan con una **silueta propia** en el mapa, distinta de la de una butaca, y no meramente con otro color. Un espacio para silla de ruedas no es una butaca pintada de otro tono.

### D-02 — Verificación de edad en compra anónima

**Contradicción.** El pliego permite comprar sin registro (E1) y a la vez exige impedir la compra de entradas restringidas a menores de 13 o 18 años (E6). Sin cuenta no hay fecha de nacimiento registrada.

**Resolución.** Cuando la función pertenece a una película con restricción de edad, el checkout anónimo solicita una **declaración de fecha de nacimiento** y aplica RN-04 sobre ese valor. La entrada emitida incluye la leyenda de adulto acompañante.

**Fundamento.** Es el mecanismo estándar de la industria y el único compatible con ambos requerimientos. El control efectivo de la edad ocurre en el acceso físico a la sala, momento en que el empleado valida el QR; el sistema documenta la restricción y deja constancia de la declaración.

### D-03 — Un QR, dos consumos independientes

**Ambigüedad.** El pliego pide que *"con el mismo QR puedan retirar"* los productos del candy (E4) y, por separado, que *"una vez que una entrada se valida o se entrega la comida, el QR deja de funcionar"* (E5). Si el QR se invalidara por completo al primer uso, sería imposible usarlo para ambas cosas.

**Resolución.** Un único código por orden, con **dos marcas de consumo independientes** (RN-05): una para el ingreso a la sala y otra para el retiro de candy.

**Fundamento.** Es la única lectura que satisface ambos requerimientos simultáneamente y es coherente con la operación real: el espectador retira los pochoclos y entra a la sala en momentos distintos, en cualquier orden.

### D-04 — Datos personales solicitados en el registro (consulta elevada y resuelta)

**Contradicción detectada en el pliego.** El email E1 dice: *"necesitamos recopilar datos de los usuarios que se registran, **nada muy invasivo**, solo mail, nombre, apellido, fecha de nacimiento, **tipo de sangre, color de ojos y cantidad de días de vacaciones** que tienen por año."*

La afirmación y la enumeración se contradicen entre sí. El tipo de sangre es un dato de salud, el color de ojos es un dato biométrico y los días de vacaciones son información laboral. Ninguno de los tres puede calificarse como "poco invasivo", y ninguno tiene uso funcional en el sistema: no interviene en la venta, ni en los precios, ni en las promociones, ni en los reportes solicitados.

Por tratarse de una contradicción interna del propio pliego —y no de una omisión que pudiera resolverse por criterio técnico—, **la consulta se elevó al cliente en lugar de resolverse unilateralmente**.

**Resolución del cliente (07/09/2026).** El cliente confirmó que **deben respetarse todos los campos solicitados en el email original**. El registro solicita, entonces: email, nombre, apellido, fecha de nacimiento, tipo de sangre, color de ojos y cantidad de días de vacaciones por año (RF-38).

**Consecuencias de diseño.** Que el cliente asuma la decisión de recolectar estos datos no exime al sistema de tratarlos con el cuidado que corresponde. En consecuencia:

1. Los tres campos sin uso funcional se almacenan pero **no participan de ninguna regla de negocio**. Ninguna decisión del sistema depende del tipo de sangre, el color de ojos ni los días de vacaciones.
2. Su acceso queda **restringido a su propio titular** mediante políticas del lado del servidor (RF-38.1, RNF-11). Ni el administrador ni los empleados los ven. Un dato de salud almacenado y accesible para todo el personal sería un pasivo para el cliente, no un servicio.
3. **No se exponen en reportes, exportaciones ni logs de actividad.**

**Fundamento del procedimiento.** Ante una ambigüedad técnica corresponde decidir y documentar; ante una contradicción del cliente sobre el alcance de la recolección de datos personales, corresponde consultar. El canal estaba explícitamente abierto para eso: *"Este canal queda abierto para que podamos dialogar si hay algo más que sea necesario aclarar"* (E1).

**Nota sobre la fecha de nacimiento.** Es el único de los campos añadidos que sí es funcionalmente necesario: la requieren la restricción de edad (RN-04) y los cupones segmentados por edad (RN-09). No podría haberse eliminado en ningún escenario.

### D-05 — Comportamiento ante falta de salas disponibles

**Omisión.** El pliego especifica que la asignación de sala es automática, pero no dice qué ocurre si todas las salas están ocupadas en el horario pedido.

**Resolución.** La creación de la función se rechaza con un mensaje que indica el conflicto y sugiere los horarios libres más cercanos. No se crea una función sin sala ni se desplaza una función existente.

**Fundamento.** RN-02 es una restricción absoluta según el propio cliente (*"bajo ningún término"*). Ante el conflicto, la decisión corresponde al administrador, no al sistema.

### D-06 — Modelo de precios

**Omisión.** El pliego menciona precios diferenciales (VIP más caro, preventa más barata, combos a precio fijo) pero nunca define cómo se determina el precio base de una entrada.

**Resolución.** El precio final de una entrada se calcula como:

```
precio_base_de_la_función  +  recargo_por_tipo_de_ubicación
```

donde el precio base es configurable por el administrador y contempla el formato de proyección (2D/3D/4D/5D), y el recargo por ubicación es 0 para estándar y para silla de ruedas, y positivo para VIP. Si la función está en período de preventa, el precio base se reemplaza por el precio de preventa de la película (RN-10).

Los descuentos se aplican en este orden sobre el subtotal: **cupón → crédito en cuenta → medio de pago**. Los canjes por puntos se resuelven antes, sustituyendo el ítem por su equivalente en puntos.

**Fundamento.** Es el modelo mínimo que satisface todos los requerimientos de precio del pliego sin agregar complejidad no solicitada. El orden de aplicación evita que un porcentaje de descuento se calcule sobre un monto ya cubierto por crédito, que sería una pérdida para el cliente.

### D-07 — Medio de pago

**Omisión.** El pliego nunca menciona una pasarela de pago concreta; solo dice *"siempre que paguen no hay problema"*.

**Resolución.** El sistema implementa el flujo de checkout completo con **registro del medio de pago y confirmación simulada**, sin integración con una pasarela real.

**Fundamento.** El valor del sistema está en la lógica que rodea al pago — cupones, puntos, crédito, precios de preventa, recargos VIP —, y esa lógica se implementa íntegramente. La integración con una pasarela real es un trabajo de infraestructura que no agrega dominio y que introduce dependencias externas. El diseño aísla el momento del cobro para que la sustitución por una pasarela real sea un cambio localizado.

### D-08 — Vigencia y expiración de la selección de butacas

**Omisión.** El pliego pide ver en tiempo real qué butacas está ocupando otro usuario (RF-25), pero no define cuánto dura esa ocupación si la compra no se concreta.

**Resolución.** Al seleccionar una butaca se toma una **reserva temporal de 10 minutos**. Vencido el plazo sin pago confirmado, la butaca se libera automáticamente y vuelve a estar disponible.

**Fundamento.** Sin expiración, un usuario que abandona el proceso bloquearía butacas indefinidamente. Diez minutos es holgado para completar un checkout y acotado para no perjudicar la venta.

---

## 8. Fuera de alcance

### FA-01 — Mapa del cine con ubicación de la sala

> *"Estamos pensando en agregar una pantalla con un mapa de todo el cine que indique cuál es la sala para la que se compró la entrada, **pero no tenemos luz verde aún**."* (E4)

**No se implementa.** El propio cliente indicó que la funcionalidad no está aprobada. Se excluye por decisión del cliente, no por omisión. La entrada sí indica el número de sala en el PDF y en pantalla.

### FA-02 — Integración con pasarela de pagos real

Ver D-07.

### FA-03 — Venta de entradas en punto de venta físico

El pliego describe exclusivamente la venta por web (*"nuestros inversores quieren que tengamos nuestra propia página para sacar entradas"*, E1). La operación de boletería presencial no se menciona en ningún momento y no se implementa.

---

## 9. Modelo de dominio — vista general

Entidades principales y sus relaciones, como referencia para el diseño del esquema.

```
Película ──< PelículaGénero >── Género
   │
   ├──< Función >── Sala ──< Butaca
   │      │
   │      └──< ButacaOrden >── Orden
   │
   └──< Reseña >── Perfil

Orden ──< OrdenItem >── Producto / Combo / Entrada
  │
  ├── QR (entrada_validada_at, candy_entregado_at)
  ├── Cupón aplicado
  └── Movimientos de puntos y de crédito

Perfil ──< MovimientoPuntos
   │
   ├──< MovimientoCrédito
   ├──< Canje >── Recompensa
   └──< AlertaEstreno >── Película

LogActividad ── (actor, acción, entidad, timestamp)
```

**Estados de una orden:** `pendiente` → `pagada` → `cancelada`, con `expirada` como estado terminal de las órdenes pendientes que superan la ventana de reserva (D-08).

---

## 10. Matriz de cobertura

| Email | Requerimientos derivados |
|---|---|
| **E1** | RF-01, RF-07, RF-12, RF-13, RF-19, RF-24, RF-26, RF-27, RF-38, RF-38.1, RF-39, RF-43, RN-01, RNF-11, D-02, D-04, D-07 |
| **E2** | RF-04, RF-05, RF-09, RF-10, RF-11 |
| **E3** | RF-02, RF-06 |
| **E4** | RF-33, RF-34, RF-35, RF-43, RF-44, RN-08, RN-09, D-03, FA-01 |
| **E5** | RF-18, RF-20, RF-21, RF-22, RF-23, RF-51, RF-52, RF-53, RF-54, RF-55, RF-56, RN-02, RN-05, D-03, D-05 |
| **E6** | RF-03, RF-14, RF-16, RF-25, RF-28, RF-29, RN-04, RNF-10, D-01 |
| **E7** | RF-57, RNF-07, RNF-08 |
| **E8** | RF-36, RF-37, RF-40, RF-45, RF-46, RF-47, RF-48, RN-07 |
| **E9** | RF-08, RF-41, RF-42, RF-49, RF-50, RN-10 |
| **E10** | RF-15, RF-17, RF-30, RF-31, RF-32, RF-58, RF-59, RF-60, RF-61, RN-06, RN-11, RN-12 |

**Totales:** 62 requerimientos funcionales · 12 reglas de negocio · 11 requerimientos no funcionales · 8 decisiones de interpretación · 3 exclusiones de alcance.

---

## 11. Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 06/09/2026 | Versión inicial, consolidando los 10 emails del cliente |
| 1.1 | 07/09/2026 | **D-04 resuelta por consulta al cliente**: se respetan todos los campos de registro del email original. RF-38 actualizado con el detalle de los siete campos; se agregan RF-38.1 y RNF-11 para restringir el acceso a los datos sensibles a su titular |
