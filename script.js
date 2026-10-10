// --- CONFIGURATION ---
const SUPABASE_URL = "https://chlupwfmalygwkubvbae.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNobHVwd2ZtYWx5Z3drdWJ2YmFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTQ4NTIsImV4cCI6MjA3NTY5MDg1Mn0.tNvdR1N4Xn6lW9c_3YfV7hHjA-kF2pQv9V3_vV3VvV3";

// Supabase client initialization
let sbClient = null;
if (window.supabase) {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// App State
let notes = JSON.parse(localStorage.getItem('my_notepad_notes') || '[]');
let activeNoteId = null;
let currentUser = null;

// DOM Elements
const notesList = document.getElementById('notesList');
const noteTitle = document.getElementById('noteTitle');
const noteBody = document.getElementById('noteBody');
const newNoteBtn = document.getElementById('newNoteBtn');
const deleteNoteBtn = document.getElementById('deleteNoteBtn');
const searchInput = document.getElementById('searchInput');
const syncStatus = document.getElementById('syncStatus');
const authModal = document.getElementById('authModal');
const openAuthModalBtn = document.getElementById('openAuthModalBtn');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
const authLoginBtn = document.getElementById('authLoginBtn');
const authSignUpBtn = document.getElementById('authSignUpBtn');
const logoutBtn = document.getElementById('logoutBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const backupBtn = document.getElementById('backupBtn');
const restoreInput = document.getElementById('restoreInput');

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  renderNotesList();
  if (notes.length > 0) {
    selectNote(notes[0].id);
  } else {
    createNewNote();
  }

  // Check auth state
  if (sbClient) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session?.user) {
      handleUserLoggedIn(session.user);
    }
  }
});

// --- NOTE FUNCTIONS ---
function saveLocal() {
  localStorage.setItem('my_notepad_notes', JSON.stringify(notes));
}

function renderNotesList(filterText = '') {
  notesList.innerHTML = '';
  const filtered = notes.filter(n => 
    (n.title || '').toLowerCase().includes(filterText.toLowerCase()) || 
    (n.body || '').toLowerCase().includes(filterText.toLowerCase())
  );

  filtered.forEach(note => {
    const item = document.createElement('div');
    item.className = `note-item ${note.id === activeNoteId ? 'active' : ''}`;
    item.onclick = () => selectNote(note.id);

    const titleEl = document.createElement('h4');
    titleEl.textContent = note.title.trim() || 'Untitled Note';

    const dateEl = document.createElement('span');
    dateEl.className = 'note-date';
    dateEl.textContent = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';

    item.appendChild(titleEl);
    item.appendChild(dateEl);
    notesList.appendChild(item);
  });
}

function selectNote(id) {
  activeNoteId = id;
  const current = notes.find(n => n.id === id);
  if (current) {
    noteTitle.value = current.title || '';
    noteBody.innerHTML = current.body || '';
  }
  renderNotesList(searchInput.value);
}

function createNewNote() {
  const newNote = {
    id: Date.now().toString(),
    title: '',
    body: '',
    updatedAt: new Date().toISOString()
  };
  notes.unshift(newNote);
  saveLocal();
  selectNote(newNote.id);
  noteTitle.focus();
}

newNoteBtn.addEventListener('click', createNewNote);

deleteNoteBtn.addEventListener('click', async () => {
  if (!activeNoteId) return;
  if (!confirm("Kya aap sach me ye note delete karna chahte hain?")) return;

  const idToDelete = activeNoteId;
  notes = notes.filter(n => n.id !== idToDelete);
  saveLocal();

  if (currentUser && sbClient) {
    await sbClient.from('notes').delete().eq('id', idToDelete);
  }

  if (notes.length > 0) {
    selectNote(notes[0].id);
  } else {
    createNewNote();
  }
});

// Save content changes
function onNoteContentChange() {
  const current = notes.find(n => n.id === activeNoteId);
  if (!current) return;

  current.title = noteTitle.value;
  current.body = noteBody.innerHTML;
  current.updatedAt = new Date().toISOString();

  saveLocal();
  renderNotesList(searchInput.value);
  syncNoteToCloud(current);
}

noteTitle.addEventListener('input', onNoteContentChange);
noteBody.addEventListener('input', onNoteContentChange);
searchInput.addEventListener('input', (e) => renderNotesList(e.target.value));

// --- CLOUD SYNC LOGIC ---
async function syncNoteToCloud(note) {
  if (!currentUser || !sbClient) return;
  syncStatus.textContent = '☁️ Syncing...';

  try {
    const { error } = await sbClient.from('notes').upsert({
      id: note.id,
      user_id: currentUser.id,
      title: note.title,
      body: note.body,
      updated_at: note.updatedAt
    });

    if (error) throw error;
    syncStatus.textContent = `☁️ Synced (${currentUser.email})`;
  } catch (err) {
    console.error('Sync error:', err);
    syncStatus.textContent = '⚠️ Sync Error';
  }
}

async function loadNotesFromCloud() {
  if (!currentUser || !sbClient) return;
  syncStatus.textContent = '☁️ Fetching notes...';

  try {
    const { data, error } = await sbClient.from('notes').select('*').eq('user_id', currentUser.id);
    if (error) throw error;

    if (data && data.length > 0) {
      data.forEach(cloudNote => {
        const localIndex = notes.findIndex(n => n.id === cloudNote.id);
        const mapped = {
          id: cloudNote.id,
          title: cloudNote.title || '',
          body: cloudNote.body || '',
          updatedAt: cloudNote.updated_at || new Date().toISOString()
        };

        if (localIndex >= 0) {
          notes[localIndex] = mapped;
        } else {
          notes.push(mapped);
        }
      });
      saveLocal();
      renderNotesList();
      selectNote(notes[0].id);
    }
    syncStatus.textContent = `☁️ Synced (${currentUser.email})`;
  } catch (err) {
    console.error("Fetch error:", err);
    syncStatus.textContent = '⚠️ Cloud error';
  }
}

// --- AUTH LOGIC ---
function handleUserLoggedIn(user) {
  currentUser = user;
  authModal.style.display = 'none';
  openAuthModalBtn.style.display = 'none';
  logoutBtn.style.display = 'block';
  syncStatus.textContent = `☁️ Synced (${user.email})`;
  loadNotesFromCloud();
}

openAuthModalBtn.addEventListener('click', () => {
  authModal.style.display = 'flex';
});

closeAuthModalBtn.addEventListener('click', () => {
  authModal.style.display = 'none';
});

authLoginBtn.addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();

  if (!email || !password) return alert("Email aur Password dono bharein!");
  if (!sbClient) return alert("Database connect nahi hai.");

  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login error: " + error.message);
  } else {
    handleUserLoggedIn(data.user);
  }
});

authSignUpBtn.addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value.trim();

  if (!email || !password) return alert("Email aur Password dono bharein!");
  if (!sbClient) return alert("Database connect nahi hai.");

  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (error) {
    alert("Sign up error: " + error.message);
  } else {
    alert("Account ban gaya! Ab Log In button dabayein.");
  }
});

logoutBtn.addEventListener('click', async () => {
  if (sbClient) await sbClient.auth.signOut();
  currentUser = null;
  logoutBtn.style.display = 'none';
  openAuthModalBtn.style.display = 'block';
  syncStatus.textContent = '☁️ Offline';
  alert("Logged out!");
});

// --- FORGOT PASSWORD HANDLER ---
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();

    if (!email) {
      alert("Pehle email box me apna Gmail type karein!");
      return;
    }

    if (!sbClient) {
      alert("Supabase client connect nahi hai.");
      return;
    }

    const { error } = await sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Password reset link aapke Gmail par bhej diya gaya hai! Inbox check karein.");
    }
  });
}

// --- BACKUP & RESTORE ---
backupBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});

restoreInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (Array.isArray(imported)) {
        notes = imported;
        saveLocal();
        renderNotesList();
        if (notes.length > 0) selectNote(notes[0].id);
        alert("Backup successfully restore ho gaya!");
      }
    } catch (err) {
      alert("Invalid backup file!");
    }
  };
  reader.readAsText(file);
});

// --- 3-LINE MENU TOGGLE ---
const hamburgerBtn = document.getElementById('hamburgerMenuBtn');
const featuresDrawer = document.getElementById('featuresDrawer');

if (hamburgerBtn && featuresDrawer) {
  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    featuresDrawer.classList.toggle('active');
  });

  // Bahar click karne par menu apne aap band ho jaye
  document.addEventListener('click', (e) => {
    if (!featuresDrawer.contains(e.target) && e.target !== hamburgerBtn) {
      featuresDrawer.classList.remove('active');
    }
  });
}
