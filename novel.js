const SUPABASE_URL = 'https://bvdcddrjhxoqaslivqiu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ipYUkqRL10LZr_99aq4hGw_LRas0xUY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">Loading library...</p>`;

    let query = supabaseClient.from('works').select('*');
    if (category !== 'all') {
        query = query.eq('category', category);
    }

    const { data: works, error } = await query;

    if (error) {
        console.error('Error fetching works:', error);
        booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red;">Failed to load content. Check your Supabase URL & Key.</p>`;
        return;
    }

    if (!works || works.length === 0) {
        booksGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center;">No works found in this category.</p>`;
        return;
    }

    renderBooksGrid(works);
}

function renderBooksGrid(works) {
    booksGrid.innerHTML = '';

    works.forEach((work) => {
        const card = document.createElement('article');
        card.className = 'book-card';
        card.onclick = () => openReaderForWork(work);

        // Define a simple placeholder image for works without a cover_url
        const placeholderImg = '/path/to/your/default-placeholder.png'; // Update this path!

        // Checks for cover_url; uses fallback placeholder if empty
        const imageSource = work.cover_url || placeholderImg;

        // The innerHTML is NOW ONLY THE IMAGE
        card.innerHTML = `<img src="${imageSource}" alt="${escapeHtml(work.title)}" class="book-cover-img">`;

        booksGrid.appendChild(card);
    });
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let currentChapterIndex = 0;
let currentWorkChapters = [];

async function openReaderForWork(work) {
    catalogView.classList.add('hidden');
    readerView.classList.remove('hidden');
    window.scrollTo(0, 0);

    document.getElementById('reader-book-title').textContent = work.title;

    const readerBody = document.getElementById('reader-body');
    const paywallBanner = document.getElementById('paywall-banner');
    readerBody.innerHTML = '<p>Loading content...</p>';
    if (paywallBanner) paywallBanner.classList.add('hidden');

    const { data: chapters, error } = await supabaseClient
        .from('chapters')
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

function renderCurrentChapter() {
    const chapter = currentWorkChapters[currentChapterIndex];
    const readerBody = document.getElementById('reader-body');
    const paywallBanner = document.getElementById('paywall-banner');

    // Safely check for profile without crashing if undeclared
    const isSubscribed = (typeof currentUserProfile !== 'undefined' && currentUserProfile?.is_subscribed) || false;
    if (chapter && chapter.work_id) {
        localStorage.setItem('lastReadWork', chapter.work_id);
        localStorage.setItem('lastReadChapterIndex', currentChapterIndex);
    }

    const sectionElement = document.getElementById('reader-section-title');
    if (sectionElement) {
        sectionElement.textContent = chapter.section_title ? chapter.section_title : '';
    }

    const chapterTitleEl = document.getElementById('reader-chapter-title');
    if (chapterTitleEl) {
        if (chapter.chapter_number === 0 || (chapter.title && chapter.title.toUpperCase() === 'PROLOGUE')) {
            chapterTitleEl.textContent = chapter.title || 'PROLOGUE';
        } else {
            const chapterName = chapter.title ? `: ${chapter.title}` : '';
            chapterTitleEl.textContent = `Chapter ${chapter.chapter_number}${chapterName}`;
        }
    }

    if (chapter.chapter_number <= 4 || chapter.is_free || isSubscribed) {
        readerBody.innerHTML = chapter.content || '<p>No text found in database for this chapter.</p>';
        if (paywallBanner) paywallBanner.classList.add('hidden');
    } else {
        // Show locked message in reader
        readerBody.innerHTML = '<p style="text-align: center; margin-top: 2rem;"><em>This chapter is locked for subscribers only.</em></p>';

        if (paywallBanner) paywallBanner.classList.remove('hidden');

        const bookTitle = document.getElementById('reader-book-title')?.textContent || 'this book';
        showPaywallModal(bookTitle);
    }

    readerBody.scrollLeft = 0;

    const prevBtn = document.getElementById('prev-chapter-btn');
    const nextBtn = document.getElementById('next-chapter-btn');
    if (prevBtn) prevBtn.style.display = currentChapterIndex > 0 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.style.display = currentChapterIndex < currentWorkChapters.length - 1 ? 'inline-block' : 'none';
}

document.getElementById('prev-chapter-btn')?.addEventListener('click', () => {
    if (currentChapterIndex > 0) {
        currentChapterIndex--;
        renderCurrentChapter();
        window.scrollTo(0, 0);
        document.getElementById('reader-body').scrollLeft = 0;
    }
});

document.getElementById('next-chapter-btn')?.addEventListener('click', () => {
    if (currentChapterIndex < currentWorkChapters.length - 1) {
        currentChapterIndex++;
        renderCurrentChapter();
        window.scrollTo(0, 0);
        document.getElementById('reader-body').scrollLeft = 0;
    }
});

categoryBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
        categoryBtns.forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        activeCategory = e.target.dataset.category;
        fetchWorks(activeCategory);
    });
});

function showCatalog() {
    catalogView.classList.remove('hidden');
    readerView.classList.add('hidden');
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

            document.getElementById('reader-body').scrollLeft = 0;
        }
    });

    catalogView.prepend(resumeBanner);
}

document.getElementById('page-right-btn').addEventListener('click', () => {
    const readerBody = document.getElementById('reader-body');
    const scrollEnd = readerBody.scrollLeft + readerBody.clientWidth;

    // Check if we are at the very end of the horizontal text
    // (We use a 5px buffer just in case of sub-pixel rounding)
    if (Math.ceil(scrollEnd) >= readerBody.scrollWidth - 5) {
        // We reached the end of the chapter. Trigger the Next Chapter button!
        document.getElementById('next-chapter-btn').click();
    } else {
        // Otherwise, just flip one page right
        readerBody.scrollBy({ left: readerBody.clientWidth, behavior: 'smooth' });
    }
});

document.getElementById('page-left-btn').addEventListener('click', () => {
    const readerBody = document.getElementById('reader-body');

    // Check if we are at the very beginning of the current chapter
    if (readerBody.scrollLeft <= 0) {

        // Check if there is a previous chapter to go to
        if (currentChapterIndex > 0) {
            currentChapterIndex--;
            renderCurrentChapter(); // Loads the previous chapter text

            // We use a tiny 50ms delay to give the browser time to physically 
            // render the new text before we calculate how long it is.
            setTimeout(() => {
                // Instantly snap to the very last page of the new chapter!
                readerBody.scrollLeft = readerBody.scrollWidth - readerBody.clientWidth;
            }, 50);
        }

    } else {
        // If we aren't on the first page, just flip one page left normally
        readerBody.scrollBy({ left: -readerBody.clientWidth, behavior: 'smooth' });
    }
});

let touchStartX = 0;
let touchEndX = 0;

const readerContainer = document.getElementById('reader-body');

readerContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

readerContainer.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
    const swipeDistance = touchStartX - touchEndX;
    const minSwipeDistance = 50;

    if (swipeDistance > minSwipeDistance) {
        document.getElementById('page-right-btn').click();
    } else if (swipeDistance < -minSwipeDistance) {
        document.getElementById('page-left-btn').click();
    }
}

function payWithPaystack(userEmail) {
    let handler = PaystackPop.setup({
        key: 'pk_live_d7daec8fa68494d3a0f624f8a1d61f9b3695b76b',
        email: userEmail,
        amount: 1000 * 100,
        currency: 'NGN',
        ref: 'sub_' + Math.floor((Math.random() * 1000000000) + 1), // Generates a unique reference
        callback: function (response) {
            // This triggers when payment is successful
            console.log('Payment complete! Reference: ' + response.reference);
            grantUserAccess(userEmail);
        },
        onClose: function () {
            console.log('Transaction window closed.');
        },
    });
    handler.openIframe();
}

async function grantUserAccess(email) {
    // 1. Get the active user session from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        alert("Please log in to activate your subscription.");
        return;
    }

    // 2. Update the user's subscription status in Supabase
    const { data, error } = await supabase
        .from('profiles') // Replace 'profiles' with your actual user table name if different
        .update({ is_subscribed: true })
        .eq('id', user.id);

    if (!error) {
        alert("Subscription successful! You now have access to read unfinished works.");
        window.location.reload(); // Refresh to update unlocked state
    } else {
        console.error("Error updating subscription:", error);
        alert("Payment was received, but updating your account failed. Please contact support.");
    }
}

document.getElementById('subscribe-btn').addEventListener('click', async () => {
    let userEmail = null;

    // Check if supabase is initialized and try to get active user
    if (typeof supabase !== 'undefined' && supabase.auth) {
        const { data } = await supabase.auth.getUser();
        userEmail = data?.user?.email;
    }

    // Fallback: If no user is logged in, ask for an email input
    if (!userEmail) {
        userEmail = prompt("Enter your email address to subscribe:");
    }

    // Trigger Paystack if a valid email is present
    if (userEmail && userEmail.includes('@')) {
        payWithPaystack(userEmail);
    } else if (userEmail !== null) {
        alert("Please enter a valid email address.");
    }
});

async function initiateSubscription() {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        alert("Please log in or create an account to subscribe.");
        // Optional: trigger your login modal here
        return;
    }

    // Triggers the Paystack popup with the logged-in user's email
    payWithPaystack(user.email);
}

async function openWorkOrChapter(work) {
    // Check local user status or query Supabase profile
    const isSubscribed = currentUserProfile?.is_subscribed;

    // If the work is unfinished and the user hasn't paid, open the modal
    if (work.status === 'unfinished' && !isSubscribed) {
        showPaywallModal(work.title);
        return;
    }

    // Otherwise, proceed to reader
    loadReaderView(work);
}

// Function to display the lock modal
function showPaywallModal(bookTitle) {
    const modal = document.getElementById('paywall-modal');
    document.getElementById('paywall-book-title').innerText = bookTitle;
    modal.classList.add('active'); // or modal.style.display = 'flex';
}

// Attach event listener inside the Paywall Modal "Unlock Access" button
document.getElementById('modal-pay-btn').addEventListener('click', () => {
    closePaywallModal();
    initiateSubscription(); // Fires Paystack directly from the modal
});

function showPaywallModal(bookTitle) {
    const modal = document.getElementById('paywall-modal');
    if (bookTitle) {
        document.getElementById('paywall-book-title').innerText = bookTitle;
    }
    modal.classList.remove('hidden');
}

function closePaywallModal() {
    const modal = document.getElementById('paywall-modal');
    modal.classList.add('hidden');
}

// Wire the modal pay button to Paystack checkout
document.getElementById('modal-pay-btn').addEventListener('click', () => {
    closePaywallModal();
    document.getElementById('subscribe-btn').click(); // Reuses your main subscribe logic
});

// if ('serviceWorker' in navigator) {
//     window.addEventListener('load', () => {
//         navigator.serviceWorker.register('/sw.js')
//             .then((reg) => console.log('PWA Service Worker registered:', reg.scope))
//             .catch((err) => console.error('Service Worker registration failed:', err));
//     });
// }