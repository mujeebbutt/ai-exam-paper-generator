// Profile Controller (Phase 5, restructured in the Phase 5 continuation) — account info only:
// avatar/name/email/role + an editable name/grade-or-subject form + Logout. Generated papers
// and the "My Learning Progress" dashboard (score chart, weak topics, attempt history — the
// Phase 3 dashboard, previously migrated onto this page) now live on the Library page instead,
// per "Profile is about the account, Library is about the papers." See renderLibraryProgress()
// below, called from generate.js's loadVault().
// Requires auth: see auth.js's requireAuthForPage(), enforced in generate.js's switchPage().

document.addEventListener('DOMContentLoaded', () => {

    let scoreChart = null; // Chart.js instance — destroyed and recreated on every reload

    window.initProfilePage = async () => {
        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) { window.switchPage('login'); return; } // safety net; switchPage already guards this
        renderProfileHeader(user);
        populateEditForm(user);
    };

    function renderProfileHeader(user) {
        const initials = (user.full_name || user.email || '?').trim().charAt(0).toUpperCase();
        const avatar = document.getElementById('profile-avatar');
        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        const roleBadge = document.getElementById('profile-role-badge');
        if (avatar) avatar.textContent = initials || '?';
        if (nameEl) nameEl.textContent = user.full_name || user.email;
        if (emailEl) emailEl.textContent = user.email;
        if (roleBadge) {
            const detail = user.role === 'teacher' ? user.subject : user.grade;
            roleBadge.textContent = `${user.role}${detail ? ' · ' + detail : ''}`;
        }
    }
    // Exposed so auth.js's updateProfile() can refresh the header immediately after a save,
    // without a full page reload.
    window.renderProfileHeader = renderProfileHeader;

    function populateEditForm(user) {
        const nameInput = document.getElementById('profile-edit-name');
        const gradeWrap = document.getElementById('profile-edit-grade-wrap');
        const subjectWrap = document.getElementById('profile-edit-subject-wrap');
        const gradeInput = document.getElementById('profile-edit-grade');
        const subjectInput = document.getElementById('profile-edit-subject');
        if (nameInput) nameInput.value = user.full_name || '';

        const isStudent = user.role === 'student';
        gradeWrap?.classList.toggle('hidden', !isStudent);
        subjectWrap?.classList.toggle('hidden', isStudent);
        if (isStudent && gradeInput) gradeInput.value = user.grade || '';
        if (!isStudent && subjectInput) subjectInput.value = user.subject || '';
    }

    // --- Library's "My Learning Progress" section (moved from Profile) ---

    window.renderLibraryProgress = async () => {
        const container = document.getElementById('library-progress');
        if (!container) return;
        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) { container.innerHTML = ''; return; }

        container.innerHTML = `<div class="text-center py-16 opacity-30 animate-pulse font-black uppercase tracking-[0.4em]">Loading Progress...</div>`;

        try {
            const [attempts, weakTopicsResp] = await Promise.all([
                getStudentAttemptsApi(user.email).catch(err => { console.error('Attempt history load error:', err); return []; }),
                getWeakTopicsApi(user.email, 60).catch(err => { console.error('Weak-topics load error:', err); return { topics: [] }; }),
            ]);
            renderProgressContent(attempts, weakTopicsResp.topics || []);
        } catch (err) {
            console.error('Library progress load error:', err);
            container.innerHTML = `
                <div class="text-center py-16 text-rose-500/60 font-black">
                    <span class="material-symbols-outlined text-6xl block mb-4">error</span>
                    Could not load progress: ${err.message}
                </div>`;
        }
    };

    function renderProgressContent(attempts, weakTopics) {
        const container = document.getElementById('library-progress');
        if (!container) return;
        const graded = attempts.filter(a => a.status === 'graded' && a.max_score);
        const avgPercent = graded.length > 0
            ? Math.round(graded.reduce((sum, a) => sum + (a.total_score / a.max_score) * 100, 0) / graded.length)
            : 0;
        const weakCount = weakTopics.filter(t => t.is_weak).length;

        container.innerHTML = `
            <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 px-2">My Learning Progress</h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div class="premium-glass p-8 rounded-[2.5rem] border border-white/5 text-center">
                    <span class="block text-5xl font-black text-primary">${attempts.length}</span>
                    <span class="block text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mt-2">Exams Attempted</span>
                </div>
                <div class="premium-glass p-8 rounded-[2.5rem] border border-white/5 text-center">
                    <span class="block text-5xl font-black text-white">${avgPercent}%</span>
                    <span class="block text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mt-2">Average Score</span>
                </div>
                <div class="premium-glass p-8 rounded-[2.5rem] border border-white/5 text-center">
                    <span class="block text-5xl font-black ${weakCount > 0 ? 'text-amber-400' : 'text-emerald-400'}">${weakCount}</span>
                    <span class="block text-[10px] font-black uppercase text-white/30 tracking-[0.2em] mt-2">Topics To Review</span>
                </div>
            </div>

            <div class="premium-glass p-8 rounded-[3rem] border border-white/5 space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Score Over Time</h3>
                <div class="h-[300px]">
                    ${graded.length > 0 ? '<canvas id="profile-score-chart"></canvas>' : '<p class="text-white/20 text-sm font-bold h-full flex items-center justify-center">No graded attempts yet.</p>'}
                </div>
            </div>

            ${renderTopicsSection(weakTopics)}

            <div class="space-y-4 pb-10">
                <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 px-2">Attempt History</h3>
                <div class="space-y-3">
                    ${attempts.length > 0 ? attempts.map(renderAttemptRow).join('') : '<p class="text-white/20 text-sm font-bold px-2">No exam attempts yet — take an exam from above to see your history here.</p>'}
                </div>
            </div>
        `;

        renderScoreChart(graded);
    }

    function renderTopicsSection(weakTopics) {
        if (weakTopics.length === 0) return '';
        return `
            <div class="space-y-4">
                <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 px-2">Topics To Review</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${weakTopics.map(t => `
                        <div class="premium-glass p-6 rounded-[2rem] border ${t.is_weak ? 'border-amber-500/30' : 'border-white/5'} flex items-center justify-between gap-4">
                            <div>
                                <p class="font-black text-white text-sm">${t.topic}</p>
                                <p class="text-[10px] font-bold text-white/30 mt-1">${t.questions_answered} question(s) answered</p>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="text-2xl font-black ${t.is_weak ? 'text-amber-400' : 'text-emerald-400'}">${t.average_percentage}%</span>
                                ${t.is_weak ? `<span class="flex items-center gap-1 justify-end text-[8px] font-black uppercase tracking-widest text-amber-400 mt-1"><span class="material-symbols-outlined text-xs">flag</span> Review</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Scores are floats (AI grading can award partial marks like 3.5), so round for display —
    // otherwise binary floating-point rounding shows up as e.g. "17.700000000000003".
    function formatScore(n) {
        return Math.round(n * 10) / 10;
    }

    function renderAttemptRow(a) {
        const percent = (a.status === 'graded' && a.max_score) ? Math.round((a.total_score / a.max_score) * 100) : null;
        const scoreColor = percent === null ? 'text-white/40' : (percent >= 40 ? 'text-emerald-400' : 'text-red-400');
        const dateStr = new Date(a.submitted_at || a.started_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        return `
            <div class="premium-glass px-8 py-5 rounded-[2rem] border border-white/5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <p class="font-black text-white">${a.exam_title || 'Untitled Exam'}</p>
                    <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">${a.subject || 'General'} · ${dateStr}</p>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${a.status === 'graded' ? 'border-emerald-500/30 text-emerald-400' : 'border-white/10 text-white/40'}">${a.status.replace('_', ' ')}</span>
                    <span class="text-xl font-black tabular-nums ${scoreColor}">${percent !== null ? `${formatScore(a.total_score)}/${formatScore(a.max_score)} (${percent}%)` : '—'}</span>
                </div>
            </div>`;
    }

    function renderScoreChart(gradedAttempts) {
        const canvas = document.getElementById('profile-score-chart');
        if (!canvas || typeof Chart === 'undefined' || gradedAttempts.length === 0) return;

        if (scoreChart) { scoreChart.destroy(); scoreChart = null; }

        const sorted = [...gradedAttempts].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
        const labels = sorted.map(a => new Date(a.submitted_at || a.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        const data = sorted.map(a => Math.round((a.total_score / a.max_score) * 100));

        scoreChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Score %',
                    data,
                    borderColor: '#c9184a',
                    backgroundColor: 'rgba(201, 24, 74, 0.15)',
                    pointBackgroundColor: '#ff6b8a',
                    pointBorderColor: '#ff6b8a',
                    pointRadius: 4,
                    tension: 0.3,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 100, ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.4)' }, grid: { display: false } },
                },
                plugins: { legend: { display: false } },
            }
        });
    }

    console.log('✅ Profile controller initialized.');
});
