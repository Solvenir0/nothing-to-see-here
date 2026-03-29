// client/js/rendering/sound.js
// In-browser audio feedback for countdown and turn notifications.

import { state } from '../state.js';

export function playCountdownSound(secondsRemaining) {
    if (state.lastCountdownSecond === secondsRemaining) return;
    state.lastCountdownSecond = secondsRemaining;

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => playBeep(audioContext, secondsRemaining));
        } else {
            playBeep(audioContext, secondsRemaining);
        }
    } catch (error) {
        console.error('Audio context error:', error);
        playFallbackBeep(secondsRemaining);
    }
}

export function playBeep(audioContext, secondsRemaining) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

export function playFallbackBeep(secondsRemaining) {
    const audioData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmAbBj2Y2+/XfS4EOIX+/L1mHgU7k9H0wn0uBSGG5P+pYhQKT6jc84ZhNAU7k9H0wn0uBS';
    try {
        const audio = new Audio(audioData);
        audio.volume = 0.1;
        audio.play().catch(e => console.log('Fallback audio failed:', e));
    } catch (error) {
        console.error('Fallback audio error:', error);
    }
}

export function playTurnNotificationSound(phase) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => playTurnBeep(audioContext, phase));
        } else {
            playTurnBeep(audioContext, phase);
        }
    } catch (error) {
        console.error('Turn notification audio error:', error);
        playFallbackTurnBeep(phase);
    }
}

export function playTurnBeep(audioContext, phase) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (phase.includes('ban') || phase === 'egoBan') {
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(500, audioContext.currentTime + 0.15);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
    } else {
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.25);
    }
}

export function playFallbackTurnBeep(phase) {
    const audioData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmAbBj2Y2+/XfS4EOIX+/L1mHgU7k9H0wn0uBSGG5P+pYhQKT6jc84ZhNAU7k9H0wn0uBS';
    try {
        const audio = new Audio(audioData);
        audio.volume = 0.15;
        audio.play().catch(e => console.log('Turn notification audio failed:', e));
    } catch (error) {
        console.error('Fallback turn notification audio error:', error);
    }
}
