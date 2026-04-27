import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collection Architect Agent",
  description: "Agente de arquitetura com IA — Collection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
