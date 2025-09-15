from flask import Flask, request, jsonify
from flask_cors import CORS
import PyPDF2
import pdfplumber
import pymupdf  # fitz
import docx2txt
import io
import logging

app = Flask(__name__)
CORS(app)  # Enable CORS for Next.js frontend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_with_pypdf2(pdf_bytes):
    """Extract text using PyPDF2 - good for simple PDFs"""
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        
        return text.strip()
    except Exception as e:
        logger.warning(f"PyPDF2 extraction failed: {e}")
        return None

def extract_with_pdfplumber(pdf_bytes):
    """Extract text using pdfplumber - better for complex layouts"""
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        text = ""
        
        with pdfplumber.open(pdf_file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        
        return text.strip()
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")
        return None

def extract_with_pymupdf(pdf_bytes):
    """Extract text using PyMuPDF - most robust option"""
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        doc = pymupdf.open(stream=pdf_file, filetype="pdf")
        text = ""
        
        for page_num in range(doc.page_count):
            page = doc[page_num]
            text += page.get_text() + "\n"
        
        doc.close()
        return text.strip()
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed: {e}")
        return None

def extract_pdf_text(pdf_bytes):
    """
    Try multiple PDF extraction methods in order of reliability
    Returns the first successful extraction or an error message
    """
    extraction_methods = [
        ("PyMuPDF", extract_with_pymupdf),
        ("pdfplumber", extract_with_pdfplumber),
        ("PyPDF2", extract_with_pypdf2)
    ]
    
    for method_name, extraction_func in extraction_methods:
        logger.info(f"Trying {method_name} for PDF extraction...")
        text = extraction_func(pdf_bytes)
        
        if text and len(text.strip()) > 50:  # Ensure we got meaningful content
            logger.info(f"Successfully extracted text using {method_name}")
            return {
                "success": True,
                "text": text,
                "method": method_name
            }
    
    logger.error("All PDF extraction methods failed")
    return {
        "success": False,
        "text": "Unable to extract text from PDF. The file may be corrupted, password-protected, or contain only images.",
        "method": "none"
    }

def extract_docx_text(docx_bytes):
    """Extract text from DOCX files"""
    try:
        docx_file = io.BytesIO(docx_bytes)
        text = docx2txt.process(docx_file)
        return {
            "success": True,
            "text": text.strip(),
            "method": "docx2txt"
        }
    except Exception as e:
        logger.error(f"DOCX extraction failed: {e}")
        return {
            "success": False,
            "text": f"Unable to extract text from DOCX file: {str(e)}",
            "method": "none"
        }

@app.route('/extract', methods=['POST'])
def extract_text():
    """
    Extract text from uploaded PDF or DOCX files
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "No file provided"
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                "success": False,
                "error": "No file selected"
            }), 400
        
        # Read file bytes
        file_bytes = file.read()
        file_type = file.content_type
        filename = file.filename.lower()
        
        logger.info(f"Processing file: {file.filename} ({file_type})")
        
        # Determine file type and extract accordingly
        if file_type == 'application/pdf' or filename.endswith('.pdf'):
            result = extract_pdf_text(file_bytes)
        elif (file_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
              or filename.endswith('.docx')):
            result = extract_docx_text(file_bytes)
        elif file_type == 'text/plain' or filename.endswith('.txt'):
            result = {
                "success": True,
                "text": file_bytes.decode('utf-8', errors='ignore'),
                "method": "plain_text"
            }
        else:
            return jsonify({
                "success": False,
                "error": f"Unsupported file type: {file_type}. Please use PDF, DOCX, or TXT files."
            }), 400
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}"
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "PDF/DOCX Text Extraction Service"
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)