const SUPABASE_URL = "https://ziaaklihkikgpzttptpo.supabase.co";
const SUPABASE_KEY = "sb_publishable_wJgkFs35Ko9evNW4JPZL9w_JVq2WVcS";
const ADMIN_EMAIL = "ruben.wiebe@hotmail.com";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let docs = [];
let docsLoaded = false;
let currentUser = null;

function byId(id) {
  return document.getElementById(id);
}

function setAuthStatus(message) {
  const el = byId("authStatus");
  if (el) el.textContent = message;
}

function setStatus(message) {
  const el = byId("status");
  if (el) el.textContent = message;
}

function setAdminStatus(message) {
  const el = byId("adminStatus");
  if (el) el.textContent = message;
}

function isAdmin(user) {
  return !!user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function updateAuthUI(user) {
  currentUser = user;

  const authBox = byId("authBox");
  const generatorArea = byId("generatorArea");
  const adminPanel = byId("adminPanel");

  if (user) {
    authBox.style.display = "none";
    generatorArea.style.display = "block";
    adminPanel.style.display = isAdmin(user) ? "block" : "none";
    setStatus("Ready");
  } else {
    authBox.style.display = "block";
    generatorArea.style.display = "none";
    adminPanel.style.display = "none";
    setAuthStatus("Not logged in");
    setStatus("Ready");
    docs = [];
    docsLoaded = false;
    byId("output").textContent = "";
  }
}

async function signUp() {
  setAuthStatus("Trying sign up...");

  const email = byId("email").value.trim();
  const password = byId("password").value;

  if (!email || !password) {
    setAuthStatus("Enter email and password");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signUp({ email, password });
    setAuthStatus(error ? error.message : "Signup successful");
  } catch (err) {
    console.error(err);
    setAuthStatus("Failed to fetch");
  }
}

async function signIn() {
  setAuthStatus("Trying sign in...");

  const email = byId("email").value.trim();
  const password = byId("password").value;

  if (!email || !password) {
    setAuthStatus("Enter email and password");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    setAuthStatus(error ? error.message : "Signed in");
  } catch (err) {
    console.error(err);
    setAuthStatus("Failed to fetch");
  }
}

async function signOutUser() {
  try {
    await supabaseClient.auth.signOut();
    updateAuthUI(null);
  } catch (err) {
    console.error(err);
  }
}

async function uploadDocuments() {
  if (!currentUser || !isAdmin(currentUser)) {
    setAdminStatus("Admin only");
    return;
  }

  const files = byId("docs").files;

  if (!files.length) {
    setAdminStatus("Choose at least one file");
    return;
  }

  setAdminStatus("Uploading...");

  let uploaded = 0;

  for (const file of files) {
    const path = `${currentUser.id}/${Date.now()}-${file.name}`;

    const { error } = await supabaseClient.storage
      .from("reference-docs")
      .upload(path, file, { upsert: false });

    if (error) {
      console.error(error);
      setAdminStatus(`Upload failed: ${error.message}`);
      return;
    }

    uploaded += 1;
  }

  setAdminStatus(`${uploaded} file(s) uploaded`);
  byId("docs").value = "";
  await loadStoredDocuments();
  await loadAdminFiles();
}

async function loadStoredDocuments() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient.storage
    .from("reference-docs")
    .list(currentUser.id, { limit: 100 });

  if (error) {
    console.error(error);
    docs = [];
    docsLoaded = false;
    return;
  }

  if (!data || !data.length) {
    docs = [];
    docsLoaded = false;
    return;
  }

  docs = data.map(file => ({
    name: file.name,
    content: file.name.toLowerCase()
  }));

  docsLoaded = true;
}

async function loadAdminFiles() {
  if (!currentUser || !isAdmin(currentUser)) return;

  const listEl = byId("adminFilesList");
  listEl.innerHTML = "Loading...";

  const { data, error } = await supabaseClient.storage
    .from("reference-docs")
    .list(currentUser.id, { limit: 100 });

  if (error) {
    console.error(error);
    listEl.innerHTML = "Could not load files";
    return;
  }

  if (!data || !data.length) {
    listEl.innerHTML = "<div class='file-row'>No files uploaded</div>";
    return;
  }

  listEl.innerHTML = "";

  data.forEach(file => {
    const row = document.createElement("div");
    row.className = "file-row";

    const name = document.createElement("span");
    name.textContent = file.name;

    const btn = document.createElement("button");
    btn.textContent = "Delete";
    btn.type = "button";
    btn.onclick = async function () {
      await deleteAdminFile(file.name);
    };

    row.appendChild(name);
    row.appendChild(btn);
    listEl.appendChild(row);
  });
}

async function deleteAdminFile(fileName) {
  if (!currentUser || !isAdmin(currentUser)) {
    setAdminStatus("Admin only");
    return;
  }

  setAdminStatus("Deleting...");

  const path = `${currentUser.id}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from("reference-docs")
    .remove([path]);

  if (error) {
    console.error(error);
    setAdminStatus(`Delete failed: ${error.message}`);
    return;
  }

  setAdminStatus("File deleted");
  await loadStoredDocuments();
  await loadAdminFiles();
}

function extractRelevant(topic) {
  const results = [];
  const t = topic.toLowerCase();

  for (const d of docs) {
    if (d.content.includes(t) || d.name.toLowerCase().includes(t)) {
      results.push(d.name);
    }
  }

  return results;
}

function generate() {
  const nfpa = byId("nfpa").value;
  const dur = byId("duration").value;
  const type = byId("type").value;
  const format = byId("format").value;
  const topic = byId("topic").value.trim();

  if (!topic) {
    byId("output").textContent = "Enter a topic";
    return;
  }

  const refs = docsLoaded ? extractRelevant(topic) : [];
  const refText = refs.length ? refs.join("\n") : "No matching documents";

  let output = "";

  if (type === "Lesson Plan") {
    output = `BFES LESSON PLAN

SUBJECT: ${topic}
NFPA: ${nfpa}
TIME: ${dur}

OBJECTIVES:
- Apply ${topic}
- Meet ${nfpa}

CONTENT:
${format === "Detailed"
? "- Theory\n- Demonstration\n- Practical\n- Evaluation\n- Safety Considerations"
: "- Overview\n- Practical\n- Review"}

REFERENCES:
${refText}
${nfpa}
`;
  } else {
    output = `SKILL SHEET

TITLE: ${topic}
STANDARD: ${nfpa}

STEPS:
1. Prepare
2. Execute ${topic}
3. Safety check

REFERENCES:
${refText}
${nfpa}
`;
  }

  byId("output").textContent = output;
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const text = byId("output").textContent;

  if (!text) {
    alert("Generate first");
    return;
  }

  const lines = doc.splitTextToSize(text, 180);
  doc.text(lines, 10, 10);
  doc.save("DrillForge.pdf");
}

function initButtons() {
  byId("signUpBtn").addEventListener("click", signUp);
  byId("signInBtn").addEventListener("click", signIn);
  byId("signOutBtn").addEventListener("click", signOutUser);
  byId("generateBtn").addEventListener("click", generate);
  byId("exportPdfBtn").addEventListener("click", exportPDF);
  byId("uploadDocsBtn").addEventListener("click", uploadDocuments);
}

async function initAuth() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    const user = data.session?.user ?? null;
    updateAuthUI(user);

    if (user) {
      await loadStoredDocuments();
      if (isAdmin(user)) {
        await loadAdminFiles();
      }
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      const userNow = session?.user ?? null;
      updateAuthUI(userNow);

      if (userNow) {
        await loadStoredDocuments();
        if (isAdmin(userNow)) {
          await loadAdminFiles();
        }
      }
    });
  } catch (err) {
    console.error(err);
    updateAuthUI(null);
  }
}

window.onload = function () {
  initButtons();
  initAuth();
};
