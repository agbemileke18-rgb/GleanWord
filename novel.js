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

async function grantUserAccess(userEmail) {
    try {
        // 1. Send OTP / Magic Link to log user in or create account
        const { data, error } = await supabaseClient.auth.signInWithOtp({
            email: userEmail,
            options: { shouldCreateUser: true }
        });

        if (error) throw error;

        alert(`Payment received! We sent a 1-click unlock link to ${userEmail}. Open the email link to unlock your book!`);

    } catch (err) {
        console.error("Grant access error:", err);
        alert("Payment successful, but creating account session failed. Please contact support.");
    }
}

// Unified Subscription Function (Handles Supabase User or Guest Prompt)
async function initiateSubscription() {
    let userEmail = null;

    // 1. Try to get logged-in user email from Supabase
    if (typeof supabase !== 'undefined' && supabase.auth) {
        const { data } = await supabase.auth.getUser();
        userEmail = data?.user?.email;
    }

    // 2. Fallback prompt if user is not logged in
    if (!userEmail) {
        userEmail = prompt("Enter your email address to subscribe:");
    }

    // 3. Launch Paystack if valid email present
    if (userEmail && userEmail.includes('@')) {
        payWithPaystack(userEmail);
    } else if (userEmail !== null) {
        alert("Please enter a valid email address.");
    }
}

// Single Event Listener for ALL Subscribe Buttons (Dashboard, Sidebar, Reader)
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && (
        target.id === 'subscribe-btn' ||
        target.id === 'sidebar-subscribe-btn' ||
        target.id === 'reader-subscribe-btn'
    )) {
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
      subBtn.onclick = () => {
        closeDrawer();
        if (typeof initiateSubscription === 'function') {
          initiateSubscription();
        }
      };
    }
  }
  renderSignOutButton(Boolean(session?.user));
}

// Dynamic Sign Out / Log In Button Handler
function renderSignOutButton(isSignedIn) {
  let authBtn = document.getElementById('sidebar-auth-action-btn');
  const drawerContainer = document.querySelector('.drawer') || document.querySelector('.drawer-content');

  if (!authBtn && drawerContainer) {
    authBtn = document.createElement('button');
    authBtn.id = 'sidebar-auth-action-btn';
    authBtn.style.cssText = 'margin-top: 15px; width: 100%; padding: 10px; background: transparent; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; cursor: pointer; color: inherit; font-size: 0.9rem;';
    drawerContainer.appendChild(authBtn);
  }

  if (!authBtn) return;

  if (isSignedIn) {
    authBtn.textContent = '🚪 Sign Out';
    authBtn.onclick = handleSignOut;
  } else {
    authBtn.textContent = '🔑 Already Subscribed? Log In';
    authBtn.onclick = promptSubscriberSignIn;
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
  const email = prompt("Enter your subscribed email address:");
  if (!email || !email.trim()) return;
  
  await sendMagicLink(email.trim().toLowerCase());
}

// Run on page load to restore subscriber UI if returning user
document.addEventListener('DOMContentLoaded', () => {
    if (typeof updateDrawerSubscriptionState === 'function') {
        updateDrawerSubscriptionState();
    }
});
async function sendMagicLink(userEmail) {
    try {
        // 1. Clear any existing active session from localStorage
        await supabaseClient.auth.signOut();

        // 2. Send the fresh OTP/Magic Link
        const { data, error } = await supabaseClient.auth.signInWithOtp({
            email: userEmail,
            options: {
                emailRedirectTo: 'https://agbemileke18-rgb.github.io/GleanWord/',
                shouldCreateUser: true
            }
        });

        if (error) throw error;

        alert(`A magic login link has been sent to ${userEmail}. Check your inbox!`);
        return true;
    } catch (err) {
        alert(`Error: ${err.message}`);
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
    // 1. Send magic link to sign them in securely
    const linkSent = await sendMagicLink(userEmail);

    if (linkSent) {
        // 2. Trigger Paystack payment or prompt them to check email
        payWithPaystack(userEmail);
    }
}