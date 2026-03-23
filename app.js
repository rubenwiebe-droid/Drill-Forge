const SUPABASE_URL = "https://ziaaklihkikgpzttptpo.supabase.co";
const SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

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
  const generatorArea = byId("generatorArea");

  if (user) {
    if (generatorArea) generatorArea.style.display = "block";
    setAuthStatus(`Signed in as ${user.email}`);
  } else {
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

  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    setAuthStatus(error.message);
  } else {
    setAuthStatus("Signup successful. Check your email if confirmation is required.");
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

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    setAuthStatus(error.message);
  }
}

async function signOutUser() {
  setAuthStatus("Signing out...");

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    setAuthStatus(error.message);
  } else {
    updateAuthUI(null);
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
    byId("output").textContent = "Enter a topic.";
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

LEARNING OUTCOMES:
- Apply ${topic} safely
- Demonstrate competency per ${nfpa}

LESSON OUTLINE:
${format === "Detailed" ? "- Theory\n- Demonstration\n- Practical\n- Evaluation" : "- Overview\n- Practical\n- Review"}

APPLICATION:
Scenario-based evaluation

REFERENCES:
1. Department Docs:
${refText}

2. NFPA:
${nfpa}
`;
  } else {
    output = `BFES SKILL SHEET

TITLE: ${topic}
STANDARD: ${nfpa}

STEPS:
1. Prepare equipment
2. Perform ${topic}
3. Maintain safety

REFERENCES:
1. Department Docs:
${refText}

2. NFPA:
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
    alert("Generate content first");
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
    let loadedCount = 0;

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

        loadedCount += 1;

        if (loadedCount === files.length) {
          docsLoaded = true;
          byId("status").textContent = `${files.length} documents ready`;
        }
      };

      reader.readAsText(file);
    }
  });
}

function initButtons() {
  byId("signUpBtn").addEventListener("click", signUp);
  byId("signInBtn").addEventListener("click", signIn);
  byId("signOutBtn").addEventListener("click", signOutUser);
  byId("generateBtn").addEventListener("click", generate);
  byId("exportPdfBtn").addEventListener("click", exportPDF);
}

async function initAuth() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    updateAuthUI(null);
  } else {
    updateAuthUI(data.session?.user ?? null);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    updateAuthUI(session?.user ?? null);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initButtons();
  initDocsUpload();
  initAuth();
});
