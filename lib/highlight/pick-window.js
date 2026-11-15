const endsSentence = (text) => /[.!?]["')\]]*$/.test(text.trim());
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// Picks the best 10-20s window from caption cues using a cheap heuristic (no LLM call):
// dense speech, starts at a sentence start, ends on a sentence end, has questions/emphasis.
export function pickWindow(cues, duration, { min = 10, max = 20 } = {}) {
  const fallback = () => {
    const length = Math.min(15, duration);
    const start = Math.max(0, Math.min(duration * 0.3, duration - length));
    return { start, end: start + length };
  };
  if (!cues.length || duration < min) return fallback();

  let best = null;
  cues.forEach((first, i) => {
    let words = 0;
    let text = "";
    for (let j = i; j < cues.length; j++) {
      const end = Math.min(cues[j].end, duration);
      const length = end - first.start;
      if (length > max) break;
      words += wordCount(cues[j].text);
      text += ` ${cues[j].text}`;
      if (length < min) continue;
      const score =
        words / length +
        (endsSentence(cues[j].text) ? 1 : 0) +
        (i === 0 || endsSentence(cues[i - 1].text) ? 1 : 0) +
        (/[?!]/.test(text) ? 0.5 : 0);
      if (!best || score > best.score)
        best = { start: first.start, end, score };
    }
  });
  return best ? { start: best.start, end: best.end } : fallback();
}
