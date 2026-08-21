// Exam-Taking & AI Grading Controller
// Mirrors main.js's structure/conventions: a state object, DOM-driven rendering
// into fixed containers, and window.-exposed handlers for inline onclick/onchange.

document.addEventListener('DOMContentLoaded', () => {

    const attemptState = {
        pendingExamId: null,   // exam_id chosen from the Library, awaiting student ID entry
        examId: null,
        attemptId: null,
        studentId: null,
        examTitle: '',
        subject: '',
        timeLimit: '',
        totalMarks: 0,
        questions: [],          // [{id, type, question, options, marks, bloom_level}]
        responses: {},          // {questionId: responseString}
        view: 'answering',      // 'answering' | 'results'
        strictness: 'medium',
        grammarCheck: false,
        submitResult: null,     // {mcq_graded, pending_ai_grading}
        gradedAttempt: null,    // full AttemptDetail after grading
        isSubmitting: false,
        isGrading: false,
        timerSecondsLeft: null,
        timerInterval: null,
        // Phase 4: anti-cheat / integrity tracking — active only while view === 'answering'
        questionFirstTouch: {},   // {questionId: msTimestamp} — first interaction, for time_spent_seconds
        questionLastTouch: {},    // {questionId: msTimestamp} — most recent interaction
    };
    window.__attemptState = attemptState;

    const STUDENT_ID_KEY = 'exam_student_id';

    // --- Styled confirm/alert (replaces browser-native confirm()/alert() to stay on-brand) ---
    function showConfirmDialog(title, message, { okText = 'Confirm', cancelText = 'Cancel', showCancel = true, icon = 'help' } = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('attempt-confirm-modal');
            const iconEl = document.getElementById('attempt-confirm-icon');
            const titleEl = document.getElementById('attempt-confirm-title');
            const msgEl = document.getElementById('attempt-confirm-message');
            const okBtn = document.getElementById('attempt-confirm-ok-btn');
            const cancelBtn = document.getElementById('attempt-confirm-cancel-btn');
            if (!modal || !okBtn || !cancelBtn) { resolve(true); return; }

            if (iconEl) iconEl.textContent = icon;
            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.textContent = message;
            okBtn.textContent = okText;
            cancelBtn.textContent = cancelText;
            cancelBtn.style.display = showCancel ? '' : 'none';
            modal.style.display = 'flex';

            const cleanup = (result) => {
                modal.style.display = 'none';
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                resolve(result);
            };
            okBtn.onclick = () => cleanup(true);
            cancelBtn.onclick = () => cleanup(false);
        });
    }

    // --- Toast (Phase 4) — no reusable toast pattern exists elsewhere in the app (the AI-helper
    // bubble is deliberately hidden during an attempt, see enterAttemptPage), so this is a small,
    // on-brand, self-contained one: a pill that fades in/out, created lazily on first use.
    let toastHideTimer = null;
    function showToast(message) {
        let toast = document.getElementById('anti-cheat-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'anti-cheat-toast';
            toast.className = 'fixed top-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-2xl bg-surface/95 backdrop-blur-xl border border-primary/30 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex items-center gap-2 opacity-0 transition-opacity duration-300 pointer-events-none';
            toast.innerHTML = '<span class="material-symbols-outlined text-primary text-base">block</span><span id="anti-cheat-toast-text"></span>';
            document.body.appendChild(toast);
        }
        document.getElementById('anti-cheat-toast-text').textContent = message;
        toast.classList.remove('opacity-0');
        toast.classList.add('opacity-100');
        clearTimeout(toastHideTimer);
        toastHideTimer = setTimeout(() => {
            toast.classList.remove('opacity-100');
            toast.classList.add('opacity-0');
        }, 2200);
    }

    // --- Anti-Cheat Monitoring (Phase 4) — active only while an attempt is being answered ---
    let antiCheatActive = false;

    function handleVisibilityChange() {
        if (document.hidden && attemptState.attemptId) {
            logIntegrityEventApi(attemptState.attemptId, 'tab_switch')
                .catch(err => console.error('Integrity log (tab_switch) failed:', err));
        }
    }
    function handleWindowBlur() {
        if (attemptState.attemptId) {
            logIntegrityEventApi(attemptState.attemptId, 'focus_loss')
                .catch(err => console.error('Integrity log (focus_loss) failed:', err));
        }
    }
    // Question text only (tagged with .question-text in renderQuestionSection) — not the whole
    // card, not the answer options, per spec. Delegated + capture so it works on content that
    // gets re-rendered.
    function handleBlockedCopyOrCut(e) {
        if (e.target.closest && e.target.closest('.question-text')) {
            e.preventDefault();
            showToast(e.type === 'cut' ? 'Cutting is disabled during the exam.' : 'Copying is disabled during the exam.');
        }
    }
    function handleBlockedContextMenu(e) {
        if (e.target.closest && e.target.closest('.question-text')) {
            e.preventDefault();
            showToast('Right-click is disabled on questions during the exam.');
        }
    }
    // Answer fields only — pasting INTO an answer is blocked, but the underlying `paste` DOM
    // event fires the same way whether triggered by Ctrl+V or a right-click "Paste" menu item,
    // so this alone covers both without needing to separately disable the textarea's context menu.
    function handleBlockedPaste(e) {
        if (e.target && e.target.tagName === 'TEXTAREA') {
            e.preventDefault();
            showToast('Pasting is disabled during the exam.');
        }
    }

    function startAntiCheatMonitoring() {
        if (antiCheatActive) return;
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('copy', handleBlockedCopyOrCut, true);
        document.addEventListener('cut', handleBlockedCopyOrCut, true);
        document.addEventListener('contextmenu', handleBlockedContextMenu, true);
        document.addEventListener('paste', handleBlockedPaste, true);
        antiCheatActive = true;
    }
    function stopAntiCheatMonitoring() {
        if (!antiCheatActive) return;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('blur', handleWindowBlur);
        document.removeEventListener('copy', handleBlockedCopyOrCut, true);
        document.removeEventListener('cut', handleBlockedCopyOrCut, true);
        document.removeEventListener('contextmenu', handleBlockedContextMenu, true);
        document.removeEventListener('paste', handleBlockedPaste, true);
        antiCheatActive = false;
    }

    // --- Countdown Timer ---
    function parseTimeLimitToSeconds(text) {
        if (!text) return null;
        const lower = text.toLowerCase();
        const match = lower.match(/([\d.]+)/);
        if (!match) return null;
        const num = parseFloat(match[1]);
        if (lower.includes('hour')) return Math.round(num * 3600);
        return Math.round(num * 60); // "Mins" or unlabeled — assume minutes
    }

    // Scores are floats (AI grading can award partial marks like 3.5), so round for display —
    // otherwise binary floating-point rounding shows up as e.g. "17.700000000000003".
    function formatScore(n) {
        if (n === null || n === undefined) return n;
        return Math.round(n * 10) / 10;
    }

    function formatTimer(totalSeconds) {
        const s = Math.max(0, totalSeconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const pad = n => String(n).padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
    }

    function updateTimerDisplay() {
        const el = document.getElementById('attempt-timer');
        if (!el) return;
        el.textContent = formatTimer(attemptState.timerSecondsLeft);
        if (attemptState.timerSecondsLeft <= 60) {
            el.classList.add('text-red-400');
            el.classList.remove('text-white');
        }
    }

    function stopTimer() {
        if (attemptState.timerInterval) {
            clearInterval(attemptState.timerInterval);
            attemptState.timerInterval = null;
        }
    }

    function startTimer() {
        stopTimer();
        attemptState.timerSecondsLeft = parseTimeLimitToSeconds(attemptState.timeLimit);
        if (attemptState.timerSecondsLeft == null) return; // unparseable time limit — no timer, fail silently
        updateTimerDisplay();
        attemptState.timerInterval = setInterval(async () => {
            attemptState.timerSecondsLeft -= 1;
            updateTimerDisplay();
            if (attemptState.timerSecondsLeft <= 0) {
                stopTimer();
                if (attemptState.view === 'answering') {
                    await showConfirmDialog("Time's Up!", 'Your exam is being submitted automatically.', { showCancel: false, okText: 'OK', icon: 'timer_off' });
                    window.submitAttemptFlow();
                }
            }
        }, 1000);
    }

    // --- Entry point: Start Attempt Modal ---
    window.openStartAttemptModal = (examId) => {
        attemptState.pendingExamId = examId;
        const modal = document.getElementById('start-attempt-modal');
        const input = document.getElementById('start-attempt-student-id');
        const errorEl = document.getElementById('start-attempt-error');
        if (errorEl) errorEl.classList.add('hidden');

        // Already signed in — we know who's taking it, so skip the "enter your name" prompt
        // entirely and start the exam. Deliberately uses the account EMAIL as the student
        // identifier, not full_name: attempts are looked up by exact string match against
        // student_id (see backend/routers/attempts.py's get_student_attempts()), and
        // Profile/Library's "My Learning Progress" queries by getCurrentUser().email — so
        // anything other than the email here would record a graded attempt the student could
        // never actually see. (This was a real bug: attempts made through the old "type your
        // name" prompt were saved under whatever text was typed, e.g. "mujeeb butt", which never
        // matched the account's email, so they silently never showed up in Library.)
        // The modal (and its student-id field) only shows for a signed-out attempt — not
        // reachable from the current UI since every "Take Exam" entry point lives on a protected
        // page, but kept working in case an anonymous/shared-link flow is added later. If
        // starting fails, fall through to showing the modal so the error is never silently
        // swallowed.
        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (user) {
            if (input) input.value = user.email || user.full_name || '';
            window.confirmStartAttempt();
            return;
        }

        if (input) input.value = sessionStorage.getItem(STUDENT_ID_KEY) || '';
        if (modal) modal.style.display = 'flex';
    };

    window.closeStartAttemptModal = () => {
        const modal = document.getElementById('start-attempt-modal');
        if (modal) modal.style.display = 'none';
        attemptState.pendingExamId = null;
    };

    window.confirmStartAttempt = async () => {
        const input = document.getElementById('start-attempt-student-id');
        const errorEl = document.getElementById('start-attempt-error');
        const btn = document.getElementById('start-attempt-confirm-btn');
        const studentId = (input?.value || '').trim();

        if (!studentId) {
            if (errorEl) {
                errorEl.textContent = 'Please enter your name or ID to begin.';
                errorEl.classList.remove('hidden');
            }
            return;
        }
        if (!attemptState.pendingExamId) {
            window.closeStartAttemptModal();
            return;
        }

        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin material-symbols-outlined text-sm">sync</span>'; }
            sessionStorage.setItem(STUDENT_ID_KEY, studentId);

            const data = await startAttemptApi(attemptState.pendingExamId, studentId);

            attemptState.examId = data.exam_id;
            attemptState.attemptId = data.attempt_id;
            attemptState.studentId = studentId;
            attemptState.examTitle = data.exam_title || 'Examination';
            attemptState.subject = data.subject || '';
            attemptState.timeLimit = data.time_limit || '';
            attemptState.totalMarks = data.total_marks || 0;
            attemptState.questions = data.questions || [];
            attemptState.responses = {};
            attemptState.view = 'answering';
            attemptState.submitResult = null;
            attemptState.gradedAttempt = null;
            attemptState.questionFirstTouch = {};
            attemptState.questionLastTouch = {};
            stopTimer();
            attemptState.timerSecondsLeft = null;

            window.closeStartAttemptModal();
            enterAttemptPage();
        } catch (err) {
            console.error('Start attempt error:', err);
            // Surface the modal even when we skipped it (the signed-in auto-start path above) —
            // an error must never be silently swallowed just because there was no prompt shown.
            const modal = document.getElementById('start-attempt-modal');
            if (modal) modal.style.display = 'flex';
            if (errorEl) {
                // A raw backend message is fine when it's actually informative (e.g. "You've
                // already submitted this exam"); anything else falls back to a friendly line
                // instead of a blank/broken modal.
                errorEl.textContent = `❌ ${err.message || "We couldn't load your exam right now — please try again."}`;
                errorEl.classList.remove('hidden');
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-xl">play_arrow</span> Begin Exam'; }
        }
    };

    // --- Page Navigation ---
    function enterAttemptPage() {
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-attempt');
        if (page) page.classList.add('active');

        const titleEl = document.getElementById('attempt-exam-title');
        const subjectEl = document.getElementById('attempt-exam-subject');
        if (titleEl) titleEl.textContent = attemptState.examTitle;
        if (subjectEl) subjectEl.textContent = attemptState.subject || 'Assessment';

        const aiHelper = document.getElementById('ai-helper');
        if (aiHelper) aiHelper.style.display = 'none';

        // #main-nav is fixed at the viewport bottom (bottom: 130px) and can visually overlap
        // the first question's answer options on shorter viewports — the browser correctly
        // routes clicks to whatever's actually on top there, so those options become
        // unclickable. Hiding nav during an attempt removes that overlap (and doubles as a
        // reasonable "focus mode" so students aren't casually navigating away mid-exam).
        const mainNav = document.getElementById('main-nav');
        if (mainNav) mainNav.style.display = 'none';

        renderAttempt();
        startTimer();
        startAntiCheatMonitoring(); // stopped in exitAttempt() / once results render — never active outside an in-progress attempt
    }

    window.exitAttempt = async () => {
        const hasUnsavedWork = attemptState.view === 'answering' && Object.values(attemptState.responses).some(v => v && v.trim());
        if (hasUnsavedWork) {
            const proceed = await showConfirmDialog(
                'Leave Exam?',
                'Your answers have not been submitted yet. If you leave now, this progress will be lost.',
                { okText: 'Leave', cancelText: 'Stay', icon: 'logout' }
            );
            if (!proceed) return;
        }
        stopTimer();
        stopAntiCheatMonitoring();
        document.getElementById('page-attempt')?.classList.remove('active');
        const mainNav = document.getElementById('main-nav');
        if (mainNav) mainNav.style.display = '';
        if (window.switchPage) {
            window.switchPage('vault');
        } else if (window.loadVault) {
            window.loadVault();
        }
    };

    // --- Answer Recording (no full re-render on keystroke, to preserve focus) ---
    window.recordAnswer = (questionId, value) => {
        attemptState.responses[questionId] = value;
        // Approximate per-question time spent: first-to-last interaction with this question's
        // input. This is a single-scroll exam page (not one-question-per-screen), so it can't
        // measure exclusive focus time — it's an honest approximation, not a stopwatch.
        const now = Date.now();
        if (!attemptState.questionFirstTouch[questionId]) {
            attemptState.questionFirstTouch[questionId] = now;
        }
        attemptState.questionLastTouch[questionId] = now;
        updateAttemptProgress();
    };

    function getTimeSpentSeconds(questionId) {
        const first = attemptState.questionFirstTouch[questionId];
        const last = attemptState.questionLastTouch[questionId];
        if (!first || !last) return null;
        return Math.round((last - first) / 1000);
    }

    function updateAttemptProgress() {
        const answered = attemptState.questions.filter(q => (attemptState.responses[q.id] || '').trim() !== '').length;
        const counter = document.getElementById('attempt-progress-counter');
        if (counter) counter.textContent = `${answered} / ${attemptState.questions.length}`;
    }

    // --- Master Render Dispatcher ---
    function renderAttempt() {
        const contentEl = document.getElementById('attempt-content');
        const barEl = document.getElementById('attempt-action-bar');
        if (!contentEl || !barEl) return;

        if (attemptState.view === 'answering') {
            contentEl.innerHTML = renderAnsweringContent();
            barEl.innerHTML = renderAnsweringBar();
            updateAttemptProgress();
        } else if (attemptState.view === 'results') {
            contentEl.innerHTML = renderResultsContent();
            barEl.innerHTML = renderResultsBar();
        }

        if (window.MathJax) {
            window.MathJax.typesetPromise([contentEl]).catch((err) => console.log('MathJax error:', err));
        }
    }

    // --- View: Answering ---
    function renderQuestionInput(q) {
        const currentValue = attemptState.responses[q.id] || '';

        if (q.type.toLowerCase() === 'mcq' && q.options) {
            return `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${q.options.map(opt => {
                        const letter = opt.trim().charAt(0);
                        const checked = currentValue === letter ? 'checked' : '';
                        // The checked-state visual must be driven live by CSS (peer-checked), not
                        // computed once at render time — this list isn't re-rendered on every click
                        // (that would blow away focus in the textareas), so a JS-computed opacity/class
                        // here would never update and clicking would look like it did nothing.
                        return `
                        <label class="p-5 bg-white/5 border border-white/10 rounded-2xl text-white/70 text-base cursor-pointer transition-all hover:bg-white/10 has-[:checked]:bg-primary/20 has-[:checked]:border-primary has-[:checked]:text-white flex items-center gap-3">
                            <input type="radio" name="q-${q.id}" value="${letter}" class="peer hidden" ${checked} onchange="window.recordAnswer(${q.id}, this.value)">
                            <span class="w-5 h-5 rounded-full border-2 border-white/20 shrink-0 peer-checked:border-primary peer-checked:bg-primary transition-all"></span>
                            <span>${opt}</span>
                        </label>`;
                    }).join('')}
                </div>`;
        }

        const minHeight = q.type.toLowerCase() === 'long' ? 'min-h-[180px]' : 'min-h-[100px]';
        return `
            <textarea placeholder="Type your answer here..."
                oninput="window.recordAnswer(${q.id}, this.value)"
                class="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-medium text-base outline-none focus:border-primary transition-all ${minHeight}">${currentValue}</textarea>`;
    }

    function renderQuestionSection(title, questions, instruction, sectionLabel) {
        if (questions.length === 0) return '';
        let html = `
            <div class="space-y-8 border-t border-white/10 pt-12 first:border-t-0 first:pt-0">
                <div class="space-y-1">
                    <h3 class="text-lg font-black text-white uppercase tracking-wider">${sectionLabel}: ${title}</h3>
                    <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">${instruction}</p>
                </div>`;

        questions.forEach((q) => {
            const qNum = attemptState.questions.indexOf(q) + 1;
            html += `
                <div class="premium-glass p-8 rounded-[2.5rem] border border-white/5 space-y-5">
                    <div class="flex justify-between items-start gap-4">
                        <div class="flex gap-4 flex-grow">
                            <span class="text-xl font-black text-white/20 tabular-nums">${qNum}.</span>
                            <p class="question-text text-xl font-medium text-white/90 leading-relaxed flex-grow">${q.question}</p>
                        </div>
                        <span class="text-sm font-black text-white/40 tabular-nums shrink-0">[${q.marks}]</span>
                    </div>
                    ${renderQuestionInput(q)}
                </div>`;
        });

        html += `</div>`;
        return html;
    }

    function renderAnsweringContent() {
        const mcqs = attemptState.questions.filter(q => q.type.toLowerCase() === 'mcq');
        const shorts = attemptState.questions.filter(q => q.type.toLowerCase() === 'short');
        const longs = attemptState.questions.filter(q => q.type.toLowerCase() === 'long');

        const strictnessOptions = [
            { key: 'easy', label: 'Easy' },
            { key: 'medium', label: 'Medium' },
            { key: 'hard', label: 'Hard' },
        ];

        // Info badges + grading controls live inside ONE bordered premium-glass card (not floating
        // loose in open space) so they read as a single grouped panel, matching how the rest of the
        // app contains related info (e.g. the Library page's stat cards). No border-b on the outer
        // wrapper below: the first rendered section always carries its own border-t (Tailwind's
        // `first:` variant only fires for a literal first-child of its parent, and this wrapper div
        // is that first child, not the section) — an extra line here would double up with it.
        return `
            <div class="flex justify-center">
                <div class="premium-glass rounded-[2rem] border border-white/5 px-8 py-6 max-w-3xl w-full space-y-5">
                    <div class="flex flex-wrap justify-center gap-3">
                        <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Time Left: <span id="attempt-timer" class="text-white tabular-nums">${attemptState.timerSecondsLeft != null ? formatTimer(attemptState.timerSecondsLeft) : attemptState.timeLimit}</span></div>
                        <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Total Marks: <span class="text-white">${attemptState.totalMarks}</span></div>
                        <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Questions: <span class="text-white">${attemptState.questions.length}</span></div>
                    </div>
                    <div class="flex flex-wrap justify-center items-center gap-3 pt-5 border-t border-white/5">
                        <span class="text-[9px] font-black uppercase tracking-widest text-white/30">AI Grading</span>
                        <div id="attempt-strictness-pills" class="flex gap-2">
                            ${strictnessOptions.map(opt => `
                                <button type="button" data-strictness="${opt.key}" onclick="window.setStrictness('${opt.key}')"
                                    class="px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${attemptState.strictness === opt.key ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}">${opt.label}</button>
                            `).join('')}
                        </div>
                        <div class="w-px h-4 bg-white/10 mx-1"></div>
                        <span class="text-[9px] font-black uppercase tracking-widest text-white/30">Grammar Check</span>
                        <label class="switch scale-75">
                            <input type="checkbox" ${attemptState.grammarCheck ? 'checked' : ''} onchange="window.toggleGrammarCheck(this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            ${renderQuestionSection('Multiple Choice Questions', mcqs, 'Select the most appropriate option for each question.', 'SECTION A')}
            ${renderQuestionSection('Short Answer Questions', shorts, 'Provide concise answers for the following questions.', 'SECTION B')}
            ${renderQuestionSection('Long Answer Questions', longs, 'Provide detailed answers for the following questions.', 'SECTION C')}
        `;
    }

    function renderAnsweringBar() {
        // Deliberately more compact than the "Exam Controls" hero bar on page-generate — this bar
        // is a persistent utility strip during answering (main-nav is hidden throughout an attempt,
        // see enterAttemptPage()), so a smaller footprint leaves more headroom for the question list
        // above it and reduces how much of the last visible row it can cover on shorter viewports.
        return `
            <div class="premium-glass rounded-[2.5rem] px-8 py-5 border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)]">
                <div class="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
                    <div class="flex items-center gap-3">
                        <span class="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Answered</span>
                        <span id="attempt-progress-counter" class="text-2xl font-black text-white leading-tight">0 / ${attemptState.questions.length}</span>
                    </div>
                    <div id="attempt-bar-error" class="text-[10px] font-bold text-red-400 hidden"></div>
                    <button id="attempt-submit-btn" onclick="window.submitAttemptFlow()"
                        class="px-8 py-3.5 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-3">
                        <span class="material-symbols-outlined">done_all</span> Save &amp; Submit
                    </button>
                </div>
            </div>`;
    }

    // Strictness/grammar are now chosen up front (in the same info row as Time/Marks/Questions,
    // per request) instead of a separate screen after submitting — Save & Submit runs submit
    // and AI grading back-to-back using whatever was selected.
    window.setStrictness = (level) => {
        attemptState.strictness = level;
        document.querySelectorAll('#attempt-strictness-pills button').forEach(btn => {
            const active = btn.dataset.strictness === level;
            btn.classList.toggle('bg-primary', active);
            btn.classList.toggle('border-primary', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('bg-white/5', !active);
            btn.classList.toggle('border-white/10', !active);
            btn.classList.toggle('text-white/50', !active);
        });
    };

    window.toggleGrammarCheck = (checked) => {
        attemptState.grammarCheck = checked;
    };

    window.submitAttemptFlow = async () => {
        const btn = document.getElementById('attempt-submit-btn');
        const errorEl = document.getElementById('attempt-bar-error');
        if (errorEl) errorEl.classList.add('hidden');

        const unanswered = attemptState.questions.length - attemptState.questions.filter(q => (attemptState.responses[q.id] || '').trim() !== '').length;
        if (unanswered > 0) {
            const proceed = await showConfirmDialog(
                'Unanswered Questions',
                `${unanswered} question(s) are unanswered. Submit anyway?`,
                { okText: 'Submit Anyway', cancelText: 'Go Back', icon: 'warning' }
            );
            if (!proceed) return;
        }

        stopTimer();
        stopAntiCheatMonitoring(); // copy/paste/tab-tracking is only for the active answering phase, never results
        let submitSucceeded = false;

        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Submitting...'; }

            const answers = attemptState.questions.map(q => ({
                question_id: q.id,
                response: attemptState.responses[q.id] || '',
                time_spent_seconds: getTimeSpentSeconds(q.id),
            }));

            attemptState.submitResult = await submitAttemptApi(attemptState.attemptId, answers);
            submitSucceeded = true;

            if (btn) { btn.innerHTML = '<span class="animate-spin material-symbols-outlined">psychology</span> AI Grading...'; }
            attemptState.gradedAttempt = await gradeAttemptApi(attemptState.attemptId, attemptState.strictness, attemptState.grammarCheck);
            attemptState.view = 'results';
            renderAttempt();

            if (window.loadVault) window.loadVault();
        } catch (err) {
            console.error('Submit/grade error:', err);
            if (submitSucceeded) {
                // Submission already went through server-side — the attempt can't be re-submitted,
                // so only retry grading, not the whole flow.
                if (errorEl) {
                    errorEl.textContent = `❌ Submitted, but AI grading failed: ${err.message || 'unknown error'}. Retry grading below.`;
                    errorEl.classList.remove('hidden');
                }
                if (btn) {
                    btn.disabled = false;
                    btn.onclick = () => window.retryGrading();
                    btn.innerHTML = '<span class="material-symbols-outlined">psychology</span> Retry AI Grading';
                }
            } else {
                if (errorEl) {
                    errorEl.textContent = `❌ ${err.message || 'Submission failed. Please try again.'}`;
                    errorEl.classList.remove('hidden');
                }
                if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">done_all</span> Save &amp; Submit'; }
            }
        }
    };

    window.retryGrading = async () => {
        const btn = document.getElementById('attempt-submit-btn');
        const errorEl = document.getElementById('attempt-bar-error');
        if (errorEl) errorEl.classList.add('hidden');

        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin material-symbols-outlined">psychology</span> AI Grading...'; }
            attemptState.gradedAttempt = await gradeAttemptApi(attemptState.attemptId, attemptState.strictness, attemptState.grammarCheck);
            attemptState.view = 'results';
            renderAttempt();
            if (window.loadVault) window.loadVault();
        } catch (err) {
            console.error('Retry grading error:', err);
            if (errorEl) {
                errorEl.textContent = `❌ ${err.message || 'Grading failed again.'}`;
                errorEl.classList.remove('hidden');
            }
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">psychology</span> Retry AI Grading'; }
        }
    };

    // --- View: Results ---

    // Reuses the app's existing collapse/expand idiom (see .dropdown-trigger/.dropdown-menu in
    // main.js — chevron rotates, target toggles `hidden`) rather than inventing a new pattern.
    window.toggleWhyScore = (answerId) => {
        const panel = document.getElementById(`why-score-panel-${answerId}`);
        const chevron = document.getElementById(`why-score-chevron-${answerId}`);
        if (!panel) return;
        const opening = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        if (chevron) chevron.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
    };

    function renderRubricCriteria(criteria) {
        if (!criteria || criteria.length === 0) return '';
        return `
            <div class="space-y-2">
                <span class="block text-[9px] font-black uppercase tracking-widest text-white/40">Rubric Breakdown</span>
                ${criteria.map(c => `
                    <div class="flex items-start gap-3 p-3 rounded-xl border ${c.matched ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}">
                        <span class="material-symbols-outlined text-base shrink-0 ${c.matched ? 'text-emerald-400' : 'text-red-400'}">${c.matched ? 'check_circle' : 'cancel'}</span>
                        <div class="flex-grow">
                            <p class="text-sm text-white/80 font-bold">${c.criterion}</p>
                            ${c.note ? `<p class="text-xs text-white/40 mt-0.5">${c.note}</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>`;
    }

    function renderScoreSplit(feedback, marks, grammarActive) {
        if (feedback.content_score === null || feedback.content_score === undefined) return '';
        // Content and grammar are always shown as separate line items, never merged into one
        // number — the displayed content_score and grammar_deduction are exactly what the
        // backend derived the final score from (see grading_service.py), so they always add up.
        return `
            <div class="grid grid-cols-1 ${grammarActive ? 'md:grid-cols-2' : ''} gap-3">
                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <span class="block text-[9px] font-black uppercase tracking-widest text-white/40">Content Score</span>
                    <span class="text-xl font-black text-white">${formatScore(feedback.content_score)}<span class="text-white/30 text-sm font-bold"> / ${marks}</span></span>
                </div>
                ${grammarActive ? `
                    <div class="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                        <span class="block text-[9px] font-black uppercase tracking-widest text-amber-400">Grammar Deduction</span>
                        <span class="text-xl font-black text-amber-300">-${formatScore(feedback.grammar_deduction || 0)}</span>
                    </div>` : ''}
            </div>`;
    }

    function renderAnswerComparison(answer) {
        if (!answer.ideal_answer) return ''; // backend only sends this once the attempt is graded
        return `
            <div class="space-y-2 pt-2">
                <span class="block text-[9px] font-black uppercase tracking-widest text-white/40">Answer Comparison</span>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <span class="text-[9px] font-black uppercase tracking-widest text-white/30">Your Answer</span>
                        <div class="p-4 bg-white/5 rounded-xl border border-white/10 text-sm text-white/70">${answer.student_response || '(no response submitted)'}</div>
                    </div>
                    <div class="space-y-2">
                        <span class="text-[9px] font-black uppercase tracking-widest text-emerald-400">Model Answer</span>
                        <div class="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20 text-sm text-emerald-100">${answer.ideal_answer}</div>
                    </div>
                </div>
            </div>`;
    }

    function renderAnswerFeedbackCard(answer, qNum) {
        const isMcq = answer.question_type.toLowerCase() === 'mcq';
        const feedback = answer.ai_feedback || {};
        const needsReview = feedback.needs_manual_review;
        const scoreDisplay = answer.ai_score === null || answer.ai_score === undefined ? '—' : formatScore(answer.ai_score);
        const grammarActive = answer.grammar_check_enabled && feedback.grammar_deduction !== null && feedback.grammar_deduction !== undefined;

        // .correct-label (from style.css) carries a green pill background meant only for the
        // "Correct" state — reuse it as-is there, but build dedicated badges for the new
        // "Incorrect" / "Needs Review" states so they don't inherit that green background.
        let statusBadge = '';
        if (isMcq) {
            statusBadge = answer.is_correct
                ? `<span class="correct-label"><span class="material-symbols-outlined text-sm">check_circle</span> Correct</span>`
                : `<span class="inline-flex items-center gap-1 px-2 rounded-md bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider"><span class="material-symbols-outlined text-sm">cancel</span> Incorrect</span>`;
        } else if (needsReview) {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider"><span class="material-symbols-outlined text-sm">flag</span> Needs Manual Review</span>`;
        }

        // MCQ keeps its simple always-visible correct-answer note (nothing to expand — it's an
        // exact match, not a rubric). Subjective questions move feedback/missing/grammar_notes
        // into the "Why This Score" accordion below, alongside the rubric breakdown and the
        // ideal-answer comparison, so it reads as one trust panel instead of scattered boxes.
        let mcqFeedbackBoxes = '';
        if (isMcq) {
            mcqFeedbackBoxes = `
                ${feedback.feedback ? `
                    <div class="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-100 text-sm">
                        <span class="block text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">What you got right</span>
                        ${feedback.feedback}
                    </div>` : ''}
                ${feedback.missing ? `
                    <div class="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-100 text-sm">
                        <span class="block text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1">What was missing</span>
                        ${feedback.missing}
                    </div>` : ''}`;
        }

        let whyScoreSection = '';
        if (!isMcq && !needsReview) {
            whyScoreSection = `
                <div>
                    <button type="button" onclick="window.toggleWhyScore(${answer.id})"
                        class="w-full flex items-center justify-between px-5 py-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all">
                        <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/60">
                            <span class="material-symbols-outlined text-sm text-primary">fact_check</span> Why This Score
                        </span>
                        <span id="why-score-chevron-${answer.id}" class="material-symbols-outlined text-white/40 transition-transform">expand_more</span>
                    </button>
                    <div id="why-score-panel-${answer.id}" class="hidden space-y-4 pt-4">
                        ${renderScoreSplit(feedback, answer.marks, grammarActive)}
                        ${renderRubricCriteria(feedback.rubric_criteria)}
                        ${feedback.feedback ? `
                            <div class="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-100 text-sm">
                                <span class="block text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">What you got right</span>
                                ${feedback.feedback}
                            </div>` : ''}
                        ${feedback.missing ? `
                            <div class="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-100 text-sm">
                                <span class="block text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1">What was missing</span>
                                ${feedback.missing}
                            </div>` : ''}
                        ${grammarActive && feedback.grammar_notes ? `
                            <div class="p-5 bg-white/5 border border-white/10 rounded-2xl text-white/60 text-sm">
                                <span class="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1">Grammar Notes</span>
                                ${feedback.grammar_notes}
                            </div>` : ''}
                        ${renderAnswerComparison(answer)}
                    </div>
                </div>`;
        }

        return `
            <div class="premium-glass p-8 rounded-[2.5rem] border border-white/5 space-y-4 ${answer.is_correct ? 'correct-highlight' : ''}">
                <div class="flex justify-between items-start gap-4">
                    <div class="flex gap-4 flex-grow">
                        <span class="text-xl font-black text-white/20 tabular-nums">${qNum}.</span>
                        <p class="text-lg font-medium text-white/90 leading-relaxed flex-grow">${answer.question_text}</p>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="text-2xl font-black text-primary tabular-nums">${scoreDisplay}</span>
                        <span class="text-sm font-black text-white/40">/${answer.marks}</span>
                    </div>
                </div>
                ${statusBadge ? `<div>${statusBadge}</div>` : ''}
                <div class="p-5 bg-white/5 border border-white/10 rounded-2xl text-white/70 text-sm italic">
                    "${answer.student_response || '(no response submitted)'}"
                </div>
                ${mcqFeedbackBoxes}
                ${needsReview && feedback.error ? `
                    <div class="p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-200 text-xs">
                        AI grading could not complete for this question (${feedback.error}). A teacher should review it manually.
                    </div>` : ''}
                ${whyScoreSection}
            </div>`;
    }

    function renderResultsContent() {
        const attempt = attemptState.gradedAttempt;
        if (!attempt) return '<div class="text-center py-20 text-white/30 font-black">No results available.</div>';

        const percentage = attempt.max_score ? Math.round((attempt.total_score / attempt.max_score) * 100) : 0;

        return `
            <div class="text-center space-y-6 pb-10 border-b border-white/10">
                <span class="px-6 py-2 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-[0.4em] text-primary">Grading Complete</span>
                <div class="flex items-center justify-center gap-4">
                    <span class="text-7xl md:text-8xl font-black text-white tracking-tighter">${formatScore(attempt.total_score)}</span>
                    <span class="text-3xl font-black text-white/30">/ ${formatScore(attempt.max_score)}</span>
                </div>
                <p class="text-white/40 text-sm font-black uppercase tracking-widest">${percentage}% Overall</p>
            </div>
            <div class="space-y-8">
                ${attempt.answers.map((a, i) => renderAnswerFeedbackCard(a, i + 1)).join('')}
            </div>`;
    }

    function renderResultsBar() {
        return `
            <div class="premium-glass rounded-[3rem] p-8 border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)]">
                <div class="flex items-center justify-center gap-4 px-4 flex-wrap">
                    <div id="attempt-regenerate-error" class="w-full text-center text-[10px] font-bold text-red-400 hidden"></div>
                    <button onclick="window.exitAttempt()"
                        class="px-10 py-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white transition-all flex items-center gap-3">
                        <span class="material-symbols-outlined">inventory_2</span> Back to Library
                    </button>
                    <button id="attempt-regenerate-btn" onclick="window.regenerateSimilarExam()"
                        class="px-10 py-5 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-3">
                        <span class="material-symbols-outlined">refresh</span> Regenerate Similar Exam
                    </button>
                </div>
            </div>`;
    }

    // Practice mode: generates a fresh set of questions on the same topic/source material
    // (POST /api/exams/{exam_id}/regenerate), explicitly different from the ones just taken,
    // then offers to start practicing immediately via the same start-attempt modal used everywhere else.
    window.regenerateSimilarExam = async () => {
        const btn = document.getElementById('attempt-regenerate-btn');
        const errorEl = document.getElementById('attempt-regenerate-error');
        if (errorEl) errorEl.classList.add('hidden');
        if (!attemptState.examId) return;

        try {
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> Generating Practice Set...'; }
            const result = await regenerateExamApi(attemptState.examId);

            if (!result.exam_id) {
                throw new Error('The practice set was generated but could not be saved. Please try again.');
            }

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span> Start Practicing Now';
                btn.onclick = async () => {
                    await window.exitAttempt(); // returns to Library, restores main-nav, stops any lingering timer
                    window.openStartAttemptModal(result.exam_id);
                };
            }
            if (window.loadVault) window.loadVault();
        } catch (err) {
            console.error('Regenerate exam error:', err);
            if (errorEl) {
                errorEl.textContent = `❌ ${err.message || 'Could not generate a practice set. Please try again.'}`;
                errorEl.classList.remove('hidden');
            }
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">refresh</span> Regenerate Similar Exam'; }
        }
    };

    console.log('✅ Exam Attempt controller initialized.');
});
