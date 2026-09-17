import { TestBed } from '@angular/core/testing';
import { Supabase } from './supabase';

describe('Supabase', () => {
  let service: Supabase;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Supabase);
  });

  // fetch se reemplaza en cada caso: los tests no salen a la red
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.client).toBeTruthy();
  });

  it('informa conexión cuando el endpoint de salud responde OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(service.verificarConexion()).resolves.toBe(true);
  });

  it('informa falta de conexión cuando la clave es rechazada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    await expect(service.verificarConexion()).resolves.toBe(false);
  });

  it('informa falta de conexión cuando la red falla', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(service.verificarConexion()).resolves.toBe(false);
  });
});
