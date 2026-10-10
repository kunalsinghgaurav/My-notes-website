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

// Safe DOM Helper
const get = (id) => document.getElementById(id);

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  renderNotesList();

  if (notes.length > 0) {
    selectNote(notes[0].id);
  } else {
    createNewNote();
  }

  // Check auth session
  if (sbClient) {
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (session?.user) {
        handleUserLoggedIn(session.user);
      }
    } catch (e) {
      console.warn("Auth check failed:", e);
    }
  }
});

// --- EVENT LISTENERS SETUP ---
function setupEventListeners() {
  // 1. Hamburger Features Menu Toggle
  const hamburgerBtn = get('hamburgerMenuBtn');
  const featuresDrawer = get('featuresDrawer');
  if (hamburgerBtn && featuresDrawer) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      featuresDrawer.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!featuresDrawer.contains(e.target) && e.target !== hamburgerBtn) {
        featuresDrawer.classList.remove('active');
      }
    });
  }

  // 2. Note Creation & Search
  get('newNoteBtn')?.addEventListener('click', createNewNote);
  get('searchInput')?.addEventListener('input', (e) => renderNotesList(e.target.value));

  // 3. Inputs Sync
  get('noteTitle')?.addEventListener('input', onNoteContentChange);
  get('noteBody')?.addEventListener('input', onNoteContentChange);

  // 4. Quick Actions
  get('savePcBtn')?.addEventListener('click', saveNoteToPC);
  get('zenModeQuickBtn')?.addEventListener('click', toggleZenMode);

  // 5. Auth Modal Controls
  get('openAuthModalBtn')?.addEventListener('click', () => {
    const modal = get('authModal');
    if (modal) modal.style.display = 'flex';
  });

  get('closeAuthModalBtn')?.addEventListener('click', () => {
    const modal = get('authModal');
    if (modal) modal.style.display = 'none';
  });

  get('authLoginBtn')?.addEventListener('click', handleLogin);
  get('authSignUpBtn')?.addEventListener('click', handleSignUp);
  get('logoutBtn')?.addEventListener('click', handleLogout);
  get('forgotPasswordBtn')?.addEventListener('click', handleForgotPassword);

  // 6. Formatting Toolbar
  get('fmtBold')?.addEventListener('click', () => document.execCommand('bold'));
  get('fmtItalic')?.addEventListener('click', () => document.execCommand('italic'));
  get('fmtUnderline')?.addEventListener('click', () => document.execCommand('underline'));
  get('fmtStrike')?.addEventListener('click', () => document.execCommand('strikeThrough'));
  get('fontSelect')?.addEventListener('change', (e) => {
    const body = get('noteBody');
    if (body) body.style.fontFamily = e.target.value;
  });

  // 7. Backup & Restore
  get('backupBtn')?.addEventListener('click', handleBackup);
  get('restoreInput')?.addEventListener('change', handleRestore);
}

// --- NOTE CRUD FUNCTIONS ---
function saveLocal() {
  localStorage.setItem('my_notepad_notes', JSON.stringify(notes));
}

function renderNotesList(filterText = '') {
  const list = get('notesList');
  if (!list) return;
  list.innerHTML = '';

  const filtered = notes.filter(n =>
    (n.title || '').toLowerCase().includes(filterText.toLowerCase()) ||
    (n.body || '').toLowerCase().includes(filterText.toLowerCase())
  );

  filtered.forEach(note => {
    const item = document.createElement('div');
    item.className = `note-item ${note.id === activeNoteId ? 'active' : ''}`;
    item.onclick = () => selectNote(note.id);

    const titleEl = document.createElement('h4');
    titleEl.textContent = (note.title || '').trim() || 'Untitled Note';

    const dateEl = document.createElement('span');
    dateEl.className = 'note-date';
    dateEl.textContent = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';

    item.appendChild(titleEl);
    item.appendChild(dateEl);
    list.appendChild(item);
  });
}

function selectNote(id) {
  activeNoteId = id;
  const current = notes.find(n => n.id === id);
  if (current) {
    if (get('noteTitle')) get('noteTitle').value = current.title || '';
    if (get('noteBody')) get('noteBody').innerHTML = current.body || '';
  }
  renderNotesList(get('searchInput')?.value || '');
  updateStats();
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
  get('noteTitle')?.focus();
}

function onNoteContentChange() {
  const current = notes.find(n => n.id === activeNoteId);
  if (!current) return;

  current.title = get('noteTitle')?.value || '';
  current.body = get('noteBody')?.innerHTML || '';
  current.updatedAt = new Date().toISOString();

  saveLocal();
  renderNotesList(get('searchInput')?.value || '');
  updateStats();
  syncNoteToCloud(current);
}

function updateStats() {
  const text = get('noteBody')?.innerText || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const readTime = Math.ceil(words / 200);

  const stats = get('readingStats');
  if (stats) {
    stats.textContent = `${words} words | ${chars} chars | ${readTime}m read`;
  }
}

function saveNoteToPC() {
  const current = notes.find(n => n.id === activeNoteId);
  if (!current) return alert("Koi note select nahi hai!");
  
  const blob = new Blob([get('noteBody')?.innerText || ''], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${current.title.trim() || 'note'}.txt`;
  a.click();
}

function toggleZenMode() {
  const sidebar = get('appSidebar');
  if (sidebar) {
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
  }
}

// --- CLOUD SYNC LOGIC ---
async function syncNoteToCloud(note) {
  if (!currentUser || !sbClient) return;
  const status = get('syncStatus');
  if (status) status.textContent = '☁️ Syncing...';

  try {
    const { error } = await sbClient.from('notes').upsert({
      id: note.id,
      user_id: currentUser.id,
      title: note.title,
      body: note.body,
      updated_at: note.updatedAt
    });

    if (error) throw error;
    if (status) status.textContent = `☁️ Synced (${currentUser.email})`;
  } catch (err) {
    console.error('Sync error:', err);
    if (status) status.textContent = '⚠️ Sync Error';
  }
}

async function loadNotesFromCloud() {
  if (!currentUser || !sbClient) return;
  const status = get('syncStatus');
  if (status) status.textContent = '☁️ Fetching notes...';

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
    if (status) status.textContent = `☁️ Synced (${currentUser.email})`;
  } catch (err) {
    console.error("Fetch error:", err);
    if (status) status.textContent = '⚠️ Cloud error';
  }
}

// --- AUTH HANDLERS ---
function handleUserLoggedIn(user) {
  currentUser = user;
  const modal = get('authModal');
  if (modal) modal.style.display = 'none';

  if (get('openAuthModalBtn')) get('openAuthModalBtn').style.display = 'none';
  if (get('logoutBtn')) get('logoutBtn').style.display = 'block';
  if (get('syncStatus')) get('syncStatus').textContent = `☁️ Synced (${user.email})`;

  loadNotesFromCloud();
}

async function handleLogin() {
  const email = get('authEmail')?.value.trim();
  const password = get('authPassword')?.value.trim();

  if (!email || !password) return alert("Email aur Password dono bharein!");
  if (!sbClient) return alert("Database connect nahi hai.");

  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login error: " + error.message);
  } else {
    handleUserLoggedIn(data.user);
  }
}

async function handleSignUp() {
  const email = get('authEmail')?.value.trim();
  const password = get('authPassword')?.value.trim();

  if (!email || !password) return alert("Email aur Password dono bharein!");
  if (!sbClient) return alert("Database connect nahi hai.");

  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (error) {
    alert("Sign up error: " + error.message);
  } else {
    alert("Account successfully ban gaya! Ab Log In button dabayein.");
  }
}

async function handleLogout() {
  if (sbClient) await sbClient.auth.signOut();
  currentUser = null;
  if (get('logoutBtn')) get('logoutBtn').style.display = 'none';
  if (get('openAuthModalBtn')) get('openAuthModalBtn').style.display = 'block';
  if (get('syncStatus')) get('syncStatus').textContent = '☁️ Offline';
  alert("Logged out successfully!");
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = get('authEmail')?.value.trim();

  if (!email) {
    alert("Pehle Email address wale box me apna Gmail type karein!");
    return;
  }

  if (!sbClient) {
    alert("Database connect nahi hai.");
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
}

// --- BACKUP & RESTORE ---
function handleBackup() {
  const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function handleRestore(e) {
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
        alert("Backup restore ho gaya!");
      }
    } catch (err) {
      alert("Invalid backup file!");
    }
  };
  reader.readAsText(file);
}
