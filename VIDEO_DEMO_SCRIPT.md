# 🎙️ Harbinger — 3-Minute Video Demo Voiceover Script

🎥 **Video File Created:** [`harbinger_demo_3min.mp4`](file:///Users/user/personal/hackathon/harbinger_demo_3min.mp4) (1080p HD, 1920x1080)  
🌐 **Live Platform:** [https://harbinger.antojoel.com](https://harbinger.antojoel.com)

---

## 🎧 Post-Processing Audio Timing Guide (3:00 Total)

Use this timestamped voiceover script to record your audio track. The video pacing includes pauses so your voiceover flows naturally without rushing.

---

### **[0:00 - 0:25] Scene 1: The Problem & Hook (25s)**
- **Video Action:** Smooth view of the Landing / Login page. Mouse moves across headline and loop diagram.
- **Voiceover:**
  > *"Demurrage fees start ticking the moment a container's paperwork has a defect — a unit count mismatch or a missing certificate of origin. Traditional logistics software flags errors AFTER the container is already sitting stranded at port.
  > 
  > This is **Harbinger** — a predictive customs compliance engine that scores risk BEFORE you file, and grows a permanent immune memory graph from every real outcome."*

---

### **[0:25 - 0:55] Scene 2: Control Tower & Active Book (30s)**
- **Video Action:** Clicking "Continue as Guest". Landing on Control Tower. Mouse scrolls down the shipments table, hovering over status pills and risk badges.
- **Voiceover:**
  > *"We log into our operational Control Tower. Here, compliance teams monitor active shipments in real-time. 
  > 
  > Notice the hold risk indicators — each shipment is continuously scored against historical trade failure patterns, giving clear visibility into low, medium, and high-risk cargo before documentation is submitted to customs."*

---

### **[0:55 - 1:45] Scene 3: AI Document Extraction & Risk Prediction (50s)**
- **Video Action:** Clicking "+ Add Shipment" -> "Upload Documents". Selecting country `DE` and attaching 3 PDFs from `unit-mismatch/` (`commercial-invoice.pdf`, `packing-list.pdf`, `bill-of-lading.pdf`). Clicking "Extract & Simulate". Lands on Shipment Detail page showing 82% Hold Risk.
- **Voiceover:**
  > *"Instead of manual typing, we hand Harbinger raw trade documents directly. Gemini extracts unit counts and HS codes straight off the uncompressed PDFs in real-time.
  > 
  > Instantly, the engine flags an **82% Hold Risk** and provides a clear breakdown: the commercial invoice lists 500 units, but the packing list only contains 480 units. That's a 20-unit discrepancy, caught in seconds before filing."*

---

### **[1:45 - 2:20] Scene 4: Outcome Feedback & Graph Memory Growth (35s)**
- **Video Action:** Clicking "Record outcome", selecting "Held at customs", clicking "Confirm outcome". Navigating to Graph Explorer (`/graph`). Hovering over graph nodes & relationships.
- **Voiceover:**
  > *"When an outcome occurs, we record it back into the system. As we confirm the hold, watch our Neo4j Immune Memory graph — a new node and relationship animate live into the database.
  > 
  > Harbinger just learned a new rejection pattern. Future shipments with this exact discrepancy are now flagged automatically across the entire organization — no re-diagnosis needed."*

---

### **[2:20 - 2:45] Scene 5: Voice API & Integrations (25s)**
- **Video Action:** Navigating to `/integrations`. Hovering over Voice Query panel and MCP server streamable HTTP endpoint configuration.
- **Voiceover:**
  > *"Because Harbinger is built API-first, logistics operators can query shipment risk using natural voice commands. The underlying LLM combines graph facts with speech-to-text to deliver instant spoken answers."*

---

### **[2:45 - 3:00] Scene 6: Business ROI & Outro (15s)**
- **Video Action:** Navigating to `/pricing` page, then returning to the main dashboard.
- **Voiceover:**
  > *"Harbinger is priced against the cost it avoids — per-shipment protection for a fraction of a single demurrage penalty. 
  > 
  > Predict before filing. Remember every rejection. Live now at **harbinger.antojoel.com**."*
