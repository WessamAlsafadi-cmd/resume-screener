'use client';

import { useState } from 'react';

export default function Home() {
  const [jobDescription, setJobDescription] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalyzing, setCurrentAnalyzing] = useState('');
  const [pythonServiceUrl] = useState(process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:5000');

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles(files);
  };

  const extractTextFromFile = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${pythonServiceUrl}/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Text extracted using ${result.method} for ${file.name}`);
        return result.text;
      } else {
        console.error(`❌ Text extraction failed for ${file.name}:`, result.error);
        return result.text || `Failed to extract text from ${file.name}. ${result.error || 'Unknown error'}`;
      }
    } catch (error) {
      console.error(`❌ Network error extracting text from ${file.name}:`, error);
      
      // Fallback error message that's more informative
      return `Failed to extract text from ${file.name}. Please ensure the PDF extraction service is running and accessible. Error: ${error.message}`;
    }
  };

  const analyzeResume = async (resumeText, jobDesc, fileName) => {
    // Check if the text extraction failed
    if (resumeText.includes('Failed to extract text') || resumeText.includes('Unable to extract text')) {
      return JSON.stringify({
        candidate_name: "Unknown",
        score: "Error - Text Extraction Failed",
        reason: resumeText.substring(0, 200) + "..." // Truncate long error messages
      });
    }

    // Check if we got minimal content (likely extraction failed)
    if (resumeText.trim().length < 50) {
      return JSON.stringify({
        candidate_name: "Unknown",
        score: "Error - Insufficient Content",
        reason: `The extracted text from ${fileName} appears to be too short or empty. This might be due to a PDF that contains only images, is password-protected, or has extraction issues.`
      });
    }

    const prompt = `
Compare this resume to the following job description and provide a detailed analysis:

Job Description:
${jobDesc}

Resume (File: ${fileName}):
${resumeText}

IMPORTANT: Only analyze the actual content provided. If the resume content seems incomplete or problematic, mention this in your analysis.

Please analyze the candidate's qualifications and return the result strictly in valid JSON format with the following keys:
- candidate_name (string, extract from resume if possible, otherwise "Unknown")
- score (one of: "Not Qualified", "Average", "Good", "Excellent", "Overqualified")
- reason (string, maximum 3 sentences explaining the score)

Focus on:
- Relevant skills and experience
- Education alignment
- Years of experience
- Technical competencies
- Overall fit for the role

If the resume content appears incomplete or problematic, reflect this in your scoring and reasoning.
`;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('Error analyzing resume:', error);
      return JSON.stringify({
        candidate_name: "Unknown",
        score: "Error - Analysis Failed",
        reason: "Failed to analyze resume due to AI service error: " + error.message
      });
    }
  };

  const checkPythonService = async () => {
    try {
      const response = await fetch(`${pythonServiceUrl}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  };

  const handleAnalyzeResumes = async () => {
    if (!jobDescription.trim()) {
      alert('Please enter a job description first.');
      return;
    }

    if (uploadedFiles.length === 0) {
      alert('Please upload at least one resume.');
      return;
    }

    // Check if Python service is available
    const serviceAvailable = await checkPythonService();
    if (!serviceAvailable) {
      alert(`Cannot connect to the PDF extraction service at ${pythonServiceUrl}. Please ensure the Python service is running.`);
      return;
    }

    setIsAnalyzing(true);
    setResults([]);

    const newResults = [];

    for (const file of uploadedFiles) {
      setCurrentAnalyzing(file.name);

      // Extract text using Python service
      const resumeText = await extractTextFromFile(file);

      // Analyze the resume
      const rawResult = await analyzeResume(resumeText, jobDescription, file.name);

      let parsed;
      try {
        // Clean up the response in case there's extra text before/after JSON
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : rawResult;
        parsed = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        parsed = {
          candidate_name: "Unknown",
          score: "Error - JSON Parse Failed",
          reason: "Failed to parse AI response. This might indicate an issue with the analysis service."
        };
      }

      newResults.push({
        fileName: file.name,
        candidateName: parsed.candidate_name || "Unknown",
        score: parsed.score || "Unknown",
        reason: parsed.reason || "No reason provided"
      });
    }

    setResults(newResults);
    setIsAnalyzing(false);
    setCurrentAnalyzing('');
  };

  const downloadCSV = () => {
    if (results.length === 0) return;

    const headers = ['File Name', 'Candidate Name', 'Score', 'Reason'];
    const csvContent = [
      headers.join(','),
      ...results.map(row => [
        `"${row.fileName.replace(/"/g, '""')}"`,
        `"${row.candidateName.replace(/"/g, '""')}"`,
        `"${row.score.replace(/"/g, '""')}"`,
        `"${row.reason.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `resume_analysis_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setResults([]);
    setUploadedFiles([]);
  };

  const getScoreClass = (score) => {
    const normalizedScore = score.toLowerCase().replace(/\s+/g, '-');
    if (normalizedScore.includes('error')) return 'score-error';
    switch (normalizedScore) {
      case 'excellent': return 'score-excellent';
      case 'good': return 'score-good';
      case 'average': return 'score-average';
      case 'not-qualified': return 'score-not-qualified';
      case 'overqualified': return 'score-overqualified';
      default: return 'score-error';
    }
  };

  return (
    <div className="main-container">
      <main className="content-wrapper">
        <div className="header">
          <h1 className="main-title">
            🤖 AI Resume Screener
          </h1>
          <p className="subtitle">
            Intelligent resume analysis with robust PDF extraction
          </p>
        </div>

        <div className="service-info">
          <div>
            🔧 Python Service: {pythonServiceUrl}
          </div>
        </div>

        <div className="card">
          <label htmlFor="jobDescription" className="label">
            📋 Job Description
          </label>
          <textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the complete job description here... Include requirements, responsibilities, and qualifications."
            className="textarea"
            rows={8}
          />
          <div className="char-counter">
            {jobDescription.length} characters
          </div>
        </div>

        <div className="card">
          <label htmlFor="fileUpload" className="label">
            📄 Upload Resumes
          </label>
          <div className="upload-area">
            <input
              type="file"
              id="fileUpload"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={handleFileUpload}
              className="file-input"
            />
            <div>
              <div className="upload-icon">⬆️</div>
              <p className="upload-text">
                Drop files here or click to browse
              </p>
              <small className="upload-subtext">Supports PDF, DOCX, and TXT files</small>
              <small className="upload-subtext">✅ Enhanced PDF extraction with Python backend</small>
            </div>
          </div>
          
          {uploadedFiles.length > 0 && (
            <div className="file-list">
              <div className="file-list-header">
                <span>📁 {uploadedFiles.length} file(s) selected</span>
                <button 
                  onClick={() => setUploadedFiles([])} 
                  className="clear-btn"
                >
                  Clear All
                </button>
              </div>
              <ul style={{listStyle: 'none', padding: 0}}>
                {uploadedFiles.map((file, index) => (
                  <li key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="buttons-container">
          <button
            onClick={handleAnalyzeResumes}
            disabled={isAnalyzing || !jobDescription.trim() || uploadedFiles.length === 0}
            className="primary-btn"
          >
            {isAnalyzing ? (
              <>
                <span className="spinner">⏳</span>
                Analyzing {currentAnalyzing}...
              </>
            ) : (
              <>
                <span>🔍</span>
                Analyze Resumes
              </>
            )}
          </button>

          {results.length > 0 && (
            <button 
              onClick={clearResults} 
              className="secondary-btn"
            >
              🗑️ Clear Results
            </button>
          )}
        </div>

        {results.length > 0 && (
          <div className="results-section">
            <div className="results-header">
              <h2 className="results-title">📊 Analysis Results</h2>
              <div className="results-count">
                <span>{results.length} resumes analyzed</span>
              </div>
              <button 
                onClick={downloadCSV} 
                className="download-btn"
              >
                📥 Download CSV
              </button>
            </div>
            
            <div className="results-grid">
              {results.map((result, index) => (
                <div key={index} className="result-card">
                  <div className="result-header">
                    <h3 className="result-filename">
                      {result.fileName}
                    </h3>
                    <div className={`score-badge ${getScoreClass(result.score)}`}>
                      {result.score}
                    </div>
                  </div>
                  
                  <div>
                    <div className="candidate-info">
                      <strong>👤 Candidate:</strong> {result.candidateName}
                    </div>
                    
                    <div className="analysis-section">
                      <strong>💡 Analysis:</strong>
                      <p className="analysis-text">
                        {result.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}