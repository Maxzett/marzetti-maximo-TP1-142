import {
  describirInicio,
  diaDeLaSemana,
  fechaLocal,
  fechasDeProgramacion,
  finDeOcupacion,
  horaLocal,
  instanteDeFuncion,
} from './programacion';

describe('diaDeLaSemana', () => {
  it('numera de 1 (lunes) a 7 (domingo), como ISO 8601', () => {
    // El 5 de enero de 2026 fue lunes
    expect(diaDeLaSemana('2026-01-05')).toBe(1);
    expect(diaDeLaSemana('2026-01-09')).toBe(5);
    expect(diaDeLaSemana('2026-01-11')).toBe(7);
  });

  it('devuelve null si no es una fecha real', () => {
    expect(diaDeLaSemana('2026-02-31')).toBeNull();
    expect(diaDeLaSemana('mañana')).toBeNull();
  });
});

describe('fechasDeProgramacion', () => {
  it('lunes, martes y viernes de dos semanas: seis fechas en orden', () => {
    // 5/1/2026 es lunes: la semana va del 5 al 11 y la siguiente del 12 al 18
    expect(fechasDeProgramacion('2026-01-05', '2026-01-18', [1, 2, 5])).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-09',
      '2026-01-12',
      '2026-01-13',
      '2026-01-16',
    ]);
  });

  it('incluye los dos extremos del período', () => {
    expect(fechasDeProgramacion('2026-01-05', '2026-01-05', [1])).toEqual(['2026-01-05']);
  });

  it('si ningún día del período coincide, no hay fechas', () => {
    expect(fechasDeProgramacion('2026-01-05', '2026-01-06', [7])).toEqual([]);
  });

  it('sin días elegidos o con el período al revés no hay fechas', () => {
    expect(fechasDeProgramacion('2026-01-05', '2026-01-18', [])).toEqual([]);
    expect(fechasDeProgramacion('2026-01-18', '2026-01-05', [1])).toEqual([]);
  });

  it('con una fecha inválida no hay fechas y no se cuelga', () => {
    expect(fechasDeProgramacion('', '2026-01-18', [1])).toEqual([]);
    expect(fechasDeProgramacion('2026-01-05', 'nunca', [1])).toEqual([]);
  });

  it('cruza el fin de año y el año bisiesto', () => {
    expect(fechasDeProgramacion('2027-12-31', '2028-01-02', [1, 2, 3, 4, 5, 6, 7])).toEqual([
      '2027-12-31',
      '2028-01-01',
      '2028-01-02',
    ]);
    expect(fechasDeProgramacion('2028-02-28', '2028-03-01', [1, 2, 3, 4, 5, 6, 7])).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('finDeOcupacion', () => {
  it('suma la duración y los 30 minutos de separación (RN-01)', () => {
    expect(finDeOcupacion('18:00', 120)).toEqual({ hora: '20:30', diaSiguiente: false });
  });

  it('avisa cuando termina pasada la medianoche', () => {
    expect(finDeOcupacion('23:00', 120)).toEqual({ hora: '01:30', diaSiguiente: true });
  });

  it('con 30 minutos de película desde las 23:00, con la separación llega justo a la medianoche', () => {
    expect(finDeOcupacion('23:00', 30)).toEqual({ hora: '00:00', diaSiguiente: true });
  });

  it('devuelve null si la hora no es HH:MM', () => {
    expect(finDeOcupacion('', 100)).toBeNull();
    expect(finDeOcupacion('6pm', 100)).toBeNull();
  });
});

describe('horas en la zona del cine', () => {
  it('las 21:00 UTC son las 18:00 de Buenos Aires', () => {
    expect(horaLocal('2026-09-25T21:00:00Z')).toBe('18:00');
    expect(fechaLocal('2026-09-25T21:00:00Z')).toBe('2026-09-25');
  });

  it('a las 01:00 UTC todavía es el día anterior en Buenos Aires', () => {
    expect(fechaLocal('2026-09-26T01:00:00Z')).toBe('2026-09-25');
    expect(horaLocal('2026-09-26T01:00:00Z')).toBe('22:00');
  });

  it('la medianoche se escribe 00:00 y no 24:00', () => {
    expect(horaLocal('2026-09-25T03:00:00Z')).toBe('00:00');
  });

  it('un texto que no es una fecha da vacío', () => {
    expect(horaLocal('nunca')).toBe('');
    expect(fechaLocal('nunca')).toBe('');
  });

  it('instanteDeFuncion y horaLocal son inversas', () => {
    const instante = instanteDeFuncion('2026-09-25', '18:00');

    expect(instante).toBe('2026-09-25T18:00:00-03:00');
    expect(horaLocal(instante)).toBe('18:00');
    expect(fechaLocal(instante)).toBe('2026-09-25');
  });
});

describe('describirInicio', () => {
  it('escribe día, fecha y hora del cine', () => {
    // 25/9/2026 es viernes
    expect(describirInicio('2026-09-25T21:00:00Z')).toBe('vie 25/09 · 18:00');
  });

  it('usa la fecha del cine y no la UTC cuando difieren', () => {
    expect(describirInicio('2026-09-26T01:00:00Z')).toBe('vie 25/09 · 22:00');
  });

  it('con un texto inválido devuelve vacío', () => {
    expect(describirInicio('nunca')).toBe('');
  });
});
