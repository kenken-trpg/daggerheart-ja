/**
 * Register this module's compendium translations with Babele.
 *
 * Foundry core can only translate UI strings; compendium content needs a module,
 * and Babele is the established one. It overlays translations in memory at read
 * time, so the official system's packs are never modified and English remains
 * one toggle away.
 *
 * Babele is optional. Without it the UI is still Japanese and the compendium
 * content stays English, so this file does nothing rather than failing.
 */

const MODULE_ID = 'daggerheart-ja';
const LANG = 'ja';

Hooks.once('init', () => {
    /*
     * game.babele, not the Babele.get() seen in older translation modules:
     * that has been deprecated since Babele 2.5.5 and is dropped in 4.
     */
    if (!game.babele) return;

    game.babele.register({
        module: MODULE_ID,
        lang: LANG,
        dir: `babele/${LANG}`
    });
});
