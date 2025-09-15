// next.config.js - Updated version for Next.js 15
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle canvas for PDF.js
    config.resolve.alias.canvas = false;
    
    // Handle PDF.js worker
    config.resolve.alias['pdfjs-dist/build/pdf.worker.entry'] = 'pdfjs-dist/build/pdf.worker.min.js';
    
    return config;
  },
  // Remove experimental options that cause Turbopack issues
}

module.exports = nextConfig