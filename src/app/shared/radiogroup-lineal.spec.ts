import { destinoEnRadiogroup } from './radiogroup-lineal';

function tecla(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key });
}

describe('destinoEnRadiogroup', () => {
  const lista = ['a', 'b', 'c'];

  it('mueve al siguiente y al anterior en una fila (columnas=1)', () => {
    expect(destinoEnRadiogroup(tecla('ArrowRight'), lista, 'a', 1)).toBe('b');
    expect(destinoEnRadiogroup(tecla('ArrowLeft'), lista, 'b', 1)).toBe('a');
    // Arriba y abajo valen lo mismo que izquierda y derecha cuando hay una sola fila
    expect(destinoEnRadiogroup(tecla('ArrowDown'), lista, 'a', 1)).toBe('b');
    expect(destinoEnRadiogroup(tecla('ArrowUp'), lista, 'b', 1)).toBe('a');
  });

  it('da la vuelta en los bordes', () => {
    expect(destinoEnRadiogroup(tecla('ArrowRight'), lista, 'c', 1)).toBe('a');
    expect(destinoEnRadiogroup(tecla('ArrowLeft'), lista, 'a', 1)).toBe('c');
  });

  it('Home y End van a los extremos', () => {
    expect(destinoEnRadiogroup(tecla('Home'), lista, 'c', 1)).toBe('a');
    expect(destinoEnRadiogroup(tecla('End'), lista, 'a', 1)).toBe('c');
  });

  it('salta filas enteras con columnas > 1', () => {
    const grilla = ['00', '05', '10', '15', '20', '25'];
    expect(destinoEnRadiogroup(tecla('ArrowDown'), grilla, '00', 3)).toBe('15');
    expect(destinoEnRadiogroup(tecla('ArrowUp'), grilla, '15', 3)).toBe('00');
  });

  it('arranca en la primera opción si nada está elegido', () => {
    expect(destinoEnRadiogroup(tecla('ArrowRight'), lista, '', 1)).toBe('b');
  });

  it('no rompe con una sola opción: da la vuelta sobre sí misma', () => {
    expect(destinoEnRadiogroup(tecla('ArrowRight'), ['a'], 'a', 1)).toBe('a');
  });

  it('devuelve null con lista vacía o tecla que no es de navegación', () => {
    expect(destinoEnRadiogroup(tecla('ArrowRight'), [], '', 1)).toBeNull();
    expect(destinoEnRadiogroup(tecla('Enter'), lista, 'a', 1)).toBeNull();
  });
});
