import { read, utils } from 'xlsx';
import { DiaDeFacturacion } from '../models/reportes';
import { generarExcelFacturacion, generarPdfFacturacion } from './exportar';

const DIAS: DiaDeFacturacion[] = [
  {
    dia: '2026-09-26',
    ordenes: 2,
    entradas: 3,
    cobrado: 13000.5,
    credito: 0,
    descuentos: 0,
    canceladas: 0,
  },
  {
    dia: '2026-09-27',
    ordenes: 1,
    entradas: 1,
    cobrado: 6500,
    credito: 500,
    descuentos: 1300,
    canceladas: 1,
  },
];

describe('exportar la facturación (RF-58)', () => {
  it('el PDF es un PDF de verdad', async () => {
    const pdf = await generarPdfFacturacion(DIAS, '2026-09-26', '2026-09-27');
    const inicio = new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5));

    expect(pdf.type).toBe('application/pdf');
    expect(inicio).toBe('%PDF-');
  });

  it('un período largo no rompe el PDF: pasa a otra página', async () => {
    const muchos = Array.from({ length: 90 }, (_, i) => ({
      ...DIAS[0],
      dia: `2026-0${7 + Math.floor(i / 31)}-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const pdf = await generarPdfFacturacion(muchos, '2026-07-01', '2026-09-28');
    const texto = new TextDecoder('latin1').decode(await pdf.arrayBuffer());

    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  describe('Excel', () => {
    async function leer() {
      const excel = await generarExcelFacturacion(DIAS, '2026-09-26', '2026-09-27');
      // cellNF: sin esto la lectura descarta el formato de número de cada celda
      const libro = read(await excel.arrayBuffer(), { cellNF: true });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      return { excel, libro, hoja, filas: utils.sheet_to_json<unknown[]>(hoja, { header: 1 }) };
    }

    it('una fila por día, con encabezado y total', async () => {
      const { libro, filas } = await leer();

      expect(libro.SheetNames).toEqual(['Facturación']);
      expect(filas[0]).toEqual([
        'Día',
        'Órdenes',
        'Entradas',
        'Cobrado',
        'Pagado con crédito',
        'Descuentos',
        'Canceladas',
      ]);
      expect(filas[1][0]).toBe('26/09/2026');
      expect(filas[3]).toEqual(['Total', 3, 4, 19500.5, 500, 1300, 1]);
    });

    it('los montos son números con formato de pesos, no texto', async () => {
      const { hoja } = await leer();
      const cobrado = hoja['D2'];

      expect(cobrado.t).toBe('n');
      expect(cobrado.v).toBe(13000.5);
      expect(cobrado.z).toContain('$');
      // Una cantidad no lleva formato de pesos
      expect(hoja['B2'].z ?? 'General').toBe('General');
    });

    it('el archivo se declara como planilla de Excel', async () => {
      const { excel } = await leer();

      expect(excel.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  });
});
