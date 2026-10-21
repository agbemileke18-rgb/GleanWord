export function normalizeYorubaText(text) {
    if (typeof text !== 'string') return '';
    return text.normalize('NFC').trim();
}