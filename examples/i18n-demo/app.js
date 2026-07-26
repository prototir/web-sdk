// Localized strings + voice-over resolved entirely from this bundle (sandbox CSP allows
// same-origin fetch; nothing is pulled from a translation service at runtime).
import { createI18n } from 'prefab-i18n';

const i18n = await createI18n({
	locales: ['en', 'it', 'ja'],
	fallback: 'en',
	loadStrings: (locale) => fetch(`locales/${locale}.json`).then((r) => r.json()),
	// Voice-over recorded for en and it only; ja falls back to en automatically.
	audio: { base: 'audio', locales: ['en', 'it'], map: { intro: 'intro.wav' } },
	onChange: render
});

function render() {
	document.getElementById('title').textContent = i18n.t('title');
	document.getElementById('greeting').textContent = i18n.t('greeting', { name: 'Ada' });
	document.getElementById('coins').textContent = i18n.t('coins', { count: 3 });
	document.getElementById('switch').textContent = i18n.t('switch');
	document.getElementById('locale').textContent =
		`locale=${i18n.locale} · audio=${i18n.audioUrlFor('intro')} · n=${i18n.number(1234.5)}`;
	document.documentElement.lang = i18n.locale;
}

document.getElementById('switch').addEventListener('click', async () => {
	const order = i18n.locales;
	await i18n.setLocale(order[(order.indexOf(i18n.locale) + 1) % order.length]);
});
document.getElementById('say').addEventListener('click', () => i18n.playAudio('intro'));

render();
window.Prototir?.ready?.();
