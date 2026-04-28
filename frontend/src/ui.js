// UI Rendering Functions

function renderFileList(files, status = 'done') {
    const fileList = document.getElementById('file-list');
    const fileCountLabel = document.getElementById('file-count');
    
    if (files.length === 0) {
        fileList.classList.add('hidden');
        fileCountLabel.classList.add('hidden');
        fileList.innerHTML = '';
        return;
    }
    fileList.classList.remove('hidden');
    fileList.innerHTML = files.map((file, index) => `
    <div class="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 group/file hover:bg-white/10 hover:border-primary/30 transition-all animate-fadeIn">
        <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span class="material-symbols-outlined text-sm text-primary">
                ${status === 'uploading' ? 'sync' : (file.name.endsWith('.pdf') ? 'picture_as_pdf' : 'image')}
            </span>
        </div>
        <div class="flex flex-col">
            <span class="text-[11px] font-bold text-white/90 max-w-[150px] truncate">${file.name}</span>
            <span class="text-[9px] font-medium text-white/40 uppercase tracking-tighter">${(file.size / 1024).toFixed(0)} KB</span>
        </div>
        <button type="button" onclick="removeFile(${index})" class="ml-2 w-6 h-6 flex items-center justify-center rounded-full bg-white/5 hover:bg-primary text-white/40 hover:text-white transition-all shadow-lg">
            <span class="material-symbols-outlined text-xs">close</span>
        </button>
    </div>
`).join('');

    if (status === 'done') {
        fileCountLabel.textContent = files.length;
        fileCountLabel.classList.remove('hidden');
    }
}

function renderQuestionBody(q, showCorrect = false) {
    if (q.type === 'mcq' && q.options) {
        return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${q.options.map(opt => {
            const isCorrect = showCorrect && opt.trim().startsWith(q.answer.trim());
            return `
                    <div class="p-5 bg-white/5 border border-white/10 rounded-2xl text-white/70 text-base transition-all duration-500 ${isCorrect ? 'correct-highlight' : ''}">
                        <div class="flex justify-between items-center">
                            <span>${opt}</span>
                            ${isCorrect ? `
                                <span class="correct-label">
                                    <span class="material-symbols-outlined text-sm">check_circle</span> Correct
                                </span>
                            ` : ''}
                        </div>
                    </div>
                `;
        }).join('')}
        </div>
    `;
    }

    if (showCorrect) {
        return `
        <div class="space-y-3">
            <div class="p-8 bg-emerald-500/10 border border-emerald-500/30 rounded-[2rem] italic text-emerald-100 text-lg leading-relaxed shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <div class="flex items-center gap-3 mb-2">
                    <span class="material-symbols-outlined text-emerald-400">verified</span>
                    <span class="text-[10px] font-black uppercase tracking-widest text-emerald-400">Correct Answer</span>
                </div>
                "${q.answer}"
            </div>
        </div>
    `;
    }

    return `<div class="p-8 bg-white/5 border border-white/10 rounded-[2rem] italic text-white/90 text-lg leading-relaxed opacity-0">...</div>`;
}

function renderPreview(state) {
    const previewContent = document.getElementById('preview-content');
    const promptInput = document.getElementById('prompt-input');
    let html = '';

    // Watermark
    if (state.branding.enable_watermark) {
        html += `<div class="preview-watermark">${state.branding.watermark_text || 'CONFIDENTIAL'}</div>`;
    }

    html += `<div class="preview-content-wrapper">`;

    // Calculate Stats for Header
    const total = (state.counts.mcq * state.marks.mcq) +
        (state.counts.short * state.marks.short) +
        (state.counts.long * state.marks.long) +
        (state.counts.prog * state.marks.prog);
    const passing = Math.ceil((total * state.passingPercent) / 100);

    // Professional Header in Preview
    if (state.branding.enabled) {
        html += `
        <div class="text-center space-y-4 mb-20 border-b border-white/10 pb-10">
            <div class="flex justify-center mb-6">
                ${state.branding.logo_preview ? `<img src="${state.branding.logo_preview}" class="h-24 object-contain">` : `
                    <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined text-4xl">account_balance</span>
                    </div>
                `}
            </div>
            <h2 class="text-4xl font-black text-white uppercase tracking-tighter">${state.branding.exam_title || 'Professional Assessment'}</h2>
            <div class="space-y-1">
                <p class="text-xl font-bold text-white/60">${state.branding.uni || ''}</p>
                <p class="text-sm font-medium text-white/40">${state.branding.dept || ''}</p>
            </div>
            <div class="flex flex-wrap justify-center gap-6 pt-4">
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Subject: <span class="text-white">${promptInput.value || 'General'}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Time: <span class="text-white">${state.timeLimit}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Total Marks: <span class="text-white">${total}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Passing: <span class="text-white">${passing} (${state.passingPercent}%)</span></div>
            </div>
    `;
    } else {
        html += `
        <div class="text-center space-y-4 mb-10 border-b border-white/10 pb-10">
            <div class="flex flex-wrap justify-center gap-6 pt-4">
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Subject: <span class="text-white">${promptInput.value || 'General'}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Time: <span class="text-white">${state.timeLimit}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Total Marks: <span class="text-white">${total}</span></div>
                <div class="px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">Passing: <span class="text-white">${passing} (${state.passingPercent}%)</span></div>
            </div>
    `;
    }

    html += `
        ${state.student_info.enabled ? `
            <div class="grid grid-cols-2 gap-8 pt-10 border-t border-white/5 mt-10">
                ${state.student_info.show_name ? `
                    <div class="text-left space-y-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-white/40">Student Name</span>
                        <div class="h-10 border-b-2 border-white/10 w-full"></div>
                    </div>
                ` : ''}
                ${state.student_info.show_roll_no ? `
                    <div class="text-left space-y-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-white/40">Roll Number</span>
                        <div class="h-10 border-b-2 border-white/10 w-full"></div>
                    </div>
                ` : ''}
                ${state.student_info.show_class ? `
                    <div class="text-left space-y-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-white/40">Class / Semester</span>
                        <div class="h-10 border-b-2 border-white/10 w-full"></div>
                    </div>
                ` : ''}
                ${state.student_info.show_section || state.student_info.show_date ? `
                    <div class="text-left space-y-2 flex gap-4">
                        ${state.student_info.show_section ? `
                            <div class="flex-grow">
                                <span class="text-[10px] font-black uppercase tracking-widest text-white/40">Section</span>
                                <div class="h-10 border-b-2 border-white/10 w-full"></div>
                            </div>
                        ` : ''}
                        ${state.student_info.show_date ? `
                            <div class="flex-grow">
                                <span class="text-[10px] font-black uppercase tracking-widest text-white/40">Date</span>
                                <div class="h-10 border-b-2 border-white/10 w-full"></div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        ` : ''}
    </div>
`;

    const mcqs = state.questions.filter(q => q.type.toLowerCase() === 'mcq');
    const shorts = state.questions.filter(q => q.type.toLowerCase() === 'short');
    const longs = state.questions.filter(q => q.type.toLowerCase() === 'long');
    const progs = state.questions.filter(q => q.type.toLowerCase() === 'programming');

    let qIndex = 1;

    const renderSection = (title, questions, marksEach, instruction, sectionLabel) => {
        if (questions.length === 0) return '';
        let sectionHtml = `
        <div class="space-y-8 border-t border-white/10 pt-12 first:border-t-0 first:pt-0">
            <div class="space-y-1">
                <h3 class="text-lg font-black text-white uppercase tracking-wider">${sectionLabel}: ${title}</h3>
                <p class="text-[10px] font-bold text-white/40 uppercase tracking-widest">${instruction} (${questions.length} × ${marksEach} = ${questions.length * marksEach} Marks)</p>
            </div>
    `;

        questions.forEach((q, idx) => {
            const index = state.questions.indexOf(q);
            const isEditing = state.editingIndex === index;

            sectionHtml += `
            <div class="space-y-4 group/item relative p-4 rounded-xl transition-all ${isEditing ? 'bg-white/5 ring-1 ring-white/10' : 'hover:bg-white/[0.01]'}">
                <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/item:opacity-100 transition-all">
                    ${isEditing ? `
                        <button onclick="saveQuestion(${index})" class="bg-emerald-500/20 hover:bg-emerald-500/40 p-2 rounded-xl border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-[10px] font-black uppercase">
                            <span class="material-symbols-outlined text-sm">done</span> Save
                        </button>
                        <button onclick="cancelEdit()" class="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/5 text-white/60 flex items-center gap-2 text-[10px] font-black uppercase">
                            <span class="material-symbols-outlined text-sm">close</span>
                        </button>
                    ` : `
                        <div class="flex gap-2">
                            <button onclick="editQuestion(${index})" class="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/5 flex items-center gap-2 text-[10px] font-black uppercase" title="Edit Question">
                                <span class="material-symbols-outlined text-sm">edit</span>
                            </button>
                            <button onclick="deleteQuestion(${index})" class="bg-red-500/10 hover:bg-red-500/20 p-2 rounded-xl border border-red-500/10 text-red-400 flex items-center gap-2 text-[10px] font-black uppercase" title="Delete Question">
                                <span class="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                    `}
                </div>
                
                <div class="flex items-start gap-4">
                    <span class="text-white/60 font-black text-sm mt-0.5">${qIndex++}.</span>
                    <div class="flex-grow">
                        ${isEditing ? `
                            <textarea id="edit-q-text" class="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-lg font-bold text-white outline-none focus:border-primary min-h-[80px]">${q.question}</textarea>
                        ` : `
                            <h4 class="text-lg text-white font-medium leading-relaxed">
                                ${state.student_info.show_bloom_tags && q.bloom_level ? `<span class="text-primary text-[9px] uppercase tracking-widest font-black inline-block mr-2">[${q.bloom_level}]</span>` : ''}
                                ${q.question} <span class="text-xs font-bold text-white/20 ml-2">[${marksEach}]</span>
                            </h4>
                        `}
                    </div>
                </div>
                <div class="pl-8">
                    ${isEditing ? `
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase text-white/40">Model Answer</label>
                            <textarea id="edit-q-answer" class="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/80 outline-none focus:border-primary">${q.answer}</textarea>
                        </div>
                    ` : renderQuestionBody(q, state.showAnswers)}
                </div>
            </div>
        `;
        });

        sectionHtml += `</div>`;
        return sectionHtml;
    };

    html += renderSection("Multiple Choice Questions", mcqs, state.marks.mcq, "Part A: Select the most appropriate option for each question.", "SECTION A");
    html += renderSection("Short Answer Questions", shorts, state.marks.short, "Part B: Provide concise answers for the following questions.", "SECTION B");
    html += renderSection("Long Answer Questions", longs, state.marks.long, "Part C: Provide detailed answers for the following questions.", "SECTION C");
    html += renderSection("Programming Questions", progs, state.marks.prog, "Part D: Write clean, commented code for the following problems.", "SECTION D");

    html += `</div>`;
    previewContent.innerHTML = html;

    // Trigger MathJax to typeset the new content
    if (window.MathJax) {
        window.MathJax.typesetPromise([previewContent]).catch((err) => console.log('MathJax error:', err));
    }
}
