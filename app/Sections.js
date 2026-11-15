import TryForm from "./TryForm";

const STEPS = [
  [
    "Paste a link",
    "Drop in a YouTube link for a video you have the rights to use.",
  ],
  [
    "We pick the moment",
    "We read the captions and choose the strongest 10–20 seconds.",
  ],
  [
    "Download your reel",
    "Get a vertical, captioned clip, ready to post anywhere.",
  ],
];

const FAQS = [
  [
    "Which videos can I use?",
    "Only videos you own or have permission to use. You confirm this every time you make a reel.",
  ],
  ["How long is a reel?", "Between 10 and 20 seconds, in vertical 9:16."],
  [
    "How is the moment chosen?",
    "From the video's captions: we look for dense, complete sentences. If a video has no captions, we use a clip from the middle.",
  ],
  [
    "What does the free trial include?",
    "One reel per account. Reels that fail do not use it up.",
  ],
  [
    "How long are my reels kept?",
    "Reels are deleted after 7 days, so download yours before then.",
  ],
  [
    "Why did my link not work?",
    "Private, age-restricted and region-blocked videos cannot be processed. You will see the reason, and your free reel stays available.",
  ],
];

export default function Sections() {
  return (
    <>
      <section className="sec" id="how" aria-labelledby="how-h">
        <h2 id="how-h">From a long video to a reel in three steps</h2>
        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="step-n" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sec try" id="try" aria-labelledby="try-h">
        <h2 id="try-h">Make your first reel</h2>
        <p className="lede">
          Paste a link to check it. Reel creation opens soon.
        </p>
        <TryForm />
      </section>

      <section className="sec" id="pricing" aria-labelledby="pricing-h">
        <h2 id="pricing-h">Start free, upgrade when you need more</h2>
        <div className="plans">
          <div className="plan">
            <h3>Free trial</h3>
            <p className="plan-price">1 reel</p>
            <ul>
              <li>Vertical 9:16, 720p</li>
              <li>Burned-in captions</li>
              <li>Kept for 7 days</li>
            </ul>
          </div>
          <div className="plan plan-pro">
            <h3>Pro</h3>
            <p className="plan-price">Price at launch</p>
            <ul>
              <li>More reels every month</li>
              <li>Everything in the free trial</li>
              <li>Priority processing</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sec" id="faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions</h2>
        <div className="faq-list">
          {FAQS.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="foot">
        <span>Reelmark</span>
        <span>
          Only upload or link content you have the rights to. Rights holders can
          request removal at any time.
        </span>
      </footer>
    </>
  );
}
