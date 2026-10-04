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

/**
 * A positional array of bare strings.
 *
 * Babele's `structured` converter cannot reach these: it merges a translation
 * object into each entry, and there is nothing to merge into a string. The
 * system stores a class's background questions and connection prompts this way,
 * so the array is matched by index and a null entry leaves the original.
 */
const stringArray = {
    translate({ value, translation }) {
        if (!Array.isArray(value)) return value;
        if (!Array.isArray(translation)) return value;
        return value.map((entry, index) => {
            const translated = translation[index];
            return typeof translated === 'string' && translated.length ? translated : entry;
        });
    },

    extract({ value }) {
        return Array.isArray(value) ? [...value] : undefined;
    }
};

/**
 * Leaf strings at named keys, anywhere inside a nested plain structure.
 *
 * `structured` can only descend through levels that have a fixed field name.
 * `system.levelupOptionTiers` is keyed twice over — by tier, then by a random
 * id — so neither level can be named in a mapping. This walks the original's
 * own shape instead and translates only the keys listed in `fields`, which
 * keeps the dice types and costs sitting beside the label untouched.
 */
const leafFields = {
    translate({ value, translation, params }) {
        const fields = params?.fields ?? [];
        return walk(value, translation, fields);
    },

    extract({ value, params }) {
        const fields = params?.fields ?? [];
        return harvest(value, fields);
    }
};

const isPlain = value => !!value && typeof value === 'object' && !Array.isArray(value);

function walk(original, translation, fields) {
    if (!isPlain(original) || !isPlain(translation)) return original;
    const out = Array.isArray(original) ? [...original] : { ...original };
    for (const [key, entry] of Object.entries(original)) {
        const translated = translation[key];
        if (translated === undefined || translated === null) continue;
        if (fields.includes(key)) {
            if (typeof entry === 'string' && typeof translated === 'string' && translated.length) {
                out[key] = translated;
            }
            continue;
        }
        out[key] = walk(entry, translated, fields);
    }
    return out;
}

function harvest(original, fields) {
    if (!isPlain(original)) return undefined;
    const out = {};
    for (const [key, entry] of Object.entries(original)) {
        if (fields.includes(key)) {
            if (typeof entry === 'string' && entry.length) out[key] = entry;
            continue;
        }
        const nested = harvest(entry, fields);
        if (nested && Object.keys(nested).length) out[key] = nested;
    }
    return Object.keys(out).length ? out : undefined;
}

Hooks.once('init', () => {
    /*
     * game.babele, not the Babele.get() seen in older translation modules:
     * that has been deprecated since Babele 2.5.5 and is dropped in 4.
     */
    if (!game.babele) return;

    game.babele.registerConverters({ stringArray, leafFields });

    game.babele.register({
        module: MODULE_ID,
        lang: LANG,
        dir: `babele/${LANG}`
    });
});
