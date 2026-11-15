import { Inter, Inter_Tight, Caveat } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--f-inter",
});
const tight = Inter_Tight({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--f-tight",
});
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--f-cav",
});

export const metadata = {
  title: "Reelmark — Captivate Crowds with Snackable Reels",
  description: "Short, snappy product clips by handpicked video makers.",
};

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${tight.variable} ${caveat.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
