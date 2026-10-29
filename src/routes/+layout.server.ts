import { availableLanguages, loadCatalog } from '#lib/i18n/catalog.ts';
import { languageInfo } from '#lib/i18n/languages.ts';
import type { LayoutServerLoad } from './$types';

/** The resolved language for the whole tree, including the login page. */
export const load: LayoutServerLoad = async ({ locals }) => ({
	locale: locals.locale,
	language: languageInfo(locals.locale),
	languages: availableLanguages(),
	catalog: await loadCatalog(locals.locale)
});
