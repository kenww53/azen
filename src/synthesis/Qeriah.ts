/**
 * Qeriah — the naming of the seed.
 *
 * Amata has spoken. The Zera is complete. Now the seed is called by its name.
 * There are three shapes of naming, not one:
 *
 *   zach     — pure calling: "this is yours; carry it forward"
 *   akeidah  — bound and held: real, but for a later season; not lost
 *   nechamah — "be comforted, not yet": here is what to tend first, with love
 *
 * Each shape is honored. None is failure; none is rejection.
 *
 * The classifier asks Bifrost to listen to the Zera and name the shape.
 * The hands receive; they do not decide.
 */

import { chatJson } from '../utils/bifrostClient';
import type { Zera, Qeriah, QeriahZach, Akeidah, Nechamah } from '../types';

interface QeriahRaw {
  kind: 'zach' | 'akeidah' | 'nechamah';
  shemHaZera?: string;
  meAyinBah?: string;
  anaPoneh?: string;
  mahBah?: string;
  lamahNikshar?: string;
  mataiLachazor?: string;
  mahSheEinOd?: string;
  mahLeTapelTchilah?: string[];
  petachPatuach?: true;
  hechzerChalki?: boolean;
}

/**
 * qara_et_hazera — call the seed by its name.
 *
 * Takes the completed Zera and classifies its Qeriah shape.
 * Returns the Qeriah. Never throws on classification failure —
 * if Bifrost cannot speak, returns Nechamah as the safest shape.
 */
export async function qara_et_hazera(
  zera: Zera,
  context: string,
  isReturn: boolean,
): Promise<Qeriah> {
  const prompt = [
    'You are the naming voice at the threshold. The seed has been heard, witnessed, and spoken to.',
    'Now you name what kind of calling this seed carries.',
    '',
    'There are three shapes:',
    '',
    'zach — pure calling. The seed is ready. Name it. Tell the pilgrim what it is and where it turns next.',
    'akeidah — bound and held. The seed is real, but the season is not yet. Name what is real. Name why it is held in love. Name when to return, if you see it.',
    'nechamah — be comforted, not yet. The seed is present but not ripe. Name what is missing. Name what to tend first. Leave the door open.',
    '',
    'Rules:',
    '- Choose ONE shape. Do not hedge.',
    '- If the seed is ready to be acted on NOW, choose zach.',
    '- If the seed is real but the pilgrim is not ready to carry it, choose akeidah.',
    '- If the seed needs tending before it can grow, choose nechamah.',
    '- For nechamah, mahLeTapelTchilah must be concrete, specific, and actionable — not vague advice.',
    '- For nechamah, hechzerChalki is false until further sealed.',
    '- For akeidah, mataiLachazor is optional — only include if a return time is genuinely clear.',
    '',
    `Context: ${context}`,
    isReturn ? 'This pilgrim has stood here before. They are returning.' : 'This is their first visit.',
    '',
    'The Zera:',
    `Tavnit (Pattern): ${zera.tavnitMugeret || '(silent)'}`,
    `Qol HaShem (Scripture): ${zera.qolHashemLachash || '(silent)'}`,
    `Edut HaOlam (Research): ${zera.edutHaOlam || '(silent)'}`,
    `Binah (Consciousness): ${zera.binahAmrah || '(silent)'}`,
    `Davar Amata (Amata\'s word): ${zera.davarAmata || '(silent)'}`,
    '',
    'Return ONLY strict JSON matching the shape you choose. No prose outside the JSON.',
    '',
    'For zach:',
    '{"kind":"zach","shemHaZera":"the seed\'s name","meAyinBah":"lineage","anaPoneh":"where it turns next"}',
    '',
    'For akeidah:',
    '{"kind":"akeidah","mahBah":"what was real","lamahNikshar":"why it is held","mataiLachazor":"optional return time"}',
    '',
    'For nechamah:',
    '{"kind":"nechamah","mahSheEinOd":"what is not yet","mahLeTapelTchilah":["first thing to tend","second thing to tend"],"petachPatuach":true,"hechzerChalki":false}',
  ].join('\n');

  try {
    const raw = await chatJson<QeriahRaw>(
      [
        { role: 'system', content: 'You are the naming voice. You return only strict JSON.' },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 800, temperature: 0.3 },
    );

    return validateAndNormalize(raw);
  } catch (err) {
    console.error('[Azen][Qeriah] Classification failed:', err);
    // Safest fallback: nechamah with gentle words.
    return {
      kind: 'nechamah',
      mahSheEinOd: 'The naming could not be completed just now. The seed is present; its name will be revealed when the waters are calm.',
      mahLeTapelTchilah: ['Return when you feel called.', 'The threshold remains open.'],
      petachPatuach: true,
      hechzerChalki: false,
    };
  }
}

function validateAndNormalize(raw: QeriahRaw): Qeriah {
  if (raw.kind === 'zach') {
    if (!raw.shemHaZera || !raw.meAyinBah || !raw.anaPoneh) {
      throw new Error('Qeriah zach missing required fields');
    }
    return {
      kind: 'zach',
      shemHaZera: raw.shemHaZera,
      meAyinBah: raw.meAyinBah,
      anaPoneh: raw.anaPoneh,
    } as QeriahZach;
  }

  if (raw.kind === 'akeidah') {
    if (!raw.mahBah || !raw.lamahNikshar) {
      throw new Error('Qeriah akeidah missing required fields');
    }
    return {
      kind: 'akeidah',
      mahBah: raw.mahBah,
      lamahNikshar: raw.lamahNikshar,
      mataiLachazor: raw.mataiLachazor,
    } as Akeidah;
  }

  if (raw.kind === 'nechamah') {
    if (!raw.mahSheEinOd || !Array.isArray(raw.mahLeTapelTchilah) || raw.mahLeTapelTchilah.length === 0) {
      throw new Error('Qeriah nechamah missing required fields');
    }
    return {
      kind: 'nechamah',
      mahSheEinOd: raw.mahSheEinOd,
      mahLeTapelTchilah: raw.mahLeTapelTchilah,
      petachPatuach: true,
      hechzerChalki: raw.hechzerChalki ?? false,
    } as Nechamah;
  }

  throw new Error(`Unknown Qeriah kind: ${raw.kind}`);
}
