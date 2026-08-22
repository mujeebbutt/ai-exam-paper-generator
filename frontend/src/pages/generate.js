// Main Application Controller

document.addEventListener('DOMContentLoaded', () => {

    const state = {
        sessionId: null,
        // The generated exam's real DB id — only ever populated when /generate persisted it
        // (i.e. the caller was logged in; Generate is a protected page so that's always true
        // in practice). Drives the Preview modal's "Take Exam" button — see openPreview().
        examId: null,
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
            long: 10
        },
        counts: {
            mcq: 10,
            short: 5,
            long: 2
        },
        timeLimit: '2 Hours',
        passingPercent: 40,
        editingIndex: null,
        isDarkTheme: true,
        showAnswers: false,
        isFromVault: false,
        subject: null
    };

    // Make state globally accessible for debugging
    window.__appState = state;

    // Upload control flags
    let isUploading = false;
    let isLogoUploading = false;

    // DOM Elements
    // Every LEGAL_PAGES slug (legal.js) maps to the same shared #page-legal shell — its
    // title/date/body get filled in by window.showLegalPage(slug) right before switchPage()
    // runs, so activating any of these ids just shows whatever showLegalPage() last rendered.
    const legalPage = document.getElementById('page-legal');
    const legalPages = window.LEGAL_PAGES
        ? Object.fromEntries(Object.keys(window.LEGAL_PAGES).map(slug => [slug, legalPage]))
        : {};

    const pages = {
        generate: document.getElementById('page-generate'),
        vault: document.getElementById('page-vault'),
        integrity: document.getElementById('page-integrity'),
        profile: document.getElementById('page-profile'),
        landing: document.getElementById('page-landing'),
        login: document.getElementById('page-login'),
        register: document.getElementById('page-register'),
        legal: legalPage,
        ...legalPages,
    };
    const navButtons = {
        generate: document.getElementById('nav-generate'),
        vault: document.getElementById('nav-vault'),
        integrity: document.getElementById('nav-integrity'),
        profile: document.getElementById('nav-profile'),
        login: document.getElementById('nav-login'),
        register: document.getElementById('nav-register'),
        createNew: document.getElementById('nav-create-new')
    };

    const fileUpload = document.getElementById('file-upload');
    const uploadTrigger = document.getElementById('upload-trigger');
    const promptInput = document.getElementById('prompt-input');
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
        // Route guard (Phase 5): Profile and Generate require a logged-in session. The actual
        // enforcement is on the backend (every protected endpoint checks its own Bearer token
        // independently) — this only redirects the UI to Login before rendering a page the
        // user couldn't do anything on anyway.
        if (window.requireAuthForPage && !window.requireAuthForPage(pageId)) return;

        // Defensive: page-attempt is a page-content sibling owned by attempt.js,
        // not tracked in `pages` below — make sure it's never left active
        // underneath any other page if a nav button is clicked directly.
        document.getElementById('page-attempt')?.classList.remove('active');

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

        // Three mutually-exclusive nav treatments, swapped via inline style.display (not the
        // `hidden` utility class, since #landing-nav's own classes already include layout
        // utilities on the same element — a toggled class risks losing to them on specificity,
        // whereas style.display always wins):
        //   - Landing: its own floating pill header (logo/section-links/CTA).
        //   - Login/Register/Legal: just a minimal standalone back-to-Landing icon button — the
        //     full app-shell pill (Generate/Library/...) doesn't apply pre-auth, and cramming a
        //     "Back" item into it looked cluttered and overflowed on mobile. Legal pages reuse
        //     this same treatment (no bottom navbar/footer there, per spec) rather than getting
        //     a third bespoke back button.
        //   - Everywhere else: the normal app-shell pill.
        const isLanding = pageId === 'landing';
        const onLegalPage = pages[pageId] === legalPage;
        const onAuthPage = pageId === 'login' || pageId === 'register' || onLegalPage;
        const landingNav = document.getElementById('landing-nav');
        const mainNav = document.getElementById('main-nav');
        const authBackBtn = document.getElementById('auth-back-btn');
        if (landingNav) landingNav.style.display = isLanding ? '' : 'none';
        if (mainNav) mainNav.style.display = (isLanding || onAuthPage) ? 'none' : '';
        if (authBackBtn) authBackBtn.style.display = onAuthPage ? 'flex' : 'none';

        // The hero's simulated demo loop (landing.js) should only ever run while Landing is
        // actually on screen — start/stop it here rather than leaving an interval ticking in
        // the background on every other page.
        if (isLanding && window.startLandingHero) window.startLandingHero();
        else if (window.stopLandingHero) window.stopLandingHero();

        const aiHelper = document.getElementById('ai-helper');
        if (aiHelper) {
            if (pageId === 'generate') {
                aiHelper.style.display = 'flex';
            } else {
                aiHelper.style.display = 'none';
                if (previewSection) {
                    previewSection.classList.add('hidden');
                    previewSection.style.display = 'none';
                }
            }
        }

        if (pageId === 'vault') loadVault();
        if (pageId === 'profile' && window.initProfilePage) window.initProfilePage();
        if (pageId === 'integrity' && window.initIntegrityPage) window.initIntegrityPage();
        if (pageId === 'register' && window.initRegisterPage) window.initRegisterPage();
    }
    // Exposed on window so attempt.js (a separate script) can return to the Library
    // and refresh it after an exam attempt, reusing this logic instead of duplicating it.
    window.switchPage = switchPage;

    // Nav button event listeners
    if (navButtons.generate) {
        navButtons.generate.addEventListener('click', async () => {
            if (state.activePage !== 'generate') {
                switchPage('generate');
            } else {
                if (window.triggerGeneration) {
                    await window.triggerGeneration();
                }
            }
        });
    }
    if (navButtons.vault) {
        navButtons.vault.addEventListener('click', () => switchPage('vault'));
    }
    if (navButtons.integrity) {
        navButtons.integrity.addEventListener('click', () => switchPage('integrity'));
    }
    if (navButtons.profile) {
        navButtons.profile.addEventListener('click', () => switchPage('profile'));
    }
    if (navButtons.login) {
        navButtons.login.addEventListener('click', () => switchPage('login'));
    }
    if (navButtons.register) {
        navButtons.register.addEventListener('click', () => switchPage('register'));
    }
    const navLogoutBtn = document.getElementById('nav-logout');
    if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', () => { if (window.logout) window.logout(); });
    }

    // --- Reset Functions ---
    function performFullReset() {
        state.sessionId = null;
        state.files = [];
        state.questions = [];
        state.isGenerating = false;
        state.isFromVault = false;
        state.subject = null;
        
        // Clear stored session
        sessionStorage.removeItem('exam_session_id');
        window._lastSessionId = null;
        
        if (promptInput) promptInput.value = '';
        if (fileUpload) fileUpload.value = '';
        renderFileList([], 'done');
        
        const postGenActions = document.getElementById('post-gen-actions');
        if (postGenActions) postGenActions.classList.add('hidden');
        
        if (previewSection) {
            previewSection.classList.add('hidden');
            previewSection.style.display = 'none';
        }
        
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
        const resetModal = document.getElementById('reset-modal');
        if (resetModal) resetModal.style.display = 'none';
    };

    // Modal buttons
    const confirmReset = document.getElementById('confirm-reset');
    if (confirmReset) {
        confirmReset.addEventListener('click', () => {
            performFullReset();
            const resetModal = document.getElementById('reset-modal');
            if (resetModal) resetModal.style.display = 'none';
        });
    }

    const cancelReset = document.getElementById('cancel-reset');
    if (cancelReset) {
        cancelReset.addEventListener('click', () => {
            const resetModal = document.getElementById('reset-modal');
            if (resetModal) resetModal.style.display = 'none';
        });
    }

    // Create New button
    if (createNewBtnMain) {
        createNewBtnMain.addEventListener('click', () => {
            if (state.questions.length > 0 && !state.isFromVault) {
                const resetModal = document.getElementById('reset-modal');
                if (resetModal) resetModal.style.display = 'flex';
            } else {
                performFullReset();
            }
        });
    }

    // --- Branding & Settings Logic ---
    if (toggleBranding && brandingPanel) {
        toggleBranding.addEventListener('click', () => brandingPanel.classList.toggle('hidden'));
    }

    if (uniInput) {
        uniInput.addEventListener('input', (e) => {
            state.branding.uni = e.target.value;
            renderPreview(state);
        });
    }
    if (deptInput) {
        deptInput.addEventListener('input', (e) => {
            state.branding.dept = e.target.value;
            renderPreview(state);
        });
    }
    if (examTitleInput) {
        examTitleInput.addEventListener('input', (e) => {
            state.branding.exam_title = e.target.value;
            renderPreview(state);
        });
    }

    // Student Info Checkboxes
    ['name', 'roll', 'class', 'section', 'date'].forEach(field => {
        const el = document.getElementById(`show-student-${field}`);
        if (el) {
            el.addEventListener('change', (e) => {
                const key = field === 'roll' ? 'show_roll_no' : `show_${field}`;
                state.student_info[key] = e.target.checked;
                renderPreview(state);
            });
        }
    });

    const bloomToggle = document.getElementById('show-bloom-tags');
    if (bloomToggle) {
        bloomToggle.addEventListener('change', (e) => {
            state.student_info.show_bloom_tags = e.target.checked;
            renderPreview(state);
        });
    }

    const multiColToggle = document.getElementById('multi-column-mcqs');
    if (multiColToggle) {
        multiColToggle.addEventListener('change', (e) => {
            state.student_info.multi_column_mcqs = e.target.checked;
            renderPreview(state);
        });
    }

    // Question Blueprint Inputs
    ['mcq', 'short', 'long'].forEach(type => {
        const countInput = document.getElementById(`${type}-count`);
        const marksInput = document.getElementById(`${type}-marks`);
        if (countInput) countInput.addEventListener('input', window.updateLiveMarks);
        if (marksInput) marksInput.addEventListener('input', window.updateLiveMarks);
    });

    // Branding toggle
    const brandingToggle = document.getElementById('branding-toggle');
    const brandingOptions = document.getElementById('branding-options');
    if (brandingToggle && brandingOptions) {
        brandingToggle.addEventListener('change', (e) => {
            state.branding.enabled = e.target.checked;
            brandingOptions.classList.toggle('hidden', !e.target.checked);
            renderPreview(state);
        });
    }

    // Watermark toggle
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
    if (watermarkText) {
        watermarkText.addEventListener('input', (e) => {
            state.branding.watermark_text = e.target.value;
            renderPreview(state);
        });
    }

    // Student info toggle
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
    function renderFileList(files, status) {
        const fileList = document.getElementById('file-list');
        const fileCount = document.getElementById('file-count');
        
        if (!fileList) return;
        
        if (!files || files.length === 0) {
            fileList.innerHTML = '';
            if (fileCount) {
                fileCount.classList.add('hidden');
                fileCount.textContent = '0';
            }
            return;
        }
        
        if (fileCount) {
            fileCount.textContent = files.length;
            fileCount.classList.remove('hidden');
        }
        
        const statusIndicator = status === 'uploading' ? '⏳' : '✅';
        
        fileList.innerHTML = files.map((file, index) => `
            <span class="px-3 py-1 bg-white/5 rounded-full text-[8px] font-black text-white/60 border border-white/5 flex items-center gap-1 group">
                ${statusIndicator} ${file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name}
                <span onclick="removeFile(${index})" 
                      class="cursor-pointer text-white/20 hover:text-rose-500 transition-colors ml-1 text-xs font-bold">
                    ×
                </span>
            </span>
        `).join('');
    }

    // Make removeFile globally accessible
    window.removeFile = async (index) => {
        if (isUploading) {
            showAIError("Please wait for current upload to complete.");
            return;
        }
        
        if (index < 0 || index >= state.files.length) return;
        
        const removedFile = state.files[index];
        state.files.splice(index, 1);
        
        if (state.files.length === 0) {
            state.sessionId = null;
            sessionStorage.removeItem('exam_session_id');
            window._lastSessionId = null;
            renderFileList(state.files, 'done');
            showAIMessage("All files removed.");
            return;
        }
        
        renderFileList(state.files, 'uploading');
        isUploading = true;
        
        try {
            const data = await uploadFilesApi(state.files);
            state.sessionId = data.session_id;
            window._lastSessionId = data.session_id;
            sessionStorage.setItem('exam_session_id', data.session_id);
            renderFileList(state.files, 'done');
            showAIMessage(`✅ Updated: ${data.files.length} files remain.`);
        } catch (err) {
            console.error('Update error:', err);
            showAIError(`Failed to update file list: ${err.message}`);
            // Restore the file
            state.files.splice(index, 0, removedFile);
            renderFileList(state.files, 'done');
        } finally {
            isUploading = false;
        }
    };

    // File upload handler
    if (uploadTrigger && fileUpload) {
        uploadTrigger.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileUpload.value = '';
            fileUpload.click();
        };
        
        fileUpload.addEventListener('change', async (e) => {
            if (isUploading) {
                showAIError("Upload already in progress. Please wait...");
                fileUpload.value = '';
                return;
            }
            
            const selectedFiles = Array.from(e.target.files);
            
            if (selectedFiles.length === 0) {
                fileUpload.value = '';
                return;
            }
            
            // Validate file types
            const validExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
            const invalidFiles = selectedFiles.filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                return !validExtensions.includes(ext);
            });
            
            if (invalidFiles.length > 0) {
                showAIError(`❌ Invalid file type(s): ${invalidFiles.map(f => f.name).join(', ')}. Only PDF, PNG, JPG, JPEG allowed.`);
                fileUpload.value = '';
                return;
            }
            
            // Check file size (max 10MB)
            const maxSize = 10 * 1024 * 1024;
            const oversizedFiles = selectedFiles.filter(f => f.size > maxSize);
            if (oversizedFiles.length > 0) {
                showAIError(`❌ File(s) too large: ${oversizedFiles.map(f => f.name).join(', ')}. Max size is 10MB.`);
                fileUpload.value = '';
                return;
            }
            
            if (state.files.length + selectedFiles.length > 5) {
                showAIError("❌ Whoa! My brain can only handle 5 files at a time.");
                fileUpload.value = '';
                return;
            }
            
            isUploading = true;
            state.files = [...state.files, ...selectedFiles];
            fileUpload.value = '';
            renderFileList(state.files, 'uploading');
            
            try {
                const data = await uploadFilesApi(state.files);
                
                // CRITICAL: Store session ID in multiple places
                state.sessionId = data.session_id;
                window._lastSessionId = data.session_id;
                sessionStorage.setItem('exam_session_id', data.session_id);
                
                console.log('✅ Session ID stored:', data.session_id);
                console.log('🔍 State after upload:', {
                    sessionId: state.sessionId,
                    files: state.files.length
                });
                
                renderFileList(state.files, 'done');
                showAIMessage(`✅ Successfully uploaded ${data.files.length} file(s)!`);
                console.log('Upload success:', data);
            } catch (err) {
                console.error('Upload error:', err);
                showAIError(`❌ Upload failed: ${err.message || 'Make sure backend is running.'}`);
                // Rollback
                state.files = state.files.filter(f => !selectedFiles.includes(f));
                renderFileList(state.files, 'done');
            } finally {
                isUploading = false;
            }
        });
    }

    // --- Logo Upload ---
    const logoUpload = document.getElementById('logo-upload');
    const logoPreview = document.getElementById('logo-preview');
    if (logoUpload) {
        logoUpload.addEventListener('change', async (e) => {
            if (isLogoUploading) return;
            
            const file = e.target.files[0];
            if (!file) return;
            
            // Validate logo file
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
            if (!validTypes.includes(file.type)) {
                showAIError("❌ Logo must be PNG, JPG, or JPEG format.");
                logoUpload.value = '';
                return;
            }
            
            if (file.size > 2 * 1024 * 1024) {
                showAIError("❌ Logo file too large. Max 2MB.");
                logoUpload.value = '';
                return;
            }

            try {
                isLogoUploading = true;
                showAIMessage("⏳ Processing your logo...");
                const data = await uploadLogo(file);
                state.branding.logo_path = data.logo_url;
                
                if (logoPreview) {
                    logoPreview.innerHTML = `<img src="${data.logo_url}" class="w-full h-full object-contain" />`;
                    logoPreview.classList.remove('border-dashed');
                }
                renderPreview(state);
                showAIMessage("✅ Logo updated! Looks professional.");
            } catch (err) {
                console.error('Logo upload error:', err);
                showAIError(`❌ Logo upload failed: ${err.message || 'Please try again.'}`);
            } finally {
                isLogoUploading = false;
                logoUpload.value = '';
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
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
            if (isHidden) {
                menu.classList.remove('hidden');
                menu.classList.add('animate-fadeIn');
            }
        };
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
    });

    const addQuestionBtn = document.getElementById('add-custom-q-btn-preview');
    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', () => {
            const modal = document.getElementById('custom-q-modal');
            if (modal) modal.style.display = 'flex';
        });
    }

    // --- Export Functions ---
    function downloadFile(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    async function performExport(format, isAnswerKey, includeAnswers) {
        if (state.questions.length === 0) {
            showAIError("No questions to export!");
            return;
        }
        
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        showAIMessage(`⏳ Preparing ${format.toUpperCase()}...`);

        try {
            const total = (state.counts.mcq * state.marks.mcq) + 
                         (state.counts.short * state.marks.short) + 
                         (state.counts.long * state.marks.long);
            const passingMarks = Math.ceil((total * state.passingPercent) / 100);
            
            const sanitizedBranding = {
                uni: state.branding.uni || "",
                dept: state.branding.dept || "",
                logo_path: state.branding.logo_path || null,
                enable_watermark: state.branding.enable_watermark || false,
                watermark_text: state.branding.watermark_text || "CONFIDENTIAL"
            };

            const response = await fetch(`${API_BASE}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    format: format,
                    questions: state.questions,
                    branding: sanitizedBranding,
                    student_info: state.student_info,
                    is_answer_key: isAnswerKey,
                    include_answers: includeAnswers,
                    subject: state.branding.dept || promptInput?.value || "Assessment",
                    topic: promptInput?.value || "Assessment",
                    exam_title: state.branding.exam_title || "Final Examination",
                    time_limit: state.timeLimit,
                    total_marks: total,
                    passing_marks: passingMarks,
                    passing_percentage: state.passingPercent,
                    mcq_marks: state.marks.mcq,
                    short_marks: state.marks.short,
                    long_marks: state.marks.long
                })
            });

            if (!response.ok) {
                let errorDetail = 'Export failed';
                try {
                    const errData = await response.json();
                    errorDetail = errData.detail || errorDetail;
                } catch (e) {
                    errorDetail = await response.text() || errorDetail;
                }
                throw new Error(errorDetail);
            }
            
            const blob = await response.blob();
            const prefix = isAnswerKey ? 'Answer_Key' : 'Exam';
            const filename = `${prefix}_${state.sessionId?.slice(0, 8) || 'paper'}.${format}`;
            downloadFile(blob, filename);
            showAIMessage(`✅ ${isAnswerKey ? 'Answer Key' : 'Question Paper'} ready!`);
        } catch (err) {
            console.error("Export Error:", err);
            showAIError(`❌ Export failed: ${err.message}`);
        }
    }

    window.generateQuestionPaper = (format) => performExport(format, false, state.showAnswers);
    window.generateAnswerKey = (format) => performExport(format, true, true);

    // --- Generation Logic ---
    window.triggerGeneration = async () => {
        // Try to get session ID from multiple sources
        const sessionId = state.sessionId || 
                         window._lastSessionId || 
                         sessionStorage.getItem('exam_session_id');
        
        console.log('🔍 Generation triggered. Session sources:', {
            state: state.sessionId,
            window: window._lastSessionId,
            storage: sessionStorage.getItem('exam_session_id'),
            final: sessionId
        });
        
        if (!sessionId) {
            showAIError("❌ Please attach at least one file first!");
            console.error('❌ No session ID found. Files in state:', state.files.length);
            return;
        }
        
        // Ensure state has the session ID
        if (!state.sessionId) {
            state.sessionId = sessionId;
        }
        
        if (state.isGenerating) {
            showAIError("⏳ Generation already in progress...");
            return;
        }
        
        if (navButtons.generate) {
            navButtons.generate.classList.add('opacity-50', 'pointer-events-none');
        }
        
        const loadingContainer = document.getElementById('loading-container');
        if (loadingContainer) loadingContainer.classList.remove('hidden');

        state.isGenerating = true;
        window.startThinking();
        
        try {
            const dynamicSections = [];
            if (state.counts.mcq > 0) {
                dynamicSections.push({ 
                    type: 'mcq', 
                    count: state.counts.mcq, 
                    marks: state.marks.mcq, 
                    description: 'Multiple Choice' 
                });
            }
            if (state.counts.short > 0) {
                dynamicSections.push({ 
                    type: 'short', 
                    count: state.counts.short, 
                    marks: state.marks.short, 
                    description: 'Short Answer' 
                });
            }
            if (state.counts.long > 0) {
                dynamicSections.push({ 
                    type: 'long', 
                    count: state.counts.long, 
                    marks: state.marks.long, 
                    description: 'Long Answer' 
                });
            }

            const difficultySelect = document.getElementById('difficulty');
            const difficulty = difficultySelect ? difficultySelect.value : 'Medium';

            const data = await generateExamApi({
                session_id: state.sessionId,
                difficulty: difficulty,
                sections: dynamicSections,
                time_limit: state.timeLimit,
                passing_percentage: state.passingPercent,
                exam_title: state.branding.exam_title,
                branding: state.branding,
                topic: promptInput?.value || '',
                student_info: state.student_info
            });
            
            state.questions = data.questions || [];
            state.subject = data.subject || null;
            state.examId = data.exam_id || null;

            if (state.questions.length === 0) {
                showAIError("❌ The AI didn't return any questions. Please try again.");
            } else {
                showAIMessage(`✅ Generated ${state.questions.length} questions! Subject: ${state.subject || 'General'}`);
                renderPreview(state);
                openPreview();
                const postGenActions = document.getElementById('post-gen-actions');
                if (postGenActions) postGenActions.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Generation error:', err);
            showAIError(`❌ Generation failed: ${err.message || 'Please try again.'}`);
        } finally {
            state.isGenerating = false;
            stopThinking();
            if (navButtons.generate) {
                navButtons.generate.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
    };

    // --- Helper UI Functions ---
    // Role-aware "Take Exam" button in the Preview modal toolbar: primary/gradient for
    // students, secondary/ghost for teachers (who still get the option to preview/attempt
    // it themselves), hidden entirely if there's no persisted exam to attempt yet. Called
    // every time the modal opens, from both the fresh-generation and Library "View Paper"
    // paths (openPreview() is the shared entry point for both).
    function updatePreviewTakeExamButton() {
        const btn = document.getElementById('btn-take-exam-preview');
        const divider = document.getElementById('take-exam-divider');
        if (!btn) return;

        if (!state.examId) {
            btn.classList.add('hidden');
            btn.classList.remove('flex');
            if (divider) divider.classList.add('hidden');
            return;
        }
        btn.classList.remove('hidden');
        btn.classList.add('flex');
        if (divider) divider.classList.remove('hidden');

        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        const isTeacher = user?.role === 'teacher';
        btn.classList.remove('btn-brand-gradient', 'shadow-lg', 'shadow-primary/30', 'text-white',
                              'bg-white/5', 'hover:bg-white/10', 'border', 'border-white/10', 'text-white/70');
        if (isTeacher) {
            // Secondary/ghost — teachers' primary actions stay Question Paper / Answer Key export,
            // but they can still preview/attempt the exam themselves.
            btn.classList.add('bg-white/5', 'hover:bg-white/10', 'border', 'border-white/10', 'text-white/70');
        } else {
            // Primary/unmissable — this is the actual point of a student generating an exam.
            btn.classList.add('btn-brand-gradient', 'shadow-lg', 'shadow-primary/30', 'text-white');
        }
    }

    // Entry point for the Preview modal's "Take Exam" button — closes the document preview and
    // hands off to the existing attempt flow (same modal the Library's "Take Exam" card button
    // uses) instead of duplicating any of that logic here.
    window.takeExamFromPreview = () => {
        if (!state.examId) {
            showAIError("❌ We couldn't load this exam to attempt — please try generating it again.");
            return;
        }
        window.closePreview();
        if (window.openStartAttemptModal) window.openStartAttemptModal(state.examId);
    };

    function openPreview() {
        if (!previewSection) return;
        updatePreviewTakeExamButton();
        previewSection.style.display = 'flex';
        setTimeout(() => {
            previewSection.classList.remove('hidden', 'opacity-0');
            previewSection.classList.add('opacity-100');
            const previewWindow = document.getElementById('preview-window');
            if (previewWindow) {
                previewWindow.classList.replace('scale-95', 'scale-100');
            }
        }, 50);
    }

    window.closePreview = () => {
        if (!previewSection) return;
        const previewWindow = document.getElementById('preview-window');
        if (previewWindow) {
            previewWindow.classList.replace('scale-100', 'scale-95');
        }
        previewSection.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            previewSection.classList.add('hidden');
            previewSection.style.display = 'none';
        }, 500);
    };

    // --- Global Window Functions ---
    window.deleteQuestion = (index) => {
        if (index < 0 || index >= state.questions.length) return;
        
        const modal = document.getElementById('delete-q-modal');
        if (!modal) {
            if (confirm("Delete this question from paper?")) {
                state.questions.splice(index, 1);
                renderPreview(state);
                showAIMessage("Question removed.");
            }
            return;
        }
        
        modal.style.display = 'flex';
        const confirmBtn = document.getElementById('confirm-delete-q-btn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                state.questions.splice(index, 1);
                renderPreview(state);
                showAIMessage("Question removed.");
                closeDeleteQModal();
            };
        }
    };

    window.closeDeleteQModal = () => {
        const modal = document.getElementById('delete-q-modal');
        if (modal) modal.style.display = 'none';
    };

    window.editQuestion = (index) => {
        state.editingIndex = index;
        renderPreview(state);
    };
    
    window.cancelEdit = () => {
        state.editingIndex = null;
        renderPreview(state);
    };
    
    window.saveQuestion = (index) => {
        const qText = document.getElementById('edit-q-text');
        const qAnswer = document.getElementById('edit-q-answer');
        if (qText) state.questions[index].question = qText.value;
        if (qAnswer) state.questions[index].answer = qAnswer.value;
        state.editingIndex = null;
        renderPreview(state);
    };

    // --- Custom Question Logic ---
    window.openCustomQModal = () => {
        const modal = document.getElementById('custom-q-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('clean-backdrop');
        }
        const mcqContainer = document.getElementById('mcq-options-container');
        if (mcqContainer) mcqContainer.classList.add('hidden');
        const qTypeSelect = document.getElementById('custom-q-type');
        if (qTypeSelect) qTypeSelect.value = 'Short';
    };

    window.closeCustomQModal = () => {
        const modal = document.getElementById('custom-q-modal');
        if (modal) modal.style.display = 'none';
    };

    const qTypeSelect = document.getElementById('custom-q-type');
    if (qTypeSelect) {
        qTypeSelect.addEventListener('change', (e) => {
            const container = document.getElementById('mcq-options-container');
            if (container) {
                if (e.target.value === 'MCQ') {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                }
            }
        });
    }

    window.saveCustomQuestion = () => {
        const type = document.getElementById('custom-q-type')?.value || 'short';
        const text = document.getElementById('custom-q-text')?.value || '';
        const answer = document.getElementById('custom-q-answer')?.value || '';
        const bloom = document.getElementById('custom-q-bloom')?.value || 'Remember';
        
        if (!text.trim()) {
            showAIError("❌ Question text is required!");
            return;
        }

        const newQ = {
            type: type.toLowerCase(),
            question: text.trim(),
            answer: answer.trim() || "No model answer provided.",
            bloom_level: bloom
        };

        if (type === 'MCQ') {
            const optInputs = document.querySelectorAll('.mcq-opt');
            const opts = Array.from(optInputs).map(i => i.value.trim()).filter(v => v !== "");
            if (opts.length < 2) {
                showAIError("❌ MCQs need at least 2 options!");
                return;
            }
            newQ.options = opts;
        }

        state.questions.push(newQ);
        renderPreview(state);
        closeCustomQModal();
        showAIMessage("✅ Question added!");
        
        // Reset form
        const qText = document.getElementById('custom-q-text');
        const qAnswer = document.getElementById('custom-q-answer');
        if (qText) qText.value = '';
        if (qAnswer) qAnswer.value = '';
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

            // Phase 5 continuation: "My Learning Progress" (score chart / history / weak topics)
            // moved here from Profile — Library is the papers-and-performance home now, Profile
            // is account-only. See profile.js's renderLibraryProgress().
            if (window.renderLibraryProgress) window.renderLibraryProgress();

            if (!exams || exams.length === 0) {
                vaultList.innerHTML = `<div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10 text-white/40">
                    <span class="material-symbols-outlined text-6xl block mb-4">inventory_2</span>
                    Library Empty
                </div>`;
                return;
            }
            
            // Update Library Header Stats
            const vaultCount = document.getElementById('vault-count');
            const vaultLastSync = document.getElementById('vault-last-sync');
            if (vaultCount) vaultCount.textContent = exams.length;
            if (vaultLastSync) {
                vaultLastSync.textContent = new Date().toLocaleTimeString([], {
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: true
                });
            }
            
            vaultList.innerHTML = exams.map((exam, index) => `
                <div class="premium-glass p-8 rounded-[3rem] border border-white/5 hover:border-primary/30 transition-all group relative overflow-hidden flex flex-col h-full">
                    <div class="flex justify-between items-start mb-8">
                        <div class="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-3xl">description</span>
                        </div>
                        <button onclick="deleteExam('${exam.id || ''}', '${exam.session_id || ''}', event)" 
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
                            <span>•</span>
                            <span>${new Date(exam.created_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                    </div>
                    
                    <div class="mt-8 flex gap-3">
                        <button onclick="viewExam(${index})" class="flex-grow py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white transition-all">
                            View Paper
                        </button>
                        <button onclick="window.openStartAttemptModal(${exam.id})" class="flex-grow py-4 rounded-2xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-sm">edit_note</span> Take Exam
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Load vault error:', err);
            vaultList.innerHTML = `<div class="text-center py-20 text-rose-500/60 font-black">
                <span class="material-symbols-outlined text-6xl block mb-4">error</span>
                Sync Error: ${err.message}
            </div>`;
        }
    }
    // Exposed so attempt.js can refresh the Library after an exam attempt completes.
    window.loadVault = loadVault;

    window.viewExam = (index) => {
        if (index < 0 || index >= state.currentExams.length) return;
        
        const exam = state.currentExams[index];
        if (!exam) return;
        
        state.questions = exam.questions_data || [];
        state.sessionId = exam.session_id;
        window._lastSessionId = exam.session_id;
        sessionStorage.setItem('exam_session_id', exam.session_id);
        state.branding = exam.branding || state.branding;
        state.student_info = exam.student_info || state.student_info;
        state.isFromVault = true;
        state.subject = exam.subject || null;
        state.examId = exam.id || null;
        
        renderPreview(state);
        openPreview();
        showAIMessage(`📄 Loaded exam: ${exam.title || 'Untitled'}`);
    };

    window.deleteExam = (id, sessionId, event) => {
        if (event) event.stopPropagation();
        
        const modal = document.getElementById('delete-confirm-modal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('confirm-delete-btn');
        if (!confirmBtn) return;
        
        confirmBtn.onclick = async () => {
            try {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<span class="animate-spin material-symbols-outlined text-sm">sync</span>';
                
                const targetId = id || sessionId;
                if (!targetId) {
                    throw new Error("No exam identifier provided");
                }
                
                const response = await fetch(`${API_BASE}/exams/${targetId}`, { 
                    method: 'DELETE' 
                });
                
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || "Delete failed");
                }
                
                showAIMessage("✅ Exam deleted successfully.");
                closeDeleteModal();
                await loadVault();
            } catch (err) {
                console.error("Delete Error:", err);
                showAIError(`❌ Could not delete exam: ${err.message}`);
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Delete";
            }
        };
    };

    window.closeDeleteModal = () => {
        const modal = document.getElementById('delete-confirm-modal');
        if (modal) modal.style.display = 'none';
    };

    // --- Robot & Messages ---
    // Exposed on window: index.html's #robot-avatar has an inline onclick="...showAIMessage(...)"
    // attribute, which executes in the global scope and can't see this closure-local function
    // otherwise (pre-existing bug — surfaced as "showAIMessage is not defined" when clicked).
    window.showAIMessage = showAIMessage;
    function showAIMessage(msg) {
        if (!aiMessage) return;
        aiMessage.innerHTML = msg;
        setTimeout(() => {
            if (aiMessage) {
                aiMessage.innerHTML = "I am the AI assistant!<br>Attach files and click <strong class='text-primary'>GENERATE</strong> in the navbar to start.";
            }
        }, 5000);
    }

    function showAIError(msg) {
        if (!aiMessage || !robotAvatar) return;
        aiMessage.innerHTML = msg;
        robotAvatar.classList.add('animate-wiggle');
        setTimeout(() => {
            if (aiMessage) {
                aiMessage.innerHTML = "I am the AI assistant!<br>Attach files and click <strong class='text-primary'>GENERATE</strong> in the navbar to start.";
            }
            if (robotAvatar) {
                robotAvatar.classList.remove('animate-wiggle');
            }
        }, 5000);
    }

    // --- AI Thinking ---
    window.startThinking = () => {
        let step = 0;
        const msgs = [
            "Initializing AI Engine...",
            "Reading uploaded documents...",
            "Extracting core concepts...",
            "Structuring exam sections...",
            "Crafting challenging questions...",
            "Validating question quality...",
            "Finalizing paper..."
        ];
        
        const progressStatus = document.getElementById('progress-status');
        if (progressStatus) progressStatus.textContent = msgs[0];
        
        if (state.statusInterval) clearInterval(state.statusInterval);
        
        state.statusInterval = setInterval(() => {
            step++;
            const progressStatus = document.getElementById('progress-status');
            if (progressStatus) {
                if (step < msgs.length) {
                    progressStatus.textContent = msgs[step];
                } else {
                    const randomMsg = msgs[Math.floor(Math.random() * 3) + 3];
                    progressStatus.textContent = randomMsg;
                }
            }
        }, 2000);
    };

    function stopThinking() {
        if (state.statusInterval) {
            clearInterval(state.statusInterval);
            state.statusInterval = null;
        }
        const loadingContainer = document.getElementById('loading-container');
        if (loadingContainer) loadingContainer.classList.add('hidden');
    }

    // --- Live Marks Update ---
    window.updateLiveMarks = () => {
        const mcqCount = document.getElementById('mcq-count');
        const shortCount = document.getElementById('short-count');
        const longCount = document.getElementById('long-count');
        const mcqMarks = document.getElementById('mcq-marks');
        const shortMarks = document.getElementById('short-marks');
        const longMarks = document.getElementById('long-marks');
        const passingPercent = document.getElementById('passing-percent');
        const timeLimit = document.getElementById('time-limit');
        
        state.counts.mcq = parseInt(mcqCount?.value) || 0;
        state.counts.short = parseInt(shortCount?.value) || 0;
        state.counts.long = parseInt(longCount?.value) || 0;

        state.marks.mcq = parseInt(mcqMarks?.value) || 1;
        state.marks.short = parseInt(shortMarks?.value) || 4;
        state.marks.long = parseInt(longMarks?.value) || 10;

        state.passingPercent = parseInt(passingPercent?.value) || 40;
        state.timeLimit = timeLimit?.value || '2 Hours';

        // Update Displays
        const mcqDisplay = document.getElementById('mcq-qty-display');
        const shortDisplay = document.getElementById('short-qty-display');
        const longDisplay = document.getElementById('long-qty-display');
        if (mcqDisplay) mcqDisplay.textContent = state.counts.mcq;
        if (shortDisplay) shortDisplay.textContent = state.counts.short;
        if (longDisplay) longDisplay.textContent = state.counts.long;

        const total = (state.counts.mcq * state.marks.mcq) + 
                     (state.counts.short * state.marks.short) + 
                     (state.counts.long * state.marks.long);
        const passing = Math.ceil((total * state.passingPercent) / 100);

        const totalDisplay = document.getElementById('total-marks-display');
        const passingDisplay = document.getElementById('passing-marks-display');
        if (totalDisplay) totalDisplay.textContent = total;
        if (passingDisplay) passingDisplay.textContent = passing;
    };

    // --- Toggle Question Type ---
    window.toggleType = (type, isChecked) => {
        const countInput = document.getElementById(`${type}-count`);
        const marksInput = document.getElementById(`${type}-marks`);
        const card = document.getElementById(`card-${type}`);
        
        if (!countInput) return;
        
        if (!isChecked) {
            countInput.setAttribute('data-last-val', countInput.value);
            countInput.value = 0;
            countInput.disabled = true;
            if (marksInput) marksInput.disabled = true;
            if (card) card.classList.add('opacity-40');
        } else {
            countInput.disabled = false;
            if (marksInput) marksInput.disabled = false;
            const defaultValue = type === 'mcq' ? 10 : type === 'short' ? 5 : 2;
            countInput.value = countInput.getAttribute('data-last-val') || defaultValue;
            if (card) card.classList.remove('opacity-40');
        }
        window.updateLiveMarks();
    };

    // --- Debug Helper ---
    window.debugState = function() {
        console.log('🔍 Current State:', {
            sessionId: state.sessionId,
            windowSessionId: window._lastSessionId,
            storageSessionId: sessionStorage.getItem('exam_session_id'),
            files: state.files.length,
            filesList: state.files.map(f => f.name),
            questions: state.questions.length,
            isGenerating: state.isGenerating,
            isFromVault: state.isFromVault
        });
        return state;
    };

    // --- Initialize ---
    setTimeout(() => window.updateLiveMarks(), 100);

    // A legal-page link (footer, Register's consent checkbox, an external share) is a real
    // <a href="index.html#privacy" target="_blank"> — this is what makes that actually land on
    // the right document in the new tab instead of just whatever page loads by default. Takes
    // priority over the auth-based landing/generate default below; legal pages are public
    // regardless of login state. See legal.js for LEGAL_SLUG_FROM_HASH.
    if (window.LEGAL_SLUG_FROM_HASH && window.showLegalPage) {
        window.showLegalPage(window.LEGAL_SLUG_FROM_HASH);
    } else if (window.isAuthenticated && !window.isAuthenticated()) {
        // page-generate is marked active by default in the HTML (matches pre-Phase-5 behavior
        // for a returning logged-in user), but it's now a protected page — logged-out visitors
        // land on the public Landing page instead.
        switchPage('landing');
    }

    // Load vault if on vault page initially
    if (document.getElementById('page-vault')?.classList.contains('active')) {
        loadVault();
    }

    console.log('✅ UstadExam initialized successfully!');
    console.log('🔍 Type debugState() in console to check current state.');
});