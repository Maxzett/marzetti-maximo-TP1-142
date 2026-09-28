import { EntradaComprada } from '../models/orden';
import {
  datosDeLaEntrada,
  leyendaDeAcompanante,
  listarButacas,
  nombreDeLaCompra,
  nombreDelPdf,
} from './entrada';
import { generarPdf } from './pdf';
import { qrComoImagen } from './qr';

function entrada(cambios: Partial<EntradaComprada> = {}): EntradaComprada {
  return {
    codigo: 'AB12CD34EF56GH78IJ90',
    tipo: 'funcion',
    estado: 'pagada',
    email: 'a@b.com',
    subtotal: 15000,
    descuento_cupon: 0,
    credito_aplicado: 0,
    total: 15000,
    pagada_at: '2026-10-05T15:00:00Z',
    cancelada_at: null,
    entrada_validada_at: null,
    candy_entregado_at: null,
    valido_hasta: null,
    tiene_candy: false,
    candy: [],
    pelicula: 'Mar de cenizas',
    restriccion_edad: 0,
    requiere_acompanante: false,
    inicio: '2026-10-09T21:00:00Z',
    formato: '2D',
    idioma: 'castellano',
    sala: 'Sala 2',
    butacas: [
      { fila: 'A', numero: 1, tipo: 'estandar', precio: 6500 },
      { fila: 'R', numero: 5, tipo: 'vip', precio: 8500 },
    ],
    ...cambios,
  };
}

/** Intl escribe un espacio de no separación entre el $ y el número: se compara con espacio común */
const sinNbsp = (texto: string) => texto.replace(/ /g, ' ');

describe('leyenda de adulto acompañante (RF-29)', () => {
  it('una película con restricción la lleva, con la edad', () => {
    expect(leyendaDeAcompanante({ restriccion_edad: 13 })).toBe(
      'Película para mayores de 13 años. El espectador debe ir acompañado por un adulto.',
    );
    expect(leyendaDeAcompanante({ restriccion_edad: 18 })).toContain('18 años');
  });

  it('una película para todo público no la lleva', () => {
    expect(leyendaDeAcompanante({ restriccion_edad: 0 })).toBe('');
  });
});

describe('datos de la entrada', () => {
  it('lista las butacas como se leen en voz alta', () => {
    expect(listarButacas([])).toBe('');
    expect(listarButacas([{ fila: 'A', numero: 1, tipo: 'estandar', precio: 1 }])).toBe('A1');
    expect(listarButacas(entrada().butacas)).toBe('A1 y R5');
    expect(
      listarButacas([
        { fila: 'A', numero: 1, tipo: 'estandar', precio: 1 },
        { fila: 'A', numero: 2, tipo: 'estandar', precio: 1 },
        { fila: 'R', numero: 5, tipo: 'vip', precio: 1 },
      ]),
    ).toBe('A1, A2 y R5');
  });

  it('muestra la sala, la función en hora del cine y el total', () => {
    const datos = new Map(datosDeLaEntrada(entrada()).map((d) => [d.rotulo, sinNbsp(d.valor)]));

    expect(datos.get('Sala')).toBe('Sala 2');
    expect(datos.get('Función')).toContain('18:00');
    expect(datos.get('Total')).toBe('$ 15.000');
  });

  it('detalla el tipo y el precio de las butacas que no son estándar', () => {
    const datos = new Map(datosDeLaEntrada(entrada()).map((d) => [d.rotulo, sinNbsp(d.valor)]));

    expect(datos.get('R5')).toBe('VIP · $ 8.500');
    expect(datos.has('A1')).toBe(false);
  });

  it('sin candy no imprime esa línea', () => {
    expect(datosDeLaEntrada(entrada()).some((d) => d.rotulo === 'Candy bar')).toBe(false);
  });

  it('con candy lista lo que se retira, con lo que trae cada combo (RF-35)', () => {
    const datos = new Map(
      datosDeLaEntrada(
        entrada({
          tiene_candy: true,
          candy: [
            { nombre: 'Pochoclo grande', cantidad: 1, por_canje: false, incluye: [] },
            {
              nombre: 'Combo Pareja',
              cantidad: 2,
              por_canje: false,
              incluye: [{ nombre: 'Gaseosa 500 ml', cantidad: 4 }],
            },
          ],
        }),
      ).map((d) => [d.rotulo, d.valor]),
    );

    expect(datos.get('Candy bar')).toBe(
      '1 × Pochoclo grande, 2 × Combo Pareja (4 × Gaseosa 500 ml)',
    );
  });

  it('el nombre del archivo lleva el código en minúsculas', () => {
    expect(nombreDelPdf(entrada())).toBe('entrada-ab12cd34ef56gh78ij90.pdf');
  });
});

describe('ticket del candy bar sin entrada (RF-34.1)', () => {
  const ticket = () =>
    entrada({
      tipo: 'candy',
      pelicula: null,
      inicio: null,
      formato: null,
      idioma: null,
      sala: null,
      butacas: [],
      tiene_candy: true,
      candy: [{ nombre: 'Pochoclo grande', cantidad: 2, por_canje: false, incluye: [] }],
      valido_hasta: '2026-10-12T15:00:00Z',
      total: 9000,
    });

  it('no habla de película, sala ni butacas; dice qué retira y hasta cuándo', () => {
    const datos = new Map(datosDeLaEntrada(ticket()).map((d) => [d.rotulo, sinNbsp(d.valor)]));

    expect([...datos.keys()]).toEqual(['Candy bar', 'Retiralo hasta', 'Total']);
    expect(datos.get('Candy bar')).toBe('2 × Pochoclo grande');
    // 15:00 UTC es mediodía en el cine
    expect(datos.get('Retiralo hasta')).toContain('12:00');
  });

  it('se llama ticket, y así se nombra el archivo', () => {
    expect(nombreDeLaCompra(ticket())).toBe('Ticket del candy bar');
    expect(nombreDelPdf(ticket())).toBe('ticket-candy-ab12cd34ef56gh78ij90.pdf');
    expect(nombreDeLaCompra(entrada())).toBe('Entrada');
  });

  it('el PDF del ticket también se genera', async () => {
    const qr = await qrComoImagen('AB12CD34EF56GH78IJ90');
    const pdf = await generarPdf(ticket(), qr);

    expect(pdf.type).toBe('application/pdf');
  });
});

describe('QR y PDF', () => {
  it('el QR es una imagen PNG generada en el navegador', async () => {
    const imagen = await qrComoImagen('AB12CD34EF56GH78IJ90');
    expect(imagen.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('el PDF se genera con el QR adentro y es un PDF de verdad', async () => {
    const qr = await qrComoImagen('AB12CD34EF56GH78IJ90');
    const pdf = await generarPdf(entrada({ restriccion_edad: 18 }), qr);

    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(1000);

    const inicio = new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5));
    expect(inicio).toBe('%PDF-');
  });
});
