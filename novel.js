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

        const placeholderImg = '/path/to/your/default-placeholder.png';
        const imageSource = work.cover_url || placeholderImg;

        card.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <img src="${imageSource}" alt="${escapeHtml(work.title)}" class="book-cover" style="width:100%; display:block;" />
        <button 
          type="button"
          onclick="event.stopPropagation(); toggleBookmark('${work.id}', \`${escapeHtml(work.title)}\`, '${work.category || ''}')" 
          style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); border: none; border-radius: 50%; width: 36px; height: 36px; color: #fff; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; z-index: 5;" 
          title="Save to Reading List">
          🔖
        </button>
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

// Helper to get the correct unit label (Track vs Chapter) based on category
function getUnitLabel(workCategory, isPlural = false) {
    const isPoetry = workCategory && workCategory.toLowerCase() === 'poetry';
    if (isPlural) {
        return isPoetry ? 'Tracks' : 'Chapters';
    }
    return isPoetry ? 'Track' : 'Chapter';
}

function renderCurrentChapter() {
    // 1. DECLARE CHAPTER FIRST
    const chapter = currentWorkChapters[currentChapterIndex];
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    readerBody.style.scrollBehavior = 'auto';
    const paywallBanner = document.getElementById('paywallBanner');

    // 2. SAFELY DETERMINE CATEGORY & UNIT LABELS
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

    // Access check: Rely directly on Supabase RLS
    if (chapter && chapter.content) {
        const rawContent = chapter.content;

        let contentHTML = `
      <div class="chapter-marker chapter-start">${unitLabel} Begins</div>
      ${rawContent}
      <div class="chapter-marker chapter-end">${unitLabel} Ends</div>    `;

        if (currentChapterIndex === currentWorkChapters.length - 1) {
            contentHTML += `
        <div class="chapter-end-card">
          <span class="end-icon">📖</span>
          <h3>You're All Caught Up!</h3>
        <p>You've reached the end of the currently uploaded ${pluralLabel.toLowerCase()} for this work.</p>
         <div class="schedule-badge">📅 New ${pluralLabel} Drop Every Saturday</div>
        </div>
      `;
        }

        readerBody.innerHTML = contentHTML;
    } else {
        // Hide external paywall banner so only one banner renders
        if (paywallBanner) paywallBanner.classList.add('hidden');

        readerBody.innerHTML = `
      <div class="locked-chapter-banner" style="text-align: center; padding: 3rem 1rem;">
        <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem;">👑 Premium ${unitLabel}</p>
        <p style="margin-bottom: 1.5rem; color: #ccc;">Unlock this ${unitLabel.toLowerCase()} and unlimited access across GleanWord.</p>
        <button id="reader-subscribe-btn" style="padding: 16px 36px; font-size: 1.15rem; background: #d4af37; color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
          Subscribe for ₦1,000
        </button>
      </div>
    `;
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

        // Disable smooth scroll for instant positioning at the last page
        readerBody.style.scrollBehavior = 'auto';
        renderCurrentChapter();

        readerBody.scrollLeft = readerBody.scrollWidth;

        // Restore smooth scrolling for normal page turns
        requestAnimationFrame(() => {
            readerBody.style.scrollBehavior = '';
        });
    }
}

document.getElementById('prev-chapter-btn')?.addEventListener('click', () => {
    goToPreviousChapter();
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

// --- TOUCH & SWIPE GESTURES ---

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

    // Ensure horizontal swipe is intentional (more than 40px)
    if (Math.abs(swipeDistanceX) > 40) {
        const maxScroll = readerBody.scrollWidth - readerBody.clientWidth;
        const currentScroll = readerBody.scrollLeft;

        if (swipeDistanceX < 0) {
            // Swipe Left -> Next Page OR Next Chapter if on last page
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
            amount: 1000 * 100, // ₦1,000 in kobo
            currency: 'NGN',
            plan: 'PLN_ztae9rndjeto3kr',
            ref: 'sub_' + Math.floor((Math.random() * 1000000000) + 1),
            callback: function (response) {
                console.log('Payment complete! Reference:', response.reference);
                // Display the sign-in guidance modal immediately
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
    // Match closest button or element with ID or Class
    const subBtn = target.closest('.subscribe-btn, #subscribe-btn, #sidebar-subscribe-btn, #reader-subscribe-btn, #modal-pay-btn');

    if (subBtn) {
        e.preventDefault();
        initiateSubscription();
    }
});

async function openWorkOrChapter(work) {
    // Check local user status or query Supabase profile
    const isSubscribed = currentUserProfile?.is_subscribed;

    // If the work is unfinished and the user hasn't paid, open the modal
    if (work.status === 'unfinished' && !isSubscribed) {
        showPaywallModal(work.title);
        return;
    }

    loadReaderView(work);
}

function showPaywallModal(bookTitle) {
    const modal = document.getElementById('paywall-modal');
    document.getElementById('paywall-book-title').innerText = bookTitle;
    modal.classList.add('active'); // or modal.style.display = 'flex';
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

        // Trigger the working red dashboard button's action
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

// Swipe Right from Left Edge (< 30px) to Open Drawer
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
            currentPendingEmail = cleanEmail; // <--- THIS WAS MISSING!

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

// 4. Verification Handler
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
        // 1. Attempt verification with type 'magiclink'
        let { data, error } = await supabaseClient.auth.verifyOtp({
            email: emailToVerify,
            token: cleanToken,
            type: 'magiclink'
        });

        // 2. Fallback to 'signup' type for brand new accounts
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

        // 3. Retrieve authenticated user session
        const { data: sessionCheck } = await supabaseClient.auth.getSession();
        const activeUser = data?.user || sessionCheck?.session?.user;

        if (activeUser) {
            const rawPending = localStorage.getItem('pending_subscription_email');
            const pendingPaymentEmail = rawPending ? rawPending.trim().toLowerCase() : null;

            // Upgrade user if they have a pending payment OR if pending email matches current session
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

        // 1. Refresh drawer header and button state
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
    // Prevent default mini-infobar from showing
    e.preventDefault();
    // Save event so it can be triggered later
    deferredPrompt = e;
    // Show the "Install App" button in the menu
    if (installBtn) installBtn.style.display = 'block';
});

installBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!deferredPrompt) return;

    // Trigger the native install prompt
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

    // Remove existing if open
    const existing = document.getElementById('reading-list-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Helper to safely open a work from the reading list
// Helper to safely open a work and target chapter from reading list
async function openBookFromReadingList(workId, targetChapterIndex = 0) {
    // 1. Close modal
    const modal = document.getElementById('reading-list-modal');
    if (modal) modal.remove();

    try {
        // 2. Fetch full work details
        const { data: work, error } = await supabaseClient
            .from('works')
            .select('*')
            .eq('id', workId)
            .single();

        if (error || !work) {
            alert('Could not load this story. Please try again.');
            return;
        }

        // 3. Open work
        await openReaderForWork(work);

        // 4. Force reader to jump to saved chapter index without resetting
        if (typeof currentWorkChapters !== 'undefined' && currentWorkChapters.length > targetChapterIndex) {
            currentChapterIndex = targetChapterIndex;
            renderCurrentChapter();
        }
    } catch (err) {
        console.error('Error opening book from list:', err);
    }
}

// Function to remove an item from list
function removeReadingListItem(index) {
    let savedList = JSON.parse(localStorage.getItem('gleanword_reading_list') || '[]');
    savedList.splice(index, 1);
    localStorage.setItem('gleanword_reading_list', JSON.stringify(savedList));
    showReadingListModal(); // Re-render modal
}

// Hook up drawer button listener
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
        // Book is already in the list: update it to the new chapter position instead of removing it
        savedList[existingIndex].chapterIndex = targetChapterIdx;
        savedList[existingIndex].title = title;
        savedList[existingIndex].addedAt = new Date().toISOString();
        alert(`Reading list updated for "${title}"! 🔖`);
    } else {
        // Add new entry to the list
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

// Default preferences state
let currentFontFamily = localStorage.getItem('gleanword_font_family') || 'sans-serif';
let currentLineHeight = localStorage.getItem('gleanword_line_height') || '1.6';

// Apply stored preferences on page load
function applyReaderPreferences() {
    const readerBody = document.getElementById('reader-body');
    if (readerBody) {
        readerBody.style.fontFamily = currentFontFamily;
        readerBody.style.lineHeight = currentLineHeight;
    }
}

// Open Reader Preferences Modal
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

    // Remove existing modal if present
    const existing = document.getElementById('preferences-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Hook up Font Size decrease button in modal
    document.getElementById('pref-font-dec').addEventListener('click', () => {
        if (fontDecreaseBtn) fontDecreaseBtn.click();
        document.getElementById('pref-font-size-label').textContent = `${currentFontSize}px`;
    });

    // Hook up Font Size increase button in modal
    document.getElementById('pref-font-inc').addEventListener('click', () => {
        if (fontIncreaseBtn) fontIncreaseBtn.click();
        document.getElementById('pref-font-size-label').textContent = `${currentFontSize}px`;
    });

    // Hook up Font Family select
    document.getElementById('pref-font-family').addEventListener('change', (e) => {
        currentFontFamily = e.target.value;
        localStorage.setItem('gleanword_font_family', currentFontFamily);
        applyReaderPreferences();
    });

    // Hook up Line Height select
    document.getElementById('pref-line-height').addEventListener('change', (e) => {
        currentLineHeight = e.target.value;
        localStorage.setItem('gleanword_line_height', currentLineHeight);
        applyReaderPreferences();
    });
}

// Hook up drawer button listener
const readerPrefBtn = document.getElementById('drawer-reader-preferences-btn');
if (readerPrefBtn) {
    readerPrefBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof closeDrawer === 'function') closeDrawer();
        showReaderPreferencesModal();
    });
}

// Apply stored preferences on page startup
applyReaderPreferences();

// Open Help & Support Modal
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

    // Remove existing modal if already open
    const existing = document.getElementById('help-modal');
    if (existing) existing.remove();

    // Inject modal into the DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Hook up sidebar drawer listener
const helpSupportBtn = document.getElementById('drawer-help-support-btn');
if (helpSupportBtn) {
    helpSupportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof closeDrawer === 'function') closeDrawer();
        showHelpSupportModal();
    });
}