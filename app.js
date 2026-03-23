const SUPABASE_URL = "https://ziaaklihkikgpzttptpo.supabase.co";
const SUPABASE_KEY = "PASTE YOUR ANON KEY HERE";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function byId(id){ return document.getElementById(id); }

// ---------------- AUTH ----------------

function setAuthStatus(msg){
  byId("authStatus").textContent = msg;
}

function updateAuthUI(user){
  const generator = byId("generatorArea");
  const authBox = document.querySelector(".auth-box");

  if(user){
    generator.style.display = "block";
    authBox.style.display = "none";
    setAuthStatus("Signed in: " + user.email);
  } else {
    generator.style.display = "none";
    authBox.style.display = "block";
    setAuthStatus("Not logged in");
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  updateAuthUI(session?.user || null);
});

async function signUp(){
  setAuthStatus("Trying sign up...");
  const { error } = await supabase.auth.signUp({
    email: byId("email").value,
    password: byId("password").value
  });

  setAuthStatus(error ? error.message : "Signup successful");
}

async function signIn(){
  setAuthStatus("Trying sign in...");
  const { error } = await supabase.auth.signInWithPassword({
    email: byId("email").value,
    password: byId("password").value
  });

  setAuthStatus(error ? error.message : "Signed in");
}

async function signOutUser(){
  await supabase.auth.signOut();
}

// ---------------- DOCS ----------------

let docs = [];
let docsLoaded = false;

byId("docs").addEventListener("change", function(e){
  docs = [];
  docsLoaded = false;

  let files = e.target.files;
  let loaded = 0;

  for(let file of files){
    let reader = new FileReader();

    reader.onload = function(evt){
      docs.push({
        name: file.name,
        content: evt.target.result.toLowerCase()
      });

      loaded++;
      if(loaded === files.length){
        docsLoaded = true;
        byId("status").textContent = files.length + " docs ready";
      }
    };

    reader.readAsText(file);
  }
});

function extractRelevant(topic){
  let results = [];
  let t = topic.toLowerCase();

  for(let d of docs){
    if(d.content.includes(t)){
      results.push(d.name);
    }
  }
  return results;
}

// ---------------- GENERATOR ----------------

function generate(){
  let nfpa = byId("nfpa").value;
  let dur = byId("duration").value;
  let type = byId("type").value;
  let format = byId("format").value;
  let topic = byId("topic").value;

  if(!topic){
    byId("output").textContent = "Enter a topic";
    return;
  }

  let refs = docsLoaded ? extractRelevant(topic) : [];
  let refText = refs.length ? refs.join("\n") : "No matching documents";

  let output = "";

  if(type === "Lesson Plan"){
    output = `
BFES LESSON PLAN

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
    output = `
SKILL SHEET

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

// ---------------- PDF ----------------

function exportPDF(){
  const { jsPDF } = window.jspdf;
  let doc = new jsPDF();

  let text = byId("output").textContent;

  if(!text){
    alert("Generate first");
    return;
  }

  let lines = doc.splitTextToSize(text, 180);
  doc.text(lines, 10, 10);
  doc.save("DrillForge.pdf");
}
