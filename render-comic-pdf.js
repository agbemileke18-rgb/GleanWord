const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas, DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');

globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;

function emit(event) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function renderPdfPage(pdfDocument, pageNumber, outputDirectory) {
    emit({ type: 'stage', pageNumber, stage: 'PDF.js getPage started' });
    const page = await pdfDocument.getPage(pageNumber);
    emit({ type: 'stage', pageNumber, stage: 'PDF.js getPage completed' });

    const originalViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 2000 / Math.max(originalViewport.width, originalViewport.height));
    const viewport = page.getViewport({ scale });
    emit({
        type: 'stage',
        pageNumber,
        stage: 'page viewport calculated',
        width: viewport.width,
        height: viewport.height,
        scale
    });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    emit({
        type: 'stage',
        pageNumber,
        stage: 'NAPI canvas created',
        width: canvas.width,
        height: canvas.height
    });

    try {
        emit({ type: 'stage', pageNumber, stage: 'PDF.js page render started' });
        await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport
        }).promise;
        emit({ type: 'stage', pageNumber, stage: 'PDF.js page render completed' });

        emit({ type: 'stage', pageNumber, stage: 'WebP encoding started' });
        const webp = await canvas.encode('webp', 82);
        if (!webp.length) throw new Error(`Failed to render PDF page ${pageNumber}.`);

        const fileName = `page-${pageNumber}.webp`;
        await fs.writeFile(path.join(outputDirectory, fileName), webp);
        emit({
            type: 'page',
            pageNumber,
            fileName,
            bytes: webp.length,
            width: canvas.width,
            height: canvas.height
        });
    } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
        emit({ type: 'stage', pageNumber, stage: 'page and canvas cleanup completed' });
    }
}

async function main() {
    const [, , pdfPath, outputDirectory] = process.argv;
    if (!pdfPath || !outputDirectory) {
        throw new Error('Expected PDF input and output directory paths.');
    }

    emit({ type: 'stage', stage: 'PDF.js module import started' });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    emit({ type: 'stage', stage: 'PDF.js module import completed' });
    emit({ type: 'stage', stage: 'PDF document loading started' });
    const pdfDocument = await pdfjs.getDocument({
        data: new Uint8Array(await fs.readFile(pdfPath)),
        useSystemFonts: true
    }).promise;
    emit({
        type: 'stage',
        stage: 'PDF document loading completed',
        pageCount: pdfDocument.numPages
    });

    try {
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
            emit({ type: 'stage', pageNumber, stage: 'PDF page rendering started' });
            await renderPdfPage(pdfDocument, pageNumber, outputDirectory);
        }
    } finally {
        await pdfDocument.destroy();
    }

    emit({ type: 'complete', pageCount: pdfDocument.numPages });
}

main().catch(error => {
    emit({
        type: 'error',
        message: error.message || 'PDF rendering failed.',
        stack: error.stack || null
    });
    process.exitCode = 1;
});
