const API_BASE = 'http://127.0.0.1:8000/api';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {

const state = {
    sessionId: null,
    files: [],
    questions: [],
    isGenerating: false,
    selectedTypes: ['mcq', 'short', 'long'], // Default common types
    activePage: 'generate',
    statusInterval: null,
    currentExams: [],
    branding: {
        uni: '',
        dept: '',
        logo_path: null,
        logo_preview: null,
        exam_title: 'Final Examination'
    },
    student_info: {
        enabled: false,
        show_name: true,
        show_roll_no: true
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
    showAnswers: false
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
    about: document.getElementById('nav-about')
};

const fileUpload = document.getElementById('file-upload');
const uploadTrigger = document.getElementById('upload-trigger');
const fileCountLabel = document.getElementById('file-count');
const fileList = document.getElementById('file-list');
const promptInput = document.getElementById('prompt-input');
const constructBtn = document.getElementById('construct-btn');
const previewSection = document.getElementById('preview-section');
const previewContent = document.getElementById('preview-content');
const statusText = document.getElementById('status-text');
const typeButtons = document.querySelectorAll('.type-pill');
const vaultList = document.getElementById('vault-list');
const copyToast = document.getElementById('copy-toast');
const robotAvatar = document.getElementById('robot-avatar');
const aiMessage = document.getElementById('ai-message');
const showAnswersToggle = document.getElementById('show-answers-toggle');

const brandingPanel = document.getElementById('branding-panel');
const toggleBranding = document.getElementById('toggle-branding');
const uniInput = document.getElementById('uni-name');
const deptInput = document.getElementById('dept-name');
const studentInfoToggle = document.getElementById('student-info-toggle');
const studentInfoOptions = document.getElementById('student-info-options');
const showNameCheck = document.getElementById('show-student-name');
const showRollCheck = document.getElementById('show-student-roll');

const statTotal = document.getElementById('stat-total');
const statQuestions = document.getElementById('stat-questions');

// --- Branding Logic (with null checks) ---
if (toggleBranding && brandingPanel) {
    toggleBranding.addEventListener('click', () => {
        brandingPanel.classList.toggle('hidden');
    });
}

if (uniInput) uniInput.addEventListener('input', (e) => state.branding.uni = e.target.value);
if (deptInput) deptInput.addEventListener('input', (e) => state.branding.dept = e.target.value);

const examTitleInput = document.getElementById('exam-title');
if (examTitleInput) examTitleInput.addEventListener('input', (e) => state.branding.exam_title = e.target.value);

// --- Student Info UI Logic ---
if (studentInfoToggle) {
    studentInfoToggle.addEventListener('change', (e) => {
        state.student_info.enabled = e.target.checked;
        if (e.target.checked) {
            studentInfoOptions.classList.remove('hidden');
        } else {
            studentInfoOptions.classList.add('hidden');
        }
        renderPreview();
    });
}

if (showNameCheck) {
    showNameCheck.addEventListener('change', (e) => {
        state.student_info.show_name = e.target.checked;
        renderPreview();
    });
}

if (showRollCheck) {
    showRollCheck.addEventListener('change', (e) => {
        state.student_info.show_roll_no = e.target.checked;
        renderPreview();
    });
}

// --- Logo Handling ---
const logoUpload = document.getElementById('logo-upload');
const logoPreview = document.getElementById('logo-preview');

if (logoUpload && logoPreview) {
    logoUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Local Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            logoPreview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-contain">`;
            state.branding.logo_preview = e.target.result;
        };
        reader.readAsDataURL(file);

    // Upload to Server
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch(`${API_BASE}/upload-logo`, { method: 'POST', body: formData });
        const data = await response.json();
        state.branding.logo_path = data.logo_path;
        showAIMessage("Logo uploaded successfully!");
    } catch (err) {
        showAIError("Failed to upload logo.");
    }
});
}

// --- UI Logic ---
window.toggleCard = (card) => {
    const type = card.getAttribute('data-type');
    
    // If clicking an already active card, we don't toggle off (at least one should be active conceptually, or we just handle counts)
    // Actually, let's just toggle the 'active-card' class
    document.querySelectorAll('.group\\/card').forEach(c => c.classList.remove('active-card'));
    card.classList.add('active-card');
};

window.updateLiveMarks = () => {
    state.counts.mcq = parseInt(document.getElementById('mcq-count').value) || 0;
    state.counts.short = parseInt(document.getElementById('short-count').value) || 0;
    state.counts.long = parseInt(document.getElementById('long-count').value) || 0;
    state.counts.prog = parseInt(document.getElementById('prog-count').value) || 0;

    state.marks.mcq = parseInt(document.getElementById('mcq-marks').value) || 1;
    state.marks.short = parseInt(document.getElementById('short-marks').value) || 4;
    state.marks.long = parseInt(document.getElementById('long-marks').value) || 10;
    state.marks.prog = parseInt(document.getElementById('prog-marks').value) || 15;

    state.passingPercent = parseInt(document.getElementById('passing-percent').value) || 40;
    state.timeLimit = document.getElementById('time-limit').value || '2 Hours';

    // Update Displays
    document.getElementById('mcq-qty-display').textContent = state.counts.mcq;
    document.getElementById('short-qty-display').textContent = state.counts.short;
    document.getElementById('long-qty-display').textContent = state.counts.long;
    document.getElementById('prog-qty-display').textContent = state.counts.prog;

    const total = (state.counts.mcq * state.marks.mcq) + 
                  (state.counts.short * state.marks.short) + 
                  (state.counts.long * state.marks.long) + 
                  (state.counts.prog * state.marks.prog);
    
    const passing = Math.ceil((total * state.passingPercent) / 100);

    document.getElementById('total-marks-display').textContent = total;
    document.getElementById('passing-marks-display').textContent = passing;
    
    state.selectedTypes = [];
    if (state.counts.mcq > 0) state.selectedTypes.push('mcq');
    if (state.counts.short > 0) state.selectedTypes.push('short');
    if (state.counts.long > 0) state.selectedTypes.push('long');
    if (state.counts.prog > 0) state.selectedTypes.push('prog');
};

// Initialize Live Marks
setTimeout(updateLiveMarks, 100);

window.toggleType = (type, isChecked) => {
    const input = document.getElementById(`${type}-count`);
    
    // Check if any other type is enabled
    const types = ['mcq', 'short', 'long', 'prog'];
    const otherTypes = types.filter(t => t !== type);
    const anyOtherEnabled = otherTypes.some(t => {
        const checkbox = document.querySelector(`#card-${t} input[type="checkbox"]`);
        return checkbox && checkbox.checked;
    });
    
    // If trying to disable and no other type is enabled, prevent it
    if (!isChecked && !anyOtherEnabled) {
        showAIError("At least one question type must be selected!");
        // Re-check the checkbox
        const checkbox = document.querySelector(`#card-${type} input[type="checkbox"]`);
        if (checkbox) checkbox.checked = true;
        return;
    }
    
    if (!isChecked) {
        // Save current value to data attribute if not zero
        if (parseInt(input.value) > 0) {
            input.setAttribute('data-last-val', input.value);
        }
        input.value = 0;
        input.disabled = true;
    } else {
        input.disabled = false;
        input.value = input.getAttribute('data-last-val') || (type === 'mcq' ? 10 : type === 'short' ? 5 : type === 'long' ? 2 : 0);
    }
    updateLiveMarks();
};
// --- Dropdown Logic ---
document.addEventListener('click', (e) => {
    // Toggle dropdowns
    if (e.target.closest('.dropdown-trigger')) {
        const container = e.target.closest('.dropdown-container');
        const menu = container.querySelector('.dropdown-menu');
        const isOpen = !menu.classList.contains('hidden');
        
        // Close all other menus first
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        
        if (!isOpen) {
            menu.classList.remove('hidden');
        }
        return;
    }

    // Close on click outside
    if (!e.target.closest('.dropdown-container')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
});

// --- Show Answers Toggle Logic ---
if (showAnswersToggle) {
    showAnswersToggle.addEventListener('change', (e) => {
        state.showAnswers = e.target.checked;
        renderPreview();
    });
}



// --- AI Thinking Animation ---
const thinkingMessages = [
    "Reading notes...", "Looking at text...", "Making questions...",
    "Checking answers...", "Fixing things...", "Almost done..."
];

const loadingContainer = document.getElementById('loading-container');
const loadingBar = document.getElementById('loading-bar');
const progressStatus = document.getElementById('progress-status');
const progressPercent = document.getElementById('progress-percent');

function startThinking() {
    let i = 0;
    let percent = 0;
    loadingContainer.classList.remove('hidden');
    
    // Show Skeleton UI
    previewSection.classList.remove('hidden');
    previewSection.classList.add('opacity-50');
    previewContent.innerHTML = `
        <div class="text-center py-10">
            <h3 class="text-2xl font-black text-white/40 animate-pulse">Generating your exam...</h3>
        </div>
        ${Array(3).fill(0).map(() => `
            <div class="p-8 rounded-3xl space-y-6 premium-glass border border-white/5">
                <div class="flex gap-4">
                    <div class="w-12 h-8 skeleton"></div>
                    <div class="flex-grow space-y-3">
                        <div class="w-3/4 h-6 skeleton"></div>
                        <div class="w-1/2 h-4 skeleton"></div>
                    </div>
                </div>
                <div class="pl-16 space-y-4">
                    <div class="w-full h-20 skeleton"></div>
                </div>
            </div>
        `).join('')}
    `;

    state.statusInterval = setInterval(() => {
        progressStatus.textContent = thinkingMessages[i % thinkingMessages.length];
        
        // Simulating progress movement
        if (percent < 90) {
            percent += Math.random() * 15;
            if (percent > 90) percent = 90;
            loadingBar.style.width = `${percent}%`;
            progressPercent.textContent = `${Math.round(percent)}%`;
        }
        
        i++;
    }, 1500);
}

function stopThinking() {
    clearInterval(state.statusInterval);
    loadingBar.style.width = `100%`;
    progressPercent.textContent = `100%`;
    setTimeout(() => {
        loadingContainer.classList.add('hidden');
        loadingBar.style.width = `0%`;
    }, 1000);
}

function showAIError(msg) {
    aiMessage.textContent = msg;
    aiMessage.parentElement.classList.add('border-primary');
    robotAvatar.classList.add('animate-wiggle');
    setTimeout(() => {
        aiMessage.textContent = "I am the AI, create your papers with my help!";
        aiMessage.parentElement.classList.remove('border-primary');
        robotAvatar.classList.remove('animate-wiggle');
    }, 4000);
}

// --- Navigation ---
function switchPage(pageId) {
    Object.keys(pages).forEach(id => {
        pages[id].classList.remove('active');
        navButtons[id].classList.remove('active');
        navButtons[id].classList.add('text-white/40');
    });
    pages[pageId].classList.add('active');
    navButtons[pageId].classList.add('active');
    navButtons[pageId].classList.remove('text-white/40');
    state.activePage = pageId;
    
    // Hide AI helper on other pages
    const aiHelper = document.getElementById('ai-helper');
    if (pageId === 'generate') {
        aiHelper.style.display = 'flex';
    } else {
        aiHelper.style.display = 'none';
    }

    if (pageId === 'vault') loadVault();
}

navButtons.generate.addEventListener('click', () => switchPage('generate'));
navButtons.vault.addEventListener('click', () => switchPage('vault'));
navButtons.about.addEventListener('click', () => switchPage('about'));

// --- File Handling ---
if (uploadTrigger && fileUpload) {
    uploadTrigger.addEventListener('click', () => fileUpload.click());

    fileUpload.addEventListener('change', async (e) => {
        const selectedFiles = Array.from(e.target.files);
        
        if (state.files.length + selectedFiles.length > 5) {
            showAIError("Whoa! My brain can only handle 5 files at a time.");
            fileUpload.value = ''; // Clear input
            return;
        }

        state.files = [...state.files, ...selectedFiles];
        fileUpload.value = ''; // Clear input so same file can be picked again
        renderFileList('uploading');
        await uploadFiles();
    });
}

function renderFileList(status = 'done') {
    if (state.files.length === 0) {
        fileList.classList.add('hidden');
        fileCountLabel.classList.add('hidden');
        fileList.innerHTML = '';
        return;
    }
    fileList.classList.remove('hidden');
    fileList.innerHTML = state.files.map((file, index) => `
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
        fileCountLabel.textContent = state.files.length;
        fileCountLabel.classList.remove('hidden');
    }
}

window.removeFile = async (index) => {
    state.files.splice(index, 1);
    if (state.files.length === 0) {
        state.sessionId = null;
        renderFileList('done');
    } else {
        renderFileList('uploading');
        await uploadFiles();
    }
};

async function uploadFiles() {
    if (state.files.length === 0) return;
    const formData = new FormData();
    state.files.forEach(file => formData.append('files', file));
    try {
        const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
        const data = await response.json();
        state.sessionId = data.session_id;
        renderFileList('done');
    } catch (err) { 
        console.error(err);
        showAIError("Connection error! Make sure the backend is running.");
    }
}

// --- Type Toggles ---
if (typeButtons.length > 0) {
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            if (btn.classList.contains('active')) {
                if (state.selectedTypes.length <= 1) return;
                btn.classList.remove('active');
                state.selectedTypes = state.selectedTypes.filter(t => t !== type);
            } else {
                btn.classList.add('active');
                state.selectedTypes.push(type);
            }
        });
    });
}

if (constructBtn) {
    constructBtn.addEventListener('click', async () => {
    if (!state.sessionId) {
        showAIError("Please attach at least one file first!");
        return;
    }

    state.isGenerating = true;
    startThinking();
    constructBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
                branding: {
                    uni: state.branding.uni,
                    dept: state.branding.dept,
                    logo_path: state.branding.logo_path
                },
                topic: promptInput.value,
                student_info: state.student_info
            })
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Server error");
        }
        const data = await response.json();
        state.questions = data.questions || [];
        console.log("DEBUG: Received questions:", state.questions);
        if (state.questions.length === 0) {
            showAIError("The AI didn't return any questions. Try a different topic!");
        } else {
            renderPreview();
            previewSection.classList.remove('hidden');
        }
        setTimeout(() => {
            previewSection.classList.add('opacity-100');
            pages.generate.classList.remove('justify-center');
            pages.generate.classList.add('pt-20');
        }, 50);
    } catch (err) { 
        console.error(err); 
        showAIError("Something went wrong during generation.");
    } finally {
        state.isGenerating = false;
        stopThinking();
        constructBtn.disabled = false;
    }
});
}

function renderPreview() {
    let html = '';
    
    // Calculate Stats for Header
    const total = (state.counts.mcq * state.marks.mcq) + 
                  (state.counts.short * state.marks.short) + 
                  (state.counts.long * state.marks.long) + 
                  (state.counts.prog * state.marks.prog);
    const passing = Math.ceil((total * state.passingPercent) / 100);

    // Professional Header in Preview
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
                </div>
            ` : ''}
        </div>
    `;

    const mcqs = state.questions.filter(q => q.type.toLowerCase() === 'mcq');
    const shorts = state.questions.filter(q => q.type.toLowerCase() === 'short');
    const longs = state.questions.filter(q => q.type.toLowerCase() === 'long');
    const progs = state.questions.filter(q => q.type.toLowerCase() === 'programming');

    let qIndex = 1;

    const renderSection = (title, questions, marksEach, instruction) => {
        if (questions.length === 0) return '';
        let sectionHtml = `
            <div class="space-y-10">
                <div class="space-y-2">
                    <h3 class="text-xl font-black text-primary uppercase tracking-widest">SECTION: ${title} (${questions.length} × ${marksEach} = ${questions.length * marksEach} Marks)</h3>
                    <p class="text-sm text-white/40 italic">${instruction}</p>
                </div>
        `;
        
        questions.forEach((q, idx) => {
            const index = state.questions.indexOf(q);
            const isEditing = state.editingIndex === index;
            
            sectionHtml += `
                <div class="space-y-6 group/item relative p-8 rounded-3xl transition-all ${isEditing ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-white/[0.02]'}">
                    <div class="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/item:opacity-100 transition-all">
                        ${isEditing ? `
                            <button onclick="saveQuestion(${index})" class="bg-emerald-500/20 hover:bg-emerald-500/40 p-2 rounded-xl border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-[10px] font-black uppercase">
                                <span class="material-symbols-outlined text-sm">done</span> Save
                            </button>
                            <button onclick="cancelEdit()" class="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/5 text-white/60 flex items-center gap-2 text-[10px] font-black uppercase">
                                <span class="material-symbols-outlined text-sm">close</span>
                            </button>
                        ` : `
                            <button onclick="editQuestion(${index})" class="bg-white/5 hover:bg-white/10 p-2 rounded-xl border border-white/5 flex items-center gap-2 text-[10px] font-black uppercase" title="Edit Question">
                                <span class="material-symbols-outlined text-sm">edit</span>
                            </button>
                        `}
                    </div>
                    
                    <div class="flex items-start gap-6">
                        <span class="bg-white/5 text-white/40 border border-white/10 px-4 py-1.5 rounded-xl text-[12px] font-black uppercase mt-1">Q${qIndex++}</span>
                        <div class="flex-grow">
                            ${isEditing ? `
                                <textarea id="edit-q-text" class="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xl font-bold text-white outline-none focus:border-primary min-h-[100px]">${q.question}</textarea>
                            ` : `
                                <h4 class="text-2xl text-white font-bold leading-tight">${q.question} <span class="text-sm font-normal text-white/20 ml-2">(${marksEach} Marks)</span></h4>
                            `}
                        </div>
                    </div>
                    <div class="pl-20">
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

    html += renderSection("Multiple Choice Questions", mcqs, state.marks.mcq, "Attempt all questions. Choose the correct option.");
    html += renderSection("Short Answer Questions", shorts, state.marks.short, "Attempt all questions. Answer briefly.");
    html += renderSection("Long Answer Questions", longs, state.marks.long, "Attempt all questions. Answer in detail.");
    html += renderSection("Programming Questions", progs, state.marks.prog, "Attempt all questions. Write clear and efficient code.");

    previewContent.innerHTML = html;
}

window.editQuestion = (index) => {
    state.editingIndex = index;
    renderPreview();
};

window.cancelEdit = () => {
    state.editingIndex = null;
    renderPreview();
};

window.saveQuestion = (index) => {
    const newText = document.getElementById('edit-q-text').value;
    const newAnswer = document.getElementById('edit-q-answer').value;
    
    state.questions[index].question = newText;
    state.questions[index].answer = newAnswer;
    
    state.editingIndex = null;
    renderPreview();
};

window.copyQuestion = (index) => {
    const q = state.questions[index];
    const text = `Question: ${q.question}\nType: ${q.type}\nAnswer: ${q.answer}`;
    navigator.clipboard.writeText(text);
    copyToast.classList.add('show');
    setTimeout(() => copyToast.classList.remove('show'), 2000);
};

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

// --- Robot Interaction ---
const randomAILines = [
    "Ready to build something smart?", "I'm all warmed up! Let's go!",
    "Your notes + My brain = Perfect Exam!", "Need a hard test? I can do that!",
    "I'm feeling extra smart today!"
];

if (robotAvatar && aiMessage) {
    robotAvatar.addEventListener('click', () => {
        robotAvatar.classList.add('animate-wiggle');
        setTimeout(() => robotAvatar.classList.remove('animate-wiggle'), 500);
        aiMessage.textContent = randomAILines[Math.floor(Math.random() * randomAILines.length)];
        setTimeout(() => aiMessage.textContent = "I am the AI, create your papers with my help!", 5000);
    });
}

// --- Library ---
async function loadVault() {
    vaultList.innerHTML = '<div class="text-center py-20 opacity-30 animate-pulse font-black uppercase tracking-[0.4em]">Syncing Library...</div>';
    try {
        const response = await fetch(`${API_BASE}/exams`);
        const exams = await response.json();
        state.currentExams = exams;

        if (!exams || exams.length === 0) {
            vaultList.innerHTML = `<div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10"><span class="material-symbols-outlined text-7xl text-primary/20 mb-6">auto_stories</span><h3 class="text-2xl font-black mb-3">Library Empty</h3><p class="text-white/30 text-lg max-w-sm mx-auto">Your generated exams will appear here automatically.</p></div>`;
            return;
        }
        vaultList.innerHTML = exams.map((exam, index) => `
            <div onclick="viewExam(${index})" class="premium-glass p-8 rounded-[2rem] flex items-center justify-between group hover:border-primary/40 transition-all cursor-pointer hover:translate-x-2">
                <div class="flex items-center gap-6">
                    <div class="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"><span class="material-symbols-outlined text-primary">description</span></div>
                    <div><h4 class="text-xl font-bold mb-1">${exam.title || 'FYP Assessment'}</h4><div class="flex gap-3"><span class="text-[9px] font-black uppercase tracking-widest text-white/30">${exam.date}</span><span class="text-[9px] font-black uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded text-white/40">${exam.subject}</span></div></div>
                </div>
                <div class="flex items-center gap-4"><span class="text-[10px] font-black uppercase px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">Review</span><span class="material-symbols-outlined text-white/10 group-hover:text-primary transition-all">arrow_forward_ios</span></div>
            </div>
        `).join('');

        updateStats(exams);
    } catch (err) {
        vaultList.innerHTML = `<div class="premium-glass p-20 rounded-[3rem] text-center border-dashed border-white/10"><span class="material-symbols-outlined text-7xl text-white/5 mb-6">cloud_off</span><h3 class="text-2xl font-black mb-3 text-white/40">Sync Error</h3><p class="text-white/20 text-lg">Unable to load Library at this moment.</p></div>`;
    }
}

function updateStats(exams) {
    statTotal.textContent = exams.length;
    let totalQ = 0;
    const bloomCounts = { 'Remember': 0, 'Understand': 0, 'Apply': 0, 'Analyze': 0, 'Evaluate': 0, 'Create': 0 };
    
    exams.forEach(ex => {
        if (ex.questions_data) {
            totalQ += ex.questions_data.length;
            ex.questions_data.forEach(q => {
                const level = q.bloom_level || 'Apply';
                if (bloomCounts[level] !== undefined) bloomCounts[level]++;
                else bloomCounts['Analyze']++; // Fallback
            });
        }
    });
    statQuestions.textContent = totalQ;
    
    // Update Bloom Chart
    const bloomChart = document.getElementById('bloom-chart');
    const totalBloom = totalQ || 1;
    bloomChart.innerHTML = Object.entries(bloomCounts).map(([level, count]) => {
        const percent = (count / totalBloom) * 100;
        return `
            <div class="space-y-1">
                <div class="flex justify-between text-[7px] font-black uppercase tracking-widest text-white/30">
                    <span>${level}</span>
                    <span>${Math.round(percent)}%</span>
                </div>
                <div class="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                    <div class="h-full bg-primary" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

window.viewExam = (index) => {
    const exam = state.currentExams[index];
    if (!exam) return;
    
    state.questions = exam.questions_data;
    state.sessionId = exam.session_id;
    
    // Restore settings
    if (exam.branding) {
        state.branding = { ...state.branding, ...exam.branding };
        uniInput.value = state.branding.uni || "";
        deptInput.value = state.branding.dept || "";
        examTitleInput.value = state.branding.exam_title || "Final Examination";
    }
    
    if (exam.student_info) {
        state.student_info = { ...state.student_info, ...exam.student_info };
        studentInfoToggle.checked = state.student_info.enabled;
        showNameCheck.checked = state.student_info.show_name;
        showRollCheck.checked = state.student_info.show_roll_no;
        
        if (state.student_info.enabled) {
            studentInfoOptions.classList.remove('hidden');
        } else {
            studentInfoOptions.classList.add('hidden');
        }
    }
    
    renderPreview();
    switchPage('generate');
    
    // Ensure visibility
    previewSection.classList.remove('hidden');
    setTimeout(() => {
        previewSection.style.opacity = '1';
        previewSection.classList.remove('opacity-0');
        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
};

// --- Export System Refined ---

window.generateQuestionPaper = async function(format) {
    await performExport(window.event, format, false, state.showAnswers);
};

window.generateAnswerKey = async function(format) {
    await performExport(window.event, format, true, true);
};

async function performExport(event, format, isAnswerKey, includeAnswers) {
    if (state.questions.length === 0) return;
    
    // Close dropdowns
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));

    // Visual feedback
    const btn = event?.currentTarget;
    if (btn) btn.classList.add('opacity-50', 'pointer-events-none');

    try {
        const total = (state.counts.mcq * state.marks.mcq) + 
                      (state.counts.short * state.marks.short) + 
                      (state.counts.long * state.marks.long) + 
                      (state.counts.prog * state.marks.prog);
        const passingMarks = Math.ceil((total * state.passingPercent) / 100);

        const subject = state.branding.dept || document.getElementById('dept-name')?.value || "Exam";

        const response = await fetch(`${API_BASE}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: state.sessionId, 
                format: format, 
                questions: state.questions,
                branding: {
                    uni: state.branding.uni,
                    dept: state.branding.dept,
                    logo_path: state.branding.logo_path
                },
                is_answer_key: isAnswerKey,
                include_answers: includeAnswers,
                subject: subject,
                topic: promptInput.value || "Assessment",
                exam_title: state.branding.exam_title,
                time_limit: state.timeLimit,
                total_marks: total,
                passing_marks: passingMarks,
                passing_percentage: state.passingPercent,
                mcq_marks: state.marks.mcq,
                short_marks: state.marks.short,
                long_marks: state.marks.long,
                prog_marks: state.marks.prog,
                student_info: state.student_info
            })
        });
        
        if (!response.ok) throw new Error("Export failed");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `exam_${state.sessionId.slice(0,8)}.${format}`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }
        
        a.download = filename;
        a.click();
        
        showAIMessage(isAnswerKey ? "Answer Key ready!" : "Question Paper ready!");
    } catch (err) { 
        console.error(err); 
        showAIError("Failed to export document.");
    } finally {
        if (btn) btn.classList.remove('opacity-50', 'pointer-events-none');
    }
}

// Map the HTML onclicks to these new functions if needed, 
// but currently they call exportExam. Let's update the HTML to call these.

function showAIMessage(msg) {
    aiMessage.textContent = msg;
    setTimeout(() => {
        aiMessage.textContent = "I am the AI, create your papers with my help!";
    }, 4000);
}

}); // End DOMContentLoaded
