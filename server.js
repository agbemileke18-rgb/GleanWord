require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const https = require('https');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const mammoth = require('mammoth');
const { createCanvas, DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');
globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;
const { PDFParse } = require('pdf-parse');
const app = express();

process.on('uncaughtException', error => {
    console.error('[process] Uncaught exception:', error?.stack || error);
    process.exit(1);
});

process.on('unhandledRejection', reason => {
    console.error(
        '[process] Unhandled promise rejection:',
        reason?.stack || reason
    );
});

app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_BOOK_UPLOAD_BYTES = 50 * 1024 * 1024;
const TEXT_DOCUMENT_CATEGORIES = ['novel', 'grammar', 'literature', 'poetry'];
const SUPPORTED_DOCUMENT_CATEGORIES = [...TEXT_DOCUMENT_CATEGORIES, 'comic'];

function logImportSupabaseError(requestId, stage, error) {
    console.error(`[import:${requestId}] ${stage} Supabase error`, {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        error
    });
}

async function runImportSupabaseOperation(requestId, stage, operation) {
    console.log(`[import:${requestId}] ${stage}: started`);
    try {
        const result = await operation();
        console.log(`[import:${requestId}] ${stage}: Supabase result`, {
            data: result?.data ?? null,
            error: result?.error ?? null
        });
        if (result?.error) {
            logImportSupabaseError(requestId, stage, result.error);
        } else {
            console.log(`[import:${requestId}] ${stage}: completed`);
        }
        return result;
    } catch (error) {
        console.error(`[import:${requestId}] ${stage}: threw`, error?.stack || error);
        throw error;
    }
}

const BANK_CODE_TO_NAME = {
  '058': 'Guaranty Trust Bank (GTB)',
  '057': 'Zenith Bank',
  '044': 'Access Bank',
  '033': 'United Bank for Africa (UBA)',
  '011': 'First Bank of Nigeria',
  '214': 'First City Monument Bank (FCMB)',
  '070': 'Fidelity Bank',
  '035': 'Wema Bank',
  '232': 'Sterling Bank',
  '50211': 'Kuda MFB',
  '50515': 'Moniepoint MFB',
  '999992': 'OPay',
  '999991': 'PalmPay'
};

async function createFlutterwaveTransfer(transferDetails) {
    const body = JSON.stringify(transferDetails);
    const responseData = await new Promise((resolve, reject) => {
        const request = https.request('https://api.flutterwave.com/v3/transfers', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            agent: process.env.FIXIE_URL ? new HttpsProxyAgent(process.env.FIXIE_URL) : undefined
        }, response => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { responseBody += chunk; });
            response.on('end', () => {
                try {
                    resolve({ statusCode: response.statusCode, data: JSON.parse(responseBody) });
                } catch (err) {
                    reject(new Error(`Invalid JSON response from Flutterwave: ${err.message}`));
                }
            });
        });

        request.on('error', reject);
        request.end(body);
    });

    const { statusCode, data } = responseData;
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(data.message || `Flutterwave transfer request failed with status ${statusCode}.`);
    }
    if (data.status !== 'success') {
        throw new Error(data.message || 'Flutterwave did not create the transfer.');
    }

    return data;
}

function createFlutterwaveReference(reference) {
    return `GW-${crypto.createHash('sha256').update(String(reference)).digest('hex').slice(0, 32)}`;
}

async function requestMatchesUser(req, userId) {
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken || !userId) return false;

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    return !error && user?.id === userId;
}

function splitDocumentIntoSections(text, category, pdfPages = []) {
    const rawPages = String(text || '')
        .replace(/\u0000/g, '')
        .replace(/\r\n?/g, '\n')
        .split(/\f+/)
        .map(page => page.trim())
        .filter(Boolean);
    const normalizedText = rawPages
        .join('\n\n')
        .trim();
    const headingPattern = /^(?:(?:chapter|part|section|book|act|scene)\s+(?:\d+|[ivxlcdm]+|[a-z]+)(?:\s*[:.\-–—]\s*.*)?|prologue|epilogue)\s*$/i;
    const lines = normalizedText.split('\n');
    const sections = [];
    let activeTitle = null;
    let activeLines = [];

    const pushSection = () => {
        const content = activeLines.join('\n').trim();
        if (content) {
            sections.push({
                title: activeTitle || (category === 'poetry' ? `Poem ${sections.length + 1}` : `Section ${sections.length + 1}`),
                content
            });
        }
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length <= 120 && headingPattern.test(trimmedLine)) {
            pushSection();
            activeTitle = trimmedLine;
            activeLines = [];
        } else {
            activeLines.push(line);
        }
    }
    pushSection();

    if (sections.length > 1 || (sections.length === 1 && activeTitle)) {
        return sections;
    }

    const pageSections = (pdfPages.length > 1 ? pdfPages : rawPages.length > 1 ? rawPages : [])
        .map(page => String(page || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim())
        .filter(Boolean);

    if (pageSections.length > 1) {
        return pageSections.map((content, index) => ({
            title: category === 'poetry' ? `Poem ${index + 1}` : `Section ${index + 1}`,
            content
        }));
    }

    if (!normalizedText) return [];
    return [{
        title: category === 'poetry' ? 'Poem 1' : 'Beginning',
        content: normalizedText
    }];
}

async function insertRowsInBatches(tableName, rows, requestId) {
    for (let offset = 0; offset < rows.length; offset += 100) {
        const batchNumber = Math.floor(offset / 100) + 1;
        const { error } = await runImportSupabaseOperation(
            requestId,
            `${tableName} insert batch ${batchNumber} (${Math.min(offset + 100, rows.length)}/${rows.length} rows)`,
            () => supabaseAdmin
                .from(tableName)
                .insert(rows.slice(offset, offset + 100))
                .select(tableName === 'comic_pages'
                    ? 'id, book_id, chapter_number, page_number, image_url, created_at'
                    : 'id, work_id, chapter_number, title')
        );
        if (error) return error;
    }
    return null;
}

async function extractDocumentSections(buffer, fileType, category) {
    if (fileType === 'docx') {
        const result = await mammoth.convertToHtml({ buffer }, {
            styleMap: ["br[type='page'] => hr:fresh"]
        });
        const text = result.value
            .replace(/<hr\b[^>]*\/?>/gi, '\f')
            .replace(/<br\b[^>]*\/?>/gi, '\n')
            .replace(/<\/(?:p|h[1-6]|li|div|blockquote|pre)>/gi, '\n\n')
            .replace(/<li\b[^>]*>/gi, '- ')
            .replace(/<[^>]+>/g, '')
            .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, value) => {
                if (value[0] === '#') {
                    const codePoint = value[1].toLowerCase() === 'x'
                        ? parseInt(value.slice(2), 16)
                        : parseInt(value.slice(1), 10);
                    return Number.isFinite(codePoint) && codePoint <= 0x10ffff
                        ? String.fromCodePoint(codePoint)
                        : entity;
                }
                return {
                    amp: '&',
                    lt: '<',
                    gt: '>',
                    quot: '"',
                    apos: "'",
                    nbsp: '\u00a0'
                }[value.toLowerCase()] || entity;
            });
        return splitDocumentIntoSections(text, category);
    }

    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
        const result = await parser.getText();
        if (category === 'comic') {
            return { pageCount: result.total };
        }
        return splitDocumentIntoSections(
            result.text,
            category,
            result.pages.map(page => page.text)
        );
    } finally {
        await parser.destroy();
    }
}

async function renderComicPdfPages(buffer, onPage, onPageStart = () => {}, onRenderStage = () => {}, requestId) {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'gleanword-comic-'));
    const pdfPath = path.join(tempDirectory, 'source.pdf');
    const outputDirectory = path.join(tempDirectory, 'pages');
    await fs.mkdir(outputDirectory);
    await fs.writeFile(pdfPath, buffer);

    try {
        const child = spawn(process.execPath, [
            path.join(__dirname, 'render-comic-pdf.js'),
            pdfPath,
            outputDirectory
        ], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let outputBuffer = '';
        let completedPageCount = null;
        let rendererError = null;
        let lastRendererStage = 'renderer startup';
        const renderedPages = [];

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            outputBuffer += chunk;
            const lines = outputBuffer.split(/\r?\n/);
            outputBuffer = lines.pop() || '';
            for (const line of lines) {
                if (!line) continue;
                try {
                    const event = JSON.parse(line);
                    if (event.type === 'stage') {
                        lastRendererStage = event.stage;
                        if (event.pageNumber) onPageStart(event.pageNumber);
                        onRenderStage(event.stage, event);
                    } else if (event.type === 'page') {
                        renderedPages.push(event);
                        onRenderStage('PDF page rendered in isolated process', event);
                    } else if (event.type === 'complete') {
                        completedPageCount = event.pageCount;
                    } else if (event.type === 'error') {
                        rendererError = new Error(event.message);
                        rendererError.stack = event.stack || rendererError.stack;
                    }
                } catch (error) {
                    rendererError = new Error(`Invalid output from PDF renderer: ${error.message}`);
                    child.kill();
                }
            }
        });

        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => {
            console.error(`[import:${requestId}] PDF renderer stderr: ${chunk.trimEnd()}`);
        });

        const childResult = await new Promise((resolve, reject) => {
            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill();
            }, 15 * 60 * 1000);
            timeout.unref();
            child.once('error', error => {
                clearTimeout(timeout);
                reject(error);
            });
            child.once('close', (code, signal) => {
                clearTimeout(timeout);
                if (timedOut) {
                    reject(new Error('Comic PDF rendering exceeded its 15-minute timeout.'));
                } else {
                    resolve({ code, signal });
                }
            });
        });

        if (outputBuffer.trim()) {
            try {
                const event = JSON.parse(outputBuffer);
                if (event.type === 'error') {
                    rendererError = new Error(event.message);
                    rendererError.stack = event.stack || rendererError.stack;
                } else if (event.type === 'complete') {
                    completedPageCount = event.pageCount;
                }
            } catch (error) {
                rendererError ||= new Error(`Invalid final output from PDF renderer: ${error.message}`);
            }
        }

        if (rendererError) throw rendererError;
        if (childResult.code !== 0) {
            throw new Error(
                `Isolated PDF renderer exited with code ${childResult.code ?? 'unknown'}` +
                `${childResult.signal ? ` (${childResult.signal})` : ''} during ${lastRendererStage}.`
            );
        }
        if (completedPageCount === null || renderedPages.length !== completedPageCount) {
            throw new Error(
                `PDF renderer completed ${renderedPages.length} pages, expected ${completedPageCount ?? 'unknown'}.`
            );
        }

        for (const page of renderedPages) {
            const image = await fs.readFile(path.join(outputDirectory, `page-${page.pageNumber}.webp`));
            await onPage(page.pageNumber, image);
        }
        return completedPageCount;
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
    }
}

app.post('/api/import-book', async (req, res) => {
    const requestId = crypto.randomUUID();
    let uploadedPagePaths = [];
    let workId;
    let importStep = 'request validation';
    let comicRowsInsertStarted = false;
    console.log(`[import:${requestId}] /api/import-book request received`, {
        method: req.method,
        contentLength: req.get('content-length') || null,
        contentType: req.get('content-type') || null
    });
    try {
        importStep = 'author authentication';
        console.log(`[import:${requestId}] Stage started: ${importStep}`);
        const authorization = req.headers.authorization || '';
        const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!accessToken) {
            return res.status(401).json({ error: 'Sign in to import a book.' });
        }

        const { data: { user }, error: authError } = await runImportSupabaseOperation(
            requestId,
            'Supabase auth user lookup',
            () => supabaseAdmin.auth.getUser(accessToken)
        );
        if (authError || !user) {
            return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        }

        const {
            workId: requestedWorkId,
            sourceFilePath,
            sourceFileType,
            sourceFileName,
            sourceFileMimeType,
            sourceFileSize
        } = req.body || {};
        workId = requestedWorkId;
        if (!workId) return res.status(400).json({ error: 'A work ID is required.' });
        console.log(`[import:${requestId}] Client source file metadata`, {
            originalname: sourceFileName || sourceFilePath?.split('/').pop() || null,
            mimetype: sourceFileMimeType || null,
            size: Number.isFinite(Number(sourceFileSize)) ? Number(sourceFileSize) : null,
            fileType: sourceFileType || null,
            sourceFilePath,
            workId
        });

        importStep = 'work lookup';
        console.log(`[import:${requestId}] Stage started: ${importStep}`);
        const { data: work, error: workError } = await runImportSupabaseOperation(
            requestId,
            'works lookup',
            () => supabaseAdmin
                .from('works')
                .select('id, author_id, title, category')
                .eq('id', workId)
                .eq('author_id', user.id)
                .single()
        );

        if (workError || !work) {
            console.error('Document import work lookup failed:', workError);
            return res.status(404).json({ error: 'The work could not be found for this author.' });
        }

        const fileType = String(sourceFileType || '').toLowerCase();
        console.log(`[import:${requestId}] Work category and file type`, {
            category: work.category,
            fileType
        });
        if (!['pdf', 'docx'].includes(fileType) ||
            !SUPPORTED_DOCUMENT_CATEGORIES.includes(work.category) ||
            (work.category === 'comic' && fileType !== 'pdf')) {
            return res.status(400).json({ error: 'The source file type or book category is not supported.' });
        }

        const expectedPathPrefix = `${user.id}/${work.id}/`;
        if (typeof sourceFilePath !== 'string' ||
            !sourceFilePath.startsWith(expectedPathPrefix) ||
            sourceFilePath.split('/').some(part => part === '..')) {
            return res.status(400).json({ error: 'The source file path is invalid.' });
        }

        const tableName = work.category === 'comic' ? 'comic_pages' : 'chapters';
        importStep = 'existing content lookup';
        console.log(`[import:${requestId}] Stage started: ${importStep}`);
        const { data: existingRows, error: existingError } = await runImportSupabaseOperation(
            requestId,
            `${tableName} existing content lookup`,
            () => supabaseAdmin
                .from(tableName)
                .select('id')
                .eq(work.category === 'comic' ? 'book_id' : 'work_id', work.id)
                .limit(1)
        );

        if (existingError) {
            console.error(`Existing ${tableName} lookup failed:`, existingError);
            return res.status(500).json({ error: 'Could not check the existing book content.' });
        }
        if (existingRows?.length) {
            return res.status(409).json({ error: 'This work already has content. Import requires an empty work.' });
        }

        importStep = 'source file download';
        console.log(`[import:${requestId}] Stage started: ${importStep} from book-uploads`, {
            sourceFilePath
        });
        const { data: sourceFile, error: downloadError } = await runImportSupabaseOperation(
            requestId,
            'book-uploads storage download',
            () => supabaseAdmin.storage
                .from('book-uploads')
                .download(sourceFilePath)
        );
        if (downloadError || !sourceFile) {
            console.error('Private source file download failed:', downloadError);
            return res.status(500).json({ error: 'Could not read the uploaded source file.' });
        }

        if (sourceFile.size > MAX_BOOK_UPLOAD_BYTES) {
            return res.status(413).json({ error: 'The source file exceeds the 50 MB limit.' });
        }

        const buffer = Buffer.from(await sourceFile.arrayBuffer());
        console.log(`[import:${requestId}] book-uploads source download finished`, {
            bytes: buffer.length,
            reportedBytes: Number.isFinite(Number(sourceFileSize)) ? Number(sourceFileSize) : null,
            originalname: sourceFileName || sourceFilePath.split('/').pop(),
            mimetype: sourceFileMimeType || sourceFile.type || null
        });
        if (buffer.length > MAX_BOOK_UPLOAD_BYTES) {
            return res.status(413).json({ error: 'The source file exceeds the 50 MB limit.' });
        }

        if (fileType === 'pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') {
            return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
        }
        if (fileType === 'docx' && buffer.subarray(0, 2).toString() !== 'PK') {
            return res.status(400).json({ error: 'The uploaded file is not a valid DOCX document.' });
        }

        importStep = 'source metadata update';
        console.log(`[import:${requestId}] Stage started: ${importStep}`);
        const { error: sourceUpdateError } = await runImportSupabaseOperation(
            requestId,
            'works source metadata update',
            () => supabaseAdmin
                .from('works')
                .update({
                    source_file_path: sourceFilePath,
                    source_file_type: fileType
                })
                .eq('id', work.id)
                .eq('author_id', user.id)
                .select('id, source_file_path, source_file_type')
        );
        if (sourceUpdateError) {
            console.error('Could not save uploaded source file metadata:', sourceUpdateError);
            return res.status(500).json({ error: 'Could not save the source file details.' });
        }

        if (work.category !== 'comic') {
            importStep = `${fileType} text extraction`;
            console.log(`[import:${requestId}] Stage started: ${importStep}`);
            const sections = await extractDocumentSections(buffer, fileType, work.category);
            console.log(`[import:${requestId}] Text extraction finished`, { sectionCount: sections.length });
            if (!sections.length) {
                return res.status(422).json({ error: 'No readable text was found in the document.' });
            }

            const chapterRows = sections.map((section, index) => ({
                work_id: work.id,
                chapter_number: index + 1,
                title: section.title,
                content: section.content
            }));

            importStep = 'chapter database insert';
            console.log(`[import:${requestId}] Stage started: ${importStep}`, { rowCount: chapterRows.length });
            const insertError = await insertRowsInBatches('chapters', chapterRows, requestId);
            if (insertError) {
                logImportSupabaseError(requestId, 'chapters insert', insertError);
                const { error: cleanupError } = await runImportSupabaseOperation(
                    requestId,
                    'chapters partial-row cleanup',
                    () => supabaseAdmin
                        .from('chapters')
                        .delete()
                        .eq('work_id', work.id)
                );
                if (cleanupError) logImportSupabaseError(requestId, 'chapters partial-row cleanup', cleanupError);
                return res.status(500).json({ error: 'Could not save extracted chapters.' });
            }

            console.log(`[import:${requestId}] Import completed successfully`, { chapterCount: chapterRows.length });
            return res.status(200).json({ success: true, chapterCount: chapterRows.length });
        }

        importStep = 'comic PDF page counting';
        console.log(`[import:${requestId}] Stage started: ${importStep}`);
        const { pageCount } = await extractDocumentSections(buffer, fileType, work.category);
        console.log(`[import:${requestId}] Comic PDF page counting finished`, { pageCount });
        if (!pageCount) {
            return res.status(422).json({ error: 'No pages were found in the comic PDF.' });
        }

        const comicPageRows = [];
        importStep = 'comic PDF rendering initialization';
        console.log(`[import:${requestId}] PDF page rendering started`);
        await renderComicPdfPages(buffer, async (pageNumber, webp) => {
            console.log(`[import:${requestId}] PDF page rendered`, {
                pageNumber,
                webpBytes: webp.length
            });
            importStep = `comic page ${pageNumber} storage upload`;
            const pagePath = `${work.id}/page-${pageNumber}.webp`;
            console.log(`[import:${requestId}] comic-pages storage upload started`, {
                pageNumber,
                pagePath,
                bytes: webp.length,
                contentType: 'image/webp'
            });
            const { error: uploadError } = await runImportSupabaseOperation(
                requestId,
                `comic-pages storage upload page ${pageNumber}`,
                () => supabaseAdmin.storage
                    .from('comic-pages')
                    .upload(pagePath, webp, {
                        contentType: 'image/webp',
                        upsert: true
                    })
            );
            if (uploadError) throw new Error(`Could not upload comic page ${pageNumber}: ${uploadError.message}`);
            uploadedPagePaths.push(pagePath);

            const { data: publicUrlData } = await runImportSupabaseOperation(
                requestId,
                `comic-pages public URL lookup page ${pageNumber}`,
                () => Promise.resolve(supabaseAdmin.storage
                    .from('comic-pages')
                    .getPublicUrl(pagePath))
            );
            comicPageRows.push({
                book_id: work.id,
                chapter_number: 1,
                page_number: pageNumber,
                image_url: publicUrlData.publicUrl,
                created_at: new Date().toISOString()
            });
        }, pageNumber => {
            importStep = `comic PDF page ${pageNumber} rendering`;
            console.log(`[import:${requestId}] PDF page rendering started`, { pageNumber });
        }, (stage, details = {}) => {
            importStep = details.pageNumber
                ? `comic PDF page ${details.pageNumber}: ${stage}`
                : `comic PDF rendering: ${stage}`;
            console.log(`[import:${requestId}] ${stage}`, details);
        }, requestId);
        console.log(`[import:${requestId}] PDF page rendering finished`, {
            renderedPages: comicPageRows.length,
            expectedPages: pageCount
        });
        if (comicPageRows.length !== pageCount) {
            throw new Error(`Rendered ${comicPageRows.length} comic pages but the PDF contains ${pageCount} pages.`);
        }

        importStep = 'comic page database insert';
        comicRowsInsertStarted = true;
        console.log(`[import:${requestId}] Stage started: ${importStep}`, {
            rowCount: comicPageRows.length,
            firstRow: comicPageRows[0] || null,
            lastRow: comicPageRows[comicPageRows.length - 1] || null
        });
        const insertError = await insertRowsInBatches('comic_pages', comicPageRows, requestId);
        if (insertError) {
            logImportSupabaseError(requestId, 'comic_pages insert', insertError);
            const { error: pageCleanupError } = await runImportSupabaseOperation(
                requestId,
                'comic_pages partial-row cleanup',
                () => supabaseAdmin
                    .from('comic_pages')
                    .delete()
                    .eq('book_id', work.id)
            );
            if (pageCleanupError) {
                logImportSupabaseError(requestId, 'comic_pages partial-row cleanup', pageCleanupError);
            }
            const { error: cleanupError } = await runImportSupabaseOperation(
                requestId,
                'comic-pages storage cleanup after insert failure',
                () => supabaseAdmin.storage
                    .from('comic-pages')
                    .remove(uploadedPagePaths)
            );
            if (cleanupError) {
                logImportSupabaseError(requestId, 'comic-pages storage cleanup after insert failure', cleanupError);
            }
            return res.status(500).json({ error: 'Could not save extracted comic pages.' });
        }

        console.log(`[import:${requestId}] Comic import completed successfully`, {
            pageCount: comicPageRows.length
        });
        return res.status(200).json({ success: true, pageCount: comicPageRows.length });
    } catch (err) {
        console.error(
            `[import:${requestId}] Document import failed during ${importStep} for work ${workId || 'unknown'}`,
            {
                message: err?.message,
                details: err?.details,
                hint: err?.hint,
                code: err?.code,
                stack: err?.stack,
                error: err
            }
        );
        if (comicRowsInsertStarted && workId) {
            try {
                const { error: rowCleanupError } = await runImportSupabaseOperation(
                    requestId,
                    'comic_pages partial-row cleanup after exception',
                    () => supabaseAdmin
                        .from('comic_pages')
                        .delete()
                        .eq('book_id', workId)
                );
                if (rowCleanupError) {
                    logImportSupabaseError(requestId, 'comic_pages partial-row cleanup after exception', rowCleanupError);
                }
            } catch (rowCleanupError) {
                console.error('Failed to clean up partial imported comic page rows:', rowCleanupError?.stack || rowCleanupError);
            }
        }
        if (uploadedPagePaths.length) {
            try {
                const { error: cleanupError } = await runImportSupabaseOperation(
                    requestId,
                    'comic-pages storage cleanup after exception',
                    () => supabaseAdmin.storage
                        .from('comic-pages')
                        .remove(uploadedPagePaths)
                );
                if (cleanupError) {
                    logImportSupabaseError(requestId, 'comic-pages storage cleanup after exception', cleanupError);
                }
            } catch (cleanupError) {
                console.error('Failed to clean up partial comic page uploads:', cleanupError?.stack || cleanupError);
            }
        }
        if (res.headersSent) {
            return res.end();
        }
        const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
            ? err.status
            : 500;
        return res.status(statusCode).json({
            error: err.message || 'Document import failed.',
            step: importStep
        });
    }
});

app.post('/api/create-subaccount', async (req, res) => {
    try {
        const { userId, businessName, settlementBank, bankName, accountNumber } = req.body;
        const resolvedBankName =
            (bankName && bankName !== settlementBank ? bankName : null) ||
            BANK_CODE_TO_NAME[String(settlementBank)] ||
            settlementBank;
        if (!userId || !settlementBank || !accountNumber) {
            return res.status(400).json({ error: 'Missing required bank or user details.' });
        }
        if (!await requestMatchesUser(req, userId)) {
            return res.status(401).json({ error: 'Sign in as the payout account owner to continue.' });
        }

        const paystackResponse = await fetch('https://api.paystack.co/subaccount', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                business_name: businessName || 'GleanWord Author',
                settlement_bank: settlementBank,
                account_number: accountNumber,
                percentage_charge: 20
            }),
        });

        const paystackData = await paystackResponse.json();

        if (!paystackData.status) {
            return res.status(400).json({
                error: paystackData.message || 'Failed to create Paystack subaccount.'
            });
        }

        const subaccountCode = paystackData.data.subaccount_code;

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                payout_region: 'nigeria',
                paystack_subaccount_code: subaccountCode,
                account_number: accountNumber,
                bank_name: resolvedBankName,
                payout_currency: null,
                intl_payout_details: null
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Supabase profile update error:', dbError);
            return res.status(500).json({ error: 'Failed to save payout profile to database.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Payout account successfully linked!',
            subaccount_code: subaccountCode
        });

    } catch (err) {
        console.error('Server error in /api/create-subaccount:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/register-international-payout', async (req, res) => {
    try {
        const {
            userId,
            currency,
            account_bank,
            account_number,
            routing_number,
            swift_code,
            beneficiary_name,
            beneficiary_address,
            beneficiary_country
        } = req.body;
        const supportedCurrencies = ['USD', 'GBP', 'EUR'];
        const normalizedCurrency = String(currency || '').toUpperCase();
        const normalizedAccountBank = String(account_bank || '').trim();
        const normalizedAccountNumber = String(account_number || '').trim();
        const normalizedRoutingNumber = String(routing_number || '').trim();
        const normalizedSwiftCode = String(swift_code || '').trim().toUpperCase();
        const normalizedBeneficiaryName = String(beneficiary_name || '').trim();
        const normalizedBeneficiaryAddress = String(beneficiary_address || '').trim();
        const normalizedBeneficiaryCountry = String(beneficiary_country || '').trim().toUpperCase();

        if (!userId || !supportedCurrencies.includes(normalizedCurrency) ||
            !normalizedAccountBank || !normalizedAccountNumber || !normalizedBeneficiaryName ||
            !normalizedBeneficiaryAddress || !/^[A-Z]{2}$/.test(normalizedBeneficiaryCountry) ||
            (!normalizedRoutingNumber && !normalizedSwiftCode)) {
            return res.status(400).json({ error: 'Missing or invalid international payout details.' });
        }
        if (!await requestMatchesUser(req, userId)) {
            return res.status(401).json({ error: 'Sign in as the payout account owner to continue.' });
        }

        const intlPayoutDetails = {
            account_bank: normalizedAccountBank,
            account_number: normalizedAccountNumber,
            routing_number: normalizedRoutingNumber || null,
            swift_code: normalizedSwiftCode || null,
            beneficiary_name: normalizedBeneficiaryName,
            beneficiary_address: normalizedBeneficiaryAddress,
            beneficiary_country: normalizedBeneficiaryCountry,
            currency: normalizedCurrency
        };

        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({
                payout_region: 'international',
                payout_currency: normalizedCurrency,
                bank_name: normalizedAccountBank,
                account_number: normalizedAccountNumber,
                intl_payout_details: intlPayoutDetails,
                paystack_subaccount_code: null
            })
            .eq('id', userId);

        if (dbError) {
            console.error('Supabase international payout profile update error:', dbError);
            return res.status(500).json({ error: 'Failed to save payout profile to database.' });
        }

        return res.status(200).json({
            success: true,
            message: 'International payout account successfully linked!'
        });
    } catch (err) {
        console.error('Server error in /api/register-international-payout:', err);
        return res.status(500).json({ error: 'Failed to register international payout account.' });
    }
});

app.post('/webhook/paystack', async (req, res) => {
    try {
        const paystackSignature = req.headers['x-paystack-signature'];
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        const hash = crypto.createHmac('sha512', secretKey)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== paystackSignature) {
            console.warn("⚠️ Unauthorized webhook signature attempt blocked.");
            return res.status(401).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const customerEmail = event.data.customer.email.trim().toLowerCase();
            console.log(`💰 Payment confirmed via webhook for: ${customerEmail}`);

            const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

            if (listError) {
                console.error("Error listing Supabase users:", listError);
                return res.status(500).send('Database error');
            }

            let targetUser = authUsers?.users?.find(u => u.email.toLowerCase() === customerEmail);

            if (!targetUser) {
                console.log(`👤 User ${customerEmail} not found in Supabase Auth. Auto-creating account...`);

                const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email: customerEmail,
                    email_confirm: true
                });

                if (createError) {
                    console.error("❌ Failed to auto-create user:", createError);
                    return res.status(500).send('User creation failed');
                }
                targetUser = createdUser.user;
            }

            const metadata = event.data.metadata || {};
            if (metadata.corpus_id) {
                const corpusId = metadata.corpus_id;
                const amountPaid = event.data.amount / 100;
                const reference = event.data.reference;

                const { error: purchaseError } = await supabaseAdmin
                    .from('user_purchases')
                    .upsert([{
                        user_id: targetUser.id,
                        corpus_id: corpusId,
                        paystack_reference: reference,
                        amount: amountPaid,
                        user_email: customerEmail
                    }], { onConflict: 'paystack_reference' });

                if (purchaseError) {
                    console.error("❌ Failed to log book purchase:", purchaseError);
                    return res.status(500).send('Book purchase logging failed');
                }

                console.log(`📚 Success! Book ${corpusId} unlocked for user ${targetUser.id}`);

                const { data: work, error: workError } = await supabaseAdmin
                    .from('works')
                    .select('author_id')
                    .eq('id', corpusId)
                    .maybeSingle();

                if (workError || !work) {
                    console.error('Failed to find the purchased book author:', workError || 'Book not found.');
                    return res.status(500).send('Book author lookup failed');
                }

                const { data: authorProfile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('payout_region, payout_currency, intl_payout_details')
                    .eq('id', work.author_id)
                    .maybeSingle();

                if (profileError) {
                    console.error('Failed to load author payout profile:', profileError);
                    return res.status(500).send('Author payout profile lookup failed');
                }

                if (authorProfile?.payout_region === 'international') {
                    const beneficiary = authorProfile.intl_payout_details;
                    if (!beneficiary || !authorProfile.payout_currency) {
                        console.error(`International payout profile is incomplete for author ${work.author_id}.`);
                        return res.status(500).send('International author payout profile is incomplete');
                    }

                    if (!process.env.FLW_SECRET_KEY) {
                        console.error('Flutterwave payout configuration is missing.');
                        return res.status(500).send('Flutterwave payouts are not configured');
                    }

                    const royaltyAmount = Number((amountPaid * 0.8).toFixed(2));
                    if (royaltyAmount <= 0) {
                        console.error(`Invalid Flutterwave royalty amount for Paystack reference ${reference}.`);
                        return res.status(500).send('Invalid author royalty amount');
                    }

                    const transferResponse = await createFlutterwaveTransfer({
                        account_bank: beneficiary.account_bank,
                        account_number: beneficiary.account_number,
                        amount: royaltyAmount,
                        currency: authorProfile.payout_currency,
                        debit_currency: 'NGN',
                        narration: `GleanWord author royalty for ${corpusId}`,
                        reference: createFlutterwaveReference(reference),
                        beneficiary_name: beneficiary.beneficiary_name,
                        beneficiary_address: beneficiary.beneficiary_address,
                        beneficiary_country: beneficiary.beneficiary_country,
                        ...(beneficiary.routing_number ? { routing_number: beneficiary.routing_number } : {}),
                        ...(beneficiary.swift_code ? { swift_code: beneficiary.swift_code } : {}),
                        meta: [
                            { metaname: 'beneficiary_name', metavalue: beneficiary.beneficiary_name },
                            { metaname: 'beneficiary_address', metavalue: beneficiary.beneficiary_address },
                            { metaname: 'beneficiary_country', metavalue: beneficiary.beneficiary_country },
                            ...(beneficiary.routing_number
                                ? [{ metaname: 'routing_number', metavalue: beneficiary.routing_number }]
                                : []),
                            ...(beneficiary.swift_code
                                ? [{ metaname: 'swift_code', metavalue: beneficiary.swift_code }]
                                : [])
                        ]
                    });
                    console.log(
                        `Flutterwave royalty transfer ${transferResponse.data?.id || 'created'} for author ${work.author_id}, reference ${reference}.`
                    );
                }
            }

            else if (metadata.is_subscription || event.data.plan) {
                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({ is_subscribed: true })
                    .eq('id', targetUser.id);

                if (updateError) {
                    console.error("❌ Failed to update profile subscription:", updateError);
                    return res.status(500).send('Profile update failed');
                }

                console.log(`⭐ Success! User ${targetUser.id} (${customerEmail}) upgraded to Premium subscription.`);
            }

            res.sendStatus(200);
        }
    } catch (err) {
        console.error("Webhook processing error:", err);
        res.status(500).send('Server error');
    }
});

app.use((err, req, res, next) => {
    console.error(
        `Request failed for ${req.method} ${req.originalUrl}:`,
        err?.stack || err
    );
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    return res.status(status).json({
        error: status === 413 ? 'Request body is too large.' : (err.message || 'Internal server error.')
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 GleanWord backend server running on port ${PORT}`);
});