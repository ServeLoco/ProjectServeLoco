import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeAdminOrderEvents } from '../api';
import './GlobalOrderAlert.css';

export default function GlobalOrderAlert() {
  const [alerts, setAlerts] = useState([]);
  const navigate = useNavigate();
  // We keep a single AudioContext to avoid creating many contexts
  const audioCtxRef = useRef(null);

  useEffect(() => {
    const handleEvent = ({ eventName, payload }) => {
      if (eventName === 'admin.order.created') {
        const id = Date.now() + Math.random().toString();
        
        // Extract order info if available (sometimes it's payload.order_number or payload.data.order_number)
        const orderNum = payload?.order_number || payload?.data?.order_number;
        const orderIdentifier = orderNum ? `#${orderNum}` : 'A new order';
        
        setAlerts(prev => [...prev, { id, message: `${orderIdentifier} has been placed!` }]);
        playAlertSound();
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
          removeAlert(id);
        }, 8000);
      }
    };

    const unsubscribe = subscribeAdminOrderEvents(handleEvent);
    return () => unsubscribe();
  }, []);

  const removeAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const playAlertSound = async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      
      const ctx = audioCtxRef.current;
      
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Simple two-tone ding (C5 to E5)
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.2); // C5
      playTone(659.25, now + 0.15, 0.4); // E5
    } catch (err) {
      console.warn('Could not play alert sound', err);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="global-order-alerts">
      {alerts.map(alert => (
        <div 
          key={alert.id} 
          className="order-alert-toast"
          onClick={() => {
            navigate('/orders');
            removeAlert(alert.id);
          }}
          role="alert"
        >
          <div className="order-alert-icon">🔔</div>
          <div className="order-alert-content">
            <strong>New Order Received!</strong>
            <span>{alert.message}</span>
            <span className="order-alert-hint">Click to view orders</span>
          </div>
          <button 
            className="order-alert-close"
            onClick={(e) => {
              e.stopPropagation();
              removeAlert(alert.id);
            }}
            aria-label="Close alert"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
