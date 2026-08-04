import { describe, expect, it } from 'vitest';
import {
  camposPerfilFaltantes,
  perfilListoParaComprar,
  urlDestinoClienteConPerfil,
} from './perfil-completo';
import { Usuario } from '../types/entities';
import { TipoGenero } from '../types/enums';

const usuarioBase: Usuario = {
  id: 1,
  tipo_usuario_id: 1,
  email: 'test@example.com',
  nombre: 'Ana',
  apellido: 'Pérez',
  documento_identidad: '1234567890',
  telefono: '3001234567',
  fecha_nacimiento: '1995-06-20',
  genero: TipoGenero.FEMENINO,
};

describe('perfil-completo', () => {
  it('marca perfil completo cuando tiene todos los datos obligatorios', () => {
    expect(perfilListoParaComprar(usuarioBase)).toBe(true);
    expect(camposPerfilFaltantes(usuarioBase)).toEqual([]);
  });

  it('detecta campos faltantes', () => {
    expect(
      camposPerfilFaltantes({
        ...usuarioBase,
        apellido: '',
        documento_identidad: 'correo@mail.com',
        telefono: '123',
        fecha_nacimiento: '',
        genero: TipoGenero.NO_ESPECIFICADO,
      })
    ).toEqual(['apellido', 'documento_identidad', 'telefono', 'fecha_nacimiento', 'genero']);
  });

  it('requiere genero distinto de no especificado', () => {
    expect(
      camposPerfilFaltantes({
        ...usuarioBase,
        genero: TipoGenero.NO_ESPECIFICADO,
      })
    ).toEqual(['genero']);
  });

  it('redirige a completar perfil cuando faltan datos', () => {
    expect(
      urlDestinoClienteConPerfil(
        { ...usuarioBase, documento_identidad: '', telefono: '' },
        '/eventos-cliente'
      )
    ).toBe('/completar-perfil?returnUrl=%2Feventos-cliente');
  });
});
