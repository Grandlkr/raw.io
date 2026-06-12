//define variables for the container, the and DOM elements
const insight = document.querySelector('#key_txt')
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

