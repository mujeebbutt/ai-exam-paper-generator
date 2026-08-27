if (typeof API_BASE === 'undefined') {
    // Production (ustadexam.com): frontend and backend are served from the same origin, with
    // /api reverse-proxied to the backend — a same-origin relative path is correct regardless of
    // protocol/domain. Local dev serves the frontend and backend on different ports
    // (`python -m http.server 5500` + `uvicorn` on :8000), so that case still needs an explicit
    // cross-port URL. This used to be hardcoded to `http://${hostname}:8000` unconditionally,
    // which — on the real domain — sent every API call over plain HTTP to the wrong port and
    // got blocked as mixed content by the browser.
    const isLocalDev = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
    var API_BASE = isLocalDev
        ? `http://${window.location.hostname || '127.0.0.1'}:8000/api`
        : `${window.location.origin}/api`;
}

// GA4 Measurement Protocol needs its own client_id to attribute a server-side event (see
// generateExamApi()/gradeAttemptApi()/regenerateExamApi() below) back to the same visitor
// gtag.js is already tracking client-side — rather than a disconnected event with no visitor
// history. gtag.js writes this into the _ga cookie itself; there's no gtag.js API to read it
// back out, so this parses the cookie directly. Cookie format is "GA<version>.<domain-depth>.
// <random>.<timestamp>" — GA4 Measurement Protocol wants just the last two segments.
function getGaClientId() {
    try {
        const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
        if (!match) return null;
        const parts = decodeURIComponent(match[1]).split('.');
        if (parts.length < 4) return null;
        return parts.slice(-2).join('.');
    } catch (e) {
        return null; // malformed/inaccessible cookie — the backend treats a missing client_id as "skip this event", not an error
    }
}

async function fetchExams() {
    // Sends the auth token when logged in so the backend can scope this to "my own papers only"
    // (the Library data-scoping rule — see routers/bank.py's get_exams). Anonymous calls still
    // work and get the unfiltered list, matching the endpoint's other, non-Library callers.
    const response = await fetch(`${API_BASE}/exams`, { headers: authHeaders() });
    if (!response.ok) throw new Error("Failed to fetch exams");
    return await response.json();
}

async function uploadLogo(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/upload-logo`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error("Failed to upload logo");
    return await response.json();
}

async function uploadFilesApi(files) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Upload Error Details:", errorData);
        throw new Error(errorData.detail || "Failed to upload files");
    }
    return response.json();
}

async function generateExamApi(payload) {
    // Attaches the Bearer token when the caller is logged in (authHeaders() is a no-op object
    // otherwise) so the generated exam gets user_id-attributed for the Profile page's "My
    // Generated Exams" list — generation itself still works fine for anonymous callers too.
    // ga_client_id rides along the same way, for the backend's server-side exam_generated event
    // (routers/generate.py) — added here rather than at every call site.
    const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...payload, ga_client_id: getGaClientId() })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Generation Error Details:", errorData);
        throw new Error(errorData.detail || "Failed to generate exam");
    }
    return await response.json();
}

async function exportExamApi(payload) {
    const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Export Error Details:", errorData);
        throw new Error(errorData.detail || "Export failed");
    }
    return response;
}

// --- Exam-Taking & AI Grading API ---

async function startAttemptApi(examId, studentId) {
    const response = await fetch(`${API_BASE}/attempts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: examId, student_id: studentId })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to start attempt");
    }
    return response.json();
}

async function submitAttemptApi(attemptId, answers) {
    const response = await fetch(`${API_BASE}/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to submit answers");
    }
    return response.json();
}

async function gradeAttemptApi(attemptId, strictness, grammarCheck) {
    // ga_client_id lets the backend's server-side grading_completed event (routers/attempts.py)
    // attribute back to this same visitor — see getGaClientId()'s comment above.
    const response = await fetch(`${API_BASE}/attempts/${attemptId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strictness, grammar_check: grammarCheck, ga_client_id: getGaClientId() })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to grade attempt");
    }
    return response.json();
}

async function getAttemptApi(attemptId) {
    const response = await fetch(`${API_BASE}/attempts/${attemptId}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to load attempt");
    }
    return response.json();
}

async function getStudentAttemptsApi(studentId) {
    const response = await fetch(`${API_BASE}/students/${encodeURIComponent(studentId)}/attempts`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to load attempt history");
    }
    return response.json();
}

// --- Phase 3: Retention & Practice API ---

async function getWeakTopicsApi(studentId, threshold = 60) {
    const response = await fetch(`${API_BASE}/students/${encodeURIComponent(studentId)}/weak-topics?threshold=${threshold}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to load weak-topic analysis");
    }
    return response.json();
}

async function regenerateExamApi(examId) {
    // This endpoint sends no request body at all, so ga_client_id rides as a query param
    // instead — see routers/generate.py's regenerate_similar_exam() and getGaClientId() above.
    const gaClientId = getGaClientId();
    const qs = gaClientId ? `?ga_client_id=${encodeURIComponent(gaClientId)}` : '';
    const response = await fetch(`${API_BASE}/exams/${examId}/regenerate${qs}`, { method: 'POST', headers: authHeaders() });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to generate a practice set");
    }
    return response.json();
}

// --- Phase 4: Anti-Cheat & Integrity Logging API ---

// Fire-and-forget by design (see attempt.js) — this still returns the fetch promise so callers
// can log a console warning on failure, but a dropped integrity ping should never interrupt
// the student's exam.
async function logIntegrityEventApi(attemptId, eventType) {
    const response = await fetch(`${API_BASE}/attempts/${attemptId}/integrity-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to log integrity event");
    }
    return response.json();
}

async function getExamIntegrityApi(examId) {
    const response = await fetch(`${API_BASE}/exams/${examId}/attempts/integrity`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to load integrity data");
    }
    return response.json();
}

// --- Phase 5: Authentication & Profile API ---

function authHeaders() {
    const token = window.getAuthToken ? window.getAuthToken() : null;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function registerApi(payload) {
    const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Registration failed");
    }
    return response.json();
}

async function loginApi(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Login failed");
    }
    return response.json();
}

// First half of the classic OAuth redirect flow (see auth.js's loginWithGoogle()): trades the
// authorization code Google just redirected back with for an id_token, which googleAuthApi()
// below then verifies exactly like it always has. Needs a separate backend call because the
// code-for-token exchange requires the Client Secret, which must never reach the frontend.
async function googleExchangeApi(code, redirectUri) {
    const response = await fetch(`${API_BASE}/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri })
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Google sign-in failed");
    }
    return response.json();
}

async function googleAuthApi(payload) {
    const response = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Google sign-in failed");
    }
    return response.json();
}

async function getMeApi() {
    const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Session check failed");
    }
    return response.json();
}

async function getMyExamsApi() {
    const response = await fetch(`${API_BASE}/users/me/exams`, { headers: authHeaders() });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to load your exams");
    }
    return response.json();
}

async function updateProfileApi(payload) {
    const response = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to update profile");
    }
    return response.json();
}
