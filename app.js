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

function safeChecked(id, fallback = false) {
  const el = byId(id);
  return el ? el.checked : fallback;
}

function includeFlags() {
  return {
    jpr: safeChecked("includeJpr", true),
    safety: safeChecked("includeSafety", true),
    notes: safeChecked("includeNotes", true),
    eval: safeChecked("includeEval", true),
    assignment: safeChecked("includeAssignment", false),
    references: safeChecked("includeReferences", true)
  };
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

async function extractTextFromFile(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return await file.text();
  }

  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str).join(" ");
      fullText += strings + "\n";
    }

    return fullText;
  }

  if (lower.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || "";
  }

  return "";
}

function chunkDocumentText(text) {
  if (!text) return [];

  const normalized = text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  const chunks = [];
  const jprBlocks = normalized.split(/(?=\b\d+\.\d+\.\d+\b)/g);

  if (jprBlocks.length > 1) {
    for (const block of jprBlocks) {
      const clean = block.replace(/\s+/g, " ").trim();
      if (clean.length < 40) continue;

      chunks.push({
        page_number: null,
        heading: null,
        subheading: null,
        content: clean
      });
    }

    return chunks;
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    if (para.length < 40) continue;

    chunks.push({
      page_number: null,
      heading: null,
      subheading: null,
      content: para
    });
  }

  return chunks;
}

function detectSectionType(text) {
  const lower = text.toLowerCase();

  if (
    /^\s*\d+\.\d+\.\d+/.test(lower) ||
    lower.includes("job performance requirement") ||
    lower.startsWith("the firefighter shall") ||
    lower.startsWith("the candidate shall")
  ) {
    return "jpr";
  }

  if (
    lower.includes("procedure") ||
    lower.includes("shall") ||
    lower.includes("must") ||
    lower.includes("step") ||
    lower.includes("sequence")
  ) {
    return "procedure";
  }

  if (
    lower.includes("safety") ||
    lower.includes("hazard") ||
    lower.includes("risk") ||
    lower.includes("warning")
  ) {
    return "safety";
  }

  return "general";
}

async function uploadDocuments() {
  if (!currentUser || !isAdmin(currentUser)) {
    setAdminStatus("Admin only");
    return;
  }

  const docsInput = byId("docs");
  const files = docsInput ? docsInput.files : null;

  if (!files || !files.length) {
    setAdminStatus("Choose at least one file");
    return;
  }

  setAdminStatus("Uploading and indexing...");

  let uploaded = 0;

  for (const file of files) {
    const path = `shared/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("reference-docs")
      .upload(path, file, { upsert: false });

    if (uploadError) {
      console.error(uploadError);
      setAdminStatus(`Upload failed: ${uploadError.message}`);
      return;
    }

    let extractedText = "";
    try {
      extractedText = await extractTextFromFile(file);
    } catch (extractErr) {
      console.error(extractErr);
      extractedText = "";
    }

    const { data: insertedDoc, error: dbError } = await supabaseClient
      .from("document_library")
      .insert({
        storage_path: path,
        filename: file.name,
        file_type: file.type || "",
        extracted_text: extractedText,
        uploaded_by: currentUser.id,
        title: file.name,
        parse_status: "processing"
      })
      .select()
      .single();

    if (dbError) {
      console.error(dbError);
      setAdminStatus(`Indexed file failed: ${dbError.message}`);
      return;
    }

    const chunks = chunkDocumentText(extractedText);

    if (chunks.length) {
      const sectionRows = chunks.map((chunk, index) => ({
        document_id: insertedDoc.id,
        page_number: chunk.page_number,
        heading: chunk.heading,
        subheading: chunk.subheading,
        section_type: detectSectionType(chunk.content),
        chunk_index: index,
        content: chunk.content,
        content_clean: chunk.content.toLowerCase().trim(),
        metadata_json: {}
      }));

      const { error: sectionError } = await supabaseClient
        .from("document_sections")
        .insert(sectionRows);

      if (sectionError) {
        console.error(sectionError);

        await supabaseClient
          .from("document_library")
          .update({
            parse_status: "error",
            parse_error: sectionError.message
          })
          .eq("id", insertedDoc.id);

        setAdminStatus(`Chunk insert failed: ${sectionError.message}`);
        return;
      }
    }

    await supabaseClient
      .from("document_library")
      .update({
        parse_status: "complete",
        parse_error: null
      })
      .eq("id", insertedDoc.id);

    uploaded += 1;
  }

  setAdminStatus(`${uploaded} file(s) uploaded and chunked`);
  docsInput.value = "";
  await loadStoredDocuments();
  await loadAdminFiles();
}

async function loadStoredDocuments() {
  const { data, error } = await supabaseClient
    .from("document_library")
    .select("filename, extracted_text, storage_path, file_type, uploaded_at")
    .order("uploaded_at", { ascending: false });

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

  docs = data.map(row => ({
    name: row.filename,
    content: row.extracted_text || "",
    storagePath: row.storage_path,
    fileType: row.file_type || ""
  }));

  docsLoaded = true;
}

async function loadAdminFiles() {
  if (!currentUser || !isAdmin(currentUser)) return;

  const listEl = byId("adminFilesList");
  if (!listEl) return;

  listEl.innerHTML = "Loading...";

  const { data, error } = await supabaseClient
    .from("document_library")
    .select("filename, storage_path, uploaded_at")
    .order("uploaded_at", { ascending: false });

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
    name.textContent = file.filename;

    const btn = document.createElement("button");
    btn.textContent = "Delete";
    btn.type = "button";
    btn.onclick = async function () {
      await deleteAdminFile(file.storage_path);
    };

    row.appendChild(name);
    row.appendChild(btn);
    listEl.appendChild(row);
  });
}

async function deleteAdminFile(storagePath) {
  if (!currentUser || !isAdmin(currentUser)) {
    setAdminStatus("Admin only");
    return;
  }

  setAdminStatus("Deleting...");

  const { error: storageError } = await supabaseClient.storage
    .from("reference-docs")
    .remove([storagePath]);

  if (storageError) {
    console.error(storageError);
    setAdminStatus(`Delete failed: ${storageError.message}`);
    return;
  }

  const { error: dbError } = await supabaseClient
    .from("document_library")
    .delete()
    .eq("storage_path", storagePath);

  if (dbError) {
    console.error(dbError);
    setAdminStatus(`Library delete failed: ${dbError.message}`);
    return;
  }

  setAdminStatus("File deleted");
  await loadStoredDocuments();
  await loadAdminFiles();
}

function durationBlocks(duration) {
  const map = {
    "30 minutes": ["Introduction", "Core topic points", "Short application", "Review"],
    "60 minutes": ["Introduction", "Topic instruction", "Demonstration", "Evaluation"],
    "2 hours": ["Introduction", "Topic instruction", "Demonstration", "Practical activity", "Debrief"],
    "4 hours": ["Introduction", "Instruction", "Demonstration", "Practical evolutions", "Debrief and evaluation"],
    "8 hours": ["Introduction", "Extended instruction", "Demonstration", "Multiple practical evolutions", "Debrief, evaluation, remediation"]
  };
  return map[duration] || map["60 minutes"];
}

function topicType(topic, nfpa, audienceType) {
  const t = topic.toLowerCase();

  if (t.includes("ladder")) return "ladders";
  if (t.includes("search")) return "search";
  if (t.includes("ventilation") || t.includes("vent")) return "ventilation";
  if (t.includes("confined")) return "confined-space";
  if (t.includes("rope")) return "rope";
  if (t.includes("swift") || t.includes("water") || t.includes("ice")) return "water";
  if (
    t.includes("standpipe") ||
    t.includes("hose") ||
    t.includes("fire attack") ||
    t.includes("forcible")
  ) return "fireground";
  if (t.includes("leadership") || t.includes("officer") || nfpa === "NFPA 1021" || audienceType === "Officer") return "officer";
  if (nfpa === "NFPA 1041" || audienceType === "Instructor") return "instruction";
  return "general";
}

function detailedProcedureSteps(topic, deliveryStyle, depth, audienceType, nfpa) {
  const kind = topicType(topic, nfpa, audienceType);

  let steps = [
    `Review the purpose, scope, and expected outcome for ${topic}.`,
    "Confirm instructor assignments, learner grouping, and available resources.",
    "Complete a safety briefing before any demonstration or practical activity begins.",
    "Confirm all equipment, PPE, props, and reference material are ready for use."
  ];

  if (kind === "ladders") {
    steps = steps.concat([
      "Identify ladder types, parts, and intended use before practical work begins.",
      "Inspect each ladder for defects, damage, and serviceability before placing it in service.",
      "Select the correct ladder for the target height, access point, and task objective.",
      "Demonstrate the correct carry for the ladder being used and maintain control while moving it.",
      "Demonstrate the correct raise method and maintain team communication throughout the raise.",
      "Place the ladder on a stable surface, check the climbing angle, and confirm secure top placement.",
      "For extension ladders, extend to the required working height and verify that the fly is locked.",
      "Mount, ascend, work from, dismount, and descend the ladder using safe climbing technique.",
      "Require each learner to repeat the carry, raise, placement, climb, and descent sequence under supervision.",
      "Evaluate safety, ladder control, angle, placement, climbing technique, and task completion."
    ]);
  } else if (kind === "search") {
    steps = steps.concat([
      "Identify the objective of the search, likely victim locations, and hazards that may affect survivability.",
      "Assign search team roles, entry point, orientation method, and communication expectations before entry.",
      "Demonstrate search techniques appropriate to the environment, including room coverage, wall contact, and team integrity.",
      "Emphasize door control, orientation, accountability, and radio benchmarks throughout the search.",
      "Demonstrate victim identification, victim contact, communication of findings, and removal priorities.",
      "Require learners to perform the search sequence under controlled conditions while maintaining crew integrity.",
      "Evaluate search pattern, communication, accountability, victim handling, and hazard awareness."
    ]);
  } else if (kind === "ventilation") {
    steps = steps.concat([
      "Review the purpose of ventilation and the fireground conditions that justify horizontal or vertical ventilation.",
      "Identify the chosen ventilation method, required tools, crew assignments, and communication with command.",
      "Demonstrate opening procedures, positioning, and coordination with suppression activities.",
      "Emphasize hazard control, structural assessment, flow path awareness, and timing.",
      "Require learners to perform the task under supervision and communicate benchmarks clearly.",
      "Evaluate tool use, positioning, coordination, and safety throughout the operation."
    ]);
  } else if (kind === "confined-space") {
    steps = steps.concat([
      "Identify the confined space hazards, potential atmospheric issues, and required control measures.",
      "Confirm monitoring equipment is functioning and demonstrate the required atmospheric testing sequence.",
      "Review communications, entry control, attendant responsibilities, and emergency procedures.",
      "Demonstrate the setup of retrieval, ventilation, monitoring, and access equipment as applicable.",
      "Walk learners through the sequence for safe entry, support, or rescue-related tasks.",
      "Have learners repeat the sequence step by step with instructor coaching and correction.",
      "Evaluate whether learners maintained control measures, communications, and scene safety throughout."
    ]);
  } else if (kind === "rope") {
    steps = steps.concat([
      "Identify hazards, edge issues, anchor considerations, and system safety concerns.",
      "Demonstrate equipment selection, pre-use checks, and assignment of team roles.",
      "Demonstrate the setup sequence for the selected rope system or procedure.",
      "Explain why each step occurs in that order and what could fail if done incorrectly.",
      "Have learners repeat the setup and operational sequence under instructor supervision.",
      "Stop at each critical checkpoint to verify anchors, connections, commands, and safety checks.",
      "Evaluate communication, teamwork, safety discipline, and operational control."
    ]);
  } else if (kind === "water") {
    steps = steps.concat([
      "Assess environmental conditions, hazards, flow, access, and survivability factors.",
      "Review PPE requirements, rescue options, team roles, and downstream/upstream safety considerations.",
      "Demonstrate the selected shore-based, support, or practical skill in the correct sequence.",
      "Explain where rescuers should position themselves and how hazards are managed throughout.",
      "Run learners through the skill repeatedly, correcting body position, communication, and technique.",
      "Emphasize scene control, rapid intervention considerations, and post-task debriefing."
    ]);
  } else if (kind === "fireground") {
    steps = steps.concat([
      "Identify the equipment and tactical purpose of the selected fireground task.",
      "Demonstrate setup, deployment, communications, and positioning in the correct order.",
      "Explain the operational reason for each step and the consequences of skipped steps.",
      "Have learners perform the full sequence under timed or coached conditions as appropriate.",
      "Reinforce safe body mechanics, accountability, PPE use, and coordination with team members.",
      "Evaluate both technical performance and safety compliance."
    ]);
  } else if (kind === "officer") {
    steps = steps.concat([
      "Explain the leadership or supervisory relevance of the selected topic.",
      "Walk through the decision-making process, communications, and accountability expectations.",
      "Use scenario prompts or guided discussion to apply the topic in realistic officer situations.",
      "Pause throughout to discuss risk control, priorities, and expected supervisory actions.",
      "Have learners explain what they would do, why they would do it, and how they would communicate it.",
      "Evaluate clarity of reasoning, communication, and consistency with officer-level expectations."
    ]);
  } else if (kind === "instruction") {
    steps = steps.concat([
      "Explain the instructional purpose, learning objective, and expected learner performance.",
      "Demonstrate how to organize the topic, present the material, and maintain control of the learning environment.",
      "Review safety oversight, learner engagement, evaluation methods, and corrective coaching.",
      "Have learners practice delivery, explanation, or evaluation tasks as appropriate.",
      "Debrief strengths, gaps, and recommended instructional improvements."
    ]);
  } else {
    steps = steps.concat([
      "Review the topic-specific hazards, sequence, and expected performance.",
      "Demonstrate the correct operational method in a clear step-by-step sequence.",
      "Have learners repeat the task with instructor oversight and correction.",
      "Evaluate completion, safety, and consistency with the selected standard."
    ]);
  }

  if (deliveryStyle === "Classroom") {
    steps.push("Keep the evolution discussion-based where needed, using visuals, examples, and guided questioning.");
  }

  if (deliveryStyle === "Practical") {
    steps.push("Allocate additional time to hands-on repetition, coaching, and observed performance.");
  }

  if (depth === "Detailed" || depth === "Very Detailed") {
    steps.push("Pause after each major stage to review why the step matters and what errors commonly occur there.");
  }

  if (depth === "Very Detailed") {
    steps.push("Document specific coaching points, corrective actions, and remediation expectations before final evaluation.");
  }

  return steps;
}

function commonErrors(topic, nfpa, audienceType) {
  const kind = topicType(topic, nfpa, audienceType);

  const base = [
    "Skipping safety checks or rushing the setup sequence.",
    "Poor communication between team members or instructors and learners.",
    "Incorrect sequencing of critical steps.",
    "Failure to reassess hazards after the task begins."
  ];

  if (kind === "ladders") {
    return base.concat([
      "Selecting the wrong ladder for the height or objective.",
      "Poor ladder control during the carry or raise.",
      "Incorrect climbing angle or weak top placement.",
      "Failing to verify fly locks or working height on extension ladders.",
      "Unsafe climbing, mounting, or dismounting technique."
    ]);
  }

  if (kind === "search") {
    return base.concat([
      "Losing orientation or failing to maintain crew integrity.",
      "Poor communication of benchmarks or victim findings.",
      "Incomplete room coverage or rushed search pattern.",
      "Failing to control doors or reassess hazards during the search."
    ]);
  }

  if (kind === "ventilation") {
    return base.concat([
      "Ventilating at the wrong time or without coordination.",
      "Poor positioning or unsafe work area control.",
      "Failure to assess structural stability or flow path impact."
    ]);
  }

  if (kind === "confined-space") {
    return base.concat([
      "Incomplete atmospheric monitoring or failure to communicate readings.",
      "Weak attendant control or unclear emergency procedures.",
      "Inadequate control of access, retrieval, or ventilation setup."
    ]);
  }

  if (kind === "rope") {
    return base.concat([
      "Missed system safety checks or incomplete connection verification.",
      "Poor anchor selection or lack of edge control.",
      "Weak command discipline during system movement."
    ]);
  }

  if (kind === "water") {
    return base.concat([
      "Poor positioning relative to hazards, current, or rescue path.",
      "Failure to maintain downstream or upstream safety awareness.",
      "Weak communication in noisy or dynamic environments."
    ]);
  }

  if (kind === "fireground") {
    return base.concat([
      "Improper equipment setup or poor deployment order.",
      "Unsafe body position or weak crew coordination.",
      "Task focus without adequate accountability or scene awareness."
    ]);
  }

  if (kind === "officer") {
    return base.concat([
      "Unclear priorities or weak supervisory communication.",
      "Failure to justify decisions or control the incident/problem.",
      "Inadequate accountability, follow-up, or documentation."
    ]);
  }

  if (kind === "instruction") {
    return base.concat([
      "Weak learner engagement or poor pacing.",
      "Failing to correct unsafe learner actions immediately.",
      "Inadequate evaluation of learner performance."
    ]);
  }

  return base;
}

function correctiveActions(topic, nfpa, audienceType) {
  const kind = topicType(topic, nfpa, audienceType);

  const base = [
    "Stop the evolution at the point of error and restate the expected sequence.",
    "Have the learner repeat the step correctly before moving on.",
    "Use instructor demonstration to reinforce the correct method.",
    "Confirm the learner can explain why the corrected step matters."
  ];

  if (kind === "ladders") {
    return base.concat([
      "Repeat the carry, raise, and placement sequence until ladder control is consistent.",
      "Recheck angle, footing, top placement, and fly locks before allowing the learner to continue.",
      "Require the learner to remount and reclimb using correct technique before final evaluation."
    ]);
  }

  if (kind === "search") {
    return base.concat([
      "Repeat the search pattern slowly until orientation and room coverage are consistent.",
      "Require the crew to communicate benchmarks and victim findings clearly before progressing.",
      "Re-run the evolution with emphasis on crew integrity, door control, and accountability."
    ]);
  }

  if (kind === "confined-space") {
    return base.concat([
      "Re-run monitoring, communications, and attendant responsibilities until consistent.",
      "Repeat emergency procedure review before allowing progression."
    ]);
  }

  if (kind === "rope") {
    return base.concat([
      "Require a full system safety check before restarting the evolution.",
      "Repeat anchor, edge, and command portions until consistent."
    ]);
  }

  if (kind === "water") {
    return base.concat([
      "Reposition personnel and repeat communication/control steps.",
      "Repeat movement or rescue tasks with slower coached progression."
    ]);
  }

  return base;
}

function evaluationSequence(topic, nfpa, audienceType) {
  const kind = topicType(topic, nfpa, audienceType);

  if (kind === "ladders") {
    return [
      `Confirm the learner can explain the purpose, hazards, and safe use of ${topic}.`,
      "Observe whether the learner selects, inspects, carries, raises, and places the ladder correctly.",
      "Evaluate ladder angle, stability, extension height, fly lock confirmation, and climbing technique.",
      "Record whether performance met standard, required coaching, or required remediation.",
      "Debrief the learner on strengths, errors, and next improvement targets."
    ];
  }

  if (kind === "search") {
    return [
      `Confirm the learner can explain the purpose, hazards, and operational priorities of ${topic}.`,
      "Observe whether the learner maintains orientation, crew integrity, communication, and room coverage.",
      "Evaluate search pattern, benchmark communication, victim handling, and accountability.",
      "Record whether performance met standard, required coaching, or required remediation.",
      "Debrief the learner on strengths, errors, and next improvement targets."
    ];
  }

  return [
    `Confirm the learner can explain the purpose and safety considerations of ${topic}.`,
    "Observe whether the learner follows the correct sequence without skipping critical steps.",
    "Evaluate equipment use, communications, and hazard control throughout the evolution.",
    "Record whether performance met standard, required coaching, or required remediation.",
    "Debrief the learner on strengths, errors, and next improvement targets."
  ];
}

function assignmentItems(topic, nfpa, depth) {
  const items = [
    `Review the relevant points for ${topic} and summarize the key operational takeaways.`,
    `Identify how ${nfpa} applies to the selected topic in local operations or training.`
  ];

  if (depth === "Detailed" || depth === "Very Detailed") {
    items.push("Complete a written or verbal debrief identifying common errors, corrections, and safety controls.");
  }

  return items;
}

function scoreLine(line, topic) {
  const lower = line.toLowerCase();

  if (
    lower.includes("this text document") ||
    lower.includes("extracted text") ||
    lower.includes("includes the key") ||
    lower.includes("note:") ||
    lower.includes("copyright") ||
    lower.includes("all rights reserved") ||
    lower.includes("national fire protection association") ||
    lower.includes("notice and disclaimer")
  ) {
    return -1;
  }

  const topicLower = topic ? topic.toLowerCase() : "";

  let topicMatch = false;

  if (!topicLower) {
    topicMatch = true;
  } else if (topicLower.includes("search")) {
    topicMatch =
      lower.includes("search") ||
      lower.includes("rescue") ||
      lower.includes("victim");
  } else if (topicLower.includes("ladder")) {
    topicMatch = lower.includes("ladder");
  } else if (topicLower.includes("vent")) {
    topicMatch =
      lower.includes("ventilation") ||
      lower.includes("horizontal ventilation") ||
      lower.includes("vertical ventilation") ||
      lower.includes("vent");
  } else {
    topicMatch = lower.includes(topicLower);
  }

  if (!topicMatch) {
    return -1;
  }

  let score = 5;

  if (/\b\d+\.\d+\.\d+\b/.test(lower)) score += 3;
  if (lower.includes("jpr")) score += 2;
  if (lower.includes("job performance requirement")) score += 2;
  if (lower.includes("shall")) score += 2;
  if (lower.startsWith("the firefighter shall")) score += 2;
  if (lower.startsWith("the candidate shall")) score += 2;

  return score;
}

function findExactMatches(topic) {
  const jprMatches = [];
  const referenceMatches = [];

  for (const doc of docs) {
    const text = doc.content || "";
    if (!text) continue;

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (
        line.length > 400 ||
        lower.includes("copyright") ||
        lower.includes("all rights reserved") ||
        lower.includes("national fire protection association") ||
        lower.includes("notice and disclaimer")
      ) {
        continue;
      }

      const score = scoreLine(line, topic);
      if (score < 2) continue;

      const looksLikeJpr = /\b\d+\.\d+\.\d+\b/.test(lower);

      const item = {
        filename: doc.name,
        excerpt: line.replace(/^[-•\s]+/, "").trim(),
        score
      };

      if (looksLikeJpr) {
        jprMatches.push(item);
      } else {
        referenceMatches.push(item);
      }
    }
  }

  const dedupedJprs = dedupeMatches(jprMatches);
  const dedupedRefs = dedupeMatches(referenceMatches);

  const finalJprs = dedupedJprs
    .filter(item => item.score >= 2)
    .slice(0, 4);

  const finalRefs = dedupedRefs
    .filter(item => item.score >= 5)
    .slice(0, 5);

  return {
    jprs: finalJprs,
    references: finalRefs
  };
}

function dedupeMatches(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const key = `${item.filename}::${item.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function toTitleCase(text) {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildLessonPlanOutput(topic, nfpa, duration, format, depth, deliveryStyle, audienceType, instructor, location, matchData) {
  const flags = includeFlags();
  const topicLabel = toTitleCase(topic);
  const instructorText = instructor || (currentUser?.email || "TBD");
  const locationText = location || "TBD";
  const levelInstruction = format === "Detailed" ? "No aid from instructor" : "Aid from instructor";
  const environment = deliveryStyle === "Classroom"
    ? "Classroom / Controlled"
    : deliveryStyle === "Practical"
      ? "Simulated / Controlled"
      : "Mixed / Controlled";

  const procedureSteps = detailedProcedureSteps(topicLabel, deliveryStyle, depth, audienceType, nfpa);
  const errors = commonErrors(topicLabel, nfpa, audienceType);
  const corrections = correctiveActions(topicLabel, nfpa, audienceType);
  const evalSteps = evaluationSequence(topicLabel, nfpa, audienceType);

  let output = `BRAMPTON FIRE & EMERGENCY SERVICES LESSON PLAN

DATE: ${todayString()}
INSTRUCTOR: ${instructorText}
SUBJECT: ${topicLabel}
Location: ${locationText}
TOTAL TIME: ${duration}

STANDARDS:
- ${nfpa}

LEARNING OUTCOME(S):
- The learner will be able to explain the purpose, hazards, and expected performance related to ${topicLabel}.
- The learner will be able to complete the required sequence, controls, or practical actions for ${topicLabel} consistent with ${nfpa}.
- The learner will be able to demonstrate safe, organized, and effective performance appropriate to the selected audience and delivery style.

ESTIMATED TIME:
${durationBlocks(duration).map(x => `- ${x}`).join("\n")}

Level of Instruction:
${levelInstruction}

Guidance:
${depth}

Environment:
${environment}
`;

  if (flags.jpr) {
    output += `
JPR(s):
`;

    if (matchData.jprs.length) {
      output += `${matchData.jprs.map(x => `- ${x.excerpt.replace(/^[-•\s]+/, "")}`).join("\n")}\n`;
    } else {
      output += `- No exact JPR wording found in uploaded library.\n`;
    }
  }

  output += `
Teaching Aids:
- Computer and projector
- Whiteboard / markers
- Topic-specific equipment and PPE
- Training props, evolutions, or demo equipment as required
- Uploaded department reference material where available

INTRODUCTION:
- Introduce ${topicLabel} and explain why it matters operationally.
- Review the expected performance standard, learner responsibilities, and safety expectations.
- Explain how the lesson will progress from instruction to demonstration to evaluation.
- Identify what the learner must do correctly in order to meet the standard.
`;

  if (flags.references && matchData.references.length) {
    output += `
SUPPORTING REFERENCE EXCERPTS:
${matchData.references.map(x => `- ${x.excerpt.replace(/^[-•\s]+/, "")}`).join("\n")}
`;
  }

  output += `
LESSON OUTLINE:
${procedureSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;

  if (flags.safety) {
    output += `
SAFETY CONSIDERATIONS:
- Conduct a safety briefing before beginning any demonstration or practical activity.
- Confirm PPE, equipment readiness, control zones, communications, and stop-work authority.
- Reassess hazards continuously as the lesson progresses.
- Stop the evolution immediately if unsafe conditions, unsafe acts, or loss of control occur.
`;
  }

  if (depth === "Detailed" || depth === "Very Detailed") {
    output += `
COMMON ERRORS TO WATCH FOR:
${errors.map((x, i) => `${i + 1}. ${x}`).join("\n")}

CORRECTIVE ACTIONS:
${corrections.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;
  }

  if (flags.eval) {
    output += `
APPLICATION & TEST:
${evalSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;
  }

  if (flags.notes) {
    output += `
NOTES:
- Match the pace of the lesson to learner experience, available equipment, and training environment.
- Keep the instruction focused on the selected topic and avoid drifting into unrelated material.
- Reinforce why each step is completed in that order and what risk is created when steps are skipped.
- Use coaching pauses throughout the lesson to correct errors before evaluation.
`;
  }

  if (flags.assignment) {
    output += `
ASSIGNMENT:
${assignmentItems(topicLabel, nfpa, depth).map(x => `- ${x}`).join("\n")}
`;
  }

  if (flags.references) {
    output += `
REFERENCE EXCERPTS:
`;

    if (matchData.references.length) {
      output += `${matchData.references.map(x => `- ${x.filename} - "${x.excerpt.replace(/^[-•\s]+/, "")}"`).join("\n")}\n`;
    } else {
      output += `- No exact reference excerpt found in uploaded library.\n`;
    }
  }

  return output.trim();
}

function buildSkillSheetOutput(topic, nfpa, format, depth, deliveryStyle, audienceType, matchData) {
  const flags = includeFlags();
  const steps = detailedProcedureSteps(topic, deliveryStyle, depth, audienceType, nfpa);
  const errors = commonErrors(topic, nfpa, audienceType);
  const evalSteps = evaluationSequence(topic, nfpa, audienceType);

  let output = `BFES JOB PERFORMANCE REQUIREMENT SKILL SHEET

Standard:
- ${nfpa}

Title:
${topic}
`;

  if (flags.jpr) {
    output += `
JPR(s):
`;

    if (matchData.jprs.length) {
      output += `${matchData.jprs.map(x => `- ${x.excerpt.replace(/^[-•\s]+/, "")}`).join("\n")}\n`;
    } else {
      output += `- No exact JPR wording found in uploaded library.\n`;
    }
  }

  output += `
Skill Performance:
${steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;

  if (flags.safety) {
    output += `
Safety Considerations:
- Confirm PPE, equipment readiness, control zones, communications, and stop-work authority.
- Reassess hazards continuously during the evolution.
- Stop performance immediately if an unsafe act or unsafe condition is identified.
`;
  }

  if (depth === "Detailed" || depth === "Very Detailed") {
    output += `
Common Errors:
${errors.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;
  }

  if (flags.eval) {
    output += `
Evaluation Criteria:
${evalSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`;
  }

  output += `
Candidate Name:
Date:
Candidate Signature:

Evaluator Name:

1st Attempt:
Pass / Fail

2nd Attempt:
Pass / Fail / N/A
`;

  if (flags.notes) {
    output += `
Instructor Notes:
- Evaluate performance against sequence, safety, communication, and overall control.
- Require the learner to repeat incorrect steps correctly before marking performance complete.
`;
  }

  if (flags.references) {
    output += `
REFERENCE EXCERPTS:
`;

    if (matchData.references.length) {
      output += `${matchData.references.map(x => `- ${x.filename} - "${x.excerpt}"`).join("\n")}\n`;
    } else {
      output += `- No exact reference excerpt found in uploaded library.\n`;
    }
  }

  return output.trim();
}

function generate() {
  try {
    const nfpa = byId("nfpa").value;
    const duration = byId("duration").value;
    const type = byId("type").value;
    const format = byId("format").value;
    const topic = byId("topic").value.trim();
    const instructor = byId("instructorName") ? byId("instructorName").value.trim() : "";
    const location = byId("locationName") ? byId("locationName").value.trim() : "";

    const outputDepthEl = byId("outputDepth");
    const deliveryStyleEl = byId("deliveryStyle");
    const audienceTypeEl = byId("audienceType");

    const depth = outputDepthEl ? outputDepthEl.value : "Standard";
    const deliveryStyle = deliveryStyleEl ? deliveryStyleEl.value : "Mixed";
    const audienceType = audienceTypeEl ? audienceTypeEl.value : "Firefighter";

    if (!topic) {
      byId("output").textContent = "Enter a topic";
      return;
    }

    const matchData = docsLoaded ? findExactMatches(topic) : { jprs: [], references: [] };

    let output = "";
    if (type === "Lesson Plan") {
      output = buildLessonPlanOutput(
        topic,
        nfpa,
        duration,
        format,
        depth,
        deliveryStyle,
        audienceType,
        instructor,
        location,
        matchData
      );
    } else {
      output = buildSkillSheetOutput(
        topic,
        nfpa,
        format,
        depth,
        deliveryStyle,
        audienceType,
        matchData
      );
    }

    byId("output").textContent = output;
  } catch (err) {
    console.error(err);
    byId("output").textContent = "Generate failed. Check console.";
  }
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
  const signUpBtn = byId("signUpBtn");
  const signInBtn = byId("signInBtn");
  const signOutBtn = byId("signOutBtn");
  const generateBtn = byId("generateBtn");
  const exportPdfBtn = byId("exportPdfBtn");
  const uploadDocsBtn = byId("uploadDocsBtn");

  if (signUpBtn) signUpBtn.addEventListener("click", signUp);
  if (signInBtn) signInBtn.addEventListener("click", signIn);
  if (signOutBtn) signOutBtn.addEventListener("click", signOutUser);
  if (generateBtn) generateBtn.addEventListener("click", generate);
  if (exportPdfBtn) exportPdfBtn.addEventListener("click", exportPDF);
  if (uploadDocsBtn) uploadDocsBtn.addEventListener("click", uploadDocuments);
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
