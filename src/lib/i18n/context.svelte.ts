// i18n-ignore-file (wrappers around the translation functions)
import { createContext } from 'svelte';
import { formatBytes, formatMicros, formatSeconds } from '#lib/format.ts';
import { languageInfo, type Language } from './languages.ts';
import { SOURCE_TRANSLATOR, Translator, type Catalog } from './translator.ts';

/** What the root layout hands to the runtime. */
export interface I18nSource {
	locale: string;
	catalog: Catalog;
	/** Selectable languages (for language selects). */
	languages?: readonly Language[];
}

/**
 * Per-request/per-app i18n state, provided by the root layout through context (never a module-level
 * singleton: the server renders many users concurrently). Reads `source` reactively, so replacing the
 * layout data (language switch -> `refreshAll()`) re-renders every translated string without a reload.
 *
 * Destructure freely: `const { t, tn, fmt } = useI18n()`.
 */
export class I18n {
	#source: () => I18nSource;
	#tr = $derived.by(() => {
		const s = this.#source();
		return new Translator(s.locale, s.catalog);
	});
	#fmt = $derived(makeFmt(this.#tr));

	constructor(source: () => I18nSource) {
		this.#source = source;
	}

	get locale(): string {
		return this.#tr.locale;
	}
	get language(): Language {
		return languageInfo(this.#tr.locale);
	}
	get dir(): 'ltr' | 'rtl' {
		return this.language.dir;
	}
	get languages(): readonly Language[] {
		return this.#source().languages ?? [this.language];
	}

	t = (msgid: string, params?: Parameters<Translator['t']>[1]) => this.#tr.t(msgid, params);
	tc = (context: string, msgid: string, params?: Parameters<Translator['tc']>[2]) =>
		this.#tr.tc(context, msgid, params);
	tn = (singular: string, plural: string, n: number, params?: Parameters<Translator['tn']>[3]) =>
		this.#tr.tn(singular, plural, n, params);

	/** Locale-aware number and date formatting (byte/second units are language-neutral). */
	get fmt(): Fmt {
		return this.#fmt;
	}
}

/** Formatting bound to one locale. */
export interface Fmt {
	number: (value: number) => string;
	/** Seconds (TTL, uptime): localized number + language-neutral unit. */
	seconds: (value: number) => string;
	/** Microseconds (slow log): localized number + language-neutral unit. */
	micros: (value: number) => string;
	bytes: (value: number) => string;
	date: (value: Date | number | string) => string;
	dateTime: (value: Date | number | string) => string;
}

export function makeFmt(tr: Translator): Fmt {
	const nf = new Intl.NumberFormat(tr.intl);
	const df = new Intl.DateTimeFormat(tr.intl, { dateStyle: 'medium' });
	const dtf = new Intl.DateTimeFormat(tr.intl, { dateStyle: 'medium', timeStyle: 'medium' });
	return {
		number: (v) => nf.format(v),
		seconds: (v) => formatSeconds(v),
		micros: (v) => formatMicros(v),
		bytes: (v) => formatBytes(v),
		date: (v) => df.format(new Date(v)),
		dateTime: (v) => dtf.format(new Date(v))
	};
}

const [getContext, setContext] = createContext<I18n>();
export const setI18n = setContext;

/** English, catalog-less instance: what components get when no layout provided one (tests, error pages). */
const FALLBACK = new I18n(() => ({ locale: SOURCE_TRANSLATOR.locale, catalog: {} }));

/** The i18n of the current component tree; plain English when none was provided. */
export function useI18n(): I18n {
	try {
		return getContext();
	} catch {
		return FALLBACK;
	}
}
