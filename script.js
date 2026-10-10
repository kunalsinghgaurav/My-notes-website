// Register Service Worker (PWA Offline Mode)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 1. SUPABASE CLIENT (Conflict-Free Name)
const SUPABASE_URL = "https://chlupwfmalygwkubvbae.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNobHVwd2ZtYWx5Z3drdWJ2YmFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MjUyODAsImV4cCI6MjEwNzIwMTI4MH0.KpUCpDyr9YVrdyw-woLn2scvZp1K7-WvMq1p_6eEkUg"; 

let sbClient = null;
try {
  if (window.supabase && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY") {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.log("Supabase standby mode:", e);
}

let currentUser = null;

// State Management
let folders = JSON.parse(localStorage.getItem('np_folders')) || ['Study', 'Personal'];
let folderPins = JSON.parse(localStorage.getItem('np_folder_pins')) || {};
let activeFolder = localStorage.getItem('np_active_folder') || folders[0] || 'Study';
let files = JSON.parse(localStorage.getItem('np_files')) || [];
let activeFileId = localStorage.getItem('np_active_file_id') || null;
let openTabs = JSON.parse(localStorage.getItem('np_open_tabs')) || [];
let isTrashView = false;
let isStarFilterOnly = false;
let unlockedNotes = {};
let unlockedFolders = {};
let activeTagFilter = '';

// Daily Goal State
let dailyWordGoal = parseInt(localStorage.getItem('np_daily_goal')) || 500;

// Kanban State
let kanbanTasks = JSON.parse(localStorage.getItem('np_kanban')) || [
  { id: '1', text: 'Revise Formulas', status: 'todo' },
  { id: '2', text: 'Mock Test 1', status: 'doing' },
  { id: '3', text: 'Chapter 1 Notes', status: 'done' }
];

// Scratchpad state
let scratchpadText = localStorage.getItem('np_scratchpad') || '';

// Target Exam Countdown State
let examDate = localStorage.getItem('np_exam_date') || '';
let examName = localStorage.getItem('np_exam_name') || 'Target Exam';

function updateExamCountdown() {
  const display = document.getElementById('examCountdownDisplay');
  if (!display) return;
  if (!examDate) {
    display.innerText = 'Click "Set" to add Target';
    return;
  }
  const diffTime = new Date(examDate) - new Date();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays > 0) display.innerText = `🎯 ${examName}: ${diffDays} Days Left`;
  else if (diffDays === 0) display.innerText = `🎯 ${examName}: Exam is Today!`;
  else display.innerText = `🎯 ${examName}: Completed`;
}

const setExamBtn = document.getElementById('setExamBtn');
if (setExamBtn) {
  setExamBtn.onclick = () => {
    const name = prompt("Exam name:", examName);
    if (!name) return;
    const dateStr = prompt("Date (YYYY-MM-DD):", examDate || "2026-12-31");
    if (dateStr && !isNaN(new Date(dateStr))) {
      examName = name;
      examDate = dateStr;
      localStorage.setItem('np_exam_name', examName);
      localStorage.setItem('np_exam_date', examDate);
      updateExamCountdown();
    }
  };
}

function updateDailyGoalProgress() {
  let todayWords = 0;
  const activeFile = files.find(f => f.id === activeFileId);
  if (activeFile) {
    const d = document.createElement('div');
    d.innerHTML = activeFile.body || '';
    todayWords = d.innerText.trim() ? d.innerText.trim().split(/\s+/).length : 0;
  }
  const percentage = Math.min(100, Math.round((todayWords / dailyWordGoal) * 100));
  const fill = document.getElementById('goalProgressFill');
  const txt = document.getElementById('goalText');
  if (fill) fill.style.width = `${percentage}%`;
  if (txt) txt.innerText = `${todayWords} / ${dailyWordGoal} words (${percentage}%)`;
}

const setGoalBtn = document.getElementById('setGoalBtn');
if (setGoalBtn) {
  setGoalBtn.onclick = () => {
    const goal = prompt("Daily word count target:", dailyWordGoal);
    if (goal && !isNaN(goal) && parseInt(goal) > 0) {
      dailyWordGoal = parseInt(goal);
      localStorage.setItem('np_daily_goal', dailyWordGoal);
      updateDailyGoalProgress();
    }
  };
}

let streakDays = parseInt(localStorage.getItem('np_streak_count')) || 0;
let lastActiveDate = localStorage.getItem('np_last_active_date') || '';

function checkStreak() {
  const today = new Date().toDateString();
  if (lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastActiveDate === yesterday.toDateString()) streakDays++;
    else if (lastActiveDate === '') streakDays = 1;
    else streakDays = 1;
    lastActiveDate = today;
    localStorage.setItem('np_streak_count', streakDays);
    localStorage.setItem('np_last_active_date', lastActiveDate);
  }
  const streakEl = document.getElementById('streakCount');
  if (streakEl) streakEl.innerText = streakDays;
}

// Ambient Audio
let audioCtx = null;
let activeSoundNode = null;

function playAmbient(type) {
  stopAmbient();
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      if (type === 'rain') data[i] = (Math.random() * 2 - 1) * 0.15;
      else if (type === 'cafe') data[i] = (Math.random() * 2 - 1) * 0.08;
      else data[i] = (Math.random() * 2 - 1) * 0.05;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
    filter.frequency.value = type === 'rain' ? 800 : 1200;

    noise.connect(filter);
    filter.connect(audioCtx.destination);
    noise.start();
    activeSoundNode = noise;
  } catch(e){}
}

function stopAmbient() {
  if (activeSoundNode) {
    try { activeSoundNode.stop(); } catch(e){}
    activeSoundNode = null;
  }
}

// DOM Elements
const folderList = document.getElementById('folderList');
const trashFolderItem = document.getElementById('trashFolderItem');
const trashCount = document.getElementById('trashCount');
const tagsCloud = document.getElementById('tagsCloud');
const fileList = document.getElementById('fileList');
const currentFolderHeading = document.getElementById('currentFolderHeading');
const fileCount = document.getElementById('fileCount');
const searchInput = document.getElementById('searchInput');

const noteTabsBar = document.getElementById('noteTabsBar');
const editorEmptyState = document.getElementById('editorEmptyState');
const editorContent = document.getElementById('editorContent');
const lockScreenOverlay = document.getElementById('lockScreenOverlay');
const pinInputUnlock = document.getElementById('pinInputUnlock');
const unlockBtn = document.getElementById('unlockBtn');
const lockScreenMessage = document.getElementById('lockScreenMessage');

const editorFolderBadge = document.getElementById('editorFolderBadge');
const editorDateText = document.getElementById('editorDateText');
const statsCounter = document.getElementById('statsCounter');
const noteTitleInput = document.getElementById('noteTitleInput');
const noteTagsInput = document.getElementById('noteTagsInput');
const noteBodyInput = document.getElementById('noteBodyInput');

const fontSelect = document.getElementById('fontSelect');
const fontSizeSelect = document.getElementById('fontSizeSelect');
const bulletListBtn = document.getElementById('bulletListBtn');
const numberListBtn = document.getElementById('numberListBtn');
const addChecklistBtn = document.getElementById('addChecklistBtn');
const insertMathBtn = document.getElementById('insertMathBtn');
const insertCodeBtn = document.getElementById('insertCodeBtn');
const insertTableBtn = document.getElementById('insertTableBtn');
const linkNoteBtn = document.getElementById('linkNoteBtn');

const newFolderBtn = document.getElementById('newFolderBtn');
const newFileBtn = document.getElementById('newFileBtn');
const deleteActiveFileBtn = document.getElementById('deleteActiveFileBtn');
const restoreFileBtn = document.getElementById('restoreFileBtn');
const pinBtn = document.getElementById('pinBtn');
const lockToggleBtn = document.getElementById('lockToggleBtn');
const lockFolderBtn = document.getElementById('lockFolderBtn');
const ttsBtn = document.getElementById('ttsBtn');
const voiceTypingBtn = document.getElementById('voiceTypingBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const exportMdBtn = document.getElementById('exportMdBtn');
const exportTxtBtn = document.getElementById('exportTxtBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const saveToDiskBtn = document.getElementById('saveToDiskBtn');
const openTxtBtn = document.getElementById('openTxtBtn');
const fileInputPicker = document.getElementById('fileInputPicker');
const zenModeBtn = document.getElementById('zenModeBtn');

const insertImageBtn = document.getElementById('insertImageBtn');
const imageFileInput = document.getElementById('imageFileInput');
const recordAudioBtn = document.getElementById('recordAudioBtn');
const drawBtn = document.getElementById('drawBtn');
const drawingModal = document.getElementById('drawingModal');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawColor = document.getElementById('drawColor');
const drawSize = document.getElementById('drawSize');
const drawClearBtn = document.getElementById('drawClearBtn');
const drawInsertBtn = document.getElementById('drawInsertBtn');
const drawCloseBtn = document.getElementById('drawCloseBtn');

const splitPdfBtn = document.getElementById('splitPdfBtn');
const pdfFileInput = document.getElementById('pdfFileInput');
const pdfViewerContainer = document.getElementById('pdfViewerContainer');
const pdfFrame = document.getElementById('pdfFrame');
const closePdfBtn = document.getElementById('closePdfBtn');

const flashcardBtn = document.getElementById('flashcardBtn');
const flashcardModal = document.getElementById('flashcardModal');
const closeFlashcardBtn = document.getElementById('closeFlashcardBtn');
const flashcardContainer = document.getElementById('flashcardContainer');
const flashcardText = document.getElementById('flashcardText');
const fcPrevBtn = document.getElementById('fcPrevBtn');
const fcNextBtn = document.getElementById('fcNextBtn');
const fcCounter = document.getElementById('fcCounter');

const backupDownloadBtn = document.getElementById('backupDownloadBtn');
const backupRestoreBtn = document.getElementById('backupRestoreBtn');
const backupFileInput = document.getElementById('backupFileInput');

const scratchpadToggleBtn = document.getElementById('scratchpadToggleBtn');
const scratchpadDrawer = document.getElementById('scratchpadDrawer');
const closeScratchpadBtn = document.getElementById('closeScratchpadBtn');
const scratchpadContent = document.getElementById('scratchpadContent');

const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');

const graphBtn = document.getElementById('graphBtn');
const graphModal = document.getElementById('graphModal');
const closeGraphBtn = document.getElementById('closeGraphBtn');
const graphCanvas = document.getElementById('graphCanvas');

const aiAssistBtn = document.getElementById('aiAssistBtn');
const aiModal = document.getElementById('aiModal');
const closeAiBtn = document.getElementById('closeAiBtn');
const aiSummarizeBtn = document.getElementById('aiSummarizeBtn');
const aiQuizBtn = document.getElementById('aiQuizBtn');
const aiGrammarBtn = document.getElementById('aiGrammarBtn');
const aiResultBox = document.getElementById('aiResultBox');

const kanbanBtn = document.getElementById('kanbanBtn');
const kanbanModal = document.getElementById('kanbanModal');
const closeKanbanBtn = document.getElementById('closeKanbanBtn');
const addKanbanTaskBtn = document.getElementById('addKanbanTaskBtn');

const templateBtn = document.getElementById('templateBtn');
const templateModal = document.getElementById('templateModal');
const closeTemplateBtn = document.getElementById('closeTemplateBtn');

const splitNotesBtn = document.getElementById('splitNotesBtn');
const dualPaneLeft = document.getElementById('dualPaneLeft');
const dualLeftTitle = document.getElementById('dualLeftTitle');
const dualLeftBody = document.getElementById('dualLeftBody');
const closeDualBtn = document.getElementById('closeDualBtn');

const webcamScanBtn = document.getElementById('webcamScanBtn');
const webcamModal = document.getElementById('webcamModal');
const webcamVideo = document.getElementById('webcamVideo');
const capturePhotoBtn = document.getElementById('capturePhotoBtn');
const closeWebcamBtn = document.getElementById('closeWebcamBtn');
let webcamStream = null;

const mindmapBtn = document.getElementById('mindmapBtn');
const mindmapModal = document.getElementById('mindmapModal');
const closeMindmapBtn = document.getElementById('closeMindmapBtn');
const mindmapCanvas = document.getElementById('mindmapCanvas');
const addMindmapNodeBtn = document.getElementById('addMindmapNodeBtn');
const insertMindmapBtn = document.getElementById('insertMindmapBtn');

const analyticsBtn = document.getElementById('analyticsBtn');
const analyticsModal = document.getElementById('analyticsModal');
const closeAnalyticsBtn = document.getElementById('closeAnalyticsBtn');

const starNoteBtn = document.getElementById('starNoteBtn');
const starFilterBtn = document.getElementById('starFilterBtn');
const extractPdfBtn = document.getElementById('extractPdfBtn');
const extractPdfInput = document.getElementById('extractPdfInput');
const tocBtn = document.getElementById('tocBtn');
const tocDrawer = document.getElementById('tocDrawer');
const closeTocBtn = document.getElementById('closeTocBtn');
const tocList = document.getElementById('tocList');

const spotlightBtn = document.getElementById('spotlightBtn');
const spotlightModal = document.getElementById('spotlightModal');
const closeSpotlightBtn = document.getElementById('closeSpotlightBtn');
const spotlightInput = document.getElementById('spotlightInput');
const spotlightResults = document.getElementById('spotlightResults');

const wordCloudBtn = document.getElementById('wordCloudBtn');
const wordCloudModal = document.getElementById('wordCloudModal');
const closeWordCloudBtn = document.getElementById('closeWordCloudBtn');
const wordCloudContainer = document.getElementById('wordCloudContainer');

const authModalBtn = document.getElementById('authModalBtn');
const authModal = document.getElementById('authModal');
const authCloseBtn = document.getElementById('authCloseBtn');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authLoginBtn = document.getElementById('authLoginBtn');
const authSignUpBtn = document.getElementById('authSignUpBtn');

// 2. SUPABASE AUTH & CLOUD AUTO-SYNC
async function checkAuthSession() {
  if (!sbClient) return;
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
      currentUser = session.user;
      if (authModalBtn) authModalBtn.innerText = '☁️ Synced';
      pullNotesFromSupabase();
    } else {
      currentUser = null;
      if (authModalBtn) authModalBtn.innerText = '👤 Login';
    }
  } catch(e){}
}

if (authModalBtn) {
  authModalBtn.onclick = () => {
    if (currentUser) {
      if (confirm(`Logged in as: ${currentUser.email}\nLogout karna chahte hain?`)) {
        if (sbClient) {
          sbClient.auth.signOut().then(() => {
            currentUser = null;
            authModalBtn.innerText = '👤 Login';
            alert("Logout safal raha!");
          });
        }
      }
    } else {
      if (authModal) authModal.classList.remove('hidden');
    }
  };
}
if (authCloseBtn) authCloseBtn.onclick = () => authModal.classList.add('hidden');

if (authSignUpBtn) {
  authSignUpBtn.onclick = async () => {
    if (!sbClient) return alert("Supabase Anon Key add hone par cloud register hoga!");
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    if (!email || password.length < 6) return alert("Valid Email aur min 6 characters password dalein!");

    const { data, error } = await sbClient.auth.signUp({ email, password });
    if (error) alert("Sign up error: " + error.message);
    else alert("✅ Account ban gaya! Ab Log In button dabayein.");
  };
}

if (authLoginBtn) {
  authLoginBtn.onclick = async () => {
    if (!sbClient) return alert("Supabase Anon Key add hone par cloud login hoga!");
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) alert("Login error: " + error.message);
    else {
      currentUser = data.user;
      authModalBtn.innerText = '☁️ Synced';
      authModal.classList.add('hidden');
      alert("✅ Login successful!");
      pullNotesFromSupabase();
    }
  };
}

async function pullNotesFromSupabase() {
  if (!currentUser || !sbClient) return;
  try {
    const { data, error } = await sbClient.from('notes').select('*');
    if (data && data.length > 0) {
      data.forEach(cloudNote => {
        const exists = files.find(f => f.id === cloudNote.id);
        if (!exists) {
          files.unshift({
            id: cloudNote.id,
            title: cloudNote.title,
            body: cloudNote.body,
            folder: cloudNote.folder || 'Study',
            tags: cloudNote.tags || '',
            starred: cloudNote.starred || false,
            date: 'Synced',
            pinned: false,
            isTrash: false,
            pin: '',
            history: []
          });
        }
      });
      saveFiles();
      renderFiles();
      renderEditor();
    }
  } catch(e){}
}

async function pushNoteToSupabase(file) {
  if (!currentUser || !sbClient || !file) return;
  try {
    await sbClient.from('notes').upsert({
      id: file.id,
      user_id: currentUser.id,
      title: file.title,
      body: file.body,
      folder: file.folder,
      tags: file.tags,
      starred: file.starred
    });
  } catch(e){}
}

// 3. THEME TOGGLE
let isDarkMode = localStorage.getItem('np_dark_mode') === 'true';
if (isDarkMode) {
  document.body.classList.add('dark-mode');
  if (themeToggleBtn) themeToggleBtn.innerText = '☀️';
}
if (themeToggleBtn) {
  themeToggleBtn.onclick = () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    themeToggleBtn.innerText = isDarkMode ? '☀️' : '🌙';
    localStorage.setItem('np_dark_mode', isDarkMode);
  };
}

// 4. INLINE AUTO-MATH CALCULATOR
if (noteBodyInput) {
  noteBodyInput.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      const text = noteBodyInput.innerText;
      const match = text.match(/([0-9\.\+\-\*\/\(\)\s]+)=/);
      if (match) {
        try {
          const expression = match[1];
          const calculated = Function(`'use strict'; return (${expression})`)();
          if (!isNaN(calculated)) {
            const original = `${expression}=`;
            noteBodyInput.innerHTML = noteBodyInput.innerHTML.replace(original, `<b>${original} ${calculated}</b>`);
            syncActiveFileBody();
          }
        } catch (err) {}
      }
    }
  });
}

// 5. FOLDER-LEVEL MASTER PIN LOCK
if (lockFolderBtn) {
  lockFolderBtn.onclick = () => {
    if (folderPins[activeFolder]) {
      const p = prompt(`"${activeFolder}" se Folder Lock hatane ke liye PIN dalein:`);
      if (p === folderPins[activeFolder]) {
        delete folderPins[activeFolder];
        delete unlockedFolders[activeFolder];
        localStorage.setItem('np_folder_pins', JSON.stringify(folderPins));
        alert(`🔓 "${activeFolder}" unlocked!`);
        renderFolders();
        renderFiles();
        renderEditor();
      } else alert("❌ Galat PIN!");
    } else {
      const p = prompt(`"${activeFolder}" folder ke liye 4-digit Master PIN set karein:`);
      if (p && p.trim()) {
        folderPins[activeFolder] = p.trim();
        unlockedFolders[activeFolder] = true;
        localStorage.setItem('np_folder_pins', JSON.stringify(folderPins));
        alert(`🔒 Master Folder PIN set!`);
        renderFolders();
        renderFiles();
        renderEditor();
      }
    }
  };
}

// 6. WORD CLOUD
if (wordCloudBtn) {
  wordCloudBtn.onclick = () => {
    if (!wordCloudContainer) return;
    wordCloudContainer.innerHTML = '';
    const text = (noteBodyInput ? noteBodyInput.innerText : '').toLowerCase();
    const words = text.match(/\b[a-z]{4,}\b/g) || [];
    
    if (words.length === 0) {
      wordCloudContainer.innerHTML = '<span class="sub-text">Note me kam se kam kuch words likhein.</span>';
      wordCloudModal.classList.remove('hidden');
      return;
    }

    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const sorted = Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, 20);

    sorted.forEach(([word, count]) => {
      const span = document.createElement('span');
      span.className = 'cloud-tag';
      span.innerText = `${word} (${count})`;
      span.style.fontSize = `${Math.min(32, 12 + count * 4)}px`;
      wordCloudContainer.appendChild(span);
    });

    wordCloudModal.classList.remove('hidden');
  };
}
if (closeWordCloudBtn) closeWordCloudBtn.onclick = () => wordCloudModal.classList.add('hidden');

// 7. MARKDOWN (.md) EXPORT
if (exportMdBtn) {
  exportMdBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    const mdContent = `# ${activeFile.title}\n\n**Folder:** ${activeFile.folder}  \n**Date:** ${activeFile.date}  \n**Tags:** ${activeFile.tags || ''}\n\n---\n\n${noteBodyInput ? noteBodyInput.innerText : ''}`;
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(activeFile.title || 'Note').replace(/[/\\?%*:|"<>]/g, '_')}.md`;
    a.click();
  };
}

if (starNoteBtn) {
  starNoteBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    activeFile.starred = !activeFile.starred;
    starNoteBtn.innerText = activeFile.starred ? '★ Starred' : '☆ Star';
    saveFiles();
    renderFiles();
    pushNoteToSupabase(activeFile);
  };
}

if (starFilterBtn) {
  starFilterBtn.onclick = () => {
    isStarFilterOnly = !isStarFilterOnly;
    starFilterBtn.innerText = isStarFilterOnly ? '★ Show All' : '⭐ Stars';
    renderFiles();
  };
}

if (extractPdfBtn) extractPdfBtn.onclick = () => extractPdfInput.click();
if (extractPdfInput) {
  extractPdfInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullExtractedText = '';
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullExtractedText += `<h3>--- Page ${pageNum} ---</h3><p>${pageText}</p><br>`;
      }
      noteBodyInput.focus();
      document.execCommand('insertHTML', false, fullExtractedText);
      syncActiveFileBody();
      alert(`✅ PDF "${file.name}" se text extract ho gaya!`);
    } catch (err) {
      alert("PDF extract error.");
    }
    extractPdfInput.value = '';
  };
}

if (tocBtn) {
  tocBtn.onclick = () => {
    if (!tocList) return;
    tocList.innerHTML = '';
    const headings = noteBodyInput ? noteBodyInput.querySelectorAll('h1, h2, h3, b') : [];
    if (headings.length === 0) {
      tocList.innerHTML = '<li class="sub-text">Note me koi Heading nahi mili.</li>';
    } else {
      headings.forEach((h, index) => {
        const li = document.createElement('li');
        li.className = 'toc-item';
        li.innerText = `${index + 1}. ${h.innerText.trim().substring(0, 35)}`;
        li.onclick = () => {
          h.scrollIntoView({ behavior: 'smooth', block: 'center' });
          h.style.background = '#fef08a';
          setTimeout(() => { h.style.background = 'transparent'; }, 1500);
        };
        tocList.appendChild(li);
      });
    }
    if (tocDrawer) tocDrawer.classList.remove('hidden');
  };
}
if (closeTocBtn) closeTocBtn.onclick = () => tocDrawer.classList.add('hidden');

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSpotlight();
  }
});
if (spotlightBtn) spotlightBtn.onclick = openSpotlight;
if (closeSpotlightBtn) closeSpotlightBtn.onclick = () => spotlightModal.classList.add('hidden');

function openSpotlight() {
  if (!spotlightModal) return;
  spotlightModal.classList.remove('hidden');
  if (spotlightInput) {
    spotlightInput.value = '';
    spotlightInput.focus();
  }
  if (spotlightResults) spotlightResults.innerHTML = '';
}

if (spotlightInput) {
  spotlightInput.oninput = (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!spotlightResults) return;
    spotlightResults.innerHTML = '';
    if (!query) return;

    const matched = files.filter(f => !f.isTrash && (
      f.title.toLowerCase().includes(query) ||
      (f.body || '').toLowerCase().includes(query) ||
      (f.tags || '').toLowerCase().includes(query)
    ));

    if (matched.length === 0) {
      spotlightResults.innerHTML = '<li class="sub-text">Koi match nahi mila.</li>';
      return;
    }

    matched.forEach(file => {
      const li = document.createElement('li');
      li.className = 'spotlight-item';
      li.innerHTML = `<b>${file.title}</b> <span class="sub-text">[Folder: ${file.folder}]</span><div class="sub-text">${file.date}</div>`;
      li.onclick = () => {
        openInTab(file.id);
        renderFiles();
        renderEditor();
        spotlightModal.classList.add('hidden');
      };
      spotlightResults.appendChild(li);
    });
  };
}

document.querySelectorAll('.hl-btn').forEach(btn => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand('hiliteColor', false, btn.dataset.val);
    if (noteBodyInput) noteBodyInput.focus();
  });
});

if (splitNotesBtn) {
  splitNotesBtn.onclick = () => {
    const otherNotes = files.filter(f => f.id !== activeFileId && !f.isTrash);
    if (otherNotes.length === 0) return alert("Side me kholne ke liye 2 notes hone chahiye!");
    const noteListTitles = otherNotes.map((n, i) => `${i + 1}. ${n.title}`).join('\n');
    const choice = prompt(`Kis note ko reference split me kholna hai? Number likhein:\n\n${noteListTitles}`);
    const idx = parseInt(choice) - 1;
    if (!isNaN(idx) && otherNotes[idx]) {
      if (dualLeftTitle) dualLeftTitle.innerText = otherNotes[idx].title;
      if (dualLeftBody) dualLeftBody.innerHTML = otherNotes[idx].body;
      if (dualPaneLeft) dualPaneLeft.classList.remove('hidden');
    }
  };
}
if (closeDualBtn) closeDualBtn.onclick = () => dualPaneLeft.classList.add('hidden');

if (webcamScanBtn) {
  webcamScanBtn.onclick = async () => {
    if (!webcamModal) return;
    webcamModal.classList.remove('hidden');
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      if (webcamVideo) webcamVideo.srcObject = webcamStream;
    } catch (err) {
      alert("Camera permission allow karein!");
      webcamModal.classList.add('hidden');
    }
  };
}
if (closeWebcamBtn) {
  closeWebcamBtn.onclick = () => {
    if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
    webcamModal.classList.add('hidden');
  };
}
if (capturePhotoBtn) {
  capturePhotoBtn.onclick = () => {
    const capCanvas = document.createElement('canvas');
    capCanvas.width = webcamVideo.videoWidth;
    capCanvas.height = webcamVideo.videoHeight;
    capCanvas.getContext('2d').drawImage(webcamVideo, 0, 0);
    const imgData = capCanvas.toDataURL('image/jpeg');
    if (noteBodyInput) {
      noteBodyInput.focus();
      document.execCommand('insertHTML', false, `<img src="${imgData}" alt="Scanned Document"><br>`);
      syncActiveFileBody();
    }
    if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
    webcamModal.classList.add('hidden');
  };
}

let mindNodes = [{ id: 1, text: 'Main Topic', x: 400, y: 225 }];
if (mindmapBtn) mindmapBtn.onclick = () => { mindmapModal.classList.remove('hidden'); renderMindmap(); };
if (closeMindmapBtn) closeMindmapBtn.onclick = () => mindmapModal.classList.add('hidden');
if (addMindmapNodeBtn) {
  addMindmapNodeBtn.onclick = () => {
    const text = prompt("Node ka naam:");
    if (text) {
      const parent = mindNodes[0];
      const angle = Math.random() * Math.PI * 2;
      mindNodes.push({ id: Date.now(), text: text.trim(), x: parent.x + Math.cos(angle) * 140, y: parent.y + Math.sin(angle) * 140 });
      renderMindmap();
    }
  };
}
function renderMindmap() {
  if (!mindmapCanvas) return;
  const mctx = mindmapCanvas.getContext('2d');
  mctx.clearRect(0, 0, mindmapCanvas.width, mindmapCanvas.height);
  const root = mindNodes[0];
  mctx.strokeStyle = '#3b82f6';
  mctx.lineWidth = 2;
  for (let i = 1; i < mindNodes.length; i++) {
    mctx.beginPath();
    mctx.moveTo(root.x, root.y);
    mctx.lineTo(mindNodes[i].x, mindNodes[i].y);
    mctx.stroke();
  }
  mindNodes.forEach((node, i) => {
    mctx.fillStyle = i === 0 ? '#3b82f6' : '#10b981';
    mctx.beginPath();
    mctx.roundRect(node.x - 50, node.y - 18, 100, 36, 8);
    mctx.fill();
    mctx.fillStyle = '#ffffff';
    mctx.font = '12px Segoe UI';
    mctx.textAlign = 'center';
    mctx.fillText(node.text.substring(0, 14), node.x, node.y + 4);
  });
}
if (insertMindmapBtn) {
  insertMindmapBtn.onclick = () => {
    if (noteBodyInput && mindmapCanvas) {
      document.execCommand('insertHTML', false, `<img src="${mindmapCanvas.toDataURL()}" alt="Mind Map"><br>`);
      syncActiveFileBody();
    }
    mindmapModal.classList.add('hidden');
  };
}

if (analyticsBtn) {
  analyticsBtn.onclick = () => {
    analyticsModal.classList.remove('hidden');
    const totNotes = document.getElementById('totalNotesVal');
    if (totNotes) totNotes.innerText = files.filter(f => !f.isTrash).length;
    let totalWords = 0;
    files.forEach(f => {
      const d = document.createElement('div');
      d.innerHTML = f.body || '';
      totalWords += (d.innerText.trim() ? d.innerText.trim().split(/\s+/).length : 0);
    });
    const totWords = document.getElementById('totalWordsVal');
    if (totWords) totWords.innerText = totalWords;
    const actStreak = document.getElementById('activeStreakVal');
    if (actStreak) actStreak.innerText = `${streakDays} Days`;
    const grid = document.getElementById('heatmapGrid');
    if (grid) {
      grid.innerHTML = '';
      for (let i = 1; i <= 28; i++) {
        const cell = document.createElement('div');
        const intensity = (i % 3 === 0) ? 'active-2' : ((i % 2 === 0) ? 'active-1' : (i % 7 === 0 ? 'active-3' : ''));
        cell.className = `heat-cell ${intensity}`;
        cell.innerText = `D${i}`;
        grid.appendChild(cell);
      }
    }
  };
}
if (closeAnalyticsBtn) closeAnalyticsBtn.onclick = () => analyticsModal.classList.add('hidden');

function renderTabs() {
  if (!noteTabsBar) return;
  noteTabsBar.innerHTML = '';
  if (openTabs.length === 0 && activeFileId) openTabs.push(activeFileId);
  openTabs.forEach(id => {
    const file = files.find(f => f.id === id);
    if (!file) return;
    const tab = document.createElement('div');
    tab.className = `note-tab ${id === activeFileId ? 'active' : ''}`;
    tab.innerHTML = `<span>${file.starred ? '★ ' : ''}${file.title || 'Untitled'}</span><span class="tab-close" onclick="closeTab(event, '${id}')">✕</span>`;
    tab.onclick = () => {
      activeFileId = id;
      localStorage.setItem('np_active_file_id', activeFileId);
      renderTabs();
      renderFiles();
      renderEditor();
    };
    noteTabsBar.appendChild(tab);
  });
  localStorage.setItem('np_open_tabs', JSON.stringify(openTabs));
}

window.closeTab = (e, id) => {
  e.stopPropagation();
  openTabs = openTabs.filter(t => t !== id);
  if (activeFileId === id) activeFileId = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
  renderTabs();
  renderFiles();
  renderEditor();
};

function openInTab(id) {
  if (!openTabs.includes(id)) openTabs.push(id);
  activeFileId = id;
  renderTabs();
}

if (aiAssistBtn) {
  aiAssistBtn.onclick = () => {
    aiModal.classList.remove('hidden');
    if (aiResultBox) aiResultBox.innerText = 'Select a task above.';
  };
}
if (closeAiBtn) closeAiBtn.onclick = () => aiModal.classList.add('hidden');
if (aiSummarizeBtn) {
  aiSummarizeBtn.onclick = () => {
    const text = noteBodyInput ? noteBodyInput.innerText.trim() : '';
    if (!text) return (aiResultBox.innerText = 'Note is empty!');
    const lines = text.split('\n').filter(l => l.trim().length > 5);
    aiResultBox.innerHTML = `<b>📌 Key Summary:</b><br>${lines.slice(0, 3).map(l => `• ${l.trim()}`).join('<br>') || text.substring(0, 150)}...`;
  };
}
if (aiQuizBtn) {
  aiQuizBtn.onclick = () => {
    const text = noteBodyInput ? noteBodyInput.innerText.trim() : '';
    if (!text) return (aiResultBox.innerText = 'Note is empty!');
    const words = text.split(/\s+/).filter(w => w.length > 4);
    aiResultBox.innerHTML = `<b>❓ Practice Quiz:</b><br>1. Define <i>${words[0] || 'the core subject'}</i>.<br>2. Why are <i>${words[2] || 'formulas'}</i> critical in this context?`;
  };
}
if (aiGrammarBtn) {
  aiGrammarBtn.onclick = () => {
    const text = noteBodyInput ? noteBodyInput.innerText.trim() : '';
    if (!text) return (aiResultBox.innerText = 'Note is empty!');
    aiResultBox.innerHTML = `<b>✨ Cleaned Output:</b><br>${text.replace(/\s+/g, ' ')}`;
  };
}

if (templateBtn) templateBtn.onclick = () => templateModal.classList.remove('hidden');
if (closeTemplateBtn) closeTemplateBtn.onclick = () => templateModal.classList.add('hidden');

window.applyTemplate = (type) => {
  let templateHtml = '';
  if (type === 'cornell') {
    templateHtml = `<h2>📚 Topic: </h2><table class="smart-table"><tr><th style="width: 30%;">Cue Column</th><th>Notes & Details</th></tr><tr><td>• Concept<br>• Formula</td><td>Details here...</td></tr></table><h3>📝 Summary:</h3><p>Takeaway...</p>`;
  } else if (type === 'habits') {
    templateHtml = `<h2>🎯 Daily Habit Tracker</h2><div class="task-item"><input type="checkbox"> <span>Wake up at 6:00 AM</span></div><div class="task-item"><input type="checkbox"> <span>2 Hours Deep Study</span></div>`;
  } else if (type === 'syllabus') {
    templateHtml = `<h2>📅 Weekly Syllabus Plan</h2><table class="smart-table"><tr><th>Day</th><th>Subject</th><th>Chapter</th></tr><tr><td>Monday</td><td>Physics</td><td>Chapter 1</td></tr></table>`;
  } else if (type === 'lab') {
    templateHtml = `<h2>🔬 Experiment: </h2><p><b>Aim:</b> </p><p><b>Theory:</b> </p><p><b>Result:</b> </p>`;
  }
  if (noteBodyInput) {
    noteBodyInput.innerHTML = templateHtml;
    syncActiveFileBody();
  }
  templateModal.classList.add('hidden');
};

if (insertTableBtn) {
  insertTableBtn.onclick = () => {
    const rows = prompt("Rows:", "3");
    const cols = prompt("Columns:", "3");
    if (!rows || !cols) return;
    let tableHtml = '<table class="smart-table"><tr>';
    for (let c = 0; c < parseInt(cols); c++) tableHtml += `<th>Header ${c + 1}</th>`;
    tableHtml += '</tr>';
    for (let r = 0; r < parseInt(rows); r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < parseInt(cols); c++) tableHtml += '<td>Data</td>';
      tableHtml += '</tr>';
    }
    tableHtml += '</table><br>';
    if (noteBodyInput) {
      noteBodyInput.focus();
      document.execCommand('insertHTML', false, tableHtml);
      syncActiveFileBody();
    }
  };
}

if (kanbanBtn) kanbanBtn.onclick = () => { kanbanModal.classList.remove('hidden'); renderKanban(); };
if (closeKanbanBtn) closeKanbanBtn.onclick = () => kanbanModal.classList.add('hidden');

function renderKanban() {
  const t = document.getElementById('itemsTodo');
  const d = document.getElementById('itemsDoing');
  const dn = document.getElementById('itemsDone');
  if (t) t.innerHTML = '';
  if (d) d.innerHTML = '';
  if (dn) dn.innerHTML = '';

  kanbanTasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.draggable = true;
    card.innerText = task.text;
    card.ondragstart = (e) => e.dataTransfer.setData('text/plain', task.id);
    if (task.status === 'todo' && t) t.appendChild(card);
    else if (task.status === 'doing' && d) d.appendChild(card);
    else if (dn) dn.appendChild(card);
  });
  localStorage.setItem('np_kanban', JSON.stringify(kanbanTasks));
}

window.allowDrop = (e) => e.preventDefault();
window.drop = (e, status) => {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const task = kanbanTasks.find(t => t.id === id);
  if (task) { task.status = status; renderKanban(); }
};
if (addKanbanTaskBtn) {
  addKanbanTaskBtn.onclick = () => {
    const text = prompt("Task name:");
    if (text && text.trim()) { kanbanTasks.push({ id: Date.now().toString(), text: text.trim(), status: 'todo' }); renderKanban(); }
  };
}

if (scratchpadContent) scratchpadContent.value = scratchpadText;
if (scratchpadToggleBtn) scratchpadToggleBtn.onclick = () => scratchpadDrawer.classList.toggle('hidden');
if (closeScratchpadBtn) closeScratchpadBtn.onclick = () => scratchpadDrawer.classList.add('hidden');
if (scratchpadContent) {
  scratchpadContent.oninput = (e) => {
    scratchpadText = e.target.value;
    localStorage.setItem('np_scratchpad', scratchpadText);
  };
}

if (insertCodeBtn) {
  insertCodeBtn.onclick = () => {
    const code = prompt("Code paste karein:");
    if (code && code.trim()) {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const codeHtml = `<div class="code-container" contenteditable="false"><button class="copy-code-btn" onclick="copyCodeBlock(this)">📋 Copy</button><pre><code>${escaped}</code></pre></div><br>`;
      if (noteBodyInput) {
        noteBodyInput.focus();
        document.execCommand('insertHTML', false, codeHtml);
        syncActiveFileBody();
      }
    }
  };
}

window.copyCodeBlock = (btn) => {
  navigator.clipboard.writeText(btn.nextElementSibling.innerText);
  btn.innerText = '✅ Copied!';
  setTimeout(() => { btn.innerText = '📋 Copy'; }, 2000);
};

if (historyBtn) {
  historyBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile || !historyList) return;
    historyList.innerHTML = '';
    const hist = activeFile.history || [];
    if (hist.length === 0) {
      historyList.innerHTML = '<li class="sub-text">Abhi tak koi purana version nahi mila.</li>';
    } else {
      hist.forEach((h, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `<div><b>${h.date}</b><div class="sub-text">${h.title} (${h.words} words)</div></div><button class="primary-btn" onclick="restoreVersion(${index})">Restore</button>`;
        historyList.appendChild(li);
      });
    }
    historyModal.classList.remove('hidden');
  };
}
if (closeHistoryBtn) closeHistoryBtn.onclick = () => historyModal.classList.add('hidden');

window.restoreVersion = (index) => {
  const activeFile = files.find(f => f.id === activeFileId);
  if (!activeFile) return;
  const targetVersion = activeFile.history[index];
  if (confirm(`Restore version: "${targetVersion.date}"?`)) {
    activeFile.title = targetVersion.title;
    activeFile.body = targetVersion.body;
    saveFiles();
    renderEditor();
    renderFiles();
    historyModal.classList.add('hidden');
  }
};

function recordVersionCheckpoint(file) {
  if (!file) return;
  if (!file.history) file.history = [];
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const text = noteBodyInput ? noteBodyInput.innerText.trim() : '';
  const words = text ? text.split(/\s+/).length : 0;
  file.history.unshift({ date: now, title: file.title, body: file.body, words });
  if (file.history.length > 8) file.history.pop();
}

if (graphBtn) graphBtn.onclick = () => { graphModal.classList.remove('hidden'); renderKnowledgeGraph(); };
if (closeGraphBtn) closeGraphBtn.onclick = () => graphModal.classList.add('hidden');

function renderKnowledgeGraph() {
  if (!graphCanvas) return;
  const gctx = graphCanvas.getContext('2d');
  gctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
  const activeFiles = files.filter(f => !f.isTrash);
  if (activeFiles.length === 0) return;
  const nodes = [];
  const radius = 180;
  const centerX = graphCanvas.width / 2;
  const centerY = graphCanvas.height / 2;

  activeFiles.forEach((file, i) => {
    const angle = (i / activeFiles.length) * (2 * Math.PI);
    nodes.push({ id: file.id, title: file.title, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle), body: file.body });
  });

  gctx.strokeStyle = '#3b82f6';
  gctx.lineWidth = 2;
  nodes.forEach(source => {
    nodes.forEach(target => {
      if (source.id !== target.id && source.body.toLowerCase().includes(target.title.toLowerCase())) {
        gctx.beginPath();
        gctx.moveTo(source.x, source.y);
        gctx.lineTo(target.x, target.y);
        gctx.stroke();
      }
    });
  });

  nodes.forEach(node => {
    gctx.fillStyle = node.id === activeFileId ? '#ef4444' : '#3b82f6';
    gctx.beginPath();
    gctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
    gctx.fill();
    gctx.fillStyle = isDarkMode ? '#f8fafc' : '#0f172a';
    gctx.font = '12px Segoe UI';
    gctx.fillText(node.title.substring(0, 15), node.x + 12, node.y + 4);
  });
}

function updateAdvancedStats() {
  const text = noteBodyInput ? noteBodyInput.innerText.trim() : '';
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  const readingTime = Math.ceil(words / 200);
  if (statsCounter) statsCounter.innerText = `${words} words | ${chars} chars | ⏱️ ${readingTime}m read`;
  updateDailyGoalProgress();
}

if (zenModeBtn) {
  zenModeBtn.onclick = () => {
    const isZen = document.querySelector('.notepad-app').classList.toggle('zen-mode');
    zenModeBtn.innerText = isZen ? '✕ Exit Zen' : '📖 Zen';
  };
}

document.querySelectorAll('.ambient-btn').forEach(btn => {
  btn.onclick = () => {
    const isPlaying = btn.classList.contains('active');
    document.querySelectorAll('.ambient-btn').forEach(b => b.classList.remove('active'));
    if (!isPlaying) {
      btn.classList.add('active');
      playAmbient(btn.dataset.sound);
    } else {
      stopAmbient();
    }
  };
});

if (insertMathBtn) {
  insertMathBtn.onclick = () => {
    const formula = prompt("Formula likhein:");
    if (formula && formula.trim()) {
      const mathSpan = `<span class="math-badge">∑ ${formula.trim()}</span>&nbsp;`;
      noteBodyInput.focus();
      document.execCommand('insertHTML', false, mathSpan);
      syncActiveFileBody();
    }
  };
}

if (linkNoteBtn) {
  linkNoteBtn.onclick = () => {
    const targetTitle = prompt("Note Title:");
    if (targetTitle && targetTitle.trim()) {
      const linkHtml = `<span class="wiki-link" contenteditable="false" data-target="${targetTitle.trim()}">🔗 ${targetTitle.trim()}</span>&nbsp;`;
      noteBodyInput.focus();
      document.execCommand('insertHTML', false, linkHtml);
      syncActiveFileBody();
    }
  };
}

if (noteBodyInput) {
  noteBodyInput.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      const html = noteBodyInput.innerHTML;
      const regex = /\[\[(.*?)\]\]/g;
      if (regex.test(html)) {
        noteBodyInput.innerHTML = html.replace(regex, (m, title) => `<span class="wiki-link" contenteditable="false" data-target="${title.trim()}">🔗 ${title.trim()}</span>&nbsp;`);
        syncActiveFileBody();
      }
    }
  });

  noteBodyInput.addEventListener('click', (e) => {
    const linkSpan = e.target.closest('.wiki-link');
    if (linkSpan) {
      const targetTitle = linkSpan.getAttribute('data-target') || linkSpan.innerText.replace('🔗 ', '').trim();
      const target = files.find(f => f.title.toLowerCase().trim() === targetTitle.toLowerCase().trim() && !f.isTrash);
      if (target) {
        openInTab(target.id);
        renderEditor();
      } else alert(`"${targetTitle}" nahi mila!`);
    }
  });
}

// Pomodoro Timer
let totalTimerSeconds = parseInt(localStorage.getItem('np_custom_total_secs')) || (25 * 60);
let pomoTime = totalTimerSeconds;
let isPomoRunning = false;
let pomoTimerInterval = null;

const pomoDisplay = document.getElementById('pomoDisplay');
const pomoLabel = document.getElementById('pomoLabel');
const pomoToggleBtn = document.getElementById('pomoToggleBtn');
const pomoResetBtn = document.getElementById('pomoResetBtn');
const pomoSetTimeBtn = document.getElementById('pomoSetTimeBtn');

function updatePomoDisplay() {
  if (!pomoDisplay) return;
  const hrs = Math.floor(pomoTime / 3600).toString().padStart(2, '0');
  const mins = Math.floor((pomoTime % 3600) / 60).toString().padStart(2, '0');
  const secs = (pomoTime % 60).toString().padStart(2, '0');
  pomoDisplay.innerText = `${hrs}:${mins}:${secs}`;
}

if (pomoSetTimeBtn) {
  pomoSetTimeBtn.onclick = () => {
    const hInput = prompt("Hours:", Math.floor(totalTimerSeconds / 3600));
    const mInput = prompt("Minutes:", Math.floor((totalTimerSeconds % 3600) / 60));
    const sInput = prompt("Seconds:", totalTimerSeconds % 60);
    const total = (parseInt(hInput)||0)*3600 + (parseInt(mInput)||0)*60 + (parseInt(sInput)||0);
    if (total > 0) {
      totalTimerSeconds = total;
      localStorage.setItem('np_custom_total_secs', totalTimerSeconds);
      clearInterval(pomoTimerInterval);
      isPomoRunning = false;
      pomoTime = totalTimerSeconds;
      updatePomoDisplay();
      if (pomoToggleBtn) pomoToggleBtn.innerText = 'Start';
    }
  };
}

if (pomoToggleBtn) {
  pomoToggleBtn.onclick = () => {
    if (isPomoRunning) {
      clearInterval(pomoTimerInterval);
      isPomoRunning = false;
      pomoToggleBtn.innerText = 'Start';
    } else {
      isPomoRunning = true;
      pomoToggleBtn.innerText = 'Pause';
      pomoTimerInterval = setInterval(() => {
        if (pomoTime > 0) {
          pomoTime--;
          updatePomoDisplay();
        } else {
          clearInterval(pomoTimerInterval);
          isPomoRunning = false;
          alert('🔔 Study Timer Finished!');
          pomoTime = totalTimerSeconds;
          updatePomoDisplay();
          pomoToggleBtn.innerText = 'Start';
        }
      }, 1000);
    }
  };
}

if (pomoResetBtn) {
  pomoResetBtn.onclick = () => {
    clearInterval(pomoTimerInterval);
    isPomoRunning = false;
    pomoTime = totalTimerSeconds;
    updatePomoDisplay();
    if (pomoToggleBtn) pomoToggleBtn.innerText = 'Start';
  };
}
updatePomoDisplay();

let speechRecognizer = null;
let userRequestedVoice = false;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = true;
  speechRecognizer.lang = 'hi-IN';

  speechRecognizer.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
    }
    if (finalTranscript.trim() && noteBodyInput) {
      noteBodyInput.focus();
      document.execCommand('insertText', false, finalTranscript.trim() + ' ');
      syncActiveFileBody();
    }
  };
  speechRecognizer.onerror = (e) => { if (e.error === 'network') speechRecognizer.lang = 'en-IN'; };
  speechRecognizer.onend = () => { if (userRequestedVoice) try { speechRecognizer.start(); } catch(e){} };
}

if (voiceTypingBtn) {
  voiceTypingBtn.onclick = () => {
    if (!SpeechRecognition) return alert("Chrome/Edge browser use karein!");
    if (userRequestedVoice) {
      userRequestedVoice = false;
      speechRecognizer.stop();
      voiceTypingBtn.classList.remove('mic-active');
      voiceTypingBtn.innerText = '🎙️ Voice';
    } else {
      userRequestedVoice = true;
      speechRecognizer.start();
      voiceTypingBtn.classList.add('mic-active');
      voiceTypingBtn.innerText = '🔴 Sun Raha Hai...';
    }
  };
}

if (insertImageBtn) insertImageBtn.onclick = () => imageFileInput.click();
if (imageFileInput) {
  imageFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      document.execCommand('insertHTML', false, `<img src="${event.target.result}" alt="Photo"><br>`);
      syncActiveFileBody();
    };
    reader.readAsDataURL(file);
  };
}

if (noteBodyInput) {
  noteBodyInput.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (event) => {
          document.execCommand('insertHTML', false, `<img src="${event.target.result}" alt="Pasted Image"><br>`);
          syncActiveFileBody();
        };
        reader.readAsDataURL(item.getAsFile());
      }
    }
  });
}

let mediaRecorder = null;
let audioChunks = [];
let isRecordingAudio = false;

if (recordAudioBtn) {
  recordAudioBtn.onclick = async () => {
    if (!isRecordingAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const reader = new FileReader();
          reader.onload = (event) => {
            document.execCommand('insertHTML', false, `<br><audio controls src="${event.target.result}"></audio><br>`);
            syncActiveFileBody();
          };
          reader.readAsDataURL(new Blob(audioChunks, { type: 'audio/mp3' }));
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecordingAudio = true;
        recordAudioBtn.classList.add('mic-active');
        recordAudioBtn.innerText = '⏹️ Stop';
      } catch(e){ alert("Mic permission zaroori hai!"); }
    } else {
      mediaRecorder.stop();
      isRecordingAudio = false;
      recordAudioBtn.classList.remove('mic-active');
      recordAudioBtn.innerText = '⏺️ Audio';
    }
  };
}

let drawing = false;
if (drawBtn) {
  drawBtn.onclick = () => {
    drawingModal.classList.remove('hidden');
    if (!drawingCanvas) return;
    const ctx = drawingCanvas.getContext('2d');
    ctx.strokeStyle = drawColor ? drawColor.value : '#000';
    ctx.lineWidth = drawSize ? drawSize.value : 3;
    ctx.lineCap = 'round';
  };
}
if (drawCloseBtn) drawCloseBtn.onclick = () => drawingModal.classList.add('hidden');
if (drawClearBtn) {
  drawClearBtn.onclick = () => {
    if (!drawingCanvas) return;
    drawingCanvas.getContext('2d').clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  };
}

if (drawingCanvas) {
  const ctx = drawingCanvas.getContext('2d');
  drawingCanvas.onmousedown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
  drawingCanvas.onmousemove = (e) => {
    if (!drawing) return;
    ctx.strokeStyle = drawColor ? drawColor.value : '#000';
    ctx.lineWidth = drawSize ? drawSize.value : 3;
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
  };
}
window.addEventListener('mouseup', () => { drawing = false; });

if (drawInsertBtn) {
  drawInsertBtn.onclick = () => {
    document.execCommand('insertHTML', false, `<img src="${drawingCanvas.toDataURL()}" alt="Diagram"><br>`);
    syncActiveFileBody();
    drawingModal.classList.add('hidden');
    drawingCanvas.getContext('2d').clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  };
}

if (splitPdfBtn) splitPdfBtn.onclick = () => pdfFileInput.click();
if (pdfFileInput) {
  pdfFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pdfFrame.src = URL.createObjectURL(file);
    pdfViewerContainer.classList.remove('hidden');
  };
}
if (closePdfBtn) closePdfBtn.onclick = () => { pdfViewerContainer.classList.add('hidden'); pdfFrame.src = ''; };

let flashcardsList = [];
let currentCardIndex = 0;
let isFlipped = false;

if (flashcardBtn) {
  flashcardBtn.onclick = () => {
    const lines = (noteBodyInput ? noteBodyInput.innerText.trim() : '').split('\n').filter(l => l.trim().length > 3);
    if (lines.length < 2) return alert("Kam se kam 2 lines likhein!");
    flashcardsList = lines.map((l, i) => ({ front: `Question ${i + 1}`, back: l }));
    currentCardIndex = 0;
    isFlipped = false;
    updateFlashcardView();
    flashcardModal.classList.remove('hidden');
  };
}
if (closeFlashcardBtn) closeFlashcardBtn.onclick = () => flashcardModal.classList.add('hidden');
function updateFlashcardView() {
  if (!flashcardsList[currentCardIndex]) return;
  const card = flashcardsList[currentCardIndex];
  if (flashcardText) flashcardText.innerText = isFlipped ? card.back : card.front;
  if (fcCounter) fcCounter.innerText = `${currentCardIndex + 1} / ${flashcardsList.length}`;
}
if (flashcardContainer) flashcardContainer.onclick = () => { isFlipped = !isFlipped; updateFlashcardView(); };
if (fcNextBtn) fcNextBtn.onclick = () => { if (currentCardIndex < flashcardsList.length - 1) { currentCardIndex++; isFlipped = false; updateFlashcardView(); } };
if (fcPrevBtn) fcPrevBtn.onclick = () => { if (currentCardIndex > 0) { currentCardIndex--; isFlipped = false; updateFlashcardView(); } };

if (backupDownloadBtn) {
  backupDownloadBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ folders, folderPins, activeFolder, files, scratchpadText, kanbanTasks, examName, examDate, dailyWordGoal }, null, 2)], { type: 'application/json' }));
    a.download = `Notes_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
}

if (backupRestoreBtn) backupRestoreBtn.onclick = () => backupFileInput.click();
if (backupFileInput) {
  backupFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.folders && data.files) {
          folders = data.folders;
          folderPins = data.folderPins || {};
          files = data.files;
          activeFolder = data.activeFolder || folders[0];
          if (data.scratchpadText) scratchpadContent.value = data.scratchpadText;
          if (data.kanbanTasks) kanbanTasks = data.kanbanTasks;
          if (data.examName) examName = data.examName;
          if (data.examDate) examDate = data.examDate;
          if (data.dailyWordGoal) dailyWordGoal = data.dailyWordGoal;
          updateExamCountdown();
          updateDailyGoalProgress();
          saveFolders();
          saveFiles();
          selectFirstFile();
          renderFolders();
          renderFiles();
          renderEditor();
          alert("✅ Restored!");
        }
      } catch(e){ alert("Invalid Backup File!"); }
    };
    reader.readAsText(file);
  };
}

if (bulletListBtn) bulletListBtn.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('insertUnorderedList', false, null); noteBodyInput.focus(); });
if (numberListBtn) numberListBtn.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('insertOrderedList', false, null); noteBodyInput.focus(); });
if (fontSelect) fontSelect.onchange = () => { noteBodyInput.focus(); document.execCommand('fontName', false, fontSelect.value); };
if (fontSizeSelect) fontSizeSelect.onchange = () => { noteBodyInput.focus(); document.execCommand('fontSize', false, fontSizeSelect.value); };
document.querySelectorAll('.tool-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null); noteBodyInput.focus(); });
});
if (addChecklistBtn) {
  addChecklistBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.execCommand('insertHTML', false, `<div class="task-item"><input type="checkbox"> <span>New Task</span></div>&nbsp;`);
    setupCheckboxes();
    noteBodyInput.focus();
  });
}

function renderFolders() {
  if (!folderList) return;
  folderList.innerHTML = '';
  folders.forEach(folder => {
    const isLocked = folderPins[folder] && !unlockedFolders[folder];
    const li = document.createElement('li');
    li.className = `folder-item ${!isTrashView && folder === activeFolder ? 'active' : ''}`;
    li.innerHTML = `<span>📁 ${isLocked ? '🔒 ' : ''}${folder}</span>${folders.length > 1 ? `<button class="del-folder" onclick="deleteFolder(event, '${folder}')">✕</button>` : ''}`;
    
    li.onclick = () => {
      if (folderPins[folder] && !unlockedFolders[folder]) {
        const pin = prompt(`"${folder}" folder locked hai! Master PIN dalein:`);
        if (pin === folderPins[folder]) {
          unlockedFolders[folder] = true;
        } else {
          return alert("❌ Wrong PIN!");
        }
      }
      isTrashView = false;
      isStarFilterOnly = false;
      activeFolder = folder;
      activeTagFilter = '';
      localStorage.setItem('np_active_folder', activeFolder);
      selectFirstFile();
      renderFolders();
      renderFiles();
      renderEditor();
    };
    folderList.appendChild(li);
  });
  if (trashCount) trashCount.innerText = files.filter(f => f.isTrash).length;
  if (trashFolderItem) trashFolderItem.className = `folder-item trash-item ${isTrashView ? 'active' : ''}`;
  renderTagsCloud();
}

function renderTagsCloud() {
  if (!tagsCloud) return;
  tagsCloud.innerHTML = '';
  const allTags = new Set();
  files.forEach(f => {
    if (f.tags && !f.isTrash) f.tags.split(/\s+/).forEach(t => { if (t.startsWith('#')) allTags.add(t); });
  });
  allTags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = `tag-badge ${activeTagFilter === tag ? 'active' : ''}`;
    badge.innerText = tag;
    badge.onclick = () => { activeTagFilter = activeTagFilter === tag ? '' : tag; renderTagsCloud(); renderFiles(); };
    tagsCloud.appendChild(badge);
  });
}

if (trashFolderItem) {
  trashFolderItem.onclick = () => { isTrashView = true; activeTagFilter = ''; selectFirstFile(); renderFolders(); renderFiles(); renderEditor(); };
}

if (newFolderBtn) {
  newFolderBtn.onclick = () => {
    const name = prompt('Folder name:');
    if (name && name.trim()) {
      folders.push(name.trim());
      activeFolder = name.trim();
      saveFolders();
      renderFolders();
      renderFiles();
      renderEditor();
    }
  };
}

window.deleteFolder = (e, folderName) => {
  e.stopPropagation();
  if (confirm(`Delete folder "${folderName}"?`)) {
    folders = folders.filter(f => f !== folderName);
    files = files.filter(f => f.folder !== folderName);
    delete folderPins[folderName];
    if (activeFolder === folderName) activeFolder = folders[0] || '';
    saveFolders();
    saveFiles();
    renderFolders();
    renderFiles();
    renderEditor();
  }
};

function renderFiles() {
  if (currentFolderHeading) currentFolderHeading.innerText = isTrashView ? '🗑️ Trash' : (isStarFilterOnly ? '⭐ Starred Notes' : activeFolder);
  if (!fileList) return;
  fileList.innerHTML = '';
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  
  let currentFiles = files.filter(f => {
    if (isTrashView) return f.isTrash;
    if (isStarFilterOnly) return !f.isTrash && f.starred;
    return !f.isTrash && f.folder === activeFolder;
  });

  if (activeTagFilter) currentFiles = currentFiles.filter(f => (f.tags || '').includes(activeTagFilter));
  if (search) currentFiles = currentFiles.filter(f => f.title.toLowerCase().includes(search) || f.body.toLowerCase().includes(search) || (f.tags || '').toLowerCase().includes(search));

  currentFiles.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (fileCount) fileCount.innerText = `${currentFiles.length} file${currentFiles.length === 1 ? '' : 's'}`;

  currentFiles.forEach(file => {
    const li = document.createElement('li');
    li.className = `file-item ${file.id === activeFileId ? 'active' : ''}`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = file.body || '';

    const isLockedAndHidden = file.pin && !unlockedNotes[file.id];
    const displayTitle = isLockedAndHidden ? '🔒 ••••••••••••' : (file.title || 'Untitled Note');
    const plainText = isLockedAndHidden ? 'Encrypted Content' : (tempDiv.innerText.trim() || 'Empty note...');

    li.innerHTML = `
      <div class="file-title-row">
        <span class="file-title">${file.starred ? '★ ' : ''}${displayTitle}</span>
        <span>${file.pin ? '🔒' : ''} ${file.pinned ? '📌' : ''}</span>
      </div>
      <div class="file-preview">${plainText.substring(0, 30)}</div>
      <div class="file-meta-row">
        <span>${file.date}</span>
        <span class="file-tags">${file.tags || ''}</span>
      </div>
    `;

    li.onclick = () => {
      openInTab(file.id);
      renderFiles();
      renderEditor();
    };
    fileList.appendChild(li);
  });
}

function selectFirstFile() {
  const currentFiles = files.filter(f => isTrashView ? f.isTrash : (!f.isTrash && f.folder === activeFolder));
  activeFileId = currentFiles.length > 0 ? currentFiles[0].id : null;
  if (activeFileId) openInTab(activeFileId);
}

if (newFileBtn) {
  newFileBtn.onclick = () => {
    if (isTrashView) return alert('Trash me file create nahi ho sakti!');
    const now = new Date();
    const newFile = {
      id: Date.now().toString(),
      folder: activeFolder,
      title: `Study Plan - ${now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`,
      body: '<div><b>🎯 Targets:</b></div><div class="task-item"><input type="checkbox"> <span>Chapter revision</span></div><br>',
      tags: '#study #revision',
      date: now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      pinned: false,
      starred: false,
      isTrash: false,
      pin: '',
      history: []
    };
    files.unshift(newFile);
    openInTab(newFile.id);
    saveFiles();
    renderFolders();
    renderFiles();
    renderEditor();
    pushNoteToSupabase(newFile);
  };
}

function renderEditor() {
  const activeFile = files.find(f => f.id === activeFileId);
  renderTabs();

  if (!activeFile) {
    if (editorEmptyState) editorEmptyState.classList.remove('hidden');
    if (editorContent) editorContent.classList.add('hidden');
    if (lockScreenOverlay) lockScreenOverlay.classList.add('hidden');
    return;
  }

  if (activeFile.pin && !unlockedNotes[activeFile.id]) {
    if (lockScreenOverlay) lockScreenOverlay.classList.remove('hidden');
    if (editorContent) editorContent.classList.add('hidden');
    if (editorEmptyState) editorEmptyState.classList.add('hidden');
    if (lockScreenMessage) lockScreenMessage.innerText = 'This note is protected. Enter PIN:';
    if (pinInputUnlock) {
      pinInputUnlock.value = '';
      pinInputUnlock.focus();
    }
    return;
  }

  if (lockScreenOverlay) lockScreenOverlay.classList.add('hidden');
  if (editorEmptyState) editorEmptyState.classList.add('hidden');
  if (editorContent) editorContent.classList.remove('hidden');

  if (editorFolderBadge) editorFolderBadge.innerText = `📁 ${activeFile.folder}`;
  if (editorDateText) editorDateText.innerText = activeFile.date;
  if (noteTitleInput) noteTitleInput.value = activeFile.title;
  if (noteTagsInput) noteTagsInput.value = activeFile.tags || '';
  if (noteBodyInput) noteBodyInput.innerHTML = activeFile.body;
  if (pinBtn) pinBtn.innerText = activeFile.pinned ? '📌 Pinned' : '📍 Pin';
  if (lockToggleBtn) lockToggleBtn.innerText = activeFile.pin ? '🔒 Locked' : '🔓 Note Lock';
  if (lockFolderBtn) lockFolderBtn.innerText = folderPins[activeFolder] ? '🔒 Folder Locked' : '🔐 Folder Lock';
  if (starNoteBtn) starNoteBtn.innerText = activeFile.starred ? '★ Starred' : '☆ Star';

  if (activeFile.isTrash) {
    if (deleteActiveFileBtn) deleteActiveFileBtn.innerText = '❌ Delete Forever';
    if (restoreFileBtn) restoreFileBtn.classList.remove('hidden');
    if (noteBodyInput) noteBodyInput.setAttribute('contenteditable', 'false');
    if (noteTitleInput) noteTitleInput.disabled = true;
    if (noteTagsInput) noteTagsInput.disabled = true;
  } else {
    if (deleteActiveFileBtn) deleteActiveFileBtn.innerText = '🗑️ Trash';
    if (restoreFileBtn) restoreFileBtn.classList.add('hidden');
    if (noteBodyInput) noteBodyInput.setAttribute('contenteditable', 'true');
    if (noteTitleInput) noteTitleInput.disabled = false;
    if (noteTagsInput) noteTagsInput.disabled = false;
  }

  updateAdvancedStats();
  setupCheckboxes();
}

if (unlockBtn) {
  unlockBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile && pinInputUnlock && pinInputUnlock.value === activeFile.pin) {
      unlockedNotes[activeFile.id] = true;
      renderEditor();
      renderFiles();
    } else { alert('❌ Wrong PIN!'); }
  };
}
if (pinInputUnlock) {
  pinInputUnlock.onkeydown = (e) => { if (e.key === 'Enter') unlockBtn.click(); };
}

if (lockToggleBtn) {
  lockToggleBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    if (activeFile.pin) {
      if (prompt('Purana PIN:') === activeFile.pin) {
        activeFile.pin = '';
        delete unlockedNotes[activeFile.id];
        alert('🔓 Note Unlocked!');
      }
    } else {
      const newPin = prompt('Naya 4-digit PIN:');
      if (newPin && newPin.trim()) {
        activeFile.pin = newPin.trim();
        unlockedNotes[activeFile.id] = true;
        alert('🔒 Note Locked!');
      }
    }
    saveFiles();
    renderFiles();
    renderEditor();
  };
}

let autoSaveTimer = null;
if (noteTitleInput) {
  noteTitleInput.oninput = (e) => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile && !activeFile.isTrash) { activeFile.title = e.target.value; saveFiles(); renderFiles(); renderTabs(); pushNoteToSupabase(activeFile); }
  };
}

if (noteTagsInput) {
  noteTagsInput.oninput = (e) => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile && !activeFile.isTrash) { activeFile.tags = e.target.value; saveFiles(); renderFolders(); renderFiles(); pushNoteToSupabase(activeFile); }
  };
}

if (noteBodyInput) {
  noteBodyInput.oninput = () => {
    syncActiveFileBody();
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const activeFile = files.find(f => f.id === activeFileId);
      if (activeFile) recordVersionCheckpoint(activeFile);
    }, 3000);
  };
}

function syncActiveFileBody() {
  const activeFile = files.find(f => f.id === activeFileId);
  if (activeFile && !activeFile.isTrash && noteBodyInput) {
    activeFile.body = noteBodyInput.innerHTML;
    saveFiles();
    updateAdvancedStats();
    renderFiles();
    pushNoteToSupabase(activeFile);
  }
}

function setupCheckboxes() {
  if (!noteBodyInput) return;
  noteBodyInput.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      const span = cb.nextElementSibling;
      if (span) span.classList.toggle('task-done', cb.checked);
      if (cb.checked) cb.setAttribute('checked', 'true');
      else cb.removeAttribute('checked');
      syncActiveFileBody();
    };
  });
}

if (pinBtn) {
  pinBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile) { activeFile.pinned = !activeFile.pinned; saveFiles(); renderFiles(); renderEditor(); }
  };
}

let isSpeaking = false;
if (ttsBtn) {
  ttsBtn.onclick = () => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) { window.speechSynthesis.cancel(); isSpeaking = false; ttsBtn.innerText = '🔊 Listen'; }
      else {
        const title = noteTitleInput ? noteTitleInput.value : '';
        const body = noteBodyInput ? noteBodyInput.innerText : '';
        const utterance = new SpeechSynthesisUtterance(`${title}. ${body}`);
        utterance.onend = () => { isSpeaking = false; ttsBtn.innerText = '🔊 Listen'; };
        window.speechSynthesis.speak(utterance);
        isSpeaking = true;
        ttsBtn.innerText = '⏹️ Stop';
      }
    }
  };
}

if (openTxtBtn) openTxtBtn.onclick = () => fileInputPicker.click();
if (fileInputPicker) {
  fileInputPicker.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      files.unshift({
        id: Date.now().toString(),
        folder: activeFolder,
        title: file.name.replace(/\.(txt|md)$/i, ''),
        body: `<div>${event.target.result.replace(/\n/g, '<br>')}</div>`,
        tags: file.name.endsWith('.md') ? '#markdown' : '#imported',
        date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        pinned: false,
        starred: false,
        isTrash: false,
        pin: '',
        history: []
      });
      openInTab(files[0].id);
      saveFiles();
      renderFolders();
      renderFiles();
      renderEditor();
      pushNoteToSupabase(files[0]);
    };
    reader.readAsText(file);
  };
}

if (saveToDiskBtn) {
  saveToDiskBtn.onclick = async () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return alert("Pehle koi file open karein!");
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: `${activeFile.title || 'Note'}.txt` });
      const writable = await handle.createWritable();
      const body = noteBodyInput ? noteBodyInput.innerText.trim() : '';
      await writable.write(`=== ${activeFile.title} ===\n\n${body}`);
      await writable.close();
      alert("✅ Saved to PC!");
    } catch(e){}
  };
}

deleteActiveFileBtn.onclick = () => {
  const activeFile = files.find(f => f.id === activeFileId);
  if (!activeFile) return;
  if (activeFile.isTrash) {
    if (confirm('Permanent delete?')) {
      files = files.filter(f => f.id !== activeFileId);
      openTabs = openTabs.filter(t => t !== activeFileId);
      if (currentUser && sbClient) sbClient.from('notes').delete().eq('id', activeFileId);
      selectFirstFile();
    }
  } else {
    activeFile.isTrash = true;
    openTabs = openTabs.filter(t => t !== activeFileId);
    selectFirstFile();
  }
  saveFiles();
  renderFolders();
  renderFiles();
  renderEditor();
};

if (restoreFileBtn) {
  restoreFileBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile) {
      activeFile.isTrash = false;
      saveFiles();
      renderFolders();
      renderFiles();
      renderEditor();
    }
  };
}

if (exportTxtBtn) {
  exportTxtBtn.onclick = () => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return;
    const body = noteBodyInput ? noteBodyInput.innerText : '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`${activeFile.title}\n\n${body}`], { type: 'text/plain' }));
    a.download = `${activeFile.title}.txt`;
    a.click();
  };
}

if (exportPdfBtn) exportPdfBtn.onclick = () => window.print();

function saveFolders() {
  localStorage.setItem('np_folders', JSON.stringify(folders));
  localStorage.setItem('np_folder_pins', JSON.stringify(folderPins));
  localStorage.setItem('np_active_folder', activeFolder);
}
function saveFiles() {
  localStorage.setItem('np_files', JSON.stringify(files));
}

// Initial Boot Sequence
if (searchInput) searchInput.oninput = renderFiles;
checkStreak();
updateExamCountdown();
updateDailyGoalProgress();
checkAuthSession();

if (!activeFileId) selectFirstFile();
else renderTabs();
renderFolders();
renderFiles();
renderEditor();
