// AI chat toy: a character you talk to via prefab-ai-npc (Prototir.ai broker). Deliberately
// demos the AI quota UX, not just the happy path — every failure mode a real player might
// hit (missing key, quota exhausted, moderation, not running inside the real shell) is
// mapped to a plain in-character-adjacent message instead of a raw error.
import { createNpc } from 'prefab-ai-npc';

const log = document.getElementById('log');
const form = document.getElementById('form');
const input = document.getElementById('text');

const npc = createNpc({
	persona:
		'Milo, a retired lighthouse keeper who tells short, warm stories and asks curious questions back.',
	provider: 'anthropic'
});

function addLine(who, text) {
	const p = document.createElement('p');
	p.className = who;
	p.textContent = `${who === 'npc' ? 'Milo' : 'You'}: ${text}`;
	log.appendChild(p);
	log.scrollTop = log.scrollHeight;
}

const ERROR_MESSAGES = {
	not_framed: "Milo can't hear you outside the Prototir shell — open this prototype's real page to talk to him.",
	missing_user_key: 'This prototype needs your own AI key to talk to Milo — add one in your Prototir profile, then try again.',
	missing_creator_key: "The creator hasn't set up Milo's AI key yet.",
	quota_exceeded: "Milo's had a lot of visitors today — the free quota is used up, try again tomorrow.",
	prompt_rejected: "Milo didn't want to answer that one.",
	timeout: 'Milo is taking a while to think — try again.'
};

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const text = input.value.trim();
	if (!text) return;
	input.value = '';
	input.disabled = true;
	addLine('user', text);
	try {
		const reply = await npc.say(text);
		addLine('npc', reply);
	} catch (error) {
		addLine('npc', ERROR_MESSAGES[error?.code] ?? "Milo can't talk right now.");
	} finally {
		input.disabled = false;
		input.focus();
	}
});

Prototir.ready();
