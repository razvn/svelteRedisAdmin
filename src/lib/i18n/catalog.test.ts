import { describe, expect, it } from 'vitest';
import { availableCodes, loadCatalog, loadTranslator } from './catalog.ts';
import { makeFmt } from './context.svelte.ts';

describe('catalogs', () => {
	it('discovers languages from the locales folder', () => {
		expect(availableCodes()).toEqual(expect.arrayContaining(['en', 'fr', 'es']));
		expect(availableCodes()).not.toContain('de');
	});
	it('merges all area files of a language', async () => {
		const fr = await loadCatalog('fr');
		expect(fr['Sign in']).toBe('Connexion'); // login
		expect(fr['Password']).toBe('Mot de passe'); // login
	});
	it('English and unknown languages have an empty catalog', async () => {
		expect(await loadCatalog('en')).toEqual({});
		expect(await loadCatalog('xx')).toEqual({});
	});
	it('translates through a loaded translator', async () => {
		const es = await loadTranslator('es');
		expect(es.t('Password')).toBe('Contraseña');
	});
});

describe('locale-aware formatting', () => {
	it('formats numbers and dates with Intl for the locale', async () => {
		const fr = makeFmt(await loadTranslator('fr'));
		expect(fr.number(1234567)).toBe(new Intl.NumberFormat('fr').format(1234567));
		expect(fr.date(new Date(Date.UTC(2026, 9, 29, 12)))).toMatch(/29/);
		const en = makeFmt(await loadTranslator('en'));
		expect(en.number(1234567)).toBe('1,234,567');
		expect(en.bytes(16384)).toBe('16.0 KiB');
	});
});
