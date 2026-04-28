// Main Application Controller

document.addEventListener('DOMContentLoaded', () => {

    const state = {
        sessionId: null,
        files: [],
        questions: [],
        isGenerating: false,
        selectedTypes: ['mcq', 'short', 'long'],
        activePage: 'generate',
        statusInterval: null,
        currentExams: [],
        branding: {
            uni: '',
            dept: '',
            logo_path: null,
            logo_preview: null,
            exam_title: 'Final Examination',
            enabled: false,
            enable_watermark: false,
            watermark_text: 'CONFIDENTIAL'
        },
        student_info: {
            enabled: true,
            show_name: true,
            show_roll_no: true,
            show_class: true,
            show_date: true,
            show_section: true,
            show_bloom_tags: false,
            multi_column_mcqs: false
        },
        marks: {
            mcq: 1,
            short: 4,
            long: 10,
            prog: 15
        },
        counts: {
            mcq: 10,
            short: 5,
            long: 2,
            prog: 0
        },
        timeLimit: '2 Hours',
        passingPercent: 40,
        editingIndex: null,
        isDarkTheme: true,
        showAnswers: false,
        isFromVault: false
    };

    // DOM Elements
    const pages = {
        generate: document.getElementById('page-generate'),
        vault: document.getElementById('page-vault'),
        about: document.getElementById('page-about')
    };
    const navButtons = {
        generate: document.getElementById('nav-generate'),
        vault: document.getElementById('nav-vault'),
        about: document.getElementById('nav-about'),
        createNew: document.getElementById('nav-create-new')
    };

    const fileUpload = document.getElementById('file-upload');
    const uploadTrigger = document.getElementById('upload-trigger');
    const promptInput = document.getElementById('prompt-input');
    const constructBtn = document.getElementById('construct-btn');
    const previewSection = document.getElementById('preview-section');
    const robotAvatar = document.getElementById('robot-avatar');
    const aiMessage = document.getElementById('ai-message');
    const showAnswersToggle = document.getElementById('show-answers-toggle');
    const createNewBtnMain = document.getElementById('create-new-btn-main');

    const brandingPanel = document.getElementById('branding-panel');
    const toggleBranding = document.getElementById('toggle-branding');
    const uniInput = document.getElementById('uni-name');
    const deptInput = document.getElementById('dept-name');
    const examTitleInput = document.getElementById('exam-title');

    // --- Navigation Logic ---
    function switchPage(pageId) {
        Object.keys(pages).forEach(id => {
            if (pages[id]) pages[id].classList.remove('active');
            if (navButtons[id]) {
                navButtons[id].classList.remove('active');
                navButtons[id].classList.add('text-white/40');
            }
        });
        if (pages[pageId]) pages[pageId].classList.add('active');
        if (navButtons[pageId]) {
            navButtons[pageId].classList.add('active');
            navButtons[pageId].classList.remove('text-white/40');
        }
        state.activePage = pageId;

        const aiHelper = document.getElementById('ai-helper');
        if (pageId === 'generate') {
            aiHelper.style.display = 'flex';
        } else {
            aiHelper.style.display = 'none';
            if (previewSection) {
                previewSection.classList.add('hidden');
                previewSection.style.display = 'none';
            }
        }

        if (pageId === 'vault') loadVault();
    }

    navButtons.generate.addEventListener('click', () => switchPage('generate'));
    navButtons.vault.addEventListener('click', () => switchPage('vault'));
    navButtons.about.addEventListener('click', () => switchPage('about'));
    if (navButtons.createNew) {
        navButtons.createNew.addEventListener('click', () => {
            // Only prompt if questions exist AND they are NOT from the vault (newly generated)
            if (state.questions.length > 0 && !state.isFromVault) {
                document.getElementById('reset-modal').style.display = 'flex';
            } else {
                performFullReset();
            }
        });
    }

    // Modal Action Buttons
    document.getElementById('confirm-reset')?.addEventListener('click', () => {
        performFullReset();
        document.getElementById('reset-modal').style.display = 'none';
    });

    document.getElementById('cancel-reset')?.addEventListener('click', () => {
        document.getElementById('reset-modal').style.display = 'none';
    });

    function performFullReset() {
        state.sessionId = null;
        state.files = [];
        state.questions = [];
        state.isGenerating = false;
        state.isFromVault = false;
        
        // Reset UI
        if (promptInput) promptInput.value = '';
        if (fileUpload) fileUpload.value = '';
        renderFileList([], 'done');
        
        // Reset Actions
        document.getElementById('post-gen-actions')?.classList.add('hidden');
        if (constructBtn) constructBtn.classList.remove('hidden');
        
        // Close Preview
        if (previewSection) previewSection.style.display = 'none';
        
        // Switch to generate page
        switchPage('generate');
        
        showAIMessage("System reset. Let's create something new!");
    }

    window.handleResetOption = (option) => {
        if (option === 'save') {
            showAIMessage("Paper saved to Library.");
            setTimeout(performFullReset, 1000);
        } else if (option === 'export') {
            window.generateQuestionPaper('pdf');
        } else {
            performFullReset();
        }
        document.getElementById('reset-modal').style.display = 'none';
    };

    // --- Branding & Settings Logic ---
    if (toggleBranding && brandingPanel) {
        toggleBranding.addEventListener('click', () => brandingPanel.classList.toggle('hidden'));
    }

    if (uniInput) uniInput.addEventListener('input', (e) => { state.branding.uni = e.target.value; renderPreview(state); });
    if (deptInput) deptInput.addEventListener('input', (e) => { state.branding.dept = e.target.value; renderPreview(state); });
    if (examTitleInput) examTitleInput.addEventListener('input', (e) => { state.branding.exam_title = e.target.value; renderPreview(state); });

    // Student Info Checkboxes
    ['name', 'roll', 'class', 'section', 'date'].forEach(field => {
        const el = document.getElementById(`show-student-${field}`);
        if (el) el.addEventListener('change', (e) => {
            state.student_info[`show_${field === 'roll' ? 'roll_no' : field}`] = e.target.checked;
            renderPreview(state);
        });
    });

    const bloomToggle = document.getElementById('show-bloom-tags');
    if (bloomToggle) bloomToggle.addEventListener('change', (e) => {
        state.student_info.show_bloom_tags = e.target.checked;
        renderPreview(state);
    });

    const multiColToggle = document.getElementById('multi-column-mcqs');
    if (multiColToggle) multiColToggle.addEventListener('change', (e) => {
        state.student_info.multi_column_mcqs = e.target.checked;
        renderPreview(state);
    });

    // Question Blueprint Inputs
    ['mcq', 'short', 'long'].forEach(type => {
        const countInput = document.getElementById(`${type}-count`);
        const marksInput = document.getElementById(`${type}-marks`);
        if (countInput) countInput.addEventListener('input', window.updateLiveMarks);
        if (marksInput) marksInput.addEventListener('input', window.updateLiveMarks);
    });
    if (createNewBtnMain) {
        createNewBtnMain.addEventListener('click', () => {
            if (state.questions.length > 0 && !state.isFromVault) {
                document.getElementById('reset-modal').style.display = 'flex';
            } else {
                performFullReset();
            }
        });
    }

    // --- Preview Header Buttons ---
    if (showAnswersToggle) {
        showAnswersToggle.addEventListener('change', (e) => {
            state.showAnswers = e.target.checked;
            renderPreview(state);
        });
    }

    // Dropdown Logic
    document.querySelectorAll('.dropdown-trigger').forEach(trigger => {
        trigger.onclick = (e) => {
            e.stopPropagation();
            const menu = trigger.nextElementSibling;
            if (!menu) return;
            const isHidden = menu.classList.contains('hidden');
            // Close all first
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
            if (isHidden) {
                menu.classList.remove('hidden');
                menu.classList.add('animate-fadeIn');
            }
        };
    });

    // Close dropdowns on global click
    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
    });

    const addQuestionBtn = document.getElementById('add-custom-q-btn-preview');
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', () => {
            document.getElementById('custom-q-modal').style.display = 'flex';
        });
    }


    // --- Export Functions ---
    window.generateQuestionPaper = async (format) => {
        if (!state.sessionId || state.questions.length === 0) return;
        showAIMessage(`Preparing ${format.toUpperCase()} Question Paper...`);
        
        const total = (state.counts.mcq * state.marks.mcq) + (state.counts.short * state.marks.short) + (state.counts.long * state.marks.long) + (state.counts.prog * state.marks.prog);
        const passing = Math.ceil((total * state.passingPercent) / 100);

        try {
            const response = await exportExamApi({
                session_id: state.sessionId,
                format: format,
                questions: state.questions,
                branding: state.branding,
                student_info: state.student_info,
                is_answer_key: false,
                include_answers: false,
                subject: promptInput.value || 'General',
                topic: 'Assessment',
                exam_title: state.branding.exam_title,
                time_limit: state.timeLimit,
                total_marks: total,
                passing_marks: passing,
                passing_percentage: state.passingPercent,
                mcq_marks: state.marks.mcq,
                short_marks: state.marks.short,
                long_marks: state.marks.long,
                prog_marks: state.marks.prog
            });
            const blob = await response.blob();
            downloadFile(blob, `Question_Paper_${state.sessionId}.${format}`);
        } catch (err) {
            showAIError("Export failed: " + err.message);
        }
    };

    window.generateAnswerKey = async (format) => {
        if (!state.sessionId || state.questions.length === 0) return;
        showAIMessage(`Preparing ${format.toUpperCase()} Answer Key...`);
        
        const total = (state.counts.mcq * state.marks.mcq) + (state.counts.short * state.marks.short) + (state.counts.long * state.marks.long) + (state.counts.prog * state.marks.prog);
        const passing = Math.ceil((total * state.passingPercent) / 100);

        try {
            const response = await exportExamApi({
                session_id: state.sessionId,
                format: format,
                questions: state.questions,
                branding: state.branding,
                student_info: state.student_info,
                is_answer_key: true,
                include_answers: true,
                subject: promptInput.value || 'General',
                topic: 'Answer Key',
                exam_title: state.branding.exam_title,
                time_limit: state.timeLimit,
                total_marks: total,
                passing_marks: passing,
                passing_percentage: state.passingPercent,
                mcq_marks: state.marks.mcq,
                short_marks: state.marks.short,
                long_marks: state.marks.long,
                prog_marks: state.marks.prog
            });
            const blob = await response.blob();
            downloadFile(blob, `Answer_Key_${state.sessionId}.${format}`);
        } catch (err) {
            showAIError("Export failed: " + err.message);
        }
    };

    function downloadFile(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    }

    const brandingToggle = document.getElementById('branding-toggle');
    const brandingOptions = document.getElementById('branding-options');
    if (brandingToggle && brandingOptions) {
        brandingToggle.addEventListener('change', (e) => {
            state.branding.enabled = e.target.checked;
            brandingOptions.classList.toggle('hidden', !e.target.checked);
            renderPreview(state);
        });
    }

    const watermarkToggle = document.getElementById('watermark-toggle');
    const watermarkOptions = document.getElementById('watermark-options');
    const watermarkText = document.getElementById('watermark-text');
    if (watermarkToggle && watermarkOptions) {
        watermarkToggle.addEventListener('change', (e) => {
            state.branding.enable_watermark = e.target.checked;
            watermarkOptions.classList.toggle('hidden', !e.target.checked);
            renderPreview(state);
        });
    }
    if (watermarkText) watermarkText.addEventListener('input', (e) => { state.branding.watermark_text = e.target.value; renderPreview(state); });

    const studentInfoToggle = document.getElementById('student-info-toggle');
    const studentInfoOptions = document.getElementById('student-info-options');
    if (studentInfoToggle && studentInfoOptions) {
        studentInfoToggle.addEventListener('change', (e) => {
            state.student_info.enabled = e.target.checked;
            studentInfoOptions.classList.toggle('hidden', !e.target.checked);
            renderPreview(state);
        });
    }

    // --- File Handling ---
    if (uploadTrigger && fileUpload) {
        uploadTrigger.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileUpload.click();
        };
        fileUpload.addEventListener('change', async (e) => {
            const selectedFiles = Array.from(e.target.files);
            if (state.files.length + selectedFiles.length > 5) {
                showAIError("Whoa! My brain can only handle 5 files at a time.");
                fileUpload.value = '';
                return;
            }
            state.files = [...state.files, ...selectedFiles];
            fileUpload.value = '';
            renderFileList(state.files, 'uploading');
            try {
                const data = await uploadFilesApi(state.files);
                state.sessionId = data.session_id;
                renderFileList(state.files, 'done');
            } catch (err) {
                showAIError("Upload failed. Make sure backend is running.");
            }
        });
    }

    window.removeFile = async (index) => {
        state.files.splice(index, 1);
        if (state.files.length === 0) {
            state.sessionId = null;
            renderFileList(state.files, 'done');
        } else {
            renderFileList(state.files, 'uploading');
            try {
                const data = await uploadFilesApi(state.files);
                state.sessionId = data.session_id;
                renderFileList(state.files, 'done');
            } catch (err) {
                showAIError("Update failed.");
            }
        }
    };

    // --- Generation Logic ---
    if (constructBtn) {
        constructBtn.addEventListener('click', async () => {
            if (!state.sessionId) {
                showAIError("Please attach at least one file first!");
                return;
            }
            constructBtn.classList.add('hidden');
            const loadingContainer = document.getElementById('loading-container');
            if (loadingContainer) loadingContainer.classList.remove('hidden');

            state.isGenerating = true;
            startThinking();
            try {
                const data = await generateExamApi({
                    session_id: state.sessionId,
                    difficulty: document.getElementById('difficulty').value,
                    mcq_count: state.counts.mcq,
                    short_count: state.counts.short,
                    long_count: state.counts.long,
                    prog_count: state.counts.prog,
                    mcq_marks: state.marks.mcq,
                    short_marks: state.marks.short,
                    long_marks: state.marks.long,
                    prog_marks: state.marks.prog,
                    time_limit: state.timeLimit,
                    passing_percentage: state.passingPercent,
                    exam_title: state.branding.exam_title,
                    branding: state.branding,
                    topic: promptInput.value,
                    student_info: state.student_info
                });
                state.questions = data.questions || [];
                if (state.questions.length === 0) {
                    showAIError("The AI didn't return any questions.");
                    constructBtn.classList.remove('hidden');
                } else {
                    renderPreview(state);
                    openPreview();
                    document.getElementById('post-gen-actions')?.classList.remove('hidden');
                }
            } catch (err) {
                showAIError(err.message);
                constructBtn.classList.remove('hidden');
            } finally {
                state.isGenerating = false;
                stopThinking();
            }
        });
    }

    // --- Helper UI Functions ---
    function openPreview() {
        previewSection.style.display = 'flex';
        setTimeout(() => {
            previewSection.classList.remove('hidden', 'opacity-0');
            previewSection.classList.add('opacity-100');
            document.getElementById('preview-window')?.classList.replace('scale-95', 'scale-100');
        }, 50);
    }

    window.closePreview = () => {
        const previewWindow = document.getElementById('preview-window');
        previewWindow?.classList.replace('scale-100', 'scale-95');
        previewSection.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            previewSection.classList.add('hidden');
            previewSection.style.display = 'none';
        }, 500);
    };

    // --- Global Window Functions (for HTML onclicks) ---
    window.deleteQuestion = (index) => {
        const modal = document.getElementById('delete-q-modal');
        if (!modal) {
            // Fallback if modal not found
            if (confirm("Delete this question from paper?")) {
                state.questions.splice(index, 1);
                renderPreview(state);
                showAIMessage("Question removed.");
            }
            return;
        }
        
        modal.style.display = 'flex';
        const confirmBtn = document.getElementById('confirm-delete-q-btn');
        confirmBtn.onclick = () => {
            state.questions.splice(index, 1);
            renderPreview(state);
            showAIMessage("Question removed.");
            closeDeleteQModal();
        };
    };

    window.closeDeleteQModal = () => {
        const modal = document.getElementById('delete-q-modal');
        if (modal) modal.style.display = 'none';
    };

    window.editQuestion = (index) => { state.editingIndex = index; renderPreview(state); };
    window.cancelEdit = () => { state.editingIndex = null; renderPreview(state); };
    window.saveQuestion = (index) => {
        state.questions[index].question = document.getElementById('edit-q-text').value;
        state.questions[index].answer = document.getElementById('edit-q-answer').value;
        state.editingIndex = null;
        renderPreview(state);
    };

    window.generateQuestionPaper = (format) => performExport(format, false, state.showAnswers);
    window.generateAnswerKey = (format) => performExport(format, true, true);

    async function performExport(format, isAnswerKey, includeAnswers) {
        if (state.questions.length === 0) return;
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        showAIMessage(`Preparing ${format.toUpperCase()}...`);

        try {
            const total = (state.counts.mcq * state.marks.mcq) + (state.counts.short * state.marks.short) + (state.counts.long * state.marks.long) + (state.counts.prog * state.marks.prog);
            const passingMarks = Math.ceil((total * state.passingPercent) / 100);
            
            // Sanitize branding to match backend BrandingInfo schema
            const sanitizedBranding = {
                uni: state.branding.uni || "",
                dept: state.branding.dept || "",
                logo_path: state.branding.logo_path,
                enable_watermark: state.branding.enable_watermark || false,
                watermark_text: state.branding.watermark_text || "CONFIDENTIAL"
            };

            const response = await fetch(`${API_BASE}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    format,
                    questions: state.questions,
                    branding: sanitizedBranding,
                    student_info: state.student_info,
                    is_answer_key: isAnswerKey,
                    include_answers: includeAnswers,
                    subject: state.branding.dept || promptInput.value || "Assessment",
                    topic: promptInput.value || "Assessment",
                    exam_title: state.branding.exam_title || "Final Examination",
                    time_limit: state.timeLimit,
                    total_marks: total,
                    passing_marks: passingMarks,
                    passing_percentage: state.passingPercent,
                    mcq_marks: state.marks.mcq,
                    short_marks: state.marks.short,
                    long_marks: state.marks.long,
                    prog_marks: state.marks.prog
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Export failed");
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${isAnswerKey ? 'Answer_Key' : 'Exam'}_${state.sessionId.slice(0, 8)}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showAIMessage(isAnswerKey ? "Answer Key ready!" : "Question Paper ready!");
        } catch (err) {
            console.error("Export Error:", err);
            showAIError("Export failed: " + err.message);
        }
    }

    // --- Custom Question Logic ---
    window.openCustomQModal = () => {
        const modal = document.getElementById('custom-q-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('clean-backdrop');
        }
        // Reset state
        document.getElementById('mcq-options-container').classList.add('hidden');
        document.getElementById('custom-q-type').value = 'Short';
    };

    window.closeCustomQModal = () => {
        document.getElementById('custom-q-modal').style.display = 'none';
    };

    const qTypeSelect = document.getElementById('custom-q-type');
    if (qTypeSelect) {
        qTypeSelect.addEventListener('change', (e) => {
            const container = document.getElementById('mcq-options-container');
            if (e.target.value === 'MCQ') {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        });
    }

    window.saveCustomQuestion = () => {
        const type = document.getElementById('custom-q-type').value;
        const text = document.getElementById('custom-q-text').value;
        const answer = document.getElementById('custom-q-answer').value;
        const bloom = document.getElementById('custom-q-bloom').value;
        
        if (!text) {
            showAIError("Question text is required!");
            return;
        }

        const newQ = {
            type: type.toLowerCase(),
            question: text,
            answer: answer || "No model answer provided.",
            bloom_level: bloom
        };

        if (type === 'MCQ') {
            const opts = Array.from(document.querySelectorAll('.mcq-opt')).map(i => i.value).filter(v => v.trim() !== "");
            if (opts.length < 2) {
                showAIError("MCQs need at least 2 options!");
                return;
            }
            newQ.options = opts;
        }

        state.questions.push(newQ);
        renderPreview(state);
        closeCustomQModal();
        showAIMessage("Question added!");
        
        // Reset form
        document.getElementById('custom-q-text').value = '';
        document.getElementById('custom-q-answer').value = '';
        document.querySelectorAll('.mcq-opt').forEach(i => i.value = '');
    };

    // --- Library Loading ---
    async function loadVault() {
        const vaultList = document.getElementById('vault-list');
        if (!vaultList) return;
        vaultList.innerHTML = '<div class="text-center py-20 opacity-30 animate-pulse font-black uppercase tracking-[0.4em]">Syncing Library...</div>';
        try {
            const exams = await fetchExams();
            console.log("Fetched Exams:", exams);
            state.currentExams = exams;
            if (!exams || exams.length === 0) {
                vaultList.innerHTML = `<div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10">Library Empty</div>`;
                return;
            }
            // ... (rest as updated above)
            // Update Library Header Stats
            document.getElementById('vault-count').textContent = exams.length;
            document.getElementById('vault-last-sync').textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
            
            vaultList.innerHTML = exams.map((exam, index) => `
                <div class="premium-glass p-8 rounded-[3rem] border border-white/5 hover:border-primary/30 transition-all group relative overflow-hidden flex flex-col h-full">
                    <div class="flex justify-between items-start mb-8">
                        <div class="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-3xl">description</span>
                        </div>
                        <button onclick="deleteExam('${exam.id}', '${exam.session_id}', event)" 
                                class="p-3 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/20 hover:text-rose-500 transition-all border border-transparent hover:border-rose-500/30">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                    
                    <div class="space-y-4 flex-grow cursor-pointer" onclick="viewExam(${index})">
                        <div class="space-y-1">
                            <span class="text-[9px] font-black uppercase tracking-widest text-primary">${exam.subject || 'Academic Paper'}</span>
                            <h4 class="text-3xl font-black text-white group-hover:text-primary transition-colors line-clamp-2 leading-none">${exam.title || 'Untitled Assessment'}</h4>
                        </div>
                        
                        <div class="flex gap-4 pt-4 border-t border-white/5 text-white/30 text-[10px] font-black uppercase tracking-widest">
                            <span>${exam.questions_data?.length || 0} Questions</span>
                        </div>
                    </div>
                    
                    <div class="mt-8 flex gap-3">
                        <button onclick="viewExam(${index})" class="flex-grow py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white transition-all">View Paper</button>
                    </div>
                </div>
            `).join('');
            updateStats(exams);
        } catch (err) {
            vaultList.innerHTML = `Sync Error`;
        }
    }

    function updateStats(exams) {
        const countEl = document.getElementById('vault-count');
        const syncEl = document.getElementById('vault-last-sync');
        if (countEl) countEl.textContent = exams.length;
        if (syncEl) syncEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    window.viewExam = (index) => {
        const exam = state.currentExams[index];
        state.questions = exam.questions_data;
        state.sessionId = exam.session_id;
        state.branding = exam.branding || state.branding;
        state.student_info = exam.student_info || state.student_info;
        state.isFromVault = true; 
        renderPreview(state);
        openPreview();
    };

    window.deleteExam = (id, sessionId, event) => {
        if (event) event.stopPropagation();
        const modal = document.getElementById('delete-confirm-modal');
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('confirm-delete-btn');
        confirmBtn.onclick = async () => {
            try {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<span class="animate-spin material-symbols-outlined text-sm">sync</span>';
                
                // Try deleting by DB ID first, then session_id fallback
                const targetId = id || sessionId;
                const response = await fetch(`${API_BASE}/exams/${targetId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error("Delete failed");
                
                showAIMessage("Exam deleted successfully.");
                closeDeleteModal();
                loadVault();
            } catch (err) {
                console.error("Delete Error:", err);
                showAIError("Could not delete exam.");
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Delete";
            }
        };
    };

    window.closeDeleteModal = () => {
        document.getElementById('delete-confirm-modal').style.display = 'none';
    };

    // --- Robot & Messages ---
    function showAIMessage(msg) {
        aiMessage.textContent = msg;
        setTimeout(() => aiMessage.textContent = "I am the AI assistant!", 4000);
    }

    function showAIError(msg) {
        aiMessage.textContent = msg;
        robotAvatar.classList.add('animate-wiggle');
        setTimeout(() => {
            aiMessage.textContent = "I am the AI assistant!";
            robotAvatar.classList.remove('animate-wiggle');
        }, 4000);
    }

    // --- AI Thinking ---
    function startThinking() {
        state.statusInterval = setInterval(() => {
            const msgs = ["Reading notes...", "Making questions...", "Almost done..."];
            document.getElementById('progress-status').textContent = msgs[Math.floor(Math.random() * msgs.length)];
        }, 1500);
    }

    function stopThinking() {
        clearInterval(state.statusInterval);
        document.getElementById('loading-container').classList.add('hidden');
    }

    window.updateLiveMarks = () => {
        state.counts.mcq = parseInt(document.getElementById('mcq-count')?.value) || 0;
        state.counts.short = parseInt(document.getElementById('short-count')?.value) || 0;
        state.counts.long = parseInt(document.getElementById('long-count')?.value) || 0;
        state.counts.prog = parseInt(document.getElementById('prog-count')?.value) || 0;

        state.marks.mcq = parseInt(document.getElementById('mcq-marks')?.value) || 1;
        state.marks.short = parseInt(document.getElementById('short-marks')?.value) || 4;
        state.marks.long = parseInt(document.getElementById('long-marks')?.value) || 10;
        state.marks.prog = parseInt(document.getElementById('prog-marks')?.value) || 15;

        state.passingPercent = parseInt(document.getElementById('passing-percent')?.value) || 40;
        state.timeLimit = document.getElementById('time-limit')?.value || '2 Hours';

        // Update Displays
        const displays = {
            mcq: document.getElementById('mcq-qty-display'),
            short: document.getElementById('short-qty-display'),
            long: document.getElementById('long-qty-display'),
            prog: document.getElementById('prog-qty-display')
        };
        Object.entries(displays).forEach(([type, el]) => { if (el) el.textContent = state.counts[type]; });

        const total = (state.counts.mcq * state.marks.mcq) + (state.counts.short * state.marks.short) + (state.counts.long * state.marks.long) + (state.counts.prog * state.marks.prog);
        const passing = Math.ceil((total * state.passingPercent) / 100);

        const totalDisplay = document.getElementById('total-marks-display');
        const passingDisplay = document.getElementById('passing-marks-display');
        if (totalDisplay) totalDisplay.textContent = total;
        if (passingDisplay) passingDisplay.textContent = passing;
    };

    window.toggleType = (type, isChecked) => {
        const countInput = document.getElementById(`${type}-count`);
        const marksInput = document.getElementById(`${type}-marks`);
        const card = document.getElementById(`card-${type}`);
        
        if (!isChecked) {
            countInput.setAttribute('data-last-val', countInput.value);
            countInput.value = 0;
            countInput.disabled = true;
            if (card) card.classList.add('opacity-40');
        } else {
            countInput.disabled = false;
            countInput.value = countInput.getAttribute('data-last-val') || (type === 'mcq' ? 10 : type === 'short' ? 5 : type === 'long' ? 2 : 0);
            if (card) card.classList.remove('opacity-40');
        }
        window.updateLiveMarks();
    };

    // Initialize UI
    setTimeout(() => window.updateLiveMarks(), 100);


});
