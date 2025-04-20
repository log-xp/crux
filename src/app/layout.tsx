import type { Metadata } from "next";
import "./globals.css"; // We'll create this next

export const metadata: Metadata = {
  title: "CruxTube Transcripts",
  description: "View YouTube video transcripts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
