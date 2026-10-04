/**
 * Babele's own mapping code, wired up outside Foundry.
 *
 * This is not a mock: it imports Babele's DocumentMappings, ConverterRegistry
 * and FieldMapping from an installed copy of the module and runs them against
 * this module's real mappings.json and converters. What it leaves out is the
 * browser -- the compendium runtime, embedded-document traversal and anything
 * visual -- so it answers "does this mapping reach this field", and the shape
 * Babele expects a translation file to have, and nothing more.
 *
 * Point it at an installed Babele with BABELE_PATH or a first argument.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BABELE = process.env.BABELE_PATH ?? process.argv[2];
if (!BABELE) {
    console.error('Pass the installed Babele module path as an argument, or set BABELE_PATH.');
    process.exit(1);
}

/* The slice of the Foundry API Babele's mapping layer calls. */
const isPlainObject = value =>
    !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) !== null
        ? Object.getPrototypeOf(value) === Object.prototype
        : false;

function mergeObject(original, other = {}, { inplace = true } = {}) {
    const target = inplace ? original : structuredClone(original);
    for (const [key, value] of Object.entries(other)) {
        if (isPlainObject(value) && isPlainObject(target[key])) {
            target[key] = mergeObject(target[key], value, { inplace: false });
        } else {
            target[key] = value;
        }
    }
    return target;
}

const getProperty = (object, key) =>
    String(key ?? '')
        .split('.')
        .filter(Boolean)
        .reduce((node, segment) => (node == null ? undefined : node[segment]), object);

class Collection extends Map {
    get contents() {
        return [...this.values()];
    }
}

globalThis.foundry = { utils: { mergeObject, getProperty, parseUuid: () => null, Collection } };

const { DocumentMappings } = await import(path.join(BABELE, 'script/mapping/document-mappings.js'));
const { ConverterRegistry } = await import(path.join(BABELE, 'script/converter/converter-registry.js'));
const { IdentityExtractorRegistry } = await import(
    path.join(BABELE, 'script/identity/identity-extractor-registry.js')
);
const { Converters } = await import(path.join(BABELE, 'script/converter/converters.js'));
const { StructuredDataConverter } = await import(path.join(BABELE, 'script/converter/structured-data-converter.js'));
const { DocumentConverter } = await import(path.join(BABELE, 'script/converter/document-converter.js'));
const { ReferencedDocumentFieldConverter } = await import(
    path.join(BABELE, 'script/converter/referenced-document-field-converter.js')
);

/* The two converters this module registers, imported from the module itself. */
const converterSource = await fs.readFile(new URL('../scripts/babele.mjs', import.meta.url), 'utf8');
const converters = await import(
    `data:text/javascript;base64,${Buffer.from(
        `${converterSource.replace(/Hooks\.once[\s\S]*$/, '')}\nexport { stringArray, leafFields };`
    ).toString('base64')}`
);

const converterRegistry = new ConverterRegistry({
    ...Converters.legacyRegistrations(),
    document: new DocumentConverter(),
    structured: new StructuredDataConverter(),
    referencedDocumentField: new ReferencedDocumentFieldConverter(),
    stringArray: converters.stringArray,
    leafFields: converters.leafFields
});
const identityExtractors = new IdentityExtractorRegistry(IdentityExtractorRegistry.defaultExtractors());

const mappingFile = JSON.parse(await fs.readFile(new URL('../babele/ja/mappings.json', import.meta.url), 'utf8'));
const mappings = new DocumentMappings(undefined, {
    loadedMappings: [mappingFile],
    identityExtractors,
    converterRegistry
});


/*
 * The embedded-document converters (`items`, `effects`) ask the current
 * compendium for the mapping set, so the runtime needs one. Embedded recursion
 * itself was proven in the live run; here it only has to not throw.
 */
const runtime = {
    currentCompendium: {
        documentMappings: mappings,
        translationMatchStrategies: () => undefined,
        translateField: () => undefined
    }
};

/** Apply a document type's mapping to one document. */
export function translate(documentType, data, translations) {
    const mapping = mappings.mappingFor(documentType);
    mapping.prepare(data, translations, runtime);
    return mergeObject(structuredClone(data), mapping.map(data, translations, runtime), { inplace: false });
}

/** Ask Babele what a translation file for this document should look like. */
export function extract(documentType, data) {
    const mapping = mappings.mappingFor(documentType);
    mapping.prepare(data, {}, runtime);
    return mapping.extract(data, runtime);
}

export { mappings, mergeObject, runtime };
