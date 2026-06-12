const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const speak = new speech();
speak.continuous = true;
speak.lang = 'en-US';
speak.interimResults = false;
speak.maxAlternatives = 1;

let isRecording = false;

function saveNotes(note) {    
        let rawio_notes = localStorage.getItem('rawio_notes');
        let notes = rawio_notes ? JSON.parse(rawio_notes) : [];
        // Add your new note here, for example:
        // notes.push(newNote);
        note.id = Date.now();
        notes.push(note);
        localStorage.setItem('rawio_notes', JSON.stringify(notes));
      }

function getAllnotes() {
    let rawio_notes = localStorage.getItem('rawio_notes');
    let notes = rawio_notes ? JSON.parse(rawio_notes) : [];
    return notes;
};

function sendNotes(text) {
  if (!text.trim()) return;
  document.querySelector('#main-fab-icon').innerText = 'hourglass_empty';
  console.log("Sending: " + text);

  fetch('http://127.0.0.1:8000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: text })
  })
    .then(response => response.json())
    .then((data) => {
      document.querySelector('#title').innerText = data.text.title;
      document.querySelector('#title2').innerText = data.text.title;
      document.querySelector('#raw_txt').innerText = data.text.punctuated_raw;
      document.querySelector('#refined_txt').innerText = data.text.refined;

      const insight = document.querySelector('#key_txt');
      const ul = document.createElement('ul');
      data.text.insights.forEach(value => {
        const li = document.createElement('li');
        li.textContent = value;
        ul.appendChild(li);
      });
      insight.innerHTML = '';
      insight.appendChild(ul);

      const action = document.querySelector('#action_txt');
      const ul2 = document.createElement('ul');
      data.text.actions.forEach(value => {
        const li2 = document.createElement('li');
        li2.textContent = value;
        ul2.appendChild(li2);
      });
      action.innerHTML = '';
      action.appendChild(ul2);

      document.querySelector('#main-fab-icon').innerText = 'mic';

      

    })
    .catch(err => console.error('Fetch failed:', err));
}

function toggleRecording() {
  if (!isRecording) {
    speak.start();
    isRecording = true;
    document.querySelector('#raw_txt').innerText = '';
    console.log("Ready to receive voice.");
  } else {
    speak.stop();
    isRecording = false;
    document.querySelector('#main-fab-icon').innerText = 'hourglass_empty';
  }
}

speak.onend = () => {
  if (!isRecording) {
    const text = document.querySelector('#raw_txt').innerText;
    sendNotes(text);
  }
};

speak.onresult = (event) => {
  let transcript = '';
  for (let i = 0; i < event.results.length; i++) {
    transcript += event.results[i][0].transcript + ' ';
  }
  document.querySelector('#raw_txt').innerText = transcript;
  console.log("Received: " + transcript);
};

document.querySelector('#raw_txt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = document.querySelector('#raw_txt').innerText;
    sendNotes(text);
  }
});

