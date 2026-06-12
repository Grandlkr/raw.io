const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechevent = window.SpeechRecognitionEvent || window.webkitSpeechRecognitionEvent;
const speak = new speech();
speak.continuous = true;
speak.lang = 'en-US';
speak.interimResults = false;
speak.maxAlternatives = 1;


let isRecording = false;
let raw_txt = '';
function toggleRecording() {
  if (!isRecording) {
    speak.start();
    isRecording = true;
    console.log("Ready to receive voice.");
  } else {
    speak.stop();
    //animate the recording button to indicate that recording has stopped
    document.querySelector('#main-fab-icon').innerText = 'hourglass_empty';
    isRecording = false;
    let Raw = fetch('http://127.0.0.1:8000/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notes : raw_txt})
    })
      .then(response => response.json())
      .then((data) => {
        console.log(data);
        document.querySelector('#title').innerText = data.text.title;
        document.querySelector('#refined_txt').innerText = data.text.refined;
        //define variables for the container, the and DOM elements on the inisght section
        const insight = document.querySelector('#key_txt');
        const refin= data.text.insights;
        const ul = document.createElement('ul');
        //loop through the array and create list items for each value, then append to the unordered list
        refin.forEach(value => {
          const li = document.createElement('li');
          li.textContent = value;
          ul.appendChild(li);
        });
        //append the unordered list to the container
        insight.innerHTML = '';
        insight.appendChild(ul);

        //define variables for the container, the and DOM elements on the action section
        const action = document.querySelector('#action_txt');
        const actionn= data.text.actions;
        const ul2 = document.createElement('ul');
        //loop through the array and create list items for each value, then append to the unordered list
        actionn.forEach(value => {
          const li2 = document.createElement('li');
          li2.textContent = value;
          ul2.appendChild(li2);
        });
        //append the unordered list to the container
        action.innerHTML = '';
        action.appendChild(ul2);
        document.querySelector('#main-fab-icon').innerText = 'mic'
      }
    );
  }
}

speak.onresult = (event) => {
  raw_txt = '';
  for(let i = 0; i <event.results.length; i++) {
    raw_txt += event.results[i][0].transcript + ' ';
    console.log("Received: " + raw_txt);
  }
  document.querySelector('#raw_txt').innerText = raw_txt;
};
