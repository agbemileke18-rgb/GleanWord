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

function renderCurrentChapter() {
    const chapter = currentWorkChapters[currentChapterIndex];
    const readerBody = document.getElementById('reader-body');
    if (!readerBody) return;

    readerBody.style.scrollBehavior = 'auto';
    const paywallBanner = document.getElementById('paywallBanner');

    // const isSubscribed = (typeof currentUserProfile !== 'undefined' && currentUserProfile?.is_subscribed) || localStorage.getItem('isSubscribed') === 'true';

    if (chapter && chapter.work_id) {
        localStorage.setItem('lastReadWork', chapter.work_id);
        localStorage.setItem('lastReadChapterIndex', currentChapterIndex);
    }

    const sectionElement = document.getElementById('reader-section-title');
    if (sectionElement) {
        sectionElement.textContent = chapter?.section_title || '';
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

    // Access check: Rely directly on Supabase RLS
    if (chapter && chapter.content) {
        const rawContent = chapter.content;

        let contentHTML = `
      <div class="chapter-marker chapter-start">Chapter Begins</div>
      ${rawContent}
      <div class="chapter-marker chapter-end">Chapter Ends</div>
    `;

        if (currentChapterIndex === currentWorkChapters.length - 1) {
            contentHTML += `
        <div class="chapter-end-card">
          <span class="end-icon">📖</span>
          <h3>You're All Caught Up!</h3>
          <p>You’ve reached the end of the currently uploaded chapters for this work.</p>
          <div class="schedule-badge">🗓️ New Chapters Drop Every Saturday</div>
        </div>
      `;
        }

        readerBody.innerHTML = contentHTML;
    } else {
        // Hide external paywall banner so only one banner renders
        if (paywallBanner) paywallBanner.classList.add('hidden');

        readerBody.innerHTML = `
      <div class="locked-chapter-banner" style="text-align: center; padding: 3rem 1rem;">
        <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem;">👑 Premium Chapter</p>
        <p style="margin-bottom: 1.5rem; color: #ccc;">Unlock this chapter and unlimited access across GleanWord.</p>
        <button id="reader-subscribe-btn" style="padding: 16px 36px; font-size: 1.15rem; background: #d4af37; color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
          Subscribe for ₦1,000
        </button>
      </div>
    `;
    }

    // Reset scroll position cleanly
    readerBody.scrollLeft = 0;
    requestAnimationFrame(() => {
        readerBody.style.scrollBehavior = '';
    });

    // Update Prev / Next button visibility
    const prevBtn = document.getElementById('prev-chapter-btn');
    const nextBtn = document.getElementById('next-chapter-btn');
    if (prevBtn) prevBtn.style.display = currentChapterIndex > 0 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.style.display = currentChapterIndex < currentWorkChapters.length - 1 ? 'inline-block' : 'none';
}

// Next Chapter Button
document.getElementById('next-chapter-btn')?.addEventListener('click', () => {
    if (typeof currentChapterIndex !== 'undefined' && currentChapterIndex < currentWorkChapters.length - 1) {
        currentChapterIndex++;
        renderCurrentChapter();
    }
});

// Function to handle moving to the previous chapter cleanly without dizzying animation
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

// Previous Chapter Button Listener
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

// --- PAGE NAVIGATION BUTTONS ---

// Next Page / Next Chapter Button
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

// Previous Page / Previous Chapter Button
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
            // Swipe Right -> Previous Page OR Previous Chapter if on first page
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
            ref: 'sub_' + Math.floor((Math.random() * 1000000000) + 1),
            callback: function (response) {
                console.log('Payment complete! Reference:', response.reference);

                // Clear out any unneeded errors and just notify the user gracefully
                alert('Payment successful! Your account has been provisioned. You can now log in with your email.');

                // Optional: Redirect them to your login or dashboard page
                window.location.href = '/login.html';
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

// Unified Subscription Function
async function initiateSubscription() {
    if (isProcessingPayment) return;
    isProcessingPayment = true;

    try {
        let userEmail = null;

        // 1. Check if the reader happens to already be signed in
        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
            const { data } = await supabaseClient.auth.getUser();
            userEmail = data?.user?.email;
        }

        // 2. If logged in, launch Paystack directly with their existing email
        if (userEmail) {
            payWithPaystack(userEmail);
            return;
        }

        // 3. For guest readers (99% of first-time subscribers):
        // Show the custom email modal to collect their email before opening Paystack
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

// Single Event Listener for ALL Subscribe Buttons
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

    // Otherwise, proceed to reader
    loadReaderView(work);
}

// Function to display the lock modal
function showPaywallModal(bookTitle) {
    const modal = document.getElementById('paywall-modal');
    document.getElementById('paywall-book-title').innerText = bookTitle;
    modal.classList.add('active'); // or modal.style.display = 'flex';
}

// Function to display the paywall lock modal
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

// Wire up modal pay button to Paystack checkout
document.getElementById('modal-pay-btn')?.addEventListener('click', () => {
    closePaywallModal();
    if (typeof initiateSubscription === 'function') {
        initiateSubscription();
    } else {
        document.getElementById('subscribe-btn')?.click();
    }
});

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((reg) => console.log('Service Worker registered:', reg.scope))
            .catch((err) => console.error('Service Worker registration failed:', err));
    });
}

// Route the inline blue reader subscribe button to the working dashboard checkout
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

// --- SIDEBAR PROFILE DRAWER CONTROL ---

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

// Toggle via Hamburger Button and Overlay
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

// Dynamic Subscription & User Email UI Updates
async function updateDrawerSubscriptionState() {
    const subBtn = document.getElementById('sidebar-subscribe-btn');
    const emailDisplay = document.getElementById('user-email-display');

    // 1. Fetch current active session directly from Supabase
    const { data: { session } } = await supabaseClient.auth.getSession();

    let isSubscribed = false;
    let userEmail = '';

    if (session?.user) {
        userEmail = session.user.email;

        // 2. Query database profile for subscription flag
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('is_subscribed')
            .eq('id', session.user.id)
            .single();

        isSubscribed = profile?.is_subscribed || false;

        // Optional: Sync localStorage for offline access
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('isSubscribed', isSubscribed ? 'true' : 'false');
    }

    // 3. Update Drawer UI based on verified status
    if (isSubscribed) {
        if (emailDisplay) {
            emailDisplay.textContent = userEmail;
        }
        if (subBtn) {
            subBtn.textContent = '👑 Premium User';
            subBtn.classList.add('premium-user');
            subBtn.onclick = null; // Disable trigger for active subscribers
        }
    } else {
        if (emailDisplay) {
            emailDisplay.textContent = session?.user ? userEmail : 'Welcome, Reader!';
        }
        if (subBtn) {
            subBtn.textContent = 'Subscribe for ₦1,000';
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

// 1. SIGN OUT
async function handleSignOut() {
    if (confirm("Are you sure you want to sign out?")) {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        alert("Signed out successfully.");
        window.location.reload();
    }
}

// 2. SIGN IN FOR RETURNING SUBSCRIBERS
async function promptSubscriberSignIn() {
    // Show clean email input modal instead of browser prompt
    showEmailModal("Sign In", "Enter your email address to receive a 6-digit access code:", async (email) => {
        if (email && email.includes('@')) {
            const cleanEmail = email.trim().toLowerCase();
            currentPendingEmail = cleanEmail; // <--- THIS WAS MISSING!

            // Request 6-digit OTP code from Supabase
            const { error } = await supabaseClient.auth.signInWithOtp({
                email: cleanEmail,
                options: { shouldCreateUser: false } // False because they are returning subscribers
            });

            if (!error) {
                // Open your custom 6-digit OTP modal
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
    // 2. Automatically update UI on auth changes (magic links, logins)
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

    // 3. Initial UI drawer check
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

// 3. Bind Modal Buttons (Runs when page loads)
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitOtpBtn');
    const cancelBtn = document.getElementById('cancelOtpBtn');
    const input = document.getElementById('otpCodeInput');

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const code = input ? input.value.trim() : '';

            // Fallback: If currentPendingEmail is somehow blank, try reading from DOM or localStorage
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

            // Refresh UI and chapter content instantly
            if (typeof updateDrawerSubscriptionState === 'function') await updateDrawerSubscriptionState();
            if (typeof renderCurrentChapter === 'function' && window.currentChapter) renderCurrentChapter();
            return true;
        }

    } catch (err) {
        console.error("OTP verification error:", err);

        // Fail-safe session check
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
// Listen for login events (e.g., returning from Magic Link redirect)
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        console.log('User signed in successfully:', session.user.email);

        // 1. Refresh drawer header and button state
        if (typeof updateDrawerSubscriptionState === 'function') {
            await updateDrawerSubscriptionState();
        }

        // 2. Re-render current chapter to reveal subscriber content
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