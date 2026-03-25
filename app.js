const SUPABASE_URL = "https://ziaaklihkikgpzttptpo.supabase.co";
const SUPABASE_KEY = "sb_publishable_wJgkFs35Ko9evNW4JPZL9w_JVq2WVcS";
const ADMIN_EMAIL = "ruben.wiebe@hotmail.com";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let docs = [];
let docsLoaded = false;
let currentUser = null;

function setAuthStatus(message) {
  const el = byId("authStatus");
  if (el) el.textContent = message;
}

function updateAuthUI(user) {
  currentUser = user;

  const authBox = byId("authBox");
  const generatorArea = byId("generatorArea");
  const adminPanel = byId("adminPanel");

  if (user) {
    if (authBox) authBox.style.display = "none";
    if (generatorArea) generatorArea.style.display = "block";
    if (adminPanel) adminPanel.style.display = isAdmin(user) ? "block" : "none";
    setStatus("Ready");
  } else {
    if (authBox) authBox.style.display = "block";
    if (generatorArea) generatorArea.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    setAuthStatus("Not logged in");
    setStatus("Ready");
  }
}

async function signUp() {
  setAuthStatus("Trying sign up...");

  const email = byId("email")?.value.trim();
  const password = byId("password")?.value;

  if (!email || !password) {
    setAuthStatus("Enter email and password");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signUp({ email, password });
    setAuthStatus(error ? error.message : "Signup successful");
  } catch (err) {
    console.error(err);
    setAuthStatus("Failed to sign up");
  }
}

async function signIn() {
  setAuthStatus("Trying sign in...");

  const email = byId("email")?.value.trim();
  const password = byId("password")?.value;

  if (!email || !password) {
    setAuthStatus("Enter email and password");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    const { data } = await supabaseClient.auth.getUser();
    updateAuthUI(data.user || null);
    setAuthStatus("Signed in");
  } catch (err) {
    console.error(err);
    setAuthStatus("Failed to sign in");
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

function byId(id) {
  return document.getElementById(id);
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
  return !!user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function todayString() {
  const d = new Date();
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/* =========================
   UPLOAD WITH PRIORITY
========================= */

async function uploadDocuments() {
  setAdminStatus("Upload button clicked");
  console.log("uploadDocuments fired");

  if (!currentUser || !isAdmin(currentUser)) {
    setAdminStatus("Admin only");
    return;
  }

  const docsInput = byId("docs");
  const files = docsInput ? docsInput.files : null;
  const priority = parseInt(byId("docPriority")?.value || "5", 10);

  if (!files || !files.length) {
    setAdminStatus("Choose at least one file");
    return;
  }

  setAdminStatus("Uploading...");
  for (const file of files) {
    const path = `shared/${Date.now()}-${file.name}`;

    await supabaseClient.storage
      .from("reference-docs")
      .upload(path, file);

    const text = await file.text().catch(() => "");

    const { data: doc } = await supabaseClient
      .from("document_library")
      .insert({
        storage_path: path,
        filename: file.name,
        extracted_text: text,
        uploaded_by: currentUser.id,
        priority: priority,
        parse_status: "complete"
      })
      .select()
      .single();

    const sections = chunkText(text).map((content, i) => ({
      document_id: doc.id,
      content,
      content_clean: content.toLowerCase(),
      chunk_index: i
    }));

    if (sections.length) {
      await supabaseClient.from("document_sections").insert(sections);
    }
  }

  setAdminStatus("Upload complete");
  await loadStoredDocuments();
}

/* =========================
   LOAD DOCUMENTS WITH PRIORITY
========================= */

async function loadStoredDocuments() {
  const { data } = await supabaseClient
    .from("document_library")
    .select(`
      id,
      filename,
      extracted_text,
      priority,
      document_sections (
        content,
        content_clean,
        chunk_index
      )
    `);

  docs = (data || []).map(d => ({
    id: d.id,
    name: d.filename,
    priority: d.priority ?? 5,
    sections: d.document_sections || []
  }));

  docsLoaded = true;
}

/* =========================
   TEXT PROCESSING
========================= */

function chunkText(text) {
  return text
    .split(/\n\n+/)
    .map(x => x.trim())
    .filter(x => x.length > 40);
}

/* =========================
   PRIORITY SCORING
========================= */

function scoreSection(section, topic, priority = 5) {
  const text = section.content.toLowerCase();
  const topicLower = topic.toLowerCase();

  let score = 0;

  if (text.includes(topicLower)) score += 10;
  if (text.includes("search")) score += 5;
  if (text.includes("victim")) score += 5;

  score += priority; // 🔥 KEY LINE

  return score;
}

/* =========================
   FIND MATCHES
========================= */

function findMatches(topic) {
  const matches = [];

  for (const doc of docs) {
    for (const section of doc.sections) {
      const score = scoreSection(section, topic, doc.priority);

      if (score > 5) {
        matches.push({
          content: section.content,
          score,
          source: doc.name
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

/* =========================
   GENERATE OUTPUT
========================= */

function generate() {
  const topic = byId("topic").value;

  const matches = findMatches(topic);

  const output = `
BRAMPTON FIRE & EMERGENCY SERVICES LESSON PLAN

DATE: ${todayString()}
INSTRUCTOR: Ruben
SUBJECT: ${topic}

LESSON OUTLINE:
${matches.map((m, i) => `${i + 1}. ${m.content}`).join("\n")}
`;

  byId("output").textContent = output;
}

/* =========================
   INIT
========================= */

function init() {
  byId("signUpBtn")?.addEventListener("click", signUp);
  byId("signInBtn")?.addEventListener("click", signIn);
  byId("signOutBtn")?.addEventListener("click", signOutUser);
  byId("generateBtn")?.addEventListener("click", generate);
  byId("exportPdfBtn")?.addEventListener("click", exportPDF);
  byId("uploadDocsBtn")?.addEventListener("click", uploadDocuments);

  initAuth();
}

window.onload = init;
