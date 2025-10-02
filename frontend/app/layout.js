import "../styles/styles.css";
import NavBar from '../components/NavBar';
import { LanguagesProvider } from "@/contexts/LanguagesContext";
import ToastProvider from "@/components/ToastProvider";

export const metadata = {
  title: 'Translation App',
  description: 'Translate, transcribe, summarize',
};

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <LanguagesProvider>

          <NavBar />
          <ToastProvider />
          <main
            style={{
              padding: "0 1rem", // 0 for top/bottom, 1rem for left/right
            }}
          >

            {children}
          </main>
        </LanguagesProvider>
      </body>
    </html>
  );
}