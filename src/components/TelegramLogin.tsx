'use client';

import React, { useEffect, useRef } from 'react';

interface TelegramLoginProps {
  botName: string;
  onAuth?: (user: any) => void;
  authUrl?: string;
  className?: string;
}

const TelegramLogin: React.FC<TelegramLoginProps> = ({ botName, onAuth, authUrl, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onAuth) {
      (window as any).onTelegramAuth = (user: any) => {
        onAuth(user);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '4');
    
    if (authUrl) {
      script.setAttribute('data-auth-url', authUrl);
    } else {
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    }
    
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [botName, onAuth, authUrl]);

  return <div ref={containerRef} className={className} />;
};

export default TelegramLogin;
