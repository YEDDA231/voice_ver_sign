"""
Voice Ver Sign — Text-to-Speech (TTS) Integration Blueprint.

This file serves as a placeholder for backend TTS synthesis. Offline TTS engines like pyttsx3
have been removed to keep deployment lightweight and portable.
"""

from __future__ import annotations

from typing import Optional


def synthesize_speech_base64(text: str) -> Optional[str]:
    """
    Stub for backend Text-to-Speech synthesis.
    
    Returns None by default, causing the frontend client to fall back to the native
    browser `speechSynthesis` API (which is zero-latency, zero-cost, and runs fully offline).
    
    If server-side TTS is needed in production, connect this function to a cloud TTS API 
    (e.g., ElevenLabs, Google Cloud Text-to-Speech, or OpenAI Audio) and return the base64-encoded
    audio data (WAV/MP3).
    """
    return None
