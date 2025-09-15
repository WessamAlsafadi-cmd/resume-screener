import './globals.css'

export const metadata = {
  title: 'AI Resume Screener',
  description: 'Intelligent resume analysis with robust PDF extraction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}