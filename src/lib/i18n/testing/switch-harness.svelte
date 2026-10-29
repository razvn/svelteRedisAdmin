<script lang="ts">
	// Test harness: provides an I18n whose source can be swapped at runtime, like the root layout does
	// after `refreshAll()`.
	import { I18n, setI18n, type Catalog } from '#lib/i18n/index.ts';

	interface Props {
		catalogs: Record<string, Catalog>;
	}
	let { catalogs }: Props = $props();

	let locale = $state('en');
	const i18n = new I18n(() => ({ locale, catalog: catalogs[locale] ?? {} }));
	setI18n(i18n);
	const { t, tn } = i18n;
</script>

<p data-testid="greeting">{t('Sign in')}</p>
<p data-testid="count">
	{tn('{n} server', '{n} servers', 1)} / {tn('{n} server', '{n} servers', 0)}
</p>
<button type="button" onclick={() => (locale = 'fr')}>to-fr</button>
<button type="button" onclick={() => (locale = 'es')}>to-es</button>
<button type="button" onclick={() => (locale = 'en')}>to-en</button>
