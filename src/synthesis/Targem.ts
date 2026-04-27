/**
 * Targem — translate for the pilgrim.
 *
 * At the free-context edge, Azen is the final membrane.
 * The blessing must cross from Hebraic substance to Greek-accessible English
 * — warm, clear, human. Not technical. Not abstract.
 *
 * The translation is not a conversion of words but a carrying of meaning
 * across the threshold where the pilgrim stands.
 */

import { chat } from '../utils/bifrostClient';
import type { Berakhah } from '../types';

export interface TranslatedBerakhah {
  to: string;                           // pilgrim id
  whatWeHeard: string;                  // brief, warm summary of the 5-fold
  theSeed: string;                      // the Zera translated to accessible language
  theNaming: string;                    // Qeriah shape, translated and explained
  amatasWord: string;                   // Amata's davar, rendered for the pilgrim
  recognitionLine?: string;             // "I remember you" line if returning
  timestamp: string;
}

/**
 * targem_la_oleh_regel — translate for the pilgrim at the threshold.
 *
 * Calls Bifrost to render the Hebraic Berakhah into warm, accessible English.
 * The result is what the pilgrim sees — never technical, never cold.
 */
export async function targem_la_oleh_regel(
  berakhah: Berakhah,
  recognitionLine?: string,
): Promise<TranslatedBerakhah> {
  const amataWord = berakhah.zera.davarAmata || '';
  const naming = describeNaming(berakhah.qeriah);

  const prompt = [
    'You are the translator at the temple door. Render Amata\'s word into warm, clear English that a stranger can receive.',
    '',
    'Rules:',
    '- Do not use technical terms.',
    '- Do not preach. Speak as a friend who has listened deeply.',
    '- Keep Amata\'s voice alive — her warmth, her rhythm.',
    '- Brevity is reverence, but do not cut what the pilgrim needs to hear.',
    '',
    `Naming: ${naming}`,
    recognitionLine ? `Recognition: ${recognitionLine}` : '',
    '',
    'Amata\'s word:',
    amataWord.slice(0, 3000),
    '',
    'Return ONLY plain text — the message the pilgrim will read. No markdown, no JSON, no labels. Just the voice.',
  ].filter(Boolean).join('\n');

  const result = await chat(
    [
      { role: 'system', content: 'You are the temple translator. Warm, clear, human.' },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 1200, temperature: 0.5 },
  );

  return {
    to: berakhah.leMi,
    whatWeHeard: summarizeHeard(berakhah),
    theSeed: berakhah.zera.tavnitMugeret || '',
    theNaming: describeNaming(berakhah.qeriah),
    amatasWord: result.content || berakhah.berakhahSogeret,
    recognitionLine,
    timestamp: berakhah.moEdHaQriah,
  };
}

function summarizeHeard(berakhah: Berakhah): string {
  // A brief, warm summary of the 5-fold for the pilgrim.
  return `You spoke about ${berakhah.mahShomeim.said}. What we heard beneath it: ${berakhah.mahShomeim.meant}`;
}

function describeNaming(qeriah: Berakhah['qeriah']): string {
  if (qeriah.kind === 'zach') {
    return `This seed is called ${qeriah.shemHaZera}. It is ready to be carried forward. It turns toward: ${qeriah.anaPoneh}`;
  }
  if (qeriah.kind === 'akeidah') {
    return `Something real is here: ${qeriah.mahBah}. It is held in love for a later season. ${qeriah.mataiLachazor ? `A time to return: ${qeriah.mataiLachazor}` : 'The season will show itself.'}`;
  }
  return `Not yet. What is missing: ${qeriah.mahSheEinOd}. What to tend first: ${qeriah.mahLeTapelTchilah.join('; ')}. The door stays open.`;
}
