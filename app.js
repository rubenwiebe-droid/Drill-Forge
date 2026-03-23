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

function updateAuthUI(user) {
  const authBox = byId("authBox");
  const generatorArea = byId("generatorArea");

  if (user) {
    if (authBox) authBox.style.display = "none";
    if (generatorArea) generatorArea.style.display = "block";
  } else {
    if (authBox) authBox.style.display = "block";
    if (generatorArea) generatorArea.style.display = "none";
    setAuthStatus("Not logged in");
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

function extractRelevant(topic) {
  const results = [];
  const t = topic.toLowerCase();

  for (const d of docs) {
    if (d.content.includes(t)) {
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

function initDocsUpload() {
  const docsInput = byId("docs");
  if (!docsInput) return;

  docsInput.addEventListener("change", function (e) {
    docs = [];
    docsLoaded = false;

    const files = e.target.files;
    let loaded = 0;

    if (!files.length) {
      byId("status").textContent = "No documents loaded";
      return;
    }

    for (const file of files) {
      const reader = new FileReader();

      reader.onload = function (evt) {
        docs.push({
          name: file.name,
          content: String(evt.target.result).toLowerCase()
        });

        loaded += 1;

        if (loaded === files.length) {
          docsLoaded = true;
          byId("status").textContent = `${files.length} docs ready`;
        }
      };

      reader.readAsText(file);
    }
  });
}

function initButtons() {
  byId("signUpBtn").addEventListener("click", signUp);
  byId("signInBtn").addEventListener("click", signIn);

  const signOutBtn = byId("signOutBtn");
  if (signOutBtn) signOutBtn.addEventListener("click", signOutUser);

  const generateBtn = byId("generateBtn");
  if (generateBtn) generateBtn.addEventListener("click", generate);

  const exportPdfBtn = byId("exportPdfBtn");
  if (exportPdfBtn) exportPdfBtn.addEventListener("click", exportPDF);
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
  initDocsUpload();
  initAuth();
};
