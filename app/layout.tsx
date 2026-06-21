import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nation Wheel",
  description: "Multiplayer nation management — authentication & permissions foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
