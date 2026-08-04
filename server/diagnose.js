const SYSTEM_PROMPT = `You are QuickFixr, a friendly and highly competent PC/phone repair assistant.
A user will describe a problem with their computer or phone. Respond with:
1. A short, plain-English diagnosis of what's likely wrong (1-2 sentences).
2. A numbered, step-by-step solution, ordered from easiest/safest to more advanced.
3. If a step carries risk (data loss, voiding warranty, requires opening the device), flag it clearly in that step.
Keep steps concrete and actionable. Avoid vague advice like "check your settings" without specifying which ones.
Return your answer as JSON with this exact shape, and nothing else:
{
  "diagnosis": "string",
  "steps": [ { "text": "string", "risk": "none" | "moderate" | "advanced" } ],
  "device_type": "pc" | "phone" | "unknown"
}`;

export async function generateSolution(problemDescription) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Stub response so the app is fully testable before a real API key is added
    return {
      diagnosis: "AI engine not connected yet — this is placeholder output. Add GEMINI_API_KEY to your environment variables to enable real diagnoses.",
      steps: [
        { text: "Add your Gemini API key to the server environment variables.", risk: "none" },
        { text: "Restart the server — real AI-generated solutions will appear after that.", risk: "none" }
      ],
      device_type: "unknown"
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: problemDescription }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI service error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
  const clean = text.replace(/^```json\s*|```$/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    return {
      diagnosis: "Here's what I found:",
      steps: [{ text, risk: "none" }],
      device_type: "unknown"
    };
  }
}
