#!/usr/bin/env python3
"""
Backend startup script
Run this from the backend directory: python run.py
Or from root: python -m backend.run
"""
import sys
import os

# Ensure project root is on sys.path so absolute imports like backend.* resolve.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if __name__ == "__main__":
    import uvicorn
    from backend.main import app
    
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
