let docs=[];
let docsLoaded=false;

document.getElementById("docs").addEventListener("change", function(e){
docs=[];
docsLoaded=false;

let files = e.target.files;
let loadedCount = 0;

if(files.length===0){
document.getElementById("status").textContent="No documents loaded";
return;
}

for(let file of files){
let reader=new FileReader();

reader.onload=function(evt){
docs.push({
name:file.name,
content:evt.target.result.toLowerCase()
});

loadedCount++;

if(loadedCount===files.length){
docsLoaded=true;
document.getElementById("status").textContent=files.length + " documents ready";
}
};

reader.readAsText(file);
}
});

function extractRelevant(topic){
let results=[];
let t = topic.toLowerCase();

for(let d of docs){
if(d.content.includes(t)){
results.push(d.name);
}
}
return results;
}

function generate(){
let nfpa=document.getElementById("nfpa").value;
let dur=document.getElementById("duration").value;
let type=document.getElementById("type").value;
let format=document.getElementById("format").value;
let topic=document.getElementById("topic").value;

if(!topic){
document.getElementById("output").textContent="Enter a topic.";
return;
}

let refs = docsLoaded ? extractRelevant(topic) : [];

let refText = refs.length ? refs.join("\n") : "No matching documents";

let output="";

if(type==="Lesson Plan"){
output = `BFES LESSON PLAN

SUBJECT: ${topic}
NFPA: ${nfpa}
TIME: ${dur}

LEARNING OUTCOMES:
- Apply ${topic} safely
- Demonstrate competency per ${nfpa}

LESSON OUTLINE:
${format==="Detailed" ? "- Theory\n- Demonstration\n- Practical\n- Evaluation" : "- Overview\n- Practical\n- Review"}

APPLICATION:
Scenario-based evaluation

REFERENCES:
1. Department Docs:
${refText}

2. NFPA:
${nfpa}
`;
}else{
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

document.getElementById("output").textContent=output;
}

function exportPDF(){
const { jsPDF } = window.jspdf;
let doc=new jsPDF();
let text=document.getElementById("output").textContent;

if(!text){
alert("Generate content first");
return;
}

let lines=doc.splitTextToSize(text,180);
doc.text(lines,10,10);
doc.save("DrillForge.pdf");
}
