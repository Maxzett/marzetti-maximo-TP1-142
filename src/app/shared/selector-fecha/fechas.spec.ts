import {
  aIso,
  dentroDelRango,
  desdeIso,
  desplazamientoPrimerDia,
  diasDeLaSemana,
  diasDelMes,
  esIsoValida,
  formatearLargo,
  limitar,
  nombreMes,
  sumarDias,
  sumarMeses,
} from './fechas';

describe('fechas', () => {
  it('arma y desarma el formato AAAA-MM-DD con ceros', () => {
    expect(aIso(2026, 0, 5)).toBe('2026-01-05');
    expect(desdeIso('2026-01-05')).toEqual({ anio: 2026, mes: 0, dia: 5 });
  });

  // Date corrige solo un 31 de febrero y devolvería el 3 de marzo, que no es lo que escribieron
  it('rechaza fechas que no existen', () => {
    expect(desdeIso('2026-02-31')).toBeNull();
    expect(desdeIso('2026-13-01')).toBeNull();
    expect(desdeIso('24/09/2026')).toBeNull();
    expect(esIsoValida('2026-09-24')).toBe(true);
  });

  it('cuenta los días del mes, incluido febrero bisiesto', () => {
    expect(diasDelMes(2026, 1)).toBe(28);
    expect(diasDelMes(2028, 1)).toBe(29);
    expect(diasDelMes(2026, 3)).toBe(30);
  });

  // La semana arranca el lunes: el 1 de septiembre de 2026 cayó martes, así que sobra una celda
  it('calcula el relleno del primer día con la semana empezando el lunes', () => {
    expect(desplazamientoPrimerDia(2026, 8)).toBe(1);
    // 1 de junio de 2026 fue lunes
    expect(desplazamientoPrimerDia(2026, 5)).toBe(0);
  });

  it('suma días cruzando fin de mes y fin de año', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  // El 31 de enero más un mes no es el 3 de marzo
  it('recorta el día al sumar meses cuando el destino es más corto', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2026-03-15', -1)).toBe('2026-02-15');
    expect(sumarMeses('2026-12-10', 1)).toBe('2027-01-10');
  });

  it('limita al rango y responde si una fecha está adentro', () => {
    expect(limitar('2026-01-01', '2026-06-01', '2026-12-31')).toBe('2026-06-01');
    expect(limitar('2027-01-01', '2026-06-01', '2026-12-31')).toBe('2026-12-31');
    expect(limitar('2026-07-15', '2026-06-01', '2026-12-31')).toBe('2026-07-15');

    expect(dentroDelRango('2026-07-15', '2026-06-01', '')).toBe(true);
    expect(dentroDelRango('2026-05-15', '2026-06-01', '')).toBe(false);
  });

  it('nombra meses y días en español rioplatense', () => {
    expect(nombreMes(8)).toBe('septiembre');
    expect(diasDeLaSemana()).toHaveLength(7);
    expect(diasDeLaSemana()[0].largo).toBe('lunes');
    expect(diasDeLaSemana()[6].largo).toBe('domingo');
  });

  // Sin la aritmética en UTC, en Argentina esto mostraría el día anterior
  it('formatea sin correrse de día por la zona horaria', () => {
    expect(formatearLargo('2026-09-24')).toContain('24 de septiembre de 2026');
    expect(formatearLargo('2026-09-24')).toContain('jueves');
    expect(formatearLargo('no es una fecha')).toBe('');
  });
});
