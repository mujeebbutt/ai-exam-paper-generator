// Authentication Controller (Phase 5) — real email/password auth against the backend
// (bcrypt hashing + JWT sessions, see backend/services/auth_service.py). "Continue with
// Google" is wired up for real too, via Google Identity Services (see loginWithGoogle() below)
// and routers/auth.py's google_auth() — it 501s only if GOOGLE_CLIENT_ID isn't configured.
// Mirrors attempt.js/generate.js's conventions: DOM-driven rendering, window.-exposed handlers.

// OAuth 2.0 Web Client ID from https://console.cloud.google.com/apis/credentials (create an
// "OAuth client ID" of type "Web application", with this site's origin under "Authorized
// JavaScript origins"). Client IDs aren't secret — they're meant to ship in frontend code, same
// as a Firebase config object would be — but this placeholder must be replaced with a real one
// before the Google buttons will work; the backend independently checks the matching
// GOOGLE_CLIENT_ID env var and 501s until that's set too (see auth_service.py).
const GOOGLE_CLIENT_ID = '1028735589847-0fss2gj2vjktco4j5rnjv1kroaq0o1ir.apps.googleusercontent.com';

document.addEventListener('DOMContentLoaded', () => {

    const TOKEN_KEY = 'ustadexam_token';
    const USER_KEY = 'ustadexam_user';
    let registerRole = 'student';

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getCachedUser() {
        const raw = localStorage.getItem(USER_KEY);
        try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    window.isAuthenticated = () => !!getToken();
    window.getCurrentUser = () => getCachedUser();
    window.getAuthToken = () => getToken();

    // Actual enforcement lives on the backend (every protected endpoint requires a valid
    // Bearer token independently) — this is the UX layer: which pages redirect to Login.
    // 'vault' is the Library page — it became owner-scoped (see routers/bank.py's get_exams),
    // so it now requires an account like Generate and Profile do.
    const PROTECTED_PAGES = ['profile', 'generate', 'vault'];
    // Login/Register are pointless once already signed in — bounce straight to Generate,
    // which is also where a fresh login/register lands (see register()/login() below).
    const AUTH_ONLY_PAGES = ['login', 'register'];

    // Called from generate.js's switchPage() before it actually switches — every navigation path
    // (nav clicks, and other controllers' internal window.switchPage() calls) goes through it.
    window.requireAuthForPage = (pageId) => {
        if (PROTECTED_PAGES.includes(pageId) && !window.isAuthenticated()) {
            window.switchPage('login');
            return false;
        }
        if (AUTH_ONLY_PAGES.includes(pageId) && window.isAuthenticated()) {
            window.switchPage('generate');
            return false;
        }
        return true;
    };

    function updateNavForAuthState() {
        const loggedIn = window.isAuthenticated();
        const user = getCachedUser();
        document.getElementById('nav-profile')?.classList.toggle('hidden', !loggedIn);
        // Logout lives on the Profile page now (window.logout() button there), not in the nav bar.
        document.getElementById('nav-login')?.classList.toggle('hidden', loggedIn);
        document.getElementById('nav-register')?.classList.toggle('hidden', loggedIn);
        document.getElementById('nav-vault')?.classList.toggle('hidden', !loggedIn);
        // Integrity is a teacher-facing review tool (Phase 4) — keep the persistent nav to the
        // Generate/Library/Profile trio for everyone else, students included.
        const isTeacher = loggedIn && user?.role === 'teacher';
        document.getElementById('nav-integrity')?.classList.toggle('hidden', !isTeacher);
    }
    window.updateNavForAuthState = updateNavForAuthState;

    const ROLE_ACTIVE_CLASSES = ['btn-brand-gradient', 'border-transparent', 'text-white'];
    const ROLE_INACTIVE_CLASSES = ['bg-white/5', 'border-white/10', 'text-white/50'];

    window.setRegisterRole = (role) => {
        registerRole = role;
        const studentBtn = document.getElementById('register-role-student');
        const teacherBtn = document.getElementById('register-role-teacher');
        const gradeSelect = document.getElementById('register-grade');
        const gradeOther = document.getElementById('register-grade-other');
        const subjectInput = document.getElementById('register-subject');
        const subtext = document.getElementById('register-role-subtext');
        if (!studentBtn || !teacherBtn) return;
        const isStudent = role === 'student';

        // Explicit remove-then-add (not classList.toggle pairs) — guarantees exactly one of the
        // two buttons ever ends up in the "active" state, with no possibility of a stale class
        // surviving from an earlier state and making both look selected at once.
        [[studentBtn, isStudent], [teacherBtn, !isStudent]].forEach(([btn, active]) => {
            btn.classList.remove(...ROLE_ACTIVE_CLASSES, ...ROLE_INACTIVE_CLASSES);
            btn.classList.add(...(active ? ROLE_ACTIVE_CLASSES : ROLE_INACTIVE_CLASSES));
            btn.setAttribute('aria-pressed', String(active));
        });
        gradeSelect?.classList.toggle('hidden', !isStudent);
        // Only show the "Other" free-text field alongside the grade select when it's actually
        // relevant — i.e. student role AND "Other" is the selected option.
        if (gradeOther) gradeOther.classList.toggle('hidden', !isStudent || gradeSelect?.value !== 'Other');
        subjectInput?.classList.toggle('hidden', isStudent);
        if (subtext) {
            subtext.textContent = isStudent
                ? 'Get personalized study exams and instant feedback.'
                : 'Generate and grade class exams in minutes.';
        }
    };

    // Called every time the Register page is navigated to (see generate.js's switchPage()) — forces
    // the role toggle back to a known-good state (Student, matching the page's default HTML)
    // instead of trusting the registerRole closure variable, which otherwise only ever gets set
    // once and could drift out of sync with the DOM across multiple visits in one SPA session.
    window.initRegisterPage = () => {
        window.setRegisterRole('student');
        const consentEl = document.getElementById('register-terms-consent');
        if (consentEl) consentEl.checked = false;
        const errorEl = document.getElementById('register-error');
        if (errorEl) errorEl.classList.add('hidden');
    };

    // Grade <select>'s "Other" option reveals a free-text input right below it — keeps the
    // dropdown's constrained options while still accepting anything not on the list.
    window.handleGradeSelectChange = () => {
        const gradeSelect = document.getElementById('register-grade');
        const gradeOther = document.getElementById('register-grade-other');
        if (!gradeSelect || !gradeOther) return;
        gradeOther.classList.toggle('hidden', gradeSelect.value !== 'Other');
    };

    // Eye-icon show/hide toggle shared by the login and register password fields.
    window.toggleAuthPasswordVisibility = (inputId, btn) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const icon = btn?.querySelector('.material-symbols-outlined');
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        if (icon) icon.textContent = showing ? 'visibility' : 'visibility_off';
    };

    // Lightweight real-time validation hints (email format, password length) — purely UX
    // feedback; the backend independently re-validates everything on submit regardless.
    window.validateAuthField = (fieldId) => {
        const input = document.getElementById(fieldId);
        const hint = document.getElementById(fieldId + '-hint');
        if (!input || !hint) return;
        const value = input.value.trim();

        function show(valid, message) {
            const icon = valid ? 'check_circle' : 'error';
            hint.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">${icon}</span> ${message}`;
            hint.classList.remove('hidden', 'is-valid', 'is-invalid');
            hint.classList.add(valid ? 'is-valid' : 'is-invalid');
        }

        if (value.length === 0) { hint.classList.add('hidden'); return; }

        if (fieldId.endsWith('-email')) {
            const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            show(looksValid, looksValid ? 'Looks good' : 'Enter a valid email address');
        } else if (fieldId.endsWith('-password')) {
            const longEnough = value.length >= 6;
            show(longEnough, longEnough ? 'Looks good' : `At least 6 characters (${value.length}/6)`);
        }
    };

    window.register = async () => {
        const btn = document.getElementById('register-submit-btn');
        const errorEl = document.getElementById('register-error');
        if (errorEl) errorEl.classList.add('hidden');

        // Required consent — block submission client-side (the backend re-checks this too, see
        // routers/auth.py's register(), as the actual enforcement point).
        const consentEl = document.getElementById('register-terms-consent');
        if (consentEl && !consentEl.checked) {
            if (errorEl) {
                errorEl.textContent = '❌ Please accept the Terms & Conditions and Privacy Policy to continue.';
                errorEl.classList.remove('hidden');
            }
            consentEl.focus();
            return;
        }

        // Grade is a <select> with an "Other" option that reveals a free-text field — use that
        // text instead of the literal word "Other" when it's selected.
        const gradeSelectValue = document.getElementById('register-grade')?.value || '';
        const gradeValue = gradeSelectValue === 'Other'
            ? (document.getElementById('register-grade-other')?.value.trim() || '')
            : gradeSelectValue;

        const payload = {
            full_name: document.getElementById('register-name')?.value.trim() || '',
            email: document.getElementById('register-email')?.value.trim() || '',
            password: document.getElementById('register-password')?.value || '',
            role: registerRole,
            grade: registerRole === 'student' ? gradeValue : null,
            subject: registerRole === 'teacher' ? (document.getElementById('register-subject')?.value.trim() || '') : null,
            terms_accepted: true,
        };

        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Creating Account...'; }
            const data = await registerApi(payload);
            setSession(data.access_token, data.user);
            updateNavForAuthState();
            window.switchPage('generate');
        } catch (err) {
            console.error('Register error:', err);
            if (errorEl) { errorEl.textContent = `❌ ${err.message}`; errorEl.classList.remove('hidden'); }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
        }
    };

    window.login = async () => {
        const btn = document.getElementById('login-submit-btn');
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.classList.add('hidden');

        const email = document.getElementById('login-email')?.value.trim() || '';
        const password = document.getElementById('login-password')?.value || '';

        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Logging In...'; }
            const data = await loginApi(email, password);
            setSession(data.access_token, data.user);
            updateNavForAuthState();
            window.switchPage('generate');
        } catch (err) {
            console.error('Login error:', err);
            if (errorEl) { errorEl.textContent = `❌ ${err.message}`; errorEl.classList.remove('hidden'); }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
        }
    };

    window.logout = () => {
        clearSession();
        updateNavForAuthState();
        window.switchPage('landing');
    };

    // Profile page's account-edit form save (see profile.js for the form itself). Only
    // full_name plus whichever of grade/subject applies to this user's role are sent.
    window.updateProfile = async () => {
        const btn = document.getElementById('profile-save-btn');
        const statusEl = document.getElementById('profile-save-status');
        const user = getCachedUser();
        if (!user) return;

        const payload = {
            full_name: document.getElementById('profile-edit-name')?.value.trim() || '',
        };
        if (user.role === 'student') payload.grade = document.getElementById('profile-edit-grade')?.value.trim() || '';
        if (user.role === 'teacher') payload.subject = document.getElementById('profile-edit-subject')?.value.trim() || '';

        try {
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
            if (statusEl) statusEl.classList.add('hidden');
            const updated = await updateProfileApi(payload);
            setSession(getToken(), updated);
            if (statusEl) { statusEl.textContent = '✅ Profile updated.'; statusEl.className = 'text-sm text-emerald-400'; statusEl.classList.remove('hidden'); }
            if (window.renderProfileHeader) window.renderProfileHeader(updated);
        } catch (err) {
            console.error('Profile update error:', err);
            if (statusEl) { statusEl.textContent = `❌ ${err.message}`; statusEl.className = 'text-sm text-red-400'; statusEl.classList.remove('hidden'); }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
        }
    };

    // Landing hero's primary CTA — smart-routes based on session state rather than a static
    // href, since this is a no-build single-page app with no real client-side URL routing
    // (every "page" here is a switchPage() call, consistent since Phase 1).
    window.tryUstadExam = () => {
        window.switchPage(window.isAuthenticated() ? 'generate' : 'register');
    };

    // Same-page smooth scroll (e.g. hero's "See How It Works" secondary CTA) — not a page
    // switch, just scrolls within the already-active Landing page. Respects
    // prefers-reduced-motion instead of forcing a smooth scroll on everyone.
    window.scrollToSection = (sectionId) => {
        const el = document.getElementById(sectionId);
        if (!el) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };

    // Pricing page's tier CTAs. There's no automated billing system yet — paid tiers are
    // upgraded manually (see the Pricing page's FAQ: JazzCash/EasyPaisa + WhatsApp confirmation).
    // Logged-out visitors go to Register first; logged-in visitors on a paid tier see that
    // instruction instead of a broken "upgrade" button.
    window.pricingCta = (plan) => {
        if (!window.isAuthenticated()) { window.switchPage('register'); return; }
        const note = document.getElementById('pricing-cta-note');
        if (!note) return;
        if (plan === 'free') {
            note.textContent = "You're already set — Free is active on every new account by default.";
        } else {
            const label = plan === 'teacher_pro' ? 'Teacher Pro' : 'Student Pro';
            note.textContent = `To upgrade to ${label}: pay via JazzCash or EasyPaisa, then send your payment confirmation over WhatsApp. Your account is upgraded manually once confirmed (see the FAQ below).`;
        }
        note.classList.remove('hidden');
        note.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Google Identity Services flow. `mode` distinguishes the two buttons that call this:
    // 'login' (Login page) only signs an existing account in; 'register' (Register page) also
    // collects role/grade/subject/terms consent from that page's own form — exactly what
    // window.register() above sends — so a brand-new Google sign-in gets the same required
    // fields a password registration does. See routers/auth.py::google_auth() for the backend
    // half of this split.
    window.loginWithGoogle = (evt, mode) => {
        const btn = evt?.currentTarget || null;

        if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith('YOUR_')) {
            showAuthToast('Google Sign-In needs a Client ID configured — see auth.js.');
            return;
        }
        if (!window.google?.accounts?.id) {
            showAuthToast('Google Sign-In failed to load — check your connection and try again.');
            return;
        }

        // Register mode: validate/collect this form's own fields up front, same checks
        // window.register() applies, before ever opening the Google prompt.
        let extra = {};
        if (mode === 'register') {
            const consentEl = document.getElementById('register-terms-consent');
            if (consentEl && !consentEl.checked) {
                showAuthToast('Please accept the Terms & Conditions and Privacy Policy to continue.');
                consentEl.focus();
                return;
            }
            const gradeSelectValue = document.getElementById('register-grade')?.value || '';
            const gradeValue = gradeSelectValue === 'Other'
                ? (document.getElementById('register-grade-other')?.value.trim() || '')
                : gradeSelectValue;
            extra = {
                role: registerRole,
                grade: registerRole === 'student' ? gradeValue : null,
                subject: registerRole === 'teacher' ? (document.getElementById('register-subject')?.value.trim() || '') : null,
                terms_accepted: true,
            };
        }

        const original = btn ? btn.innerHTML : null;
        const setBusy = (label) => { if (btn) btn.innerHTML = `<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> ${label}`; };
        const restore = () => { if (btn && original !== null) btn.innerHTML = original; };

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: async (credentialResponse) => {
                try {
                    setBusy('Signing in…');
                    const data = await googleAuthApi({ id_token: credentialResponse.credential, ...extra });
                    setSession(data.access_token, data.user);
                    updateNavForAuthState();
                    window.switchPage('generate');
                } catch (err) {
                    console.error('Google sign-in error:', err);
                    showAuthToast(err.message || 'Google sign-in failed.');
                } finally {
                    restore();
                }
            },
        });
        // Google's One Tap / account-chooser prompt. It can be silently skipped (e.g. the user
        // dismissed it recently, or third-party cookies/prompts are blocked) — surface that
        // instead of leaving the click looking like it did nothing.
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
                showAuthToast('Google sign-in was blocked or dismissed — please try again.');
            }
        });
    };

    // Same visual pattern as attempt.js's anti-cheat toast (fixed top-center glass pill) —
    // reused here rather than duplicated, just under its own id so the two never collide.
    let authToastHideTimer = null;
    function showAuthToast(message) {
        let toast = document.getElementById('auth-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'auth-toast';
            toast.className = 'fixed top-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-2xl bg-surface/95 backdrop-blur-xl border border-primary/30 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex items-center gap-2 opacity-0 transition-opacity duration-300 pointer-events-none';
            toast.innerHTML = '<span class="material-symbols-outlined text-primary text-base">info</span><span id="auth-toast-text"></span>';
            document.body.appendChild(toast);
        }
        document.getElementById('auth-toast-text').textContent = message;
        toast.classList.remove('opacity-0');
        toast.classList.add('opacity-100');
        clearTimeout(authToastHideTimer);
        authToastHideTimer = setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
        }, 2800);
    }

    // Same "not wired up yet" pattern as Google Sign-In above — there's no password-reset
    // backend (no email service, no reset-token endpoint) to link this to yet. Uses a toast
    // instead of swapping its own (small, easy-to-miss) link text.
    window.forgotPassword = () => {
        showAuthToast('Password reset is coming soon — ask your admin for now');
    };

    // On load: if a session is cached, verify it's still valid against the backend (catches an
    // expired token or a rotated JWT secret) instead of trusting localStorage blindly.
    (async function initAuthState() {
        updateNavForAuthState();
        const token = getToken();
        if (!token) return;
        try {
            const user = await getMeApi();
            setSession(token, user);
        } catch (err) {
            clearSession();
        }
        updateNavForAuthState();
    })();

    console.log('✅ Auth controller initialized.');
});
