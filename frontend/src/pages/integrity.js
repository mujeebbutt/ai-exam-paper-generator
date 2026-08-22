// Integrity Log Controller (Phase 4) — teacher/admin view, not part of the student flow.
// Mirrors attempt.js/dashboard.js's conventions: DOM-driven rendering into a fixed
// container, window.-exposed handlers, and the same collapse/expand accordion idiom
// used for "Why This Score" in attempt.js — reused here for per-question time breakdown.

document.addEventListener('DOMContentLoaded', () => {

    let examsLoaded = false;

    window.initIntegrityPage = async () => {
        if (examsLoaded) return; // exam list doesn't change while this page is open; no need to refetch every visit
        const select = document.getElementById('integrity-exam-select');
        if (!select) return;
        try {
            const exams = await fetchExams();
            examsLoaded = true;
            exams.forEach(exam => {
                const opt = document.createElement('option');
                opt.value = exam.id;
                opt.textContent = `${exam.title || 'Untitled'} — ${exam.subject || 'General'}`;
                opt.className = 'bg-surface';
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('Failed to load exam list for integrity page:', err);
        }
    };

    window.loadIntegrityLog = async () => {
        const select = document.getElementById('integrity-exam-select');
        const contentEl = document.getElementById('integrity-content');
        const examId = select?.value;
        if (!contentEl) return;

        if (!examId) {
            contentEl.innerHTML = `
                <div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10 text-white/40">
                    <span class="material-symbols-outlined text-6xl block mb-4">verified_user</span>
                    Select an exam above to review integrity signals for its attempts.
                </div>`;
            return;
        }

        contentEl.innerHTML = `<div class="text-center py-20 opacity-30 animate-pulse font-black uppercase tracking-[0.4em]">Loading Integrity Log...</div>`;

        try {
            const attempts = await getExamIntegrityApi(examId);
            renderIntegrityLog(attempts);
        } catch (err) {
            console.error('Integrity log load error:', err);
            contentEl.innerHTML = `
                <div class="text-center py-20 text-rose-500/60 font-black">
                    <span class="material-symbols-outlined text-6xl block mb-4">error</span>
                    Could not load integrity log: ${err.message}
                </div>`;
        }
    };

    function renderIntegrityLog(attempts) {
        const contentEl = document.getElementById('integrity-content');
        if (attempts.length === 0) {
            contentEl.innerHTML = `
                <div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10 text-white/40">
                    <span class="material-symbols-outlined text-6xl block mb-4">inbox</span>
                    No attempts on this exam yet.
                </div>`;
            return;
        }
        contentEl.innerHTML = attempts.map(renderAttemptIntegrityRow).join('');
    }

    function formatScore(n) {
        if (n === null || n === undefined) return n;
        return Math.round(n * 10) / 10;
    }

    function renderAttemptIntegrityRow(a) {
        const flagCount = (a.tab_switch_count + a.focus_loss_count > 0 ? 1 : 0) + (a.flagged_fast_submission ? 1 : 0);
        const outlierCount = a.question_times.filter(qt => qt.is_outlier_fast).length;
        const hasAnySignal = flagCount > 0 || outlierCount > 0;
        const dateStr = new Date(a.submitted_at || a.started_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const scoreText = (a.status === 'graded' && a.max_score)
            ? `${formatScore(a.total_score)}/${formatScore(a.max_score)} (${Math.round((a.total_score / a.max_score) * 100)}%)`
            : a.status.replace('_', ' ');

        return `
            <div class="premium-glass rounded-[2rem] border ${hasAnySignal ? 'border-amber-500/20' : 'border-white/5'} overflow-hidden">
                <button type="button" onclick="window.toggleIntegrityRow(${a.attempt_id})"
                    class="w-full flex items-center justify-between gap-4 flex-wrap px-8 py-5 hover:bg-white/5 transition-all text-left">
                    <div>
                        <p class="font-black text-white">${a.student_id}</p>
                        <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">${dateStr} · ${scoreText}</p>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap">
                        ${(a.tab_switch_count + a.focus_loss_count) > 0 ? `
                            <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                                <span class="material-symbols-outlined text-xs">visibility_off</span> ${a.tab_switch_count} tab · ${a.focus_loss_count} focus
                            </span>` : `
                            <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                <span class="material-symbols-outlined text-xs">check_circle</span> No tab-switches
                            </span>`}
                        ${a.flagged_fast_submission ? `
                            <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest">
                                <span class="material-symbols-outlined text-xs">bolt</span> Fast Submission
                            </span>` : ''}
                        ${outlierCount > 0 ? `
                            <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                                <span class="material-symbols-outlined text-xs">timer</span> ${outlierCount} fast answer(s)
                            </span>` : ''}
                        <span id="integrity-chevron-${a.attempt_id}" class="material-symbols-outlined text-white/40 transition-transform">expand_more</span>
                    </div>
                </button>
                <div id="integrity-panel-${a.attempt_id}" class="hidden px-8 pb-6 space-y-2 border-t border-white/5 pt-4">
                    ${a.question_times.length === 0 ? '<p class="text-white/20 text-xs font-bold">No answers submitted yet.</p>' : a.question_times.map(qt => `
                        <div class="flex items-center justify-between gap-4 p-3 rounded-xl ${qt.is_outlier_fast ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/5 border border-white/10'}">
                            <p class="text-xs text-white/70 flex-grow truncate">${qt.question_text}</p>
                            <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${qt.is_outlier_fast ? 'text-amber-400' : 'text-white/40'} shrink-0">
                                ${qt.time_spent_seconds !== null ? `${qt.time_spent_seconds}s` : '—'} ${qt.is_outlier_fast ? '· fast' : ''}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    // Same chevron-toggle idiom as attempt.js's "Why This Score" accordion.
    window.toggleIntegrityRow = (attemptId) => {
        const panel = document.getElementById(`integrity-panel-${attemptId}`);
        const chevron = document.getElementById(`integrity-chevron-${attemptId}`);
        if (!panel) return;
        const opening = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        if (chevron) chevron.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
    };

    console.log('✅ Integrity Log controller initialized.');
});
