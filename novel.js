import { normalizeYorubaText } from './utils/normalizeYoruba.js';
import { saveCorpusText } from './services/corpusService.js';

export async function handleTextSubmission(
    supabaseClient,
    rawTitle,
    rawAuthor,
    rawCategory,
    rawContent,
    rawDescription = '',
    rawCoverUrl = '',
    accessType = 'free',
    price = 0,
    authorSubaccount = ''
) {
    try {
        const title = normalizeYorubaText(rawTitle);
        const author = normalizeYorubaText(rawAuthor);
        const content = normalizeYorubaText(rawContent);
        const description = normalizeYorubaText(rawDescription);
        const category = rawCategory;
        const cover_url = rawCoverUrl.trim();

        const savedRecord = await saveCorpusText(supabaseClient, {
            title,
            author,
            content,
            category,
            description,
            cover_url,
            access_type: accessType,
            price: price,
            author_subaccount_code: authorSubaccount.trim(),
            status: 'pending'
        });

        console.log('Successfully saved to GleanWord corpus:', savedRecord);
        return savedRecord;

    } catch (error) {
        console.error('Error processing text in novel.js:', error.message);
        throw error;
    }
}

let currentPendingEmail = "";

const SUPABASE_URL = 'https://bvdcddrjhxoqaslivqiu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ipYUkqRL10LZr_99aq4hGw_LRas0xUY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
let currentFontSize = 18;
let activeCategory = 'all';

const themeToggleBtn = document.getElementById('theme-toggle');
const catalogView = document.getElementById('catalog-view');
const readerView = document.getElementById('reader-view');
const booksGrid = document.getElementById('books-grid');
const backToCatalogBtn = document.getElementById('back-to-catalog');
const navHome = document.getElementById('nav-home');
const categoryBtns = document.querySelectorAll('.nav-btn');

const fontIncreaseBtn = document.getElementById('font-increase');
const fontDecreaseBtn = document.getElementById('font-decrease');
const fontSizeLabel = document.getElementById('font-size-label');

async function fetchWorks(category = 'all') {
    const booksGrid = document.getElementById('books-grid');
    if (!booksGrid) return;
    
    booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">Loading resources...</p>`;

    try {
        let query = supabaseClient.from('works').select('*').order('created_at', { ascending: false });
        
        if (category && category !== 'all') {
            query = query.eq('category', category);
        }

        const { data: works, error } = await query;

        if (error) {
            console.error('Error fetching works:', error.message);
            booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">Failed to load books.</p>`;
            return;
        }

        if (!works || works.length === 0) {
            booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">No resources found for this category.</p>`;
            return;
        }

        // Pass directly to your robust renderBooksGrid function
        renderBooksGrid(works);

    } catch (err) {
        console.error('Failed to load works:', err);
        booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">Failed to load books.</p>`;
    }
}

async function renderBooksGrid(works) {
    booksGrid.innerHTML = '';

    const activeSupabase = window.supabaseClient || supabaseClient;
    const { data: { session } } = await activeSupabase.auth.getSession();

    let userPurchases = [];
    if (session?.user) {
        const { data } = await activeSupabase
            .from('user_purchases')
            .select('corpus_id')
            .eq('user_id', session.user.id);

        userPurchases = data ? data.map(p => p.corpus_id) : [];
    }

    works.forEach((work) => {
        const card = document.createElement('article');
        card.className = 'book-card';
        card.setAttribute('data-subfield', work.subfield ? work.subfield.trim() : 'general');

        const placeholderImg = '/path/to/your/default-placeholder.png';
        const imageSource = work.cover_url || placeholderImg;
        const descriptionText = work.description || 'Explore this research guide...';
        const authorName = work.author || 'Ann Alani';

        const isStandalone = work.access_type === 'purchase';
        const isUserOwned = userPurchases.includes(work.id);
        const isOfficialWork = !work.access_type || work.access_type === 'subscription';

        let badgeHTML = '';
        let buttonActionHTML = '';

        if (isStandalone) {
            if (isUserOwned) {
                badgeHTML = `<span class="badge owned" style="background:#2e7d32; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">OWNED</span>`;
                buttonActionHTML = `<button class="btn-card-action" style="margin-top:6px; padding:4px 10px; font-size:0.75rem; background:#38bdf8; color:#0f172a; border:none; border-radius:4px; cursor:pointer;">Read Book</button>`;
                card.onclick = () => openReaderForWork(work);
            } else {
                const formattedPrice = work.price ? work.price.toLocaleString() : '1,500';
                badgeHTML = `<span class="badge paid" style="background:#e11d48; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">₦${formattedPrice}</span>`;
                buttonActionHTML = `<button class="btn-card-action btn-buy" style="margin-top:6px; padding:4px 10px; font-size:0.75rem; background:#f59e0b; color:#0f172a; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Buy Work — ₦${formattedPrice}</button>`;

                card.onclick = (e) => {
                    e.stopPropagation();
                    triggerIndividualPurchase(work);
                };
            }
        } else if (isOfficialWork) {
            badgeHTML = `<span class="badge pass" style="background:#6366f1; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">GLEANWORD PASS</span>`;
            buttonActionHTML = `<button class="btn-card-action" style="margin-top:6px; padding:4px 10px; font-size:0.75rem; background:#38bdf8; color:#0f172a; border:none; border-radius:4px; cursor:pointer;">Read Preview</button>`;
            card.onclick = () => openReaderForWork(work);
        } else {
            badgeHTML = `<span class="badge free" style="background:#10b981; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">FREE CORPUS</span>`;
            buttonActionHTML = `<button class="btn-card-action" style="margin-top:6px; padding:4px 10px; font-size:0.75rem; background:#38bdf8; color:#0f172a; border:none; border-radius:4px; cursor:pointer;">Read Entry</button>`;
            card.onclick = () => openReaderForWork(work);
        }

        card.innerHTML = `
            <!-- Compact cover thumbnail on the left -->
            <div style="flex-shrink: 0; width: 85px; aspect-ratio: 2/3; overflow: hidden; position: relative; border-radius: 4px;">
                <img src="${imageSource}" alt="${escapeHtml(work.title)}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>

            <!-- Title, Author, Badges, and Description on the right -->
            <div style="flex-grow: 1; display: flex; flex-direction: column; text-align: left; padding-left: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <h4 style="margin: 0; color: #f8fafc; font-size: 0.95rem; font-weight: 600;">${escapeHtml(work.title)}</h4>
                    ${badgeHTML}
                </div>
                <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 500;">By ${escapeHtml(authorName)}</span>
                <p style="font-size: 0.78rem; color: #94a3b8; margin: 4px 0 0 0; line-height: 1.3;">${escapeHtml(descriptionText)}</p>
                <div>
                    ${buttonActionHTML}
                </div>
            </div>
        `;

        booksGrid.appendChild(card);
    });
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let currentChapterIndex = 0;
let currentWorkChapters = [];

async function openReaderForWork(work) {
    window.currentWork = work;

    catalogView.classList.add('hidden');
    readerView.classList.remove('hidden');
    document.querySelector('header')?.classList.add('hidden');
    window.scrollTo(0, 0);

    document.getElementById('reader-book-title').textContent = work.title;

    const readerBody = document.getElementById('reader-body');
    const paywallBanner = document.getElementById('paywall-banner');
    readerBody.innerHTML = '<p>Loading content...</p>';
    if (paywallBanner) paywallBanner.classList.add('hidden');

    const { data: chapters, error } = await supabaseClient
        .from('chapters_view')
        .select('*')
        .eq('work_id', work.id)
        .order('chapter_number', { ascending: true });

    if (error || !chapters || chapters.length === 0) {
        document.getElementById('reader-chapter-title').textContent = 'No Chapters Found';
        readerBody.innerHTML = '<p>No content available yet for this title.</p>';
        return;
    }

    currentWorkChapters = chapters;
    currentChapterIndex = 0;
    renderCurrentChapter();
}

function getUnitLabel(workCategory, isPlural = false) {
    const isPoetry = workCategory && workCategory.toLowerCase() === 'poetry';
    if (isPlural) {
        return isPoetry ? 'Tracks' : 'Chapters';
    }
    return isPoetry ? 'Track' : 'Chapter';
}

function renderCurrentChapter() {
    const chapter = currentWorkChapters[currentChapterIndex];
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    readerBody.style.scrollBehavior = 'auto';
    const paywallBanner = document.getElementById('paywallBanner');

    let workCategory = '';

    if (window.currentWork && window.currentWork.category) {
        workCategory = window.currentWork.category;
    } else if (chapter && (chapter.category || chapter.work_category)) {
        workCategory = chapter.category || chapter.work_category;
    }

    if (!workCategory) {
        const pageHeading = document.getElementById('reader-chapter-title')?.textContent || document.querySelector('h1')?.textContent || '';
        if (pageHeading.toLowerCase().includes('melancholia') || pageHeading.toLowerCase().includes('archer')) {
            workCategory = 'poetry';
        }
    }

    const unitLabel = getUnitLabel(workCategory);
    const pluralLabel = getUnitLabel(workCategory, true);

    if (chapter && chapter.work_id) {
        localStorage.setItem('lastReadWork', chapter.work_id);
        localStorage.setItem('lastReadChapterIndex', currentChapterIndex);
    }

    const chapterTitleEl = document.getElementById('reader-chapter-title');
    if (chapterTitleEl && chapter) {
        if (chapter.chapter_number === 0 || (chapter.title && chapter.title.toUpperCase() === 'PROLOGUE')) {
            chapterTitleEl.textContent = chapter.title || 'PROLOGUE';
        } else {
            const chapterName = chapter.title ? `: ${chapter.title}` : '';
            chapterTitleEl.textContent = `${unitLabel} ${chapter.chapter_number}${chapterName}`;
        }
    }

    const readerBookmarkBtn = document.getElementById('reader-bookmark-btn');
    if (readerBookmarkBtn && chapter) {
        readerBookmarkBtn.onclick = () => {
            const title = chapterTitleEl ? chapterTitleEl.textContent : 'GleanWord Story';
            toggleBookmark(chapter.work_id, title, 'Story');
        };
    }

    const sectionElement = document.getElementById('reader-section-title');
    if (sectionElement) {
        sectionElement.textContent = chapter?.section_title || '';
    }

    if (chapter && chapter.content) {
        const rawContent = chapter.content;

        let contentHTML = '';

        if (workCategory && workCategory.toLowerCase() === 'grammar') {
            contentHTML = `
                <div class="academic-reader-header" style="text-align: center; margin-bottom: 2rem;">
                    <span class="badge-academic" style="background: #1e293b; color: #38bdf8; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: bold; letter-spacing: 1px;">A GRAMMAR BOOK</span>
                    <div class="topic-tag" style="margin-top: 10px; color: #38bdf8; font-weight: 600;">Target Topic: ${window.currentWork?.description || 'Linguistic Analysis'}</div>
                </div>
                <div class="academic-body">${rawContent}</div>
            `;
        } else {
            contentHTML = `
                <div class="chapter-marker chapter-start">${unitLabel} Begins</div>
                ${rawContent}
                <div class="chapter-marker chapter-end">${unitLabel} Ends</div>
            `;
        }

        if (currentChapterIndex === currentWorkChapters.length - 1) {
            contentHTML += `
                <div class="chapter-end-card">
                    <span class="end-icon">🔚</span>
                    <h3>You're All Caught Up!</h3>
                    <p>You've reached the end of the currently uploaded ${pluralLabel.toLowerCase()}.</p>
                    <div class="schedule-badge">🗓️ New ${pluralLabel} Drop Every Saturday</div>
                </div>
            `;
        }

        readerBody.innerHTML = contentHTML;

        if (workCategory && workCategory.toLowerCase() === 'grammar') {
            appendGlossingWorkshopToReader();
        }

    } else {
        if (paywallBanner) paywallBanner.classList.add('hidden');

        if (workCategory && workCategory.toLowerCase() === 'grammar') {
            readerBody.innerHTML = `
                <div class="research-paywall-card" style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border: 1px solid #6366f1; border-radius: 12px; padding: 2.5rem 1.5rem; text-align: center; margin: 2rem 0;">
                    <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔒</div>
                    <h3 style="font-size: 1.4rem; color: #fff; margin-bottom: 0.5rem;">Unlock Methodology & Sample Analysis</h3>
                    <p style="color: #cbd5e1; margin-bottom: 1.5rem; font-size: 0.95rem;">Subscribe to GleanWord for full access to step-by-step methodologies, syntactic derivation trees, and research models.</p>
                    <button id="reader-subscribe-btn" style="background: #22c55e; color: #fff; padding: 14px 28px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; font-size: 1rem;">
                        Subscribe for ₦1,000
                    </button>
                </div>
            `;
        } else {
            readerBody.innerHTML = `
                <div class="locked-chapter-banner" style="text-align: center; padding: 3rem 1rem;">
                    <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem;">🔒 Unlock this ${unitLabel.toLowerCase()}</p>
                    <p style="margin-bottom: 1.5rem; color: #ccc;">Unlock this ${unitLabel.toLowerCase()} and all other works on GleanWord.</p>
                    <button id="reader-subscribe-btn" style="padding: 16px 36px; font-size: 1.15rem; font-weight: bold;">Subscribe for ₦1,000</button>
                </div>
            `;
        }
    }

    applyReaderPreferences();

    readerBody.scrollLeft = 0;
    requestAnimationFrame(() => {
        readerBody.style.scrollBehavior = '';
    });

    const prevBtn = document.getElementById('prev-chapter-btn');
    const nextBtn = document.getElementById('next-chapter-btn');
    if (prevBtn) prevBtn.style.display = currentChapterIndex > 0 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.style.display = currentChapterIndex < currentWorkChapters.length - 1 ? 'inline-block' : 'none';
}

const LEIPZIG_TAGS = {
    "1SG": "First-Person Singular",
    "2SG": "Second-Person Singular",
    "3SG": "Third-Person Singular",
    "1PL": "First-Person Plural",
    "2PL": "Second-Person Plural",
    "3PL": "Third-Person Plural",
    "N": "Noun",
    "V": "Verb",
    "ADJ": "Adjective",
    "ADV": "Adverb",
    "DET": "Determiner",
    "DEM": "Demonstrative",
    "PRS": "Present Tense",
    "PST": "Past Tense",
    "FUT": "Future Tense",
    "PROG": "Progressive Aspect",
    "PRF": "Perfective Aspect",
    "HAB": "Habitual Aspect",
    "NEG": "Negative Marker",
    "FOC": "Focus Marker (e.g., 'ni')",
    "PL": "Plural Inflection",
    "RED": "Reduplication",
    "PASS": "Passive Voice",
    "CAUS": "Causative Affix",
    "COP": "Copula Verb (e.g., 'ni' / 'jẹ')",
    "DEF": "Definite Marker (e.g., 'náà')",
    "GEN": "Genitive / Associative Marker (e.g., 'ti')"
};

function renderGlossInputs(tokens) {
    const container = document.getElementById('glossing-tokens-container');
    if (!container) return;
    container.innerHTML = '';

    let datalist = document.getElementById('leipzig-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'leipzig-datalist';
        document.body.appendChild(datalist);
    }

    datalist.innerHTML = Object.entries(LEIPZIG_TAGS).map(([key, desc]) =>
        `<option value="${key}">${key}: ${desc}</option>`
    ).join('');

    tokens.forEach((token, index) => {
        const tokenDiv = document.createElement('div');
        tokenDiv.className = 'gloss-token';

        tokenDiv.innerHTML = `
            <!-- Tier 1: Source Word -->
            <span class="source-word">${escapeHtml(token)}</span>
            
            <!-- Tier 2: Hybrid Input (Custom Lexical Text OR Leipzig Tag) -->
            <input 
                type="text" 
                class="gloss-input" 
                list="leipzig-datalist" 
                placeholder="e.g., buy or FOC"
                data-index="${index}"
            />
        `;

        container.appendChild(tokenDiv);
    });
}

function getFormattedGloss(inputValue) {
    const trimmed = inputValue.trim();
    if (!trimmed) return '***';

    const upper = trimmed.toUpperCase();

    const isGrammaticalTag = Object.keys(LEIPZIG_TAGS).some(tag => tag.toUpperCase() === upper);

    return isGrammaticalTag ? upper : trimmed.toLowerCase();
}

function appendGlossingWorkshopToReader() {
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    const existing = readerBody.querySelector('.glossing-workshop-container');
    if (existing) existing.remove();

    const workshopDiv = document.createElement('div');
    workshopDiv.className = 'glossing-workshop-container';
    workshopDiv.style.cssText = 'background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 2rem; margin-top: 3rem; color: #f8fafc;';

    workshopDiv.innerHTML = `
        <h3 style="color: #38bdf8; margin-bottom: 0.5rem; font-size: 1.2rem;">🔬 Interactive Leipzig Glossing Workshop</h3>
        <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem;">Practice breaking down your source text into standard interlinear glossed tiers for your project chapter.</p>
        
        <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 0.5rem; color: #cbd5e1;">Source Language Sentence</label>
            <input type="text" id="workshopSourceInput" placeholder="e.g., Ọmọ náà ni-ó ra aṣọ" style="width: 100%; padding: 10px; background: #1e293b; border: 1px solid #475569; color: #fff; border-radius: 6px;" />
        </div>

        <button id="workshopGenerateBtn" style="background: #38bdf8; color: #0f172a; font-weight: bold; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; margin-bottom: 1.5rem;">
            Generate Morpheme Breakdown
        </button>

        <div id="workshopOutputArea" style="display: none;">
            <div style="background: #1e293b; padding: 1.25rem; border-radius: 8px; border: 1px solid #475569;">
                <p style="font-size: 0.8rem; color: #38bdf8; font-weight: bold; margin-bottom: 0.5rem;">TIER 2 & 3 ALIGNMENT:</p>
                <div id="workshopBlocksGrid" style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1rem;"></div>
                
                <div>
                    <label style="display: block; font-size: 0.85rem; font-weight: bold; margin-bottom: 0.5rem; color: #cbd5e1;">Free English Translation</label>
                    <input type="text" id="workshopTranslationInput" placeholder="e.g., It is the child that bought clothes." style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 6px;" />
                </div>
            </div>

            <button id="workshopExportBtn" style="background: #22c55e; color: #fff; font-weight: bold; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; margin-top: 1rem;">
                Copy Formatted Text for Manuscript
            </button>
        </div>
    `;

    readerBody.appendChild(workshopDiv);

    document.getElementById('workshopGenerateBtn').addEventListener('click', () => {
        const sentence = document.getElementById('workshopSourceInput').value.trim();
        if (!sentence) return;

        const words = sentence.split(/\s+/);
        const grid = document.getElementById('workshopBlocksGrid');
        grid.innerHTML = '';

        let datalist = document.getElementById('leipzig-datalist');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'leipzig-datalist';
            document.body.appendChild(datalist);
        }

        datalist.innerHTML = Object.entries(LEIPZIG_TAGS).map(([tag, desc]) =>
            `<option value="${tag}">${tag}: ${desc}</option>`
        ).join('');

        words.forEach((word, index) => {
            grid.innerHTML += `
                <div style="background: var(--surface-color, #0f172a); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">${word}</div>
                    <input 
                        type="text" 
                        class="leipzig-input" 
                        list="leipzig-datalist" 
                        placeholder="e.g., buy or FOC" 
                        style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary); box-sizing: border-box;"
                        data-index="${index}"
                    />
                </div>
            `;
        });
        document.getElementById('workshopOutputArea').style.display = 'block';
    });

    const exportBtn = document.getElementById('workshopExportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const sourceSentence = document.getElementById('workshopSourceInput').value.trim();
            const translation = document.getElementById('workshopTranslationInput').value.trim();

            const inputs = document.querySelectorAll('.leipzig-input');
            const gridBlocks = document.querySelectorAll('#workshopBlocksGrid > div');

            if (!sourceSentence) return;

            let tier1Words = [];
            let tier2Glosses = [];

            gridBlocks.forEach((block, index) => {
                const word = block.querySelector('div').textContent;
                const input = inputs[index];
                const rawValue = input ? input.value.trim() : '';

                let formattedVal = '---';
                if (rawValue) {
                    const upper = rawValue.toUpperCase();
                    const isTag = Object.keys(LEIPZIG_TAGS).some(tag => tag.toUpperCase() === upper);
                    formattedVal = isTag ? upper : rawValue.toLowerCase();
                }

                tier1Words.push(word);
                tier2Glosses.push(formattedVal);
            });

            const formattedOutput =
                `${tier1Words.join('\t')}
${tier2Glosses.join('\t')}
'${translation || 'No translation provided'}'`;

            navigator.clipboard.writeText(formattedOutput).then(() => {
                const originalText = exportBtn.textContent;

                exportBtn.textContent = '✓ Copied to Clipboard!';
                exportBtn.style.background = '#16a34a';

                setTimeout(() => {
                    exportBtn.textContent = originalText;
                    exportBtn.style.background = '#22c55e';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Could not copy to clipboard automatically.');
            });
        });
    }
}

document.getElementById('next-chapter-btn')?.addEventListener('click', () => {
    if (typeof currentChapterIndex !== 'undefined' && currentChapterIndex < currentWorkChapters.length - 1) {
        currentChapterIndex++;
        renderCurrentChapter();
    }
});

function goToPreviousChapter() {
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    if (typeof currentChapterIndex !== 'undefined' && currentChapterIndex > 0) {
        currentChapterIndex--;

        readerBody.style.scrollBehavior = 'auto';
        renderCurrentChapter();

        readerBody.scrollLeft = readerBody.scrollWidth;

        requestAnimationFrame(() => {
            readerBody.style.scrollBehavior = '';
        });
    }
}

document.getElementById('prev-chapter-btn')?.addEventListener('click', () => {
    goToPreviousChapter();
});

function renderGrammarSubfieldFilters() {
    let filterContainer = document.getElementById('subfieldFilterContainer');
    if (!filterContainer) {
        filterContainer = document.createElement('div');
        filterContainer.id = 'subfieldFilterContainer';
        filterContainer.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin: 1.5rem auto; justify-content: center; max-width: 900px;';

        const catalogHeader = document.querySelector('#catalog-view p') || document.querySelector('#catalog-view h1');
        if (catalogHeader && catalogHeader.parentNode) {
            catalogHeader.parentNode.insertBefore(filterContainer, catalogHeader.nextSibling);
        } else {
            const booksGrid = document.getElementById('books-grid');
            if (booksGrid && booksGrid.parentNode) {
                booksGrid.parentNode.insertBefore(filterContainer, booksGrid);
            }
        }
    }

    const subfields = [
        "All Grammar",
        "Syntax & Morphology",
        "Formal Semantics & Pragmatics",
        "Digital Sociolinguistics & CMC",
        "Phonology & Phonetics"
    ];

    filterContainer.innerHTML = '';
    subfields.forEach((sub, index) => {
        const btn = document.createElement('button');
        btn.textContent = sub;

        const isActive = index === 0;
        btn.style.cssText = `background: ${isActive ? '#38bdf8' : '#1e293b'}; color: ${isActive ? '#0f172a' : '#cbd5e1'}; border: 1px solid ${isActive ? '#38bdf8' : '#334155'}; padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; cursor: pointer; font-weight: 600; transition: all 0.2s;`;

        btn.addEventListener('click', () => {
            filterContainer.querySelectorAll('button').forEach(b => {
                b.style.background = '#1e293b';
                b.style.color = '#cbd5e1';
                b.style.borderColor = '#334155';
            });
            btn.style.background = '#38bdf8';
            btn.style.color = '#0f172a';
            btn.style.borderColor = '#38bdf8';

            filterWorksBySubfield(sub);
        });

        filterContainer.appendChild(btn);
    });
    filterContainer.style.display = 'flex';
}

function filterWorksBySubfield(subfield) {
    const cards = document.querySelectorAll('.book-card');
    cards.forEach(card => {
        const cardSubfield = card.getAttribute('data-subfield');
        if (subfield === 'All Grammar' || cardSubfield === subfield) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function hideGrammarSubfieldFilters() {
    const filterContainer = document.getElementById('subfieldFilterContainer');
    if (filterContainer) {
        filterContainer.style.display = 'none';
    }
}

categoryBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
        categoryBtns.forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        activeCategory = e.target.dataset.category;

        if (activeCategory && activeCategory.toLowerCase() === 'grammar') {
            renderGrammarSubfieldFilters();
        } else {
            hideGrammarSubfieldFilters();
        }

        fetchWorks(activeCategory);
    });
});

function showCatalog() {
    readerView.classList.add('hidden');
    catalogView.classList.remove('hidden');
    document.querySelector('header')?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

backToCatalogBtn.addEventListener('click', showCatalog);
navHome.addEventListener('click', showCatalog);


if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.innerHTML = '&#9728;';
}

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');

    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('theme', 'dark');
        themeToggleBtn.innerHTML = '&#9728;';
    } else {
        localStorage.setItem('theme', 'light');
        themeToggleBtn.innerHTML = '&#9790;';
    }
});

const drawerThemeBtn = document.getElementById('drawer-theme-toggle');
if (drawerThemeBtn) {
    drawerThemeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        themeToggleBtn.click();
        if (typeof closeDrawer === 'function') closeDrawer();
    });
}

fontIncreaseBtn.addEventListener('click', () => {
    if (currentFontSize < 28) {
        currentFontSize += 2;
        updateFontSize();
    }
});

fontDecreaseBtn.addEventListener('click', () => {
    if (currentFontSize > 14) {
        currentFontSize -= 2;
        updateFontSize();
    }
});

function updateFontSize() {
    document.documentElement.style.setProperty('--font-size-reader', `${currentFontSize}px`);
    fontSizeLabel.textContent = `${currentFontSize}px`;
}

fetchWorks('all');
hideGrammarSubfieldFilters();

const lastReadWork = localStorage.getItem('lastReadWork');
const lastReadChapter = localStorage.getItem('lastReadChapterIndex');

if (lastReadWork !== null && lastReadChapter !== null) {
    const catalogView = document.getElementById('catalog-view');

    const resumeBanner = document.createElement('div');
    resumeBanner.className = 'resume-banner';
    resumeBanner.innerHTML = `<strong>Welcome back!</strong> Click here to continue reading where you left off.`;

    resumeBanner.addEventListener('click', async () => {
        resumeBanner.innerHTML = 'Loading your book...';

        const { data: work } = await supabaseClient
            .from('works')
            .select('*')
            .eq('id', lastReadWork)
            .single();

        if (work) {
            await openReaderForWork(work);

            currentChapterIndex = parseInt(lastReadChapter, 10);

            renderCurrentChapter();

            document.getElementById('reader-body').scrollTop = 0;
        }
    });

    catalogView.prepend(resumeBanner);
}

document.getElementById('page-right-btn')?.addEventListener('click', () => {
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    const maxScroll = readerBody.scrollWidth - readerBody.clientWidth;

    if (readerBody.scrollLeft >= maxScroll - 30) {
        document.getElementById('next-chapter-btn')?.click();
    } else {
        readerBody.scrollBy({ left: readerBody.clientWidth + 40, behavior: 'smooth' });
    }
});

document.getElementById('page-left-btn')?.addEventListener('click', () => {
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    if (readerBody.scrollLeft <= 30) {
        if (typeof currentChapterIndex !== 'undefined' && currentChapterIndex > 0) {
            currentChapterIndex--;
            renderCurrentChapter();
            setTimeout(() => {
                readerBody.scrollLeft = readerBody.scrollWidth;
            }, 50);
        }
    } else {
        readerBody.scrollBy({ left: -(readerBody.clientWidth + 40), behavior: 'smooth' });
    }
});


let touchStartX = 0;
let touchEndX = 0;

const readerContainer = document.getElementById('reader-body');

if (readerContainer) {
    readerContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    readerContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipeGesture();
    }, { passive: true });
}

function handleSwipeGesture() {
    const swipeDistanceX = touchEndX - touchStartX;
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    if (Math.abs(swipeDistanceX) > 40) {
        const maxScroll = readerBody.scrollWidth - readerBody.clientWidth;
        const currentScroll = readerBody.scrollLeft;

        if (swipeDistanceX < 0) {
            if (currentScroll >= maxScroll - 30) {
                document.getElementById('next-chapter-btn')?.click();
            } else {
                readerBody.scrollBy({ left: readerBody.clientWidth + 40, behavior: 'smooth' });
            }
        } else if (swipeDistanceX > 0) {
            if (currentScroll <= 30) {
                if (typeof currentChapterIndex !== 'undefined' && currentChapterIndex > 0) {
                    currentChapterIndex--;
                    renderCurrentChapter();
                    setTimeout(() => {
                        readerBody.scrollLeft = readerBody.scrollWidth;
                    }, 50);
                }
            } else {
                readerBody.scrollBy({ left: -(readerBody.clientWidth + 40), behavior: 'smooth' });
            }
        }
    }
}

function showPaymentSuccessModal() {
    const modalHtml = `
    <div id="payment-success-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
      <div style="background:#1e1e2e; color:#fff; padding:28px; border-radius:16px; max-width:400px; width:100%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #333;">
        <div style="font-size:40px; margin-bottom:10px;">🎉</div>
        <h3 style="margin:0 0 10px 0; color:#4caf50; font-size:22px;">Payment Successful!</h3>
        <p style="color:#ccc; font-size:14px; line-height:1.5;">Thank you for subscribing to GleanWord Premium!</p>
        <div style="background:#2a2a3c; padding:12px; border-radius:8px; margin:15px 0; text-align:left; font-size:13px; color:#e0e0e0;">
          💡 <strong>Next Step:</strong> Please <strong>Sign In</strong> using the email you just paid with to unlock your chapters.
        </div>
        <button id="modal-signin-btn" style="background:#4caf50; color:#fff; border:none; padding:12px 24px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%; font-size:15px;">Sign In Now</button>
      </div>
    </div>
  `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('modal-signin-btn').onclick = function () {
        document.getElementById('payment-success-modal').remove();
        if (typeof closeDrawer === 'function') closeDrawer();
        if (typeof promptSubscriberSignIn === 'function') {
            promptSubscriberSignIn();
        }
    };
}

function payWithPaystack(userEmail) {
    console.log("Starting Paystack initialization for:", userEmail);


    if (typeof PaystackPop === 'undefined') {
        alert("Paystack SDK failed to load. Please check your internet connection.");
        return;
    }

    try {
        const handler = PaystackPop.setup({
            key: 'pk_live_d7daec8fa68494d3a0f624f8a1d61f9b3695b76b',
            email: userEmail,
            amount: 1000 * 100,
            currency: 'NGN',
            plan: 'PLN_ztae9rndjeto3kr',
            ref: 'sub_' + Math.floor((Math.random() * 1000000000) + 1),
            callback: function (response) {
                console.log('Payment complete! Reference:', response.reference);
                showPaymentSuccessModal();
            },
            onClose: function () {
                console.log('Transaction window closed.');
            }
        });

        console.log("Opening Paystack iframe...");
        handler.openIframe();
    } catch (err) {
        console.error("PaystackPop setup error:", err);
        alert("Could not open payment window: " + err.message);
    }
}

let isProcessingPayment = false;

async function initiateSubscription() {
    if (isProcessingPayment) return;
    isProcessingPayment = true;

    try {
        let userEmail = null;

        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
            const { data } = await supabaseClient.auth.getUser();
            userEmail = data?.user?.email;
        }

        if (userEmail) {
            payWithPaystack(userEmail);
            return;
        }

        showEmailModal("Subscribe", "Enter your email address to subscribe:", (email) => {
            isProcessingPayment = false;
            if (email && email.includes('@')) {
                payWithPaystack(email.trim().toLowerCase());
            } else if (email) {
                alert("Please enter a valid email address.");
            }
        });

    } catch (err) {
        console.error("Subscription error:", err);
    } finally {
        setTimeout(() => {
            isProcessingPayment = false;
        }, 1000);
    }
}

document.addEventListener('click', (e) => {
    const target = e.target;
    const subBtn = target.closest('.subscribe-btn, #subscribe-btn, #sidebar-subscribe-btn, #reader-subscribe-btn, #modal-pay-btn');

    if (subBtn) {
        e.preventDefault();
        initiateSubscription();
    }
});

async function openWorkOrChapter(work) {
    const isSubscribed = currentUserProfile?.is_subscribed;

    if (work.status === 'unfinished' && !isSubscribed) {
        showPaywallModal(work.title);
        return;
    }

    loadReaderView(work);
}

function showPaywallModal(bookTitle) {
    const modal = document.getElementById('paywall-modal');
    if (modal) {
        const titleEl = document.getElementById('paywall-book-title');
        if (titleEl) titleEl.innerText = bookTitle;
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function closePaywallModal() {
    const modal = document.getElementById('paywall-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
}

document.getElementById('modal-pay-btn')?.addEventListener('click', () => {
    closePaywallModal();
    if (typeof initiateSubscription === 'function') {
        initiateSubscription();
    } else {
        document.getElementById('subscribe-btn')?.click();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker registered:', reg.scope))
            .catch((err) => console.error('Service Worker registration failed:', err));
    });
}

document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (target.id === 'reader-subscribe-btn' || target.innerText?.includes('Subscribe'))) {
        e.preventDefault();

        const dashboardBtn = document.getElementById('subscribe-btn');
        if (dashboardBtn) {
            dashboardBtn.click();
        } else if (typeof initiateSubscription === 'function') {
            initiateSubscription();
        }
    }
});

const sidebarDrawer = document.getElementById('sidebar-drawer');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const closeDrawerBtn = document.getElementById('close-drawer-btn');

function openDrawer() {
    sidebarDrawer?.classList.add('open');
    sidebarOverlay?.classList.add('active');
    updateDrawerSubscriptionState();
}

function closeDrawer() {
    sidebarDrawer?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');
}

menuToggleBtn?.addEventListener('click', openDrawer);
closeDrawerBtn?.addEventListener('click', closeDrawer);
sidebarOverlay?.addEventListener('click', closeDrawer);

let edgeStartX = 0;
document.addEventListener('touchstart', (e) => {
    edgeStartX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    const edgeEndX = e.changedTouches[0].clientX;
    if (edgeStartX < 30 && edgeEndX - edgeStartX > 60) {
        openDrawer();
    }
}, { passive: true });

async function updateDrawerSubscriptionState() {
    const subBtn = document.getElementById('sidebar-subscribe-btn');
    const emailDisplay = document.getElementById('user-email-display');

    const { data: { session } } = await supabaseClient.auth.getSession();

    let isSubscribed = false;
    let userEmail = '';

    if (session?.user) {
        userEmail = session.user.email;

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('is_subscribed')
            .eq('id', session.user.id)
            .single();

        isSubscribed = profile?.is_subscribed || false;

        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('isSubscribed', isSubscribed ? 'true' : 'false');
    }

    if (isSubscribed) {
        if (emailDisplay) {
            emailDisplay.textContent = userEmail;
        }
        if (subBtn) {
            subBtn.textContent = '👑 Premium User';
            subBtn.classList.add('premium-user');
            subBtn.onclick = null;
        }
    } else {
        if (emailDisplay) {
            emailDisplay.textContent = session?.user ? userEmail : 'Welcome, Reader!';
        }
        if (subBtn) {
            subBtn.textContent = 'Subscribe for ₦1,000/month';
            subBtn.classList.remove('premium-user');
            subBtn.onclick = (e) => {
                e.stopPropagation();
                closeDrawer();
                if (typeof initiateSubscription === 'function') {
                    initiateSubscription();
                }
            };
        }
    }

    renderSignOutButton(Boolean(session?.user));
}

function renderSignOutButton(isSignedIn) {
    let authBtn = document.getElementById('sidebar-auth-action-btn');
    const drawerContainer = document.querySelector('.drawer') || document.querySelector('.sidebar-drawer');

    if (!authBtn && drawerContainer) {
        authBtn = document.createElement('button');
        authBtn.id = 'sidebar-auth-action-btn';
        authBtn.style.cssText = 'margin-top: 15px; width: 100%; padding: 10px; cursor: pointer;';
        drawerContainer.appendChild(authBtn);
    }

    if (!authBtn) return;

    if (isSignedIn) {
        authBtn.textContent = '🚪 Sign Out';
        authBtn.onclick = (e) => {
            e.stopPropagation();
            handleSignOut();
        };
    } else {
        authBtn.textContent = '🔑 Already Subscribed? Log In';
        authBtn.onclick = (e) => {
            e.stopPropagation();
            closeDrawer();
            promptSubscriberSignIn();
        };
    }
}

async function handleSignOut() {
    if (confirm("Are you sure you want to sign out?")) {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        alert("Signed out successfully.");
        window.location.reload();
    }
}

async function promptSubscriberSignIn() {
    showEmailModal("Sign In", "Enter your email address to receive a 6-digit access code:", async (email) => {
        if (email && email.includes('@')) {
            const cleanEmail = email.trim().toLowerCase();
            currentPendingEmail = cleanEmail;

            const { error } = await supabaseClient.auth.signInWithOtp({
                email: cleanEmail,
                options: { shouldCreateUser: false }
            });

            if (!error) {
                showOtpModal(cleanEmail);
            } else {
                alert("Error sending code: " + (error.message || "Please check the email address and try again."));
            }
        } else if (email) {
            alert("Please enter a valid email address.");
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            if (typeof updateDrawerSubscriptionState === 'function') {
                await updateDrawerSubscriptionState();
            }
            if (typeof renderCurrentChapter === 'function') {
                renderCurrentChapter();
            }
        }
        if (typeof fetchWorks === 'function') {
            fetchWorks('all');
        }
    });

    const addResourceModal = document.getElementById('add-resource-modal');
    const openResourceBtn = document.getElementById('open-add-resource-btn');
    const closeResourceBtn = document.getElementById('close-resource-modal-btn');
    const resourceForm = document.getElementById('resource-modal-form');

    openResourceBtn?.addEventListener('click', async (e) => {
        e.preventDefault();

        if (typeof closeDrawer === 'function') {
            closeDrawer();
        } try {
            const activeSupabase = window.supabaseClient || supabaseClient;
            let session = null;
            if (activeSupabase && activeSupabase.auth) {
                const { data } = await activeSupabase.auth.getSession();
                session = data?.session;
            }

            if (!session || !session.user) {
                alert('You must be signed in to submit texts to the corpus catalog.');
                return;
            }

            if (addResourceModal) {
                addResourceModal.style.display = 'flex';
            }
        } catch (err) {
            console.error('Error opening modal:', err);
        }
    });

    closeResourceBtn?.addEventListener('click', () => {
        if (addResourceModal) addResourceModal.style.display = 'none';
    });

    resourceForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('modal-corpus-title').value;
        const author = document.getElementById('modal-corpus-author').value;
        const category = document.getElementById('modal-corpus-category').value;
        const content = document.getElementById('modal-corpus-content').value;
        const description = document.getElementById('modal-corpus-description')?.value || '';
        const coverUrl = document.getElementById('modal-corpus-cover')?.value || '';

        const accessType = document.getElementById('modal-corpus-access')?.value || 'free';
        const price = parseFloat(document.getElementById('modal-corpus-price')?.value) || 0;
        const authorSubaccount = document.getElementById('modal-corpus-subaccount')?.value || '';
        let activeSupabase = window.supabaseClient || supabaseClient;

        if (!activeSupabase || typeof activeSupabase.from !== 'function') {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                activeSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
        }

        try {
            await handleTextSubmission(
                activeSupabase,
                title,
                author,
                category,
                content,
                description,
                coverUrl,
                accessType,
                price,
                authorSubaccount
            );

            alert('Thank you! Your submission has been normalized and sent for admin review. It will appear in the library once approved.');

            resourceForm.reset();
            if (addResourceModal) addResourceModal.style.display = 'none';

        } catch (err) {
            console.error('Modal submission error:', err);
            alert('Failed to save resource. Check console for details.');
        }
    });

    if (typeof updateDrawerSubscriptionState === 'function') {
        updateDrawerSubscriptionState();
    }
});

let onEmailSubmitCallback = null;

function showEmailModal(title, description, callback) {
    const modal = document.getElementById('emailModal');
    const titleEl = document.getElementById('emailModalTitle');
    const descEl = document.getElementById('emailModalDesc');
    const input = document.getElementById('emailModalInput');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }

    onEmailSubmitCallback = callback;
    if (modal) modal.style.display = 'flex';
}

function hideEmailModal() {
    const modal = document.getElementById('emailModal');
    if (modal) modal.style.display = 'none';
    onEmailSubmitCallback = null;
}

document.addEventListener('DOMContentLoaded', () => {
    const submitEmailBtn = document.getElementById('submitEmailBtn');
    const cancelEmailBtn = document.getElementById('cancelEmailBtn');
    const emailInput = document.getElementById('emailModalInput');

    if (submitEmailBtn) {
        submitEmailBtn.addEventListener('click', () => {
            const val = emailInput ? emailInput.value.trim() : '';
            if (val && onEmailSubmitCallback) {
                const cb = onEmailSubmitCallback;
                hideEmailModal();
                cb(val);
            }
        });
    }

    if (cancelEmailBtn) {
        cancelEmailBtn.addEventListener('click', hideEmailModal);
    }
});


async function sendMagicLink(userEmail) {
    try {
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: userEmail,
            options: { shouldCreateUser: true }
        });

        if (error) throw error;

        currentPendingEmail = userEmail;
        showOtpModal(userEmail);
        return true;
    } catch (err) {
        console.error("OTP send error:", err);
        alert(`Error: ${err.message}`);
        return false;
    }
}

function showOtpModal(email) {
    if (email) {
        currentPendingEmail = email.trim().toLowerCase();
    }

    const modal = document.getElementById('otpModal');
    const emailDisplay = document.getElementById('otpEmailDisplay');
    const input = document.getElementById('otpCodeInput');

    if (emailDisplay) emailDisplay.textContent = currentPendingEmail || email;
    if (input) input.value = '';
    if (modal) modal.style.display = 'flex';
}

function hideOtpModal() {
    const modal = document.getElementById('otpModal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitOtpBtn');
    const cancelBtn = document.getElementById('cancelOtpBtn');
    const input = document.getElementById('otpCodeInput');

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const code = input ? input.value.trim() : '';

            const emailToUse = currentPendingEmail ||
                (document.getElementById('otpEmailDisplay')?.textContent || '').trim() ||
                localStorage.getItem('pending_subscription_email');

            if (code.length === 6 && emailToUse) {
                await verifyOtpCode(emailToUse, code);
            } else if (!emailToUse) {
                alert("Session email lost. Please re-enter your email.");
            } else {
                alert("Please enter a valid 6-digit code.");
            }
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideOtpModal);
    }
});

async function verifyOtpCode(userEmail, token) {
    const emailToVerify = (userEmail || currentPendingEmail || '').trim().toLowerCase();
    const cleanToken = (token || '').trim();

    if (!emailToVerify || cleanToken.length !== 6) {
        alert("Please enter a valid 6-digit code.");
        return false;
    }

    const submitBtn = document.getElementById('submitOtpBtn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        let { data, error } = await supabaseClient.auth.verifyOtp({
            email: emailToVerify,
            token: cleanToken,
            type: 'magiclink'
        });

        if (error) {
            const signupAttempt = await supabaseClient.auth.verifyOtp({
                email: emailToVerify,
                token: cleanToken,
                type: 'signup'
            });
            data = signupAttempt.data;
            error = signupAttempt.error;
        }

        if (error) throw error;

        const { data: sessionCheck } = await supabaseClient.auth.getSession();
        const activeUser = data?.user || sessionCheck?.session?.user;

        if (activeUser) {
            const rawPending = localStorage.getItem('pending_subscription_email');
            const pendingPaymentEmail = rawPending ? rawPending.trim().toLowerCase() : null;

            if (pendingPaymentEmail && (pendingPaymentEmail === emailToVerify || pendingPaymentEmail === activeUser.email?.toLowerCase())) {
                const { error: updateError } = await supabaseClient
                    .from('profiles')
                    .update({ is_subscribed: true })
                    .eq('id', activeUser.id);

                if (updateError) {
                    console.error("Supabase profile upgrade error:", updateError);
                    alert("Signed in, but failed to upgrade subscription: " + updateError.message);
                } else {
                    localStorage.removeItem('pending_subscription_email');
                    alert("Payment verified successfully! Welcome to GleanWord Premium 🎉");
                }
            } else {
                alert("Successfully signed in! Welcome back 🎉");
            }

            hideOtpModal();

            if (typeof updateDrawerSubscriptionState === 'function') await updateDrawerSubscriptionState();
            if (typeof renderCurrentChapter === 'function' && window.currentChapter) renderCurrentChapter();
            return true;
        }

    } catch (err) {
        console.error("OTP verification error:", err);

        const { data: finalCheck } = await supabaseClient.auth.getSession();
        if (finalCheck?.session?.user) {
            hideOtpModal();
            if (typeof updateDrawerSubscriptionState === 'function') await updateDrawerSubscriptionState();
            if (typeof renderCurrentChapter === 'function' && window.currentChapter) renderCurrentChapter();
            return true;
        }

        alert("Invalid or expired code. Please double-check and try again.");
        if (submitBtn) submitBtn.disabled = false;
        return false;
    }
}
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        console.log('User signed in successfully:', session.user.email);

        if (typeof updateDrawerSubscriptionState === 'function') {
            await updateDrawerSubscriptionState();
        }

        if (typeof renderCurrentChapter === 'function') {
            renderCurrentChapter();
        }
    }
});

async function handleSubscriptionFlow(userEmail) {
    if (userEmail && userEmail.includes('@')) {
        payWithPaystack(userEmail.trim().toLowerCase());
    } else {
        alert("Please enter a valid email address.");
    }
}

let deferredPrompt;
const installBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'block';
});

installBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
        console.log('User installed the PWA');
    }
    deferredPrompt = null;
    installBtn.style.display = 'none';
});

function showReadingListModal() {
    const savedList = JSON.parse(localStorage.getItem('gleanword_reading_list') || '[]');

    let listContentHtml = '';

    if (savedList.length === 0) {
        listContentHtml = `
      <div style="text-align:center; padding: 20px 0; color:#888;">
        <p style="font-size:30px; margin-bottom:8px;">📚</p>
        <p>Your reading list is currently empty.</p>
        <p style="font-size:12px; color:#666;">Bookmark chapters while reading to save them here!</p>
      </div>
    `;
    } else {
        listContentHtml = '<ul style="list-style:none; padding:0; margin:0; text-align:left;">';
        savedList.forEach((item, index) => {
            const savedChapterIdx = item.chapterIndex || 0;
            listContentHtml += `
        <li style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#2a2a3c; margin-bottom:8px; border-radius:8px;">
          <div style="cursor:pointer; flex-grow:1;" onclick="openBookFromReadingList('${item.id}', ${savedChapterIdx})">
            <strong style="color:#fff; font-size:14px; display:block;">${item.title}</strong>
            <span style="font-size:11px; color:#aaa; text-transform:capitalize;">${item.category || 'Story'}</span>
          </div>
          <button onclick="removeReadingListItem(${index})" style="background:transparent; border:none; color:#ff5555; cursor:pointer; font-weight:bold; font-size:16px; padding:4px 8px;">✕</button>
        </li>
      `;
        });
        listContentHtml += '</ul>';
    }

    const modalHtml = `
    <div id="reading-list-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
      <div style="background:#1e1e2e; color:#fff; padding:24px; border-radius:16px; max-width:420px; width:100%; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #333;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
          <h3 style="margin:0; font-size:18px;">📖 My Reading List</h3>
          <button onclick="document.getElementById('reading-list-modal').remove()" style="background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer;">✕</button>
        </div>
        ${listContentHtml}
      </div>
    </div>
  `;

    const existing = document.getElementById('reading-list-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function openBookFromReadingList(workId, targetChapterIndex = 0) {
    const modal = document.getElementById('reading-list-modal');
    if (modal) modal.remove();

    try {
        const { data: work, error } = await supabaseClient
            .from('works')
            .select('*')
            .eq('id', workId)
            .single();

        if (error || !work) {
            alert('Could not load this story. Please try again.');
            return;
        }

        await openReaderForWork(work);

        if (typeof currentWorkChapters !== 'undefined' && currentWorkChapters.length > targetChapterIndex) {
            currentChapterIndex = targetChapterIndex;
            renderCurrentChapter();
        }
    } catch (err) {
        console.error('Error opening book from list:', err);
    }
}

function removeReadingListItem(index) {
    let savedList = JSON.parse(localStorage.getItem('gleanword_reading_list') || '[]');
    savedList.splice(index, 1);
    localStorage.setItem('gleanword_reading_list', JSON.stringify(savedList));
    showReadingListModal();
}

const readingListBtn = document.getElementById('drawer-reading-list-btn');
if (readingListBtn) {
    readingListBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof closeDrawer === 'function') closeDrawer();
        showReadingListModal();
    });
}

function toggleBookmark(workId, title, category, chapterIndex = 0) {
    let savedList = JSON.parse(localStorage.getItem('gleanword_reading_list') || '[]');

    const existingIndex = savedList.findIndex(item => item.id === workId);
    const targetChapterIdx = typeof currentChapterIndex !== 'undefined' ? currentChapterIndex : chapterIndex;

    if (existingIndex > -1) {
        savedList[existingIndex].chapterIndex = targetChapterIdx;
        savedList[existingIndex].title = title;
        savedList[existingIndex].addedAt = new Date().toISOString();
        alert(`Reading list updated for "${title}"! 🔖`);
    } else {
        savedList.push({
            id: workId,
            title: title,
            category: category,
            chapterIndex: targetChapterIdx,
            addedAt: new Date().toISOString()
        });
        alert(`Saved "${title}" to your Reading List! 📚`);
    }

    localStorage.setItem('gleanword_reading_list', JSON.stringify(savedList));
}

let currentFontFamily = localStorage.getItem('gleanword_font_family') || 'sans-serif';
let currentLineHeight = localStorage.getItem('gleanword_line_height') || '1.6';

function applyReaderPreferences() {
    const readerBody = document.getElementById('reader-body');
    if (readerBody) {
        readerBody.style.fontFamily = currentFontFamily;
        readerBody.style.lineHeight = currentLineHeight;
    }
}

function showReaderPreferencesModal() {
    const modalHtml = `
    <div id="preferences-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
      <div style="background:#1e1e2e; color:#fff; padding:24px; border-radius:16px; max-width:400px; width:100%; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #333;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #333; padding-bottom:10px;">
          <h3 style="margin:0; font-size:18px;">⚙️ Reader Preferences</h3>
          <button onclick="document.getElementById('preferences-modal').remove()" style="background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <!-- Font Size Controls -->
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:14px; margin-bottom:8px; color:#aaa;">Font Size</label>
          <div style="display:flex; align-items:center; gap:12px;">
            <button id="pref-font-dec" style="background:#2a2a3c; border:1px solid #444; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:16px;">A-</button>
            <span id="pref-font-size-label" style="font-weight:bold; font-size:16px;">${currentFontSize}px</span>
            <button id="pref-font-inc" style="background:#2a2a3c; border:1px solid #444; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:16px;">A+</button>
          </div>
        </div>

        <!-- Font Family Selection -->
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:14px; margin-bottom:8px; color:#aaa;">Font Style</label>
          <select id="pref-font-family" style="width:100%; background:#2a2a3c; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none;">
            <option value="sans-serif" ${currentFontFamily === 'sans-serif' ? 'selected' : ''}>Sans-Serif (Modern)</option>
            <option value="Georgia, serif" ${currentFontFamily === 'Georgia, serif' ? 'selected' : ''}>Serif (Bookish)</option>
            <option value="monospace" ${currentFontFamily === 'monospace' ? 'selected' : ''}>Monospace (Code/Typewriter)</option>
          </select>
        </div>

        <!-- Line Height Selection -->
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:14px; margin-bottom:8px; color:#aaa;">Line Spacing</label>
          <select id="pref-line-height" style="width:100%; background:#2a2a3c; border:1px solid #444; color:#fff; padding:10px; border-radius:8px; font-size:14px; outline:none;">
            <option value="1.4" ${currentLineHeight === '1.4' ? 'selected' : ''}>Compact</option>
            <option value="1.6" ${currentLineHeight === '1.6' ? 'selected' : ''}>Normal</option>
            <option value="1.9" ${currentLineHeight === '1.9' ? 'selected' : ''}>Relaxed</option>
          </select>
        </div>

        <button onclick="document.getElementById('preferences-modal').remove()" style="width:100%; background:#4f46e5; border:none; color:#fff; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px; margin-top:10px;">Done</button>
      </div>
    </div>
  `;

    const existing = document.getElementById('preferences-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('pref-font-dec').addEventListener('click', () => {
        if (fontDecreaseBtn) fontDecreaseBtn.click();
        document.getElementById('pref-font-size-label').textContent = `${currentFontSize}px`;
    });

    document.getElementById('pref-font-inc').addEventListener('click', () => {
        if (fontIncreaseBtn) fontIncreaseBtn.click();
        document.getElementById('pref-font-size-label').textContent = `${currentFontSize}px`;
    });

    document.getElementById('pref-font-family').addEventListener('change', (e) => {
        currentFontFamily = e.target.value;
        localStorage.setItem('gleanword_font_family', currentFontFamily);
        applyReaderPreferences();
    });

    document.getElementById('pref-line-height').addEventListener('change', (e) => {
        currentLineHeight = e.target.value;
        localStorage.setItem('gleanword_line_height', currentLineHeight);
        applyReaderPreferences();
    });
}

const readerPrefBtn = document.getElementById('drawer-reader-preferences-btn');
if (readerPrefBtn) {
    readerPrefBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof closeDrawer === 'function') closeDrawer();
        showReaderPreferencesModal();
    });
}

applyReaderPreferences();

function showHelpSupportModal() {
    const modalHtml = `
    <div id="help-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;">
      <div style="background:#1e1e2e; color:#fff; padding:24px; border-radius:16px; max-width:450px; width:100%; max-height:85vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #333;">
        
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #333; padding-bottom:10px;">
          <h3 style="margin:0; font-size:18px;">❓ Help & Support</h3>
          <button onclick="document.getElementById('help-modal').remove()" style="background:transparent; border:none; color:#fff; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <!-- FAQ Section -->
        <div style="font-size:14px; color:#ddd; display:flex; flex-direction:column; gap:16px;">
          <div>
            <strong style="color:#fff; display:block; margin-bottom:4px;">📚 How do I save a story?</strong>
            <p style="margin:0; color:#aaa; font-size:13px;">Click the bookmark icon while reading any chapter. It will automatically save your spot and add the story to your <strong>My Reading List</strong> drawer.</p>
          </div>

          <div>
            <strong style="color:#fff; display:block; margin-bottom:4px;">💳 How does the subscription work?</strong>
            <p style="margin:0; color:#aaa; font-size:13px;">Subscribing gives you instant, unlimited access to premium chapters via secure Paystack processing.</p>
          </div>

          <div>
            <strong style="color:#fff; display:block; margin-bottom:4px;">⚙️ Can I change font styles or sizes?</strong>
            <p style="margin:0; color:#aaa; font-size:13px;">Yes! Open the <strong>Reader Preferences</strong> menu from the sidebar to customize your font style, text size, and line spacing.</p>
          </div>

         <div style="background:#2a2a3c; padding:12px; border-radius:8px; margin-top:8px;">
  <strong style="color:#fff; display:block; margin-bottom:4px;">Need further assistance?</strong>
  <p style="margin:0; color:#aaa; font-size:13px;">
    If you encounter any bugs or payment issues, reach out to support at 
    <a href="mailto:agbemileke18@gmail.com" style="color:#6366f1; font-weight:bold; text-decoration:underline;">agbemileke18@gmail.com</a>.
  </p>
</div>
        </div>

        <!-- Close Button -->
        <button onclick="document.getElementById('help-modal').remove()" style="width:100%; background:#4f46e5; border:none; color:#fff; padding:12px; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px; margin-top:20px;">Got It</button>
      </div>
    </div>
  `;

    const existing = document.getElementById('help-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

const helpSupportBtn = document.getElementById('drawer-help-support-btn');
if (helpSupportBtn) {
    helpSupportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof closeDrawer === 'function') closeDrawer();
        showHelpSupportModal();
    });
}

async function fetchResearchGuides() {
    const researchGrid = document.getElementById('researchGrid');
    if (!researchGrid) return;

    researchGrid.innerHTML = '<p class="loading-text">Loading academic guides...</p>';

    const { data: guides, error } = await supabaseClient
        .from('research_guides')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching research guides:', error.message);
        researchGrid.innerHTML = '<p class="error-text">Could not load research guides right now.</p>';
        return;
    }

    if (!guides || guides.length === 0) {
        researchGrid.innerHTML = '<p class="empty-text">No research guides available yet. Check back soon!</p>';
        return;
    }
    researchGrid.innerHTML = '';
    guides.forEach(guide => {
        const card = document.createElement('div');
        card.className = 'research-card';
        card.innerHTML = `
            <div class="card-badge">${guide.category}</div>
            <h3>${guide.title}</h3>
            <p class="topic-match"><strong>Target Topic:</strong> ${guide.target_topic_match || 'General Research'}</p>
            <p class="preview-snippet">${guide.preview_content.substring(0, 120)}...</p>
            <button class="read-guide-btn" data-id="${guide.id}">Read Guide</button>
        `;

        card.querySelector('.read-guide-btn').addEventListener('click', () => {
            openResearchReader(guide);
        });

        researchGrid.appendChild(card);
    });
}

function openResearchReader(guide) {
    const readerContainer = document.getElementById('readerView');
    if (!readerContainer) return;

    const isSubscribed = window.currentUserSubscribed || false;

    let contentToDisplay = '';

    if (guide.is_premium && !isSubscribed) {
        contentToDisplay = `
            <div class="research-reader-content">
                <span class="category-tag">${guide.category}</span>
                <h2>${guide.title}</h2>
                <div class="free-section">
                    <h3>Introduction & Overview (Free Preview)</h3>
                    <p>${guide.preview_content}</p>
                </div>
                <div class="paywall-overlay">
                    <div class="paywall-box">
                        <h3>🔒 Unlock Full Methodology & Sample Analysis</h3>
                        <p>To access the complete step-by-step breakdown, data collection framework, and sample chapter drafts for this topic, unlock full access.</p>
                        <button id="paystackTriggerBtn" class="subscribe-btn">Subscribe via Paystack</button>
                    </div>
                </div>
            </div>
        `;
    } else {
        contentToDisplay = `
            <div class="research-reader-content">
                <span class="category-tag">${guide.category}</span>
                <h2>${guide.title}</h2>
                <div class="full-section">
                    <h3>Overview</h3>
                    <p>${guide.preview_content}</p>
                    <hr />
                    <h3>Full Methodology & Analysis</h3>
                    <div class="full-text-body">${guide.full_content}</div>
                </div>
            </div>
        `;
    }

    readerContainer.innerHTML = contentToDisplay;

    const payBtn = document.getElementById('paystackTriggerBtn');
    if (payBtn) {
        payBtn.addEventListener('click', () => {
            initializePaystackPayment();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchResearchGuides();
});

async function triggerIndividualPurchase(work) {
    const activeSupabase = window.supabaseClient || supabaseClient;
    const { data: { session } } = await activeSupabase.auth.getSession();

    const userEmail = session?.user?.email || prompt('Enter your email address to complete your purchase and create your account:');
    if (!userEmail) return;

    const priceInNaira = work.price;

    if (!priceInNaira || priceInNaira <= 0) {
        alert('Invalid price set for this book. Please contact support or the author.');
        return;
    }

    const priceInKobo = priceInNaira * 100;

    if (typeof PaystackPop === 'undefined') {
        alert('Paystack SDK is not loaded. Please check your internet connection or script tags.');
        return;
    }

   const handler = PaystackPop.setup({
        key: 'pk_live_d7daec8fa684943a0f624f8a1d61f9b3695b76b',
        email: userEmail,
        amount: priceInKobo,
        currency: 'NGN',
        subaccount: work.author_subaccount_code || '',
        metadata: {
            corpus_id: work.id,
            book_title: work.title,
             custom_fields: [
                {
                    display_name: "Book Title",
                    variable_name: "book_title",
                    value: work.title
                }
            ]
        },
        callback: function (response) {
            (async () => {
                console.log('Payment complete! Reference: ' + response.reference);
                try {
                    if (session?.user) {
                        const { error } = await activeSupabase
                            .from('user_purchases')
                            .insert([{
                                user_id: session.user.id,
                                corpus_id: work.id,
                                reference: response.reference,
                                amount_paid: priceInNaira
                            }]);

                        if (error) throw error;
                        alert('Payment successful! You now have permanent access to this work.');
                    } else {
                        alert('Payment successful! Your purchase has been recorded.');
                    }

                    fetchWorks(activeCategory);
                } catch (err) {
                    console.error('Failed to log purchase in database:', err);
                    alert('Payment was successful, but we encountered an error updating your access.');
                }
            })();
        },
        onClose: function () {
            console.log('Payment window closed by user.');
        }
    });

    handler.openIframe(); // <-- Keep this here!
}