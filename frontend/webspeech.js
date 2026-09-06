// ---- Config ----
// Public anon key — safe to embed client-side, matches the mobile app's config.
const SUPABASE_URL = 'https://xsylwbamcpjowzbjprzt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzeWx3YmFtY3Bqb3d6Ympwcnp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MzM0MTEsImV4cCI6MjEwNDIwOTQxMX0.U4tE49LTDWrJm_pZfx44L3gXrS1NY22IDX04tanz6Hc';
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_URL = isLocalHost ? 'http://127.0.0.1:8000' : 'https://raw-io-1.onrender.com';
const SOFT_CHAR_LIMIT = 5000;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const speechAvailable = !!SpeechAPI && !isIOS;

let speak = null;
let isRecording = false;
let savedTranscript = '';
let currentNoteId = null;
let currentSession = null;
let authMode = 'signin';

if (speechAvailable) {
    speak = new SpeechAPI();
    speak.continuous = true;
    speak.lang = 'en-US';
    speak.interimResults = true;
    speak.maxAlternatives = 1;
}

// ---- Toast ----
let toastTimer = null;
function showToast(message, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = message;
    el.classList.toggle('bg-error', isError);
    el.classList.toggle('bg-[#3a302a]', !isError);
    el.classList.remove('hidden');
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    toastTimer = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.classList.add('hidden'), 300);
    }, 4000);
}

// ---- Shared render helpers (used by sendNotes and loadNote) ----
function renderInsights(insights) {
    const keyEl = document.getElementById('key_txt');
    const ul = document.createElement('ul');
    ul.className = 'space-y-6 list-none';
    insights.forEach((insight, i) => {
        const li = document.createElement('li');
        li.className = 'flex gap-4';
        li.innerHTML = `<span class="text-primary font-headline text-2xl italic flex-shrink-0">0${i + 1}</span><p class="text-sm leading-relaxed text-on-surface">${insight}</p>`;
        ul.appendChild(li);
    });
    keyEl.innerHTML = '';
    keyEl.appendChild(ul);
}

function renderActions(actions) {
    const actionEl = document.getElementById('action_txt');
    const ul = document.createElement('ul');
    ul.className = 'space-y-3 list-none';
    actions.forEach(action => {
        const li = document.createElement('li');
        li.className = 'flex items-start gap-3 text-sm text-on-surface';
        li.innerHTML = `<span class="material-symbols-outlined text-primary mt-0.5" style="font-size:16px;font-variation-settings:'FILL' 1;">task_alt</span>${action}`;
        ul.appendChild(li);
    });
    actionEl.innerHTML = '';
    actionEl.appendChild(ul);
}

// ---- Character counter (soft 5000-char limit) ----
function updateCharCount() {
    const el = document.getElementById('char-count');
    if (!el) return;
    const length = document.getElementById('raw_txt').innerText.length;
    if (length > SOFT_CHAR_LIMIT) {
        el.textContent = `${length} / ${SOFT_CHAR_LIMIT} — this note will be trimmed when processed`;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}
document.getElementById('raw_txt')?.addEventListener('input', updateCharCount);

// ---- Wait animation ----
function setProcessing(isProcessing) {
    const micIcon = document.querySelector('#mic-icon');
    const submitIcon = document.querySelector('#submit-icon');
    const micBtn = document.querySelector('#mic-btn');
    const submitBtn = document.querySelector('#submit-btn');
    [micIcon, submitIcon].forEach(el => {
        el.innerText = isProcessing ? 'progress_activity' : (el === micIcon ? 'mic' : 'arrow_upward');
        el.classList.toggle('rawio-spin', isProcessing);
    });
    [micBtn, submitBtn].forEach(el => el.classList.toggle('rawio-disabled', isProcessing));
}

// ---- Auth ----
function showAuthGate(show) {
    document.getElementById('auth-gate').classList.toggle('hidden', !show);
}

function updateAuthUI() {
    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.textContent = currentSession?.user?.email ?? '';
}

function setAuthMode(mode) {
    authMode = mode;
    const isSignIn = mode === 'signin';
    document.getElementById('auth-submit').textContent = isSignIn ? 'Sign in' : 'Sign up';
    document.getElementById('auth-subtitle').textContent = isSignIn
        ? 'Sign in to sync your notes across devices.'
        : 'Create an account to sync your notes across devices.';
    document.getElementById('auth-toggle-prompt').textContent = isSignIn ? "Don't have an account?" : 'Already have an account?';
    document.getElementById('auth-toggle').textContent = isSignIn ? 'Sign up' : 'Sign in';
    document.getElementById('auth-error').classList.add('hidden');
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.getElementById('auth-submit');
    errorEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = authMode === 'signin' ? 'Signing in…' : 'Signing up…';

    try {
        const { data, error } = authMode === 'signin'
            ? await sb.auth.signInWithPassword({ email, password })
            : await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (authMode === 'signup') {
            showToast(data.session
                ? "Account created — you're signed in."
                : 'Check your email to confirm your account, then sign in.');
        }
    } catch (err) {
        errorEl.textContent = err.message || 'Something went wrong. Try again.';
        errorEl.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'signin' ? 'Sign in' : 'Sign up';
    }
}

document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
document.getElementById('auth-toggle')?.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
document.getElementById('signout-btn')?.addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    showAuthGate(!session);
    updateAuthUI();
});

sb.auth.getSession().then(({ data }) => {
    currentSession = data.session;
    showAuthGate(!currentSession);
    updateAuthUI();
});

// ---- Notes: process + history (persisted server-side in Supabase) ----
async function fetchHistory() {
    if (!currentSession) return [];
    try {
        const response = await fetch(`${API_URL}/notes`, {
            headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(data.detail || 'Could not load your notes.');
        return data;
    } catch (err) {
        console.error('[history] Failed to fetch:', err);
        showToast(err.message || 'Could not load your notes.', true);
        return [];
    }
}

async function deleteNoteRemote(noteId) {
    if (!currentSession) return false;
    try {
        const response = await fetch(`${API_URL}/notes/${noteId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Could not delete note.');
        return true;
    } catch (err) {
        console.error('[delete] Failed:', err);
        showToast(err.message || 'Could not delete note.', true);
        return false;
    }
}

function sendNotes(text) {
    if (!text.trim()) { console.warn('[send] Empty text, aborting.'); return; }
    if (!currentSession) { showToast('Sign in to process notes.', true); return; }

    console.log('[send] Sending to API:', text);
    setProcessing(true);

    fetch(`${API_URL}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ notes: text, note_id: currentNoteId }),
    })
    .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Something went wrong. Try again.');
        return data;
    })
    .then((data) => {
        console.log('[send] API response received:', data);
        document.querySelector('#note-title').innerText = data.text.title;
        document.querySelector('#note-title-refined').innerText = data.text.title;
        document.querySelector('#raw_txt').innerText = data.text.punctuated_raw;
        document.querySelector('#note-date').innerText = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        renderInsights(data.text.insights || []);
        document.querySelector('#refined_txt').innerText = data.text.refined;
        renderActions(data.text.actions || []);

        currentNoteId = data.note?.id ?? currentNoteId;
        updateCharCount();

        if (data.warning) showToast(data.warning);

        console.log('[send] Note saved to Supabase, switching to refined view.');
        if (typeof switchView === 'function') switchView('refined');
    })
    .catch(err => {
        console.error('[send] Failed:', err);
        showToast(err.message || 'Something went wrong. Try again.', true);
    })
    .finally(() => setProcessing(false));
}

function toggleRecording() {
    if (!speechAvailable) return;
    if (!isRecording) {
        speak.start();
        isRecording = true;
        savedTranscript = '';
        document.querySelector('#raw_txt').innerText = '';
        document.querySelector('#mic-icon').innerText = 'radio_button_checked';
        console.log('[mic] Recording started.');
    } else {
        speak.stop();
        isRecording = false;
        console.log('[mic] Recording stopped, sending notes...');
    }
}

if (speechAvailable) {
    speak.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript + ' ';
            } else {
                interimText += event.results[i][0].transcript;
            }
        }

        document.querySelector('#raw_txt').innerText = savedTranscript + finalText + interimText;
        updateCharCount();
        console.log('[mic] Transcript — final:', finalText.trim(), '| interim:', interimText.trim());
    };

    speak.onend = () => {
        if (isRecording) {
            savedTranscript = document.querySelector('#raw_txt').innerText;
            console.log('[mic] Silence detected, restarting. Saved so far:', savedTranscript);
            setTimeout(() => {
                try { speak.start(); } catch (e) { console.warn('[mic] Restart failed:', e); }
            }, 100);
        } else {
            console.log('[mic] Recognition ended, processing text.');
            const text = document.querySelector('#raw_txt').innerText;
            sendNotes(text);
        }
    };

    speak.onerror = (e) => {
        console.error('[mic] Recognition error:', e.error);
        showToast('Voice input error. Try again.', true);
    };
} else {
    // Grey out and disable the mic button on browsers without SpeechRecognition (e.g. iOS Safari)
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) {
        micBtn.disabled = true;
        micBtn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
        micBtn.title = 'Voice input not supported in this browser';
    }
}

document.querySelector('#raw_txt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isRecording) { toggleRecording(); return; }
        const text = document.querySelector('#raw_txt').innerText;
        console.log('[keyboard] Enter pressed, sending:', text);
        sendNotes(text);
    }
});
