import "../styles/styles.css";
import NavBar from '../components/NavBar';

export const metadata = {
  title: 'Translation App',
  description: 'Translate, transcribe, summarize',
};

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <NavBar />
        <main style={{ 
          padding: '1rem', // padding between navbar and page content
        }}>
          {children}
        </main>
      </body>
    </html>
  );
}