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
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Stub response so the app is fully testable before a real API key is added
    return {
      diagnosis: "AI engine not connected yet — this is placeholder output. Add ANTHROPIC_API_KEY to your environment variables to enable real diagnoses.",
      steps: [
        { text: "Add your Anthropic API key to the server environment variables.", risk: "none" },
        { text: "Restart the server — real AI-generated solutions will appear after that.", risk: "none" }
      ],
      device_type: "unknown"
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: problemDescription }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content.map(b => b.text || '').join('').trim();
  const clean = text.replace(/^```json\s*|```$/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    // If the model didn't return clean JSON, wrap it as a single step
    return {
      diagnosis: "Here's what I found:",
      steps: [{ text, risk: "none" }],
      device_type: "unknown"
    };
  }
}
