/// server.js — CleanLink Waste Management Platform 🌿

import express from "express";
import multer from "multer";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import pkg from "jspdf";     // ✅ This is the key import
const { jsPDF } = pkg;       // ✅ Extract jsPDF from the package


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // serve HTML, CSS, JS

// ✅ Database setup
const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { reports: [], ngos: [], staff: [] });
await db.read();
db.data ||= { reports: [], ngos: [], staff: [] };

// ✅ Seed default staff and NGOs if empty
if (!db.data.staff.length) {
  db.data.staff.push({
    id: "staff1",
    username: "staff",
    password: "password",
  });
}
if (!db.data.ngos.length) {
  db.data.ngos.push(
    { id: "ngo1", name: "GreenHope Foundation", contact: "greenhope@gmail.com" },
    { id: "ngo2", name: "Eco Warriors", contact: "eco.warriors@gmail.com" }
  );
}
await db.write();

// ✅ Ensure uploads folder exists
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Created upload folder:", uploadDir);
}

// ✅ Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

// ---------------------------------------------------------------------------
// 🧑‍💼 STAFF LOGIN — used by staff.html
// ---------------------------------------------------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const staff = db.data.staff.find(
      (s) => s.username === username && s.password === password
    );

    if (!staff) {
      return res
        .status(401)
        .json({ ok: false, message: "Invalid username or password" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    console.log(`✅ Staff login success: ${username}`);

    res.json({
      ok: true,
      staffId: staff.id,
      username: staff.username,
      token,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ ok: false, message: "Server error during login" });
  }
});

// ---------------------------------------------------------------------------
// 🧍 PUBLIC REPORT UPLOAD — used by report.html
// ---------------------------------------------------------------------------
app.post("/api/reports", upload.single("photo"), async (req, res) => {
  try {
    const { name, description, location, lat, lng } = req.body;

    if (!description)
      return res
        .status(400)
        .json({ ok: false, message: "Description is required" });

    const report = {
      id: Date.now().toString(),
      reporterName: name || "Anonymous",
      description,
      location,
      lat: parseFloat(lat) || null,
      lng: parseFloat(lng) || null,
      image: req.file ? `/uploads/${req.file.filename}` : "",
      assignedTo: null,
      status: "unassigned",
      createdAt: new Date().toISOString(),
    };

    db.data.reports.push(report);
    await db.write();

    console.log("🆕 New report added:", report.description);
    res.json({ ok: true, report });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({
      ok: false,
      message: "Server error while uploading report",
      error: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// 📋 GET ALL REPORTS — used by staff dashboard map
// ---------------------------------------------------------------------------
app.get("/api/reports", async (req, res) => {
  try {
    res.json(db.data.reports);
  } catch (err) {
    console.error("❌ Fetch reports error:", err);
    res.status(500).json({ ok: false, message: "Error fetching reports" });
  }
});

// ---------------------------------------------------------------------------
// 🏢 GET ALL NGOs — used by staff.html
// ---------------------------------------------------------------------------
app.get("/api/ngos", async (req, res) => {
  try {
    res.json(db.data.ngos);
  } catch (err) {
    console.error("❌ Fetch NGOs error:", err);
    res.status(500).json({ ok: false, message: "Error fetching NGOs" });
  }
});

// ---------------------------------------------------------------------------
// 🙋 VOLUNTEER REGISTRATION
// ---------------------------------------------------------------------------
app.post("/api/volunteers", async (req, res) => {
  const { name, email, phone, area, availability } = req.body;
  if (!name || !email || !phone)
    return res.json({ ok: false, message: "All required fields missing" });

  const volunteer = {
    id: Date.now().toString(),
    name,
    email,
    phone,
    area,
    availability,
    joinedAt: new Date().toISOString(),
  };

  db.data.volunteers ||= [];
  db.data.volunteers.push(volunteer);
  await db.write();

  console.log("🙋 New Volunteer Registered:", name);
  res.json({ ok: true, volunteer });
});

// ---------------------------------------------------------------------------
// 📋 GET ALL VOLUNTEERS (for staff view)
// ---------------------------------------------------------------------------
app.get("/api/volunteers", async (req, res) => {
  res.json(db.data.volunteers || []);
});


// ---------------------------------------------------------------------------
// 🧑‍💼 ASSIGN REPORT TO NGO — staff assigns reports
// ---------------------------------------------------------------------------
app.post("/api/reports/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { ngoId, staffId } = req.body;

    const report = db.data.reports.find((r) => r.id === id);
    const ngo = db.data.ngos.find((n) => n.id === ngoId);

    if (!report || !ngo)
      return res.status(400).json({ ok: false, message: "Invalid report or NGO" });

    report.assignedTo = ngo.name;
    report.status = "assigned";
    report.assignedBy = staffId;
    report.assignedAt = new Date().toISOString();

    await db.write();
    console.log(`📦 Report ${id} assigned to ${ngo.name}`);
    res.json({ ok: true, report });
  } catch (err) {
    console.error("❌ Assign error:", err);
    res.status(500).json({ ok: false, message: "Error assigning report" });
  }
});

// ---------------------------------------------------------------------------
// ✅ MARK REPORT AS COMPLETED — staff marks cleanup done
// ---------------------------------------------------------------------------
app.post("/api/reports/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const report = db.data.reports.find((r) => r.id === id);
    if (!report)
      return res.status(404).json({ ok: false, message: "Report not found" });

    report.status = "completed";
    report.completedAt = new Date().toISOString();

    await db.write();
    console.log(`✅ Report ${id} marked as completed`);
    res.json({ ok: true, report });
  } catch (err) {
    console.error("❌ Complete error:", err);
    res.status(500).json({ ok: false, message: "Error completing report" });
  }
});

// ---------------------------------------------------------------------------
// 🌐 DEFAULT ROUTE — loads homepage
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------------------------------------------------------------------------
// 🚀 START SERVER
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 🏅 GENERATE CERTIFICATE (PDF)
// ---------------------------------------------------------------------------

app.get("/api/certificate/:volunteerId", async (req, res) => {
  const { volunteerId } = req.params;
  const volunteer = (db.data.volunteers || []).find(v => v.id === volunteerId);
  if (!volunteer) return res.status(404).send("Volunteer not found");

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // 🌿 Light background
  pdf.setFillColor(255, 255, 245);
  pdf.rect(0, 0, 297, 210, "F");

  // 🟩 Decorative double border
  pdf.setDrawColor(0, 110, 45);
  pdf.setLineWidth(2.2);
  pdf.rect(10, 10, 277, 190); // outer border
  pdf.setLineWidth(0.7);
  pdf.rect(14, 14, 269, 182); // inner border

  // 🏢 Header - Organization Name
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0, 110, 45);
  pdf.setFontSize(14);
  pdf.text("CLEANLINK ORGANIZATION", 148.5, 35, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Connecting People for a Cleaner Planet", 148.5, 41, { align: "center" });

  // 🏷 Title
  pdf.setFont("times", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(0, 80, 30);
  pdf.text("CERTIFICATE OF APPRECIATION", 148.5, 70, { align: "center" });

  // Subtitle
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(80, 80, 80);
  pdf.setFontSize(13);
  pdf.text("This certificate is proudly awarded to", 148.5, 85, { align: "center" });

  // Volunteer Name
  pdf.setFont("times", "italic");
  pdf.setFontSize(26);
  pdf.setTextColor(0, 0, 0);
  pdf.text(volunteer.name.toUpperCase(), 148.5, 100, { align: "center" });

  // 📝 Certificate body
  pdf.setFont("times", "normal");
  pdf.setFontSize(14);
  pdf.setTextColor(50, 50, 50);
  const message = `for your exceptional dedication and volunteer service in supporting community waste management initiatives under CleanLink. Your selfless contribution has helped promote environmental sustainability and inspire others toward a cleaner, greener future.`;
  pdf.text(message, 40, 120, { maxWidth: 220, align: "center" });

  // 🗓 Date and Signature
  const today = new Date().toLocaleDateString();
  pdf.setFontSize(11);
  pdf.setTextColor(0, 100, 60);
  pdf.text(`Date: ${today}`, 35, 180);

  // Signature Line
  pdf.setDrawColor(0, 100, 45);
  pdf.line(220, 170, 275, 170);
  pdf.setFontSize(11);
  pdf.text("Authorized Signature", 247, 177, { align: "center" });

  // 🏢 Footer
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(10);
  pdf.setTextColor(90, 90, 90);
  pdf.text("CleanLink | Waste Management & Volunteer Platform", 148.5, 193, { align: "center" });

  // ✅ Optional Logo (uncomment if you have logo.png in public folder)
  // const logoPath = path.join(__dirname, "public/logo.png");
  // if (fs.existsSync(logoPath)) {
  //   const logo = fs.readFileSync(logoPath).toString("base64");
  //   pdf.addImage(`data:image/png;base64,${logo}`, "PNG", 138, 15, 22, 22);
  // }

  // Export PDF
  const fileName = `CleanLink_Certificate_${volunteer.name.replace(/\s+/g, "_")}.pdf`;
  const pdfData = pdf.output();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(Buffer.from(pdfData, "binary"));
});




app.listen(PORT, () => {
  console.log(`✅ CleanLink server running at http://localhost:${PORT}`);
});
