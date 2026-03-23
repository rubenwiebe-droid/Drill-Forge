const SUPABASE_URL = "https://ziaaklihkikgpzttptpo.supabase.co";
const SUPABASE_KEY = "sb_publishable_wJgkFs35Ko9evNW4JPZL9w_JVq2WVcS";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let docs = [];
let docsLoaded = false;

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

function updateAuthUI(user) {
  const authBox = byId("authBox");
  const generatorArea = byId("generatorArea");

  if (user) {
    authBox.style.display = "none";
    generatorArea.style.display = "block";
    loadStoredDocuments();
  } else {
    authBox.style.display = "block";
    generatorArea.style.display = "none";
    setAuthStatus("Not logged in");
    docs = [];
    docsLoaded = false;
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
  const files = byId("docs").files;
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData.user;

  if (!user) {
    setStatus("You must be signed in.");
    return;
  }

  if (!files.length) {
    setStatus("Choose at least one file.");
    return;
  }

  setStatus("Uploading...");

  let uploaded = 0;

  for (const file of files) {
    const path = `${user.id}/${Date.now()}-${file.name}`;

    const { error } = await supabaseClient.storage
      .from("reference-docs")
      .upload(path, file, {
        upsert: false
      });

    if (error) {
      console.error(error);
      setStatus(`Upload failed: ${error.message}`);
      return;
    }

    uploaded += 1;
  }

  setStatus(`${uploaded} file(s) uploaded.`);
  await loadStoredDocuments();
}

async function loadStoredDocuments() {
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData.user;

  if (!user) return;

  const { data, error } = await supabaseClient.storage
    .from("reference-docs")
    .list(user.id, {
      limit: 100
    });

  if (error) {
    console.error(error);
    setStatus(`Could not load stored docs: ${error.message}`);
    return;
  }

  if (!data || !data.length) {
    docs = [];
    docsLoaded = false;
    setStatus("No stored documents yet.");
    return;
  }

  docs = data.map(file => ({
    name: file.name,
    content: file.name.toLowerCase()
  }));

  docsLoaded = true;
  setStatus(`${data.length} stored document(s) found.`);
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
    updateAuthUI(data.session?.user ?? null);

    supabaseClient.auth.onAuthStateChange((event, session) => {
      updateAuthUI(session?.user ?? null);
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
