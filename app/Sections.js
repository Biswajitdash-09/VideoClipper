const STEPS = [
  [
    "Upload your video",
    "Choose a video you have the rights to use, up to 100 MB.",
  ],
  [
    "You pick the moment",
    "Preview your video and choose the part you want, 10 to 30 seconds.",
  ],
  ["Download your reel", "Get a vertical 9:16 clip, ready to post anywhere."],
];

const FAQS = [
  [
    "Which videos can I use?",
    "Only videos you own or have permission to use. You confirm this every time you make a reel.",
  ],
  [
    "How long is a reel?",
    "10, 15, 20, 25 or 30 seconds, your choice, in vertical 9:16.",
  ],
  [
    "Which part of my video is used?",
    "You do. Preview your video, set where the reel starts and how long it is. Picking the best moment automatically and adding captions are planned.",
  ],
  [
    "What does the free trial include?",
    "One reel per account. Reels that fail do not use it up.",
  ],
  [
    "How long are my reels kept?",
    "Not at all. Your reel is deleted from our servers as soon as it reaches you, so download it right away. Your uploaded video is deleted as soon as the reel is made.",
  ],
  [
    "What if my reel fails?",
    "You will see a message, and the reel is not counted against your free trial or your plan.",
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
          Sign in, upload a video and get your reel in about a minute.
        </p>
        <a className="try-cta" href="/dashboard">
          Make a reel
        </a>
      </section>

      <section className="sec" id="pricing" aria-labelledby="pricing-h">
        <h2 id="pricing-h">Start free, upgrade when you need more</h2>
        <div className="plans">
          <div className="plan">
            <h3>Free trial</h3>
            <p className="plan-price">1 reel</p>
            <ul>
              <li>Vertical 9:16, 720p</li>
              <li>10 to 30 seconds, the part you pick</li>
              <li>Deleted as soon as you download it</li>
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
        <span>
          <a href="/terms">Terms</a> · <a href="/takedown">Takedown requests</a>
        </span>
        <span>
          Built with love by Biswajit Dash ·{" "}
          <a href="mailto:biswajitdash929@gmail.com">
            biswajitdash929@gmail.com
          </a>
        </span>
      </footer>
    </>
  );
}
