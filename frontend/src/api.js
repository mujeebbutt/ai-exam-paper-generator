if (typeof API_BASE === 'undefined') {
    var API_BASE = 'http://127.0.0.1:8000/api';
}

async function fetchExams() {
    const response = await fetch(`${API_BASE}/exams`);
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
    if (!response.ok) throw new Error("Failed to upload files");
    return await response.json();
}

async function generateExamApi(payload) {
    const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Server error");
    }
    return await response.json();
}

async function exportExamApi(payload) {
    const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Export failed");
    return response;
}
