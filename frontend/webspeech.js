const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const speechAvailable = !!SpeechAPI && !isIOS;

let speak = null;
let isRecording = false;
let savedTranscript = '';

if (speechAvailable) {
    speak = new SpeechAPI();
    speak.continuous = true;
    speak.lang = 'en-US';
    speak.interimResults = true;
    speak.maxAlternatives = 1;
}

function saveNotes(note) {
    let rawio_notes = localStorage.getItem('rawio_notes');
    let notes = rawio_notes ? JSON.parse(rawio_notes) : [];
    note.id = Date.now();
    notes.push(note);
    localStorage.setItem('rawio_notes', JSON.stringify(notes));
}

function getAllnotes() {
    let rawio_notes = localStorage.getItem('rawio_notes');
    return rawio_notes ? JSON.parse(rawio_notes) : [];
}

function sendNotes(text) {
    if (!text.trim()) { console.warn('[send] Empty text, aborting.'); return; }
    document.querySelector('#mic-icon').innerText = 'hourglass_empty';
    document.querySelector('#submit-icon').innerText = 'hourglass_empty';
    console.log('[send] Sending to API:', text);

    fetch('https://raw-io-1.onrender.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: text })
    })
    .then(response => { console.log('[send] Response status:', response.status); return response.json(); })
    .then((data) => {
        console.log('[send] API response received:', data);
        document.querySelector('#note-title').innerText = data.text.title;
        document.querySelector('#note-title-refined').innerText = data.text.title;
        document.querySelector('#raw_txt').innerText = data.text.punctuated_raw;
        document.querySelector('#note-date').innerText = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        const keyEl = document.querySelector('#key_txt');
        const ul = document.createElement('ul');
        ul.className = 'space-y-6 list-none';
        data.text.insights.forEach((value, i) => {
            const li = document.createElement('li');
            li.className = 'flex gap-4';
            li.innerHTML = `<span class="text-primary font-headline text-2xl italic flex-shrink-0">0${i + 1}</span><p class="text-sm leading-relaxed text-on-surface">${value}</p>`;
            ul.appendChild(li);
        });
        keyEl.innerHTML = '';
        keyEl.appendChild(ul);

        document.querySelector('#refined_txt').innerText = data.text.refined;

        const actionEl = document.querySelector('#action_txt');
        const ul2 = document.createElement('ul');
        ul2.className = 'space-y-3 list-none';
        data.text.actions.forEach(value => {
            const li2 = document.createElement('li');
            li2.className = 'flex items-start gap-3 text-sm text-on-surface';
            li2.innerHTML = `<span class="material-symbols-outlined text-primary mt-0.5" style="font-size:16px;font-variation-settings:'FILL' 1;">task_alt</span>${value}`;
            ul2.appendChild(li2);
        });
        actionEl.innerHTML = '';
        actionEl.appendChild(ul2);

        saveNotes({
            title: data.text.title,
            raw: data.text.punctuated_raw,
            insights: data.text.insights,
            refined: data.text.refined,
            actions: data.text.actions
        });

        document.querySelector('#mic-icon').innerText = 'mic';
        document.querySelector('#submit-icon').innerText = 'arrow_upward';
        console.log('[send] Note saved to localStorage, switching to refined view.');

        if (typeof switchView === 'function') switchView('refined');
    })
    .catch(err => {
        console.error('[send] Fetch failed:', err);
        document.querySelector('#mic-icon').innerText = 'mic';
        document.querySelector('#submit-icon').innerText = 'arrow_upward';
    });
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
        document.querySelector('#mic-icon').innerText = 'hourglass_empty';
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
