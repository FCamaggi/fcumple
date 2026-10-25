import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLayers } from './layers';
import {
  isRoleOrHexColor,
  materializePresetLayers,
  parseAssetRef,
  recolorSvgToDataUri,
  resolveRoleColor,
  validatePackManifest,
  type PackManifest,
  type PackPalette,
} from './packs';

const PALETTE: PackPalette = {
  acento: '#ff2f92',
  fondo: '#0d0b12',
  texto: '#ffffff',
};

describe('packs y roles de color (Etapa 2.1)', () => {
  it('parseAssetRef acepta referencias pack:<pack>/<asset> válidas y rechaza rutas o URLs', () => {
    expect(parseAssetRef('pack:halloween-neon/orejas-conejita')).toEqual({
      packId: 'halloween-neon',
      assetId: 'orejas-conejita',
    });
    expect(parseAssetRef('halloween-neon/orejas')).toBeNull();
    expect(parseAssetRef('pack:../etc/passwd')).toBeNull();
    expect(parseAssetRef('https://evil.example/a.svg')).toBeNull();
    expect(parseAssetRef(null)).toBeNull();
  });

  it('resolveRoleColor e isRoleOrHexColor manejan $acento, $fondo, $texto y colores hex', () => {
    expect(isRoleOrHexColor('$acento')).toBe(true);
    expect(isRoleOrHexColor('$fondo')).toBe(true);
    expect(isRoleOrHexColor('$texto')).toBe(true);
    expect(isRoleOrHexColor('#ff2f92')).toBe(true);
    expect(isRoleOrHexColor('$otro')).toBe(false);
    expect(isRoleOrHexColor('pink')).toBe(false);

    expect(resolveRoleColor('$acento', PALETTE)).toBe('#ff2f92');
    expect(resolveRoleColor('$fondo', PALETTE)).toBe('#0d0b12');
    expect(resolveRoleColor('$texto', PALETTE)).toBe('#ffffff');
    expect(resolveRoleColor('#c8f23a', PALETTE)).toBe('#c8f23a');
  });

  it('recolorSvgToDataUri sustituye los roles, exige xmlns y rechaza scripts', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="$acento" stroke="$fondo"/></svg>';
    const uri = recolorSvgToDataUri(svg, PALETTE);
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length));
    expect(decoded).toContain('fill="#ff2f92"');
    expect(decoded).toContain('stroke="#0d0b12"');

    expect(() => recolorSvgToDataUri('<svg><path/></svg>', PALETTE)).toThrow(/xmlns/);
    expect(() =>
      recolorSvgToDataUri('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', PALETTE),
    ).toThrow(/no permitidos/);
    expect(() =>
      recolorSvgToDataUri('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', PALETTE),
    ).toThrow(/no permitidos/);
  });

  it('el paquete público halloween-neon en public/packs/ es válido y sus presets producen capas válidas', () => {
    const packDir = path.resolve(process.cwd(), 'public', 'packs', 'halloween-neon');
    const raw = JSON.parse(fs.readFileSync(path.join(packDir, 'pack.json'), 'utf8')) as PackManifest;
    expect(validatePackManifest(raw)).toEqual({ ok: true });

    for (const asset of raw.assets) {
      const svgText = fs.readFileSync(path.join(packDir, asset.file), 'utf8');
      const uri = recolorSvgToDataUri(svgText, raw.palette);
      expect(uri).toContain(encodeURIComponent(raw.palette.acento));
    }

    for (const preset of raw.presets) {
      const layers = materializePresetLayers(preset, raw.palette, { acento: '#ff6b00' });
      const res = validateLayers(layers, '00000000-0000-0000-0000-000000000001');
      expect(res).toEqual({ ok: true });
      expect(JSON.stringify(layers)).toContain('#ff6b00');
      expect(JSON.stringify(layers)).not.toContain('$acento');
    }
  });

  it('validatePackManifest exige eventSlug en paquetes privados y licencia en cada recurso', () => {
    const base: PackManifest = {
      id: 'puti-halloween-privado',
      name: 'Pack Privado Fran',
      version: 1,
      visibility: 'private',
      eventSlug: 'puti-halloween',
      palette: PALETTE,
      assets: [
        {
          id: 'sello',
          name: 'Sello',
          category: 'sello',
          file: 'sello.svg',
          format: 'svg',
          recolorable: true,
          license: { source: 'Propia', spdx: 'LicenseRef-Own', date: '2026-10-25' },
        },
      ],
      presets: [],
    };
    expect(validatePackManifest(base)).toEqual({ ok: true });
    expect(validatePackManifest({ ...base, eventSlug: undefined }).ok).toBe(false);
    expect(
      validatePackManifest({
        ...base,
        assets: [{ ...base.assets[0], license: { source: '', spdx: 'MIT', date: '2026-10-25' } }],
      }).ok,
    ).toBe(false);
  });
});
