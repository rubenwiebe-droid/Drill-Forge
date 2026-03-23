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

function todayString() {
  const d = new Date();
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
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
    docs = [];
    docsLoaded = false;
    if (byId("output")) byId("output").textContent = "";
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

    if (error) {
      setAuthStatus(error.message);
      return;
    }

    const { data } = await supabaseClient.auth.getUser();
    updateAuthUI(data.user || null);
    setAuthStatus("Signed in");
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
    const path = `shared/${Date.now()}-${file.name}`;

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
  const { data, error } = await supabaseClient.storage
    .from("reference-docs")
    .list("shared", { limit: 100 });

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
  if (!listEl) return;

  listEl.innerHTML = "Loading...";

  const { data, error } = await supabaseClient.storage
    .from("reference-docs")
    .list("shared", { limit: 100 });

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

  const path = `shared/${fileName}`;

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
    const n = d.name.toLowerCase();
    if (n.includes(t)) {
      results.push(d.name);
      continue;
    }

    const words = t.split(" ").filter(Boolean);
    const matchedWords = words.filter(w => n.includes(w));
    if (matchedWords.length >= 1) {
      results.push(d.name);
    }
  }

  return [...new Set(results)];
}

function buildTopicProfile(topic, nfpa, format) {
  const t = topic.toLowerCase();

  const base = {
    learningOutcomes: [
      `The learner will be able to explain the operational purpose of ${topic}.`,
      `The learner will be able to identify hazards, controls, and expected performance related to ${topic}.`,
      `The learner will be able to demonstrate or describe topic-specific performance consistent with ${nfpa}.`
    ],
    jprs: [
      `${nfpa} topic-aligned job performance requirements related to ${topic}.`,
      `Applicable knowledge, skills, safety controls, and performance outcomes relevant to ${topic}.`
    ],
    teachingAids: [
      "Computer and projector",
      "Applicable PPE and operational equipment",
      "Department reference documents where available"
    ],
    intro: [
      `This lesson is designed to address ${topic} in alignment with ${nfpa}.`,
      `The learner will review relevant hazards, expected performance, and operational considerations before application or testing.`
    ],
    outline: [
      `Review topic fundamentals for ${topic}.`,
      `Identify hazards, controls, and role assignments.`,
      `Demonstrate the expected sequence or operational method.`,
      `Complete practical application or guided review.`,
      `Debrief performance, common errors, and safety considerations.`
    ],
    application: [
      `The learner will be evaluated through instructor observation, questioning, and practical application related to ${topic}.`
    ],
    notes: [
      "Use uploaded department reference documents where applicable.",
      "Adjust level of detail to the learner group, equipment, and local procedures."
    ],
    skillSteps: [
      `Identify the equipment and safety requirements for ${topic}.`,
      `Complete the topic-specific setup or preparatory steps.`,
      `Perform ${topic} using the correct sequence and safe work practices.`,
      `Communicate effectively and maintain scene or operational safety.`,
      `Complete the task to instructor standard.`
    ]
  };

  if (t.includes("confined")) {
    base.learningOutcomes = [
      "The learner will be able to identify confined space hazards and atmospheric concerns.",
      "The learner will be able to select PPE, monitoring, and support equipment for confined space operations.",
      "The learner will be able to apply safe entry, support, or rescue-related actions consistent with the selected standard."
    ];
    base.outline = [
      "Review confined space definitions, hazards, and control measures.",
      "Review atmospheric monitoring, ventilation, and communications.",
      "Review team roles, entry control, and emergency procedures.",
      "Complete practical setup and task-specific application.",
      "Debrief hazards, findings, and performance."
    ];
  }

  if (t.includes("rope")) {
    base.learningOutcomes = [
      "The learner will be able to identify rope rescue hazards and system safety considerations.",
      "The learner will be able to describe or demonstrate appropriate rope rescue equipment use.",
      "The learner will be able to apply safe rope rescue practices related to the selected topic."
    ];
    base.outline = [
      "Review rope rescue hazards, equipment, and safety checks.",
      "Review anchor, system, and team considerations.",
      "Demonstrate the selected rope rescue skill or concept.",
      "Complete practical application and corrective coaching.",
      "Debrief system efficiency, communication, and safety."
    ];
  }

  if (t.includes("swift") || t.includes("water") || t.includes("ice")) {
    base.learningOutcomes = [
      "The learner will be able to assess water-related hazards and environmental conditions.",
      "The learner will be able to identify PPE, rescue tools, and safety considerations for the selected topic.",
      "The learner will be able to apply safe movement, support, or rescue practices appropriate to the selected standard."
    ];
    base.outline = [
      "Review water or ice conditions, hazards, and survivability factors.",
      "Review PPE, rescue options, and team roles.",
      "Demonstrate the selected shore-based, support, or practical skill.",
      "Complete practical evolutions and instructor feedback.",
      "Debrief tactics, safety controls, and performance."
    ];
  }

  if (t.includes("standpipe") || t.includes("hose") || t.includes("fire attack")) {
    base.learningOutcomes = [
      "The learner will be able to identify equipment and operational considerations for the selected fireground topic.",
      "The learner will be able to describe or demonstrate the correct setup and deployment sequence.",
      "The learner will be able to apply safe and effective operational performance consistent with the selected standard."
    ];
    base.outline = [
      "Review equipment, purpose, and deployment sequence.",
      "Review hazards, communications, and role assignments.",
      "Demonstrate the selected fireground skill or procedure.",
      "Complete practical application and performance feedback.",
      "Debrief key operational points and safety considerations."
    ];
  }

  if (t.includes("leadership") || t.includes("officer") || nfpa === "NFPA 1021") {
    base.learningOutcomes = [
      "The learner will be able to describe leadership and supervisory expectations related to the selected topic.",
      "The learner will be able to apply communication, decision-making, and accountability principles.",
      "The learner will be able to demonstrate understanding consistent with company officer responsibilities."
    ];
    base.outline = [
      "Review the purpose and relevance of the selected officer topic.",
      "Discuss decision-making, communication, and accountability expectations.",
      "Work through guided application or scenario-based discussion.",
      "Review common errors, corrective actions, and supervisory considerations.",
      "Debrief takeaways and practical application."
    ];
  }

  if (format === "Detailed") {
    base.notes.push("Detailed format selected: include deeper instructor guidance, expanded discussion points, and practical emphasis.");
  } else {
    base.notes.push("Simple format selected: keep delivery concise and focused on core performance and safety points.");
  }

  return base;
}

function buildLessonPlanOutput(topic, nfpa, duration, format, instructor, location, refs) {
  const p = buildTopicProfile(topic, nfpa, format);
  const instructorText = instructor || (currentUser?.email || "TBD");
  const locationText = location || "TBD";
  const levelInstruction = format === "Detailed" ? "No aid from instructor" : "Aid from instructor";
  const environment = format === "Detailed" ? "Simulated / Controlled" : "Controlled";
  const referencesText = refs.length ? refs.map(r => `- ${r}`).join("\n") : "- No uploaded reference documents matched";

  return `BRAMPTON FIRE & EMERGENCY SERVICES LESSON PLAN

DATE: ${todayString()}
INSTRUCTOR: ${instructorText}
SUBJECT: ${topic}
Location: ${locationText}
TOTAL TIME: ${duration}

LEARNING OUTCOME(S):
${p.learningOutcomes.map(x => `- ${x}`).join("\n")}

ESTIMATED TIME:
${duration}

Level of Instruction:
${levelInstruction}

Environment:
${environment}

JPR(s):
${p.jprs.map(x => `- ${x}`).join("\n")}

Teaching Aids:
${p.teachingAids.map(x => `- ${x}`).join("\n")}

INTRODUCTION:
${p.intro.map(x => `- ${x}`).join("\n")}

LESSON OUTLINE:
${p.outline.map(x => `- ${x}`).join("\n")}

APPLICATION & TEST:
${p.application.map(x => `- ${x}`).join("\n")}

NOTES:
${p.notes.map(x => `- ${x}`).join("\n")}

REFERENCES:
${referencesText}
- ${nfpa}`;
}

function buildSkillSheetOutput(topic, nfpa, format, refs) {
  const p = buildTopicProfile(topic, nfpa, format);
  const referencesText = refs.length ? refs.map(r => `- ${r}`).join("\n") : "- No uploaded reference documents matched";

  return `BFES JOB PERFORMANCE REQUIREMENT SKILL SHEET

Standard: ${nfpa}
Title: ${topic}

JPR:
${p.jprs.map(x => `- ${x}`).join("\n")}

Skill Performance:
${p.skillSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")}

Candidate Name:
Date:
Candidate Signature:

Evaluator Name:

1st Attempt:
Pass / Fail

2nd Attempt:
Pass / Fail / N/A

REFERENCES:
${referencesText}
- ${nfpa}`;
}

function generate() {
  const nfpa = byId("nfpa").value;
  const duration = byId("duration").value;
  const type = byId("type").value;
  const format = byId("format").value;
  const topic = byId("topic").value.trim();
  const instructor = byId("instructorName").value.trim();
  const location = byId("locationName").value.trim();

  if (!topic) {
    byId("output").textContent = "Enter a topic";
    return;
  }

  const refs = docsLoaded ? extractRelevant(topic) : [];

  let output = "";
  if (type === "Lesson Plan") {
    output = buildLessonPlanOutput(topic, nfpa, duration, format, instructor, location, refs);
  } else {
    output = buildSkillSheetOutput(topic, nfpa, format, refs);
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
    const { data } = await supabaseClient.auth.getUser();
    const user = data.user || null;
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
