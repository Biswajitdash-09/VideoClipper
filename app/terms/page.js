import Link from "next/link";

export const metadata = { title: "Terms | Reelmark" };

export default function Terms() {
  return (
    <main className="legal">
      <h1>Terms of use</h1>
      <p>
        Reelmark turns a video you upload into a short vertical reel. By using
        it you agree to the points below.
      </p>

      <h2>Your video</h2>
      <p>
        Only upload videos you own or have permission to use. You confirm this
        each time you make a reel, and you are responsible for what you upload
        and post.
      </p>

      <h2>How long we keep files</h2>
      <p>
        Your uploaded video is deleted as soon as your reel is made. Your reel
        is deleted as soon as you download it, so keep your copy. If something
        goes wrong, anything left over is deleted after 7 days.
      </p>

      <h2>Free reel and plans</h2>
      <p>
        Each account gets one free reel. A reel that fails is not counted. Paid
        plans renew monthly until you cancel from the billing page, and include
        a monthly number of reels.
      </p>

      <h2>Not allowed</h2>
      <p>
        Do not upload content that is illegal, that you do not have rights to,
        or that abuses the service. We may remove content and close accounts
        that do.
      </p>

      <h2>Removal requests</h2>
      <p>
        If you are a rights holder, see the{" "}
        <Link href="/takedown">takedown page</Link>.
      </p>

      <Link href="/">Back to the home page</Link>
    </main>
  );
}
