'use client';

import React, { useEffect, useRef } from 'react';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginProps {
  botName: string;
  onAuth?: (user: TelegramUser) => void;
  authUrl?: string;
  className?: string;
  children?: React.ReactNode;
}

const TelegramLogin: React.FC<TelegramLoginProps> = ({ botName, onAuth, authUrl, className, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentContainer = containerRef.current;

    if (onAuth) {
      // @ts-expect-error - onTelegramAuth is a custom property on window
      window.onTelegramAuth = (user: TelegramUser) => {
        onAuth(user);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '0'); // Square corners to match aesthetic
    
    if (authUrl) {
      script.setAttribute('data-auth-url', authUrl);
    } else {
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    }
    
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    if (currentContainer) {
      currentContainer.appendChild(script);
    }

    return () => {
      if (currentContainer) {
        currentContainer.innerHTML = '';
      }
    };
  }, [botName, onAuth, authUrl]);

  return (
    <div className={`relative ${className}`}>
      {children && (
        <div className="absolute inset-0 z-10 pointer-events-auto">
          {children}
        </div>
      )}
      <div 
        ref={containerRef} 
        className={children ? "opacity-0 absolute inset-0 z-20 [&>iframe]:!w-full [&>iframe]:!h-full [&>iframe]:!absolute [&>iframe]:!inset-0 cursor-pointer" : ""}
      />
    </div>
  );
};

export default TelegramLogin;
